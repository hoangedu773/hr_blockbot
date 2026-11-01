import { Contract, FetchRequest, Interface, JsonRpcProvider, isAddress } from "ethers";
import { DecisionAnchorModel } from "../models/DecisionAnchor.js";
import { WorkflowError } from "./project-workflow.service.js";
import { verifyProjectAudit } from "./project-audit.service.js";

export const DECISION_REGISTRY_ABI = [
  "function registrar() view returns (address)", "function commitments(bytes32) view returns (bytes32)",
  "function record(bytes32 decisionId, bytes32 decisionHash)", "event DecisionRecorded(bytes32 indexed decisionId, bytes32 decisionHash)",
];
const abi = new Interface(DECISION_REGISTRY_ABI);
function config() {
  const url = process.env.ASSIGNMENT_CHAIN_RPC_URL;
  const chainId = process.env.ASSIGNMENT_CHAIN_ID;
  const address = process.env.ASSIGNMENT_REGISTRY_ADDRESS;
  if (!url || !chainId || !address) throw new WorkflowError(503, "BLOCKCHAIN_NOT_CONFIGURED", "Chưa cấu hình RPC, chain ID và địa chỉ smart contract. Hash cục bộ chưa được xác thực trên Blockchain.");
  if (!/^\d+$/.test(chainId) || !isAddress(address) || !/^https?:\/\//.test(url)) throw new WorkflowError(503, "BLOCKCHAIN_CONFIGURATION_INVALID", "Cấu hình Blockchain không hợp lệ.");
  const confirmations = Number(process.env.ASSIGNMENT_CHAIN_CONFIRMATIONS || "1");
  if (!Number.isInteger(confirmations) || confirmations < 1 || confirmations > 100) throw new WorkflowError(503, "BLOCKCHAIN_CONFIGURATION_INVALID", "Số xác nhận Blockchain không hợp lệ.");
  return { url, chainId, address, confirmations };
}
function eventFor(project: any, eventId: string) {
  if (!verifyProjectAudit(project)) throw new WorkflowError(409, "AUDIT_INTEGRITY_FAILED", "Lịch sử hiện tại không toàn vẹn, không được xác thực thay thế.");
  const event = (project.assignmentAudit ?? []).find((entry: any) => entry.id === eventId);
  if (!event) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy sự kiện quyết định.");
  return event;
}
async function withRegistry<T>(action: (provider: JsonRpcProvider, registry: Contract, settings: ReturnType<typeof config>) => Promise<T>) {
  const settings = config();
  const request = new FetchRequest(settings.url); request.timeout = 8000;
  const provider = new JsonRpcProvider(request, undefined, { batchMaxCount: 1 });
  try {
    const actual = await provider.send("eth_chainId", []);
    if (BigInt(actual) !== BigInt(settings.chainId)) throw new WorkflowError(409, "BLOCKCHAIN_CHAIN_MISMATCH", "RPC đang ở mạng khác chain ID đã cấu hình.");
    if (await provider.getCode(settings.address) === "0x") throw new WorkflowError(409, "BLOCKCHAIN_CONTRACT_MISSING", "Không có smart contract tại địa chỉ cấu hình.");
    const registry = new Contract(settings.address, DECISION_REGISTRY_ABI, provider);
    await registry.registrar();
    return await action(provider, registry, settings);
  } catch (error) {
    if (error instanceof WorkflowError) throw error;
    // RPC URLs may contain provider secrets. Never return the original error.
    throw new WorkflowError(503, "BLOCKCHAIN_UNAVAILABLE", "Không đọc được mạng/contract Blockchain. Quyết định nghiệp vụ vẫn được lưu, chưa được xác thực trên chuỗi.");
  } finally { provider.destroy(); }
}
export async function prepareDecisionAnchor(project: any, eventId: string) {
  const event = eventFor(project, eventId);
  return withRegistry(async (_provider, registry, settings) => {
    const existing = await registry.commitments(event.id);
    if (existing !== "0x" + "0".repeat(64) && existing.toLowerCase() !== "0x" + event.hash) {
      throw new WorkflowError(409, "BLOCKCHAIN_PROOF_INVALID", "Quyết định này đã có hash khác trên Blockchain; không ghi đè hoặc thay thế bằng chứng.");
    }
    return {
      status: "READY_FOR_WALLET", eventId, decisionHash: event.hash, registrar: await registry.registrar(),
      transaction: { to: settings.address, data: abi.encodeFunctionData("record", [event.id, "0x" + event.hash]), chainId: "0x" + BigInt(settings.chainId).toString(16), value: "0x0" },
      warning: "Chưa ghi Blockchain. Ví registrar phải xác nhận giao dịch và có thể tốn phí mạng; chỉ hash/ID ngẫu nhiên được gửi, không gửi dữ liệu nhân sự.",
    };
  });
}
export async function verifyDecisionAnchor(project: any, eventId: string, transactionHash: string) {
  const event = eventFor(project, eventId);
  if (!/^0x[a-f0-9]{64}$/i.test(transactionHash)) throw new WorkflowError(400, "VALIDATION_FAILED", "Mã giao dịch không hợp lệ.");
  return withRegistry(async (provider, registry, settings) => {
    const receipt = await provider.getTransactionReceipt(transactionHash);
    const transaction = await provider.getTransaction(transactionHash);
    if (!transaction || !transaction.to || transaction.to.toLowerCase() !== settings.address.toLowerCase()) throw new WorkflowError(409, "BLOCKCHAIN_PROOF_INVALID", "Giao dịch không thuộc registry đã cấu hình hoặc chưa được RPC nhận.");
    let decoded;
    try { decoded = abi.parseTransaction({ data: transaction.data }); } catch { /* handled below */ }
    if (!decoded || decoded.name !== "record" || decoded.args[0] !== event.id || decoded.args[1].toLowerCase() !== "0x" + event.hash) {
      throw new WorkflowError(409, "BLOCKCHAIN_PROOF_INVALID", "Giao dịch không chứa đúng quyết định và mã băm.");
    }
    if (receipt && receipt.status !== 1) throw new WorkflowError(409, "BLOCKCHAIN_TRANSACTION_REVERTED", "Giao dịch đã thất bại, không được xác thực.");
    const enough = receipt && await receipt.confirmations() >= settings.confirmations;
    const stored = receipt ? await registry.commitments(event.id) : null;
    if (receipt && stored?.toLowerCase() !== "0x" + event.hash) throw new WorkflowError(409, "BLOCKCHAIN_PROOF_INVALID", "Hash trong smart contract không khớp lịch sử.");
    const status = enough ? "VERIFIED" : "PENDING";
    const key = [String(project._id), event.id, settings.chainId, settings.address.toLowerCase()].join(":");
    const existing: any = await DecisionAnchorModel.findById(key).lean();
    if (existing?.status === "VERIFIED" && status === "PENDING") throw new WorkflowError(409, "BLOCKCHAIN_PROOF_INVALID", "Không thay thế bằng chứng đã xác thực bằng giao dịch chưa xác nhận.");
    await DecisionAnchorModel.updateOne({ _id: key }, { $set: { projectId: String(project._id), eventId: event.id, decisionHash: event.hash,
      chainId: settings.chainId, registryAddress: settings.address, transactionHash, status, blockNumber: receipt?.blockNumber ?? null,
      verifiedAt: enough ? new Date().toISOString() : null } }, { upsert: true, runValidators: true });
    return { status, eventId, decisionHash: event.hash, transactionHash, chainId: settings.chainId, registryAddress: settings.address,
      blockNumber: receipt?.blockNumber ?? null, confirmations: receipt ? await receipt.confirmations() : 0 };
  });
}

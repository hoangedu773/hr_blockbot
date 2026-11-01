import { randomBytes, randomUUID, createHash } from "node:crypto";
import { PasswordRecoveryIssueSchema } from "@hr-blockbot/contracts";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { UserModel } from "../models/User.js";
import { requireCapability } from "./authorization-scope.service.js";
import { loadAccount, resolvePrincipal, securityVersion } from "./principal.service.js";
import { hashPassword } from "./auth.service.js";
import { accountAuditHead, accountMetadata, mutateAccountSecurity, withAccountSecurityLock } from "./account-security.service.js";
import { digest } from "./project-audit.service.js";
import { WorkflowError, objectId } from "./project-workflow.service.js";

// No production sender is installed by default. The adapter resolves a verified
// destination out-of-band; technical administration never receives HR contacts.
export interface RecoveryOptions {
  deliverRecovery?: (invitation: { token: string; username: string; userId: string; requestId: string; purpose: "password-recovery" }) => Promise<void>;
  failpoint?: (stage: string) => void | Promise<void>;
}
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const RecoveryIssueSchema = PasswordRecoveryIssueSchema;
export async function issuePasswordRecovery(actor: AuthenticatedUser, target: string, input: unknown, options: RecoveryOptions = {}) {
  requireCapability(actor, "accounts.manage");
  const parsed = RecoveryIssueSchema.safeParse(input);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần lý do và phiên bản tài khoản.");
  target = String(objectId(target));
  if (target === actor.userId) throw new WorkflowError(403, "SELF_AUTHORIZATION_CHANGE_DENIED", "Không tự khởi tạo khôi phục qua quản trị.");
  if (!options.deliverRecovery) throw new WorkflowError(503, "SECURE_RECOVERY_DELIVERY_REQUIRED", "Chưa cấu hình kênh khôi phục an toàn; không phát hành token.");
  return withAccountSecurityLock(actor, async () => {
    let account;
    try { account = await loadAccount(target); } catch { throw new WorkflowError(409, "RECOVERY_ACCOUNT_UNAVAILABLE", "Khôi phục không thay thế kích hoạt, tái tuyển hoặc mở khóa tài khoản."); }
    const token = randomBytes(32).toString("hex"), requestId = randomUUID();
    const recovery = { id: requestId, tokenHash: hashToken(token), state: "PENDING", expiresAt: new Date(Date.now() + 86400000),
      issuedBy: actor.userId, issuerVersion: actor.securityVersion, boundVersion: parsed.data.expectedVersion + 2 };
    let row = await mutateAccountSecurity(actor, target, parsed.data.expectedVersion, parsed.data.reason, { passwordRecovery: recovery }, { status: "active", employeeId: account.user.employeeId });
    await options.failpoint?.("recovery-after-issued");
    try { await options.deliverRecovery!({ token, username: row.username, userId: target, requestId, purpose: "password-recovery" }); }
    catch {
      await mutateAccountSecurity(actor, target, securityVersion(row), "RECOVERY_DELIVERY_FAILED", { passwordRecovery: { ...recovery, tokenHash: null, state: "FAILED" } }, { "passwordRecovery.id": requestId });
      throw new WorkflowError(503, "RECOVERY_DELIVERY_FAILED", "Kênh gửi chưa xác nhận. Làm mới và phát hành lại; token cũ không dùng được.");
    }
    await options.failpoint?.("recovery-after-delivery");
    row = await mutateAccountSecurity(actor, target, securityVersion(row), "RECOVERY_DELIVERED", { passwordRecovery: { ...recovery, state: "DELIVERED" } }, { status: "active", "passwordRecovery.id": requestId, "passwordRecovery.state": "PENDING" });
    return { ...accountMetadata(row), recovery: { id: requestId, state: "DELIVERED", expiresAt: recovery.expiresAt.toISOString() } };
  });
}
export async function completePasswordRecovery(token: string, password: string, options: RecoveryOptions = {}) {
  const invalid = () => new WorkflowError(400, "RECOVERY_INVALID", "Liên kết đã hết hạn, đã dùng hoặc không còn hợp lệ. Liên hệ quản trị kỹ thuật.");
  const row: any = await UserModel.findOne({ "passwordRecovery.tokenHash": hashToken(token), "passwordRecovery.state": "DELIVERED", "passwordRecovery.expiresAt": { $gt: new Date() }, status: "active" }).lean();
  if (!row || row.passwordRecovery.boundVersion !== securityVersion(row)) throw invalid();
  accountAuditHead(row);
  if (row.securityAudit?.at(-1)?.recoveryHash !== digest(row.passwordRecovery)) throw invalid();
  try { await loadAccount(String(row._id)); } catch { throw invalid(); }
  const recovery = row.passwordRecovery;
  let issuer: AuthenticatedUser;
  try {
    const user: any = await UserModel.findById(recovery.issuedBy).lean();
    if (!user) throw invalid();
    issuer = await resolvePrincipal({ sub: String(user._id), role: user.role, securityVersion: recovery.issuerVersion });
    requireCapability(issuer, "accounts.manage");
  } catch { throw invalid(); }
  const passwordHash = await hashPassword(password);
  await options.failpoint?.("recovery-before-consume");
  // Password, consumption, security version and chained audit commit together on
  // ONE user document. No claimed intermediate state or plaintext password saga.
  await withAccountSecurityLock(issuer, async () => {
    // Revalidate AFTER password hashing and serialize with technical grant/status
    // changes. A revoked issuer must not finish a previously validated reset.
    try { await loadAccount(String(row._id)); } catch { throw invalid(); }
    await mutateAccountSecurity(issuer, String(row._id), securityVersion(row), "RECOVERY_COMPLETED", {
    passwordHash, passwordChangedAt: new Date(), mustChangePassword: false,
    passwordRecovery: { id: recovery.id, state: "CONSUMED", consumedAt: new Date(), issuedBy: recovery.issuedBy },
  }, { status: "active", employeeId: row.employeeId, passwordHash: row.passwordHash,
      "passwordRecovery.id": recovery.id, "passwordRecovery.state": "DELIVERED", "passwordRecovery.tokenHash": hashToken(token), "passwordRecovery.expiresAt": { $gt: new Date() } });
  });
  await options.failpoint?.("recovery-after-consumed");
}

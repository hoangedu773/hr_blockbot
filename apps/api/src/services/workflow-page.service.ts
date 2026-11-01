import { PaginationQuerySchema } from "@hr-blockbot/contracts";
import { WorkflowError, objectId } from "./project-workflow.service.js";

// Authorization must be expressed in `scope` BEFORE count/skip/limit. Never
// filter a bounded page afterward: that silently hides older authorized rows.
export async function workflowPage(model: any, scope: any, input: unknown, dto: (row: any) => any) {
  const parsed = PaginationQuerySchema.safeParse(input);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Phân trang không hợp lệ (limit tối đa 100).");
  const { page, limit } = parsed.data;
  if (!Number.isSafeInteger((page - 1) * limit)) throw new WorkflowError(400, "VALIDATION_FAILED", "Trang vượt giới hạn.");
  const [rows, totalItems] = await Promise.all([model.find(scope).select("-history -activationTokenHash -activationPasswordHash -recoveryTokenHash -recoveryPasswordHash").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(), model.countDocuments(scope)]);
  // Histories can approach the document guard. Load just ONE complete history
  // through the equally scoped detail endpoint, not 100 large audit arrays.
  return { items: rows.map((row: any) => ({ ...dto({ ...row, history: [] }), historyIncluded: false })), paging: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNext: page * limit < totalItems, hasPrev: page > 1 } };
}
export async function workflowDetail(model: any, scope: any, id: string, dto: (row: any) => any) {
  const row = await model.findOne({ $and: [scope, { _id: objectId(id) }] }).lean();
  if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy lịch sử trong phạm vi được cấp.");
  return dto(row);
}
export function historyIntegrity(row: any, verify: (row: any) => void) {
  if (!Array.isArray(row.history) || !row.history.length) return "LEGACY_UNVERIFIED";
  try { verify(row); return "VALID_LOCAL_CHAIN"; } catch { return "INVALID"; }
}

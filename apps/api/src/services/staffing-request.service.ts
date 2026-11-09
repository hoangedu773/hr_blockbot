import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { StaffingRequestModel as Model } from "../models/StaffingRequest.js";
import { EmployeeLifecycleRequestModel as LifecycleModel } from "../models/EmployeeLifecycleRequest.js";
import { EmployeeModel } from "../models/Employee.js";
import { allowedStoreIds, requireCapability, resourceScope } from "./authorization-scope.service.js";
import { WorkflowError, objectId } from "./project-workflow.service.js";
import { workflowPage, workflowDetail } from "./workflow-page.service.js";
import { notifyStoreCapable, notifyUserSafe } from "./personnel-notification.service.js";

const Id = z.string().regex(/^[a-f0-9]{24}$/i).transform((id) => id.toLowerCase());
export const StaffingCreateSchema = z.object({ storeId: Id, quantity: z.number().int().min(1).max(20), jobTitle: z.string().trim().max(120).optional(), neededBy: z.string().datetime({ offset: true }), reason: z.string().trim().min(1).max(2000) }).strict();
export const StaffingDecisionSchema = z.object({ decision: z.enum(["ACCEPT", "REJECT"]), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) }).strict();
export const StaffingCancelSchema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) }).strict();
const OPEN = ["PENDING_AM", "IN_PROGRESS"];

const storeResource = (actor: AuthenticatedUser, storeId: string) => resourceScope(actor, { storeId, storeMappingRef: "verified" });
const passes = (fn: () => void) => { try { fn(); return true; } catch { return false; } };
/** SM of the store: an existing store-scoped personnel-proposal capability; never a new grant. */
function canPropose(actor: AuthenticatedUser, storeId: string) {
  if (actor.authorization?.profile !== "sm") return false;
  return passes(() => requireCapability(actor, "employees.lifecycle_request", storeResource(actor, storeId))) || passes(() => requireCapability(actor, "onboarding.propose", storeResource(actor, storeId)));
}
/** AM (non-HR holder of employees.transfer) coordinates staffing between stores. */
function requireCoordinator(actor: AuthenticatedUser, row: any) {
  if (actor.authorization?.profile === "hr") throw new WorkflowError(403, "AM_COORDINATION_REQUIRED", "Yêu cầu bổ sung nhân sự do AM điều phối; HR duyệt ở bước điều chuyển.");
  requireCapability(actor, "employees.transfer", { ...storeResource(actor, String(row.storeId)), requiresIndependentApproval: true, requesterUserId: String(row.requestedBy), conflictUserIds: [String(row.requestedBy)] });
}
async function canonicalStore(id: string) {
  const row = await mongoose.connection.collection("stores").findOne({ _id: objectId(id), status: "ACTIVE", kind: "outlet", deleted_at: null, scopeApprovalRef: { $type: "string", $ne: "" } });
  if (!row) throw new WorkflowError(409, "CANONICAL_STORE_REQUIRED", "Cửa hàng chưa được xác minh."); return row;
}
function entry(row: any, actorId: string, type: string, reason: string, after: string) {
  return { id: randomUUID(), actorId, at: new Date().toISOString(), type, reason, before: row?.status ?? null, after };
}
async function advance(row: any, actorId: string, changes: Record<string, unknown>, reason: string, type: string, extra: Record<string, unknown> = {}) {
  const next = String(changes.status ?? row.status);
  const updated = await Model.findOneAndUpdate({ _id: row._id, version: row.version, status: row.status },
    { $set: changes, $inc: { version: 1 }, $push: { history: entry(row, actorId, type, reason, next) }, ...extra }, { new: true, runValidators: true }).lean();
  if (!updated) throw new WorkflowError(409, "STAFFING_VERSION_CONFLICT", "Yêu cầu đã được xử lý đồng thời; tải lại để xem trạng thái mới.");
  return updated as any;
}

async function progressFor(ids: string[]) {
  const map = new Map<string, { linked: number; completed: number; pending: number }>();
  if (!ids.length) return map;
  const rows = await LifecycleModel.aggregate([{ $match: { staffingRequestId: { $in: ids.map(objectId) } } }, { $group: { _id: { s: "$staffingRequestId", st: "$status" }, n: { $sum: 1 } } }]);
  for (const row of rows) {
    const key = String(row._id.s), value = map.get(key) ?? { linked: 0, completed: 0, pending: 0 };
    if (row._id.st !== "REJECTED") value.linked += row.n;
    if (row._id.st === "COMPLETED") value.completed += row.n; else if (row._id.st !== "REJECTED") value.pending += row.n;
    map.set(key, value);
  }
  return map;
}
async function names(rows: any[]) {
  const employeeIds = [...new Set(rows.flatMap((row) => [row.requesterEmployeeId, row.handlerEmployeeId]).filter(Boolean).map(String))];
  const storeIds = [...new Set(rows.map((row) => String(row.storeId)))];
  const [employees, stores] = await Promise.all([
    employeeIds.length ? EmployeeModel.find({ _id: { $in: employeeIds.map(objectId) } }).select("fullName employeeCode").lean() : [],
    storeIds.length ? mongoose.connection.collection("stores").find({ _id: { $in: storeIds.map(objectId) } }, { projection: { store_name: 1 } }).toArray() : [],
  ]);
  return { employee: new Map((employees as any[]).map((row) => [String(row._id), row.fullName || row.employeeCode || ""])), store: new Map(stores.map((row: any) => [String(row._id), String(row.store_name ?? "")])) };
}
function dto(row: any, lookup: Awaited<ReturnType<typeof names>>, progress?: { linked: number; completed: number; pending: number }) {
  return { id: String(row._id), storeId: String(row.storeId), storeName: lookup.store.get(String(row.storeId)) || null, quantity: row.quantity, jobTitle: row.jobTitle ?? null,
    neededBy: row.neededBy, reason: row.reason, status: row.status, version: row.version, createdAt: row.createdAt,
    requestedBy: String(row.requestedBy), requesterName: lookup.employee.get(String(row.requesterEmployeeId)) || null,
    handledBy: row.handledBy ? String(row.handledBy) : null, handlerName: row.handlerEmployeeId ? lookup.employee.get(String(row.handlerEmployeeId)) || null : null,
    decisionReason: row.decisionReason ?? null, transferRequestIds: (row.transferRequestIds ?? []).map(String),
    progress: progress ?? { linked: 0, completed: 0, pending: 0 },
    history: Array.isArray(row.history) ? row.history.map((item: any) => ({ type: item.type, actorId: item.actorId, at: item.at, reason: item.reason, after: item.after })) : [] };
}
function staffingScope(actor: AuthenticatedUser) {
  const coordinator = allowedStoreIds(actor, "employees.transfer");
  const proposer = actor.authorization?.profile === "sm" ? [...new Set([...allowedStoreIds(actor, "employees.lifecycle_request"), ...allowedStoreIds(actor, "onboarding.propose")])] : [];
  const reviewer = allowedStoreIds(actor, "employees.lifecycle_review");
  const stores = [...new Set([...coordinator, ...proposer, ...reviewer])];
  if (!stores.length) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có quyền xem yêu cầu bổ sung nhân sự.");
  return { $or: [{ storeId: { $in: stores.map(objectId) } }, { requestedBy: objectId(actor.userId) }] };
}
const GROUPS: Record<string, any> = { open: { status: { $in: OPEN } }, closed: { status: { $nin: OPEN } } };

export async function createStaffing(actor: AuthenticatedUser, input: unknown) {
  const parsed = StaffingCreateSchema.safeParse(input); if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần cửa hàng, số lượng 1–20, ngày cần và lý do.");
  const body = parsed.data;
  if (!canPropose(actor, body.storeId)) throw new WorkflowError(403, "RBAC_DENIED", "Chỉ SM của cửa hàng được gửi yêu cầu bổ sung nhân sự.");
  if (!actor.employeeId) throw new WorkflowError(403, "EMPLOYEE_UNAVAILABLE", "Tài khoản chưa gắn hồ sơ nhân viên.");
  if (Number.isNaN(Date.parse(body.neededBy))) throw new WorkflowError(400, "VALIDATION_FAILED", "Ngày cần không hợp lệ.");
  const store = await canonicalStore(body.storeId);
  const row: any = { storeId: objectId(body.storeId), quantity: body.quantity, jobTitle: body.jobTitle || null, neededBy: new Date(body.neededBy), reason: body.reason,
    requestedBy: objectId(actor.userId), requesterEmployeeId: objectId(actor.employeeId), status: "PENDING_AM", version: 1, transferRequestIds: [] };
  const created: any = (await Model.create({ ...row, history: [entry(null, actor.userId, "REQUESTED", body.reason, "PENDING_AM")] })).toObject();
  void notifyStoreCapable("employees.transfer", body.storeId, { title: "SM cần bổ sung nhân sự", body: `${store.store_name ?? "Cửa hàng"} cần thêm ${body.quantity} nhân sự${body.jobTitle ? ` (${body.jobTitle})` : ""}. Mở Điều chuyển & trạng thái để lập điều chuyển.`, dedupeKey: `staffing:${created._id}:requested`, entityId: String(created._id) }, { excludeUserIds: [actor.userId], profiles: ["am", "sam", "om"] });
  return getStaffing(actor, String(created._id));
}
export async function decideStaffing(actor: AuthenticatedUser, id: string, input: unknown) {
  const parsed = StaffingDecisionSchema.safeParse(input); if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần quyết định, lý do và phiên bản.");
  const row: any = await Model.findById(objectId(id)).lean(); if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu.");
  requireCoordinator(actor, row);
  if (row.version !== parsed.data.expectedVersion || !OPEN.includes(row.status)) throw new WorkflowError(409, "STAFFING_VERSION_CONFLICT", "Yêu cầu đã thay đổi.");
  if (parsed.data.decision === "ACCEPT" && row.status !== "PENDING_AM") throw new WorkflowError(409, "STAFFING_STATE_CONFLICT", "Yêu cầu đã được tiếp nhận.");
  if (parsed.data.decision === "REJECT" && (await progressFor([id])).get(id)?.pending) throw new WorkflowError(409, "STAFFING_HAS_PENDING_TRANSFERS", "Còn điều chuyển đang chờ duyệt cho yêu cầu này; xử lý xong trước khi từ chối.");
  const next = parsed.data.decision === "ACCEPT" ? "IN_PROGRESS" : "REJECTED";
  await advance(row, actor.userId, { status: next, handledBy: objectId(actor.userId), handlerEmployeeId: actor.employeeId ? objectId(actor.employeeId) : null, handledAt: new Date(), decisionReason: parsed.data.reason }, parsed.data.reason, parsed.data.decision === "ACCEPT" ? "AM_ACCEPTED" : "AM_REJECTED");
  void notifyUserSafe(String(row.requestedBy), { title: next === "REJECTED" ? "AM từ chối yêu cầu bổ sung nhân sự" : "AM đã tiếp nhận yêu cầu bổ sung nhân sự", body: parsed.data.reason, dedupeKey: `staffing:${id}:${next}`, entityId: id });
  return getStaffing(actor, id);
}
export async function cancelStaffing(actor: AuthenticatedUser, id: string, input: unknown) {
  const parsed = StaffingCancelSchema.safeParse(input); if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần lý do và phiên bản.");
  const row: any = await Model.findById(objectId(id)).lean(); if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu.");
  if (String(row.requestedBy) !== actor.userId || !canPropose(actor, String(row.storeId))) throw new WorkflowError(403, "RBAC_DENIED", "Chỉ SM đã gửi yêu cầu được hủy.");
  if (row.version !== parsed.data.expectedVersion || !OPEN.includes(row.status)) throw new WorkflowError(409, "STAFFING_VERSION_CONFLICT", "Yêu cầu đã thay đổi.");
  if ((await progressFor([id])).get(id)?.pending) throw new WorkflowError(409, "STAFFING_HAS_PENDING_TRANSFERS", "AM đã lập điều chuyển đang chờ duyệt; không hủy ngang.");
  await advance(row, actor.userId, { status: "CANCELLED", decisionReason: parsed.data.reason }, parsed.data.reason, "SM_CANCELLED");
  return getStaffing(actor, id);
}
/** Validates and links a TRANSFER to an open staffing request (called by lifecycle create). */
export async function assertStaffingLink(actor: AuthenticatedUser, staffingRequestId: string, targetStoreId: string) {
  const row: any = await Model.findById(objectId(staffingRequestId)).lean(); if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu bổ sung nhân sự.");
  requireCoordinator(actor, row);
  if (!OPEN.includes(row.status)) throw new WorkflowError(409, "STAFFING_STATE_CONFLICT", "Yêu cầu bổ sung nhân sự đã đóng.");
  if (String(row.storeId) !== targetStoreId) throw new WorkflowError(400, "INVALID_TRANSFER_TARGET", "Cửa hàng đích phải là cửa hàng đã yêu cầu bổ sung.");
  if (((await progressFor([staffingRequestId])).get(staffingRequestId)?.linked ?? 0) >= row.quantity) throw new WorkflowError(409, "STAFFING_QUANTITY_REACHED", "Đã lập đủ số lượng điều chuyển cho yêu cầu này.");
  return row;
}
export async function linkStaffingTransfer(actor: AuthenticatedUser, staffingRequestId: string, transferId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const row: any = await Model.findById(objectId(staffingRequestId)).lean(); if (!row || !OPEN.includes(row.status)) return;
    try {
      await advance(row, actor.userId, { status: "IN_PROGRESS", ...(row.handledBy ? {} : { handledBy: objectId(actor.userId), handlerEmployeeId: actor.employeeId ? objectId(actor.employeeId) : null, handledAt: new Date() }) }, "AM lập đề nghị điều chuyển nhân sự cho yêu cầu này", "TRANSFER_LINKED", { $addToSet: { transferRequestIds: objectId(transferId) } });
      void notifyUserSafe(String(row.requestedBy), { title: "AM đã lập điều chuyển cho cửa hàng", body: "Đề nghị điều chuyển đang chờ HR duyệt; sau đó SM hai cửa hàng xác nhận.", dedupeKey: `staffing:${staffingRequestId}:linked:${transferId}`, entityId: staffingRequestId });
      return;
    } catch (error: any) { if (error?.code !== "STAFFING_VERSION_CONFLICT") throw error; }
  }
}
/** Called after a linked TRANSFER completes; closes the request when enough people arrived. */
export async function refreshStaffingFulfilment(staffingRequestId: string, actorId: string) {
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      const row: any = await Model.findById(objectId(staffingRequestId)).lean(); if (!row || !OPEN.includes(row.status)) return;
      const progress = (await progressFor([staffingRequestId])).get(staffingRequestId);
      if ((progress?.completed ?? 0) < row.quantity) return;
      try { await advance(row, actorId, { status: "FULFILLED" }, `Đã nhận đủ ${row.quantity} nhân sự qua điều chuyển đã hoàn tất`, "FULFILLED"); void notifyUserSafe(String(row.requestedBy), { title: "Đã đủ nhân sự bổ sung", body: `Cửa hàng đã nhận đủ ${row.quantity} nhân sự qua điều chuyển.`, dedupeKey: `staffing:${staffingRequestId}:fulfilled`, entityId: staffingRequestId }); return; }
      catch (error: any) { if (error?.code !== "STAFFING_VERSION_CONFLICT") throw error; }
    }
  } catch { /* fulfilment is recomputable from linked transfers */ }
}
async function enrich(rows: any[]) {
  const [lookup, progress] = await Promise.all([names(rows), progressFor(rows.map((row) => String(row._id ?? row.id)))]);
  return { lookup, progress };
}
export async function pageStaffing(actor: AuthenticatedUser, query: any = {}) {
  const group = typeof query?.group === "string" && GROUPS[query.group] ? GROUPS[query.group] : null;
  const scope = staffingScope(actor);
  const raw = await workflowPage(Model, group ? { $and: [scope, group] } : scope, query, (row) => row);
  const { lookup, progress } = await enrich(raw.items);
  return { items: raw.items.map((row: any) => dto(row, lookup, progress.get(String(row._id)))), paging: raw.paging };
}
export async function getStaffing(actor: AuthenticatedUser, id: string) {
  const row = await workflowDetail(Model, staffingScope(actor), id, (value) => value);
  const { lookup, progress } = await enrich([row]);
  return dto(row, lookup, progress.get(String(row._id)));
}

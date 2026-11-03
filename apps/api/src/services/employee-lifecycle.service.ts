import mongoose from "mongoose";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { AuthorizationGrantSchema, AuthorizationStateSchema } from "@hr-blockbot/contracts";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { EmployeeLifecycleRequestModel as RequestModel } from "../models/EmployeeLifecycleRequest.js";
import { EmployeeModel } from "../models/Employee.js";
import { UserModel } from "../models/User.js";
import { ProjectModel } from "../models/Project.js";
import { assertNoFuturePublishedSchedules } from "./scheduling.service.js";
import { hashPassword } from "./auth.service.js";
import { resolvePrincipal, securityVersion, securityVersionFilter } from "./principal.service.js";
import { allowedStoreIds, requireCapability, resourceScope } from "./authorization-scope.service.js";
import { WorkflowError, objectId, referenceMatch } from "./project-workflow.service.js";
import { digest } from "./project-audit.service.js";
import type { OnboardingOptions } from "./onboarding.service.js";
import { accountAuditHead } from "./account-security.service.js";
import { workflowPage, workflowDetail, historyIntegrity } from "./workflow-page.service.js";
import { withCrmWriter } from "./crm-writer.service.js";
const Id = z.string().regex(/^[a-f0-9]{24}$/i).transform((id) => id.toLowerCase());
export const LifecycleCreateSchema = z.object({ employeeId: Id, kind: z.enum(["TRANSFER", "EXIT", "REACTIVATE"]), targetStoreId: Id.optional(), effectiveAt: z.string().datetime({ offset: true }), reason: z.string().trim().min(1).max(2000), expectedProfileVersion: z.number().int().nonnegative() }).strict();
export const LifecycleDecisionSchema = z.object({ decision: z.enum(["APPROVE", "REJECT"]), expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) }).strict();
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const termsHash = (row: any) => digest({ employeeId: row.employeeId, kind: row.kind, sourceStoreId: row.sourceStoreId, targetStoreId: row.targetStoreId ?? null, effectiveAt: row.effectiveAt, snapshot: row.snapshot, requestedBy: row.requestedBy, requesterEmployeeId: row.requesterEmployeeId });
const stateHash = (row: any) => digest({ status: row.status, version: row.version, approvedBy: row.approvedBy ?? null, approvedAt: row.approvedAt ?? null, confirmations: row.confirmations ?? [] });
function history(row: any, actorId: string, next: any, reason: string, type: string) {
  const value = { ...row, ...next, version: (row?.version ?? 0) + 1 };
  const entry = { id: randomUUID(), actorId, at: new Date().toISOString(), type, reason, before: row?.status ?? null, after: value.status,
    previousHash: row?.history?.at(-1)?.hash ?? "0".repeat(64), termsHash: termsHash(value), stateHash: stateHash(value) };
  return { ...entry, hash: digest(entry) };
}
function verify(row: any) {
  let previous = "0".repeat(64);
  for (const entry of row.history ?? []) { const { hash, ...payload } = entry; if (hash !== digest(payload) || payload.previousHash !== previous || payload.termsHash !== termsHash(row)) throw new WorkflowError(409, "LIFECYCLE_AUDIT_INVALID", "Không ghi đè lịch sử điều chuyển/nhân sự không khớp hash."); previous = hash; }
  if (!row.history?.length || row.history.at(-1).stateHash !== stateHash(row)) throw new WorkflowError(409, "LIFECYCLE_AUDIT_INVALID", "Trạng thái không khớp lịch sử.");
}
async function advance(row: any, actorId: string, changes: any, reason: string, type: string) {
  verify(row);
  const entry = history(row, actorId, changes, reason, type);
  if (row.history.length >= 1000 || mongoose.mongo.BSON.calculateObjectSize({ ...row, ...changes, history: [...row.history, entry] }) > 8 * 1024 * 1024) throw new WorkflowError(409, "LIFECYCLE_STORAGE_LIMIT", "Cần lưu trữ lịch sử trước khi tiếp tục.");
  const unset = Object.fromEntries(Object.entries(changes).filter(([, value]) => value === undefined).map(([key]) => [key, 1]));
  const updated = await RequestModel.findOneAndUpdate({ _id: row._id, version: row.version, status: row.status }, { $set: Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined)), ...(Object.keys(unset).length ? { $unset: unset } : {}), $inc: { version: 1 }, $push: { history: entry } }, { new: true, runValidators: true }).lean();
  if (!updated) throw new WorkflowError(409, "LIFECYCLE_VERSION_CONFLICT", "Yêu cầu đã được xử lý đồng thời; không tự ghi đè.");
  return updated as any;
}
const revisionFilter = (snapshot: any) => snapshot.profileRevision === null ? { profileRevision: { $exists: false } } : { profileRevision: snapshot.profileRevision };
const subject = (row: any) => ({ storeId: row.sourceStoreId, storeMappingRef: "verified", employeeId: row.employeeId });
function authorize(actor: AuthenticatedUser, row: any, review = false) {
  const capability = row.kind === "TRANSFER" ? "employees.transfer" : review ? "employees.lifecycle_review" : "employees.lifecycle_request";
  requireCapability(actor, capability, { ...resourceScope(actor, subject(row)), requiresIndependentApproval: review, requesterUserId: String(row.requestedBy), subjectEmployeeId: String(row.employeeId), conflictUserIds: [String(row.requestedBy)] });
  if (row.kind === "TRANSFER" && review) requireCapability(actor, "employees.lifecycle_review", { ...resourceScope(actor, subject(row)), requiresIndependentApproval: true, requesterUserId: String(row.requestedBy), subjectEmployeeId: String(row.employeeId) });
  if (row.targetStoreId) requireCapability(actor, "employees.transfer", resourceScope(actor, { storeId: row.targetStoreId, storeMappingRef: "verified" }));
}
async function store(id: unknown) {
  const row = await mongoose.connection.collection("stores").findOne({ _id: objectId(String(id)), status: "ACTIVE", kind: "outlet", deleted_at: null, scopeApprovalRef: { $type: "string", $ne: "" }, departmentId: { $type: "objectId" } });
  if (!row) throw new WorkflowError(409, "CANONICAL_STORE_REQUIRED", "Cửa hàng/đơn vị chưa được xác minh."); return row;
}
async function currentApproval(row: any) {
  verify(row);
  const reviewer: any = await UserModel.findById(row.approvedBy).select("role securityVersion").lean();
  if (!reviewer) throw new WorkflowError(409, "INDEPENDENT_HR_REQUIRED", "Chưa có HR duyệt độc lập hợp lệ.");
  const actor = await resolvePrincipal({ sub: String(reviewer._id), role: reviewer.role, securityVersion: securityVersion(reviewer) });
  authorize(actor, row, true); return actor;
}
async function currentTransferConfirmations(row: any): Promise<boolean> {
  if (row.kind !== "TRANSFER") return true;
  for (const storeId of [String(row.sourceStoreId), String(row.targetStoreId)]) {
    const confirmation = row.confirmations.find((entry: any) => entry.storeId === storeId);
    if (!confirmation) return false;
    const manager: any = await UserModel.findById(confirmation.managerUserId).lean();
    if (!manager) throw new WorkflowError(409, "MANAGER_CONFIRMATION_STALE", "Quản lý xác nhận không còn hợp lệ.");
    const principal = await resolvePrincipal({ sub: String(manager._id), role: manager.role, securityVersion: securityVersion(manager) });
    requireCapability(principal, "employees.transfer_confirm", resourceScope(principal, { storeId, storeMappingRef: "verified", employeeId: storeId === String(row.sourceStoreId) ? row.employeeId : undefined }));
    if (!principal.canonical?.managedByStore[storeId]?.length || principal.userId === String(row.requestedBy) || principal.employeeId === String(row.employeeId)) throw new WorkflowError(409, "MANAGER_CONFIRMATION_STALE", "Thiếu quan hệ quản lý/độc lập thực tế.");
  }
  return true;
}
export function lifecycleDto(row: any) {
  return { id: String(row._id), employeeId: String(row.employeeId), kind: row.kind, sourceStoreId: String(row.sourceStoreId), targetStoreId: row.targetStoreId ? String(row.targetStoreId) : null,
    status: row.status, effectiveAt: row.effectiveAt, version: row.version, requestedBy: String(row.requestedBy), approvedBy: row.approvedBy ? String(row.approvedBy) : null,
    confirmations: row.confirmations ?? [], deliveryState: row.deliveryState, history: Array.isArray(row.history) ? row.history : [] };
}
export async function createLifecycle(actor: AuthenticatedUser, input: unknown) {
  const parsed = LifecycleCreateSchema.safeParse(input); if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Yêu cầu nhân sự không hợp lệ.");
  const body = parsed.data, employee: any = await EmployeeModel.findById(body.employeeId).lean();
  if (!employee?.storeMappingRef || !employee.storeId) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Hồ sơ chưa có mapping canonical.");
  if ((employee.profileRevision ?? 0) !== body.expectedProfileVersion) throw new WorkflowError(409, "PROFILE_VERSION_CONFLICT", "Hồ sơ đã thay đổi.");
  if (body.kind === "REACTIVATE" ? employee.status !== "inactive" : employee.status !== "active") throw new WorkflowError(409, "LIFECYCLE_STATE_CONFLICT", "Trạng thái hồ sơ không phù hợp.");
  if (body.kind === "TRANSFER" ? !body.targetStoreId || body.targetStoreId === String(employee.storeId) : !!body.targetStoreId) throw new WorkflowError(400, "INVALID_TRANSFER_TARGET", "Chỉ điều chuyển mới cần cửa hàng đích khác cửa hàng nguồn.");
  const user: any = employee.userId ? await UserModel.findById(employee.userId).lean() : await UserModel.findOne({ employeeId: employee._id }).lean();
  if (user && (String(user.employeeId) !== String(employee._id) || employee.userId && String(employee.userId) !== String(user._id))) throw new WorkflowError(409, "CANONICAL_USER_CONFLICT", "Liên kết tài khoản không nhất quán.");
  const row: any = { employeeId: employee._id, openKey: String(employee._id), kind: body.kind, sourceStoreId: employee.storeId, targetStoreId: body.targetStoreId ? objectId(body.targetStoreId) : null,
    effectiveAt: new Date(body.effectiveAt), requestedBy: objectId(actor.userId), requesterEmployeeId: objectId(actor.employeeId!), reason: body.reason,
    snapshot: { status: employee.status, storeId: String(employee.storeId), storeMappingRef: employee.storeMappingRef, profileRevision: employee.profileRevision ?? null, userId: user ? String(user._id) : null, userSecurityVersion: user ? securityVersion(user) : null }, status: "PENDING_REVIEW", confirmations: [], version: 1 };
  authorize(actor, row); await store(row.sourceStoreId); if (row.targetStoreId) await store(row.targetStoreId);
  const indexes = await RequestModel.collection.indexes(); if (!indexes.some((index: any) => index.unique && index.key.openKey)) throw new WorkflowError(503, "LIFECYCLE_INDEX_REQUIRED", "Chưa có unique index chống yêu cầu trùng.");
  try { return await RequestModel.create({ ...row, history: [history(null, actor.userId, row, body.reason, "REQUESTED")] }); }
  catch (error: any) { if (error.code === 11000) throw new WorkflowError(409, "LIFECYCLE_REQUEST_EXISTS", "Đã có yêu cầu nhân sự đang chờ cho hồ sơ này."); throw error; }
}
export async function reviewLifecycle(actor: AuthenticatedUser, id: string, input: unknown, options: OnboardingOptions = {}) {
  const parsed = LifecycleDecisionSchema.safeParse(input); if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần quyết định, lý do và phiên bản.");
  let row: any = await RequestModel.findById(objectId(id)).lean(); if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu.");
  authorize(actor, row, true); if (row.status !== "PENDING_REVIEW" || row.version !== parsed.data.expectedVersion) throw new WorkflowError(409, "LIFECYCLE_VERSION_CONFLICT", "Yêu cầu đã thay đổi.");
  if (parsed.data.decision === "REJECT") return advance(row, actor.userId, { status: "REJECTED", openKey: undefined }, parsed.data.reason, "HR_REJECTED");
  row = await advance(row, actor.userId, { status: "APPROVED", approvedBy: objectId(actor.userId), approvedAt: new Date() }, parsed.data.reason, "HR_APPROVED");
  return resumeLifecycle(actor, String(row._id), options);
}
export async function confirmLifecycle(actor: AuthenticatedUser, id: string, storeId: string, expectedVersion: number, reason: string) {
  const row: any = await RequestModel.findById(objectId(id)).lean(); if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu.");
  verify(row);
  if (row.kind !== "TRANSFER" || ![String(row.sourceStoreId), String(row.targetStoreId)].includes(storeId) || !["PENDING_REVIEW", "APPROVED", "PENDING_CONFIRMATIONS"].includes(row.status) || row.version !== expectedVersion) throw new WorkflowError(409, "LIFECYCLE_VERSION_CONFLICT", "Không còn chờ xác nhận cửa hàng này.");
  const source = storeId === String(row.sourceStoreId);
  requireCapability(actor, "employees.transfer_confirm", { ...resourceScope(actor, { storeId, storeMappingRef: "verified", employeeId: source ? row.employeeId : undefined }), requiresIndependentApproval: true, requesterUserId: String(row.requestedBy), subjectEmployeeId: String(row.employeeId) });
  if (!actor.canonical?.managedByStore[storeId]?.length || source && !actor.canonical.managedByStore[storeId].includes(String(row.employeeId))) throw new WorkflowError(403, "VERIFIED_MANAGER_REQUIRED", "Cần quản lý thực tế của cửa hàng liên quan.");
  if (row.confirmations.some((entry: any) => entry.storeId === storeId)) throw new WorkflowError(409, "ALREADY_CONFIRMED", "Bên quản lý cửa hàng đã xác nhận.");
  const confirmation = { storeId, managerUserId: actor.userId, managerEmployeeId: actor.employeeId, at: new Date().toISOString(), reason };
  return advance(row, actor.userId, { confirmations: [...row.confirmations, confirmation] }, reason, "STORE_MANAGER_CONFIRMED");
}
async function finish(row: any, options: OnboardingOptions) {
  const reviewer = await currentApproval(row), employee: any = await EmployeeModel.findById(row.employeeId).lean();
  if (!employee) throw new WorkflowError(409, "CANONICAL_EMPLOYEE_REQUIRED", "Hồ sơ không tồn tại.");
  const id = String(row._id), completed = String(employee.lifecycleAppliedRequestId ?? "") === id;
  if (!completed && !await currentTransferConfirmations(row)) throw new WorkflowError(409, "MANAGER_CONFIRMATION_REQUIRED", "Chưa đủ xác nhận nguồn/đích.");
  if (!completed && (String(employee.storeId) !== row.snapshot.storeId || employee.storeMappingRef !== row.snapshot.storeMappingRef || employee.status !== row.snapshot.status || (employee.profileRevision ?? null) !== row.snapshot.profileRevision)) throw new WorkflowError(409, "LIFECYCLE_SNAPSHOT_CONFLICT", "Hồ sơ đã thay đổi; không tự ghi đè mapping/trạng thái.");
  // Also catch old partial APPLYING rows that predate writer coordination.
  if (!completed && row.kind !== "REACTIVATE" && await ProjectModel.exists({ status: { $ne: "COMPLETED" }, $or: [{ assigneeId: referenceMatch(String(row.employeeId)) }, { assignmentRequests: { $elemMatch: { status: "HANDOVER_PENDING", replacementId: String(row.employeeId) } } }] })) throw new WorkflowError(409, "LIFECYCLE_RECONCILIATION_REQUIRED", "Còn nghĩa vụ CRM trong trạng thái đang áp dụng; cần đối chiếu, không tự chuyển việc hoặc hoàn tác quyết định.");
  if (!completed) {
    if (row.kind !== "REACTIVATE") await assertNoFuturePublishedSchedules(String(row.employeeId));
    const fenced = await EmployeeModel.updateOne({ _id: row.employeeId, ...revisionFilter(row.snapshot), storeId: objectId(row.snapshot.storeId), status: row.snapshot.status,
      $or: [{ lifecyclePendingRequestId: { $exists: false } }, { lifecyclePendingRequestId: null }, { lifecyclePendingRequestId: id }] }, { $set: { lifecyclePendingRequestId: id } });
    if (!fenced.matchedCount) throw new WorkflowError(409, "LIFECYCLE_FENCE_CONFLICT", "Hồ sơ đang trong workflow khác.");
  }
  options.failpoint?.("lifecycle-after-fence");
  const user: any = row.snapshot.userId ? await UserModel.findById(row.snapshot.userId).lean() : null;
  if (row.snapshot.userId && (!user || String(user.employeeId) !== String(row.employeeId))) throw new WorkflowError(409, "CANONICAL_USER_CONFLICT", "Tài khoản không khớp snapshot.");
  if (user && user.lifecycleAppliedRequestId !== id) {
    if (securityVersion(user) !== row.snapshot.userSecurityVersion) throw new WorkflowError(409, "ACCOUNT_VERSION_CONFLICT", "Tài khoản đã được xử lý bảo mật; không mở/ghi đè âm thầm.");
    const parsed = AuthorizationStateSchema.safeParse(user.authorization);
    const now = new Date().toISOString();
    const authorization = parsed.success ? { ...parsed.data, grants: parsed.data.grants.map((grant) => row.kind === "EXIT" || grant.scope.kind === "organization" ? { ...grant, revokedAt: grant.revokedAt || now } : grant) } : null;
    // A personnel move/reactivation never restores managerial or technical grants.
    if (authorization && authorization.profile !== "system_admin" && row.kind !== "EXIT") {
      const location = String(row.targetStoreId ?? row.sourceStoreId);
      const make = (scope: any, capabilities: any[]) => AuthorizationGrantSchema.parse({ id: randomUUID(), profile: authorization.profile, capabilities, scope, validFrom: now, validUntil: null, grantedAt: now, grantedBy: reviewer.userId, approvalRef: `hr-lifecycle:${id}`, revokedAt: null });
      if (row.kind === "REACTIVATE") {
        const scheduling = await mongoose.connection.collection<any>('authorization_controls').findOne({ _id: 'scheduling-v1', enabled: true, approvalRef: 'OWNER_SCHEDULING_20261103' });
        authorization.grants.push(make({ kind: "self" }, ["authorization.inspect_self", "profile.read_self", "profile.update_self_basic", "profile.request_self", "projects.read_assigned", "assignment.respond", "assignment.handover", "assignment.discuss", "projects.execute", "reports.submit", "assignment.audit_read", "chatbot.data_read",
          ...(scheduling ? ['schedules.read_self', 'schedule_changes.request', 'schedule_changes.respond'] : [])]));
      }
      authorization.grants.push(make({ kind: "organization", storeIds: [location] }, ["directory.read_store"]));
      AuthorizationStateSchema.parse(authorization);
    }
    const status = row.kind === "EXIT" ? "disabled" : row.kind === "REACTIVATE" ? "active" : user.status;
    const changes: any = { status, authorization, lifecycleAppliedRequestId: id };
    if (row.kind === "REACTIVATE") {
      if (!row.recoveryPasswordHash || user.status !== "disabled" || user.authorization?.profile === "system_admin") throw new WorkflowError(409, "SECURE_RECOVERY_REQUIRED", "Tái kích hoạt cần mật khẩu mới và hồ sơ nghiệp vụ hợp lệ; tài khoản kỹ thuật cần quy trình riêng.");
      Object.assign(changes, { passwordHash: row.recoveryPasswordHash, mustChangePassword: false, passwordChangedAt: new Date() });
    }
    const event = { type: "HR_LIFECYCLE_APPLIED", actorId: reviewer.userId, at: new Date().toISOString(), requestId: id, kind: row.kind,
      previousHash: accountAuditHead(user), authorizationHash: digest(authorization), beforeAuthorizationHash: digest(user.authorization ?? null) };
    const audit = { ...event, hash: digest(event) };
    if ((user.securityAudit?.length ?? 0) >= 1000 || mongoose.mongo.BSON.calculateObjectSize({ ...user, ...changes, securityAudit: [...(user.securityAudit ?? []), audit] }) > 8 * 1024 * 1024) throw new WorkflowError(409, "SECURITY_AUDIT_STORAGE_LIMIT", "Không xóa audit tài khoản để tiếp tục.");
    const changed = await UserModel.updateOne({ _id: user._id, ...securityVersionFilter(row.snapshot.userSecurityVersion), employeeId: row.employeeId }, { $set: changes, $inc: { securityVersion: 1 }, $push: { securityAudit: audit } });
    if (!changed.matchedCount) throw new WorkflowError(409, "ACCOUNT_VERSION_CONFLICT", "Tài khoản đã thay đổi.");
  }
  options.failpoint?.("lifecycle-after-user");
  if (!completed) {
    const destination = await store(row.targetStoreId ?? row.sourceStoreId);
    const changes: any = { status: row.kind === "EXIT" ? "inactive" : "active", lifecycleAppliedRequestId: id };
    if (row.kind === "TRANSFER") Object.assign(changes, { storeId: destination._id, departmentId: destination.departmentId, store_raw: destination.store_name, storeMappingRef: `hr-lifecycle:${id}` });
    if ((employee.profileHistory?.length ?? 0) >= 1000 || mongoose.mongo.BSON.calculateObjectSize({ ...employee, ...changes }) > 7 * 1024 * 1024) throw new WorkflowError(409, "PROFILE_STORAGE_LIMIT", "Cần lưu trữ lịch sử hồ sơ.");
    const changed = await EmployeeModel.updateOne({ _id: row.employeeId, lifecyclePendingRequestId: id, ...revisionFilter(row.snapshot) }, { $set: changes, $inc: { profileRevision: 1 }, $push: { profileHistory: { type: "HR_LIFECYCLE_APPLIED", actorId: reviewer.userId, at: new Date(), requestId: id, kind: row.kind, effectiveAt: row.effectiveAt, before: row.snapshot, after: changes } } });
    if (!changed.matchedCount) throw new WorkflowError(409, "PROFILE_VERSION_CONFLICT", "Hồ sơ đã thay đổi.");
  }
  options.failpoint?.("lifecycle-after-employee");
  if (row.kind === "TRANSFER") {
    const confirmation = row.confirmations.find((entry: any) => entry.storeId === String(row.targetStoreId));
    if (!confirmation) throw new WorkflowError(409, "DESTINATION_CONFIRMATION_REQUIRED", "Chưa có quản lý đích xác nhận.");
    const relationId = new mongoose.Types.ObjectId(createHash("sha256").update(`lifecycle:${id}`).digest("hex").slice(0, 24));
    await mongoose.connection.collection("management_relations").updateOne({ _id: relationId }, { $setOnInsert: { managerEmployeeId: objectId(confirmation.managerEmployeeId), employeeId: row.employeeId, storeId: row.targetStoreId, approvalRef: `hr-lifecycle:${id}`, validFrom: new Date(), validUntil: null, revokedAt: null, version: 1 } }, { upsert: true });
    await mongoose.connection.collection("management_relations").updateMany({ employeeId: row.employeeId, storeId: row.sourceStoreId, revokedAt: null }, { $set: { revokedAt: new Date(), lifecycleRevocationRef: id }, $inc: { version: 1 } });
  }
  const done = await advance(row, reviewer.userId, { status: "COMPLETED", openKey: undefined, recoveryTokenHash: undefined, recoveryExpiresAt: undefined, recoveryPasswordHash: undefined }, "Đã áp dụng theo phê duyệt và ngày hiệu lực; không đổi KPI hoặc lịch sử nhiệm vụ", "COMPLETED");
  options.failpoint?.("lifecycle-after-decision");
  await EmployeeModel.updateOne({ _id: row.employeeId, lifecyclePendingRequestId: id }, { $unset: { lifecyclePendingRequestId: "" } });
  return done;
}
export async function resumeLifecycle(actor: AuthenticatedUser, id: string, options: OnboardingOptions = {}) {
  return withCrmWriter(() => resumeLifecycleOwned(actor, id, options));
}
async function resumeLifecycleOwned(actor: AuthenticatedUser, id: string, options: OnboardingOptions) {
  let row: any = await RequestModel.findById(objectId(id)).lean(); if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu.");
  authorize(actor, row, true); await currentApproval(row); await store(row.sourceStoreId); if (row.targetStoreId) await store(row.targetStoreId);
  if (row.status === "COMPLETED") {
    const employee: any = await EmployeeModel.findById(row.employeeId).lean();
    if (employee?.lifecycleAppliedRequestId !== String(row._id)) throw new WorkflowError(409, "LIFECYCLE_RECONCILIATION_REQUIRED", "Quyết định hoàn tất chưa khớp hồ sơ; không tự áp dụng lại.");
    await EmployeeModel.updateOne({ _id: row.employeeId, lifecycleAppliedRequestId: String(row._id), lifecyclePendingRequestId: String(row._id) }, { $unset: { lifecyclePendingRequestId: "" } });
    return row;
  }
  if (["APPLYING", "ACTIVATING"].includes(row.status)) return finish(row, options);
  if (!["APPROVED", "PENDING_CONFIRMATIONS", "PENDING_EFFECTIVE", "PENDING_HANDOVER", "PENDING_ACTIVATION"].includes(row.status)) throw new WorkflowError(409, "LIFECYCLE_STATE_CONFLICT", "Không có bước đã duyệt cần tiếp tục.");
  if (!await currentTransferConfirmations(row)) return row.status === "PENDING_CONFIRMATIONS" ? row : advance(row, actor.userId, { status: "PENDING_CONFIRMATIONS" }, "Chờ đủ quản lý nguồn và đích xác nhận", "WAITING_MANAGERS");
  if (new Date(row.effectiveAt).getTime() > Date.now()) return row.status === "PENDING_EFFECTIVE" ? row : advance(row, actor.userId, { status: "PENDING_EFFECTIVE" }, "Chờ đúng ngày hiệu lực; không áp dụng sớm", "WAITING_EFFECTIVE_DATE");
  if (row.kind !== "REACTIVATE" && await ProjectModel.exists({ status: { $ne: "COMPLETED" }, $or: [{ assigneeId: referenceMatch(String(row.employeeId)) }, { assignmentRequests: { $elemMatch: { status: "HANDOVER_PENDING", replacementId: String(row.employeeId) } } }] })) return row.status === "PENDING_HANDOVER" ? row : advance(row, actor.userId, { status: "PENDING_HANDOVER" }, "Còn phân công CRM cần quản lý xử lý qua workflow hiện có; không tự chuyển trách nhiệm", "WAITING_CRM_HANDOVER");
  if (row.kind === "REACTIVATE") {
    const employee: any = await EmployeeModel.findById(row.employeeId).select("phone").lean(), user: any = row.snapshot.userId ? await UserModel.findById(row.snapshot.userId).select("username status authorization").lean() : null;
    if (!user || user.status !== "disabled" || !AuthorizationStateSchema.safeParse(user.authorization).success || user.authorization?.profile === "system_admin") throw new WorkflowError(409, "SECURE_RECOVERY_REQUIRED", "Tái kích hoạt chưa có tài khoản nghiệp vụ/profile được xác minh phù hợp; không tự tạo, suy diễn profile hoặc mở account kỹ thuật.");
    if (row.status !== "PENDING_ACTIVATION") row = await advance(row, actor.userId, { status: "PENDING_ACTIVATION" }, "Chờ nhân viên tự đặt mật khẩu mới qua kênh an toàn", "WAITING_SECURE_ACTIVATION");
    if (options.deliverActivation && (row.deliveryState !== "DELIVERED" || new Date(row.recoveryExpiresAt ?? 0).getTime() <= Date.now())) {
      const token = randomBytes(32).toString("hex");
      row = await advance(row, actor.userId, { recoveryTokenHash: tokenHash(token), recoveryExpiresAt: new Date(Date.now() + 86400000), deliveryState: "PENDING" }, "Phát hành lời mời đặt lại mật khẩu một lần", "RECOVERY_ISSUED");
      try { await options.deliverActivation({ requestId: id, token, username: user.username, phone: employee?.phone ?? "", purpose: "reactivation" }); }
      catch { return advance(row, actor.userId, { deliveryState: "FAILED" }, "Kênh gửi chưa xác nhận thành công", "DELIVERY_FAILED"); }
      row = await advance(row, actor.userId, { deliveryState: "DELIVERED" }, "Adapter xác nhận gửi an toàn", "DELIVERED");
    }
    return row;
  }
  row = await advance(row, actor.userId, { status: "APPLYING" }, "Bắt đầu áp dụng thay đổi đã được duyệt", "APPLYING");
  return finish(row, options);
}
export async function activateLifecycle(token: string, password: string, options: OnboardingOptions = {}) {
  return withCrmWriter(() => activateLifecycleOwned(token, password, options));
}
async function activateLifecycleOwned(token: string, password: string, options: OnboardingOptions) {
  let row: any = await RequestModel.findOne({ recoveryTokenHash: tokenHash(token), recoveryExpiresAt: { $gt: new Date() }, status: "PENDING_ACTIVATION", deliveryState: "DELIVERED" }).lean();
  if (!row) throw new WorkflowError(400, "ACTIVATION_INVALID", "Lời mời không hợp lệ, đã dùng hoặc hết hạn.");
  await currentApproval(row);
  row = await advance(row, String(row.employeeId), { status: "ACTIVATING", recoveryPasswordHash: await hashPassword(password) }, "Nhân viên xác minh lời mời và đặt mật khẩu mới", "ACTIVATION_CLAIMED");
  return finish(row, options);
}
function lifecycleScope(actor: AuthenticatedUser) {
  const hrStores = [...new Set([...allowedStoreIds(actor, "employees.lifecycle_request"), ...allowedStoreIds(actor, "employees.lifecycle_review"), ...allowedStoreIds(actor, "employees.transfer")])];
  const managerStores = allowedStoreIds(actor, "employees.transfer_confirm");
  if (!hrStores.length && !managerStores.length) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có capability xem workflow nhân sự.");
  return { $or: [
    { sourceStoreId: { $in: hrStores.map(objectId) }, $or: [{ targetStoreId: null }, { targetStoreId: { $in: hrStores.map(objectId) } }] },
    ...managerStores.flatMap((id) => {
      const managed = actor.canonical?.managedByStore[id] ?? [];
      return managed.length ? [{ kind: "TRANSFER", sourceStoreId: objectId(id), employeeId: { $in: managed.map(objectId) } }, { kind: "TRANSFER", targetStoreId: objectId(id) }] : [];
    }),
  ] };
}
export async function pageLifecycle(actor: AuthenticatedUser, query: unknown = {}) { return workflowPage(RequestModel, lifecycleScope(actor), query, lifecycleDto); }
export async function listLifecycle(actor: AuthenticatedUser) { return (await pageLifecycle(actor)).items; }
export async function getLifecycle(actor: AuthenticatedUser, id: string) { return workflowDetail(RequestModel, lifecycleScope(actor), id, (row) => ({ ...lifecycleDto(row), auditIntegrity: historyIntegrity(row, verify) })); }

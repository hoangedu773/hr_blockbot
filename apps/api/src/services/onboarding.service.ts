import mongoose from "mongoose";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { OnboardingCreateSchema, OnboardingResubmitSchema, AuthorizationGrantSchema } from "@hr-blockbot/contracts";
import { OnboardingRequestModel } from "../models/OnboardingRequest.js";
import { UserModel } from "../models/User.js";
import { EmployeeModel } from "../models/Employee.js";
import { StoreModel } from "../models/Store.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { requireCapability, resourceScope, employeeScopeQuery } from "./authorization-scope.service.js";
import { WorkflowError, objectId } from "./project-workflow.service.js";
import { hashPassword } from "./auth.service.js";
import { resolvePrincipal, securityVersion } from "./principal.service.js";
import { digest } from "./project-audit.service.js";
import { workflowPage, workflowDetail, historyIntegrity } from "./workflow-page.service.js";
import { withCrmWriter } from "./crm-writer.service.js";

export type ActivationDelivery = (invitation: { token: string; username: string; requestId: string; phone: string; purpose?: "onboarding" | "reactivation" }) => Promise<void>;
export interface OnboardingOptions { deliverActivation?: ActivationDelivery; failpoint?: (stage: string) => void }
const tokenHash = (value: string) => createHash("sha256").update(value).digest("hex");
const termsHash = (row: any) => digest({ employeeKey: row.employeeKey, employeeId: row.employeeId, userId: row.userId, storeId: row.storeId, requestedBy: row.requestedBy, requesterEmployeeId: row.requesterEmployeeId });
const approvalHash = (row: any) => digest({ approvedBy: row.approvedBy ?? null, approvedAt: row.approvedAt ?? null, approvalReason: row.approvalReason ?? null });
function event(row: any, actor: string, type: string, reason: string, next: any) {
  const payload = { id: randomUUID(), actor, at: new Date().toISOString(), type, reason,
    before: row?.status ?? null, after: next.status ?? row?.status ?? null, version: (row?.version ?? 0) + 1,
    previousHash: row?.history?.at(-1)?.hash ?? "0".repeat(64), beforePayloadHash: digest(row?.payload ?? {}), payloadHash: digest(next.payload ?? row?.payload ?? {}),
    termsHash: termsHash({ ...row, ...next }), approvalHash: approvalHash({ ...row, ...next }),
    ...(type === "AMENDED_AND_RESUBMITTED" ? { beforePayload: row.payload, afterPayload: next.payload } : {}) };
  return { ...payload, hash: digest(payload) };
}
function verifyHistory(row: any) {
  let previous = "0".repeat(64);
  for (const entry of row.history ?? []) { const { hash, ...payload } = entry; if (payload.previousHash !== previous || digest(payload) !== hash) throw new WorkflowError(409, "ONBOARDING_AUDIT_INVALID", "Lịch sử tiếp nhận không khớp hash."); previous = hash; }
  const last = row.history?.at(-1);
  if (!last || last.payloadHash !== digest(row.payload) || last.termsHash !== termsHash(row) || last.approvalHash !== approvalHash(row) || last.after !== row.status || last.version !== row.version || String(row.storeId) !== row.payload.storeId) throw new WorkflowError(409, "ONBOARDING_AUDIT_INVALID", "Snapshot hoặc mapping tiếp nhận không khớp lịch sử.");
  if (row.approvedBy && !row.history.some((entry: any) => entry.type === "HR_APPROVED" && entry.actor === String(row.approvedBy))) throw new WorkflowError(409, "ONBOARDING_AUDIT_INVALID", "Chủ thể phê duyệt không khớp audit.");
}
async function advance(row: any, actor: string, type: string, reason: string, changes: any) {
  verifyHistory(row);
  if (row.history.length >= 1000) throw new WorkflowError(409, "ONBOARDING_STORAGE_LIMIT", "Không xóa lịch sử để tiếp tục.");
  const history = event(row, actor, type, reason, changes);
  const after = { ...row, ...changes, history: [...row.history, history] };
  if (mongoose.mongo.BSON.calculateObjectSize(after) > 8 * 1024 * 1024) throw new WorkflowError(409, "ONBOARDING_STORAGE_LIMIT", "Đạt ngưỡng lưu trữ.");
  const clear = Object.fromEntries(Object.entries(changes).filter(([, value]) => value === undefined).map(([key]) => [key, 1]));
  const values = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
  const updated = await OnboardingRequestModel.findOneAndUpdate({ _id: row._id, version: row.version, status: row.status },
    { $set: values, ...(Object.keys(clear).length ? { $unset: clear } : {}), $inc: { version: 1 }, $push: { history } }, { new: true, runValidators: true }).lean();
  if (!updated) throw new WorkflowError(409, "ONBOARDING_VERSION_CONFLICT", "Yêu cầu đã đổi; tải lại, không tạo lại hồ sơ/tài khoản.");
  return updated as any;
}
export function onboardingDto(row: any) {
  return { id: String(row._id), version: row.version, status: row.status, deliveryState: row.deliveryState,
    employeeId: String(row.employeeId), userId: String(row.userId), storeId: String(row.storeId), payload: row.payload,
    requestedBy: String(row.requestedBy), approvedBy: row.approvedBy ? String(row.approvedBy) : null,
    approvedAt: row.approvedAt?.toISOString?.() ?? row.approvedAt ?? null, history: Array.isArray(row.history) ? row.history : [] };
}
async function canonicalStore(id: unknown) {
  const store = await StoreModel.collection.findOne({ _id: objectId(String(id)), kind: "outlet", status: "ACTIVE", deleted_at: null,
    scopeApprovalRef: { $type: "string", $ne: "" }, departmentId: { $type: "objectId" } });
  if (!store) throw new WorkflowError(409, "ONBOARDING_MAPPING_REQUIRED", "Cửa hàng/đơn vị chưa được xác minh; không provision account active.");
  return store;
}
async function independentReview(user: AuthenticatedUser, row: any) {
  requireCapability(user, "onboarding.review", { ...resourceScope(user, { storeId: row.storeId, storeMappingRef: "approved" }),
    requiresIndependentApproval: true, requesterUserId: String(row.requestedBy), subjectEmployeeId: String(row.employeeId) });
  if (String(row.requesterEmployeeId) === user.employeeId) throw new WorkflowError(403, "SELF_APPROVAL", "Không tự phê duyệt đề nghị do mình lập.");
}
export async function assertApprovalCurrent(row: any) {
  verifyHistory(row);
  const reviewer: any = await UserModel.findById(row.approvedBy);
  if (!reviewer) throw new WorkflowError(409, "APPROVER_UNAVAILABLE", "Chưa có HR độc lập còn quyền phù hợp.");
  try {
    const principal = await resolvePrincipal({ sub: String(reviewer._id), role: reviewer.role, securityVersion: securityVersion(reviewer) });
    await independentReview(principal, row);
  } catch { throw new WorkflowError(409, "APPROVAL_REVALIDATION_REQUIRED", "Phê duyệt HR không còn hợp lệ; giữ trạng thái chờ, không tự kích hoạt."); }
}
async function assertIndexesReady() {
  for (const [model, field] of [[OnboardingRequestModel, "employeeKey"], [UserModel, "username"], [UserModel, "employeeId"], [EmployeeModel, "personnelKey"]] as const) {
    const indexes = await model.collection.indexes();
    if (!indexes.some((index: any) => index.unique && index.key[field] === 1)) throw new WorkflowError(503, "ONBOARDING_INDEX_REQUIRED", "Maintenance phải cài unique indexes trước khi mở ghi.");
  }
}
export async function createOnboarding(user: AuthenticatedUser, body: unknown, draft = false) {
  const parsed = OnboardingCreateSchema.safeParse(body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Thông tin đề nghị tối thiểu không hợp lệ hoặc chứa trường cấp quyền.");
  const payload = parsed.data;
  requireCapability(user, draft ? "onboarding.draft" : "onboarding.propose", resourceScope(user, { storeId: payload.storeId, storeMappingRef: "approved" }));
  await canonicalStore(payload.storeId); await assertIndexesReady();
  const employeeKey = payload.employeeCode.toLowerCase();
  const exactCode = { $regex: "^" + payload.employeeCode.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "$", $options: "i" };
  if (await EmployeeModel.exists({ $or: [{ employeeCode: exactCode }, { employee_code: exactCode }] }) || await UserModel.exists({ username: employeeKey })) {
    throw new WorkflowError(409, "ONBOARDING_DUPLICATE_IDENTITY", "Mã hồ sơ/tài khoản đã tồn tại; cần đối chiếu, không tự liên kết từ tên.");
  }
  const values = { employeeKey, payload, storeId: objectId(payload.storeId), requestedBy: objectId(user.userId), requesterEmployeeId: objectId(user.employeeId!),
    status: draft ? "DRAFT" : "PENDING_HR_REVIEW", version: 1, employeeId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId() };
  try { return (await OnboardingRequestModel.create({ ...values, history: [event(null, user.userId, "REQUESTED", payload.reason, values)] })).toObject(); }
  catch (error: any) { if (error.code === 11000) throw new WorkflowError(409, "ONBOARDING_DUPLICATE_REQUEST", "Đã có đề nghị cho mã này; xem trạng thái, không tạo lại."); throw error; }
}
async function onboardingScope(user: AuthenticatedUser) {
  const own = { requestedBy: objectId(user.userId) };
  let scope: any = own;
  try { const employeeQuery = employeeScopeQuery(user, "onboarding.review");
    // onboarding rows have canonical storeId, not a personnel mapping; use the granted store set.
    const { allowedStoreIds } = await import("./authorization-scope.service.js");
    scope = { $or: [own, { storeId: { $in: allowedStoreIds(user, "onboarding.review").map(objectId) } }] };
  } catch (error) {
    requireCapability(user, user.authorization?.profile === "hr" ? "onboarding.draft" : "onboarding.propose");
  }
  return scope;
}
export async function pageOnboarding(user: AuthenticatedUser, query: unknown = {}) { return workflowPage(OnboardingRequestModel, await onboardingScope(user), query, onboardingDto); }
export async function listOnboarding(user: AuthenticatedUser) { return (await pageOnboarding(user)).items; }
export async function getOnboarding(user: AuthenticatedUser, id: string) { return workflowDetail(OnboardingRequestModel, await onboardingScope(user), id, (row) => ({ ...onboardingDto(row), auditIntegrity: historyIntegrity(row, verifyHistory) })); }
export async function resubmitOnboarding(user: AuthenticatedUser, id: string, input: unknown) {
  const parsed = OnboardingResubmitSchema.safeParse(input);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Chỉ sửa thông tin đề nghị; không đổi mã nhân viên/cửa hàng/identity hoặc quyền.");
  const row: any = await OnboardingRequestModel.findById(objectId(id)).lean();
  if (!row || String(row.requestedBy) !== user.userId) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đề nghị của bạn.");
  requireCapability(user, user.authorization?.profile === "hr" ? "onboarding.draft" : "onboarding.propose", resourceScope(user, { storeId: row.storeId, storeMappingRef: "approved" }));
  await canonicalStore(row.storeId);
  if (row.status !== "REJECTED" || row.version !== parsed.data.expectedVersion) throw new WorkflowError(409, "ONBOARDING_VERSION_CONFLICT", "Chỉ gửi lại đề nghị bị từ chối đúng phiên bản.");
  const { expectedVersion, ...fields } = parsed.data;
  return advance(row, user.userId, "AMENDED_AND_RESUBMITTED", parsed.data.reason, { payload: { ...row.payload, ...fields }, status: "PENDING_HR_REVIEW", approvedBy: null, approvedAt: null, approvalReason: null });
}
export async function reviewOnboarding(user: AuthenticatedUser, id: string, body: { decision: string; reason: string; expectedVersion: number }, options: OnboardingOptions = {}) {
  let row: any = await OnboardingRequestModel.findById(objectId(id)).lean();
  if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đề nghị.");
  await independentReview(user, row); await canonicalStore(row.storeId);
  if (row.status !== "PENDING_HR_REVIEW" || row.version !== body.expectedVersion) throw new WorkflowError(409, "ONBOARDING_VERSION_CONFLICT", "Đề nghị đã được xử lý hoặc chưa gửi HR.");
  row = await advance(row, user.userId, body.decision === "APPROVE" ? "HR_APPROVED" : "HR_REJECTED", body.reason,
    { status: body.decision === "APPROVE" ? "PROVISIONING" : "REJECTED", approvedBy: body.decision === "APPROVE" ? user.userId : null,
      approvedAt: body.decision === "APPROVE" ? new Date() : null, approvalReason: body.reason });
  return body.decision === "APPROVE" ? resumeOnboarding(user, String(row._id), options) : row;
}
export async function resumeOnboarding(user: AuthenticatedUser, id: string, options: OnboardingOptions = {}) {
  return withCrmWriter(() => resumeOnboardingOwned(user, id, options));
}
async function resumeOnboardingOwned(user: AuthenticatedUser, id: string, options: OnboardingOptions) {
  let row: any = await OnboardingRequestModel.findById(objectId(id)).lean();
  if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đề nghị.");
  await independentReview(user, row); await assertApprovalCurrent(row);
  const store = await canonicalStore(row.storeId); await assertIndexesReady();
  if (row.status === "ACTIVATING") return finishActivation(row, options);
  if (row.status === "PROVISIONING") {
    const mappingRef = "onboarding:" + String(row._id);
    await EmployeeModel.updateOne({ _id: row.employeeId, provisioningRequestId: row._id }, { $setOnInsert: {
      employeeCode: row.payload.employeeCode, employee_code: row.payload.employeeCode, personnelKey: row.employeeKey,
      fullName: row.payload.fullName, phone: row.payload.phone, hiredAt: new Date(row.payload.hiredAt),
      departmentId: store.departmentId, storeId: store._id, store_raw: store.store_name, storeMappingRef: mappingRef,
      status: "inactive", profile_status: null, profileRevision: 1, userId: row.userId, provisioningRequestId: row._id,
      profileHistory: [{ actorId: row.approvedBy, type: "ONBOARDING_PROVISIONED", at: new Date(), reason: row.approvalReason }],
    } }, { upsert: true, runValidators: true });
    options.failpoint?.("after-employee");
    const selfCaps = ["authorization.inspect_self", "profile.read_self", "profile.update_self_basic", "profile.request_self", "projects.read_assigned", "assignment.respond", "assignment.handover", "assignment.discuss", "projects.execute", "reports.submit", "assignment.audit_read", "chatbot.data_read"];
    const makeGrant = (scope: any, capabilities: string[]) => AuthorizationGrantSchema.parse({ id: randomUUID(), profile: "staff", scope, capabilities,
      approvalRef: mappingRef, grantedBy: String(row.approvedBy), grantedAt: row.approvedAt.toISOString(), validFrom: row.approvedAt.toISOString(), validUntil: null });
    await UserModel.updateOne({ _id: row.userId, provisioningRequestId: row._id }, { $setOnInsert: {
      username: row.employeeKey, passwordHash: "!PENDING_ACTIVATION", employeeId: row.employeeId, role: "Employee", businessRole: "staff",
      isGlobalAdmin: false, status: "pending_activation", mustChangePassword: true, securityVersion: 0, provisioningRequestId: row._id,
      authorization: { schemaVersion: 1, profile: "staff", grants: [makeGrant({ kind: "self" }, selfCaps), makeGrant({ kind: "organization", storeIds: [String(row.storeId)] }, ["directory.read_store"])] },
      securityAudit: [{ type: "ONBOARDING_PROVISIONED", actorId: String(row.approvedBy), requestId: String(row._id), at: new Date() }],
    } }, { upsert: true, runValidators: true });
    options.failpoint?.("after-user");
    row = await advance(row, user.userId, "PROVISIONED", "Employee/user canonical đã liên kết; chưa kích hoạt", { status: "PENDING_ACTIVATION" });
  }
  if (row.status === "PENDING_ACTIVATION" && (row.deliveryState !== "DELIVERED" || !row.activationExpiresAt || new Date(row.activationExpiresAt).getTime() <= Date.now()) && options.deliverActivation) {
    const token = randomBytes(32).toString("hex");
    row = await advance(row, user.userId, "ACTIVATION_ISSUED", "Phát hành lời mời một lần qua adapter", { activationTokenHash: tokenHash(token), activationExpiresAt: new Date(Date.now() + 86400000), deliveryState: "PENDING" });
    try { await options.deliverActivation({ token, username: row.employeeKey, requestId: String(row._id), phone: row.payload.phone, purpose: "onboarding" }); }
    catch { return advance(row, user.userId, "DELIVERY_FAILED", "Kênh kích hoạt chưa xác nhận gửi thành công", { deliveryState: "FAILED" }); }
    row = await advance(row, user.userId, "DELIVERED", "Adapter đã xác nhận gửi lời mời", { deliveryState: "DELIVERED" });
  }
  return row;
}
async function finishActivation(row: any, options: OnboardingOptions = {}) {
  await canonicalStore(row.storeId); await assertApprovalCurrent(row);
  const user: any = await UserModel.findById(row.userId).lean();
  if (!user || String(user.provisioningRequestId) !== String(row._id) || String(user.employeeId) !== String(row.employeeId) || user.status === "disabled") throw new WorkflowError(409, "ACTIVATION_ACCOUNT_CONFLICT", "Không tự mở lại tài khoản đã bị khóa/thay đổi.");
  if (user.status === "pending_activation") {
    const changed = await UserModel.updateOne({ _id: row.userId, status: "pending_activation", securityVersion: user.securityVersion, provisioningRequestId: row._id },
      { $set: { passwordHash: row.activationPasswordHash, status: "active", mustChangePassword: false, passwordChangedAt: new Date() }, $inc: { securityVersion: 1 },
        $push: { securityAudit: { type: "ACTIVATED", requestId: String(row._id), at: new Date() } } });
    if (!changed.modifiedCount) throw new WorkflowError(409, "ACTIVATION_ACCOUNT_CONFLICT", "Tài khoản đã thay đổi.");
  } else if (user.passwordHash !== row.activationPasswordHash) throw new WorkflowError(409, "ACTIVATION_ACCOUNT_CONFLICT", "Tài khoản không khớp lần kích hoạt.");
  options.failpoint?.("activation-after-user");
  const employee: any = await EmployeeModel.findById(row.employeeId).lean();
  if (employee?.status !== "active") {
    const changed = await EmployeeModel.updateOne({ _id: row.employeeId, provisioningRequestId: row._id, userId: row.userId, status: "inactive", profileRevision: 1 },
      { $set: { status: "active", activationRequestId: String(row._id) }, $inc: { profileRevision: 1 }, $push: { profileHistory: { type: "ONBOARDING_ACTIVATED", at: new Date(), requestId: String(row._id) } } });
    if (!changed.modifiedCount) throw new WorkflowError(409, "ACTIVATION_EMPLOYEE_CONFLICT", "Hồ sơ đã thay đổi; cần đối chiếu trước khi kích hoạt.");
  } else if (employee.activationRequestId !== String(row._id)) throw new WorkflowError(409, "ACTIVATION_EMPLOYEE_CONFLICT", "Không ghi đè trạng thái hồ sơ.");
  options.failpoint?.("activation-after-employee");
  return advance(row, String(row.userId), "ACTIVATED", "Nhân viên thiết lập mật khẩu và hoàn tất liên kết canonical", { status: "ACTIVE", activationTokenHash: undefined, activationPasswordHash: undefined, activationExpiresAt: undefined });
}
export async function activateOnboarding(token: string, newPassword: string, options: OnboardingOptions = {}) {
  return withCrmWriter(() => activateOnboardingOwned(token, newPassword, options));
}
async function activateOnboardingOwned(token: string, newPassword: string, options: OnboardingOptions) {
  const row: any = await OnboardingRequestModel.findOne({ activationTokenHash: tokenHash(token), status: "PENDING_ACTIVATION", deliveryState: "DELIVERED", activationExpiresAt: { $gt: new Date() } }).lean();
  if (!row) throw new WorkflowError(400, "ACTIVATION_INVALID", "Lời mời không hợp lệ, đã dùng hoặc đã hết hạn.");
  await assertApprovalCurrent(row); await canonicalStore(row.storeId);
  const claimed = await advance(row, String(row.userId), "ACTIVATION_CLAIMED", "Nhân viên xác minh lời mời một lần", { status: "ACTIVATING", activationPasswordHash: await hashPassword(newPassword) });
  return finishActivation(claimed, options);
}
export async function submitOnboarding(user: AuthenticatedUser, id: string, expectedVersion: number) {
  const row: any = await OnboardingRequestModel.findById(objectId(id)).lean();
  if (!row || String(row.requestedBy) !== user.userId) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đề nghị của bạn.");
  requireCapability(user, "onboarding.draft", resourceScope(user, { storeId: row.storeId, storeMappingRef: "approved" }));
  if (row.status !== "DRAFT" || row.version !== expectedVersion) throw new WorkflowError(409, "ONBOARDING_VERSION_CONFLICT", "Bản nháp đã thay đổi.");
  return advance(row, user.userId, "SUBMITTED", "Gửi HR độc lập xem xét", { status: "PENDING_HR_REVIEW" });
}

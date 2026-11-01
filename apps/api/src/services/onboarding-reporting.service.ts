import mongoose, { Schema } from "mongoose";
import { createHash, randomUUID } from "node:crypto";
import { InitialReportingProposalSchema, InitialReportingApprovalSchema, PaginationQuerySchema } from "@hr-blockbot/contracts";
import { OnboardingRequestModel } from "../models/OnboardingRequest.js";
import { ManagementRelationModel } from "../models/AuthorizationMapping.js";
import { UserModel } from "../models/User.js";
import { EmployeeModel } from "../models/Employee.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { resolvePrincipal, securityVersion } from "./principal.service.js";
import { allowedStoreIds, hasCapability, requireCapability, resourceScope } from "./authorization-scope.service.js";
import { WorkflowError, objectId } from "./project-workflow.service.js";
import { digest } from "./project-audit.service.js";
import { withCrmWriter } from "./crm-writer.service.js";
import { workflowPage, workflowDetail, historyIntegrity } from "./workflow-page.service.js";
import { assertApprovalCurrent as assertHrApprovalCurrent } from "./onboarding.service.js";

const schema = new Schema({
  onboardingId: { type: Schema.Types.ObjectId, required: true, unique: true }, employeeId: { type: Schema.Types.ObjectId, required: true },
  managerEmployeeId: { type: Schema.Types.ObjectId, required: true }, storeId: { type: Schema.Types.ObjectId, required: true },
  requestedBy: { type: Schema.Types.ObjectId, required: true }, requesterEmployeeId: { type: Schema.Types.ObjectId, required: true },
  validFrom: { type: Date, required: true }, evidenceRef: { type: String, required: true }, reason: { type: String, required: true },
  approvedBy: { type: Schema.Types.ObjectId, default: null }, approvedAt: { type: Date, default: null },
  status: { type: String, enum: ["PENDING", "APPROVED", "APPLIED"], required: true }, version: { type: Number, required: true },
  history: { type: [Schema.Types.Mixed], default: [] },
}, { collection: "onboarding_reporting_requests", strict: "throw", timestamps: true });
schema.index({ storeId: 1, createdAt: -1, _id: -1 });
export const OnboardingReportingModel = mongoose.models.OnboardingReporting || mongoose.model("OnboardingReporting", schema);
const terms = (row: any) => digest({ onboardingId: row.onboardingId, employeeId: row.employeeId, managerEmployeeId: row.managerEmployeeId, storeId: row.storeId, requestedBy: row.requestedBy, requesterEmployeeId: row.requesterEmployeeId, validFrom: row.validFrom, evidenceRef: row.evidenceRef, reason: row.reason });
const state = (row: any) => digest({ status: row.status, version: row.version, approvedBy: row.approvedBy ?? null, approvedAt: row.approvedAt ?? null });
function entry(row: any, actor: string, type: string, reason: string, changes: any) {
  const next = { ...row, ...changes, version: (row?.version ?? 0) + 1 };
  const value = { id: randomUUID(), actorId: actor, type, at: new Date().toISOString(), reason, termsHash: terms(next), stateHash: state(next), previousHash: row?.history?.at(-1)?.hash ?? "0".repeat(64) };
  return { ...value, hash: digest(value) };
}
function verify(row: any) {
  let previous = "0".repeat(64);
  for (const event of row.history ?? []) { const { hash, ...value } = event; if (hash !== digest(value) || value.previousHash !== previous || value.termsHash !== terms(row)) throw new WorkflowError(409, "INITIAL_REPORTING_AUDIT_INVALID", "Không ghi đè lịch sử quan hệ ban đầu."); previous = hash; }
  if (!row.history?.length || row.history.at(-1).stateHash !== state(row)) throw new WorkflowError(409, "INITIAL_REPORTING_AUDIT_INVALID", "Trạng thái không khớp lịch sử.");
}
async function advance(row: any, actor: string, type: string, reason: string, changes: any) {
  verify(row); const event = entry(row, actor, type, reason, changes);
  if (row.history.length >= 1000 || mongoose.mongo.BSON.calculateObjectSize({ ...row, ...changes, history: [...row.history, event] }) > 8 * 1024 * 1024) throw new WorkflowError(409, "INITIAL_REPORTING_STORAGE_LIMIT", "Không cắt lịch sử để tiếp tục.");
  const saved = await OnboardingReportingModel.findOneAndUpdate({ _id: row._id, version: row.version, status: row.status }, { $set: changes, $inc: { version: 1 }, $push: { history: event } }, { new: true, runValidators: true }).lean();
  if (!saved) throw new WorkflowError(409, "INITIAL_REPORTING_VERSION_CONFLICT", "Đề nghị quan hệ đã thay đổi."); return saved as any;
}
function dto(row: any) { return { id: String(row._id), onboardingId: String(row.onboardingId), employeeId: String(row.employeeId), managerEmployeeId: String(row.managerEmployeeId), storeId: String(row.storeId), requestedBy: String(row.requestedBy), status: row.status, validFrom: row.validFrom, evidenceRef: row.evidenceRef, version: row.version, approvedBy: row.approvedBy ? String(row.approvedBy) : null, history: row.history ?? [] }; }
async function principal(id: unknown) { const user: any = await UserModel.findById(id).lean(); if (!user) throw new WorkflowError(409, "INITIAL_REPORTING_PARTICIPANT_UNAVAILABLE", "Chủ thể không còn hợp lệ."); return resolvePrincipal({ sub: String(user._id), role: user.role, securityVersion: securityVersion(user) }); }
async function eligibleManager(id: unknown, storeId: unknown) {
  const employee: any = await EmployeeModel.findById(id).lean();
  if (!employee?.userId || employee.status !== "active" || !employee.storeMappingRef || employee.lifecyclePendingRequestId) throw new WorkflowError(409, "INITIAL_REPORTING_MANAGER_UNAVAILABLE", "Quản lý cần liên kết canonical active, không đang lifecycle.");
  const manager = await principal(employee.userId);
  requireCapability(manager, "projects.assign", resourceScope(manager, { storeId, storeMappingRef: "verified" }));
  return employee;
}
async function checkReviewer(actor: AuthenticatedUser, row: any) {
  requireCapability(actor, "onboarding.reporting_review", { ...resourceScope(actor, { storeId: row.storeId, storeMappingRef: "verified", employeeId: row.requesterEmployeeId }), requiresIndependentApproval: true, requesterUserId: String(row.requestedBy), subjectEmployeeId: String(row.employeeId) });
  if ([String(row.managerEmployeeId), String(row.employeeId), String(row.requesterEmployeeId)].includes(actor.employeeId ?? "")) throw new WorkflowError(403, "SELF_APPROVAL", "Người duyệt phải độc lập với người đề nghị và hai bên quan hệ.");
  const requester = await principal(row.requestedBy);
  requireCapability(requester, "onboarding.reporting_propose", resourceScope(requester, { storeId: row.storeId, storeMappingRef: "verified" }));
  // Direct actual upper manager, including verified SAM->SM; rank never proves it.
  if (!await ManagementRelationModel.exists({ managerEmployeeId: actor.employeeId, employeeId: row.requesterEmployeeId, storeId: row.storeId, approvalRef: { $type: "string", $ne: "" }, revokedAt: null, validFrom: { $lte: new Date() }, $or: [{ validUntil: null }, { validUntil: { $gt: new Date() } }] })) throw new WorkflowError(403, "INITIAL_REPORTING_DIRECT_APPROVER_REQUIRED", "Chưa xác minh cấp trên trực tiếp có thẩm quyền của SM đề nghị.");
}
async function scope(actor: AuthenticatedUser) {
  const clauses: any[] = [];
  const propose = allowedStoreIds(actor, "onboarding.reporting_propose");
  if (propose.length) clauses.push({ storeId: { $in: propose.map(objectId) } });
  const review = allowedStoreIds(actor, "onboarding.reporting_review");
  if (review.length) {
    const edges: any[] = await ManagementRelationModel.find({ managerEmployeeId: actor.employeeId, storeId: { $in: review.map(objectId) }, revokedAt: null, validFrom: { $lte: new Date() }, approvalRef: { $type: "string", $ne: "" }, $or: [{ validUntil: null }, { validUntil: { $gt: new Date() } }] }).lean();
    clauses.push(...edges.map((edge) => ({ storeId: edge.storeId, requesterEmployeeId: edge.employeeId })));
  }
  if (!hasCapability(actor, "onboarding.reporting_propose") && !hasCapability(actor, "onboarding.reporting_review")) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có grant quan hệ ban đầu.");
  return { $or: clauses.length ? clauses : [{ _id: { $in: [] } }] };
}
async function display(rows: any[]) {
  const [people, onboardings]: any[] = await Promise.all([
    EmployeeModel.find({ _id: { $in: rows.map((row) => objectId(row.managerEmployeeId)) } }).select("fullName full_name").lean(),
    OnboardingRequestModel.find({ _id: { $in: rows.map((row) => objectId(row.onboardingId)) } }).select("payload.fullName payload.employeeCode status").lean(),
  ]);
  return rows.map((row) => { const person = people.find((item: any) => String(item._id) === row.managerEmployeeId), onboard = onboardings.find((item: any) => String(item._id) === row.onboardingId); return { ...row, onboardingStatus: onboard?.status ?? null, managerName: person?.fullName || person?.full_name || row.managerEmployeeId, employeeName: onboard?.payload?.fullName || row.employeeId, employeeCode: onboard?.payload?.employeeCode || "" }; });
}
export async function pageInitialReporting(actor: AuthenticatedUser, query: unknown) { const result = await workflowPage(OnboardingReportingModel, await scope(actor), query, dto); return { ...result, items: await display(result.items) }; }
export async function getInitialReporting(actor: AuthenticatedUser, id: string) { const row = await workflowDetail(OnboardingReportingModel, await scope(actor), id, (row) => ({ ...dto(row), auditIntegrity: historyIntegrity(row, verify) })); return (await display([row]))[0]; }
export async function initialReportingOptions(actor: AuthenticatedUser, query: unknown) {
  requireCapability(actor, "onboarding.reporting_propose");
  const stores = allowedStoreIds(actor, "onboarding.reporting_propose");
  return workflowPage(OnboardingRequestModel, { storeId: { $in: stores.map(objectId) } }, query, (row) => ({ id: String(row._id), fullName: row.payload.fullName, employeeCode: row.payload.employeeCode, storeId: String(row.storeId), status: row.status }));
}
export async function initialReportingManagers(actor: AuthenticatedUser, storeId: string, query: unknown) {
  storeId = String(objectId(storeId)); requireCapability(actor, "onboarding.reporting_propose", resourceScope(actor, { storeId, storeMappingRef: "verified" }));
  const parsed = PaginationQuerySchema.safeParse(query);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Phân trang không hợp lệ.");
  const { page, limit } = parsed.data, start = (page - 1) * limit;
  if (!Number.isSafeInteger(start)) throw new WorkflowError(400, "VALIDATION_FAILED", "Trang vượt giới hạn.");
  // Resolve effective grants before counting/paging. Paging raw users then filtering
  // would hide legitimate later managers and disclose unrelated account counts.
  const users = UserModel.find({ status: "active", "authorization.profile": { $in: ["om", "sam", "am", "sm"] } }).select("employeeId").sort({ _id: 1 }).lean().cursor();
  const items = []; let totalItems = 0;
  for await (const user of users) { if (!user.employeeId) continue; try { const employee = await eligibleManager(user.employeeId, storeId); if (totalItems >= start && items.length < limit) items.push({ employeeId: String(employee._id), fullName: employee.fullName || employee.full_name || "", employeeCode: employee.employeeCode || employee.employee_code || "" }); totalItems++; } catch (error: any) { if (![401, 403, 409].includes(error?.status)) throw error; } }
  return { items, paging: { page, limit, totalItems, hasNext: page * limit < totalItems } };
}
export async function proposeInitialReporting(actor: AuthenticatedUser, input: unknown) {
  return withCrmWriter(async () => {
    const parsed = InitialReportingProposalSchema.safeParse(input); if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Đề nghị quan hệ ban đầu không hợp lệ.");
    const body = parsed.data, onboarding: any = await OnboardingRequestModel.findById(body.onboardingId).lean();
    if (!onboarding) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tiếp nhận.");
    requireCapability(actor, "onboarding.reporting_propose", resourceScope(actor, { storeId: onboarding.storeId, storeMappingRef: "verified" }));
    if (String(onboarding.employeeId) === body.managerEmployeeId) throw new WorkflowError(400, "INVALID_REPORTING_RELATION", "Không tự quản lý chính mình.");
    await eligibleManager(body.managerEmployeeId, onboarding.storeId);
    await OnboardingReportingModel.init();
    const indexes = await OnboardingReportingModel.collection.indexes(); if (!indexes.some((index: any) => index.unique && index.key.onboardingId)) throw new WorkflowError(503, "INITIAL_REPORTING_INDEX_REQUIRED", "Chưa có unique index cho quan hệ ban đầu.");
    const values = { onboardingId: onboarding._id, employeeId: onboarding.employeeId, managerEmployeeId: objectId(body.managerEmployeeId), storeId: onboarding.storeId, requestedBy: objectId(actor.userId), requesterEmployeeId: objectId(actor.employeeId!), validFrom: new Date(body.validFrom), evidenceRef: body.evidenceRef, reason: body.reason, status: "PENDING", version: 1 };
    try { return dto((await OnboardingReportingModel.create({ ...values, history: [entry(null, actor.userId, "PROPOSED", body.reason, values)] })).toObject()); }
    catch (error: any) { if (error.code === 11000) throw new WorkflowError(409, "INITIAL_REPORTING_EXISTS", "Đã có đề nghị quan hệ cho identity này; xem lịch sử, không tạo lại."); throw error; }
  });
}
async function apply(row: any, actor: AuthenticatedUser, failpoint?: (stage: string) => void) {
  verify(row); await checkReviewer(actor, row); await eligibleManager(row.managerEmployeeId, row.storeId);
  const onboard: any = await OnboardingRequestModel.findById(row.onboardingId).lean();
  if (String(onboard?.employeeId) !== String(row.employeeId) || String(onboard?.storeId) !== String(row.storeId)) throw new WorkflowError(409, "INITIAL_REPORTING_IDENTITY_CONFLICT", "Identity/cửa hàng không khớp tiếp nhận.");
  if (!onboard.approvedBy || !["PROVISIONING", "PENDING_ACTIVATION", "ACTIVATING", "ACTIVE"].includes(onboard.status)) throw new WorkflowError(409, "INITIAL_REPORTING_HR_APPROVAL_REQUIRED", "HR phải duyệt hồ sơ trước khi cấp quản lý phê duyệt quan hệ ban đầu.");
  await assertHrApprovalCurrent(onboard);
  if (onboard.status !== "ACTIVE" || new Date(row.validFrom).getTime() > Date.now()) return row;
  const employee: any = await EmployeeModel.findById(row.employeeId).lean();
  if (!employee || employee.status !== "active" || employee.lifecyclePendingRequestId || String(employee.storeId) !== String(row.storeId) || String(employee.provisioningRequestId) !== String(row.onboardingId)) throw new WorkflowError(409, "INITIAL_REPORTING_IDENTITY_CONFLICT", "Nhân viên đã đổi trạng thái/mapping; cần đối chiếu.");
  const id = objectId(createHash("sha256").update("initial-reporting:" + row._id).digest("hex").slice(0, 24));
  const approvalRef = "onboarding-reporting:" + row._id;
  const relations = mongoose.connection.collection<any>("management_relations");
  if (await relations.findOne({ employeeId: row.employeeId, _id: { $ne: id }, approvalRef: { $type: "string", $ne: "" }, revokedAt: null })) throw new WorkflowError(409, "INITIAL_REPORTING_ALREADY_MAPPED", "Đã có quan hệ; workflow ban đầu không thay quản lý hoặc quản trị graph tổng quát.");
  const existing = await relations.findOne({ _id: id });
  if (existing && (String(existing.managerEmployeeId) !== String(row.managerEmployeeId) || String(existing.employeeId) !== String(row.employeeId) || existing.approvalRef !== approvalRef)) throw new WorkflowError(409, "INITIAL_REPORTING_IDENTITY_CONFLICT", "Không ghi đè quan hệ hiện hữu.");
  await relations.updateOne({ _id: id }, { $setOnInsert: { managerEmployeeId: row.managerEmployeeId, employeeId: row.employeeId, storeId: row.storeId, validFrom: row.validFrom, validUntil: null, revokedAt: new Date(), initialReportingStaged: true, approvalRef, evidenceRef: row.evidenceRef, requestedBy: row.requestedBy, approvedBy: row.approvedBy, version: 1 } }, { upsert: true });
  failpoint?.("initial-reporting-after-stage");
  if (row.status !== "APPLIED") row = await advance(row, actor.userId, "APPLIED", "Tiếp nhận active, đến ngày hiệu lực và phê duyệt độc lập hợp lệ", { status: "APPLIED" });
  failpoint?.("initial-reporting-after-decision");
  await relations.updateOne({ _id: id, approvalRef, initialReportingStaged: true }, { $set: { revokedAt: null }, $unset: { initialReportingStaged: "" } });
  return row;
}
export async function approveInitialReporting(actor: AuthenticatedUser, id: string, input: unknown, failpoint?: (stage: string) => void) {
  return withCrmWriter(async () => {
    const parsed = InitialReportingApprovalSchema.safeParse(input); if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần phiên bản và lý do phê duyệt.");
    let row: any = await OnboardingReportingModel.findById(objectId(id)).lean(); if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đề nghị.");
    await checkReviewer(actor, row);
    if (row.status !== "PENDING" || row.version !== parsed.data.expectedVersion) throw new WorkflowError(409, "INITIAL_REPORTING_VERSION_CONFLICT", "Đề nghị đã được quyết định.");
    const onboard: any = await OnboardingRequestModel.findById(row.onboardingId).lean();
    if (!onboard?.approvedBy || !["PROVISIONING", "PENDING_ACTIVATION", "ACTIVATING", "ACTIVE"].includes(onboard.status)) throw new WorkflowError(409, "INITIAL_REPORTING_HR_APPROVAL_REQUIRED", "HR phải duyệt hồ sơ trước khi cấp quản lý phê duyệt quan hệ ban đầu.");
    await assertHrApprovalCurrent(onboard);
    row = await advance(row, actor.userId, "APPROVED", parsed.data.reason, { status: "APPROVED", approvedBy: objectId(actor.userId), approvedAt: new Date() });
    return dto(await apply(row, actor, failpoint));
  });
}
export async function resumeInitialReporting(actor: AuthenticatedUser, id: string, failpoint?: (stage: string) => void) {
  return withCrmWriter(async () => {
    const row: any = await OnboardingReportingModel.findById(objectId(id)).lean(); if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đề nghị.");
    await scope(actor); // Requester may trigger resume, never supply/replace approval.
    if (!["APPROVED", "APPLIED"].includes(row.status)) throw new WorkflowError(409, "INITIAL_REPORTING_STATE_CONFLICT", "Chưa có phê duyệt.");
    if (!await OnboardingReportingModel.exists({ $and: [{ _id: row._id }, await scope(actor)] })) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Ngoài phạm vi.");
    return dto(await apply(row, await principal(row.approvedBy), failpoint));
  });
}

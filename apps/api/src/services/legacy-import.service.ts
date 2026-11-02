import mongoose from "mongoose";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { z } from "zod";
import { AuthorizationStateSchema } from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { hashPassword } from "./auth.service.js";
import { resolvePrincipal, securityVersion } from "./principal.service.js";
import { withAccountSecurityLock, mutateAccountSecurity, accountAuditHead } from "./account-security.service.js";
import { resolveCanonicalContext, requireCapability } from "./authorization-scope.service.js";
import { AUTHORIZATION_POLICY } from "./authorization-policy.service.js";
import { WorkflowError, objectId } from "./project-workflow.service.js";
import { digest } from "./project-audit.service.js";
import { legacyApprovalTerms, legacyApprovalIntact, legacyApprovalBindsUser } from "./legacy-import-approval.service.js";

export interface LegacyImportOptions {
  enabled?: boolean; allowTestOnly?: boolean;
  deliverActivation?: (invitation: { token: string; userId: string; requestId: string; purpose: "LEGACY_IMPORT" }) => Promise<void>;
  failpoint?: (stage: string) => void | Promise<void>;
}
export const LegacyImportIssueSchema = z.object({ approvalId: z.string().regex(/^[a-f0-9]{24}$/i), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2000) }).strict();
const hashToken = (value: string) => createHash("sha256").update(value).digest("hex");
const unavailable = () => new WorkflowError(400, "LEGACY_ACTIVATION_INVALID", "Lời mời hết hạn, đã dùng hoặc không còn hợp lệ. Liên hệ quản trị để đối chiếu.");
function enabled(options: LegacyImportOptions) { if (options.enabled !== true) throw new WorkflowError(503, "LEGACY_IMPORT_DISABLED", "Kích hoạt dữ liệu nhập cũ chưa được bật trên máy chủ."); }
async function approval(id: string, user: any, options: LegacyImportOptions, activationWindow = true) {
  const row = await mongoose.connection.collection<any>("legacy_import_approvals").findOne({ _id: objectId(id) });
  if (!row || !legacyApprovalIntact(row) || row.status !== "APPROVED") throw new WorkflowError(403, "LEGACY_IMPORT_APPROVAL_REQUIRED", "Chưa có đủ manifest phê duyệt hiện hành.");
  const terms = legacyApprovalTerms(row);
  if (terms.targetDatabase !== mongoose.connection.name || terms.userId !== String(user._id) || terms.employeeId !== String(user.employeeId)) throw new WorkflowError(409, "LEGACY_IMPORT_IDENTITY_CONFLICT", "Manifest không khớp danh tính và database.");
  if (terms.approvalKind === "TEST_ONLY" && (options.allowTestOnly !== true || !/^test_hr_/.test(mongoose.connection.name))) throw new WorkflowError(403, "LEGACY_IMPORT_TEST_APPROVAL_DENIED", "Phê duyệt fixture chỉ có hiệu lực trên database thử nghiệm được bật riêng.");
  if (activationWindow && (Date.parse(terms.validFrom) > Date.now() || Date.parse(terms.validUntil) <= Date.now())) throw unavailable();
  return row;
}
async function targetProof(user: any, row: any) {
  if (!user.employeeId || user.provisioningRequestId || !user.legacyImportActivation && user.status != null || user.status === "active" || user.status === "disabled") throw new WorkflowError(409, "LEGACY_IMPORT_ACCOUNT_CONFLICT", "Không thay thế onboarding, mở khóa hoặc khôi phục tài khoản.");
  if (user.legacyImportActivation && (user.status !== "pending_activation" || user.legacyImportActivation.batchId !== row.batchId || !["PENDING", "DELIVERED", "FAILED", "REVOKED"].includes(user.legacyImportActivation.state))) throw new WorkflowError(409, "LEGACY_IMPORT_ACCOUNT_CONFLICT", "Tài khoản không thuộc lần nhập chờ kích hoạt này.");
  const employee = await mongoose.connection.collection<any>("employees").findOne({ _id: user.employeeId });
  if (!employee || employee.status !== "active" || String(employee.userId) !== String(user._id) || employee.lifecyclePendingRequestId || await UserModel.countDocuments({ employeeId: user.employeeId }) !== 1) throw new WorkflowError(409, "LEGACY_IMPORT_EMPLOYEE_REQUIRED", "Liên kết nhân sự chưa duy nhất/active hoặc đang bị lifecycle fence.");
  const state = AuthorizationStateSchema.safeParse(user.authorization);
  if (!state.success || state.data.profile !== row.profile || digest(state.data) !== row.authorizationHash) throw new WorkflowError(409, "LEGACY_IMPORT_PROFILE_GRANTS_CHANGED", "Profile/grants không khớp phê duyệt riêng.");
  const context = await resolveCanonicalContext(employee);
  if (row.storeIds.some((id: string) => !context.verifiedStores.some(store => store.id === id)) || !employee.storeMappingRef) throw new WorkflowError(409, "LEGACY_IMPORT_CANONICAL_SCOPE_REQUIRED", "Phạm vi canonical chưa được phê duyệt.");
  for (const grant of state.data.grants) {
    for (const cap of grant.capabilities) { const p = AUTHORIZATION_POLICY[cap]; if (!p || p.status !== "APPROVED" || !p.profiles.includes(state.data.profile) || p.scope !== grant.scope.kind) throw new WorkflowError(403, "CAPABILITY_POLICY_DENIED", "Manifest không mở nghiệp vụ đang chờ hoặc bị từ chối."); }
    if (grant.scope.kind === "organization") {
      const stores = context.verifiedStores.filter(store => grant.scope.storeIds.includes(store.id) || !!store.regionId && grant.scope.regionIds.includes(store.regionId));
      if (!stores.length || stores.some(store => !row.storeIds.includes(store.id)) || grant.scope.storeIds.some(id => !row.storeIds.includes(id))) throw new WorkflowError(403, "LEGACY_IMPORT_SCOPE_CHANGED", "Grant nằm ngoài phạm vi được duyệt.");
    }
  }
  return { employee, employeeHash: digest(employee) };
}
function invitationMetadata(user: any) { const i = user.legacyImportActivation; return { id: String(user._id), status: user.status, securityVersion: securityVersion(user), legacyImport: { id: i.id, state: i.state, expiresAt: i.expiresAt ?? null } }; }
export async function issueLegacyImport(actor: AuthenticatedUser, target: string, input: unknown, options: LegacyImportOptions = {}) {
  enabled(options); requireCapability(actor, "accounts.manage");
  if (!options.deliverActivation) throw new WorkflowError(503, "LEGACY_IMPORT_DELIVERY_REQUIRED", "Chưa có kênh gửi kích hoạt an toàn; không phát hành token.");
  const body = LegacyImportIssueSchema.safeParse(input); if (!body.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần approval ID, phiên bản và lý do hợp lệ.");
  target = String(objectId(target)); if (target === actor.userId) throw new WorkflowError(403, "SELF_AUTHORIZATION_CHANGE_DENIED", "Không tự khởi tạo kích hoạt bằng quyền quản trị của mình.");
  return withAccountSecurityLock(actor, async () => {
    const user: any = await UserModel.findById(target).lean(); if (!user) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tài khoản.");
    if (securityVersion(user) !== body.data.expectedVersion || securityVersion(user) > Number.MAX_SAFE_INTEGER - 3) throw new WorkflowError(409, "ACCOUNT_VERSION_CONFLICT", "Phiên bản đã đổi hoặc cần đối chiếu.");
    accountAuditHead(user); const row = await approval(body.data.approvalId, user, options); const proof = await targetProof(user, row);
    const token = randomBytes(32).toString("hex"), id = randomUUID(), version = securityVersion(user);
    const invitation = { id, purpose: "LEGACY_IMPORT", batchId: row.batchId, approvalId: String(row._id), approvalVersion: row.version, approvalTermsHash: row.termsHash,
      boundVersion: version + 2, issuerUserId: actor.userId, issuerVersion: actor.securityVersion, authorizationHash: digest(user.authorization), employeeHash: proof.employeeHash,
      tokenHash: hashToken(token), state: "PENDING", expiresAt: new Date(Math.min(Date.now() + 86400000, Date.parse(row.validUntil))) };
    let saved = await mutateAccountSecurity(actor, target, version, body.data.reason, { status: "pending_activation", legacyImportApprovalId: row._id, legacyImportActivation: invitation },
      { status: Object.hasOwn(user, "status") ? user.status : { $exists: false }, employeeId: user.employeeId });
    await options.failpoint?.("legacy-after-issued");
    try { await options.deliverActivation!({ token, userId: target, requestId: id, purpose: "LEGACY_IMPORT" }); }
    catch { await mutateAccountSecurity(actor, target, securityVersion(saved), "LEGACY_IMPORT_DELIVERY_FAILED", { legacyImportActivation: { ...invitation, tokenHash: null, state: "FAILED" } }, { "legacyImportActivation.id": id }); throw new WorkflowError(503, "LEGACY_IMPORT_DELIVERY_FAILED", "Chưa xác nhận gửi; tài khoản tiếp tục bị chặn."); }
    await options.failpoint?.("legacy-after-delivery");
    saved = await mutateAccountSecurity(actor, target, securityVersion(saved), "LEGACY_IMPORT_DELIVERED", { legacyImportActivation: { ...invitation, state: "DELIVERED" } }, { status: "pending_activation", "legacyImportActivation.id": id, "legacyImportActivation.state": "PENDING" });
    return invitationMetadata(saved);
  });
}
export async function completeLegacyImport(token: string, password: string, options: LegacyImportOptions = {}) {
  enabled(options);
  const rows: any[] = await UserModel.find({ "legacyImportActivation.tokenHash": hashToken(token), "legacyImportActivation.state": "DELIVERED", "legacyImportActivation.purpose": "LEGACY_IMPORT", "legacyImportActivation.expiresAt": { $gt: new Date() }, status: "pending_activation" }).limit(2).lean();
  if (rows.length !== 1) throw unavailable(); const first = rows[0];
  const issuer: any = await UserModel.findById(first.legacyImportActivation.issuerUserId).select("role").lean(); if (!issuer) throw unavailable();
  const actor = await resolvePrincipal({ sub: String(issuer._id), role: issuer.role, securityVersion: first.legacyImportActivation.issuerVersion });
  const passwordHash = await hashPassword(password); await options.failpoint?.("legacy-before-consume");
  return withAccountSecurityLock(actor, async () => {
    const user: any = await UserModel.findById(first._id).lean(), i = user?.legacyImportActivation;
    if (!i || i.state !== "DELIVERED" || i.tokenHash !== hashToken(token) || i.purpose !== "LEGACY_IMPORT" || user.status !== "pending_activation" || i.boundVersion !== securityVersion(user) || new Date(i.expiresAt).getTime() <= Date.now()) throw unavailable();
    accountAuditHead(user); if (user.securityAudit.at(-1)?.legacyImportHash !== digest(i)) throw unavailable();
    let row; try { row = await approval(String(user.legacyImportApprovalId), user, options); if (!legacyApprovalBindsUser(row, user)) throw unavailable(); const proof = await targetProof(user, row); if (proof.employeeHash !== i.employeeHash || digest(user.authorization) !== i.authorizationHash) throw unavailable(); } catch (e: any) { if ([400, 403, 409].includes(e.status)) throw unavailable(); throw e; }
    await mutateAccountSecurity(actor, String(user._id), securityVersion(user), "LEGACY_IMPORT_ACTIVATED_BY_RECIPIENT", {
      status: "active", passwordHash, mustChangePassword: false, passwordChangedAt: new Date(),
      legacyImportActivation: { id: i.id, purpose: i.purpose, batchId: i.batchId, approvalId: i.approvalId, approvalVersion: i.approvalVersion, approvalTermsHash: i.approvalTermsHash, state: "CONSUMED", consumedAt: new Date() },
    }, { status: "pending_activation", employeeId: user.employeeId, "legacyImportActivation.id": i.id, "legacyImportActivation.tokenHash": hashToken(token), "legacyImportActivation.state": "DELIVERED", "legacyImportActivation.expiresAt": { $gt: new Date() } });
  });
}
export async function revokeLegacyImport(actor: AuthenticatedUser, id: string, input: unknown, options: LegacyImportOptions = {}) {
  enabled(options); requireCapability(actor, "accounts.manage");
  const body = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) }).strict().safeParse(input);
  if (!body.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần phiên bản approval và lý do.");
  return withAccountSecurityLock(actor, async () => {
    const collection = mongoose.connection.collection<any>("legacy_import_approvals"), row = await collection.findOne({ _id: objectId(id) });
    if (!row || !legacyApprovalIntact(row) || !["APPROVED", "REVOKED"].includes(row.status) || row.version !== body.data.expectedVersion) throw new WorkflowError(409, "LEGACY_APPROVAL_VERSION_CONFLICT", "Phê duyệt không còn hiện hành.");
    if (String(row.userId) === actor.userId) throw new WorkflowError(403, "SELF_AUTHORIZATION_CHANGE_DENIED", "Không tự thay đổi phê duyệt tài khoản mình.");
    let state = { status: "REVOKED", version: row.version };
    if (row.status === "APPROVED") {
      state = { status: "REVOKED", version: row.version + 1 };
      const event = { id: randomUUID(), type: "REVOKED", actorId: actor.userId, reason: body.data.reason, at: new Date().toISOString(), termsHash: row.termsHash, stateHash: digest(state), previousHash: row.history.at(-1).hash };
      const change = await collection.updateOne({ _id: row._id, status: "APPROVED", version: row.version, termsHash: row.termsHash, history: row.history }, { $set: { ...state, history: [...row.history, { ...event, hash: digest(event) }] } }); if (change.modifiedCount !== 1) throw new WorkflowError(409, "LEGACY_APPROVAL_VERSION_CONFLICT", "Phê duyệt đã thay đổi.");
      await options.failpoint?.("legacy-after-approval-revoked");
    }
    const user: any = await UserModel.findById(row.userId).lean();
    if (user && String(user.legacyImportApprovalId) === String(row._id) && (user.status !== "disabled" || user.legacyImportActivation?.state !== "REVOKED")) await mutateAccountSecurity(actor, String(user._id), securityVersion(user), body.data.reason, { status: "disabled", legacyImportActivation: { ...user.legacyImportActivation, tokenHash: null, state: "REVOKED" } });
    return { id: String(row._id), ...state };
  });
}

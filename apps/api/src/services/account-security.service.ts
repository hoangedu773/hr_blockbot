import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { UserModel } from "../models/User.js";
import { RefreshSessionModel } from "../models/RefreshSession.js";
import { securityVersionFilter, securityVersion, resolvePrincipal } from "./principal.service.js";
import { requireCapability } from "./authorization-scope.service.js";
import { digest } from "./project-audit.service.js";
import { WorkflowError, objectId } from "./project-workflow.service.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import type { AuthorizationCapability } from "@hr-blockbot/contracts";
import { AuthorizationProfileSchema } from "@hr-blockbot/contracts";
import { withCrmWriter } from "./crm-writer.service.js";

// A crashed owner deliberately leaves a maintenance lock, NOT an automatically
// expiring lease that could let a suspended old writer race a new owner.
export async function withAccountSecurityLock<T>(actor: AuthenticatedUser, action: () => Promise<T>, capability: AuthorizationCapability = "accounts.manage"): Promise<T> {
  const collection = mongoose.connection.collection<any>("authorization_controls");
  try { await collection.updateOne({ _id: "account-security" }, { $setOnInsert: { locked: false, revision: 0 } }, { upsert: true }); }
  catch (error: any) { if (error.code !== 11000) throw error; }
  const token = randomUUID();
  const lock = await collection.findOneAndUpdate({ _id: "account-security", locked: false },
    { $set: { locked: true, token, actorId: actor.userId, at: new Date() }, $inc: { revision: 1 } }, { returnDocument: "after" });
  if (!lock) throw new WorkflowError(409, "SECURITY_CHANGE_IN_PROGRESS", "Thao tác quyền đang được xử lý; nếu process bị dừng, maintenance phải đối chiếu trước khi gỡ khóa.");
  try {
    return await withCrmWriter(async () => {
    const current = await resolvePrincipal({ sub: actor.userId, role: actor.role, securityVersion: actor.securityVersion });
    if (current.authorization?.profile !== "system_admin") throw new WorkflowError(403, "RBAC_DENIED", "Chủ thể kỹ thuật không còn hợp lệ.");
    requireCapability(current, capability);
    return await action();
    });
  } finally { await collection.updateOne({ _id: "account-security", token }, { $set: { locked: false }, $unset: { token: "", actorId: "", at: "" } }); }
}
export function accountMetadata(row: any) {
  return { id: String(row._id), username: row.username, role: row.role, status: row.status, securityVersion: row.securityVersion ?? 0,
    businessRole: null, employeeId: row.employeeId ? String(row.employeeId) : null, employeeName: null,
    isGlobalAdmin: false, mustChangePassword: row.mustChangePassword === true, profile: row.authorization?.profile ?? null,
    authorization: row.authorization ?? null,
    recovery: row.passwordRecovery ? { id: row.passwordRecovery.id, state: row.passwordRecovery.state, expiresAt: row.passwordRecovery.expiresAt ?? null } : null,
    createdAt: row.createdAt?.toISOString?.() ?? null, updatedAt: row.updatedAt?.toISOString?.() ?? null };
}
export function accountAuditHead(row: any): string {
  let previous = "0".repeat(64), chained = false;
  for (const old of row.securityAudit ?? []) {
    if (!old.hash) { if (chained) throw new WorkflowError(409, "SECURITY_AUDIT_INVALID", "Không nối sự kiện thiếu hash vào phần audit V1."); continue; }
    const { hash, ...payload } = old;
    if (payload.previousHash !== previous || digest(payload) !== hash) throw new WorkflowError(409, "SECURITY_AUDIT_INVALID", "Không ghi đè audit bị sửa.");
    previous = hash; chained = true;
  }
  return previous;
}
export function redactedSecurityAudit(row: any) {
  const snapshot = (value: any) => value && typeof value === "object" ? {
    status: ["active", "disabled", "pending_activation"].includes(value.status) ? value.status : null,
    profile: AuthorizationProfileSchema.safeParse(value.profile).success ? value.profile : null,
    securityVersion: Number.isSafeInteger(value.securityVersion) && value.securityVersion >= 0 ? value.securityVersion : null,
  } : null;
  const hex = (value: unknown) => typeof value === "string" && /^[a-f0-9]{64}$/i.test(value) ? value : null;
  let integrityValid = true;
  try { accountAuditHead(row); } catch { integrityValid = false; }
  return { integrityValid, legacyUnhashedCount: (row.securityAudit ?? []).filter((entry: any) => !entry.hash).length, items: (row.securityAudit ?? []).map((entry: any) => {
    const time = new Date(entry.at);
    return { id: typeof entry.id === "string" && /^[a-f0-9-]{36}$/i.test(entry.id) ? entry.id : null,
      actorId: typeof entry.actorId === "string" && /^[a-f0-9]{24}$/i.test(entry.actorId) ? entry.actorId : null,
      at: Number.isFinite(time.getTime()) ? time.toISOString() : null,
      type: ["SECURITY_CHANGE", "HR_LIFECYCLE_APPLIED", "ONBOARDING_PROVISIONED", "ONBOARDING_ACTIVATED"].includes(entry.type) ? entry.type : "SECURITY_CHANGE",
      before: snapshot(entry.before), after: snapshot(entry.after), hash: hex(entry.hash), previousHash: hex(entry.previousHash) };
  }) };
}
export async function mutateAccountSecurity(actor: AuthenticatedUser, targetId: string, expectedVersion: number, reason: string, changes: Record<string, any>, predicate: Record<string, any> = {}) {
  targetId = String(objectId(targetId));
  if (actor.userId === targetId) throw new WorkflowError(403, "SELF_AUTHORIZATION_CHANGE_DENIED", "Không tự cấp/thay đổi/thu hồi quyền hoặc trạng thái của mình qua quản trị.");
  const before: any = await UserModel.findById(objectId(targetId)).lean();
  if (!before) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tài khoản.");
  if (securityVersion(before) !== expectedVersion) throw new WorkflowError(409, "ACCOUNT_VERSION_CONFLICT", "Tài khoản đã thay đổi.");
  const previous = accountAuditHead(before);
  const event = { id: randomUUID(), actorId: actor.userId, at: new Date().toISOString(), reason,
    // Legacy rows may have no persisted status. BSON stores undefined nested
    // values as null; hash that exact representation before writing the event.
    before: { status: before.status ?? null, profile: before.authorization?.profile ?? null, securityVersion: expectedVersion },
    after: { status: changes.status ?? before.status ?? null, profile: changes.authorization?.profile ?? before.authorization?.profile ?? null, securityVersion: expectedVersion + 1 },
    beforeAuthorizationHash: digest(before.authorization ?? null), authorizationHash: digest(changes.authorization ?? before.authorization ?? null),
    beforeRecoveryHash: digest(before.passwordRecovery ?? null), recoveryHash: digest(changes.passwordRecovery ?? before.passwordRecovery ?? null),
    beforeLegacyImportHash: digest(before.legacyImportActivation ?? null), legacyImportHash: digest(changes.legacyImportActivation ?? before.legacyImportActivation ?? null), previousHash: previous };
  const history = [...(before.securityAudit ?? []), { ...event, hash: digest(event) }];
  if (history.length > 1000 || mongoose.mongo.BSON.calculateObjectSize({ ...before, ...changes, securityAudit: history }) > 8 * 1024 * 1024) throw new WorkflowError(409, "SECURITY_AUDIT_STORAGE_LIMIT", "Không xóa audit để mở quyền.");
  const updated: any = await UserModel.findOneAndUpdate({ _id: before._id, ...securityVersionFilter(expectedVersion), ...predicate },
    { $set: { ...changes, updatedAt: new Date(), securityAudit: history }, $inc: { securityVersion: 1 } }, { new: true, runValidators: true }).lean();
  if (!updated) throw new WorkflowError(409, "ACCOUNT_VERSION_CONFLICT", "Tài khoản đã thay đổi.");
  // Version is already authoritative even if this best-effort cleanup fails.
  try { await RefreshSessionModel.updateMany({ userId: before._id, revokedAt: null }, { $set: { revokedAt: new Date() } }); } catch { /* new requests still reject the old version */ }
  return updated;
}
export async function setAccountStatus(actor: AuthenticatedUser, target: string, status: "active" | "disabled", version: number, reason: string) {
  requireCapability(actor, "accounts.manage");
  return withAccountSecurityLock(actor, async () => {
    const row: any = await UserModel.findById(objectId(target)).lean();
    if (status === "active") {
      if (!row || row.status !== "disabled" || row.provisioningRequestId && !await mongoose.connection.collection("onboarding_requests").findOne({ _id: row.provisioningRequestId, status: "ACTIVE", userId: row._id })) {
        throw new WorkflowError(409, "ACTIVATION_WORKFLOW_REQUIRED", "Không mở tài khoản provision dở/chưa kích hoạt.");
      }
      if (row.employeeId && !await mongoose.connection.collection("employees").findOne({ _id: row.employeeId, status: "active" })) throw new WorkflowError(409, "HR_LIFECYCLE_REVIEW_REQUIRED", "Không dùng quản trị kỹ thuật để tái tuyển nhân sự.");
    }
    return accountMetadata(await mutateAccountSecurity(actor, target, version, reason, { status }));
  });
}

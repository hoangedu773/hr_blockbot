import { AuthorizationStateSchema } from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
import { EmployeeModel } from "../models/Employee.js";
import type { TokenClaims } from "./auth.service.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { resolveCanonicalContext } from "./authorization-scope.service.js";
import mongoose from "mongoose";
import { RefreshSessionModel } from "../models/RefreshSession.js";
import { legacyApprovalBindsUser } from "./legacy-import-approval.service.js";

export type PrincipalUnavailableReason = "UNAVAILABLE" | "ACCOUNT_MISSING" | "ACCOUNT_STATUS_UNREVIEWED" |
  "ACCOUNT_NOT_ACTIVE" | "PROVISIONING_NOT_ACTIVE" | "EMPLOYEE_LINK_MISSING" | "EMPLOYEE_STATUS_UNREVIEWED" |
  "EMPLOYEE_NOT_ACTIVE" | "EMPLOYEE_LINK_MISMATCH" | "LIFECYCLE_NOT_COMPLETED" |
  "SECURITY_VERSION_INVALID" | "SESSION_VERSION_MISMATCH" | "SESSION_REVOKED" | "LEGACY_IMPORT_APPROVAL_UNAVAILABLE";
export class PrincipalUnavailableError extends Error {
  status = 401;
  code = "UNAUTHENTICATED";
  // Internal diagnostic category only. Public login/token responses remain
  // deliberately generic and never serialize this reason or account details.
  constructor(readonly internalReason: PrincipalUnavailableReason = "UNAVAILABLE") { super("Account or session is unavailable"); }
}
export function securityVersion(user: { securityVersion?: number }): number {
  const version = user.securityVersion ?? 0;
  if (!Number.isSafeInteger(version) || version < 0) throw new PrincipalUnavailableError("SECURITY_VERSION_INVALID");
  return version;
}
export function securityVersionFilter(version: number) {
  return version === 0 ? { $or: [{ securityVersion: 0 }, { securityVersion: { $exists: false } }] } : { securityVersion: version };
}
export async function loadAccount(userId: string): Promise<{ user: any; employee: any }> {
  // A hydrated legacy document receives schema.status's "active" default even
  // when Mongo has no reviewed state. Validate persisted state BEFORE hydration.
  // One read keeps this check and the returned document on the same snapshot;
  // hydrate afterwards to preserve existing casting/defaults for other fields.
  const persisted = await UserModel.findById(userId).lean<{ status?: unknown; [field: string]: unknown }>();
  if (!persisted) throw new PrincipalUnavailableError("ACCOUNT_MISSING");
  if (persisted.status !== "active") throw new PrincipalUnavailableError(
    persisted.status === "disabled" || persisted.status === "pending_activation" ? "ACCOUNT_NOT_ACTIVE" : "ACCOUNT_STATUS_UNREVIEWED");
  const user = UserModel.hydrate(persisted);
  if (user.legacyImportApprovalId) {
    const approved = await mongoose.connection.collection("legacy_import_approvals").findOne({ _id: user.legacyImportApprovalId });
    if (user.legacyImportActivation?.state !== "CONSUMED" || !legacyApprovalBindsUser(approved, user) || approved?.targetDatabase !== mongoose.connection.name) throw new PrincipalUnavailableError("LEGACY_IMPORT_APPROVAL_UNAVAILABLE");
  }
  if (user.provisioningRequestId) {
    const onboarding = await mongoose.connection.collection("onboarding_requests").findOne({ _id: user.provisioningRequestId,
      userId: user._id, employeeId: user.employeeId, status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!onboarding) throw new PrincipalUnavailableError("PROVISIONING_NOT_ACTIVE");
  }
  // users.employeeId is authoritative. employees.userId is never a fallback.
  const employee = user.employeeId ? await EmployeeModel.collection.findOne({ _id: user.employeeId }) : null;
  if (user.employeeId && !employee) throw new PrincipalUnavailableError("EMPLOYEE_LINK_MISSING");
  if (employee && employee.status !== "active") throw new PrincipalUnavailableError(
    employee.status === "inactive" ? "EMPLOYEE_NOT_ACTIVE" : "EMPLOYEE_STATUS_UNREVIEWED");
  if (employee?.userId && String(employee.userId) !== String(user._id)) throw new PrincipalUnavailableError("EMPLOYEE_LINK_MISMATCH");
  const lifecyclePending = employee?.lifecyclePendingRequestId;
  if (lifecyclePending && (!/^[a-f0-9]{24}$/i.test(String(lifecyclePending)) || !await mongoose.connection.collection("employee_lifecycle_requests").findOne({ _id: new mongoose.Types.ObjectId(String(lifecyclePending)), employeeId: employee!._id, status: "COMPLETED" }, { projection: { _id: 1 } }))) throw new PrincipalUnavailableError("LIFECYCLE_NOT_COMPLETED");
  return { user, employee };
}
export async function resolvePrincipal(claims: TokenClaims, options: { delegations?: boolean } = {}): Promise<AuthenticatedUser> {
  const { user, employee } = await loadAccount(claims.sub);
  const version = securityVersion(user);
  if (claims.securityVersion !== version) throw new PrincipalUnavailableError("SESSION_VERSION_MISMATCH");
  if (claims.sid) {
    const activeSession = await RefreshSessionModel.exists({
      familyId: claims.sid,
      userId: user._id,
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });
    if (!activeSession) throw new PrincipalUnavailableError("SESSION_REVOKED");
  }
  const parsed = AuthorizationStateSchema.safeParse(user.authorization);
  const principal: AuthenticatedUser = {
    userId: String(user._id), username: user.username, role: user.role,
    employeeId: employee ? String(employee._id) : null,
    departmentId: employee?.departmentId?.toString() || employee?.department || employee?.store_raw || null,
    level: employee?.level ?? null, skills: Array.isArray(employee?.skills) ? employee.skills : [],
    mustChangePassword: user.mustChangePassword === true, isGlobalAdmin: user.isGlobalAdmin === true,
    securityVersion: version, accountActive: true, employeeActive: !!employee,
    authorization: parsed.success ? parsed.data : null,
    canonical: parsed.success && !user.mustChangePassword ? await resolveCanonicalContext(employee) : { verifiedStores: [], managedByStore: {}, ownStoreId: null },
  };
  if (options.delegations !== false && parsed.success && !user.mustChangePassword && employee) {
    const { resolveEffectiveDelegations } = await import("./delegation.service.js");
    principal.effectiveDelegations = await resolveEffectiveDelegations(principal);
  }
  return principal;
}

import { AuthorizationStateSchema } from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
import { EmployeeModel } from "../models/Employee.js";
import type { TokenClaims } from "./auth.service.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { resolveCanonicalContext } from "./authorization-scope.service.js";
import mongoose from "mongoose";

export class PrincipalUnavailableError extends Error {
  status = 401;
  code = "UNAUTHENTICATED";
  constructor() { super("Account or session is unavailable"); }
}
export function securityVersion(user: { securityVersion?: number }): number {
  const version = user.securityVersion ?? 0;
  if (!Number.isSafeInteger(version) || version < 0) throw new PrincipalUnavailableError();
  return version;
}
export function securityVersionFilter(version: number) {
  return version === 0 ? { $or: [{ securityVersion: 0 }, { securityVersion: { $exists: false } }] } : { securityVersion: version };
}
export async function loadAccount(userId: string): Promise<{ user: any; employee: any }> {
  const user = await UserModel.findById(userId);
  if (!user || user.status !== "active") throw new PrincipalUnavailableError();
  if (user.provisioningRequestId) {
    const onboarding = await mongoose.connection.collection("onboarding_requests").findOne({ _id: user.provisioningRequestId,
      userId: user._id, employeeId: user.employeeId, status: "ACTIVE" }, { projection: { _id: 1 } });
    if (!onboarding) throw new PrincipalUnavailableError();
  }
  // users.employeeId is authoritative. employees.userId is never a fallback.
  const employee = user.employeeId ? await EmployeeModel.collection.findOne({ _id: user.employeeId }) : null;
  if (user.employeeId && (!employee || employee.status !== "active" || employee.userId && String(employee.userId) !== String(user._id))) {
    throw new PrincipalUnavailableError();
  }
  const lifecyclePending = employee?.lifecyclePendingRequestId;
  if (lifecyclePending && (!/^[a-f0-9]{24}$/i.test(String(lifecyclePending)) || !await mongoose.connection.collection("employee_lifecycle_requests").findOne({ _id: new mongoose.Types.ObjectId(String(lifecyclePending)), employeeId: employee!._id, status: "COMPLETED" }, { projection: { _id: 1 } }))) throw new PrincipalUnavailableError();
  return { user, employee };
}
export async function resolvePrincipal(claims: TokenClaims, options: { delegations?: boolean } = {}): Promise<AuthenticatedUser> {
  const { user, employee } = await loadAccount(claims.sub);
  const version = securityVersion(user);
  if (claims.securityVersion !== version) throw new PrincipalUnavailableError();
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

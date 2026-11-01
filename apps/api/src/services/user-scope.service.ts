import { AuthorizationDeniedError } from "./authorization-scope.service.js";
import type { BusinessRole } from "../models/Employee.js";
/** Kept only as a fail-closed compatibility boundary; title-derived scope/cache is retired. */
export interface UserScope {
  employeeId: string | null; departmentId: string | null; storeName: string | null;
  fullName: string | null; jobTitle: string | null; businessRole: BusinessRole;
}
export async function resolveUserScope(_userId: string | null, _role: string | null): Promise<UserScope> {
  throw new AuthorizationDeniedError("LEGACY_AUTHORIZATION_DISABLED", "Resolve current principal and approved canonical scope; job titles/global flags never grant access.");
}

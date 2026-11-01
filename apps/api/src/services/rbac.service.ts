/** Retired pre-V1 guard. Call requireCapability with a current principal/resource instead. */
export interface ActorContext { userId: string; role: "Admin" | "Employee"; employeeId?: string | null; departmentId?: string | null; isGlobalAdmin?: boolean }
export interface ResourceTarget { employeeId?: string | null; userId?: string | null; departmentId?: string | null }
export class RbacDeniedError extends Error {
  readonly code = "LEGACY_AUTHORIZATION_DISABLED";
  readonly status = 403;
  constructor(message: string) { super(message); this.name = "RbacDeniedError"; }
}
export function assertInScope(_actor: ActorContext, _resource: ResourceTarget): never {
  throw new RbacDeniedError("Legacy role/global/department authorization is disabled; use the V1 capability kernel.");
}

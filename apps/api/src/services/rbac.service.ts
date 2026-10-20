export interface ActorContext {
  userId: string;
  role: "Admin" | "Employee";
  employeeId?: string | null;
  departmentId?: string | null;
}

export interface ResourceTarget {
  employeeId?: string | null;
  userId?: string | null;
  departmentId?: string | null;
}

export class RbacDeniedError extends Error {
  readonly code = "RBAC_DENIED";
  constructor(message: string) {
    super(message);
    this.name = "RbacDeniedError";
  }
}

/**
 * assertInScope: Scope Guard enforcing strict RBAC & Scope boundaries
 * - Employee: Strictly 'own' resource only. Cross-user access is denied with 403 RBAC_DENIED.
 * - Admin: Strictly within assigned departmentId scope. Unmapped or cross-scope access is denied with 403 RBAC_DENIED.
 */
export function assertInScope(actor: ActorContext, resource: ResourceTarget): void {
  if (actor.role !== "Admin" && actor.role !== "Employee") {
    throw new RbacDeniedError("Invalid actor role");
  }

  // 1. Employee ownership check
  if (actor.role === "Employee") {
    const isOwnEmployee =
      actor.employeeId &&
      resource.employeeId &&
      actor.employeeId.toString() === resource.employeeId.toString();

    const isOwnUser =
      actor.userId &&
      resource.userId &&
      actor.userId.toString() === resource.userId.toString();

    if (!isOwnEmployee && !isOwnUser) {
      throw new RbacDeniedError("Employees can only access their own profile and resources");
    }
    return;
  }

  // 2. Admin department scope check
  if (actor.role === "Admin") {
    if (!actor.departmentId || actor.departmentId.trim() === "") {
      throw new RbacDeniedError("Admin has no assigned department scope (unmapped)");
    }

    if (
      resource.departmentId &&
      resource.departmentId.toString().trim() !== actor.departmentId.toString().trim()
    ) {
      throw new RbacDeniedError("Admin cannot access resources outside assigned department scope");
    }

    return;
  }
}

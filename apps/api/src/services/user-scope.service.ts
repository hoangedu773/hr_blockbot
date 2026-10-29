/**
 * Resolve the caller's business scope (P1-7 follow-up, business roles).
 *
 * The JWT only carries `sub` + `role` ("Admin" | "Employee"). Manager authority
 * (SM / AOM / AM / PTCH) lives in the employee's `job_title`, and the chat context
 * needs the store name too. This resolves it once per user with a short TTL cache
 * so neither the socket path nor the REST path queries Mongo on every message.
 */

import { EmployeeModel, deriveBusinessRole, type BusinessRole } from "../models/Employee.js";
import { UserModel } from "../models/User.js";

export interface UserScope {
  employeeId: string | null;
  departmentId: string | null;
  storeName: string | null;
  fullName: string | null;
  jobTitle: string | null;
  businessRole: BusinessRole;
}

const TTL_MS = 60_000;
const MAX_ENTRIES = 5_000;
const cache = new Map<string, { scope: UserScope; expiresAt: number }>();

function emptyScope(role: string | null): UserScope {
  return {
    employeeId: null,
    departmentId: null,
    storeName: null,
    fullName: null,
    jobTitle: null,
    businessRole: deriveBusinessRole(null, role),
  };
}

export async function resolveUserScope(userId: string | null, role: string | null): Promise<UserScope> {
  if (!userId) return emptyScope(role);
  const now = Date.now();
  const cached = cache.get(userId);
  if (cached && cached.expiresAt > now) return cached.scope;

  let scope = emptyScope(role);
  try {
    const user = (await UserModel.findById(userId)
      .select("employeeId role")
      .lean()) as { employeeId?: unknown; role?: string } | null;
    if (user?.employeeId) {
      const employee = (await EmployeeModel.findById(user.employeeId)
        .select("departmentId job_title store_raw fullName full_name")
        .lean()) as Record<string, unknown> | null;
      if (employee) {
        scope = {
          employeeId: String(user.employeeId),
          departmentId: employee.departmentId ? String(employee.departmentId) : null,
          storeName: (employee.store_raw as string) ?? null,
          fullName: ((employee.fullName ?? employee.full_name) as string) ?? null,
          jobTitle: (employee.job_title as string) ?? null,
          businessRole: deriveBusinessRole((employee.job_title as string) ?? null, user.role ?? role),
        };
      }
    }
  } catch {
    // Resolution failure degrades to the auth-role scope; never blocks the chat.
  }

  cache.set(userId, { scope, expiresAt: now + TTL_MS });
  if (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined && oldest !== userId) cache.delete(oldest);
  }
  return scope;
}

import mongoose from "mongoose";
import type { AuthorizationCapability } from "@hr-blockbot/contracts";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { AUTHORIZATION_POLICY, activeWindow, evaluateAuthorization, type AuthorizationPrincipal, type AuthorizationResource } from "./authorization-policy.service.js";
import { scopeAllows } from "./authorization-policy.service.js";
import type { AuthorizationGrant } from "@hr-blockbot/contracts";

export class AuthorizationDeniedError extends Error {
  status = 403;
  constructor(public code = "RBAC_DENIED", message = "Capability, approved grant or canonical resource scope is missing") { super(message); }
}
export type VerifiedStore = { id: string; regionId: string | null; name: string; departmentId: string | null };
export interface CanonicalAuthorizationContext {
  verifiedStores: VerifiedStore[];
  managedByStore: Record<string, string[]>;
  ownStoreId: string | null;
}
export interface EffectiveDelegatedGrant {
  grant: AuthorizationGrant;
  managedByStore: Record<string, string[]>;
  delegationId: string;
}
const canonicalId = (value: unknown): string | null => /^[a-f0-9]{24}$/i.test(String(value ?? "")) ? String(value).toLowerCase() : null;
export function asPrincipal(user: AuthenticatedUser): AuthorizationPrincipal {
  return { ...user, employeeId: user.employeeId ?? null, securityVersion: user.securityVersion ?? 0,
    accountActive: user.accountActive === true, employeeActive: user.employeeActive === true, authorization: user.authorization ?? null };
}
export async function resolveCanonicalContext(employee: any): Promise<CanonicalAuthorizationContext> {
  // Raw collection reads deliberately do not invent mongoose defaults for old rows.
  const [stores, regions, edges] = await Promise.all([
    mongoose.connection.collection("stores").find({ kind: "outlet", status: "ACTIVE", deleted_at: null, scopeApprovalRef: { $type: "string", $ne: "" } },
      { projection: { _id: 1, store_name: 1, regionId: 1, regionApprovalRef: 1, departmentId: 1 } }).limit(10000).toArray(),
    mongoose.connection.collection("authorization_regions").find({ status: "ACTIVE", approvalRef: { $type: "string", $ne: "" } }, { projection: { _id: 1 } }).limit(1000).toArray(),
    mongoose.connection.collection("management_relations").find({ validFrom: { $lte: new Date() }, revokedAt: null, approvalRef: { $type: "string", $ne: "" },
      $or: [{ validUntil: null }, { validUntil: { $gt: new Date() } }] }, { projection: { managerEmployeeId: 1, employeeId: 1, storeId: 1 } }).limit(20000).toArray(),
  ]);
  // Truncation of a security dimension must not look like a complete, approved scope.
  if (stores.length === 10000 || regions.length === 1000 || edges.length === 20000) throw new AuthorizationDeniedError("AUTHORIZATION_MAPPING_LIMIT");
  const regionIds = new Set(regions.map((region) => String(region._id)));
  const verifiedStores = stores.map((store) => ({ id: String(store._id), name: String(store.store_name ?? ""),
    regionId: store.regionApprovalRef && regionIds.has(String(store.regionId)) ? String(store.regionId) : null,
    departmentId: canonicalId(store.departmentId) }));
  const managedByStore: Record<string, string[]> = {};
  if (employee) for (const store of verifiedStores) {
    const adjacency = new Map<string, string[]>();
    for (const edge of edges.filter((edge) => String(edge.storeId) === store.id)) {
      const parent = canonicalId(edge.managerEmployeeId), child = canonicalId(edge.employeeId);
      if (!parent || !child || parent === child) throw new AuthorizationDeniedError("INVALID_REPORTING_RELATION");
      adjacency.set(parent, [...(adjacency.get(parent) ?? []), child]);
    }
    const reached = new Set<string>();
    const visit = (id: string, path: Set<string>) => {
      if (path.has(id)) throw new AuthorizationDeniedError("REPORTING_CYCLE");
      const nextPath = new Set([...path, id]);
      for (const child of adjacency.get(id) ?? []) { if (!reached.has(child)) { visit(child, nextPath); reached.add(child); } }
    };
    visit(String(employee._id), new Set());
    managedByStore[store.id] = [...reached].filter((id) => id !== String(employee._id));
  }
  const ownStoreId = employee?.storeMappingRef && verifiedStores.some((store) => store.id === String(employee.storeId)) ? String(employee.storeId) : null;
  return { verifiedStores, managedByStore, ownStoreId };
}
export function grantsFor(user: AuthenticatedUser, capability: AuthorizationCapability) {
  const policy = AUTHORIZATION_POLICY[capability];
  if (!user.accountActive || user.mustChangePassword || !user.authorization || policy.status !== "APPROVED" || !policy.profiles.includes(user.authorization.profile)) return [];
  if (user.authorization.profile !== "system_admin" && (!user.employeeActive || !user.employeeId)) return [];
  return user.authorization.grants.filter((grant) => grant.capabilities.includes(capability) && grant.scope.kind === policy.scope && activeWindow(grant, new Date()));
}
export function effectiveGrantsFor(user: AuthenticatedUser, capability: AuthorizationCapability): AuthorizationGrant[] {
  if (!user.accountActive || !user.employeeActive || user.mustChangePassword) return grantsFor(user, capability);
  const delegated = (user.effectiveDelegations ?? []).filter((item) => item.grant.capabilities.includes(capability) && activeWindow(item.grant, new Date()));
  return [...grantsFor(user, capability), ...delegated.map((item) => item.grant)];
}
export function allowedStoreIds(user: AuthenticatedUser, capability: AuthorizationCapability): string[] {
  const ids = new Set<string>();
  for (const grant of effectiveGrantsFor(user, capability)) for (const store of user.canonical?.verifiedStores ?? []) {
    if (!grant.scope.storeIds.includes(store.id) && !(store.regionId && grant.scope.regionIds.includes(store.regionId))) continue;
    if (user.authorization?.profile === "staff" && store.id !== user.canonical?.ownStoreId) continue;
    ids.add(store.id);
  }
  return [...ids];
}
export function managedEmployeeIds(user: AuthenticatedUser, storeId: string, capability: AuthorizationCapability): string[] {
  const store = user.canonical?.verifiedStores.find((entry) => entry.id === storeId);
  if (!store) return [];
  const direct = grantsFor(user, capability).filter((grant) => grant.scope.storeIds.includes(storeId) || !!store.regionId && grant.scope.regionIds.includes(store.regionId));
  const ids = new Set((user.canonical?.managedByStore[storeId] ?? []).filter((id) => direct.some((grant) => !grant.scope.reportingEmployeeIds.length || grant.scope.reportingEmployeeIds.includes(id))));
  for (const item of user.effectiveDelegations ?? []) if (item.grant.capabilities.includes(capability) && activeWindow(item.grant, new Date())) for (const id of item.managedByStore[storeId] ?? []) ids.add(id);
  return [...ids];
}
export function hasCapability(user: AuthenticatedUser, capability: AuthorizationCapability): boolean {
  const grants = effectiveGrantsFor(user, capability);
  return AUTHORIZATION_POLICY[capability].scope === "organization" ? allowedStoreIds(user, capability).length > 0 : grants.length > 0;
}
export function requireCapability(user: AuthenticatedUser, capability: AuthorizationCapability, resource?: AuthorizationResource): void {
  if (!hasCapability(user, capability)) throw new AuthorizationDeniedError();
  if (resource) {
    const decision = evaluateAuthorization(asPrincipal(user), capability, resource);
    if (!decision.allowed) {
      const delegated = (user.effectiveDelegations ?? []).some((item) => item.grant.capabilities.includes(capability) && activeWindow(item.grant, new Date()) &&
        scopeAllows(item.grant.scope, asPrincipal(user), resource) && (!resource.employeeId || !!resource.storeId && item.managedByStore[resource.storeId]?.includes(resource.employeeId)) &&
        (!resource.requiresIndependentApproval || resource.subjectEmployeeId !== user.employeeId && resource.employeeId !== user.employeeId && resource.requesterUserId !== user.userId && !resource.conflictUserIds?.includes(user.userId)));
      if (!delegated) throw new AuthorizationDeniedError(decision.reason);
    }
    if (user.authorization?.profile === "staff" && resource.storeId && resource.storeId !== user.canonical?.ownStoreId) throw new AuthorizationDeniedError();
  }
}
export function resourceScope(user: AuthenticatedUser, value: { storeId?: unknown; storeMappingRef?: unknown; employeeId?: unknown; _id?: unknown }): AuthorizationResource {
  const store = user.canonical?.verifiedStores.find((store) => store.id === String(value.storeId));
  const employeeId = value.employeeId ? String(value.employeeId) : null;
  return { storeId: store?.id ?? null, regionId: store?.regionId ?? null,
    canonicalStoreVerified: !!store && !!value.storeMappingRef, canonicalRegionVerified: !!store?.regionId,
    employeeId, reportingVerified: !!employeeId && !!store && !!user.canonical?.managedByStore[store.id]?.includes(employeeId) };
}
export function employeeScopeQuery(user: AuthenticatedUser, capability: AuthorizationCapability, employeeField = "_id"): Record<string, any> {
  requireCapability(user, capability);
  const clauses: Record<string, any>[] = [];
  for (const grant of effectiveGrantsFor(user, capability)) {
    const stores = (user.canonical?.verifiedStores ?? []).filter((store) => (grant.scope.storeIds.includes(store.id) || !!store.regionId && grant.scope.regionIds.includes(store.regionId)) &&
      (user.authorization?.profile !== "staff" || store.id === user.canonical?.ownStoreId));
    for (const store of stores) {
      const clause: Record<string, any> = { storeId: new mongoose.Types.ObjectId(store.id), storeMappingRef: { $type: "string", $ne: "" } };
      if (grant.scope.reportingEmployeeIds.length) clause[employeeField] = { $in: grant.scope.reportingEmployeeIds.map((id) => new mongoose.Types.ObjectId(id)) };
      clauses.push(clause);
    }
  }
  return { $or: clauses.length ? clauses : [{ _id: { $in: [] } }] };
}

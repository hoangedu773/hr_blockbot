import { createHash, randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { z } from "zod";
import { AuthorizationCapabilitySchema, AuthorizationScopeSchema, AuthorizationDelegationSchema, type AuthorizationDelegation } from "@hr-blockbot/contracts";
import { AuthorizationDelegationModel } from "../models/AuthorizationDelegation.js";
import { UserModel } from "../models/User.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { resolvePrincipal, securityVersion } from "./principal.service.js";
import { asPrincipal, allowedStoreIds, grantsFor, hasCapability, requireCapability, resourceScope, type EffectiveDelegatedGrant } from "./authorization-scope.service.js";
import { workflowPage, workflowDetail, historyIntegrity } from "./workflow-page.service.js";
import { validateDelegation, delegationScopeWithin } from "./authorization-policy.service.js";
import { EmployeeModel } from "../models/Employee.js";
import { WorkflowError, objectId } from "./project-workflow.service.js";

export const DelegationCreateSchema = z.object({
  sourceGrantId: z.string().uuid(), recipientUserId: z.string().regex(/^[a-f0-9]{24}$/i),
  capabilities: z.array(AuthorizationCapabilitySchema).min(1).max(3), scope: AuthorizationScopeSchema,
  validFrom: z.string().datetime({ offset: true }), validUntil: z.string().datetime({ offset: true }),
  reason: z.string().trim().min(1).max(2000),
}).strict();
export const DelegationDecisionSchema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000), decision: z.enum(["APPROVE", "REJECT"]) }).strict();
function fail(code: string): never { throw new WorkflowError(403, code, "Ủy quyền thiếu quyền gốc, phạm vi hoặc phê duyệt độc lập hợp lệ."); }
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function checkedHistory(row: any): any[] {
  const history = row.history ?? [];
  if (!history.length || history.length > 1000) fail("DELEGATION_AUDIT_INVALID");
  let previousHash: string | null = null;
  for (const event of history) {
    const { hash, ...payload } = event;
    if (payload.previousHash !== previousHash || digest(payload) !== hash) fail("DELEGATION_AUDIT_INVALID");
    previousHash = hash;
  }
  return history;
}
function event(row: any, actor: AuthenticatedUser, to: string, reason: string) {
  const history = row.history?.length ? checkedHistory(row) : [];
  if (history.length >= 1000) throw new WorkflowError(409, "AUDIT_LIMIT", "Lịch sử đạt giới hạn; cần lưu trữ có kiểm soát.");
  const payload = { actorUserId: actor.userId, at: new Date().toISOString(), from: row.status ?? null, to, reason,
    previousHash: history.at(-1)?.hash ?? null,
    termsHash: digest({ delegationId: row.delegationId, sourceGrantId: row.sourceGrantId, delegatorUserId: String(row.delegatorUserId), recipientUserId: String(row.recipientUserId), capabilities: row.capabilities, scope: row.scope, validFrom: new Date(row.validFrom).toISOString(), validUntil: new Date(row.validUntil).toISOString() }) };
  return { ...payload, hash: digest(payload) };
}
function verifyTerms(row: any) {
  const history = checkedHistory(row);
  const expected = event({ ...row, history: [], status: null }, { userId: "verification" } as AuthenticatedUser, "VERIFY", "VERIFY").termsHash;
  if (history.some((entry: any) => entry.termsHash !== expected)) fail("DELEGATION_TERMS_TAMPERED");
  if (history.at(-1)?.to !== row.status) fail("DELEGATION_AUDIT_INVALID");
  if (["APPROVED", "REVOKED"].includes(row.status) && row.approvedByUserId) {
    const approval = history.find((entry: any) => entry.to === "APPROVED");
    if (!approval || approval.actorUserId !== String(row.approvedByUserId) || approval.at !== new Date(row.approvedAt).toISOString()) fail("DELEGATION_AUDIT_INVALID");
  }
}
async function principal(userId: unknown): Promise<AuthenticatedUser> {
  const user: any = await UserModel.findById(userId).select("securityVersion").lean();
  if (!user) fail("DELEGATION_PARTICIPANT_UNAVAILABLE");
  return resolvePrincipal({ sub: String(userId), role: "Employee", securityVersion: securityVersion(user) }, { delegations: false });
}
function policyValue(row: any): AuthorizationDelegation {
  return AuthorizationDelegationSchema.parse({ id: row.delegationId, sourceGrantId: row.sourceGrantId,
    delegatorUserId: String(row.delegatorUserId), recipientUserId: String(row.recipientUserId),
    capabilities: row.capabilities, scope: row.scope, validFrom: new Date(row.validFrom).toISOString(), validUntil: new Date(row.validUntil).toISOString(),
    approvalRef: `delegation:${row._id}`, revokedAt: row.revokedAt ? new Date(row.revokedAt).toISOString() : null,
    approvedByUserId: row.approvedByUserId ? String(row.approvedByUserId) : undefined,
    approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : undefined });
}
async function verified(row: any, recipient: AuthenticatedUser, approver: AuthenticatedUser, at = new Date()) {
  const root = await principal(row.delegatorUserId);
  const source = root.authorization?.grants.find((grant) => grant.id === row.sourceGrantId);
  if (!source || !root.employeeId || !recipient.employeeId || !approver.employeeId) fail("SOURCE_GRANT_UNAVAILABLE");
  const value = policyValue(row);
  const stores = root.canonical!.verifiedStores.filter((store) => value.scope.storeIds.includes(store.id) || !!store.regionId && value.scope.regionIds.includes(store.regionId));
  if (!stores.length || value.scope.storeIds.some((id) => !stores.some((store) => store.id === id)) || value.scope.regionIds.some((id) => !stores.some((store) => store.regionId === id))) fail("DELEGATION_MAPPING_MISSING");
  for (const capability of value.capabilities) {
    if (!grantsFor(root, capability).some((grant) => grant.id === source.id)) fail("SOURCE_CAPABILITY_UNAVAILABLE");
    for (const store of stores) {
      if (!allowedStoreIds(root, capability).includes(store.id) || !root.canonical!.managedByStore[store.id]?.includes(recipient.employeeId)) fail("RECIPIENT_NOT_MANAGED");
    }
  }
  for (const store of stores) {
    // A direct, approved edge, never a job-title/rank comparison, authorizes the independent reviewer.
    const direct = await mongoose.connection.collection("management_relations").findOne({ managerEmployeeId: objectId(approver.employeeId), employeeId: objectId(root.employeeId), storeId: objectId(store.id),
      approvalRef: { $type: "string", $ne: "" }, revokedAt: null, validFrom: { $lte: at }, $or: [{ validUntil: null }, { validUntil: { $gt: at } }] });
    if (!direct) fail("DIRECT_APPROVER_MAPPING_REQUIRED");
    requireCapability(approver, "delegations.review", { ...resourceScope(approver, { storeId: store.id, storeMappingRef: "verified-delegation", employeeId: root.employeeId }),
      requiresIndependentApproval: true, requesterUserId: root.userId, subjectEmployeeId: recipient.employeeId });
  }
  const verifiedSourceStoreIds = root.canonical!.verifiedStores.filter((store) => source!.scope.storeIds.includes(store.id) || !!store.regionId && source!.scope.regionIds.includes(store.regionId)).map((store) => store.id);
  const decision = validateDelegation(value, source!, asPrincipal(root), asPrincipal(recipient), at, { approver: asPrincipal(approver), directManagerVerified: true, verifiedSourceStoreIds });
  if (!decision.allowed) fail(decision.reason);
  const managedByStore = Object.fromEntries(stores.map((store) => [store.id, (root.canonical!.managedByStore[store.id] ?? []).filter((id) => id !== recipient.employeeId && (!value.scope.reportingEmployeeIds.length || value.scope.reportingEmployeeIds.includes(id)))]));
  return { source: source!, value, managedByStore };
}
export function delegationDto(row: any) {
  return { id: String(row._id), sourceGrantId: row.sourceGrantId, delegatorUserId: String(row.delegatorUserId), recipientUserId: String(row.recipientUserId),
    capabilities: row.capabilities, scope: { ...row.scope, storeIds: row.scope.storeIds ?? [], regionIds: row.scope.regionIds ?? [], reportingEmployeeIds: row.scope.reportingEmployeeIds ?? [] }, validFrom: row.validFrom, validUntil: row.validUntil, status: row.status, version: row.version,
    approvedByUserId: row.approvedByUserId ? String(row.approvedByUserId) : null, history: Array.isArray(row.history) ? row.history : [] };
}
export async function createDelegation(actor: AuthenticatedUser, input: unknown) {
  const parsed = DelegationCreateSchema.safeParse(input);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Thông tin ủy quyền không hợp lệ.");
  requireCapability(actor, "delegations.request");
  const body = parsed.data;
  const source = actor.authorization?.grants.find((grant) => grant.id === body.sourceGrantId);
  if (!source || body.recipientUserId === actor.userId) fail("DIRECT_SOURCE_GRANT_REQUIRED");
  const recipient = await principal(body.recipientUserId);
  // Parse only policy terms: reason is audit metadata, not authority.
  const terms = AuthorizationDelegationSchema.safeParse({ id: randomUUID(), sourceGrantId: body.sourceGrantId, delegatorUserId: actor.userId, recipientUserId: body.recipientUserId,
    capabilities: body.capabilities, scope: body.scope, validFrom: body.validFrom, validUntil: body.validUntil, approvalRef: "pending-independent-review", revokedAt: null });
  if (!terms.success) throw new WorkflowError(400, "INVALID_DELEGATION_WINDOW", "Ủy quyền phải có thời hạn không quá 14 ngày.");
  if (!recipient.employeeActive || !recipient.employeeId || !["aom", "sam", "am", "sm", "ptch"].includes(recipient.authorization?.profile ?? "")) fail("DELEGATION_PROFILE_DENIED");
  if (actor.authorization?.profile === "sm" && recipient.authorization?.profile !== "ptch" || actor.authorization?.profile === "om" && recipient.authorization?.profile !== "aom") fail("DELEGATION_PROFILE_DENIED");
  for (const capability of terms.data.capabilities) {
    if (!["projects.create", "projects.assign", "reports.review"].includes(capability) || !grantsFor(actor, capability).some((grant) => grant.id === source.id)) fail("CAPABILITY_NOT_DELEGABLE");
    const stores = allowedStoreIds(actor, capability).filter((id) => body.scope.storeIds.includes(id) || actor.canonical!.verifiedStores.some((store) => store.id === id && !!store.regionId && body.scope.regionIds.includes(store.regionId)));
    if (!stores.length || stores.some((id) => !actor.canonical!.managedByStore[id]?.includes(recipient.employeeId!))) fail("RECIPIENT_NOT_MANAGED");
  }
  const verifiedSourceStoreIds = actor.canonical!.verifiedStores.filter((store) => source.scope.storeIds.includes(store.id) || !!store.regionId && source.scope.regionIds.includes(store.regionId)).map((store) => store.id);
  if (!delegationScopeWithin(body.scope, source.scope, verifiedSourceStoreIds)) fail("DELEGATION_SCOPE_EXCEEDED");
  if (Date.parse(body.validFrom) < Date.parse(source.validFrom) || source.validUntil && Date.parse(body.validUntil) > Date.parse(source.validUntil) || Date.parse(body.validUntil) <= Date.now()) fail("DELEGATION_WINDOW_EXCEEDED");
  const row: any = { ...body, delegationId: terms.data.id, delegatorUserId: objectId(actor.userId), recipientUserId: objectId(body.recipientUserId), validFrom: new Date(body.validFrom), validUntil: new Date(body.validUntil), status: "PENDING", version: 1, history: [] };
  row.history = [event({ ...row, status: null }, actor, "PENDING", body.reason)];
  return AuthorizationDelegationModel.create(row);
}
export async function reviewDelegation(actor: AuthenticatedUser, id: string, input: unknown) {
  const body = DelegationDecisionSchema.safeParse(input);
  if (!body.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Quyết định hoặc phiên bản không hợp lệ.");
  const row: any = await AuthorizationDelegationModel.findById(objectId(id)).lean();
  if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đề nghị.");
  verifyTerms(row);
  if (row.status !== "PENDING" || row.version !== body.data.expectedVersion) throw new WorkflowError(409, "DELEGATION_VERSION_CONFLICT", "Đề nghị đã thay đổi.");
  const recipient = await principal(row.recipientUserId);
  const approvedAt = new Date();
  const approved = { ...row, approvedByUserId: objectId(actor.userId), approvedAt };
  await verified(approved, recipient, actor, new Date(Math.max(Date.now(), new Date(row.validFrom).getTime())));
  const status = body.data.decision === "APPROVE" ? "APPROVED" : "REJECTED";
  const audit = event(row, actor, status, body.data.reason);
  approvedAt.setTime(Date.parse(audit.at));
  const updated = await AuthorizationDelegationModel.findOneAndUpdate({ _id: row._id, version: row.version, status: "PENDING" }, { $set: { status, approvedByUserId: approved.approvedByUserId, approvedAt }, $inc: { version: 1 }, $push: { history: audit } }, { new: true });
  if (!updated) throw new WorkflowError(409, "DELEGATION_VERSION_CONFLICT", "Đề nghị đã được xử lý đồng thời.");
  return updated;
}
export async function revokeDelegation(actor: AuthenticatedUser, id: string, expectedVersion: number, reason: string) {
  const row: any = await AuthorizationDelegationModel.findById(objectId(id)).lean();
  if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy đề nghị.");
  verifyTerms(row);
  if (actor.userId !== String(row.delegatorUserId) && actor.userId !== String(row.approvedByUserId)) fail("DELEGATION_REVOKE_DENIED");
  requireCapability(actor, actor.userId === String(row.delegatorUserId) ? "delegations.request" : "delegations.review");
  if (!["APPROVED", "PENDING"].includes(row.status)) throw new WorkflowError(409, "DELEGATION_STATE_CONFLICT", "Ủy quyền không còn hiệu lực.");
  const updated = await AuthorizationDelegationModel.findOneAndUpdate({ _id: row._id, version: expectedVersion, status: row.status }, { $set: { status: "REVOKED", revokedAt: new Date() }, $inc: { version: 1 }, $push: { history: event(row, actor, "REVOKED", reason) } }, { new: true });
  if (!updated) throw new WorkflowError(409, "DELEGATION_VERSION_CONFLICT", "Ủy quyền đã thay đổi.");
  return updated;
}
export async function resolveEffectiveDelegations(recipient: AuthenticatedUser): Promise<EffectiveDelegatedGrant[]> {
  const rows = await AuthorizationDelegationModel.find({ recipientUserId: recipient.userId, status: "APPROVED", revokedAt: null, validFrom: { $lte: new Date() }, validUntil: { $gt: new Date() } }).limit(101).lean();
  if (rows.length > 100) fail("DELEGATION_LIMIT");
  const effective: EffectiveDelegatedGrant[] = [];
  for (const row of rows as any[]) {
    try {
      verifyTerms(row);
      const approver = await principal(row.approvedByUserId);
      const result = await verified(row, recipient, approver);
      effective.push({ delegationId: String(row._id), managedByStore: result.managedByStore, grant: { ...result.source, id: result.value.id, profile: recipient.authorization!.profile, capabilities: result.value.capabilities,
        scope: result.value.scope, validFrom: result.value.validFrom, validUntil: result.value.validUntil, approvalRef: result.value.approvalRef } });
    } catch (error) {
      // Revoked/disabled/missing participants invalidate authority, never fall back to a legacy role.
      if (error instanceof WorkflowError || (error as any)?.status === 401 || (error as any)?.status === 403 || error instanceof z.ZodError) continue;
      throw error;
    }
  }
  return effective;
}
async function delegationHistoryScope(actor: AuthenticatedUser) {
  const stores = allowedStoreIds(actor, "delegations.review");
  const clauses: any[] = hasCapability(actor, "authorization.inspect_self") ? [{ delegatorUserId: objectId(actor.userId) }, { recipientUserId: objectId(actor.userId) }] : [];
  if (!clauses.length && !stores.length) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có quyền truy hồi lịch sử ủy quyền.");
  const managed = [...new Set(stores.flatMap((id) => actor.canonical?.managedByStore[id] ?? []))];
  const sources: any[] = await UserModel.find({ employeeId: { $in: managed.map(objectId) } }).select("_id employeeId").limit(20001).lean();
  if (sources.length > 20000) throw new WorkflowError(409, "AUTHORIZATION_SCOPE_LIMIT", "Phạm vi cần được đối chiếu trước khi truy hồi.");
  // Group source identities with the same reviewed store set. Mongo applies all
  // scope intersections BEFORE pagination/count, including whole region scopes.
  const groups = new Map<string, { ids: any[]; stores: string[]; regions: string[] }>();
  for (const source of sources) {
    const validStores = stores.filter((id) => actor.canonical?.managedByStore[id]?.includes(String(source.employeeId))).sort();
    const regions = [...new Set((actor.canonical?.verifiedStores ?? []).flatMap((store) => store.regionId ? [store.regionId] : []))].filter((region) => {
      const locations = actor.canonical!.verifiedStores.filter((store) => store.regionId === region);
      return locations.length > 0 && locations.every((store) => validStores.includes(store.id));
    }).sort();
    const key = JSON.stringify([validStores, regions]);
    if (!groups.has(key)) groups.set(key, { ids: [], stores: validStores, regions });
    groups.get(key)!.ids.push(source._id);
  }
  for (const group of groups.values()) clauses.push({ delegatorUserId: { $in: group.ids }, "scope.kind": "organization", $and: [
    { $or: [{ "scope.storeIds": { $exists: false } }, { "scope.storeIds": { $type: "array", $not: { $elemMatch: { $nin: group.stores } } } }] },
    { $or: [{ "scope.regionIds": { $exists: false } }, { "scope.regionIds": { $type: "array", $not: { $elemMatch: { $nin: group.regions } } } }] },
    { $or: [{ "scope.storeIds.0": { $exists: true } }, { "scope.regionIds.0": { $exists: true } }] },
  ] });
  return { $or: clauses.length ? clauses : [{ _id: { $exists: false } }] };
}
export async function pageDelegations(actor: AuthenticatedUser, query: unknown = {}) { return workflowPage(AuthorizationDelegationModel, await delegationHistoryScope(actor), query, delegationDto); }
export async function listDelegations(actor: AuthenticatedUser) { return (await pageDelegations(actor)).items; }
export async function getDelegation(actor: AuthenticatedUser, id: string) { return workflowDetail(AuthorizationDelegationModel, await delegationHistoryScope(actor), id, (row) => ({ ...delegationDto(row), auditIntegrity: historyIntegrity(row, verifyTerms) })); }
export async function delegationRecipients(actor: AuthenticatedUser, storeId: string) {
  requireCapability(actor, "delegations.request", resourceScope(actor, { storeId, storeMappingRef: "verified" }));
  const managed = actor.canonical?.managedByStore[storeId] ?? [];
  const profiles = actor.authorization?.profile === "sm" ? ["ptch"] : actor.authorization?.profile === "om" ? ["aom"] : ["aom", "sam", "am", "sm", "ptch"];
  const employees: any[] = await EmployeeModel.find({ _id: { $in: managed.map(objectId) }, status: "active" }).select("fullName full_name userId").limit(100).lean();
  const users: any[] = await UserModel.find({ employeeId: { $in: employees.map((row) => row._id) }, status: "active", mustChangePassword: false, "authorization.profile": { $in: profiles } }).select("employeeId authorization.profile").lean();
  return users.flatMap((user) => { const employee = employees.find((row) => String(row._id) === String(user.employeeId) && (!row.userId || String(row.userId) === String(user._id))); return employee ? [{ userId: String(user._id), employeeId: String(employee._id), fullName: employee.fullName || employee.full_name || "", profile: user.authorization.profile }] : []; });
}

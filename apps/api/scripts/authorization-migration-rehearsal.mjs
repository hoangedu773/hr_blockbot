/** Local rehearsal ONLY. Never accepts a URI/connection, loads dotenv, or opens Atlas.
 * A reviewed explicit manifest is applied exclusively to a newly owned memory Mongo.
 * No automatic title/name/department -> grant or canonical mapping conversion.
 */
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { AuthorizationStateSchema, GutaGradeSchema } from '@hr-blockbot/contracts';
import { AUTHORIZATION_POLICY } from '../dist/services/authorization-policy.service.js';
import { digest, auditEntry, verifyProjectAudit, assertAssignmentConsistency } from '../dist/services/project-audit.service.js';
import { auditAuthorizationSnapshot } from './authorization-dry-run.mjs';
const { MongoClient, ObjectId, BSON } = mongoose.mongo;
const Id = z.string().regex(/^[a-f0-9]{24}$/i).transform((id) => id.toLowerCase());
const base = { id: Id, beforeDigest: z.string().regex(/^[a-f0-9]{64}$/).nullable() };
const proof = z.string().trim().min(1).max(200);
const schemas = [
  z.object({ ...base, collection: z.literal('users'), changes: z.object({ employeeId: Id.nullable().optional(), status: z.enum(['active', 'disabled']).optional(), securityVersion: z.number().int().nonnegative().optional(), authorization: AuthorizationStateSchema.optional() }).strict() }).strict(),
  z.object({ ...base, collection: z.literal('employees'), changes: z.object({ storeId: Id.optional(), storeMappingRef: proof.optional(), departmentId: Id.optional(), gutaGrade: GutaGradeSchema.nullable().optional() }).strict() }).strict(),
  z.object({ ...base, collection: z.literal('stores'), changes: z.object({ departmentId: Id.optional(), regionId: Id.optional(), regionApprovalRef: proof.optional(), scopeApprovalRef: proof.optional(), kind: z.enum(['outlet', 'group', 'support']).optional(), status: z.enum(['ACTIVE', 'INACTIVE']).optional() }).strict() }).strict(),
  z.object({ ...base, collection: z.literal('authorization_regions'), changes: z.object({ code: z.string().min(1).max(100), name: z.string().min(1).max(200), status: z.enum(['ACTIVE', 'INACTIVE']), approvalRef: proof, version: z.number().int().positive() }).strict() }).strict(),
  z.object({ ...base, collection: z.literal('management_relations'), changes: z.object({ managerEmployeeId: Id, employeeId: Id, storeId: Id, approvalRef: proof, version: z.number().int().positive(), validFrom: z.string().datetime({ offset: true }), validUntil: z.string().datetime({ offset: true }).nullable(), revokedAt: z.string().datetime({ offset: true }).nullable() }).strict() }).strict(),
  z.object({ ...base, collection: z.literal('projects'), changes: z.object({ storeId: Id, storeMappingRef: proof }).strict() }).strict(),
];
const Manifest = z.object({ schemaVersion: z.literal(1), id: z.string().uuid(), approvalRef: proof, reviewedByUserId: Id, reason: z.string().trim().min(1).max(2000), entries: z.array(z.discriminatedUnion('collection', schemas)).min(1).max(10000) }).strict();
const clone = (value) => BSON.EJSON.deserialize(BSON.EJSON.serialize(value));
const key = (row) => String(row._id);
const changedFields = (collection, input) => Object.fromEntries(Object.entries(input).map(([field, value]) => [field,
  ['employeeId', 'storeId', 'departmentId', 'regionId', 'managerEmployeeId'].includes(field) && value !== null ? new ObjectId(value) : ['validFrom', 'validUntil', 'revokedAt'].includes(field) && collection === 'management_relations' && value !== null ? new Date(value) : clone(value)]));
const sizeCheck = (row) => { if ((row.authorizationMigrationHistory?.length ?? 0) > 1000 || BSON.calculateObjectSize(row) > 8 * 1024 * 1024) throw new Error('MIGRATION_DOCUMENT_LIMIT'); };

function validatePreview(preview) {
  const stores = new Map(preview.stores.map((row) => [key(row), row])), employees = new Map(preview.employees.map((row) => [key(row), row]));
  const departments = new Set(preview.departments.map(key)), regions = new Map(preview.authorization_regions.map((row) => [key(row), row]));
  const validStore = (id) => { const row = stores.get(String(id)); if (!row || row.kind !== 'outlet' || row.status !== 'ACTIVE' || row.deleted_at || !row.scopeApprovalRef || !departments.has(String(row.departmentId))) throw new Error('CANONICAL_STORE_OR_DEPARTMENT_REQUIRED'); return row; };
  const linked = new Set();
  for (const employee of preview.employees) if (employee.storeMappingRef) validStore(employee.storeId);
  for (const user of preview.users) {
    if (user.employeeId) { if (linked.has(String(user.employeeId))) throw new Error('DUPLICATE_CANONICAL_EMPLOYEE_LINK'); linked.add(String(user.employeeId)); }
    if (!user.authorization) continue;
    const state = AuthorizationStateSchema.parse(user.authorization), employee = employees.get(String(user.employeeId));
    if (state.profile !== 'system_admin' && (!employee || employee.status !== 'active' || employee.userId && String(employee.userId) !== key(user))) throw new Error('CANONICAL_EMPLOYEE_REQUIRED');
    for (const grant of state.grants) {
      if (grant.capabilities.some((capability) => AUTHORIZATION_POLICY[capability].status !== 'APPROVED' || !AUTHORIZATION_POLICY[capability].profiles.includes(state.profile) || AUTHORIZATION_POLICY[capability].scope !== grant.scope.kind)) throw new Error('UNAPPROVED_MIGRATION_CAPABILITY');
      for (const id of grant.scope.storeIds) validStore(id);
      for (const id of grant.scope.regionIds) if (!regions.get(id)?.approvalRef || regions.get(id)?.status !== 'ACTIVE') throw new Error('UNVERIFIED_REGION');
      for (const id of grant.scope.reportingEmployeeIds) if (!employees.has(id)) throw new Error('REPORTING_SUBJECT_ORPHAN');
      if (state.profile === 'staff' && grant.scope.kind === 'organization' && (grant.scope.regionIds.length || grant.scope.storeIds.some((id) => id !== String(employee.storeId)))) throw new Error('STAFF_SCOPE_EXCEEDED');
    }
  }
  for (const store of stores.values()) if (store.regionId && (!store.regionApprovalRef || !regions.get(String(store.regionId))?.approvalRef)) throw new Error('UNVERIFIED_STORE_REGION');
  const graph = new Map();
  for (const edge of preview.management_relations) {
    validStore(edge.storeId);
    if (!employees.has(String(edge.managerEmployeeId)) || !employees.has(String(edge.employeeId)) || !edge.approvalRef || String(edge.managerEmployeeId) === String(edge.employeeId) || edge.validUntil && new Date(edge.validUntil) <= new Date(edge.validFrom)) throw new Error('INVALID_REPORTING_RELATION');
    if (edge.revokedAt) continue;
    const parent = String(edge.storeId) + '/' + String(edge.managerEmployeeId), child = String(edge.storeId) + '/' + String(edge.employeeId);
    graph.set(parent, [...(graph.get(parent) ?? []), child]);
  }
  const done = new Set();
  const visit = (node, path) => { if (path.has(node)) throw new Error('REPORTING_CYCLE'); if (done.has(node)) return; for (const child of graph.get(node) ?? []) visit(child, new Set([...path, node])); done.add(node); };
  for (const node of graph.keys()) visit(node, new Set());
  for (const project of preview.projects) if (project.storeMappingRef) validStore(project.storeId);
}
export function buildMigrationPlan(snapshot, input) {
  const manifest = Manifest.parse(input);
  const collections = ['users', 'employees', 'stores', 'departments', 'authorization_regions', 'management_relations', 'projects'];
  const preview = Object.fromEntries(collections.map((name) => [name, clone(snapshot[name] ?? [])]));
  for (const name of ['users', 'employees', 'stores', 'departments']) if (!Array.isArray(snapshot[name])) throw new Error('SNAPSHOT_ARRAY_REQUIRED');
  const duplicate = new Set(), plans = [];
  for (const entry of manifest.entries) {
    const identity = entry.collection + '/' + entry.id;
    if (duplicate.has(identity)) throw new Error('DUPLICATE_MANIFEST_TARGET'); duplicate.add(identity);
    const rows = preview[entry.collection], before = rows.find((row) => key(row) === entry.id) ?? null;
    if (entry.beforeDigest === null ? before !== null || !['authorization_regions', 'management_relations'].includes(entry.collection) : !before || digest(before) !== entry.beforeDigest) throw new Error('MIGRATION_PREIMAGE_CONFLICT');
    if (!Object.keys(entry.changes).length) throw new Error('EMPTY_MIGRATION_CHANGE');
    if (entry.collection === 'users' && (entry.changes.status === 'active' && before.provisioningRequestId || entry.changes.securityVersion !== (before.securityVersion ?? 0) + 1)) throw new Error('MIGRATION_SECURITY_REVISION_REQUIRED');
    const changes = changedFields(entry.collection, entry.changes), after = { ...before, ...changes, _id: new ObjectId(entry.id) };
    const receipt = { manifestId: manifest.id, approvalRef: manifest.approvalRef, actorId: manifest.reviewedByUserId, at: new Date().toISOString(), reason: manifest.reason, beforeDigest: before ? digest(before) : null, changedFields: Object.keys(changes) };
    after.authorizationMigrationHistory = [...(before?.authorizationMigrationHistory ?? []), receipt];
    if (entry.collection === 'projects') {
      if (!verifyProjectAudit(before)) throw new Error('PROJECT_AUDIT_INVALID'); assertAssignmentConsistency(before);
      after.version = (before.version ?? 1) + 1; after.auditRequired = true;
      after.assignmentAudit = [...(before.assignmentAudit ?? []), auditEntry(before, after, { userId: manifest.reviewedByUserId }, 'CANONICAL_SCOPE_MAPPED', manifest.reason, { approvalRef: manifest.approvalRef, manifestId: manifest.id })];
      if (!verifyProjectAudit(after)) throw new Error('MIGRATED_PROJECT_AUDIT_INVALID');
    }
    sizeCheck(after); plans.push({ entry, before, after });
    if (before) rows[rows.findIndex((row) => key(row) === entry.id)] = after; else rows.push(after);
  }
  validatePreview(preview);
  return { manifest, plans, preview, findings: auditAuthorizationSnapshot(snapshot) };
}
export async function rehearseAuthorizationMigration(snapshot, input, { apply = false, rollback = false } = {}) {
  // Ownership is by construction, not just a test_ name on somebody else's database.
  const plan = buildMigrationPlan(snapshot, input), owned = await MongoMemoryServer.create();
  const client = new MongoClient(owned.getUri('test_authorization_migration_' + randomUUID().replaceAll('-', '')));
  let applied = 0, rolledBack = 0;
  try {
    await client.connect(); const db = client.db();
    for (const [name, rows] of Object.entries(snapshot)) if (Array.isArray(rows) && ['users', 'employees', 'stores', 'departments', 'authorization_regions', 'management_relations', 'projects'].includes(name) && rows.length) await db.collection(name).insertMany(clone(rows));
    if (apply) for (const patch of plan.plans) {
      const collection = db.collection(patch.entry.collection), id = new ObjectId(patch.entry.id), row = await collection.findOne({ _id: id });
      if (digest(row) !== digest(patch.before)) throw new Error('MIGRATION_PREIMAGE_CONFLICT');
      if (row) {
        const result = await collection.replaceOne({ _id: id, $expr: { $eq: ['$$ROOT', { $literal: row }] } }, patch.after);
        if (result.modifiedCount !== 1) throw new Error('MIGRATION_CAS_CONFLICT');
      } else await collection.insertOne(patch.after);
      applied++;
    }
    if (apply && rollback) for (const patch of [...plan.plans].reverse()) {
      const collection = db.collection(patch.entry.collection), row = await collection.findOne({ _id: new ObjectId(patch.entry.id) });
      if (digest(row) !== digest(patch.after)) throw new Error('ROLLBACK_POSTIMAGE_CONFLICT');
      const next = { ...row };
      if (patch.before) for (const field of Object.keys(patch.entry.changes)) { if (Object.hasOwn(patch.before, field)) next[field] = clone(patch.before[field]); else delete next[field]; }
      else if (patch.entry.collection === 'management_relations') next.revokedAt = new Date(); else next.status = 'INACTIVE';
      next.authorizationMigrationHistory = [...row.authorizationMigrationHistory, { manifestId: plan.manifest.id, actorId: plan.manifest.reviewedByUserId, at: new Date().toISOString(), reason: 'Compensating rollback rehearsal; history retained', beforeDigest: digest(row), changedFields: Object.keys(patch.entry.changes) }];
      if (patch.entry.collection === 'users') next.securityVersion = row.securityVersion + 1; // never revive an old token/version
      if (patch.entry.collection === 'projects') {
        next.version = row.version + 1; next.assignmentAudit = [...row.assignmentAudit, auditEntry(row, next, { userId: plan.manifest.reviewedByUserId }, 'CANONICAL_SCOPE_MAPPING_REVERTED', 'Compensating rollback; previous hashes are immutable')];
        if (!verifyProjectAudit(next)) throw new Error('ROLLBACK_AUDIT_INVALID');
      }
      sizeCheck(next); const result = await collection.replaceOne({ _id: row._id, $expr: { $eq: ['$$ROOT', { $literal: row }] } }, next);
      if (result.modifiedCount !== 1) throw new Error('ROLLBACK_CAS_CONFLICT'); rolledBack++;
    }
    let preservedRawFields = true, preservedAuditPrefix = true;
    for (const patch of plan.plans) if (patch.before) {
      const row = await db.collection(patch.entry.collection).findOne({ _id: patch.before._id });
      const mutable = new Set([...Object.keys(patch.entry.changes), 'authorizationMigrationHistory', ...(patch.entry.collection === 'projects' ? ['version', 'auditRequired', 'assignmentAudit'] : [])]);
      for (const field of Object.keys(patch.before)) if (!mutable.has(field) && digest(row[field]) !== digest(patch.before[field])) preservedRawFields = false;
      if (patch.entry.collection === 'projects') preservedAuditPrefix &&= digest(row.assignmentAudit?.slice(0, patch.before.assignmentAudit?.length ?? 0) ?? []) === digest(patch.before.assignmentAudit ?? []);
    }
    if (!preservedRawFields || !preservedAuditPrefix) throw new Error('SOURCE_OR_AUDIT_PRESERVATION_FAILED');
    return { mode: apply ? 'OWNED_DATABASE_REHEARSAL' : 'DRY_RUN', externalDatabaseWrites: 0, planned: plan.plans.length, applied, compensatingRollbacks: rolledBack, preservedRawFields, preservedAuditPrefix,
      manifestDigest: digest(plan.manifest), findings: plan.findings, productionApplyAvailable: false };
  } finally { await client.close(); await owned.stop(); }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length < 4 || args[0] !== '--snapshot' || args[2] !== '--manifest' || args.some((arg) => /^(mongodb|https?):/i.test(arg)) || args.slice(4).some((arg) => !['--apply-owned', '--rollback-owned'].includes(arg))) throw new Error('Only local --snapshot <json> --manifest <json> [--apply-owned] [--rollback-owned]; no external target accepted');
  const snapshot = BSON.EJSON.deserialize(JSON.parse(await readFile(args[1], 'utf8'))), manifest = JSON.parse(await readFile(args[3], 'utf8'));
  console.log(JSON.stringify(await rehearseAuthorizationMigration(snapshot, manifest, { apply: args.includes('--apply-owned'), rollback: args.includes('--rollback-owned') }), null, 2));
}

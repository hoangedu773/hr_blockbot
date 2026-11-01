import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { buildMigrationPlan, rehearseAuthorizationMigration } from '../scripts/authorization-migration-rehearsal.mjs';
import { digest } from '../dist/services/project-audit.service.js';
import { testGrant } from './helpers/authorization-v1-fixture.mjs';
const oid = () => new mongoose.Types.ObjectId();
function fixture() {
  const userId = oid(), employeeId = oid(), storeId = oid(), departmentId = oid(), regionId = oid(), projectId = oid();
  const snapshot = {
    users: [{ _id: userId, username: 'isolated-migration-staff', role: 'Admin', isGlobalAdmin: true, employeeId, passwordHash: 'DO_NOT_OUTPUT_PASSWORD_HASH', securityVersion: 0 }],
    employees: [{ _id: employeeId, userId, full_name: 'DO_NOT_OUTPUT_FULLNAME', status: 'active', departmentId, store_raw: 'Duplicated legacy label', job_title: 'OM', bank_account_number: 'DO_NOT_OUTPUT_BANK' }],
    stores: [{ _id: storeId, store_name: 'Duplicated legacy label' }], departments: [{ _id: departmentId, code: 'ISOLATED' }],
    projects: [{ _id: projectId, title: 'Legacy task unchanged', departmentId, createdBy: userId, assigneeId: employeeId, status: 'ASSIGNED', progress: 0, version: 1 }],
  };
  const entry = (collection, row, changes) => ({ collection, id: String(row._id), beforeDigest: digest(row), changes });
  const manifest = { schemaVersion: 1, id: randomUUID(), approvalRef: 'isolated-owner-reviewed-mapping', reviewedByUserId: String(userId), reason: 'Explicit synthetic mapping, no title-derived grants', entries: [
    { collection: 'authorization_regions', id: String(regionId), beforeDigest: null, changes: { code: 'TEST-REGION', name: 'Isolated region', status: 'ACTIVE', approvalRef: 'isolated-region-approval', version: 1 } },
    entry('stores', snapshot.stores[0], { kind: 'outlet', status: 'ACTIVE', scopeApprovalRef: 'isolated-store-approval', departmentId: String(departmentId), regionId: String(regionId), regionApprovalRef: 'isolated-region-link' }),
    entry('employees', snapshot.employees[0], { storeId: String(storeId), storeMappingRef: 'isolated-employee-store-approval' }),
    entry('users', snapshot.users[0], { status: 'active', securityVersion: 1, authorization: { schemaVersion: 1, profile: 'staff', grants: [testGrant('staff', { kind: 'self' }, ['authorization.inspect_self', 'profile.read_self'], userId), testGrant('staff', { kind: 'organization', storeIds: [String(storeId)] }, ['directory.read_store'], userId)] } }),
    entry('projects', snapshot.projects[0], { storeId: String(storeId), storeMappingRef: 'isolated-historical-project-approval' }),
  ] };
  return { snapshot, manifest };
}
test('dry-run never mutates source or infers profile from OM/Admin/duplicated store labels; output omits PII', async () => {
  const { snapshot, manifest } = fixture(), before = digest(snapshot);
  const report = await rehearseAuthorizationMigration(snapshot, manifest);
  assert.equal(report.mode, 'DRY_RUN'); assert.equal(report.applied, 0); assert.equal(report.externalDatabaseWrites, 0); assert.equal(report.productionApplyAvailable, false);
  assert.equal(digest(snapshot), before); assert.doesNotMatch(JSON.stringify(report), /DO_NOT_OUTPUT|Duplicated legacy label/);
  const plan = buildMigrationPlan(snapshot, manifest); assert.equal(plan.preview.users[0].authorization.profile, 'staff'); assert.equal(plan.preview.employees[0].job_title, 'OM');
});
test('owned Mongo rehearsal applies explicit mapping with CAS and compensating rollback; raw fields and audit prefix survive', async () => {
  const { snapshot, manifest } = fixture();
  const report = await rehearseAuthorizationMigration(snapshot, manifest, { apply: true, rollback: true });
  assert.equal(report.applied, 5); assert.equal(report.compensatingRollbacks, 5); assert.equal(report.externalDatabaseWrites, 0); assert.equal(report.preservedRawFields, true); assert.equal(report.preservedAuditPrefix, true);
});
test('wrong preimage, missing canonical mapping, mass assignment and unapproved capabilities fail before writes', () => {
  const { snapshot, manifest } = fixture();
  const broken = structuredClone(manifest); broken.entries[1].beforeDigest = '0'.repeat(64); assert.throws(() => buildMigrationPlan(snapshot, broken), /PREIMAGE_CONFLICT/);
  const sourceField = structuredClone(manifest); sourceField.entries[2].changes.bank_account_number = 'overwrite'; assert.throws(() => buildMigrationPlan(snapshot, sourceField));
  const privilege = structuredClone(manifest); privilege.entries[3].changes.authorization.grants[0].capabilities.push('accounts.manage'); assert.throws(() => buildMigrationPlan(snapshot, privilege), /UNAPPROVED_MIGRATION_CAPABILITY/);
  const missing = structuredClone(manifest); missing.entries[2].changes.storeId = 'f'.repeat(24); assert.throws(() => buildMigrationPlan(snapshot, missing), /CANONICAL_STORE/);
  const duplicate = structuredClone(manifest); duplicate.entries.push(duplicate.entries[2]); assert.throws(() => buildMigrationPlan(snapshot, duplicate), /DUPLICATE_MANIFEST_TARGET/);
});

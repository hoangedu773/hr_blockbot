import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { AuthorizationProfileSchema, AuthorizationStateSchema, AuthorizationGrantSchema, AuthorizationDelegationSchema } from '@hr-blockbot/contracts';
import { evaluateAuthorization, scopeAllows, validateDelegation, AUTHORIZATION_POLICY } from '../dist/services/authorization-policy.service.js';
import { auditAuthorizationSnapshot } from '../scripts/authorization-dry-run.mjs';

const id = (n) => n.toString(16).padStart(24, '0');
const now = new Date('2026-10-31T12:00:00Z');
const grant = (profile, scope = { kind: 'self' }) => AuthorizationGrantSchema.parse({
  id: randomUUID(), profile, scope, approvalRef: 'isolated-fixture-approval', grantedBy: id(99),
  capabilities: scope.kind === 'system' ? ['accounts.manage'] : scope.kind === 'organization' ? ['projects.assign'] : ['authorization.inspect_self', 'profile.read_self', ...(profile === 'system_admin' ? [] : ['projects.execute'])],
  grantedAt: '2026-10-01T00:00:00Z', validFrom: '2026-10-01T00:00:00Z', validUntil: '2026-11-01T00:00:00Z', revokedAt: null,
});
const principal = (profile) => ({
  userId: id(1), employeeId: id(2), role: profile === 'system_admin' ? 'Admin' : 'Employee',
  isGlobalAdmin: profile === 'system_admin', employeeActive: true, accountActive: true, securityVersion: 0, mustChangePassword: false,
  authorization: { schemaVersion: 1, profile, grants: [grant(profile), ...(profile === 'system_admin' ? [grant(profile, { kind: 'system' })] : [])] },
});

test('all nine software profiles: explicit self inspection, technical separation and no self review', () => {
  assert.equal(AuthorizationProfileSchema.options.length, 9);
  for (const profile of AuthorizationProfileSchema.options) {
    const actor = principal(profile);
    assert.equal(evaluateAuthorization(actor, 'authorization.inspect_self', { userId: actor.userId }, now).allowed, true, profile);
    assert.equal(evaluateAuthorization(actor, 'accounts.manage', {}, now).allowed, profile === 'system_admin', profile);
    assert.equal(evaluateAuthorization(actor, 'employees.read_sensitive', {}, now).allowed, false, profile);
    assert.equal(evaluateAuthorization(actor, 'reports.review', { requesterUserId: actor.userId, requiresIndependentApproval: true }, now).allowed, false, profile);
    assert.equal(evaluateAuthorization(actor, 'projects.execute', { employeeId: actor.employeeId }, now).allowed, profile !== 'system_admin', profile);
    assert.equal(evaluateAuthorization(actor, 'kpi.write', {}, now).allowed, false, profile);
  }
});

test('title, global flag, unsupported capability, pending grant or missing profile never grant authority', () => {
  const actor = principal('staff');
  actor.role = 'Admin'; actor.isGlobalAdmin = true; actor.job_title = 'OM'; actor.level = 'Lead';
  assert.equal(evaluateAuthorization(actor, 'accounts.manage', {}, now).allowed, false);
  assert.equal(evaluateAuthorization(actor, 'not-a-capability', {}, now).reason, 'UNKNOWN_CAPABILITY');
  actor.authorization = null;
  assert.equal(evaluateAuthorization(actor, 'profile.read_self', { employeeId: actor.employeeId }, now).reason, 'AUTHORIZATION_UNCONFIGURED');
  const manager = principal('om');
  manager.authorization.grants.push(grant('om', { kind: 'organization', storeIds: [id(10)] }));
  assert.equal(evaluateAuthorization(manager, 'projects.assign', { storeId: id(10), canonicalStoreVerified: true, employeeId: id(30) }, now).allowed, false);
  assert.equal(evaluateAuthorization(manager, 'projects.assign', { storeId: id(10), canonicalStoreVerified: true, employeeId: id(30), reportingVerified: true }, now).allowed, true);
  assert.equal(AUTHORIZATION_POLICY['employees.review'].status, 'APPROVED');
  assert.equal(AUTHORIZATION_POLICY['promotion.approve'].status, 'DENIED');
});

test('validity boundaries, account lifecycle, exact self ownership and independent approval fail closed', () => {
  const actor = principal('staff'), own = { employeeId: id(2) };
  assert.equal(evaluateAuthorization(actor, 'profile.read_self', own, new Date('2026-11-01T00:00:00Z')).allowed, false);
  assert.equal(evaluateAuthorization(actor, 'profile.read_self', own, new Date('2026-09-30T00:00:00Z')).allowed, false);
  assert.equal(evaluateAuthorization(actor, 'profile.read_self', { userId: actor.userId, employeeId: id(3) }, now).allowed, false);
  assert.equal(evaluateAuthorization(actor, 'profile.read_self', { ...own, requiresIndependentApproval: true, subjectEmployeeId: id(2) }, now).reason, 'SELF_APPROVAL_DENIED');
  actor.mustChangePassword = true;
  assert.equal(evaluateAuthorization(actor, 'profile.read_self', own, now).reason, 'PASSWORD_CHANGE_REQUIRED');
  actor.mustChangePassword = false; actor.accountActive = false;
  assert.equal(evaluateAuthorization(actor, 'profile.read_self', own, now).reason, 'ACCOUNT_DISABLED');
});

test('cross-store, verified region and reporting relationship constraints use intersection, never department/title', () => {
  const actor = principal('am');
  const scope = { kind: 'organization', storeIds: [id(10)], regionIds: [id(20)], reportingEmployeeIds: [id(30)] };
  assert.equal(scopeAllows(scope, actor, { employeeId: id(30), storeId: id(10), canonicalStoreVerified: true }), true);
  assert.equal(scopeAllows(scope, actor, { employeeId: id(31), storeId: id(10), canonicalStoreVerified: true }), false);
  assert.equal(scopeAllows(scope, actor, { employeeId: id(30), storeId: id(11), departmentId: 'same-department', canonicalStoreVerified: true }), false);
  assert.equal(scopeAllows(scope, actor, { employeeId: id(30), storeId: id(11), regionId: id(20), canonicalStoreVerified: true, canonicalRegionVerified: true }), true);
  assert.equal(scopeAllows(scope, actor, { employeeId: id(30), storeId: id(10) }), false);
  assert.equal(scopeAllows({ kind: 'organization', storeIds: [], regionIds: [], reportingEmployeeIds: [] }, actor, {}), false);
});

test('delegation cannot extend validity/scope or survive source revocation; unapproved delegation stays denied', () => {
  const owner = principal('am'), recipient = principal('sm'); recipient.userId = id(4);
  const source = grant('am', { kind: 'organization', storeIds: [id(10)] });
  owner.authorization.grants.push(source);
  const delegation = AuthorizationDelegationSchema.parse({ id: randomUUID(), sourceGrantId: source.id,
    delegatorUserId: owner.userId, recipientUserId: recipient.userId, scope: source.scope,
    capabilities: ['projects.assign'], approvalRef: 'isolated-fixture-only', validFrom: '2026-10-30T00:00:00Z', validUntil: source.validUntil, revokedAt: null });
  assert.equal(validateDelegation(delegation, source, owner, recipient, now).reason, 'INDEPENDENT_DELEGATION_APPROVAL_REQUIRED');
  assert.equal(validateDelegation({ ...delegation, validUntil: now.toISOString() }, source, owner, recipient, now).reason, 'DELEGATION_EXPIRED_OR_REVOKED');
  assert.equal(validateDelegation({ ...delegation, validUntil: '2026-11-02T00:00:00Z' }, source, owner, recipient, now).reason, 'DELEGATION_WINDOW_EXCEEDED');
  assert.equal(validateDelegation({ ...delegation, scope: { ...source.scope, storeIds: [id(11)] } }, source, owner, recipient, now).reason, 'DELEGATION_SCOPE_EXCEEDED');
  source.revokedAt = now.toISOString();
  assert.equal(validateDelegation(delegation, source, owner, recipient, now).reason, 'SOURCE_OR_RECIPIENT_UNAVAILABLE');
});

test('snapshot dry-run preserves source, reports ambiguous/orphan/inactive mapping and never outputs source PII/secrets', () => {
  const snapshot = { users: [{ _id: id(1), role: 'Employee', employeeId: id(2), passwordHash: 'DO_NOT_OUTPUT_HASH' }],
    employees: [{ _id: id(2), full_name: 'DO_NOT_OUTPUT_NAME', bank_account_number: 'DO_NOT_OUTPUT_BANK', status: 'inactive', store_raw: 'fixture-same-name', departmentId: id(90) }],
    departments: [], stores: [{ _id: id(10), store_name: 'fixture-same-name' }, { _id: id(11), store_name: 'fixture-same-name' }], projects: [{ _id: id(12) }] };
  const before = JSON.stringify(snapshot), report = auditAuthorizationSnapshot(snapshot);
  assert.equal(JSON.stringify(snapshot), before);
  assert.deepEqual(auditAuthorizationSnapshot(snapshot), report);
  assert.equal(report.mutations, 0); assert.equal(report.autoGrantedProfiles, 0);
  for (const code of ['PROFILE_REVIEW_REQUIRED', 'EMPLOYEE_INACTIVE_OR_UNREVIEWED', 'STORE_MAPPING_AMBIGUOUS', 'DEPARTMENT_MAPPING_MISSING', 'PROJECT_STORE_MAPPING_REQUIRED']) assert.ok(report.countsByCode[code], code);
  assert.doesNotMatch(JSON.stringify(report), /DO_NOT_OUTPUT/);
});

test('contracts reject mass-assigned approvals, mixed profiles, empty global scopes and malformed validity', () => {
  const value = grant('staff');
  assert.equal(AuthorizationGrantSchema.safeParse({ ...value, approved: true }).success, false);
  assert.equal(AuthorizationGrantSchema.safeParse({ ...value, validUntil: value.validFrom }).success, false);
  assert.equal(AuthorizationStateSchema.safeParse({ schemaVersion: 1, profile: 'hr', grants: [value] }).success, false);
  assert.equal(AuthorizationStateSchema.safeParse({ schemaVersion: 1, profile: 'staff', grants: [value, value] }).success, false);
  assert.equal(AuthorizationStateSchema.safeParse({ schemaVersion: 1, profile: 'staff', grants: [grant('staff', { kind: 'system' })] }).success, false);
});

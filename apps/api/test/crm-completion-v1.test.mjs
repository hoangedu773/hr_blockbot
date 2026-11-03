import './require-isolated-db.mjs';
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { authorizationV1Fixture, testGrant, SELF_CAPS } from './helpers/authorization-v1-fixture.mjs';
import { EmployeeModel } from '../dist/models/Employee.js';
import { UserModel } from '../dist/models/User.js';
import { ProjectModel } from '../dist/models/Project.js';
import { ManagementRelationModel } from '../dist/models/AuthorizationMapping.js';
import { EmployeeLifecycleRequestModel } from '../dist/models/EmployeeLifecycleRequest.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { withCrmWriter } from '../dist/services/crm-writer.service.js';
import { verifyProjectAudit } from '../dist/services/project-audit.service.js';
import { OnboardingReportingModel } from '../dist/services/onboarding-reporting.service.js';
let fixture, server, base, failAt, kpiBefore;
const invitations = new Map();
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture(); await EmployeeLifecycleRequestModel.init();
  server = createServer(createApp({ onboarding: { deliverActivation: async (invitation) => invitations.set(invitation.requestId, invitation.token), failpoint: (stage) => { if (stage === failAt) { failAt = null; throw new Error('ISOLATED_CRM_COMPLETION_INTERRUPTION'); } } } }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
  await mongoose.connection.collection('evaluations').insertOne({ employeeId: fixture.actors.staff.employee._id, status: 'PUBLISHED', finalScore: 80, maxScore: 100 });
  kpiBefore = JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray());
});
afterEach(async () => { assert.equal(JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray()), kpiBefore); });
after(async () => { server?.closeAllConnections(); if (server) await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function call(actor, route, body, method = body ? 'POST' : 'GET') {
  const token = typeof actor === 'string' ? fixture.actors[actor].token : actor?.token;
  const response = await fetch(base + route, { method, headers: { Connection: 'close', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function subject(name) {
  const employee = await EmployeeModel.create({ employeeCode: 'CORE-' + name, fullName: 'Synthetic core ' + name, status: 'active', level: 'Junior', skills: ['Core'], storeId: fixture.stores[0]._id, storeMappingRef: 'reviewed-isolated-core', departmentId: fixture.departmentId });
  const user = await UserModel.create({ username: ('core-' + name).toLowerCase(), passwordHash: fixture.actors.staff.user.passwordHash, employeeId: employee._id, role: 'Employee', authorization: { schemaVersion: 1, profile: 'staff', grants: [testGrant('staff', { kind: 'self' }, SELF_CAPS, fixture.actors.hr.user._id), testGrant('staff', { kind: 'organization', storeIds: [String(employee.storeId)] }, ['directory.read_store'], fixture.actors.hr.user._id)] } });
  employee.userId = user._id; await employee.save();
  await ManagementRelationModel.create({ managerEmployeeId: fixture.actors.sm.employee._id, employeeId: employee._id, storeId: employee.storeId, approvalRef: 'owned-core-fixture', validFrom: new Date(Date.now() - 60000), version: 1 });
  return { employee, user, token: await signAccessToken({ sub: String(user._id), role: 'Employee', securityVersion: 0 }) };
}
async function draft(title) {
  const result = await call('sm', '/projects', { title, storeId: String(fixture.stores[0]._id), departmentId: String(fixture.departmentId), dueDate: '2026-11-15T00:00:00Z' });
  assert.equal(result.status, 201, JSON.stringify(result)); return result.body;
}
async function exitRequest(employee) {
  const created = await call('hr', '/employee-lifecycle', { employeeId: String(employee._id), kind: 'EXIT', reason: 'Owned independent reviewed exit', effectiveAt: new Date().toISOString(), expectedProfileVersion: employee.profileRevision ?? 0 });
  assert.equal(created.status, 201, JSON.stringify(created)); return created.body;
}
const approve = (row) => ({ decision: 'APPROVE', reason: 'Independent HR approval', expectedVersion: row.version });
async function addCap(actor, cap) { await UserModel.updateOne({ _id: fixture.actors[actor].user._id }, { $addToSet: { 'authorization.grants.1.capabilities': cap } }); }
async function newOnboarding(code) {
  const created = await call('sm', '/onboarding', { clientRequestId: randomUUID(), fullName: 'Synthetic new hire ' + code, phone: 'owned-fixture-contact', hiredAt: '2026-10-31T00:00:00Z', storeId: String(fixture.stores[0]._id), reason: 'Reviewed core onboarding' });
  assert.equal(created.status, 201, JSON.stringify(created)); return created.body;
}

test('G01/G02 regression: every interrupted EXIT stage fences all profile writers and new assignment, then resumes exactly once', async () => {
  for (const stage of ['lifecycle-after-fence', 'lifecycle-after-user', 'lifecycle-after-employee', 'lifecycle-after-decision']) {
    const actor = await subject(stage), work = await draft('Fenced work ' + stage), row = await exitRequest(actor.employee);
    failAt = stage;
    assert.equal((await call('hr2', `/employee-lifecycle/${row.id}/review`, approve(row))).status, 500);
    const employee = await EmployeeModel.findById(actor.employee._id).lean();
    const edited = await call('hr', '/employees/' + employee._id, { fullName: 'Must not write', expectedVersion: employee.profileRevision ?? 0 }, 'PATCH');
    assert.equal(edited.status, 409); assert.equal(edited.body.error.code, 'CRM_EMPLOYEE_FENCED');
    const requested = await call('hr', `/employees/${employee._id}/change-requests`, { targetFields: { hiredAt: '2026-01-01T00:00:00Z' } });
    assert.equal(requested.status, 409); assert.equal(requested.body.error.code, 'CRM_EMPLOYEE_FENCED');
    const assigned = await call('sm', `/projects/${work.id}/assign`, { assigneeId: String(employee._id), expectedVersion: work.version });
    assert.ok([400, 409].includes(assigned.status), JSON.stringify(assigned));
    const resumed = await call('hr2', `/employee-lifecycle/${row.id}/resume`, {});
    assert.equal(resumed.status, 200, JSON.stringify(resumed)); assert.equal(resumed.body.status, 'COMPLETED');
    const saved = await EmployeeModel.findById(employee._id).lean();
    assert.equal(saved.status, 'inactive'); assert.equal(saved.profileHistory.filter((event) => event.requestId === row.id).length, 1);
    assert.equal((await UserModel.findById(actor.user._id)).securityVersion, 1);
    assert.equal((await ProjectModel.findById(work.id)).status, 'DRAFT');
    assert.equal((await call('hr2', `/employee-lifecycle/${row.id}/resume`, {})).status, 200, 'completed decision cleanup is idempotent, not business re-application');
  }
});

test('REACTIVATE interruptions fence profile writers at every commit stage and resume without replay, old sessions or revived managerial grants', async () => {
  for (const stage of ['lifecycle-after-fence', 'lifecycle-after-user', 'lifecycle-after-employee', 'lifecycle-after-decision']) {
    const actor = await subject('reactivate-' + stage), exited = await exitRequest(actor.employee);
    assert.equal((await call('hr2', `/employee-lifecycle/${exited.id}/review`, approve(exited))).body.status, 'COMPLETED');
    const before = await EmployeeModel.findById(actor.employee._id).lean();
    const created = await call('hr', '/employee-lifecycle', { employeeId: String(before._id), kind: 'REACTIVATE', reason: 'Owned reviewed secure recovery', effectiveAt: new Date().toISOString(), expectedProfileVersion: before.profileRevision });
    assert.equal(created.status, 201, JSON.stringify(created)); const row = created.body;
    assert.equal((await call('hr2', `/employee-lifecycle/${row.id}/review`, approve(row))).body.status, 'PENDING_ACTIVATION');
    const token = invitations.get(row.id); assert.ok(token); failAt = stage;
    assert.equal((await call(null, '/auth/reactivate', { token, newPassword: 'OwnedResumeOnly@2026' })).status, 500);
    const partial = await EmployeeModel.findById(before._id).lean();
    assert.equal((await call('hr', `/employees/${before._id}`, { phone: 'No partial profile write', expectedVersion: partial.profileRevision }, 'PATCH')).body.error.code, 'CRM_EMPLOYEE_FENCED');
    assert.equal((await call(null, '/auth/reactivate', { token, newPassword: 'ReplayMustFail@2026' })).status, 400);
    assert.equal((await call('hr2', `/employee-lifecycle/${row.id}/resume`, {})).body.status, 'COMPLETED');
    assert.equal((await call(actor, '/auth/me')).status, 401, 'pre-exit session stays revoked');
    const saved = await EmployeeModel.findById(before._id).lean(), user = await UserModel.findById(actor.user._id).lean();
    assert.equal(saved.status, 'active'); assert.equal(saved.lifecyclePendingRequestId, undefined);
    assert.equal(saved.profileHistory.filter((event) => event.requestId === row.id).length, 1);
    assert.equal(user.securityVersion, 2);
    const effective = user.authorization.grants.filter((grant) => !grant.revokedAt);
    assert.ok(effective.every((grant) => grant.scope.kind === 'self' || grant.scope.kind === 'organization' && grant.capabilities.length === 1 && grant.capabilities[0] === 'directory.read_store' && JSON.stringify(grant.scope.storeIds) === JSON.stringify([String(before.storeId)])));
    assert.ok(effective.every((grant) => grant.approvalRef === 'hr-lifecycle:' + row.id));
    assert.equal(effective.some((grant) => grant.capabilities.includes('projects.assign')), false);
    assert.equal((await call(null, '/auth/login', { username: user.username, password: 'OwnedResumeOnly@2026' })).status, 200);
    assert.equal((await call(null, '/auth/login', { username: user.username, password: fixture.password })).status, 401);
    assert.equal((await call('hr2', `/employee-lifecycle/${row.id}/resume`, {})).status, 200);
  }
});

test('shared writer serializes concurrent HTTP assignment/profile edits without an active-state-only race; nested services retain ownership', async () => {
  const actor = await subject('parallel'), work = await draft('Parallel locked work');
  let release, entered; const gate = new Promise((resolve) => { release = resolve; }), reached = new Promise((resolve) => { entered = resolve; });
  const holding = withCrmWriter(async () => { await withCrmWriter(async () => entered()); await gate; });
  await reached;
  try {
    const results = await Promise.all([
      call('sm', `/projects/${work.id}/assign`, { assigneeId: String(actor.employee._id), expectedVersion: 1 }),
      call('hr', `/employees/${actor.employee._id}`, { phone: 'Must not commit', expectedVersion: 0 }, 'PATCH'),
    ]);
    assert.ok(results.every((result) => result.status === 409 && result.body.error.code === 'CRM_WRITE_IN_PROGRESS'), JSON.stringify(results));
  } finally { release(); await holding; }
  assert.equal((await call('sm', `/projects/${work.id}/assign`, { assigneeId: String(actor.employee._id), expectedVersion: 1 })).status, 200);
  assert.equal(verifyProjectAudit(await ProjectModel.findById(work.id).lean()), true);
});

test('crashed-owner maintenance fence never expires or permits a stale writer to unlock a different owner', async () => {
  const controls = mongoose.connection.collection('authorization_controls');
  await controls.updateOne({ _id: 'crm-writers' }, { $set: { locked: true, token: 'synthetic-dead-owner', at: new Date('2020-01-01') } });
  try { await assert.rejects(withCrmWriter(async () => assert.fail('must not execute')), (error) => error.code === 'CRM_WRITE_IN_PROGRESS'); }
  finally { // Test fixture cleanup only; production never does an automatic TTL unlock.
    await controls.updateOne({ _id: 'crm-writers', token: 'synthetic-dead-owner' }, { $set: { locked: false }, $unset: { token: '', at: '' } });
  }
});

test('old inconsistent partial state is retained for reconciliation, never reset or silently completed', async () => {
  const actor = await subject('old-partial'), row = await exitRequest(actor.employee);
  failAt = 'lifecycle-after-user'; assert.equal((await call('hr2', `/employee-lifecycle/${row.id}/review`, approve(row))).status, 500);
  // A pre-fix raw partial fixture, not a supported application write.
  await EmployeeModel.collection.updateOne({ _id: actor.employee._id }, { $set: { profileRevision: 5 } });
  const resumed = await call('hr2', `/employee-lifecycle/${row.id}/resume`, {});
  assert.equal(resumed.status, 409); assert.equal(resumed.body.error.code, 'LIFECYCLE_SNAPSHOT_CONFLICT');
  assert.equal((await EmployeeLifecycleRequestModel.findById(row.id)).status, 'APPLYING');
  assert.equal((await EmployeeModel.findById(actor.employee._id)).profileRevision, 5);
});

test('G07 full API/database: explicit SM proposes manager, actual independent AM approves, activation and effectivity precede first assignment', async () => {
  const onboard = await newOnboarding('CORE-NEW-RELATION');
  const proposal = { onboardingId: onboard.id, managerEmployeeId: String(fixture.actors.sm.employee._id), validFrom: new Date(Date.now() - 1000).toISOString(), evidenceRef: 'synthetic-reviewed-reporting-evidence', reason: 'Explicitly propose SM, not inferred from requester' };
  assert.equal((await call('sm', '/initial-reporting', proposal)).status, 403, 'profile without new grant is denied');
  await addCap('sm', 'onboarding.reporting_propose'); await addCap('am', 'onboarding.reporting_review'); await addCap('sam', 'onboarding.reporting_review');
  const proposed = await call('sm', '/initial-reporting', proposal); assert.equal(proposed.status, 201, JSON.stringify(proposed));
  const options = await call('sm', '/initial-reporting/options?page=1&limit=1'); assert.equal(options.status, 200); assert.equal(options.body.items.length, 1); assert.ok(options.body.paging.totalItems >= 1);
  const managers = await call('sm', `/initial-reporting/managers?storeId=${fixture.stores[0]._id}&page=1&limit=1`); assert.equal(managers.status, 200); assert.equal(managers.body.items.length, 1); assert.equal(managers.body.paging.hasNext, true);
  assert.equal((await call('sm', '/initial-reporting/options?page=bad')).status, 400);
  assert.equal((await call('sm', `/initial-reporting/managers?storeId=${fixture.stores[1]._id}`)).status, 403);
  for (const actor of ['system_admin', 'hr', 'sm', 'staff', 'sam']) assert.equal((await call(actor, `/initial-reporting/${proposed.body.id}/approve`, { expectedVersion: 1, reason: 'Cannot shortcut direct independent reviewer' })).status, 403, actor);
  assert.equal((await call('am', `/initial-reporting/${proposed.body.id}/approve`, { expectedVersion: 1, reason: 'Must wait for prior independent HR' })).body.error.code, 'INITIAL_REPORTING_HR_APPROVAL_REQUIRED');
  const hrApproved = await call('hr', `/onboarding/${onboard.id}/review`, approve(onboard)); assert.equal(hrApproved.status, 200);
  const reviewed = await call('am', `/initial-reporting/${proposed.body.id}/approve`, { expectedVersion: 1, reason: 'Actual direct upper manager approves' });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed)); assert.equal(reviewed.body.status, 'APPROVED');
  assert.equal(await ManagementRelationModel.countDocuments({ employeeId: onboard.employeeId }), 0, 'no edge before activation');
  assert.equal((await call(null, '/auth/activate', { token: invitations.get(onboard.id), newPassword: 'NewCoreRecipient@2026' })).status, 204);
  const work = await draft('New active employee first real task');
  assert.equal((await call('sm', `/projects/${work.id}/assign`, { assigneeId: onboard.employeeId, expectedVersion: 1 })).status, 403, 'no mapping until approved relation applies');
  const applied = await call('sm', `/initial-reporting/${proposed.body.id}/resume`, {}); assert.equal(applied.status, 200, JSON.stringify(applied)); assert.equal(applied.body.status, 'APPLIED');
  const offered = await call('sm', `/projects/${work.id}/assign`, { assigneeId: onboard.employeeId, expectedVersion: 1 }); assert.equal(offered.status, 200, JSON.stringify(offered));
  assert.equal(await ManagementRelationModel.countDocuments({ employeeId: onboard.employeeId, revokedAt: null }), 1);
  assert.equal((await call('sm', `/initial-reporting/${proposed.body.id}/resume`, {})).status, 200, 'idempotent apply keeps single canonical edge');
  assert.equal((await call('staffB', '/initial-reporting/' + proposed.body.id)).status, 403);
  assert.equal((await UserModel.findById(onboard.userId)).authorization.grants.some((grant) => grant.capabilities.includes('projects.assign')), false, 'no auto manager grant');
});

test('initial reporting respects future effectivity, SAM->SM direct mapping, CAS, no title shortcut, and staged-edge crash recovery', async () => {
  const onboard = await newOnboarding('CORE-SAM-RELATION');
  // Explicitly replace fixture reporting edge; never derive SAM->SM from rank.
  await ManagementRelationModel.updateOne({ managerEmployeeId: fixture.actors.am.employee._id, employeeId: fixture.actors.sm.employee._id }, { $set: { revokedAt: new Date() } });
  const direct = await ManagementRelationModel.create({ managerEmployeeId: fixture.actors.sam.employee._id, employeeId: fixture.actors.sm.employee._id, storeId: fixture.stores[0]._id, validFrom: new Date(Date.now() - 10000), approvalRef: 'owned-explicit-sam-sm', version: 1 });
  try {
    const proposed = await call('sm', '/initial-reporting', { onboardingId: onboard.id, managerEmployeeId: String(fixture.actors.sm.employee._id), validFrom: new Date(Date.now() - 1000).toISOString(), evidenceRef: 'owned-sam-sm-evidence', reason: 'No mandatory AM intermediary' }); assert.equal(proposed.status, 201);
    assert.equal((await call('am', `/initial-reporting/${proposed.body.id}/approve`, { expectedVersion: 1, reason: 'Old revoked direct manager cannot approve' })).status, 403);
    assert.equal((await call('hr', `/onboarding/${onboard.id}/review`, approve(onboard))).status, 200);
    const decisions = await Promise.all([1, 2].map(() => call('sam', `/initial-reporting/${proposed.body.id}/approve`, { expectedVersion: 1, reason: 'Independent verified SAM' })));
    assert.deepEqual(decisions.map((value) => value.status).sort(), [200, 409]);
    assert.equal((await call(null, '/auth/activate', { token: invitations.get(onboard.id), newPassword: 'CoreSamRecipient@2026' })).status, 204);
    for (const stage of ['initial-reporting-after-stage', 'initial-reporting-after-decision']) {
      failAt = stage; assert.equal((await call('sm', `/initial-reporting/${proposed.body.id}/resume`, {})).status, 500);
      assert.equal(await ManagementRelationModel.countDocuments({ employeeId: onboard.employeeId, revokedAt: null }), 0, 'edge never active before durable decision');
    }
    assert.equal((await call('sm', `/initial-reporting/${proposed.body.id}/resume`, {})).body.status, 'APPLIED');
    assert.equal((await OnboardingReportingModel.findById(proposed.body.id)).history.length, 3);
  } finally {
    await ManagementRelationModel.deleteOne({ _id: direct._id });
    await ManagementRelationModel.updateOne({ managerEmployeeId: fixture.actors.am.employee._id, employeeId: fixture.actors.sm.employee._id }, { $set: { revokedAt: null } });
  }
  const future = await newOnboarding('CORE-FUTURE-RELATION');
  const proposed = await call('sm', '/initial-reporting', { onboardingId: future.id, managerEmployeeId: String(fixture.actors.sm.employee._id), validFrom: new Date(Date.now() + 86400000).toISOString(), evidenceRef: 'future-evidence', reason: 'Must wait effective date' }); assert.equal(proposed.status, 201);
  assert.equal((await call('hr', `/onboarding/${future.id}/review`, approve(future))).status, 200);
  assert.equal((await call('am', `/initial-reporting/${proposed.body.id}/approve`, { expectedVersion: 1, reason: 'Future relation verified' })).body.status, 'APPROVED');
  assert.equal((await call(null, '/auth/activate', { token: invitations.get(future.id), newPassword: 'CoreFutureRecipient@2026' })).status, 204);
  assert.equal((await call('sm', `/initial-reporting/${proposed.body.id}/resume`, {})).body.status, 'APPROVED');
  assert.equal(await ManagementRelationModel.countDocuments({ employeeId: future.employeeId }), 0);
});

test('G03/G05 read UNKNOWN without write normalization; name/code searches and pagination stay scoped, unknown personnel cannot authenticate', async () => {
  const raw = { employee_code: 'CORE-RAW-UNKNOWN', full_name: 'Synthetic raw unknown', storeId: fixture.stores[0]._id, storeMappingRef: 'owned-legacy-proof', departmentId: fixture.departmentId, level: 'Junior', skills: [] };
  const inserted = await EmployeeModel.collection.insertOne(raw);
  const invalid = await EmployeeModel.collection.insertOne({ ...raw, _id: new mongoose.Types.ObjectId(), employee_code: 'CORE-RAW-INVALID', status: 'imported-unknown-state' });
  const list = await call('hr', '/employees?status=UNKNOWN'); assert.equal(list.status, 200, JSON.stringify(list));
  assert.ok(list.body.items.some((item) => item.employeeId === String(inserted.insertedId) && item.status === 'UNKNOWN'));
  assert.ok(list.body.items.some((item) => item.employeeId === String(invalid.insertedId) && item.status === 'UNKNOWN'));
  const dashboard = await call('hr', '/dashboard/overview'), store = await call('sm', '/stores/' + fixture.stores[0]._id);
  assert.equal(dashboard.body.employees.unknown, 2); assert.equal(store.body.unknownEmployeeCount, 2);
  assert.equal(dashboard.body.employees.total, dashboard.body.employees.active + dashboard.body.employees.inactive + 2);
  assert.equal((await call('hr', '/employees?q=CORE-RAW-UNKNOWN')).body.paging.totalItems, 1);
  const search = await call('sm', '/directory?q=V1-staff&limit=1'); assert.equal(search.status, 200); assert.equal(search.body.paging.totalItems, 1); assert.equal(search.body.items[0].employeeCode, 'V1-staff');
  assert.equal((await call('sm', '/directory?q=NO_SUCH_NAME_9f7b')).body.paging.totalItems, 0);
  assert.equal((await call('hr', '/employees?q=V1-staffB')).body.paging.totalItems, 0);
  assert.equal((await call('hr', '/employees?storeId=' + fixture.stores[1]._id)).body.paging.totalItems, 0);
  const user = await UserModel.create({ username: 'core-unknown-login', employeeId: inserted.insertedId, passwordHash: fixture.actors.staff.user.passwordHash, role: 'Employee', authorization: fixture.actors.staff.user.authorization });
  assert.equal((await call({ token: await signAccessToken({ sub: String(user._id), role: 'Employee', securityVersion: 0 }) }, '/auth/me')).status, 401);
  assert.equal((await EmployeeModel.collection.findOne({ _id: inserted.insertedId })).status, undefined);
  assert.equal((await EmployeeModel.collection.findOne({ _id: invalid.insertedId })).status, 'imported-unknown-state');
});

test('G04/G06 malformed pagination is400; new deadlines cannot be removed while missing-deadline legacy remains readable/editable without invented date', async () => {
  const work = await draft('Deadline invariants');
  for (const route of ['/directory?page=0', '/change-requests?page=0', `/projects/${work.id}/eligible-assignees?limit=101`, '/assignment/notifications?limit=101']) {
    const result = await call(route.startsWith('/change-requests') ? 'hr' : 'sm', route); assert.equal(result.status, 400, route + JSON.stringify(result)); assert.equal(result.body.error.code, 'VALIDATION_FAILED');
  }
  const nullDeadline = await call('sm', '/projects/' + work.id, { dueDate: null, expectedVersion: 1 }, 'PATCH'); assert.equal(nullDeadline.status, 400);
  const changed = await call('sm', '/projects/' + work.id, { dueDate: '2026-11-16T00:00:00Z', expectedVersion: 1 }, 'PATCH'); assert.equal(changed.status, 200); assert.equal(changed.body.version, 2);
  const canonical = await ProjectModel.findById(work.id).lean(); assert.equal(verifyProjectAudit(canonical), true); assert.equal(canonical.assignmentAudit.at(-1).details.changes.dueDate, '2026-11-16T00:00:00Z');
  const legacy = await ProjectModel.collection.insertOne({ title: 'Legacy without deadline', storeId: fixture.stores[0]._id, storeMappingRef: 'owned-legacy-proof', departmentId: fixture.departmentId, createdBy: fixture.actors.sm.user._id, status: 'DRAFT', version: 1 });
  assert.equal((await call('sm', '/projects/' + legacy.insertedId)).status, 200);
  assert.equal((await call('sm', '/projects/' + legacy.insertedId, { title: 'Legacy ordinary edit', expectedVersion: 1 }, 'PATCH')).status, 200);
  assert.equal((await EmployeeModel.collection.findOne({ _id: legacy.insertedId })), null);
  assert.equal((await ProjectModel.collection.findOne({ _id: legacy.insertedId })).dueDate, undefined);
});

test('UX02/G08 pages retain older HR decisions and recipient-only notices beyond100 without cutting events/audit', async () => {
  for (let index = 0; index < 21; index++) {
    const actor = await subject('queue-' + index);
    assert.equal((await call('hr', `/employees/${actor.employee._id}/change-requests`, { targetFields: { hiredAt: '2026-01-01T00:00:00Z' } })).status, 201);
  }
  const first = await call('hr', '/change-requests?page=1&limit=20'), second = await call('hr', '/change-requests?page=2&limit=20');
  assert.equal(first.body.paging.totalItems, 21); assert.equal(second.body.items.length, 1);
  assert.equal((await call('sm', '/change-requests?page=2')).status, 403);
  const actor = await subject('notice-reader');
  const notices = Array.from({ length: 125 }, (_, index) => ({ id: 'owned-notice-' + index, at: new Date(Date.now() + index).toISOString(), message: 'Synthetic historical notice ' + index, recipients: ['employee:' + actor.employee._id] }));
  const project = await ProjectModel.create({ title: 'Historical recipient inbox', storeId: fixture.stores[0]._id, storeMappingRef: 'owned-notice-proof', departmentId: fixture.departmentId, createdBy: fixture.actors.sm.user._id, assigneeId: actor.employee._id, status: 'ASSIGNED', version: 1, assignmentNotices: notices });
  const before = await ProjectModel.findById(project._id).lean();
  const a = await call(actor, '/assignment/notifications?limit=100'), b = await call(actor, '/assignment/notifications?limit=100&page=2');
  assert.equal(a.body.totalItems, 125); assert.equal(a.body.items.length, 100); assert.equal(b.body.items.length, 25);
  assert.ok(!b.body.items.some((row) => a.body.items.some((first) => row.id === first.id)));
  assert.equal((await call('staffB', '/assignment/notifications?limit=100&page=2')).body.totalItems, 0);
  const after = await ProjectModel.findById(project._id).lean(); assert.deepEqual(after.assignmentNotices, before.assignmentNotices); assert.deepEqual(after.assignmentAudit, before.assignmentAudit);
});

test('HR ordinary management/history remains allowlisted and denied to all operational/technical profiles', async () => {
  const actor = await subject('hr-history');
  assert.equal((await call('hr', `/employees/${actor.employee._id}`, { fullName: 'Verified ordinary name', phone: 'fixture-public-contact', expectedVersion: 0 }, 'PATCH')).status, 200);
  await EmployeeModel.collection.updateOne({ _id: actor.employee._id }, { $push: { profileHistory: { id: 'raw-imported', type: 'PROFILE_EDITED', reason: 'Synthetic raw event', at: new Date(), before: { bank_account_number: 'DO_NOT_READ_BANK', phone: { bank: 'DO_NOT_READ_NESTED' } }, after: { salary: 'DO_NOT_READ_SALARY', fullName: 'Safe allowlist name' } } } });
  const history = await call('hr', `/employees/${actor.employee._id}/profile-history?limit=1`); assert.equal(history.status, 200); assert.equal(history.body.paging.totalItems, 2); assert.equal(history.body.paging.hasNext, true);
  assert.doesNotMatch(JSON.stringify(history.body), /DO_NOT_READ|bank|salary/); assert.equal(history.body.items[0].after.fullName, 'Safe allowlist name');
  for (const profile of ['system_admin', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff']) assert.ok([403, 404].includes((await call(profile, `/employees/${actor.employee._id}/profile-history`)).status), profile);
  assert.equal((await call('staffB', `/employees/${actor.employee._id}/profile-history`)).status, 404);
});

test('work dashboard/query filters use real scoped records and explicit createdAt period, never KPI; store managers come only from approved active edges', async () => {
  const work = await draft('Scoped dashboard work'), start = new Date(Date.now() - 86400000).toISOString(), end = new Date(Date.now() + 86400000).toISOString();
  const summary = await call('sm', '/assignment/summary?storeId=' + fixture.stores[0]._id + '&createdFrom=' + encodeURIComponent(start) + '&createdTo=' + encodeURIComponent(end));
  assert.equal(summary.status, 200); assert.ok(summary.body.total > 0); assert.equal(summary.body.periodBasis, 'createdAt'); assert.equal('kpi' in summary.body, false);
  const deniedScope = await call('sm', '/assignment/summary?storeId=' + fixture.stores[1]._id); assert.equal(deniedScope.body.total, 0);
  assert.equal((await call('sm', '/projects?storeId=' + fixture.stores[1]._id)).body.paging.totalItems, 0);
  assert.equal((await call('sm', '/projects?dueFrom=' + encodeURIComponent('2027-01-01T00:00:00Z'))).body.paging.totalItems, 0);
  assert.equal((await call('sm', '/projects?dueFrom=bad')).status, 400);
  const managers = (await call('sm', '/stores/' + fixture.stores[0]._id)).body.managers;
  assert.ok(managers.some((row) => row.employeeId === String(fixture.actors.sm.employee._id)));
  assert.equal(managers.some((row) => row.employeeId === String(fixture.actors.staff.employee._id)), false);
  assert.equal((await call('system_admin', '/assignment/summary')).status, 403);
  assert.ok((await call('sm', '/projects?q=' + encodeURIComponent('Scoped dashboard work'))).body.items.some((item) => item.id === work.id));
});

test('real concurrent exit approval, assignment and profile writer never commit an inactive task owner', async () => {
  for (let index = 0; index < 8; index++) {
    const actor = await subject('race-' + index), work = await draft('Actual HTTP race ' + index), row = await exitRequest(actor.employee);
    const results = await Promise.all([
      call('hr2', `/employee-lifecycle/${row.id}/review`, approve(row)),
      call('sm', `/projects/${work.id}/assign`, { assigneeId: String(actor.employee._id), expectedVersion: 1 }),
      call('hr', `/employees/${actor.employee._id}`, { phone: 'Parallel ordinary correction', expectedVersion: 0 }, 'PATCH'),
    ]);
    assert.ok(results.every((result) => [200, 400, 409].includes(result.status)), JSON.stringify(results));
    const employee = await EmployeeModel.findById(actor.employee._id).lean(), project = await ProjectModel.findById(work.id).lean();
    if (employee.status === 'inactive') assert.equal(project.status, 'DRAFT');
    if (project.status === 'ASSIGNED') assert.equal(employee.status, 'active');
    assert.equal(verifyProjectAudit(project), true);
  }
});

test('replacement and final handover serialize with receiver exit; pending incoming obligations block exit without changing responsibility', async () => {
  const outgoing = await subject('handover-outgoing'), incoming = await subject('handover-incoming'), work = await draft('Handover versus lifecycle');
  let current = (await call('sm', `/projects/${work.id}/assign`, { assigneeId: String(outgoing.employee._id), expectedVersion: 1 })).body;
  current = (await call(outgoing, `/projects/${work.id}/assignment/respond`, { action: 'ACCEPT', expectedVersion: current.version })).body;
  current = (await call(outgoing, `/projects/${work.id}/transition`, { targetStatus: 'IN_PROGRESS', expectedVersion: current.version })).body;
  current = (await call(outgoing, `/projects/${work.id}/assignment/respond`, { action: 'REQUEST_CHANGE', reason: 'Actual incoming handover', expectedVersion: current.version })).body;
  let request = current.assignmentRequests.at(-1);
  current = (await call('sm', `/projects/${work.id}/assignment/requests/${request.id}/review`, { action: 'APPROVE', replacementId: String(incoming.employee._id), reason: 'Independent manager', handoverNote: 'Real bounded progress snapshot', expectedVersion: current.version })).body;
  assert.equal(current.assignmentStatus, 'HANDOVER_PENDING');
  const lifecycle = await exitRequest(incoming.employee);
  const approvedExit = await call('hr2', `/employee-lifecycle/${lifecycle.id}/review`, approve(lifecycle)); assert.equal(approvedExit.body.status, 'PENDING_HANDOVER');
  current = (await call(outgoing, `/projects/${work.id}/assignment/requests/${request.id}/handover`, { action: 'CONFIRM', reason: 'Outgoing confirms', expectedVersion: current.version })).body;
  const results = await Promise.all([
    call(incoming, `/projects/${work.id}/assignment/requests/${request.id}/handover`, { action: 'CONFIRM', reason: 'Incoming confirms', expectedVersion: current.version }),
    call('hr2', `/employee-lifecycle/${lifecycle.id}/resume`, {}),
  ]);
  assert.ok(results.every((result) => [200, 409].includes(result.status)), JSON.stringify(results));
  const saved = await ProjectModel.findById(work.id).lean();
  assert.equal((await EmployeeModel.findById(incoming.employee._id)).status, 'active'); assert.equal(verifyProjectAudit(saved), true);
  assert.equal(saved.responsibilities.filter((interval) => interval.endAt === null).length, 1);
  assert.equal((await EmployeeLifecycleRequestModel.findById(lifecycle.id)).status, 'PENDING_HANDOVER');
});

test('initial relation selectors page older scoped onboardings beyond100 and count only verified eligible managers', async () => {
  const rows = Array.from({ length: 105 }, (_, index) => ({ _id: new mongoose.Types.ObjectId(), employeeKey: 'old-select-' + index, storeId: fixture.stores[0]._id, payload: { employeeCode: 'OLD-SELECT-' + index, fullName: 'Owned old selector ' + index }, status: 'REJECTED', createdAt: new Date(2020, 0, 1, 0, index) }));
  const foreign = { ...rows[0], _id: new mongoose.Types.ObjectId(), employeeKey: 'foreign-select', storeId: fixture.stores[1]._id, payload: { employeeCode: 'FOREIGN-SELECT', fullName: 'Must never show' } };
  const collection = mongoose.connection.collection('onboarding_requests');
  await collection.insertMany([...rows, foreign]);
  try {
    const ids = new Set(); let page = 1, response;
    do { response = await call('sm', `/initial-reporting/options?page=${page++}&limit=100`); assert.equal(response.status, 200); for (const row of response.body.items) ids.add(row.id); } while (response.body.paging.hasNext);
    assert.ok(rows.every((row) => ids.has(String(row._id)))); assert.equal(ids.has(String(foreign._id)), false);
    const managers = await call('sm', `/initial-reporting/managers?storeId=${fixture.stores[0]._id}&limit=100`);
    assert.equal(managers.status, 200); assert.equal(managers.body.paging.totalItems, managers.body.items.length);
    assert.ok(managers.body.items.every((row) => ['om', 'sam', 'am', 'sm'].some((profile) => String(fixture.actors[profile].employee._id) === row.employeeId)));
    for (const profile of ['system_admin', 'hr', 'aom', 'sam', 'am', 'ptch', 'staff', 'staffB']) assert.equal((await call(profile, '/initial-reporting/options')).status, 403, profile);
  } finally { await collection.deleteMany({ _id: { $in: [...rows, foreign].map((row) => row._id) } }); }
});

test('actual killed child writer leaves a durable cross-process fence, no automatic takeover or business rollback', async () => {
  const child = spawn(process.execPath, ['test/helpers/crm-crash-writer.mjs'], { cwd: new URL('../', import.meta.url), env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  try {
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Owned child writer did not claim: ' + output)), 10000);
      child.stdout.on('data', (data) => { output += data; if (output.includes('CRM_OWNED_WRITER_CLAIMED')) { clearTimeout(timeout); resolve(); } });
      child.stderr.on('data', (data) => { output += data; });
      child.once('error', (error) => { clearTimeout(timeout); reject(error); });
    });
    const exited = new Promise((resolve) => child.once('exit', resolve)); child.kill(); await exited;
    const controls = mongoose.connection.collection('authorization_controls'), locked = await controls.findOne({ _id: 'crm-writers' });
    assert.equal(locked.locked, true); await assert.rejects(withCrmWriter(async () => assert.fail('No unsafe takeover')), (error) => error.code === 'CRM_WRITE_IN_PROGRESS');
    // Isolated test maintenance: the exclusively owned child is verified stopped;
    // clear ONLY its token. No production API/TTL/unconditional unlock is added.
    await controls.updateOne({ _id: 'crm-writers', token: locked.token }, { $set: { locked: false }, $unset: { token: '', at: '' } });
  } finally { if (child.exitCode === null && child.signalCode === null) child.kill(); }
});

import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { EmployeeLifecycleRequestModel as RequestModel } from '../dist/models/EmployeeLifecycleRequest.js';
import { ProjectModel } from '../dist/models/Project.js';
import { ManagementRelationModel } from '../dist/models/AuthorizationMapping.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { authorizationV1Fixture, testGrant, SELF_CAPS, MANAGEMENT_CAPS } from './helpers/authorization-v1-fixture.mjs';
let fixture, server, base, failAt = null;
const invitations = new Map();
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture(); await RequestModel.init();
  for (const actor of ['hr', 'hr2']) await UserModel.updateOne({ _id: fixture.actors[actor].user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id) } });
  const employee = await EmployeeModel.create({ employeeCode: 'LIFECYCLE-SM-B', fullName: 'Isolated destination manager', storeId: fixture.stores[1]._id, storeMappingRef: 'fixture-confirmed', departmentId: fixture.departmentId, status: 'active', level: 'Junior' });
  const id = new mongoose.Types.ObjectId();
  const user = await UserModel.create({ _id: id, username: 'lifecycle-sm-b', passwordHash: fixture.actors.sm.user.passwordHash, employeeId: employee._id, role: 'Employee', authorization: { schemaVersion: 1, profile: 'sm', grants: [testGrant('sm', { kind: 'self' }, SELF_CAPS, id), testGrant('sm', { kind: 'organization', storeIds: [String(fixture.stores[1]._id)] }, MANAGEMENT_CAPS, id)] } });
  employee.userId = user._id; await employee.save();
  await ManagementRelationModel.create({ managerEmployeeId: employee._id, employeeId: fixture.actors.staffB.employee._id, storeId: fixture.stores[1]._id, approvalRef: 'fixture-direct-manager', validFrom: new Date(Date.now() - 60000), validUntil: null, version: 1 });
  fixture.actors.smB = { user, employee, token: await signAccessToken({ sub: String(user._id), role: 'Employee', securityVersion: 0 }) };
  server = createServer(createApp({ onboarding: { deliverActivation: async (invitation) => invitations.set(invitation.requestId, invitation.token), failpoint: (stage) => { if (failAt === stage) { failAt = null; throw new Error('ISOLATED_LIFECYCLE_FAILPOINT'); } } } }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function call(actor, path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Connection: 'close', ...(actor ? { Authorization: `Bearer ${fixture.actors[actor]?.token ?? actor}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function proposal(actor, kind, extra = {}) {
  const employee = await EmployeeModel.findById(fixture.actors[actor].employee._id).lean();
  return { employeeId: String(employee._id), kind, effectiveAt: new Date().toISOString(), expectedProfileVersion: employee.profileRevision ?? 0, reason: 'Isolated reviewed personnel workflow', ...extra };
}
const review = (row, decision = 'APPROVE') => ({ expectedVersion: row.version, decision, reason: 'Independent HR verification' });
test('only scoped HR requests/reviews; requester and subject cannot approve; missing reviewer leaves pending', async () => {
  const input = await proposal('staff', 'EXIT');
  for (const actor of ['sm', 'staff', 'system_admin']) assert.equal((await call(actor, '/employee-lifecycle', input)).status, 403, actor);
  const request = await call('hr', '/employee-lifecycle', input); assert.equal(request.status, 201);
  assert.equal((await call('hr', `/employee-lifecycle/${request.body.id}/review`, review(request.body))).status, 403);
  assert.equal((await RequestModel.findById(request.body.id)).status, 'PENDING_REVIEW');
  assert.equal((await EmployeeModel.findById(input.employeeId)).status, 'active');
  const rejected = await call('hr2', `/employee-lifecycle/${request.body.id}/review`, review(request.body, 'REJECT')); assert.equal(rejected.status, 200); assert.equal(rejected.body.status, 'REJECTED');
  // Policy forbids self-approval, not lodging a request that another HR reviews.
  const own = await call('hr', '/employee-lifecycle', await proposal('hr', 'EXIT')); assert.equal(own.status, 201);
  assert.equal((await call('hr', `/employee-lifecycle/${own.body.id}/review`, review(own.body))).status, 403);
  assert.equal((await call('hr2', `/employee-lifecycle/${own.body.id}/review`, review(own.body, 'REJECT'))).status, 200);
  assert.equal((await EmployeeModel.findById(fixture.actors.hr.employee._id)).status, 'active');
});
test('exit application can resume after user update without usable partial state; exactly one employment history/security revision', async () => {
  const request = await call('hr', '/employee-lifecycle', await proposal('staff', 'EXIT')); assert.equal(request.status, 201);
  failAt = 'lifecycle-after-user'; const failed = await call('hr2', `/employee-lifecycle/${request.body.id}/review`, review(request.body)); assert.equal(failed.status, 500);
  assert.equal((await call('staff', '/auth/me')).status, 401);
  const pending = await RequestModel.findById(request.body.id); assert.equal(pending.status, 'APPLYING');
  const resumed = await call('hr2', `/employee-lifecycle/${request.body.id}/resume`, {}); assert.equal(resumed.status, 200, JSON.stringify(resumed.body)); assert.equal(resumed.body.status, 'COMPLETED');
  const employee = await EmployeeModel.findById(fixture.actors.staff.employee._id).lean(), user = await UserModel.findById(fixture.actors.staff.user._id).lean();
  assert.equal(employee.status, 'inactive'); assert.equal(user.status, 'disabled'); assert.equal(user.securityVersion, 1);
  assert.equal(employee.profileHistory.filter((event) => event.requestId === request.body.id).length, 1); assert.ok(user.authorization.grants.every((grant) => grant.revokedAt));
});
test('reactivation requires independent HR and employee password setup; old grants/password/tokens do not revive', async () => {
  await mongoose.connection.collection('authorization_controls').insertOne({ _id: 'scheduling-v1', enabled: true, approvalRef: 'OWNER_SCHEDULING_20261103' });
  const request = await call('hr', '/employee-lifecycle', await proposal('staff', 'REACTIVATE')); assert.equal(request.status, 201);
  const approved = await call('hr2', `/employee-lifecycle/${request.body.id}/review`, review(request.body)); assert.equal(approved.status, 200, JSON.stringify(approved.body)); assert.equal(approved.body.status, 'PENDING_ACTIVATION');
  assert.equal((await EmployeeModel.findById(fixture.actors.staff.employee._id)).status, 'inactive');
  const token = invitations.get(request.body.id); assert.ok(token); assert.doesNotMatch(JSON.stringify(approved.body), /recoveryTokenHash|recoveryPasswordHash|passwordHash/);
  const activated = await call(null, '/auth/reactivate', { token, newPassword: 'NewReactivateOnly@2026' }); assert.equal(activated.status, 204, JSON.stringify(activated.body));
  assert.equal((await call(null, '/auth/reactivate', { token, newPassword: 'ReplayNotAllowed@2026' })).status, 400);
  assert.equal((await call(null, '/auth/login', { username: fixture.actors.staff.user.username, password: fixture.password })).status, 401);
  const login = await call(null, '/auth/login', { username: fixture.actors.staff.user.username, password: 'NewReactivateOnly@2026' }); assert.equal(login.status, 200); fixture.actors.staff.token = login.body.accessToken;
  assert.equal(login.body.user.authorization.capabilities.includes('projects.assign'), false);
  assert.ok(login.body.user.authorization.capabilities.includes('schedules.read_self'));
  assert.equal(login.body.user.authorization.capabilities.includes('schedules.manage'), false);
  assert.equal((await EmployeeModel.findById(fixture.actors.staff.employee._id)).status, 'active');
});
test('transfer needs source+destination managers and independent HR, preserves raw data/history and does not auto-reassign tasks', async () => {
  const input = await proposal('staff', 'TRANSFER', { targetStoreId: String(fixture.stores[1]._id) });
  const request = await call('hr', '/employee-lifecycle', input); assert.equal(request.status, 201);
  let row = request.body;
  assert.equal((await call('smB', `/employee-lifecycle/${row.id}/confirm-store`, { storeId: String(fixture.stores[0]._id), expectedVersion: row.version, reason: 'Wrong source manager' })).status, 403);
  row = (await call('sm', `/employee-lifecycle/${row.id}/confirm-store`, { storeId: String(fixture.stores[0]._id), expectedVersion: row.version, reason: 'Source manager confirms handover arrangement' })).body;
  const pending = await call('hr2', `/employee-lifecycle/${row.id}/review`, review(row)); assert.equal(pending.status, 200); assert.equal(pending.body.status, 'PENDING_CONFIRMATIONS'); row = pending.body;
  assert.equal(String((await EmployeeModel.findById(input.employeeId)).storeId), String(fixture.stores[0]._id));
  row = (await call('smB', `/employee-lifecycle/${row.id}/confirm-store`, { storeId: String(fixture.stores[1]._id), expectedVersion: row.version, reason: 'Destination manager confirms' })).body;
  const project = await ProjectModel.create({ title: 'Existing pending task must be handled by CRM', storeId: fixture.stores[0]._id, storeMappingRef: 'fixture-work', departmentId: fixture.departmentId, assigneeId: fixture.actors.staff.employee._id, createdBy: fixture.actors.sm.employee._id, status: 'ASSIGNED', version: 1 });
  const wait = await call('hr2', `/employee-lifecycle/${row.id}/resume`, {}); assert.equal(wait.status, 200); assert.equal(wait.body.status, 'PENDING_HANDOVER');
  assert.equal(String((await ProjectModel.findById(project._id)).assigneeId), input.employeeId);
  // Isolated prerequisite fixture: actual CRM consent/handover is tested independently, not auto-applied by HR.
  await ProjectModel.updateOne({ _id: project._id }, { $set: { status: 'COMPLETED' } });
  const completed = await call('hr2', `/employee-lifecycle/${row.id}/resume`, {}); assert.equal(completed.status, 200, JSON.stringify(completed.body)); assert.equal(completed.body.status, 'COMPLETED');
  const employee = await EmployeeModel.findById(input.employeeId).lean(), user = await UserModel.findById(fixture.actors.staff.user._id).lean();
  assert.equal(String(employee.storeId), String(fixture.stores[1]._id)); assert.equal(employee.bank_account_number, 'NEVER_SEND_BANK');
  assert.ok(employee.profileHistory.some((event) => event.kind === 'TRANSFER'));
  assert.equal(user.authorization.grants.filter((grant) => !grant.revokedAt && grant.scope.kind === 'organization').every((grant) => grant.scope.storeIds.includes(String(fixture.stores[1]._id))), true);
  assert.equal((await call('staff', '/auth/me')).status, 401);
});
test('future effective date stays pending and concurrent HR decisions cannot double-apply', async () => {
  const request = await call('hr', '/employee-lifecycle', await proposal('staffB', 'EXIT', { effectiveAt: new Date(Date.now() + 86400000).toISOString() })); assert.equal(request.status, 201);
  const results = await Promise.all([call('hr2', `/employee-lifecycle/${request.body.id}/review`, review(request.body)), call('hr2', `/employee-lifecycle/${request.body.id}/review`, review(request.body))]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]); assert.equal(results.find((result) => result.status === 200).body.status, 'PENDING_EFFECTIVE');
  assert.equal((await EmployeeModel.findById(fixture.actors.staffB.employee._id)).status, 'active'); assert.equal((await UserModel.findById(fixture.actors.staffB.user._id)).securityVersion, 0);
});

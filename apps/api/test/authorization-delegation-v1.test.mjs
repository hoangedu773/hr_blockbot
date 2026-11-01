import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { AuthorizationDelegationModel } from '../dist/models/AuthorizationDelegation.js';
import { ManagementRelationModel } from '../dist/models/AuthorizationMapping.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { hasCapability } from '../dist/services/authorization-scope.service.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
let fixture, server, base;
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture(); await AuthorizationDelegationModel.init();
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function call(actor, path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${fixture.actors[actor].token}`, Connection: 'close', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}
function terms(extra = {}) {
  return { sourceGrantId: fixture.actors.sm.user.authorization.grants[1].id, recipientUserId: String(fixture.actors.ptch.user._id), capabilities: ['projects.create', 'projects.assign', 'reports.review'],
    scope: { kind: 'organization', storeIds: [String(fixture.stores[0]._id)], regionIds: [], reportingEmployeeIds: [] }, validFrom: new Date(Date.now() - 1000).toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString(), reason: 'Isolated bounded SM delegation', ...extra };
}
const review = (row) => ({ expectedVersion: row.version, decision: 'APPROVE', reason: 'Independent direct AM verification' });
const principal = async (actor) => resolvePrincipal({ sub: String(fixture.actors[actor].user._id), role: 'Employee', securityVersion: 0 });

test('delegation enforces fourteen days, approved capabilities, canonical scope and no chaining', async () => {
  assert.equal((await call('sm', '/delegations', terms({ validUntil: new Date(Date.now() + 15 * 86400000).toISOString() }))).status, 400);
  assert.equal((await call('sm', '/delegations', terms({ capabilities: ['accounts.manage'] }))).status, 403);
  assert.equal((await call('sm', '/delegations', terms({ scope: { kind: 'organization', storeIds: [String(fixture.stores[1]._id)] } }))).status, 403);
  assert.equal((await call('sm', '/delegations', terms({ recipientUserId: String(fixture.actors.staff.user._id) }))).status, 403);
  assert.equal((await call('ptch', '/delegations', terms())).status, 403);
});
test('only direct AM approves SM to PTCH; concurrent approvals have one winner, no self or higher-rank shortcut', async () => {
  const request = await call('sm', '/delegations', terms()); assert.equal(request.status, 201);
  for (const actor of ['sm', 'ptch', 'system_admin', 'hr', 'sam', 'om']) assert.equal((await call(actor, `/delegations/${request.body.id}/review`, review(request.body))).status, 403, actor);
  const approvals = await Promise.all([call('am', `/delegations/${request.body.id}/review`, review(request.body)), call('am', `/delegations/${request.body.id}/review`, review(request.body))]);
  assert.deepEqual(approvals.map((row) => row.status).sort(), [200, 409]);
  const delegated = await principal('ptch'); assert.equal(hasCapability(delegated, 'projects.assign'), true); assert.equal(hasCapability(delegated, 'employees.read_hr'), false);
  const project = await call('ptch', '/projects', { title: 'Delegated scoped assignment', departmentId: String(fixture.departmentId), storeId: String(fixture.stores[0]._id), assigneeId: String(fixture.actors.staff.employee._id), dueDate: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(project.status, 201, JSON.stringify(project.body));
  const other = await call('ptch', '/projects', { title: 'Forbidden same-department B', departmentId: String(fixture.departmentId), storeId: String(fixture.stores[1]._id), dueDate: new Date(Date.now() + 86400000).toISOString() }); assert.equal(other.status, 403);
  assert.equal((await call('ptch', '/delegations', terms())).status, 403);
  const approved = approvals.find((row) => row.status === 200).body;
  assert.equal((await call('sm', `/delegations/${approved.id}/revoke`, { expectedVersion: approved.version, reason: 'End delegated work' })).status, 200);
  assert.equal(hasCapability(await principal('ptch'), 'projects.assign'), false);
});
test('root revoke, reviewer relation revoke, expiry and audit tampering invalidate delegated authority immediately', async () => {
  for (const scenario of ['source', 'relation', 'expiry', 'audit']) {
    const request = await call('sm', '/delegations', terms()); assert.equal(request.status, 201);
    const approval = await call('am', `/delegations/${request.body.id}/review`, review(request.body)); assert.equal(approval.status, 200);
    assert.equal(hasCapability(await principal('ptch'), 'projects.assign'), true);
    if (scenario === 'source') await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $set: { 'authorization.grants.1.revokedAt': new Date().toISOString() } });
    if (scenario === 'relation') await ManagementRelationModel.updateOne({ managerEmployeeId: fixture.actors.am.employee._id, employeeId: fixture.actors.sm.employee._id }, { $set: { revokedAt: new Date() } });
    if (scenario === 'expiry') await AuthorizationDelegationModel.updateOne({ _id: request.body.id }, { $set: { validUntil: new Date(Date.now() - 1000) } });
    if (scenario === 'audit') await AuthorizationDelegationModel.updateOne({ _id: request.body.id }, { $set: { 'history.1.actorUserId': String(fixture.actors.om.user._id) } });
    assert.equal(hasCapability(await principal('ptch'), 'projects.assign'), false, scenario);
    await AuthorizationDelegationModel.updateMany({ recipientUserId: fixture.actors.ptch.user._id }, { $set: { status: 'REVOKED' } });
    await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $set: { 'authorization.grants.1.revokedAt': null } });
    await ManagementRelationModel.updateOne({ managerEmployeeId: fixture.actors.am.employee._id, employeeId: fixture.actors.sm.employee._id }, { $set: { revokedAt: null } });
  }
});
test('OM to AOM stays pending without an explicitly verified independent approver', async () => {
  const request = await call('om', '/delegations', terms({ sourceGrantId: fixture.actors.om.user.authorization.grants[1].id, recipientUserId: String(fixture.actors.aom.user._id) })); assert.equal(request.status, 201);
  for (const actor of ['om', 'sam', 'am', 'system_admin']) assert.equal((await call(actor, `/delegations/${request.body.id}/review`, review(request.body))).status, 403);
  assert.equal(hasCapability(await principal('aom'), 'projects.assign'), false);
  assert.equal((await AuthorizationDelegationModel.findById(request.body.id)).status, 'PENDING');
});

import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { ProjectModel } from '../dist/models/Project.js';
import { OnboardingRequestModel } from '../dist/models/OnboardingRequest.js';
import { verifyProjectAudit, auditEntry } from '../dist/services/project-audit.service.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
let fixture, server, base, failAt = null;
const invitations = new Map();
async function call(actor, path, body, method = body ? 'POST' : 'GET') {
  const response = await fetch(base + '/api' + path, { method, headers: { Connection: 'close', ...(actor ? { Authorization: `Bearer ${fixture.actors[actor]?.token ?? actor}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
const proposed = (code) => ({ clientRequestId: randomUUID(), fullName: `Isolated new ${code}`, phone: 'fixture-phone-only', storeId: String(fixture.stores[0]._id), hiredAt: new Date().toISOString(), reason: 'Isolated workflow verification' });
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  server = createServer(createApp({ onboarding: { deliverActivation: async (invitation) => { invitations.set(invitation.requestId, invitation.token); },
    failpoint: (stage) => { if (failAt === stage) { failAt = null; throw new Error('ISOLATED_FAILPOINT'); } } } }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });

test('no global Admin bypass: unconfigured legacy flags do not authorize CRM, users or provider settings', async () => {
  const user = await UserModel.create({ username: 'legacy-flag-without-grants', passwordHash: 'unused', role: 'Admin', isGlobalAdmin: true });
  const token = await signAccessToken({ sub: String(user._id), role: 'Admin' });
  for (const path of ['/employees', '/projects', '/admin/users', '/admin/llm-providers', '/dashboard/overview', '/stores']) {
    const result = await call(token, path); assert.equal(result.status, 403, path);
  }
});

test('same department is not authority: SM A cannot read staff/store/project B; minimal directory has no HR data', async () => {
  const other = fixture.actors.staffB.employee;
  assert.equal((await call('sm', `/employees/${other._id}`)).status, 404);
  assert.equal((await call('sm', `/stores/${fixture.stores[1]._id}`)).status, 403);
  const list = await call('sm', '/employees'); assert.equal(list.status, 200);
  assert.equal(list.body.items.some((row) => row.employeeId === String(other._id)), false);
  const directory = await call('staff', '/directory'); assert.equal(directory.status, 200);
  assert.ok(directory.body.items.length > 0);
  // CRM Completion V1 D2 explicitly adds code/name lookup to the minimal directory.
  for (const row of directory.body.items) assert.deepEqual(Object.keys(row).sort(), ['employeeCode', 'employeeId', 'fullName', 'jobTitle', 'storeId'].sort());
  assert.doesNotMatch(JSON.stringify(directory.body), /NEVER_SEND_BANK|phone|hiredAt|passwordHash|skills/);
});

test('HR grants are field/workflow specific; system admin gets no HR or operational management permission', async () => {
  const employeeId = fixture.actors.staff.employee._id;
  const hr = await call('hr', `/employees/${employeeId}/management`); assert.equal(hr.status, 200);
  assert.equal(hr.body.phone, 'fixture-contact'); assert.doesNotMatch(JSON.stringify(hr.body), /NEVER_SEND_BANK|bank_account|salary|leave_reason/);
  assert.equal((await call('system_admin', `/employees/${employeeId}/management`)).status, 404);
  assert.equal((await call('hr', '/admin/users')).status, 403);
  assert.equal((await call('hr', '/admin/llm-providers')).status, 403);
  assert.equal((await call('system_admin', '/admin/users')).status, 200);
  const createBody = { title: 'Not operational authority', departmentId: String(fixture.departmentId), storeId: String(fixture.stores[0]._id), dueDate: new Date(Date.now() + 86400000).toISOString() };
  for (const role of ['system_admin', 'hr', 'aom', 'ptch', 'staff']) assert.equal((await call(role, '/projects', createBody)).status, 403, role);
});

test('SM proposes, HR independently approves, concurrent decisions provision exactly one pending staff account', async () => {
  assert.equal((await call('sm', '/admin/users', { username: 'forbidden-active-staff', password: 'NeverAllowed@2026', role: 'Employee' })).status, 403);
  assert.equal((await call('sm', '/onboarding', { ...proposed('NEW-V1-A'), role: 'Admin' })).status, 400);
  const request = await call('sm', '/onboarding', proposed('NEW-V1-A')); assert.equal(request.status, 201); assert.equal(request.body.status, 'PENDING_HR_REVIEW');
  const username = request.body.payload.employeeCode.toLowerCase();
  const results = await Promise.all(['hr', 'hr2'].map((actor) => call(actor, `/onboarding/${request.body.id}/review`, { decision: 'APPROVE', expectedVersion: request.body.version, reason: 'Verified fixture identity/store' })));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  assert.equal(await UserModel.countDocuments({ username }), 1);
  assert.equal(await EmployeeModel.countDocuments({ personnelKey: username }), 1);
  const accepted = results.find((result) => result.status === 200).body;
  assert.equal(accepted.status, 'PENDING_ACTIVATION');
  assert.doesNotMatch(JSON.stringify(accepted), /passwordHash|activationTokenHash|activationPasswordHash|temporaryPassword/);
  assert.equal((await UserModel.findById(accepted.userId)).status, 'pending_activation');
  assert.equal((await EmployeeModel.findById(accepted.employeeId)).status, 'inactive');
  assert.equal((await call(null, '/auth/login', { username, password: 'anything' })).status, 401);
  const token = invitations.get(request.body.id); assert.ok(token);
  assert.equal((await call(null, '/auth/activate', { token, newPassword: 'RecipientPrivate@2026' })).status, 204);
  assert.equal((await call(null, '/auth/activate', { token, newPassword: 'ReplayNotAllowed@2026' })).status, 400);
  const login = await call(null, '/auth/login', { username, password: 'RecipientPrivate@2026' }); assert.equal(login.status, 200);
  const me = await call(login.body.accessToken, '/auth/me');
  assert.equal(me.body.authorization.profile, 'staff'); assert.equal(me.body.mustChangePassword, false);
  assert.equal(me.body.authorization.grants.some((grant) => grant.capabilities.includes('accounts.manage')), false);
  assert.equal((await call(login.body.accessToken, `/employees/${fixture.actors.staffB.employee._id}`)).status, 403);
});

test('draft and HR profile alone do not replace independent explicit review grants', async () => {
  const draft = await call('hr', '/onboarding', proposed('NEW-V1-DRAFT')); assert.equal(draft.status, 201); assert.equal(draft.body.status, 'DRAFT');
  const submitted = await call('hr', `/onboarding/${draft.body.id}/submit`, { expectedVersion: draft.body.version }); assert.equal(submitted.status, 200);
  assert.equal((await call('hr', `/onboarding/${draft.body.id}/review`, { decision: 'APPROVE', expectedVersion: submitted.body.version, reason: 'Cannot self approve' })).status, 403);
  const hr2 = await UserModel.findById(fixture.actors.hr2.user._id);
  const saved = structuredClone(hr2.authorization);
  hr2.authorization = { ...saved, grants: saved.grants.map((grant) => ({ ...grant, capabilities: grant.capabilities.filter((cap) => cap !== 'onboarding.review') })) };
  await hr2.save();
  assert.equal((await call('hr2', `/onboarding/${draft.body.id}/review`, { decision: 'APPROVE', expectedVersion: submitted.body.version, reason: 'Profile alone denied' })).status, 403);
  hr2.authorization = saved; await hr2.save();
  assert.equal((await call('hr2', `/onboarding/${draft.body.id}/review`, { decision: 'REJECT', expectedVersion: submitted.body.version, reason: 'Missing verified information' })).status, 200);
  assert.equal(await UserModel.countDocuments({ username: draft.body.payload.employeeCode.toLowerCase() }), 0);
});

test('partial provisioning and activation resume safely; no usable active account at any intermediate failure', async () => {
  const created = await call('sm', '/onboarding', proposed('NEW-V1-RECOVER')); assert.equal(created.status, 201);
  const username = created.body.payload.employeeCode.toLowerCase();
  failAt = 'after-employee';
  assert.equal((await call('hr', `/onboarding/${created.body.id}/review`, { decision: 'APPROVE', expectedVersion: created.body.version, reason: 'Verified before injected failure' })).status, 500);
  assert.equal((await EmployeeModel.findOne({ personnelKey: username })).status, 'inactive');
  assert.equal(await UserModel.countDocuments({ username }), 0);
  const resumed = await call('hr', `/onboarding/${created.body.id}/resume`, {}); assert.equal(resumed.status, 200);
  const token = invitations.get(created.body.id); assert.ok(token);
  failAt = 'activation-after-user';
  assert.equal((await call(null, '/auth/activate', { token, newPassword: 'RecoveryRecipient@2026' })).status, 500);
  assert.equal((await call(null, '/auth/login', { username, password: 'RecoveryRecipient@2026' })).status, 401);
  assert.equal((await call('hr', `/onboarding/${created.body.id}/resume`, {})).body.status, 'ACTIVE');
  assert.equal((await call(null, '/auth/login', { username, password: 'RecoveryRecipient@2026' })).status, 200);
  assert.equal(await EmployeeModel.countDocuments({ personnelKey: username }), 1); assert.equal(await UserModel.countDocuments({ username }), 1);
});

test('CRM manager may review work they assigned, but staff and system admin cannot review; consent/audit remain real', async () => {
  const created = await call('sm', '/projects', { title: 'V1 real CRM work', storeId: String(fixture.stores[0]._id), departmentId: String(fixture.departmentId), dueDate: new Date(Date.now() + 86400000).toISOString() });
  assert.equal(created.status, 201, JSON.stringify(created.body)); const id = created.body.id;
  let current = (await call('sm', `/projects/${id}`)).body;
  let result = await call('sm', `/projects/${id}/assign`, { assigneeId: String(fixture.actors.staff.employee._id), expectedVersion: current.version }); assert.equal(result.status, 200);
  current = (await call('staff', `/projects/${id}`)).body;
  assert.equal(current.responsibleEmployeeId, null);
  assert.equal((await call('staff', `/projects/${id}/assignment/respond`, { action: 'ACCEPT', expectedVersion: current.version })).status, 200);
  current = (await call('staff', `/projects/${id}`)).body;
  assert.equal((await call('staff', `/projects/${id}/transition`, { targetStatus: 'IN_PROGRESS', expectedVersion: current.version })).status, 200);
  current = (await call('staff', `/projects/${id}`)).body;
  result = await call('staff', '/reports', { projectId: id, content: 'Real authorized report', attachments: [], expectedVersion: current.version }); assert.equal(result.status, 201);
  const reviewBody = { action: 'APPROVE', expectedVersion: result.body.version, reason: 'Checked the submitted work' };
  assert.equal((await call('staff', `/reports/${result.body.reportId}/review`, reviewBody)).status, 403);
  assert.equal((await call('system_admin', `/reports/${result.body.reportId}/review`, reviewBody)).status, 403);
  assert.equal((await call('sm', `/reports/${result.body.reportId}/review`, reviewBody)).status, 200);
  const stored = await ProjectModel.findById(id).lean(); assert.equal(stored.status, 'COMPLETED'); assert.equal(verifyProjectAudit(stored), true);
  assert.equal(stored.assignmentAudit.at(-1).stateVersion, 3);
  const changedScope = { ...stored, storeId: fixture.stores[1]._id }; assert.equal(verifyProjectAudit(changedScope), false);
});

test('technical status changes are audited, revoke old tokens, cannot self-elevate or activate an unreviewed account', async () => {
  const target = fixture.actors.staffB.user;
  const disabled = await call('system_admin', `/admin/users/${target._id}`, { status: 'disabled', expectedVersion: 0, reason: 'Isolated security test' }, 'PATCH'); assert.equal(disabled.status, 200);
  assert.equal((await call('staffB', '/auth/me')).status, 401);
  const saved = await UserModel.findById(target._id).lean(); assert.equal(saved.securityVersion, 1); assert.ok(saved.securityAudit.at(-1).hash);
  const self = fixture.actors.system_admin.user;
  assert.equal((await call('system_admin', `/admin/users/${self._id}`, { status: 'disabled', expectedVersion: 0, reason: 'Self action must be denied' }, 'PATCH')).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${self._id}`, { role: 'Admin', isGlobalAdmin: true, expectedVersion: 0, reason: 'Not grant authority' }, 'PATCH')).status, 400);
});

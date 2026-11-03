import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { OnboardingRequestModel } from '../dist/models/OnboardingRequest.js';
import { AuthorizationDelegationModel } from '../dist/models/AuthorizationDelegation.js';
import { EmployeeLifecycleRequestModel } from '../dist/models/EmployeeLifecycleRequest.js';
import { createLoginSession, verifyPassword, signAccessToken } from '../dist/services/auth.service.js';
import { accountAuditHead } from '../dist/services/account-security.service.js';
import { digest } from '../dist/services/project-audit.service.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
let fixture, server, plainServer, base, plainBase, failAt, beforeConsume, deliveryFails = false, count = 0;
const delivered = [], onboardingTokens = new Map();
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  await Promise.all([AuthorizationDelegationModel.init(), EmployeeLifecycleRequestModel.init()]);
  const failpoint = (stage) => { if (stage === failAt) { failAt = null; throw new Error('ISOLATED_WORKFLOW_INTERRUPTION'); } };
  server = createServer(createApp({ recovery: { deliverRecovery: async (invitation) => { delivered.push(invitation); if (deliveryFails) throw new Error('NO_EXTERNAL_CHANNEL'); }, failpoint: (stage) => stage === 'recovery-before-consume' && beforeConsume ? beforeConsume() : failpoint(stage) },
    onboarding: { deliverActivation: async (invitation) => { onboardingTokens.set(invitation.requestId, invitation.token); }, failpoint } }));
  plainServer = createServer(createApp());
  await Promise.all([new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)), new Promise((resolve) => plainServer.listen(0, '127.0.0.1', resolve))]);
  base = `http://127.0.0.1:${server.address().port}/api`; plainBase = `http://127.0.0.1:${plainServer.address().port}/api`;
});
after(async () => { for (const item of [server, plainServer]) { item.closeAllConnections(); await new Promise((resolve) => item.close(resolve)); } await disconnectDB(); });
async function call(actor, path, body, origin = base, method = body ? 'POST' : 'GET') {
  const response = await fetch(origin + path, { method, headers: { Connection: 'close', ...(actor ? { Authorization: `Bearer ${fixture.actors[actor]?.token ?? actor}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function target() {
  const code = 'FOLLOWUP-' + (++count), employee = await EmployeeModel.create({ employeeCode: code, fullName: code, status: 'active', level: 'Junior', storeId: fixture.stores[0]._id, storeMappingRef: 'fixture-proof', departmentId: fixture.departmentId });
  const user = await UserModel.create({ username: code.toLowerCase(), passwordHash: fixture.actors.staff.user.passwordHash, employeeId: employee._id, role: 'Employee', authorization: fixture.actors.staff.user.authorization });
  await EmployeeModel.updateOne({ _id: employee._id }, { $set: { userId: user._id } });
  return { user, employee };
}
const issue = (row, version = 0, origin = base) => call('system_admin', `/admin/users/${row.user._id}/reset-password`, { expectedVersion: version, reason: 'Verified synthetic recovery request' }, origin);
const complete = (token, newPassword = 'RecoveredPrivate@2026') => call(null, '/auth/recover-password', { token, newPassword });
test('recovery without delivery fails closed with zero writes; nine profiles and self-service boundaries remain explicit', async () => {
  const row = await target(); const unchanged = await issue(row, 0, plainBase); assert.equal(unchanged.status, 503); assert.equal((await UserModel.findById(row.user._id)).securityVersion, 0);
  for (const actor of ['hr', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff']) assert.equal((await call(actor, `/admin/users/${row.user._id}/reset-password`, { expectedVersion: 0, reason: 'No technical grant' })).status, 403, actor);
  assert.equal((await call('system_admin', `/admin/users/${String(fixture.actors.system_admin.user._id).toUpperCase()}/reset-password`, { expectedVersion: 0, reason: 'Self recovery forbidden' })).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${row.user._id}/reset-password`, { expectedVersion: 0, reason: 'Strict', password: 'NotAllowed' })).status, 400);
  assert.equal(delivered.length, 0);
});
test('one-time recovery atomically changes password/consumption/version/audit and revokes access and refresh sessions without changing grants', async () => {
  const row = await target(), session = await createLoginSession(row.user, {}), grants = JSON.stringify(row.user.authorization);
  const result = await issue(row); assert.equal(result.status, 200, JSON.stringify(result)); assert.equal(result.body.securityVersion, 2);
  const invitation = delivered.at(-1); assert.match(invitation.token, /^[a-f0-9]{64}$/);
  assert.doesNotMatch(JSON.stringify(result.body), new RegExp(invitation.token + '|tokenHash|passwordHash|phone|bank'));
  const saved = await UserModel.findById(row.user._id).lean(); assert.notEqual(saved.passwordRecovery.tokenHash, invitation.token); assert.equal(saved.passwordRecovery.tokenHash, createHash('sha256').update(invitation.token).digest('hex'));
  assert.equal((await call(session.accessToken, '/auth/me')).status, 401);
  const refresh = await fetch(base + '/auth/refresh', { method: 'POST', headers: { Cookie: 'refreshToken=' + session.rawRefreshToken, Connection: 'close' } }); assert.equal(refresh.status, 401);
  assert.equal((await complete(invitation.token)).status, 204);
  assert.equal((await complete(invitation.token)).status, 400);
  const after = await UserModel.findById(row.user._id).lean(); assert.equal(after.securityVersion, 3); assert.equal(after.passwordRecovery.state, 'CONSUMED'); assert.equal(after.passwordRecovery.tokenHash, undefined);
  assert.equal(after.securityAudit.length, 3); assert.ok(accountAuditHead(after)); assert.equal(JSON.stringify(after.authorization), grants);
  assert.equal(await verifyPassword(after.passwordHash, fixture.password), false); assert.equal(await verifyPassword(after.passwordHash, 'RecoveredPrivate@2026'), true);
  assert.equal((await call(null, '/auth/login', { username: after.username, password: 'RecoveredPrivate@2026' })).status, 200);
});
test('concurrent token consumption has exactly one winner and cannot replace the winning password', async () => {
  const row = await target(); assert.equal((await issue(row)).status, 200); const token = delivered.at(-1).token;
  const results = await Promise.all([complete(token, 'ConcurrentFirst@2026'), complete(token, 'ConcurrentOther@2026')]);
  assert.equal(results.filter((item) => item.status === 204).length, 1); assert.ok(results.some((item) => [400, 409].includes(item.status)));
  const saved = await UserModel.findById(row.user._id).lean(); assert.equal(saved.securityVersion, 3); assert.equal(saved.securityAudit.length, 3);
});
test('expired, replaced and security-version-invalidated recovery links cannot be replayed', async (context) => {
  const row = await target(); await issue(row); const first = delivered.at(-1).token;
  const intact = await UserModel.findById(row.user._id).lean(); assert.ok(accountAuditHead(intact)); assert.equal(intact.securityAudit.at(-1).recoveryHash, digest(intact.passwordRecovery));
  // Move only the test clock, not the signed/audited expiry snapshot. Otherwise
  // an expiry test could pass because tamper validation, not time, rejected it.
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() + 86400001 });
  try { assert.equal((await complete(first)).status, 400); } finally { context.mock.timers.reset(); }
  assert.equal((await issue(row, 2)).status, 200); const second = delivered.at(-1).token; assert.notEqual(second, first); assert.equal((await complete(first)).status, 400);
  assert.equal((await call('system_admin', `/admin/users/${row.user._id}`, { status: 'disabled', expectedVersion: 4, reason: 'Security response' }, base, 'PATCH')).status, 200);
  assert.equal((await complete(second)).status, 400); assert.equal((await issue(row, 5)).status, 409);
});
test('delivery failure and interruptions after issue/delivery recover only by a new audited token; no pending token is usable', async () => {
  for (const stage of ['delivery-failure', 'recovery-after-issued', 'recovery-after-delivery']) {
    const row = await target(); deliveryFails = stage === 'delivery-failure'; failAt = stage === 'delivery-failure' ? null : stage;
    const start = delivered.length, response = await issue(row); assert.equal(response.status, deliveryFails ? 503 : 500); deliveryFails = false;
    const broken = await UserModel.findById(row.user._id).lean(); assert.ok(['FAILED', 'PENDING'].includes(broken.passwordRecovery.state));
    if (delivered.length > start) assert.equal((await complete(delivered.at(-1).token)).status, 400);
    assert.equal((await issue(row, broken.securityVersion)).status, 200); assert.equal((await complete(delivered.at(-1).token)).status, 204); assert.ok(accountAuditHead(await UserModel.findById(row.user._id).lean()));
  }
});
test('interrupted response after consumption is not replayable, account is usable only with the new password', async () => {
  const row = await target(); await issue(row); const token = delivered.at(-1).token; failAt = 'recovery-after-consumed';
  assert.equal((await complete(token)).status, 500); assert.equal((await complete(token)).status, 400);
  assert.equal((await UserModel.findById(row.user._id)).passwordRecovery.state, 'CONSUMED');
  assert.equal((await call(null, '/auth/login', { username: row.user.username, password: 'RecoveredPrivate@2026' })).status, 200);
});
test('recovery rejects HR-inactive/partially provisioned targets and a revoked issuer or tampered audit', async () => {
  const inactive = await target(); await EmployeeModel.updateOne({ _id: inactive.employee._id }, { $set: { status: 'inactive' } }); assert.equal((await issue(inactive)).status, 409);
  const partial = await target(); await UserModel.updateOne({ _id: partial.user._id }, { $set: { provisioningRequestId: new mongoose.Types.ObjectId() } }); assert.equal((await issue(partial)).status, 409);
  const row = await target(); await issue(row); const token = delivered.at(-1).token;
  await UserModel.updateOne({ _id: fixture.actors.system_admin.user._id }, { $set: { 'authorization.grants.1.revokedAt': new Date().toISOString() } }); assert.equal((await complete(token)).status, 400);
  await UserModel.updateOne({ _id: fixture.actors.system_admin.user._id }, { $set: { 'authorization.grants.1.revokedAt': null } });
  await UserModel.updateOne({ _id: row.user._id }, { $set: { 'securityAudit.0.reason': 'Tampered' } }); assert.equal((await complete(token)).status, 409);
});
test('issuer revocation while password hashing is in flight is rechecked under the shared security lock before consumption', async () => {
  const row = await target(); await issue(row); const token = delivered.at(-1).token;
  beforeConsume = async () => { await UserModel.updateOne({ _id: fixture.actors.system_admin.user._id }, { $set: { 'authorization.grants.1.revokedAt': new Date().toISOString() } }); };
  try { assert.equal((await complete(token)).status, 403); const saved = await UserModel.findById(row.user._id); assert.equal(saved.securityVersion, 2); assert.equal(saved.passwordRecovery.state, 'DELIVERED'); assert.equal(await verifyPassword(saved.passwordHash, fixture.password), true); }
  finally { beforeConsume = null; await UserModel.updateOne({ _id: fixture.actors.system_admin.user._id }, { $set: { 'authorization.grants.1.revokedAt': null } }); }
});
const proposal = () => ({ clientRequestId: randomUUID(), fullName: 'Original synthetic name', storeId: String(fixture.stores[0]._id), hiredAt: new Date().toISOString(), phone: 'synthetic-contact', reason: 'Synthetic proposal' });
test('rejected onboarding is amended/resubmitted with identical identity, retained snapshots, CAS and a fresh independent review', async () => {
  const created = await call('sm', '/onboarding', proposal('FOLLOWUP-RESUBMIT')); assert.equal(created.status, 201);
  const rejected = await call('hr', `/onboarding/${created.body.id}/review`, { expectedVersion: 1, decision: 'REJECT', reason: 'Correct verified contact first' }); assert.equal(rejected.status, 200);
  const input = { expectedVersion: rejected.body.version, fullName: 'Corrected synthetic name', phone: 'corrected-contact', hiredAt: new Date().toISOString(), reason: 'Correction for HR re-review' };
  assert.equal((await call('hr2', `/onboarding/${created.body.id}/resubmit`, input)).status, 404);
  assert.equal((await call('sm', `/onboarding/${created.body.id}/resubmit`, { ...input, employeeCode: 'NEW-IDENTITY' })).status, 400);
  const results = await Promise.all([call('sm', `/onboarding/${created.body.id}/resubmit`, input), call('sm', `/onboarding/${created.body.id}/resubmit`, input)]); assert.deepEqual(results.map((item) => item.status).sort(), [200, 409]);
  const saved = await OnboardingRequestModel.findById(created.body.id).lean(); assert.equal(saved.status, 'PENDING_HR_REVIEW'); assert.equal(String(saved.employeeId), created.body.employeeId); assert.equal(String(saved.userId), created.body.userId);
  assert.equal(saved.history[1].reason, 'Correct verified contact first'); assert.equal(saved.history[2].beforePayload.fullName, 'Original synthetic name'); assert.equal(saved.history[2].afterPayload.fullName, input.fullName); assert.equal(saved.history[2].previousHash, saved.history[1].hash);
  assert.equal(await UserModel.countDocuments({ username: created.body.payload.employeeCode.toLowerCase() }), 0);
  assert.equal((await call('sm', `/onboarding/${created.body.id}/review`, { expectedVersion: saved.version, decision: 'APPROVE', reason: 'No self approval' })).status, 403);
  const accepted = await call('hr2', `/onboarding/${created.body.id}/review`, { expectedVersion: saved.version, decision: 'APPROVE', reason: 'Independently verified correction' }); assert.equal(accepted.status, 200, JSON.stringify(accepted)); assert.equal(accepted.body.userId, created.body.userId);
  assert.equal(await UserModel.countDocuments({ username: created.body.payload.employeeCode.toLowerCase() }), 1);
});
test('provisioning after-user and activation after-employee interruptions remain fenced, preserve one identity and resume under CAS', async () => {
  const created = await call('sm', '/onboarding', proposal('FOLLOWUP-INTERRUPTION')); failAt = 'after-user';
  assert.equal((await call('hr', `/onboarding/${created.body.id}/review`, { expectedVersion: 1, decision: 'APPROVE', reason: 'Verified' })).status, 500);
  assert.equal((await UserModel.findById(created.body.userId)).status, 'pending_activation');
  assert.equal((await call('hr', `/onboarding/${created.body.id}/resume`, {})).status, 200); const token = onboardingTokens.get(created.body.id); failAt = 'activation-after-employee';
  assert.equal((await call(null, '/auth/activate', { token, newPassword: 'InterruptedPrivate@2026' })).status, 500);
  assert.equal((await call(null, '/auth/login', { username: created.body.payload.employeeCode.toLowerCase(), password: 'InterruptedPrivate@2026' })).status, 401);
  const resumed = await Promise.all([call('hr', `/onboarding/${created.body.id}/resume`, {}), call('hr2', `/onboarding/${created.body.id}/resume`, {})]); assert.equal(resumed.filter((item) => item.status === 200).length, 1); assert.ok(resumed.some((item) => item.status === 409));
  assert.equal((await call(null, '/auth/login', { username: created.body.payload.employeeCode.toLowerCase(), password: 'InterruptedPrivate@2026' })).status, 200);
  assert.equal((await UserModel.findById(created.body.userId)).securityVersion, 1); assert.equal(await EmployeeModel.countDocuments({ personnelKey: created.body.payload.employeeCode.toLowerCase() }), 1);
});
test('onboarding pagination reaches more than 100 old records and detail/history enforces the same current scope', async () => {
  const now = new Date(), ids = [];
  for (let index = 0; index < 125; index++) ids.push({ _id: new mongoose.Types.ObjectId(), employeeKey: 'synthetic-history-' + index, payload: { ...proposal(), employeeCode: 'synthetic-history-' + index }, storeId: fixture.stores[0]._id, requestedBy: fixture.actors.sm.user._id, requesterEmployeeId: fixture.actors.sm.employee._id, employeeId: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), status: 'REJECTED', version: 1, history: [], createdAt: now, updatedAt: now });
  await OnboardingRequestModel.collection.insertMany(ids);
  const first = await call('sm', '/onboarding?page=1&limit=100'), last = await call('sm', '/onboarding?page=2&limit=100');
  assert.equal(first.body.items.length, 100); assert.ok(last.body.items.length >= 25); assert.equal(first.body.paging.totalItems, last.body.paging.totalItems); assert.equal(first.body.items.some((row) => last.body.items.some((old) => old.id === row.id)), false);
  const id = last.body.items.at(-1).id; assert.equal((await call('sm', '/onboarding/' + id)).status, 200); assert.equal((await call('staffB', '/onboarding/' + id)).status, 403); assert.equal((await call('system_admin', '/onboarding/' + id)).status, 403);
  assert.equal(first.body.items[0].historyIncluded, false); assert.deepEqual(first.body.items[0].history, []);
  assert.equal((await call('sm', '/onboarding/' + ids[0]._id)).body.auditIntegrity, 'LEGACY_UNVERIFIED');
  assert.equal((await call('sm', '/onboarding?page=0&limit=1000')).status, 400);
});
test('lifecycle authorization precedes paging/count: foreign-store transfers cannot hide older authorized history', async () => {
  const rows = Array.from({ length: 125 }, (_, i) => ({ employeeId: fixture.actors.staff.employee._id, kind: 'TRANSFER', sourceStoreId: fixture.stores[0]._id, targetStoreId: fixture.stores[1]._id, requestedBy: fixture.actors.hr.user._id, requesterEmployeeId: fixture.actors.hr.employee._id, status: 'REJECTED', version: 1, confirmations: [], history: [], effectiveAt: new Date(), reason: 'Synthetic cross-scope', snapshot: {}, createdAt: new Date(Date.now() + i) }));
  const ownId = new mongoose.Types.ObjectId(); rows.push({ ...rows[0], _id: ownId, kind: 'EXIT', targetStoreId: null, createdAt: new Date(0) }); await EmployeeLifecycleRequestModel.collection.insertMany(rows);
  const hr = await call('hr', '/employee-lifecycle?limit=20'); assert.equal(hr.status, 200); assert.equal(hr.body.paging.totalItems, 1); assert.equal(hr.body.items[0].id, String(ownId));
  assert.equal((await call('hr', '/employee-lifecycle/' + ownId)).status, 200); assert.equal((await call('hr', '/employee-lifecycle/' + rows[0]._id)).status, 404);
  const sm = await call('sm', '/employee-lifecycle?page=7&limit=20'); assert.equal(sm.status, 200); assert.equal(sm.body.paging.totalItems, 125); assert.equal(sm.body.items.length, 5);
});
test('delegation history beyond 200 remains visible to an expired/revoked recipient but never grants authority or foreign-store review', async () => {
  const rows = Array.from({ length: 225 }, (_, i) => ({ delegationId: randomUUID(), sourceGrantId: fixture.actors.sm.user.authorization.grants[1].id, delegatorUserId: fixture.actors.sm.user._id, recipientUserId: fixture.actors.ptch.user._id, capabilities: ['projects.create'], scope: { kind: 'organization', storeIds: [String(fixture.stores[0]._id)], regionIds: [], reportingEmployeeIds: [] }, validFrom: new Date(0), validUntil: new Date(1), reason: 'Historical synthetic delegation', status: 'REVOKED', version: 1, history: [], createdAt: new Date(i) }));
  await AuthorizationDelegationModel.collection.insertMany(rows);
  const recipient = await call('ptch', '/delegations?page=3&limit=100'); assert.equal(recipient.status, 200); assert.equal(recipient.body.paging.totalItems, 225); assert.equal(recipient.body.items.length, 25);
  const id = recipient.body.items.at(-1).id; assert.equal((await call('ptch', '/delegations/' + id)).status, 200);
  const am = await call('am', '/delegations?page=3&limit=100'); assert.equal(am.body.paging.totalItems, 225); assert.equal(am.body.items.length, 25);
  const foreign = await call('staffB', '/delegations'); assert.equal(foreign.body.paging.totalItems, 0); assert.equal((await call('staffB', '/delegations/' + id)).status, 404);
  const me = await call('ptch', '/auth/me'); assert.equal(me.body.authorization.capabilities.includes('projects.create'), false);
});
test('old delegation without optional region/reporting arrays is readable within scope, malformed/cross-store scopes never enter review history', async () => {
  const raw = await AuthorizationDelegationModel.collection.findOne({ recipientUserId: fixture.actors.ptch.user._id });
  const legacyId = new mongoose.Types.ObjectId(), malformedId = new mongoose.Types.ObjectId(), foreignId = new mongoose.Types.ObjectId();
  await AuthorizationDelegationModel.collection.insertMany([
    { ...raw, _id: legacyId, delegationId: randomUUID(), scope: { kind: 'organization', storeIds: [String(fixture.stores[0]._id)] }, history: undefined },
    { ...raw, _id: malformedId, delegationId: randomUUID(), scope: { kind: 'organization', storeIds: [String(fixture.stores[0]._id)], regionIds: 'malformed' } },
    { ...raw, _id: foreignId, delegationId: randomUUID(), scope: { kind: 'organization', storeIds: [String(fixture.stores[0]._id), String(fixture.stores[1]._id)], regionIds: [] } },
  ]);
  const legacy = await call('am', '/delegations/' + legacyId); assert.equal(legacy.status, 200, JSON.stringify(legacy)); assert.equal(legacy.body.auditIntegrity, 'LEGACY_UNVERIFIED'); assert.deepEqual(legacy.body.scope.regionIds, []); assert.deepEqual(legacy.body.history, []);
  assert.equal((await call('am', '/delegations/' + malformedId)).status, 404); assert.equal((await call('am', '/delegations/' + foreignId)).status, 404);
  const list = await call('am', '/delegations?limit=100'); assert.equal(list.body.paging.totalItems, 226);
});

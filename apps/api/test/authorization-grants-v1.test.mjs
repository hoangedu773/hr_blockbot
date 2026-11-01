import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
let fixture, server, base;
before(async () => { await connectDB(); fixture = await authorizationV1Fixture(); server = createServer(createApp()); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = `http://127.0.0.1:${server.address().port}/api`; });
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function call(actor, path, body, method = body ? 'POST' : 'GET') {
  const res = await fetch(base + path, { method, headers: { Authorization: `Bearer ${fixture.actors[actor].token}`, Connection: 'close', ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: res.status, body: await res.json() };
}
const grant = (extra = {}) => ({ profile: 'hr', capabilities: ['employees.read_hr'], scope: { kind: 'organization', storeIds: [String(fixture.stores[0]._id)], regionIds: [], reportingEmployeeIds: [] }, validUntil: null, expectedVersion: 0, reason: 'Isolated explicit V1 configuration', ...extra });
test('technical admin cannot self-assign HR/OM or mutate own security through uppercase ObjectId', async () => {
  const id = String(fixture.actors.system_admin.user._id).toUpperCase();
  assert.equal((await call('system_admin', `/admin/users/${id}/grants`, grant({ profile: 'system_admin', capabilities: ['accounts.manage'], scope: { kind: 'system' } }))).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${id}`, { status: 'disabled', expectedVersion: 0, reason: 'Must deny self' }, 'PATCH')).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${id}/grants`, grant())).status, 403);
  const actor = await UserModel.findById(id); assert.equal(actor.securityVersion, 0); assert.equal(actor.status, 'active');
});
test('only APPROVED eligible capability/scope is configurable; no direct AOM/PTCH management or staff extra store', async () => {
  const hr = String(fixture.actors.hr.user._id), ptch = String(fixture.actors.ptch.user._id), staff = String(fixture.actors.staff.user._id);
  assert.equal((await call('hr', `/admin/users/${hr}/grant-scope`)).status, 403);
  const mapping = await call('system_admin', `/admin/users/${String(fixture.actors.am.user._id)}/grant-scope`);
  assert.equal(mapping.status, 200);
  assert.ok(mapping.body.stores.find((store) => store.id === String(fixture.stores[0]._id)).managedEmployeeIds.includes(String(fixture.actors.staff.employee._id)));
  assert.doesNotMatch(JSON.stringify(mapping.body), /fixture-contact|NEVER_SEND_BANK|Isolated V1|passwordHash/);
  assert.equal((await call('hr', `/admin/users/${hr}/grants`, grant())).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${hr}/grants`, grant({ capabilities: ['employees.read_sensitive'] }))).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${hr}/grants`, grant({ capabilities: ['promotion.approve'] }))).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${ptch}/grants`, grant({ profile: 'ptch', capabilities: ['projects.assign'] }))).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${staff}/grants`, grant({ profile: 'staff', capabilities: ['directory.read_store'], scope: { kind: 'organization', storeIds: [String(fixture.stores[1]._id)] } }))).status, 403);
  assert.equal((await call('system_admin', `/admin/users/${hr}/grants`, grant({ scope: { kind: 'organization', storeIds: ['f'.repeat(24)] } }))).status, 409);
});
test('grant configure and revoke are versioned/audited, preserve old grants and immediately invalidate old tokens', async () => {
  const target = String(fixture.actors.hr.user._id);
  const response = await call('system_admin', `/admin/users/${target}/grants`, grant()); assert.equal(response.status, 200); assert.equal(response.body.securityVersion, 1);
  assert.equal(response.body.authorization.grants.length, 3);
  assert.equal((await call('hr', '/auth/me')).status, 401);
  const newId = response.body.authorization.grants.at(-1).id;
  const concurrent = await Promise.all([call('system_admin', `/admin/users/${target}/grants/${newId}/revoke`, { expectedVersion: 1, reason: 'Revoke explicit grant' }), call('system_admin', `/admin/users/${target}/grants/${newId}/revoke`, { expectedVersion: 1, reason: 'Concurrent revoke' })]);
  assert.equal(concurrent.filter((row) => row.status === 200).length, 1);
  assert.ok(concurrent.some((row) => [404, 409].includes(row.status)));
  const user = await UserModel.findById(target); assert.equal(user.securityVersion, 2); assert.ok(user.authorization.grants.at(-1).revokedAt); assert.equal(user.securityAudit.length, 2);
  assert.equal(user.securityAudit[1].previousHash, user.securityAudit[0].hash);
  fixture.actors.hr.token = await signAccessToken({ sub: target, role: 'Employee', securityVersion: 2 });
  const audit = await call('system_admin', `/admin/users/${target}/security-audit`); assert.equal(audit.status, 200); assert.equal(audit.body.items.length, 2);
  assert.doesNotMatch(JSON.stringify(audit.body), /fixture-contact|NEVER_SEND_BANK|password|Isolated V1 hr/);
});
test('security audit allowlist also redacts unsafe imported before/after/type fields and flags invalid chains', async () => {
  const target = String(fixture.actors.ptch.user._id);
  await UserModel.updateOne({ _id: target }, { $push: { securityAudit: { at: new Date(), actorId: 'SYNTHETIC_HR_NAME', type: 'SYNTHETIC_SENSITIVE_REASON', before: { phone: 'DO_NOT_LEAK_CONTACT', bank: 'DO_NOT_LEAK_BANK', status: 'active', profile: 'ptch' }, after: { salary: 'DO_NOT_LEAK_PAY', securityVersion: 1 }, hash: 'f'.repeat(64), previousHash: '0'.repeat(64) } } });
  const result = await call('system_admin', `/admin/users/${target}/security-audit`);
  assert.equal(result.status, 200); assert.equal(result.body.integrityValid, false);
  assert.doesNotMatch(JSON.stringify(result.body), /DO_NOT_LEAK|SYNTHETIC_HR_NAME|SYNTHETIC_SENSITIVE_REASON|salary|phone|bank/);
  assert.deepEqual(result.body.items[0].before, { status: 'active', profile: 'ptch', securityVersion: null });
});

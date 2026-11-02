import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { RefreshSessionModel } from '../dist/models/RefreshSession.js';
import { createLoginSession, verifyPassword, signAccessToken } from '../dist/services/auth.service.js';
import { accountAuditHead } from '../dist/services/account-security.service.js';
import { digest } from '../dist/services/project-audit.service.js';
import { legacyApprovalTerms, legacyApprovalIntact } from '../dist/services/legacy-import-approval.service.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';

// These are explicit TEST_ONLY approvals in a fresh isolated DB, NOT approvals
// for source legacy identities or assertions about real management relationships.
let fixture, server, offServer, noDeliveryServer, base, offBase, noDeliveryBase;
let counter = 0, failAt, beforeConsume, deliveryFails = false;
const delivered = [];
const options = { enabled: true, allowTestOnly: true,
  deliverActivation: async invitation => { delivered.push(invitation); if (deliveryFails) throw new Error('TEST_ONLY_NO_CHANNEL'); },
  failpoint: async stage => { if (stage === 'legacy-before-consume' && beforeConsume) await beforeConsume(); if (stage === failAt) { failAt = null; throw new Error('TEST_ONLY_INTERRUPTION'); } } };
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  server = createServer(createApp({ legacyImport: options })); offServer = createServer(createApp());
  noDeliveryServer = createServer(createApp({ legacyImport: { enabled: true, allowTestOnly: true } }));
  for (const s of [server, offServer, noDeliveryServer]) await new Promise(r => s.listen(0, '127.0.0.1', r));
  [base, offBase, noDeliveryBase] = [server, offServer, noDeliveryServer].map(s => `http://127.0.0.1:${s.address().port}/api`);
});
after(async () => { for (const s of [server, offServer, noDeliveryServer]) { s?.closeAllConnections(); await new Promise(r => s.close(r)); } await disconnectDB(); });
async function call(actor, path, body, origin = base, method = body ? 'POST' : 'GET') {
  const response = await fetch(origin + path, { method, headers: { Connection: 'close', ...(actor ? { Authorization: 'Bearer ' + (fixture.actors[actor]?.token ?? actor) } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}
async function approvalFor(user, patch = {}) {
  const terms = { purpose: 'LEGACY_IMPORT', batchId: 'TEST_ONLY-' + randomUUID(), targetDatabase: mongoose.connection.name,
    userId: String(user._id), employeeId: String(user.employeeId), profile: 'staff', approvalKind: 'TEST_ONLY', authorityRef: 'USER_AUTHORIZED_SYNTHETIC_TECHNICAL_TEST_NOT_SOURCE_APPROVAL',
    stageRefs: Object.fromEntries(['accountState', 'profileAssignment', 'managementRelation', 'explicitGrant'].map(k => [k, 'TEST_ONLY_SEPARATE_' + k])),
    authorizationHash: digest(user.authorization), storeIds: [String(fixture.stores[0]._id)], validFrom: new Date(Date.now() - 60000).toISOString(), validUntil: new Date(Date.now() + 2 * 86400000).toISOString(), ...patch };
  const termsHash = digest(legacyApprovalTerms(terms));
  const event = { id: randomUUID(), type: 'TEST_ONLY_REGISTERED_OFFLINE', authorityRef: terms.authorityRef, termsHash, stateHash: digest({ status: 'APPROVED', version: 1 }), at: new Date().toISOString(), previousHash: '0'.repeat(64) };
  const row = { _id: new mongoose.Types.ObjectId(), ...terms, userId: new mongoose.Types.ObjectId(terms.userId), employeeId: new mongoose.Types.ObjectId(terms.employeeId), termsHash, status: 'APPROVED', version: 1, history: [{ ...event, hash: digest(event) }] };
  assert.equal(legacyApprovalIntact(row), true); await mongoose.connection.collection('legacy_import_approvals').insertOne(row); return row;
}
async function target({ status, mapping = true, authorization = true, approve = true } = {}) {
  const code = 'LEGACY-TEST-' + ++counter, id = new mongoose.Types.ObjectId();
  const employee = await EmployeeModel.create({ employeeCode: code, fullName: code, status: 'active', level: 'Junior', storeId: fixture.stores[0]._id, storeMappingRef: 'TEST_ONLY_CANONICAL', departmentId: fixture.departmentId, ...(mapping ? { userId: id } : {}) });
  const user = { _id: id, username: code.toLowerCase(), employeeId: employee._id, role: 'Employee', passwordHash: fixture.actors.staff.user.passwordHash,
    ...(authorization ? { authorization: structuredClone(fixture.actors.staff.user.authorization) } : {}), ...(status ? { status } : {}) };
  await UserModel.collection.insertOne(user);
  return { user, employee, approval: approve && authorization ? await approvalFor(user) : null };
}
const issue = (row, expectedVersion = 0, origin = base) => call('system_admin', `/admin/users/${row.user._id}/legacy-import-invitation`, { approvalId: String(row.approval?._id ?? new mongoose.Types.ObjectId()), expectedVersion, reason: 'TEST_ONLY explicit activation exercise' }, origin);
const complete = (token, newPassword = 'RecipientFreshLocal@2026') => call(null, '/auth/activate-legacy', { token, newPassword });
const saved = row => UserModel.findById(row.user._id).lean();
const login = (row, password = 'RecipientFreshLocal@2026') => call(null, '/auth/login', { username: row.user.username, password });

test('server OFF and missing delivery fail closed with no target writes or tokens', async () => {
  const row = await target(), before = digest(await saved(row));
  assert.equal((await issue(row, 0, offBase)).status, 503); assert.equal((await issue(row, 0, noDeliveryBase)).status, 503);
  assert.equal((await call(null, '/auth/activate-legacy', { token: 'a'.repeat(64), newPassword: 'FreshPrivateOnly@2026' }, offBase)).status, 503);
  assert.equal(digest(await saved(row)), before); assert.equal(delivered.length, 0);
});
test('unreviewed source identity cannot login or be activated without approved stages; no fake onboarding', async () => {
  const row = await target({ approve: false }), before = digest(await saved(row));
  assert.equal((await login(row, fixture.password)).status, 401); assert.equal((await issue(row)).status, 403);
  assert.equal(digest(await saved(row)), before); assert.equal(await mongoose.connection.collection('onboarding_requests').countDocuments(), 0);
  for (const actor of ['hr', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff']) assert.equal((await call(actor, `/admin/users/${row.user._id}/legacy-import-invitation`, { approvalId: String(new mongoose.Types.ObjectId()), expectedVersion: 0, reason: 'No implicit authority' })).status, 403, actor);
});
test('one-time import preserves IDs, employee and grants; password/audit/session changes are atomic', async () => {
  const row = await target(), oldSession = { accessToken: await signAccessToken({ sub: String(row.user._id), role: 'Employee', securityVersion: 0 }), rawRefreshToken: randomBytes(32).toString('hex') }, employeeBefore = digest(await EmployeeModel.collection.findOne({ _id: row.employee._id }));
  // Model an existing PRE-V1 session in this isolated fixture. V1 must not mint
  // a new login session for an unreviewed imported account.
  const oldRefresh = await RefreshSessionModel.create({userId:row.user._id,familyId:randomUUID(),securityVersion:0,tokenHash:createHash('sha256').update(oldSession.rawRefreshToken).digest('hex'),expiresAt:new Date(Date.now()+86400000),revokedAt:null});
  const issued = await issue(row); assert.equal(issued.status, 200, JSON.stringify(issued)); assert.equal(issued.body.securityVersion, 2);
  const token = delivered.at(-1).token; assert.match(token, /^[a-f0-9]{64}$/); assert.doesNotMatch(JSON.stringify(issued.body), new RegExp(token + '|tokenHash|passwordHash'));
  assert.equal((await login(row, fixture.password)).status, 401); assert.equal((await call(oldSession.accessToken, '/auth/me')).status, 401);
  assert.ok((await RefreshSessionModel.findById(oldRefresh._id).lean()).revokedAt);
  const refresh = await fetch(base + '/auth/refresh', { method: 'POST', headers: { Cookie: 'refreshToken=' + oldSession.rawRefreshToken, Connection: 'close' } }); assert.equal(refresh.status, 401);
  assert.equal((await call(null, '/auth/recover-password', { token, newPassword: 'WrongPurposeLocal@2026' })).status, 400);
  assert.equal((await call(null, '/auth/activate', { token, newPassword: 'WrongPurposeLocal@2026' })).status, 400);
  assert.equal((await complete(token)).status, 204); assert.equal((await complete(token)).status, 400);
  const after = await saved(row); assert.equal(after.securityVersion, 3); assert.equal(after.legacyImportActivation.state, 'CONSUMED'); assert.equal(after.legacyImportActivation.tokenHash, undefined); assert.equal(after.securityAudit.length, 3); assert.ok(accountAuditHead(after));
  assert.equal(digest(after.authorization), digest(row.user.authorization)); assert.equal(digest(await EmployeeModel.collection.findOne({ _id: row.employee._id })), employeeBefore);
  assert.equal(await verifyPassword(after.passwordHash, fixture.password), false); assert.equal(await verifyPassword(after.passwordHash, 'RecipientFreshLocal@2026'), true);
  const logged = await login(row); assert.equal(logged.status, 200, JSON.stringify(logged));
  assert.equal((await call(logged.body.accessToken, '/auth/me')).status, 200); assert.equal((await call(logged.body.accessToken, '/admin/users')).status, 403);
  assert.equal(await mongoose.connection.collection('onboarding_requests').countDocuments(), 0);
});
test('concurrent consumers have one winner, CAS rejects stale issue and neither loser overwrites password', async () => {
  const row = await target(); assert.equal((await issue(row, 1)).status, 409); const issued = await issue(row); assert.equal(issued.status, 200, JSON.stringify(issued)); const token = delivered.at(-1).token;
  const results = await Promise.all([complete(token, 'WinnerOnePrivate@2026'), complete(token, 'WinnerTwoPrivate@2026')]);
  assert.equal(results.filter(r => r.status === 204).length, 1); assert.ok(results.some(r => [400, 409].includes(r.status)));
  const after = await saved(row); assert.equal(after.securityVersion, 3); assert.equal(after.securityAudit.length, 3);
  const winner = results[0].status === 204 ? 'WinnerOnePrivate@2026' : 'WinnerTwoPrivate@2026'; assert.equal(await verifyPassword(after.passwordHash, winner), true);
});
test('expiry is checked using the clock and reissue invalidates the previous token', async context => {
  const row = await target(); await issue(row); const token = delivered.at(-1).token;
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() + 86400001 }); try { assert.equal((await complete(token)).status, 400); } finally { context.mock.timers.reset(); }
  assert.equal((await issue(row, 2)).status, 200); assert.equal((await complete(token)).status, 400); assert.equal((await complete(delivered.at(-1).token)).status, 204);
});
test('delivery failure and interrupted issuance resume by new audited invitation, not reuse of an unconfirmed token', async () => {
  for (const stage of ['delivery-failure', 'legacy-after-issued', 'legacy-after-delivery']) {
    const row = await target(), start = delivered.length; deliveryFails = stage === 'delivery-failure'; failAt = deliveryFails ? null : stage;
    assert.equal((await issue(row)).status, deliveryFails ? 503 : 500); deliveryFails = false;
    const partial = await saved(row); assert.ok(['PENDING', 'FAILED'].includes(partial.legacyImportActivation.state)); assert.equal(partial.status, 'pending_activation');
    if (delivered.length > start) assert.equal((await complete(delivered.at(-1).token)).status, 400);
    assert.equal((await issue(row, partial.securityVersion)).status, 200); assert.equal((await complete(delivered.at(-1).token)).status, 204); assert.ok(accountAuditHead(await saved(row)));
  }
});
test('inactive, locked, pending onboarding, missing/ambiguous/reverse-conflicting mapping are never imported', async () => {
  for (const kind of ['active', 'disabled', 'pending_activation', 'inactive', 'missing-reverse', 'orphan', 'duplicate', 'lifecycle', 'onboarding']) {
    const row = await target({ status: ['active', 'disabled', 'pending_activation'].includes(kind) ? kind : undefined, mapping: kind !== 'missing-reverse' });
    if (kind === 'inactive') await EmployeeModel.collection.updateOne({ _id: row.employee._id }, { $set: { status: 'inactive' } });
    if (kind === 'orphan') await EmployeeModel.collection.updateOne({ _id: row.employee._id }, { $set: { userId: new mongoose.Types.ObjectId() } });
    if (kind === 'duplicate') { await UserModel.collection.dropIndex('employeeId_1'); await UserModel.collection.insertOne({ _id: new mongoose.Types.ObjectId(), username: 'duplicate-' + counter, employeeId: row.employee._id, role: 'Employee', passwordHash: row.user.passwordHash }); }
    if (kind === 'lifecycle') await EmployeeModel.collection.updateOne({ _id: row.employee._id }, { $set: { lifecyclePendingRequestId: new mongoose.Types.ObjectId() } });
    if (kind === 'onboarding') await UserModel.collection.updateOne({ _id: row.user._id }, { $set: { provisioningRequestId: new mongoose.Types.ObjectId() } });
    assert.equal((await issue(row)).status, 409, kind);
    if (kind === 'duplicate') { await UserModel.collection.updateOne({ username: 'duplicate-' + counter }, { $unset: { employeeId: '' } }); await UserModel.collection.createIndex({ employeeId: 1 }, { unique: true, sparse: true }); }
  }
});
test('wrong database/identity/profile/scope, tampered terms and absent canonical mapping deny without target writes', async () => {
  for (const kind of ['db', 'user', 'profile', 'scope', 'tamper', 'canonical', 'draft']) {
    const row = await target();
    if (kind === 'canonical') await EmployeeModel.collection.updateOne({ _id: row.employee._id }, { $unset: { storeMappingRef: '' } });
    else if (kind === 'tamper' || kind === 'draft') await mongoose.connection.collection('legacy_import_approvals').updateOne({ _id: row.approval._id }, { $set: kind === 'tamper' ? { authorityRef: 'UNAPPROVED_TAMPER' } : { status: 'DRAFT' } });
    else row.approval = await approvalFor(row.user, kind === 'db' ? { targetDatabase: 'test_hr_wrong_db' } : kind === 'user' ? { userId: String(new mongoose.Types.ObjectId()) } : kind === 'profile' ? { profile: 'sm' } : { storeIds: [String(new mongoose.Types.ObjectId())] });
    const before = digest(await saved(row)), result = await issue(row); assert.ok([403, 409].includes(result.status), kind + JSON.stringify(result)); assert.equal(digest(await saved(row)), before);
  }
});
test('changed approval, employee, scope, securityVersion or audit after issuance cannot consume', async () => {
  for (const kind of ['approval', 'employee', 'grants', 'version', 'audit', 'approval-id']) {
    const row = await target(); assert.equal((await issue(row)).status,200); const token = delivered.at(-1).token;
    if (kind === 'approval') await mongoose.connection.collection('legacy_import_approvals').updateOne({ _id: row.approval._id }, { $set: { status: 'REVOKED' } });
    if (kind === 'employee') await EmployeeModel.collection.updateOne({ _id: row.employee._id }, { $set: { status: 'inactive' } });
    if (kind === 'grants') await UserModel.collection.updateOne({ _id: row.user._id }, { $set: { 'authorization.grants.0.revokedAt': new Date().toISOString() } });
    if (kind === 'version') await UserModel.collection.updateOne({ _id: row.user._id }, { $inc: { securityVersion: 1 } });
    if (kind === 'audit') await UserModel.collection.updateOne({ _id: row.user._id }, { $set: { 'securityAudit.0.reason': 'TAMPERED' } });
    if (kind === 'approval-id') { const other={...row.approval,_id:new mongoose.Types.ObjectId()}; await mongoose.connection.collection('legacy_import_approvals').insertOne(other); await UserModel.collection.updateOne({_id:row.user._id},{$set:{legacyImportApprovalId:other._id}}); }
    assert.ok([400, 409].includes((await complete(token)).status), kind); assert.notEqual((await saved(row)).status, 'active');
  }
});
test('issuer revoked while hashing is revalidated inside shared lock; invitation remains unconsumed', async () => {
  const row = await target(); await issue(row); const token = delivered.at(-1).token;
  beforeConsume = () => UserModel.collection.updateOne({ _id: fixture.actors.system_admin.user._id }, { $set: { 'authorization.grants.1.revokedAt': new Date().toISOString() } });
  try { assert.equal((await complete(token)).status, 403); assert.equal((await saved(row)).securityVersion, 2); }
  finally { beforeConsume = null; await UserModel.collection.updateOne({ _id: fixture.actors.system_admin.user._id }, { $set: { 'authorization.grants.1.revokedAt': null } }); }
});
test('compensating revoke is audited, monotonic and fences already active accounts and access/refresh tokens', async () => {
  const row = await target(); await issue(row); await complete(delivered.at(-1).token); const session = await createLoginSession(await UserModel.findById(row.user._id), {});
  const path = `/admin/legacy-import-approvals/${row.approval._id}/revoke`;
  assert.equal((await call('hr', path, { expectedVersion: 1, reason: 'No technical authority' })).status, 403);
  assert.equal((await call('system_admin', path, { expectedVersion: 2, reason: 'Stale' })).status, 409);
  assert.equal((await call('system_admin', path, { expectedVersion: 1, reason: 'TEST_ONLY compensating rollback, never restore passwords/sessions' })).status, 200);
  const after = await saved(row); assert.equal(after.status, 'disabled'); assert.equal(after.securityVersion, 4); assert.equal(after.securityAudit.length, 4); assert.ok(accountAuditHead(after));
  assert.equal(await verifyPassword(after.passwordHash, fixture.password), false); assert.equal((await call(session.accessToken, '/auth/me')).status, 401); assert.equal((await login(row)).status, 401);
  const refresh=await fetch(base+'/auth/refresh',{method:'POST',headers:{Cookie:'refreshToken='+session.rawRefreshToken,Connection:'close'}});assert.equal(refresh.status,401);
  assert.equal((await call('system_admin', path, { expectedVersion: 1, reason: 'Replay rollback' })).status, 409);
  const approval = await mongoose.connection.collection('legacy_import_approvals').findOne({ _id: row.approval._id }); assert.equal(legacyApprovalIntact(approval), true);
});
test('revoked/tampered approval fences login even if account-state write was interrupted', async () => {
  const row = await target(); await issue(row); await complete(delivered.at(-1).token);
  await mongoose.connection.collection('legacy_import_approvals').updateOne({ _id: row.approval._id }, { $set: { status: 'REVOKED' } });
  assert.equal((await saved(row)).status, 'active'); assert.equal((await login(row)).status, 401);
});
test('interruption after valid approval revoke is fenced and reconciliation resumes idempotently at current approval version', async()=>{
  const row=await target();assert.equal((await issue(row)).status,200);assert.equal((await complete(delivered.at(-1).token)).status,204);
  const path=`/admin/legacy-import-approvals/${row.approval._id}/revoke`;failAt='legacy-after-approval-revoked';
  assert.equal((await call('system_admin',path,{expectedVersion:1,reason:'TEST_ONLY interruption exercise'})).status,500);
  const revoked=await mongoose.connection.collection('legacy_import_approvals').findOne({_id:row.approval._id});assert.equal(revoked.status,'REVOKED');assert.equal(revoked.version,2);assert.equal(legacyApprovalIntact(revoked),true);
  assert.equal((await saved(row)).status,'active');assert.equal((await login(row)).status,401);
  assert.equal((await call('system_admin',path,{expectedVersion:1,reason:'Stale retry must deny'})).status,409);
  assert.equal((await call('system_admin',path,{expectedVersion:2,reason:'TEST_ONLY reconcile already approved revocation'})).status,200);
  assert.equal((await saved(row)).status,'disabled');assert.equal((await saved(row)).securityVersion,4);
  const auditHash=digest((await saved(row)).securityAudit);assert.equal((await call('system_admin',path,{expectedVersion:2,reason:'Idempotent retry'})).status,200);assert.equal(digest((await saved(row)).securityAudit),auditHash);
  assert.equal((await mongoose.connection.collection('legacy_import_approvals').findOne({_id:row.approval._id})).history.length,2);
});

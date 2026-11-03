import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { SmAppointmentModel } from '../dist/models/SmAppointment.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { smAppointmentDto } from '../dist/services/sm-appointment.service.js';
import { authorizationV1Fixture, testGrant } from './helpers/authorization-v1-fixture.mjs';

let f, server, base, unchanged;
before(async () => {
  await connectDB(); f = await authorizationV1Fixture();
  for (const actor of ['sm', 'am', 'ptch']) {
    const title = actor === 'sm' ? 'SM' : actor === 'am' ? 'SM (Cửa hàng trưởng)' : 'SM';
    await EmployeeModel.collection.updateOne({ _id: f.actors[actor].employee._id }, { $set: { job_title: title,
      hrmProfileMappingV1: { identityMappingVerified: true, sourceTitleVerified: true, sourceJobTitle: title } } });
  }
  unchanged = await snapshot();
  server = createServer(createApp()); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await disconnectDB(); });
async function snapshot() { return JSON.stringify(await Promise.all(['users', 'employees', 'management_relations', 'evaluations', 'projects'].map(name => mongoose.connection.collection(name).find({}).sort({ _id: 1 }).toArray()))); }
async function call(actor, path, body) {
  const res = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Connection: 'close', ...(actor ? { Authorization: 'Bearer ' + f.actors[actor].token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
}
const path = (actor = 'sm') => '/employees/' + f.actors[actor].employee._id + '/sm-appointments';
const proposal = (extra = {}) => ({ clientRequestId: randomUUID(), storeId: String(f.stores[0]._id), kind: 'SUPERVISORY', validFrom: new Date(Date.now() - 1000).toISOString(), validUntil: new Date(Date.now() + 86400000).toISOString(), basis: 'SIMULATION_APPROVED', evidenceRef: 'OWNER-SIMULATION-ASSIGNMENT', reason: 'Isolated approved position evidence', ...extra });
async function create(actor = 'sm', extra = {}) { const r = await call('hr', path(actor), proposal(extra)); assert.equal(r.status, 201, JSON.stringify(r.body)); return r.body; }
const decision = (row, action = 'APPROVE', extra = {}) => ({ action, expectedVersion: row.version, reason: 'Independent evidence checked', ...extra });
async function approve(row, actor = 'sm') { const r = await call('hr2', path(actor) + '/' + row.id + '/decision', decision(row)); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; }

test('all nine profiles require explicit existing HR authority; unauthenticated is 401', async () => {
  assert.equal((await call(null, path(), proposal())).status, 401);
  for (const actor of ['system_admin', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff']) assert.equal((await call(actor, path(), proposal())).status, 403, actor);
  const p = proposal(); const a = await call('hr', path(), p), b = await call('hr', path(), p);
  assert.equal(a.status, 201); assert.equal(b.body.id, a.body.id);
  assert.equal((await call('hr', path(), { ...p, reason: 'Different payload same key' })).status, 409);
  assert.equal(a.body.grade, 'UNKNOWN'); assert.equal(a.body.grantsChanged, false);
});
test('supervisory evidence is independently approved and changes no identity, role, grade, graph, grants or KPI', async () => {
  const row = await create();
  assert.equal((await call('hr', path() + '/' + row.id + '/decision', decision(row))).status, 403);
  const approved = await approve(row);
  assert.equal(approved.effectiveState, 'EFFECTIVE'); assert.equal(approved.auditIntegrity, 'VALID_LOCAL_CHAIN');
  assert.equal(approved.history.length, 2); assert.equal(approved.history[1].before, 'PENDING'); assert.equal(approved.history[1].after, 'APPROVED');
  assert.equal(await snapshot(), unchanged);
  assert.equal((await call('sm', path() + '/' + row.id)).body.kind, 'SUPERVISORY');
  assert.equal((await call('hr2', path() + '/' + row.id + '/decision', decision(row))).status, 409);
});
test('strict validation rejects unknown grade/role/grant and wrong intervals, title, location and cross-store scope', async () => {
  for (const extra of [{ grade: 'SM3' }, { grants: [] }, { role: 'Admin' }, { validUntil: 'invalid' }, { kind: 'TEMPORARY' }, { kind: 'ADDITIONAL', validUntil: null }, { kind: 'PRIMARY', replacesAppointmentId: String(f.actors.staff.employee._id) }]) assert.equal((await call('hr', path(), proposal(extra))).status, 400);
  assert.equal((await call('hr', path('staff'), proposal())).status, 409);
  assert.equal((await call('hr', path(), proposal({ storeId: String(f.stores[1]._id) }))).status, 403);
  assert.equal((await call('hr', path(), proposal({ kind: 'ADDITIONAL' }))).status, 409);
  const row = await create();
  assert.equal((await call('staffB', path())).status, 403);
  assert.equal((await call('system_admin', path() + '/' + row.id)).status, 403);
});
test('one primary per outlet, simultaneous review CAS and idempotent interrupted proposal retry', async () => {
  const primary = await create('sm', { kind: 'PRIMARY' }), other = await create('am', { kind: 'PRIMARY' });
  const outcomes = await Promise.all([call('hr2', path() + '/' + primary.id + '/decision', decision(primary)), call('hr2', path() + '/' + primary.id + '/decision', decision(primary))]);
  assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
  assert.equal((await call('hr2', path('am') + '/' + other.id + '/decision', decision(other))).status, 409);
  assert.equal(await SmAppointmentModel.countDocuments({ kind: 'PRIMARY', status: 'APPROVED' }), 1);
  const body = proposal(), first = await call('hr', path(), body); // response lost; same request is resumed after another request
  await call('hr', path());
  const resumed = await call('hr', path(), body);
  assert.equal(resumed.body.id, first.body.id); assert.equal(resumed.body.history.length, 1);
});
test('temporary cover preserves primary, bounds time and blocks overlapping replacements / revoke without handover', async () => {
  const primary = await SmAppointmentModel.findOne({ kind: 'PRIMARY', status: 'APPROVED' }).lean();
  const row = await create('am', { kind: 'TEMPORARY', replacesAppointmentId: String(primary._id), validFrom: new Date(Date.now() + 5000).toISOString(), validUntil: new Date(Date.now() + 60000).toISOString() });
  const cover = await approve(row, 'am'); assert.equal(cover.effectiveState, 'SCHEDULED');
  assert.equal((await SmAppointmentModel.findById(primary._id).lean()).status, 'APPROVED');
  const overlap = await create('ptch', { kind: 'TEMPORARY', replacesAppointmentId: String(primary._id), validFrom: row.validFrom, validUntil: row.validUntil });
  assert.equal((await call('hr2', path('ptch') + '/' + overlap.id + '/decision', decision(overlap))).status, 409);
  assert.equal((await call('hr2', path('am') + '/' + row.id + '/decision', decision(cover, 'REVOKE'))).status, 400);
  assert.equal((await call('hr2', path() + '/' + primary._id + '/decision', decision(primary, 'REVOKE', { handoverRef: 'handover-proof' }))).status, 409);
  const end = await call('hr2', path('am') + '/' + row.id + '/decision', decision(cover, 'REVOKE', { handoverRef: 'handover-proof' }));
  assert.equal(end.status, 200); assert.equal(end.body.status, 'REVOKED');
  assert.equal(end.body.history.at(-1).handoverRef, 'handover-proof');
  assert.equal(await snapshot(), unchanged);
});
test('expired grants, suspended employee and tampered evidence fail closed; paged summaries omit history', async () => {
  const row = await create();
  await SmAppointmentModel.collection.updateOne({ _id: new mongoose.Types.ObjectId(row.id) }, { $set: { evidenceRef: 'silently-altered' } });
  assert.equal((await call('hr', path() + '/' + row.id)).body.auditIntegrity, 'INVALID');
  assert.equal((await call('hr2', path() + '/' + row.id + '/decision', decision(row))).status, 409);
  const list = await call('sm', path() + '?limit=1&page=2'); assert.equal(list.status, 200); assert.equal(list.body.items.length, 1); assert.deepEqual(list.body.items[0].history, []); assert.ok(list.body.paging.hasPrev);
  const before = await UserModel.findById(f.actors.hr2.user._id).lean();
  await UserModel.collection.updateOne({ _id: before._id }, { $inc: { securityVersion: 1 } });
  assert.equal((await call('hr2', path() + '/' + row.id + '/decision', decision(row))).status, 401);
  await UserModel.collection.updateOne({ _id: before._id }, { $set: { securityVersion: before.securityVersion } });
  const valid = await create();
  await UserModel.collection.updateOne({ _id: before._id }, { $set: { 'authorization.grants.1.revokedAt': new Date().toISOString() } });
  assert.equal((await call('hr2', path() + '/' + valid.id + '/decision', decision(valid))).status, 403);
  await UserModel.collection.updateOne({ _id: before._id }, { $set: { authorization: before.authorization } });
  await EmployeeModel.collection.updateOne({ _id: f.actors.sm.employee._id }, { $set: { status: 'inactive' } });
  assert.equal((await call('hr2', path() + '/' + valid.id + '/decision', decision(valid))).status, 409);
  await EmployeeModel.collection.updateOne({ _id: f.actors.sm.employee._id }, { $set: { status: 'active' } });
  assert.equal(await snapshot(), unchanged);
});
test('store position view uses approved effective records; cross-store, reporting filters and expiry apply before paging/count', async () => {
  const endpoint = '/stores/' + f.stores[0]._id + '/sm-appointments';
  let result = await call('sm', endpoint + '?limit=1');
  assert.equal(result.status, 200); assert.equal(result.body.items.length, 1); assert.equal(result.body.paging.totalItems, 2);
  assert.ok(result.body.items[0].fullName); assert.equal('history' in result.body.items[0], false);
  assert.equal((await call('sm', '/stores/' + f.stores[1]._id + '/sm-appointments')).status, 403);
  assert.equal((await call('system_admin', endpoint)).status, 403);
  const user = await UserModel.findById(f.actors.sm.user._id).lean();
  const restricted = structuredClone(user.authorization);
  restricted.grants[1].scope.reportingEmployeeIds = [String(f.actors.staff.employee._id)];
  restricted.grants.push(testGrant('sm', { kind: 'organization', storeIds: [String(f.stores[0]._id)] }, ['stores.read'], user._id));
  await UserModel.collection.updateOne({ _id: user._id }, { $set: { authorization: restricted } });
  result = await call('sm', endpoint + '?limit=1');
  assert.equal(result.status, 200); assert.equal(result.body.paging.totalItems, 0); assert.deepEqual(result.body.items, []);
  await UserModel.collection.updateOne({ _id: user._id }, { $set: { authorization: user.authorization } });
  assert.equal(await snapshot(), unchanged);
});
test('additional outlet assignment has separate bounded evidence; expiry is derived without rewriting audit or grants', async () => {
  const originalHr = await UserModel.findById(f.actors.hr.user._id).lean(), originalReviewer = await UserModel.findById(f.actors.hr2.user._id).lean();
  try {
    for (const user of [originalHr, originalReviewer]) {
      const authorization = structuredClone(user.authorization);
      authorization.grants[1].scope.storeIds.push(String(f.stores[1]._id));
      await UserModel.collection.updateOne({ _id: user._id }, { $set: { authorization } });
    }
    const request = await create('sm', { kind: 'ADDITIONAL', storeId: String(f.stores[1]._id) });
    const approved = await approve(request);
    assert.equal(approved.kind, 'ADDITIONAL'); assert.equal(approved.effectiveState, 'EFFECTIVE');
    const row = await SmAppointmentModel.findById(approved.id).lean(), before = JSON.stringify(row);
    assert.equal(smAppointmentDto(row, true, Date.parse(approved.validUntil)).effectiveState, 'EXPIRED');
    assert.equal(smAppointmentDto(row, true, Date.parse(approved.validUntil) - 1).effectiveState, 'EFFECTIVE');
    assert.equal(JSON.stringify(await SmAppointmentModel.findById(approved.id).lean()), before);
    const duplicate = await create('sm', { kind: 'ADDITIONAL', storeId: String(f.stores[1]._id) });
    assert.equal((await call('hr2', path() + '/' + duplicate.id + '/decision', decision(duplicate))).status, 409);
  } finally {
    for (const user of [originalHr, originalReviewer]) await UserModel.collection.updateOne({ _id: user._id }, { $set: { authorization: user.authorization } });
  }
  assert.equal(await snapshot(), unchanged);
});

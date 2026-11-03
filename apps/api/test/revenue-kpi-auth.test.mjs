import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connectDB, disconnectDB } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { RevenueKpiPolicySchema } from '@hr-blockbot/contracts';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';
import { UserModel } from '../dist/models/User.js';
let f, server, base;
const call = async (alias, path, body) => { const r = await fetch(base + '/api/revenue-kpi' + path, { method: body ? 'POST' : 'GET', headers: { ...(alias ? { Authorization: 'Bearer ' + f.actors[alias].token } : {}), 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }); return { status: r.status, body: await r.json() }; };
before(async () => { await connectDB(); f = await revenueFixture(); server = createServer(createApp()); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port; });
after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await disconnectDB(); });
test('anonymous/profile/capability/feature gates deny, flag config remains readable', async () => {
  assert.equal((await call(null, '/config')).status, 401);
  for (const actor of ['staff', 'ptch', 'om', 'aom', 'sam', 'system_admin']) assert.equal((await call(actor, '/periods')).status, 403);
  process.env.REVENUE_KPI_ENABLED = 'false'; assert.deepEqual((await call('sm', '/config')).body, { enabled: false }); assert.equal((await call('hr', '/periods')).status, 503); process.env.REVENUE_KPI_ENABLED = 'true';
});
test('HR routes, strict body, scoped recipients, AM cannot approve, staff cannot read', async () => {
  const input = command(0, { period: '2026-10', policy: RevenueKpiPolicySchema.parse({ allowDemoData: true }) });
  assert.equal((await call('am', '/periods', input)).status, 403);
  assert.equal((await call('hr', '/periods', { ...input, targetVnd: 1 })).status, 400);
  let r = await call('hr', '/periods', input); assert.equal(r.status, 201); r = await call('hr', '/periods/2026-10/open', command(r.body.version)); assert.equal(r.status, 200);
  const d = await call('hr', '/dashboard?period=2026-10'); assert.equal(d.status, 200); const a = d.body.assignments.find(a => a.unitType === 'STORE');
  assert.equal((await call('staff', '/assignments/' + a.id + '/result')).status, 403);
  assert.equal((await call('am', '/assignments/' + a.id + '/publish', command(a.version))).status, 403);
  assert.equal((await call('am', '/assignments/' + a.id + '/accept', command(a.version))).status, 403);
  r = await call('hr', '/assignments/' + a.id + '/publish', command(a.version)); assert.equal(r.status, 200);
  assert.equal((await call('sm', '/assignments/' + a.id + '/refuse', command(r.body.version, { reason: 'a' }))).status, 400);
  assert.equal((await call('sm', '/assignments/' + a.id + '/accept', { ...command(r.body.version), assigneeEmployeeId: String(f.actors.am.employee._id) })).status, 400);
});
test('revoked scoped grants do not allow stale API read or write', async () => {
  const row = await UserModel.findById(f.actors.am.user._id).lean();
  try { await UserModel.updateOne({ _id: row._id }, { $set: { 'authorization.grants.1.revokedAt': new Date().toISOString() } }); const r = await call('am', '/dashboard?period=2026-10'); assert.equal(r.status, 200); assert.ok(r.body.assignments.every(a => a.assigneeEmployeeId === String(f.actors.am.employee._id))); }
  finally { await UserModel.updateOne({ _id: row._id }, { $set: { authorization: row.authorization } }); }
});

import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { PosOrderModel } from '../dist/models/PosOrder.js';
import { UserModel } from '../dist/models/User.js';
import { StoreModel } from '../dist/models/Store.js';
import { authorizationV1Fixture, testGrant } from './helpers/authorization-v1-fixture.mjs';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { digest } from '../dist/services/project-audit.service.js';
import { currentMonthPeriod, scopedRevenueMetric } from '../dist/services/pos-reporting.service.js';
import { planPosDemo, applyPosDemo } from '../scripts/seed-pos-demo.mjs';
let fixture, server, base;
const now = new Date('2026-11-03T15:00:00Z');
const make = (id, storeId, extra = {}) => ({ orderId: id, storeId, orderedAt: new Date('2026-11-02T08:00:00Z'), source: 'demo', ledgerVersion: 1,
  channel: 'IN_STORE', paymentMethod: 'CASH', status: 'COMPLETED', subtotalVnd: 100000, discountVnd: 10000, refundVnd: 5000, netRevenueVnd: 85000,
  items: [{ productId: 'OWNED', productName: 'Owned test drink', quantity: 2, unitPriceVnd: 50000, lineTotalVnd: 100000 }], ...extra });
const principal = name => resolvePrincipal({ sub: String(fixture.actors[name].user._id), role: fixture.actors[name].user.role, securityVersion: 0 });
const call = async (name, p) => { const r = await fetch(base + p, { headers: { ...(name ? { Authorization: 'Bearer ' + fixture.actors[name].token } : {}), Connection: 'close' } }); return { status: r.status, body: await r.json() }; };
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture(); await PosOrderModel.init();
  await UserModel.updateOne({ _id: fixture.actors.am.user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id) } });
  server = createServer(createApp()); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await disconnectDB(); });
test('Vietnam month-to-date boundaries and asOf never point to a future month-end', () => {
  const atBoundary = new Date('2026-10-31T17:00:00Z'), p = currentMonthPeriod(atBoundary);
  assert.equal(p.from.toISOString(), '2026-10-31T17:00:00.000Z'); assert.equal(p.to, atBoundary);
  assert.equal(currentMonthPeriod(new Date('2026-10-31T16:59:59Z')).from.toISOString(), '2026-09-30T17:00:00.000Z');
});
test('empty POS remains unavailable, unrelated legacy cash is not treated as revenue', async () => {
  const r = await call('sm', '/dashboard/overview'); assert.equal(r.status, 200); assert.equal(r.body.revenue.value, null);
  assert.equal(r.body.revenue.source, 'none'); assert.match(r.body.revenue.reason, /Chưa có giao dịch/);
});
test('schema rejects inconsistent amounts, invalid line totals and incomplete refunds', async () => {
  for (const changes of [{ netRevenueVnd: 999 }, { refundVnd: 999999 }, { status: 'REFUNDED' }, { subtotalVnd: 0 }, { discountVnd: -1 }, { netRevenueVnd: 85000.5 }])
    await assert.rejects(new PosOrderModel(make('invalid', fixture.stores[0]._id, changes)).validate());
});
test('SM sees own revenue, AM sum equals two stores; discounts/refunds/cancellations/date cutoff correct', async () => {
  const a = fixture.stores[0]._id, b = fixture.stores[1]._id;
  await PosOrderModel.create([
    make('A', a), make('B', b, { refundVnd: 0, netRevenueVnd: 90000 }),
    make('cancelled', a, { status: 'CANCELLED', refundVnd: 0, netRevenueVnd: 0 }),
    make('refunded', a, { status: 'REFUNDED', refundVnd: 90000, netRevenueVnd: 0 }),
    make('prior', a, { orderedAt: new Date('2026-10-31T16:59:59Z') }),
    make('future', a, { orderedAt: new Date('2026-11-04T00:00:00Z') }),
    make('start', a, { orderedAt: new Date('2026-10-31T17:00:00Z') }),
  ]);
  const sm = await scopedRevenueMetric(await principal('sm'), currentMonthPeriod(now));
  const am = await scopedRevenueMetric(await principal('am'), currentMonthPeriod(now));
  assert.equal(sm.value, 170000); assert.equal(sm.orderCount, 3); assert.equal(am.value, 260000);
  assert.equal(sm.dataKind, 'demo'); assert.equal(sm.asOf, now.toISOString());
});
test('cross-store selector, forged selectors, staff and technical admin cannot bypass grants', async () => {
  assert.equal((await call(null, '/dashboard/overview')).status, 401);
  for (const name of ['staff', 'system_admin']) assert.equal((await call(name, '/dashboard/overview')).status, 403);
  assert.equal((await call('sm', '/dashboard/revenue?storeId=' + fixture.stores[1]._id)).status, 403);
  assert.equal((await call('sm', '/dashboard/revenue?storeId=bad')).status, 400);
  assert.equal((await call('sm', '/dashboard/revenue?storeId=' + fixture.stores[0]._id + '&role=Admin')).status, 400);
  const within = await call('am', '/dashboard/revenue?storeId=' + fixture.stores[1]._id); assert.equal(within.status, 200); assert.equal(within.body.value, 90000);
});
test('live POS takes precedence without blending generated revenue into it', async () => {
  const row = await PosOrderModel.create(make('live', fixture.stores[0]._id, { source: 'pos_api', refundVnd: 0, netRevenueVnd: 90000 }));
  try { const r = await scopedRevenueMetric(await principal('sm'), currentMonthPeriod(now)); assert.equal(r.value, 90000); assert.equal(r.dataKind, 'live'); }
  finally { await PosOrderModel.deleteOne({ _id: row._id }); }
});
test('inconsistent persisted monetary fields withhold the total instead of reporting a wrong number', async () => {
  const row = await PosOrderModel.collection.insertOne(make('malformed-raw', fixture.stores[0]._id, { netRevenueVnd: 999 }));
  try { const r = await scopedRevenueMetric(await principal('sm'), currentMonthPeriod(now)); assert.equal(r.value, null); assert.match(r.reason, /đối chiếu/); }
  finally { await PosOrderModel.collection.deleteOne({ _id: row.insertedId }); }
});
test('reporting-person subset and revoked store grant do not disclose whole-store revenue', async () => {
  const target = fixture.actors.sm.user._id, old = await UserModel.findById(target).lean();
  try {
    await UserModel.updateOne({ _id: target }, { $set: { 'authorization.grants.1.scope.reportingEmployeeIds': [String(fixture.actors.staff.employee._id)] } });
    assert.equal((await scopedRevenueMetric(await principal('sm'), currentMonthPeriod(now))).value, null);
    assert.equal((await call('sm', '/dashboard/revenue?storeId=' + fixture.stores[0]._id)).status, 403);
    await UserModel.updateOne({ _id: target }, { $set: { 'authorization.grants.1.revokedAt': new Date().toISOString() } });
    assert.equal((await call('sm', '/dashboard/overview')).status, 403);
  } finally { await UserModel.updateOne({ _id: target }, { $set: { authorization: old.authorization } }); }
});
test('seed only adds deterministic past demo orders, repeats without deleting/overwriting live rows', async () => {
  const stores = await StoreModel.find({}).sort({ _id: 1 }).lean(), orders = planPosDemo(stores, now), again = planPosDemo(stores, now);
  assert.equal(digest(orders), digest(again)); assert.equal(orders.length, 2 * 34 * 6);
  assert.ok(orders.every(o => o.source === 'demo' && o.orderedAt <= now));
  assert.throws(() => planPosDemo(stores, new Date('2027-01-01')), /limited/);
  const before = await PosOrderModel.find({}).sort({ _id: 1 }).lean();
  const actor = await principal('system_admin'), first = await applyPosDemo(actor, orders, { storeHash: digest(stores) });
  assert.equal(first.inserted, orders.length);
  const replay = await applyPosDemo(actor, orders, { storeHash: digest(stores) }); assert.equal(replay.inserted, 0);
  const after = await PosOrderModel.find({ _id: { $in: before.map(o => o._id) } }).sort({ _id: 1 }).lean(); assert.equal(digest(before), digest(after));
  const conflict = { ...orders[0], paymentMethod: 'VNPAY', netRevenueVnd: orders[0].netRevenueVnd + 1 };
  await assert.rejects(applyPosDemo(actor, [conflict], { storeHash: digest(stores) }));
});

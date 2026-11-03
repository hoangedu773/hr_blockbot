import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { connectDB, disconnectDB } from '../dist/db.js';
import { createApp } from '../dist/app.js';
import { PosOrderModel } from '../dist/models/PosOrder.js';
import { UserModel } from '../dist/models/User.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { salesReport, salesPeriod } from '../dist/services/sales-report.service.js';
const now = new Date('2026-11-03T03:30:00Z');
const query = { from: '2026-11-03', to: '2026-11-03', page: 1 };
let fixture, server, base;
const actor = name => resolvePrincipal({ sub: String(fixture.actors[name].user._id), role: fixture.actors[name].user.role, securityVersion: 0 });
const make = (id, storeId, extra = {}) => ({ orderId: id, storeId, orderedAt: new Date('2026-11-02T23:05:00Z'), source: 'demo', ledgerVersion: 1,
  channel: 'IN_STORE', paymentMethod: 'CASH', status: 'COMPLETED', subtotalVnd: 100000, discountVnd: 10000, refundVnd: 5000, netRevenueVnd: 85000,
  items: [{ productId: 'OWNED', productName: 'Cà phê kiểm thử', quantity: 2, unitPriceVnd: 50000, lineTotalVnd: 100000 }], ...extra });
const call = async (name, p) => { const r = await fetch(base + p, { headers: name ? { Authorization: 'Bearer ' + fixture.actors[name].token } : {} }); return { status: r.status, body: await r.json() }; };
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  await UserModel.updateOne({ _id: fixture.actors.am.user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(fixture.stores[1]._id) } });
  const a = fixture.stores[0]._id, b = fixture.stores[1]._id;
  await PosOrderModel.create([
    make('A', a), make('MIDNIGHT', a, { orderedAt: new Date('2026-11-02T17:00:00Z'), channel: 'APP', paymentMethod: 'MOMO' }),
    make('CANCEL', a, { orderedAt: new Date('2026-11-03T00:00:00Z'), status: 'CANCELLED', channel: 'APP', refundVnd: 0, netRevenueVnd: 0 }),
    make('REFUND', a, { orderedAt: new Date('2026-11-03T01:00:00Z'), status: 'REFUNDED', channel: 'PARTNER', refundVnd: 90000, netRevenueVnd: 0 }),
    make('B', b, { refundVnd: 0, netRevenueVnd: 90000 }),
    make('PREVIOUS', a, { orderedAt: new Date('2026-11-01T23:05:00Z') }),
    make('FUTURE', a, { orderedAt: new Date('2026-11-03T04:00:00Z') }),
  ]);
  server = createServer(createApp()); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = `http://127.0.0.1:${server.address().port}/api`;
});
after(async () => { server?.closeAllConnections(); if (server) await new Promise(r => server.close(r)); await disconnectDB(); });
test('Vietnam midnight, future cutoff, matched elapsed comparison and impossible ranges', () => {
  const p = salesPeriod(query.from, query.to, now);
  assert.equal(p.start.toISOString(), '2026-11-02T17:00:00.000Z');
  assert.equal(p.previousEnd.toISOString(), '2026-11-02T03:30:00.001Z');
  const week = salesPeriod('2026-11-02', '2026-11-03', now, 'week');
  assert.equal(week.previousStart.toISOString(), '2026-10-25T17:00:00.000Z');
  assert.equal(week.previousEnd.toISOString(), '2026-10-27T03:30:00.001Z');
  const month = salesPeriod('2026-11-01', '2026-11-03', now, 'month');
  assert.equal(month.previousStart.toISOString(), '2026-09-30T17:00:00.000Z');
  assert.equal(month.previousEnd.toISOString(), '2026-10-03T03:30:00.001Z');
  const shorter = salesPeriod('2026-03-01', '2026-03-31', new Date('2026-03-31T03:30:00Z'), 'month');
  assert.equal(shorter.previousEnd.toISOString(), '2026-02-28T03:30:00.001Z');
  for (const [from, to] of [['2026-02-30', '2026-03-01'], ['2026-11-03', '2026-11-02'], ['2026-11-04', '2026-11-04'], ['2026-01-01', '2026-11-03']]) assert.throws(() => salesPeriod(from, to, now), e => e.status === 400 || e.statusCode === 400);
});
test('cards, hourly sums and visible rows reconcile, cancellations/refunds use consistent denominators', async () => {
  const r = await salesReport(await actor('sm'), query, now);
  assert.deepEqual(r.summary, { totalOrders: 4, cancelledOrders: 1, externalOrders: 3, salesOrders: 3, revenueVnd: 170000,
    discountVnd: 30000, refundVnd: 100000, itemCount: 6, averageOrderVnd: 56667, averageItems: 2 });
  assert.equal(r.hourly[0].revenueVnd, 85000); assert.equal(r.hourly[6].revenueVnd, 85000); assert.equal(r.hourly[7].orders, 1);
  assert.equal(r.hourly.reduce((n, x) => n + x.revenueVnd, 0), r.summary.revenueVnd);
  assert.equal(r.hourly.reduce((n, x) => n + x.orders, 0), r.summary.totalOrders);
  assert.equal(r.channels.reduce((n, x) => n + x.count, 0), r.summary.salesOrders);
  assert.equal(r.payments.reduce((n, x) => n + x.count, 0), r.summary.salesOrders);
  assert.equal(r.orders.reduce((n, x) => n + x.netRevenueVnd, 0), r.summary.revenueVnd);
  assert.equal(r.comparison.changes.revenueVnd, 100); assert.equal(r.comparison.changes.totalOrders, 300);
  assert.equal(r.comparison.changes.cancelledOrders, null); // zero denominator is never an invented 100%.
  assert.ok(r.orders.every(o => !('source' in o) && !('batchId' in o)));
});
test('SM scope, AM aggregate and filters apply equally to counts/charts/distributions/orders', async () => {
  const am = await salesReport(await actor('am'), query, now); assert.equal(am.summary.revenueVnd, 260000); assert.equal(am.stores.length, 2);
  const sm = await actor('sm');
  const app = await salesReport(sm, { ...query, channel: 'APP' }, now);
  assert.equal(app.summary.totalOrders, 2); assert.equal(app.summary.cancelledOrders, 1); assert.equal(app.summary.revenueVnd, 85000); assert.ok(app.orders.every(o => o.channel === 'APP'));
  const momo = await salesReport(sm, { ...query, paymentMethod: 'MOMO', status: 'COMPLETED' }, now);
  assert.equal(momo.summary.totalOrders, 1); assert.equal(momo.payments[0].key, 'MOMO');
  const cancel = await salesReport(sm, { ...query, status: 'CANCELLED' }, now); assert.equal(cancel.summary.revenueVnd, 0); assert.equal(cancel.summary.averageOrderVnd, null); assert.deepEqual(cancel.payments, []);
});
test('endpoint rejects anonymous, staff, technical admin, forged/cross-store selectors and invalid dates', async () => {
  const path = '/dashboard/sales?from=2026-11-03&to=2026-11-03';
  assert.equal((await call(null, path)).status, 401);
  for (const name of ['staff', 'system_admin']) assert.equal((await call(name, path)).status, 403);
  assert.equal((await call('sm', path + '&storeId=' + fixture.stores[1]._id)).status, 403);
  for (const extra of ['&source=pos_api', '&role=Admin', '&channel=nope', '&paymentMethod=COD', '&page=0', '&page[$gt]=0', '&storeId=bad']) assert.equal((await call('sm', path + extra)).status, 400);
  assert.equal((await call('sm', '/dashboard/sales?from=2026-02-30&to=2026-03-01')).status, 400);
  const r = await call('sm', path); assert.equal(r.status, 200);
});
test('missing interval is unknown, previous zero/missing never creates a percent', async () => {
  const r = await salesReport(await actor('sm'), { ...query, from: '2026-10-10', to: '2026-10-10' }, now);
  assert.equal(r.summary, null); assert.equal(r.dataKind, 'none'); assert.deepEqual(r.orders, []); assert.deepEqual(r.hourly, []); assert.equal(r.comparison.available, false);
});
test('live source is fixed across periods and channels, never blended or compared with demo', async () => {
  const row = await PosOrderModel.create(make('LIVE', fixture.stores[0]._id, { source: 'pos_api', refundVnd: 0, netRevenueVnd: 90000 }));
  try {
    const r = await salesReport(await actor('sm'), query, now); assert.equal(r.summary.totalOrders, 1); assert.equal(r.summary.revenueVnd, 90000); assert.equal(r.dataKind, 'live'); assert.equal(r.comparison.available, false);
    const filtered = await salesReport(await actor('sm'), { ...query, channel: 'APP' }, now); assert.equal(filtered.summary, null);
  } finally { await PosOrderModel.deleteOne({ _id: row._id }); }
});
test('invalid ledger blocks the selected scope, corruption outside SM scope is never disclosed', async () => {
  const bad = await PosOrderModel.collection.insertOne(make('BAD', fixture.stores[1]._id, { netRevenueVnd: 3 }));
  try { assert.equal((await salesReport(await actor('sm'), query, now)).summary.revenueVnd, 170000); const am = await salesReport(await actor('am'), query, now); assert.equal(am.summary, null); assert.match(am.reason, /đối chiếu/); assert.deepEqual(am.orders, []); }
  finally { await PosOrderModel.collection.deleteOne({ _id: bad.insertedId }); }
});
test('pagination is stable for tied timestamps and totals stay independent of the page', async () => {
  const docs = await PosOrderModel.create(Array.from({ length: 42 }, (_, i) => make('PAGE-' + i, fixture.stores[0]._id)));
  try {
    const a = await salesReport(await actor('sm'), query, now), b = await salesReport(await actor('sm'), { ...query, page: 2 }, now);
    assert.equal(a.summary.totalOrders, 46); assert.equal(a.paging.totalPages, 3); assert.equal(a.orders.length, 20); assert.equal(b.orders.length, 20);
    assert.equal(new Set([...a.orders, ...b.orders].map(o => o.id)).size, 40); assert.deepEqual(a.summary, b.summary);
  } finally { await PosOrderModel.deleteMany({ _id: { $in: docs.map(o => o._id) } }); }
});
test('reporting-person restricted scope and revocation do not expose full-store reporting', async () => {
  const id = fixture.actors.sm.user._id, old = await UserModel.findById(id).lean();
  try {
    await UserModel.updateOne({ _id: id }, { $set: { 'authorization.grants.1.scope.reportingEmployeeIds': [String(fixture.actors.staff.employee._id)] } });
    const r = await salesReport(await actor('sm'), query, now); assert.equal(r.summary, null); assert.deepEqual(r.stores, []);
    await UserModel.updateOne({ _id: id }, { $set: { 'authorization.grants.1.revokedAt': now.toISOString() } });
    await assert.rejects(salesReport(await actor('sm'), query, now));
  } finally { await UserModel.updateOne({ _id: id }, { $set: { authorization: old.authorization } }); }
});

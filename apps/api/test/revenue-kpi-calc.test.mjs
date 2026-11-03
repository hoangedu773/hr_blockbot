import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { ensureRevenueKpiStorage } from '../dist/services/revenue-kpi-storage.service.js';
import { computeStoreRevenue, combineRevenueResults, periodRangeVN, addWorkingDays } from '../dist/services/revenue-kpi-calc.service.js';
import { PosOrderModel } from '../dist/models/PosOrder.js';
import { RevenueKpiResultModel } from '../dist/models/RevenueKpiResult.js';
const sid = new mongoose.Types.ObjectId(), now = new Date('2026-11-04T00:00:00Z');
const make = (orderId, extra = {}) => ({ orderId, storeId: sid, source: 'demo', ledgerVersion: 1, orderedAt: new Date('2026-10-01T00:00:00+07:00'),
  status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH', subtotalVnd: 100, discountVnd: 10, refundVnd: 5, netRevenueVnd: 85,
  items: [{ productId: 'TEST', productName: 'Đơn giả lập', quantity: 1, unitPriceVnd: 100, lineTotalVnd: 100 }], ...extra });
before(async () => { mongoose.set('autoCreate', false).set('autoIndex', false); await connectDB(); });
after(disconnectDB);
test('explicit bootstrap is idempotent with schema autoCreate/index disabled; result write protection', async () => {
  await ensureRevenueKpiStorage(); await ensureRevenueKpiStorage();
  const indexes = await mongoose.connection.collection('revenue_kpi_assignments').indexes(); assert.ok(indexes.some(i => i.unique && i.partialFilterExpression?.unitType === 'STORE'));
  assert.ok((await mongoose.connection.collection('revenue_kpi_results').indexes()).some(i => i.unique && i.key.assignmentId && i.key.version));
  await assert.rejects(RevenueKpiResultModel.updateOne({ _id: 'a'.repeat(24) }, { $set: { status: 'CONFIRMED' } }), /append-only/);
});
test('VN month boundaries, weekend working days', () => {
  const r = periodRangeVN('2026-10'); assert.equal(r.start.toISOString(), '2026-09-30T17:00:00.000Z'); assert.equal(r.end.toISOString(), '2026-10-31T17:00:00.000Z');
  assert.equal(addWorkingDays(new Date('2026-11-06T03:00:00Z'), 3).toISOString(), '2026-11-11T03:00:00.000Z');
});
test('real POS aggregate: VN half-open interval, cancellation, partial/full refunds, missing/demo policy', async () => {
  await PosOrderModel.create([make('BEGIN'), make('LAST', { orderedAt: new Date('2026-10-31T23:59:59+07:00') }),
    make('BEFORE', { orderedAt: new Date('2026-09-30T23:59:59+07:00') }), make('AFTER', { orderedAt: new Date('2026-11-01T00:00:00+07:00') }),
    make('CANCEL', { status: 'CANCELLED', netRevenueVnd: 0 }), make('REFUND', { status: 'REFUNDED', refundVnd: 90, netRevenueVnd: 0 })]);
  const r = await computeStoreRevenue(String(sid), '2026-10', { allowDemoData: true }, now); assert.equal(r.actualRevenueVnd, 170); assert.equal(r.orderCount, 3); assert.equal(r.dataKind, 'demo');
  assert.equal((await computeStoreRevenue(String(sid), '2026-10', { allowDemoData: false }, now)).actualRevenueVnd, null);
  assert.equal((await computeStoreRevenue(String(sid), '2026-08', { allowDemoData: true }, now)).actualRevenueVnd, null);
});
test('live takes precedence and bad/negative/fractional/raw ledger invalidates whole store', async () => {
  const doc = await PosOrderModel.create(make('LIVE', { source: 'pos_export', netRevenueVnd: 90, refundVnd: 0 }));
  try { assert.equal((await computeStoreRevenue(String(sid), '2026-10', { allowDemoData: true }, now)).actualRevenueVnd, 90); }
  finally { await PosOrderModel.deleteOne({ _id: doc._id }); }
  for (const netRevenueVnd of [99, -1, 2.5]) { const bad = await PosOrderModel.collection.insertOne(make('BAD-' + netRevenueVnd, { netRevenueVnd })); try { const r = await computeStoreRevenue(String(sid), '2026-10', { allowDemoData: true }, now); assert.equal(r.actualRevenueVnd, null); assert.equal(r.invalidOrderCount, 1); } finally { await PosOrderModel.collection.deleteOne({ _id: bad.insertedId }); } }
});
const store = (actual, target = 100, dataKind = 'demo') => ({ targetVnd: target, actualRevenueVnd: actual, dataKind, orderCount: 1, invalidOrderCount: 0 });
test('store 90/100/110; area sum/sum, threshold inclusion and all pending propagation', () => {
  for (const actual of [90, 100, 110]) { const r = combineRevenueResults([store(actual)], 'STORE', 30); assert.equal(r.achievementPercent, actual); assert.equal(r.achieved, actual >= 100); }
  const r = combineRevenueResults([store(150), store(150), store(90)], 'AREA', 30); assert.equal(r.achievementPercent, 130); assert.equal(r.underperformingStoreRatePercent, 33.33); assert.equal(r.achieved, false);
  assert.equal(combineRevenueResults([store(100), store(110), store(90)], 'AREA', 33.33).achieved, true);
  assert.equal(combineRevenueResults([store(99), store(100), store(100)], 'AREA', 100).achieved, false);
  assert.equal(combineRevenueResults([store(900, 1000), store(200, 100)], 'AREA', 100).achievementPercent, 100);
  for (const rows of [[], [store(null)], [store(100), store(100, 100, 'live')], [store(100, 0)], [store(100), { ...store(null), invalidOrderCount: 1 }]]) { const r = combineRevenueResults(rows, 'AREA', 30); assert.equal(r.achieved, null); assert.equal(r.achievementPercent, null); assert.equal(r.actualRevenueVnd, null); assert.ok(r.pendingReasons.length); }
});

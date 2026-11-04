import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { RevenueKpiPolicySchema } from '@hr-blockbot/contracts';
import * as S from '../dist/services/revenue-kpi.service.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';
import { RevenueKpiPeriodModel as Period } from '../dist/models/RevenueKpiPeriod.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { SmAppointmentModel } from '../dist/models/SmAppointment.js';
import { PosOrderModel } from '../dist/models/PosOrder.js';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';
import { randomUUID } from 'node:crypto';

let fixture, hr, secondStore;
const open = (period) => S.createRevenueKpiPeriod(hr, command(0, { period, policy: RevenueKpiPolicySchema.parse({ allowDemoData: true }) }));
const confirm = (action) => command(action.preview.version, { approve: true, planDigest: action.preview.planDigest });
// The fixture seeds POS revenue for 2026-07..2026-10 only. Later periods need a
// base month so GROWTH_PERCENT drafts are valid instead of blocked.
async function seedBase(targetPeriod) {
  const [year, month] = targetPeriod.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 2, 10, 6, 30));
  const baseMonth = base.toISOString().slice(0, 7);
  const row = await PosOrderModel.findOne({ orderId: 'KPI-2026-09' }).lean();
  delete row._id;
  await PosOrderModel.create({ ...row, orderId: 'BASE-' + baseMonth + '-' + targetPeriod, orderedAt: base });
}
before(async () => {
  await connectDB();
  fixture = await revenueFixture();
  secondStore = String(fixture.stores[1]._id);
  for (const role of ['hr', 'am']) await UserModel.updateOne({ _id: fixture.actors[role].user._id },
    { $addToSet: { 'authorization.grants.1.scope.storeIds': secondStore } });
  hr = await fixture.principal('hr');
});
after(disconnectDB);

test('deterministic read-only preview, partial open, retry and exact replay', async () => {
  const p = await open('2026-10');
  const original = await Period.findById(p.id).lean();
  const before = await Assignment.countDocuments();
  const metadata = mongoose.connection.collection('revenue_kpi_open_actions');
  const actionsBefore = await metadata.countDocuments();
  const preview = await S.planRevenueKpiPeriodOpen(hr, p.period);
  assert.deepEqual(preview.summary, { create: 1, skipped: 0, blocked: 2, total: 3 });
  assert.equal(preview.executed, false);
  assert.equal((await S.planRevenueKpiPeriodOpen(hr, p.period)).planDigest, preview.planDigest);
  assert.equal(await metadata.countDocuments(), actionsBefore);
  assert.equal(await Assignment.countDocuments(), before);
  assert.deepEqual(await Period.findById(p.id).lean(), original);
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  assert.equal(await Assignment.countDocuments(), before);
  const input = confirm(action);
  const done = await S.decideRevenueKpiOpenAction(hr, action.actionId, input);
  assert.equal(done.result.outcome, 'PARTIAL');
  assert.equal(done.result.period.status, 'OPEN');
  assert.deepEqual(done.result.summary, { created: 1, skipped: 0, blocked: 2, failed: 0, total: 3 });
  assert.ok(done.result.blocked.some(i => i.unitType === 'AREA' && i.retryable));
  assert.deepEqual(await S.decideRevenueKpiOpenAction(hr, action.actionId, input), done);
  assert.equal(await Assignment.countDocuments({ period: p.period }), 1);

  const second = fixture.actors.staffB;
  const source = await UserModel.findById(fixture.actors.sm.user._id).lean();
  const auth = structuredClone(source.authorization);
  for (const grant of auth.grants) {
    grant.id = randomUUID();
    grant.scope.storeIds = grant.scope.storeIds.map(() => secondStore);
  }
  await UserModel.updateOne({ _id: second.user._id }, { $set: { authorization: auth } });
  await EmployeeModel.updateOne({ _id: second.employee._id }, { $set: { storeId: fixture.stores[1]._id } });
  const appointment = await SmAppointmentModel.findOne({}).lean();
  delete appointment._id;
  await SmAppointmentModel.create({ ...appointment, employeeId: second.employee._id, storeId: fixture.stores[1]._id, clientRequestId: randomUUID() });
  const ledger = await PosOrderModel.findOne({ orderId: 'KPI-2026-09' }).lean();
  delete ledger._id;
  await PosOrderModel.create({ ...ledger, storeId: fixture.stores[1]._id, orderId: 'SECOND-STORE-BASE' });
  const retry = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  const retried = (await S.decideRevenueKpiOpenAction(hr, retry.actionId, confirm(retry))).result;
  assert.equal(retried.outcome, 'FULL');
  assert.equal(retried.skipped.length, 1);
  assert.equal(retried.created.find(i => i.unitType === 'AREA').targetVnd, 206000);
  assert.equal(retried.period.version, done.result.period.version);
  assert.equal(await Assignment.countDocuments({ period: p.period }), 3);
});

test('policy, catalog and version drift yield a fresh preview without writes', async () => {
  const p = await open('2026-11');
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  await Period.collection.updateOne({ _id: p.id }, { $set: { 'policy.defaultGrowthPercent': 10 } });
  const before = await Period.findById(p.id).lean();
  await assert.rejects(S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action)),
    e => e.status === 409 && e.preview.planDigest !== action.preview.planDigest);
  assert.deepEqual(await Period.findById(p.id).lean(), before);
  const next = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  await UserModel.updateOne({ _id: fixture.actors.am.user._id }, { $pull: { 'authorization.grants.1.scope.storeIds': secondStore } });
  await assert.rejects(S.decideRevenueKpiOpenAction(hr, next.actionId, confirm(next)),
    e => e.status === 409 && e.preview.planDigest !== next.preview.planDigest);
  assert.deepEqual(await Period.findById(p.id).lean(), before);
  const latest = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  await Period.collection.updateOne({ _id: p.id }, { $inc: { version: 1 } });
  const changed = await Period.findById(p.id).lean();
  await assert.rejects(S.decideRevenueKpiOpenAction(hr, latest.actionId, confirm(latest)),
    e => e.status === 409 && e.preview.version === latest.preview.version + 1);
  assert.deepEqual(await Period.findById(p.id).lean(), changed);
  assert.equal(await Assignment.countDocuments({ period: p.period }), 0);
});

test('unexpected item write failure surfaces and dependent AREA stays blocked', async () => {
  const p = await open('2026-09');
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  const original = Assignment.create;
  Assignment.create = async () => { throw new Error('injected storage failure'); };
  try {
    const { result } = await S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action));
    assert.equal(result.period.status, 'OPEN');
    assert.ok(result.failed.some(i => i.code === 'REVENUE_KPI_DRAFT_WRITE_FAILED'));
    assert.ok(result.blocked.some(i => i.unitType === 'AREA'));
    assert.equal(result.summary.total, action.preview.summary.total);
    assert.equal(await Assignment.countDocuments({ period: p.period }), 0);
  } finally { Assignment.create = original; }
});


test('identical duplicate races replay, conflicting rows fail and block derived targets', async () => {
  for (const [period, conflicting] of [['2026-08', false], ['2026-07', true]]) {
    if (conflicting) {
      const row = await PosOrderModel.findOne({ orderId: 'KPI-2026-10' }).lean();
      delete row._id;
      await PosOrderModel.create({ ...row, orderId: 'KPI-2026-06-race', orderedAt: new Date('2026-06-10T00:00:00Z') });
    }
    const p = await open(period);
    const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
    const original = Assignment.create;
    Assignment.create = async function (row) {
      if (row.unitType !== 'STORE') return original.call(this, row);
      const persisted = conflicting
        ? { ...row, targetVnd: row.targetVnd + 1, stores: [{ ...row.stores[0], targetVnd: row.targetVnd + 1 }] }
        : row;
      await original.call(this, persisted);
      throw Object.assign(new Error('injected concurrent duplicate'), { code: 11000 });
    };
    try {
      const { result } = await S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action));
      if (conflicting) {
        assert.ok(result.failed.some(item => item.code === 'REVENUE_KPI_ASSIGNMENT_CONFLICT'));
        assert.ok(result.blocked.some(item => item.unitType === 'AREA'));
      } else {
        assert.ok(result.skipped.some(item => item.unitType === 'STORE'));
        assert.equal(result.failed.length, 0);
      }
      assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE' }), 1);
    } finally { Assignment.create = original; }
  }
});

test('legacy open retry finishes drafts missing after a partial write', async () => {
  const p = await open('2026-05');
  await seedBase('2026-05');
  const input = command(p.version);
  const original = Assignment.create;
  Assignment.create = async () => { throw new Error('injected storage failure'); };
  try { await S.openRevenueKpiPeriod(hr, p.period, input); }
  finally { Assignment.create = original; }
  assert.equal(await Assignment.countDocuments({ period: p.period }), 0);
  await S.openRevenueKpiPeriod(hr, p.period, input);
  // The retry must finish every draft the interrupted run missed: the STORE
  // row plus the AREA derived from it — still no duplicates.
  assert.equal(await Assignment.countDocuments({ period: p.period }), 2);
  await S.openRevenueKpiPeriod(hr, p.period, input);
  assert.equal(await Assignment.countDocuments({ period: p.period }), 2, 'replay must not duplicate drafts');
});

test('a decided action replays its stored result for a fresh request id', async () => {
  const p = await open('2026-04');
  await seedBase('2026-04');
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  const first = await S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action));
  assert.equal(first.status, 'EXECUTED');
  const replay = await S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action));
  assert.equal(replay.status, first.status);
  assert.deepEqual(replay.result, first.result);
  assert.equal(await Assignment.countDocuments({ period: p.period }), first.result.summary.created);
});

test('an action stuck after the execution lease expires is recovered on retry', async () => {
  const p = await open('2026-03');
  await seedBase('2026-03');
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  const actions = mongoose.connection.collection('revenue_kpi_open_actions');
  await actions.updateOne({ _id: action.actionId }, { $set: { status: 'CONFIRMED', leaseUntil: new Date(Date.now() - 1000).toISOString() } });
  const done = await S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action));
  assert.equal(done.status, 'EXECUTED');
  assert.ok(done.result.summary.created >= 1);
  assert.equal(await Assignment.countDocuments({ period: p.period }), done.result.summary.created);
});

test('abandoned proposals carry a TTL purge marker that decisions clear', async () => {
  const p = await open('2026-02');
  await seedBase('2026-02');
  const actions = mongoose.connection.collection('revenue_kpi_open_actions');
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  const indexes = await actions.indexes();
  assert.ok(indexes.some(i => i.key.purgeAt === 1 && i.expireAfterSeconds === 0));
  assert.ok((await actions.findOne({ _id: action.actionId })).purgeAt instanceof Date);
  await S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action));
  assert.equal((await actions.findOne({ _id: action.actionId })).purgeAt, undefined);
});

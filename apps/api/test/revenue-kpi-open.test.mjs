import './require-isolated-db.mjs';
import { test, before, after, mock } from 'node:test';
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
import { digest } from '../dist/services/project-audit.service.js';
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
  // Production writes CONFIRMED atomically with decisionHash = digest(input);
  // emulate exactly that state instead of a bare status flip.
  const stuckInput = confirm(action);
  await actions.updateOne({ _id: action.actionId }, {
    $set: { status: 'CONFIRMED', decisionHash: digest(stuckInput), leaseUntil: new Date(Date.now() - 1000).toISOString() },
  });
  const done = await S.decideRevenueKpiOpenAction(hr, action.actionId, stuckInput);
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

// Bug 1 regression: an action crashed CONFIRMED/FAILED after the period flipped
// to OPEN and at least one STORE was written. The crash is emulated at its real
// window: executeOpenPlan swallows per-item failures, so a killed worker dies
// between the first STORE write and the result persist. We rewind the metadata
// row to CONFIRMED with an expired lease to reproduce that exact state.
// Shared setup gives the plan three creatable units: two STOREs plus the AM AREA.
async function crashAfterFirstStore(period, blockSecondStore = false, crash = true) {
  const second = fixture.actors.staffB;
  const smSource = await UserModel.findById(fixture.actors.sm.user._id).lean();
  const smAuth = structuredClone(smSource.authorization);
  for (const grant of smAuth.grants) {
    grant.id = randomUUID();
    grant.scope.storeIds = grant.scope.storeIds.map(() => secondStore);
  }
  await UserModel.updateOne({ _id: second.user._id }, { $set: { authorization: smAuth } });
  await EmployeeModel.updateOne({ _id: second.employee._id }, { $set: { storeId: fixture.stores[1]._id } });
  // Earlier tests in this file already attach staffB to the second store; a
  // duplicate appointment would make smStatus AMBIGUOUS and drop a CREATE item.
  const existingAppointment = await SmAppointmentModel.findOne({ employeeId: second.employee._id, storeId: fixture.stores[1]._id, status: 'APPROVED', kind: 'PRIMARY' }).lean();
  if (!existingAppointment) {
    const appointment = await SmAppointmentModel.findOne({}).lean();
    delete appointment._id;
    await SmAppointmentModel.create({ ...appointment, employeeId: second.employee._id, storeId: fixture.stores[1]._id, clientRequestId: randomUUID() });
  }

  // Earlier drift tests shrink the AM's grant to store 1 and never restore it;
  // re-establish the two-store scope before proposing so the AREA is creatable
  // (or properly blocked by revenue, not by scope).
  const amUser = fixture.actors.am.user._id;
  const amNow = await UserModel.findById(amUser).lean();
  const amScope = structuredClone(amNow.authorization);
  amScope.grants = amScope.grants.map(g => g.scope?.kind === 'organization'
    ? { ...g, scope: { ...g.scope, storeIds: [...new Set([...g.scope.storeIds, secondStore])] } } : g);
  await UserModel.updateOne({ _id: amUser }, { $set: { authorization: amScope } });

  // The 2025-11 crash-drift run needs appointments valid before 2026; shift the
  // fixture appointments' validFrom to 2025-01-01 (validUntil stays null).
  await SmAppointmentModel.updateMany({ storeId: { $in: [fixture.stores[0]._id, fixture.stores[1]._id] }, status: 'APPROVED' },
    { $set: { validFrom: new Date('2025-01-01') } });

  const p = await open(period);
  // seedBase covers the first store; the second store needs its own base month
  // row or its plan item is blocked instead of CREATE.
  await seedBase(period);
  if (!blockSecondStore) {
    const [year, month] = period.split('-').map(Number);
    const base = new Date(Date.UTC(year, month - 2, 10, 6, 30));
    const ledger = await PosOrderModel.findOne({ orderId: 'KPI-2026-09' }).lean();
    delete ledger._id;
    await PosOrderModel.create({ ...ledger, storeId: fixture.stores[1]._id, orderId: 'SECOND-BASE-' + period, orderedAt: base });
  }
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  assert.equal(action.preview.summary.total, 3);
  if (blockSecondStore) {
    const secondItem = action.preview.items.find(i => i.unitType === 'STORE' && i.storeId === secondStore);
    assert.equal(secondItem.status, 'BLOCKED', 'without base revenue the second store must be blocked');
    assert.equal(action.preview.items.find(i => i.unitType === 'AREA').status, 'BLOCKED');
    assert.equal(action.preview.summary.create, 1);
  } else {
    assert.equal(action.preview.summary.create, 3);
  }

  if (!crash) {
    // The caller drives its own crash window (e.g. before any assignment write).
    return { p, action, written: [], afterPeriod: await Period.findById(p.id).lean() };
  }
  const originalCreate = Assignment.create;
  let writes = 0;
  Assignment.create = async function (row) {
    if (++writes >= 2) throw new Error('injected crash after period and first store write');
    return originalCreate.call(this, row);
  };
  let crashed;
  try {
    crashed = await S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action));
    assert.equal(crashed.result.outcome, 'PARTIAL', 'the injected failure must surface as PARTIAL');
    assert.equal(crashed.result.period.status, 'OPEN');
  } finally { Assignment.create = originalCreate; }

  const actions = mongoose.connection.collection('revenue_kpi_open_actions');
  // Rewind the metadata to the crash point: claimed, lease expired, no result.
  await actions.updateOne({ _id: action.actionId },
    { $set: { status: 'CONFIRMED', leaseUntil: new Date(Date.now() - 1000).toISOString() }, $unset: { result: '' } });

  const afterPeriod = await Period.findById(p.id).lean();
  assert.equal(afterPeriod.status, 'OPEN', 'the period write survived the crash');
  const written = await Assignment.find({ period: p.period }).lean();
  assert.equal(written.length, 1, 'exactly one STORE draft was written before the crash');
  assert.equal(written[0].unitType, 'STORE');
  return { p, action, written, afterPeriod };
}

test('retry after a mid-execution crash completes the plan without drift', async () => {
  const { p, action, written } = await crashAfterFirstStore('2026-06');
  const retry = await S.decideRevenueKpiOpenAction(hr, action.actionId,
    command(action.preview.version, { approve: true, planDigest: action.preview.planDigest }));
  assert.equal(retry.status, 'EXECUTED');
  assert.equal(retry.result.outcome, 'FULL');
  assert.deepEqual(retry.result.summary, { created: 2, skipped: 1, blocked: 0, failed: 0, total: 3 });

  const after = await Assignment.find({ period: p.period }).lean();
  assert.equal(after.length, 3, 'every approved unit exists exactly once');
  assert.equal(after.filter(r => r.unitType === 'STORE').length, 2);
  const kept = after.find(r => String(r._id) === String(written[0]._id));
  assert.equal(kept.targetVnd, written[0].targetVnd, 'the kept row keeps its target');
  assert.deepEqual(kept.stores.map(s => ({ storeId: String(s.storeId), targetVnd: s.targetVnd })),
    written[0].stores.map(s => ({ storeId: String(s.storeId), targetVnd: s.targetVnd })));
  assert.equal(kept.version, written[0].version, 'the kept row was not rewritten');
  assert.equal(retry.result.skipped.some(i => i.assignmentId === String(written[0]._id)),
    true, 'the already-written STORE is reported as skipped, not duplicated');
  const storeRows = after.filter(r => r.unitType === 'STORE');
  for (const area of after.filter(r => r.unitType === 'AREA')) {
    const own = storeRows.filter(s => area.stores.some(st => String(st.storeId) === String(s.storeId)));
    assert.equal(area.targetVnd, own.reduce((n, s) => n + s.targetVnd, 0), 'AREA target equals the sum of its STORE rows');
    assert.deepEqual(area.stores.map(s => ({ storeId: String(s.storeId), targetVnd: s.targetVnd })),
      own.map(s => ({ storeId: String(s.storeId), targetVnd: s.targetVnd })));
  }
});

test('retry after a mid-execution crash never writes targets that drift from the preview', async () => {
  const { p, action, written } = await crashAfterFirstStore('2025-11');
  const crashedPreview = action.preview;

  // Revenue source drift: a new POS row in the base month raises the missing
  // store's GROWTH_PERCENT-derived target. The retry must not honour it.
  const missingStoreId = crashedPreview.items
    .find(i => i.unitType === 'STORE' && i.status === 'CREATE' && i.storeId !== String(written[0].storeId)).storeId;
  const ledger = await PosOrderModel.findOne({ orderId: 'KPI-2026-09' }).lean();
  delete ledger._id;
  await PosOrderModel.create({ ...ledger, storeId: new mongoose.Types.ObjectId(missingStoreId), orderId: 'DRIFT-BASE-' + p.period, orderedAt: new Date('2025-10-10T06:30:00+07:00') });

  // Catalog drift: the AM loses scope over the second store, so a fresh plan
  // would shrink its AREA to one store. The approved shape must be kept.
  const amUser = fixture.actors.am.user._id;
  const amSource = await UserModel.findById(amUser).lean();
  const amAuth = structuredClone(amSource.authorization);
  amAuth.grants = amAuth.grants.map(g => g.scope?.kind === 'organization'
    ? { ...g, scope: { ...g.scope, storeIds: g.scope.storeIds.filter(id => id !== secondStore) } } : g);
  await UserModel.updateOne({ _id: amUser }, { $set: { authorization: amAuth } });

  // Fresh clientRequestId: the first decision's payloadHash lives in the
  // action's decisionHash, not in any replayable history entry.
  let retry;
  try {
    retry = await S.decideRevenueKpiOpenAction(hr, action.actionId,
      command(crashedPreview.version, { approve: true, planDigest: crashedPreview.planDigest }));
  } catch (e) {
    assert.equal(e.status, 409, 'a rejected retry must fail with a plan-changed conflict');
    assert.equal(e.code, 'REVENUE_KPI_PLAN_CHANGED');
    assert.equal(await Assignment.countDocuments({ period: p.period }), 1, 'a rejection writes nothing');
    assert.equal((await Assignment.findById(written[0]._id)).version, written[0].version, 'the kept row stays untouched');
    return;
  }
  assert.equal(retry.status, 'EXECUTED');
  assert.ok(['FULL', 'PARTIAL'].includes(retry.result.outcome), `unexpected outcome ${retry.result.outcome}`);

  const after = await Assignment.find({ period: p.period }).lean();
  const previewTargets = new Map(crashedPreview.items.filter(i => i.targetVnd !== null)
    .map(i => [i.unitType === 'STORE' ? i.storeId : i.areaKey, i.targetVnd]));
  for (const r of after) {
    if (String(r._id) === String(written[0]._id)) continue;
    const key = r.unitType === 'STORE' ? String(r.storeId) : 'am:' + r.assigneeEmployeeId;
    const expected = previewTargets.get(key);
    assert.ok(expected !== undefined, `row ${key} was not in the approved preview`);
    assert.equal(r.targetVnd, expected, `target drift for ${key}`);
    assert.equal(r.status, 'DRAFT');
  }
  const storeRows = after.filter(r => r.unitType === 'STORE');
  assert.equal(storeRows.length, 2, 'both approved STORE rows exist exactly once');
  for (const area of after.filter(r => r.unitType === 'AREA')) {
    const own = storeRows.filter(s => area.stores.some(st => String(st.storeId) === String(s.storeId)));
    assert.equal(area.targetVnd, own.reduce((n, s) => n + s.targetVnd, 0), 'AREA target equals the sum of its STORE rows');
    assert.deepEqual(area.stores.map(s => ({ storeId: String(s.storeId), targetVnd: s.targetVnd })),
      own.map(s => ({ storeId: String(s.storeId), targetVnd: s.targetVnd })));
  }
});

// Bug 2 regression: the proposal expires while decide is running. Advance a
// deterministic clock past the 10-minute proposal window at the moment
// PosOrderModel.exists is queried inside buildOpenPlan (decide re-plans before
// claiming). expiresAt in the database is untouched — only elapsed time makes
// the action expire. The decision must claim nothing and write neither period
// nor assignments.
test('an action expiring during decide claims nothing and writes nothing', async () => {
  const p = await open('2026-01');
  await seedBase('2026-01');
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  const beforePeriod = await Period.findById(p.id).lean();

  mock.timers.enable({ apis: ['Date'], now: Date.now() });
  const originalExists = PosOrderModel.exists;
  let advanced = false;
  PosOrderModel.exists = async function (...args) {
    if (!advanced) { advanced = true; mock.timers.tick(11 * 60000); }
    return originalExists.apply(this, args);
  };
  try {
    await assert.rejects(S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action)),
      e => e.status === 409 && e.code === 'REVENUE_KPI_ACTION_EXPIRED');
  } finally {
    PosOrderModel.exists = originalExists;
    mock.timers.reset();
  }

  const row = await mongoose.connection.collection('revenue_kpi_open_actions').findOne({ _id: action.actionId });
  assert.equal(row.status, 'EXPIRED', 'the expired proposal is marked EXPIRED, not claimed');
  assert.equal(row.decisionHash, undefined, 'no decision hash was stored');
  assert.equal(row.leaseUntil, undefined, 'no lease was taken');
  assert.equal(row.result, undefined, 'no result was stored');
  const afterPeriod = await Period.findById(p.id).lean();
  assert.equal(afterPeriod.status, 'DRAFT', 'the period must not be opened');
  assert.equal(afterPeriod.version, beforePeriod.version);
  assert.deepEqual(afterPeriod.history, beforePeriod.history);
  assert.equal(await Assignment.countDocuments({ period: p.period }), 0, 'no assignment was written');
});

// Bug 2b regression: Mongo server clock ahead of the app clock. The proposal is
// created normally, then its owned-Mongo expiresAt is set to the real time
// minus one second while the Node clock is mocked five seconds into the past —
// exactly the skew a drift between server and app clocks produces. The claim
// uses Mongo's $$NOW (server time), so the decision must be classified
// REVENUE_KPI_ACTION_EXPIRED — not ACTION_DECIDED — and write nothing.
test('a Mongo-server-clock-ahead skew classifies the claim as expired', async () => {
  const p = await open('2025-06');
  await seedBase('2025-06');
  const action = await S.proposeRevenueKpiPeriodOpen(hr, p.period);
  const beforePeriod = await Period.findById(p.id).lean();
  const actions = mongoose.connection.collection('revenue_kpi_open_actions');

  const realNow = new Date();
  await actions.updateOne({ _id: action.actionId },
    { $set: { expiresAt: new Date(realNow.getTime() - 1000).toISOString() } });
  const beforePeriodRow = await actions.findOne({ _id: action.actionId });
  assert.equal(beforePeriodRow.status, 'PENDING', 'the metadata keeps PENDING before any decision');

  // Only 5 seconds back: grants become valid at creation-60s, so a 2-minute
  // rewind would make the authorization inactive before the claim is reached.
  // 5s still leaves Mongo's $$NOW one second past expiresAt.
  mock.timers.enable({ apis: ['Date'], now: new Date(realNow.getTime() - 5000) });
  try {
    await assert.rejects(S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action)),
      e => e.status === 409 && e.code === 'REVENUE_KPI_ACTION_EXPIRED');
  } finally {
    mock.timers.reset();
  }

  const row = await actions.findOne({ _id: action.actionId });
  assert.equal(row.status, 'EXPIRED', 'the skew is classified as expired, not decided');
  assert.equal(row.decisionHash, undefined, 'no decision hash was stored');
  assert.equal(row.leaseUntil, undefined, 'no lease was taken');
  assert.equal(row.result, undefined, 'no result was stored');
  const afterPeriod = await Period.findById(p.id).lean();
  assert.equal(afterPeriod.status, 'DRAFT', 'the period must not be opened');
  assert.equal(afterPeriod.version, beforePeriod.version);
  assert.deepEqual(afterPeriod.history, beforePeriod.history);
  assert.equal(await Assignment.countDocuments({ period: p.period }), 0, 'no assignment was written');
});

// Bug 1b regression: repeated crashes. Each crash leaves one more STORE written;
// every recovery with a fresh clientRequestId must finish without duplicates,
// keep the earlier rows untouched, and only report them as skipped.
test('repeated crashes recover incrementally without duplicates or drift', async () => {
  const { p, action } = await crashAfterFirstStore('2025-09');
  const actions = mongoose.connection.collection('revenue_kpi_open_actions');
  const snapshots = [];

  // Second crash window: the retry inserts the missing STORE, hits E11000 on the
  // duplicate, and only the AREA write is failed — leaving two STORE drafts.
  const originalCreate = Assignment.create;
  Assignment.create = async function (row) {
    if (row.unitType === 'AREA') throw new Error('injected second crash after one more store write');
    return originalCreate.call(this, row);
  };
  try {
    const second = await S.decideRevenueKpiOpenAction(hr, action.actionId,
      command(action.preview.version, { approve: true, planDigest: action.preview.planDigest }));
    assert.equal(second.result.outcome, 'PARTIAL');
  } finally { Assignment.create = originalCreate; }
  await actions.updateOne({ _id: action.actionId },
    { $set: { status: 'CONFIRMED', leaseUntil: new Date(Date.now() - 1000).toISOString() }, $unset: { result: '' } });
  const afterSecond = await Assignment.find({ period: p.period }).lean();
  assert.equal(afterSecond.length, 2, 'the second crash leaves two STORE drafts');
  snapshots.push(...afterSecond.map(r => ({ _id: String(r._id), targetVnd: r.targetVnd, version: r.version })));

  // Final recovery with a fresh clientRequestId completes the plan.
  const retry = await S.decideRevenueKpiOpenAction(hr, action.actionId,
    command(action.preview.version, { approve: true, planDigest: action.preview.planDigest }));
  assert.equal(retry.status, 'EXECUTED');
  assert.equal(retry.result.outcome, 'FULL');
  assert.deepEqual(retry.result.summary, { created: 1, skipped: 2, blocked: 0, failed: 0, total: 3 });

  const after = await Assignment.find({ period: p.period }).lean();
  assert.equal(after.length, 3, 'no duplicates across three runs');
  for (const snap of snapshots) {
    const kept = after.find(r => String(r._id) === snap._id);
    assert.ok(kept, 'earlier rows survive');
    assert.equal(kept.targetVnd, snap.targetVnd);
    assert.equal(kept.version, snap.version, 'earlier rows were not rewritten');
  }
  const skippedIds = new Set(retry.result.skipped.map(i => i.assignmentId));
  for (const snap of snapshots) assert.ok(skippedIds.has(snap._id), 'each previously written STORE is skipped, not recreated');
});

// Bug 1c regression: a partially crashed action must fail closed when the world
// drifts. Mutating a written row, or unblocking an item that was BLOCKED in the
// approved preview, must never push the retry past the approved preview.
test('post-crash world drift fails closed and never writes beyond the preview', async () => {
  // Part 1: mutate the already-written STORE row on disk (targetVnd and its
  // stores[0].targetVnd together, so the row stays schema-valid). The retry must
  // reject, keep the drifted row untouched and write nothing.
  const { p, action, written } = await crashAfterFirstStore('2025-08');
  const before = await Assignment.countDocuments({ period: p.period });
  const beforePeriod = await Period.findById(p.id).lean();

  await Assignment.collection.updateOne({ _id: written[0]._id },
    { $set: { targetVnd: written[0].targetVnd + 5000, 'stores.0.targetVnd': written[0].stores[0].targetVnd + 5000 } });

  let mutation;
  try {
    mutation = await S.decideRevenueKpiOpenAction(hr, action.actionId,
      command(action.preview.version, { approve: true, planDigest: action.preview.planDigest }));
  } catch (e) {
    assert.equal(e.status, 409, 'the drifted world must fail closed with a conflict');
    assert.ok(['REVENUE_KPI_PLAN_CHANGED', 'REVENUE_KPI_TARGET_INVALID'].includes(e.code), `unexpected code ${e.code}`);
  }
  if (mutation) {
    assert.ok(['PARTIAL', 'NONE'].includes(mutation.result.outcome), `unexpected outcome ${mutation.result.outcome}`);
    assert.ok(mutation.result.failed.length + mutation.result.blocked.length >= 1,
      'the mutated row must surface as a conflict, not silently pass');
    assert.equal(mutation.result.summary.created, 0, 'a drift-conflicted retry creates nothing beyond the preview');
  }
  const drifted = await Assignment.findById(written[0]._id).lean();
  assert.equal(drifted.targetVnd, written[0].targetVnd + 5000, 'the drifted row is never silently corrected');
  assert.equal(await Assignment.countDocuments({ period: p.period }), before, 'the rejection writes nothing');
  assert.equal(await Period.findById(p.id).then(r => r.status), beforePeriod.status, 'the period state is untouched');
});

// Bug 1d regression: an item BLOCKED in the approved preview must never become
// CREATE on retry. The second store has no base revenue when the preview is
// approved; adding it after the crash must not let the retry create that store.
test('a blocked preview item stays blocked after the crash', async () => {
  const { p, action, written } = await crashAfterFirstStore('2025-07', true);
  assert.equal(action.preview.summary.create, 1);
  assert.equal(action.preview.summary.blocked, 2);

  // The world drifts: the missing base revenue now exists. A fresh plan would
  // turn the blocked STORE (and its AREA) into CREATE.
  const [year, month] = '2025-07'.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 2, 10, 6, 30));
  const ledger = await PosOrderModel.findOne({ orderId: 'KPI-2026-09' }).lean();
  delete ledger._id;
  await PosOrderModel.create({ ...ledger, storeId: fixture.stores[1]._id, orderId: 'UNBLOCK-BASE-2025-07', orderedAt: base });

  const before = await Assignment.countDocuments({ period: p.period });
  let retry;
  try {
    retry = await S.decideRevenueKpiOpenAction(hr, action.actionId,
      command(action.preview.version, { approve: true, planDigest: action.preview.planDigest }));
  } catch (e) {
    assert.equal(e.status, 409, 'the unblocked world must fail closed with a plan-changed conflict');
    assert.equal(e.code, 'REVENUE_KPI_PLAN_CHANGED');
    assert.equal(await Assignment.countDocuments({ period: p.period }), before, 'a rejection writes nothing');
    return;
  }
  assert.equal(retry.status, 'EXECUTED');
  // Nothing beyond the approved preview may be created: the previously blocked
  // store stays uncreated even though base revenue now exists.
  const createdOrSkippedStores = new Set([
    ...retry.result.created.map(i => i.storeId).filter(Boolean),
    ...retry.result.skipped.map(i => i.storeId).filter(Boolean),
  ]);
  const blockedStore = action.preview.items.find(i => i.unitType === 'STORE' && i.status === 'BLOCKED').storeId;
  assert.equal(createdOrSkippedStores.has(blockedStore), false, 'the blocked item must not be created on retry');
  // storeId persists as a plain string on this model — query by string and sweep
  // every identity to be sure the blocked unit has no row in any form.
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: blockedStore }),
    0, 'no row exists for the previously blocked store');
  const identityKeys = new Set((await Assignment.find({ period: p.period }).lean())
    .map(r => r.unitType === 'STORE' ? String(r.storeId) : 'am:' + r.assigneeEmployeeId));
  assert.equal(identityKeys.has(blockedStore), false, 'no assignment identity exists for the blocked store');
  assert.equal(await Assignment.countDocuments({ period: p.period }) <= before + action.preview.summary.total - action.preview.summary.blocked,
    true, 'the retry never writes beyond the approved preview');
});

// QA regression: recovery after the period write but before any assignment
// write. The retry must still complete the approved plan even though nothing
// was persisted yet — no duplicates, outcome FULL.
test('recovery with an open period but zero written assignments completes the plan', async () => {
  const { p, action } = await crashAfterFirstStore('2025-05', false, false);
  const actions = mongoose.connection.collection('revenue_kpi_open_actions');

  // Crash in the widest gap: the period flipped to OPEN, no assignment survived.
  const originalCreate = Assignment.create;
  Assignment.create = async () => { throw new Error('injected crash before any assignment write'); };
  let crashed;
  try {
    crashed = await S.decideRevenueKpiOpenAction(hr, action.actionId, confirm(action));
    assert.equal(crashed.result.outcome, 'NONE', 'every write failed, the outcome is NONE');
    assert.equal(crashed.result.period.status, 'OPEN');
  } finally { Assignment.create = originalCreate; }
  assert.equal(await Assignment.countDocuments({ period: p.period }), 0);
  // Keep the decisionHash the real claim wrote; only rewind status/lease.
  await actions.updateOne({ _id: action.actionId },
    { $set: { status: 'CONFIRMED', leaseUntil: new Date(Date.now() - 1000).toISOString() }, $unset: { result: '' } });

  const retry = await S.decideRevenueKpiOpenAction(hr, action.actionId,
    command(action.preview.version, { approve: true, planDigest: action.preview.planDigest }));
  assert.equal(retry.status, 'EXECUTED');
  assert.equal(retry.result.outcome, 'FULL');
  assert.deepEqual(retry.result.summary, { created: 3, skipped: 0, blocked: 0, failed: 0, total: 3 });
  assert.equal(await Assignment.countDocuments({ period: p.period }), 3);
});

// QA regression: recovery from the FAILED status itself, not just CONFIRMED.
test('recovery from FAILED status finishes the approved plan', async () => {
  const { p, action } = await crashAfterFirstStore('2025-04');
  const actions = mongoose.connection.collection('revenue_kpi_open_actions');
  // The worker marked the action FAILED while dying; recovery must accept it
  // and keep the claim's own decisionHash.
  await actions.updateOne({ _id: action.actionId }, { $set: { status: 'FAILED' } });

  const retry = await S.decideRevenueKpiOpenAction(hr, action.actionId,
    command(action.preview.version, { approve: true, planDigest: action.preview.planDigest }));
  assert.equal(retry.status, 'EXECUTED');
  assert.equal(retry.result.outcome, 'FULL');
  assert.equal(await Assignment.countDocuments({ period: p.period }), 3);
  const kept = await Assignment.find({ period: p.period, unitType: 'STORE' }).lean();
  assert.equal(kept.length, 2, 'both stores exist exactly once');
});

// QA regression: a CONFIRMED action whose proposal already expired still
// completes — the plan was approved before the deadline, so the recovery path
// (not the expiry gate) owns the decision.
test('a confirmed action past expiresAt still completes its approved plan', async () => {
  const { p, action } = await crashAfterFirstStore('2025-03');
  const actions = mongoose.connection.collection('revenue_kpi_open_actions');
  await actions.updateOne({ _id: action.actionId },
    { $set: { leaseUntil: new Date(Date.now() - 1000).toISOString(), expiresAt: new Date(Date.now() - 1000).toISOString() } });

  const retry = await S.decideRevenueKpiOpenAction(hr, action.actionId,
    command(action.preview.version, { approve: true, planDigest: action.preview.planDigest }));
  assert.equal(retry.status, 'EXECUTED', 'an approved plan is recoverable even after expiry');
  assert.equal(retry.result.outcome, 'FULL');
  assert.equal(await Assignment.countDocuments({ period: p.period }), 3);
});

// QA regression: a retry with the wrong expectedVersion or planDigest must be
// rejected without any write.
test('a retry with wrong expectedVersion or planDigest is rejected without writes', async () => {
  const { p, action } = await crashAfterFirstStore('2025-02');
  const actions = mongoose.connection.collection('revenue_kpi_open_actions');
  await actions.updateOne({ _id: action.actionId },
    { $set: { status: 'CONFIRMED', leaseUntil: new Date(Date.now() - 1000).toISOString() }, $unset: { result: '' } });
  const before = await Assignment.countDocuments({ period: p.period });
  const beforePeriod = await Period.findById(p.id).lean();

  await assert.rejects(S.decideRevenueKpiOpenAction(hr, action.actionId,
    command(action.preview.version + 1, { approve: true, planDigest: action.preview.planDigest })),
    e => e.status === 409, 'a stale expectedVersion must be rejected');
  // A digest-shaped but different value: Zod requires 64 hex chars, so a plain
  // 'wrong-digest' would be rejected at parse time instead of the recovery path.
  await assert.rejects(S.decideRevenueKpiOpenAction(hr, action.actionId,
    command(action.preview.version, { approve: true, planDigest: digest({ wrong: true }) })),
    e => e.status === 409, 'a wrong planDigest must be rejected');
  assert.equal(await Assignment.countDocuments({ period: p.period }), before, 'rejected retries write nothing');
  const afterPeriod = await Period.findById(p.id).lean();
  assert.equal(afterPeriod.status, beforePeriod.status);
  assert.equal(afterPeriod.version, beforePeriod.version);
});

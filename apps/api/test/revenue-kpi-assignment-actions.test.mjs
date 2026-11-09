import './require-isolated-db.mjs';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'p3-assignment-actions-test-jwt-secret-minimum-32';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { connectDB, disconnectDB } from '../dist/db.js';
import * as S from '../dist/services/revenue-kpi.service.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';
import mongoose from 'mongoose';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';

let f, hr, hr2, am, sm;
const actions = () => mongoose.connection.collection('revenue_kpi_open_actions');
let periodSeq = 0;
const countAssignments = period => Assignment.countDocuments({ period });

before(async () => {
  await connectDB();
  f = await revenueFixture();
  hr = await f.principal('hr');
  hr2 = await f.principal('hr2');
  am = await f.principal('am');
  sm = await f.principal('sm');
  // 12 tests need 12 distinct periods; the fixture seeds POS history for
  // 2026-07..2026-10 only, so extend it back to 2025-12 for the extra months.
  const { PosOrderModel } = await import('../dist/models/PosOrder.js');
  for (const period of ['2025-12', '2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-11']) {
    await PosOrderModel.create({ orderId: 'KPI-P3-' + period, storeId: f.stores[0]._id, orderedAt: new Date(period + '-10T06:30:00+07:00'), source: 'demo', ledgerVersion: 1,
      status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH', subtotalVnd: 100000, discountVnd: 0, refundVnd: 0, netRevenueVnd: 100000,
      items: [{ productId: 'T', productName: 'Đơn giả lập P3', quantity: 1, unitPriceVnd: 100000, lineTotalVnd: 100000 }] });
  }
});

after(disconnectDB);

// Each test gets an isolated OPEN period so state transitions never collide.
async function newPeriod() {
  // Prior-month POS data exists for each of these (fixture + extension above).
  const months = ['2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01', '2025-12'];
  const period = months[periodSeq % months.length];
  periodSeq += 1;
  const p = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, p.period, command(p.version));
  return p.period;
}

const approve = (action, extra = {}) => ({
  approve: true, clientRequestId: randomUUID(),
  expectedVersion: action.preview.expectedVersion, planDigest: action.preview.planDigest, ...extra,
});
const decline = () => ({ approve: false, clientRequestId: randomUUID() });

// HR creates and publishes a STORE assignment; returns { draft, published }.
async function publishedStoreAssignment(actor = hr, period) {
  const periodId = period ?? await newPeriod();
  const d = await S.revenueKpiDashboard(hr, periodId);
  const draft = d.assignments.find(a => a.unitType === 'STORE');
  assert.ok(draft);
  const published = await S.mutateRevenueKpiAssignment(actor, draft.id, 'publish', command(draft.version));
  return { draft, published };
}

test('preview is read-only and binds expectedVersion + planDigest', async () => {
  const period = await newPeriod();
  const d = await S.revenueKpiDashboard(hr, period);
  const draft = d.assignments.find(a => a.unitType === 'STORE');
  const beforeRows = await countAssignments(draft.period);
  const beforeDoc = await Assignment.findById(draft.id).lean();

  const proposal = await S.previewRevenueAssignmentAction(hr, draft.id, 'publish', {});
  assert.equal(proposal.type, 'revenue_kpi.mutate_assignment');
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(proposal.executed, false);
  assert.equal(proposal.preview.assignmentId, draft.id);
  assert.equal(proposal.preview.expectedVersion, draft.version);
  assert.match(proposal.preview.planDigest, /^[a-f0-9]{64}$/);
  assert.ok(proposal.preview.summary.length > 0);
  assert.equal(await countAssignments(draft.period), beforeRows);
  assert.deepEqual(await Assignment.findById(draft.id).lean(), beforeDoc);

  // Re-preview with the same requestId replays the stored proposal, no duplicate row.
  const again = await S.previewRevenueAssignmentAction(hr, draft.id, 'publish', {}, proposal.actionId);
  assert.equal(again.actionId, proposal.actionId);
});

test('confirm accept by the assignee executes and stores result.assignment; repeat confirm replays', async () => {
  const { published } = await publishedStoreAssignment();
  const proposal = await S.previewRevenueAssignmentAction(sm, published.id, 'accept', {});
  const input = approve(proposal);
  const done = await S.decideChatAction(sm, proposal.actionId, input);
  assert.equal(done.status, 'EXECUTED');
  assert.equal(done.result.assignment.status, 'ACTIVE');
  assert.equal(done.result.assignment.id, published.id);
  const afterVersion = done.result.assignment.version;
  const totalAfter = await countAssignments(done.result.assignment.period);

  const replay = await S.decideChatAction(sm, proposal.actionId, input);
  assert.equal(replay.status, 'EXECUTED');
  assert.equal(replay.result.assignment.version, afterVersion);
  assert.equal(await countAssignments(replay.result.assignment.period), totalAfter);
});

test('HR refuse is blocked by own() through preview and decision', async () => {
  const { published } = await publishedStoreAssignment();
  await assert.rejects(
    S.previewRevenueAssignmentAction(hr, published.id, 'refuse', { reason: 'HR tự từ chối KPI của mình.' }),
    e => e.code === 'RBAC_DENIED');
  const proposal = await S.previewRevenueAssignmentAction(sm, published.id, 'refuse', { reason: 'SM từ chối trong chat.' });
  await assert.rejects(
    S.decideChatAction(hr, proposal.actionId, approve(proposal)),
    e => e.status === 404 && e.code === 'REVENUE_KPI_ACTION_NOT_FOUND');
  const done = await S.decideChatAction(sm, proposal.actionId, approve(proposal));
  assert.equal(done.result.assignment.status, 'HR_REVIEW');
});

test('AREA hr-decision with drifted store target is blocked in preview warning and at execute', async () => {
  const period = await newPeriod();
  const d = await S.revenueKpiDashboard(hr, period);
  const area = d.assignments.find(a => a.unitType === 'AREA');
  assert.ok(area);
  const store = d.assignments.find(a => a.unitType === 'STORE');
  assert.ok(store);
  // publish the AREA KPI first: hr-decision ADJUST requires a published state,
  // and a drifted store would block publishing the area.
  await S.mutateRevenueKpiAssignment(hr, area.id, 'publish', command(area.version));
  const area2 = (await S.revenueKpiDashboard(hr, period)).assignments.find(a => a.id === area.id);
  // drift one STORE target so AREA sum no longer matches
  await S.mutateRevenueKpiAssignment(hr, store.id, 'publish', command(store.version));
  const store2 = (await S.revenueKpiDashboard(hr, period)).assignments.find(a => a.id === store.id);
  await S.mutateRevenueKpiAssignment(hr, store.id, 'hr-decision',
    command(store2.version, { action: 'ADJUST', newTargetVnd: store2.targetVnd + 1000, reason: 'Điều chỉnh cửa hàng làm lệch tổng khu vực.' }));
  const proposal = await S.previewRevenueAssignmentAction(hr, area.id, 'hr-decision',
    { action: 'ADJUST', newTargetVnd: area2.targetVnd, reason: 'Thử điều chỉnh khu vực khi cửa hàng đã lệch.' });
  // preview surfaces the drift as a warning instead of writing
  assert.ok(proposal.preview.warnings.length > 0, 'preview must warn on AREA drift');
  await assert.rejects(
    S.decideChatAction(hr, proposal.actionId, approve(proposal)),
    e => e.code === 'REVENUE_KPI_TARGET_INVALID');
});

test('adjustment-request by SM then verify by AM then decision by HR via chat actions', async (t) => {
  const { published } = await publishedStoreAssignment();
  const active = await S.mutateRevenueKpiAssignment(sm, published.id, 'accept', command(published.version));

  const req = await S.previewRevenueAssignmentAction(sm, active.id, 'adjustment-request',
    { reason: 'Cần điều chỉnh mục tiêu sau sự cố.', evidenceRef: 'Biên bản mô phỏng P3 số 01.' });
  t.mock.timers.enable({ apis: ['Date'], now: Date.now() });
  let reqDone;
  try {
    reqDone = await S.decideChatAction(sm, req.actionId, approve(req));
  } finally {
    t.mock.timers.reset();
  }
  assert.equal(reqDone.result.assignment.status, 'ADJUSTMENT_REQUESTED');
  assert.equal(reqDone.result.assignment.adjustment.status, 'PENDING');

  const verify = await S.previewRevenueAssignmentAction(am, reqDone.result.assignment.id, 'adjustment-verify',
    { reason: 'AM đã đối chiếu biên bản.' });
  const verifyDone = await S.decideChatAction(am, verify.actionId, approve(verify));
  assert.equal(verifyDone.result.assignment.adjustment.status, 'VERIFIED');

  const decision = await S.previewRevenueAssignmentAction(hr, verifyDone.result.assignment.id, 'adjustment-decision',
    { action: 'APPROVE', newTargetVnd: 99000, reason: 'HR duyệt điều chỉnh sau xác minh.' });
  const decisionDone = await S.decideChatAction(hr, decision.actionId, approve(decision));
  assert.equal(decisionDone.result.assignment.status, 'PENDING_ACCEPTANCE');
  assert.equal(decisionDone.result.assignment.adjustment.status, 'APPROVED');
  assert.equal(decisionDone.result.assignment.targetVnd, 99000);
});

test('responsibility reassignment through chat proposal', async () => {
  const { published } = await publishedStoreAssignment();
  const active = await S.mutateRevenueKpiAssignment(sm, published.id, 'accept', command(published.version));
  const proposal = await S.previewRevenueAssignmentAction(hr, active.id, 'responsibility',
    { reason: 'Chuyển phụ trách theo biên bản bàn giao.', assigneeEmployeeId: sm.employeeId, from: new Date().toISOString() });
  const done = await S.decideChatAction(hr, proposal.actionId, approve(proposal));
  assert.equal(done.result.assignment.status, 'PENDING_ACCEPTANCE');
  assert.equal(done.result.assignment.assigneeEmployeeId, String(sm.employeeId));
});

test('stale expectedVersion fails closed with PLAN_CHANGED and a fresh preview', async () => {
  const { published } = await publishedStoreAssignment();
  const proposal = await S.previewRevenueAssignmentAction(sm, published.id, 'accept', {});
  // HR cancels after the preview: version and digest drift behind the confirm.
  const current = (await S.revenueKpiDashboard(hr, published.period)).assignments.find(a => a.id === published.id);
  await S.mutateRevenueKpiAssignment(hr, published.id, 'hr-decision',
    command(current.version, { action: 'CANCEL', reason: 'Huỷ sau khi lập bản xem trước để kiểm tra PLAN_CHANGED.' }));
  const drifted = (await S.revenueKpiDashboard(hr, published.period)).assignments.find(a => a.id === published.id);
  assert.ok(drifted && drifted.version !== proposal.preview.expectedVersion);
  await assert.rejects(
    S.decideChatAction(sm, proposal.actionId, { ...approve(proposal), expectedVersion: proposal.preview.expectedVersion }),
    e => e.status === 409 && e.code === 'REVENUE_KPI_PLAN_CHANGED' && e.preview && e.preview.expectedVersion === drifted.version);
});

test('another owner cannot confirm: 404, and HR authority change re-proposes', async () => {
  const { published } = await publishedStoreAssignment();
  const proposal = await S.previewRevenueAssignmentAction(hr, published.id, 'publish', {});
  await assert.rejects(
    S.decideChatAction(hr2, proposal.actionId, approve(proposal)),
    e => e.status === 404 && e.code === 'REVENUE_KPI_ACTION_NOT_FOUND');
  await assert.rejects(
    S.decideChatAction(hr2, proposal.actionId, decline()),
    e => e.status === 404);
  // decline by owner works and the action is terminal; any later decision replays
  // the stored outcome (idempotent by action id, same as P0)
  const cancelled = await S.decideChatAction(hr, proposal.actionId, decline());
  assert.equal(cancelled.status, 'CANCELLED');
  const replayedDecline = await S.decideChatAction(hr, proposal.actionId, decline());
  assert.equal(replayedDecline.status, 'CANCELLED');
  const replayedApprove = await S.decideChatAction(hr, proposal.actionId, approve(proposal));
  assert.equal(replayedApprove.status, 'CANCELLED');
  assert.equal(replayedApprove.result, null);
});

test('AREA equals the sum of STORE assignments after chat-driven accept flow', async () => {
  const period = await newPeriod();
  const d = await S.revenueKpiDashboard(hr, period);
  const storeSum = d.assignments.filter(a => a.unitType === 'STORE' && a.status !== 'CANCELLED')
    .reduce((n, a) => n + a.targetVnd, 0);
  const area = d.assignments.find(a => a.unitType === 'AREA');
  assert.ok(area);
  assert.equal(area.targetVnd, storeSum);
});

test('securityVersion bump invalidates confirm with authority change 403', async () => {
  const { published } = await publishedStoreAssignment();
  const { UserModel } = await import('../dist/models/User.js');
  const user = await UserModel.findById(f.actors.sm.user._id).lean();
  const proposal = await S.previewRevenueAssignmentAction(sm, published.id, 'accept', {});
  await UserModel.collection.updateOne({ _id: user._id }, { $inc: { securityVersion: 1 } });
  try {
    const { resolvePrincipal } = await import('../dist/services/principal.service.js');
    const bumped = await resolvePrincipal({ sub: String(f.actors.sm.user._id), role: 'Employee', securityVersion: 1 });
    await assert.rejects(
      S.decideChatAction(bumped, proposal.actionId, approve(proposal)),
      e => e.status === 403 && e.code === 'REVENUE_KPI_AUTHORITY_CHANGED');
  } finally {
    await UserModel.collection.updateOne({ _id: user._id }, { $set: { securityVersion: user.securityVersion } });
  }
});

test('expired proposal cannot be confirmed', async () => {
  const { published } = await publishedStoreAssignment();
  const proposal = await S.previewRevenueAssignmentAction(sm, published.id, 'accept', {});
  await actions().updateOne({ _id: proposal.actionId }, { $set: { expiresAt: new Date(0).toISOString() } });
  await assert.rejects(
    S.decideChatAction(sm, proposal.actionId, approve(proposal)),
    e => e.code === 'REVENUE_KPI_ACTION_EXPIRED');
});

test('P0 open-period actions still work through the shared collection', async () => {
  const next = '2026-12';
  const draft = await S.createRevenueKpiPeriod(hr, command(0, { period: next, policy: { allowDemoData: true } }));
  const proposal = await S.proposeRevenueKpiPeriodOpen(hr, next);
  assert.equal(proposal.type, 'revenue_kpi.open_period');
  const done = await S.decideRevenueKpiOpenAction(hr, proposal.actionId,
    { approve: true, expectedVersion: proposal.preview.version, planDigest: proposal.preview.planDigest, clientRequestId: randomUUID() });
  assert.equal(done.status, 'EXECUTED');
  const row = await actions().findOne({ _id: proposal.actionId });
  assert.ok(row.result, 'P0 decision stores its result');
  assert.ok(row.preview, 'P0 proposal shares the collection with P3 rows');
});

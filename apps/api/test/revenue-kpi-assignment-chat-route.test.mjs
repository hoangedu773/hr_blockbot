import './require-isolated-db.mjs';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'p3-assignment-chat-route-test-jwt-secret-min';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import * as S from '../dist/services/revenue-kpi.service.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';
import { beginAuthorizedChat } from '../dist/services/chat-authorization.service.js';
import { RevenueKpiPeriodModel as Period } from '../dist/models/RevenueKpiPeriod.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { SmAppointmentModel } from '../dist/models/SmAppointment.js';
import { PosOrderModel } from '../dist/models/PosOrder.js';

let f, app, base, hr, hr2, sm;
const actions = () => mongoose.connection.collection('revenue_kpi_open_actions');
const countAssignments = period => Assignment.countDocuments({ period });
const countActions = () => actions().countDocuments({});

before(async () => {
  await connectDB();
  f = await revenueFixture();
  hr = await f.principal('hr');
  hr2 = await f.principal('hr2');
  sm = await f.principal('sm');
  const { PosOrderModel } = await import('../dist/models/PosOrder.js');
  for (const period of ['2026-06', '2025-12']) {
    await PosOrderModel.create({ orderId: 'KPI-ROUTE-' + period, storeId: f.stores[0]._id, orderedAt: new Date(period + '-10T06:30:00+07:00'), source: 'demo', ledgerVersion: 1,
      status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH', subtotalVnd: 100000, discountVnd: 0, refundVnd: 0, netRevenueVnd: 100000,
      items: [{ productId: 'T', productName: 'Đơn giả lập route', quantity: 1, unitPriceVnd: 100000, lineTotalVnd: 100000 }] });
  }
  process.env.AI_SERVICE_API_KEY = 'p5-assignment-chat-route-isolated-service-key';
  app = createServer(createApp());
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + app.address().port + '/api';
});

after(async () => {
  if (app?.listening) { app.closeAllConnections(); await new Promise(resolve => app.close(resolve)); }
  await disconnectDB();
});

async function call(actor, path, body) {
  const response = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + f.actors[actor].token, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { status: response.status, body: await response.json() };
}

// OPEN period + draft STORE assignment, đảm bảo mỗi test một kỳ riêng để tránh
// đụng trạng thái (fixture chỉ seed POS 2026-07..10, mở rộng 06/2025-12 ở trên).
const periods = ['2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2025-12'];
let periodSeq = 0;
async function draftStoreAssignment(actor = hr) {
  const period = periods[periodSeq++];
  const p = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, p.period, command(p.version));
  const d = await S.revenueKpiDashboard(actor, period);
  const draft = d.assignments.find(a => a.unitType === 'STORE');
  assert.ok(draft, 'fixture phải sinh KPI STORE cho kỳ ' + period);
  return { period, draft };
}

const approveInput = action => ({ approve: true, clientRequestId: randomUUID(),
  expectedVersion: action.preview.expectedVersion, planDigest: action.preview.planDigest });

test('POST /chat/actions/:id/decision executes a mutate_assignment proposal over real HTTP, idempotently', async () => {
  const { period, draft } = await draftStoreAssignment();
  // Propose bằng propose path thật — không chèn row tay.
  const proposal = await S.previewRevenueAssignmentAction(hr, draft.id, 'publish', {});
  const input = approveInput(proposal);

  const assignmentsBefore = await countAssignments(period);
  const actionsBefore = await countActions();
  assert.equal(assignmentsBefore >= 1, true);

  const done = await call('hr', '/chat/actions/' + proposal.actionId + '/decision', input);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.type, 'revenue_kpi.mutate_assignment');
  assert.equal(done.body.status, 'EXECUTED');
  assert.equal(done.body.executed, true);
  assert.equal(done.body.result.assignment.id, draft.id);
  assert.equal(done.body.result.assignment.status, 'PENDING_ACCEPTANCE');

  // Repeat cùng input → stored result, không ghi thừa.
  const replay = await call('hr', '/chat/actions/' + proposal.actionId + '/decision', input);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.deepEqual(replay.body, done.body);

  const row = await actions().findOne({ _id: proposal.actionId });
  assert.equal(row.status, 'EXECUTED');
  assert.equal(row.result.assignment.version, done.body.result.assignment.version);

  const assignmentsAfter = await countAssignments(period);
  const actionsAfter = await countActions();
  assert.equal(assignmentsAfter, assignmentsBefore, 'decision không được tạo/xóa assignment');
  assert.equal(actionsAfter, actionsBefore, 'số document action không đổi sau decision');
});

test('GET /chat/actions/:id returns the mutate_assignment envelope (no 500)', async () => {
  const { draft } = await draftStoreAssignment();
  const proposal = await S.previewRevenueAssignmentAction(hr, draft.id, 'publish', {});
  const before = await countActions();

  const got = await call('hr', '/chat/actions/' + proposal.actionId);
  assert.equal(got.status, 200, JSON.stringify(got.body));
  assert.equal(got.body.type, 'revenue_kpi.mutate_assignment');
  assert.equal(got.body.actionId, proposal.actionId);
  assert.equal(got.body.status, 'PENDING');
  assert.equal(got.body.requiresConfirmation, true);
  assert.deepEqual(got.body.preview, proposal.preview);
  assert.equal(got.body.result, null);
  assert.equal(await countActions(), before, 'GET không được ghi document mới');
});

test('GET /chat/actions/:id → 404 for unknown id and for another user’s action', async () => {
  const { draft } = await draftStoreAssignment();
  const proposal = await S.previewRevenueAssignmentAction(hr, draft.id, 'publish', {});
  assert.equal((await call('hr', '/chat/actions/' + randomUUID())).status, 404);
  assert.equal((await call('hr2', '/chat/actions/' + proposal.actionId)).status, 404);
});

test('decision by another user → 404 and zero writes', async () => {
  const { period, draft } = await draftStoreAssignment();
  const proposal = await S.previewRevenueAssignmentAction(hr, draft.id, 'publish', {});
  const input = approveInput(proposal);

  const assignmentsBefore = await countAssignments(period);
  const before = await actions().findOne({ _id: proposal.actionId });

  const denied = await call('hr2', '/chat/actions/' + proposal.actionId + '/decision', input);
  assert.equal(denied.status, 404, JSON.stringify(denied.body));

  const after = await actions().findOne({ _id: proposal.actionId });
  assert.deepEqual(after, before, 'action row phải bất biến sau 404');
  assert.equal(await countAssignments(period), assignmentsBefore);
  const doc = await Assignment.findById(draft.id).lean();
  assert.equal(doc.status, 'DRAFT');
  assert.equal(doc.version, draft.version);
});

test('stale expectedVersion → 409 with a fresh preview', async () => {
  const { draft } = await draftStoreAssignment();
  const proposal = await S.previewRevenueAssignmentAction(hr, draft.id, 'publish', {});

  // Bump live version thật sau khi preview: publish trực tiếp qua service.
  const published = await S.mutateRevenueKpiAssignment(hr, draft.id, 'publish', command(draft.version));
  assert.ok(published.version > proposal.preview.expectedVersion);

  const stale = await call('hr', '/chat/actions/' + proposal.actionId + '/decision', approveInput(proposal));
  assert.equal(stale.status, 409, JSON.stringify(stale.body));
  assert.equal(stale.body.error.code, 'REVENUE_KPI_PLAN_CHANGED');
  assert.ok(stale.body.preview, '409 phải kèm preview mới');
  assert.equal(stale.body.preview.assignmentId, draft.id);
  assert.equal(stale.body.preview.expectedVersion, published.version);
  assert.notEqual(stale.body.preview.planDigest, proposal.preview.planDigest);
  assert.equal((await Assignment.findById(draft.id).lean()).status, 'PENDING_ACCEPTANCE');
  const row = await actions().findOne({ _id: proposal.actionId });
  assert.equal(row.status, 'FAILED', 'claim CONFIRMED phải được mark FAILED sau 409');
});

const p5Periods = Array.from({ length: 48 }, (_, index) => {
  const year = 2027 + Math.floor(index / 12);
  const month = String(index % 12 + 1).padStart(2, '0');
  return `${year}-${month}`;
});

async function unusedP5Period() {
  for (const period of p5Periods) {
    if (!(await Period.exists({ period }))) return period;
  }
  assert.fail('no unused period available for P5 HTTP tests');
}

async function seedP5Base(period, storeId) {
  const [year, month] = period.split('-').map(Number);
  await PosOrderModel.create({ orderId: `KPI-P5-CHAT-${period}-${randomUUID()}`, storeId,
    orderedAt: new Date(Date.UTC(year, month - 2, 10, 6, 30)), source: 'demo', ledgerVersion: 1,
    status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH', subtotalVnd: 100000,
    discountVnd: 0, refundVnd: 0, netRevenueVnd: 100000,
    items: [{ productId: 'T', productName: 'Đơn gốc P5 HTTP', quantity: 1,
      unitPriceVnd: 100000, lineTotalVnd: 100000 }] });
}

async function spareStore(period) {
  const storeId = String(f.stores[1]._id);
  await UserModel.updateOne({ _id: f.actors.hr.user._id },
    { $addToSet: { 'authorization.grants.1.scope.storeIds': storeId } });
  await UserModel.updateOne({ _id: f.actors.am.user._id },
    { $addToSet: { 'authorization.grants.1.scope.storeIds': storeId } });

  const smAuthorization = structuredClone((await UserModel.findById(f.actors.sm.user._id).lean()).authorization);
  for (const grant of smAuthorization.grants) grant.scope.storeIds = grant.scope.storeIds.map(() => storeId);
  await UserModel.updateOne({ _id: f.actors.staffB.user._id }, { $set: { authorization: smAuthorization } });
  await EmployeeModel.updateOne({ _id: f.actors.staffB.employee._id }, { $set: { storeId: f.stores[1]._id } });

  const appointment = await SmAppointmentModel.findOne({ employeeId: f.actors.staffB.employee._id,
    storeId: f.stores[1]._id, status: 'APPROVED', kind: 'PRIMARY' }).lean();
  if (!appointment) {
    await SmAppointmentModel.create({ employeeId: f.actors.staffB.employee._id, storeId: f.stores[1]._id,
      clientRequestId: randomUUID(), payloadHash: 'fixture', kind: 'PRIMARY', status: 'APPROVED',
      validFrom: new Date('2026-01-01'), validUntil: null, evidenceRef: 'Owner-approved isolated fixture',
      basis: 'SIMULATION_APPROVED', reason: 'Isolated test', requestedBy: f.actors.hr.user._id,
      requesterEmployeeId: f.actors.hr.employee._id, approvedBy: f.actors.hr2.user._id,
      approvedAt: new Date(), version: 1, history: [] });
  }
  await seedP5Base(period, f.stores[1]._id);
  return storeId;
}

async function callGateway(bound, args) {
  const response = await fetch(base + '/internal/authorization/tools', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + bound.delegationToken,
      'x-ai-service-key': process.env.AI_SERVICE_API_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requestId: bound.requestId, tool: 'preview_revenue_kpi_assign_action', args }),
  });
  return { status: response.status, body: await response.json() };
}

async function closeGatewayReceipt(bound) {
  await mongoose.connection.collection('chat_authorization_requests').updateOne(
    { _id: bound.requestId }, { $set: { status: 'CLOSED' } });
}

test('create_period chat proposal is read-only and confirmed idempotently over HTTP', async () => {
  const period = await unusedP5Period();
  const periodsBefore = await Period.countDocuments({});
  const bound = await beginAuthorizedChat(hr);
  try {
    const proposal = await callGateway(bound, { assignAction: 'create_period', period,
      policy: { allowDemoData: true, defaultGrowthPercent: 7 } });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    assert.equal(proposal.body.proposalOnly, true);
    const action = proposal.body.result;
    assert.equal(action.type, 'revenue_kpi.create_period');
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.executed, false);
    assert.equal(await Period.countDocuments({}), periodsBefore, 'preview must not create a period');

    const envelope = await call('hr', '/chat/actions/' + action.actionId);
    assert.equal(envelope.status, 200, JSON.stringify(envelope.body));
    assert.equal(envelope.body.actionId, action.actionId);
    assert.equal(envelope.body.type, 'revenue_kpi.create_period');
    assert.equal(envelope.body.status, 'PENDING');
    const otherOwner = await call('hr2', '/chat/actions/' + action.actionId);
    assert.equal(otherOwner.status, 404, JSON.stringify(otherOwner.body));

    const decision = { approve: true, clientRequestId: randomUUID(), expectedVersion: envelope.body.args.expectedVersion, planDigest: envelope.body.args.planDigest };
    const done = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.status, 'EXECUTED');
    assert.equal(done.body.result.period.period, period);
    assert.equal(await Period.countDocuments({}), periodsBefore + 1);
    assert.equal(await Period.countDocuments({ period }), 1);

    const replay = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body, done.body);
    assert.equal(await Period.countDocuments({}), periodsBefore + 1, 'replay must not duplicate the period');
  } finally {
    await closeGatewayReceipt(bound);
  }
});

test('save_assignment chat proposal is read-only and confirmed idempotently over HTTP', async () => {
  const period = await unusedP5Period();
  await seedP5Base(period, f.stores[0]._id);
  const created = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, created.period, command(created.version));
  const storeId = await spareStore(period);
  const assigneeEmployeeId = String(f.actors.staffB.employee._id);
  const before = await countAssignments(period);
  const bound = await beginAuthorizedChat(await f.principal('hr'));
  try {
    const proposal = await callGateway(bound, { assignAction: 'save_assignment', period, unitType: 'STORE',
      storeId, assigneeEmployeeId, targetMode: 'ABSOLUTE_VND', targetVnd: 100000,
      reason: 'Giao KPI cửa hàng qua chat HTTP.', bulk: false });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    assert.equal(proposal.body.proposalOnly, true);
    const action = proposal.body.result;
    assert.equal(action.type, 'revenue_kpi.save_assignment');
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.executed, false);
    assert.equal(await countAssignments(period), before, 'preview must not create an assignment');

    const envelope = await call('hr', '/chat/actions/' + action.actionId);
    assert.equal(envelope.status, 200, JSON.stringify(envelope.body));
    assert.equal(envelope.body.actionId, action.actionId);
    assert.equal(envelope.body.type, 'revenue_kpi.save_assignment');
    assert.equal(envelope.body.status, 'PENDING');

    const decision = { approve: true, clientRequestId: randomUUID(), expectedVersion: envelope.body.args.expectedVersion, planDigest: envelope.body.args.planDigest };
    const done = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.status, 'EXECUTED');
    assert.equal(done.body.result.summary.created, 1, JSON.stringify({ preview: action.preview, result: done.body.result }));
    assert.equal(done.body.result.created.length, 1);
    const draft = await Assignment.findOne({ period, unitType: 'STORE', storeId, status: 'DRAFT' }).lean();
    assert.ok(draft, 'confirmation must persist a DRAFT assignment');
    assert.equal(String(draft.assigneeEmployeeId), assigneeEmployeeId);

    const replay = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body, done.body);
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE', storeId, status: 'DRAFT' }), 1,
      'replay must not duplicate the draft');
  } finally {
    await closeGatewayReceipt(bound);
  }
});
test('save_assignment GROWTH_PERCENT chat confirmation rejects changed base-month POS revenue over HTTP', async () => {
  const period = '2026-04';
  const spareStoreId = String(f.stores[1]._id);
  await UserModel.updateOne({ _id: f.actors.hr.user._id },
    { $pull: { 'authorization.grants.1.scope.storeIds': spareStoreId } });
  hr = await f.principal('hr');
  await seedP5Base(period, f.stores[0]._id);
  const created = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, created.period, command(created.version));
  const storeId = await spareStore(period);
  const before = await countAssignments(period);
  const bound = await beginAuthorizedChat(await f.principal('hr'));
  try {
    const proposal = await callGateway(bound, { assignAction: 'save_assignment', period, unitType: 'STORE',
      storeId, assigneeEmployeeId: String(f.actors.staffB.employee._id), targetMode: 'GROWTH_PERCENT', growthPercent: 10,
      reason: 'Kiểm tra chống drift doanh thu kỳ gốc qua chat HTTP.', bulk: false });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    assert.equal(proposal.body.proposalOnly, true);
    const action = proposal.body.result;
    assert.equal(action.type, 'revenue_kpi.save_assignment');
    assert.equal(action.preview.willCreate.length, 1);
    const targetBefore = action.preview.willCreate[0].targetVnd;
    assert.ok(Number.isSafeInteger(targetBefore) && targetBefore > 0, JSON.stringify(action.preview));
    assert.equal(await countAssignments(period), before, 'preview must not create an assignment');

    const envelope = await call('hr', '/chat/actions/' + action.actionId);
    assert.equal(envelope.status, 200, JSON.stringify(envelope.body));
    assert.equal(envelope.body.status, 'PENDING');
    assert.equal(envelope.body.preview.willCreate[0].targetVnd, targetBefore,
      'GET action must expose the exact target from the chat preview');

    const [year, month] = period.split('-').map(Number);
    await PosOrderModel.create({ orderId: `KPI-P5-CHAT-DRIFT-${period}-${randomUUID()}`, storeId,
      orderedAt: new Date(Date.UTC(year, month - 2, 10, 6, 30)), source: 'demo', ledgerVersion: 1,
      status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH', subtotalVnd: 100000,
      discountVnd: 0, refundVnd: 0, netRevenueVnd: 100000,
      items: [{ productId: 'T', productName: 'Đơn làm thay đổi doanh thu gốc', quantity: 1,
        unitPriceVnd: 100000, lineTotalVnd: 100000 }] });

    const decision = { approve: true, clientRequestId: randomUUID(),
      expectedVersion: envelope.body.args.expectedVersion, planDigest: envelope.body.args.planDigest };
    const rejected = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error.code, 'REVENUE_KPI_PLAN_CHANGED');
    const targetAfter = rejected.body.preview.willCreate.find(item => item.storeId === storeId)?.targetVnd;
    assert.ok(Number.isSafeInteger(targetAfter) && targetAfter > 0, JSON.stringify(rejected.body.preview));
    assert.notEqual(targetAfter, targetBefore,
      `fresh preview must recompute target after base-month POS revenue changed: ${targetBefore} -> ${targetAfter}`);
    assert.equal(await countAssignments(period), before, 'PLAN_CHANGED must not write an assignment');
  } finally {
    await closeGatewayReceipt(bound);
  }
});

test('legacy P0 action row without type operates as open_period over GET and POST /chat/actions/:id', async () => {
  const period = await unusedP5Period();
  await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  const proposal = await S.proposeRevenueKpiPeriodOpen(hr, period);
  await actions().updateOne({ _id: proposal.actionId }, { $unset: { type: '' } });
  const raw = await actions().findOne({ _id: proposal.actionId });
  assert.equal(raw.type, undefined, 'legacy row must have no type');

  const otherGet = await call('hr2', '/chat/actions/' + proposal.actionId);
  assert.equal(otherGet.status, 404, JSON.stringify(otherGet.body));
  const otherPost = await call('hr2', '/chat/actions/' + proposal.actionId + '/decision', { approve: false, clientRequestId: randomUUID() });
  assert.equal(otherPost.status, 404, JSON.stringify(otherPost.body));

  const previewRes = await call('hr', '/chat/actions/' + proposal.actionId);
  assert.equal(previewRes.status, 200, JSON.stringify(previewRes.body));
  assert.equal(previewRes.body.actionId, proposal.actionId);
  assert.equal(previewRes.body.type, 'revenue_kpi.open_period');
  assert.equal(previewRes.body.status, 'PENDING');
  assert.equal(previewRes.body.requiresConfirmation, true);
  assert.deepEqual(previewRes.body.preview, proposal.preview);

  const cancel = await call('hr', '/chat/actions/' + proposal.actionId + '/decision', { approve: false, clientRequestId: randomUUID() });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.body));
  assert.equal(cancel.body.type, 'revenue_kpi.open_period');
  assert.equal(cancel.body.status, 'CANCELLED');
  const cancelReplay = await call('hr', '/chat/actions/' + proposal.actionId + '/decision', { approve: false, clientRequestId: randomUUID() });
  assert.equal(cancelReplay.status, 200);
  assert.deepEqual(cancelReplay.body, cancel.body);

  const periodConfirm = await unusedP5Period();
  await S.createRevenueKpiPeriod(hr, command(0, { period: periodConfirm, policy: { allowDemoData: true } }));
  const proposalConfirm = await S.proposeRevenueKpiPeriodOpen(hr, periodConfirm);
  await actions().updateOne({ _id: proposalConfirm.actionId }, { $unset: { type: '' } });

  const approveDecision = {
    approve: true,
    clientRequestId: randomUUID(),
    expectedVersion: proposalConfirm.preview.version,
    planDigest: proposalConfirm.preview.planDigest,
  };
  const executed = await call('hr', '/chat/actions/' + proposalConfirm.actionId + '/decision', approveDecision);
  assert.equal(executed.status, 200, JSON.stringify(executed.body));
  assert.equal(executed.body.type, 'revenue_kpi.open_period');
  assert.equal(executed.body.status, 'EXECUTED');
  assert.equal(executed.body.executed, true);
  assert.ok(executed.body.result, 'decision result must be present');

  const executedReplay = await call('hr', '/chat/actions/' + proposalConfirm.actionId + '/decision', approveDecision);
  assert.equal(executedReplay.status, 200);
  assert.deepEqual(executedReplay.body, executed.body);
});

test('save_assignment AREA chat proposal previews sum of two stores, GET action, confirms and replays idempotently over HTTP', async () => {
  const period = await unusedP5Period();
  await seedP5Base(period, f.stores[0]._id);
  const storeB = await spareStore(period);
  const storeA = String(f.stores[0]._id);
  hr = await f.principal('hr');

  const created = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, created.period, command(created.version));

  const targetA = 100000;
  const targetB = 150000;
  const expectedTotal = targetA + targetB;

  await S.saveRevenueKpiAssignment(hr, command(0, {
    period, unitType: 'STORE', storeId: storeA, assigneeEmployeeId: String(f.actors.sm.employee._id),
    targetMode: 'ABSOLUTE_VND', targetVnd: targetA, reason: 'Giao KPI Store A qua fixture.'
  }));
  await S.saveRevenueKpiAssignment(hr, command(0, {
    period, unitType: 'STORE', storeId: storeB, assigneeEmployeeId: String(f.actors.staffB.employee._id),
    targetMode: 'ABSOLUTE_VND', targetVnd: targetB, reason: 'Giao KPI Store B qua fixture.'
  }));

  const storeRows = await Assignment.find({ period, unitType: 'STORE', storeId: { $in: [storeA, storeB] } }).lean();
  assert.equal(storeRows.length, 2, 'fixture phải tạo đủ hai STORE KPI cùng kỳ');

  await Assignment.deleteMany({ period, unitType: 'AREA' });
  const areaCountBefore = await Assignment.countDocuments({ period, unitType: 'AREA' });
  assert.equal(areaCountBefore, 0, 'không còn AREA draft trước khi preview');

  const amEmployeeId = String(f.actors.am.employee._id);
  const bound = await beginAuthorizedChat(await f.principal('hr'));
  try {
    const proposal = await callGateway(bound, {
      assignAction: 'save_assignment',
      period,
      unitType: 'AREA',
      storeIds: [storeA, storeB],
      assigneeEmployeeId: amEmployeeId,
      targetMode: 'ABSOLUTE_VND',
      targetVnd: expectedTotal,
      reason: 'Giao KPI khu vực qua chat HTTP gateway.',
      bulk: false,
    });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    assert.equal(proposal.body.proposalOnly, true);
    const action = proposal.body.result;
    assert.equal(action.type, 'revenue_kpi.save_assignment');
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.executed, false);

    assert.equal(action.preview.willCreate.length, 1, 'preview phải có đúng 1 item AREA');
    assert.equal(action.preview.willCreate[0].unitType, 'AREA');
    assert.equal(action.preview.willCreate[0].targetVnd, expectedTotal, 'targetVnd AREA phải bằng tổng hai STORE');
    assert.equal(await Assignment.countDocuments({ period, unitType: 'AREA' }), 0, 'preview không được ghi vào DB');

    const envelope = await call('hr', '/chat/actions/' + action.actionId);
    assert.equal(envelope.status, 200, JSON.stringify(envelope.body));
    assert.equal(envelope.body.actionId, action.actionId);
    assert.equal(envelope.body.type, 'revenue_kpi.save_assignment');
    assert.equal(envelope.body.status, 'PENDING');
    assert.equal(envelope.body.preview.willCreate.length, 1);
    assert.equal(envelope.body.preview.willCreate[0].targetVnd, expectedTotal);

    const decision = {
      approve: true,
      clientRequestId: randomUUID(),
      expectedVersion: envelope.body.args.expectedVersion,
      planDigest: envelope.body.args.planDigest,
    };
    const done = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.status, 'EXECUTED');
    assert.equal(done.body.result.summary.created, 1, JSON.stringify(done.body.result));
    assert.equal(await Assignment.countDocuments({ period, unitType: 'AREA' }), 1, 'confirm phải tạo đúng 1 AREA assignment');
    const areaDoc = await Assignment.findOne({ period, unitType: 'AREA' }).lean();
    assert.ok(areaDoc, 'AREA assignment phải tồn tại trong DB');
    assert.equal(areaDoc.targetVnd, expectedTotal);
    assert.equal(String(areaDoc.assigneeEmployeeId), amEmployeeId);

    const replay = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body, done.body);
    assert.equal(await Assignment.countDocuments({ period, unitType: 'AREA' }), 1, 'replay không được nhân đôi AREA');
  } finally {
    await closeGatewayReceipt(bound);
  }
});

test('bulk save_assignment handles partial persistence failure, retries missing item idempotently without duplicating', async () => {
  const period = await unusedP5Period();
  await seedP5Base(period, f.stores[0]._id);
  const created = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, created.period, command(created.version));
  const storeB = await spareStore(period);
  const storeA = String(f.stores[0]._id);
  hr = await f.principal('hr');

  await Assignment.deleteMany({ period, unitType: 'STORE' });
  const beforeCount = await countAssignments(period);
  assert.equal(beforeCount, 0, 'không có assignment nào trước khi preview bulk');

  const bound = await beginAuthorizedChat(await f.principal('hr'));
  try {
    const proposal = await callGateway(bound, {
      assignAction: 'save_assignment',
      period,
      unitType: 'STORE',
      storeIds: [storeA, storeB],
      targetMode: 'ABSOLUTE_VND',
      targetVnd: 120000,
      reason: 'Giao KPI bulk hai cửa hàng qua chat gateway.',
      bulk: true,
    });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    assert.equal(proposal.body.proposalOnly, true);
    const action = proposal.body.result;
    assert.equal(action.type, 'revenue_kpi.save_assignment');
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.executed, false);
    assert.equal(action.preview.willCreate.length, 2, 'cả 2 cửa hàng đều trong willCreate');
    assert.equal(action.preview.willSkip.length, 0);
    assert.equal(action.preview.blocked.length, 0);
    assert.equal(await countAssignments(period), 0, 'bulk preview không được ghi vào DB');

    const previewTargetA = action.preview.willCreate.find(i => i.storeId === storeA)?.targetVnd;
    const previewTargetB = action.preview.willCreate.find(i => i.storeId === storeB)?.targetVnd;
    assert.equal(previewTargetA, 120000);
    assert.equal(previewTargetB, 120000);

    const envelope = await call('hr', '/chat/actions/' + action.actionId);
    assert.equal(envelope.status, 200, JSON.stringify(envelope.body));
    assert.equal(envelope.body.actionId, action.actionId);
    assert.equal(envelope.body.type, 'revenue_kpi.save_assignment');
    assert.equal(envelope.body.status, 'PENDING');
    assert.equal(envelope.body.preview.willCreate.length, 2);

    const originalCreate = Assignment.create;
    let writeAttempts = 0;
    Assignment.create = async function (doc, ...args) {
      if (++writeAttempts === 2) {
        throw new Error('synthetic transient persistence failure');
      }
      return originalCreate.call(this, doc, ...args);
    };

    let partialDone;
    const decision = {
      approve: true,
      clientRequestId: randomUUID(),
      expectedVersion: envelope.body.args.expectedVersion,
      planDigest: envelope.body.args.planDigest,
    };
    try {
      partialDone = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    } finally {
      Assignment.create = originalCreate;
    }

    assert.equal(partialDone.status, 200, JSON.stringify(partialDone.body));
    assert.equal(partialDone.body.status, 'EXECUTED');
    assert.equal(partialDone.body.result.outcome, 'PARTIAL');
    assert.equal(partialDone.body.result.summary.created, 1);
    assert.equal(partialDone.body.result.summary.failed, 1);
    assert.equal(partialDone.body.result.created.length, 1);
    assert.equal(partialDone.body.result.failed.length, 1);

    const createdItem = partialDone.body.result.created[0];
    assert.equal(createdItem.storeId, storeA);
    assert.equal(createdItem.targetVnd, previewTargetA);
    const draftA = await Assignment.findOne({ period, unitType: 'STORE', storeId: storeA }).lean();
    assert.ok(draftA, 'item đầu phải được ghi vào DB');
    assert.equal(draftA.targetVnd, previewTargetA);

    const failedItem = partialDone.body.result.failed[0];
    assert.equal(failedItem.storeId, storeB);
    assert.equal(failedItem.code, 'FAILED');
    assert.ok(!failedItem.assignmentId);
    assert.doesNotMatch(failedItem.message, /password|secret|token|credential|key/i);
    assert.doesNotMatch(failedItem.message, /synthetic transient persistence failure/i);
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE', storeId: storeB }), 0,
      'item lỗi không được ghi vào DB');

    // Retry cùng actionId và cùng decision, không tạo proposal mới: hoàn tất item B và bảo lưu item A
    const retryDone = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(retryDone.status, 200, JSON.stringify(retryDone.body));
    assert.equal(retryDone.body.status, 'EXECUTED');

    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE' }), 2);
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE', storeId: storeA }), 1, 'không duplicate storeA');
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE', storeId: storeB }), 1, 'tạo thành công storeB');

    const recheckedDraftA = await Assignment.findOne({ period, unitType: 'STORE', storeId: storeA }).lean();
    assert.equal(recheckedDraftA.targetVnd, previewTargetA, 'target storeA không bị thay đổi');
    const draftB = await Assignment.findOne({ period, unitType: 'STORE', storeId: storeB }).lean();
    assert.equal(draftB.targetVnd, previewTargetB, 'target storeB đúng theo preview ban đầu');

    const replay = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, retryDone.body);
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE' }), 2, 'replay không duplicate');
  } finally {
    await closeGatewayReceipt(bound);
  }
});

test('freshPreview drift returns 409 zero writes and requires fresh gateway preview before confirmation', async () => {
  const period = '2025-10';
  const spareStoreId = String(f.stores[1]._id);
  await UserModel.updateOne({ _id: f.actors.hr.user._id },
    { $pull: { 'authorization.grants.1.scope.storeIds': spareStoreId } });
  hr = await f.principal('hr');
  await seedP5Base(period, f.stores[0]._id);
  const created = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, created.period, command(created.version));
  const storeId = await spareStore(period);
  hr = await f.principal('hr');

  const beforeAssignments = await countAssignments(period);
  const bound1 = await beginAuthorizedChat(hr);
  let actionId;
  let targetBefore;
  let originalDigest;
  try {
    const proposal = await callGateway(bound1, {
      assignAction: 'save_assignment',
      period,
      unitType: 'STORE',
      storeId,
      assigneeEmployeeId: String(f.actors.staffB.employee._id),
      targetMode: 'GROWTH_PERCENT',
      growthPercent: 12,
      reason: 'Kiểm tra freshPreview drift và yêu cầu preview mới qua gateway.',
      bulk: false,
    });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    assert.equal(proposal.body.proposalOnly, true);
    const action = proposal.body.result;
    actionId = action.actionId;
    assert.equal(action.type, 'revenue_kpi.save_assignment');
    assert.equal(action.preview.willCreate.length, 1);
    targetBefore = action.preview.willCreate[0].targetVnd;
    originalDigest = action.preview.planDigest;
    assert.ok(targetBefore > 0);
    assert.equal(await countAssignments(period), beforeAssignments, 'preview không được ghi vào DB');

    const envelope = await call('hr', '/chat/actions/' + actionId);
    assert.equal(envelope.status, 200);
    assert.equal(envelope.body.status, 'PENDING');
    assert.equal(envelope.body.args.planDigest, originalDigest);

    const [year, month] = period.split('-').map(Number);
    await PosOrderModel.create({
      orderId: `KPI-P5-FRESH-DRIFT-${period}-${randomUUID()}`,
      storeId,
      orderedAt: new Date(Date.UTC(year, month - 2, 10, 6, 30)),
      source: 'demo', ledgerVersion: 1,
      status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH',
      subtotalVnd: 150000, discountVnd: 0, refundVnd: 0, netRevenueVnd: 150000,
      items: [{ productId: 'T', productName: 'Đơn làm thay đổi doanh thu kỳ gốc', quantity: 1, unitPriceVnd: 150000, lineTotalVnd: 150000 }],
    });

    const staleDecision = {
      approve: true,
      clientRequestId: randomUUID(),
      expectedVersion: envelope.body.args.expectedVersion,
      planDigest: originalDigest,
    };
    const rejected = await call('hr', '/chat/actions/' + actionId + '/decision', staleDecision);
    assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error.code, 'REVENUE_KPI_PLAN_CHANGED');
    assert.equal(await countAssignments(period), beforeAssignments, '409 drift không được ghi vào DB');

    const oldEnvelopeAfterReject = await call('hr', '/chat/actions/' + actionId);
    assert.equal(oldEnvelopeAfterReject.status, 200);
    assert.equal(oldEnvelopeAfterReject.body.args.planDigest, originalDigest,
      'action cũ không tự động cập nhật planDigest mới');
  } finally {
    await closeGatewayReceipt(bound1);
  }

  const bound2 = await beginAuthorizedChat(hr);
  try {
    const freshProposal = await callGateway(bound2, {
      assignAction: 'save_assignment',
      period,
      unitType: 'STORE',
      storeId,
      assigneeEmployeeId: String(f.actors.staffB.employee._id),
      targetMode: 'GROWTH_PERCENT',
      growthPercent: 12,
      reason: 'Tạo preview mới qua gateway sau khi phát hiện drift.',
      bulk: false,
    });
    assert.equal(freshProposal.status, 200, JSON.stringify(freshProposal.body));
    const freshAction = freshProposal.body.result;
    assert.notEqual(freshAction.actionId, actionId, 'preview mới phải có actionId mới từ request chat mới');
    assert.notEqual(freshAction.preview.planDigest, originalDigest, 'preview mới có planDigest phản ánh doanh thu mới');
    const targetAfter = freshAction.preview.willCreate[0].targetVnd;
    assert.notEqual(targetAfter, targetBefore,
      `target mới phải khác target cũ: ${targetBefore} -> ${targetAfter}`);
    assert.equal(await countAssignments(period), beforeAssignments, 'preview mới vẫn là read-only, chưa ghi');

    const freshEnvelope = await call('hr', '/chat/actions/' + freshAction.actionId);
    assert.equal(freshEnvelope.status, 200);
    assert.equal(freshEnvelope.body.status, 'PENDING');

    const freshDecision = {
      approve: true,
      clientRequestId: randomUUID(),
      expectedVersion: freshEnvelope.body.args.expectedVersion,
      planDigest: freshEnvelope.body.args.planDigest,
    };
    const confirmed = await call('hr', '/chat/actions/' + freshAction.actionId + '/decision', freshDecision);
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    assert.equal(confirmed.body.status, 'EXECUTED');
    assert.equal(confirmed.body.result.summary.created, 1);
    assert.equal(await countAssignments(period), beforeAssignments + 1, 'confirm action mới phải ghi đúng 1 assignment');

    const draft = await Assignment.findOne({ period, unitType: 'STORE', storeId }).lean();
    assert.ok(draft, 'assignment phải được lưu vào DB');
    assert.equal(draft.targetVnd, targetAfter,
      'assignment được lưu phải mang target mới từ fresh preview, không phải target cũ');

    const replay = await call('hr', '/chat/actions/' + freshAction.actionId + '/decision', freshDecision);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, confirmed.body);
    assert.equal(await countAssignments(period), beforeAssignments + 1, 'replay không ghi đúp');
  } finally {
    await closeGatewayReceipt(bound2);
  }
});

test('bulk save_assignment GROWTH_PERCENT handles partial persistence failure, retries missing item idempotently without duplicating', async () => {
  const period = '2025-08';
  await seedP5Base(period, f.stores[0]._id);
  const created = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, created.period, command(created.version));
  const storeB = await spareStore(period);
  const storeA = String(f.stores[0]._id);
  await SmAppointmentModel.updateMany(
    { storeId: { $in: [f.stores[0]._id, f.stores[1]._id] }, status: 'APPROVED' },
    { $set: { validFrom: new Date('2020-01-01') } }
  );
  hr = await f.principal('hr');

  await Assignment.deleteMany({ period, unitType: 'STORE' });
  const beforeCount = await countAssignments(period);
  assert.equal(beforeCount, 0, 'không có assignment nào trước khi preview bulk');

  const bound = await beginAuthorizedChat(await f.principal('hr'));
  try {
    const proposal = await callGateway(bound, {
      assignAction: 'save_assignment',
      period,
      unitType: 'STORE',
      storeIds: [storeA, storeB],
      targetMode: 'GROWTH_PERCENT',
      growthPercent: 10,
      reason: 'Giao KPI bulk hai cửa hàng theo tăng trưởng qua chat gateway.',
      bulk: true,
    });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    assert.equal(proposal.body.proposalOnly, true);
    const action = proposal.body.result;
    assert.equal(action.type, 'revenue_kpi.save_assignment');
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.executed, false);
    assert.equal(action.preview.willCreate.length, 2, 'cả 2 cửa hàng đều trong willCreate');
    assert.equal(action.preview.willSkip.length, 0);
    assert.equal(action.preview.blocked.length, 0);
    assert.equal(await countAssignments(period), 0, 'bulk preview không được ghi vào DB');

    const previewTargetA = action.preview.willCreate.find(i => i.storeId === storeA)?.targetVnd;
    const previewTargetB = action.preview.willCreate.find(i => i.storeId === storeB)?.targetVnd;
    assert.equal(previewTargetA, 110000);
    assert.equal(previewTargetB, 110000);

    const envelope = await call('hr', '/chat/actions/' + action.actionId);
    assert.equal(envelope.status, 200, JSON.stringify(envelope.body));
    assert.equal(envelope.body.actionId, action.actionId);
    assert.equal(envelope.body.type, 'revenue_kpi.save_assignment');
    assert.equal(envelope.body.status, 'PENDING');
    assert.equal(envelope.body.preview.willCreate.length, 2);

    const originalCreate = Assignment.create;
    let writeAttempts = 0;
    Assignment.create = async function (doc, ...args) {
      if (++writeAttempts === 2) {
        throw new Error('synthetic transient persistence failure');
      }
      return originalCreate.call(this, doc, ...args);
    };

    let partialDone;
    const decision = {
      approve: true,
      clientRequestId: randomUUID(),
      expectedVersion: envelope.body.args.expectedVersion,
      planDigest: envelope.body.args.planDigest,
    };
    try {
      partialDone = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    } finally {
      Assignment.create = originalCreate;
    }

    assert.equal(partialDone.status, 200, JSON.stringify(partialDone.body));
    assert.equal(partialDone.body.status, 'EXECUTED');
    assert.equal(partialDone.body.result.outcome, 'PARTIAL');
    assert.equal(partialDone.body.result.summary.created, 1);
    assert.equal(partialDone.body.result.summary.failed, 1);
    assert.equal(partialDone.body.result.created.length, 1);
    assert.equal(partialDone.body.result.failed.length, 1);

    const createdItem = partialDone.body.result.created[0];
    assert.equal(createdItem.storeId, storeA);
    assert.equal(createdItem.targetVnd, previewTargetA);
    assert.equal(createdItem.targetMode, 'GROWTH_PERCENT');
    const draftA = await Assignment.findOne({ period, unitType: 'STORE', storeId: storeA }).lean();
    assert.ok(draftA, 'item đầu phải được ghi vào DB');
    assert.equal(draftA.targetVnd, previewTargetA);
    assert.equal(draftA.targetMode, 'GROWTH_PERCENT');
    assert.equal(draftA.history?.length, 1, 'history storeA ban đầu có đúng 1 entry');

    const failedItem = partialDone.body.result.failed[0];
    assert.equal(failedItem.storeId, storeB);
    assert.equal(failedItem.code, 'FAILED');
    assert.ok(!failedItem.assignmentId);
    assert.doesNotMatch(failedItem.message, /password|secret|token|credential|key/i);
    assert.doesNotMatch(failedItem.message, /synthetic transient persistence failure/i);
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE', storeId: storeB }), 0,
      'item lỗi không được ghi vào DB');

    // Retry cùng actionId và cùng decision, không tạo proposal mới: hoàn tất item B và bảo lưu item A
    const retryDone = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(retryDone.status, 200, JSON.stringify(retryDone.body));
    assert.equal(retryDone.body.status, 'EXECUTED');

    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE' }), 2);
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE', storeId: storeA }), 1, 'không duplicate storeA');
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE', storeId: storeB }), 1, 'tạo thành công storeB');

    const recheckedDraftA = await Assignment.findOne({ period, unitType: 'STORE', storeId: storeA }).lean();
    assert.equal(recheckedDraftA.targetVnd, previewTargetA, 'target storeA không bị thay đổi');
    assert.equal(recheckedDraftA.targetMode, 'GROWTH_PERCENT');
    assert.equal(recheckedDraftA.history?.length, 1, 'history storeA không bị nhân đôi sau retry');

    const draftB = await Assignment.findOne({ period, unitType: 'STORE', storeId: storeB }).lean();
    assert.equal(draftB.targetVnd, previewTargetB, 'target storeB đúng theo preview ban đầu');
    assert.equal(draftB.targetMode, 'GROWTH_PERCENT');
    assert.equal(draftB.history?.length, 1, 'history storeB có đúng 1 entry');

    const replay = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(replay.status, 200);
    assert.deepEqual(replay.body, retryDone.body);
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE' }), 2, 'replay không duplicate');
  } finally {
    await closeGatewayReceipt(bound);
  }
});

test('bulk save_assignment GROWTH_PERCENT rejects retry with 409 when base-month POS revenue mutates after partial failure', async () => {
  const period = '2025-07';
  await seedP5Base(period, f.stores[0]._id);
  const created = await S.createRevenueKpiPeriod(hr, command(0, { period, policy: { allowDemoData: true } }));
  await S.openRevenueKpiPeriod(hr, created.period, command(created.version));
  const storeB = await spareStore(period);
  const storeA = String(f.stores[0]._id);
  await SmAppointmentModel.updateMany(
    { storeId: { $in: [f.stores[0]._id, f.stores[1]._id] }, status: 'APPROVED' },
    { $set: { validFrom: new Date('2020-01-01') } }
  );
  hr = await f.principal('hr');

  await Assignment.deleteMany({ period, unitType: 'STORE' });
  const bound = await beginAuthorizedChat(await f.principal('hr'));
  try {
    const proposal = await callGateway(bound, {
      assignAction: 'save_assignment',
      period,
      unitType: 'STORE',
      storeIds: [storeA, storeB],
      targetMode: 'GROWTH_PERCENT',
      growthPercent: 10,
      reason: 'Kiểm tra drift POS sau partial failure cho bulk GROWTH_PERCENT.',
      bulk: true,
    });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    const action = proposal.body.result;
    const previewTargetA = action.preview.willCreate.find(i => i.storeId === storeA)?.targetVnd;
    assert.equal(previewTargetA, 110000);

    const envelope = await call('hr', '/chat/actions/' + action.actionId);
    assert.equal(envelope.status, 200);

    const originalCreate = Assignment.create;
    let writeAttempts = 0;
    Assignment.create = async function (doc, ...args) {
      if (++writeAttempts === 2) {
        throw new Error('synthetic transient persistence failure');
      }
      return originalCreate.call(this, doc, ...args);
    };

    const decision = {
      approve: true,
      clientRequestId: randomUUID(),
      expectedVersion: envelope.body.args.expectedVersion,
      planDigest: envelope.body.args.planDigest,
    };
    let partialDone;
    try {
      partialDone = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    } finally {
      Assignment.create = originalCreate;
    }
    assert.equal(partialDone.status, 200);
    assert.equal(partialDone.body.result.outcome, 'PARTIAL');
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE' }), 1);

    // Mutate POS của storeB ở tháng gốc trước khi gọi retry
    const [year, month] = period.split('-').map(Number);
    await PosOrderModel.create({
      orderId: `KPI-P5-RETRY-DRIFT-${period}-${randomUUID()}`,
      storeId: storeB,
      orderedAt: new Date(Date.UTC(year, month - 2, 10, 6, 30)),
      source: 'demo', ledgerVersion: 1,
      status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH',
      subtotalVnd: 200000, discountVnd: 0, refundVnd: 0, netRevenueVnd: 200000,
      items: [{ productId: 'T', productName: 'Đơn làm thay đổi doanh thu gốc của storeB', quantity: 1, unitPriceVnd: 200000, lineTotalVnd: 200000 }],
    });

    // Retry phải bị từ chối 409 REVENUE_KPI_PLAN_CHANGED, không có thêm write nào
    const rejected = await call('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
    assert.equal(rejected.body.error.code, 'REVENUE_KPI_PLAN_CHANGED');
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE' }), 1, 'không thêm write vào DB khi drift');

    const draftA = await Assignment.findOne({ period, unitType: 'STORE', storeId: storeA }).lean();
    assert.ok(draftA);
    assert.equal(draftA.targetVnd, previewTargetA, 'target storeA không bao giờ thay đổi');
    assert.equal(await Assignment.countDocuments({ period, unitType: 'STORE', storeId: storeB }), 0, 'storeB không được ghi với target lệch preview');
  } finally {
    await closeGatewayReceipt(bound);
  }
});

import './require-isolated-db.mjs';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'p5-hr-assign-test-jwt-secret-minimum-32-char';
import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import * as S from '../dist/services/revenue-kpi.service.js';
import * as Chat from '../dist/services/chat-authorization.service.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';
import { RevenueKpiPeriodModel as Period } from '../dist/models/RevenueKpiPeriod.js';
import { PosOrderModel } from '../dist/models/PosOrder.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { SmAppointmentModel } from '../dist/models/SmAppointment.js';
import { priorMonth } from '../dist/services/revenue-kpi-calc.service.js';
import mongoose from 'mongoose';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';
let f, hr, hr2, sm, am, server, base, baselineAuthorization;
const actions = () => mongoose.connection.collection('revenue_kpi_open_actions');

const monthParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit',
}).formatToParts(new Date()).map(({ type, value }) => [type, value]));
const currentMonthIndex = Number(monthParts.year) * 12 + Number(monthParts.month) - 1;
const months = Array.from({ length: 120 }, (_, offset) => {
  const index = currentMonthIndex - 1 - offset;
  return `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, '0')}`;
});
let periodSeq = 0;

before(async () => {
  await connectDB();
  f = await revenueFixture();
  hr = await f.principal('hr');
  hr2 = await f.principal('hr2');
  sm = await f.principal('sm');
  am = await f.principal('am');
  baselineAuthorization = new Map(await Promise.all(['hr', 'am', 'staffB'].map(async actor => {
    const [row, employee] = await Promise.all([
      UserModel.findById(f.actors[actor].user._id).select('authorization').lean(),
      EmployeeModel.findById(f.actors[actor].employee._id).select('storeId').lean(),
    ]);
    return [actor, { authorization: row.authorization, storeId: employee.storeId }];
  })));
  process.env.AI_SERVICE_API_KEY = 'p5-hr-assign-isolated-service-key';
  server = createServer(createApp());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
afterEach(async () => {
  if (!baselineAuthorization) return;
  await Promise.all([...baselineAuthorization].map(([actor, baseline]) =>
    UserModel.updateOne({ _id: f.actors[actor].user._id }, { $set: { authorization: baseline.authorization } })));
  await EmployeeModel.updateOne({ _id: f.actors.staffB.employee._id },
    { $set: { storeId: baselineAuthorization.get('staffB').storeId } });
});
async function unusedPeriod() {
  for (let i = 0; i < months.length; i += 1) {
    const period = months[periodSeq % months.length];
    periodSeq += 1;
    if (!(await Period.findOne({ period }).lean())) return period;
  }
  assert.fail('no unused past month left');
}

async function newDraftPeriod(policy = { allowDemoData: true }) {
  const period = await unusedPeriod();
  await seedBase(period);
  const created = await S.createRevenueKpiPeriod(hr, command(0, { period, policy }));
  return S.openRevenueKpiPeriod(hr, created.period, command(created.version));
}

after(async () => {
  if (server?.listening) { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
  await disconnectDB();
});

async function seedBase(targetPeriod, storeId = f.stores[0]._id, tag = '') {
  const [year, month] = targetPeriod.split('-').map(Number);
  const base = new Date(Date.UTC(year, month - 2, 10, 6, 30));
  await PosOrderModel.create({ orderId: `KPI-P5-BASE-${tag}${base.toISOString().slice(0, 7)}-${targetPeriod}-${randomUUID().slice(0, 8)}`,
    storeId, orderedAt: base, source: 'demo', ledgerVersion: 1, status: 'COMPLETED', channel: 'IN_STORE', paymentMethod: 'CASH',
    subtotalVnd: 100000, discountVnd: 0, refundVnd: 0, netRevenueVnd: 100000,
    items: [{ productId: 'T', productName: 'Đơn gốc P5', quantity: 1, unitPriceVnd: 100000, lineTotalVnd: 100000 }] });
}

const approve = proposal => ({ approve: true, clientRequestId: randomUUID(),
  expectedVersion: proposal.preview.expectedVersion, planDigest: proposal.preview.planDigest });

async function singleStoreInput(period, overrides = {}) {
  const store = String(f.stores[0]._id);
  const d = await S.revenueKpiDashboard(hr, period);
  const smRow = d.candidates.find(c => c.role === 'SM' && c.storeIds.includes(store));
  return { kind: 'save_assignment', period, stores: [{ storeId: store, unitType: 'STORE',
    assigneeEmployeeId: smRow?.employeeId, targetMode: 'GROWTH_PERCENT', growthPercent: 10, ...overrides }] };
}

test('create_period preview shows final policy and writes nothing; execute calls createRevenueKpiPeriod', async () => {
  const period = await unusedPeriod();
  await seedBase(period);
  const beforePeriods = await Period.countDocuments({});
  const beforeAssignments = await Assignment.countDocuments({});
  const proposal = await S.previewRevenueKpiAssignAction(hr, { kind: 'create_period', period, policy: { allowDemoData: true, defaultGrowthPercent: 7 } });
  assert.equal(proposal.type, 'revenue_kpi.create_period');
  assert.equal(proposal.requiresConfirmation, true);
  assert.match(proposal.preview.planDigest, /^[a-f0-9]{64}$/);
  const item = proposal.preview.items[0];
  assert.equal(item.status, 'CREATE');
  assert.equal(item.policy.defaultGrowthPercent, 7, 'preview shows the final policy that will be persisted');
  assert.equal(item.policy.allowDemoData, true);
  assert.equal(item.basePeriod, priorMonth(period));
  assert.equal(await Period.countDocuments({}), beforePeriods, 'preview must not create the period');
  assert.equal(await Assignment.countDocuments({}), beforeAssignments);

  const done = await S.decideChatKpiAssignAction(hr, proposal.actionId, approve(proposal));
  assert.equal(done.status, 'EXECUTED');
  assert.equal(done.result.kind, 'create_period');
  assert.equal(done.result.period.period, period);
  assert.equal(done.result.period.status, 'DRAFT');
  assert.equal(done.result.period.policy.defaultGrowthPercent, 7);
  assert.equal(await Period.countDocuments({}), beforePeriods + 1);
  // Idempotent replay: terminal state replays the stored result.
  const replay = await S.decideChatKpiAssignAction(hr, proposal.actionId, approve(proposal));
  assert.equal(replay.status, 'EXECUTED');
  assert.equal(await Period.countDocuments({}), beforePeriods + 1, 'replay must not duplicate the period');
});

test('create_period preview on an existing period reports SKIP and execute does not overwrite', async () => {
  const p = await newDraftPeriod();
  const before = await Period.countDocuments({});
  const proposal = await S.previewRevenueKpiAssignAction(hr, { kind: 'create_period', period: p.period, policy: { allowDemoData: false, defaultGrowthPercent: 3 } });
  assert.equal(proposal.preview.items[0].status, 'SKIP_ALREADY_EXISTS');
  assert.equal(await Period.countDocuments({}), before);
  const original = (await Period.findOne({ period: p.period }).lean()).policy;
  const done = await S.decideChatKpiAssignAction(hr, proposal.actionId, approve(proposal));
  assert.equal(done.status, 'EXECUTED');
  const after = (await Period.findOne({ period: p.period }).lean()).policy;
  assert.deepEqual(after, original, 'execute must not overwrite an existing period');
});

// Single/bulk save_assignment: the OPEN period from newDraftPeriod already has
// an auto-created draft for stores[0], so these tests target stores[1] after
// granting HR scope + SM appointment + base revenue for it (no auto draft).
async function spareStore(period) {
  const secondStore = String(f.stores[1]._id);
  await UserModel.updateOne({ _id: f.actors.hr.user._id },
    { $addToSet: { 'authorization.grants.1.scope.storeIds': secondStore } });
  await UserModel.updateOne({ _id: f.actors.am.user._id },
    { $addToSet: { 'authorization.grants.1.scope.storeIds': secondStore } });
  const source = await UserModel.findById(f.actors.sm.user._id).lean();
  const authorization = structuredClone(source.authorization);
  for (const grant of authorization.grants) grant.scope.storeIds = grant.scope.storeIds.map(() => secondStore);
  await UserModel.updateOne({ _id: f.actors.staffB.user._id }, { $set: { authorization } });
  await EmployeeModel.updateOne({ _id: f.actors.staffB.employee._id }, { $set: { storeId: f.stores[1]._id } });
  const existing = await SmAppointmentModel.findOne({ employeeId: f.actors.staffB.employee._id, storeId: f.stores[1]._id, status: 'APPROVED', kind: 'PRIMARY' }).lean();
  if (!existing) {
    await SmAppointmentModel.create({ employeeId: f.actors.staffB.employee._id, storeId: f.stores[1]._id,
      clientRequestId: randomUUID(), payloadHash: 'fixture', kind: 'PRIMARY', status: 'APPROVED',
      validFrom: new Date('2026-01-01'), validUntil: null, evidenceRef: 'Owner-approved isolated fixture',
      basis: 'SIMULATION_APPROVED', reason: 'Isolated test', requestedBy: f.actors.hr.user._id,
      requesterEmployeeId: f.actors.hr.employee._id, approvedBy: f.actors.hr2.user._id, approvedAt: new Date(), version: 1, history: [] });
  }
  await seedBase(period, f.stores[1]._id, 'S2-');
  return secondStore;
}

async function previewThroughGateway(user, args) {
  const authorization = await Chat.beginAuthorizedChat(user);
  try {
    return await Chat.executeGatewayTool(authorization.delegationToken, {
      requestId: authorization.requestId, tool: 'preview_revenue_kpi_assign_action', args,
    });
  } finally {
    await mongoose.connection.collection('chat_authorization_requests').updateOne(
      { _id: authorization.requestId }, { $set: { status: 'CLOSED' } });
  }
}
async function callInternal(bound, args) {
  const response = await fetch(base + '/internal/authorization/tools', { method: 'POST',
    headers: { Authorization: 'Bearer ' + bound.delegationToken, 'x-ai-service-key': process.env.AI_SERVICE_API_KEY,
      'Content-Type': 'application/json', Connection: 'close' },
    body: JSON.stringify({ requestId: bound.requestId, tool: 'preview_revenue_kpi_assign_action', args }) });
  return { status: response.status, body: await response.json() };
}

async function callAction(actor, path, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET',
    headers: { Authorization: 'Bearer ' + f.actors[actor].token, ...(body ? { 'Content-Type': 'application/json' } : {}), Connection: 'close' },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
}

async function closeGatewayReceipt(bound) {
  await mongoose.connection.collection('chat_authorization_requests').updateOne(
    { _id: bound.requestId }, { $set: { status: 'CLOSED' } });
}


test('create_period proposal is read-only and confirmed idempotently over HTTP', async () => {
  const period = await unusedPeriod();
  await seedBase(period);
  const beforePeriods = await Period.countDocuments({});
  const bound = await Chat.beginAuthorizedChat(hr);
  try {
    const proposal = await callInternal(bound, { assignAction: 'create_period', period,
      policy: { allowDemoData: true, defaultGrowthPercent: 7 } });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    const action = proposal.body.result;
    assert.equal(action.type, 'revenue_kpi.create_period');
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.executed, false);
    assert.equal(await Period.countDocuments({}), beforePeriods, 'proposal must not create the period');

    const fetched = await callAction('hr', '/chat/actions/' + action.actionId);
    assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
    assert.equal(fetched.body.actionId, action.actionId);
    assert.equal(fetched.body.type, 'revenue_kpi.create_period');
    assert.equal(fetched.body.status, 'PENDING');

    const decision = { approve: true, clientRequestId: randomUUID(), expectedVersion: 0,
      planDigest: action.preview.planDigest };
    const done = await callAction('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.status, 'EXECUTED');
    assert.equal(done.body.result.period.period, period);
    assert.equal(await Period.countDocuments({}), beforePeriods + 1);
    const replay = await callAction('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body, done.body);
    assert.equal(await Period.countDocuments({}), beforePeriods + 1, 'replay must not duplicate the period');
  } finally {
    await closeGatewayReceipt(bound);
  }
});

test('save_assignment proposal is read-only and confirmed idempotently over HTTP', async () => {
  const p = await newDraftPeriod();
  const store = await spareStore(p.period);
  const before = await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: store });
  const bound = await Chat.beginAuthorizedChat(await f.principal('hr'));
  try {
    const proposal = await callInternal(bound, { assignAction: 'save_assignment', period: p.period, unitType: 'STORE',
      storeId: store, targetMode: 'GROWTH_PERCENT', growthPercent: 10,
      reason: 'Xác nhận KPI cửa hàng qua HTTP.', bulk: false });
    assert.equal(proposal.status, 200, JSON.stringify(proposal.body));
    const action = proposal.body.result;
    assert.equal(action.type, 'revenue_kpi.save_assignment');
    assert.equal(action.requiresConfirmation, true);
    assert.equal(action.executed, false);
    assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: store }), before,
      'proposal must not write an assignment');

    const fetched = await callAction('hr', '/chat/actions/' + action.actionId);
    assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
    assert.equal(fetched.body.actionId, action.actionId);
    assert.equal(fetched.body.status, 'PENDING');

    const decision = { approve: true, clientRequestId: randomUUID(),
      expectedVersion: fetched.body.args.expectedVersion, planDigest: action.preview.planDigest };
    const done = await callAction('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(done.status, 200, JSON.stringify(done.body));
    assert.equal(done.body.status, 'EXECUTED');
    assert.equal(done.body.result.summary.created, 1);
    assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: store, status: 'DRAFT' }), 1);
    const replay = await callAction('hr', '/chat/actions/' + action.actionId + '/decision', decision);
    assert.equal(replay.status, 200, JSON.stringify(replay.body));
    assert.deepEqual(replay.body, done.body);
    assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: store, status: 'DRAFT' }), 1,
      'replay must not duplicate the draft');
  } finally {
    await closeGatewayReceipt(bound);
  }
});

test('gateway save_assignment preview resolves catalog candidates and blocks out-of-scope/inactive candidates without assignment writes', async () => {
  const p = await newDraftPeriod();
  const freshHr = await f.principal('hr');
  const outsideStore = String(f.stores[1]._id);
  const beforeAssignments = await Assignment.countDocuments({});

  const outOfScope = await previewThroughGateway(freshHr, {
    assignAction: 'save_assignment', period: p.period, unitType: 'STORE', storeId: outsideStore,
    targetMode: 'GROWTH_PERCENT', growthPercent: 10, reason: 'Kiểm tra phạm vi chat.', bulk: false,
  });
  assert.equal(outOfScope.result.preview.willCreate.length, 0);
  assert.equal(outOfScope.result.preview.blocked[0].code, 'REVENUE_KPI_STORE_NOT_IN_SCOPE');
  assert.equal(await Assignment.countDocuments({}), beforeAssignments, 'out-of-scope preview must not write assignments');

  const store = await spareStore(p.period);
  const scopedHr = await f.principal('hr');
  const candidateEmployeeId = String(f.actors.staffB.employee._id);
  await EmployeeModel.updateOne({ _id: f.actors.staffB.employee._id }, { $set: { status: 'inactive' } });
  try {
    const inactive = await previewThroughGateway(scopedHr, {
      assignAction: 'save_assignment', period: p.period, unitType: 'STORE', storeId: store,
      assigneeEmployeeId: candidateEmployeeId, targetMode: 'GROWTH_PERCENT', growthPercent: 10,
      reason: 'Kiểm tra nhân sự không còn active.', bulk: false,
    });
    assert.equal(inactive.result.preview.willCreate.length, 0);
    assert.equal(inactive.result.preview.blocked[0].code, 'REVENUE_KPI_STORE_WITHOUT_SM');
  } finally {
    await EmployeeModel.updateOne({ _id: f.actors.staffB.employee._id }, { $set: { status: 'active' } });
  }
  assert.equal(await Assignment.countDocuments({}), beforeAssignments, 'blocked previews must not write assignments');

  const valid = await previewThroughGateway(scopedHr, {
    assignAction: 'save_assignment', period: p.period, unitType: 'STORE', storeId: store,
    targetMode: 'GROWTH_PERCENT', growthPercent: 10, reason: 'Kiểm tra ứng viên hợp lệ qua chat.', bulk: false,
  });
  assert.equal(valid.result.preview.willCreate.length, 1);
  assert.equal(valid.result.preview.willCreate[0].assigneeEmployeeId, candidateEmployeeId);
  assert.equal(valid.result.preview.willCreate[0].assigneeRole, 'SM');
  assert.equal(await Assignment.countDocuments({}), beforeAssignments, 'valid gateway preview must not write assignments');
});

test('single save_assignment preview shows assignee/target/basePeriod with zero writes; execute creates the draft', async () => {
  const p = await newDraftPeriod();
  const store = await spareStore(p.period);
  const freshHr = await f.principal('hr');
  const beforeAssignments = await Assignment.countDocuments({});
  const proposal = await S.previewRevenueKpiAssignAction(freshHr, { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: store, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 }] });
  assert.equal(proposal.type, 'revenue_kpi.save_assignment');
  assert.equal(proposal.preview.summaryCounts.willCreate, 1);
  const item = proposal.preview.items[0];
  assert.equal(item.status, 'CREATE');
  assert.ok(item.assigneeEmployeeId, 'preview shows the assignee');
  assert.ok(item.targetVnd !== null && item.targetVnd > 0, 'preview shows the target');
  assert.equal(item.basePeriod, priorMonth(p.period));
  assert.equal(await Assignment.countDocuments({}), beforeAssignments, 'preview must not write a draft');

  const done = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal));
  assert.equal(done.status, 'EXECUTED');
  assert.equal(done.result.summary.created, 1);
  const saved = await Assignment.findOne({ period: p.period, unitType: 'STORE', storeId: store }).lean();
  assert.ok(saved, 'execute created the draft via saveRevenueKpiAssignment');
  assert.equal(saved.targetVnd, item.targetVnd, 'execute persists the previewed target');
  assert.equal(saved.version, 1, 'single save creates version 1');
  const replay = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal));
  assert.equal(replay.status, 'EXECUTED');
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: store }), 1);
});

test('single save_assignment on an existing draft previews SKIP_ALREADY_EXISTS and execute does not duplicate', async () => {
  const p = await newDraftPeriod();
  const store = await spareStore(p.period);
  const freshHr = await f.principal('hr');
  const first = await S.previewRevenueKpiAssignAction(freshHr, { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: store, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 }] });
  await S.decideChatKpiAssignAction(freshHr, first.actionId, approve(first));
  const count = await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: store });
  const second = await S.previewRevenueKpiAssignAction(freshHr, { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: store, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 }] });
  assert.equal(second.preview.items[0].status, 'SKIP_ALREADY_EXISTS');
  const done = await S.decideChatKpiAssignAction(freshHr, second.actionId, approve(second));
  assert.equal(done.status, 'EXECUTED');
  assert.equal(done.result.summary.skipped, 1);
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: store }), count, 'no duplicate draft');
});

test('bulk preview lists every store with willCreate/blocked and planDigest; writes nothing', async () => {
  const p = await newDraftPeriod();
  const spare = await spareStore(p.period);
  const freshHr = await f.principal('hr');
  const input = { kind: 'save_assignment', period: p.period, stores: [
    { storeId: spare, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 },
    { storeId: String(f.stores[0]._id), unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 },
  ] };
  const proposal = await S.previewRevenueKpiAssignAction(freshHr, input);
  assert.equal(proposal.preview.summaryCounts.total, 2);
  assert.equal(proposal.preview.summaryCounts.willCreate, 1, 'spare store creates');
  assert.equal(proposal.preview.summaryCounts.willSkip, 1, 'store[0] already has the auto draft');
  const byStore = Object.fromEntries(proposal.preview.items.map(i => [i.storeId, i.status]));
  assert.equal(byStore[spare], 'CREATE');
  assert.equal(byStore[String(f.stores[0]._id)], 'SKIP_ALREADY_EXISTS');
  assert.match(proposal.preview.planDigest, /^[a-f0-9]{64}$/);
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: spare }), 0, 'bulk preview writes nothing');
  const again = await S.previewRevenueKpiAssignAction(freshHr, input);
  assert.equal(again.preview.planDigest, proposal.preview.planDigest, 're-preview is deterministic');
});

test('bulk execute is partial per item; retry never duplicates; blocked keeps its reason', async () => {
  const p = await newDraftPeriod();
  const spare = await spareStore(p.period);
  const freshHr = await f.principal('hr');
  const blockedInput = { kind: 'save_assignment', period: p.period, stores: [
    { storeId: spare, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 },
    { storeId: 'a'.repeat(24), unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 },
  ] };
  const proposal = await S.previewRevenueKpiAssignAction(freshHr, blockedInput);
  assert.equal(proposal.preview.summaryCounts.willCreate, 1);
  assert.equal(proposal.preview.summaryCounts.blocked, 1);
  const blockedItem = proposal.preview.items.find(i => i.status === 'BLOCKED');
  assert.equal(blockedItem.code, 'REVENUE_KPI_STORE_NOT_IN_SCOPE');
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: spare }), 0);
  const done = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal));
  assert.equal(done.status, 'EXECUTED');
  assert.equal(done.result.summary.created, 1);
  assert.equal(done.result.summary.blocked, 1);
  assert.equal(done.result.summary.failed, 0);
  assert.ok(done.result.created.some(i => i.status === 'CREATED'));
  assert.ok(done.result.blocked.some(i => i.code === 'REVENUE_KPI_STORE_NOT_IN_SCOPE'));
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: spare }), 1);
  const replay = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal));
  assert.equal(replay.status, 'EXECUTED');
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: spare }), 1, 'retry does not duplicate');
  // A NEW preview after fixing scope creates the missing store only.
  const retry = await S.previewRevenueKpiAssignAction(freshHr, { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: spare, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 }] });
  assert.equal(retry.preview.summaryCounts.willSkip, 1);
});

test('duplicate E11000 between preview and execute maps to skipped, not failed', async () => {
  const p = await newDraftPeriod();
  const spare = await spareStore(p.period);
  const freshHr = await f.principal('hr');
  const d = await S.revenueKpiDashboard(freshHr, p.period);
  const smRow = d.candidates.find(c => c.role === 'SM' && c.storeIds.includes(spare));
  assert.ok(smRow, 'spare store must have an eligible SM');
  const input = { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: spare, unitType: 'STORE', assigneeEmployeeId: smRow.employeeId, targetMode: 'GROWTH_PERCENT', growthPercent: 5 }] };
  const proposal = await S.previewRevenueKpiAssignAction(freshHr, input);
  // A concurrent writer creates the same draft after the preview.
  await S.saveRevenueKpiAssignment(freshHr, command(0, { period: p.period, unitType: 'STORE', storeId: spare,
    assigneeEmployeeId: smRow.employeeId, targetMode: 'GROWTH_PERCENT', growthPercent: 5, reason: 'Đồng thời ghi từ Web UI.' }));
  const done = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal));
  assert.equal(done.status, 'EXECUTED');
  assert.equal(done.result.summary.skipped, 1, 'duplicate identity → skipped');
  assert.equal(done.result.summary.created, 0);
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: spare }), 1);
});

test('AREA KPI target equals the sum of its STORE KPIs', async () => {
  const p = await newDraftPeriod();
  const freshHr = await f.principal('hr');
  const dashboard = await S.revenueKpiDashboard(freshHr, p.period);
  const am = dashboard.candidates.find(candidate => candidate.role === 'AM');
  assert.ok(am && am.storeIds.length > 0, 'fixture must yield an AM and a non-empty verified scope');
  for (const storeId of am.storeIds) {
    const proposal = await S.previewRevenueKpiAssignAction(freshHr, { kind: 'save_assignment', period: p.period,
      stores: [{ storeId, unitType: 'STORE', targetMode: 'ABSOLUTE_VND', targetVnd: 125000 }] });
    const result = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal));
    assert.equal(result.result.summary.created + result.result.summary.skipped, 1);
  }
   const storeRows = await Assignment.find({ period: p.period, unitType: 'STORE', storeId: { $in: am.storeIds } }).lean();
   assert.equal(storeRows.length, am.storeIds.length, 'every AM-scoped STORE parent exists');
   const expectedTotal = storeRows.reduce((total, store) => total + store.targetVnd, 0);
  // Opening a period creates an auto AREA draft; remove that fixture artifact
  // so this case exercises creating an AREA draft from its STORE parents.
  await Assignment.deleteMany({ period: p.period, unitType: 'AREA' });
  const areaProposal = await S.previewRevenueKpiAssignAction(freshHr, {
    kind: 'save_assignment',
    period: p.period,
    stores: [{
      unitType: 'AREA',
      assigneeEmployeeId: am.employeeId,
      storeIds: am.storeIds,
      areaKey: 'am:' + am.employeeId,
    }],
  });
  assert.equal(areaProposal.preview.summaryCounts.willCreate, 1);
  assert.equal(areaProposal.preview.items[0].targetVnd, expectedTotal, 'AREA target = Σ STORE target');
  const done = await S.decideChatKpiAssignAction(freshHr, areaProposal.actionId, approve(areaProposal));
  assert.equal(done.result.summary.created, 1);
  const area = await Assignment.findOne({ period: p.period, unitType: 'AREA' }).lean();
  assert.equal(area.targetVnd, expectedTotal);
  assert.equal(area.stores.reduce((total, store) => total + store.targetVnd, 0), area.targetVnd);
});

test('stale planDigest or version → 409 PLAN_CHANGED with a fresh preview, no writes', async () => {
  const p = await newDraftPeriod();
  const spare = await spareStore(p.period);
  const freshHr = await f.principal('hr');
  const proposal = await S.previewRevenueKpiAssignAction(freshHr, { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: spare, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 }] });
  await Period.collection.updateOne({ period: p.period }, { $set: { 'policy.defaultGrowthPercent': 20 } });
  const before = await Assignment.countDocuments({});
  await assert.rejects(S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal)),
    e => e.status === 409 && e.code === 'REVENUE_KPI_PLAN_CHANGED' && e.preview.planDigest !== proposal.preview.planDigest);
  assert.equal(await Assignment.countDocuments({}), before, 'PLAN_CHANGED must not write');
  const fresh = await S.previewRevenueKpiAssignAction(freshHr, { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: spare, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 }] });
  await assert.rejects(S.decideChatKpiAssignAction(freshHr, fresh.actionId,
    { approve: true, clientRequestId: randomUUID(), expectedVersion: fresh.preview.expectedVersion, planDigest: 'f'.repeat(64) }),
    e => e.status === 409 && e.code === 'REVENUE_KPI_ACTION_DECIDED');
  assert.equal(await Assignment.countDocuments({}), before);
});

test('RBAC: only HR with revenue_kpi.assign can preview or decide; SM/AM are denied', async () => {
  const p = await newDraftPeriod();
  const spare = await spareStore(p.period);
  const freshHr = await f.principal('hr');
  const input = { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: spare, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 }] };
  await assert.rejects(S.previewRevenueKpiAssignAction(sm, input), e => e.status === 403);
  await assert.rejects(S.previewRevenueKpiAssignAction(am, input), e => e.status === 403);
  const proposal = await S.previewRevenueKpiAssignAction(freshHr, input);
  await assert.rejects(S.decideChatKpiAssignAction(sm, proposal.actionId, approve(proposal)),
    e => e.status === 404 || e.status === 403, 'non-owner cannot decide someone else’s action');
  await assert.rejects(S.decideChatKpiAssignAction(hr2, proposal.actionId, approve(proposal)),
    e => e.status === 404);
  const done = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal));
  assert.equal(done.status, 'EXECUTED');
});

test('cancel keeps the action terminal and writes nothing', async () => {
  const p = await newDraftPeriod();
  const spare = await spareStore(p.period);
  const freshHr = await f.principal('hr');
  const proposal = await S.previewRevenueKpiAssignAction(freshHr, { kind: 'save_assignment', period: p.period,
    stores: [{ storeId: spare, unitType: 'STORE', targetMode: 'GROWTH_PERCENT', growthPercent: 10 }] });
  const cancelled = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, { approve: false, clientRequestId: randomUUID() });
  assert.equal(cancelled.status, 'CANCELLED');
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: spare }), 0);
  const replay = await S.decideChatKpiAssignAction(freshHr, proposal.actionId, approve(proposal));
  assert.equal(replay.status, 'CANCELLED', 'terminal state replays; late approve cannot resurrect');
  assert.equal(await Assignment.countDocuments({ period: p.period, unitType: 'STORE', storeId: spare }), 0);
});

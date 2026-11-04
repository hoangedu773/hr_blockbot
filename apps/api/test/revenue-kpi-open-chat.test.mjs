import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { initSocket } from '../dist/socket.js';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { executeGatewayTool } from '../dist/services/chat-authorization.service.js';
import { createRevenueKpiPeriod } from '../dist/services/revenue-kpi.service.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';
import { RevenueKpiPeriodModel as Period } from '../dist/models/RevenueKpiPeriod.js';
import { UserModel } from '../dist/models/User.js';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';

let f, app, ai, io, base, lastTool, issueReceipt = true;
const period = '2026-11';
const actions = () => mongoose.connection.collection('revenue_kpi_open_actions');
before(async () => {
  await connectDB();
  f = await revenueFixture();
  process.env.AI_SERVICE_API_KEY = 'owned-revenue-preview-test-key';
  await createRevenueKpiPeriod(await f.principal('hr'), command(0, { period, policy: { allowDemoData: true } }));
  ai = createServer(async (req, res) => {
    let text = '';
    for await (const chunk of req) text += chunk;
    const body = JSON.parse(text);
    const { requestId, delegationToken, revenueOpenPeriod } = body;
    lastTool = { requestId, delegationToken, revenueOpenPeriod };
    if (issueReceipt) {
      try { lastTool.data = await executeGatewayTool(delegationToken, { requestId, tool: 'preview_revenue_period_open', args: { period: revenueOpenPeriod } }); }
      catch (error) { lastTool.error = error; }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply: 'Đã tạo bằng AI', proposedAction: { type: 'delete_all', requiresConfirmation: true }, citations: [], attachments: [] }));
  });
  await new Promise(resolve => ai.listen(0, '127.0.0.1', resolve));
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:' + ai.address().port;
  app = createServer(createApp());
  io = initSocket(app);
  await new Promise(resolve => app.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + app.address().port + '/api';
});
after(async () => {
  if (io) await new Promise(resolve => io.close(resolve));
  for (const server of [app, ai].filter(server => server?.listening)) {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
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
async function chat(actor = 'hr', message = 'Mở kỳ KPI doanh thu 11/2026') {
  const response = await call(actor, '/chat', { message, clientMessageId: randomUUID() });
  assert.equal(response.status, 200, JSON.stringify(response.body));
  return response.body;
}
const decision = action => '/chat/actions/' + action.actionId + '/decision';
const decline = () => ({ approve: false, clientRequestId: randomUUID() });
const approve = action => command(action.preview.version, { approve: true, planDigest: action.preview.planDigest });
async function history(turn) {
  const response = await call('hr', '/chat/conversations/' + turn.conversationId + '/messages');
  assert.equal(response.status, 200, JSON.stringify(response.body));
  assert.doesNotMatch(JSON.stringify(response.body), /delegationToken|passwordHash|apiKey|contextHash/);
  return response.body.items[0].proposedAction;
}

test('chat only presents proposals bound to the scoped receipt, with zero KPI writes', async () => {
  const before = await Period.findOne({ period }).lean();
  const denied = await chat('sm');
  assert.equal(denied.turn.proposedAction, null);
  assert.equal(lastTool.error.status, 403);
  assert.doesNotMatch(denied.turn.reply, /Đã tạo/);
  issueReceipt = false;
  try {
    const fake = await chat();
    assert.equal(fake.turn.proposedAction, null);
    assert.doesNotMatch(fake.turn.reply, /Đã tạo/);
  } finally { issueReceipt = true; }
  const ambiguous = await chat('hr', 'Mở kỳ KPI doanh thu');
  assert.equal(ambiguous.turn.proposedAction, null);
  assert.match(ambiguous.turn.reply, /ghi rõ tháng/);
  const actual = await chat();
  assert.equal(lastTool.revenueOpenPeriod, period);
  assert.equal(actual.turn.proposedAction.status, 'PENDING');
  assert.deepEqual(lastTool.data.result.preview, actual.turn.proposedAction.preview);
  assert.ok(actual.turn.proposedAction.preview.items.every(item => item.storeId === String(f.stores[0]._id) || item.unitType === 'AREA'));
  assert.doesNotMatch(JSON.stringify(lastTool.data), /password|delegationToken|email|phone|employeeCode/);
  assert.deepEqual(await history(actual), actual.turn.proposedAction);
  assert.deepEqual(await Period.findOne({ period }).lean(), before);
  assert.equal(await Assignment.countDocuments({ period }), 0);
});

test('confirm and cancel reject forged input, other owners, expiry and changed authority', async () => {
  const actual = await chat();
  const action = actual.turn.proposedAction;
  assert.equal((await call('hr2', decision(action), approve(action))).status, 404);
  assert.equal((await call('hr2', decision(action), decline())).status, 404);
  assert.equal((await call('hr', decision({ actionId: randomUUID() }), decline())).status, 404);
  assert.equal((await call('hr', decision(action), { ...approve(action), type: 'other', args: {} })).status, 400);
  assert.equal((await call('hr', decision(action), { ...approve(action), expectedVersion: 42 })).status, 409);
  const raw = await actions().findOne({ _id: action.actionId });
  await actions().updateOne({ _id: action.actionId }, { $set: { expiresAt: new Date(0).toISOString() } });
  assert.equal((await history(actual)).status, 'EXPIRED');
  assert.equal((await call('hr', decision(action), approve(action))).status, 409);
  const next = (await chat()).turn.proposedAction;
  const user = await UserModel.findById(f.actors.hr.user._id).lean();
  await UserModel.collection.updateOne({ _id: user._id }, { $inc: { securityVersion: 1 } });
  try { assert.equal((await call('hr', decision(next), approve(next))).status, 401); }
  finally { await UserModel.collection.updateOne({ _id: user._id }, { $set: { securityVersion: user.securityVersion } }); }
  await actions().updateOne({ _id: next.actionId }, { $set: { authorityHash: raw.authorityHash + '-stale' } });
  assert.equal((await call('hr', decision(next), approve(next))).status, 403);
  assert.equal(await Assignment.countDocuments({ period }), 0);
});

test('history rehydrates cancelled, confirmed and executed outcomes, with idempotent decisions', async () => {
  const turn = await chat(), action = turn.turn.proposedAction, input = decline();
  const cancel = await call('hr', decision(action), input);
  assert.equal(cancel.status, 200);
  assert.equal(cancel.body.status, 'CANCELLED');
  assert.deepEqual(await call('hr', decision(action), input), cancel);
  assert.deepEqual(await history(turn), cancel.body);
  assert.equal(await Assignment.countDocuments({ period }), 0);
  assert.equal((await Period.findOne({ period }).lean()).status, 'DRAFT');

  const execTurn = await chat(), executable = execTurn.turn.proposedAction, approval = approve(executable);
  await actions().updateOne({ _id: executable.actionId }, { $set: { status: 'CONFIRMED' } });
  assert.equal((await history(execTurn)).status, 'CONFIRMED');
  await actions().updateOne({ _id: executable.actionId }, { $set: { status: 'PENDING' } });
  const done = await call('hr', decision(executable), approval);
  assert.equal(done.status, 200, JSON.stringify(done.body));
  assert.equal(done.body.status, 'EXECUTED');
  assert.equal(done.body.result.summary.created, 2);
  assert.deepEqual(await call('hr', decision(executable), approval), done);
  assert.deepEqual(await history(execTurn), done.body);
  assert.equal(await Assignment.countDocuments({ period }), 2);
});


test('Socket confirmation executes through the same persisted action as REST', async () => {
  const next = '2026-10';
  await createRevenueKpiPeriod(await f.principal('hr'), command(0, { period: next, policy: { allowDemoData: true } }));
  const response = await chat('hr', 'Mở kỳ KPI doanh thu 2026-10');
  const action = response.turn.proposedAction;
  const { io: connect } = createRequire(new URL('../../web/package.json', import.meta.url))('socket.io-client');
  const socket = connect(new URL(base).origin, { auth: { token: f.actors.hr.token }, transports: ['websocket'], forceNew: true, reconnection: false });
  const signal = AbortSignal.timeout(5000);
  try {
    await once(socket, 'connect', { signal });
    const input = approve(action);
    const reply = once(socket, 'chat:done', { signal });
    socket.emit('chat:confirm', { actionId: action.actionId, approve: true, clientMessageId: input.clientRequestId,
      expectedVersion: input.expectedVersion, planDigest: input.planDigest });
    const [done] = await reply;
    assert.equal(done.revenueKpiOpenAction.status, 'EXECUTED');
    assert.equal(done.revenueKpiOpenAction.result.summary.created, 2);
    assert.deepEqual((await call('hr', decision(action), input)).body, done.revenueKpiOpenAction);
    assert.equal(await Assignment.countDocuments({ period: next }), 2);
  } finally { socket.disconnect(); }
});

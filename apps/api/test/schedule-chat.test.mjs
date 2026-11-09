import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { OperationalWeekModel } from '../dist/models/OperationalSchedule.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { datePlus, verifySchedule } from '../dist/services/scheduling.service.js';
import { beginAuthorizedChat, executeGatewayTool } from '../dist/services/chat-authorization.service.js';
import { decideChatScheduleAction } from '../dist/services/schedule-chat.service.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';

const SELF = ['schedules.read_self', 'schedule_changes.request', 'schedule_changes.respond'];
const MANAGE = ['schedules.read_store', 'schedules.manage', 'schedules.publish', 'shifts.manage', 'schedule_changes.review'];
let f, server, base, serial = 0;
const eid = (key) => String(f.actors[key].employee._id);
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const mondayOf = (date) => datePlus(date, -((new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7));

before(async () => {
  await connectDB(); f = await authorizationV1Fixture();
  for (const key of ['staff', 'ptch', 'sm', 'am']) {
    await UserModel.updateOne({ _id: f.actors[key].user._id }, { $push: { 'authorization.grants.0.capabilities': { $each: SELF } } });
    if (['sm', 'am'].includes(key)) await UserModel.updateOne({ _id: f.actors[key].user._id }, { $push: { 'authorization.grants.1.capabilities': { $each: MANAGE } } });
  }
  server = createServer(createApp()); await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await disconnectDB(); });

async function call(actor, path, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Connection: 'close',
    Authorization: 'Bearer ' + f.actors[actor].token, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() };
}

async function futureMonday() {
  serial += 1;
  return mondayOf(datePlus(localDay, 300 + serial * 7));
}

async function unpublishedWeekWithShift() {
  const weekStart = await futureMonday(), storeId = String(f.stores[0]._id);
  const shift = await call('sm', `/scheduling/stores/${storeId}/shifts`, { expectedVersion: 0,
    definition: { code: 'CHAT-' + serial, name: 'Owned chat shift', active: true, intervals: [{ startMinute: 480, endMinute: 600 }] } });
  assert.equal(shift.status, 200, JSON.stringify(shift.body));
  const week = await call('sm', `/scheduling/stores/${storeId}/weeks`, { weekStart });
  assert.equal(week.status, 200, JSON.stringify(week.body));
  return { weekStart, storeId, shift: shift.body, week: week.body };
}

async function toolSession(actor) {
  const user = await resolvePrincipal({ sub: String(f.actors[actor].user._id), role: 'Employee', securityVersion: 0 });
  return beginAuthorizedChat(user);
}

test('list_my_registrations returns the whole store board so peers can avoid clashing shifts', async () => {
  const ctx = await unpublishedWeekWithShift();
  const submitted = await call('staff', '/scheduling/registrations', {
    weekStart: ctx.weekStart, clientRequestId: randomUUID(),
    slot: { date: ctx.weekStart, shiftId: ctx.shift.id, shiftVersion: ctx.shift.version },
  });
  assert.equal(submitted.status, 200, JSON.stringify(submitted.body));

  const session = await toolSession('ptch');
  const read = await executeGatewayTool(session.delegationToken, {
    requestId: session.requestId, tool: 'list_my_registrations', args: { weekStart: ctx.weekStart },
  });
  const peer = read.result.items.find((i) => i.id === submitted.body.id);
  assert.ok(peer, 'đồng nghiệp cùng cửa hàng phải thấy đăng ký của staff');
  assert.match(peer.employeeName, /staff/i);
  assert.equal(peer.isOwn, false);
  assert.equal(peer.canManage, false);
  assert.doesNotMatch(JSON.stringify(peer), /employeeId|employeeCode|requesterUserId/);
});

test('preview_schedule_registration creates a proposal without writing the week', async () => {
  const ctx = await unpublishedWeekWithShift();
  const before = await OperationalWeekModel.findById(ctx.week.id).lean();
  const session = await toolSession('staff');
  const preview = await executeGatewayTool(session.delegationToken, {
    requestId: session.requestId, tool: 'preview_schedule_registration',
    args: { weekStart: ctx.weekStart, slot: { date: ctx.weekStart, shiftId: ctx.shift.id, shiftVersion: ctx.shift.version } },
  });
  assert.equal(preview.proposalOnly, true);
  assert.equal(preview.result.type, 'schedule.registration');
  assert.equal(preview.result.preview.shiftCode, ctx.shift.code);
  const after = await OperationalWeekModel.findById(ctx.week.id).lean();
  assert.deepEqual(after.registrations ?? [], before.registrations ?? [], 'preview must not write the week');
});

test('decideChatScheduleAction writes the registration as PENDING_MANAGER', async () => {
  const ctx = await unpublishedWeekWithShift();
  const session = await toolSession('staff');
  const preview = await executeGatewayTool(session.delegationToken, {
    requestId: session.requestId, tool: 'preview_schedule_registration',
    args: { weekStart: ctx.weekStart, slot: { date: ctx.weekStart, shiftId: ctx.shift.id, shiftVersion: ctx.shift.version } },
  });
  const user = await resolvePrincipal({ sub: String(f.actors.staff.user._id), role: 'Employee', securityVersion: 0 });
  const decided = await decideChatScheduleAction(user, preview.result.actionId, { approve: true });
  assert.equal(decided.executed, true);
  const row = await OperationalWeekModel.findById(ctx.week.id).lean();
  verifySchedule(row);
  const created = row.registrations.find((r) => r.id === preview.result.actionId);
  assert.ok(created, 'registration must be persisted under the proposal id');
  assert.equal(created.status, 'PENDING_MANAGER');
});

test('preview_schedule_registration rejects a published week before any write', async () => {
  const ctx = await unpublishedWeekWithShift();
  const draft = await call('sm', `/scheduling/weeks/${ctx.week.id}/draft`, { expectedVersion: ctx.week.version, reason: 'Owned chat publish fixture',
    assignments: [{ id: randomUUID(), employeeId: eid('ptch'), date: ctx.weekStart, shiftId: ctx.shift.id }] });
  assert.equal(draft.status, 200, JSON.stringify(draft.body));
  const published = await call('sm', `/scheduling/weeks/${ctx.week.id}/publish`, { expectedVersion: draft.body.version, reason: 'Owned chat publish' });
  assert.equal(published.status, 200, JSON.stringify(published.body));

  const session = await toolSession('staff');
  await assert.rejects(() => executeGatewayTool(session.delegationToken, {
    requestId: session.requestId, tool: 'preview_schedule_registration',
    args: { weekStart: ctx.weekStart, slot: { date: ctx.weekStart, shiftId: ctx.shift.id, shiftVersion: ctx.shift.version } },
  }), (error) => error.code === 'SCHEDULE_WEEK_PUBLISHED');
});

test('preview_schedule_change_decision rejects an unknown change', async () => {
  const ctx = await unpublishedWeekWithShift();
  const session = await toolSession('sm');
  await assert.rejects(() => executeGatewayTool(session.delegationToken, {
    requestId: session.requestId, tool: 'preview_schedule_change_decision',
    args: { weekId: ctx.week.id, changeId: randomUUID(), scheduleAction: 'APPROVE' },
  }), (error) => error.code === 'RESOURCE_NOT_FOUND');
});

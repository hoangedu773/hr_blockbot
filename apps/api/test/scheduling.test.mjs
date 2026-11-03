import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { NotificationModel } from '../dist/models/Notification.js';
import { OperationalWeekModel } from '../dist/models/OperationalSchedule.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { datePlus, assignmentTimes, assertNoFuturePublishedSchedules } from '../dist/services/scheduling.service.js';
import { schedulingGrantPlan } from '../scripts/enable-scheduling-grants.mjs';
import { beginAuthorizedChat, executeGatewayTool, authorizedChat } from '../dist/services/chat-authorization.service.js';
import { resolvePrincipal } from '../dist/services/principal.service.js';

const SELF = ['schedules.read_self', 'schedule_changes.request', 'schedule_changes.respond'];
const MANAGE = ['schedules.read_store', 'schedules.manage', 'schedules.publish', 'shifts.manage', 'schedule_changes.review'];
let fixture, server, base, a1, b1, night, week, swap, cover;
const localDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const weekStart = datePlus(localDay, 14 - (new Date(localDay + 'T00:00:00Z').getUTCDay() + 6) % 7);
const store = () => String(fixture.stores[0]._id), id = (name) => String(fixture.actors[name].employee._id);
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture(); await NotificationModel.init();
  await mongoose.connection.collection('schedule_entries').insertMany([
    { employee_code: 'V1-staff', row_kind: 'employee', work_date: weekStart, shift_code: 'LEGACY_ONLY', schedule_type: 'actual' },
    { employee_code: 'V1-staffB', row_kind: 'employee', work_date: weekStart, shift_code: 'FOREIGN_LEGACY', schedule_type: 'actual' },
  ]);
  for (const name of ['sm', 'am', 'staff', 'ptch', 'staffB']) {
    await UserModel.updateOne({ _id: fixture.actors[name].user._id }, { $push: { 'authorization.grants.0.capabilities': { $each: SELF } } });
    if (['sm', 'am'].includes(name)) await UserModel.updateOne({ _id: fixture.actors[name].user._id }, { $push: { 'authorization.grants.1.capabilities': { $each: MANAGE } } });
  }
  server = createServer(createApp()); await new Promise((r) => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => { server.closeAllConnections(); await new Promise((r) => server.close(r)); await disconnectDB(); });
async function call(actor, route, body) {
  const r = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { Connection: 'close', ...(actor ? { Authorization: 'Bearer ' + fixture.actors[actor].token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: r.status, body: r.status === 204 ? null : await r.json() };
}
const createShift = (code, start, end, actor = 'sm', storeId = store()) => call(actor, `/scheduling/stores/${storeId}/shifts`, { expectedVersion: 0, definition: { code, name: 'Synthetic ' + code, active: true, intervals: [{ startMinute: start, endMinute: end }] } });
const getWeek = async () => (await call('sm', `/scheduling/stores/${store()}/week?weekStart=${weekStart}`)).body.week;
const draft = (assignments, w = week, actor = 'sm') => call(actor, `/scheduling/weeks/${w.id}/draft`, { expectedVersion: w.version, assignments, reason: 'Owned scheduling test' });
const action = (actor, r, act, extra = {}) => call(actor, `/scheduling/weeks/${week.id}/changes/${r.id}`, { expectedVersion: week.version, action: act, reason: 'Owned shift-change decision', ...extra });

test('grant rollout adds only approved module authority inside existing scope/windows and is idempotent', () => {
  const row = structuredClone(fixture.actors.sm.user.toObject()), source = structuredClone(row.authorization), now = new Date();
  const plan = schedulingGrantPlan(row, String(fixture.actors.system_admin.user._id), now);
  assert.ok(plan); assert.deepEqual(plan.authorization.grants.slice(0, source.grants.length), source.grants);
  for (const addition of plan.added) {
    const original = source.grants.find((g) => g.id === addition.sourceGrantId);
    assert.deepEqual(addition.grant.scope, original.scope); assert.equal(addition.grant.validUntil, original.validUntil);
    assert.equal(addition.grant.validFrom, now.toISOString());
  }
  assert.equal(schedulingGrantPlan({ ...row, authorization: plan.authorization }, String(fixture.actors.system_admin.user._id), now), null);
  assert.equal(schedulingGrantPlan(fixture.actors.system_admin.user.toObject(), String(fixture.actors.system_admin.user._id)), null);
  const legacy = structuredClone(row); delete legacy.authorization.grants[0].scope.regionIds; delete legacy.authorization.grants[0].scope.reportingEmployeeIds;
  const legacyBefore = structuredClone(legacy.authorization.grants);
  const legacyPlan = schedulingGrantPlan(legacy, String(fixture.actors.system_admin.user._id), now);
  assert.deepEqual(legacyPlan.authorization.grants.slice(0, legacyBefore.length), legacyBefore, 'parser defaults must not rewrite original grants');
  const rogue = fixture.actors.staff.user.toObject(); rogue.authorization.grants[1].capabilities.push('employees.read_operational', 'projects.assign'); rogue.businessRole = 'sm';
  const restricted = schedulingGrantPlan(rogue, String(fixture.actors.system_admin.user._id), now);
  assert.ok(restricted.added.every((a) => a.grant.scope.kind === 'self'), 'forged title or ineligible capability does not confer schedule management');
});
test('schedule access is authenticated/scoped, technical flags confer no HR schedule authority, legacy route stays locked', async () => {
  assert.equal((await call(null, '/scheduling/access')).status, 401);
  const technical = await call('system_admin', '/scheduling/access'); assert.equal(technical.status, 200); assert.deepEqual(technical.body.stores, []); assert.equal(technical.body.canReadSelf, false);
  assert.equal((await call('staff', `/scheduling/stores/${store()}/week?weekStart=${weekStart}`)).status, 403);
  assert.equal((await call('sm', `/scheduling/stores/${fixture.stores[1]._id}/shifts`)).status, 403);
  assert.equal((await call('sm', '/schedules')).status, 503);
});
test('catalog validates split/overnight intervals, is store-specific and protects updates with CAS', async () => {
  for (const intervals of [[{ startMinute: 0, endMinute: 0 }], [{ startMinute: 480, endMinute: 720 }, { startMinute: 700, endMinute: 900 }]])
    assert.equal((await call('sm', `/scheduling/stores/${store()}/shifts`, { expectedVersion: 0, definition: { code: 'BAD', name: 'Invalid synthetic', active: true, intervals } })).status, 400);
  a1 = (await createShift('A1', 480, 720)).body; b1 = (await createShift('B1', 780, 1020)).body; night = (await createShift('NIGHT', 1320, 1560)).body;
  assert.ok(a1.id); assert.equal((await createShift('A1', 500, 700)).status, 409);
  assert.equal(assignmentTimes({ date: weekStart, intervals: night.intervals })[0].end - assignmentTimes({ date: weekStart, intervals: night.intervals })[0].start, 4 * 3600000);
  const split = await call('sm', `/scheduling/stores/${store()}/shifts`, { expectedVersion: 0, definition: { code: 'SPLIT', name: 'Synthetic split', active: true, intervals: [{ startMinute: 480, endMinute: 600 }, { startMinute: 900, endMinute: 1020 }] } });
  assert.equal(split.status, 200); assert.equal(split.body.intervals.length, 2);
});
test('drafts are private, identity/store/weekday are checked and simultaneous stale saves cannot overwrite', async () => {
  assert.equal((await call('sm', `/scheduling/stores/${store()}/weeks`, { weekStart: datePlus(weekStart, 1) })).status, 400);
  week = (await call('sm', `/scheduling/stores/${store()}/weeks`, { weekStart })).body;
  assert.equal((await call('sm', `/scheduling/stores/${store()}/weeks`, { weekStart })).body.id, week.id);
  assert.equal((await draft([{ id: randomUUID(), employeeId: id('staffB'), date: weekStart, shiftId: a1.id }])).status, 409);
  assert.equal((await draft([{ id: randomUUID(), employeeId: id('staff'), date: datePlus(weekStart, 7), shiftId: a1.id }])).status, 400);
  const assignments = [{ id: randomUUID(), employeeId: id('staff'), date: weekStart, shiftId: a1.id }, { id: randomUUID(), employeeId: id('ptch'), date: datePlus(weekStart, 1), shiftId: b1.id }];
  const results = await Promise.all([draft(assignments), draft(assignments)]); assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
  week = await getWeek(); assert.equal(week.draft.length, 2);
  const own = await call('staff', `/scheduling/me?from=${weekStart}&to=${datePlus(weekStart, 6)}`); assert.equal(own.status, 200); assert.deepEqual(own.body.assignments, []);
  assert.equal(own.body.legacyEntries.length, 1); assert.equal(own.body.legacyEntries[0].shiftCode, 'LEGACY_ONLY');
  assert.doesNotMatch(JSON.stringify(own.body), /FOREIGN_LEGACY/);
  assert.equal((await call('staffB', `/scheduling/weeks/${week.id}/partners`)).status, 403);
});
test('publishing is atomic, self view excludes teammates, notification failure remains retryable and catalog edits retain published snapshots', async () => {
  const original = NotificationModel.updateOne;
  NotificationModel.updateOne = () => { throw new Error('OWNED_NOTIFICATION_FAILURE'); };
  try { const result = await call('sm', `/scheduling/weeks/${week.id}/publish`, { expectedVersion: week.version, reason: 'Publish owned fixture' }); assert.equal(result.status, 200); assert.ok(result.body.pendingNotifications > 0); week = result.body; }
  finally { NotificationModel.updateOne = original; }
  const retried = await call('sm', `/scheduling/weeks/${week.id}/retry-notices`, {}); assert.equal(retried.status, 200); assert.equal(retried.body.pendingNotifications, 0);
  const count = await NotificationModel.countDocuments(); await call('sm', `/scheduling/weeks/${week.id}/retry-notices`, {}); assert.equal(await NotificationModel.countDocuments(), count);
  const own = (await call('staff', `/scheduling/me?from=${weekStart}&to=${datePlus(weekStart, 6)}`)).body;
  assert.equal(own.assignments.length, 1); assert.equal(own.assignments[0].employeeId, id('staff')); assert.doesNotMatch(JSON.stringify(own), /NEVER_SEND_BANK|passwordHash/);
  const changed = await call('sm', `/scheduling/stores/${store()}/shifts`, { expectedVersion: a1.version, definition: { code: a1.code, name: a1.name, active: true, intervals: [{ startMinute: 540, endMinute: 720 }] } });
  assert.equal(changed.status, 200); a1 = changed.body;
  assert.equal((await getWeek()).published[0].intervals[0].startMinute, 480);
});
test('two-way swap requires recipient choice, requester confirmation and independent manager review', async () => {
  const source = week.published.find((a) => a.employeeId === id('staff')), target = week.published.find((a) => a.employeeId === id('ptch'));
  const body = { expectedVersion: week.version, clientRequestId: randomUUID(), assignmentId: source.id, receiverEmployeeId: id('ptch'), kind: 'SWAP', reason: 'Owned swap request' };
  const request = await call('staff', `/scheduling/weeks/${week.id}/changes`, body); assert.equal(request.status, 200); swap = request.body.request; week = await getWeek();
  const before = JSON.stringify(week.published);
  assert.equal((await action('sm', swap, 'APPROVE')).status, 403);
  assert.equal((await action('staffB', swap, 'ACCEPT', { targetAssignmentId: target.id })).status, 403);
  assert.equal((await action('ptch', swap, 'ACCEPT', { targetAssignmentId: target.id })).status, 200); week = await getWeek();
  assert.equal(week.requests[0].status, 'PENDING_REQUESTER'); assert.equal(JSON.stringify(week.published), before);
  assert.equal((await action('sm', swap, 'APPROVE')).status, 403);
  assert.equal((await action('staff', swap, 'CONFIRM')).status, 200); week = await getWeek();
  assert.equal((await action('sm', swap, 'APPROVE')).status, 200); week = await getWeek();
  assert.equal(week.published.find((a) => a.id === source.id).employeeId, id('ptch')); assert.equal(week.published.find((a) => a.id === target.id).employeeId, id('staff'));
  assert.equal(week.published.find((a) => a.id === source.id).intervals[0].startMinute, 480, 'consented published hours do not silently change to updated catalog');
  assert.equal(week.requests[0].status, 'APPROVED'); assert.equal((await call('staff', `/scheduling/weeks/${week.id}/changes`, body)).body.request.id, swap.id);
});
test('a participating manager cannot self-approve; revoked receiver authority is rechecked before any reassignment', async () => {
  const source = week.published.find((a) => a.employeeId === id('staff'));
  const created = await call('staff', `/scheduling/weeks/${week.id}/changes`, { expectedVersion: week.version, clientRequestId: randomUUID(), assignmentId: source.id, receiverEmployeeId: id('sm'), kind: 'COVER', reason: 'Owned manager cover request' });
  cover = created.body.request; week = await getWeek(); assert.equal((await action('sm', cover, 'ACCEPT')).status, 200); week = await getWeek();
  assert.equal((await action('sm', cover, 'APPROVE')).status, 403);
  await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $pull: { 'authorization.grants.0.capabilities': 'schedule_changes.respond' } });
  const before = JSON.stringify(week.published); assert.equal((await action('am', cover, 'APPROVE')).status, 403); assert.equal(JSON.stringify((await getWeek()).published), before);
  await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $push: { 'authorization.grants.0.capabilities': 'schedule_changes.respond' } });
  assert.equal((await action('am', cover, 'APPROVE')).status, 200); week = await getWeek();
});
test('night shifts conflict across adjacent weeks and stores; touching boundaries are permitted', async () => {
  const b = String(fixture.stores[1]._id);
  await UserModel.updateOne({ _id: fixture.actors.sm.user._id }, { $push: { 'authorization.grants.1.scope.storeIds': b } });
  await EmployeeModel.updateOne({ _id: fixture.actors.sm.employee._id }, { $set: { storeIds: [fixture.stores[1]._id], smCoverRef: 'OWNED_EXPLICIT_COVER' } });
  const wa = (await call('sm', `/scheduling/stores/${store()}/weeks`, { weekStart: datePlus(weekStart, 14) })).body;
  const saved = await draft([{ id: randomUUID(), employeeId: id('sm'), date: datePlus(wa.weekStart, 6), shiftId: night.id }], wa); assert.equal(saved.status, 200);
  assert.equal((await call('sm', `/scheduling/weeks/${wa.id}/publish`, { expectedVersion: saved.body.version, reason: 'Publish owned overnight' })).status, 200);
  const wb = (await call('sm', `/scheduling/stores/${b}/weeks`, { weekStart: datePlus(weekStart, 21) })).body;
  const early = (await createShift('EARLY', 30, 180, 'sm', b)).body;
  const bad = await draft([{ id: randomUUID(), employeeId: id('sm'), date: wb.weekStart, shiftId: early.id }], wb);
  assert.equal(bad.status, 409); assert.equal(bad.body.error.code, 'SCHEDULE_OVERLAP');
  const boundary = (await createShift('BOUNDARY', 120, 180, 'sm', b)).body;
  assert.equal((await draft([{ id: randomUUID(), employeeId: id('sm'), date: wb.weekStart, shiftId: boundary.id }], wb)).status, 200);
});
test('ongoing published commitments block exit/transfer; scoped chat sees only personal published assignments', async () => {
  await assert.rejects(() => assertNoFuturePublishedSchedules(id('ptch')), (e) => e.code === 'SCHEDULE_COMMITMENTS_REMAIN');
  const user = await resolvePrincipal({ sub: String(fixture.actors.ptch.user._id), role: 'Employee', securityVersion: 0 });
  process.env.AI_SERVICE_API_KEY = 'isolated-scheduling-service-key';
  const session = await beginAuthorizedChat(user);
  const result = await executeGatewayTool(session.delegationToken, { requestId: session.requestId, tool: 'get_my_schedule', args: { from: weekStart, to: datePlus(weekStart, 6) } });
  assert.equal(result.result.publishedOnly, true); assert.equal(result.result.items.length, 1); assert.equal(result.result.items[0].shiftCode, 'A1');
  assert.match(result.result.items[0].intervals[0].startsAtLocal, /08:00$/);
  assert.doesNotMatch(JSON.stringify(result.result), /employeeId|employeeCode|employeeName/);
  assert.doesNotMatch(JSON.stringify(result.result), /LEGACY_ONLY|FOREIGN_LEGACY/);
  assert.equal((await call('staff', `/scheduling/me?from=${weekStart}&to=${datePlus(weekStart, 50)}`)).status, 400);
});
test('chat rejects stale replies when a published shift changes or an initially empty own range gains a shift', async () => {
  const old = { url: process.env.AI_SERVICE_URL, key: process.env.AI_LLM_API_KEY, base: process.env.AI_LLM_BASE_URL };
  let actorName = 'ptch';
  const upstream = createServer(async (req, res) => {
    try {
      let raw = ''; for await (const part of req) raw += part; const body = JSON.parse(raw);
      await executeGatewayTool(body.delegationToken, { requestId: body.requestId, tool: 'get_my_schedule', args: { from: weekStart, to: datePlus(weekStart, 6) } });
      week = await getWeek();
      const assignments = week.draft.filter((a) => a.employeeId !== id(actorName)).map(({ id, employeeId, date, shiftId }) => ({ id, employeeId, date, shiftId }));
      assignments.push({ id: randomUUID(), employeeId: id(actorName), date: datePlus(weekStart, actorName === 'ptch' ? 2 : 3), shiftId: a1.id });
      const saved = await draft(assignments); assert.equal(saved.status, 200);
      assert.equal((await call('sm', `/scheduling/weeks/${week.id}/publish`, { expectedVersion: saved.body.version, reason: 'Owned concurrent calendar change' })).status, 200);
      res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ reply: 'Stale synthetic schedule answer', citations: [], attachments: [], proposedAction: null, decisionSource: 'isolated-provider' }));
    } catch { res.writeHead(503); res.end('{}'); }
  });
  await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
  process.env.AI_SERVICE_URL = 'http://127.0.0.1:' + upstream.address().port;
  process.env.AI_LLM_API_KEY = 'isolated-scheduling-provider-key'; process.env.AI_LLM_BASE_URL = 'https://provider.invalid/v1';
  try {
    for (const name of ['ptch', 'staff']) {
      actorName = name;
      const user = await resolvePrincipal({ sub: String(fixture.actors[name].user._id), role: 'Employee', securityVersion: 0 });
      await assert.rejects(() => authorizedChat(user, 'Lịch làm kiểm thử trong tuần'), (e) => e.code === 'CHAT_RESOURCE_CHANGED');
    }
  } finally {
    upstream.closeAllConnections(); await new Promise((r) => upstream.close(r));
    for (const [name, value] of [['AI_SERVICE_URL', old.url], ['AI_LLM_API_KEY', old.key], ['AI_LLM_BASE_URL', old.base]]) if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});
test('inactive/fenced people cannot be published; successful republication cancels old pending consent without erasing history', async () => {
  week = await getWeek();
  const source = week.published.find((a) => a.employeeId === id('ptch'));
  const created = await call('ptch', `/scheduling/weeks/${week.id}/changes`, { expectedVersion: week.version, clientRequestId: randomUUID(), assignmentId: source.id,
    receiverEmployeeId: id('staff'), kind: 'COVER', reason: 'Owned pending publication test' });
  assert.equal(created.status, 200); week = await getWeek();
  const assignments = [...week.draft.map(({ id, employeeId, date, shiftId }) => ({ id, employeeId, date, shiftId })), { id: randomUUID(), employeeId: id('sm'), date: weekStart, shiftId: a1.id }];
  assert.equal((await draft(assignments)).status, 200); week = await getWeek();
  await EmployeeModel.updateOne({ _id: fixture.actors.ptch.employee._id }, { $set: { lifecyclePendingRequestId: new mongoose.Types.ObjectId().toString() } });
  assert.equal((await call('sm', `/scheduling/weeks/${week.id}/publish`, { expectedVersion: week.version, reason: 'Cannot publish fenced fixture' })).status, 409);
  assert.equal((await getWeek()).requests.find((r) => r.id === created.body.request.id).status, 'PENDING_RECEIVER');
  await EmployeeModel.updateOne({ _id: fixture.actors.ptch.employee._id }, { $unset: { lifecyclePendingRequestId: '' } });
  const published = await call('sm', `/scheduling/weeks/${week.id}/publish`, { expectedVersion: week.version, reason: 'Reviewed republication fixture' });
  assert.equal(published.status, 200); week = published.body;
  assert.equal(week.requests.find((r) => r.id === created.body.request.id).status, 'CANCELLED');
  assert.ok(week.history.some((h) => h.action === 'CHANGE_REQUESTED'));
});
test('tampered operational state is retained and denied instead of silently repaired', async () => {
  const before = await OperationalWeekModel.findById(week.id).lean();
  await OperationalWeekModel.collection.updateOne({ _id: before._id }, { $set: { publishedAt: 'tampered' } });
  assert.equal((await call('sm', `/scheduling/stores/${store()}/week?weekStart=${weekStart}`)).body.error.code, 'SCHEDULE_AUDIT_INVALID');
  await OperationalWeekModel.collection.replaceOne({ _id: before._id }, before);
});

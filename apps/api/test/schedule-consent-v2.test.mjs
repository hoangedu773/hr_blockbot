import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { OperationalWeekModel } from '../dist/models/OperationalSchedule.js';
import { NotificationModel } from '../dist/models/Notification.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { datePlus, verifySchedule, scheduleAuditEntry, assignmentTimes, isUrgentScheduleChange } from '../dist/services/scheduling.service.js';
let f, server, base, serial = 0;
const eid = key => String(f.actors[key].employee._id);
before(async () => {
  await connectDB(); f = await authorizationV1Fixture(); await NotificationModel.init();
  for (const key of ['staff', 'ptch', 'sm', 'am', 'staffB']) {
    await UserModel.updateOne({ _id: f.actors[key].user._id }, { $push: { 'authorization.grants.0.capabilities': { $each: ['schedules.read_self', 'schedule_changes.request', 'schedule_changes.respond'] } } });
    if (['sm', 'am'].includes(key)) await UserModel.updateOne({ _id: f.actors[key].user._id }, { $push: { 'authorization.grants.1.capabilities': { $each: ['schedules.read_store', 'schedules.manage', 'schedules.publish', 'shifts.manage', 'schedule_changes.review'] } } });
  }
  server = createServer(createApp()); await new Promise(r => server.listen(0, '127.0.0.1', r)); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => { server.closeAllConnections(); await new Promise(r => server.close(r)); await disconnectDB(); });
async function call(actor, path, body) {
  const r = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { Connection: 'close', ...(actor ? { Authorization: 'Bearer ' + f.actors[actor].token } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: r.status, body: await r.json() };
}
async function board(urgent = false, sameTime = false) {
  serial++;
  const instant = new Date(Date.now() + (urgent ? 3 : 24 * (30 + serial * 7)) * 3600000);
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(instant);
  const time = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(instant).split(':').map(Number);
  const start = urgent ? time[0] * 60 + time[1] : 480;
  const monday = datePlus(date, -(new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7), storeId = String(f.stores[0]._id);
  const shift = await call('sm', `/scheduling/stores/${storeId}/shifts`, { expectedVersion: 0, definition: { code: 'V2-' + serial, name: 'Owned synthetic v2', active: true, intervals: [{ startMinute: start, endMinute: start + 120 }] } });
  assert.equal(shift.status, 200);
  let w = (await call('sm', `/scheduling/stores/${storeId}/weeks`, { weekStart: monday })).body;
  // Keep the second assignment inside the same week, with a distinct future date unless testing identical hours.
  const targetDate = sameTime ? date : datePlus(date, new Date(date + 'T00:00:00Z').getUTCDay() === 0 ? -1 : 1);
  const assignments = [{ id: randomUUID(), employeeId: eid('staff'), date, shiftId: shift.body.id }, { id: randomUUID(), employeeId: eid('ptch'), date: targetDate, shiftId: shift.body.id }];
  let r = await call('sm', `/scheduling/weeks/${w.id}/draft`, { expectedVersion: w.version, reason: 'Owned v2 calendar fixture', assignments }); assert.equal(r.status, 200, JSON.stringify(r.body)); w = r.body;
  r = await call('sm', `/scheduling/weeks/${w.id}/publish`, { expectedVersion: w.version, reason: 'Owned v2 publication' }); assert.equal(r.status, 200); w = r.body;
  return { id: w.id, week: w, source: w.published[0], target: w.published[1] };
}
const reload = async b => { const w = await OperationalWeekModel.findById(b.id).lean(); verifySchedule(w); return { ...w, id: String(w._id) }; };
async function request(b, extra = {}) {
  const w = await reload(b), payload = { expectedVersion: w.version, clientRequestId: randomUUID(), assignmentId: b.source.id, receiverEmployeeId: eid('ptch'), arrangement: 'DIRECT', kind: 'COVER', reason: 'Owned v2 shift request', ...extra };
  return { ...await call('staff', `/scheduling/weeks/${b.id}/changes`, payload), payload };
}
async function action(b, id, actor, act, extra = {}) { return call(actor, `/scheduling/weeks/${b.id}/changes/${id}`, { expectedVersion: (await reload(b)).version, action: act, reason: 'Owned v2 actor response', ...extra }); }

test('direct cover/swap apply on B consent, notify scoped SM with retained audit, and resume same request without duplication', async () => {
  for (const kind of ['COVER', 'SWAP']) {
    const b = await board(), r = await request(b, { kind, ...(kind === 'SWAP' ? { targetAssignmentId: b.target.id } : {}) }); assert.equal(r.status, 200, JSON.stringify(r.body));
    const id = r.body.request.id, before = JSON.stringify((await reload(b)).published);
    assert.equal((await action(b, id, 'sm', 'APPROVE')).status, 403);
    assert.equal((await action(b, id, 'staffB', 'ACCEPT')).status, 403);
    assert.equal((await action(b, id, 'ptch', 'ACCEPT', { targetAssignmentId: b.target.id })).status, 400);
    assert.equal(JSON.stringify((await reload(b)).published), before);
    const accepted = await action(b, id, 'ptch', 'ACCEPT'); assert.equal(accepted.status, 200); assert.equal(accepted.body.request.completionMode, 'CONSENT');
    const saved = await reload(b); assert.equal(saved.published[0].employeeId, eid('ptch'));
    if (kind === 'SWAP') assert.equal(saved.published[1].employeeId, eid('staff'));
    assert.ok(saved.history.some(h => h.action === 'CHANGE_CONSENT_APPLIED'));
    assert.ok(await NotificationModel.exists({ userId: f.actors.sm.user._id, entityId: b.id, body: /Đã (đổi ca|nhận ca thay)/ }));
    const inbox = await call('sm', '/notifications?entityKind=schedule&limit=100'); assert.equal(inbox.status, 200); assert.ok(inbox.body.items.every(n => n.entityKind === 'schedule'));
    assert.equal((await call('staffB', '/notifications?entityKind=schedule&limit=100')).body.items.some(n => n.entityId === b.id), false);
    const count = await NotificationModel.countDocuments({ entityId: b.id });
    const replay = await call('staff', `/scheduling/weeks/${b.id}/changes`, r.payload); assert.equal(replay.body.request.id, id);
    assert.equal(await NotificationModel.countDocuments({ entityId: b.id }), count);
    assert.equal((await action(b, id, 'ptch', 'ACCEPT')).status, 409);
  }
});
test('manager finds replacement, receiver may decline back to manager; consent applies only after independent scoped selection', async () => {
  const b = await board(), r = await request(b, { arrangement: 'MANAGER', receiverEmployeeId: null }); assert.equal(r.status, 200); const id = r.body.request.id;
  assert.equal(r.body.request.status, 'PENDING_MANAGER'); const before = JSON.stringify((await reload(b)).published);
  assert.equal((await action(b, id, 'staff', 'SELECT', { receiverEmployeeId: eid('ptch') })).status, 403);
  assert.equal((await action(b, id, 'sm', 'SELECT', { receiverEmployeeId: eid('staffB') })).status, 409);
  assert.equal((await action(b, id, 'sm', 'SELECT', { receiverEmployeeId: eid('ptch') })).body.request.status, 'PENDING_RECEIVER');
  assert.equal(JSON.stringify((await reload(b)).published), before);
  assert.equal((await action(b, id, 'ptch', 'DECLINE')).body.request.status, 'PENDING_MANAGER');
  assert.equal((await action(b, id, 'ptch', 'ACCEPT')).status, 403);
  await action(b, id, 'sm', 'SELECT', { receiverEmployeeId: eid('ptch') });
  const accepted = await action(b, id, 'ptch', 'ACCEPT'); assert.equal(accepted.status, 200, JSON.stringify(accepted.body)); assert.equal(accepted.body.request.completionMode, 'MANAGER'); assert.equal(accepted.body.request.selectionHistory.length, 2);
  const rejectedBoard = await board(), rejected = await request(rejectedBoard, { arrangement: 'MANAGER', receiverEmployeeId: null });
  assert.equal((await action(rejectedBoard, rejected.body.request.id, 'sm', 'REJECT')).body.request.status, 'REJECTED');
  assert.equal((await reload(rejectedBoard)).published[0].employeeId, eid('staff'));
});
test('under24h requires manager workflow and the published source cannot be edited around consent', async () => {
  const b = await board(true), r = await request(b); assert.equal(r.status, 200, JSON.stringify(r.body)); const id = r.body.request.id;
  assert.equal(r.body.request.urgent, true); assert.equal(r.body.request.arrangement, 'MANAGER'); assert.equal(r.body.request.status, 'PENDING_MANAGER');
  assert.equal((await action(b, id, 'ptch', 'ACCEPT')).status, 403);
  const selected = await action(b, id, 'sm', 'SELECT', { receiverEmployeeId: eid('ptch') }); assert.equal(selected.status, 200, JSON.stringify(selected.body));
  assert.equal((await action(b, id, 'ptch', 'ACCEPT')).body.request.status, 'APPROVED');
  const starts = assignmentTimes(b.source)[0].start;
  assert.equal(isUrgentScheduleChange(b.source, null, starts - 86400000), false);
  assert.equal(isUrgentScheduleChange(b.source, null, starts - 86400000 + 1), true);
  const stale = await board(), proposal = await request(stale), snapshot = await reload(stale);
  const draft = snapshot.published.map(({ id, employeeId, date, shiftId }) => ({ id, employeeId, date, shiftId }));
  draft[0].date = datePlus(draft[0].date, new Date(draft[0].date + 'T00:00:00Z').getUTCDay() === 0 ? -1 : 1);
  const saved = await call('sm', `/scheduling/weeks/${stale.id}/draft`, { expectedVersion: snapshot.version, reason: 'Owned changed source terms', assignments: draft }); assert.equal(saved.body.error.code, 'SCHEDULE_WEEK_PUBLISHED');
  assert.equal((await action(stale, proposal.body.request.id, 'ptch', 'ACCEPT')).status, 200);
});
test('revoked manager authorization cannot be reused by receiver; it does not invalidate receiver login', async () => {
  const b = await board(), r = await request(b, { arrangement: 'MANAGER', receiverEmployeeId: null }), id = r.body.request.id;
  await action(b, id, 'sm', 'SELECT', { receiverEmployeeId: eid('ptch') });
  await UserModel.collection.updateOne({ _id: f.actors.sm.user._id }, { $inc: { securityVersion: 1 } });
  try { const result = await action(b, id, 'ptch', 'ACCEPT'); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'SCHEDULE_MANAGER_UNAVAILABLE'); assert.equal((await call('ptch', '/auth/me')).status, 200); assert.equal((await reload(b)).published[0].employeeId, eid('staff')); }
  finally { await UserModel.collection.updateOne({ _id: f.actors.sm.user._id }, { $set: { securityVersion: 0 } }); }
});
test('identical swap hours / overlapping receiving commitments reject; concurrent consent produces exactly one change', async () => {
  const same = await board(false, true); assert.equal((await request(same, { kind: 'SWAP', targetAssignmentId: same.target.id })).body.error.code, 'SWAP_SAME_TIME');
  assert.equal((await request(same)).body.error.code, 'SCHEDULE_OVERLAP');
  const b = await board(), r = await request(b), w = await reload(b);
  const payload = { expectedVersion: w.version, action: 'ACCEPT', reason: 'Concurrent isolated consent' };
  const values = await Promise.all([call('ptch', `/scheduling/weeks/${b.id}/changes/${r.body.request.id}`, payload), call('ptch', `/scheduling/weeks/${b.id}/changes/${r.body.request.id}`, payload)]);
  assert.deepEqual(values.map(v => v.status).sort(), [200, 409]);
  assert.equal((await reload(b)).history.filter(h => h.action === 'CHANGE_CONSENT_APPLIED').length, 1);
});
test('persisted pre-V2 request retains old independent manager approval, not silently waived', async () => {
  const b = await board(), made = await request(b), row = await OperationalWeekModel.findById(b.id).lean();
  // Isolated import fixture of an existing V1 request: never a runtime downgrade API.
  const old = { ...row.requests[0] }; for (const key of ['policyVersion', 'arrangement', 'urgent', 'managerDecision', 'selectionHistory', 'receiverName', 'originalReceiverEmployeeId', 'originalArrangement']) delete old[key];
  const changes = { requests: [old], version: row.version + 1 };
  const event = scheduleAuditEntry(row, changes, String(f.actors.sm.user._id), 'ISOLATED_LEGACY_IMPORT', 'Preserved legacy test state');
  await OperationalWeekModel.collection.updateOne({ _id: row._id }, { $set: { requests: [old] }, $inc: { version: 1 }, $push: { history: event } });
  const accepted = await action(b, made.body.request.id, 'ptch', 'ACCEPT'); assert.equal(accepted.body.request.status, 'READY_FOR_REVIEW');
  assert.equal((await reload(b)).published[0].employeeId, eid('staff'));
  assert.equal((await action(b, made.body.request.id, 'sm', 'APPROVE')).body.request.status, 'APPROVED');
});
test('failed SM notification is retained; retry respects revoked scope and never duplicates the notice', async () => {
  const b = await board(), r = await request(b), original = NotificationModel.updateOne;
  NotificationModel.updateOne = function(filter, change, ...args) {
    if (String(filter.userId) === String(f.actors.sm.user._id) && change.$setOnInsert?.body?.startsWith('Đã ')) throw new Error('ISOLATED_SM_NOTICE_OUTAGE');
    return original.call(this, filter, change, ...args);
  };
  try { assert.equal((await action(b, r.body.request.id, 'ptch', 'ACCEPT')).status, 200); }
  finally { NotificationModel.updateOne = original; }
  const saved = await reload(b); assert.equal(saved.published[0].employeeId, eid('ptch'));
  const sm = await UserModel.findById(f.actors.sm.user._id).lean();
  const auth = structuredClone(sm.authorization); auth.grants[1].capabilities = auth.grants[1].capabilities.filter(c => !['schedules.read_store', 'schedules.manage'].includes(c));
  await UserModel.collection.updateOne({ _id: sm._id }, { $set: { authorization: auth } });
  try {
    const retried = await call('am', `/scheduling/weeks/${b.id}/retry-notices`, {}); assert.equal(retried.status, 200); assert.ok(retried.body.pendingNotifications > 0);
    assert.equal(await NotificationModel.countDocuments({ userId: sm._id, entityId: b.id, body: /^Đã / }), 0);
  } finally { await UserModel.collection.updateOne({ _id: sm._id }, { $set: { authorization: sm.authorization } }); }
  await call('am', `/scheduling/weeks/${b.id}/retry-notices`, {}); await call('am', `/scheduling/weeks/${b.id}/retry-notices`, {});
  assert.equal(await NotificationModel.countDocuments({ userId: sm._id, entityId: b.id, body: /^Đã / }), 1);
});
test('direct proposal requires directory scope while manager-assisted request needs no colleague data', async () => {
  const b = await board(), account = await UserModel.findById(f.actors.staff.user._id).lean(), auth = structuredClone(account.authorization);
  auth.grants[1].capabilities = auth.grants[1].capabilities.filter(c => c !== 'directory.read_store');
  await UserModel.collection.updateOne({ _id: account._id }, { $set: { authorization: auth } });
  try {
    assert.equal((await request(b)).status, 403);
    const assisted = await request(b, { arrangement: 'MANAGER', receiverEmployeeId: null }); assert.equal(assisted.status, 200); assert.equal(assisted.body.request.status, 'PENDING_MANAGER');
  } finally { await UserModel.collection.updateOne({ _id: account._id }, { $set: { authorization: account.authorization } }); }
});


test('shared registration board scopes reads, permits only self-submission and locks after publication', async () => {
  const b = await board(), weekStart = datePlus(b.week.weekStart, 7);
  const prefix = '/scheduling/stores/' + b.week.storeId;
  const path = prefix + '/registrations';
  const slot = { date: weekStart, shiftId: b.source.shiftId, shiftVersion: b.source.shiftVersion };
  const body = { weekStart, clientRequestId: randomUUID(), slot };
  const submit = payload => call('staff', '/scheduling/registrations', payload);
  assert.equal((await submit({ ...body, employeeId: eid('ptch') })).status, 400);
  const created = await submit(body);
  assert.equal(created.status, 200, JSON.stringify(created.body));
  assert.equal((await submit(body)).body.id, created.body.id);
  assert.equal((await submit({ ...body, clientRequestId: randomUUID() })).status, 409);
  const self = actor => call(actor, '/scheduling/registrations/me?weekStart=' + weekStart);
  const peer = (await self('ptch')).body.items[0];
  assert.equal(peer.id, created.body.id);
  assert.match(peer.employeeName, /staff/i);
  assert.equal(peer.isOwn, false);
  assert.equal(peer.canManage, false);
  assert.deepEqual((await self('staffB')).body.items, []);
  assert.equal((await call('staffB', path + '?weekStart=' + weekStart)).status, 403);
  assert.equal((await call('staff', path, { ...body, employeeId: eid('ptch') })).status, 403);
  const act = (actor, item, action, extra = {}) => call(actor, path + '/' + item.id, { weekStart, action, expectedVersion: item.version, ...extra });
  assert.equal((await act('staff', created.body, 'APPROVE')).status, 403);
  assert.equal((await act('ptch', created.body, 'REMOVE', { reason: 'Không được phép xóa' })).status, 403);
  const managerBoard = await call('sm', path + '?weekStart=' + weekStart);
  assert.equal(managerBoard.body.items[0].canManage, true);
  const week = async () => (await call('sm', prefix + '/week?weekStart=' + weekStart)).body.week;
  const initial = await week();
  assert.ok(await NotificationModel.exists({ userId: f.actors.sm.user._id, entityId: initial.id, body: /Có đăng ký ca/ }));
  const approval = await Promise.all([act('sm', created.body, 'APPROVE'), act('sm', created.body, 'APPROVE')]);
  assert.deepEqual(approval.map(r => r.status).sort(), [200, 409]);
  const approved = approval.find(r => r.status === 200).body;
  assert.equal(approved.placement, 'DRAFT');
  const movedSlot = { ...slot, date: datePlus(weekStart, 1) };
  const reason = 'Điều chỉnh nội bộ';
  const edited = await act('sm', approved, 'EDIT', { slot: movedSlot, reason });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal((await self('staff')).body.items[0].reviewReason, reason);
  assert.equal((await self('ptch')).body.items[0].reviewReason, null);
  assert.doesNotMatch(JSON.stringify((await self('ptch')).body), /requesterUserId|employeeCode|employeeId|reviewer/);
  const editedWeek = await week();
  assert.equal(editedWeek.draft[0].date, movedSlot.date);
  assert.equal((await call('sm', '/scheduling/weeks/' + editedWeek.id + '/draft', { expectedVersion: editedWeek.version,
    assignments: [], reason: 'Cannot bypass shared board' })).body.error.code, 'SCHEDULE_REGISTRATION_LINKED');
  assert.equal((await submit({ ...body, clientRequestId: randomUUID(), slot: movedSlot })).body.error.code, 'SCHEDULE_REQUEST_CONFLICT');

  const add = (employeeId, date) => call('sm', path, { weekStart, clientRequestId: randomUUID(), employeeId, slot: { ...slot, date } });
  assert.equal((await add(eid('staffB'), weekStart)).status, 403);
  assert.equal((await add(eid('sm'), weekStart)).status, 403);
  const added = await add(eid('ptch'), datePlus(weekStart, 2));
  assert.equal(added.status, 200, JSON.stringify(added.body));
  assert.equal(added.body.placement, 'DRAFT');
  assert.equal((await act('sm', added.body, 'REMOVE', { reason: 'Xóa ca trống không cần' })).status, 200);
  assert.equal((await self('ptch')).body.items.some(r => r.id === added.body.id), false);
  const current = await week();
  assert.equal(current.draft.length, 1);
  const pending = await call('ptch', '/scheduling/registrations', { ...body, clientRequestId: randomUUID(), slot: { ...slot, date: datePlus(weekStart, 3) } });
  assert.equal(pending.status, 200);
  const row = await week();
  assert.equal((await call('sm', '/scheduling/weeks/' + row.id + '/publish', { expectedVersion: row.version, reason: 'Publish owned board' })).status, 200);
  const locked = await self('staff');
  assert.equal(locked.body.published, true);
  assert.equal(locked.body.items.find(r => r.id === created.body.id).placement, 'PUBLISHED');
  assert.equal((await week()).published.length, 1);
  assert.equal((await submit({ ...body, clientRequestId: randomUUID() })).body.error.code, 'SCHEDULE_WEEK_PUBLISHED');
  assert.equal((await add(eid('ptch'), weekStart)).body.error.code, 'SCHEDULE_WEEK_PUBLISHED');
  assert.equal((await act('sm', edited.body, 'REMOVE', { reason: 'Ca đã công bố' })).body.error.code, 'SCHEDULE_WEEK_PUBLISHED');
  assert.equal((await act('sm', pending.body, 'APPROVE')).body.error.code, 'SCHEDULE_WEEK_PUBLISHED');
  assert.equal((await reload({ id: row.id })).registrations.find(r => r.id === added.body.id).status, 'CANCELLED');
});

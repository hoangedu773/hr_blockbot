import './require-isolated-db.mjs';
import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { UserModel } from '../dist/models/User.js';
import { ProjectModel, transitionProject } from '../dist/models/Project.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { initSocket } from '../dist/socket.js';
import { verifyProjectAudit, assertProjectStorage, assertAssignmentConsistency, digest } from '../dist/services/project-audit.service.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { StoreModel } from '../dist/models/Store.js';

let a, b, storeA, storeB;
let server, base, kpiBefore, realtime;
const actors = {};
async function call(who, path, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base + '/api' + path, { method, headers: { Authorization: 'Bearer ' + actors[who].token, 'Content-Type': 'application/json', Connection: 'close' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
async function fresh() {
  return EmployeeModel.create({ employeeCode: 'REVIEW-' + new mongoose.Types.ObjectId(), fullName: 'Nhân viên riêng', departmentId: a, storeId: storeA, storeMappingRef: 'reviewed-fixture', level: 'Junior', status: 'active', skills: ['Kiểm kê'] });
}
async function request(employee, targetFields, extra = {}) {
  return call('hr', `/employees/${employee._id}/change-requests`, { targetFields, ...extra });
}
async function review(employee, id, action, extra = {}, who = 'hr2') {
  return call(who, `/employees/${employee._id}/change-requests/${id}/review`, { action, ...extra });
}
before(async () => {
  await connectDB();
  const fixture = await authorizationV1Fixture();
  a = fixture.departmentId; b = new mongoose.Types.ObjectId(); storeA = fixture.stores[0]._id; storeB = fixture.stores[1]._id;
  Object.assign(actors, fixture.actors, { global: fixture.actors.om, manager: fixture.actors.sm, other: fixture.actors.staffB });
  await StoreModel.updateOne({ _id: storeB }, { $set: { departmentId: b } });
  await UserModel.updateOne({ _id: actors.global.user._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(storeB) } });
  await mongoose.connection.collection('evaluations').insertOne({ employeeId: actors.staff.employee._id, status: 'PUBLISHED', finalScore: 80, maxScore: 100 });
  kpiBefore = JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray());
  server = createServer(createApp()); realtime = initSocket(server); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => assert.equal(JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray()), kpiBefore));
after(async () => { if (realtime) await new Promise((resolve) => realtime.close(resolve)); if (server?.listening) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); } await mongoose.connection.dropDatabase(); await disconnectDB(); });

test('canonical store wins over stale legacy department/store fields; unmapped data is quarantined', async () => {
  const hidden = await EmployeeModel.create({ employeeCode: 'REVIEW-conflict', fullName: 'Must stay B', departmentId: b, department: String(a), store_raw: String(a), storeId: storeB, storeMappingRef: 'fixture-b-proof',
    profileChangeRequests: [{ requestedBy: 'other', status: 'PENDING', targetFields: { level: 'Senior' } }] });
  const legacy = await EmployeeModel.collection.insertOne({ employee_code: 'REVIEW-legacy', full_name: 'Legacy A', store_raw: String(a), status: 'active' });
  const list = await call('manager', '/employees?limit=100'); assert.equal(list.status, 200);
  assert.ok(!list.body.items.some((item) => item.employeeId === String(hidden._id)));
  assert.ok(!list.body.items.some((item) => item.employeeId === String(legacy.insertedId)));
  const queue = await call('hr', '/change-requests'); assert.ok(!queue.body.items.some((item) => item.employeeId === String(hidden._id)));
  assert.equal((await call('manager', `/employees/${hidden._id}`)).status, 404);
  assert.equal((await call('global', `/employees/${hidden._id}`)).status, 200, 'global summary access must work without exposing private detail');
  assert.equal('phone' in (await call('global', `/employees/${hidden._id}`)).body, false);
});

test('own non-sensitive edit is real, bounded, allowlisted and compare-and-swap safe', async () => {
  const id = actors.staff.employee._id;
  const profile = await call('staff', `/employees/${id}`); assert.equal(profile.body.profileVersion, 0);
  assert.equal((await call('other', `/employees/${id}`, { phone: '1', expectedVersion: 0 }, 'PATCH')).status, 403, 'Staff has no other-person edit capability');
  assert.equal((await call('staff', `/employees/${id}`, { level: 'Lead', expectedVersion: 0 }, 'PATCH')).status, 400);
  const results = await Promise.all(['0901', '0902'].map((phone) => call('staff', `/employees/${id}`, { phone, skills: ['Bàn giao'], expectedVersion: 0 }, 'PATCH')));
  assert.deepEqual(results.map((res) => res.status).sort(), [200, 409]);
  const stored = await EmployeeModel.findById(id).lean(); assert.equal(stored.profileHistory.length, 1); assert.equal(stored.level, 'Junior');
  assert.equal((await call('staff', `/employees/${id}`, { phone: '', expectedVersion: 1 }, 'PATCH')).status, 200, 'own phone can be cleared');
});

test('request id survives Mongo save/reopen and retries do not append duplicate requests', async () => {
  const employee = await fresh(); const created = await request(employee, { level: 'Senior' }, { clientMessageId: 'review-idempotency' });
  assert.equal(created.status, 201);
  const items = (await call('hr', `/employees/${employee._id}/change-requests`)).body.items;
  assert.equal(items[0].id, created.body.id);
  const duplicate = await request(employee, { level: 'Senior' }, { clientMessageId: 'review-idempotency' }); assert.equal(duplicate.status, 200); assert.equal(duplicate.body.id, created.body.id);
  assert.equal((await request(employee, { level: 'Lead' })).status, 409);
  assert.equal((await EmployeeModel.findById(employee._id).lean()).level, 'Junior');
});

test('promotion stays pending; rejection/resubmission and independent approval of an ordinary field preserve roles/KPI', async () => {
  const employee = await fresh(); let created = await request(employee, { level: 'Senior', jobTitle: 'Tổ trưởng kiểm kê' });
  const promotion = await review(employee, created.body.id, 'APPROVE'); assert.equal(promotion.status, 403); assert.equal(promotion.body.error.code, 'POLICY_PENDING');
  assert.equal((await review(employee, created.body.id, 'REJECT')).status, 400);
  assert.equal((await review(employee, created.body.id, 'REJECT', { reason: 'Cần xác nhận kỹ năng' })).status, 200);
  let history = (await call('hr', `/employees/${employee._id}/change-requests`)).body.items;
  assert.equal(history[0].rejectionReason, 'Cần xác nhận kỹ năng');
  created = await request(employee, { hiredAt: '2026-01-02T00:00:00Z' }, { previousRequestId: created.body.id }); assert.equal(created.status, 201);
  assert.equal((await review(employee, created.body.id, 'APPROVE')).status, 200);
  const stored = await EmployeeModel.findById(employee._id).lean(); assert.equal(stored.level, 'Junior'); assert.equal(stored.job_title ?? null, null); assert.equal(stored.hiredAt.toISOString(), '2026-01-02T00:00:00.000Z');
  assert.deepEqual(stored.profileChangeRequests.map((item) => item.status), ['REJECTED', 'APPROVED']); assert.equal(stored.profileHistory.length, 4);
  assert.equal((await UserModel.findById(actors.manager.user._id).lean()).authorization.profile, 'sm');
  assert.equal((await review(employee, created.body.id, 'APPROVE')).status, 409);
});

test('review rejects cross-unit access, employee reviewers and own-profile approval', async () => {
  const employee = await fresh(); const created = await request(employee, { hiredAt: '2026-01-02T00:00:00Z' });
  assert.equal((await review(employee, created.body.id, 'APPROVE', {}, 'other')).status, 403);
  assert.equal((await review(employee, created.body.id, 'APPROVE', {}, 'staff')).status, 403);
  assert.equal((await review(employee, created.body.id, 'APPROVE', {}, 'hr')).status, 403, 'HR requester may not approve even another employee request');
  const own = await call('hr', `/employees/${actors.hr.employee._id}/change-requests`, { targetFields: { hiredAt: '2026-01-02T00:00:00Z' } });
  assert.equal((await review(actors.hr.employee, own.body.id, 'APPROVE', {}, 'hr')).status, 403);
});

test('simultaneous profile decisions have one winner and append one decision history', async () => {
  const employee = await fresh();
  const created = await call('staff', `/employees/${actors.staff.employee._id}/change-requests`, { targetFields: { hiredAt: '2026-01-02T00:00:00Z' } });
  assert.equal(created.status, 201);
  const results = await Promise.all(['hr', 'hr2'].map((who) => review(actors.staff.employee, created.body.id, 'APPROVE', {}, who)));
  assert.deepEqual(results.map((res) => res.status).sort(), [200, 409]);
  assert.equal((await EmployeeModel.findById(actors.staff.employee._id).lean()).profileChangeRequests.filter((entry) => entry.status === 'APPROVED').length, 1);
});

test('stale ordinary-field snapshot cannot overwrite an external correction; rejection still permits recovery', async () => {
  const employee = await fresh(); const created = await request(employee, { hiredAt: '2026-01-02T00:00:00Z' });
  await EmployeeModel.updateOne({ _id: employee._id }, { $set: { hiredAt: new Date('2026-01-01T00:00:00Z') } });
  const conflict = await review(employee, created.body.id, 'APPROVE'); assert.equal(conflict.status, 409); assert.equal(conflict.body.error.code, 'PROFILE_SNAPSHOT_CONFLICT');
  assert.equal((await EmployeeModel.findById(employee._id).lean()).hiredAt.toISOString(), '2026-01-01T00:00:00.000Z');
  assert.equal((await review(employee, created.body.id, 'REJECT', { reason: 'Dữ liệu gốc đã đổi, vui lòng gửi lại' })).status, 200);
  assert.equal((await request(employee, { level: 'Senior' }, { previousRequestId: '000000000000000000000000' })).status, 400);
  assert.equal((await request(employee, { hiredAt: 'not-a-date' })).status, 400);
});

test('unsafe imported profile request cannot promote an unknown sensitive field', async () => {
  const employee = await fresh(); const id = new mongoose.Types.ObjectId();
  await EmployeeModel.collection.updateOne({ _id: employee._id }, { $set: { profileChangeRequests: [{ _id: id, requestedBy: String(actors.manager.employee._id), requestedAt: new Date(), status: 'PENDING', targetFields: { salary: 123 }, previousSnapshot: {} }] } });
  const result = await review(employee, String(id), 'APPROVE'); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'LEGACY_PROFILE_REQUEST_INVALID');
  assert.equal((await EmployeeModel.findById(employee._id).lean()).salary, undefined);
});

test('raw legacy missing-version projects upgrade atomically without NaN, lost writes or invented timestamps', async () => {
  const inserted = await ProjectModel.collection.insertOne({ title: 'No version legacy', departmentId: a, storeId: storeA, storeMappingRef: 'reviewed-project-fixture', createdBy: actors.manager.user._id, assigneeId: actors.staff.employee._id, status: 'ASSIGNED' });
  const result = await call('staff', `/projects/${inserted.insertedId}/assignment/respond`, { action: 'ACCEPT', expectedVersion: 1 });
  assert.equal(result.status, 200, JSON.stringify(result.body)); assert.equal(result.body.version, 2);
  const stored = await ProjectModel.findById(inserted.insertedId).lean(); assert.equal(verifyProjectAudit(stored), true);
  assert.equal((await call('staff', `/projects/${inserted.insertedId}/transition`, { targetStatus: 'IN_PROGRESS', expectedVersion: 2 })).status, 200);
  const invalid = await ProjectModel.collection.insertOne({ title: 'Bad version', departmentId: a, storeId: storeA, storeMappingRef: 'reviewed-project-fixture', createdBy: actors.manager.user._id, status: 'DRAFT', version: -1 });
  assert.equal((await call('manager', `/projects/${invalid.insertedId}`, { title: 'Must not write', expectedVersion: 1 }, 'PATCH')).status, 409);
});

test('pre-review hash encoding stays valid and original hashes survive a new encoding-version event', async () => {
  const raw = { title: 'Previous audit encoding', departmentId: a, storeId: storeA, storeMappingRef: 'reviewed-project-fixture', createdBy: actors.manager.user._id, status: 'DRAFT', version: 1, auditRequired: true };
  // Historical v1 encoding used null (not model defaults) for absent fields.
  const keys = ['title', 'description', 'departmentId', 'requiredSkills', 'createdBy', 'assigneeId', 'status', 'progress', 'dueDate', 'version', 'statusHistory', 'reports', 'assignmentStatus', 'assignmentRound', 'acceptedAt', 'responsibleEmployeeId', 'assignmentRequests', 'responsibilities', 'assignmentNotices', 'auditRequired'];
  const state = Object.fromEntries(keys.map((key) => [key, raw[key] ?? (key === 'assignmentRound' ? 0 : ['requiredSkills', 'statusHistory', 'reports', 'assignmentRequests', 'responsibilities', 'assignmentNotices'].includes(key) ? [] : null)]));
  const payload = { id: '0x' + 'ab'.repeat(32), sequence: 1, type: 'CREATED', actorId: String(actors.manager.user._id), at: new Date().toISOString(), reason: 'Historical fixture', before: {}, after: {}, details: {}, previousHash: '0'.repeat(64), nonce: 'cd'.repeat(32), stateHash: digest(state) };
  const event = { ...payload, hash: digest(payload) };
  const inserted = await ProjectModel.collection.insertOne({ ...raw, assignmentAudit: [event] });
  assert.equal(verifyProjectAudit(await ProjectModel.findById(inserted.insertedId).lean()), true);
  const edited = await call('manager', `/projects/${inserted.insertedId}`, { title: 'Updated legacy record', expectedVersion: 1 }, 'PATCH');
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const stored = await ProjectModel.findById(inserted.insertedId).lean(); assert.equal(stored.assignmentAudit[0].hash, event.hash);
  assert.equal(stored.assignmentAudit[1].stateVersion, 3); assert.equal(verifyProjectAudit(stored), true);
});

test('audited assignments cannot be changed through the legacy transition helper or generic review bypass', async () => {
  const project = await ProjectModel.create({ title: 'Audited guarded', departmentId: a, storeId: storeA, storeMappingRef: 'reviewed-project-fixture', createdBy: actors.manager.user._id, status: 'ASSIGNED', assignmentStatus: 'PENDING_ACCEPTANCE', assigneeId: actors.staff.employee._id, version: 1 });
  await assert.rejects(transitionProject({ projectId: project._id, expectedStatus: 'ASSIGNED', expectedVersion: 1, newStatus: 'IN_PROGRESS', changedBy: String(actors.staff.employee._id), actorRole: 'Employee' }), /consent\/report workflow/);
  assert.equal((await ProjectModel.findById(project._id).lean()).status, 'ASSIGNED');
  assert.equal((await call('staff', `/projects/${project._id}/transition`, { targetStatus: 'IN_PROGRESS', expectedVersion: 1 })).status, 409);
  for (const endpoint of ['schedules', 'corrections', 'cash']) assert.equal((await call('global', '/' + endpoint, {})).status, 503, 'disabled legacy operational APIs remain disabled');
});

test('consistency validator rejects overlapping responsibility/rounds and storage guard measures BSON not JSON', () => {
  const project = { status: 'IN_PROGRESS', assignmentStatus: 'ACCEPTED', assignmentRound: 1, assigneeId: 'A', responsibleEmployeeId: 'A', acceptedAt: '2026-10-31T00:00:00Z', responsibilities: [{ employeeId: 'A', assignmentRound: 1, startAt: '2026-10-31T00:00:00Z', endAt: null, progressStart: 0, progressEnd: null }] };
  assert.doesNotThrow(() => assertAssignmentConsistency(project));
  assert.throws(() => assertAssignmentConsistency({ ...project, responsibleEmployeeId: 'B' }), /không nhất quán/);
  assert.throws(() => assertAssignmentConsistency({ ...project, responsibilities: [...project.responsibilities, ...project.responsibilities] }), /không nhất quán/);
  assert.throws(() => assertAssignmentConsistency({ ...project, status: 'COMPLETED' }), /không nhất quán/);
  const large = { values: Array(800000).fill('') };
  assert.ok(Buffer.byteLength(JSON.stringify(large)) < 8 * 1024 * 1024);
  assert.throws(() => assertProjectStorage(large), /ngưỡng lưu trữ/);
});

test('new work requires a deadline; legacy work without a deadline remains readable', async () => {
  assert.equal((await call('manager', '/projects', { title: 'Missing due date', departmentId: String(a) })).status, 400);
  const legacy = await ProjectModel.create({ title: 'No legacy deadline', departmentId: a, storeId: storeA, storeMappingRef: 'reviewed-project-fixture', createdBy: actors.manager.user._id });
  assert.equal((await call('manager', `/projects/${legacy._id}`)).status, 200);
});

test('case-insensitive ObjectId assignment is canonicalized before consent ownership checks', async () => {
  const project = await call('manager', '/projects', { title: 'Uppercase assignment', departmentId: String(a), storeId: String(storeA), dueDate: '2026-11-15T00:00:00Z' }); assert.equal(project.status, 201);
  const offered = await call('manager', `/projects/${project.body.id}/assign`, { assigneeId: String(actors.staff.employee._id).toUpperCase(), expectedVersion: 1 }); assert.equal(offered.status, 200);
  const accepted = await call('staff', `/projects/${project.body.id}/assignment/respond`, { action: 'ACCEPT', expectedVersion: 2 }); assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.assigneeId, String(actors.staff.employee._id));
});

test('legacy and canonical socket confirmations never report successful execution without an executor', async () => {
  const requireWeb = createRequire(new URL('../../web/package.json', import.meta.url));
  const { io } = requireWeb('socket.io-client');
  const socket = io(base, { auth: { token: actors.staff.token }, transports: ['websocket'], autoConnect: false, reconnection: false });
  const beforeProjects = JSON.stringify(await ProjectModel.find({}).sort({ _id: 1 }).lean());
  try {
    const connected = once(socket, 'connect', { signal: AbortSignal.timeout(5000) }); socket.connect(); await connected;
    for (const [event, payload] of [
      ['chat:send', { clientMessageId: 'legacy-confirm', confirm: { actionId: 'not-executable', approved: true } }],
      ['chat:confirm', { clientMessageId: 'canonical-confirm', actionId: 'not-executable', approve: true }],
    ]) {
      const done = once(socket, 'chat:done', { signal: AbortSignal.timeout(5000) }); socket.emit(event, payload);
      const [result] = await done; assert.match(result.reply, /Chưa có thay đổi dữ liệu/); assert.doesNotMatch(result.reply, /thực thi thành công/);
    }
    assert.equal(JSON.stringify(await ProjectModel.find({}).sort({ _id: 1 }).lean()), beforeProjects);
  } finally { socket.close(); }
});

import './require-isolated-db.mjs';
import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { ProjectModel } from '../dist/models/Project.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { verifyProjectAudit } from '../dist/services/project-audit.service.js';
import { StoreModel } from '../dist/models/Store.js';
import { ManagementRelationModel } from '../dist/models/AuthorizationMapping.js';
import { testGrant, SELF_CAPS, MANAGEMENT_CAPS } from './helpers/authorization-v1-fixture.mjs';

let server, base, kpiBaseline;
const actors = {};
const a = new mongoose.Types.ObjectId(), b = new mongoose.Types.ObjectId();
const storeA = new mongoose.Types.ObjectId(), storeB = new mongoose.Types.ObjectId();
async function call(actor, path, body, method = body === undefined ? 'GET' : 'POST') {
  const result = await fetch(base + '/api' + path, { method,
    headers: { Authorization: 'Bearer ' + actors[actor].token, 'Content-Type': 'application/json', Connection: 'close' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: result.status, body: result.status === 204 ? null : await result.json() };
}
async function detail(id, actor = 'manager') { const result = await call(actor, '/projects/' + id); assert.equal(result.status, 200); return result.body; }
async function offer(person = 'old') {
  const allocator = person === 'manager' ? 'global' : 'manager';
  const created = await call(allocator, '/projects', { title: 'Consent workflow', departmentId: String(a), storeId: String(storeA), requiredSkills: ['Kiểm kê'], dueDate: '2020-01-01T00:00:00Z' });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const result = await call(allocator, '/projects/' + created.body.id + '/assign', { assigneeId: String(actors[person].employee._id), expectedVersion: 1 });
  assert.equal(result.status, 200, JSON.stringify(result.body)); return detail(created.body.id);
}
async function respond(id, actor, action, reason = 'Lý do nhân viên') {
  const current = await detail(id); return call(actor, '/projects/' + id + '/assignment/respond', { action, reason, expectedVersion: current.version });
}
async function working() {
  const project = await offer();
  assert.equal((await respond(project.id, 'old', 'ACCEPT')).status, 200);
  const current = await detail(project.id);
  const started = await call('old', '/projects/' + project.id + '/transition', { targetStatus: 'IN_PROGRESS', expectedVersion: current.version });
  assert.equal(started.status, 200, JSON.stringify(started.body)); return detail(project.id);
}
async function requestTransfer(project) { const result = await respond(project.id, 'old', 'REQUEST_CHANGE', 'Cần chuyển giao có kiểm kê'); assert.equal(result.status, 200); return result.body; }
async function review(project, actor, action, extra = {}) {
  const request = [...project.assignmentRequests].reverse().find((entry) => ['PENDING', 'HANDOVER_PENDING'].includes(entry.status));
  return call(actor, `/projects/${project.id}/assignment/requests/${request.id}/review`, { action, reason: 'Quản lý đã xem xét lý do', expectedVersion: project.version, ...extra });
}
before(async () => {
  await connectDB();
  await mongoose.connection.collection('departments').insertMany([{ _id: a, name: 'Unit A', code: 'A' }, { _id: b, name: 'Unit B', code: 'B' }]);
  await StoreModel.create([{ _id: storeA, store_name: 'Isolated consent A', kind: 'outlet', status: 'ACTIVE', scopeApprovalRef: 'fixture-a', departmentId: a }, { _id: storeB, store_name: 'Isolated consent B', kind: 'outlet', status: 'ACTIVE', scopeApprovalRef: 'fixture-b', departmentId: b }]);
  for (const [name, role, department, global] of [
    ['global', 'Admin', null, true], ['global2', 'Admin', null, true], ['manager', 'Admin', a, false], ['otherManager', 'Admin', b, false],
    ['old', 'Employee', a, false], ['next', 'Employee', a, false], ['peer', 'Employee', a, false], ['outsider', 'Employee', b, false], ['unmapped', 'Admin', null, false],
  ]) {
    const profile = ['global', 'global2'].includes(name) ? 'om' : ['manager', 'otherManager'].includes(name) ? 'sm' : 'staff';
    const employee = name !== 'unmapped' ? await EmployeeModel.create({ employeeCode: 'CONSENT-' + name, fullName: name, departmentId: department || a, storeId: department === b ? storeB : storeA, storeMappingRef: 'isolated-canonical',
      status: 'active', skills: ['Kiểm kê'], activeLoad: 999, level: 'Junior' }) : null;
    const userId = new mongoose.Types.ObjectId();
    const user = await UserModel.create({ _id: userId, username: 'consent-' + name, passwordHash: 'not-used', role, isGlobalAdmin: global, employeeId: employee?._id,
      authorization: employee ? { schemaVersion: 1, profile, grants: [testGrant(profile, { kind: 'self' }, SELF_CAPS, userId), ...(profile === 'staff' ? [] : [testGrant(profile, { kind: 'organization', storeIds: ['global', 'global2'].includes(name) ? [String(storeA), String(storeB)] : [String(department === b ? storeB : storeA)] }, MANAGEMENT_CAPS, userId)])] } : null });
    if (employee) { employee.userId = user._id; await employee.save(); }
    actors[name] = { user, employee, token: await signAccessToken({ sub: String(user._id), role }) };
  }
  for (const [parent, child, location] of [['global2', 'global', storeA], ['global2', 'global', storeB], ['global', 'manager', storeA], ['global', 'otherManager', storeB], ['manager', 'old', storeA], ['manager', 'next', storeA], ['manager', 'peer', storeA], ['otherManager', 'outsider', storeB]]) await ManagementRelationModel.create({ managerEmployeeId: actors[parent].employee._id, employeeId: actors[child].employee._id, storeId: location, approvalRef: 'isolated-consent-reporting', validFrom: new Date(Date.now() - 60000), validUntil: null, version: 1 });
  await mongoose.connection.collection('evaluations').insertMany([
    { employeeId: actors.next.employee._id, status: 'PUBLISHED', finalScore: 90, maxScore: 100, period: '2026-10' },
    { employeeId: actors.next.employee._id, status: 'DRAFT', finalScore: -999, maxScore: 100, period: '2026-11' },
    { employeeId: actors.peer.employee._id, status: 'PUBLISHED', finalScore: 7, period: '2026-10' },
  ]);
  kpiBaseline = JSON.stringify(await mongoose.connection.collection('evaluations').find({}).sort({ _id: 1 }).toArray());
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
afterEach(async () => {
  assert.equal(JSON.stringify(await mongoose.connection.collection('evaluations').find({}).sort({ _id: 1 }).toArray()), kpiBaseline, 'No consent/assignment/rejection/handover operation may change KPI');
  assert.ok((await EmployeeModel.find({}).lean()).every((employee) => employee.activeLoad === 999), 'No silent rewriting of employee workload/KPI caches');
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await mongoose.connection.dropDatabase(); await disconnectDB();
});

test('offering is not acceptance/responsibility; only the proposed employee can accept and start', async () => {
  const project = await offer();
  assert.equal(project.assignmentStatus, 'PENDING_ACCEPTANCE'); assert.equal(project.responsibleEmployeeId, null); assert.deepEqual(project.responsibilities, []);
  assert.equal((await call('old', `/projects/${project.id}/transition`, { targetStatus: 'IN_PROGRESS', expectedVersion: project.version })).status, 409);
  assert.equal((await respond(project.id, 'peer', 'ACCEPT')).status, 404, 'Non-participant cannot discover this project');
  assert.equal((await respond(project.id, 'manager', 'ACCEPT')).status, 403);
  const accepted = await respond(project.id, 'old', 'ACCEPT'); assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal(accepted.body.responsibleEmployeeId, String(actors.old.employee._id));
  assert.ok(accepted.body.responsibilities[0].startAt); assert.equal((await respond(project.id, 'old', 'ACCEPT')).status, 409);
  assert.equal((await call('old', `/projects/${project.id}/transition`, { targetStatus: 'IN_PROGRESS', expectedVersion: accepted.body.version })).status, 200);
  assert.equal(verifyProjectAudit(await ProjectModel.findById(project.id).lean()), true);
});

test('decline before acceptance requires a reason, enters manager review and never assigns responsibility', async () => {
  const project = await offer();
  assert.equal((await call('old', `/projects/${project.id}/assignment/respond`, { action: 'DECLINE', expectedVersion: project.version })).status, 400);
  const declined = await respond(project.id, 'old', 'DECLINE'); assert.equal(declined.status, 200);
  assert.equal(declined.body.assignmentStatus, 'MANAGER_REVIEW'); assert.equal(declined.body.assigneeId, project.assigneeId); assert.equal(declined.body.responsibleEmployeeId, null);
  assert.equal((await review(declined.body, 'otherManager', 'APPROVE', { replacementId: String(actors.next.employee._id) })).status, 404);
  assert.equal((await review(declined.body, 'peer', 'REJECT')).status, 404, 'Non-participant has no project visibility');
  const request = declined.body.assignmentRequests[0];
  assert.equal((await call('manager', `/projects/${project.id}/assignment/requests/${request.id}/review`, { action: 'REJECT', expectedVersion: declined.body.version })).status, 400);
  const rejected = await review(declined.body, 'manager', 'REJECT'); assert.equal(rejected.status, 200);
  assert.equal(rejected.body.assignmentStatus, 'PENDING_ACCEPTANCE'); assert.equal(rejected.body.responsibleEmployeeId, null, 'A manager cannot force acceptance by rejecting a decline');
});

test('approved replacement before start is a new offer, not automatic acceptance', async () => {
  const offered = await offer(); const declined = await respond(offered.id, 'old', 'DECLINE');
  const assigned = await review(declined.body, 'manager', 'APPROVE', { replacementId: String(actors.next.employee._id).toUpperCase() });
  assert.equal(assigned.status, 200); assert.equal(assigned.body.assigneeId, String(actors.next.employee._id));
  assert.equal(assigned.body.assignmentStatus, 'PENDING_ACCEPTANCE'); assert.equal(assigned.body.responsibleEmployeeId, null); assert.equal(assigned.body.assignmentRound, 2);
  assert.equal((await respond(offered.id, 'old', 'ACCEPT')).status, 403);
  assert.equal((await respond(offered.id, 'next', 'ACCEPT')).status, 200);
});

test('accepted-not-started change rejection keeps responsibility, notifies, allows discussion and independent escalation', async () => {
  const offered = await offer(); assert.equal((await respond(offered.id, 'old', 'ACCEPT')).status, 200);
  let current = (await respond(offered.id, 'old', 'REQUEST_CHANGE')).body;
  current = (await review(current, 'global', 'REJECT')).body;
  assert.equal(current.responsibleEmployeeId, String(actors.old.employee._id)); assert.equal(current.assignmentStatus, 'ACCEPTED');
  const rejected = current.assignmentRequests[0];
  const commented = await call('old', `/projects/${current.id}/assignment/requests/${rejected.id}/comments`, { message: 'Xin trao đổi thêm', expectedVersion: current.version });
  assert.equal(commented.status, 200); assert.equal(commented.body.assignmentRequests[0].comments.length, 1);
  const escalated = await call('old', `/projects/${current.id}/assignment/requests/${rejected.id}/escalate`, { message: 'Đề nghị cấp trên độc lập xem xét', expectedVersion: commented.body.version });
  assert.equal(escalated.status, 200, JSON.stringify(escalated.body));
  assert.equal((await review(escalated.body, 'manager', 'REJECT')).status, 403);
  assert.equal((await review(escalated.body, 'global', 'REJECT')).status, 403, 'Original reviewer cannot review their own rejected decision on escalation');
  assert.equal((await review(escalated.body, 'global2', 'APPROVE', { replacementId: String(actors.next.employee._id) })).status, 200);
  const inbox = await call('old', '/assignment/notifications');
  assert.ok(inbox.body.items.some((item) => item.message.includes('Quản lý đã xem xét')));
  const item = inbox.body.items[0];
  assert.equal((await call('old', `/assignment/notifications/${item.projectId}/${item.id}/read`, {})).status, 204);
  assert.equal((await call('old', '/assignment/notifications')).body.items.find((entry) => entry.id === item.id).read, true);
});

test('in-progress transfer freezes a progress snapshot and switches responsibility only after both confirmations', async () => {
  let project = await working();
  const progress = await call('old', `/projects/${project.id}/progress`, { progress: 45, expectedVersion: project.version }); assert.equal(progress.status, 200, JSON.stringify(progress.body));
  project = await requestTransfer(await detail(project.id));
  assert.equal((await review(project, 'manager', 'APPROVE', { replacementId: String(actors.next.employee._id) })).status, 400);
  project = (await review(project, 'manager', 'APPROVE', { replacementId: String(actors.next.employee._id), handoverNote: 'Đã kiểm kê 45%, còn đối chiếu két' })).body;
  assert.equal(project.assignmentStatus, 'HANDOVER_PENDING'); assert.equal(project.assigneeId, String(actors.old.employee._id)); assert.equal(project.responsibleEmployeeId, project.assigneeId);
  assert.equal((await call('old', `/projects/${project.id}/progress`, { progress: 60, expectedVersion: project.version })).status, 409);
  assert.equal((await call('manager', `/projects/${project.id}`, { description: 'Cannot change the task behind a confirmed snapshot', expectedVersion: project.version }, 'PATCH')).status, 409);
  assert.equal((await call('old', '/reports', { projectId: project.id, content: 'Cannot bypass handover', expectedVersion: project.version })).status, 409);
  const request = project.assignmentRequests.at(-1); assert.equal(request.progressSnapshot, 45);
  const path = `/projects/${project.id}/assignment/requests/${request.id}/handover`;
  assert.equal((await call('peer', path, { action: 'CONFIRM', reason: 'Not a party', expectedVersion: project.version })).status, 404, 'No same-department peer visibility');
  const outcomes = await Promise.all(['old', 'next'].map((actor) => call(actor, path, { action: 'CONFIRM', reason: 'Đã kiểm tra bàn giao', expectedVersion: project.version })));
  assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409]);
  const winner = outcomes.find((result) => result.status === 200).body;
  assert.equal(winner.assigneeId, String(actors.old.employee._id)); assert.equal(winner.responsibleEmployeeId, String(actors.old.employee._id));
  const retry = outcomes[0].status === 409 ? 'old' : 'next';
  const final = await call(retry, path, { action: 'CONFIRM', reason: 'Đã đối chiếu đủ thông tin', expectedVersion: winner.version });
  assert.equal(final.status, 200, JSON.stringify(final.body));
  project = final.body; assert.equal(project.assigneeId, String(actors.next.employee._id)); assert.equal(project.responsibleEmployeeId, project.assigneeId); assert.equal(project.progress, 45);
  assert.equal(project.responsibilities[0].endAt, project.responsibilities[1].startAt); assert.equal(project.responsibilities[0].progressEnd, 45); assert.equal(project.responsibilities[1].progressStart, 45);
  assert.equal((await call('old', `/projects/${project.id}/progress`, { progress: 100, expectedVersion: project.version })).status, 403);
  assert.equal((await call('next', `/projects/${project.id}/progress`, { progress: 55, expectedVersion: project.version })).status, 200);
  assert.equal((await call('next', path, { action: 'CONFIRM', reason: 'Duplicate', expectedVersion: project.version })).status, 409);
});

test('incoming employee may decline a handover; manager may cancel, neither silently switches assignees', async () => {
  let project = await requestTransfer(await working());
  project = (await review(project, 'manager', 'APPROVE', { replacementId: String(actors.next.employee._id), handoverNote: 'Giữ nguyên tiến độ' })).body;
  const cancelled = await call('next', `/projects/${project.id}/assignment/requests/${project.assignmentRequests.at(-1).id}/handover`, { action: 'DECLINE', reason: 'Chưa nhận được tài liệu', expectedVersion: project.version });
  assert.equal(cancelled.status, 200); assert.equal(cancelled.body.assigneeId, String(actors.old.employee._id)); assert.equal(cancelled.body.assignmentStatus, 'ACCEPTED');
  project = await requestTransfer(cancelled.body);
  project = (await review(project, 'manager', 'APPROVE', { replacementId: String(actors.next.employee._id), handoverNote: 'Bổ sung bàn giao' })).body;
  const stopped = await review(project, 'manager', 'CANCEL_HANDOVER'); assert.equal(stopped.status, 200); assert.equal(stopped.body.responsibleEmployeeId, String(actors.old.employee._id));
});

test('stalled handover with deactivated replacement stays with outgoing owner and can be recovered by a scoped manager', async () => {
  let project = await requestTransfer(await working());
  project = (await review(project, 'manager', 'APPROVE', { replacementId: String(actors.next.employee._id), handoverNote: 'Đang chờ kiểm tra thực tế' })).body;
  const path = `/projects/${project.id}/assignment/requests/${project.assignmentRequests.at(-1).id}/handover`;
  project = (await call('old', path, { action: 'CONFIRM', reason: 'Đã giao tài liệu', expectedVersion: project.version })).body;
  await EmployeeModel.updateOne({ _id: actors.next.employee._id }, { $set: { status: 'inactive' } });
  try {
    // Account lifecycle now rejects the inactive employee BEFORE the handover handler.
    const inactiveReply = await call('next', path, { action: 'CONFIRM', reason: 'Không còn đủ điều kiện', expectedVersion: project.version });
    assert.equal(inactiveReply.status, 401);
    assert.equal(inactiveReply.body.error.code, 'UNAUTHENTICATED');
    assert.equal((await detail(project.id)).version, project.version);
    assert.equal((await detail(project.id)).responsibleEmployeeId, String(actors.old.employee._id));
    assert.equal((await review(project, 'otherManager', 'CANCEL_HANDOVER')).status, 404);
    const recovered = await review(project, 'manager', 'CANCEL_HANDOVER'); assert.equal(recovered.status, 200);
    assert.equal(recovered.body.assignmentStatus, 'ACCEPTED');
    assert.equal((await call('old', `/projects/${project.id}/progress`, { progress: 30, expectedVersion: recovered.body.version })).status, 200);
  } finally { await EmployeeModel.updateOne({ _id: actors.next.employee._id }, { $set: { status: 'active' } }); }
});

test('revoking the approving manager blocks final handover without shifting responsibility; another scoped manager can recover', async () => {
  let project = await requestTransfer(await working());
  project = (await review(project, 'manager', 'APPROVE', { replacementId: String(actors.next.employee._id), handoverNote: 'Phê duyệt phải còn hiệu lực khi bàn giao' })).body;
  const path = `/projects/${project.id}/assignment/requests/${project.assignmentRequests.at(-1).id}/handover`;
  project = (await call('old', path, { action: 'CONFIRM', reason: 'Bên giao xác nhận', expectedVersion: project.version })).body;
  const grants = actors.manager.user.authorization.grants;
  await UserModel.updateOne({ _id: actors.manager.user._id }, { $set: { 'authorization.grants': grants.map((grant) => grant.scope.kind === 'organization' ? { ...grant, revokedAt: new Date().toISOString() } : grant) } });
  try {
    const result = await call('next', path, { action: 'CONFIRM', reason: 'Bên nhận xác nhận', expectedVersion: project.version });
    assert.equal(result.status, 409, JSON.stringify(result.body));
    assert.equal(result.body.error.code, 'HANDOVER_APPROVAL_STALE');
    const unchanged = await ProjectModel.findById(project.id).lean();
    assert.equal(unchanged.version, project.version);
    assert.equal(String(unchanged.responsibleEmployeeId), String(actors.old.employee._id));
    assert.equal(unchanged.responsibilities.filter((row) => row.endAt == null).length, 1);
    assert.equal(verifyProjectAudit(unchanged), true);
    const recovered = await review(project, 'global', 'CANCEL_HANDOVER');
    assert.equal(recovered.status, 200, JSON.stringify(recovered.body));
    assert.equal(recovered.body.responsibleEmployeeId, String(actors.old.employee._id));
  } finally {
    await UserModel.updateOne({ _id: actors.manager.user._id }, { $set: { 'authorization.grants': grants } });
  }
});

test('manager cancellation racing final confirmation has one atomic winner and no split responsibility', async () => {
  let project = await requestTransfer(await working());
  project = (await review(project, 'manager', 'APPROVE', { replacementId: String(actors.next.employee._id), handoverNote: 'Kiểm tra cạnh tranh xử lý' })).body;
  const request = project.assignmentRequests.at(-1);
  const path = `/projects/${project.id}/assignment/requests/${request.id}/handover`;
  project = (await call('old', path, { action: 'CONFIRM', reason: 'Bên giao đã xác nhận', expectedVersion: project.version })).body;
  const results = await Promise.all([review(project, 'manager', 'CANCEL_HANDOVER'), call('next', path, { action: 'CONFIRM', reason: 'Bên nhận đã kiểm tra', expectedVersion: project.version })]);
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 409]);
  const final = await detail(project.id);
  assert.equal(final.assignmentStatus, 'ACCEPTED');
  assert.equal(final.responsibilities.filter((row) => row.endAt === null).length, 1);
  assert.equal(final.responsibilities.find((row) => row.endAt === null).employeeId, final.responsibleEmployeeId);
  assert.equal(final.assigneeId, final.responsibleEmployeeId);
  assert.equal(verifyProjectAudit(await ProjectModel.findById(project.id).lean()), true);
});

test('simultaneous responses/reviews produce one decision and cannot be self-approved', async () => {
  const project = await offer();
  const path = `/projects/${project.id}/assignment/respond`;
  const responses = await Promise.all(['DECLINE', 'ACCEPT'].map((action) => call('old', path, { action, reason: 'Concurrent response', expectedVersion: project.version })));
  assert.deepEqual(responses.map((result) => result.status).sort(), [200, 409]);
  const own = await offer('manager'); const declined = await respond(own.id, 'manager', 'DECLINE');
  assert.equal((await review(declined.body, 'manager', 'REJECT')).status, 403);
  const decisions = await Promise.all(['global', 'global2'].map((actor) => review(declined.body, actor, 'APPROVE', { replacementId: String(actors.next.employee._id) })));
  assert.deepEqual(decisions.map((result) => result.status).sort(), [200, 409]);
});

test('history is append-only via API; data/audit tampering is detected and cannot be silently overwritten', async () => {
  const offered = await offer(); const accepted = await respond(offered.id, 'old', 'ACCEPT');
  assert.equal(accepted.status, 200);
  const stored = await ProjectModel.findById(offered.id).lean();
  await ProjectModel.updateOne({ _id: offered.id }, { $set: { progress: 99 } });
  assert.equal((await call('old', `/projects/${offered.id}/assignment/audit`)).body.valid, false);
  const result = await respond(offered.id, 'old', 'REQUEST_CHANGE'); assert.equal(result.status, 409); assert.equal(result.body.error.code, 'AUDIT_INTEGRITY_FAILED');
  assert.deepEqual((await ProjectModel.findById(offered.id).lean()).assignmentAudit, stored.assignmentAudit);
  assert.equal((await call('manager', `/projects/${offered.id}/assignment/audit/${stored.assignmentAudit[0].id}/prepare`, {})).body.error.code, 'AUDIT_INTEGRITY_FAILED');
  await ProjectModel.updateOne({ _id: offered.id }, { $set: { progress: stored.progress, assignmentAudit: [] } });
  assert.equal((await call('old', `/projects/${offered.id}/assignment/audit`)).body.valid, false, 'Deleting all history on a newly audited project is not a legacy fallback');
});

test('dashboard filters, scope and durable recipient-only notices reflect consent states', async () => {
  const project = await offer(); await respond(project.id, 'old', 'DECLINE');
  const summary = await call('manager', '/assignment/summary'); assert.equal(summary.status, 200); assert.ok(summary.body.pendingRequests >= 1); assert.ok(summary.body.overdue >= 1);
  const pending = await call('manager', '/projects?assignmentView=PENDING_REQUESTS'); assert.ok(pending.body.items.some((item) => item.id === project.id));
  assert.equal((await call('otherManager', '/projects?assignmentView=PENDING_REQUESTS')).body.items.length, 0);
  assert.equal((await call('unmapped', '/assignment/summary')).status, 403);
  assert.equal((await call('peer', '/assignment/notifications')).body.items.length, 0, 'Same-department access does not disclose notices for another employee');
  assert.equal((await call('otherManager', `/projects/${project.id}/assignment/audit`)).status, 404);
});

test('replacement advice is read-only, excludes KPI and uses live responsibility load rather than cached activeLoad', async () => {
  const project = await offer(); const before = await detail(project.id);
  const result = await call('manager', `/projects/${project.id}/assignment/candidates`);
  assert.equal(result.status, 200); assert.equal(result.body.advisoryOnly, true);
  const next = result.body.items.find((item) => item.employeeId === String(actors.next.employee._id));
  const peer = result.body.items.find((item) => item.employeeId === String(actors.peer.employee._id));
  assert.equal(next.kpi, null); assert.equal(peer.kpi, null); assert.equal(result.body.source, 'BASELINE_EXACT'); assert.ok(next.activeLoad < 999);
  assert.equal(next.semanticScore, null); assert.ok(!next.explanation.includes('90/100'));
  assert.ok(!result.body.items.some((item) => item.employeeId === String(actors.outsider.employee._id) || item.employeeId === project.assigneeId));
  assert.equal((await detail(project.id)).version, before.version);
  assert.equal((await call('old', `/projects/${project.id}/assignment/candidates`)).status, 403);
});

test('legacy assigned work requires explicit consent; unconfigured Blockchain is never reported verified', async () => {
  const legacy = await ProjectModel.create({ title: 'Legacy assignment', departmentId: a, storeId: storeA, storeMappingRef: 'reviewed-legacy-mapping-fixture', createdBy: actors.manager.user._id, assigneeId: actors.old.employee._id, status: 'ASSIGNED', version: 1 });
  const current = await detail(String(legacy._id)); assert.equal(current.assignmentStatus, 'PENDING_ACCEPTANCE'); assert.equal(current.responsibleEmployeeId, null);
  assert.equal((await call('old', `/projects/${legacy._id}/transition`, { targetStatus: 'IN_PROGRESS', expectedVersion: 1 })).status, 409);
  const project = await offer();
  const proof = await call('manager', `/projects/${project.id}/assignment/audit/${project.assignmentAudit[0].id}/prepare`, {});
  assert.equal(proof.status, 503); assert.equal(proof.body.error.code, 'BLOCKCHAIN_NOT_CONFIGURED');
});

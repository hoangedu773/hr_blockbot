import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { ProjectModel } from '../dist/models/Project.js';
import { ReportModel } from '../dist/models/Report.js';
import { StoreModel } from '../dist/models/Store.js';
import { signAccessToken } from '../dist/services/auth.service.js';
import { ProjectSchema, ReportSchema } from '@hr-blockbot/contracts';
import { testGrant, SELF_CAPS, MANAGEMENT_CAPS } from './helpers/authorization-v1-fixture.mjs';
import { ManagementRelationModel } from '../dist/models/AuthorizationMapping.js';

let server, base;
const actors = {};
const deptA = new mongoose.Types.ObjectId();
const deptB = new mongoose.Types.ObjectId();
const storeA = 'GUTA CRM TEST A';
const storeB = 'GUTA CRM TEST B';
const storeAId = new mongoose.Types.ObjectId(), storeBId = new mongoose.Types.ObjectId();

async function call(actor, path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(base + '/api' + path, {
    method, headers: { Authorization: 'Bearer ' + actors[actor].token, 'Content-Type': 'application/json', Connection: 'close' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: await response.json() };
}
async function create(actor = 'global', overrides = {}) {
  const result = await call(actor, '/projects', { title: 'CRM workflow', departmentId: String(deptA), storeId: String(storeAId), requiredSkills: ['Bàn giao'], dueDate: '2026-11-15T00:00:00Z', ...overrides });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body;
}
async function working() {
  const project = await create();
  const assigned = await call('managerA', '/projects/' + project.id + '/assign', { assigneeId: String(actors.employeeA.employee._id), expectedVersion: 1 });
  assert.equal(assigned.status, 200, JSON.stringify(assigned.body));
  const accepted = await call('employeeA', '/projects/' + project.id + '/assignment/respond', { action: 'ACCEPT', expectedVersion: 2 });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  const started = await call('employeeA', '/projects/' + project.id + '/transition', { targetStatus: 'IN_PROGRESS', expectedVersion: 3 });
  assert.equal(started.status, 200);
  return { ...project, version: 4 };
}

before(async () => {
  await connectDB();
  await mongoose.connection.collection('departments').insertMany([
    { _id: deptA, name: 'Phòng A', code: 'CRM-A' }, { _id: deptB, name: 'Phòng B', code: 'CRM-B' },
  ]);
  await StoreModel.create([{ _id: storeAId, store_name: storeA, kind: 'outlet', status: 'ACTIVE', scopeApprovalRef: 'fixture-reviewed-a', departmentId: deptA }, { _id: storeBId, store_name: storeB, kind: 'outlet', status: 'ACTIVE', scopeApprovalRef: 'fixture-reviewed-b', departmentId: deptB }]);
  for (const [name, role, department, global] of [
    ['global', 'Admin', null, true], ['managerA', 'Admin', deptA, false], ['managerB', 'Admin', deptB, false],
    ['employeeA', 'Employee', deptA, false], ['coworkerA', 'Employee', deptA, false],
    ['employeeB', 'Employee', deptB, false], ['unlinked', 'Employee', null, false],
    ['unmappedManager', 'Admin', null, false],
  ]) {
    const employee = department || name === 'global' ? await EmployeeModel.create({
      employeeCode: 'CRM-' + name, fullName: name, departmentId: department || deptA, storeId: department === deptB ? storeBId : storeAId, storeMappingRef: 'fixture-explicit-store',
      store_raw: department === deptB ? storeB : storeA, level: name === 'global' ? 'Lead' : 'Junior', status: 'active', skills: ['Training'],
    }) : null;
    const id = new mongoose.Types.ObjectId(), profile = name === 'global' ? 'om' : name.startsWith('manager') ? 'sm' : 'staff';
    const grants = [testGrant(profile, { kind: 'self' }, SELF_CAPS, id)];
    if (profile !== 'staff') grants.push(testGrant(profile, { kind: 'organization', storeIds: name === 'global' ? [String(storeAId), String(storeBId)] : [String(department === deptB ? storeBId : storeAId)] }, MANAGEMENT_CAPS, id));
    const user = await UserModel.create({ _id: id, username: 'crm-' + name, passwordHash: 'not-used', role, isGlobalAdmin: global, employeeId: employee?._id, authorization: employee ? { schemaVersion: 1, profile, grants } : null });
    if (employee) { employee.userId = user._id; await employee.save(); }
    actors[name] = { user, employee, token: await signAccessToken({ sub: String(user._id), role }) };
  }
  for (const [parent, child, storeId] of [['global', 'managerA', storeAId], ['global', 'managerB', storeBId], ['managerA', 'employeeA', storeAId], ['managerA', 'coworkerA', storeAId], ['managerB', 'employeeB', storeBId]]) await ManagementRelationModel.create({ managerEmployeeId: actors[parent].employee._id, employeeId: actors[child].employee._id, storeId, approvalRef: 'fixture-reviewed-reporting', validFrom: new Date(Date.now() - 60000), validUntil: null, version: 1 });
  server = createServer(createApp());
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port;
});
after(async () => {
  if (server) { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); }
  await mongoose.connection.dropDatabase();
  await disconnectDB();
});

test('directory is scoped, explicitly granted OM chooses a canonical store and creates valid initial history', async () => {
  const directory = await call('global', '/departments');
  assert.equal(directory.status, 200);
  assert.equal(directory.body.items.length, 2);
  assert.equal((await call('managerA', '/departments')).body.items.length, 1);
  assert.equal((await call('unlinked', '/projects')).status, 403);
  assert.equal((await call('unmappedManager', '/projects')).status, 403);
  const result = await create();
  const details = await call('global', '/projects/' + result.id);
  assert.equal(details.status, 200);
  assert.equal(ProjectSchema.parse(details.body).statusHistory[0].from, null);
  assert.deepEqual(details.body.requiredSkills, ['Bàn giao']);
  assert.equal((await call('managerA', '/projects', { title: 'Cross scope', departmentId: String(deptB), storeId: String(storeBId), dueDate: '2026-11-15T00:00:00Z' })).status, 403);
  assert.equal((await call('global', '/projects', { title: 'Unknown', departmentId: 'not-a-department' })).status, 400);
  assert.equal((await call('global', '/projects', { title: '   ', departmentId: String(deptA) })).status, 400);
});

test('assignment rejects wrong scope, inactive and wrong-department assignees', async () => {
  const project = await create();
  const path = '/projects/' + project.id + '/assign';
  assert.equal((await call('managerB', path, { assigneeId: String(actors.employeeB.employee._id), expectedVersion: 1 })).status, 404);
  assert.equal((await call('managerA', path, { assigneeId: String(actors.employeeB.employee._id), expectedVersion: 1 })).status, 400);
  await EmployeeModel.updateOne({ _id: actors.coworkerA.employee._id }, { $set: { status: 'inactive' } });
  assert.equal((await call('managerA', path, { assigneeId: String(actors.coworkerA.employee._id), expectedVersion: 1 })).status, 400);
  await EmployeeModel.updateOne({ _id: actors.coworkerA.employee._id }, { $set: { status: 'active' } });
  assert.equal((await call('employeeA', path, { assigneeId: String(actors.employeeA.employee._id), expectedVersion: 1 })).status, 404, 'Nonparticipants must not discover an unassigned project');
  assert.equal((await call('global', '/projects/not-an-id/assign', { assigneeId: 'bad', expectedVersion: 1 })).status, 400);
});

test('personnel filters reject malformed scope/level/pagination and do not disclose sensitive fields', async () => {
  for (const query of ['departmentId[x]=bad', 'level=Manager', 'status=deleted', 'page=0', 'q=' + 'x'.repeat(51)]) {
    assert.equal((await call('global', '/employees?' + query)).status, 400, query);
  }
  const result = await call('managerA', '/employees?status=active&level=Junior&limit=100');
  assert.equal(result.status, 200); assert.equal(result.body.items.length, 3);
  assert.ok(result.body.items.every((item) => !('bank_account_number' in item) && !('passwordHash' in item)));
});

test('legacy store_raw-only personnel remain quarantined until an explicit reviewed mapping', async () => {
  const legacy = await EmployeeModel.collection.insertOne({ employee_code: 'CRM-LEGACY', full_name: 'Legacy staff', store_raw: 'GUTA LEGACY CRM', status: 'active' });
  let project;
  try {
    const directory = await call('global', '/departments');
    assert.ok(!directory.body.items.some((item) => item.id === 'GUTA LEGACY CRM'));
    assert.equal((await call('global', '/projects', { title: 'No inferred store', departmentId: 'GUTA LEGACY CRM', storeId: String(storeAId) })).status, 400);
    project = await create();
    const assigned = await call('global', '/projects/' + project.id + '/assign', { assigneeId: String(legacy.insertedId), expectedVersion: 1 });
    assert.equal(assigned.status, 400);
    const unchanged = await EmployeeModel.collection.findOne({ _id: legacy.insertedId });
    assert.equal(unchanged.store_raw, 'GUTA LEGACY CRM');
    assert.equal(unchanged.storeId, undefined);
    assert.equal((await ProjectModel.findById(project.id).lean()).version, 1);
  } finally {
    await EmployeeModel.deleteOne({ _id: legacy.insertedId });
    if (project) await ProjectModel.deleteOne({ _id: project.id });
  }
});

test('overdue and status filters intersect and regex text is literal', async () => {
  const project = await create('global', { title: 'CRM [literal] overdue', dueDate: '2020-01-01T00:00:00Z' });
  await call('global', '/projects/' + project.id + '/assign', { assigneeId: String(actors.employeeA.employee._id), expectedVersion: 1 });
  const result = await call('global', '/projects?status=DRAFT&overdue=true&q=' + encodeURIComponent('[literal]'));
  assert.equal(result.status, 200);
  assert.equal(result.body.items.length, 0);
  const assigned = await call('global', '/projects?status=ASSIGNED&overdue=true&q=' + encodeURIComponent('[literal]'));
  assert.deepEqual(assigned.body.items.map((item) => item.id), [project.id]);
  assert.equal((await call('global', '/projects?status=BAD')).status, 400);
  assert.equal((await call('global', '/projects?page=0')).status, 400);
});

test('only the assignee writes; stale concurrent progress does not overwrite accepted work', async () => {
  const project = await working();
  const path = '/projects/' + project.id + '/progress';
  assert.equal((await call('coworkerA', path, { progress: 99, expectedVersion: 4 })).status, 404);
  assert.equal((await call('managerB', path, { progress: 99, expectedVersion: 4 })).status, 404);
  assert.equal((await call('employeeA', path, { progress: 30 })).status, 400);
  assert.equal((await call('employeeA', path, { progress: 30, expectedVersion: 5 })).status, 409);
  const outcomes = await Promise.all([40, 70].map((progress) => call('employeeA', path, { progress, expectedVersion: 4 })));
  assert.deepEqual(outcomes.map((result) => result.status).sort(), [200, 409]);
  const actual = await ProjectModel.findById(project.id).lean();
  assert.equal(actual.version, 5);
  assert.ok([40, 70].includes(actual.progress));
  const detail = await call('global', '/projects/' + project.id);
  assert.equal(typeof detail.body.assigneeName, 'string');
  assert.ok(detail.body.assigneeName.length > 0);
  assert.equal((await call('global', '/projects/' + project.id + '/progress', { progress: 1.5, expectedVersion: 5 })).status, 400);
});

test('submit → reject → resubmit → approve commits report, decision, version and project atomically', async () => {
  const project = await working();
  const submit = () => call('employeeA', '/reports', { projectId: project.id, content: 'Báo cáo hoàn thành', attachments: ['https://example.com/evidence'], expectedVersion: 4 });
  const concurrent = await Promise.all([submit(), submit()]);
  assert.equal(concurrent.filter((result) => result.status === 201).length, 1);
  assert.equal(concurrent.filter((result) => result.status === 409).length, 1);
  let report = concurrent.find((result) => result.status === 201).body;
  const detail = await call('managerA', '/reports/' + report.reportId);
  assert.equal(ReportSchema.parse(detail.body).content, 'Báo cáo hoàn thành');
  assert.equal((await call('managerB', '/reports/' + report.reportId)).status, 404);
  assert.equal((await call('managerB', '/reports?projectId=' + project.id)).status, 404);
  assert.equal((await call('managerA', '/reports/' + report.reportId + '/review', { action: 'REJECT', expectedVersion: 5 })).status, 400);
  let result = await call('managerA', '/reports/' + report.reportId + '/review', { action: 'REJECT', reason: 'Bổ sung minh chứng', expectedVersion: 5 });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal((await call('employeeA', '/reports/' + report.reportId)).body.status, 'REJECTED');
  report = (await call('employeeA', '/reports', { projectId: project.id, content: 'Đã bổ sung', expectedVersion: 6 })).body;
  result = await call('global', '/reports/' + report.reportId + '/review', { action: 'APPROVE', expectedVersion: 7 });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const actual = await ProjectModel.findById(project.id).lean();
  assert.equal(actual.status, 'COMPLETED'); assert.equal(actual.progress, 100); assert.equal(actual.version, 8);
  assert.deepEqual(actual.reports.map((item) => item.status), ['REJECTED', 'APPROVED']);
  assert.equal((await call('employeeA', '/projects/' + project.id + '/progress', { progress: 10, expectedVersion: 8 })).status, 409);
  assert.equal((await call('global', '/reports/' + report.reportId + '/review', { action: 'APPROVE', expectedVersion: 8 })).status, 409);
  const history = await call('managerA', '/reports?projectId=' + project.id);
  assert.equal(history.body.items.length, 2, 'Projection must not duplicate canonical reports');
});

test('generic transitions cannot bypass reports, self-approval is blocked and links are validated', async () => {
  const project = await working();
  assert.equal((await call('employeeA', '/projects/' + project.id + '/transition', { targetStatus: 'PENDING_REVIEW', expectedVersion: 4 })).status, 409);
  assert.equal((await call('employeeA', '/reports', { projectId: project.id, content: 'x', attachments: ['javascript:alert(1)'], expectedVersion: 4 })).status, 400);
  assert.equal((await call('managerA', '/reports', { projectId: project.id, content: 'Không được nộp thay nhân viên', expectedVersion: 4 })).status, 403);
  const managerWork = await create();
  assert.equal((await call('global', '/projects/' + managerWork.id + '/assign', { assigneeId: String(actors.managerA.employee._id), expectedVersion: 1 })).status, 200);
  assert.equal((await call('managerA', '/projects/' + managerWork.id + '/assignment/respond', { action: 'ACCEPT', expectedVersion: 2 })).status, 200);
  assert.equal((await call('managerA', '/projects/' + managerWork.id + '/transition', { targetStatus: 'IN_PROGRESS', expectedVersion: 3 })).status, 200);
  const submitted = await call('managerA', '/reports', { projectId: managerWork.id, content: 'Quản lý nộp công việc của chính mình', expectedVersion: 4 });
  assert.equal(submitted.status, 201);
  assert.equal((await call('managerA', '/reports/' + submitted.body.reportId + '/review', { action: 'APPROVE', expectedVersion: 5 })).status, 403);
  assert.equal((await call('managerA', '/projects/' + managerWork.id + '/transition', { targetStatus: 'COMPLETED', expectedVersion: 5 })).status, 409, 'Even the executor cannot bypass report review');
  assert.equal((await call('global', '/projects/' + managerWork.id + '/transition', { targetStatus: 'COMPLETED', expectedVersion: 5 })).status, 403, 'A manager cannot execute on behalf of another employee');
  assert.equal((await call('global', '/reports/' + submitted.body.reportId + '/review', { action: 'APPROVE', expectedVersion: 5 })).status, 200);
});

test('projection failure cannot erase an accepted report or its review', async (t) => {
  const project = await working();
  const original = ReportModel.updateOne;
  t.mock.method(ReportModel, 'updateOne', async () => { throw new Error('simulated compatibility failure'); });
  const submitted = await call('employeeA', '/reports', { projectId: project.id, content: 'Canonical source survives', expectedVersion: 4 });
  assert.equal(submitted.status, 201);
  assert.equal((await call('managerA', '/reports/' + submitted.body.reportId)).body.content, 'Canonical source survives');
  const reviewed = await call('managerA', '/reports/' + submitted.body.reportId + '/review', { action: 'APPROVE', expectedVersion: 5 });
  assert.equal(reviewed.status, 200);
  assert.equal((await call('managerA', '/reports/' + submitted.body.reportId)).body.status, 'APPROVED');
  ReportModel.updateOne = original;
});

test('canonical review stays compatible with pre-existing standalone reports', async () => {
  const project = await working();
  // Simulate a pre-audit legacy record, not an undetected mutation of a new audited record.
  await ProjectModel.updateOne({ _id: project.id }, { $set: { status: 'PENDING_REVIEW', assignmentAudit: [], auditRequired: false } });
  const legacy = await ReportModel.create({ projectId: project.id, submittedBy: String(actors.employeeA.employee._id), content: 'Old report', status: 'PENDING' });
  assert.equal((await call('managerA', '/reports/' + legacy._id)).body.content, 'Old report');
  const reviewed = await call('managerA', '/reports/' + legacy._id + '/review', { action: 'APPROVE', expectedVersion: 4 });
  assert.equal(reviewed.status, 200, JSON.stringify(reviewed.body));
  assert.equal((await call('managerA', '/reports/' + legacy._id)).body.status, 'APPROVED');
});

test('a delayed pending projection never overwrites a newer approval', async (t) => {
  const project = await working();
  const original = ReportModel.updateOne;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let pendingProjection;
  const reached = new Promise((resolve) => { pendingProjection = resolve; });
  t.mock.method(ReportModel, 'updateOne', async function (filter, update, options) {
    if (update.$set.status === 'PENDING') { pendingProjection(); await gate; }
    return original.call(this, filter, update, options);
  });
  const submitted = call('employeeA', '/reports', { projectId: project.id, content: 'Projection ordering', expectedVersion: 4 });
  try {
    await reached;
    const canonical = await ProjectModel.findById(project.id).lean();
    const reportId = String(canonical.reports[0]._id);
    const approved = await call('managerA', '/reports/' + reportId + '/review', { action: 'APPROVE', expectedVersion: 5 });
    assert.equal(approved.status, 200);
    release();
    assert.equal((await submitted).status, 201);
    const projection = await ReportModel.findById(reportId).lean();
    assert.equal(projection.status, 'APPROVED'); assert.equal(projection.projectVersion, 6);
    assert.equal((await call('employeeA', '/reports/' + reportId)).body.status, 'APPROVED');
  } finally {
    release(); await submitted; ReportModel.updateOne = original;
  }
});

test('edits are scoped and versioned; completed work cannot be rewritten', async () => {
  const project = await create();
  const path = '/projects/' + project.id;
  assert.equal((await call('managerB', path, { title: 'Hacked', expectedVersion: 1 }, 'PATCH')).status, 404);
  assert.equal((await call('employeeA', path, { title: 'No', expectedVersion: 1 }, 'PATCH')).status, 404);
  assert.equal((await call('managerA', path, { dueDate: null, expectedVersion: 1 }, 'PATCH')).status, 400, 'Approved G06: new tasks keep a non-null deadline');
  const edited = await call('managerA', path, { title: 'Updated', dueDate: '2026-11-16T00:00:00Z', expectedVersion: 1 }, 'PATCH');
  assert.equal(edited.status, 200); assert.equal(edited.body.version, 2);
  assert.equal((await call('managerA', path, { title: 'Stale', expectedVersion: 1 }, 'PATCH')).status, 409);
});

test('overview is per caller rather than leaking chain totals', async () => {
  assert.equal((await call('global', '/dashboard/overview')).body.employees.total, 6);
  const scoped = await call('managerA', '/dashboard/overview');
  assert.equal(scoped.status, 200); assert.equal(scoped.body.employees.total, 4); assert.equal(scoped.body.stores.outlets, 1);
  const own = await call('employeeA', '/dashboard/overview');
  assert.equal(own.status, 403, 'Staff can use their task/profile views, not organizational aggregates');
  assert.equal(scoped.body.revenue.value, null); assert.equal(scoped.body.onTimeRate.value, null);
  assert.equal((await call('unlinked', '/dashboard/overview')).status, 403);
  assert.equal((await call('unmappedManager', '/dashboard/overview')).status, 403);
});

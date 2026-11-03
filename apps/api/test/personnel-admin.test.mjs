import './require-isolated-db.mjs';
import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { DepartmentModel } from '../dist/models/Department.js';
import { UserModel } from '../dist/models/User.js';
import { OnboardingRequestModel } from '../dist/models/OnboardingRequest.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';

let fixture, server, base, accountsBefore, kpiBefore;
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  await mongoose.connection.collection('evaluations').insertOne({ employeeId: fixture.actors.staff.employee._id, status: 'PUBLISHED', finalScore: 81, maxScore: 100 });
  accountsBefore = JSON.stringify(await UserModel.find({}).sort({ _id: 1 }).lean()); kpiBefore = JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray());
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); base = 'http://127.0.0.1:' + server.address().port + '/api';
});
afterEach(async () => {
  assert.equal(JSON.stringify(await UserModel.find({}).sort({ _id: 1 }).lean()), accountsBefore, 'An HR draft/edit/denied operation cannot provision active accounts or grant roles');
  assert.equal(JSON.stringify(await mongoose.connection.collection('evaluations').find({}).toArray()), kpiBefore, 'No KPI mutation');
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function call(actor, path, body, method = body === undefined ? 'GET' : 'POST') {
  const res = await fetch(base + path, { method, headers: { Connection: 'close', ...(actor ? { Authorization: 'Bearer ' + fixture.actors[actor].token } : {}), ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  return { status: res.status, body: res.status === 204 ? null : await res.json() };
}
const personnel = (extra = {}) => ({ clientRequestId: randomUUID(), fullName: 'Synthetic HR draft', storeId: String(fixture.stores[0]._id), phone: 'isolated-contact', hiredAt: '2026-10-31T00:00:00Z', reason: 'Owned fixture reviewed workflow', ...extra });
test('POST employees is an HR draft adapter, never direct active personnel/account creation', async () => {
  const body = personnel(), before = await EmployeeModel.countDocuments();
  assert.equal((await call(null, '/employees', body)).status, 401);
  for (const actor of ['staff', 'sm', 'om', 'system_admin']) assert.equal((await call(actor, '/employees', body)).status, 403);
  const result = await call('hr', '/employees', body); assert.equal(result.status, 201, JSON.stringify(result.body));
  assert.equal(result.body.status, 'DRAFT'); assert.equal(result.body.payload.phone, body.phone);
  assert.equal(await EmployeeModel.countDocuments(), before); assert.equal(await EmployeeModel.exists({ _id: result.body.employeeId }), null);
  assert.equal(await UserModel.exists({ _id: result.body.userId }), null);
});
test('draft strictly rejects role, grade, sensitive data, malformed dates and unknown field injection', async () => {
  for (const fields of [{ level: 'Senior' }, { fullName: ' ' }, { hiredAt: 'yesterday' }, { role: 'Admin' }, { userId: String(fixture.actors.system_admin.user._id) }, { bank_account_number: 'deny' }, { departmentId: String(fixture.departmentId) }])
    assert.equal((await call('hr', '/employees', personnel(fields))).status, 400, JSON.stringify(fields));
});
test('manual code injection is rejected; concurrent retries create exactly one draft identity', async () => {
  await EmployeeModel.collection.insertOne({ employee_code: 'LEGACY-UNIQUE-HR', full_name: 'Synthetic old import', store_raw: 'UNMAPPED' });
  assert.equal((await call('hr', '/employees', personnel({ employeeCode: 'LEGACY-UNIQUE-HR' }))).status, 400);
  const body = personnel();
  const outcomes = await Promise.all([call('hr', '/employees', body), call('hr', '/employees', body)]);
  assert.deepEqual(outcomes.map((row) => row.status), [201, 201]);
  assert.equal(outcomes[0].body.id, outcomes[1].body.id);
  const key = outcomes[0].body.payload.employeeCode.toLowerCase();
  assert.equal(await OnboardingRequestModel.countDocuments({ employeeKey: key }), 1);
  assert.equal(await UserModel.countDocuments({ username: key }), 0);
});
test('raw unit labels cannot manufacture a canonical store/department', async () => {
  const before = await DepartmentModel.countDocuments();
  assert.equal((await call('hr', '/employees', personnel({ storeId: 'UNMAPPED' }))).status, 400);
  assert.equal((await call('hr', '/employees', personnel({ storeId: String(fixture.stores[1]._id) }))).status, 403);
  assert.equal(await DepartmentModel.countDocuments(), before);
});
test('HR management DTO and safe edit allowlist are independent from operational summaries', async () => {
  const id = String(fixture.actors.staff.employee._id);
  assert.equal((await call('staff', '/employees/' + id + '/management')).status, 403);
  assert.equal((await call('sm', '/employees/' + id + '/management')).status, 404);
  assert.equal((await call('staffB', '/employees/' + id + '/management')).status, 404);
  const detail = await call('hr', '/employees/' + id + '/management'); assert.equal(detail.status, 200); assert.equal(detail.body.phone, 'fixture-contact');
  assert.doesNotMatch(JSON.stringify(detail.body), /NEVER_SEND_BANK|bank_account_number|passwordHash/);
  const changed = await call('hr', '/employees/' + id, { fullName: 'Synthetic verified ordinary name', phone: 'safe-contact-update', skills: ['Synthetic skill'], expectedVersion: 0 }, 'PATCH'); assert.equal(changed.status, 200);
  for (const fields of [{ departmentId: String(fixture.departmentId) }, { level: 'Lead' }, { status: 'inactive' }, { bank_account_number: 'denied' }])
    assert.equal((await call('hr', '/employees/' + id, { ...fields, expectedVersion: 1 }, 'PATCH')).status, 400);
  assert.equal((await call('hr', '/employees/' + id, { phone: 'stale', expectedVersion: 0 }, 'PATCH')).status, 409);
  const generic = await call('sm', '/employees/' + id); assert.equal(generic.status, 200); assert.equal('phone' in generic.body, false);
});
test('department creation policy remains PENDING for all nine profiles', async () => {
  const before = await DepartmentModel.countDocuments();
  for (const actor of ['system_admin', 'hr', 'om', 'aom', 'sam', 'am', 'sm', 'ptch', 'staff'])
    assert.equal((await call(actor, '/departments', { code: 'NO-CREATE', name: 'Do not invent department approval' })).status, 403);
  assert.equal(await DepartmentModel.countDocuments(), before);
});
test('ambiguous legacy unit and body-supplied global flag cannot enable department configuration', async () => {
  for (const fields of [{ code: 'UNMAPPED', name: 'Raw unit' }, { code: 'OK', name: '' }, { code: 'OK', name: 'X', isGlobalAdmin: true }])
    assert.equal((await call('system_admin', '/departments', fields)).status, 403);
});
test('legacy department metadata edit cannot bypass authorization through a known unit ID', async () => {
  const before = await DepartmentModel.findOne({ _id: fixture.departmentId }).lean();
  for (const actor of ['system_admin', 'hr', 'sm']) {
    assert.equal((await call(actor, '/departments/' + fixture.departmentId)).status, 403);
    assert.equal((await call(actor, '/departments/' + fixture.departmentId, { name: 'Unapproved rename', expectedVersion: 1 }, 'PATCH')).status, 403);
  }
  assert.deepEqual(await DepartmentModel.findOne({ _id: fixture.departmentId }).lean(), before);
});
test('manager metadata is not a way to appoint a real manager or acquire grants', async () => {
  const edges = await mongoose.connection.collection('management_relations').countDocuments();
  assert.equal((await call('system_admin', '/departments/' + fixture.departmentId, { managerId: String(fixture.actors.staff.employee._id), expectedVersion: 1 }, 'PATCH')).status, 403);
  assert.equal(await mongoose.connection.collection('management_relations').countDocuments(), edges);
});
test('HR draft fails closed if the onboarding uniqueness index is unavailable', async () => {
  await OnboardingRequestModel.collection.dropIndex('employeeKey_1');
  try {
    const result = await call('hr', '/employees', personnel()); assert.equal(result.status, 503); assert.equal(result.body.error.code, 'ONBOARDING_INDEX_REQUIRED');
  } finally { await OnboardingRequestModel.collection.createIndex({ employeeKey: 1 }, { name: 'employeeKey_1', unique: true }); }
});

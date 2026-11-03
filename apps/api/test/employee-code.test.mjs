import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { UserModel } from '../dist/models/User.js';
import { OnboardingRequestModel } from '../dist/models/OnboardingRequest.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { employeeCodePeriod } from '../dist/services/employee-code.service.js';

let fixture, server, base;
const counter = () => mongoose.connection.collection('employee_code_counters');
const proposal = (extra = {}) => ({ clientRequestId: randomUUID(), fullName: 'Synthetic auto-code test', phone: 'synthetic-only',
  hiredAt: '2026-10-31T17:00:00Z', storeId: String(fixture.stores[0]._id), reason: 'Owned automatic-code test', ...extra });
before(async () => {
  await connectDB(); fixture = await authorizationV1Fixture();
  await EmployeeModel.collection.insertOne({ employee_code: 'GT-CH25177626', full_name: 'Owned legacy invalid-month fixture' });
  await OnboardingRequestModel.collection.insertOne({ employeeKey: 'gt-ch26097628', payload: { employeeCode: 'GT-CH26097628' } });
  await UserModel.collection.insertOne({ username: 'gt-ch26107630' });
  server = createServer(createApp()); await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = 'http://127.0.0.1:' + server.address().port + '/api';
});
after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); await disconnectDB(); });
async function call(actor, body, path = '/onboarding') {
  const response = await fetch(base + path, { method: 'POST', headers: { Connection: 'close', 'Content-Type': 'application/json',
    ...(actor ? { Authorization: 'Bearer ' + fixture.actors[actor].token } : {}) }, body: JSON.stringify(body) });
  return { status: response.status, body: await response.json() };
}

test('year/month uses Vietnam time across month and year boundaries', () => {
  assert.equal(employeeCodePeriod('2026-10-31T17:00:00Z'), '2611');
  assert.equal(employeeCodePeriod('2026-12-31T17:00:00Z'), '2701');
  assert.equal(employeeCodePeriod('2026-11-30T16:59:59Z'), '2611');
  for (const date of ['invalid', '1999-01-01T00:00:00Z', '2100-01-01T00:00:00Z']) assert.throws(() => employeeCodePeriod(date));
});
test('denied, malformed and manual-code requests cannot consume a sequence number', async () => {
  assert.equal((await call(null, proposal())).status, 401);
  assert.equal((await call('staff', proposal())).status, 403);
  assert.equal((await call('sm', proposal({ storeId: String(fixture.stores[1]._id) }))).status, 403);
  for (const fields of [{ employeeCode: 'GT-CH26110001' }, { clientRequestId: 'invalid' }, { role: 'Admin' }, { hiredAt: '2100-01-01T00:00:00Z' }])
    assert.equal((await call('sm', proposal(fields))).status, 400);
  assert.equal(await counter().countDocuments(), 0);
});
test('first code continues the highest suffix in legacy records, pending requests and usernames', async () => {
  const result = await call('sm', proposal()); assert.equal(result.status, 201, JSON.stringify(result));
  assert.equal(result.body.payload.employeeCode, 'GT-CH26117631');
  assert.equal(result.body.status, 'PENDING_HR_REVIEW');
  assert.equal(await UserModel.countDocuments({ username: 'gt-ch26117631' }), 0);
  assert.equal(await EmployeeModel.countDocuments({ employeeCode: 'GT-CH26117631' }), 0);
  assert.equal((await OnboardingRequestModel.findById(result.body.id)).history.length, 1);
});
test('concurrent distinct requests receive distinct global sequence numbers', async () => {
  const results = await Promise.all(Array.from({ length: 24 }, () => call('sm', proposal())));
  assert.ok(results.every((result) => result.status === 201), JSON.stringify(results.filter((result) => result.status !== 201)));
  const codes = results.map((result) => result.body.payload.employeeCode);
  assert.equal(new Set(codes).size, 24); assert.ok(codes.every((code) => /^GT-CH2611\d{4}$/.test(code)));
  assert.deepEqual(codes.map((code) => Number(code.slice(-4))).sort((a, b) => a - b), Array.from({ length: 24 }, (_, i) => 7632 + i));
});
test('concurrent retries and later replay preserve one request, one employee identity and one code', async () => {
  const input = proposal(), count = await OnboardingRequestModel.countDocuments();
  const results = await Promise.all(Array.from({ length: 8 }, () => call('sm', input)));
  assert.ok(results.every((result) => result.status === 201), JSON.stringify(results));
  assert.equal(new Set(results.map((result) => result.body.id)).size, 1);
  assert.equal(new Set(results.map((result) => result.body.employeeId)).size, 1);
  assert.equal(new Set(results.map((result) => result.body.payload.employeeCode)).size, 1);
  assert.equal(await OnboardingRequestModel.countDocuments(), count + 1);
  const value = (await counter().findOne({ _id: 'GT-CH' })).value;
  assert.equal((await call('sm', input)).body.id, results[0].body.id);
  assert.equal((await call('sm', { ...input, fullName: 'Changed ambiguous retry' })).status, 409);
  assert.equal((await counter().findOne({ _id: 'GT-CH' })).value, value, 'replay/conflict cannot consume another number');
  assert.equal((await OnboardingRequestModel.findById(results[0].body.id)).history.length, 1);
});
test('rejection/amendment preserves the original code and a new month does not reset the suffix', async () => {
  const created = await call('sm', proposal());
  const rejected = await call('hr', { expectedVersion: 1, decision: 'REJECT', reason: 'Owned correction' }, '/onboarding/' + created.body.id + '/review');
  assert.equal(rejected.status, 200);
  const amended = await call('sm', { expectedVersion: rejected.body.version, fullName: 'Corrected synthetic', phone: 'corrected',
    hiredAt: '2026-12-01T00:00:00Z', reason: 'Corrected date; same identity' }, '/onboarding/' + created.body.id + '/resubmit');
  assert.equal(amended.status, 200); assert.equal(amended.body.payload.employeeCode, created.body.payload.employeeCode);
  const next = await call('sm', proposal({ hiredAt: '2026-12-01T00:00:00Z' }));
  assert.equal(next.status, 201); assert.match(next.body.payload.employeeCode, /^GT-CH2612\d{4}$/);
  assert.ok(Number(next.body.payload.employeeCode.slice(-4)) > Number(created.body.payload.employeeCode.slice(-4)));
});
test('an HR draft uses the same allocator and leaves accounts unprovisioned', async () => {
  const result = await call('hr', proposal(), '/employees'); assert.equal(result.status, 201);
  assert.equal(result.body.status, 'DRAFT'); assert.match(result.body.payload.employeeCode, /^GT-CH2611\d{4}$/);
  assert.equal(await UserModel.exists({ _id: result.body.userId }), null);
});
test('later imports advance the high-water mark; 9999 is issued once and exhaustion never wraps', async () => {
  await EmployeeModel.collection.insertOne({ employeeCode: 'GT-CH25019998' });
  const last = await call('sm', proposal()); assert.equal(last.status, 201); assert.equal(last.body.payload.employeeCode, 'GT-CH26119999');
  const count = await OnboardingRequestModel.countDocuments();
  const exhausted = await call('sm', proposal({ hiredAt: '2027-01-01T00:00:00Z' }));
  assert.equal(exhausted.status, 409); assert.equal(exhausted.body.error.code, 'EMPLOYEE_CODE_EXHAUSTED');
  assert.equal(await OnboardingRequestModel.countDocuments(), count);
});

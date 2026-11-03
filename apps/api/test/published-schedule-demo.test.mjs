import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { authorizationV1Fixture } from './helpers/authorization-v1-fixture.mjs';
import { resolvePrincipal } from '../dist/services/principal.service.js';
import { digest } from '../dist/services/project-audit.service.js';
import { verifySchedule, assignmentTimes } from '../dist/services/scheduling.service.js';
import { planPublishedDemo, applyPublishedDemo, readInputs, BATCH } from '../scripts/seed-published-schedule-demo.mjs';
import { OperationalWeekModel as Week } from '../dist/models/OperationalSchedule.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { UserModel } from '../dist/models/User.js';
const id = () => new mongoose.Types.ObjectId();
const store = { _id: id(), store_name: 'GUTA CAFE - Gò Vấp - 1B Nguyễn Kiệm', kind: 'outlet', status: 'ACTIVE' };
const person = { _id: id(), employeeCode: 'DEMO-001', fullName: 'Owned synthetic person', status: 'active', job_title: 'CAFE - Nhân viên bán hàng', store_raw: store.store_name, hire_date: '2026-10-05' };
const fixtureInputs = () => ({ stores: [store], employees: [person], sourceRows: [], shifts: [], weeks: [] });
let fixture;
before(async () => { mongoose.set('transactionAsyncLocalStorage', true); await connectDB(); fixture = await authorizationV1Fixture(); });
after(async () => { await disconnectDB(); });

test('seeded demo is repeatable, date bounded, respects hire date/weekly blank day and uses unique employee days', () => {
  const inputs = fixtureInputs(), first = planPublishedDemo(inputs), second = planPublishedDemo(inputs);
  assert.equal(digest(first), digest(second)); assert.equal(first.stats.newWeeks, 10); assert.equal(first.stats.newShifts, 7);
  const rows = first.weekChanges.flatMap(w => w.assignments);
  assert.ok(rows.length > 30); assert.ok(rows.every(a => a.date >= person.hire_date && a.date <= '2026-11-30' && a.source.kind === 'DEMO_RANDOM'));
  assert.equal(new Set(rows.map(a => a.employeeId + ':' + a.date)).size, rows.length);
  assert.ok(first.weekChanges.every(w => w.assignments.length <= 6));
  assert.ok(rows.every(a => assignmentTimes(a).every(t => t.end > t.start)));
  assert.equal(first.shiftChanges.find(s => s.code === 'LĐ').name, 'Đứng trước quán vẫy/đón khách');
});
test('only corroborated explicit source blocks and basic codes are matched; unknown or registered rows reserve the day', () => {
  const inputs = fixtureInputs(); inputs.sourceRows = [
    { _id: id(), employee_code: person.employeeCode, work_date: '2026-10-05', row_kind: 'employee', schedule_type: 'actual', block_code: '1BNK', shift_code: 'LĐ' },
    { _id: id(), employee_code: person.employeeCode, work_date: '2026-10-06', row_kind: 'employee', schedule_type: 'actual', block_code: '1BNK', shift_code: 'AB1-B219' },
    { _id: id(), employee_code: person.employeeCode, work_date: '2026-10-07', row_kind: 'employee', schedule_type: 'registered', block_code: null, shift_code: 'A' },
  ];
  const p = planPublishedDemo(inputs), rows = p.weekChanges.flatMap(w => w.assignments);
  assert.equal(p.stats.matchedLegacyAssignments, 1); assert.equal(p.sourceReview.length, 2);
  assert.equal(rows.find(a => a.date === '2026-10-05').source.sourceId, String(inputs.sourceRows[0]._id));
  assert.ok(!rows.some(a => ['2026-10-06', '2026-10-07'].includes(a.date)));
  inputs.sourceRows[0].block_code = null;
  assert.equal(planPublishedDemo(inputs).stats.matchedLegacyAssignments, 0, 'current employee home alone never proves a historical block');
});
test('unavailable staff, groups and ambiguous locations are excluded; existing custom shifts/weeks are retained', () => {
  const inputs = fixtureInputs(), custom = { _id: id(), storeId: store._id, code: 'A1', name: 'Existing hours', active: true, version: 7, intervals: [{ startMinute: 400, endMinute: 620 }] };
  inputs.shifts.push(custom); inputs.employees.push({ ...person, _id: id(), status: 'inactive' }, { ...person, _id: id(), lifecyclePendingRequestId: id() });
  inputs.employees.push({ ...person, _id: id(), employeeCode: 'LOCAL-BATCH20-hr' });
  inputs.stores.push({ _id: id(), store_name: 'Group support', kind: 'group', status: 'ACTIVE' });
  const p = planPublishedDemo(inputs); assert.equal(p.stats.stores, 1); assert.equal(p.stats.unavailableEmployees, 2); assert.equal(p.stats.newShifts, 6);
  assert.equal(p.stats.testSupportEmployees, 1); assert.ok(p.weekChanges.flatMap(w => w.assignments).every(a => a.employeeCode !== 'LOCAL-BATCH20-hr'));
  assert.ok(p.weekChanges.flatMap(w => w.assignments).filter(a => a.shiftCode === 'A1').every(a => a.shiftVersion === 7 && a.intervals[0].startMinute === 400));
  const target = p.weekChanges[2]; inputs.weeks.push({ _id: target._id, storeId: store._id, weekStart: target.weekStart, version: 2, draft: [], published: [], requests: [], publishedAt: new Date().toISOString(), history: [] });
  assert.equal(planPublishedDemo(inputs).stats.preservedWeeks, 1);
  const duplicate = { ...store, _id: id() }; inputs.stores.push(duplicate);
  assert.equal(planPublishedDemo(inputs).stats.storesWithPeople, 0, 'no guess for ambiguous source names');
});
test('overlap with existing previous-day overnight publication is excluded', () => {
  const inputs = fixtureInputs(); const p = planPublishedDemo(inputs), chosen = p.weekChanges.flatMap(w => w.assignments).find(a => a.date > '2026-10-10');
  const day = new Date(Date.parse(chosen.date + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  inputs.weeks.push({ _id: id(), storeId: id(), weekStart: day, draft: [], published: [{ employeeId: String(person._id), date: day, intervals: [{ startMinute: 1320, endMinute: 2880 }] }], history: [], requests: [] });
  const next = planPublishedDemo(inputs); assert.ok(!next.weekChanges.flatMap(w => w.assignments).some(a => a.date === chosen.date)); assert.ok(next.stats.existingConflictSkips > 0);
});
test('authenticated operator publishes atomically with provenance, keeps personnel/grants intact, replay produces no work', async () => {
  // Use the exclusively owned fixture, fixed dates are intentionally historical for this operator workflow.
  await EmployeeModel.updateOne({ _id: fixture.actors.staff.employee._id }, { $set: { hire_date: '2026-01-01' } });
  const before = await readInputs(); const plan = planPublishedDemo(before);
  const actor = await resolvePrincipal({ sub: String(fixture.actors.system_admin.user._id), role: 'Admin', securityVersion: 0 });
  const nonTechnical = await resolvePrincipal({ sub: String(fixture.actors.sm.user._id), role: 'Employee', securityVersion: 0 });
  await assert.rejects(applyPublishedDemo(nonTechnical, before, plan));
  const userHash = digest(await UserModel.find({}).sort({ _id: 1 }).lean());
  const journal = []; const result = await applyPublishedDemo(actor, before, plan, async row => journal.push(row));
  assert.ok(result.newWeeks > 0); assert.ok(journal.length > 0);
  const after = await readInputs(); after.shifts.forEach(verifySchedule); after.weeks.forEach(verifySchedule);
  assert.equal(digest(before.stores), digest(after.stores)); assert.equal(digest(before.employees), digest(after.employees)); assert.equal(userHash, digest(await UserModel.find({}).sort({ _id: 1 }).lean()));
  assert.ok(after.weeks.every(w => w.publishedAt && digest(w.published) === digest(w.draft) && w.history.at(-1).batchId === BATCH));
  assert.ok(after.weeks.flatMap(w => w.published).some(a => a.source.kind === 'DEMO_RANDOM'));
  const replay = planPublishedDemo(after); assert.equal(replay.weekChanges.length, 0); assert.equal(replay.shiftChanges.length, 0);
  await assert.rejects(applyPublishedDemo(actor, before, plan), /Inputs changed/);
});

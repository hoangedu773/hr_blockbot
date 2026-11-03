import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ScheduleDateSchema, ShiftDefinitionInputSchema, ScheduleDraftInputSchema, ScheduleChangeCreateSchema, ScheduleChangeActionSchema } from '../dist/index.js';
test('calendar dates and configured intervals reject impossible dates, zero/overlapping hours and injected authority', () => {
  for (const d of ['2026-02-30', '2026-13-01', 'not-a-date']) assert.equal(ScheduleDateSchema.safeParse(d).success, false);
  assert.equal(ScheduleDateSchema.safeParse('2028-02-29').success, true);
  const valid = { code: 'A1', name: 'Owner configured', active: true, intervals: [{ startMinute: 1320, endMinute: 1560 }] };
  assert.equal(ShiftDefinitionInputSchema.safeParse(valid).success, true);
  for (const extra of [{ intervals: [{ startMinute: 600, endMinute: 600 }] }, { intervals: [{ startMinute: 0, endMinute: 120 }, { startMinute: 60, endMinute: 200 }] }, { role: 'Admin' }]) assert.equal(ShiftDefinitionInputSchema.safeParse({ ...valid, ...extra }).success, false);
});
test('weekly edits and change consent require bounded typed identities, versions and reasons', () => {
  const id = '11111111-1111-4111-8111-111111111111', employeeId = 'a'.repeat(24);
  const slot = { id, employeeId, shiftId: employeeId, date: '2026-11-09' };
  assert.equal(ScheduleDraftInputSchema.safeParse({ expectedVersion: 1, reason: 'Configured week', assignments: [slot] }).success, true);
  assert.equal(ScheduleDraftInputSchema.safeParse({ expectedVersion: 1, reason: 'Configured week', assignments: [slot, slot] }).success, false);
  const r = { expectedVersion: 1, clientRequestId: id, assignmentId: id, targetAssignmentId: id, receiverEmployeeId: employeeId, kind: 'SWAP', reason: 'Verified test' };
  assert.equal(ScheduleChangeCreateSchema.safeParse(r).success, true);
  assert.equal(ScheduleChangeCreateSchema.safeParse({ ...r, approvedBy: employeeId }).success, false);
  assert.equal(ScheduleChangeCreateSchema.safeParse({ ...r, targetAssignmentId: undefined }).success, false);
  assert.equal(ScheduleChangeCreateSchema.safeParse({ ...r, arrangement: 'MANAGER', kind: 'COVER', receiverEmployeeId: null, targetAssignmentId: undefined }).success, true);
  assert.equal(ScheduleChangeActionSchema.safeParse({ expectedVersion: 1, action: 'APPROVE', reason: ' ' }).success, false);
});

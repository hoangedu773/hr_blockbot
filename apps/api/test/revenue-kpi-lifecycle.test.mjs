import './require-isolated-db.mjs';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { RevenueKpiPolicySchema } from '@hr-blockbot/contracts';
import * as S from '../dist/services/revenue-kpi.service.js';
import { RevenueKpiResultModel as Result } from '../dist/models/RevenueKpiResult.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';
import { NotificationModel } from '../dist/models/Notification.js';
import { runRevenueKpiReminders, flushRevenueKpiNotices } from '../dist/services/revenue-kpi-notification.service.js';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';
let f, hr, sm, am, p, a;
before(async () => { await connectDB(); f = await revenueFixture(); hr = await f.principal('hr'); sm = await f.principal('sm'); am = await f.principal('am'); });
after(disconnectDB);
test('create/open auto drafts from primary appointment; retry is stable and area is sum of store targets', async () => {
  const c = command(0, { period: '2026-10', policy: RevenueKpiPolicySchema.parse({ allowDemoData: true }) });
  p = await S.createRevenueKpiPeriod(hr, c); assert.equal((await S.createRevenueKpiPeriod(hr, c)).id, p.id);
  const open = command(p.version); p = await S.openRevenueKpiPeriod(hr, p.period, open); assert.equal((await S.openRevenueKpiPeriod(hr, p.period, open)).version, p.version);
  const d = await S.revenueKpiDashboard(hr, p.period); a = d.assignments.find(a => a.unitType === 'STORE'); assert.ok(a); assert.equal(a.targetVnd, 103000);
  const area = d.assignments.find(a => a.unitType === 'AREA'); assert.ok(area); assert.equal(area.targetVnd, a.targetVnd);
});
test('publish/accept, refusal, independent HR adjust/reconfirm, evidence/AM verification', async () => {
  a = await S.mutateRevenueKpiAssignment(hr, a.id, 'publish', command(a.version)); assert.equal(a.status, 'PENDING_ACCEPTANCE'); assert.ok(a.deadlineAt);
  const refuse = command(a.version, { reason: 'Mục tiêu cần được xem xét.' }); a = await S.mutateRevenueKpiAssignment(sm, a.id, 'refuse', refuse); assert.equal(a.status, 'HR_REVIEW');
  a = await S.mutateRevenueKpiAssignment(hr, a.id, 'hr-decision', command(a.version, { action: 'ADJUST', newTargetVnd: 110000, reason: 'Điều chỉnh mục tiêu sau trao đổi.' })); assert.equal(a.status, 'PENDING_ACCEPTANCE');
  const accept = command(a.version); a = await S.mutateRevenueKpiAssignment(sm, a.id, 'accept', accept); assert.equal(a.status, 'ACTIVE'); assert.equal((await S.mutateRevenueKpiAssignment(sm, a.id, 'accept', accept)).version, a.version);
  await assert.rejects(S.mutateRevenueKpiAssignment(sm, a.id, 'accept', command(a.version - 1)), e => e.code === 'REVENUE_KPI_VERSION_CONFLICT');
  a = await S.mutateRevenueKpiAssignment(sm, a.id, 'adjustment-request', command(a.version, { reason: 'Sửa chữa cửa hàng trong tháng.', evidenceRef: 'Biên bản sửa chữa mô phỏng số 01.' }));
  await assert.rejects(S.mutateRevenueKpiAssignment(hr, a.id, 'adjustment-decision', command(a.version, { action: 'APPROVE', newTargetVnd: 105000, reason: 'Đồng ý điều chỉnh mục tiêu.' })), e => e.code === 'REVENUE_KPI_INVALID_STATE');
  a = await S.mutateRevenueKpiAssignment(am, a.id, 'adjustment-verify', command(a.version, { reason: 'AM đã đối chiếu tài liệu sửa chữa.' }));
  a = await S.mutateRevenueKpiAssignment(hr, a.id, 'adjustment-decision', command(a.version, { action: 'APPROVE', newTargetVnd: 105000, reason: 'HR duyệt mục tiêu sau xác minh.' })); assert.equal(a.status, 'PENDING_ACCEPTANCE');
  a = await S.mutateRevenueKpiAssignment(sm, a.id, 'accept', command(a.version));
});
test('results append-only through reason/review/confirmation, period guards and correction', async () => {
  // Cancel unused AREA draft: closing cannot silently ignore drafts.
  let d = await S.revenueKpiDashboard(hr, p.period), area = d.assignments.find(a => a.unitType === 'AREA');
  await S.mutateRevenueKpiAssignment(hr, area.id, 'hr-decision', command(area.version, { action: 'CANCEL', reason: 'Không dùng KPI khu vực trong ca kiểm thử này.' }));
  p = await S.computeRevenueKpiPeriod(hr, p.period, command(p.version));
  let result = (await S.revenueKpiAssignmentResult(sm, a.id)).result; assert.equal(result.status, 'AWAITING_REASON'); assert.equal(result.achieved, false);
  const before = await Result.findById(result.id).lean();
  await assert.rejects(S.closeRevenueKpiPeriod(hr, p.period, command(p.version)), e => e.code === 'REVENUE_KPI_PERIOD_NOT_READY');
  await assert.rejects(S.mutateRevenueKpiResult(hr, result.id, 'confirm', command(result.version)), e => e.code === 'REVENUE_KPI_REASON_REQUIRED');
  result = await S.mutateRevenueKpiResult(sm, result.id, 'miss-reason', command(result.version, { text: 'Cửa hàng sửa chữa nên doanh thu chưa đạt.' }));
  assert.equal(result.actualRevenueVnd, 100000); assert.equal(result.achievementPercent, 95.24); assert.equal(result.achieved, false);
  result = await S.mutateRevenueKpiResult(hr, result.id, 'review-reason', command(result.version, { decision: 'ACKNOWLEDGED', note: 'Đã đối chiếu lý do cùng tài liệu.' }));
  const confirm = command(result.version); result = await S.mutateRevenueKpiResult(hr, result.id, 'confirm', confirm); assert.equal(result.status, 'CONFIRMED');
  assert.deepEqual(await Result.findById(before._id).lean(), before); assert.equal(await Result.countDocuments({ assignmentId: a.id }), 4);
  p = await S.closeRevenueKpiPeriod(hr, p.period, command(p.version)); assert.equal(p.status, 'CLOSED');
  result = await S.mutateRevenueKpiResult(hr, result.id, 'correct', command(result.version, { reason: 'Đối chiếu lại doanh thu theo chứng từ sau chốt.' })); assert.equal(result.status, 'CORRECTED'); assert.equal(await Result.countDocuments({ assignmentId: a.id }), 5);
  await assert.rejects(S.mutateRevenueKpiAssignment(sm, a.id, 'adjustment-request', command(99, { reason: 'Không cho sửa kỳ đã chốt.', evidenceRef: 'Tài liệu mô phỏng.' })), e => e.code === 'REVENUE_KPI_PERIOD_LOCKED');
});
test('new store without baseline requires absolute target and missing SM cannot be assigned', async () => {
  const q = await S.createRevenueKpiPeriod(hr, command(0, { period: '2026-06', policy: RevenueKpiPolicySchema.parse({}) })); await S.openRevenueKpiPeriod(hr, q.period, command(q.version));
  const draft = command(0, { period: q.period, unitType: 'STORE', storeId: String(f.stores[0]._id), assigneeEmployeeId: String(f.actors.sm.employee._id), targetMode: 'GROWTH_PERCENT', reason: 'Tạo mục tiêu cửa hàng mới.' });
  await assert.rejects(S.saveRevenueKpiAssignment(hr, draft), e => e.code === 'REVENUE_KPI_TARGET_INVALID');
  const absolute = await S.saveRevenueKpiAssignment(hr, { ...draft, clientRequestId: command(0).clientRequestId, targetMode: 'ABSOLUTE_VND', targetVnd: 500000 }); assert.equal(absolute.baseRevenueVnd, null); assert.equal(absolute.targetVnd, 500000);
});
test('overdue reminder is explicit SYSTEM event and never auto accepts; replay notices dedupe', async () => {
  let d = await S.revenueKpiDashboard(hr, '2026-06'), assigned = d.assignments.find(a => a.unitType === 'STORE');
  assigned = await S.mutateRevenueKpiAssignment(hr, assigned.id, 'publish', command(assigned.version));
  const before = await NotificationModel.countDocuments({ entityKind: 'revenue_kpi' }); await flushRevenueKpiNotices(); assert.equal(await NotificationModel.countDocuments({ entityKind: 'revenue_kpi' }), before);
  await runRevenueKpiReminders(new Date(Date.parse(assigned.deadlineAt) + 1));
  assigned = (await S.revenueKpiAssignmentResult(sm, assigned.id)).assignment;
  assert.equal(assigned.status, 'PENDING_ACCEPTANCE'); assert.equal(assigned.overdue, true); assert.equal(assigned.history.at(-1).actorKind, 'SYSTEM');
  const n = await NotificationModel.countDocuments({ entityKind: 'revenue_kpi' }); await runRevenueKpiReminders(new Date(Date.parse(assigned.deadlineAt) + 2000)); assert.equal(await NotificationModel.countDocuments({ entityKind: 'revenue_kpi' }), n);
});

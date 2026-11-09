import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { RevenueKpiPolicySchema } from '@hr-blockbot/contracts';
const isZod = e => e && Array.isArray(e.issues);
import * as S from '../dist/services/revenue-kpi.service.js';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';
import { notifyUser } from '../dist/services/notification.service.js';
import { NotificationModel } from '../dist/models/Notification.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';

let f, hrP, amP, smP, p, storeKpi;
const kinds = items => items.map(i => i.kind);

before(async () => {
  await connectDB();
  f = await revenueFixture();
  [hrP, amP, smP] = await Promise.all(['hr', 'am', 'sm'].map(f.principal));
  p = await S.createRevenueKpiPeriod(hrP, command(0, { period: '2026-09', policy: RevenueKpiPolicySchema.parse({ allowDemoData: true }) }));
  p = await S.openRevenueKpiPeriod(hrP, p.period, command(p.version));
  storeKpi = (await S.revenueKpiDashboard(hrP, p.period)).assignments.find(a => a.unitType === 'STORE');
  const area = (await S.revenueKpiDashboard(hrP, p.period)).assignments.find(a => a.unitType === 'AREA');
  assert.ok(storeKpi && area, 'fixture tạo đủ KPI cửa hàng và khu vực');
  storeKpi = await S.mutateRevenueKpiAssignment(hrP, storeKpi.id, 'publish', command(storeKpi.version));
  storeKpi = await S.mutateRevenueKpiAssignment(smP, storeKpi.id, 'accept', command(storeKpi.version));
});
after(disconnectDB);

test('get_my_revenue_kpi trả KPI của chính mình với result mới nhất; kỳ không có KPI trả available:false', async () => {
  const mine = await S.getMyRevenueKpi(smP, '2026-09');
  assert.equal(mine.available, true);
  assert.equal(mine.period, '2026-09');
  assert.ok(mine.items.every(i => i.assignment.assigneeEmployeeId === String(f.actors.sm.employee._id)));
  assert.ok(mine.items.every(i => i.assignment.status !== 'CANCELLED'));
  assert.ok(mine.items.every(i => i.result === null || i.result.version >= 1));

  const amMine = await S.getMyRevenueKpi(amP, '2026-09');
  assert.equal(amMine.available, true);
  assert.ok(amMine.items.every(i => i.assignment.unitType === 'AREA'));

  const empty = await S.getMyRevenueKpi(smP, '2026-10');
  assert.deepEqual({ available: empty.available, items: empty.items }, { available: false, items: [] });
  await assert.rejects(S.getMyRevenueKpi(smP, '2026-13'), e => e.name === 'ZodError');
});

test('pending: PENDING_ACCEPTANCE là ACTION_REQUIRED, quá hạn thành URGENT; sort URGENT trước', async () => {
  // Đưa KPI về PENDING_ACCEPTANCE qua điều chỉnh APPROVE (ACTIVE → PENDING_ACCEPTANCE).
  let kpi = (await S.revenueKpiDashboard(hrP, '2026-09')).assignments.find(a => a.unitType === 'STORE');
  const req = await S.mutateRevenueKpiAssignment(smP, kpi.id, 'adjustment-request',
    command(kpi.version, { reason: 'Cần điều chỉnh mục tiêu để kiểm tra chờ xác nhận.', evidenceRef: 'Biên bản đối chiếu giả lập.' }));
  const verified = await S.mutateRevenueKpiAssignment(amP, req.id, 'adjustment-verify', command(req.version, { reason: 'Đã xác minh yêu cầu điều chỉnh giả lập.' }));
  const pending = await S.mutateRevenueKpiAssignment(hrP, verified.id, 'adjustment-decision',
    command(verified.version, { action: 'APPROVE', reason: 'Duyệt điều chỉnh để tạo trạng thái chờ xác nhận.', newTargetVnd: verified.targetVnd + 1000 }));
  assert.equal(pending.status, 'PENDING_ACCEPTANCE');
  const before = await S.listMyPendingActions(smP, {});
  const acceptance = before.items.filter(i => i.kind === 'acceptance' && i.entityId === pending.id);
  assert.equal(acceptance.length, 1);
  assert.ok(acceptance.every(i => i.severity === 'ACTION_REQUIRED' && i.proposedActionId === null));

  await Assignment.updateOne({ _id: pending.id }, { $set: { deadlineAt: '2026-09-02T00:00:00.000Z' } });
  const after = await S.listMyPendingActions(smP, {});
  const urgent = after.items.find(i => i.kind === 'acceptance' && i.entityId === pending.id);
  assert.ok(urgent && urgent.severity === 'URGENT');
  const firstNonUrgent = after.items.findIndex(i => i.severity !== 'URGENT');
  const lastUrgent = after.items.map(i => i.severity).lastIndexOf('URGENT');
  assert.ok(lastUrgent < firstNonUrgent || firstNonUrgent === -1, 'URGENT đứng trước ACTION_REQUIRED/INFO');
  const restored = await S.mutateRevenueKpiAssignment(smP, pending.id, 'accept', command(pending.version));
  assert.equal(restored.status, 'ACTIVE');
});

test('SM không thấy việc verify/decide của AM và HR; HR thấy decide sau khi AM xác minh', async () => {
  const kpi = (await S.revenueKpiDashboard(hrP, '2026-09')).assignments.find(a => a.unitType === 'STORE');
  const requested = await S.mutateRevenueKpiAssignment(smP, kpi.id, 'adjustment-request',
    command(kpi.version, { reason: 'Cần điều chỉnh vì sửa chữa dữ liệu.', evidenceRef: 'Biên bản đối chiếu giả lập.' }));
  assert.equal(requested.status, 'ADJUSTMENT_REQUESTED');

  const smView = kinds((await S.listMyPendingActions(smP, {})).items);
  assert.ok(!smView.includes('adjustment_verify') && !smView.includes('adjustment_decision'));
  const amView = kinds((await S.listMyPendingActions(amP, {})).items);
  assert.ok(amView.includes('adjustment_verify'));
  assert.ok(!amView.includes('adjustment_decision'));
  const hrView = kinds((await S.listMyPendingActions(hrP, {})).items);
  assert.ok(!hrView.includes('adjustment_verify') && !hrView.includes('adjustment_decision'), 'STORE PENDING chỉ AM xác minh');

  const freshKpi = (await S.revenueKpiAssignmentResult(hrP, requested.id)).assignment;
  const verified = await S.mutateRevenueKpiAssignment(amP, freshKpi.id, 'adjustment-verify', command(freshKpi.version, { reason: 'Đã xác minh yêu cầu điều chỉnh.' }));
  const amAfter = kinds((await S.listMyPendingActions(amP, {})).items);
  assert.ok(!amAfter.includes('adjustment_verify'));
  const hrAfter = kinds((await S.listMyPendingActions(hrP, {})).items);
  assert.ok(hrAfter.includes('adjustment_decision'), 'VERIFIED chuyển sang HR quyết định');
  const decided = await S.mutateRevenueKpiAssignment(hrP, verified.id, 'adjustment-decision', command(verified.version, { action: 'REJECT', reason: 'Không đủ căn cứ điều chỉnh mục tiêu.' }));
  assert.equal(decided.status, 'ACTIVE');
  assert.ok(!kinds((await S.listMyPendingActions(hrP, {})).items).includes('adjustment_decision'));
});

test('miss_reason của SM và reason_review/result_confirm của HR derive từ result lifecycle', async () => {
  const kpi = (await S.revenueKpiDashboard(hrP, '2026-09')).assignments.find(a => a.unitType === 'STORE');
  assert.equal(kpi.status, 'ACTIVE');
  await S.computeRevenueKpiPeriod(hrP, '2026-09', command(p.version));
  const latest = (await S.revenueKpiAssignmentResult(smP, kpi.id)).result;
  assert.equal(latest.status, 'AWAITING_REASON');
  assert.ok(kinds((await S.listMyPendingActions(smP, {})).items).includes('miss_reason'));

  const withReason = await S.mutateRevenueKpiResult(smP, latest.id, 'miss-reason', command(latest.version, { text: 'Doanh thu giảm vì ca thiếu nhân sự cuối tháng.' }));
  assert.equal(withReason.status, 'COMPUTED');
  const hrView = kinds((await S.listMyPendingActions(hrP, {})).items);
  assert.ok(hrView.includes('reason_review'));
  assert.ok(!kinds((await S.listMyPendingActions(smP, {})).items).includes('reason_review'));
  await S.mutateRevenueKpiResult(hrP, withReason.id, 'review-reason', command(withReason.version, { decision: 'ACKNOWLEDGED', note: 'Đã xác nhận giải trình có căn cứ.' }));
  assert.ok(!kinds((await S.listMyPendingActions(hrP, {})).items).includes('reason_review'));
});

test('period_close URGENT cho HR khi kỳ OPEN đã hết tháng; SM không thấy', async () => {
  let old = await S.createRevenueKpiPeriod(hrP, command(0, { period: '2026-06', policy: RevenueKpiPolicySchema.parse({ allowDemoData: true }) }));
  old = await S.openRevenueKpiPeriod(hrP, old.period, command(old.version));
  const hrView = (await S.listMyPendingActions(hrP, {})).items.filter(i => i.kind === 'period_close');
  assert.ok(hrView.some(i => i.period === '2026-06' && i.severity === 'URGENT' && i.entityKind === 'period'));
  assert.ok(!kinds((await S.listMyPendingActions(smP, {})).items).includes('period_close'));
});

test('INFO lấy notification của đúng user và không phụ thuộc readAt; không rò thông báo người khác', async () => {
  const { created } = await notifyUser({ userId: String(f.actors.sm.user._id), type: 'revenue_kpi_assigned', title: 'KPI doanh thu cần xác nhận', body: 'Kỳ 2026-09: mở KPI để xem trạng thái.', dedupeKey: 'p2-test:info:sm', entityKind: 'revenue_kpi', entityId: storeKpi.id });
  assert.ok(created);
  await notifyUser({ userId: String(f.actors.am.user._id), type: 'revenue_kpi_assigned', title: 'Thông báo riêng AM', body: 'Chỉ AM nhận thông báo này.', dedupeKey: 'p2-test:info:am', entityKind: 'revenue_kpi', entityId: storeKpi.id });

  const smPending = await S.listMyPendingActions(smP, {});
  const infos = smPending.items.filter(i => i.kind === 'info');
  assert.ok(infos.some(i => i.severity === 'INFO' && i.message.includes('Kỳ 2026-09')));
  assert.ok(infos.every(i => !i.message.includes('riêng AM')), 'không rò thông báo của user khác');

  const unreadIds = infos.map(i => i.entityId);
  await NotificationModel.updateMany({ _id: { $in: unreadIds.map(x => new mongoose.Types.ObjectId(x)) }, userId: f.actors.sm.user._id }, { $set: { readAt: new Date() } });
  const afterRead = await S.listMyPendingActions(smP, {});
  assert.equal(afterRead.items.filter(i => i.kind === 'info').length, infos.length, 'readAt không làm mất row INFO');
});

test('phân trang: limit/offset cắt ổn định, nextOffset đúng, tham số sai bị từ chối', async () => {
  const all = await S.listMyPendingActions(smP, { limit: 200 });
  assert.ok(all.items.length >= 2, 'cần dữ liệu để phân trang');
  const page1 = await S.listMyPendingActions(smP, { limit: 1, offset: 0 });
  const page2 = await S.listMyPendingActions(smP, { limit: 1, offset: 1 });
  assert.deepEqual(page1.items, all.items.slice(0, 1));
  assert.deepEqual(page2.items, all.items.slice(1, 2));
  assert.equal(page2.nextOffset, page2.items.length + 1 < all.items.length ? 2 : null);
  await assert.rejects(S.listMyPendingActions(smP, { limit: 0 }), e => isZod(e) || e.name === 'ZodError');
  await assert.rejects(S.listMyPendingActions(smP, { offset: -1 }), e => isZod(e) || e.name === 'ZodError');
  await assert.rejects(S.listMyPendingActions(smP, { extra: 1 }), e => isZod(e) || e.name === 'ZodError');
});

test('P2 read không provision Mongo: gọi trước khi tạo kỳ cũng không tạo collection mới', async () => {
  const before = (await mongoose.connection.db.listCollections().toArray()).map(c => c.name).sort();
  const emptyPeriod = await S.getMyRevenueKpi(smP, '2026-12');
  assert.deepEqual({ available: emptyPeriod.available, items: emptyPeriod.items }, { available: false, items: [] });
  await S.listMyPendingActions(smP, {});
  const afterCollections = (await mongoose.connection.db.listCollections().toArray()).map(c => c.name).sort();
  assert.deepEqual(afterCollections, before, 'đường read không tạo/provision collection mới');
});

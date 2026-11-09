import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { RevenueKpiPolicySchema } from '@hr-blockbot/contracts';
import * as S from '../dist/services/revenue-kpi.service.js';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';
import { NotificationModel } from '../dist/models/Notification.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';
import { RevenueKpiPeriodModel as Period } from '../dist/models/RevenueKpiPeriod.js';
import { UserModel } from '../dist/models/User.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { listNotifications, markNotificationRead } from '../dist/services/notification.service.js';
import { runRevenueKpiReminders, flushRevenueKpiNotices } from '../dist/services/revenue-kpi-notification.service.js';

let f, hrP, amP, smP, p, storeKpi, am2User;

before(async () => {
  await connectDB();
  f = await revenueFixture();
  [hrP, amP, smP] = await Promise.all(['hr', 'am', 'sm'].map(f.principal));

  const am2Employee = await EmployeeModel.create({
    employeeCode: 'V1-am2',
    fullName: 'Isolated V1 AM2',
    departmentId: f.stores[1].departmentId,
    storeId: f.stores[1]._id,
    storeMappingRef: 'fixture-personnel-mapping',
    status: 'active',
    level: 'Junior',
    phone: 'fixture-contact-am2',
    bank_account_number: 'NEVER_SEND_BANK',
  });
  const am2Auth = structuredClone((await UserModel.findById(f.actors.am.user._id).lean()).authorization);
  am2Auth.grants[1].scope.storeIds = [String(f.stores[1]._id)];
  am2User = await UserModel.create({
    _id: new mongoose.Types.ObjectId(),
    username: 'v1-am2',
    passwordHash: 'dummy',
    role: 'Employee',
    isGlobalAdmin: false,
    employeeId: am2Employee._id,
    status: 'active',
    authorization: am2Auth,
  });
  am2Employee.userId = am2User._id;
  await am2Employee.save();

  p = await S.createRevenueKpiPeriod(hrP, command(0, { period: '2026-09', policy: RevenueKpiPolicySchema.parse({ allowDemoData: true }) }));
  p = await S.openRevenueKpiPeriod(hrP, p.period, command(p.version));
  storeKpi = (await S.revenueKpiDashboard(hrP, p.period)).assignments.find(a => a.unitType === 'STORE');
  assert.ok(storeKpi, 'fixture tạo đủ KPI cửa hàng');
  storeKpi = await S.mutateRevenueKpiAssignment(hrP, storeKpi.id, 'publish', command(storeKpi.version));
  storeKpi = await S.mutateRevenueKpiAssignment(smP, storeKpi.id, 'accept', command(storeKpi.version));
});

after(disconnectDB);

test('a) SM gửi adjustment-request -> AM có scope nhận revenue_kpi_adjustment_requested (ACTION_REQUIRED, actionRef đúng). AM ngoài scope KHÔNG nhận.', async () => {
  const req = await S.mutateRevenueKpiAssignment(
    smP,
    storeKpi.id,
    'adjustment-request',
    command(storeKpi.version, { reason: 'Cần điều chỉnh do mưa bão', evidenceRef: 'Biên bản thời tiết' })
  );
  storeKpi = req;

  const { items: amItems } = await listNotifications(String(f.actors.am.user._id));
  const amNotif = amItems.find(n => n.type === 'revenue_kpi_adjustment_requested');
  assert.ok(amNotif, 'AM trong scope phải nhận notification adjustment-request');
  assert.equal(amNotif.severity, 'ACTION_REQUIRED');
  assert.equal(amNotif.actionRef, String(storeKpi.id));

  const { items: am2Items } = await listNotifications(String(am2User._id));
  const am2Notif = am2Items.find(n => n.type === 'revenue_kpi_adjustment_requested');
  assert.equal(am2Notif, undefined, 'AM ngoài scope không được nhận notification');
});

test('b) AM verify -> HR nhận revenue_kpi_adjustment_verified (ACTION_REQUIRED, actionRef)', async () => {
  const verified = await S.mutateRevenueKpiAssignment(
    amP,
    storeKpi.id,
    'adjustment-verify',
    command(storeKpi.version, { reason: 'AM đã xác minh thiệt hại do bão' })
  );
  storeKpi = verified;

  const { items: hrItems } = await listNotifications(String(f.actors.hr.user._id));
  const hrNotif = hrItems.find(n => n.type === 'revenue_kpi_adjustment_verified');
  assert.ok(hrNotif, 'HR phải nhận notification adjustment-verify');
  assert.equal(hrNotif.severity, 'ACTION_REQUIRED');
  assert.equal(hrNotif.actionRef, String(storeKpi.id));
});

test('c) HR decide -> SM + AM nhận revenue_kpi_adjustment_decided (INFO, actionRef)', async () => {
  const decided = await S.mutateRevenueKpiAssignment(
    hrP,
    storeKpi.id,
    'adjustment-decision',
    command(storeKpi.version, { action: 'APPROVE', newTargetVnd: 120000000, reason: 'HR duyệt điều chỉnh' })
  );
  storeKpi = decided;

  const { items: smItems } = await listNotifications(String(f.actors.sm.user._id));
  const smNotif = smItems.find(n => n.type === 'revenue_kpi_adjustment_decided');
  assert.ok(smNotif, 'SM phải nhận notification adjustment-decided');
  assert.equal(smNotif.severity, 'INFO');
  assert.equal(smNotif.actionRef, String(storeKpi.id));

  const { items: amItems } = await listNotifications(String(f.actors.am.user._id));
  const amNotif = amItems.find(n => n.type === 'revenue_kpi_adjustment_decided');
  assert.ok(amNotif, 'AM có scope phải nhận notification adjustment-decided');
  assert.equal(amNotif.severity, 'INFO');
  assert.equal(amNotif.actionRef, String(storeKpi.id));
});

test('d) Overdue reminder -> assignee nhận revenue_kpi_acceptance_overdue (URGENT, actionRef)', async () => {
  // storeKpi đang ở PENDING_ACCEPTANCE sau khi adjustment được APPROVE
  assert.equal(storeKpi.status, 'PENDING_ACCEPTANCE');
  const pastDeadline = new Date(Date.now() - 3600000).toISOString();
  await Assignment.updateOne(
    { _id: storeKpi.id },
    { $set: { deadlineAt: pastDeadline, overdue: false } }
  );

  await runRevenueKpiReminders(new Date(Date.now() + 1000));

  const { items: smItems } = await listNotifications(String(f.actors.sm.user._id));
  const overdueNotif = smItems.find(n => n.type === 'revenue_kpi_acceptance_overdue');
  assert.ok(overdueNotif, 'Assignee phải nhận notification revenue_kpi_acceptance_overdue');
  assert.equal(overdueNotif.severity, 'URGENT');
  assert.equal(overdueNotif.actionRef, String(storeKpi.id));
});

test('e) Period closing -> HR nhận revenue_kpi_period_closing (URGENT, actionRef)', async () => {
  // Period 2026-09 kết thúc vào cuối tháng 9 (2026-09-30T17:00:00.000Z VN)
  // Chạy reminder với thời điểm tháng 10
  await runRevenueKpiReminders(new Date('2026-10-02T00:00:00Z'));

  const { items: hrItems } = await listNotifications(String(f.actors.hr.user._id));
  const closingNotif = hrItems.find(n => n.type === 'revenue_kpi_period_closing');
  assert.ok(closingNotif, 'HR phải nhận notification revenue_kpi_period_closing');
  assert.equal(closingNotif.severity, 'URGENT');
  assert.equal(closingNotif.actionRef, '2026-09');
});

test('f) Mọi notification có severity và actionRef; Notification.readAt không ảnh hưởng pending actions list', async () => {
  const allNotifications = await NotificationModel.find({ entityKind: 'revenue_kpi' }).lean();
  assert.ok(allNotifications.length > 0, 'Phải có notifications trong database');
  for (const n of allNotifications) {
    assert.ok(['INFO', 'ACTION_REQUIRED', 'URGENT'].includes(n.severity), `severity hợp lệ: ${n.severity}`);
    assert.ok(typeof n.actionRef === 'string' && n.actionRef.length > 0, `actionRef không rỗng: ${n.actionRef}`);
  }

  // Pending actions list check:
  const pendingBefore = await S.listMyPendingActions(smP);
  const { items: smNotifs } = await listNotifications(String(f.actors.sm.user._id));
  for (const n of smNotifs) {
    await markNotificationRead(String(f.actors.sm.user._id), n.id);
  }

  const { unread } = await listNotifications(String(f.actors.sm.user._id));
  assert.equal(unread, 0, 'Tất cả notification đã được đánh dấu đọc');

  const pendingAfter = await S.listMyPendingActions(smP);
  assert.deepEqual(
    pendingAfter.items.map(i => i.id),
    pendingBefore.items.map(i => i.id),
    'readAt không ảnh hưởng danh sách pending actions'
  );
});

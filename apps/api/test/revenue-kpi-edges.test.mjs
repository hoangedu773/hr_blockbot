import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { connectDB, disconnectDB } from '../dist/db.js';
import { RevenueKpiPolicySchema } from '@hr-blockbot/contracts';
import * as S from '../dist/services/revenue-kpi.service.js';
import { UserModel } from '../dist/models/User.js';
import { RevenueKpiAssignmentModel as Assignment } from '../dist/models/RevenueKpiAssignment.js';
import { revenueFixture, command } from './helpers/revenue-kpi-fixture.mjs';
let f, hr, sm, a, p;
before(async () => { await connectDB(); f = await revenueFixture(); hr = await f.principal('hr'); sm = await f.principal('sm');
  p = await S.createRevenueKpiPeriod(hr, command(0, { period: '2026-09', policy: RevenueKpiPolicySchema.parse({ allowDemoData: true }) })); p = await S.openRevenueKpiPeriod(hr, p.period, command(p.version)); a = (await S.revenueKpiDashboard(hr, p.period)).assignments.find(a => a.unitType === 'STORE'); });
after(disconnectDB);
test('concurrent consent yields one commit; request fingerprint rejects changed replay', async () => {
  a = await S.mutateRevenueKpiAssignment(hr, a.id, 'publish', command(a.version)); const first = command(a.version), second = command(a.version);
  const results = await Promise.allSettled([S.mutateRevenueKpiAssignment(sm, a.id, 'accept', first), S.mutateRevenueKpiAssignment(sm, a.id, 'accept', second)]);
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1); assert.equal(results.filter(r => r.status === 'rejected' && r.reason.status === 409).length, 1);
  a = (await S.revenueKpiAssignmentResult(sm, a.id)).assignment; assert.equal(a.status, 'ACTIVE'); assert.equal(a.history.filter(h => h.action === 'accept').length, 1);
  const win = results[0].status === 'fulfilled' ? first : second;
  await assert.rejects(S.mutateRevenueKpiAssignment(sm, a.id, 'refuse', { ...win, reason: 'Không được dùng lại yêu cầu với ý định khác.' }), e => e.code === 'REVENUE_KPI_VERSION_CONFLICT');
});
test('HR self-approval and outside-scope AM verification are denied even with capability', async () => {
  const old = await Assignment.findById(a.id).lean();
  await Assignment.updateOne({ _id: a.id }, { $set: { assigneeEmployeeId: hr.employeeId } });
  try { await assert.rejects(S.mutateRevenueKpiAssignment(hr, a.id, 'hr-decision', command(a.version, { action: 'CANCEL', reason: 'Không được tự duyệt mục tiêu của mình.' })), e => e.code === 'REVENUE_KPI_SELF_APPROVAL'); }
  finally { await Assignment.updateOne({ _id: a.id }, { $set: { assigneeEmployeeId: old.assigneeEmployeeId } }); }
  a = await S.mutateRevenueKpiAssignment(sm, a.id, 'adjustment-request', command(a.version, { reason: 'Cần điều chỉnh vì sửa chữa.', evidenceRef: 'Biên bản sửa chữa giả lập.' }));
  const am = await UserModel.findById(f.actors.am.user._id).lean();
  await UserModel.updateOne({ _id: am._id }, { $set: { 'authorization.grants.1.scope.storeIds': [String(f.stores[1]._id)] } });
  try { await assert.rejects(S.mutateRevenueKpiAssignment(await f.principal('am'), a.id, 'adjustment-verify', command(a.version, { reason: 'Không được xác minh ngoài khu vực.' })), e => e.status === 403); }
  finally { await UserModel.updateOne({ _id: am._id }, { $set: { authorization: am.authorization } }); }
});
test('snapshot persists when current AM store scope changes; zero/missing store remains pending result', async () => {
  const before = (await S.revenueKpiDashboard(hr, p.period)).assignments.find(a => a.unitType === 'AREA');
  const am = await UserModel.findById(f.actors.am.user._id).lean();
  await UserModel.updateOne({ _id: am._id }, { $push: { 'authorization.grants.1.scope.storeIds': String(f.stores[1]._id) } });
  try { const after = (await S.revenueKpiDashboard(await f.principal('am'), p.period)).assignments.find(a => a.unitType === 'AREA'); assert.deepEqual(after.stores, before.stores); assert.equal(after.targetVnd, before.targetVnd); }
  finally { await UserModel.updateOne({ _id: am._id }, { $set: { authorization: am.authorization } }); }
  let june = await S.createRevenueKpiPeriod(hr, command(0, { period: '2026-06', policy: RevenueKpiPolicySchema.parse({ allowDemoData: true }) })); june = await S.openRevenueKpiPeriod(hr, june.period, command(june.version));
  let missing = await S.saveRevenueKpiAssignment(hr, command(0, { period: june.period, unitType: 'STORE', storeId: String(f.stores[0]._id), assigneeEmployeeId: String(f.actors.sm.employee._id), targetMode: 'ABSOLUTE_VND', targetVnd: 100, reason: 'Cửa hàng chưa có số liệu nguồn.' }));
  missing = await S.mutateRevenueKpiAssignment(hr, missing.id, 'publish', command(missing.version)); missing = await S.mutateRevenueKpiAssignment(sm, missing.id, 'accept', command(missing.version));
  june = await S.computeRevenueKpiPeriod(hr, june.period, command(june.version)); const r = (await S.revenueKpiAssignmentResult(sm, missing.id)).result;
  assert.equal(r.status, 'PENDING_DATA'); assert.equal(r.actualRevenueVnd, null); assert.equal(r.achievementPercent, null); assert.equal(r.achieved, null);
  await assert.rejects(S.closeRevenueKpiPeriod(hr, june.period, command(june.version)), e => e.code === 'REVENUE_KPI_PERIOD_NOT_READY');
});

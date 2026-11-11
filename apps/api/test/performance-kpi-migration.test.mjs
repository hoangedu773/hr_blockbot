import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { EvaluationModel } from '../dist/models/Evaluation.js';
import { ManagementRelationModel } from '../dist/models/AuthorizationMapping.js';
import { performanceFixture, cmd, ev, manualScores } from './helpers/performance-kpi-fixture.mjs';
import { pendingPerformanceMigrations, migratePerformanceEvaluation } from '../dist/services/performance-kpi-migration.service.js';
import { getPerformanceEvaluation, mutatePerformanceEvaluation } from '../dist/services/performance-kpi-evaluation.service.js';
import { verifyHistory } from '../dist/services/performance-kpi-common.service.js';
import { saveManagerReview } from '../dist/services/kpi.service.js';
import { digest } from '../dist/services/project-audit.service.js';

let fixture, hr, sm, staff, id, original, converted;
before(async () => {
  await connectDB();
  fixture = await performanceFixture();
  hr = await fixture.principal('hr');
  sm = await fixture.principal('sm');
  staff = await fixture.principal('staff');
  const row = await EvaluationModel.create({
    employeeId: fixture.actors.staff.employee._id,
    employeeName: fixture.actors.staff.employee.fullName,
    storeId: fixture.stores[0]._id, departmentId: fixture.departmentId,
    period: '2026-11', status: 'OPEN', version: 4,
    selfReview: 'Tự nhận xét đã được lưu trước chuyển đổi.',
    managerReview: 'Nhận xét quản lý cần được giữ nguyên.',
    managerScore: 74,
    history: [{ at: new Date().toISOString(), by: hr.userId, action: 'MANAGER_REVIEW', reason: 'Nhận xét nguồn.' }],
  });
  id = String(row._id);
  original = await EvaluationModel.collection.findOne({ _id: row._id });
});
after(disconnectDB);

test('HR previews scoped conversion; managers cannot convert and saved reviews survive', async () => {
  const plan = await pendingPerformanceMigrations(hr, '2026-11');
  assert.equal(plan.items.length, 1);
  assert.equal(plan.items[0].canConvert, true);
  assert.equal(plan.items[0].managerScore, 74);
  const input = cmd(4, { policyId: fixture.policies.STAFF.id, reason: 'Chuyển theo yêu cầu thống nhất mẫu.' });
  await assert.rejects(migratePerformanceEvaluation(sm, id, input), error => error.status === 403);
  converted = await migratePerformanceEvaluation(hr, id, input);
  assert.equal(converted.id, id);
  assert.equal(converted.version, 5);
  assert.equal(converted.selfReview, original.selfReview);
  assert.equal(converted.previousReview.managerReview, original.managerReview);
  assert.equal(converted.previousReview.managerScore, 74);
  assert.equal(converted.finalScore, null);
  assert.equal(converted.criteriaScores.length, 0);
  assert.equal(converted.evaluatorEmployeeId, sm.employeeId);
  assert.equal(converted.evaluationStatus, 'SELF_REVIEW');
  verifyHistory(converted);
  const saved = await EvaluationModel.collection.findOne({ _id: new mongoose.Types.ObjectId(id) });
  assert.deepEqual(saved.legacySnapshot, original);
  assert.equal(saved.legacySnapshotHash, digest(original));
  assert.deepEqual(await migratePerformanceEvaluation(hr, id, input), converted);
  await assert.rejects(migratePerformanceEvaluation(hr, id, { ...input, reason: 'Nội dung khác với yêu cầu đã thực thi.' }), error => error.code === 'PERFORMANCE_KPI_VERSION_CONFLICT');
  assert.equal((await pendingPerformanceMigrations(hr, '2026-11')).items.length, 0);
  assert.equal((await getPerformanceEvaluation(staff, id)).previousReview.managerScore, 74);
});

test('same converted record supports rubric scoring and provisional publication without waiting for another self-review', async () => {
  converted = await mutatePerformanceEvaluation(sm, id, 'manager-score', cmd(converted.version, {
    criteriaScores: manualScores('STAFF', 80), reason: 'Chấm từng tiêu chí với bằng chứng.', evidenceRefs: ev,
  }));
  assert.equal(converted.finalScore, 80);
  converted = await mutatePerformanceEvaluation(sm, id, 'finalize', cmd(converted.version, {
    reason: 'Công bố điểm tạm để nhân viên xem xét.', evidenceRefs: ev,
  }));
  assert.equal(converted.evaluationStatus, 'PROVISIONAL');
  assert.equal(converted.previousReview.managerScore, 74);
  verifyHistory(converted);
  await assert.rejects(saveManagerReview(sm, id, { text: 'Thử thay điểm bằng luồng cũ.', managerScore: 100, expectedVersion: converted.version }), error => error.code === 'KPI_USE_EVIDENCE_ASSESSMENT');
});

test('missing reporting relation produces an actionable blocked item and never overwrites the source', async () => {
  const person = fixture.actors.ptch.employee;
  const row = await EvaluationModel.create({ employeeId: person._id, employeeName: person.fullName,
    storeId: fixture.stores[0]._id, period: '2026-11', status: 'OPEN', version: 2 });
  await ManagementRelationModel.deleteMany({ employeeId: person._id });
  const before = await EvaluationModel.collection.findOne({ _id: row._id });
  const item = (await pendingPerformanceMigrations(hr, '2026-11')).items.find(item => item.id === String(row._id));
  assert.equal(item.canConvert, false);
  assert.match(item.blockedReason, /quản lý trực tiếp/);
  await assert.rejects(migratePerformanceEvaluation(hr, item.id, cmd(2, {
    policyId: fixture.policies.PTCH.id, reason: 'Không được suy đoán quan hệ quản lý.',
  })), error => error.code === 'REPORTING_RELATION_REQUIRED');
  assert.deepEqual(await EvaluationModel.collection.findOne({ _id: row._id }), before);
});

test('already published results remain byte-for-byte intact', async () => {
  const person = fixture.actors.staffB.employee;
  const row = await EvaluationModel.create({ employeeId: person._id, employeeName: person.fullName,
    storeId: fixture.stores[1]._id, period: '2026-11', status: 'PUBLISHED', finalScore: 88, version: 2 });
  const before = await EvaluationModel.collection.findOne({ _id: row._id });
  await assert.rejects(migratePerformanceEvaluation(hr, String(row._id), cmd(2, {
    policyId: fixture.policies.STAFF.id, reason: 'Thử chuyển kết quả đã công bố.',
  })), error => error.code === 'PERFORMANCE_KPI_INVALID_STATE' || error.status === 403);
  assert.deepEqual(await EvaluationModel.collection.findOne({ _id: row._id }), before);
});


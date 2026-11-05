import './require-isolated-db.mjs';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'p6b-suitability-test-jwt-secret-min';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { performanceFixture, cmd } from './helpers/performance-kpi-fixture.mjs';
import { beginAuthorizedChat } from '../dist/services/chat-authorization.service.js';
import * as T from '../dist/services/task-instance.service.js';
import { EmployeeModel } from '../dist/models/Employee.js';
import { EvaluationModel } from '../dist/models/Evaluation.js';
import { TaskInstanceModel } from '../dist/models/TaskInstance.js';
import { ProjectModel } from '../dist/models/Project.js';
import { suggestSuitableCandidates } from '../dist/services/task-suitability.service.js';
import { TaskSuitabilitySchema } from '@hr-blockbot/contracts';

let f, app, base, hr, sm, staff, staffB, task;
const serviceKey = 'p6b-suitability-isolated-service-key';

before(async () => {
  await connectDB();
  f = await performanceFixture();
  [hr, sm, staff, staffB] = await Promise.all(['hr', 'sm', 'staff', 'staffB'].map(f.principal));

  process.env.AI_SERVICE_API_KEY = serviceKey;
  app = createServer(createApp());
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${app.address().port}/api`;

  const storeId = String(f.stores[0]._id);

  // Create a linked project with requiredSkills
  const project = await ProjectModel.create({
    title: 'Dự án pha chế ca sáng',
    description: 'Yêu cầu kỹ năng pha chế và kiểm kho',
    storeId: f.stores[0]._id,
    departmentId: f.stores[0].departmentId,
    requiredSkills: ['pha chế', 'kiểm kho'],
    status: 'IN_PROGRESS',
    createdBy: sm.userId,
    version: 1,
  });

  // Create a canonical task with SM linked to project
  task = await T.createTask(sm, cmd(0, {
    templateId: f.template.id,
    storeId,
    projectId: String(project._id),
    title: 'Kiểm kê và pha chế ca sáng',
    description: 'Kiểm kê kho hàng và chuẩn bị quầy pha chế',
    dueAt: '2026-11-20T10:00:00.000Z',
    taskWeightPercent: 20,
  }));

  // Setup test employees in the same store
  // 1. staff: Has 2/2 skills (pha chế, kiểm kho)
  await EmployeeModel.updateOne(
    { _id: staff.employeeId },
    {
      $set: {
        skills: ['pha chế', 'kiểm kho'],
        status: 'active',
        lifecyclePendingRequestId: null,
      },
    }
  );

  // 2. staffB: Has 1/2 skills (pha chế) in same store
  await EmployeeModel.updateOne(
    { _id: staffB.employeeId },
    {
      $set: {
        storeId: f.stores[0]._id,
        skills: ['pha chế'],
        status: 'active',
        lifecyclePendingRequestId: null,
      },
    }
  );
  const lowScoreEmpId = new mongoose.Types.ObjectId();
  await EmployeeModel.create({
    _id: lowScoreEmpId,
    fullName: 'Lê Văn Thấp Điểm',
    job_title: 'Nhân viên pha chế',
    storeId: f.stores[0]._id,
    status: 'active',
    skills: ['pha chế', 'kiểm kho'],
    lifecyclePendingRequestId: null,
    storeMappingRef: 'verified',
  });
  await EvaluationModel.create({
    employeeId: lowScoreEmpId,
    employeeName: 'Lê Văn Thấp Điểm',
    storeId: f.stores[0]._id,
    period: '2026-11',
    frameworkVersion: 2,
    status: 'PUBLISHED',
    finalScore: 25,
    machineScore: 20,
  });

  // 4. Employee with lifecycle pending request
  const lifecycleEmpId = new mongoose.Types.ObjectId();
  await EmployeeModel.create({
    _id: lifecycleEmpId,
    fullName: 'Trần Đang Điều Chuyển',
    job_title: 'Nhân viên',
    storeId: f.stores[0]._id,
    status: 'active',
    skills: ['pha chế', 'kiểm kho'],
    lifecyclePendingRequestId: 'req-lifecycle-pending-001',
    storeMappingRef: 'verified',
  });

  // 5. Employee with 0 matching skills
  const noSkillEmpId = new mongoose.Types.ObjectId();
  await EmployeeModel.create({
    _id: noSkillEmpId,
    fullName: 'Nguyễn Không Kỹ Năng',
    job_title: 'Nhân viên phục vụ',
    storeId: f.stores[0]._id,
    status: 'active',
    skills: ['giao tiếp'],
    lifecyclePendingRequestId: null,
    storeMappingRef: 'verified',
  });
});

after(async () => {
  if (app?.listening) {
    app.closeAllConnections();
    await new Promise((resolve, reject) => app.close((err) => (err ? reject(err) : resolve())));
  }
  await disconnectDB();
});

test('suggestSuitableCandidates: tính tất định - chạy 2 lần cho kết quả deepEqual', async () => {
  const asOf = '2026-11-05T12:00:00.000Z';
  const run1 = await suggestSuitableCandidates(sm, task.id, { asOf });
  const run2 = await suggestSuitableCandidates(sm, task.id, { asOf });

  assert.deepStrictEqual(run1, run2);
  assert.equal(run1.deterministic, true);
  assert.equal(run1.advisory, true);
  assert.equal(run1.taskRef, task.id);
});

test('suggestSuitableCandidates: phân loại strong / possible / not_recommended kèm reasons và sắp xếp đúng thứ tự', async () => {
  const result = await suggestSuitableCandidates(sm, task.id);
  TaskSuitabilitySchema.parse(result);

  const strongList = result.candidates.filter((c) => c.suitability === 'strong');
  const possibleList = result.candidates.filter((c) => c.suitability === 'possible');
  const notRecList = result.candidates.filter((c) => c.suitability === 'not_recommended');

  assert.ok(strongList.length >= 2, 'Cần ít nhất 2 ứng viên strong');
  assert.ok(possibleList.length >= 1, 'Cần ít nhất 1 ứng viên possible');
  assert.ok(notRecList.length >= 2, 'Cần ít nhất 2 ứng viên not_recommended');

  // Verify reasons on strong
  for (const c of strongList) {
    assert.ok(c.reasons.some((r) => r.includes('2/2 kỹ năng khớp')));
    assert.ok(c.reasons.includes('Cùng cửa hàng'));
  }

  // Verify reasons & constraints on possible
  const possibleCandidate = possibleList.find((c) => c.employeeId === String(staffB.employeeId).toLowerCase());
  assert.ok(possibleCandidate, 'staffB phải là possible');
  assert.ok(possibleCandidate.reasons.some((r) => r.includes('1/2 kỹ năng khớp')));
  assert.ok(possibleCandidate.constraints.some((ct) => ct.includes('Thiếu kỹ năng')));

  // Verify ordering: strong (0) -> possible (1) -> not_recommended (2)
  const rankMap = { strong: 0, possible: 1, not_recommended: 2 };
  for (let i = 0; i < result.candidates.length - 1; i++) {
    const cur = result.candidates[i];
    const nxt = result.candidates[i + 1];
    const rankDiff = rankMap[cur.suitability] - rankMap[nxt.suitability];
    assert.ok(rankDiff <= 0, `Thứ tự suitability không hợp lệ tại vị trí ${i}`);
    if (rankDiff === 0) {
      assert.ok(cur.workloadOpen <= nxt.workloadOpen, `Thứ tự workloadOpen không hợp lệ tại vị trí ${i}`);
      if (cur.workloadOpen === nxt.workloadOpen) {
        assert.ok(cur.employeeId.localeCompare(nxt.employeeId) <= 0, `Thứ tự employeeId không hợp lệ tại vị trí ${i}`);
      }
    }
  }
});

test('suggestSuitableCandidates: candidate có evaluation score thấp nhưng kỹ năng khớp KHÔNG bị xếp not_recommended', async () => {
  const result = await suggestSuitableCandidates(sm, task.id);
  const lowScoreCandidate = result.candidates.find((c) => c.name === 'Lê Văn Thấp Điểm');

  assert.ok(lowScoreCandidate, 'Phải tìm thấy Lê Văn Thấp Điểm');
  assert.equal(lowScoreCandidate.suitability, 'strong', 'Kỹ năng khớp đầy đủ phải là strong dù điểm KPI thấp');
  assert.notEqual(lowScoreCandidate.suitability, 'not_recommended');
});

test('suggestSuitableCandidates: candidate có lifecyclePendingRequestId -> xếp not_recommended có constraint', async () => {
  const result = await suggestSuitableCandidates(sm, task.id);
  const lifecycleCandidate = result.candidates.find((c) => c.name === 'Trần Đang Điều Chuyển');

  assert.ok(lifecycleCandidate, 'Phải tìm thấy Trần Đang Điều Chuyển');
  assert.equal(lifecycleCandidate.suitability, 'not_recommended');
  assert.ok(lifecycleCandidate.constraints.some((ct) => ct.includes('lifecycle pending')));
});

test('suggestSuitableCandidates: data minimization - output không chứa employeeCode, salary, phone, leave, kpi score', async () => {
  const result = await suggestSuitableCandidates(sm, task.id);
  const allowedKeys = new Set(['employeeId', 'name', 'jobTitle', 'suitability', 'reasons', 'workloadOpen', 'constraints']);

  for (const candidate of result.candidates) {
    const keys = Object.keys(candidate);
    for (const key of keys) {
      assert.ok(allowedKeys.has(key), `Key ${key} không được phép xuất hiện theo nguyên tắc data minimization`);
    }

    const candidateObj = candidate;
    assert.equal(candidateObj.employeeCode, undefined);
    assert.equal(candidateObj.employee_code, undefined);
    assert.equal(candidateObj.salary, undefined);
    assert.equal(candidateObj.phone, undefined);
    assert.equal(candidateObj.leave_date, undefined);
    assert.equal(candidateObj.leave_reason, undefined);
    assert.equal(candidateObj.kpiScore, undefined);
    assert.equal(candidateObj.finalScore, undefined);
    assert.equal(candidateObj.machineScore, undefined);
  }
});

test('Gateway tool suggest_suitable_candidates: gọi qua POST /internal/authorization/tools', async () => {
  const bound = await beginAuthorizedChat(sm);
  try {
    const response = await fetch(`${base}/internal/authorization/tools`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-ai-service-key': serviceKey,
        Authorization: `Bearer ${bound.delegationToken}`,
      },
      body: JSON.stringify({
        requestId: bound.requestId,
        tool: 'suggest_suitable_candidates',
        args: { taskRef: task.id },
      }),
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.ok(body.result, 'Response phải có body.result');
    assert.equal(body.result.taskRef, task.id);
    assert.equal(body.result.deterministic, true);
    assert.equal(body.result.advisory, true);
    assert.ok(Array.isArray(body.result.candidates));
    assert.ok(body.result.candidates.length > 0);
  } finally {
    await mongoose.connection.collection('chat_authorization_requests').updateOne(
      { _id: bound.requestId },
      { $set: { status: 'CLOSED' } }
    );
  }
});

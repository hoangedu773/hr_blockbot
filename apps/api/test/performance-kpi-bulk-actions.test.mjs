import './require-isolated-db.mjs';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'p5-performance-bulk-test-jwt-secret-min';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { performanceFixture, cmd } from './helpers/performance-kpi-fixture.mjs';
import * as T from '../dist/services/task-instance.service.js';
import { TaskInstanceModel } from '../dist/models/TaskInstance.js';
import { PerformanceKpiPolicyModel } from '../dist/models/PerformanceKpiPolicy.js';

let f, app, base, sm, staff, staffB;

before(async () => {
  await connectDB();
  f = await performanceFixture();
  [sm, staff, staffB] = await Promise.all(['sm', 'staff', 'staffB'].map(f.principal));
  app = createServer(createApp());
  await new Promise((resolve, reject) => {
    app.once('error', reject);
    app.listen(0, '127.0.0.1', resolve);
  });
  base = `http://127.0.0.1:${app.address().port}/api`;
});

after(async () => {
  if (app?.listening) {
    app.closeAllConnections();
    await new Promise((resolve, reject) => app.close(error => error ? reject(error) : resolve()));
  }
  await disconnectDB();
});

async function call(actor, path, body) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(actor ? { Authorization: `Bearer ${f.actors[actor].token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

async function createDraftTask(title, weightPercent = 20) {
  return T.createTask(sm, cmd(0, {
    templateId: f.template.id,
    storeId: String(f.stores[0]._id),
    title,
    description: 'Nhiệm vụ kiểm thử luồng giao việc hàng loạt qua preview proposal.',
    dueAt: '2026-11-25T10:00:00.000Z',
    taskWeightPercent: weightPercent,
    isDemo: true,
  }));
}

test('human preview bulk task.assign accepts explicit assignments list, asserts zero-write, confirm executes each task once and replay is idempotent without version bump', async () => {
  const task1 = await createDraftTask('Nhiệm vụ kiểm kê kho ca 1', 20);
  const task2 = await createDraftTask('Nhiệm vụ kiểm tra tiêu chuẩn quầy ca 1', 25);
  const taskBlocked = await createDraftTask('Nhiệm vụ gán nhân viên ngoài phạm vi', 15);

  const initialT1 = await T.getTask(sm, task1.id);
  const initialT2 = await T.getTask(sm, task2.id);
  const initialTBlocked = await T.getTask(sm, taskBlocked.id);

  assert.equal(initialT1.status, 'DRAFT');
  assert.equal(initialT2.status, 'DRAFT');
  assert.equal(initialTBlocked.status, 'DRAFT');

  const humanReason = 'Phân công nhiệm vụ theo ca trực sáng đã được Store Manager đối chiếu.';

  const previewPayload = {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: task1.id, assigneeEmployeeId: staff.employeeId },
        { taskId: task2.id, assigneeEmployeeId: staff.employeeId },
        { taskId: taskBlocked.id, assigneeEmployeeId: staffB.employeeId },
      ],
      reason: humanReason,
    },
  };

  const previewRes = await call('sm', '/chat/actions/performance/preview', previewPayload);
  assert.equal(previewRes.status, 200, JSON.stringify(previewRes.body));
  const proposal = previewRes.body;

  assert.equal(proposal.type, 'performance_kpi.task_action');
  assert.equal(proposal.preview.kind, 'task.assign');
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(proposal.executed, false);

  const willCreateTasks = proposal.preview.willCreate.map(item => item.taskId);
  assert.ok(willCreateTasks.includes(task1.id), 'willCreate must include task1');
  assert.ok(willCreateTasks.includes(task2.id), 'willCreate must include task2');

  const blockedItems = proposal.preview.blocked;
  assert.ok(blockedItems.length >= 1, 'blocked list must have at least one out-of-scope assignee');
  const blockedTask = blockedItems.find(item => item.taskId === taskBlocked.id || item.employeeId === staffB.employeeId);
  assert.ok(blockedTask, 'staffB / taskBlocked must be in blocked list');

  const afterPreviewT1 = await T.getTask(sm, task1.id);
  const afterPreviewT2 = await T.getTask(sm, task2.id);
  const afterPreviewTBlocked = await T.getTask(sm, taskBlocked.id);

  assert.equal(afterPreviewT1.version, initialT1.version, 'Preview must not bump task1 version');
  assert.equal(afterPreviewT1.status, 'DRAFT', 'Preview must not change task1 status');
  assert.equal(afterPreviewT1.assigneeEmployeeId, null, 'Preview must not write assignee to task1');
  assert.equal(afterPreviewT1.responsibilitySegments.length, 0, 'Preview must not create segments');

  assert.equal(afterPreviewT2.version, initialT2.version, 'Preview must not bump task2 version');
  assert.equal(afterPreviewT2.status, 'DRAFT', 'Preview must not change task2 status');
  assert.equal(afterPreviewT2.assigneeEmployeeId, null, 'Preview must not write assignee to task2');
  assert.equal(afterPreviewT2.responsibilitySegments.length, 0, 'Preview must not create segments');

  assert.equal(afterPreviewTBlocked.version, initialTBlocked.version, 'Preview must not bump taskBlocked version');
  assert.equal(afterPreviewTBlocked.status, 'DRAFT');
  assert.equal(afterPreviewTBlocked.assigneeEmployeeId, null);

  const decisionPayload = {
    approve: true,
    clientRequestId: randomUUID(),
    expectedVersion: proposal.preview.expectedVersion,
    planDigest: proposal.preview.planDigest,
  };

  const confirmRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
  assert.equal(confirmRes.status, 200, JSON.stringify(confirmRes.body));
  assert.equal(confirmRes.body.status, 'EXECUTED');
  assert.equal(confirmRes.body.executed, true);

  const executedT1 = await T.getTask(sm, task1.id);
  const executedT2 = await T.getTask(sm, task2.id);
  const executedTBlocked = await T.getTask(sm, taskBlocked.id);

  assert.equal(executedT1.status, 'ASSIGNED', 'task1 must be transitioned to ASSIGNED');
  assert.equal(executedT1.assigneeEmployeeId, staff.employeeId, 'task1 assignee must be set to staff');
  assert.equal(executedT1.version, initialT1.version + 1, 'task1 version must increment exactly by 1');

  assert.equal(executedT2.status, 'ASSIGNED', 'task2 must be transitioned to ASSIGNED');
  assert.equal(executedT2.assigneeEmployeeId, staff.employeeId, 'task2 assignee must be set to staff');
  assert.equal(executedT2.version, initialT2.version + 1, 'task2 version must increment exactly by 1');

  assert.equal(executedTBlocked.status, 'DRAFT', 'Blocked task must remain in DRAFT status');
  assert.equal(executedTBlocked.assigneeEmployeeId, null, 'Blocked task must not have an assignee');

  const replayRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
  assert.equal(replayRes.status, 200, JSON.stringify(replayRes.body));
  assert.equal(replayRes.body.status, 'EXECUTED');

  const replayT1 = await T.getTask(sm, task1.id);
  const replayT2 = await T.getTask(sm, task2.id);

  assert.equal(replayT1.version, executedT1.version, 'Replay must not bump task1 version');
  assert.equal(replayT2.version, executedT2.version, 'Replay must not bump task2 version');
  assert.equal(replayT1.status, 'ASSIGNED');
  assert.equal(replayT2.status, 'ASSIGNED');

  const assignEventsT1 = replayT1.history.filter(h => h.action === 'TASK_ASSIGN');
  const assignEventsT2 = replayT2.history.filter(h => h.action === 'TASK_ASSIGN');
  assert.equal(assignEventsT1.length, 1, 'task1 must have exactly 1 TASK_ASSIGN history entry');
  assert.equal(assignEventsT2.length, 1, 'task2 must have exactly 1 TASK_ASSIGN history entry');
});

test('injected failure after first task assign write persists single write, retry with same decision recovers and executes remaining task, replay is idempotent, and actor permissions are enforced', async () => {
  const taskA = await createDraftTask('Nhiệm vụ lỗi một phần A', 20);
  const taskB = await createDraftTask('Nhiệm vụ lỗi một phần B', 25);

  const initialA = await T.getTask(sm, taskA.id);
  const initialB = await T.getTask(sm, taskB.id);
  assert.equal(initialA.status, 'DRAFT');
  assert.equal(initialB.status, 'DRAFT');

  // Permission test 1: unauthenticated preview rejected with 401
  const unauthPreview = await call(null, '/chat/actions/performance/preview', {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: taskA.id, assigneeEmployeeId: staff.employeeId },
      ],
      reason: 'Kiểm thử không có token.',
    },
  });
  assert.equal(unauthPreview.status, 401);

  // Permission test 2: staff preview returns 200 with blocked list (no willCreate) or 403
  const staffPreview = await call('staff', '/chat/actions/performance/preview', {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: taskA.id, assigneeEmployeeId: staff.employeeId },
      ],
      reason: 'Staff không có quyền giao việc.',
    },
  });
  if (staffPreview.status === 200) {
    assert.equal(staffPreview.body.preview.willCreate.length, 0, 'Staff preview must not have willCreate items');
    assert.ok(staffPreview.body.preview.blocked.length > 0, 'Staff preview must report blocked items');
  } else {
    assert.equal(staffPreview.status, 403);
  }
  const staffCheckA = await T.getTask(sm, taskA.id);
  assert.equal(staffCheckA.status, 'DRAFT', 'Staff preview must assert zero-write');
  assert.equal(staffCheckA.version, initialA.version);
  // SM creates preview for both tasks
  const previewPayload = {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: taskA.id, assigneeEmployeeId: staff.employeeId },
        { taskId: taskB.id, assigneeEmployeeId: staff.employeeId },
      ],
      reason: 'Phân công ca sáng có kiểm thử failure injection.',
    },
  };

  const previewRes = await call('sm', '/chat/actions/performance/preview', previewPayload);
  assert.equal(previewRes.status, 200, JSON.stringify(previewRes.body));
  const proposal = previewRes.body;
  assert.equal(proposal.type, 'performance_kpi.task_action');
  assert.equal(proposal.preview.willCreate.length, 2);

  const decisionPayload = {
    approve: true,
    clientRequestId: randomUUID(),
    expectedVersion: proposal.preview.expectedVersion,
    planDigest: proposal.preview.planDigest,
  };

  // Permission test 3: other actor (staff) gets 404 accessing or deciding SM proposal
  const otherActorGet = await call('staff', `/chat/actions/${proposal.actionId}`);
  assert.equal(otherActorGet.status, 404);
  const otherActorDecision = await call('staff', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
  assert.equal(otherActorDecision.status, 404);

  // Inject failure after the first task is written
  const originalFindOneAndUpdate = TaskInstanceModel.findOneAndUpdate;
  let updateCalls = 0;
  TaskInstanceModel.findOneAndUpdate = function (...args) {
    updateCalls++;
    if (updateCalls === 2) {
      throw new Error('injected storage failure on second task assign write');
    }
    return originalFindOneAndUpdate.apply(this, args);
  };

  let firstAttemptStatus;
  try {
    const confirmRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
    firstAttemptStatus = confirmRes.status;
  } finally {
    TaskInstanceModel.findOneAndUpdate = originalFindOneAndUpdate;
  }

  // The call failed (500 internal error due to injected error)
  assert.equal(firstAttemptStatus, 500);

  // Confirm single write: taskA was assigned and persisted; taskB remains untouched
  const midA = await T.getTask(sm, taskA.id);
  const midB = await T.getTask(sm, taskB.id);

  assert.equal(midA.status, 'ASSIGNED', 'First task must have been written and assigned');
  assert.equal(midA.assigneeEmployeeId, staff.employeeId);
  assert.equal(midA.version, initialA.version + 1, 'First task version incremented by exactly 1');

  assert.equal(midB.status, 'DRAFT', 'Second task must not have been modified');
  assert.equal(midB.assigneeEmployeeId, null);
  assert.equal(midB.version, initialB.version, 'Second task version unchanged');

  // Retry with the SAME decision continues the remaining task (taskB); action's own prior write is not external drift
  const retryRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
  assert.equal(retryRes.status, 200, JSON.stringify(retryRes.body));
  assert.equal(retryRes.body.status, 'EXECUTED');

  // Assert both tasks are now ASSIGNED with exactly one version increment each
  const finalA = await T.getTask(sm, taskA.id);
  const finalB = await T.getTask(sm, taskB.id);
  assert.equal(finalA.status, 'ASSIGNED');
  assert.equal(finalA.assigneeEmployeeId, staff.employeeId);
  assert.equal(finalA.version, initialA.version + 1, 'taskA must not be bumped a second time');

  assert.equal(finalB.status, 'ASSIGNED');
  assert.equal(finalB.assigneeEmployeeId, staff.employeeId);
  assert.equal(finalB.version, initialB.version + 1, 'taskB must be assigned on retry');

  // Replay of decision is idempotent: status EXECUTED, no version bumps, exactly 1 TASK_ASSIGN in history
  const replayRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
  assert.equal(replayRes.status, 200, JSON.stringify(replayRes.body));
  assert.equal(replayRes.body.status, 'EXECUTED');

  const replayA = await T.getTask(sm, taskA.id);
  const replayB = await T.getTask(sm, taskB.id);
  assert.equal(replayA.version, finalA.version, 'Replay must not bump taskA version');
  assert.equal(replayB.version, finalB.version, 'Replay must not bump taskB version');

  const assignHistoryA = replayA.history.filter(h => h.action === 'TASK_ASSIGN');
  const assignHistoryB = replayB.history.filter(h => h.action === 'TASK_ASSIGN');
  assert.equal(assignHistoryA.length, 1, 'taskA must have exactly 1 TASK_ASSIGN history entry');
  assert.equal(assignHistoryB.length, 1, 'taskB must have exactly 1 TASK_ASSIGN history entry');
});

test('injected partial failure followed by external mutation on remaining task fails closed with 409 on retry without changing goal', async () => {
  const taskA = await createDraftTask('Nhiệm vụ lỗi phần đầu A', 20);
  const taskB = await createDraftTask('Nhiệm vụ lỗi phần đầu B', 25);

  const initialA = await T.getTask(sm, taskA.id);
  const initialB = await T.getTask(sm, taskB.id);

  const previewRes = await call('sm', '/chat/actions/performance/preview', {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: taskA.id, assigneeEmployeeId: staff.employeeId },
        { taskId: taskB.id, assigneeEmployeeId: staff.employeeId },
      ],
      reason: 'Phân công ca sáng để kiểm tra external drift sau partial failure.',
    },
  });
  assert.equal(previewRes.status, 200, JSON.stringify(previewRes.body));
  const proposal = previewRes.body;

  const decisionPayload = {
    approve: true,
    clientRequestId: randomUUID(),
    expectedVersion: proposal.preview.expectedVersion,
    planDigest: proposal.preview.planDigest,
  };

  // Inject failure after first task write
  const originalFindOneAndUpdate = TaskInstanceModel.findOneAndUpdate;
  let updateCalls = 0;
  TaskInstanceModel.findOneAndUpdate = function (...args) {
    updateCalls++;
    if (updateCalls === 2) {
      throw new Error('injected failure after first task assign write');
    }
    return originalFindOneAndUpdate.apply(this, args);
  };

  try {
    const confirmRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
    assert.equal(confirmRes.status, 500);
  } finally {
    TaskInstanceModel.findOneAndUpdate = originalFindOneAndUpdate;
  }

  // Verify taskA was written, taskB was not
  const midA = await T.getTask(sm, taskA.id);
  const midB = await T.getTask(sm, taskB.id);
  assert.equal(midA.status, 'ASSIGNED');
  assert.equal(midA.version, initialA.version + 1);
  assert.equal(midB.status, 'DRAFT');
  assert.equal(midB.version, initialB.version);

  // Now EXTERNAL mutation occurs on taskB outside this chat action
  await T.mutateTask(sm, taskB.id, 'cancel', cmd(taskB.version, {
    cause: 'MANAGER_EXTERNAL',
    reason: 'Đóng cửa hàng đột xuất ngoài luồng chat tạo external drift.',
    evidenceRefs: ['Đối chiếu dữ liệu giả lập, không phải bằng chứng HR thật.'],
  }));

  // Retry with original decision fails closed with 409 because taskB drifted externally
  const retryRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
  assert.equal(retryRes.status, 409, JSON.stringify(retryRes.body));
  assert.equal(retryRes.body.error.code, 'PERFORMANCE_KPI_PLAN_CHANGED');
  assert.ok(retryRes.body.preview, '409 response must carry rebuilt preview');
  const postDriftRetryB = await T.getTask(sm, taskB.id);
  assert.equal(postDriftRetryB.status, 'CANCELLED');
  assert.equal(postDriftRetryB.assigneeEmployeeId, null, 'Task B must not receive assignee on 409 retry');
});

test('regression: stale task version before confirm returns 409 with zero writes and requires client to create fresh proposal without mutating old proposal', async () => {
  const task1 = await createDraftTask('Nhiệm vụ kiểm tra stale 1', 20);
  const task2 = await createDraftTask('Nhiệm vụ kiểm tra stale 2', 25);

  const initialT1 = await T.getTask(sm, task1.id);
  const initialT2 = await T.getTask(sm, task2.id);

  // 1. Generate preview for both tasks
  const previewPayload = {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: task1.id, assigneeEmployeeId: staff.employeeId },
        { taskId: task2.id, assigneeEmployeeId: staff.employeeId },
      ],
      reason: 'Phân công ca trước khi phát sinh drift bên ngoài.',
    },
  };

  const previewRes = await call('sm', '/chat/actions/performance/preview', previewPayload);
  assert.equal(previewRes.status, 200, JSON.stringify(previewRes.body));
  const proposal = previewRes.body;
  const originalActionId = proposal.actionId;
  const originalPlanDigest = proposal.preview.planDigest;

  // 2. Introduce world drift before confirmation: task1 is assigned outside chat proposal
  const externallyBumped = await T.mutateTask(sm, task1.id, 'assign', cmd(task1.version, {
    assigneeEmployeeId: staff.employeeId,
    reason: 'Giao trực tiếp ngoài luồng chat để tạo world drift.',
  }));
  assert.equal(externallyBumped.version, initialT1.version + 1);
  assert.equal(externallyBumped.status, 'ASSIGNED');

  // 3. Attempt to confirm old proposal using old decision payload
  const decisionPayload = {
    approve: true,
    clientRequestId: randomUUID(),
    expectedVersion: proposal.preview.expectedVersion,
    planDigest: originalPlanDigest,
  };

  const confirmRes = await call('sm', `/chat/actions/${originalActionId}/decision`, decisionPayload);
  assert.equal(confirmRes.status, 409, JSON.stringify(confirmRes.body));
  assert.equal(confirmRes.body.error.code, 'PERFORMANCE_KPI_PLAN_CHANGED');
  assert.ok(confirmRes.body.preview, '409 response must carry rebuilt preview');

  // 4. Assert ZERO WRITES occurred on unassigned task2
  const afterConflictT2 = await T.getTask(sm, task2.id);
  assert.equal(afterConflictT2.status, 'DRAFT', 'task2 must remain in DRAFT status after 409');
  assert.equal(afterConflictT2.assigneeEmployeeId, null, 'task2 must not receive an assignee');
  assert.equal(afterConflictT2.version, initialT2.version, 'task2 version must not increment');

  // 5. Old proposal is not automatically mutated to succeed: retrying it with old or stale parameters still fails
  const repeatStaleRes = await call('sm', `/chat/actions/${originalActionId}/decision`, decisionPayload);
  assert.equal(repeatStaleRes.status, 409);

  // 6. Client must create a brand new proposal from updated input (only task2)
  const updatedPreviewPayload = {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: task2.id, assigneeEmployeeId: staff.employeeId },
      ],
      reason: 'Phân công lại chỉ nhiệm vụ chưa hoàn tất từ input mới.',
    },
  };

  const newPreviewRes = await call('sm', '/chat/actions/performance/preview', updatedPreviewPayload);
  assert.equal(newPreviewRes.status, 200, JSON.stringify(newPreviewRes.body));
  const newProposal = newPreviewRes.body;
  assert.notEqual(newProposal.actionId, originalActionId, 'Fresh proposal must have a distinct actionId');

  const newDecisionPayload = {
    approve: true,
    clientRequestId: randomUUID(),
    expectedVersion: newProposal.preview.expectedVersion,
    planDigest: newProposal.preview.planDigest,
  };

  const newConfirmRes = await call('sm', `/chat/actions/${newProposal.actionId}/decision`, newDecisionPayload);
  assert.equal(newConfirmRes.status, 200, JSON.stringify(newConfirmRes.body));
  assert.equal(newConfirmRes.body.status, 'EXECUTED');

  const executedT2 = await T.getTask(sm, task2.id);
  assert.equal(executedT2.status, 'ASSIGNED');
  assert.equal(executedT2.assigneeEmployeeId, staff.employeeId);
  assert.equal(executedT2.version, initialT2.version + 1);
});

test('injected partial failure followed by policy drift / adversarial state change fails closed with 409 on retry without duplicate writes or mutating remaining task', async () => {
  const taskA = await createDraftTask('Nhiệm vụ kiểm tra policy drift A', 20);
  const taskB = await createDraftTask('Nhiệm vụ kiểm tra policy drift B', 25);

  const initialA = await T.getTask(sm, taskA.id);
  const initialB = await T.getTask(sm, taskB.id);

  const previewRes = await call('sm', '/chat/actions/performance/preview', {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: taskA.id, assigneeEmployeeId: staff.employeeId },
        { taskId: taskB.id, assigneeEmployeeId: staff.employeeId },
      ],
      reason: 'Phân công ca kiểm tra policy drift sau partial failure.',
    },
  });
  assert.equal(previewRes.status, 200, JSON.stringify(previewRes.body));
  const proposal = previewRes.body;

  const decisionPayload = {
    approve: true,
    clientRequestId: randomUUID(),
    expectedVersion: proposal.preview.expectedVersion,
    planDigest: proposal.preview.planDigest,
  };

  // 1. Inject failure after first task write (taskA written, taskB fails)
  const originalFindOneAndUpdate = TaskInstanceModel.findOneAndUpdate;
  let updateCalls = 0;
  TaskInstanceModel.findOneAndUpdate = function (...args) {
    updateCalls++;
    if (updateCalls === 2) {
      throw new Error('injected failure after first task assign write');
    }
    return originalFindOneAndUpdate.apply(this, args);
  };

  try {
    const confirmRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
    assert.equal(confirmRes.status, 500);
  } finally {
    TaskInstanceModel.findOneAndUpdate = originalFindOneAndUpdate;
  }

  // Verify taskA was written, taskB was not
  const midA = await T.getTask(sm, taskA.id);
  const midB = await T.getTask(sm, taskB.id);
  assert.equal(midA.status, 'ASSIGNED');
  assert.equal(midA.version, initialA.version + 1);
  assert.equal(midB.status, 'DRAFT');
  assert.equal(midB.version, initialB.version);

  // Simulate an external policy close in the test-owned database after partial execution.
  // Production closes policies only after period end; CLOSED is a valid stored state.
  const policyDoc = await PerformanceKpiPolicyModel.findOne({ period: '2026-11', role: 'STAFF' });
  assert.ok(policyDoc, 'STAFF policy must exist');
  const originalPolicyStatus = policyDoc.status;
  const originalPolicyVersion = policyDoc.version;
  const originalWindow = policyDoc.policy.acceptanceWindowWorkingDays;

  await PerformanceKpiPolicyModel.updateOne(
    { _id: policyDoc._id },
    {
      $set: {
        status: 'CLOSED',
        version: originalPolicyVersion + 1,
        'policy.acceptanceWindowWorkingDays': originalWindow + 3,
      },
    }
  );

  try {
    // 3. Retry with original decision fails closed with 409 PLAN_CHANGED
    const retryRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
    assert.equal(retryRes.status, 409, JSON.stringify(retryRes.body));
    assert.equal(retryRes.body.error.code, 'PERFORMANCE_KPI_PLAN_CHANGED');
    assert.ok(retryRes.body.preview, '409 response must carry rebuilt preview');

    // Task B remains DRAFT with original version
    const postDriftB = await T.getTask(sm, taskB.id);
    assert.equal(postDriftB.status, 'DRAFT', 'taskB must remain in DRAFT status after 409');
    assert.equal(postDriftB.version, initialB.version, 'taskB version must not be bumped');
    assert.equal(postDriftB.assigneeEmployeeId, null, 'taskB must not receive assignee');

    // Task A remains assigned with no duplicate writes
    const postDriftA = await T.getTask(sm, taskA.id);
    assert.equal(postDriftA.status, 'ASSIGNED');
    assert.equal(postDriftA.version, initialA.version + 1, 'taskA must not be bumped a second time');
    const assignHistoryA = postDriftA.history.filter(h => h.action === 'TASK_ASSIGN');
    assert.equal(assignHistoryA.length, 1, 'taskA must have exactly 1 TASK_ASSIGN history entry');
  } finally {
    // Restore policy fixture
    await PerformanceKpiPolicyModel.updateOne(
      { _id: policyDoc._id },
      {
        $set: {
          status: originalPolicyStatus,
          version: originalPolicyVersion,
          'policy.acceptanceWindowWorkingDays': originalWindow,
        },
      }
    );
  }
});

test('infrastructure failure during policy lookup before retry fails safely with 500 without false 409 drift or writes to remaining task', async () => {
  const task1 = await createDraftTask('Nhiệm vụ kiểm tra infra failure 1', 20);
  const task2 = await createDraftTask('Nhiệm vụ kiểm tra infra failure 2', 25);

  const initial1 = await T.getTask(sm, task1.id);
  const initial2 = await T.getTask(sm, task2.id);

  const previewRes = await call('sm', '/chat/actions/performance/preview', {
    domain: 'task',
    kind: 'task.assign',
    target: {},
    content: {
      assignments: [
        { taskId: task1.id, assigneeEmployeeId: staff.employeeId },
        { taskId: task2.id, assigneeEmployeeId: staff.employeeId },
      ],
      reason: 'Phân công ca kiểm tra infra lookup failure.',
    },
  });
  assert.equal(previewRes.status, 200, JSON.stringify(previewRes.body));
  const proposal = previewRes.body;

  const decisionPayload = {
    approve: true,
    clientRequestId: randomUUID(),
    expectedVersion: proposal.preview.expectedVersion,
    planDigest: proposal.preview.planDigest,
  };

  // 1. Inject failure after first task write
  const originalFindOneAndUpdate = TaskInstanceModel.findOneAndUpdate;
  let updateCalls = 0;
  TaskInstanceModel.findOneAndUpdate = function (...args) {
    updateCalls++;
    if (updateCalls === 2) {
      throw new Error('injected failure after first task assign write');
    }
    return originalFindOneAndUpdate.apply(this, args);
  };

  try {
    const confirmRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
    assert.equal(confirmRes.status, 500);
  } finally {
    TaskInstanceModel.findOneAndUpdate = originalFindOneAndUpdate;
  }

  // Verify task1 assigned, task2 draft
  const mid1 = await T.getTask(sm, task1.id);
  const mid2 = await T.getTask(sm, task2.id);
  assert.equal(mid1.status, 'ASSIGNED');
  assert.equal(mid1.version, initial1.version + 1);
  assert.equal(mid2.status, 'DRAFT');
  assert.equal(mid2.version, initial2.version);

  // 2. Inject policy lookup infra failure before retry
  const originalFindOne = PerformanceKpiPolicyModel.findOne;
  PerformanceKpiPolicyModel.findOne = function (...args) {
    const query = args[0] || {};
    if (query.period && query.role) {
      throw new Error('Simulated database connection failure during policy lookup');
    }
    return originalFindOne.apply(this, args);
  };

  try {
    const retryRes = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decisionPayload);
    assert.equal(retryRes.status, 500, 'Infrastructure failure must yield 500 safe status');
    assert.notEqual(retryRes.status, 409, 'Infrastructure failure must not be falsely treated as 409 drift');
  } finally {
    PerformanceKpiPolicyModel.findOne = originalFindOne;
  }

  // Verify task2 was NOT written
  const afterFail2 = await T.getTask(sm, task2.id);
  assert.equal(afterFail2.status, 'DRAFT', 'task2 must remain in DRAFT status after infra failure');
  assert.equal(afterFail2.version, initial2.version, 'task2 version must remain unchanged');
  assert.equal(afterFail2.assigneeEmployeeId, null, 'task2 must have no assignee');

  // Verify task1 was not duplicated
  const afterFail1 = await T.getTask(sm, task1.id);
  assert.equal(afterFail1.status, 'ASSIGNED');
  assert.equal(afterFail1.version, initial1.version + 1);
  const assignHistory1 = afterFail1.history.filter(h => h.action === 'TASK_ASSIGN');
  assert.equal(assignHistory1.length, 1, 'task1 must have exactly 1 TASK_ASSIGN history entry');
});

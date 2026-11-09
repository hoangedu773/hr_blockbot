import './require-isolated-db.mjs';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'p5-performance-chat-route-test-jwt-secret-min';
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import mongoose from 'mongoose';
import { createApp } from '../dist/app.js';
import { connectDB, disconnectDB } from '../dist/db.js';
import { performanceFixture, cmd, ev, manualScores } from './helpers/performance-kpi-fixture.mjs';
import { beginAuthorizedChat } from '../dist/services/chat-authorization.service.js';
import * as E from '../dist/services/performance-kpi-evaluation.service.js';
import * as T from '../dist/services/task-instance.service.js';
import { EvaluationModel } from '../dist/models/Evaluation.js';
import { TaskInstanceModel } from '../dist/models/TaskInstance.js';

let f, app, base, hr, sm, staff, opened;
const serviceKey = 'p5-performance-chat-route-isolated-service-key';
const actions = () => mongoose.connection.collection('revenue_kpi_open_actions');
const countTasks = () => TaskInstanceModel.countDocuments({});
const countEvaluations = () => EvaluationModel.countDocuments({ period: '2026-11', frameworkVersion: { $gte: 2 } });

before(async () => {
  await connectDB();
  f = await performanceFixture();
  [hr, sm, staff] = await Promise.all(['hr', 'sm', 'staff'].map(f.principal));
  opened = await E.openPerformancePeriod(hr, '2026-11', cmd(f.policies.STAFF.version, {
    policyId: f.policies.STAFF.id, employeeIds: [staff.employeeId], reason: 'Mở kỳ đánh giá cho kiểm thử route hiệu suất.',
  }));
  process.env.AI_SERVICE_API_KEY = serviceKey;
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

async function call(actor, path, body, headers = {}) {
  const response = await fetch(base + path, {
    method: body === undefined ? 'GET' : 'POST',
    headers: {
      ...(actor ? { Authorization: `Bearer ${f.actors[actor].token}` } : {}),
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...headers,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  return { status: response.status, body: response.status === 204 ? null : await response.json() };
}

async function gatewayPreview(actor, domain, kind, target, content = {}) {
  const bound = await beginAuthorizedChat(await f.principal(actor));
  try {
    const response = await call(null, '/internal/authorization/tools', {
      requestId: bound.requestId,
      tool: 'preview_performance_kpi_action',
      args: { domain, kind, target, content },
    }, {
      'x-ai-service-key': process.env.AI_SERVICE_API_KEY,
      Authorization: `Bearer ${bound.delegationToken}`,
    });
    return response;
  } finally {
    await mongoose.connection.collection('chat_authorization_requests').updateOne(
      { _id: bound.requestId }, { $set: { status: 'CLOSED' } },
    );
  }
}

const decisionFor = action => ({
  approve: true,
  clientRequestId: randomUUID(),
  expectedVersion: action.preview.expectedVersion,
  planDigest: action.preview.planDigest,
});

async function confirmProposal(actor, actionId) {
  const fetched = await call(actor, `/chat/actions/${actionId}`);
  assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
  assert.equal(fetched.body.actionId, actionId);
  assert.equal(fetched.body.status, 'PENDING');
  const decision = decisionFor(fetched.body);
  const confirmed = await call(actor, `/chat/actions/${actionId}/decision`, decision);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.status, 'EXECUTED');
  const replay = await call(actor, `/chat/actions/${actionId}/decision`, decision);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.status, 'EXECUTED');
  assert.deepEqual(replay.body.result, confirmed.body.result);
  return confirmed.body;
}

async function newTask() {
  return T.createTask(sm, cmd(0, {
    templateId: f.template.id,
    storeId: String(f.stores[0]._id),
    title: 'Nhiệm vụ luồng HTTP KPI hiệu suất',
    description: 'Dữ liệu giả lập để xác minh proposal qua gateway.',
    dueAt: '2026-11-25T10:00:00.000Z',
    taskWeightPercent: 30,
    isDemo: true,
  }));
}

test('gateway delegation previews task.assign/accept/submit without entity writes until user confirms; HTTP GET, decision, and replay execute once', async () => {
  const task = await newTask();
  assert.equal(await countTasks(), 1);

  const assignResponse = await gatewayPreview('sm', 'task', 'task.assign', { taskId: task.id }, {
    assigneeEmployeeId: staff.employeeId,
    reason: 'Giao nhiệm vụ theo phạm vi quản lý đã xác minh.',
  });
  assert.equal(assignResponse.status, 200, JSON.stringify(assignResponse.body));
  const assign = assignResponse.body.result;
  assert.equal(assign.type, 'performance_kpi.task_action');
  assert.equal(assign.preview.kind, 'task.assign');
  assert.equal(assign.executed, false);
  assert.equal((await T.getTask(sm, task.id)).status, 'DRAFT');
  assert.equal(await countTasks(), 1);
  const assigned = await confirmProposal('sm', assign.actionId);
  assert.equal(assigned.result.tasks[0].status, 'ASSIGNED');
  let current = await T.getTask(staff, task.id);
  assert.equal(current.status, 'ASSIGNED');

  const acceptResponse = await gatewayPreview('staff', 'task', 'task.accept', { taskId: task.id });
  assert.equal(acceptResponse.status, 200, JSON.stringify(acceptResponse.body));
  const accept = acceptResponse.body.result;
  assert.equal(accept.type, 'performance_kpi.task_action');
  assert.equal(accept.preview.kind, 'task.accept');
  assert.equal((await T.getTask(staff, task.id)).status, 'ASSIGNED');
  assert.equal(await countTasks(), 1);
  const accepted = await confirmProposal('staff', accept.actionId);
  assert.equal(accepted.result.tasks[0].status, 'ACCEPTED');

  current = await T.getTask(staff, task.id);
  await T.mutateTask(staff, task.id, 'progress', cmd(current.version, {
    completedStepCodes: ['count', 'report'], evidenceRefs: ev,
  }));
  const beforeSubmit = await T.getTask(staff, task.id);
  const submitResponse = await gatewayPreview('staff', 'task', 'task.submit', { taskId: task.id }, {
    reason: 'Nộp nhiệm vụ cùng bằng chứng kiểm thử.', evidenceRefs: ev,
  });
  assert.equal(submitResponse.status, 200, JSON.stringify(submitResponse.body));
  const submit = submitResponse.body.result;
  assert.equal(submit.type, 'performance_kpi.task_action');
  assert.equal(submit.preview.kind, 'task.submit');
  assert.equal((await T.getTask(staff, task.id)).version, beforeSubmit.version);
  assert.equal((await T.getTask(staff, task.id)).status, beforeSubmit.status);
  assert.equal(await countTasks(), 1);
  const submitted = await confirmProposal('staff', submit.actionId);
  assert.equal(submitted.result.tasks[0].status, 'PENDING_REVIEW');
  assert.equal((await T.getTask(sm, task.id)).status, 'PENDING_REVIEW');
});

test('human-authenticated performance preview accepts user-entered scores only; preview is read-only and confirmation/replay persist exactly those scores', async () => {
  const evaluation = opened.evaluations[0];
  await E.mutatePerformanceEvaluation(staff, evaluation.id, 'self-review', cmd(evaluation.version, {
    text: 'Đã xem lại nhiệm vụ và dữ liệu đánh giá trong kỳ.', evidenceRefs: ev,
  }));
  const before = await E.getPerformanceEvaluation(sm, evaluation.id);
  const scores = manualScores('STAFF', 73);
  const payload = {
    domain: 'evaluation',
    kind: 'evaluation.score',
    target: { evaluationId: evaluation.id },
    content: { criteriaScores: scores, reason: 'Quản lý chấm theo bằng chứng đã đối chiếu.', evidenceRefs: ev },
  };
  const noAuth = await call(null, '/chat/actions/performance/preview', payload);
  assert.ok([401, 403].includes(noAuth.status), `Unauthenticated preview unexpectedly returned ${noAuth.status}`);

  const previewResponse = await call('sm', '/chat/actions/performance/preview', payload);
  assert.equal(previewResponse.status, 200, JSON.stringify(previewResponse.body));
  const proposal = previewResponse.body;
  assert.equal(proposal.type, 'performance_kpi.evaluation_action');
  assert.equal(proposal.preview.kind, 'evaluation.score');
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(proposal.executed, false);
  assert.deepEqual(proposal.preview.criteriaScores.filter(item => !['tasks', 'revenue'].includes(item.code)).map(item => item.projectedScore), scores.map(item => item.score));
  const unchanged = await E.getPerformanceEvaluation(sm, evaluation.id);
  assert.equal(unchanged.version, before.version);
  assert.equal(unchanged.evaluationStatus, before.evaluationStatus);
  assert.deepEqual(unchanged.criteriaScores, before.criteriaScores);
  assert.equal(await countEvaluations(), 1);

  const fetched = await call('sm', `/chat/actions/${proposal.actionId}`);
  assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
  assert.equal(fetched.body.status, 'PENDING');
  assert.deepEqual(fetched.body.args.kind, 'evaluation.score');
  assert.equal('criteriaScores' in fetched.body.args, false);
  const decision = decisionFor(fetched.body);
  const confirmed = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decision);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.status, 'EXECUTED');
  assert.deepEqual(confirmed.body.result.evaluation.criteriaScores.filter(item => !['tasks', 'revenue'].includes(item.code)).map(item => item.score), scores.map(item => item.score));
  const replay = await call('sm', `/chat/actions/${proposal.actionId}/decision`, decision);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.status, 'EXECUTED');
  assert.equal(replay.body.result.evaluation.version, confirmed.body.result.evaluation.version);
  const stored = await E.getPerformanceEvaluation(sm, evaluation.id);
  assert.deepEqual(stored.criteriaScores.filter(item => !['tasks', 'revenue'].includes(item.code)).map(item => item.score), scores.map(item => item.score));
});

test('delegated gateway rejects criteriaScores from model for task.evaluate and evaluation.score', async () => {
  const task = await newTask();
  const evaluation = opened.evaluations[0];
  const beforeEvaluation = await E.getPerformanceEvaluation(sm, evaluation.id);
  const scores = manualScores('STAFF', 80);

  const taskEvalRes = await gatewayPreview('sm', 'task', 'task.evaluate', { taskId: task.id }, {
    criteriaScores: scores,
    reason: 'Model tự ý gửi điểm tiêu chí nhiệm vụ.',
    evidenceRefs: ev,
  });
  assert.ok([400, 403].includes(taskEvalRes.status), `Expected 400/403 for task.evaluate with criteriaScores, got ${taskEvalRes.status}`);

  const evalScoreRes = await gatewayPreview('sm', 'evaluation', 'evaluation.score', { evaluationId: evaluation.id }, {
    criteriaScores: scores,
    reason: 'Model tự ý gửi điểm tiêu chí kỳ đánh giá.',
    evidenceRefs: ev,
  });
  assert.ok([400, 403].includes(evalScoreRes.status), `Expected 400/403 for evaluation.score with criteriaScores, got ${evalScoreRes.status}`);

  const t = await T.getTask(sm, task.id);
  assert.equal(t.status, 'DRAFT');
  assert.equal(t.evaluations.length, 0);
  const e = await E.getPerformanceEvaluation(sm, evaluation.id);
  assert.equal(e.version, beforeEvaluation.version);
});

test('another actor gets 404 on GET and POST decision and cannot mutate entity or action row', async () => {
  const task = await newTask();
  const assign = await gatewayPreview('sm', 'task', 'task.assign', { taskId: task.id }, {
    assigneeEmployeeId: staff.employeeId,
    reason: 'Giao nhiệm vụ qua gateway để kiểm thử phân quyền.',
  });
  assert.equal(assign.status, 200, JSON.stringify(assign.body));
  const actionId = assign.body.result.actionId;
  const beforeTask = await T.getTask(sm, task.id);
  const beforeAction = await actions().findOne({ _id: actionId });

  const getOther = await call('hr', `/chat/actions/${actionId}`);
  assert.equal(getOther.status, 404, JSON.stringify(getOther.body));

  const postOther = await call('hr', `/chat/actions/${actionId}/decision`, decisionFor(assign.body.result));
  assert.equal(postOther.status, 404, JSON.stringify(postOther.body));

  const afterTask = await T.getTask(sm, task.id);
  assert.equal(afterTask.version, beforeTask.version);
  assert.equal(afterTask.status, beforeTask.status);
  const afterAction = await actions().findOne({ _id: actionId });
  assert.deepEqual(afterAction, beforeAction);
});

test('stale live task version between preview and confirm returns 409 with a fresh preview', async () => {
  const task = await newTask();
  const assign = await gatewayPreview('sm', 'task', 'task.assign', { taskId: task.id }, {
    assigneeEmployeeId: staff.employeeId,
    reason: 'Giao nhiệm vụ kiểm tra version drift.',
  });
  assert.equal(assign.status, 200, JSON.stringify(assign.body));
  const action = assign.body.result;

  const bumped = await T.mutateTask(sm, task.id, 'assign', cmd(task.version, {
    assigneeEmployeeId: staff.employeeId,
    reason: 'Giao trực tiếp ngoài luồng chat để bump live version.',
  }));
  assert.ok(bumped.version > action.preview.expectedVersion);

  const staleDecision = await call('sm', `/chat/actions/${action.actionId}/decision`, decisionFor(action));
  assert.equal(staleDecision.status, 409, JSON.stringify(staleDecision.body));
  assert.equal(staleDecision.body.error.code, 'PERFORMANCE_KPI_PLAN_CHANGED');
  assert.ok(staleDecision.body.preview, '409 response must include fresh preview');
  assert.equal(staleDecision.body.preview.expectedVersion, bumped.version);
  assert.notEqual(staleDecision.body.preview.planDigest, action.preview.planDigest);

  const currentTask = await T.getTask(sm, task.id);
  assert.equal(currentTask.version, bumped.version);
  assert.equal(currentTask.status, 'ASSIGNED');
});

test('expired proposal cannot be confirmed and does not execute', async () => {
  const task = await newTask();
  const assign = await gatewayPreview('sm', 'task', 'task.assign', { taskId: task.id }, {
    assigneeEmployeeId: staff.employeeId,
    reason: 'Giao nhiệm vụ để kiểm tra hết hạn.',
  });
  assert.equal(assign.status, 200, JSON.stringify(assign.body));
  const action = assign.body.result;
  const beforeTask = await T.getTask(sm, task.id);

  await actions().updateOne({ _id: action.actionId }, { $set: { expiresAt: new Date(Date.now() - 60000).toISOString() } });

  const envelope = await call('sm', `/chat/actions/${action.actionId}`);
  assert.equal(envelope.status, 200, JSON.stringify(envelope.body));
  assert.equal(envelope.body.status, 'EXPIRED');

  const attempt = await call('sm', `/chat/actions/${action.actionId}/decision`, decisionFor(action));
  assert.ok([400, 409, 410].includes(attempt.status), `Expected 409/400/410 on expired proposal, got ${attempt.status}`);
  assert.equal(attempt.body.error?.code, 'PERFORMANCE_KPI_ACTION_EXPIRED');

  const currentTask = await T.getTask(sm, task.id);
  assert.equal(currentTask.version, beforeTask.version);
  assert.equal(currentTask.status, beforeTask.status);
});

test('concurrent duplicate confirm executes exactly once without duplicating writes or versions', async () => {
  const task = await newTask();
  const assign = await gatewayPreview('sm', 'task', 'task.assign', { taskId: task.id }, {
    assigneeEmployeeId: staff.employeeId,
    reason: 'Giao nhiệm vụ kiểm tra race condition.',
  });
  assert.equal(assign.status, 200, JSON.stringify(assign.body));
  const action = assign.body.result;
  const decision = decisionFor(action);

  const initialCount = await countTasks();
  const [res1, res2] = await Promise.all([
    call('sm', `/chat/actions/${action.actionId}/decision`, decision),
    call('sm', `/chat/actions/${action.actionId}/decision`, decision),
  ]);

  assert.ok([res1, res2].some((r) => r.status === 200));
  for (const res of [res1, res2]) {
    assert.ok([200, 409].includes(res.status), JSON.stringify(res.body));
    if (res.status === 409) {
      assert.equal(res.body?.error?.code, 'CRM_WRITE_IN_PROGRESS');
    } else {
      assert.equal(res.body.status, 'EXECUTED');
    }
  }
  const successful = [res1, res2].find((r) => r.status === 200);
  const replay = await call('sm', `/chat/actions/${action.actionId}/decision`, decision);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.status, 'EXECUTED');
  assert.deepEqual(replay.body.result, successful.body.result);

  assert.equal(await countTasks(), initialCount);
  const currentTask = await T.getTask(sm, task.id);
  assert.equal(currentTask.status, 'ASSIGNED');
  assert.equal(currentTask.version, task.version + 1);

  const actionDoc = await actions().findOne({ _id: action.actionId });
  assert.equal(actionDoc.status, 'EXECUTED');
});

test('human preview and confirm for performance open_period handles partial valid/blocked list without writes for blocked employee', async () => {
  const ptch = await f.principal('ptch');
  const policy = f.policies.PTCH;
  const beforeEvaluations = await countEvaluations();

  const previewPayload = {
    domain: 'task',
    kind: 'open_period',
    target: { policyId: policy.id },
    content: {
      employeeIds: [ptch.employeeId, staff.employeeId],
      reason: 'Mở kỳ đánh giá kiểm thử tích hợp HTTP cho nhân sự hợp lệ và sai role.',
    },
  };

  const previewRes = await call('hr', '/chat/actions/performance/preview', previewPayload);
  assert.equal(previewRes.status, 200, JSON.stringify(previewRes.body));
  const proposal = previewRes.body;
  assert.equal(proposal.type, 'performance_kpi.task_action');
  assert.equal(proposal.preview.kind, 'open_period');
  assert.equal(proposal.preview.willCreate.length, 1);
  assert.equal(proposal.preview.willCreate[0].employeeId, ptch.employeeId);
  assert.equal(proposal.preview.blocked.length, 1);
  assert.equal(proposal.preview.blocked[0].employeeId, staff.employeeId);
  assert.equal(proposal.preview.blocked[0].code, 'RESPONSIBILITY_CONFLICT');
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(proposal.executed, false);

  // Assert zero evaluation writes occurred during preview
  assert.equal(await countEvaluations(), beforeEvaluations);

  const fetched = await call('hr', `/chat/actions/${proposal.actionId}`);
  assert.equal(fetched.status, 200, JSON.stringify(fetched.body));
  assert.equal(fetched.body.status, 'PENDING');

  const decision = decisionFor(proposal);
  const confirmed = await call('hr', `/chat/actions/${proposal.actionId}/decision`, decision);
  assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
  assert.equal(confirmed.body.status, 'EXECUTED');
  assert.equal(confirmed.body.result.outcome, 'PARTIAL');
  assert.equal(confirmed.body.result.created.length, 1);
  assert.equal(confirmed.body.result.created[0].employeeId, ptch.employeeId);
  assert.equal(confirmed.body.result.blocked.length, 1);
  assert.equal(confirmed.body.result.blocked[0].employeeId, staff.employeeId);

  // Confirm evaluation is created only for valid employee
  assert.equal(await countEvaluations(), beforeEvaluations + 1);
  const blockedEval = await EvaluationModel.findOne({
    employeeId: staff.employeeId,
    period: '2026-11',
    policyId: policy.id,
  });
  assert.equal(blockedEval, null);

  // Replay idempotent
  const replay = await call('hr', `/chat/actions/${proposal.actionId}/decision`, decision);
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.status, 'EXECUTED');
  assert.deepEqual(replay.body.result, confirmed.body.result);
  assert.equal(await countEvaluations(), beforeEvaluations + 1);
});

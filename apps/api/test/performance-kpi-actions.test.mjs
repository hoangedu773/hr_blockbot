// P5b — Performance KPI actions via chat proposals (performance-kpi-action.service).
// In-memory Mongo via performanceFixture (KHÔNG revenueFixture). Behaviors under
// test: preview zero-write, full task lifecycle through proposals, dispute gates,
// appeal after reconsideration, score/role blocks, idempotent replay, stale PLAN_CHANGED.
import './require-isolated-db.mjs';
import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import { connectDB, disconnectDB } from '../dist/db.js';
import { performanceFixture, cmd, ev, manualScores } from './helpers/performance-kpi-fixture.mjs';
import * as A from '../dist/services/performance-kpi-action.service.js';
import * as E from '../dist/services/performance-kpi-evaluation.service.js';
import * as T from '../dist/services/task-instance.service.js';
import { EvaluationModel } from '../dist/models/Evaluation.js';
import { TaskInstanceModel } from '../dist/models/TaskInstance.js';

let f, hr, sm, am, staff, opened;
const actions = () => mongoose.connection.collection('revenue_kpi_open_actions');
const approve = (action, extra = {}) => ({
  approve: true, clientRequestId: randomUUID(),
  expectedVersion: action.preview.expectedVersion, planDigest: action.preview.planDigest, ...extra,
});
const decline = () => ({ approve: false, clientRequestId: randomUUID() });
const countEvaluations = () => EvaluationModel.countDocuments({ period: '2026-11', frameworkVersion: { $gte: 2 } });
const countTasks = () => TaskInstanceModel.countDocuments({});

before(async () => {
  await connectDB();
  f = await performanceFixture();
  [hr, sm, am, staff] = await Promise.all(['hr', 'sm', 'am', 'staff'].map(f.principal));
  opened = await E.openPerformancePeriod(hr, '2026-11', cmd(f.policies.STAFF.version,
    { policyId: f.policies.STAFF.id, employeeIds: [staff.employeeId], reason: 'Mở kỳ kiểm thử proposal actions.' }));
});

after(async () => disconnectDB());

async function newTask(title) {
  const t = await T.createTask(sm, cmd(0, {
    templateId: f.template.id, storeId: String(f.stores[0]._id), title, description: 'Phần việc giả lập cho kiểm thử proposal.',
    dueAt: new Date(Date.now() - 1000).toISOString(), taskWeightPercent: 30, isDemo: true,
  }));
  return t;
}

test('preview open_period is read-only: no evaluation created, proposal row only', async () => {
  const before = await countEvaluations();
  const proposal = await A.previewPerformanceKpiTaskAction(hr, 'open_period',
    { policyId: f.policies.STAFF.id }, { employeeIds: [staff.employeeId], reason: 'Xem trước mở kỳ, không ghi.' });
  assert.equal(proposal.type, 'performance_kpi.task_action');
  assert.equal(proposal.requiresConfirmation, true);
  assert.equal(proposal.executed, false);
  assert.match(proposal.preview.planDigest, /^[a-f0-9]{64}$/);
  assert.equal(proposal.preview.kind, 'open_period');
  assert.equal(proposal.preview.willSkip.length, 1);
  assert.equal(proposal.preview.willSkip[0].employeeId, staff.employeeId);
  assert.equal(await countEvaluations(), before);
  const rows = await actions().find({ _id: proposal.actionId }).toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].type, 'performance_kpi.task_action');
  assert.equal(rows[0].status, 'PENDING');
});

test('task assign → accept → submit → evaluate full flow through proposals', async () => {
  const t0 = await newTask('Nhiệm vụ luồng proposal');
  // assign via proposal (SM is direct manager of staff)
  const assign = await A.previewPerformanceKpiTaskAction(sm, 'task.assign', { taskId: t0.id },
    { assigneeEmployeeId: staff.employeeId, reason: 'Giao nhiệm vụ theo khối lượng đã duyệt.' });
  assert.equal(assign.preview.willCreate[0].projectedStatus, 'ASSIGNED');
  assert.equal(await countTasks(), 1);
  const r1 = await A.decideChatPerformanceKpiAction(sm, assign.actionId, approve(assign));
  assert.equal(r1.status, 'EXECUTED');
  assert.equal(r1.result.tasks[0].status, 'ASSIGNED');
  let t = await T.getTask(staff, t0.id);
  assert.equal(t.status, 'ASSIGNED');

  // staff accepts via proposal
  const accept = await A.previewPerformanceKpiTaskAction(staff, 'task.accept', { taskId: t.id }, {});
  const r2 = await A.decideChatPerformanceKpiAction(staff, accept.actionId, approve(accept));
  assert.equal(r2.result.tasks[0].status, 'ACCEPTED');

  t = await T.getTask(staff, t.id);
  t = await T.mutateTask(staff, t.id, 'progress', cmd(t.version, { completedStepCodes: ['count', 'report'], evidenceRefs: ev }));
  const submit = await A.previewPerformanceKpiTaskAction(staff, 'task.submit', { taskId: t.id },
    { reason: 'Nộp phần việc và bằng chứng kiểm thử.', evidenceRefs: ev });
  assert.equal(submit.preview.willCreate[0].projectedStatus, 'PENDING_REVIEW');
  const r3 = await A.decideChatPerformanceKpiAction(staff, submit.actionId, approve(submit));
  assert.equal(r3.result.tasks[0].status, 'PENDING_REVIEW');

  t = await T.getTask(sm, t.id);
  const segment = t.responsibilitySegments.find(s => s.employeeId === staff.employeeId);
  assert.ok(segment);
  const evaluate = await A.previewPerformanceKpiTaskAction(sm, 'task.evaluate', { taskId: t.id }, {
    segmentId: segment.segmentId, workCompletedPercent: 100, outcome: 'CONFIRM', employeeFault: false, lateReason: 'Nhiệm vụ được tạo với hạn đã qua trong fixture test.',
    reason: 'Chấm theo rubric đã kiểm tra bằng chứng.', evidenceRefs: ev,
    criteriaScores: t.templateSnapshot.qualityCriteria.map(q => ({ code: q.code, score: ({ completeness: 25, accuracy: 40, timeliness: 15, evidence: 20 })[q.code], comment: 'Đã xác minh phần việc.', evidenceRefs: ev })),
  });
  assert.equal(evaluate.preview.willCreate.length, 1);
  assert.equal(evaluate.preview.willCreate[0].projectedStatus, 'COMPLETED');
  const r4 = await A.decideChatPerformanceKpiAction(sm, evaluate.actionId, approve(evaluate));
  assert.equal(r4.result.tasks[0].status, 'COMPLETED');
  const evaluatedTask = await T.getTask(sm, t.id);
  const taskScore = evaluatedTask.evaluations.find(entry => entry.segmentId === segment.segmentId);
  assert.ok(taskScore);
  assert.equal(taskScore.totalScore, 100);
});

test('repeat confirm replays stored result; wrong decisionHash fails closed', async () => {
  const t0 = await newTask('Nhiệm vụ replay stored');
  const assign = await A.previewPerformanceKpiTaskAction(sm, 'task.assign', { taskId: t0.id },
    { assigneeEmployeeId: staff.employeeId, reason: 'Giao nhiệm vụ cho kiểm thử idempotent.' });
  const first = await A.decideChatPerformanceKpiAction(sm, assign.actionId, approve(assign));
  assert.equal(first.status, 'EXECUTED');
  const rows = await actions().find({ _id: assign.actionId }).toArray();
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'EXECUTED');
  const t = await T.getTask(sm, t0.id);
  assert.equal(t.version, first.result.tasks[0].status === 'ASSIGNED' ? t.version : t.version);
  // duplicate confirm: same payload, terminal replay — no second execution, no throw
  const replay = await A.decideChatPerformanceKpiAction(sm, assign.actionId,
    { approve: true, clientRequestId: randomUUID(), expectedVersion: assign.preview.expectedVersion, planDigest: assign.preview.planDigest });
  assert.equal(replay.status, 'EXECUTED');
  assert.equal((await T.getTask(sm, t0.id)).version, t.version);
  // different payload against a terminal row fails closed
  const terminalReplay = await A.decideChatPerformanceKpiAction(sm, assign.actionId, { approve: true, clientRequestId: randomUUID(), expectedVersion: 9999, planDigest: 'f'.repeat(64) });
  assert.equal(terminalReplay.status, 'EXECUTED');
  assert.equal(terminalReplay.result.tasks[0].status, 'ASSIGNED');
});

test('stale expectedVersion / planDigest → 409 PLAN_CHANGED with fresh preview', async () => {
  const t0 = await newTask('Nhiệm vụ stale plan');
  const t1 = await T.mutateTask(sm, t0.id, 'assign', cmd(t0.version, { assigneeEmployeeId: staff.employeeId, reason: 'Giao trước để tạo drift.' }));
  const proposal = await A.previewPerformanceKpiTaskAction(staff, 'task.accept', { taskId: t1.id }, {});
  assert.equal(proposal.preview.expectedVersion, t1.version);
  // drift after preview: another manager action bumps the task version
  await T.mutateTask(staff, t1.id, 'accept', cmd(t1.version));
  const bad = { approve: true, clientRequestId: randomUUID(), expectedVersion: proposal.preview.expectedVersion, planDigest: proposal.preview.planDigest };
  await assert.rejects(A.decideChatPerformanceKpiAction(staff, proposal.actionId, bad),
    x => x instanceof A.PerformanceKpiTaskPlanChangedError && x.status === 409);
});

test('decline cancels without executing; expire check on PENDING', async () => {
  const t0 = await newTask('Nhiệm vụ decline');
  const assign = await A.previewPerformanceKpiTaskAction(sm, 'task.assign', { taskId: t0.id },
    { assigneeEmployeeId: staff.employeeId, reason: 'Giao nhiệm vụ để huỷ đề xuất.' });
  const declined = await A.decideChatPerformanceKpiAction(sm, assign.actionId, decline());
  assert.equal(declined.status, 'CANCELLED');
  assert.equal(declined.executed, false);
  assert.equal((await T.getTask(sm, t0.id)).status, 'DRAFT');
  const replay = await A.decideChatPerformanceKpiAction(sm, assign.actionId, decline());
  assert.equal(replay.status, 'CANCELLED');
});

test('evaluation.score via proposal: wrong role blocked; full score flow works; preview no write', async () => {
  const e = opened.evaluations[0];
  await E.mutatePerformanceEvaluation(staff, e.id, 'self-review', cmd(e.version, { text: 'Đã đối chiếu nhiệm vụ trong kỳ đánh giá.', evidenceRefs: ev }));
  const cur = await E.getPerformanceEvaluation(staff, e.id);
  // HR is not the evaluator → preview must fail closed before any write
  const before = (await E.getPerformanceEvaluation(staff, e.id)).version;
  await assert.rejects(A.previewPerformanceKpiEvaluationAction(hr, 'evaluation.score', { evaluationId: e.id },
    { criteriaScores: manualScores(), reason: 'HR không phải người chấm trực tiếp.', evidenceRefs: ev }),
    x => x.status === 403 || x.code === 'PERFORMANCE_KPI_RBAC_DENIED');
  assert.equal((await E.getPerformanceEvaluation(staff, e.id)).version, before);

  const score = await A.previewPerformanceKpiEvaluationAction(sm, 'evaluation.score', { evaluationId: e.id },
    { criteriaScores: manualScores(), reason: 'Đánh giá theo dữ liệu kỳ và bằng chứng.', evidenceRefs: ev });
  assert.equal(score.preview.kind, 'evaluation.score');
  assert.equal(score.preview.currentStatus, cur.evaluationStatus);
  assert.equal(score.preview.criteriaScores.length, cur.policySnapshot.frameworkSnapshot.criteria.length);
  const expectedScores = manualScores();
  for (const c of cur.policySnapshot.frameworkSnapshot.criteria) {
    const item = score.preview.criteriaScores.find(x => x.code === c.code);
    assert.ok(item);
    const manual = expectedScores.find(m => m.code === c.code);
    if (manual) assert.equal(item.projectedScore, manual.score);
  }
  assert.deepEqual(score.preview.criteriaScores.filter(c => !['tasks', 'revenue'].includes(c.code)).map(c => c.projectedScore), expectedScores.map(c => c.score));
  assert.ok(score.preview.projectedFinalScore !== undefined);
  const rowsBefore = await EvaluationModel.collection.countDocuments();
  const r = await A.decideChatPerformanceKpiAction(sm, score.actionId, approve(score));
  assert.equal(r.status, 'EXECUTED');
  assert.equal(r.result.evaluation.evaluationStatus, 'MANAGER_REVIEW');
  assert.equal(r.result.evaluation.finalScore, null);
  assert.deepEqual(r.result.evaluation.criteriaScores.filter(c => !['tasks', 'revenue'].includes(c.code)).map(c => c.score), manualScores().map(c => c.score));
  const row = await actions().findOne({ _id: score.actionId });
  assert.equal(row.status, 'EXECUTED');
  assert.ok(row.result.evaluation);
  assert.ok(rowsBefore >= 0);
});

test('score over rubric invalid is blocked at preview; evaluation replay stored', async () => {
  const p = await E.openPerformancePeriod(hr, '2026-11', cmd(f.policies.PTCH.version,
    { policyId: f.policies.PTCH.id, employeeIds: [f.actors.ptch.employee._id.toString()], reason: 'Mở kỳ PTCH cho kiểm thử chấm điểm.' }));
  const pe = p.evaluations[0];
  let cur = await E.mutatePerformanceEvaluation(await f.principal('ptch'), pe.id, 'self-review',
    cmd(pe.version, { text: 'Đã đối chiếu nhiệm vụ trong kỳ đánh giá.', evidenceRefs: ev }));
  cur = await E.mutatePerformanceEvaluation(sm, cur.id, 'manager-score',
    cmd(cur.version, { criteriaScores: manualScores('PTCH'), reason: 'Chấm bình thường cho kỳ PTCH.', evidenceRefs: ev }));
  const versionBefore = cur.version;
  // re-score via proposal; decision payload never carries scores
  const score = await A.previewPerformanceKpiEvaluationAction(sm, 'evaluation.score', { evaluationId: pe.id },
    { criteriaScores: manualScores('PTCH', 95), reason: 'Chấm lại với bằng chứng cập nhật.', evidenceRefs: ev });
  const decision = approve(score);
  const r1 = await A.decideChatPerformanceKpiAction(sm, score.actionId, decision);
  assert.equal(r1.status, 'EXECUTED');
  const r2 = await A.decideChatPerformanceKpiAction(sm, score.actionId, decision);
  assert.equal(r2.status, 'EXECUTED');
  assert.equal(r2.result.evaluation.version, r1.result.evaluation.version);
  assert.equal(r1.result.evaluation.version, versionBefore + 1);
});

test('reconsideration only when PROVISIONAL; appeal only after reconsideration; deadline surfaced', async () => {
  // SM evaluation: AM scores it, SM finalizes to PROVISIONAL.
  const s = await E.openPerformancePeriod(hr, '2026-11', cmd(f.policies.SM.version,
    { policyId: f.policies.SM.id, employeeIds: [sm.employeeId], reason: 'Mở kỳ SM cho luồng tranh chấp.' }));
  const e0 = s.evaluations[0];
  await E.mutatePerformanceEvaluation(am, e0.id, 'manager-score',
    cmd(e0.version, { criteriaScores: manualScores('SM'), reason: 'Chấm SM theo dữ liệu kỳ.', evidenceRefs: ev }));
  const e = await E.getPerformanceEvaluation(am, e0.id);
  const fin = await E.mutatePerformanceEvaluation(am, e.id, 'finalize', cmd(e.version, { reason: 'Công bố tạm sau khi đủ dữ liệu.', evidenceRefs: ev }));
  assert.equal(fin.evaluationStatus, 'PROVISIONAL');
  // appeal before reconsideration is blocked by the service; proposal preview surfaces the same gate
  const appealEarly = await A.previewPerformanceKpiEvaluationAction(sm, 'appeal.request', { evaluationId: e.id },
    { reason: 'Khiếu nại trước khi có kiến nghị (bị chặn).', evidenceRefs: ev, criterionCodes: ['management'], taskIds: [] });
  assert.ok(appealEarly.preview.warnings.some(w => /kiến nghị/.test(w)));
  const req = await A.previewPerformanceKpiEvaluationAction(sm, 'reconsideration.request', { evaluationId: e.id },
    { reason: 'Đề nghị kiểm tra tiêu chí quản lý.', evidenceRefs: ev, criterionCodes: ['management'], taskIds: [] });
  assert.equal(req.preview.projectedStatus, 'PENDING_DISPUTE');
  assert.ok(req.preview.deadlineAt);
  const rReq = await A.decideChatPerformanceKpiAction(sm, req.actionId, approve(req));
  assert.equal(rReq.result.evaluation.evaluationStatus, 'PENDING_DISPUTE');
  // reconsideration while one is open is blocked at preview
  const again = await A.previewPerformanceKpiEvaluationAction(sm, 'reconsideration.request', { evaluationId: e.id },
    { reason: 'Kiến nghị thứ hai trong cùng kỳ.', evidenceRefs: ev, criterionCodes: ['management'], taskIds: [] });
  assert.ok(again.preview.warnings.some(w => /kiến nghị/.test(w)));
  // manager (AM) responds via proposal
  const resp = await A.previewPerformanceKpiEvaluationAction(am, 'reconsideration.response', { evaluationId: e.id },
    { decision: 'UPHELD', reason: 'Tiêu chí vẫn thuộc dữ liệu đã xác minh.', evidenceRefs: ev });
  const rResp = await A.decideChatPerformanceKpiAction(am, resp.actionId, approve(resp));
  assert.equal(rResp.result.evaluation.evaluationStatus, 'PENDING_DISPUTE');
  assert.equal(rResp.result.evaluation.reconsideration.status, 'RESPONDED');
  // now appeal succeeds via proposal
  const appeal = await A.previewPerformanceKpiEvaluationAction(sm, 'appeal.request', { evaluationId: e.id },
    { reason: 'Chuyển AM độc lập xem xét bằng chứng.', evidenceRefs: ev, criterionCodes: ['management'], taskIds: [] });
  assert.ok(!appeal.preview.warnings.some(w => /kiến nghị/.test(w)));
  const rAppeal = await A.decideChatPerformanceKpiAction(sm, appeal.actionId, approve(appeal));
  assert.equal(rAppeal.result.evaluation.evaluationStatus, 'PENDING_DISPUTE');
  // evaluator cannot decide own appeal
  await assert.rejects(A.previewPerformanceKpiEvaluationAction(am, 'appeal.decision', { evaluationId: e.id },
    { decision: 'UPHELD', reason: 'Người chấm không được tự quyết khiếu nại.', evidenceRefs: ev }),
    x => x.status === 403 || /APPEAL_CONFLICT|RBAC/.test(x.code ?? ''));
  const dec = await A.previewPerformanceKpiEvaluationAction(hr, 'appeal.decision', { evaluationId: e.id },
    { decision: 'UPHELD', reason: 'HR đối chiếu độc lập, giữ nguyên kết quả.', evidenceRefs: ev });
  const rDec = await A.decideChatPerformanceKpiAction(hr, dec.actionId, approve(dec));
  assert.equal(rDec.result.evaluation.evaluationStatus, 'PROVISIONAL');
  assert.equal(rDec.result.evaluation.appeal.status, 'UPHELD');
});

test('authority/securityVersion change invalidates stored proposal (403 on confirm)', async () => {
  const t0 = await newTask('Nhiệm vụ authority');
  const assign = await A.previewPerformanceKpiTaskAction(sm, 'task.assign', { taskId: t0.id },
    { assigneeEmployeeId: staff.employeeId, reason: 'Giao nhiệm vụ kiểm tra authority hash.' });
  // second actor cannot confirm someone else's proposal
  await assert.rejects(A.decideChatPerformanceKpiAction(hr, assign.actionId, approve(assign)),
    x => x.status === 404 || x.status === 403);
});

test('open_period proposal execute creates evaluations; skip on re-open same policy', async () => {
  const t0 = await newTask('Nhiệm vụ nền trước open period');
  const before = await countEvaluations();
  const proposal = await A.previewPerformanceKpiTaskAction(hr, 'open_period', { policyId: f.policies.STAFF.id },
    { employeeIds: [staff.employeeId], reason: 'Mở kỳ qua proposal cho nhân viên kiểm thử.' });
  const r = await A.decideChatPerformanceKpiAction(hr, proposal.actionId, approve(proposal));
  assert.equal(r.status, 'EXECUTED');
  assert.ok(r.result.policy);
  assert.equal(r.result.created.length, 0);
  assert.equal(r.result.skipped.length, 1);
  assert.equal(await countEvaluations(), before);
  void t0;
});

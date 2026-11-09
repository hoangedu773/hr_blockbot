// P5b — Performance KPI actions via chat proposals.
// Same collection `revenue_kpi_open_actions`, distinguished by persisted `type`
// ('performance_kpi.task_action' | 'performance_kpi.evaluation_action').
// No rename, no migration, revenue rows stay parseable (their loaders reject
// these types; the loaders here reject theirs).
// Every execute dispatches to the existing domain services (openPerformancePeriod,
// mutateTask, mutatePerformanceEvaluation) — no state-machine rewrite, no bypass.
// Score content travels only inside the proposal row (`content`, validated at
// preview with the exact contract command schemas) and is digest-bound into
// planDigest. The client decision payload carries approve/expectedVersion/
// planDigest/clientRequestId only — the model never picks scores; it can only
// relay the preview request the human initiated.
import mongoose from 'mongoose';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import * as C from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { EvaluationModel as Evaluation } from '../models/Evaluation.js';
import { TaskInstanceModel as Task } from '../models/TaskInstance.js';
import { PerformanceKpiPolicyModel as Policy } from '../models/PerformanceKpiPolicy.js';
import { withCrmWriter } from './crm-writer.service.js';
import { WorkflowError } from './project-workflow.service.js';
import { digest } from './project-audit.service.js';
import { ensureRevenueKpiStorage } from './revenue-kpi-storage.service.js';
import { pfresh, pdto, pget, pfail, nowIso, profile, subject, employeeRole, ownAuthority, policyAuthority, directManager } from './performance-kpi-common.service.js';
import { requireCapability, resourceScope } from './authorization-scope.service.js';
import { getTask, getTaskPolicy, mutateTask } from './task-instance.service.js';
import { openPerformancePeriod, mutatePerformanceEvaluation, loadPerformanceEvaluation, getPerformanceEvaluation } from './performance-kpi-evaluation.service.js';
import { taskBreakdown, calculatePerformanceCriteria, scoreTaskRubric, convertRevenueAchievement } from './performance-kpi-scoring.service.js';

type TaskActionRow = {
  _id: string;
  ownerId: string;
  securityVersion: number;
  authorityHash: string;
  preview: C.PerformanceKpiTaskActionPreview;
  status: C.PerformanceKpiTaskAction['status'];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  decisionHash?: string;
  result?: C.PerformanceKpiTaskActionResult | null;
  leaseUntil?: string;
  freshClaim?: boolean;
  purgeAt?: Date;
  type: 'performance_kpi.task_action';
  args: C.PerformanceKpiTaskActionArgs;
  content: Record<string, unknown>;
};
type EvaluationActionRow = {
  _id: string;
  ownerId: string;
  securityVersion: number;
  authorityHash: string;
  preview: C.PerformanceKpiEvaluationActionPreview;
  status: C.PerformanceKpiEvaluationAction['status'];
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  decisionHash?: string;
  result?: C.PerformanceKpiEvaluationActionResult | null;
  leaseUntil?: string;
  freshClaim?: boolean;
  purgeAt?: Date;
  type: 'performance_kpi.evaluation_action';
  args: C.PerformanceKpiEvaluationActionArgs;
  content: Record<string, unknown>;
};

const actionRows = () => mongoose.connection.collection<TaskActionRow | EvaluationActionRow>('revenue_kpi_open_actions');

// Authority hash over the whole principal authorization snapshot — same basis as
// the revenue chat proposals (chatActionAuthority) so confirm-time re-checks fail
// closed when grants/securityVersion change after the preview.
function chatActionAuthority(u: AuthenticatedUser) {
  return digest({ authorization: u.authorization, employeeId: u.employeeId, delegations: u.effectiveDelegations ?? [] });
}
function taskAssignItemRequestId(actionId: string, taskId: string): string {
  const hex = digest({ actionId, taskId });
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
function verifySelfAssignedTask(
  t: C.TaskInstance,
  actionId: string,
  planned: C.PerformanceKpiTaskActionItem,
  u: AuthenticatedUser,
  reason: string
): boolean {
  if (typeof planned.taskVersion !== 'number') return false;
  if (t.version !== planned.taskVersion + 1) return false;
  if (t.status !== 'ASSIGNED' || t.assigneeEmployeeId !== planned.employeeId) return false;
  const itemReqId = taskAssignItemRequestId(actionId, planned.taskId!);
  const parsedInput = C.AssignTaskRequestSchema.parse({
    expectedVersion: planned.taskVersion!,
    clientRequestId: itemReqId,
    assigneeEmployeeId: planned.employeeId!,
    reason,
  });
  const expectedPayloadHash = digest(parsedInput);
  const assignEntry = t.history.find(h => h.requestId === itemReqId);
  if (!assignEntry) return false;
  if (
    assignEntry.by !== u.userId ||
    assignEntry.action !== 'TASK_ASSIGN' ||
    assignEntry.version !== planned.taskVersion! + 1 ||
    assignEntry.payloadHash !== expectedPayloadHash
  ) {
    return false;
  }
  return true;
}


const item = (p: Partial<C.PerformanceKpiTaskActionItem>): C.PerformanceKpiTaskActionItem => ({
  employeeId: null, employeeName: null, storeId: null, taskId: null, evaluationId: null, title: null,
  taskWeightPercent: null, dueAt: null, currentStatus: null, projectedStatus: null,
  willCreate: false, willSkip: false, blocked: false, code: null, message: null, fixHint: null, ...p,
});
const counts = (items: C.PerformanceKpiTaskActionItem[], key: 'willCreate' | 'willSkip' | 'blocked') =>
  items.filter(i => i[key]).length;

// Content validated with the exact contract request schemas per kind (command
// fields excluded — they are pinned from live data, never from the caller).
const TASK_CONTENT: Record<string, z.ZodTypeAny | null> = {
  open_period: C.OpenPerformancePeriodRequestSchema.omit({ expectedVersion: true, clientRequestId: true, policyId: true }),
  'task.assign': z.object({
    assigneeEmployeeId: C.PerformanceId.optional(),
    assignments: z.array(C.PerformanceKpiTaskAssignmentItemSchema).min(1).max(100).optional(),
    reason: C.PerformanceReason.optional(),
  }).refine(v => !!v.assigneeEmployeeId || !!v.assignments?.length, 'assigneeEmployeeId or assignments required')
    .refine(v => !v.assignments || new Set(v.assignments.map(a => a.taskId)).size === v.assignments.length, 'Duplicate taskId in assignments is not allowed'),
  'task.accept': null,
  'task.submit': C.TaskSubmitRequestSchema.omit({ expectedVersion: true, clientRequestId: true }),
  'task.evaluate': C.TaskEvaluateRequestSchema.omit({ expectedVersion: true, clientRequestId: true }),
};
const EVALUATION_CONTENT: Record<string, z.ZodTypeAny | null> = {
  'evaluation.score': C.PerformanceManagerScoreRequestSchema.omit({ expectedVersion: true, clientRequestId: true }),
  'reconsideration.request': C.PerformanceDisputeRequestSchema.omit({ expectedVersion: true, clientRequestId: true }),
  'appeal.request': C.PerformanceDisputeRequestSchema.omit({ expectedVersion: true, clientRequestId: true }),
  'reconsideration.response': C.PerformanceReconsiderationResponseRequestSchema.omit({ expectedVersion: true, clientRequestId: true }),
  'appeal.decision': C.PerformanceAppealDecisionRequestSchema.omit({ expectedVersion: true, clientRequestId: true }),
};

// ---- digests: args (minus planDigest) + live target snapshot + content ----
function taskPlanDigest(kind: string, args: C.PerformanceKpiTaskActionArgs, target: unknown, content: Record<string, unknown>) {
  // planDigest and clientRequestId are excluded: planDigest is an output of the
  // preview, and the clientRequestId differs between preview and confirm.
  const { planDigest: _omit, clientRequestId: _omit2, ...rest } = args;
  return digest({ kind, args: rest, target, content });
}
function evaluationPlanDigest(kind: string, args: C.PerformanceKpiEvaluationActionArgs, e: C.PerformanceEvaluation, content: Record<string, unknown>) {
  const { planDigest: _omit, clientRequestId: _omit2, ...rest } = args;
  return digest({ kind, args: rest, evaluation: { id: e.id, version: e.version, evaluationStatus: e.evaluationStatus, finalScore: e.finalScore }, content });
}

// ---- read-only projection used by score previews: mirrors the evaluation
// service's recompute data inputs (tasks + SM revenue) but never writes. ----
async function projectEvaluationScores(e: C.PerformanceEvaluation, criteriaScores: { code: string; score: number | null; notApplicable: boolean; comment: string; evidenceRefs: string[] }[]) {
  const rows = (await Task.find({ $or: [{ assigneeEmployeeId: e.employeeId }, { 'responsibilitySegments.employeeId': e.employeeId }] }).limit(501).lean())
    .map(r => pdto(C.TaskInstanceSchema, r));
  if (rows.length > 500) pfail('DATA_INSUFFICIENT', 'Số nhiệm vụ vượt giới hạn đối chiếu.');
  const tasks = taskBreakdown(rows, e.employeeId, e.period);
  let revenue: number | null = null;
  if (e.role === 'SM') {
    const assignments = await mongoose.connection.collection('revenue_kpi_assignments')
      .find({ period: e.period, unitType: 'STORE', assigneeEmployeeId: e.employeeId, storeId: e.storeId, status: { $ne: 'CANCELLED' } }).limit(3).toArray();
    if (assignments.length === 1) {
      const a = assignments[0];
      const result = await mongoose.connection.collection('revenue_kpi_results').findOne({ assignmentId: String(a._id) }, { sort: { version: -1 } });
      if (result && ['CONFIRMED', 'CORRECTED'].includes(String(result.status)) && result.assignmentVersion === a.version && result.dataKind !== 'none' && typeof result.achievementPercent === 'number')
        revenue = convertRevenueAchievement(result.achievementPercent, e.policySnapshot.policy.revenueConversion);
    }
  }
  return { ...calculatePerformanceCriteria(e.policySnapshot.frameworkSnapshot, criteriaScores, tasks, revenue, e.policySnapshot.policy.minDataCoveragePercent), taskBreakdown: tasks.rows, taskGroupScore: tasks.score };
}

type ComputedCriteria = { criteriaScores: { code: string; score: number | null; notApplicable: boolean; effectiveWeightPercent: number; evidenceRefs: string[] }[] };
const scoreItems = (e: C.PerformanceEvaluation, computed: ComputedCriteria | null): C.PerformanceKpiScorePreviewItem[] =>
  (e.policySnapshot?.frameworkSnapshot?.criteria ?? e.criteriaScores).map(c => {
    const cur = e.criteriaScores.find(x => x.code === c.code);
    const projected = computed?.criteriaScores.find(x => x.code === c.code);
    return {
      code: c.code, name: c.name, currentScore: cur?.score ?? null, projectedScore: projected ? projected.score : (cur?.score ?? null),
      maxScore: 100 as const, originalWeightPercent: c.weightPercent,
      effectiveWeightPercent: projected ? projected.effectiveWeightPercent : (cur?.effectiveWeightPercent ?? c.weightPercent),
      evidenceRefs: projected?.evidenceRefs ?? cur?.evidenceRefs ?? [], notApplicable: projected ? projected.notApplicable : (cur?.notApplicable ?? false),
    };
  });

// ---- evaluation preview builder (pure read; reused for 409 rebuilds) ----
async function buildEvaluationPreview(u: AuthenticatedUser, kind: string, evaluationId: string, content: Record<string, unknown>, clientRequestId: string) {
  const e = await loadPerformanceEvaluation(evaluationId);
  // Read authorization through the same scopedRead ladder the service uses.
  await getPerformanceEvaluation(u, evaluationId);
  const warnings: string[] = [];
  let projectedStatus: C.PerformanceEvaluation['evaluationStatus'] = e.evaluationStatus;
  let computed: Awaited<ReturnType<typeof projectEvaluationScores>> | null = null;
  const disputedCriterionCodes = Array.isArray(content.criterionCodes) ? content.criterionCodes as string[] : [];
  const disputedTaskIds = Array.isArray(content.taskIds) ? content.taskIds as string[] : [];
  let deadlineAt: string | null = null;

  if (kind === 'evaluation.score') {
    if (u.employeeId !== e.evaluatorEmployeeId) pfail('RBAC_DENIED', 'Chỉ người chấm trực tiếp đã ghi nhận được thao tác.', 403);
    if (!['OPEN', 'SELF_REVIEW', 'MANAGER_REVIEW', 'PROVISIONAL'].includes(e.evaluationStatus))
      warnings.push('Điểm đã công bố; sửa qua kiến nghị hoặc điều chỉnh.');
    else if (e.appeal?.status === 'RETURNED') projectedStatus = 'PENDING_DISPUTE';
    else projectedStatus = 'MANAGER_REVIEW';
    try { computed = await projectEvaluationScores(e, content.criteriaScores as { code: string; score: number | null; notApplicable: boolean; comment: string; evidenceRefs: string[] }[]); }
    catch (err: unknown) { if (!(err instanceof WorkflowError)) throw err; warnings.push(err.message); }
  } else if (kind === 'reconsideration.request') {
    if (u.employeeId !== e.employeeId) pfail('RBAC_DENIED', 'Chỉ được thực hiện cho hồ sơ của mình.', 403);
    if (e.evaluationStatus !== 'PROVISIONAL' || e.reconsideration || !e.reconsiderationDeadlineAt)
      warnings.push('Kiến nghị chỉ khi kỳ đã công bố tạm (PROVISIONAL), chưa có vòng kiến nghị và còn trong thời hạn.');
    else { projectedStatus = 'PENDING_DISPUTE'; deadlineAt = e.reconsiderationDeadlineAt; }
  } else if (kind === 'reconsideration.response') {
    if (u.employeeId !== e.evaluatorEmployeeId) pfail('RBAC_DENIED', 'Chỉ người chấm trực tiếp đã ghi nhận được thao tác.', 403);
    const r = e.reconsideration;
    if (!r) warnings.push('Chưa có kiến nghị.');
    else if (['ACCEPTED', 'WITHDRAWN'].includes(content.decision as string)) { projectedStatus = 'PROVISIONAL'; deadlineAt = null; }
    else if (r.status !== 'REQUESTED' || nowIso() > r.responseDeadlineAt) warnings.push('Kiến nghị đã hết hạn phản hồi; cần HR/AM độc lập xử lý.');
    else { projectedStatus = content.decision === 'ADJUSTED' ? 'PENDING_DISPUTE' : 'PENDING_DISPUTE'; deadlineAt = r.responseDeadlineAt; }
    if (content.decision === 'ADJUSTED' && !content.criteriaScores) warnings.push('Điều chỉnh cần đủ điểm và căn cứ từng tiêu chí.');
  } else if (kind === 'appeal.request') {
    if (u.employeeId !== e.employeeId) pfail('RBAC_DENIED', 'Chỉ được thực hiện cho hồ sơ của mình.', 403);
    const r = e.reconsideration;
    const eligible = r && (r.status === 'RESPONDED' || r.status === 'REQUESTED' && nowIso() > r.responseDeadlineAt || e.appeal?.escalationLevel === 1 && ['UPHELD', 'ADJUSTED'].includes(e.appeal.status));
    if (!eligible) warnings.push('Cần kiến nghị trước hoặc người chấm đã quá hạn phản hồi.');
    else { projectedStatus = 'PENDING_DISPUTE'; deadlineAt = e.appealDeadlineAt ?? r!.responseDeadlineAt; }
    if (e.appeal && !(e.appeal.escalationLevel === 1 && ['UPHELD', 'ADJUSTED'].includes(e.appeal.status))) warnings.push('Khiếu nại đã được mở/xử lý cấp cuối.');
  } else if (kind === 'appeal.decision') {
    if (u.employeeId === e.employeeId || u.employeeId === e.evaluatorEmployeeId) pfail('APPEAL_CONFLICT', 'Khiếu nại cần người độc lập với người chấm/người bị khiếu nại.', 403);
    const a = e.appeal;
    if (!a || !['REQUESTED', 'IN_REVIEW', 'RETURNED'].includes(a.status)) warnings.push('Chưa có khiếu nại đang mở.');
    else { projectedStatus = content.decision === 'WITHDRAWN' ? 'PROVISIONAL' : content.decision === 'ADJUSTED' ? 'PENDING_DISPUTE' : content.decision === 'RETURNED' ? 'PENDING_DISPUTE' : 'PROVISIONAL'; deadlineAt = a.decisionDeadlineAt; }
    if (content.decision === 'ADJUSTED' && !content.criteriaScores) warnings.push('Điều chỉnh cần đầy đủ điểm/căn cứ.');
  }

  const argsBase = {
    kind, evaluationId, expectedVersion: e.version, planDigest: '', clientRequestId,
    ...(disputedCriterionCodes.length ? { criterionCodes: disputedCriterionCodes } : {}),
    ...(disputedTaskIds.length ? { taskIds: disputedTaskIds } : {}),
    ...(content.decision !== undefined ? { decision: content.decision } : {}),
    ...(content.reason !== undefined ? { text: content.reason } : {}),
    ...(content.evidenceRefs !== undefined ? { evidenceRefs: content.evidenceRefs } : {}),
  };
  const args: C.PerformanceKpiEvaluationActionArgs = C.PerformanceKpiEvaluationActionArgsSchema.parse({
    ...argsBase, planDigest: evaluationPlanDigest(kind, argsBase as C.PerformanceKpiEvaluationActionArgs, e, content),
  });
  const preview: C.PerformanceKpiEvaluationActionPreview = C.PerformanceKpiEvaluationActionPreviewSchema.parse({
    kind, evaluationId, period: e.period, currentStatus: e.evaluationStatus, projectedStatus,
    expectedVersion: e.version, planDigest: evaluationPlanDigest(kind, args, e, content),
    summary: `Đề xuất ${kind} cho KPI hiệu suất ${e.employeeName} kỳ ${e.period}: ${e.evaluationStatus} → ${projectedStatus}.`,
    disputedCriterionCodes, disputedTaskIds, deadlineAt,
    criteriaScores: scoreItems(e, computed),
    taskGroupScore: computed ? computed.taskGroupScore : e.taskGroupScore,
    projectedFinalScore: computed ? computed.finalScore : e.finalScore,
    warnings, executed: false as const,
  });
  return { preview, args, content, evaluation: e };
}

// ---- task preview builder (pure read; reused for 409 rebuilds) ----
async function buildTaskPreview(u: AuthenticatedUser, kind: string, target: { policyId?: string; taskId?: string }, content: Record<string, unknown>, clientRequestId: string) {
  const willCreate: C.PerformanceKpiTaskActionItem[] = [], willSkip: C.PerformanceKpiTaskActionItem[] = [], blocked: C.PerformanceKpiTaskActionItem[] = [];
  const warnings: string[] = [];
  let period: string | null = null, policyId: string | null = null, expectedVersion = 0;

  if (kind === 'open_period') {
    policyAuthority(u);
    const p = await pget(Policy, C.PerformancePolicySchema, target.policyId!);
    period = p.period; policyId = p.id; expectedVersion = p.version;
    if (p.status === 'CLOSED') warnings.push('Kỳ đã đóng hành chính.');
    for (const employeeId of [...new Set(content.employeeIds as string[])]) {
      try {
        const employee = await subject(employeeId);
        const role = await employeeRole(employeeId);
        if (role !== p.role) { blocked.push(item({ employeeId, employeeName: employee.fullName ?? employee.full_name ?? null, storeId: String(employee.storeId), code: 'RESPONSIBILITY_CONFLICT', message: 'Nhân viên không thuộc vai trò framework.', fixHint: 'Chọn chính sách đúng vai trò.' })); continue; }
        try { requireCapability(u, 'performance_kpi.policy_manage', resourceScope(u, { storeId: String(employee.storeId), storeMappingRef: employee.storeMappingRef, employeeId })); }
        catch { blocked.push(item({ employeeId, storeId: String(employee.storeId), code: 'RBAC_DENIED', message: 'Cửa hàng không thuộc phạm vi được cấp.', fixHint: 'Xin cấp phạm vi performance_kpi.policy_manage cho cửa hàng.' })); continue; }
        const existing = await Evaluation.findOne({ employeeId: new mongoose.Types.ObjectId(employeeId), period }).lean() as { frameworkVersion?: number; performanceSnapshot?: unknown } | null;
        if (existing) {
          if ((existing.frameworkVersion ?? 0) >= 2) {
            const ev = C.PerformanceEvaluationSchema.parse(existing.performanceSnapshot);
            if (ev.policyId === p.id) willSkip.push(item({ employeeId, evaluationId: ev.id, employeeName: ev.employeeName, storeId: ev.storeId, currentStatus: ev.evaluationStatus }));
            else blocked.push(item({ employeeId, evaluationId: ev.id, code: 'RESPONSIBILITY_CONFLICT', message: 'Nhân viên đã có framework khác trong kỳ.' }));
          } else blocked.push(item({ employeeId, code: 'INVALID_STATE', message: 'Nhân viên đã có F5 phiên bản cũ trong kỳ; giữ nguyên, không chuyển công thức.' }));
          continue;
        }
        willCreate.push(item({ employeeId, employeeName: employee.fullName ?? employee.full_name ?? null, storeId: String(employee.storeId), projectedStatus: 'OPEN' }));
      } catch (err: unknown) {
        if (!(err instanceof WorkflowError)) throw err;
        blocked.push(item({ employeeId, code: err.code, message: err.message }));
      }
    }
    if (!willCreate.length && !willSkip.length) warnings.push('Không có nhân viên nào sẽ được tạo evaluation.');
    const argsBase = {
      kind, policyId: p.id, expectedVersion: p.version, planDigest: '', clientRequestId,
      employeeIds: content.employeeIds as string[],
      ...(content.reason ? { reason: content.reason } : {}),
    };
    const targetDigest = {
      policy: { id: p.id, version: p.version, status: p.status },
      willCreate: willCreate.map(i => ({ employeeId: i.employeeId, storeId: i.storeId })),
      blocked: blocked.map(i => ({ employeeId: i.employeeId, code: i.code })),
    };
    const args: C.PerformanceKpiTaskActionArgs = C.PerformanceKpiTaskActionArgsSchema.parse({
      ...argsBase, planDigest: taskPlanDigest(kind, argsBase as C.PerformanceKpiTaskActionArgs, targetDigest, content),
    });
    const preview: C.PerformanceKpiTaskActionPreview = C.PerformanceKpiTaskActionPreviewSchema.parse({
      kind, period, policyId: p.id, expectedVersion: p.version, planDigest: taskPlanDigest(kind, args, targetDigest, content),
      summary: `Đề xuất mở kỳ KPI hiệu suất ${p.period} cho ${(content.employeeIds as string[])?.length ?? 0} nhân sự: tạo ${willCreate.length}, bỏ qua ${willSkip.length}, chặn ${blocked.length}.`,
      willCreate, willSkip, blocked, warnings, executed: false as const,
    });
    return { preview, args, content, targetDigest, period };
  } else if (kind === 'task.assign' && Array.isArray(content.assignments)) {
    const rawAssignments = content.assignments as { taskId: string; assigneeEmployeeId: string }[];
    if (!rawAssignments.length || rawAssignments.length > 100) pfail('RUBRIC_INVALID', 'assignments phải từ 1 đến 100 mục.', 400);
    const taskIds = rawAssignments.map(a => a.taskId);
    if (new Set(taskIds).size !== taskIds.length) pfail('RUBRIC_INVALID', 'Danh sách assignments chứa taskId trùng lặp.', 400);
    const taskSnapshots: { taskId: string; version: number; policy: { id: string; version: number; status: string; rules: C.PerformancePolicy['policy'] } | null }[] = [];

    for (const itemPlan of rawAssignments) {
      const { taskId, assigneeEmployeeId: assignee } = itemPlan;
      try {
        const t = await getTask(u, taskId);
        if (!period) period = t.kpiPeriod;
        const base = { taskId: t.id, title: t.title, taskWeightPercent: t.taskWeightPercent, dueAt: t.extendedDueAt ?? t.dueAt, currentStatus: t.status, storeId: t.storeId };
        if (!['DRAFT', 'ASSIGNED', 'PENDING_ACCEPTANCE'].includes(t.status) || t.responsibilitySegments.length) {
          blocked.push(item({ ...base, employeeId: assignee, code: 'INVALID_STATE', message: 'Đã nhận trách nhiệm; dùng bàn giao thay vì giao đè.' }));
          taskSnapshots.push({ taskId: t.id, version: t.version, policy: null });
          continue;
        }
        try {
          const role = await employeeRole(assignee);
          const pol = await getTaskPolicy(t.kpiPeriod, role);
          await directManager(u, assignee, t.storeId, 'task.assign');
          willCreate.push(item({
            ...base,
            employeeId: assignee,
            projectedStatus: 'ASSIGNED',
            dueAt: t.dueAt,
            message: `Hạn nhận: ${pol.policy.acceptanceWindowWorkingDays} ngày làm việc.`,
            taskVersion: t.version,
          }));
          taskSnapshots.push({ taskId: t.id, version: t.version, policy: { id: pol.id, version: pol.version, status: pol.status, rules: pol.policy } });
        } catch (err: unknown) {
          if (!(err instanceof WorkflowError)) throw err;
          blocked.push(item({ ...base, employeeId: assignee, code: err.code, message: err.message }));
          taskSnapshots.push({ taskId: t.id, version: t.version, policy: null });
        }
      } catch (err: unknown) {
        if (!(err instanceof WorkflowError)) throw err;
        blocked.push(item({ taskId, employeeId: assignee, code: err.code, message: err.message }));
      }
    }
    if (!willCreate.length) warnings.push('Không có nhiệm vụ nào đủ điều kiện phân công.');

    const argsBase = {
      kind, expectedVersion: 0, planDigest: '', clientRequestId,
      assignments: rawAssignments as C.PerformanceKpiTaskAssignmentItem[],
      ...(content.reason ? { reason: content.reason } : {}),
    };
    const targetDigest = {
      authority: chatActionAuthority(u),
      tasks: taskSnapshots,
      willCreate: willCreate.map(i => ({ taskId: i.taskId, employeeId: i.employeeId, taskVersion: i.taskVersion })),
      blocked: blocked.map(i => ({ taskId: i.taskId, employeeId: i.employeeId, code: i.code })),
    };
    const args: C.PerformanceKpiTaskActionArgs = C.PerformanceKpiTaskActionArgsSchema.parse({
      ...argsBase, planDigest: taskPlanDigest(kind, argsBase as C.PerformanceKpiTaskActionArgs, targetDigest, content),
    });
    const preview: C.PerformanceKpiTaskActionPreview = C.PerformanceKpiTaskActionPreviewSchema.parse({
      kind, period, policyId: null, expectedVersion: 0, planDigest: taskPlanDigest(kind, args, targetDigest, content),
      summary: `Đề xuất task.assign hàng loạt: tạo ${willCreate.length}, chặn ${blocked.length}.`,
      willCreate, willSkip, blocked, warnings, executed: false as const,
    });
    return { preview, args, content, targetDigest, period };
  } else {
    const t = await getTask(u, target.taskId!);
    period = t.kpiPeriod; expectedVersion = t.version;
    const base = { taskId: t.id, title: t.title, taskWeightPercent: t.taskWeightPercent, dueAt: t.extendedDueAt ?? t.dueAt, currentStatus: t.status, storeId: t.storeId };
    if (kind === 'task.assign') {
      const rawAssignee = content.assigneeEmployeeId;
      if (typeof rawAssignee !== 'string' || !rawAssignee) pfail('RUBRIC_INVALID', 'task.assign cần assigneeEmployeeId.', 400);
      const assignee: string = rawAssignee;
      if (!['DRAFT', 'ASSIGNED', 'PENDING_ACCEPTANCE'].includes(t.status) || t.responsibilitySegments.length)
        blocked.push(item({ ...base, code: 'INVALID_STATE', message: 'Đã nhận trách nhiệm; dùng bàn giao thay vì giao đè.' }));
      else {
        try {
          const role = await employeeRole(assignee), pol = await getTaskPolicy(t.kpiPeriod, role);
          await directManager(u, assignee, t.storeId, 'task.assign');
          willCreate.push(item({ ...base, employeeId: assignee, projectedStatus: 'ASSIGNED', dueAt: t.dueAt, message: `Hạn nhận: ${pol.policy.acceptanceWindowWorkingDays} ngày làm việc.` }));
        } catch (err: unknown) {
          if (!(err instanceof WorkflowError)) throw err;
          blocked.push(item({ ...base, employeeId: assignee, code: err.code, message: err.message }));
        }
      }
    } else if (kind === 'task.accept') {
      if (u.employeeId !== t.assigneeEmployeeId) pfail('RBAC_DENIED', 'Chỉ người được giao nhiệm vụ được phản hồi.', 403);
      if (!['ASSIGNED', 'PENDING_ACCEPTANCE', 'HANDOVER'].includes(t.status) || t.assignmentStatus !== 'PENDING_ACCEPTANCE')
        blocked.push(item({ ...base, code: 'INVALID_STATE', message: 'Nhiệm vụ không còn chờ chấp nhận.' }));
      else willCreate.push(item({ ...base, employeeId: u.employeeId, projectedStatus: 'ACCEPTED' }));
    } else if (kind === 'task.submit') {
      if (u.employeeId !== t.assigneeEmployeeId) pfail('RBAC_DENIED', 'Chỉ người được giao nhiệm vụ được phản hồi.', 403);
      if (!['ACCEPTED', 'IN_PROGRESS', 'REJECTED'].includes(t.status) || t.assignmentStatus !== 'ACCEPTED')
        blocked.push(item({ ...base, code: 'TASK_NOT_ACCEPTED', message: 'Phải nhận nhiệm vụ trước khi nộp.' }));
      else if (t.templateSnapshot.steps.some(s => s.required && !t.stepProgress.find(p => p.code === s.code)?.done))
        blocked.push(item({ ...base, code: 'RUBRIC_MANDATORY_MISSING', message: 'Hoàn tất các bước bắt buộc trước khi nộp.', fixHint: 'Cập nhật progress các bước bắt buộc kèm bằng chứng.' }));
      else willCreate.push(item({ ...base, employeeId: u.employeeId, projectedStatus: 'PENDING_REVIEW' }));
    } else if (kind === 'task.evaluate') {
      const segment = t.responsibilitySegments.find(s => s.segmentId === content.segmentId);
      if (!segment || segment.status === 'RELEASED') blocked.push(item({ ...base, code: 'TASK_NOT_ACCEPTED', message: 'Chỉ chấm phần trách nhiệm đã chấp nhận.' }));
      else {
        await directManager(u, segment.employeeId, t.storeId, 'task.evaluate');
        const due = t.extendedDueAt ?? t.dueAt;
        if (!segment.submittedAt && new Date() < new Date(due)) blocked.push(item({ ...base, employeeId: segment.employeeId, code: 'TASK_NOT_DUE', message: 'Chưa tới hạn, không kết luận thất bại.' }));
        else if (!['ACCEPTED', 'IN_PROGRESS', 'PENDING_REVIEW', 'REJECTED', 'CANCELLED', 'HANDOVER', 'COMPLETED'].includes(t.status))
          blocked.push(item({ ...base, employeeId: segment.employeeId, code: 'INVALID_STATE', message: 'Chưa đủ điều kiện chấm.' }));
        else if (!segment.submittedAt && !content.employeeFault) blocked.push(item({ ...base, employeeId: segment.employeeId, code: 'REASON_REQUIRED', message: 'Phải xác minh trách nhiệm và nguyên nhân khi chưa nộp.' }));
        else {
          try {
            const scored = scoreTaskRubric({ ...t, submittedAt: segment.submittedAt ?? null, evidenceRefs: segment.evidenceRefs } as C.TaskInstance, content.segmentId as string, content);
            willCreate.push(item({ ...base, employeeId: segment.employeeId, projectedStatus: content.outcome === 'CONFIRM' ? 'COMPLETED' : 'REJECTED', message: `Tổng điểm rubric dự kiến: ${scored.totalScore}${scored.timeliness.onTime ? '' : ' (nộp muộn)'}.` }));
          } catch (err: unknown) {
            if (!(err instanceof WorkflowError)) throw err;
            blocked.push(item({ ...base, employeeId: segment.employeeId, code: err.code, message: err.message, fixHint: 'Điểm phải khớp rubric đã công bố; điểm > 0 cần bằng chứng.' }));
            warnings.push('Chấm nhiệm vụ bị chặn: điểm/rubric không hợp lệ sẽ bị service từ chối khi xác nhận.');
          }
        }
      }
    } else pfail('INVALID_STATE', 'Thao tác không được hỗ trợ.', 400);

    const argsBase = {
      kind, expectedVersion, planDigest: '', clientRequestId,
      ...(policyId ? { policyId } : {}), ...(target.taskId ? { taskId: target.taskId } : {}),
      ...(content.segmentId ? { segmentId: content.segmentId } : {}),
      ...(content.assigneeEmployeeId ? { assigneeEmployeeId: content.assigneeEmployeeId } : {}),
      ...(content.evidenceRefs ? { evidenceRefs: content.evidenceRefs } : {}),
      ...(content.reason ? { reason: content.reason } : {}),
    };
    const targetDigest = { task: { id: target.taskId, version: expectedVersion } };
    const args: C.PerformanceKpiTaskActionArgs = C.PerformanceKpiTaskActionArgsSchema.parse({
      ...argsBase, planDigest: taskPlanDigest(kind, argsBase as C.PerformanceKpiTaskActionArgs, targetDigest, content),
    });
    const preview: C.PerformanceKpiTaskActionPreview = C.PerformanceKpiTaskActionPreviewSchema.parse({
      kind, period, policyId, expectedVersion, planDigest: taskPlanDigest(kind, args, targetDigest, content),
      summary: `Đề xuất ${kind} cho nhiệm vụ ${target.taskId}: tạo ${willCreate.length}, chặn ${blocked.length}.`,
      willCreate, willSkip, blocked, warnings, executed: false as const,
    });
    return { preview, args, content, targetDigest, period };
  }
}

async function loadActionGuard(u: AuthenticatedUser, row: TaskActionRow | EvaluationActionRow) {
  if (row.type !== 'performance_kpi.task_action' && row.type !== 'performance_kpi.evaluation_action')
    pfail('NOT_FOUND', 'Không tìm thấy đề xuất KPI hiệu suất.', 404);
  if (row.securityVersion !== u.securityVersion || row.authorityHash !== chatActionAuthority(u))
    pfail('AUTHORITY_CHANGED', 'Quyền đã thay đổi. Hãy lập bản xem trước mới.', 403);
}

async function loadAction(u: AuthenticatedUser, id: string): Promise<TaskActionRow | EvaluationActionRow> {
  const found = await actionRows().findOne({ _id: C.RevenueKpiOpenActionIdSchema.parse(id), ownerId: u.userId }) as TaskActionRow | EvaluationActionRow | null;
  if (!found || !['performance_kpi.task_action', 'performance_kpi.evaluation_action'].includes(String(found.type)))
    pfail('NOT_FOUND', 'Không tìm thấy đề xuất KPI hiệu suất.', 404);
  await loadActionGuard(u, found);
  return found;
}

function taskActionDto(row: TaskActionRow): C.PerformanceKpiTaskAction {
  const status = row.status === 'PENDING' && row.expiresAt <= new Date().toISOString() ? 'EXPIRED' : row.status;
  return C.PerformanceKpiTaskActionSchema.parse({
    actionId: row._id, type: 'performance_kpi.task_action', status, expiresAt: row.expiresAt,
    requiresConfirmation: status === 'PENDING', executed: !!row.result,
    args: row.args, preview: row.preview, result: row.result ?? null,
  });
}
function evaluationActionDto(row: EvaluationActionRow): C.PerformanceKpiEvaluationAction {
  const status = row.status === 'PENDING' && row.expiresAt <= new Date().toISOString() ? 'EXPIRED' : row.status;
  return C.PerformanceKpiEvaluationActionSchema.parse({
    actionId: row._id, type: 'performance_kpi.evaluation_action', status, expiresAt: row.expiresAt,
    requiresConfirmation: status === 'PENDING', executed: !!row.result,
    args: row.args, preview: row.preview, result: row.result ?? null,
  });
}

export async function getChatPerformanceKpiAction(user: AuthenticatedUser, id: string): Promise<C.PerformanceKpiChatAction> {
  const u = await pfresh(user);
  const row = await loadAction(u, id);
  return row.type === 'performance_kpi.task_action' ? taskActionDto(row as TaskActionRow) : evaluationActionDto(row as EvaluationActionRow);
}

export class PerformanceKpiTaskPlanChangedError extends WorkflowError {
  constructor(readonly preview: C.PerformanceKpiTaskActionPreview) {
    super(409, 'PERFORMANCE_KPI_PLAN_CHANGED', 'Kế hoạch đã thay đổi. Kiểm tra bản xem trước mới trước khi xác nhận.');
  }
}
export class PerformanceKpiEvaluationPlanChangedError extends WorkflowError {
  constructor(readonly preview: C.PerformanceKpiEvaluationActionPreview) {
    super(409, 'PERFORMANCE_KPI_PLAN_CHANGED', 'KPI đã thay đổi. Kiểm tra bản xem trước mới trước khi xác nhận.');
  }
}

type PerformanceActionProposal =
  | { type: 'performance_kpi.task_action'; preview: C.PerformanceKpiTaskActionPreview; args: C.PerformanceKpiTaskActionArgs }
  | { type: 'performance_kpi.evaluation_action'; preview: C.PerformanceKpiEvaluationActionPreview; args: C.PerformanceKpiEvaluationActionArgs };
async function persistProposal(u: AuthenticatedUser, proposedId: string, proposal: PerformanceActionProposal, content: Record<string, unknown>) {
  const now = new Date();
  const common = {
    ownerId: u.userId, securityVersion: u.securityVersion ?? 0, authorityHash: chatActionAuthority(u),
    content, status: 'PENDING' as const,
    expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
    purgeAt: new Date(now.getTime() + 7 * 86400000),
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  };
  try {
    if (proposal.type === 'performance_kpi.task_action') {
      const row: TaskActionRow = { ...common, _id: proposedId, ...proposal };
      await actionRows().updateOne({ _id: proposedId }, { $setOnInsert: row }, { upsert: true });
    } else {
      const row: EvaluationActionRow = { ...common, _id: proposedId, ...proposal };
      await actionRows().updateOne({ _id: proposedId }, { $setOnInsert: row }, { upsert: true });
    }
  } catch (error) {
    // Concurrent previews for the same chat request race on the upsert; the loser
    // reads the winner's row instead of surfacing E11000.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}

// READ-ONLY preview for task kinds (open_period, task.assign/accept/submit/evaluate).
// Writes only the proposal row; zero domain writes — asserted by document counts in tests.
export async function previewPerformanceKpiTaskAction(user: AuthenticatedUser, kind: string,
  target: { policyId?: string; taskId?: string } = {}, content: Record<string, unknown> = {}, proposedId: string = randomUUID()) {
  C.RevenueKpiOpenActionIdSchema.parse(proposedId);
  if (!(kind in TASK_CONTENT)) pfail('INVALID_STATE', 'Thao tác không được hỗ trợ.', 400);
  const schema = TASK_CONTENT[kind]!;
  const validated = schema ? schema.parse(content) as Record<string, unknown> : {};
  const u = await pfresh(user);
  const built = await buildTaskPreview(u, kind, target, validated, proposedId);
  await ensureRevenueKpiStorage();
  await persistProposal(u, proposedId, { type: 'performance_kpi.task_action', preview: built.preview, args: built.args }, validated);
  const row = await loadAction(u, proposedId) as TaskActionRow;
  if (row.args.kind !== kind) pfail('VERSION_CONFLICT', 'Yêu cầu đã được dùng cho thao tác khác.');
  return { actionId: row._id, type: 'performance_kpi.task_action' as const, preview: row.preview, requiresConfirmation: true as const, executed: false as const };
}

// READ-ONLY preview for evaluation kinds. Score/evidence content is validated here
// and stored on the proposal — never accepted from the confirm payload.
export async function previewPerformanceKpiEvaluationAction(user: AuthenticatedUser, kind: string,
  target: { evaluationId: string }, content: Record<string, unknown> = {}, proposedId: string = randomUUID()) {
  C.RevenueKpiOpenActionIdSchema.parse(proposedId);
  if (!EVALUATION_CONTENT[kind]) pfail('INVALID_STATE', 'Thao tác không được hỗ trợ.', 400);
  const schema = EVALUATION_CONTENT[kind]!;
  const validated = schema ? schema.parse(content) as Record<string, unknown> : {};
  const u = await pfresh(user);
  const built = await buildEvaluationPreview(u, kind, C.PerformanceId.parse(target.evaluationId), validated, proposedId);
  await ensureRevenueKpiStorage();
  await persistProposal(u, proposedId, { type: 'performance_kpi.evaluation_action', preview: built.preview, args: built.args }, validated);
  const row = await loadAction(u, proposedId) as EvaluationActionRow;
  if (row.args.kind !== kind) pfail('VERSION_CONFLICT', 'Yêu cầu đã được dùng cho thao tác khác.');
  return { actionId: row._id, type: 'performance_kpi.evaluation_action' as const, preview: row.preview, requiresConfirmation: true as const, executed: false as const };
}

async function executeTaskAction(u: AuthenticatedUser, row: TaskActionRow, clientRequestId: string) {
  const args = row.args, content = row.content as Record<string, any>;
  const command = { expectedVersion: args.expectedVersion, clientRequestId };
  if (args.kind === 'open_period') {
    const p = await pget(Policy, C.PerformancePolicySchema, args.policyId!);
    const eligibleSet = new Set(
      [...row.preview.willCreate, ...row.preview.willSkip]
        .map(planned => planned.employeeId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    const rawIds = Array.isArray(args.employeeIds) ? args.employeeIds : [...eligibleSet];
    const eligibleEmployeeIds = [...new Set(rawIds.filter(id => eligibleSet.has(id)))];
    const blocked = row.preview.blocked;
    if (!eligibleEmployeeIds.length) {
      // ponytail: zero-eligible short circuit skips OpenPerformancePeriodRequestSchema min(1) and domain write
      return {
        outcome: 'NONE' as const,
        policy: p,
        tasks: [] as { taskId: string; employeeId: string | null; status: string }[],
        created: [],
        skipped: [],
        blocked,
        failed: [],
        summary: { created: 0, skipped: 0, blocked: blocked.length, failed: 0, total: blocked.length },
      };
    }
    const result = await openPerformancePeriod(u, p.period, {
      ...command, policyId: args.policyId, employeeIds: eligibleEmployeeIds, reason: content.reason ?? args.reason,
    });
    const byEmployee = new Map(result.evaluations.map((evaluation: C.PerformanceEvaluation) => [evaluation.employeeId, evaluation]));
    const created = row.preview.willCreate.map(planned => byEmployee.get(planned.employeeId ?? '')).filter((evaluation): evaluation is C.PerformanceEvaluation => !!evaluation)
      .map(evaluation => item({ employeeId: evaluation.employeeId, evaluationId: evaluation.id, employeeName: evaluation.employeeName, storeId: evaluation.storeId, currentStatus: evaluation.evaluationStatus, willCreate: true }));
    const skipped = row.preview.willSkip.map(planned => byEmployee.get(planned.employeeId ?? '')).filter((evaluation): evaluation is C.PerformanceEvaluation => !!evaluation)
      .map(evaluation => item({ employeeId: evaluation.employeeId, evaluationId: evaluation.id, employeeName: evaluation.employeeName, storeId: evaluation.storeId, currentStatus: evaluation.evaluationStatus, willSkip: true }));
    const total = created.length + skipped.length + blocked.length;
    return { outcome: created.length && (skipped.length || blocked.length) ? 'PARTIAL' as const : created.length ? 'FULL' as const : 'NONE' as const,
      policy: result.policy, tasks: [] as { taskId: string; employeeId: string | null; status: string }[], created, skipped, blocked, failed: [],
      summary: { created: created.length, skipped: skipped.length, blocked: blocked.length, failed: 0, total } };
  }
  if (args.kind === 'task.assign' && Array.isArray(args.assignments)) {
    const executedTasks: C.TaskInstance[] = [];
    const reason = (content.reason as string | undefined) ?? args.reason ?? 'Giao nhiệm vụ theo kế hoạch.';
    for (const planned of row.preview.willCreate) {
      const itemReqId = taskAssignItemRequestId(row._id, planned.taskId!);
      const currentTask = await pget(Task, C.TaskInstanceSchema, planned.taskId!);
      if (verifySelfAssignedTask(currentTask, row._id, planned, u, reason)) {
        executedTasks.push(currentTask);
      } else {
        const t = await mutateTask(u, planned.taskId!, 'assign', {
          expectedVersion: planned.taskVersion!,
          clientRequestId: itemReqId,
          assigneeEmployeeId: planned.employeeId!,
          reason,
        });
        executedTasks.push(t);
      }
    }
    const created = executedTasks.map(t => item({
      taskId: t.id, title: t.title, employeeId: t.assigneeEmployeeId, storeId: t.storeId,
      taskWeightPercent: t.taskWeightPercent, dueAt: t.extendedDueAt ?? t.dueAt, currentStatus: t.status, willCreate: true,
    }));
    const blocked = row.preview.blocked;
    const total = created.length + blocked.length;
    const outcome = created.length && blocked.length ? 'PARTIAL' as const : created.length ? 'FULL' as const : 'NONE' as const;
    return {
      outcome, policy: null,
      tasks: executedTasks.map(t => ({ taskId: t.id, employeeId: t.assigneeEmployeeId, status: t.status })),
      created, skipped: [], blocked, failed: [],
      summary: { created: created.length, skipped: 0, blocked: blocked.length, failed: 0, total },
    };
  }
  const t = args.kind === 'task.assign'
    ? await mutateTask(u, args.taskId!, 'assign', { ...command, assigneeEmployeeId: args.assigneeEmployeeId!, reason: content.reason ?? args.reason! })
    : args.kind === 'task.accept'
      ? await mutateTask(u, args.taskId!, 'accept', command)
      : args.kind === 'task.submit'
        ? await mutateTask(u, args.taskId!, 'submit', { ...command, reason: content.reason, evidenceRefs: content.evidenceRefs })
        : await mutateTask(u, args.taskId!, 'evaluate', {
          ...command, segmentId: content.segmentId ?? args.segmentId, criteriaScores: content.criteriaScores,
          workCompletedPercent: content.workCompletedPercent, outcome: content.outcome,
          lateReason: content.lateReason ?? null, employeeFault: content.employeeFault ?? false,
          reason: content.reason, evidenceRefs: content.evidenceRefs,
        });
  const taskItem = item({ taskId: t.id, title: t.title, employeeId: t.assigneeEmployeeId, storeId: t.storeId, taskWeightPercent: t.taskWeightPercent, dueAt: t.extendedDueAt ?? t.dueAt, currentStatus: t.status, willCreate: true });
  return {
    outcome: 'FULL' as const, policy: null,
    tasks: [{ taskId: t.id, employeeId: t.assigneeEmployeeId, status: t.status }],
    created: [taskItem], skipped: [], blocked: [], failed: [],
    summary: { created: 1, skipped: 0, blocked: 0, failed: 0, total: 1 },
  };
}

async function executeEvaluationAction(u: AuthenticatedUser, row: EvaluationActionRow, clientRequestId: string) {
  const args = row.args, content = row.content as Record<string, any>;
  const command = { expectedVersion: args.expectedVersion, clientRequestId };
  const evaluationId = args.evaluationId;
  let evaluation: C.PerformanceEvaluation;
  if (args.kind === 'evaluation.score')
    evaluation = await mutatePerformanceEvaluation(u, evaluationId, 'manager-score', { ...command, criteriaScores: content.criteriaScores, reason: content.reason, evidenceRefs: content.evidenceRefs });
  else if (args.kind === 'reconsideration.request')
    evaluation = await mutatePerformanceEvaluation(u, evaluationId, 'reconsideration', { ...command, reason: content.reason, evidenceRefs: content.evidenceRefs, criterionCodes: content.criterionCodes, taskIds: content.taskIds ?? [] });
  else if (args.kind === 'reconsideration.response')
    evaluation = await mutatePerformanceEvaluation(u, evaluationId, 'reconsideration-response', { ...command, decision: content.decision, reason: content.reason, evidenceRefs: content.evidenceRefs, ...(content.criteriaScores ? { criteriaScores: content.criteriaScores } : {}) });
  else if (args.kind === 'appeal.request')
    evaluation = await mutatePerformanceEvaluation(u, evaluationId, 'appeal', { ...command, reason: content.reason, evidenceRefs: content.evidenceRefs, criterionCodes: content.criterionCodes, taskIds: content.taskIds ?? [] });
  else
    evaluation = await mutatePerformanceEvaluation(u, evaluationId, 'appeal-decision', { ...command, decision: content.decision, reason: content.reason, evidenceRefs: content.evidenceRefs, ...(content.criteriaScores ? { criteriaScores: content.criteriaScores } : {}) });
  return { evaluation };
}

// Terminal outcomes replay the stored result; recovery requires the exact
// approved payload (decisionHash), and a stale plan fails closed with a fresh
// preview via PERFORMANCE_KPI_PLAN_CHANGED 409.
export async function decideChatPerformanceKpiAction(user: AuthenticatedUser, id: string, raw: unknown): Promise<C.PerformanceKpiChatAction> {
  return withCrmWriter(async () => {
    const u = await pfresh(user);
    let row = await loadAction(u, id);
    const nowIsoStr = nowIso();
    if (row.status === 'EXECUTED' || row.status === 'CANCELLED')
      return row.type === 'performance_kpi.task_action' ? taskActionDto(row as TaskActionRow) : evaluationActionDto(row as EvaluationActionRow);
    const isEval = row.type === 'performance_kpi.evaluation_action';
    const decision = isEval
      ? C.PerformanceKpiEvaluationActionDecisionSchema.parse(raw)
      : C.PerformanceKpiTaskActionDecisionSchema.parse(raw);
    const unexpiredClaimFilter = { $expr: { $gt: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } };
    const expirePending = async () => {
      const appNow = nowIso();
      const expired = await actionRows().findOneAndUpdate(
        { _id: id, status: 'PENDING', $or: [
          { expiresAt: { $lte: appNow } },
          { $expr: { $lte: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } },
        ] },
        { $set: { status: 'EXPIRED', updatedAt: appNow } }, { returnDocument: 'after' });
      if (expired) pfail('ACTION_EXPIRED', 'Đề xuất đã hết hạn. Hãy lập bản xem trước mới.');
      pfail('ACTION_DECIDED', 'Đề xuất đã được xử lý.');
    };
    if (row.status === 'PENDING') {
      if (row.expiresAt <= nowIsoStr) await expirePending();
      if (!decision.approve) {
        const cancelled = await actionRows().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
          { $set: { status: 'CANCELLED', decisionHash: digest(decision), updatedAt: nowIsoStr }, $unset: { purgeAt: '' } });
        if (!cancelled.modifiedCount) await expirePending();
        row = { ...row, status: 'CANCELLED', decisionHash: digest(decision) } as typeof row;
        return isEval ? evaluationActionDto(row as EvaluationActionRow) : taskActionDto(row as TaskActionRow);
      }
      const leaseUntil = new Date(Date.now() + 60000).toISOString();
      const claimed = await actionRows().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
        { $set: { status: 'CONFIRMED', decisionHash: digest(decision), leaseUntil, updatedAt: nowIsoStr }, $unset: { purgeAt: '' } });
      if (!claimed.modifiedCount) await expirePending();
      row = { ...row, status: 'CONFIRMED', decisionHash: digest(decision), leaseUntil, freshClaim: true } as typeof row;
    }
    if (row.status === 'CONFIRMED' || row.status === 'FAILED') {
      // Only a claim left by an earlier crashed worker must wait out the lease.
      if (row.status === 'CONFIRMED' && !row.freshClaim && row.leaseUntil && row.leaseUntil > nowIsoStr)
        pfail('ACTION_DECIDED', 'Đề xuất đang được xử lý. Tải lại sau ít phút.');
      if (!decision.approve || !row.decisionHash || digest(decision) !== row.decisionHash)
        pfail('ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      const newLeaseUntil = new Date(Date.now() + 60000).toISOString();
      if (row.status === 'CONFIRMED' && !row.freshClaim) {
        const claimed = await actionRows().updateOne(
          {
            _id: id,
            status: 'CONFIRMED',
            $expr: { $lte: [{ $dateFromString: { dateString: '$leaseUntil' } }, '$$NOW'] },
          },
          { $set: { leaseUntil: newLeaseUntil, updatedAt: nowIsoStr }, $unset: { purgeAt: '' } }
        );
        if (!claimed.modifiedCount) pfail('ACTION_DECIDED', 'Đề xuất đang được xử lý. Tải lại sau ít phút.');
      } else if (row.status === 'FAILED') {
        const claimed = await actionRows().updateOne(
          { _id: id, status: 'FAILED' },
          { $set: { status: 'CONFIRMED', leaseUntil: newLeaseUntil, updatedAt: nowIsoStr }, $unset: { purgeAt: '' } }
        );
        if (!claimed.modifiedCount) pfail('ACTION_DECIDED', 'Đề xuất đã được xử lý.');
      }
      const markFailed = async () => { await actionRows().updateOne({ _id: id, status: 'CONFIRMED' },
        { $set: { status: 'FAILED', updatedAt: nowIsoStr }, $unset: { leaseUntil: '' } }); };
      try {
        const args = row.args as { expectedVersion: number; planDigest: string };
        const command = decision as { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string };
        if (command.expectedVersion !== args.expectedVersion || command.planDigest !== args.planDigest) throw await planChanged(u, row);
        // Re-derive the digest from live data before dispatching: any drift after
        // the preview fails closed here, before the domain service sees the call.
        if (row.type === 'performance_kpi.task_action') {
          const r = row as TaskActionRow;
          const target = r.args.kind === 'open_period' ? { policyId: r.args.policyId! } : (r.args.taskId ? { taskId: r.args.taskId } : {});
          if (r.args.kind === 'task.assign' && Array.isArray(r.args.assignments) && !row.freshClaim) {
            const reason = (r.content.reason as string | undefined) ?? r.args.reason ?? 'Giao nhiệm vụ theo kế hoạch.';
            const rawAssignments = r.args.assignments as { taskId: string; assigneeEmployeeId: string }[];
            let hasDrift = false;
            const recTaskSnapshots: {
              taskId: string;
              version: number;
              policy: { id: string; version: number; status: string; rules: C.PerformancePolicy['policy'] } | null;
            }[] = [];
            const recWillCreate: { taskId: string; employeeId: string; taskVersion: number }[] = [];
            const recBlocked: { taskId: string | null; employeeId: string | null; code: string | null }[] = [];

            for (const itemPlan of rawAssignments) {
              const { taskId, assigneeEmployeeId: assignee } = itemPlan;
              const planned = r.preview.willCreate.find(p => p.taskId === taskId);
              if (planned) {
                let currentTask: C.TaskInstance;
                try {
                  currentTask = await getTask(u, taskId);
                } catch (err: unknown) {
                  if (!(err instanceof WorkflowError)) throw err;
                  hasDrift = true;
                  continue;
                }
                const isSelfAssigned = verifySelfAssignedTask(currentTask, r._id, planned, u, reason);
                if (isSelfAssigned) {
                  try {
                    const role = await employeeRole(planned.employeeId!);
                    const pol = await getTaskPolicy(currentTask.kpiPeriod, role);
                    await directManager(u, planned.employeeId!, currentTask.storeId, 'task.assign');
                    recTaskSnapshots.push({
                      taskId: currentTask.id,
                      version: planned.taskVersion!,
                      policy: { id: pol.id, version: pol.version, status: pol.status, rules: pol.policy },
                    });
                    recWillCreate.push({
                      taskId: planned.taskId!,
                      employeeId: planned.employeeId!,
                      taskVersion: planned.taskVersion!,
                    });
                  } catch (err: unknown) {
                    if (!(err instanceof WorkflowError)) throw err;
                    hasDrift = true;
                  }
                } else {
                  if (currentTask.version !== planned.taskVersion) hasDrift = true;
                  else if (!['DRAFT', 'ASSIGNED', 'PENDING_ACCEPTANCE'].includes(currentTask.status) || currentTask.responsibilitySegments.length) hasDrift = true;
                  try {
                    const role = await employeeRole(assignee);
                    const pol = await getTaskPolicy(currentTask.kpiPeriod, role);
                    await directManager(u, assignee, currentTask.storeId, 'task.assign');
                    recTaskSnapshots.push({
                      taskId: currentTask.id,
                      version: currentTask.version,
                      policy: { id: pol.id, version: pol.version, status: pol.status, rules: pol.policy },
                    });
                    recWillCreate.push({
                      taskId: currentTask.id,
                      employeeId: assignee,
                      taskVersion: currentTask.version,
                    });
                  } catch (err: unknown) {
                    if (!(err instanceof WorkflowError)) throw err;
                    hasDrift = true;
                  }
                }
              } else {
                try {
                  const t = await getTask(u, taskId);
                  const base = { taskId: t.id, title: t.title, taskWeightPercent: t.taskWeightPercent, dueAt: t.extendedDueAt ?? t.dueAt, currentStatus: t.status, storeId: t.storeId };
                  if (!['DRAFT', 'ASSIGNED', 'PENDING_ACCEPTANCE'].includes(t.status) || t.responsibilitySegments.length) {
                    recBlocked.push({ taskId: t.id, employeeId: assignee, code: 'INVALID_STATE' });
                    recTaskSnapshots.push({ taskId: t.id, version: t.version, policy: null });
                  } else {
                    try {
                      const role = await employeeRole(assignee);
                      const pol = await getTaskPolicy(t.kpiPeriod, role);
                      await directManager(u, assignee, t.storeId, 'task.assign');
                      recWillCreate.push({ taskId: t.id, employeeId: assignee, taskVersion: t.version });
                      recTaskSnapshots.push({
                        taskId: t.id,
                        version: t.version,
                        policy: { id: pol.id, version: pol.version, status: pol.status, rules: pol.policy },
                      });
                    } catch (err: unknown) {
                      if (!(err instanceof WorkflowError)) throw err;
                      recBlocked.push({ taskId: t.id, employeeId: assignee, code: err.code });
                      recTaskSnapshots.push({ taskId: t.id, version: t.version, policy: null });
                    }
                  }
                } catch (err: unknown) {
                  if (!(err instanceof WorkflowError)) throw err;
                  recBlocked.push({ taskId, employeeId: assignee, code: err.code });
                }
              }
            }

            const recTargetDigest = {
              authority: chatActionAuthority(u),
              tasks: recTaskSnapshots,
              willCreate: recWillCreate,
              blocked: recBlocked,
            };
            const recDigest = taskPlanDigest(r.args.kind, r.args, recTargetDigest, r.content);
            if (hasDrift || recDigest !== r.args.planDigest) {
              const rebuilt = await buildTaskPreview(u, r.args.kind, target, r.content, command.clientRequestId);
              throw new PerformanceKpiTaskPlanChangedError(rebuilt.preview);
            }
          } else {
            const rebuilt = await buildTaskPreview(u, r.args.kind, target, r.content, command.clientRequestId);
            if (r.args.expectedVersion !== rebuilt.args.expectedVersion || rebuilt.preview.planDigest !== r.args.planDigest)
              throw new PerformanceKpiTaskPlanChangedError(rebuilt.preview);
          }
          if (row.freshClaim) {
            const unexpiredCheck = await actionRows().findOne({
              _id: id,
              status: 'CONFIRMED',
              $expr: { $gt: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] },
            });
            if (!unexpiredCheck) {
              await actionRows().updateOne(
                { _id: id, status: 'CONFIRMED', $expr: { $lte: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } },
                { $set: { status: 'EXPIRED', updatedAt: nowIso() }, $unset: { leaseUntil: '' } }
              );
              pfail('ACTION_EXPIRED', 'Đề xuất đã hết hạn. Hãy lập bản xem trước mới.');
            }
          }
          const result = await executeTaskAction(u, r, command.clientRequestId);
          const updated = { ...r, status: 'EXECUTED', result } as TaskActionRow;
          await actionRows().updateOne({ _id: id, status: 'CONFIRMED' },
            { $set: { status: 'EXECUTED', result, updatedAt: nowIsoStr } as Partial<TaskActionRow>, $unset: { leaseUntil: '', purgeAt: '' } });
          return taskActionDto(updated);
        }
        const r = row as EvaluationActionRow;
        const rebuilt = await buildEvaluationPreview(u, r.args.kind, r.args.evaluationId, r.content, command.clientRequestId);
        if (r.args.expectedVersion !== rebuilt.args.expectedVersion || rebuilt.preview.planDigest !== r.args.planDigest)
          throw new PerformanceKpiEvaluationPlanChangedError(rebuilt.preview);
        if (row.freshClaim) {
          const unexpiredCheck = await actionRows().findOne({
            _id: id,
            status: 'CONFIRMED',
            $expr: { $gt: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] },
          });
          if (!unexpiredCheck) {
            await actionRows().updateOne(
              { _id: id, status: 'CONFIRMED', $expr: { $lte: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } },
              { $set: { status: 'EXPIRED', updatedAt: nowIso() }, $unset: { leaseUntil: '' } }
            );
            pfail('ACTION_EXPIRED', 'Đề xuất đã hết hạn. Hãy lập bản xem trước mới.');
          }
        }
          const result = await executeEvaluationAction(u, r, command.clientRequestId);
        const updated = { ...r, status: 'EXECUTED', result } as EvaluationActionRow;
        await actionRows().updateOne({ _id: id, status: 'CONFIRMED' },
          { $set: { status: 'EXECUTED', result, updatedAt: nowIsoStr } as Partial<EvaluationActionRow>, $unset: { leaseUntil: '', purgeAt: '' } });
        return evaluationActionDto(updated);
      } catch (error) {
        await markFailed();
        throw error;
      }
    }
    pfail('ACTION_DECIDED', 'Đề xuất đã hết hiệu lực. Hãy lập bản xem trước mới.');
  });
}

async function planChanged(u: AuthenticatedUser, row: TaskActionRow | EvaluationActionRow) {
  if (row.type === 'performance_kpi.task_action') {
    const r = row as TaskActionRow;
    const target = r.args.kind === 'open_period' ? { policyId: r.args.policyId! } : (r.args.taskId ? { taskId: r.args.taskId } : {});
    return new PerformanceKpiTaskPlanChangedError((await buildTaskPreview(u, r.args.kind, target, r.content, randomUUID())).preview);
  }
  const r = row as EvaluationActionRow;
  return new PerformanceKpiEvaluationPlanChangedError((await buildEvaluationPreview(u, r.args.kind, r.args.evaluationId, r.content, randomUUID())).preview);
}

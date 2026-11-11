import mongoose from 'mongoose';
import * as C from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { TaskInstanceModel } from '../models/TaskInstance.js';
import { getPerformanceEvaluation } from './performance-kpi-evaluation.service.js';
import { normalizedWeights, roundScore } from './performance-kpi-scoring.service.js';

const numberVN = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 });
const dateVN = new Intl.DateTimeFormat('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short', hour12: false,
});
const fmt = (value: number | null) => value === null ? 'chưa đủ dữ liệu' : numberVN.format(value);
const exclusionLabels: Record<string, string> = {
  NOT_YET_DUE: 'Nhiệm vụ thuộc kỳ KPI khác',
  ASSIGNED_NOT_ACCEPTED: 'Nhân viên chưa nhận trách nhiệm',
  OUTSIDE_RESPONSIBILITY_PERIOD: 'Thời gian chịu trách nhiệm nằm ngoài kỳ',
  HANDOVER_RELEASED: 'Đã được miễn trách nhiệm sau bàn giao',
  APPROVED_LEAVE: 'Nghỉ phép đã được duyệt',
  CANCELLED_EXTERNAL: 'Đã hủy do quản lý hoặc lý do khách quan',
};
const defaultCriterionNames: Record<string, string> = {
  completeness: 'Mức hoàn thành',
  accuracy: 'Chất lượng và độ chính xác',
  timeliness: 'Đúng hạn',
  evidence: 'Bằng chứng và tuân thủ',
};

export async function explainPerformanceKpi(user: AuthenticatedUser, id: string) {
  const evaluation = await getPerformanceEvaluation(user, id);
  const included = evaluation.taskBreakdown.filter(t => t.inclusionStatus !== 'EXCLUDED');
  const counterfactuals = included.map(t => {
    const others = included.filter(o => o !== t);
    const weights = normalizedWeights(others.map(o => o.taskWeightPercent * o.weightSharePercent / 100));
    return {
      taskId: t.taskId,
      withoutTaskScore: others.length && others.every(o => o.score !== null)
        ? roundScore(others.reduce((sum, o, i) => sum + o.score! * weights[i] / 100, 0))
        : null,
      validOnlyWithApprovedRelease: true as const,
    };
  });
  const taskFormula = included.length
    ? included.map(t => `${fmt(t.normalizedWeightPercent)}% × ${fmt(t.score)}`).join(' + ') + ' = ' + fmt(evaluation.taskGroupScore)
    : 'Không có nhiệm vụ tính trong kỳ. Hệ thống phân bổ trọng số theo chính sách.';
  const assigners = [...new Set(evaluation.taskBreakdown.map(t => t.assigner))]
    .filter(value => /^[a-f0-9]{24}$/.test(value))
    .map(value => new mongoose.Types.ObjectId(value));
  const taskIds = [...new Set(included.filter(t => t.criteriaScores.length).map(t => t.taskId))];
  const [employees, tasks] = await Promise.all([
    assigners.length ? mongoose.connection.collection('employees')
      .find({ _id: { $in: assigners } }, { projection: { fullName: 1, full_name: 1 } }).limit(100).toArray() : [],
    taskIds.length ? TaskInstanceModel.find({ _id: { $in: taskIds } })
      .select('_id templateVersion templateSnapshot.qualityCriteria').lean<Array<{
        _id: string;
        templateVersion: number;
        templateSnapshot: Pick<C.TaskInstance['templateSnapshot'], 'qualityCriteria'>;
      }>>() : [],
  ]);
  const assignerNames = new Map(employees.map(e => [String(e._id), e.fullName ?? e.full_name]));
  const templates = new Map(tasks.map(t => [String(t._id), t]));
  const final = ['FINAL', 'CORRECTED'].includes(evaluation.evaluationStatus);
  const lines = [
    `KPI ${evaluation.period}: ${final ? 'điểm chính thức' : 'điểm tạm tính'} ${fmt(evaluation.finalScore)}. Điểm nhóm nhiệm vụ: ${fmt(evaluation.taskGroupScore)}.`,
    taskFormula,
  ];
  for (const task of evaluation.taskBreakdown) {
    if (task.inclusionStatus === 'EXCLUDED') {
      const due = dateVN.format(new Date(task.extendedDueAt ?? task.dueAt));
      lines.push(`${task.title} · Hạn ${due} · Không tính vào KPI. ${exclusionLabels[task.exclusionReason ?? ''] ?? 'Cần đối chiếu lý do'}.`);
      continue;
    }
    const status = task.inclusionStatus === 'PENDING_DISPUTE' ? 'Đang chờ giải quyết' : 'Được tính';
    lines.push(`${task.title} · ${status} · Điểm ${fmt(task.score)} · Trọng số ${fmt(task.normalizedWeightPercent)}% trong nhóm nhiệm vụ.`);
    const dates = [
      task.assignedAt ? 'Giao ' + dateVN.format(new Date(task.assignedAt)) : 'Chưa giao',
      task.acceptedAt ? 'Nhận ' + dateVN.format(new Date(task.acceptedAt)) : 'Chưa nhận',
      'Hạn ' + dateVN.format(new Date(task.extendedDueAt ?? task.dueAt)),
      task.submittedAt ? 'Nộp ' + dateVN.format(new Date(task.submittedAt)) : 'Chưa nộp',
    ];
    lines.push(`Người giao: ${assignerNames.get(task.assigner) ?? 'Người quản lý'}. ${dates.join(' · ')}.`);
    if (task.evaluatorComment) lines.push(`Nhận xét nghiệm thu: ${task.evaluatorComment}`);
    const template = templates.get(task.taskId);
    for (const [index, criterion] of task.criteriaScores.entries()) {
      const name = template?.templateVersion === task.templateVersion
        ? template.templateSnapshot?.qualityCriteria?.find(item => item.code === criterion.code)?.name
        : undefined;
      const fallback = Object.hasOwn(defaultCriterionNames, criterion.code)
        ? defaultCriterionNames[criterion.code] : `Tiêu chí ${index + 1}`;
      const label = name && name.trim().toLowerCase() !== criterion.code.toLowerCase() ? name : fallback;
      lines.push(`• ${label}: ${fmt(criterion.score)}/${fmt(criterion.maxScore)}. ${criterion.comment}`);
    }
    const evidence = [...new Set([...task.evidenceRefs, ...task.criteriaScores.flatMap(c => c.evidenceRefs)])];
    if (evidence.length) lines.push(`Bằng chứng: ${evidence.join(' · ')}`);
    const counterfactual = counterfactuals.find(c => c.taskId === task.taskId);
    if (counterfactual && task.score === 0) {
      lines.push(`Nếu loại nhiệm vụ này, điểm nhóm nhiệm vụ sẽ là ${fmt(counterfactual.withoutTaskScore)}. Chỉ loại khi việc miễn, chuyển hoặc hủy trách nhiệm đã được phê duyệt.`);
    }
  }
  return C.PerformanceExplainSchema.parse({
    evaluation, taskFormula, counterfactuals, summary: lines.join('\n'),
    advice: final ? [] : [
      'Nhân viên có thể gửi kiến nghị trong thời hạn ngay trong chat hoặc trên web.',
      'Nếu chưa thống nhất, nhân viên có thể gửi khiếu nại để cấp trên xem xét độc lập.',
      'Điểm tạm tính sẽ thành điểm chính thức sau khi hồ sơ được chốt.',
    ],
    model: 'stored-evidence-v2', degraded: false,
  });
}

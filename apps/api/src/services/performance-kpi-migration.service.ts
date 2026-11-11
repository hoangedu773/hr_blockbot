import mongoose from 'mongoose';
import * as C from '@hr-blockbot/contracts';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { EvaluationModel } from '../models/Evaluation.js';
import { PerformanceKpiPolicyModel } from '../models/PerformanceKpiPolicy.js';
import { digest } from './project-audit.service.js';
import {
  pfresh, pwrite, policyAuthority, scopedRead, subject, employeeRole, directEdge,
  pget, pfail, pHistory, verifyHistory, nowIso,
} from './performance-kpi-common.service.js';

export const migratePerformanceRequest = C.PerformanceCommandSchema.extend({
  policyId: C.PerformanceId, reason: C.PerformanceReason,
});

async function conversionContext(user: AuthenticatedUser, row: any, policyId?: string) {
  const employeeId = String(row.employeeId);
  const employee = await subject(employeeId);
  const storeId = String(employee.storeId);
  await scopedRead(user, employeeId, storeId);
  if (storeId !== String(row.storeId)) pfail('RESPONSIBILITY_CONFLICT', 'Cửa hàng trong hồ sơ chưa khớp nhân sự hiện hành. HR cần xác minh trước khi chuyển.');
  const role = await employeeRole(employeeId);
  const policyRow: any = policyId
    ? await PerformanceKpiPolicyModel.findById(policyId).lean()
    : await PerformanceKpiPolicyModel.findOne({ period: row.period, role }).lean();
  if (!policyRow) pfail('NOT_FOUND', 'HR cần công bố chính sách cho vai trò và kỳ này trước.');
  const policy = await pget(PerformanceKpiPolicyModel, C.PerformancePolicySchema, String(policyRow._id));
  if (policy.period !== row.period || policy.role !== role || policy.status === 'CLOSED')
    pfail('INVALID_STATE', 'Cần chính sách còn mở đúng kỳ và vai trò.');
  const managers = await mongoose.connection.collection('management_relations').find({
    employeeId: employee._id, storeId: employee.storeId,
  }).limit(101).toArray();
  if (managers.length > 100) pfail('RESPONSIBILITY_CONFLICT', 'Có quá nhiều quan hệ quản lý cần xác minh.');
  const eligible = new Set<string>();
  for (const edge of managers) {
    const managerId = String(edge.managerEmployeeId);
    if (!await directEdge(managerId, employeeId, storeId)) continue;
    const accounts = await mongoose.connection.collection('users').find({
      employeeId: edge.managerEmployeeId, status: 'active',
      'authorization.profile': role === 'SM' ? 'am' : 'sm',
    }).limit(2).toArray();
    if (accounts.length === 1) eligible.add(managerId);
  }
  if (eligible.size !== 1) pfail('REPORTING_RELATION_REQUIRED', 'HR cần xác minh đúng một người quản lý trực tiếp trước khi chuyển.', 409);
  return { employee, role, policy, evaluatorEmployeeId: [...eligible][0] };
}

export async function pendingPerformanceMigrations(user: AuthenticatedUser, period: string) {
  C.PerformanceMonth.parse(period);
  const current = await pfresh(user);
  policyAuthority(current);
  const rows = await EvaluationModel.find({
    period, frameworkVersion: { $not: { $gte: 2 } }, status: { $ne: 'PUBLISHED' },
  }).sort({ employeeName: 1, _id: 1 }).limit(501).lean();
  if (rows.length > 500) pfail('DATA_INSUFFICIENT', 'Danh sách vượt giới hạn kiểm tra.');
  const items = [];
  for (const row of rows as any[]) {
    try { await scopedRead(current, String(row.employeeId), String(row.storeId)); }
    catch (error: any) { if (error.status === 403) continue; throw error; }
    let policyId: string | null = null;
    let blockedReason: string | null = null;
    try { policyId = (await conversionContext(current, row)).policy.id; }
    catch (error: any) { if (!error.status) throw error; blockedReason = error.message; }
    items.push({
      id: String(row._id), employeeName: row.employeeName, period: row.period,
      version: row.version, policyId, blockedReason, canConvert: policyId !== null,
      selfReview: row.selfReview ?? null, managerReview: row.managerReview ?? null,
      managerScore: row.managerScore ?? null,
    });
  }
  return { items };
}

export async function migratePerformanceEvaluation(user: AuthenticatedUser, id: string, body: unknown) {
  C.PerformanceId.parse(id);
  const input = migratePerformanceRequest.parse(body);
  return pwrite(user, async current => {
    policyAuthority(current);
    const row: any = await EvaluationModel.findById(id).lean();
    if (!row) pfail('NOT_FOUND', 'Không tìm thấy hồ sơ.', 404);
    await scopedRead(current, String(row.employeeId), String(row.storeId));
    if (row.frameworkVersion >= 2) {
      const evaluation = C.PerformanceEvaluationSchema.parse(row.performanceSnapshot);
      verifyHistory(evaluation);
      const old = evaluation.history.find(h => h.requestId === input.clientRequestId);
      if (old?.by === current.userId && old.payloadHash === digest(input) &&
          old.action === 'EVALUATION_MIGRATED') return evaluation;
      pfail('VERSION_CONFLICT', 'Hồ sơ đã chuyển. Hãy tải lại.');
    }
    if (row.status === 'PUBLISHED') pfail('INVALID_STATE', 'Kết quả đã công bố được tra cứu trong lịch sử.');
    if (row.version !== input.expectedVersion) pfail('VERSION_CONFLICT', 'Hồ sơ vừa thay đổi. Hãy tải lại.');
    const { employee, role, policy, evaluatorEmployeeId } = await conversionContext(current, row, input.policyId);
    const at = nowIso();
    const previousReview = {
      selfReview: row.selfReview ?? null, managerReview: row.managerReview ?? null,
      managerScore: row.managerScore ?? null, machineScore: row.machineScore ?? null,
      sourceStatus: row.status, sourceVersion: row.version, migratedAt: at,
    };
    const next: any = {
      id, employeeId: String(row.employeeId), employeeName: employee.fullName ?? employee.full_name ?? row.employeeName,
      storeId: String(employee.storeId), storeName: current.canonical?.verifiedStores.find(s => s.id === String(employee.storeId))?.name ?? 'Cửa hàng',
      period: row.period, frameworkId: policy.frameworkId, frameworkVersion: policy.frameworkVersion,
      role, policyId: policy.id, policySnapshot: policy, evaluatorEmployeeId,
      evaluationStatus: row.selfReview ? 'SELF_REVIEW' : 'OPEN', criteriaScores: [], taskBreakdown: [],
      taskGroupScore: null, dataStatus: 'INSUFFICIENT_DATA', dataCoveragePercent: 0,
      weightRedistribution: null, finalScore: null,
      provisionalReason: 'Người quản lý chấm từng tiêu chí theo bằng chứng đã công bố.',
      finalScoreVersion: 0, selfReview: row.selfReview ?? null, selfEvidenceRefs: [],
      previousReview, reconsideration: null, appeal: null, provisionalAt: null,
      reconsiderationDeadlineAt: null, appealDeadlineAt: null, finalizedAt: null,
      version: row.version + 1, history: [], createdAt: at, updatedAt: at, isDemo: policy.isDemo,
    };
    next.history = [pHistory(null, next, current, 'EVALUATION_MIGRATED', input)];
    const evaluation = C.PerformanceEvaluationSchema.parse(next);
    const updated = await EvaluationModel.collection.findOneAndUpdate({
      _id: row._id, version: input.expectedVersion, status: { $ne: 'PUBLISHED' },
      frameworkVersion: { $not: { $gte: 2 } },
    }, { $set: {
      frameworkVersion: evaluation.frameworkVersion, frameworkId: evaluation.frameworkId,
      performanceSnapshot: evaluation, evaluationStatus: evaluation.evaluationStatus,
      criteriaScores: [], taskBreakdown: [], taskGroupScore: null, finalScoreVersion: 0,
      status: 'ANALYZED', machineScore: null, finalScore: null, breakdown: null,
      selfReview: null, managerReview: null, managerScore: null, analysis: null,
      objectiveCompletionScore: null, overrideReason: null, publishedAt: null, history: [],
      version: evaluation.version, changedBy: current.userId, changedAt: new Date(at),
      updatedAt: new Date(at), legacySnapshot: row, legacySnapshotHash: digest(row),
    } }, { returnDocument: 'after' });
    if (!updated) pfail('VERSION_CONFLICT', 'Hồ sơ vừa thay đổi. Hãy tải lại.');
    return evaluation;
  });
}


import mongoose from "mongoose";
import {
  KpiAnalysisSchema, KpiBreakdownSchema, KpiEvaluationSchema, KpiPeriodSchema,
  type KpiAnalysis, type KpiBreakdown, type KpiEvaluation,
} from "@hr-blockbot/contracts";
import { EvaluationModel } from "../models/Evaluation.js";
import { EmployeeModel } from "../models/Employee.js";
import { ProjectModel } from "../models/Project.js";
import { UserModel } from "../models/User.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { requireCapability, allowedStoreIds, employeeScopeQuery } from "./authorization-scope.service.js";
import { WorkflowError } from "./project-workflow.service.js";
import { analyzeKpiReviews } from "./ai-kpi.service.js";
import { notifyUser } from "./notification.service.js";

/**
 * F5 deterministic scoring. Weights/ceiling are group assumptions, not sourced
 * constants; every one is overridable so the thesis can report the exact set.
 */
export const KPI_DEFAULTS = Object.freeze({
  weightCompletion: 0.5, weightSemantic: 0.2, weightManager: 0.3, ceilingKappa: 0.25, scale: 100,
});
const numberEnv = (name: string, fallback: number): number => {
  const raw = process.env[name];
  if (raw === undefined || raw.trim() === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) throw new WorkflowError(503, "KPI_CONFIGURATION_INVALID", `Cấu hình ${name} không hợp lệ.`);
  return value;
};
export function kpiConfig() {
  const weights = {
    completion: numberEnv("KPI_WEIGHT_COMPLETION", KPI_DEFAULTS.weightCompletion),
    semantic: numberEnv("KPI_WEIGHT_SEMANTIC", KPI_DEFAULTS.weightSemantic),
    manager: numberEnv("KPI_WEIGHT_MANAGER", KPI_DEFAULTS.weightManager),
  };
  const kappa = numberEnv("KPI_CEILING_KAPPA", KPI_DEFAULTS.ceilingKappa);
  const scale = numberEnv("KPI_SCALE", KPI_DEFAULTS.scale);
  const values = [weights.completion, weights.semantic, weights.manager];
  if (values.some((value) => value < 0 || value > 1) || Math.abs(values.reduce((a, b) => a + b, 0) - 1) > 1e-9) {
    throw new WorkflowError(503, "KPI_CONFIGURATION_INVALID", "Trọng số KPI phải không âm và tổng bằng 1.");
  }
  if (kappa < 0 || kappa >= 1) throw new WorkflowError(503, "KPI_CONFIGURATION_INVALID", "Hệ số trần KPI phải trong [0, 1).");
  if (scale <= 0 || scale > 1000) throw new WorkflowError(503, "KPI_CONFIGURATION_INVALID", "Thang điểm KPI không hợp lệ.");
  return { weights, kappa, scale };
}

export function periodRange(period: string): { start: Date; end: Date } {
  if (!KpiPeriodSchema.safeParse(period).success) throw new WorkflowError(400, "VALIDATION_FAILED", "Kỳ KPI phải có dạng YYYY-MM.");
  const [year, month] = period.split("-").map(Number);
  return { start: new Date(Date.UTC(year, month - 1, 1)), end: new Date(Date.UTC(year, month, 1)) };
}
export function currentPeriod(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}
export function previousPeriods(period: string, count: number): string[] {
  const { start } = periodRange(period);
  const values: string[] = [];
  for (let index = count - 1; index >= 0; index -= 1) {
    const date = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() - index, 1));
    values.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return values;
}

const iso = (value: unknown): string | null => value ? new Date(value as string).toISOString() : null;
export function evaluationDto(row: any): KpiEvaluation {
  const analysis = row.analysis ? KpiAnalysisSchema.safeParse(row.analysis) : null;
  const breakdown = row.breakdown ? KpiBreakdownSchema.safeParse(row.breakdown) : null;
  return KpiEvaluationSchema.parse({
    id: String(row._id), period: row.period, employeeId: String(row.employeeId),
    employeeName: row.employeeName, departmentId: row.departmentId ? String(row.departmentId) : null,
    storeId: row.storeId ? String(row.storeId) : null, status: row.status,
    selfReview: row.selfReview ?? null, managerReview: row.managerReview ?? null,
    managerScore: row.managerScore ?? null, analysis: analysis?.success ? analysis.data : null,
    objectiveCompletionScore: row.objectiveCompletionScore ?? null,
    machineScore: row.machineScore ?? null, breakdown: breakdown?.success ? breakdown.data : null,
    finalScore: row.finalScore ?? null, overrideReason: row.overrideReason ?? null,
    changedBy: row.changedBy ?? null, changedAt: iso(row.changedAt), publishedAt: iso(row.publishedAt),
    version: row.version ?? 0, history: (row.history ?? []).map((entry: any) => ({
      at: new Date(entry.at).toISOString(), by: entry.by, action: entry.action,
      fromScore: entry.fromScore ?? null, toScore: entry.toScore ?? null, reason: entry.reason ?? null,
    })),
  });
}

/** Real completion only: projects completed/reviewed/progressing inside the period. */
export async function objectiveCompletionScore(employeeId: string, period: string): Promise<{ score: number | null; considered: number }> {
  const { start, end } = periodRange(period);
  const oid = new mongoose.Types.ObjectId(employeeId);
  const projects: any[] = await ProjectModel.find({
    $or: [{ responsibleEmployeeId: employeeId }, { assigneeId: oid }],
    $and: [{ $or: [{ dueDate: { $gte: start, $lt: end } }, { updatedAt: { $gte: start, $lt: end } }] }],
  }).select("status progress").limit(500).lean();
  if (!projects.length) return { score: null, considered: 0 };
  const value = (project: any): number => {
    if (project.status === "COMPLETED") return 1;
    if (project.status === "PENDING_REVIEW") return 0.9;
    if (project.status === "IN_PROGRESS") return 0.3 + 0.5 * Math.min(100, Math.max(0, Number(project.progress) || 0)) / 100;
    return 0;
  };
  const score = projects.reduce((sum, project) => sum + value(project), 0) / projects.length;
  return { score: Math.round(score * 10000) / 10000, considered: projects.length };
}

export function calculateMachineScore(input: { completion: number; semantic: number; manager: number }): { machineScore: number; breakdown: KpiBreakdown } {
  const { weights, kappa, scale } = kpiConfig();
  for (const value of [input.completion, input.semantic, input.manager]) {
    if (!Number.isFinite(value) || value < 0 || value > 1) throw new WorkflowError(400, "VALIDATION_FAILED", "Thành phần điểm KPI phải trong [0, 1].");
  }
  const weighted01 = weights.completion * input.completion + weights.semantic * input.semantic + weights.manager * input.manager;
  const ceiling01 = input.completion + kappa * (1 - input.completion);
  const capped = weighted01 > ceiling01;
  const machineScore = Math.round(Math.min(weighted01, ceiling01) * scale * 100) / 100;
  return { machineScore, breakdown: KpiBreakdownSchema.parse({
    weights, components: input, weighted01: Math.round(weighted01 * 10000) / 10000,
    ceiling01: Math.round(ceiling01 * 10000) / 10000, capped, scale,
  }) };
}

function history(user: AuthenticatedUser, action: "OPENED" | "SELF_REVIEW" | "MANAGER_REVIEW" | "ANALYZED" | "PUBLISHED" | "OVERRIDE", fromScore: number | null = null, toScore: number | null = null, reason: string | null = null) {
  return { at: new Date().toISOString(), by: user.employeeId || user.userId, action, fromScore, toScore, reason };
}
const actor = (user: AuthenticatedUser) => user.employeeId || user.userId;

function assertCanManage(user: AuthenticatedUser, evaluation: any, capability: "kpi.manage" | "kpi.publish" | "kpi.override") {
  if (String(evaluation.employeeId) === String(user.employeeId)) {
    throw new WorkflowError(403, "SELF_APPROVAL", "Không được tự đánh giá KPI của chính mình.");
  }
  const storeId = evaluation.storeId ? String(evaluation.storeId) : null;
  requireCapability(user, capability, {
    employeeId: String(evaluation.employeeId), storeId, canonicalStoreVerified: !!storeId,
    reportingVerified: true,
  });
}

export async function openPeriod(user: AuthenticatedUser, period: string) {
  periodRange(period);
  requireCapability(user, "kpi.manage");
  const employees: any[] = await EmployeeModel.find({
    $and: [employeeScopeQuery(user, "kpi.manage"), { status: "active" }],
  }).select("_id fullName full_name departmentId storeId").limit(5000).lean();
  let created = 0, existing = 0;
  const operations = employees.map((employee) => ({
    updateOne: {
      filter: { employeeId: employee._id, period },
      update: {
        $setOnInsert: {
          employeeId: employee._id, employeeName: employee.fullName || employee.full_name || String(employee._id),
          departmentId: employee.departmentId ?? null, storeId: employee.storeId ?? null, period,
          status: "OPEN", selfReview: null, managerReview: null, managerScore: null, analysis: null,
          objectiveCompletionScore: null, machineScore: null, breakdown: null, finalScore: null,
          overrideReason: null, changedBy: null, changedAt: null, publishedAt: null, version: 0,
          history: [history(user, "OPENED")],
        },
      },
      upsert: true,
    },
  }));
  for (let index = 0; index < operations.length; index += 200) {
    const result = await EvaluationModel.bulkWrite(operations.slice(index, index + 200), { ordered: false });
    created += result.upsertedCount;
    existing += result.matchedCount;
  }
  return { period, employees: employees.length, created, existing };
}

export async function listMine(user: AuthenticatedUser, period?: string) {
  if (!user.employeeId) throw new WorkflowError(403, "RBAC_DENIED", "Tài khoản chưa gắn hồ sơ nhân viên.");
  requireCapability(user, "kpi.read_self", { employeeId: user.employeeId });
  const filter: Record<string, any> = { employeeId: new mongoose.Types.ObjectId(user.employeeId) };
  if (period) { periodRange(period); filter.period = period; }
  const rows = await EvaluationModel.find(filter).sort({ period: -1 }).limit(period ? 1 : 12).lean();
  return rows.map(evaluationDto);
}

export async function getMine(user: AuthenticatedUser, period: string) {
  const rows = await listMine(user, period);
  return rows[0] ?? null;
}

export async function listDepartment(user: AuthenticatedUser, period: string) {
  periodRange(period);
  requireCapability(user, "kpi.read_department");
  const stores = allowedStoreIds(user, "kpi.read_department");
  const clauses: Record<string, any>[] = [];
  if (stores.length) clauses.push({ storeId: { $in: stores.map((id) => new mongoose.Types.ObjectId(id)) } });
  if (user.departmentId && mongoose.Types.ObjectId.isValid(user.departmentId)) clauses.push({ departmentId: new mongoose.Types.ObjectId(user.departmentId) });
  if (!clauses.length) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có phạm vi KPI phòng ban.");
  const rows = await EvaluationModel.find({ period, $or: clauses }).sort({ employeeName: 1, _id: 1 }).limit(2000).lean();
  return rows.map(evaluationDto);
}

export async function saveSelfReview(user: AuthenticatedUser, id: string, input: { text: string; expectedVersion: number }) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  const evaluation: any = await EvaluationModel.findById(id);
  if (!evaluation) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  if (String(evaluation.employeeId) !== String(user.employeeId)) throw new WorkflowError(403, "RBAC_DENIED", "Chỉ được tự nhận xét KPI của mình.");
  requireCapability(user, "kpi.read_self", { employeeId: user.employeeId });
  if (evaluation.status !== "OPEN") throw new WorkflowError(409, "KPI_LOCKED", "Kỳ đã phân tích; không sửa nhận xét.");
  const updated = await EvaluationModel.findOneAndUpdate(
    { _id: evaluation._id, version: input.expectedVersion, status: "OPEN" },
    { $set: { selfReview: input.text, changedBy: actor(user), changedAt: new Date() }, $inc: { version: 1 }, $push: { history: history(user, "SELF_REVIEW") } },
    { new: true }
  ).lean();
  if (!updated) throw new WorkflowError(409, "VERSION_CONFLICT", "Bản đánh giá đã thay đổi; tải lại trước khi lưu.");
  return evaluationDto(updated);
}

export async function saveManagerReview(user: AuthenticatedUser, id: string, input: { text: string; managerScore: number; expectedVersion: number }) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  const evaluation: any = await EvaluationModel.findById(id).lean();
  if (!evaluation) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  assertCanManage(user, evaluation, "kpi.manage");
  if (evaluation.status !== "OPEN") throw new WorkflowError(409, "KPI_LOCKED", "Kỳ đã phân tích; không sửa nhận xét.");
  const updated = await EvaluationModel.findOneAndUpdate(
    { _id: evaluation._id, version: input.expectedVersion, status: "OPEN" },
    { $set: { managerReview: input.text, managerScore: input.managerScore, changedBy: actor(user), changedAt: new Date() }, $inc: { version: 1 }, $push: { history: history(user, "MANAGER_REVIEW") } },
    { new: true }
  ).lean();
  if (!updated) throw new WorkflowError(409, "VERSION_CONFLICT", "Bản đánh giá đã thay đổi; tải lại trước khi lưu.");
  return evaluationDto(updated);
}

export async function analyzeEvaluation(user: AuthenticatedUser, id: string, expectedVersion: number) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  const evaluation: any = await EvaluationModel.findById(id).lean();
  if (!evaluation) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  assertCanManage(user, evaluation, "kpi.manage");
  if (evaluation.status !== "OPEN" || evaluation.machineScore !== null) throw new WorkflowError(409, "KPI_LOCKED", "Kỳ đã có điểm máy; không phân tích lại.");
  if (!evaluation.selfReview || !evaluation.managerReview || evaluation.managerScore === null) {
    throw new WorkflowError(409, "KPI_INPUT_INCOMPLETE", "Cần đủ tự nhận xét, nhận xét quản lý và điểm quản lý trước khi phân tích.");
  }
  const analysis: KpiAnalysis = await analyzeKpiReviews({ selfReview: evaluation.selfReview, managerReview: evaluation.managerReview });
  const { score: completion, considered } = await objectiveCompletionScore(String(evaluation.employeeId), evaluation.period);
  if (completion === null) throw new WorkflowError(409, "KPI_INPUT_INCOMPLETE", "Chưa có đề tài trong kỳ để tính mức hoàn thành thực tế; chưa thể chốt điểm máy.");
  const { machineScore, breakdown } = calculateMachineScore({ completion, semantic: analysis.suggestedScoreComponent, manager: evaluation.managerScore / 100 });
  const updated = await EvaluationModel.findOneAndUpdate(
    { _id: evaluation._id, version: expectedVersion, status: "OPEN" },
    {
      $set: {
        analysis: { ...analysis, analyzedAt: new Date().toISOString() }, objectiveCompletionScore: completion,
        machineScore, breakdown, status: "ANALYZED", changedBy: actor(user), changedAt: new Date(),
      },
      $inc: { version: 1 },
      $push: { history: history(user, "ANALYZED", null, machineScore, `${considered} đề tài; AI ${analysis.model}${analysis.degraded ? " (degraded)" : ""}`) },
    },
    { new: true }
  ).lean();
  if (!updated) throw new WorkflowError(409, "VERSION_CONFLICT", "Bản đánh giá đã thay đổi; tải lại trước khi phân tích.");
  return evaluationDto(updated);
}

export async function publishEvaluation(user: AuthenticatedUser, id: string, input: { expectedVersion: number; finalScore?: number; overrideReason?: string }) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  const evaluation: any = await EvaluationModel.findById(id).lean();
  if (!evaluation) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  assertCanManage(user, evaluation, "kpi.publish");
  if (evaluation.status !== "ANALYZED" || evaluation.machineScore === null) throw new WorkflowError(409, "KPI_NOT_READY", "Chỉ công bố kỳ đã có điểm máy.");
  const finalScore = input.finalScore ?? evaluation.machineScore;
  const overridden = Math.abs(finalScore - evaluation.machineScore) > 1e-9;
  if (overridden && !input.overrideReason) throw new WorkflowError(400, "OVERRIDE_REASON_REQUIRED", "Điểm chốt khác điểm máy phải kèm lý do.");
  const now = new Date();
  const updated: any = await EvaluationModel.findOneAndUpdate(
    { _id: evaluation._id, version: input.expectedVersion, status: "ANALYZED" },
    {
      $set: {
        status: "PUBLISHED", finalScore, publishedAt: now, changedBy: actor(user), changedAt: now,
        overrideReason: overridden ? input.overrideReason! : null,
      },
      $inc: { version: 1 },
      $push: { history: history(user, "PUBLISHED", evaluation.machineScore, finalScore, input.overrideReason ?? null) },
    },
    { new: true }
  ).lean();
  if (!updated) throw new WorkflowError(409, "VERSION_CONFLICT", "Bản đánh giá đã thay đổi; tải lại trước khi công bố.");
  const owner: any = await UserModel.findOne({ employeeId: updated.employeeId, status: "active" }).select("_id").lean();
  if (owner) {
    await notifyUser({
      userId: String(owner._id), employeeId: String(updated.employeeId), type: "kpi_published",
      title: `KPI ${updated.period} đã công bố`, body: `Điểm chốt của bạn là ${finalScore}. Mở mục KPI để xem giải trình.`,
      dedupeKey: `kpi_published:${String(updated._id)}`, entityKind: "evaluation", entityId: String(updated._id),
    });
    const { getIO } = await import("../socket.js");
    getIO()?.to(`user:${String(owner._id)}`).emit("kpi:updated", {
      evaluationId: String(updated._id), employeeId: String(updated.employeeId), period: updated.period,
      machineScore: updated.machineScore, finalScore, publishedAt: now.toISOString(),
    });
  }
  return evaluationDto(updated);
}

export async function overrideEvaluation(user: AuthenticatedUser, id: string, input: { expectedVersion: number; finalScore: number; reason: string }) {
  if (!mongoose.Types.ObjectId.isValid(id)) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  const evaluation: any = await EvaluationModel.findById(id).lean();
  if (!evaluation) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy bản đánh giá.");
  assertCanManage(user, evaluation, "kpi.override");
  if (evaluation.status !== "PUBLISHED") throw new WorkflowError(409, "KPI_NOT_READY", "Chỉ hiệu chỉnh kỳ đã công bố.");
  const now = new Date();
  const updated = await EvaluationModel.findOneAndUpdate(
    { _id: evaluation._id, version: input.expectedVersion, status: "PUBLISHED" },
    {
      $set: { finalScore: input.finalScore, overrideReason: input.reason, changedBy: actor(user), changedAt: now },
      $inc: { version: 1 },
      $push: { history: history(user, "OVERRIDE", evaluation.finalScore, input.finalScore, input.reason) },
    },
    { new: true }
  ).lean();
  if (!updated) throw new WorkflowError(409, "VERSION_CONFLICT", "Bản đánh giá đã thay đổi; tải lại trước khi hiệu chỉnh.");
  return evaluationDto(updated);
}

export async function kpiDashboard(user: AuthenticatedUser, period: string) {
  periodRange(period);
  requireCapability(user, "kpi.read_department");
  const stores = allowedStoreIds(user, "kpi.read_department");
  const clauses: Record<string, any>[] = [];
  if (stores.length) clauses.push({ storeId: { $in: stores.map((id) => new mongoose.Types.ObjectId(id)) } });
  if (user.departmentId && mongoose.Types.ObjectId.isValid(user.departmentId)) clauses.push({ departmentId: new mongoose.Types.ObjectId(user.departmentId) });
  if (!clauses.length) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có phạm vi KPI.");
  const scope = { $or: clauses };
  const periods = previousPeriods(period, 6);
  const rows: any[] = await EvaluationModel.find({ ...scope, period: { $in: periods } }).select("period status finalScore machineScore analysis").limit(10000).lean();
  const current = rows.filter((row) => row.period === period);
  const published = current.filter((row) => row.status === "PUBLISHED");
  const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null;
  const themes = new Map<string, number>(), risks = new Map<string, number>();
  for (const row of current) {
    for (const theme of row.analysis?.themes ?? []) themes.set(theme, (themes.get(theme) ?? 0) + 1);
    for (const signal of row.analysis?.riskSignals ?? []) risks.set(signal, (risks.get(signal) ?? 0) + 1);
  }
  const buckets = [[0, 20], [20, 40], [40, 60], [60, 80], [80, 100.01]] as const;
  return {
    period, published: published.length,
    pendingReview: current.filter((row) => ["OPEN", "ANALYZED"].includes(row.status)).length,
    averageFinalScore: average(published.map((row) => row.finalScore).filter((value) => typeof value === "number")),
    averageMachineScore: average(published.map((row) => row.machineScore).filter((value) => typeof value === "number")),
    distribution: buckets.map(([min, max]) => ({ label: `${min}-${max > 100 ? 100 : max}`, min, max: max > 100 ? 100 : max,
      count: published.filter((row) => typeof row.finalScore === "number" && row.finalScore >= min && row.finalScore < max).length })),
    trend: periods.map((value) => { const bucket = rows.filter((row) => row.period === value && row.status === "PUBLISHED");
      return { period: value, published: bucket.length, averageFinalScore: average(bucket.map((row) => row.finalScore).filter((score) => typeof score === "number")) }; }),
    themes: [...themes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([theme, count]) => ({ theme, count })),
    riskSignals: [...risks.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([signal, count]) => ({ signal, count })),
    generatedAt: new Date().toISOString(),
  };
}

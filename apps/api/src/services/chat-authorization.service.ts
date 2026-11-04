import { getRevenueKpiOpenAction, proposeRevenueKpiPeriodOpen } from './revenue-kpi.service.js';
import { explainPerformanceKpi } from './performance-kpi-explain.service.js';
import { getPerformanceEvaluation } from './performance-kpi-evaluation.service.js';
import mongoose from "mongoose";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { getJwtSecret } from "./auth.service.js";
import { resolvePrincipal } from "./principal.service.js";
import { requireCapability, employeeScopeQuery, allowedStoreIds } from "./authorization-scope.service.js";
import { projectReadScope, visibleProject, WorkflowError, assertProjectWrite, assertExecutionAllowed, objectId } from "./project-workflow.service.js";
import { EmployeeModel } from "../models/Employee.js";
import { ProjectModel } from "../models/Project.js";
import { approvedDocuments, documentAllowed, documentReceipt } from "./document-authorization.service.js";
import { chatWithAiService } from "./ai-client.service.js";
import { digest } from "./project-audit.service.js";
import { EvaluationModel } from "../models/Evaluation.js";
import { currentPeriod, periodRange } from "./kpi.service.js";
import { personalSchedule, datePlus } from "./scheduling.service.js";
import { RevenueKpiMonthSchema, ScheduleDateSchema } from "@hr-blockbot/contracts";

const receipts = () => mongoose.connection.collection<any>("chat_authorization_requests");
const contextHash = (user: AuthenticatedUser) => digest({ authorization: user.authorization, canonical: user.canonical, delegations: user.effectiveDelegations ?? [], employeeId: user.employeeId });
export const GatewayToolRequestSchema = z.object({ requestId: z.string().uuid(), tool: z.enum(["get_my_profile", "list_projects", "get_project_status", "query_policy", "directory", "submit_report", "get_my_kpi", "get_department_kpi", "get_upcoming_deadlines", "get_my_schedule", "preview_revenue_period_open", "validate_context"]),
  args: z.object({ projectId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), query: z.string().max(2000).optional(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), from: ScheduleDateSchema.optional(), to: ScheduleDateSchema.optional() }).strict().default({}) }).strict();
export function serviceKeyValid(provided: string): boolean {
  const expected = process.env.AI_SERVICE_API_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function beginAuthorizedChat(user: AuthenticatedUser, revenueOpenPeriod?: string) {
  requireCapability(user, "chatbot.data_read", { userId: user.userId, employeeId: user.employeeId });
  const requestId = randomUUID(), version = user.securityVersion ?? 0;
  await receipts().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await receipts().insertOne({ _id: requestId, userId: user.userId, securityVersion: version, contextHash: contextHash(user), status: "ACTIVE", expiresAt: new Date(Date.now() + 90000), documents: [], projects: [], schedules: [], performanceEvaluations: [], revenueOpenPeriod });
  const delegationToken = await new SignJWT({ av: version, requestId, purpose: "authorized-tools" }).setSubject(user.userId)
    .setProtectedHeader({ alg: "HS256" }).setAudience("hr-blockbot-scoped-tools").setIssuedAt().setExpirationTime("90s").sign(getJwtSecret());
  return { requestId, delegationToken, revenueOpenPeriod };
}
export async function executeGatewayTool(token: string, body: unknown) {
  const parsed = GatewayToolRequestSchema.safeParse(body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Tool/arguments are not allowlisted");
  let payload;
  try { ({ payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"], audience: "hr-blockbot-scoped-tools" })); }
  catch { throw new WorkflowError(401, "UNAUTHENTICATED", "Invalid scoped tool token"); }
  const { requestId, tool, args } = parsed.data;
  if (!payload.sub || payload.purpose !== "authorized-tools" || payload.requestId !== requestId || !Number.isSafeInteger(payload.av)) throw new WorkflowError(401, "UNAUTHENTICATED", "Scoped token binding mismatch");
  const user = await resolvePrincipal({ sub: payload.sub, role: "Employee", securityVersion: payload.av as number });
  requireCapability(user, "chatbot.data_read", { userId: user.userId, employeeId: user.employeeId });
  const request = await receipts().findOne({ _id: requestId, userId: user.userId, securityVersion: payload.av, status: "ACTIVE", expiresAt: { $gt: new Date() } });
  if (!request) throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request expired or closed");
  if (request.contextHash !== contextHash(user)) throw new WorkflowError(409, "CHAT_AUTHORIZATION_CHANGED", "Authority changed during context preparation");
  let result: unknown, documents: any[] = [], projects: any[] = [], schedules: any[] = [], performanceEvaluations: any[] = [];
  if (tool === "preview_revenue_period_open") {
    const { period } = z.object({ period: RevenueKpiMonthSchema }).strict().parse(args);
    if (period !== request.revenueOpenPeriod) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Kỳ KPI không khớp yêu cầu chat.');
    const proposal = await proposeRevenueKpiPeriodOpen(user, period, requestId);
    const bound = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } }, { $set: { revenueOpenActionId: proposal.actionId } });
    if (!bound.matchedCount) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Yêu cầu chat đã hết hạn.');
    return { result: { actionId: proposal.actionId, type: proposal.type, preview: proposal.preview, requiresConfirmation: true, executed: false }, proposalOnly: true };
  }
  if (tool === "get_my_profile") {
    requireCapability(user, "profile.read_self", { employeeId: user.employeeId });
    const employee: any = await EmployeeModel.findById(user.employeeId).select("fullName full_name job_title skills").lean();
    result = employee ? { fullName: employee.fullName || employee.full_name, jobTitle: employee.job_title ?? null, skills: employee.skills ?? [] } : { unavailable: true };
  } else if (tool === "list_projects") {
    const rows: any[] = await ProjectModel.find(projectReadScope(user)).select("title status progress assigneeId version").sort({ updatedAt: -1, _id: -1 }).limit(20).lean();
    projects = rows.map((row) => ({ projectId: String(row._id), version: row.version ?? 1 }));
    result = rows.map((row) => ({ projectId: String(row._id), title: row.title, status: row.status, progress: row.progress, version: row.version ?? 1 }));
  } else if (tool === "get_project_status" || tool === "submit_report") {
    if (!args.projectId) throw new WorkflowError(400, "VALIDATION_FAILED", "Canonical projectId required");
    const project = await visibleProject(user, args.projectId);
    projects = [{ projectId: String(project._id), version: project.version ?? 1 }];
    if (tool === "submit_report") {
      requireCapability(user, "reports.submit", { employeeId: user.employeeId }); assertProjectWrite(user, project); assertExecutionAllowed(project, true);
      if (project.status !== "IN_PROGRESS") throw new WorkflowError(409, "ILLEGAL_STATE_TRANSITION", "Report is not ready to submit");
      result = { proposalOnly: true, projectId: String(project._id), expectedVersion: project.version, requiresConfirmation: true, executed: false };
    } else result = { projectId: String(project._id), title: project.title, status: project.status, progress: project.progress };
  } else if (tool === "directory") {
    const rows: any[] = await EmployeeModel.find({ $and: [employeeScopeQuery(user, "directory.read_store"), { status: "active" }] }).select("fullName full_name job_title").sort({ fullName: 1, _id: 1 }).limit(20).lean();
    result = rows.map((row) => ({ fullName: row.fullName || row.full_name, jobTitle: row.job_title ?? null }));
  } else if (tool === "query_policy") {
    const rows = await approvedDocuments(user, args.query ?? "");
    documents = rows.map(({ document }) => documentReceipt(document));
    result = rows.map(({ document, text }) => ({ documentId: String(document._id), title: document.title, version: document.version ?? "", text: text.slice(0, 5000) }));
  } else if (tool === "get_my_kpi") {
    if (!user.employeeId) throw new WorkflowError(403, "RBAC_DENIED", "Tài khoản chưa gắn hồ sơ nhân viên");
    const period = args.period ?? currentPeriod();
    const row: any = await EvaluationModel.findOne({ employeeId: new mongoose.Types.ObjectId(user.employeeId), period }).lean();
    if (row?.frameworkVersion >= 2 && process.env.PERFORMANCE_KPI_ENABLED === 'true') {
      const explained = await explainPerformanceKpi(user, String(row._id));
      performanceEvaluations.push({ id: explained.evaluation.id, version: explained.evaluation.version });
      result = { kind: 'performance_kpi', period, summary: explained.summary, advice: explained.advice, available: true };
    } else {
    requireCapability(user, "kpi.read_self", { employeeId: user.employeeId });
    result = !row ? { period, available: false, message: "Chưa có kỳ đánh giá KPI cho tháng này." }
      : row.status === "PUBLISHED"
        ? { period, available: true, status: row.status, finalScore: row.finalScore, machineScore: row.machineScore,
            explanation: row.analysis?.explanation ?? null, themes: row.analysis?.themes ?? [], riskSignals: row.analysis?.riskSignals ?? [],
            overrideReason: row.overrideReason ?? null, publishedAt: row.publishedAt }
        : { period, available: false, status: row.status, message: "Kỳ đánh giá chưa được công bố; chỉ xem chi tiết sau khi quản lý chốt." };
    }
  } else if (tool === "get_department_kpi") {
    requireCapability(user, "kpi.read_department");
    const period = args.period ?? currentPeriod();
    periodRange(period);
    const stores = allowedStoreIds(user, "kpi.read_department");
    const clauses: Record<string, any>[] = [];
    if (stores.length) clauses.push({ storeId: { $in: stores.map((id) => new mongoose.Types.ObjectId(id)) } });
    if (user.departmentId && mongoose.Types.ObjectId.isValid(user.departmentId)) clauses.push({ departmentId: new mongoose.Types.ObjectId(user.departmentId) });
    if (!clauses.length) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có phạm vi KPI phòng ban");
    const rows: any[] = await EvaluationModel.find({ period, $or: clauses, frameworkVersion: { $not: { $gte: 2 } } }).select("status finalScore machineScore").limit(5000).lean();
    const published = rows.filter((row) => row.status === "PUBLISHED" && typeof row.finalScore === "number");
    const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null;
    result = { period, published: published.length, pendingReview: rows.length - published.length,
      averageFinalScore: average(published.map((row) => row.finalScore)),
      averageMachineScore: average(published.map((row) => row.machineScore).filter((value) => typeof value === "number")),
      note: "Chỉ số tổng hợp; không trả điểm hay nhận xét của từng nhân viên." };
  } else if (tool === "get_upcoming_deadlines") {
    const now = new Date(), soon = new Date(now.getTime() + 7 * 86400000);
    const rows: any[] = await ProjectModel.find({ $and: [projectReadScope(user), { status: { $in: ["ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW"] } }, { dueDate: { $ne: null, $lte: soon } }] })
      .select("title status dueDate progress version").sort({ dueDate: 1 }).limit(20).lean();
    projects = rows.map((row) => ({ projectId: String(row._id), version: row.version ?? 1 }));
    result = rows.map((row) => ({ projectId: String(row._id), title: row.title, status: row.status,
      dueDate: new Date(row.dueDate).toISOString(), daysLeft: Math.ceil((new Date(row.dueDate).getTime() - now.getTime()) / 86400000),
      progress: row.progress }));
  } else if (tool === "get_my_schedule") {
    const from = args.from ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const to = args.to ?? datePlus(from, 6), data = await personalSchedule(user, from, to);
    const items = data.assignments.map(({ weekVersion, ...a }) => a);
    schedules = [{ from, to, digest: digest(items) }];
    const localTime = (day: string, minutes: number) => datePlus(day, Math.floor(minutes / 1440)) + ' ' + String(Math.floor(minutes % 1440 / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
    result = { from, to, timezone: 'Asia/Ho_Chi_Minh', publishedOnly: true,
      items: items.slice(0, 30).map((a) => ({ date: a.date, shiftCode: a.shiftCode, shiftName: a.shiftName, storeName: a.storeName,
          sourceKind: a.source?.kind ?? 'MANAGER_PUBLISHED',
          sourceNote: a.source?.kind === 'DEMO_RANDOM' ? 'Lịch mẫu ngẫu nhiên theo yêu cầu chủ dự án; không phải bằng chứng đi làm thực tế.' : a.source?.kind === 'LEGACY_MATCHED' ? 'Đối chiếu mã ca từ lịch cũ, giờ lấy từ danh mục đã cấu hình.' : null,
        intervals: a.intervals.map((p) => ({ startsAtLocal: localTime(a.date, p.startMinute), endsAtLocal: localTime(a.date, p.endMinute) })) })), truncated: items.length > 30,
      message: items.length ? null : 'Chưa có ca đã công bố trong khoảng ngày này. Không suy từ lịch nguồn cũ hoặc mặc định là ngày nghỉ.' };
  } else if (tool === "validate_context") result = { valid: true };
  else result = { unavailable: true, reason: "Tool is outside Authorization V1; no guessed data" };
  const record = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } },
    { $addToSet: { documents: { $each: documents }, projects: { $each: projects }, schedules: { $each: schedules }, performanceEvaluations: { $each: performanceEvaluations } } });
  if (!record.matchedCount) throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request closed during read");
  return { result, proposalOnly: true };
}
function revenueOpenIntent(message: string) {
  const text = message.normalize('NFC').toLocaleLowerCase('vi');
  if (!/kpi\s+doanh\s+thu/.test(text) || !/(?:mở\s+kỳ|xem\s+trước.*mở|tạo\s+bản\s+nháp)/.test(text)) return undefined;
  const forward = text.match(/\b(20\d{2})[-/](1[0-2]|0?[1-9])(?!\d)/);
  if (forward) return forward[1] + '-' + forward[2].padStart(2, '0');
  const reverse = text.match(/\b(1[0-2]|0?[1-9])(?:[/. -]|\s+năm\s+)(20\d{2})\b/);
  return reverse ? reverse[2] + '-' + reverse[1].padStart(2, '0') : null;
}
export async function authorizedChat(user: AuthenticatedUser, message: string, conversationId?: string,
  onValidated?: (response: any, evidence: { documents: any[]; projects: any[]; schedules: any[]; performanceEvaluations: any[]; revenueOpenActionId?: string }) => Promise<void>) {
  const period = revenueOpenIntent(message);
  const authorization = await beginAuthorizedChat(user, period ?? undefined);
  try {
    const result: Awaited<ReturnType<typeof chatWithAiService>> = period === null
      ? { reply: 'Bạn muốn xem trước kỳ nào? Hãy ghi rõ tháng, ví dụ 11/2026.', citations: [], attachments: [], proposedAction: null, abstain: false }
      : await chatWithAiService(message, {}, conversationId, authorization);
    const current = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
    requireCapability(current, "chatbot.data_read", { userId: current.userId, employeeId: current.employeeId });
    const row = await receipts().findOne({ _id: authorization.requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } });
    if (!row) throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request no longer valid");
    if (row.contextHash !== contextHash(current)) throw new WorkflowError(409, "CHAT_AUTHORIZATION_CHANGED", "Authority changed while generating a response");
    const citations = [];
    for (const receipt of row.documents) {
      const document = await mongoose.connection.collection("policies").findOne({ _id: objectId(receipt.documentId) });
      if (!document || !documentAllowed(current, document) || documentReceipt(document).digest !== receipt.digest) throw new WorkflowError(403, "DOCUMENT_ACCESS_CHANGED", "Document ACL changed during response");
      citations.push({ document: String(document.title), version: String(document.version ?? ""), score: 1 });
    }
    for (const receipt of row.projects) {
      const project = await visibleProject(current, receipt.projectId);
      if ((project.version ?? 1) !== receipt.version) throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Project changed during response");
    }
    for (const receipt of row.schedules ?? []) {
      const data = await personalSchedule(current, receipt.from, receipt.to);
      if (digest(data.assignments.map(({ weekVersion, ...a }) => a)) !== receipt.digest) throw new WorkflowError(409, 'CHAT_RESOURCE_CHANGED', 'Lịch đã công bố vừa thay đổi. Vui lòng hỏi lại.');
    }
    for (const receipt of row.performanceEvaluations ?? []) {
      const evaluation = await getPerformanceEvaluation(current, receipt.id);
      if (evaluation.version !== receipt.version) throw new WorkflowError(409, 'CHAT_RESOURCE_CHANGED', 'KPI đã thay đổi trong khi trả lời. Vui lòng hỏi lại.');
    }
    // Provider output cannot invent citations, attachment access, or executable actions.
    const proposedAction = row.revenueOpenActionId ? await getRevenueKpiOpenAction(current, row.revenueOpenActionId) : null;
    const reply = proposedAction ? 'Đây là bản xem trước mở kỳ KPI doanh thu. Kiểm tra từng mục rồi xác nhận nếu muốn thực hiện.' : period ? 'Chưa lập được bản xem trước KPI doanh thu. Hãy kiểm tra quyền và kỳ đã tạo trên Web.' : result.reply;
    const response = { ...result, reply, citations, attachments: [], proposedAction };
    if (onValidated) await onValidated(response, { documents: row.documents, projects: row.projects, schedules: row.schedules ?? [], performanceEvaluations: row.performanceEvaluations ?? [], ...(proposedAction ? { revenueOpenActionId: proposedAction.actionId } : {}) });
    return response;
  } finally { await receipts().updateOne({ _id: authorization.requestId }, { $set: { status: "CLOSED" } }); }
}

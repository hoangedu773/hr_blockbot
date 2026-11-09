import { getRevenueKpiOpenAction, proposeRevenueKpiPeriodOpen, getMyRevenueKpi, getRevenueKpiDetail, listMyPendingActions, getMyTasks, previewRevenueAssignmentAction, getRevenueKpiAssignmentAction, decideRevenueKpiOpenAction, revenueKpiAssignmentResult, createRevenueKpiPeriod, saveRevenueKpiAssignment, revenueKpiEnabled, resolveRevenueKpiAssignmentCandidate } from './revenue-kpi.service.js';
import { computeStoreRevenue, priorMonth, targetFromGrowth } from './revenue-kpi-calc.service.js';
import { RevenueKpiPeriodModel } from '../models/RevenueKpiPeriod.js';
import { RevenueKpiAssignmentModel } from '../models/RevenueKpiAssignment.js';
import { EmployeeModel } from '../models/Employee.js';
import * as C from '@hr-blockbot/contracts';
import type { RevenueKpiCreatePeriodAction, RevenueKpiSaveAssignmentAction, RevenueKpiCreatePeriodArgs, RevenueKpiSaveAssignmentArgs } from '@hr-blockbot/contracts';
import { getChatPerformanceKpiAction, previewPerformanceKpiTaskAction, previewPerformanceKpiEvaluationAction } from './performance-kpi-action.service.js';
import { explainPerformanceKpi } from './performance-kpi-explain.service.js';
import { getPerformanceEvaluation } from './performance-kpi-evaluation.service.js';
import { suggestSuitableCandidates } from './task-suitability.service.js';
import mongoose from "mongoose";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { getJwtSecret } from "./auth.service.js";
import { resolvePrincipal } from "./principal.service.js";
import { requireCapability, employeeScopeQuery, allowedStoreIds } from "./authorization-scope.service.js";
import { projectReadScope, visibleProject, WorkflowError, assertProjectWrite, assertExecutionAllowed, objectId } from "./project-workflow.service.js";
import { withCrmWriter } from "./crm-writer.service.js";
import { ProjectModel } from "../models/Project.js";
import { approvedDocuments, documentAllowed, documentReceipt } from "./document-authorization.service.js";
import { chatWithAiService, streamChatWithAiService, type ChatResult } from "./ai-client.service.js";
import { digest } from "./project-audit.service.js";
import { EvaluationModel } from "../models/Evaluation.js";
import { currentPeriod, periodRange } from "./kpi.service.js";
import { personalSchedule, datePlus } from "./scheduling.service.js";
import { RevenueKpiMonthSchema, ScheduleDateSchema } from "@hr-blockbot/contracts";
type P5RevenueTargetMode = z.infer<typeof C.RevenueKpiTargetModeSchema>;

export interface LegacyEvaluationReceipt {
  period: string;
  employeeId: string;
  version: number;
  digest: string;
}

export interface CandidateSuggestionReceipt {
  taskRef: string;
  asOf: string;
  digest: string;
}

export interface DocumentReceipt {
  documentId: string;
  digest: string;
}

export interface ProjectReceipt {
  projectId: string;
  version: number;
}

export interface ScheduleReceipt {
  from: string;
  to: string;
  digest: string;
}

export interface PerformanceEvaluationReceipt {
  id: string;
  version: number;
}

export interface RevenueReadReceipt {
  tool: string;
  digest: string;
  period?: string;
  assignmentId?: string;
  limit?: number;
  offset?: number;
}

export interface ChatHistoryEvidence {
  documents: DocumentReceipt[];
  projects: ProjectReceipt[];
  schedules: ScheduleReceipt[];
  performanceEvaluations: PerformanceEvaluationReceipt[];
  revenueReads?: RevenueReadReceipt[];
  legacyEvaluations?: LegacyEvaluationReceipt[];
  candidateSuggestions?: CandidateSuggestionReceipt[];
  profileReads?: ProfileReadReceipt[];
  departmentKpiReads?: DepartmentKpiReadReceipt[];
  directoryReads?: DirectoryReadReceipt[];
  revenueOpenActionId?: string;
  revenueAssignmentActionId?: string;
  revenueSaveAssignmentActionId?: string;
  revenueCreatePeriodActionId?: string;
  performanceKpiActionId?: string;
}

export interface ProfileReadReceipt {
  digest: string;
}

export interface DepartmentKpiReadReceipt {
  period: string;
  digest: string;
}

export interface DirectoryReadReceipt {
  digest: string;
}

export interface ChatAuthorizationRequestDoc {
  _id: string;
  userId: string;
  securityVersion: number;
  contextHash: string;
  status: "ACTIVE" | "CLOSED";
  expiresAt: Date;
  revenueOpenPeriod?: string;
  sid?: string | null;
  documents: DocumentReceipt[];
  projects: ProjectReceipt[];
  schedules?: ScheduleReceipt[];
  performanceEvaluations?: PerformanceEvaluationReceipt[];
  revenueReads?: RevenueReadReceipt[];
  legacyEvaluations?: LegacyEvaluationReceipt[];
  candidateSuggestions?: CandidateSuggestionReceipt[];
  profileReads?: ProfileReadReceipt[];
  departmentKpiReads?: DepartmentKpiReadReceipt[];
  directoryReads?: DirectoryReadReceipt[];
  revenueOpenActionId?: string;
  revenueAssignmentActionId?: string;
  revenueSaveAssignmentActionId?: string;
  revenueCreatePeriodActionId?: string;
  performanceKpiActionId?: string;
}

const receipts = () => mongoose.connection.collection<ChatAuthorizationRequestDoc>("chat_authorization_requests");
const contextHash = (user: AuthenticatedUser) => digest({ authorization: user.authorization, canonical: user.canonical, delegations: user.effectiveDelegations ?? [], employeeId: user.employeeId });
export const GatewayToolRequestSchema = z.object({ requestId: z.string().uuid(), tool: z.enum(["get_my_profile", "list_projects", "get_project_status", "query_policy", "directory", "submit_report", "get_my_kpi", "get_department_kpi", "get_upcoming_deadlines", "get_my_schedule", "preview_revenue_period_open", "get_my_revenue_kpi", "list_my_pending_actions", "get_revenue_kpi_detail", "get_my_tasks", "preview_revenue_assignment_action", "get_revenue_kpi_result", "preview_revenue_kpi_assign_action", "preview_performance_kpi_action", "suggest_suitable_candidates", "validate_context"]),
  args: z.object({ projectId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), taskRef: z.string().regex(/^[a-f0-9]{24}$/i).optional(), query: z.string().max(2000).optional(), period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional(), from: z.union([ScheduleDateSchema, z.string().datetime()]).optional(), to: ScheduleDateSchema.optional(),
    assignmentId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    domain: z.enum(["task", "evaluation"]).optional(),
    kind: z.string().min(3).max(40).optional(),
    target: z.record(z.unknown()).optional(),
    content: z.record(z.unknown()).optional(),
    assignments: z.array(z.object({ taskId: z.string().regex(/^[a-f0-9]{24}$/i), assigneeEmployeeId: z.string().regex(/^[a-f0-9]{24}$/i) })).min(1).max(100).optional(),
    // P5: revenue assign scope (canonical store ids from client URL/screen, không do model chọn),
    // performance target ids và content tối thiểu; điểm số KHÔNG có trong allowlist.
    storeIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(500).optional(),
    storeId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
    unitType: z.enum(['STORE', 'AREA']).optional(),
    targetMode: C.RevenueKpiTargetModeSchema.optional(),
    targetVnd: z.number().int().safe().positive().optional(),
    growthPercent: z.number().finite().min(-50).max(100).optional(),
    bulk: z.boolean().optional(),
    employeeIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(500).optional(),
    evaluationId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    taskId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    segmentId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    templateId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    policyId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    dueAt: z.string().datetime().optional(),
    title: z.string().trim().min(3).max(200).optional(),
    description: z.string().max(10000).optional(),
    taskWeightPercent: z.number().min(5).max(50).optional(),
    criterionCodes: z.array(z.string().max(60)).max(20).optional(),
    decision: z.enum(["ADJUSTED", "UPHELD", "ACCEPTED", "WITHDRAWN", "RETURNED"]).optional(),
    text: z.string().trim().min(5).max(2000).optional(),
    assignAction: z.enum(['create_period', 'save_assignment']).optional(),
    policy: C.RevenueKpiPolicySchema.optional(),
    action: z.enum(["publish", "accept", "refuse", "hr-decision", "adjustment-request", "adjustment-verify", "adjustment-decision", "responsibility"]).optional(),
    expectedVersion: z.number().int().positive().optional(), planDigest: z.string().regex(/^[a-f0-9]{64}$/i).optional(),
    reason: z.string().trim().min(5).max(2000).optional(), evidenceRef: z.string().trim().min(5).max(2000).optional(), evidenceRefs: z.array(z.string().trim().min(5).max(200)).max(20).optional(),
    newTargetVnd: z.number().int().safe().positive().optional(), newGrowthPercent: z.number().finite().min(-50).max(100).optional(),
    force: z.boolean().optional(), assigneeEmployeeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
    limit: z.number().int().min(1).max(100).optional(), offset: z.number().int().min(0).max(100000).optional() }).strict().default({}) }).strict();
export function serviceKeyValid(provided: string): boolean {
  const expected = process.env.AI_SERVICE_API_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
// ============================================================================
// P5 — HR assign + Performance KPI actions via chat proposals (plan
// P5-hr-assign-performance-actions). Same collection `revenue_kpi_open_actions`,
// new persisted types: 'revenue_kpi.create_period', 'revenue_kpi.save_assignment',
// 'performance_kpi.task_action', 'performance_kpi.evaluation_action'. No rename,
// no migration; P0–P4 rows keep their shapes.
// ============================================================================

const p5Actions = () => mongoose.connection.collection<any>("revenue_kpi_open_actions");
type P5RowStatus = 'PENDING' | 'CONFIRMED' | 'CANCELLED' | 'EXECUTED' | 'EXPIRED' | 'FAILED';
type P5Row = {
  _id: string; ownerId: string; securityVersion: number; authorityHash: string;
  type: string; kind: string; status: P5RowStatus; expiresAt: string; createdAt: string; updatedAt: string;
  preview: any; args: any; decisionHash?: string; result?: any; leaseUntil?: string; freshClaim?: boolean; purgeAt?: Date; subAction?: string;
};

async function freshPrincipal(user: AuthenticatedUser, provision = false): Promise<AuthenticatedUser> {
  if (!revenueKpiEnabled()) failP5('REVENUE_KPI_DISABLED', 'KPI doanh thu chưa được bật.', 503);
  return resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion, sid: user.sid ?? undefined });
}
// Idempotency anchor (P3/P4 pattern): a digest of the user's authority at
// preview time. Loaders fail closed on drift instead of replaying stale rows.
function p5Authority(u: AuthenticatedUser) {
  const authorization = u.authorization && {
    ...u.authorization,
    grants: u.authorization.grants.map((grant) => {
      if (grant.approvalRef !== 'OWNER_REVENUE_KPI_20261104' && grant.approvalRef !== 'OWNER_PERFORMANCE_KPI_20261104') return grant;
      const { grantedAt, ...stableGrant } = grant;
      return stableGrant;
    }),
  };
  return digest({ authorization, employeeId: u.employeeId, delegations: u.effectiveDelegations ?? [] });
}
function p5Insert(row: Pick<P5Row, '_id' | 'ownerId' | 'securityVersion' | 'authorityHash' | 'type' | 'kind' | 'preview' | 'args'>) {
  const now = new Date();
  return p5Actions().updateOne({ _id: row._id }, { $setOnInsert: {
    ownerId: row.ownerId, securityVersion: row.securityVersion, authorityHash: row.authorityHash,
    type: row.type, kind: row.kind, preview: row.preview, args: row.args, status: 'PENDING',
    expiresAt: new Date(now.getTime() + 10 * 60000).toISOString(),
    purgeAt: new Date(now.getTime() + 7 * 86400000),
    createdAt: now.toISOString(), updatedAt: now.toISOString(),
  } }, { upsert: true });
}
async function p5InsertBestEffort(promise: Promise<unknown>) {
  try { await promise; } catch (error) {
    // Concurrent previews of the same chat request race on the upsert; the loser
    // reads the winner's row below instead of surfacing E11000.
    if ((error as { code?: number }).code !== 11000) throw error;
  }
}
// Deterministic action id from tool args: repeated tool calls inside one chat
// request converge on one proposal instead of stacking unconfirmed rows.
function p5DeterministicId(seed: Record<string, unknown>) {
  const hex = digest(seed);
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
}
async function loadP5Row(u: AuthenticatedUser, id: string, type: string) {
  C.RevenueKpiOpenActionIdSchema.parse(id);
  const row = await p5Actions().findOne({ _id: id, ownerId: u.userId }) as P5Row | null;
  if (!row || row.type !== type) failP5('REVENUE_KPI_ACTION_NOT_FOUND', 'Không tìm thấy đề xuất KPI.', 404);
  if (row.securityVersion !== u.securityVersion || row.authorityHash !== p5Authority(u))
    failP5('REVENUE_KPI_AUTHORITY_CHANGED', 'Quyền đã thay đổi. Hãy lập bản xem trước mới.', 403);
  return row;
}
function failP5(code: string, message: string, status = 409): never {
  throw new WorkflowError(status, code, message);
}
function p5StatusOf(row: P5Row): P5RowStatus {
  return row.status === 'PENDING' && row.expiresAt <= new Date().toISOString() ? 'EXPIRED' : row.status;
}

// Shared preview/decide lifecycle for one P5 type: preview -> claim (lease +
// decisionHash) -> execute via the injected service callback -> EXECUTED, with
// terminal replay and FAILED marking. The domain never bypasses existing
// services: `execute` receives the fresh row and must call them.
async function runP5Decision(u: AuthenticatedUser, id: string, type: string, raw: unknown,
  schema: z.ZodTypeAny, execute: (u: AuthenticatedUser, row: P5Row, command: { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string }) => Promise<any>,
  freshPreview: (u: AuthenticatedUser, row: P5Row) => Promise<any>) {
  const input = schema.parse(raw) as { approve: boolean; clientRequestId: string; expectedVersion?: number; planDigest?: string };
  let row = await loadP5Row(u, id, type);
  const nowIso = new Date().toISOString();
  // Terminal outcomes replay by action id; a repeat decision is idempotent.
  // revenue_kpi.save_assignment allows CAS retry for partial failures with matching decisionHash.
  if (row.status === 'EXECUTED' || row.status === 'CANCELLED') {
    if (row.status === 'EXECUTED' && type === 'revenue_kpi.save_assignment' && Array.isArray(row.result?.failed) && row.result.failed.length > 0) {
      if (!input.approve || !row.decisionHash || digest(input) !== row.decisionHash) {
        failP5('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
      }
      return retryRevenueSaveAssignment(u, row, input as { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string });
    }
    return p5Envelope(row);
  }
  const unexpiredClaimFilter = { $expr: { $gt: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } };
  const expirePending = async () => {
    const expired = await p5Actions().findOneAndUpdate(
      { _id: id, status: 'PENDING', $expr: { $lte: [{ $dateFromString: { dateString: '$expiresAt' } }, '$$NOW'] } },
      { $set: { status: 'EXPIRED', updatedAt: new Date().toISOString() } }, { returnDocument: 'after' });
    if (expired) failP5('REVENUE_KPI_ACTION_EXPIRED', 'Đề xuất đã hết hạn. Hãy lập bản xem trước mới.');
    failP5('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý.');
  };
  if (row.status === 'PENDING') {
    if (row.expiresAt <= nowIso) await expirePending();
    if (!input.approve) {
      const cancelled = await p5Actions().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
        { $set: { status: 'CANCELLED', decisionHash: digest(input), updatedAt: nowIso }, $unset: { purgeAt: '' } });
      if (!cancelled.modifiedCount) await expirePending();
      return p5Envelope({ ...row, status: 'CANCELLED' });
    }
    const approve = input as { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string };
    const fresh = await freshPreview(u, row);
    if (approve.expectedVersion !== row.args.expectedVersion || approve.planDigest !== row.args.planDigest || (fresh && fresh.planDigest && fresh.planDigest !== row.preview.planDigest))
      throw new P5PlanChangedError(fresh);
    const leaseUntil = new Date(Date.now() + 60000).toISOString();
    const claimed = await p5Actions().updateOne({ _id: id, status: 'PENDING', ...unexpiredClaimFilter },
      { $set: { status: 'CONFIRMED', decisionHash: digest(approve), leaseUntil, updatedAt: nowIso }, $unset: { purgeAt: '' } });
    if (!claimed.modifiedCount) await expirePending();
    row = { ...row, status: 'CONFIRMED', decisionHash: digest(approve), leaseUntil, freshClaim: true };
  }
  if (row.status === 'CONFIRMED' || row.status === 'FAILED') {
    if (row.status === 'CONFIRMED' && !row.freshClaim && row.leaseUntil && row.leaseUntil > nowIso)
      failP5('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đang được xử lý. Tải lại sau ít phút.');
    const approve = input as { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string };
    if (!input.approve || !row.decisionHash || digest(approve) !== row.decisionHash)
      failP5('REVENUE_KPI_ACTION_DECIDED', 'Kế hoạch đã được phê duyệt với nội dung khác.');
    if (!row.freshClaim) {
      failP5('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý hoặc thất bại trong lần chạy trước.');
    }
    const markFailed = async () => { await p5Actions().updateOne({ _id: id, status: 'CONFIRMED' },
      { $set: { status: 'FAILED', updatedAt: new Date().toISOString() }, $unset: { leaseUntil: '' } }); };
    try {
      const result = await execute(u, row, approve);
      const updated = { ...row, status: 'EXECUTED' as const, result, leaseUntil: undefined, freshClaim: undefined };
      await p5Actions().updateOne({ _id: id, status: 'CONFIRMED' },
        { $set: { status: 'EXECUTED', result, updatedAt: new Date().toISOString() }, $unset: { leaseUntil: '', purgeAt: '' } });
      return p5Envelope(updated);
    } catch (error) {
      await markFailed();
      if (error instanceof P5PlanChangedError) throw error;
      throw error;
    }
  }
  failP5('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã hết hiệu lực. Hãy lập bản xem trước mới.');
}
export class P5PlanChangedError extends WorkflowError {
  constructor(readonly preview: unknown) {
    super(409, 'REVENUE_KPI_PLAN_CHANGED', 'KPI đã thay đổi. Kiểm tra bản xem trước mới trước khi xác nhận.');
  }
}
async function p5PlanChanged(row: P5Row, build: () => Promise<any>): Promise<never> {
  try { throw new P5PlanChangedError(await build()); } catch (error) {
    if (error instanceof P5PlanChangedError) throw error;
    throw new P5PlanChangedError(row.preview);
  }
}
function p5Envelope(row: P5Row) {
  const status = p5StatusOf(row);
  return { actionId: row._id, type: row.type, kind: row.kind ?? undefined, status,
    expiresAt: row.expiresAt, requiresConfirmation: status === 'PENDING', executed: !!row.result,
    args: row.args, preview: row.preview, result: row.result ?? null };
}

export async function getChatRevenueCreatePeriodAction(user: AuthenticatedUser, id: string): Promise<RevenueKpiCreatePeriodAction> {
  return p5Envelope(await loadP5Row(await freshPrincipal(user), id, 'revenue_kpi.create_period')) as RevenueKpiCreatePeriodAction;
}
export async function getChatRevenueSaveAssignmentAction(user: AuthenticatedUser, id: string): Promise<RevenueKpiSaveAssignmentAction> {
  return p5Envelope(await loadP5Row(await freshPrincipal(user), id, 'revenue_kpi.save_assignment')) as RevenueKpiSaveAssignmentAction;
}

// --- P5a.1: revenue_kpi.create_period -------------------------------------
// Preview shows the exact policy that would be stored; zero-write is enforced
// by the caller's document-count assertions (P4 test pattern).
function planRevenueCreatePeriod(period: string, policy: unknown, exists: boolean) {
  const input = C.RevenueKpiCreatePeriodSchema.pick({ policy: true }).parse({ policy });
  const args: C.RevenueKpiCreatePeriodArgs = { period, policy: input.policy, expectedVersion: 0, planDigest: '' };
  const warnings: string[] = [];
  if (exists) warnings.push('Kỳ này đã tồn tại; xác nhận sẽ bị chặn bởi service hiện có.');
  args.planDigest = digest({ kind: 'revenue_kpi.create_period', period, policy: input.policy, expectedVersion: 0 });
  const preview: C.RevenueKpiCreatePeriodPreview = C.RevenueKpiCreatePeriodPreviewSchema.parse({
    period, policy: input.policy, planDigest: args.planDigest,
    summary: `Tạo kỳ KPI doanh thu ${period} ở trạng thái DRAFT với chính sách đã cấu hình; chưa ghi.`,
    warnings, executed: false,
  });
  return { preview, args };
}
export async function previewChatRevenueCreatePeriod(user: AuthenticatedUser, period: string, policy: unknown,
  proposedId: string = randomUUID()) {
  const u = await freshPrincipal(user, false);
  requireCapability(u, "revenue_kpi.assign");
  C.RevenueKpiMonthSchema.parse(period);
  const exists = !!(await RevenueKpiPeriodModel.findOne({ period }).lean());
  const { preview, args } = planRevenueCreatePeriod(period, policy, exists);
  await p5InsertBestEffort(p5Insert({ _id: proposedId, ownerId: u.userId, securityVersion: u.securityVersion ?? 0,
    authorityHash: p5Authority(u), type: 'revenue_kpi.create_period', kind: 'create_period', preview, args }));
  const row = await loadP5Row(u, proposedId, 'revenue_kpi.create_period');
  if (row.args.period !== period) failP5('REVENUE_KPI_VERSION_CONFLICT', 'Yêu cầu đã được dùng cho kỳ khác.');
  return { actionId: row._id, type: 'revenue_kpi.create_period' as const, preview: row.preview, requiresConfirmation: true as const, executed: false as const };
}
export async function decideChatRevenueCreatePeriod(user: AuthenticatedUser, id: string, raw: unknown) {
  return runP5Decision(await freshPrincipal(user, false), id, 'revenue_kpi.create_period', raw,
    C.RevenueKpiCreatePeriodDecisionSchema,
    async (u, row, command) => {
      const p = await createRevenueKpiPeriod(u, { clientRequestId: command.clientRequestId, period: row.args.period, policy: row.args.policy, expectedVersion: 0 });
      return { period: p };
    },
    async (_u, row) => {
      const exists = !!(await RevenueKpiPeriodModel.findOne({ period: row.args.period }).lean());
      return planRevenueCreatePeriod(row.args.period, row.args.policy, exists).preview;
    });
}
// --- P5a.2: revenue_kpi.save_assignment (single + bulk) --------------------
// Preview runs buildDraft-equivalent logic per store WITHOUT writing; single
// preview = one item. Bulk execute runs each item independently: created /
// skipped (duplicate 11000 / existing draft) / blocked / failed; retry only
// re-runs failed items.
// P5 item planning uses the revenue domain catalog so eligibility stays aligned with Web writes.
const P5_REVENUE_BLOCK_FIXHINT: Record<string, string> = {
  REVENUE_KPI_STORE_WITHOUT_SM: 'Kiểm tra bổ nhiệm SM hoặc chọn người phụ trách thủ công.',
  REVENUE_KPI_SM_AMBIGUOUS: 'Cần xác nhận SM phụ trách cửa hàng.',
  REVENUE_KPI_TARGET_INVALID: 'Kiểm tra doanh thu kỳ gốc và mục tiêu từng cửa hàng.',
  REVENUE_KPI_STORE_NOT_IN_SCOPE: 'Kiểm tra quyền trên các cửa hàng trong kỳ.',
  REVENUE_KPI_ASSIGNMENT_CANCELLED: 'Kiểm tra KPI đã hủy của đơn vị trước khi tiếp tục.',
};

function p5BlockItem(item: C.RevenueKpiSaveAssignmentItem, error: unknown): C.RevenueKpiSaveAssignmentItem {
  if (!(error instanceof WorkflowError) || !Object.hasOwn(P5_REVENUE_BLOCK_FIXHINT, error.code)) throw error;
  return { ...item, willCreate: false, willSkip: false, blocked: true, code: error.code, message: error.message, fixHint: P5_REVENUE_BLOCK_FIXHINT[error.code] };
}
async function p5AssigneeFor(u: AuthenticatedUser, period: string, unitType: 'STORE' | 'AREA', storeIds: string[], explicitAssignee?: string | null) {
  return resolveRevenueKpiAssignmentCandidate(u, period, unitType, storeIds, explicitAssignee);
}
async function p5DraftAreaItem(u: AuthenticatedUser, period: string, base: {
  unitType: 'AREA'; storeIds: string[]; assigneeEmployeeId?: string | null;
  targetMode: P5RevenueTargetMode; targetVnd?: number; growthPercent?: number; reason: string;
}): Promise<C.RevenueKpiSaveAssignmentItem> {
  const item: C.RevenueKpiSaveAssignmentItem = {
    storeId: null, storeIds: base.storeIds, unitType: 'AREA', assigneeEmployeeId: base.assigneeEmployeeId ?? null,
    assigneeRole: null, assigneeName: null, period, basePeriod: priorMonth(period), targetMode: 'ABSOLUTE_VND',
    growthPercent: null, targetVnd: base.targetVnd ?? null,
    existingAssignmentId: null, willCreate: true, willSkip: false, blocked: false, code: null, message: null, fixHint: null,
  };
  try {
    const candidate = await p5AssigneeFor(u, period, 'AREA', base.storeIds, base.assigneeEmployeeId);
    item.assigneeEmployeeId = candidate.employeeId;
    item.assigneeRole = candidate.role;
    item.assigneeName = candidate.name;

    const existing = await RevenueKpiAssignmentModel.findOne({
      period,
      unitType: 'AREA',
      $or: [{ areaKey: 'am:' + candidate.employeeId }, { assigneeEmployeeId: candidate.employeeId }],
      status: { $ne: 'CANCELLED' },
    }).lean();
    if (existing) {
      item.willCreate = false;
      item.willSkip = true;
      item.existingAssignmentId = existing && typeof existing === 'object' && '_id' in existing ? String(existing._id) : null;
      item.message = 'Khu vực đã có KPI nháp/hiệu lực trong kỳ này.';
      return item;
    }

    let storeTotal = 0;
    for (const storeId of base.storeIds) {
      const parent = await RevenueKpiAssignmentModel.findOne({ period, unitType: 'STORE', storeId, status: { $ne: 'CANCELLED' } }).lean();
      if (!parent || typeof parent !== 'object' || !('targetVnd' in parent) || typeof parent.targetVnd !== 'number' || !Number.isSafeInteger(parent.targetVnd) || parent.targetVnd <= 0) {
        throw new WorkflowError(409, 'REVENUE_KPI_TARGET_INVALID', 'Cần giao mục tiêu hợp lệ cho từng cửa hàng trước khi tạo KPI khu vực.');
      }
      storeTotal += parent.targetVnd;
    }
    if (!Number.isSafeInteger(storeTotal) || storeTotal <= 0) {
      throw new WorkflowError(400, 'REVENUE_KPI_TARGET_INVALID', 'Tổng mục tiêu khu vực không hợp lệ.');
    }
    if (base.targetVnd !== undefined && base.targetVnd !== null && base.targetVnd !== storeTotal) {
      throw new WorkflowError(409, 'REVENUE_KPI_TARGET_INVALID', 'Mục tiêu khu vực phải bằng tổng mục tiêu các cửa hàng.');
    }
    item.targetVnd = storeTotal;
    return item;
  } catch (error) {
    return p5BlockItem(item, error);
  }
}
async function p5DraftOneItem(u: AuthenticatedUser, period: string, base: {
  unitType: 'STORE' | 'AREA'; storeId?: string | null; storeIds: string[]; assigneeEmployeeId?: string | null;
  targetMode: P5RevenueTargetMode; targetVnd?: number; growthPercent?: number; reason: string;
}, storeId: string): Promise<C.RevenueKpiSaveAssignmentItem> {
  const item: C.RevenueKpiSaveAssignmentItem = {
    storeId, storeIds: base.storeIds, unitType: base.unitType, assigneeEmployeeId: base.assigneeEmployeeId ?? null,
    assigneeRole: null, assigneeName: null, period, basePeriod: priorMonth(period), targetMode: base.targetMode,
    growthPercent: base.growthPercent ?? null, targetVnd: base.targetVnd ?? null,
    existingAssignmentId: null, willCreate: true, willSkip: false, blocked: false, code: null, message: null, fixHint: null,
  };
  try {
    const candidate = await p5AssigneeFor(u, period, base.unitType,
      base.unitType === 'STORE' ? [storeId] : base.storeIds, base.assigneeEmployeeId);
    const p = await periodRead(period);
    item.assigneeEmployeeId = candidate.employeeId;
    item.assigneeRole = candidate.role;
    item.assigneeName = candidate.name;
    if (base.unitType === 'STORE') {
      const existing = await RevenueKpiAssignmentModel.findOne({ period, unitType: 'STORE', storeId, status: { $ne: 'CANCELLED' } }).lean();
      if (existing) { item.willCreate = false; item.willSkip = true; item.existingAssignmentId = String((existing as { _id: unknown })._id); item.message = 'Đơn vị đã có KPI nháp/hiệu lực trong kỳ này.'; return item; }
      const baseRevenue = await computeStoreRevenue(storeId, priorMonth(period), p.policy);
      const growth = base.targetMode === 'GROWTH_PERCENT' ? base.growthPercent ?? p.policy.defaultGrowthPercent : null;
      const targetVnd = growth === null ? base.targetVnd! : targetFromGrowth(baseRevenue.actualRevenueVnd, growth);
      if (!Number.isSafeInteger(targetVnd) || targetVnd <= 0) throw new WorkflowError(400, 'REVENUE_KPI_TARGET_INVALID', 'Nhập mục tiêu VND nguyên lớn hơn 0.');
      item.targetVnd = targetVnd; item.growthPercent = growth;
    } else {
      const parent = await RevenueKpiAssignmentModel.findOne({ period, unitType: 'STORE', storeId, status: { $ne: 'CANCELLED' } }).lean();
      if (!parent) throw new WorkflowError(409, 'REVENUE_KPI_TARGET_INVALID', 'Cần giao mục tiêu hợp lệ cho từng cửa hàng trước khi tạo KPI khu vực.');
      if (!parent || typeof parent !== 'object' || !('targetVnd' in parent) || typeof parent.targetVnd !== 'number')
        throw new WorkflowError(409, 'REVENUE_KPI_TARGET_INVALID', 'Cần giao mục tiêu hợp lệ cho từng cửa hàng trước khi tạo KPI khu vực.');
      item.targetVnd = parent.targetVnd;
    }
    return item;
  } catch (error) { return p5BlockItem(item, error); }
}

async function periodRead(period: string): Promise<C.RevenueKpiPeriod> {
  C.RevenueKpiMonthSchema.parse(period);
  const row = await RevenueKpiPeriodModel.findOne({ period }).lean();
  if (!row || Array.isArray(row) || typeof row !== 'object' || !('_id' in row))
    throw new WorkflowError(404, 'REVENUE_KPI_NOT_FOUND', 'Chưa có kỳ KPI này.');
  const { _id, ...fields } = row;
  return C.RevenueKpiPeriodSchema.parse({ ...fields, id: String(_id) });
}

async function planRevenueSaveAssignment(u: AuthenticatedUser, raw: {
  period: string; unitType: 'STORE' | 'AREA'; storeId?: string | null; storeIds?: string[];
  assigneeEmployeeId?: string | null; targetMode: P5RevenueTargetMode; targetVnd?: number;
  growthPercent?: number; reason: string; bulk: boolean;
}) {
  const period = C.RevenueKpiMonthSchema.parse(raw.period);
  const storeIds = (raw.unitType === 'STORE' && !raw.bulk ? [raw.storeId!] : (raw.storeIds ?? []))
    .map(id => String(id).toLowerCase());
  const items: C.RevenueKpiSaveAssignmentItem[] = [];
  if (raw.unitType === 'AREA') {
    items.push(await p5DraftAreaItem(u, period, {
      unitType: 'AREA', storeIds, assigneeEmployeeId: raw.assigneeEmployeeId ?? null,
      targetMode: raw.targetMode, targetVnd: raw.targetVnd, growthPercent: raw.growthPercent, reason: raw.reason,
    }));
  } else {
    for (const storeId of storeIds) items.push(await p5DraftOneItem(u, period, {
      unitType: raw.unitType, storeId: raw.storeId ?? null, storeIds, assigneeEmployeeId: raw.assigneeEmployeeId ?? null,
      targetMode: raw.targetMode, targetVnd: raw.targetVnd, growthPercent: raw.growthPercent, reason: raw.reason,
    }, storeId));
  }
  const args: C.RevenueKpiSaveAssignmentArgs = {
    period, unitType: raw.unitType, storeId: raw.unitType === 'STORE' && !raw.bulk ? storeIds[0] : null,
    storeIds: raw.unitType === 'AREA' || raw.bulk ? storeIds : undefined,
    assigneeEmployeeId: raw.assigneeEmployeeId ?? null, targetMode: raw.unitType === 'AREA' ? 'ABSOLUTE_VND' : raw.targetMode,
    ...(raw.unitType === 'AREA'
      ? (items[0]?.targetVnd !== null && items[0]?.targetVnd !== undefined ? { targetVnd: items[0].targetVnd } : (raw.targetVnd !== undefined ? { targetVnd: raw.targetVnd } : {}))
      : (raw.targetVnd !== undefined && { targetVnd: raw.targetVnd })),
    ...(raw.growthPercent !== undefined && raw.unitType !== 'AREA' && { growthPercent: raw.growthPercent }),
    reason: raw.reason, expectedVersion: 0, planDigest: '', bulk: raw.bulk,
  };
  args.planDigest = digest({ kind: 'revenue_kpi.save_assignment', args: { ...args, planDigest: undefined }, items });
  const preview: C.RevenueKpiSaveAssignmentPreview = C.RevenueKpiSaveAssignmentPreviewSchema.parse({
    period, unitType: raw.unitType, bulk: raw.bulk, planDigest: args.planDigest,
    summary: raw.bulk
      ? `Gán KPI ${raw.unitType === 'STORE' ? 'cửa hàng' : 'khu vực'} cho ${storeIds.length} đơn vị kỳ ${period}: ${items.filter(i => i.willCreate).length} sẽ tạo, ${items.filter(i => i.willSkip).length} bỏ qua, ${items.filter(i => i.blocked).length} bị chặn; chưa ghi.`
      : `Xem trước KPI ${raw.unitType === 'STORE' ? 'cửa hàng' : 'khu vực'} kỳ ${period} cho ${items[0]?.assigneeName ?? 'người phụ trách'}; chưa ghi.`,
    willCreate: items.filter(i => i.willCreate), willSkip: items.filter(i => i.willSkip), blocked: items.filter(i => i.blocked),
    warnings: [], executed: false,
  });
  return { preview, args };
}
export async function previewChatRevenueSaveAssignment(user: AuthenticatedUser, raw: {
  period: string; unitType: 'STORE' | 'AREA'; storeId?: string | null; storeIds?: string[];
  assigneeEmployeeId?: string | null; targetMode: P5RevenueTargetMode; targetVnd?: number;
  growthPercent?: number; reason: string; bulk: boolean;
}, proposedId: string = randomUUID()) {
  const u = await freshPrincipal(user, false);
  const { preview, args } = await planRevenueSaveAssignment(u, raw);
  await p5InsertBestEffort(p5Insert({ _id: proposedId, ownerId: u.userId, securityVersion: u.securityVersion ?? 0,
    authorityHash: p5Authority(u), type: 'revenue_kpi.save_assignment', kind: raw.bulk ? 'save_assignment.bulk' : 'save_assignment.single',
    preview, args }));
  const row = await loadP5Row(u, proposedId, 'revenue_kpi.save_assignment');
  if (row.preview.period !== raw.period) failP5('REVENUE_KPI_VERSION_CONFLICT', 'Yêu cầu đã được dùng cho kỳ khác.');
  return { actionId: row._id, type: 'revenue_kpi.save_assignment' as const, preview: row.preview, requiresConfirmation: true as const, executed: false as const };
}
// Execute one store through the existing service (no state-machine rewrite).
// Duplicate key 11000 maps to skipped, per plan.
function p5SaveItemRequestId(actionId: string, item: C.RevenueKpiSaveAssignmentItem): string {
  const hex = digest({ actionId, storeId: item.storeId, storeIds: item.storeIds });
  const variant = ((Number.parseInt(hex.charAt(16), 16) & 3) | 8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function p5SaveOne(u: AuthenticatedUser, row: P5Row, item: C.RevenueKpiSaveAssignmentItem): Promise<C.RevenueKpiSaveAssignmentOutcome> {
  const outcome: C.RevenueKpiSaveAssignmentOutcome = { ...item, assignmentId: null };
  if (item.blocked) { outcome.blocked = true; return outcome; }
  if (item.willSkip) { outcome.willSkip = true; outcome.assignmentId = item.existingAssignmentId; return outcome; }
  try {
    const created = await saveRevenueKpiAssignment(u, {
      clientRequestId: p5SaveItemRequestId(row._id, item),
      period: row.args.period, unitType: item.unitType,
      storeId: item.unitType === 'STORE' ? item.storeId : undefined,
      storeIds: item.unitType === 'AREA' ? item.storeIds : undefined,
      assigneeEmployeeId: item.assigneeEmployeeId!, targetMode: item.targetMode,
      ...(item.targetVnd !== null && item.targetMode === 'ABSOLUTE_VND' ? { targetVnd: item.targetVnd } : {}),
      ...(item.growthPercent !== null && item.targetMode === 'GROWTH_PERCENT' ? { growthPercent: item.growthPercent } : {}),
      reason: row.args.reason, expectedVersion: 0,
    }, item.targetVnd);
    outcome.assignmentId = created.id; outcome.willCreate = true;
    return outcome;
  } catch (error) {
    if ((error as { code?: number }).code === 11000) { outcome.willCreate = false; outcome.willSkip = true; outcome.code = 'DUPLICATE'; outcome.message = 'Đơn vị đã có KPI tháng này (trùng khóa); đã bỏ qua.'; return outcome; }
    if (error instanceof WorkflowError && ['REVENUE_KPI_STORE_WITHOUT_SM', 'REVENUE_KPI_TARGET_INVALID', 'REVENUE_KPI_STORE_NOT_IN_SCOPE', 'REVENUE_KPI_ASSIGNMENT_CANCELLED', 'REVENUE_KPI_SELF_APPROVAL'].includes(error.code)) {
      outcome.willCreate = false; outcome.blocked = true; outcome.code = error.code; outcome.message = error.message; return outcome;
    }
    if (error instanceof WorkflowError && error.code === 'REVENUE_KPI_PLAN_CHANGED') {
      throw error;
    }
    outcome.willCreate = false; outcome.code = 'FAILED'; outcome.message = 'Chưa lưu được bản nháp. Vui lòng thử lại.';
    return outcome;
  }
}
function p5DraftInputFromOutcome(row: P5Row, item: C.RevenueKpiSaveAssignmentItem | C.RevenueKpiSaveAssignmentOutcome) {
  const rawInput = {
    clientRequestId: p5SaveItemRequestId(row._id, item),
    period: row.args.period,
    unitType: item.unitType,
    ...(item.unitType === 'STORE' ? { storeId: item.storeId ?? undefined } : {}),
    ...(item.unitType === 'AREA' ? { storeIds: item.storeIds ?? row.args.storeIds ?? undefined } : {}),
    assigneeEmployeeId: item.assigneeEmployeeId!,
    targetMode: item.targetMode,
    ...(item.targetVnd !== null && item.targetVnd !== undefined && item.targetMode === 'ABSOLUTE_VND' ? { targetVnd: item.targetVnd } : {}),
    ...(item.growthPercent !== null && item.growthPercent !== undefined && item.targetMode === 'GROWTH_PERCENT' ? { growthPercent: item.growthPercent } : {}),
    reason: row.args.reason,
    expectedVersion: 0,
  };
  return C.RevenueKpiDraftAssignmentSchema.parse(rawInput);
}

async function retryRevenueSaveAssignment(
  u: AuthenticatedUser,
  row: P5Row,
  _approve: { approve: true; clientRequestId: string; expectedVersion: number; planDigest: string }
) {

  const nowIso = new Date().toISOString();
  const leaseUntil = new Date(Date.now() + 60000).toISOString();
  const claimed = await p5Actions().updateOne(
    { _id: row._id, status: 'EXECUTED', decisionHash: row.decisionHash },
    { $set: { status: 'CONFIRMED', leaseUntil, updatedAt: nowIso } }
  );
  if (!claimed.modifiedCount) {
    const current = (await p5Actions().findOne({ _id: row._id })) as P5Row | null;
    if (current?.status === 'CONFIRMED') {
      failP5('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đang được xử lý. Tải lại sau ít phút.');
    }
    failP5('REVENUE_KPI_ACTION_DECIDED', 'Đề xuất đã được xử lý.');
  }

  const revertToExecuted = async () => {
    await p5Actions().updateOne(
      { _id: row._id, status: 'CONFIRMED' },
      { $set: { status: 'EXECUTED', updatedAt: new Date().toISOString() }, $unset: { leaseUntil: '' } }
    );
  };

  try {
    const previouslyCreated: C.RevenueKpiSaveAssignmentOutcome[] = Array.isArray(row.result?.created) ? row.result.created : [];
    for (const createdItem of previouslyCreated) {
      const doc = (createdItem.assignmentId
        ? await RevenueKpiAssignmentModel.findById(createdItem.assignmentId).lean()
        : await RevenueKpiAssignmentModel.findOne(
            createdItem.unitType === 'STORE'
              ? { period: row.args.period, unitType: 'STORE', storeId: createdItem.storeId, status: { $ne: 'CANCELLED' } }
              : { period: row.args.period, unitType: 'AREA', assigneeEmployeeId: createdItem.assigneeEmployeeId, status: { $ne: 'CANCELLED' } }
          ).lean()) as (C.RevenueKpiAssignment & { history?: Array<{ requestId?: string; by?: string; payloadHash?: string; action?: string }> }) | null;

      if (!doc) {
        await revertToExecuted();
        failP5('REVENUE_KPI_PLAN_CHANGED', 'Phân công đã tạo trước đó không tồn tại trong hệ thống. Hãy lập bản xem trước mới.');
      }
      if (doc.status !== 'DRAFT' || doc.version !== 1 || doc.targetVnd !== createdItem.targetVnd) {
        await revertToExecuted();
        failP5('REVENUE_KPI_PLAN_CHANGED', 'Phân công đã tạo trước đó đã bị sửa đổi. Hãy lập bản xem trước mới.');
      }
      const reqId = p5SaveItemRequestId(row._id, createdItem);
      const expectedInput = p5DraftInputFromOutcome(row, createdItem);
      const expectedPayloadHash = digest(expectedInput);
      const historyEntry = (doc.history || []).find(h => h.requestId === reqId);
      if (!historyEntry || historyEntry.by !== u.userId || historyEntry.action !== 'SAVE_DRAFT' || historyEntry.payloadHash !== expectedPayloadHash) {
        await revertToExecuted();
        failP5('REVENUE_KPI_PLAN_CHANGED', 'Lịch sử phân công không khớp mã băm yêu cầu hoặc người thực hiện ban đầu. Hãy lập bản xem trước mới.');
      }
    }

    const failedToRetry: C.RevenueKpiSaveAssignmentItem[] = [];
    const allInitialItems = [...(row.preview?.willCreate || []), ...(row.preview?.willSkip || []), ...(row.preview?.blocked || [])] as C.RevenueKpiSaveAssignmentItem[];

    for (const failedItem of (row.result?.failed || [])) {
      const initialItem = allInitialItems.find(i =>
        failedItem.unitType === 'STORE'
          ? i.unitType === 'STORE' && i.storeId === failedItem.storeId
          : i.unitType === 'AREA' && i.assigneeEmployeeId === failedItem.assigneeEmployeeId
      );
      if (!initialItem) {
        await revertToExecuted();
        failP5('REVENUE_KPI_PLAN_CHANGED', 'Không tìm thấy thông tin xem trước của mục phân công bị lỗi. Hãy lập bản xem trước mới.');
      }

      const replanned = initialItem.unitType === 'AREA'
        ? await p5DraftAreaItem(u, row.args.period, {
            unitType: 'AREA',
            storeIds: initialItem.storeIds ?? row.args.storeIds ?? [],
            assigneeEmployeeId: initialItem.assigneeEmployeeId,
            targetMode: initialItem.targetMode,
            targetVnd: initialItem.targetVnd ?? undefined,
            growthPercent: initialItem.growthPercent ?? undefined,
            reason: row.args.reason,
          })
        : await p5DraftOneItem(u, row.args.period, {
            unitType: 'STORE',
            storeId: initialItem.storeId,
            storeIds: row.args.storeIds ?? (initialItem.storeId ? [initialItem.storeId] : []),
            assigneeEmployeeId: initialItem.assigneeEmployeeId,
            targetMode: initialItem.targetMode,
            targetVnd: initialItem.targetVnd ?? undefined,
            growthPercent: initialItem.growthPercent ?? undefined,
            reason: row.args.reason,
          }, initialItem.storeId!);

      if (replanned.blocked || !replanned.willCreate) {
        await revertToExecuted();
        failP5('REVENUE_KPI_PLAN_CHANGED', 'Kế hoạch phân công cho mục bị lỗi không còn hợp lệ. Hãy lập bản xem trước mới.');
      }

      if (
        replanned.assigneeEmployeeId !== initialItem.assigneeEmployeeId ||
        replanned.targetVnd !== initialItem.targetVnd ||
        replanned.period !== initialItem.period ||
        replanned.unitType !== initialItem.unitType ||
        (replanned.unitType === 'STORE' && replanned.storeId !== initialItem.storeId)
      ) {
        await revertToExecuted();
        failP5('REVENUE_KPI_PLAN_CHANGED', 'Kế hoạch cho mục bị lỗi đã thay đổi so với bản xem trước ban đầu. Hãy lập bản xem trước mới.');
      }

      failedToRetry.push(replanned);
    }

    const retryOutcomes: C.RevenueKpiSaveAssignmentOutcome[] = [];
    for (const item of failedToRetry) {
      retryOutcomes.push(await p5SaveOne(u, row, item));
    }

    const newlyCreated = retryOutcomes.filter(o => o.assignmentId);
    const newlySkipped = retryOutcomes.filter(o => o.willSkip && !o.assignmentId);
    const newlyBlocked = retryOutcomes.filter(o => o.blocked);
    const newlyFailed = retryOutcomes.filter(o => o.code === 'FAILED');

    const oldSkipped: C.RevenueKpiSaveAssignmentOutcome[] = Array.isArray(row.result?.skipped) ? row.result.skipped : [];
    const oldBlocked: C.RevenueKpiSaveAssignmentOutcome[] = Array.isArray(row.result?.blocked) ? row.result.blocked : [];

    const created = [...previouslyCreated, ...newlyCreated];
    const skipped = [...oldSkipped, ...newlySkipped];
    const blocked = [...oldBlocked, ...newlyBlocked];
    const failed = newlyFailed;

    const count = (list: any[]) => list.length;
    const outcome = failed.length === 0 && blocked.length === 0 ? 'FULL' : created.length ? 'PARTIAL' : 'NONE';
    const result = {
      outcome,
      created,
      skipped,
      blocked,
      failed,
      summary: {
        created: count(created),
        skipped: count(skipped),
        blocked: count(blocked),
        failed: count(failed),
        total: created.length + skipped.length + blocked.length + failed.length,
      },
    };

    await p5Actions().updateOne(
      { _id: row._id, status: 'CONFIRMED' },
      { $set: { status: 'EXECUTED', result, updatedAt: new Date().toISOString() }, $unset: { leaseUntil: '', purgeAt: '' } }
    );

    return p5Envelope({ ...row, status: 'EXECUTED', result, leaseUntil: undefined, freshClaim: undefined });
  } catch (error) {
    await revertToExecuted();
    if (error instanceof WorkflowError) throw error;
    failP5('REVENUE_KPI_RETRY_FAILED', 'Chưa lưu được bản nháp. Vui lòng thử lại.');
  }
}

export async function decideChatRevenueSaveAssignment(user: AuthenticatedUser, id: string, raw: unknown) {
  return withCrmWriter(async () => {
    return runP5Decision(await freshPrincipal(user, false), id, 'revenue_kpi.save_assignment', raw,
      C.RevenueKpiSaveAssignmentDecisionSchema,
      async (u, row) => {
        const items = [...row.preview.willCreate, ...row.preview.willSkip, ...row.preview.blocked] as C.RevenueKpiSaveAssignmentItem[];
        const outcomes: C.RevenueKpiSaveAssignmentOutcome[] = [];
        for (const item of items) outcomes.push(await p5SaveOne(u, row, item));
        const count = (list: C.RevenueKpiSaveAssignmentOutcome[]) => list.length;
        const created = outcomes.filter(o => o.assignmentId), skipped = outcomes.filter(o => o.willSkip && !o.assignmentId),
          blocked = outcomes.filter(o => o.blocked), failed = outcomes.filter(o => o.code === 'FAILED');
        const outcome = failed.length === 0 && blocked.length === 0 ? 'FULL' : created.length ? 'PARTIAL' : 'NONE';
        return { outcome, created, skipped, blocked, failed,
          summary: { created: count(created), skipped: count(skipped), blocked: count(blocked), failed: count(failed), total: outcomes.length } };
      },
      async (u, row) => (await planRevenueSaveAssignment(u, { ...row.args, bulk: row.args.bulk, period: row.args.period })).preview);
  });
}


export async function beginAuthorizedChat(user: AuthenticatedUser, revenueOpenPeriod?: string) {
  requireCapability(user, "chatbot.data_read", { userId: user.userId, employeeId: user.employeeId });
  const requestId = randomUUID(), version = user.securityVersion ?? 0;
  await receipts().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await receipts().insertOne({ _id: requestId, userId: user.userId, securityVersion: version, contextHash: contextHash(user), status: "ACTIVE", expiresAt: new Date(Date.now() + 90000), documents: [], projects: [], schedules: [], performanceEvaluations: [], revenueReads: [], legacyEvaluations: [], candidateSuggestions: [], profileReads: [], departmentKpiReads: [], directoryReads: [], revenueOpenPeriod, sid: user.sid ?? undefined });
  const delegationToken = await new SignJWT({ av: version, requestId, purpose: "authorized-tools" }).setSubject(user.userId)
    .setProtectedHeader({ alg: "HS256" }).setAudience("hr-blockbot-scoped-tools").setIssuedAt().setExpirationTime("90s").sign(getJwtSecret());
  return { requestId, delegationToken, revenueOpenPeriod };
}

export async function readMyProfile(user: AuthenticatedUser) {
  requireCapability(user, "profile.read_self", { employeeId: user.employeeId });
  const employee: any = await EmployeeModel.findById(user.employeeId).select("fullName full_name job_title skills").lean();
  return employee ? { fullName: employee.fullName || employee.full_name, jobTitle: employee.job_title ?? null, skills: employee.skills ?? [] } : { unavailable: true };
}

export async function readDirectory(user: AuthenticatedUser) {
  const rows: any[] = await EmployeeModel.find({ $and: [employeeScopeQuery(user, "directory.read_store"), { status: "active" }] }).select("fullName full_name job_title").sort({ fullName: 1, _id: 1 }).limit(20).lean();
  return rows.map((row) => ({ fullName: row.fullName || row.full_name, jobTitle: row.job_title ?? null }));
}

export async function readDepartmentKpi(user: AuthenticatedUser, resolvedPeriod: string) {
  requireCapability(user, "kpi.read_department");
  periodRange(resolvedPeriod);
  const stores = allowedStoreIds(user, "kpi.read_department");
  const clauses: Record<string, any>[] = [];
  if (stores.length) clauses.push({ storeId: { $in: stores.map((id) => new mongoose.Types.ObjectId(id)) } });
  if (user.departmentId && mongoose.Types.ObjectId.isValid(user.departmentId)) clauses.push({ departmentId: new mongoose.Types.ObjectId(user.departmentId) });
  if (!clauses.length) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có phạm vi KPI phòng ban");
  const rows: any[] = await EvaluationModel.find({ period: resolvedPeriod, $or: clauses, frameworkVersion: { $not: { $gte: 2 } } }).select("status finalScore machineScore").limit(5000).lean();
  const published = rows.filter((row) => row.status === "PUBLISHED" && typeof row.finalScore === "number");
  const average = (values: number[]) => values.length ? Math.round(values.reduce((a, b) => a + b, 0) / values.length * 100) / 100 : null;
  return { period: resolvedPeriod, published: published.length, pendingReview: rows.length - published.length,
    averageFinalScore: average(published.map((row) => row.finalScore)),
    averageMachineScore: average(published.map((row) => row.machineScore).filter((value) => typeof value === "number")),
    note: "Chỉ số tổng hợp; không trả điểm hay nhận xét của từng nhân viên." };
}
export async function executeGatewayTool(token: string, body: unknown) {
  const parsed = GatewayToolRequestSchema.safeParse(body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Tool/arguments are not allowlisted");
  let payload;
  try { ({ payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"], audience: "hr-blockbot-scoped-tools" })); }
  catch { throw new WorkflowError(401, "UNAUTHENTICATED", "Invalid scoped tool token"); }
  const { requestId, tool, args } = parsed.data;
  if (!payload.sub || payload.purpose !== "authorized-tools" || payload.requestId !== requestId || !Number.isSafeInteger(payload.av)) throw new WorkflowError(401, "UNAUTHENTICATED", "Scoped token binding mismatch");
  const request = await receipts().findOne({ _id: requestId, userId: payload.sub as string, securityVersion: payload.av as number, status: "ACTIVE", expiresAt: { $gt: new Date() } });
  if (!request) throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request expired or closed");
  const user = await resolvePrincipal({ sub: payload.sub as string, role: "Employee", securityVersion: payload.av as number, sid: request.sid ?? undefined });
  requireCapability(user, "chatbot.data_read", { userId: user.userId, employeeId: user.employeeId });
  if (request.contextHash !== contextHash(user)) throw new WorkflowError(409, "CHAT_AUTHORIZATION_CHANGED", "Authority changed during context preparation");
  let result: unknown,
    documents: DocumentReceipt[] = [],
    projects: ProjectReceipt[] = [],
    schedules: ScheduleReceipt[] = [],
    performanceEvaluations: PerformanceEvaluationReceipt[] = [],
    revenueReads: RevenueReadReceipt[] = [],
    legacyEvaluations: LegacyEvaluationReceipt[] = [],
    candidateSuggestions: CandidateSuggestionReceipt[] = [],
    profileReads: ProfileReadReceipt[] = [],
    departmentKpiReads: DepartmentKpiReadReceipt[] = [],
    directoryReads: DirectoryReadReceipt[] = [];
  if (tool === "preview_revenue_period_open") {
    const { period } = z.object({ period: RevenueKpiMonthSchema }).strict().parse(args);
    if (period !== request.revenueOpenPeriod) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Kỳ KPI không khớp yêu cầu chat.');
    const proposal = await proposeRevenueKpiPeriodOpen(user, period, requestId);
    const bound = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } }, { $set: { revenueOpenActionId: proposal.actionId } });
    if (!bound.matchedCount) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Yêu cầu chat đã hết hạn.');
    return { result: { actionId: proposal.actionId, type: proposal.type, preview: proposal.preview, requiresConfirmation: true, executed: false }, proposalOnly: true };
  }
  if (tool === "preview_revenue_assignment_action") {
    if (!args.assignmentId || !args.action) throw new WorkflowError(400, "VALIDATION_FAILED", "Canonical assignmentId and action are required");
    // Deterministic action id (uuid formatted from the args digest): repeated
    // tool calls within one chat request converge on the same proposal instead
    // of stacking unconfirmed rows.
    const hex = digest({ requestId, assignmentId: args.assignmentId, action: args.action,
      expectedVersion: args.expectedVersion, planDigest: args.planDigest, reason: args.reason, evidenceRef: args.evidenceRef,
      newTargetVnd: args.newTargetVnd, newGrowthPercent: args.newGrowthPercent, force: args.force, assigneeEmployeeId: args.assigneeEmployeeId, from: args.from });
    const actionId = [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20, 32)].join('-');
    const proposal = await previewRevenueAssignmentAction(user, args.assignmentId, args.action, {
      ...(args.expectedVersion !== undefined ? { expectedVersion: args.expectedVersion } : {}),
      ...(args.planDigest !== undefined ? { planDigest: args.planDigest } : {}),
      ...(args.reason !== undefined ? { reason: args.reason } : {}),
      ...(args.evidenceRef !== undefined ? { evidenceRef: args.evidenceRef } : {}),
      ...(args.newTargetVnd !== undefined ? { newTargetVnd: args.newTargetVnd } : {}),
      ...(args.newGrowthPercent !== undefined ? { newGrowthPercent: args.newGrowthPercent } : {}),
      ...(args.force !== undefined ? { force: args.force } : {}),
      ...(args.assigneeEmployeeId !== undefined ? { assigneeEmployeeId: args.assigneeEmployeeId } : {}),
      ...(args.from !== undefined ? { from: args.from } : {}),
    });
    const bound = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } }, { $set: { revenueAssignmentActionId: proposal.actionId } });
    if (!bound.matchedCount) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Yêu cầu chat đã hết hạn.');
    return { result: { actionId: proposal.actionId, type: proposal.type, preview: proposal.preview, requiresConfirmation: true, executed: false }, proposalOnly: true };
  }
  if (tool === "preview_revenue_kpi_assign_action") {
    const parsed = z.discriminatedUnion('assignAction', [
      z.object({ assignAction: z.literal('create_period'), period: RevenueKpiMonthSchema, policy: C.RevenueKpiPolicySchema }).strict(),
      z.object({ assignAction: z.literal('save_assignment'), period: RevenueKpiMonthSchema, unitType: z.enum(["STORE", "AREA"]),
        storeId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
        storeIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).min(1).max(500).optional(),
        assigneeEmployeeId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
        targetMode: C.RevenueKpiTargetModeSchema, targetVnd: z.number().int().safe().positive().optional(),
        growthPercent: z.number().finite().min(-50).max(100).optional(), reason: z.string().trim().min(5).max(2000),
        bulk: z.boolean().default(false) }).strict(),
    ]).parse(args);
    const proposedId = p5DeterministicId({ requestId, tool, ...parsed });
    if (parsed.assignAction === 'create_period') {
      const proposal = await previewChatRevenueCreatePeriod(user, parsed.period, parsed.policy, proposedId);
      const bound = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } },
        { $set: { revenueCreatePeriodActionId: proposal.actionId } });
      if (!bound.matchedCount) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Yêu cầu chat đã hết hạn.');
      return { result: { actionId: proposal.actionId, type: proposal.type, preview: proposal.preview, requiresConfirmation: true, executed: false }, proposalOnly: true };
    }
    const proposal = await previewChatRevenueSaveAssignment(user, parsed, proposedId);
    const bound = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } },
      { $set: { revenueSaveAssignmentActionId: proposal.actionId } });
    if (!bound.matchedCount) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Yêu cầu chat đã hết hạn.');
    return { result: { actionId: proposal.actionId, type: proposal.type, preview: proposal.preview, requiresConfirmation: true, executed: false }, proposalOnly: true };
  }
  if (tool === "preview_performance_kpi_action") {
    const parsed = z.object({
      domain: z.enum(["task", "evaluation"]),
      kind: z.string().min(3).max(40),
      target: z.record(z.unknown()).optional().default({}),
      content: z.record(z.unknown()).optional().default({}),
    }).passthrough().parse(args);
    const { domain, kind } = parsed;
    const target: Record<string, unknown> = {
      ...(parsed.target ?? {}),
      ...(args.policyId ? { policyId: args.policyId } : {}),
      ...(args.taskId ? { taskId: args.taskId } : {}),
      ...(args.evaluationId ? { evaluationId: args.evaluationId } : {}),
    };
    const content: Record<string, unknown> = {
      ...(parsed.content ?? {}),
      ...(args.assignments ? { assignments: args.assignments } : {}),
      ...(args.assigneeEmployeeId ? { assigneeEmployeeId: args.assigneeEmployeeId } : {}),
      ...(args.employeeIds ? { employeeIds: args.employeeIds } : {}),
      ...(args.reason ? { reason: args.reason } : {}),
      ...(args.evidenceRef ? { evidenceRefs: [args.evidenceRef] } : {}),
      ...(args.evidenceRefs ? { evidenceRefs: args.evidenceRefs } : {}),
      ...(args.criterionCodes ? { criterionCodes: args.criterionCodes } : {}),
      ...(args.decision ? { decision: args.decision } : {}),
      ...(args.text ? { text: args.text } : {}),
    };
    if (kind === 'evaluation.score' || kind === 'task.evaluate' || 'criteriaScores' in content || 'workCompletedPercent' in content || 'score' in content || 'scores' in content) {
      throw new WorkflowError(403, 'PERFORMANCE_KPI_RBAC_DENIED', 'Công cụ ủy quyền AI không được phép gửi điểm số đánh giá.');
    }
    const proposedId = p5DeterministicId({ requestId, tool, domain, kind, target, content });
    const proposal = domain === "task"
      ? await previewPerformanceKpiTaskAction(user, kind, target as { policyId?: string; taskId?: string }, content, proposedId)
      : await previewPerformanceKpiEvaluationAction(user, kind, target as { evaluationId: string }, content, proposedId);
    const bound = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } },
      { $set: { performanceKpiActionId: proposal.actionId } });
    if (!bound.matchedCount) throw new WorkflowError(403, 'CHAT_REQUEST_UNAVAILABLE', 'Yêu cầu chat đã hết hạn.');
    return { result: { actionId: proposal.actionId, type: proposal.type, preview: proposal.preview, requiresConfirmation: true, executed: false }, proposalOnly: true };
  }
  if (tool === "get_my_profile") {
    result = await readMyProfile(user);
    profileReads.push({ digest: digest(result) });
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
    result = await readDirectory(user);
    directoryReads.push({ digest: digest(result) });
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
    legacyEvaluations.push({
      period,
      employeeId: user.employeeId,
      version: row?.version ?? 0,
      digest: digest(result),
    });
    }
  } else if (tool === "get_department_kpi") {
    const period = args.period ?? currentPeriod();
    result = await readDepartmentKpi(user, period);
    departmentKpiReads.push({ period, digest: digest(result) });
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
  } else if (tool === "get_my_revenue_kpi") {
    if (!user.employeeId) throw new WorkflowError(403, "RBAC_DENIED", "Tài khoản chưa gắn hồ sơ nhân viên");
    result = await getMyRevenueKpi(user, args.period);
  } else if (tool === "list_my_pending_actions") {
    if (!user.employeeId) throw new WorkflowError(403, "RBAC_DENIED", "Tài khoản chưa gắn hồ sơ nhân viên");
    result = await listMyPendingActions(user, { ...(args.limit !== undefined && { limit: args.limit }), ...(args.offset !== undefined && { offset: args.offset }) });
  } else if (tool === "get_revenue_kpi_detail") {
    if (!args.assignmentId) throw new WorkflowError(400, "VALIDATION_FAILED", "Canonical assignmentId required");
    result = await getRevenueKpiDetail(user, args.assignmentId);
  } else if (tool === "get_revenue_kpi_result") {
    if (!args.assignmentId) throw new WorkflowError(400, "VALIDATION_FAILED", "Canonical assignmentId required");
    result = await revenueKpiAssignmentResult(user, args.assignmentId);
  } else if (tool === "get_my_tasks") {
    if (!user.employeeId) throw new WorkflowError(403, "RBAC_DENIED", "Tài khoản chưa gắn hồ sơ nhân viên");
    result = await getMyTasks(user, args.period);
  } else if (tool === "suggest_suitable_candidates") {
    const taskRef = args.taskRef || args.taskId;
    if (!taskRef) throw new WorkflowError(400, "VALIDATION_FAILED", "Canonical taskRef or taskId required");
    const asOf = new Date().toISOString();
    result = await suggestSuitableCandidates(user, taskRef, { asOf });
    candidateSuggestions.push({
      taskRef,
      asOf,
      digest: digest(result),
    });
  }
  if (["get_my_revenue_kpi", "list_my_pending_actions", "get_revenue_kpi_detail", "get_revenue_kpi_result", "get_my_tasks"].includes(tool))
    revenueReads.push({ tool, digest: digest(result),
      ...(args.period !== undefined && { period: args.period }),
      ...(args.assignmentId !== undefined && { assignmentId: args.assignmentId }),
      ...(args.limit !== undefined && { limit: args.limit }),
      ...(args.offset !== undefined && { offset: args.offset }) });
  if (tool === "validate_context") result = { valid: true };
  // Only an unknown tool falls back; every handled branch above must keep its result.
  if (result === undefined) result = { unavailable: true, reason: "Tool is outside Authorization V1; no guessed data" };
  const record = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } },
    { $addToSet: { documents: { $each: documents }, projects: { $each: projects }, schedules: { $each: schedules }, performanceEvaluations: { $each: performanceEvaluations },
      revenueReads: { $each: revenueReads }, legacyEvaluations: { $each: legacyEvaluations }, candidateSuggestions: { $each: candidateSuggestions },
      profileReads: { $each: profileReads }, departmentKpiReads: { $each: departmentKpiReads }, directoryReads: { $each: directoryReads } } });
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
export async function revalidateChatAuthorization(user: AuthenticatedUser, requestId: string): Promise<{ current: AuthenticatedUser; row: ChatAuthorizationRequestDoc; citations: { document: string; version: string; score: number }[] }> {
  const row = await receipts().findOne({ _id: requestId, userId: user.userId, securityVersion: user.securityVersion, status: "ACTIVE", expiresAt: { $gt: new Date() } });
  if (!row) throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request no longer valid");
  const sid = user.sid ?? row.sid;
  const current = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion, sid: sid ?? undefined });
  requireCapability(current, "chatbot.data_read", { userId: current.userId, employeeId: current.employeeId });
  if (row.sid && current.sid && row.sid !== current.sid) {
    throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Session family mismatch");
  }
  if (row.contextHash !== contextHash(current)) throw new WorkflowError(409, "CHAT_AUTHORIZATION_CHANGED", "Authority changed while generating a response");
  const citations: { document: string; version: string; score: number }[] = [];
  for (const receipt of row.documents) {
    const document = await mongoose.connection.collection("policies").findOne({ _id: objectId(receipt.documentId) });
    if (!document || !documentAllowed(current, document) || documentReceipt(document).digest !== receipt.digest) {
      throw new WorkflowError(403, "DOCUMENT_ACCESS_CHANGED", "Document ACL changed during response");
    }
    citations.push({ document: String(document.title), version: String(document.version ?? ""), score: 1 });
  }
  for (const receipt of row.projects) {
    const project = await visibleProject(current, receipt.projectId);
    if ((project.version ?? 1) !== receipt.version) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Project changed during response");
    }
  }
  for (const receipt of row.schedules ?? []) {
    const data = await personalSchedule(current, receipt.from, receipt.to);
    if (digest(data.assignments.map(({ weekVersion, ...a }) => a)) !== receipt.digest) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Lịch đã công bố vừa thay đổi. Vui lòng hỏi lại.");
    }
  }
  for (const receipt of row.performanceEvaluations ?? []) {
    const evaluation = await getPerformanceEvaluation(current, receipt.id);
    if (evaluation.version !== receipt.version) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "KPI đã thay đổi trong khi trả lời. Vui lòng hỏi lại.");
    }
  }
  for (const receipt of row.revenueReads ?? []) {
    const args = {
      ...(receipt.period !== undefined && { period: receipt.period }),
      ...(receipt.assignmentId !== undefined && { assignmentId: receipt.assignmentId }),
      ...(receipt.limit !== undefined && { limit: receipt.limit }),
      ...(receipt.offset !== undefined && { offset: receipt.offset }),
    };
    const fresh = receipt.tool === "get_my_revenue_kpi" ? await getMyRevenueKpi(current, receipt.period)
      : receipt.tool === "list_my_pending_actions" ? await listMyPendingActions(current, args)
      : receipt.tool === "get_my_tasks" ? await getMyTasks(current, receipt.period)
      : receipt.tool === "get_revenue_kpi_result" && receipt.assignmentId ? await revenueKpiAssignmentResult(current, receipt.assignmentId)
      : receipt.assignmentId ? await getRevenueKpiDetail(current, receipt.assignmentId) : null;
    if (fresh === null || digest(fresh) !== receipt.digest) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Dữ liệu KPI doanh thu vừa thay đổi. Vui lòng hỏi lại.");
    }
  }
  for (const receipt of row.legacyEvaluations ?? []) {
    requireCapability(current, "kpi.read_self", { employeeId: current.employeeId });
    if (!current.employeeId || current.employeeId !== receipt.employeeId) {
      throw new WorkflowError(403, "RBAC_DENIED", "KPI quyền truy cập đã thay đổi.");
    }
    const freshRow = await EvaluationModel.findOne({
      employeeId: new mongoose.Types.ObjectId(current.employeeId),
      period: receipt.period,
    }).lean() as { status?: string; finalScore?: number; machineScore?: number; analysis?: { explanation?: string | null; themes?: string[]; riskSignals?: string[] }; overrideReason?: string | null; publishedAt?: string } | null;
    const freshResult = !freshRow ? { period: receipt.period, available: false, message: "Chưa có kỳ đánh giá KPI cho tháng này." }
      : freshRow.status === "PUBLISHED"
        ? { period: receipt.period, available: true, status: freshRow.status, finalScore: freshRow.finalScore, machineScore: freshRow.machineScore,
            explanation: freshRow.analysis?.explanation ?? null, themes: freshRow.analysis?.themes ?? [], riskSignals: freshRow.analysis?.riskSignals ?? [],
            overrideReason: freshRow.overrideReason ?? null, publishedAt: freshRow.publishedAt }
        : { period: receipt.period, available: false, status: freshRow.status, message: "Kỳ đánh giá chưa được công bố; chỉ xem chi tiết sau khi quản lý chốt." };
    if (digest(freshResult) !== receipt.digest) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Dữ liệu đánh giá KPI đã thay đổi trong khi trả lời. Vui lòng hỏi lại.");
    }
  }
  for (const receipt of row.candidateSuggestions ?? []) {
    if (!receipt.asOf) throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Snapshot ứng viên cũ không còn xác minh được.");
    const fresh = await suggestSuitableCandidates(current, receipt.taskRef, { asOf: receipt.asOf });
    if (digest(fresh) !== receipt.digest) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Danh sách ứng viên phù hợp đã thay đổi trong khi trả lời. Vui lòng hỏi lại.");
    }
  }
  for (const receipt of row.profileReads ?? []) {
    const fresh = await readMyProfile(current);
    if (digest(fresh) !== receipt.digest) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Hồ sơ cá nhân đã thay đổi trong khi trả lời. Vui lòng hỏi lại.");
    }
  }
  for (const receipt of row.departmentKpiReads ?? []) {
    const fresh = await readDepartmentKpi(current, receipt.period);
    if (digest(fresh) !== receipt.digest) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "KPI phòng ban đã thay đổi trong khi trả lời. Vui lòng hỏi lại.");
    }
  }
  for (const receipt of row.directoryReads ?? []) {
    const fresh = await readDirectory(current);
    if (digest(fresh) !== receipt.digest) {
      throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Danh bạ nhân sự đã thay đổi trong khi trả lời. Vui lòng hỏi lại.");
    }
  }
  return { current, row, citations };
}

export interface ProposalActionLike {
  actionId?: string;
  type?: string;
}

export interface ActionEvidenceContainer {
  revenueOpenActionId?: string;
  revenueAssignmentActionId?: string;
  revenueSaveAssignmentActionId?: string;
  revenueCreatePeriodActionId?: string;
  performanceKpiActionId?: string;
}

export function proposalActionEvidence(proposedAction: ProposalActionLike | null | undefined, row?: ActionEvidenceContainer | null): Record<string, string> {
  const result: Record<string, string> = {};
  if (row?.revenueOpenActionId) result.revenueOpenActionId = row.revenueOpenActionId;
  if (row?.revenueAssignmentActionId) result.revenueAssignmentActionId = row.revenueAssignmentActionId;
  if (row?.revenueSaveAssignmentActionId) result.revenueSaveAssignmentActionId = row.revenueSaveAssignmentActionId;
  if (row?.revenueCreatePeriodActionId) result.revenueCreatePeriodActionId = row.revenueCreatePeriodActionId;
  if (row?.performanceKpiActionId) result.performanceKpiActionId = row.performanceKpiActionId;

  if (proposedAction?.actionId) {
    const type = proposedAction.type;
    if (type === "revenue_kpi.open_period") result.revenueOpenActionId = proposedAction.actionId;
    else if (type === "revenue_kpi.mutate_assignment") result.revenueAssignmentActionId = proposedAction.actionId;
    else if (type === "revenue_kpi.save_assignment") result.revenueSaveAssignmentActionId = proposedAction.actionId;
    else if (type === "revenue_kpi.create_period") result.revenueCreatePeriodActionId = proposedAction.actionId;
    else if (type === "performance_kpi.task_action" || type === "performance_kpi.evaluation_action") {
      result.performanceKpiActionId = proposedAction.actionId;
    } else {
      result.revenueOpenActionId = proposedAction.actionId;
    }
  }
  return result;
}

export async function reloadServerProposedAction(current: AuthenticatedUser, row: ActionEvidenceContainer | null | undefined) {
  if (!row) return null;
  if (row.revenueAssignmentActionId) return await getRevenueKpiAssignmentAction(current, row.revenueAssignmentActionId);
  if (row.revenueSaveAssignmentActionId) return await getChatRevenueSaveAssignmentAction(current, row.revenueSaveAssignmentActionId);
  if (row.revenueCreatePeriodActionId) return await getChatRevenueCreatePeriodAction(current, row.revenueCreatePeriodActionId);
  if (row.performanceKpiActionId) return await getChatPerformanceKpiAction(current, row.performanceKpiActionId);
  if (row.revenueOpenActionId) {
    try {
      return await getRevenueKpiOpenAction(current, row.revenueOpenActionId);
    } catch (error: unknown) {
      const err = error as { status?: number; code?: string } | null;
      if (err?.status === 404 || err?.code === 'REVENUE_KPI_ACTION_NOT_FOUND') {
        const p5 = await p5Actions().findOne({ _id: row.revenueOpenActionId, ownerId: current.userId });
        if (p5?.type === 'revenue_kpi.mutate_assignment') {
          return await getRevenueKpiAssignmentAction(current, row.revenueOpenActionId);
        } else if (p5?.type === 'revenue_kpi.save_assignment') {
          return await getChatRevenueSaveAssignmentAction(current, row.revenueOpenActionId);
        } else if (p5?.type === 'revenue_kpi.create_period') {
          return await getChatRevenueCreatePeriodAction(current, row.revenueOpenActionId);
        } else if (p5?.type === 'performance_kpi.task_action' || p5?.type === 'performance_kpi.evaluation_action') {
          return await getChatPerformanceKpiAction(current, row.revenueOpenActionId);
        }
      }
      throw error;
    }
  }
  return null;
}

export function computeProposalReply(proposedAction: any, period: string | null | undefined, defaultReply: string) {
  const proposalReply = proposedAction?.type === "revenue_kpi.open_period" ? "Đây là bản xem trước mở kỳ KPI doanh thu. Kiểm tra kế hoạch rồi xác nhận nếu muốn thực hiện."
    : proposedAction?.type === "revenue_kpi.mutate_assignment" ? "Đây là bản xem trước điều chỉnh KPI doanh thu. Kiểm tra nội dung rồi xác nhận nếu muốn thực hiện."
    : proposedAction?.type === "revenue_kpi.create_period" ? "Đây là bản xem trước tạo kỳ KPI doanh thu. Kiểm tra policy rồi xác nhận nếu muốn thực hiện."
    : proposedAction?.type === "revenue_kpi.save_assignment" ? "Đây là bản xem trước giao KPI doanh thu. Kiểm tra danh sách rồi xác nhận nếu muốn thực hiện."
    : proposedAction?.type === "performance_kpi.task_action" ? "Đây là bản xem trước thao tác nhiệm vụ KPI hiệu suất. Kiểm tra nội dung rồi xác nhận nếu muốn thực hiện."
    : proposedAction?.type === "performance_kpi.evaluation_action" ? "Đây là bản xem trước thao tác đánh giá KPI hiệu suất. Kiểm tra nội dung rồi xác nhận nếu muốn thực hiện." : null;
  return proposalReply ?? (period ? "Chưa lập được bản xem trước KPI doanh thu. Hãy kiểm tra quyền và kỳ đã tạo trên Web." : defaultReply);
}

export async function authorizedChat(user: AuthenticatedUser, message: string, conversationId?: string,
  onValidated?: (response: unknown, evidence: ChatHistoryEvidence) => Promise<void>) {
  const period = revenueOpenIntent(message);
  const authorization = await beginAuthorizedChat(user, period ?? undefined);
  try {
    const result: ChatResult = period === null
      ? { reply: "Bạn muốn xem trước kỳ nào? Hãy ghi rõ tháng, ví dụ 11/2026.", citations: [], attachments: [], proposedAction: null, abstain: false }
      : await chatWithAiService(message, {}, conversationId, authorization);
    const { current, row, citations } = await revalidateChatAuthorization(user, authorization.requestId);
    const proposedAction = await reloadServerProposedAction(current, row);
    const reply = computeProposalReply(proposedAction, period, result.reply);
    const response = { ...result, reply, citations, attachments: [], proposedAction };
    if (onValidated) {
      const actionEvidence = proposalActionEvidence(proposedAction, row);
      await onValidated(response, {
        documents: row.documents,
        projects: row.projects,
        schedules: row.schedules ?? [],
        performanceEvaluations: row.performanceEvaluations ?? [],
        revenueReads: row.revenueReads ?? [],
        legacyEvaluations: row.legacyEvaluations ?? [],
        candidateSuggestions: row.candidateSuggestions ?? [],
        profileReads: row.profileReads ?? [],
        departmentKpiReads: row.departmentKpiReads ?? [],
        directoryReads: row.directoryReads ?? [],
        ...actionEvidence,
      });
    }
    return response;
  } finally { await receipts().updateOne({ _id: authorization.requestId }, { $set: { status: "CLOSED" } }); }
}

export async function authorizedChatStream(
  user: AuthenticatedUser,
  message: string,
  conversationId: string | undefined,
  callbacks: {
    onChunk: (delta: string) => Promise<void>;
    signal?: AbortSignal;
  },
  onValidated?: (
    response: unknown,
    evidence: ChatHistoryEvidence
  ) => Promise<void>
) {
  if (callbacks.signal?.aborted) {
    throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy');
  }
  const period = revenueOpenIntent(message);
  const authorization = await beginAuthorizedChat(user, period ?? undefined);

  // ponytail: bounded coalescing with 40ms timer / 120 chars ceiling avoids per-token revalidation amplification; upgrade path: adaptive pacing based on upstream RTT.
  const COALESCE_DELAY_MS = 40;
  const COALESCE_MAX_CHARS = 120;
  let pendingDeltas: string[] = [];
  let pendingChars = 0;
  let timer: NodeJS.Timeout | null = null;
  let flushError: unknown = null;
  let flushPromise: Promise<void> = Promise.resolve();
  const streamAbortController = new AbortController();

  const onCallerAbort = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    streamAbortController.abort();
  };
  if (callbacks.signal?.aborted) onCallerAbort();
  else callbacks.signal?.addEventListener('abort', onCallerAbort, { once: true });

  const flushBatch = async (): Promise<void> => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pendingDeltas.length === 0) return;
    const batch = pendingDeltas.join('');
    pendingDeltas = [];
    pendingChars = 0;

    if (callbacks.signal?.aborted) {
      throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy');
    }

    await revalidateChatAuthorization(user, authorization.requestId);

    if (callbacks.signal?.aborted) {
      throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy');
    }

    await callbacks.onChunk(batch);

    if (callbacks.signal?.aborted) {
      throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy');
    }
  };

  const runFlush = async (): Promise<void> => {
    if (flushError) throw flushError;
    try {
      await flushBatch();
    } catch (err) {
      flushError = err;
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      streamAbortController.abort();
      throw err;
    }
  };

  const enqueueFlush = (): Promise<void> => {
    flushPromise = flushPromise.catch(() => {}).then(() => runFlush());
    return flushPromise;
  };

  const scheduleTimer = () => {
    if (timer || flushError) return;
    timer = setTimeout(() => {
      timer = null;
      enqueueFlush().catch(() => {});
    }, COALESCE_DELAY_MS);
  };

  try {
    let result: ChatResult;
    if (period === null) {
      result = { reply: "Bạn muốn xem trước kỳ nào? Hãy ghi rõ tháng, ví dụ 11/2026.", citations: [], attachments: [], proposedAction: null, abstain: false };
    } else {
      try {
        result = await streamChatWithAiService(
          message,
          {},
          conversationId,
          authorization,
          {
            signal: streamAbortController.signal,
            onDelta: async (delta: string) => {
              if (flushError) throw flushError;
              if (callbacks.signal?.aborted) {
                throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy');
              }
              pendingDeltas.push(delta);
              pendingChars += delta.length;
              if (pendingChars >= COALESCE_MAX_CHARS) {
                await enqueueFlush();
              } else {
                scheduleTimer();
              }
            },
          }
        );
      } catch (streamErr) {
        await flushPromise.catch(() => {});
        if (flushError) throw flushError;
        throw streamErr;
      }
    }

    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    await enqueueFlush();
    if (flushError) throw flushError;

    if (callbacks.signal?.aborted) {
      throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy');
    }
    const { current, row, citations } = await revalidateChatAuthorization(user, authorization.requestId);
    if (callbacks.signal?.aborted) {
      throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy');
    }
    const proposedAction = await reloadServerProposedAction(current, row);
    const reply = computeProposalReply(proposedAction, period, result.reply);
    const response = { ...result, reply, citations, attachments: [], proposedAction };
    if (callbacks.signal?.aborted) {
      throw new WorkflowError(499, 'CLIENT_CLOSED_REQUEST', 'Yêu cầu đã bị hủy');
    }
    if (onValidated) {
      const actionEvidence = proposalActionEvidence(proposedAction, row);
      await onValidated(response, {
        documents: row.documents,
        projects: row.projects,
        schedules: row.schedules ?? [],
        performanceEvaluations: row.performanceEvaluations ?? [],
        revenueReads: row.revenueReads ?? [],
        legacyEvaluations: row.legacyEvaluations ?? [],
        candidateSuggestions: row.candidateSuggestions ?? [],
        profileReads: row.profileReads ?? [],
        departmentKpiReads: row.departmentKpiReads ?? [],
        directoryReads: row.directoryReads ?? [],
        ...actionEvidence,
      });
    }
    return response;
  } finally {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    callbacks.signal?.removeEventListener('abort', onCallerAbort);
    await receipts().updateOne({ _id: authorization.requestId }, { $set: { status: "CLOSED" } });
  }
}
export { getChatPerformanceKpiAction, previewPerformanceKpiTaskAction, previewPerformanceKpiEvaluationAction };

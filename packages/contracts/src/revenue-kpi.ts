import { z } from 'zod';
const id = z.string().regex(/^[a-f0-9]{24}$/i).transform(s => s.toLowerCase());
export const RevenueKpiMonthSchema = z.string().regex(/^20\d{2}-(0[1-9]|1[0-2])$/);
const time = z.string().datetime(), money = z.number().int().safe().nonnegative(), target = money.positive();
const reason = z.string().trim().min(5).max(2000), percent = z.number().finite();
export const RevenueKpiPeriodStatusSchema = z.enum(['DRAFT', 'OPEN', 'CLOSED', 'ARCHIVED']);
export const RevenueKpiAssignmentStatusSchema = z.enum(['DRAFT', 'PENDING_ACCEPTANCE', 'ACCEPTED', 'REFUSED', 'HR_REVIEW', 'ACTIVE', 'ADJUSTMENT_REQUESTED', 'CLOSED', 'CANCELLED']);
export const RevenueKpiUnitTypeSchema = z.enum(['STORE', 'AREA']);
export const RevenueKpiTargetModeSchema = z.enum(['GROWTH_PERCENT', 'ABSOLUTE_VND']);
export const RevenueKpiResultStatusSchema = z.enum(['PENDING', 'PENDING_DATA', 'COMPUTED', 'AWAITING_REASON', 'CONFIRMED', 'CORRECTED']);
export const RevenueKpiDataKindSchema = z.enum(['none', 'demo', 'live', 'mixed']);
export const RevenueKpiHrDecisionActionSchema = z.enum(['KEEP', 'ADJUST', 'CANCEL']);
export const RevenueKpiAdjustmentStatusSchema = z.enum(['PENDING', 'VERIFIED', 'APPROVED', 'REJECTED']);
export const RevenueKpiPolicySchema = z.object({ defaultGrowthPercent: percent.min(-50).max(100).default(3), growthBase: z.literal('PREVIOUS_MONTH').default('PREVIOUS_MONTH'),
  underperformingRateThresholdPercent: percent.min(0).max(100).default(30), acceptanceWindowWorkingDays: z.number().int().min(1).max(30).default(3),
  allowDemoData: z.boolean().default(false), aiProposalEnabled: z.boolean().default(true) }).strict();
export const RevenueKpiHistorySchema = z.object({ at: time, by: id, actorKind: z.enum(['USER', 'SYSTEM']).default('USER'), action: z.string().min(1), fromStatus: z.string().nullable(), toStatus: z.string().nullable(),
  fromTargetVnd: money.nullable(), toTargetVnd: money.nullable(), reason: z.string().nullable(), requestId: z.string().uuid(), payloadHash: z.string().length(64) }).strict();
const history = z.array(RevenueKpiHistorySchema).max(2000);
export const RevenueKpiStoreSnapshotSchema = z.object({ storeId: id, storeName: z.string().min(1), baseRevenueVnd: money.nullable(), growthPercent: percent.min(-50).max(100).nullable(), targetVnd: target }).strict();
export const RevenueKpiResponsibilitySchema = z.object({ employeeId: id, employeeName: z.string().min(1), role: z.enum(['PRIMARY', 'SUPPORT']), from: time, to: time.nullable() }).strict()
  .refine(v => !v.to || v.to > v.from, 'Responsibility interval must be positive');
export const RevenueKpiAiProposalSchema = z.object({ suggestedGrowthPercent: percent.min(-20).max(30).nullable(), rangeMinPercent: percent.min(-20).max(30).nullable(),
  rangeMaxPercent: percent.min(-20).max(30).nullable(), rationale: z.string().max(2000).nullable(), confidence: z.enum(['low', 'medium', 'high']).nullable(), model: z.string().max(120).nullable(),
  degraded: z.boolean(), insufficientData: z.boolean(), dataMonths: z.number().int().min(0).max(3), generatedAt: time }).strict();
export const RevenueKpiPeriodSchema = z.object({ id, period: RevenueKpiMonthSchema, status: RevenueKpiPeriodStatusSchema, policy: RevenueKpiPolicySchema,
  openedBy: id.nullable(), openedAt: time.nullable(), closedBy: id.nullable(), closedAt: time.nullable(), version: z.number().int().positive(), history, createdAt: time, updatedAt: time }).strict();
const hrDecision = z.object({ action: RevenueKpiHrDecisionActionSchema, reason, at: time, by: id }).strict();
const adjustment = z.object({ requestedBy: id, reason, evidenceRef: z.string().trim().min(5).max(2000), at: time, status: RevenueKpiAdjustmentStatusSchema,
  amNote: z.string().nullable(), verifiedBy: id.nullable(), verifiedAt: time.nullable(),
  hrDecision: z.object({ action: z.enum(['APPROVE', 'REJECT']), reason, at: time, by: id }).strict().nullable() }).strict();
export const RevenueKpiAssignmentSchema = z.object({ id, period: RevenueKpiMonthSchema, unitType: RevenueKpiUnitTypeSchema, storeId: id.nullable(), areaKey: z.string().nullable(),
  assigneeEmployeeId: id, assigneeRole: z.enum(['SM', 'AM']), assigneeName: z.string().min(1),
  targetMode: RevenueKpiTargetModeSchema, basePeriod: RevenueKpiMonthSchema.nullable(), baseRevenueVnd: money.nullable(), growthPercent: percent.min(-50).max(100).nullable(), targetVnd: target,
  stores: z.array(RevenueKpiStoreSnapshotSchema).min(1).max(500), responsibility: z.array(RevenueKpiResponsibilitySchema).min(1).max(200), status: RevenueKpiAssignmentStatusSchema,
  acceptance: z.object({ at: time, by: id, version: z.number().int().positive() }).strict().nullable(), refusal: z.object({ reason, at: time, by: id }).strict().nullable(),
  hrDecision: hrDecision.nullable(), adjustment: adjustment.nullable(), aiProposal: RevenueKpiAiProposalSchema.nullable(), deadlineAt: time.nullable(), overdue: z.boolean(),
  version: z.number().int().positive(), history, createdAt: time, updatedAt: time }).strict().superRefine((v, c) => {
    if (new Set(v.stores.map(s => s.storeId)).size !== v.stores.length || v.stores.reduce((n, s) => n + s.targetVnd, 0) !== v.targetVnd) c.addIssue({ code: 'custom', message: 'Snapshot targets must sum exactly, without duplicate stores' });
    if (v.unitType === 'STORE' ? v.assigneeRole !== 'SM' || v.stores.length !== 1 || v.storeId !== v.stores[0].storeId || v.areaKey !== null : v.assigneeRole !== 'AM' || v.storeId !== null || v.areaKey !== 'am:' + v.assigneeEmployeeId) c.addIssue({ code: 'custom', message: 'Invalid unit identity' });
  });
export const RevenueKpiStoreResultSchema = z.object({ storeId: id, storeName: z.string(), targetVnd: money, actualRevenueVnd: money.nullable(), achievementPercent: percent.nonnegative().nullable(), achieved: z.boolean().nullable(),
  orderCount: money, invalidOrderCount: money, dataKind: z.enum(['none', 'demo', 'live']) }).strict();
export const RevenueKpiResultSchema = z.object({ id, assignmentId: id, period: RevenueKpiMonthSchema, unitType: RevenueKpiUnitTypeSchema, storeId: id.nullable(), areaKey: z.string().nullable(), assigneeEmployeeId: id,
  assignmentVersion: z.number().int().positive(),
  status: RevenueKpiResultStatusSchema, targetVnd: target, actualRevenueVnd: money.nullable(), achievementPercent: percent.nonnegative().nullable(), achieved: z.boolean().nullable(),
  underperformingStoreCount: money.nullable(), underperformingStoreRatePercent: percent.min(0).max(100).nullable(), stores: z.array(RevenueKpiStoreResultSchema).max(500),
  dataKind: RevenueKpiDataKindSchema, orderCount: money, invalidOrderCount: money, pendingReasons: z.array(z.string()).max(1000),
  missReason: z.object({ text: reason, by: id, at: time, reviewedBy: id.nullable(), reviewedAt: time.nullable(), reviewDecision: z.enum(['ACKNOWLEDGED', 'REJECTED']).nullable(), reviewNote: z.string().nullable() }).strict().nullable(),
  computedBy: id.nullable(), computedAt: time.nullable(), confirmedBy: id.nullable(), confirmedAt: time.nullable(), version: z.number().int().positive(), supersedesResultId: id.nullable(), history, createdAt: time, updatedAt: time }).strict();
export const RevenueKpiCommandSchema = z.object({ expectedVersion: z.number().int().nonnegative(), clientRequestId: z.string().uuid() }).strict();
export const RevenueKpiCreatePeriodSchema = RevenueKpiCommandSchema.extend({ period: RevenueKpiMonthSchema, policy: RevenueKpiPolicySchema }).strict();
export const RevenueKpiDraftAssignmentSchema = RevenueKpiCommandSchema.extend({ id: id.optional(), period: RevenueKpiMonthSchema, unitType: RevenueKpiUnitTypeSchema, storeId: id.optional(), assigneeEmployeeId: id,
  targetMode: RevenueKpiTargetModeSchema, targetVnd: target.optional(), growthPercent: percent.min(-50).max(100).optional(),
  storeIds: z.array(id).min(1).max(500).optional(), reason, responsibilityFrom: time.optional() }).strict().refine(v => v.unitType !== 'STORE' || !!v.storeId, 'Store is required');
export const RevenueKpiPublishSchema = RevenueKpiCommandSchema;
export const RevenueKpiAcceptSchema = RevenueKpiCommandSchema;
export const RevenueKpiRefuseSchema = RevenueKpiCommandSchema.extend({ reason }).strict();
export const RevenueKpiHrDecisionSchema = RevenueKpiRefuseSchema.extend({ action: RevenueKpiHrDecisionActionSchema, newTargetVnd: target.optional(), newGrowthPercent: percent.min(-50).max(100).optional(), force: z.boolean().default(false) }).strict();
export const RevenueKpiAdjustmentRequestSchema = RevenueKpiRefuseSchema.extend({ evidenceRef: reason }).strict();
export const RevenueKpiAdjustmentVerifySchema = RevenueKpiRefuseSchema;
export const RevenueKpiAdjustmentDecisionSchema = RevenueKpiRefuseSchema.extend({ action: z.enum(['APPROVE', 'REJECT']), newTargetVnd: target.optional(), newGrowthPercent: percent.min(-50).max(100).optional() }).strict();
export const RevenueKpiComputeSchema = RevenueKpiCommandSchema;
export const RevenueKpiMissReasonSchema = RevenueKpiCommandSchema.extend({ text: reason }).strict();
export const RevenueKpiReviewReasonSchema = RevenueKpiCommandSchema.extend({ decision: z.enum(['ACKNOWLEDGED', 'REJECTED']), note: reason }).strict();
export const RevenueKpiConfirmSchema = RevenueKpiCommandSchema.extend({ waiveReason: reason.optional() }).strict();
export const RevenueKpiCorrectSchema = RevenueKpiRefuseSchema; // recompute actual ledger; no client-invented actual/target.
export const RevenueKpiAiProposalRequestSchema = RevenueKpiCommandSchema;
export const RevenueKpiResponsibilityChangeSchema = RevenueKpiRefuseSchema.extend({ assigneeEmployeeId: id, from: time }).strict();
export const RevenueKpiDashboardSchema = z.object({ period: RevenueKpiPeriodSchema, assignments: z.array(RevenueKpiAssignmentSchema), results: z.array(RevenueKpiResultSchema),
  candidates: z.array(z.object({ employeeId: id, name: z.string(), role: z.enum(['SM', 'AM']), storeIds: z.array(id) }).strict()),
  stores: z.array(z.object({ id, name: z.string(), smStatus: z.enum(['IDENTIFIED', 'AMBIGUOUS', 'MISSING']), smEmployeeIds: z.array(id) }).strict()),
  flags: z.array(z.string()), generatedAt: time }).strict();
export type RevenueKpiPolicy = z.infer<typeof RevenueKpiPolicySchema>;
export type RevenueKpiAssignment = z.infer<typeof RevenueKpiAssignmentSchema>;
export type RevenueKpiPeriod = z.infer<typeof RevenueKpiPeriodSchema>;
export type RevenueKpiResult = z.infer<typeof RevenueKpiResultSchema>;
export type RevenueKpiDashboard = z.infer<typeof RevenueKpiDashboardSchema>;

const openDigest = z.string().regex(/^[a-f0-9]{64}$/);
const openUnit = z.object({
  unitType: RevenueKpiUnitTypeSchema,
  storeId: id.nullable(),
  areaKey: z.string().nullable(),
  storeIds: z.array(id).min(1).max(500),
  label: z.string(),
  assigneeEmployeeId: id.nullable(),
  assigneeName: z.string().nullable(),
  assigneeRole: z.enum(['SM', 'AM']),
  assignmentId: id.nullable(),
  targetMode: RevenueKpiTargetModeSchema.nullable(),
  growthPercent: percent.nullable(),
  targetVnd: target.nullable(),
  code: z.string().nullable(),
  message: z.string().nullable(),
  retryable: z.boolean(),
  fixHint: z.string().nullable(),
}).strict();
export const RevenueKpiOpenItemSchema = openUnit.extend({
  status: z.enum(['CREATE', 'SKIP_ALREADY_EXISTS', 'BLOCKED']),
});
export const RevenueKpiOpenPreviewSchema = z.object({
  periodId: id, period: RevenueKpiMonthSchema, version: z.number().int().positive(),
  status: z.enum(['DRAFT', 'OPEN']), planDigest: openDigest, generatedAt: time,
  summary: z.object({ create: money, skipped: money, blocked: money, total: money }).strict(),
  items: z.array(RevenueKpiOpenItemSchema), executed: z.literal(false),
}).strict();
export const RevenueKpiOpenConfirmSchema = RevenueKpiCommandSchema.extend({ planDigest: openDigest });
const openOutcome = openUnit.extend({ status: z.enum(['CREATED', 'SKIPPED', 'BLOCKED', 'FAILED']) });
export const RevenueKpiOpenResultSchema = z.object({
  period: RevenueKpiPeriodSchema, executed: z.literal(true), outcome: z.enum(['FULL', 'PARTIAL', 'NONE']),
  created: z.array(openOutcome), skipped: z.array(openOutcome),
  blocked: z.array(openOutcome), failed: z.array(openOutcome),
  summary: z.object({ created: money, skipped: money, blocked: money, failed: money, total: money }).strict(),
}).strict();
export const RevenueKpiOpenActionIdSchema = z.string().uuid();
export const RevenueKpiOpenDecisionSchema = z.discriminatedUnion('approve', [
  RevenueKpiOpenConfirmSchema.extend({ approve: z.literal(true) }),
  z.object({ clientRequestId: z.string().uuid(), approve: z.literal(false) }).strict(),
]);
export const RevenueKpiOpenActionSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema, type: z.literal('revenue_kpi.open_period'),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXECUTED', 'EXPIRED', 'FAILED']),
  expiresAt: time, requiresConfirmation: z.boolean(), executed: z.boolean(),
  preview: RevenueKpiOpenPreviewSchema, result: RevenueKpiOpenResultSchema.nullable(),
}).strict();
export type RevenueKpiOpenItem = z.infer<typeof RevenueKpiOpenItemSchema>;
export type RevenueKpiOpenPreview = z.infer<typeof RevenueKpiOpenPreviewSchema>;
export type RevenueKpiOpenResult = z.infer<typeof RevenueKpiOpenResultSchema>;
export type RevenueKpiOpenAction = z.infer<typeof RevenueKpiOpenActionSchema>;

// ============================================================================
// P2 — Revenue read + pending actions (plan P2-revenue-read-pending)
// Pending derive từ entity state, KHÔNG dùng notification.readAt.
// ============================================================================

export const RevenueKpiPendingActionKindSchema = z.enum([
  'acceptance', 'adjustment_verify', 'adjustment_decision',
  'miss_reason', 'reason_review', 'result_confirm',
  'period_close', 'info',
]);
export const RevenueKpiPendingSeveritySchema = z.enum(['INFO', 'ACTION_REQUIRED', 'URGENT']);
export const RevenueKpiPendingEntityKindSchema = z.enum(['period', 'assignment', 'result', 'notification']);

// `proposedActionId` được điền bởi P3 khi action tool có sẵn; P2 luôn null.
export const RevenueKpiPendingActionSchema = z.object({
  kind: RevenueKpiPendingActionKindSchema,
  severity: RevenueKpiPendingSeveritySchema,
  entityKind: RevenueKpiPendingEntityKindSchema,
  entityId: id,
  period: RevenueKpiMonthSchema.optional(),
  label: z.string().min(1),
  message: z.string().nullable(),
  deadlineAt: time.nullable(),
  proposedActionId: z.string().uuid().nullable(),
  deeplink: z.string().nullable(),
}).strict();

export const RevenueKpiPendingListSchema = z.object({
  items: z.array(RevenueKpiPendingActionSchema).max(500),
  nextOffset: z.number().int().nonnegative().nullable(),
}).strict();

export const RevenueKpiMyRevenueItemSchema = z.object({
  assignment: RevenueKpiAssignmentSchema,
  result: RevenueKpiResultSchema.nullable(),
}).strict();

export const RevenueKpiMyRevenueSchema = z.object({
  available: z.boolean(),
  period: RevenueKpiMonthSchema.nullable(),
  items: z.array(RevenueKpiMyRevenueItemSchema).max(500),
}).strict();

export const RevenueKpiDetailSchema = z.object({
  assignment: RevenueKpiAssignmentSchema,
  result: RevenueKpiResultSchema.nullable(),
}).strict();

export const RevenueKpiTaskItemSchema = z.object({
  taskId: id,
  period: RevenueKpiMonthSchema.nullable(),
  title: z.string().min(1),
  status: z.string().min(1),
  dueAt: time.nullable(),
}).strict();

export const RevenueKpiMyTasksSchema = z.object({
  period: RevenueKpiMonthSchema.nullable(),
  items: z.array(RevenueKpiTaskItemSchema).max(500),
}).strict();

export type RevenueKpiPendingActionKind = z.infer<typeof RevenueKpiPendingActionKindSchema>;
export type RevenueKpiPendingSeverity = z.infer<typeof RevenueKpiPendingSeveritySchema>;
export type RevenueKpiPendingEntityKind = z.infer<typeof RevenueKpiPendingEntityKindSchema>;
export type RevenueKpiPendingAction = z.infer<typeof RevenueKpiPendingActionSchema>;
export type RevenueKpiPendingList = z.infer<typeof RevenueKpiPendingListSchema>;
export type RevenueKpiMyRevenueItem = z.infer<typeof RevenueKpiMyRevenueItemSchema>;
export type RevenueKpiMyRevenue = z.infer<typeof RevenueKpiMyRevenueSchema>;
export type RevenueKpiDetail = z.infer<typeof RevenueKpiDetailSchema>;
export type RevenueKpiTaskItem = z.infer<typeof RevenueKpiTaskItemSchema>;
export type RevenueKpiMyTasks = z.infer<typeof RevenueKpiMyTasksSchema>;

// ============================================================================
// P3 — Revenue assignment actions qua chat (plan P3-revenue-assignment-actions)
// Collection giữ nguyên `revenue_kpi_open_actions`; phân biệt bằng field `type`.
// RevenueKpiOpenActionSchema (P0) giữ nguyên — union mới cho action chung.
// ============================================================================

export const RevenueKpiAssignmentActionKindSchema = z.enum([
  'publish', 'accept', 'refuse', 'hr-decision',
  'adjustment-request', 'adjustment-verify', 'adjustment-decision', 'responsibility',
]);
export type RevenueKpiAssignmentActionKind = z.infer<typeof RevenueKpiAssignmentActionKindSchema>;

export const RevenueKpiAssignmentActionDigestSchema = z.string().regex(/^[a-f0-9]{64}$/, 'planDigest must be 64 hex chars');
export type RevenueKpiAssignmentActionDigest = z.infer<typeof RevenueKpiAssignmentActionDigestSchema>;

// args của proposal: super-set của mọi command schema trong mutateRevenueKpiAssignment.
// expectedVersion + planDigest bind proposal với snapshot assignment tại thời điểm preview.
export const RevenueKpiAssignmentActionArgsSchema = z.object({
  assignmentId: id,
  action: RevenueKpiAssignmentActionKindSchema,
  expectedVersion: z.number().int().positive(),
  planDigest: RevenueKpiAssignmentActionDigestSchema,
  reason: reason.optional(),
  evidenceRef: reason.optional(),
  newTargetVnd: target.optional(),
  newGrowthPercent: percent.min(-50).max(100).optional(),
  force: z.boolean().optional(),
  assigneeEmployeeId: id.optional(),
  from: time.optional(),
}).strict();
export type RevenueKpiAssignmentActionArgs = z.infer<typeof RevenueKpiAssignmentActionArgsSchema>;

// Impact từng mục của preview (text an toàn để hiển thị, không chứa PII).
export const RevenueKpiAssignmentImpactItemSchema = z.object({
  field: z.string().min(1).max(120),
  from: z.string().max(200).nullable(),
  to: z.string().max(200).nullable(),
}).strict();
export type RevenueKpiAssignmentImpactItem = z.infer<typeof RevenueKpiAssignmentImpactItemSchema>;

export const RevenueKpiAssignmentPreviewSchema = z.object({
  assignmentId: id,
  period: RevenueKpiMonthSchema,
  unitType: RevenueKpiUnitTypeSchema,
  storeId: id.nullable(),
  areaKey: z.string().nullable(),
  assigneeEmployeeId: id,
  assigneeRole: z.enum(['SM', 'AM']),
  currentStatus: RevenueKpiAssignmentStatusSchema,
  expectedVersion: z.number().int().positive(),
  planDigest: RevenueKpiAssignmentActionDigestSchema,
  summary: z.string().min(1).max(2000),
  impacts: z.array(RevenueKpiAssignmentImpactItemSchema).max(50),
  warnings: z.array(z.string().max(500)).max(20),
  executed: z.literal(false),
}).strict();
export type RevenueKpiAssignmentPreview = z.infer<typeof RevenueKpiAssignmentPreviewSchema>;

// Kết quả execute: mutateRevenueKpiAssignment trả assignment cập nhật.
export const RevenueKpiAssignmentActionResultSchema = z.object({
  assignment: RevenueKpiAssignmentSchema,
}).strict();
export type RevenueKpiAssignmentActionResult = z.infer<typeof RevenueKpiAssignmentActionResultSchema>;

// Envelope proposal type mới — cùng collection, field `type` phân biệt với P0.
export const RevenueKpiAssignmentActionSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema,
  type: z.literal('revenue_kpi.mutate_assignment'),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXECUTED', 'EXPIRED', 'FAILED']),
  expiresAt: time,
  requiresConfirmation: z.boolean(),
  executed: z.boolean(),
  args: RevenueKpiAssignmentActionArgsSchema,
  preview: RevenueKpiAssignmentPreviewSchema,
  result: RevenueKpiAssignmentActionResultSchema.nullable(),
}).strict();
export type RevenueKpiAssignmentAction = z.infer<typeof RevenueKpiAssignmentActionSchema>;

// Decision payload (REST /chat/actions/:id/decision + Socket dùng chung executor).
export const RevenueKpiAssignmentDecisionSchema = z.discriminatedUnion('approve', [
  RevenueKpiAssignmentActionArgsSchema.pick({ expectedVersion: true, planDigest: true, reason: true, evidenceRef: true }).extend({ approve: z.literal(true), clientRequestId: z.string().uuid() }),
  z.object({ clientRequestId: z.string().uuid(), approve: z.literal(false) }).strict(),
]);
export type RevenueKpiAssignmentDecision = z.infer<typeof RevenueKpiAssignmentDecisionSchema>;

export const RevenueKpiPreviewAssignmentActionResponseSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema,
  type: z.literal('revenue_kpi.mutate_assignment'),
  preview: RevenueKpiAssignmentPreviewSchema,
  requiresConfirmation: z.literal(true),
  executed: z.literal(false),
}).strict();
export type RevenueKpiPreviewAssignmentActionResponse = z.infer<typeof RevenueKpiPreviewAssignmentActionResponseSchema>;

// ============================================================================
// P4 — Revenue result/period lifecycle actions qua chat
// (plan P4-revenue-result-lifecycle). Vẫn dùng collection
// `revenue_kpi_open_actions`, phân biệt bằng type 'revenue_kpi.result_action'.
// Không đổi schema P0/P2/P3 — chỉ mở rộng union RevenueKpiChatActionSchema.
// ============================================================================

export const RevenueKpiResultActionKindSchema = z.enum([
  'compute', 'miss-reason', 'review-reason', 'confirm', 'correct', 'close',
]);
export type RevenueKpiResultActionKind = z.infer<typeof RevenueKpiResultActionKindSchema>;

// Target của action: 'compute'/'close' tác động period; còn lại tác động result.
export const RevenueKpiResultActionTargetSchema = z.object({
  period: RevenueKpiMonthSchema.optional(),
  resultId: id.optional(),
}).strict()
  .refine(v => !!v.period !== !!v.resultId, 'Exactly one of period or resultId is required');
export type RevenueKpiResultActionTarget = z.infer<typeof RevenueKpiResultActionTargetSchema>;

// args của proposal: super-set của các command schema hiện có
// (RevenueKpiComputeSchema/MissReason/ReviewReason/Confirm/Correct + close).
// expectedVersion + planDigest bind proposal với snapshot tại thời điểm preview.
export const RevenueKpiResultActionArgsSchema = z.object({
  period: RevenueKpiMonthSchema.optional(),
  resultId: id.optional(),
  expectedVersion: z.number().int().positive(),
  planDigest: RevenueKpiAssignmentActionDigestSchema,
  text: reason.optional(),
  decision: RevenueKpiReviewReasonSchema.shape.decision.optional(),
  note: reason.optional(),
  waiveReason: reason.optional(),
  reason: reason.optional(),
}).strict()
  .refine(v => !!v.period !== !!v.resultId, 'Exactly one of period or resultId is required');
export type RevenueKpiResultActionArgs = z.infer<typeof RevenueKpiResultActionArgsSchema>;

// Danh sách dự kiến cho preview của compute/close (READ-ONLY, không ghi DB).
export const RevenueKpiResultActionExpectedItemSchema = z.object({
  assignmentId: id,
  resultId: id.nullable(),
  storeId: id.nullable(),
  areaKey: z.string().nullable(),
  currentStatus: RevenueKpiAssignmentStatusSchema,
  resultStatus: RevenueKpiResultStatusSchema.nullable(),
  projectedStatus: RevenueKpiResultStatusSchema.nullable(),
  targetVnd: money.nullable(),
  projectedActualRevenueVnd: money.nullable(),
  summary: z.string().min(1).max(2000),
}).strict();
export type RevenueKpiResultActionExpectedItem = z.infer<typeof RevenueKpiResultActionExpectedItemSchema>;

// Điều kiện đủ/thiếu của preview (compute chạy calculateRevenueKpi cho từng
// assignment ACTIVE; close liệt kê những gì còn thiếu trước khi đóng kỳ).
export const RevenueKpiResultActionRequirementSchema = z.object({
  met: z.boolean(),
  label: z.string().min(1).max(200),
  detail: z.string().max(2000).nullable(),
}).strict();
export type RevenueKpiResultActionRequirement = z.infer<typeof RevenueKpiResultActionRequirementSchema>;

export const RevenueKpiResultActionPreviewSchema = z.object({
  kind: RevenueKpiResultActionKindSchema,
  period: RevenueKpiMonthSchema,
  // compute/close target a month (`YYYY-MM`), result actions target a result id.
  targetId: z.union([RevenueKpiMonthSchema, id]),
  expectedVersion: z.number().int().positive(),
  planDigest: RevenueKpiAssignmentActionDigestSchema,
  summary: z.string().min(1).max(2000),
  requirements: z.array(RevenueKpiResultActionRequirementSchema).max(50),
  expected: z.array(RevenueKpiResultActionExpectedItemSchema).max(500),
  warnings: z.array(z.string().max(500)).max(20),
  executed: z.literal(false),
}).strict();
export type RevenueKpiResultActionPreview = z.infer<typeof RevenueKpiResultActionPreviewSchema>;

// Kết quả execute: service hiện có trả result cập nhật (mutate) hoặc result
// đã lưu (confirm/idempotent repeat) — module gọi sẽ bọc lại.
export const RevenueKpiResultActionResultSchema = z.object({
  result: RevenueKpiResultSchema.nullable(),
}).strict();
export type RevenueKpiResultActionResult = z.infer<typeof RevenueKpiResultActionResultSchema>;

// Envelope proposal type mới — cùng collection `revenue_kpi_open_actions`.
export const RevenueKpiResultActionSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema,
  type: z.literal('revenue_kpi.result_action'),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXECUTED', 'EXPIRED', 'FAILED']),
  expiresAt: time,
  requiresConfirmation: z.boolean(),
  executed: z.boolean(),
  args: RevenueKpiResultActionArgsSchema,
  preview: RevenueKpiResultActionPreviewSchema,
  result: RevenueKpiResultActionResultSchema.nullable(),
}).strict();
export type RevenueKpiResultAction = z.infer<typeof RevenueKpiResultActionSchema>;

// Decision payload (REST /chat/actions/:id/decision + Socket executor chung).
export const RevenueKpiResultActionDecisionSchema = z.discriminatedUnion('approve', [
  z.object({ expectedVersion: z.number().int().positive(), planDigest: RevenueKpiAssignmentActionDigestSchema, approve: z.literal(true), clientRequestId: z.string().uuid() }).strict(),
  z.object({ clientRequestId: z.string().uuid(), approve: z.literal(false) }).strict(),
]);
export type RevenueKpiResultActionDecision = z.infer<typeof RevenueKpiResultActionDecisionSchema>;

export const RevenueKpiPreviewResultActionResponseSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema,
  type: z.literal('revenue_kpi.result_action'),
  preview: RevenueKpiResultActionPreviewSchema,
  requiresConfirmation: z.literal(true),
  executed: z.literal(false),
}).strict();
export type RevenueKpiPreviewResultActionResponse = z.infer<typeof RevenueKpiPreviewResultActionResponseSchema>;

// Union tổng quát được khai báo một lần ở cuối file (sau khi mọi schema P0–P5
// đã tồn tại), tránh forward-reference và khai báo trùng.

// ============================================================================
// P5a — HR assign (create_period + save_assignment single/bulk) qua chat
// (plan P5-hr-assign-performance-actions). Vẫn dùng collection
// `revenue_kpi_open_actions`, phân biệt bằng field `type`. Không đổi schema
// P0/P2/P3/P4 — chỉ mở rộng union RevenueKpiChatActionSchema.
// ============================================================================

// Args chung: bind proposal với snapshot tại thời điểm preview (lease + decisionHash).
const actionDigest = RevenueKpiAssignmentActionDigestSchema;

export const RevenueKpiCreatePeriodArgsSchema = z.object({
  period: RevenueKpiMonthSchema,
  policy: RevenueKpiPolicySchema,
  // createRevenueKpiPeriod yêu cầu expectedVersion = 0 cho kỳ mới; giữ ở args
  // để execute gọi service hiện có không bypass.
  expectedVersion: z.literal(0),
  planDigest: actionDigest,
}).strict();
export type RevenueKpiCreatePeriodArgs = z.infer<typeof RevenueKpiCreatePeriodArgsSchema>;

// Preview create_period: policy cuối cùng sẽ lưu, KHÔNG ghi (assert bằng document count).
export const RevenueKpiCreatePeriodPreviewSchema = z.object({
  period: RevenueKpiMonthSchema,
  policy: RevenueKpiPolicySchema,
  planDigest: actionDigest,
  summary: z.string().min(1).max(2000),
  warnings: z.array(z.string().max(500)).max(20),
  executed: z.literal(false),
}).strict();
export type RevenueKpiCreatePeriodPreview = z.infer<typeof RevenueKpiCreatePeriodPreviewSchema>;

export const RevenueKpiCreatePeriodActionResultSchema = z.object({
  period: RevenueKpiPeriodSchema.nullable(),
}).strict();
export type RevenueKpiCreatePeriodActionResult = z.infer<typeof RevenueKpiCreatePeriodActionResultSchema>;

export const RevenueKpiCreatePeriodActionSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema,
  type: z.literal('revenue_kpi.create_period'),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXECUTED', 'EXPIRED', 'FAILED']),
  expiresAt: time,
  requiresConfirmation: z.boolean(),
  executed: z.boolean(),
  args: RevenueKpiCreatePeriodArgsSchema,
  preview: RevenueKpiCreatePeriodPreviewSchema,
  result: RevenueKpiCreatePeriodActionResultSchema.nullable(),
}).strict();
export type RevenueKpiCreatePeriodAction = z.infer<typeof RevenueKpiCreatePeriodActionSchema>;

export const RevenueKpiCreatePeriodDecisionSchema = z.discriminatedUnion('approve', [
  z.object({ expectedVersion: z.literal(0), planDigest: actionDigest, approve: z.literal(true), clientRequestId: z.string().uuid() }).strict(),
  z.object({ clientRequestId: z.string().uuid(), approve: z.literal(false) }).strict(),
]);
export type RevenueKpiCreatePeriodDecision = z.infer<typeof RevenueKpiCreatePeriodDecisionSchema>;

// save_assignment: một args schema duy nhất phục vụ single (storeId 1 cửa hàng,
// hoặc AREA với storeIds) và bulk (storeId null + storeIds > 1). Các trường
// mirror RevenueKpiDraftAssignmentSchema (schema service hiện có, không đổi).
export const RevenueKpiSaveAssignmentArgsSchema = z.object({
  period: RevenueKpiMonthSchema,
  unitType: RevenueKpiUnitTypeSchema,
  // single STORE: đúng 1 storeId; bulk STORE: null (dùng storeIds); AREA: null + storeIds.
  storeId: id.nullable(),
  storeIds: z.array(id).min(1).max(500).optional(),
  assigneeEmployeeId: id.nullable(),
  targetMode: RevenueKpiTargetModeSchema,
  targetVnd: target.optional(),
  growthPercent: percent.min(-50).max(100).optional(),
  reason,
  responsibilityFrom: time.optional(),
  expectedVersion: z.number().int().nonnegative(),
  planDigest: actionDigest,
  // bulk chỉ hiện diện ở preview/execute của proposal bulk; single luôn false.
  bulk: z.boolean().default(false),
}).strict()
  .refine(v => v.unitType !== 'STORE' || !!v.storeId || (!!v.bulk && !!v.storeIds?.length), 'Store is required')
  .refine(v => !v.bulk || v.unitType !== 'STORE' || !v.storeId, 'Bulk STORE assignments must not pin a single storeId')
  .refine(v => v.unitType !== 'AREA' || !v.storeId, 'AREA assignment must not pin a single storeId')
  .refine(v => !!v.assigneeEmployeeId || v.unitType === 'STORE', 'AREA assignment requires assigneeEmployeeId');
export type RevenueKpiSaveAssignmentArgs = z.infer<typeof RevenueKpiSaveAssignmentArgsSchema>;

// Per-store preview item (bulk). Single preview là mảng 1 phần tử + summary.
export const RevenueKpiSaveAssignmentItemSchema = z.object({
  storeId: id.nullable(),
  storeIds: z.array(id).min(1).max(500),
  unitType: RevenueKpiUnitTypeSchema,
  assigneeEmployeeId: id.nullable(),
  assigneeRole: z.enum(['SM', 'AM']).nullable(),
  assigneeName: z.string().nullable(),
  period: RevenueKpiMonthSchema,
  basePeriod: RevenueKpiMonthSchema.nullable(),
  targetMode: RevenueKpiTargetModeSchema,
  growthPercent: percent.nullable(),
  targetVnd: target.nullable(),
  existingAssignmentId: id.nullable(),
  willCreate: z.boolean(),
  willSkip: z.boolean(),
  blocked: z.boolean(),
  code: z.string().nullable(),
  message: z.string().nullable(),
  fixHint: z.string().nullable(),
}).strict();
export type RevenueKpiSaveAssignmentItem = z.infer<typeof RevenueKpiSaveAssignmentItemSchema>;

// Preview save_assignment: buildDraft trên input (single) hoặc từng cửa hàng
// trong scope (bulk). KHÔNG BAO GIỜ ghi — executed luôn false.
export const RevenueKpiSaveAssignmentPreviewSchema = z.object({
  period: RevenueKpiMonthSchema,
  unitType: RevenueKpiUnitTypeSchema,
  bulk: z.boolean(),
  planDigest: actionDigest,
  summary: z.string().min(1).max(2000),
  willCreate: z.array(RevenueKpiSaveAssignmentItemSchema).max(500),
  willSkip: z.array(RevenueKpiSaveAssignmentItemSchema).max(500),
  blocked: z.array(RevenueKpiSaveAssignmentItemSchema).max(500),
  warnings: z.array(z.string().max(500)).max(20),
  executed: z.literal(false),
}).strict();
export type RevenueKpiSaveAssignmentPreview = z.infer<typeof RevenueKpiSaveAssignmentPreviewSchema>;

// Kết quả execute bulk: từng item độc lập; single có 0–1 phần tử mỗi nhóm.
export const RevenueKpiSaveAssignmentOutcomeSchema = RevenueKpiSaveAssignmentItemSchema.extend({
  assignmentId: id.nullable(),
}).strict();
export type RevenueKpiSaveAssignmentOutcome = z.infer<typeof RevenueKpiSaveAssignmentOutcomeSchema>;

export const RevenueKpiSaveAssignmentActionResultSchema = z.object({
  outcome: z.enum(['FULL', 'PARTIAL', 'NONE']),
  created: z.array(RevenueKpiSaveAssignmentOutcomeSchema).max(500),
  skipped: z.array(RevenueKpiSaveAssignmentOutcomeSchema).max(500),
  blocked: z.array(RevenueKpiSaveAssignmentOutcomeSchema).max(500),
  failed: z.array(RevenueKpiSaveAssignmentOutcomeSchema).max(500),
  summary: z.object({ created: money, skipped: money, blocked: money, failed: money, total: money }).strict(),
}).strict();
export type RevenueKpiSaveAssignmentActionResult = z.infer<typeof RevenueKpiSaveAssignmentActionResultSchema>;

export const RevenueKpiSaveAssignmentActionSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema,
  type: z.literal('revenue_kpi.save_assignment'),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXECUTED', 'EXPIRED', 'FAILED']),
  expiresAt: time,
  requiresConfirmation: z.boolean(),
  executed: z.boolean(),
  args: RevenueKpiSaveAssignmentArgsSchema,
  preview: RevenueKpiSaveAssignmentPreviewSchema,
  result: RevenueKpiSaveAssignmentActionResultSchema.nullable(),
}).strict();
export type RevenueKpiSaveAssignmentAction = z.infer<typeof RevenueKpiSaveAssignmentActionSchema>;

// Decision payload (REST /chat/actions/:id/decision + Socket executor chung).
export const RevenueKpiSaveAssignmentDecisionSchema = z.discriminatedUnion('approve', [
  z.object({ expectedVersion: z.number().int().nonnegative(), planDigest: actionDigest, approve: z.literal(true), clientRequestId: z.string().uuid() }).strict(),
  z.object({ clientRequestId: z.string().uuid(), approve: z.literal(false) }).strict(),
]);
export type RevenueKpiSaveAssignmentDecision = z.infer<typeof RevenueKpiSaveAssignmentDecisionSchema>;

export const RevenueKpiPreviewCreatePeriodActionResponseSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema,
  type: z.literal('revenue_kpi.create_period'),
  preview: RevenueKpiCreatePeriodPreviewSchema,
  requiresConfirmation: z.literal(true),
  executed: z.literal(false),
}).strict();
export type RevenueKpiPreviewCreatePeriodActionResponse = z.infer<typeof RevenueKpiPreviewCreatePeriodActionResponseSchema>;

export const RevenueKpiPreviewSaveAssignmentActionResponseSchema = z.object({
  actionId: RevenueKpiOpenActionIdSchema,
  type: z.literal('revenue_kpi.save_assignment'),
  preview: RevenueKpiSaveAssignmentPreviewSchema,
  requiresConfirmation: z.literal(true),
  executed: z.literal(false),
}).strict();
export type RevenueKpiPreviewSaveAssignmentActionResponse = z.infer<typeof RevenueKpiPreviewSaveAssignmentActionResponseSchema>;

// Union chat action cuối: thêm 2 type P5a vào union P0–P4.
export const RevenueKpiChatActionSchema = z.discriminatedUnion('type', [
  RevenueKpiOpenActionSchema,
  RevenueKpiAssignmentActionSchema,
  RevenueKpiResultActionSchema,
  RevenueKpiCreatePeriodActionSchema,
  RevenueKpiSaveAssignmentActionSchema,
]);
export type RevenueKpiChatAction = z.infer<typeof RevenueKpiChatActionSchema>;

// Read tool get_revenue_kpi_result: result + history trong scope.
export const RevenueKpiResultDetailSchema = z.object({
  result: RevenueKpiResultSchema,
  assignment: RevenueKpiAssignmentSchema.nullable(),
}).strict();
export type RevenueKpiResultDetail = z.infer<typeof RevenueKpiResultDetailSchema>;

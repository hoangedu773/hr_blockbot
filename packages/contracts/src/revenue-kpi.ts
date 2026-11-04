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

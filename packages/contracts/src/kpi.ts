import { z } from "zod";

/** `period` is a calendar month. Granularity is a documented group assumption. */
export const KpiPeriodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/);
export type KpiPeriod = z.infer<typeof KpiPeriodSchema>;

export const KpiStatusSchema = z.enum(["OPEN", "ANALYZED", "PUBLISHED"]);
export type KpiStatus = z.infer<typeof KpiStatusSchema>;

const Score01 = z.number().finite().min(0).max(1);
const Score100 = z.number().finite().min(0).max(100);

/** AI output is limited to these five signals; it never produces a final score. */
export const KpiAnalysisSchema = z.object({
  sentiment: z.enum(["positive", "neutral", "negative"]),
  sentimentScore: z.number().finite().min(-1).max(1),
  themes: z.array(z.string().trim().min(1).max(80)).max(8),
  riskSignals: z.array(z.string().trim().min(1).max(160)).max(8),
  suggestedScoreComponent: Score01,
  explanation: z.string().trim().min(1).max(2000),
  model: z.string().trim().min(1).max(120),
  degraded: z.boolean().default(false),
  analyzedAt: z.string().datetime({ offset: true }),
}).strict();
export type KpiAnalysis = z.infer<typeof KpiAnalysisSchema>;

export const KpiBreakdownSchema = z.object({
  weights: z.object({ completion: Score01, semantic: Score01, manager: Score01 }).strict(),
  components: z.object({ completion: Score01, semantic: Score01, manager: Score01 }).strict(),
  weighted01: Score01,
  ceiling01: Score01,
  capped: z.boolean(),
  scale: z.number().positive(),
}).strict();
export type KpiBreakdown = z.infer<typeof KpiBreakdownSchema>;

export const KpiHistoryEntrySchema = z.object({
  at: z.string(),
  by: z.string().min(1),
  action: z.enum(["OPENED", "SELF_REVIEW", "MANAGER_REVIEW", "ANALYZED", "PUBLISHED", "OVERRIDE"]),
  fromScore: z.number().nullable(),
  toScore: z.number().nullable(),
  reason: z.string().nullable(),
}).strict();
export type KpiHistoryEntry = z.infer<typeof KpiHistoryEntrySchema>;

export const KpiEvaluationSchema = z.object({
  id: z.string().min(1),
  period: KpiPeriodSchema,
  employeeId: z.string().min(1),
  employeeName: z.string().min(1),
  departmentId: z.string().nullable(),
  storeId: z.string().nullable(),
  status: KpiStatusSchema,
  selfReview: z.string().nullable(),
  managerReview: z.string().nullable(),
  managerScore: Score100.nullable(),
  analysis: KpiAnalysisSchema.nullable(),
  objectiveCompletionScore: Score01.nullable(),
  machineScore: z.number().nullable(),
  breakdown: KpiBreakdownSchema.nullable(),
  finalScore: z.number().nullable(),
  overrideReason: z.string().nullable(),
  changedBy: z.string().nullable(),
  changedAt: z.string().nullable(),
  publishedAt: z.string().nullable(),
  version: z.number().int().nonnegative(),
  history: z.array(KpiHistoryEntrySchema).max(200),
}).strict();
export type KpiEvaluation = z.infer<typeof KpiEvaluationSchema>;

export const KpiOpenPeriodSchema = z.object({ period: KpiPeriodSchema }).strict();
export type KpiOpenPeriod = z.infer<typeof KpiOpenPeriodSchema>;

export const KpiSelfReviewSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  expectedVersion: z.number().int().nonnegative(),
}).strict();
export type KpiSelfReview = z.infer<typeof KpiSelfReviewSchema>;

export const KpiManagerReviewSchema = z.object({
  text: z.string().trim().min(1).max(4000),
  managerScore: Score100,
  expectedVersion: z.number().int().nonnegative(),
}).strict();
export type KpiManagerReview = z.infer<typeof KpiManagerReviewSchema>;

export const KpiAnalyzeSchema = z.object({ expectedVersion: z.number().int().nonnegative() }).strict();
export type KpiAnalyze = z.infer<typeof KpiAnalyzeSchema>;

export const KpiPublishSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  finalScore: Score100.optional(),
  overrideReason: z.string().trim().min(5).max(1000).optional(),
}).strict();
export type KpiPublish = z.infer<typeof KpiPublishSchema>;

export const KpiOverrideSchema = z.object({
  expectedVersion: z.number().int().nonnegative(),
  finalScore: Score100,
  reason: z.string().trim().min(5).max(1000),
}).strict();
export type KpiOverride = z.infer<typeof KpiOverrideSchema>;

export const KpiDistributionBucketSchema = z.object({
  label: z.string().min(1),
  min: z.number(),
  max: z.number(),
  count: z.number().int().nonnegative(),
}).strict();
export type KpiDistributionBucket = z.infer<typeof KpiDistributionBucketSchema>;

export const KpiDashboardSchema = z.object({
  period: KpiPeriodSchema,
  published: z.number().int().nonnegative(),
  pendingReview: z.number().int().nonnegative(),
  averageFinalScore: z.number().nullable(),
  averageMachineScore: z.number().nullable(),
  distribution: z.array(KpiDistributionBucketSchema),
  trend: z.array(z.object({ period: KpiPeriodSchema, averageFinalScore: z.number().nullable(), published: z.number().int().nonnegative() }).strict()),
  themes: z.array(z.object({ theme: z.string(), count: z.number().int().nonnegative() }).strict()),
  riskSignals: z.array(z.object({ signal: z.string(), count: z.number().int().nonnegative() }).strict()),
  generatedAt: z.string(),
}).strict();
export type KpiDashboard = z.infer<typeof KpiDashboardSchema>;

export const NotificationTypeSchema = z.enum([
  "performance_kpi_opened","performance_kpi_score_ready","performance_kpi_reconsideration_requested","performance_kpi_reconsideration_responded","performance_kpi_appeal_requested","performance_kpi_appeal_decided","performance_kpi_finalized","performance_kpi_corrected","task_assigned","task_accepted","task_refused","task_due_soon","task_overdue","task_submitted","task_evaluated","task_handover",
  'revenue_kpi_assigned', 'revenue_kpi_accepted', 'revenue_kpi_refused', 'revenue_kpi_adjusted', 'revenue_kpi_result_ready', 'revenue_kpi_reason_required', 'revenue_kpi_closed',
  'revenue_kpi_adjustment_requested', 'revenue_kpi_adjustment_verified', 'revenue_kpi_adjustment_decided', 'revenue_kpi_acceptance_overdue', 'revenue_kpi_period_closing',
  "deadline_3d", "deadline_1d", "deadline_overdue", "report_submitted",
  "report_approved", "report_rejected", "kpi_published", "kpi_review_digest", "system",
]);
export type NotificationType = z.infer<typeof NotificationTypeSchema>;

export const NotificationSeveritySchema = z.enum(['INFO', 'ACTION_REQUIRED', 'URGENT']);
export type NotificationSeverity = z.infer<typeof NotificationSeveritySchema>;

export const NotificationGroupSchema = z.enum(['schedule', 'work', 'revenue', 'performance', 'evaluation', 'other']);
export type NotificationGroup = z.infer<typeof NotificationGroupSchema>;
export const notificationEntityKinds: Record<Exclude<NotificationGroup, 'other'>, readonly string[]> = {
  schedule: ['schedule'],
  work: ['project', 'report'],
  revenue: ['revenue_kpi'],
  performance: ['performance_kpi', 'task'],
  evaluation: ['evaluation'],
};

export const NotificationItemSchema = z.object({
  id: z.string().min(1),
  type: NotificationTypeSchema,
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(1000),
  channel: z.literal("in_app"),
  entityKind: z.string().max(40).nullable(),
  entityId: z.string().max(80).nullable(),
  severity: NotificationSeveritySchema.default('INFO'),
  actionRef: z.string().max(120).nullable().default(null),
  readAt: z.string().nullable(),
  createdAt: z.string(),
}).strict();
export type NotificationItem = z.infer<typeof NotificationItemSchema>;

export const NotificationListSchema = z.object({
  items: z.array(NotificationItemSchema),
  unread: z.number().int().nonnegative(),
}).strict();
export type NotificationList = z.infer<typeof NotificationListSchema>;

export const NotificationInboxItemSchema = NotificationItemSchema.omit({ readAt: true }).extend({
  source: z.enum(['notification', 'assignment']),
  read: z.boolean(),
  body: z.string().min(1).max(4000),
});
export type NotificationInboxItem = z.infer<typeof NotificationInboxItemSchema>;

export const NotificationInboxSchema = NotificationListSchema.extend({ items: z.array(NotificationInboxItemSchema) });

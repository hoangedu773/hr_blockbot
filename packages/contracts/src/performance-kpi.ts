import { z } from 'zod';
import { PerformanceId as id, PerformanceMonth as month, PerformanceTime as time, PerformanceReason as reason, PerformanceScore as score, PerformanceEvidence as evidence, PerformanceCommandSchema as command, PerformanceRoleSchema, PerformanceHistoryEntrySchema } from './tasks.js';
export const PerformanceEvaluationStatusSchema = z.enum(['OPEN','SELF_REVIEW','MANAGER_REVIEW','PROVISIONAL','PENDING_DISPUTE','FINAL','CORRECTED']);
export const PerformanceDataSourceSchema = z.enum(['SYSTEM','MANUAL','HYBRID']);
export const PerformanceCriterionSchema = z.object({code:z.string().regex(/^[a-z_]+$/).max(60),name:z.string().min(2).max(200),weightPercent:score.positive(),dataSource:PerformanceDataSourceSchema,requiresEvidence:z.boolean(),description:z.string().max(2000)}).strict();
export const PerformanceFrameworkContentSchema = z.object({role:PerformanceRoleSchema,frameworkVersion:z.number().int().min(2),criteria:z.array(PerformanceCriterionSchema).min(3).max(20),taskComponent:z.object({enabled:z.boolean(),weightPercent:score,aggregation:z.literal('WEIGHTED_TASK_SCORE')}).strict(),effectiveFrom:month,effectiveTo:month.nullable()}).strict().superRefine((v,c)=>{
  if(Math.abs(v.criteria.reduce((s,r)=>s+r.weightPercent,0)-100)>0.01)c.addIssue({code:'custom',message:'Tổng trọng số phải bằng 100.'});
  if(new Set(v.criteria.map(r=>r.code)).size!==v.criteria.length)c.addIssue({code:'custom',message:'Trùng mã tiêu chí.'});
  const task=v.criteria.find(r=>r.code==='tasks');if(v.taskComponent.enabled? !task||task.weightPercent!==v.taskComponent.weightPercent||task.dataSource!=='SYSTEM':!!task)c.addIssue({code:'custom',message:'Thành phần nhiệm vụ không khớp.'});
  if(v.role==='SM'&&(!v.criteria.some(r=>r.code==='revenue'&&r.dataSource==='SYSTEM')||v.criteria.filter(r=>r.code==='revenue').length!==1))c.addIssue({code:'custom',message:'SM cần một tiêu chí doanh thu hệ thống.'});
  if(v.role!=='SM'&&v.criteria.some(r=>r.code==='revenue'))c.addIssue({code:'custom',message:'Doanh thu chỉ dành cho SM.'});
});
export const PerformancePolicyRulesSchema = z.object({ acceptanceWindowWorkingDays:z.number().int().min(1).max(30).default(3),reconsiderationWindowWorkingDays:z.number().int().min(1).max(30).default(3),evaluatorResponseWorkingDays:z.number().int().min(1).max(30).default(3),appealWindowWorkingDays:z.number().int().min(1).max(30).default(5),appealDecisionWorkingDays:z.number().int().min(1).max(30).default(5),lateSubmissionGraceWorkingDays:z.number().int().min(0).max(30).default(5),minDataCoveragePercent:score.default(70),allowProvisionalClose:z.boolean().default(true),allowTaskRefusal:z.boolean().default(true),refusalPolicyRef:reason.nullable().default(null),revenueConversionPolicyRef:reason.nullable().default(null),revenueConversion:z.array(z.object({achievementPercent:z.number().min(0).max(1000),score}).strict()).min(2).max(20).default([{achievementPercent:0,score:0},{achievementPercent:80,score:40},{achievementPercent:100,score:100}]) }).strict().superRefine((v,c)=>{if(v.revenueConversion[0].achievementPercent!==0||v.revenueConversion.some((r,i)=>i>0&&(r.achievementPercent<=v.revenueConversion[i-1].achievementPercent||r.score<v.revenueConversion[i-1].score)))c.addIssue({code:'custom',message:'Bảng quy đổi phải tăng dần từ 0.'});});
export const PerformanceFrameworkSchema=z.object({id,content:PerformanceFrameworkContentSchema,status:z.enum(['DRAFT','PUBLISHED','ARCHIVED']),version:z.number().int().positive(),publishedBy:id.nullable(),publishedAt:time.nullable(),history:z.array(PerformanceHistoryEntrySchema),createdAt:time,updatedAt:time,isDemo:z.boolean()}).strict();
export const CreatePerformanceFrameworkRequestSchema=command.extend({content:PerformanceFrameworkContentSchema,reason,isDemo:z.boolean().default(false)});
export const PublishPerformancePolicyRequestSchema=command.extend({role:PerformanceRoleSchema,frameworkId:id,policy:PerformancePolicyRulesSchema,reason,isDemo:z.boolean().default(false)});
export const PerformancePolicySchema=z.object({id,period:month,role:PerformanceRoleSchema,frameworkId:id,frameworkVersion:z.number().int().min(2),frameworkSnapshot:PerformanceFrameworkContentSchema,policy:PerformancePolicyRulesSchema,status:z.enum(['PUBLISHED','OPEN','CLOSED']),publishedBy:id,publishedAt:time,openedAt:time.nullable(),closedAt:time.nullable(),version:z.number().int().positive(),history:z.array(PerformanceHistoryEntrySchema),createdAt:time,updatedAt:time,isDemo:z.boolean()}).strict();
export const OpenPerformancePeriodRequestSchema=command.extend({policyId:id,employeeIds:z.array(id).min(1).max(500),reason});
export const PerformanceScoreInputSchema=z.object({code:z.string(),score:score.nullable(),notApplicable:z.boolean(),comment:reason,evidenceRefs:evidence}).strict().refine(v=>v.notApplicable?v.score===null:v.score!==null,'Điểm thiếu dữ liệu phải là null.');
export const PerformanceSelfReviewRequestSchema=command.extend({text:reason,evidenceRefs:evidence});
export const PerformanceManagerScoreRequestSchema=command.extend({criteriaScores:z.array(PerformanceScoreInputSchema).min(1).max(20),reason,evidenceRefs:evidence.min(1)});
export const PerformanceReasonRequestSchema=command.extend({reason,evidenceRefs:evidence.min(1)});
export const PerformanceDisputeRequestSchema=PerformanceReasonRequestSchema.extend({criterionCodes:z.array(z.string()).min(1).max(20),taskIds:z.array(id).max(50).default([])});
export const PerformanceReconsiderationResponseRequestSchema=PerformanceReasonRequestSchema.extend({decision:z.enum(['ADJUSTED','UPHELD','ACCEPTED','WITHDRAWN']),criteriaScores:z.array(PerformanceScoreInputSchema).max(20).optional()});
export const PerformanceAppealDecisionRequestSchema=PerformanceReasonRequestSchema.extend({decision:z.enum(['UPHELD','ADJUSTED','RETURNED','WITHDRAWN']),criteriaScores:z.array(PerformanceScoreInputSchema).max(20).optional()});
export const PerformanceCriterionScoreSchema=PerformanceCriterionSchema.extend({maxScore:z.literal(100),score:score.nullable(),effectiveWeightPercent:score,evidenceRefs:evidence,comment:z.string().nullable(),notApplicable:z.boolean()});
export const PerformanceTaskBreakdownSchema=z.object({taskId:id,title:z.string(),taskVersion:z.number().int(),segmentId:id.nullable(),templateVersion:z.number().int(),taskWeightPercent:score,weightSharePercent:score,normalizedWeightPercent:score,score:score.nullable(),status:z.string(),inclusionStatus:z.enum(['INCLUDED','EXCLUDED','PENDING_DISPUTE']),exclusionReason:z.string().nullable(),pending:z.boolean(),assigner:z.string(),assignedAt:time.nullable(),acceptedAt:time.nullable(),dueAt:time,extendedDueAt:time.nullable(),submittedAt:time.nullable(),evidenceRefs:evidence,evaluatorComment:z.string().nullable(),criteriaScores:z.array(z.object({code:z.string(),score,maxScore:score,comment:z.string(),evidenceRefs:evidence}).strict()),excludedBy:id.nullable(),approvedBy:id.nullable(),exclusionEvidenceRefs:evidence}).strict();
const dispute=z.object({id,requestedByEmployeeId:id,reason,evidenceRefs:evidence,criterionCodes:z.array(z.string()),taskIds:z.array(id),status:z.string(),requestedAt:time,responseDeadlineAt:time,response:z.string().nullable(),responseReason:z.string().nullable(),beforeScore:score.nullable(),afterScore:score.nullable(),respondedAt:time.nullable(),reviewerEmployeeId:id.nullable(),reviewerRole:z.string().nullable(),decisionDeadlineAt:time.nullable(),decidedAt:time.nullable(),escalationLevel:z.number().int().min(0).max(2)}).strict();
export const PerformanceEvaluationSchema=z.object({id,employeeId:id,employeeName:z.string(),storeId:id,storeName:z.string(),period:month,frameworkId:id,frameworkVersion:z.number().int().min(2),role:PerformanceRoleSchema,policyId:id,policySnapshot:PerformancePolicySchema,evaluatorEmployeeId:id,evaluationStatus:PerformanceEvaluationStatusSchema,criteriaScores:z.array(PerformanceCriterionScoreSchema),taskBreakdown:z.array(PerformanceTaskBreakdownSchema),taskGroupScore:score.nullable(),dataStatus:z.enum(['SUFFICIENT','INSUFFICIENT_DATA']),dataCoveragePercent:score,weightRedistribution:z.object({reason:z.string(),removedCriteria:z.array(z.string()),originalWeights:z.record(score),effectiveWeights:z.record(score),redistributedBy:id,redistributedAt:time}).strict().nullable(),finalScore:score.nullable(),provisionalReason:z.string().nullable(),finalScoreVersion:z.number().int().nonnegative(),selfReview:z.string().nullable(),selfEvidenceRefs:evidence,reconsideration:dispute.nullable(),appeal:dispute.nullable(),provisionalAt:time.nullable(),reconsiderationDeadlineAt:time.nullable(),appealDeadlineAt:time.nullable(),finalizedAt:time.nullable(),version:z.number().int().positive(),history:z.array(PerformanceHistoryEntrySchema),createdAt:time,updatedAt:time,isDemo:z.boolean()}).strict();
export const PerformanceDashboardSchema=z.object({period:month,evaluations:z.array(PerformanceEvaluationSchema),policies:z.array(PerformancePolicySchema),summary:z.object({total:z.number().int(),provisional:z.number().int(),disputed:z.number().int(),final:z.number().int(),insufficient:z.number().int(),average:score.nullable(),distribution:z.array(z.object({label:z.string(),count:z.number().int()}).strict()),reconsiderationRatePercent:score,appealRatePercent:score}).strict()}).strict();
export const PerformanceExplainSchema=z.object({evaluation:PerformanceEvaluationSchema,taskFormula:z.string(),counterfactuals:z.array(z.object({taskId:id,withoutTaskScore:score.nullable(),validOnlyWithApprovedRelease:z.literal(true)}).strict()),summary:z.string(),advice:z.array(z.string()),model:z.string(),degraded:z.boolean()}).strict();
export const PerformanceAiSummarySchema=z.object({summary:z.string().max(4000),missingEvidence:z.array(z.string().max(500)).max(100),suggestedComments:z.array(z.string().max(1000)).max(30),anomalies:z.array(z.object({code:z.string(),taskAlias:z.string().nullable(),severity:z.enum(['low','medium','high'])}).strict()).max(100),model:z.string().max(120),degraded:z.boolean()}).strict();
export type PerformanceEvaluation=z.infer<typeof PerformanceEvaluationSchema>;
export type PerformanceFramework=z.infer<typeof PerformanceFrameworkSchema>;
export type PerformancePolicy=z.infer<typeof PerformancePolicySchema>;

export const ClosePerformancePeriodRequestSchema=PerformanceReasonRequestSchema.extend({policyVersions:z.record(id,z.number().int().positive())});

// ============================================================================
// P5b — Performance KPI actions qua chat (plan P5-hr-assign-performance-actions)
// Proposal type 'performance_kpi.task_action' | 'performance_kpi.evaluation_action',
// lưu cùng collection `revenue_kpi_open_actions`, phân biệt bằng field `type`.
// Mọi action gọi service hiện có (openPerformancePeriod, mutateTask,
// mutatePerformanceEvaluation) — không bypass, không viết lại state machine.
// Model KHÔNG chọn điểm số: score/weight/evidence chỉ xuất hiện trong preview,
// model chỉ diễn giải.
// ============================================================================

export const PerformanceKpiActionDigestSchema = z.string().regex(/^[a-f0-9]{64}$/, 'planDigest must be 64 hex chars');
export type PerformanceKpiActionDigest = z.infer<typeof PerformanceKpiActionDigestSchema>;

// --- task_action: open_period, task.assign, task.accept, task.submit, task.evaluate ---
export const PerformanceKpiTaskActionKindSchema = z.enum([
  'open_period', 'task.assign', 'task.accept', 'task.submit', 'task.evaluate',
]);
export type PerformanceKpiTaskActionKind = z.infer<typeof PerformanceKpiTaskActionKindSchema>;
export const PerformanceKpiTaskAssignmentItemSchema = z.object({
  taskId: id,
  assigneeEmployeeId: id,
}).strict();
export type PerformanceKpiTaskAssignmentItem = z.infer<typeof PerformanceKpiTaskAssignmentItemSchema>;

// Args mirror OpenPerformancePeriodRequestSchema (bulk open_period: employeeIds
// 1..500, preview + confirm) và các request schema task hiện có. Không thêm
// trường score — điểm số chỉ có trong preview do planner tính qua service.
export const PerformanceKpiTaskActionArgsSchema = command.extend({
  kind: PerformanceKpiTaskActionKindSchema,
  policyId: id.optional(),
  employeeIds: z.array(id).min(1).max(500).optional(),
  taskId: id.optional(),
  assignments: z.array(PerformanceKpiTaskAssignmentItemSchema).min(1).max(100).optional(),
  segmentId: id.optional(),
  assigneeEmployeeId: id.optional(),
  title: z.string().trim().min(3).max(200).optional(),
  description: z.string().max(10000).optional(),
  dueAt: time.optional(),
  taskWeightPercent: z.number().min(5).max(50).optional(),
  templateId: id.optional(),
  completedStepCodes: z.array(z.string()).max(30).optional(),
  evidenceRefs: evidence.optional(),
  reason: reason.optional(),
  expectedVersion: z.number().int().nonnegative(),
  planDigest: PerformanceKpiActionDigestSchema,
}).strict()
  .refine(v => v.kind !== 'open_period' || (!!v.policyId && !!v.employeeIds?.length), 'open_period requires policyId and employeeIds')
  .refine(v => v.kind === 'open_period' || !!v.taskId || !!v.assignments?.length, 'Task actions require taskId or assignments')
  .refine(v => !v.assignments || new Set(v.assignments.map(a => a.taskId)).size === v.assignments.length, 'Duplicate taskId in assignments is not allowed');
export type PerformanceKpiTaskActionArgs = z.infer<typeof PerformanceKpiTaskActionArgsSchema>;

// Per-employee/plan item của preview (open_period + task.assign bulk).
export const PerformanceKpiTaskActionItemSchema = z.object({
  employeeId: id.nullable(),
  employeeName: z.string().nullable(),
  storeId: id.nullable(),
  taskId: id.nullable(),
  evaluationId: id.nullable(),
  title: z.string().nullable(),
  taskWeightPercent: score.nullable(),
  dueAt: time.nullable(),
  currentStatus: z.string().nullable(),
  projectedStatus: z.string().nullable(),
  willCreate: z.boolean(),
  willSkip: z.boolean(),
  blocked: z.boolean(),
  code: z.string().nullable(),
  message: z.string().nullable(),
  fixHint: z.string().nullable(),
  taskVersion: z.number().int().nonnegative().nullable().optional(),
}).strict();
export type PerformanceKpiTaskActionItem = z.infer<typeof PerformanceKpiTaskActionItemSchema>;

export const PerformanceKpiTaskActionPreviewSchema = z.object({
  kind: PerformanceKpiTaskActionKindSchema,
  period: month.nullable(),
  policyId: id.nullable(),
  expectedVersion: z.number().int().nonnegative(),
  planDigest: PerformanceKpiActionDigestSchema,
  summary: z.string().min(1).max(2000),
  willCreate: z.array(PerformanceKpiTaskActionItemSchema).max(500),
  willSkip: z.array(PerformanceKpiTaskActionItemSchema).max(500),
  blocked: z.array(PerformanceKpiTaskActionItemSchema).max(500),
  warnings: z.array(z.string().max(500)).max(20),
  executed: z.literal(false),
}).strict();
export type PerformanceKpiTaskActionPreview = z.infer<typeof PerformanceKpiTaskActionPreviewSchema>;

export const PerformanceKpiTaskActionResultSchema = z.object({
  outcome: z.enum(['FULL', 'PARTIAL', 'NONE']),
  policy: PerformancePolicySchema.nullable(),
  tasks: z.array(z.object({ taskId: id, employeeId: id.nullable(), status: z.string() }).strict()).max(500),
  created: z.array(PerformanceKpiTaskActionItemSchema).max(500),
  skipped: z.array(PerformanceKpiTaskActionItemSchema).max(500),
  blocked: z.array(PerformanceKpiTaskActionItemSchema).max(500),
  failed: z.array(PerformanceKpiTaskActionItemSchema).max(500),
  summary: z.object({ created: z.number().int().nonnegative(), skipped: z.number().int().nonnegative(), blocked: z.number().int().nonnegative(), failed: z.number().int().nonnegative(), total: z.number().int().nonnegative() }).strict(),
}).strict();
export type PerformanceKpiTaskActionResult = z.infer<typeof PerformanceKpiTaskActionResultSchema>;

export const PerformanceKpiTaskActionSchema = z.object({
  actionId: z.string().uuid(),
  type: z.literal('performance_kpi.task_action'),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXECUTED', 'EXPIRED', 'FAILED']),
  expiresAt: time,
  requiresConfirmation: z.boolean(),
  executed: z.boolean(),
  args: PerformanceKpiTaskActionArgsSchema,
  preview: PerformanceKpiTaskActionPreviewSchema,
  result: PerformanceKpiTaskActionResultSchema.nullable(),
}).strict();
export type PerformanceKpiTaskAction = z.infer<typeof PerformanceKpiTaskActionSchema>;

export const PerformanceKpiTaskActionDecisionSchema = z.discriminatedUnion('approve', [
  z.object({ expectedVersion: z.number().int().nonnegative(), planDigest: PerformanceKpiActionDigestSchema, approve: z.literal(true), clientRequestId: z.string().uuid() }).strict(),
  z.object({ clientRequestId: z.string().uuid(), approve: z.literal(false) }).strict(),
]);
export type PerformanceKpiTaskActionDecision = z.infer<typeof PerformanceKpiTaskActionDecisionSchema>;

// --- evaluation_action: evaluation.score, reconsideration.request/response, appeal.request/decision ---
export const PerformanceKpiEvaluationActionKindSchema = z.enum([
  'evaluation.score', 'reconsideration.request', 'reconsideration.response', 'appeal.request', 'appeal.decision',
]);
export type PerformanceKpiEvaluationActionKind = z.infer<typeof PerformanceKpiEvaluationActionKindSchema>;

export const PerformanceKpiEvaluationActionArgsSchema = command.extend({
  kind: PerformanceKpiEvaluationActionKindSchema,
  evaluationId: id,
  criterionCodes: z.array(z.string()).min(1).max(20).optional(),
  taskIds: z.array(id).max(50).optional(),
  // Chỉ service mới ghi score; args chỉ mang tham chiếu để planner build preview.
  decision: z.enum(['ADJUSTED', 'UPHELD', 'ACCEPTED', 'WITHDRAWN', 'RETURNED']).optional(),
  text: reason.optional(),
  evidenceRefs: evidence.optional(),
  expectedVersion: z.number().int().positive(),
  planDigest: PerformanceKpiActionDigestSchema,
}).strict()
  .refine(v => !['reconsideration.request', 'appeal.request'].includes(v.kind) || (!!v.text && !!v.evidenceRefs?.length), 'Reconsideration/appeal request requires text and evidenceRefs');
export type PerformanceKpiEvaluationActionArgs = z.infer<typeof PerformanceKpiEvaluationActionArgsSchema>;

// Preview item của score: khớp PerformanceCriterionScoreSchema (score/effective
// weight/evidence do planner tính qua service, model chỉ diễn giải).
export const PerformanceKpiScorePreviewItemSchema = z.object({
  code: z.string().max(60),
  name: z.string().max(200),
  currentScore: score.nullable(),
  projectedScore: score.nullable(),
  maxScore: z.literal(100),
  originalWeightPercent: score,
  effectiveWeightPercent: score,
  evidenceRefs: evidence,
  notApplicable: z.boolean(),
}).strict();
export type PerformanceKpiScorePreviewItem = z.infer<typeof PerformanceKpiScorePreviewItemSchema>;

export const PerformanceKpiEvaluationActionPreviewSchema = z.object({
  kind: PerformanceKpiEvaluationActionKindSchema,
  evaluationId: id,
  period: month,
  currentStatus: PerformanceEvaluationStatusSchema,
  projectedStatus: PerformanceEvaluationStatusSchema,
  expectedVersion: z.number().int().positive(),
  planDigest: PerformanceKpiActionDigestSchema,
  summary: z.string().min(1).max(2000),
  // Reconsideration/appeal: criterion/task bị tranh chấp + deadline.
  disputedCriterionCodes: z.array(z.string().max(60)).max(20),
  disputedTaskIds: z.array(id).max(50),
  deadlineAt: time.nullable(),
  criteriaScores: z.array(PerformanceKpiScorePreviewItemSchema).max(20),
  taskGroupScore: score.nullable(),
  projectedFinalScore: score.nullable(),
  warnings: z.array(z.string().max(500)).max(20),
  executed: z.literal(false),
}).strict();
export type PerformanceKpiEvaluationActionPreview = z.infer<typeof PerformanceKpiEvaluationActionPreviewSchema>;

export const PerformanceKpiEvaluationActionResultSchema = z.object({
  evaluation: PerformanceEvaluationSchema.nullable(),
}).strict();
export type PerformanceKpiEvaluationActionResult = z.infer<typeof PerformanceKpiEvaluationActionResultSchema>;

export const PerformanceKpiEvaluationActionSchema = z.object({
  actionId: z.string().uuid(),
  type: z.literal('performance_kpi.evaluation_action'),
  status: z.enum(['PENDING', 'CONFIRMED', 'CANCELLED', 'EXECUTED', 'EXPIRED', 'FAILED']),
  expiresAt: time,
  requiresConfirmation: z.boolean(),
  executed: z.boolean(),
  args: PerformanceKpiEvaluationActionArgsSchema,
  preview: PerformanceKpiEvaluationActionPreviewSchema,
  result: PerformanceKpiEvaluationActionResultSchema.nullable(),
}).strict();
export type PerformanceKpiEvaluationAction = z.infer<typeof PerformanceKpiEvaluationActionSchema>;

export const PerformanceKpiEvaluationActionDecisionSchema = z.discriminatedUnion('approve', [
  z.object({ expectedVersion: z.number().int().positive(), planDigest: PerformanceKpiActionDigestSchema, approve: z.literal(true), clientRequestId: z.string().uuid() }).strict(),
  z.object({ clientRequestId: z.string().uuid(), approve: z.literal(false) }).strict(),
]);
export type PerformanceKpiEvaluationActionDecision = z.infer<typeof PerformanceKpiEvaluationActionDecisionSchema>;

// Union chung Performance cho executor decideChatAction (cùng collection).
export const PerformanceKpiChatActionSchema = z.discriminatedUnion('type', [
  PerformanceKpiTaskActionSchema,
  PerformanceKpiEvaluationActionSchema,
]);
export type PerformanceKpiChatAction = z.infer<typeof PerformanceKpiChatActionSchema>;

export const PerformanceKpiPreviewTaskActionResponseSchema = z.object({
  actionId: z.string().uuid(),
  type: z.literal('performance_kpi.task_action'),
  preview: PerformanceKpiTaskActionPreviewSchema,
  requiresConfirmation: z.literal(true),
  executed: z.literal(false),
}).strict();
export type PerformanceKpiPreviewTaskActionResponse = z.infer<typeof PerformanceKpiPreviewTaskActionResponseSchema>;

export const PerformanceKpiPreviewEvaluationActionResponseSchema = z.object({
  actionId: z.string().uuid(),
  type: z.literal('performance_kpi.evaluation_action'),
  preview: PerformanceKpiEvaluationActionPreviewSchema,
  requiresConfirmation: z.literal(true),
  executed: z.literal(false),
}).strict();
export type PerformanceKpiPreviewEvaluationActionResponse = z.infer<typeof PerformanceKpiPreviewEvaluationActionResponseSchema>;

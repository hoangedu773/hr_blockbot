import { z } from "zod";

// Software profiles, not a transcription of a company's rank hierarchy.
export const AuthorizationProfileSchema = z.enum([
  "system_admin", "hr", "om", "aom", "sam", "am", "sm", "ptch", "staff",
]);
export type AuthorizationProfile = z.infer<typeof AuthorizationProfileSchema>;
export const AuthorizationCapabilitySchema = z.enum([
  "authorization.inspect_self", "accounts.manage", "grants.manage", "provider_settings.manage", "security_audit.read",
  "profile.read_self", "profile.update_self_basic", "profile.request_self",
  "employees.read_operational", "employees.read_sensitive", "employees.create", "employees.update_other", "employees.review",
  "employees.transfer", "departments.read", "departments.configure", "stores.read", "stores.configure", "dashboard.read",
  "projects.read_assigned", "projects.read_managed", "projects.create", "projects.assign", "assignment.respond",
  "assignment.review", "assignment.handover", "assignment.discuss", "assignment.escalation_review",
  "projects.execute", "reports.submit", "reports.review", "assignment.audit_read",
  "delegations.manage", "policies.read", "attachments.read", "chatbot.data_read", "chatbot.execute",
  "legacy.operations", "kpi.read_self", "kpi.read_department", "kpi.manage", "kpi.publish", "kpi.override", "kpi.write", "payroll.write", "promotion.approve", "raw_source.read",
  "directory.read_store", "employees.read_hr", "onboarding.propose", "onboarding.draft", "onboarding.review",
  "employees.lifecycle_request", "employees.lifecycle_review", "employees.transfer_confirm",
  "delegations.request", "delegations.review", "grants.configure", "grants.revoke",
  "onboarding.reporting_propose", "onboarding.reporting_review",
]);
export type AuthorizationCapability = z.infer<typeof AuthorizationCapabilitySchema>;
export const AuthorizationPolicyStatusSchema = z.enum(["APPROVED", "PENDING", "DENIED"]);
export type AuthorizationPolicyStatus = z.infer<typeof AuthorizationPolicyStatusSchema>;
const Id = z.string().regex(/^[a-f0-9]{24}$/i).transform((value) => value.toLowerCase());
const DateTime = z.string().datetime({ offset: true });

export const AuthorizationScopeSchema = z.object({
  kind: z.enum(["self", "system", "organization"]),
  storeIds: z.array(Id).max(500).default([]),
  regionIds: z.array(Id).max(100).default([]),
  reportingEmployeeIds: z.array(Id).max(1000).default([]),
}).strict().superRefine((value, ctx) => {
  if (value.kind !== "organization" && (value.storeIds.length || value.regionIds.length || value.reportingEmployeeIds.length)) {
    ctx.addIssue({ code: "custom", message: "Self/system scope cannot contain organization assignments" });
  }
  if (value.kind === "organization" && !value.storeIds.length && !value.regionIds.length && !value.reportingEmployeeIds.length) {
    ctx.addIssue({ code: "custom", message: "Organization scope must be explicit, never global" });
  }
});
export type AuthorizationScope = z.infer<typeof AuthorizationScopeSchema>;

const Window = z.object({ validFrom: DateTime, validUntil: DateTime.nullable() });
const hasWindow = (value: { validFrom: string; validUntil: string | null }) =>
  value.validUntil === null || Date.parse(value.validFrom) < Date.parse(value.validUntil);
export const AuthorizationGrantSchema = Window.extend({
  id: z.string().uuid(),
  profile: AuthorizationProfileSchema,
  scope: AuthorizationScopeSchema,
  // Missing in the old foundation schema means NO capabilities, not all profile permissions.
  capabilities: z.array(AuthorizationCapabilitySchema).max(50).default([]),
  approvalRef: z.string().trim().min(1).max(200),
  grantedBy: Id,
  grantedAt: DateTime,
  revokedAt: DateTime.nullable().default(null),
}).strict().refine(hasWindow, "Grant validity must have positive duration");
export type AuthorizationGrant = z.infer<typeof AuthorizationGrantSchema>;

export const AuthorizationDelegationSchema = Window.extend({
  id: z.string().uuid(), sourceGrantId: z.string().uuid(),
  delegatorUserId: Id, recipientUserId: Id,
  capabilities: z.array(AuthorizationCapabilitySchema).min(1).max(30),
  scope: AuthorizationScopeSchema,
  approvalRef: z.string().trim().min(1).max(200),
  revokedAt: DateTime.nullable().default(null),
  approvedByUserId: Id.optional(),
  approvedAt: DateTime.optional(),
}).strict().refine((value) => value.validUntil !== null && hasWindow(value), "Delegation requires a finite positive window")
  .refine((value) => value.validUntil !== null && Date.parse(value.validUntil) - Date.parse(value.validFrom) <= 14 * 86400000, "Delegation exceeds the approved fourteen-day maximum")
  .refine((value) => value.delegatorUserId !== value.recipientUserId, "Cannot delegate to self");
export type AuthorizationDelegation = z.infer<typeof AuthorizationDelegationSchema>;

export const AuthorizationStateSchema = z.object({
  schemaVersion: z.literal(1),
  profile: AuthorizationProfileSchema,
  grants: z.array(AuthorizationGrantSchema).max(100),
}).strict().superRefine((value, ctx) => {
  if (value.grants.some((grant) => grant.profile !== value.profile)) {
    ctx.addIssue({ code: "custom", message: "Grant profile must match the explicitly assigned profile" });
  }
  if (new Set(value.grants.map((grant) => grant.id)).size !== value.grants.length) {
    ctx.addIssue({ code: "custom", message: "Duplicate grant IDs" });
  }
  if (value.grants.some((grant) => grant.scope.kind === "system" && value.profile !== "system_admin")) {
    ctx.addIssue({ code: "custom", message: "System scope is restricted to technical administration" });
  }
});
export type AuthorizationState = z.infer<typeof AuthorizationStateSchema>;

export const AuthorizationSummarySchema = z.object({
  configured: z.boolean(), profile: AuthorizationProfileSchema.nullable(),
  securityVersion: z.number().int().nonnegative(),
  // Summary is diagnostic only until all CRM routes have been migrated.
  enforcement: z.enum(["FOUNDATION_ONLY", "MIGRATING", "CAPABILITY_ENFORCED"]),
  capabilities: z.array(AuthorizationCapabilitySchema),
  pendingCapabilities: z.array(AuthorizationCapabilitySchema),
  grants: z.array(AuthorizationGrantSchema),
  stores: z.array(z.object({ id: Id, name: z.string(), departmentId: Id.nullable(), regionId: Id.nullable(), capabilities: z.array(AuthorizationCapabilitySchema) })).default([]),
  delegations: z.array(z.object({ id: Id, capabilities: z.array(AuthorizationCapabilitySchema), validUntil: DateTime.nullable() })).default([]),
});
export type AuthorizationSummary = z.infer<typeof AuthorizationSummarySchema>;

export const GutaGradeSchema = z.enum(["NV1", "NV2", "NV3", "PTCH", "SM1", "SM2", "SM3", "AM1", "AM2", "AM3", "SAM", "AOM", "OM"]);
export const OnboardingCreateSchema = z.object({
  clientRequestId: z.string().uuid(),
  fullName: z.string().trim().min(1).max(200), storeId: Id,
  hiredAt: DateTime, phone: z.string().trim().min(1).max(30),
  reason: z.string().trim().min(1).max(2000),
}).strict();
export const OnboardingReviewSchema = z.object({
  decision: z.enum(["APPROVE", "REJECT"]), reason: z.string().trim().min(1).max(2000),
  expectedVersion: z.number().int().positive(),
}).strict();
export const InitialReportingProposalSchema = z.object({
  onboardingId: Id, managerEmployeeId: Id, validFrom: DateTime,
  evidenceRef: z.string().trim().min(1).max(500), reason: z.string().trim().min(1).max(2000),
}).strict();
export const InitialReportingApprovalSchema = z.object({ expectedVersion: z.number().int().positive(), reason: z.string().trim().min(1).max(2000) }).strict();
export const ActivationRequestSchema = z.object({
  token: z.string().regex(/^[a-f0-9]{64}$/), newPassword: z.string().min(12).max(128),
}).strict();
export const PasswordRecoveryIssueSchema = z.object({
  expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2000),
}).strict();
export const OnboardingResubmitSchema = OnboardingCreateSchema.pick({ fullName: true, phone: true, hiredAt: true, reason: true }).extend({ expectedVersion: z.number().int().positive() }).strict();

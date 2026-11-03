import {
  AuthorizationStateSchema, AuthorizationScopeSchema, AuthorizationDelegationSchema,
  type AuthorizationProfile, type AuthorizationCapability, type AuthorizationScope,
  type AuthorizationState, type AuthorizationGrant, type AuthorizationDelegation, type AuthorizationPolicyStatus,
} from "@hr-blockbot/contracts";

type Rule = { status: AuthorizationPolicyStatus; profiles: readonly AuthorizationProfile[]; scope: "self" | "system" | "organization"; delegable: boolean; approval: string };
const everyone: AuthorizationProfile[] = ["system_admin", "hr", "om", "aom", "sam", "am", "sm", "ptch", "staff"];
const workers = everyone.filter((profile) => profile !== "system_admin");
const managers: AuthorizationProfile[] = ["om", "sam", "am", "sm"];
const rule = (profiles: readonly AuthorizationProfile[], scope: Rule["scope"], status: Rule["status"], approval: string, delegable = false): Rule =>
  Object.freeze({ profiles: Object.freeze([...profiles]), scope, status, delegable, approval });
const self = () => rule(everyone, "self", "APPROVED", "Existing self-service workflow; explicit employee ownership required");
const assigned = () => rule(workers, "self", "APPROVED", "Owner-approved assignment consent workflow; assigned participant only");
const pending = (profiles: AuthorizationProfile[] = managers) => rule(profiles, "organization", "PENDING", "Profile/action authority requires project-owner approval");
const technical = () => rule(["system_admin"], "system", "APPROVED", "Owner requested separate technical administration");
const denied = () => rule([], "organization", "DENIED", "Out of scope or explicitly disabled");
const operational = (profiles: AuthorizationProfile[] = managers, delegable = false) => rule(profiles, "organization", "APPROVED", "Project-owner software authorization V1 approval (not company policy)", delegable);

// Eligibility is not authority. Pending policy cannot be enabled by a grant/body/title.
export const AUTHORIZATION_POLICY: Readonly<Record<AuthorizationCapability, Rule>> = Object.freeze({
  "authorization.inspect_self": self(), "accounts.manage": technical(), "grants.manage": denied(),
  "grants.configure": technical(), "grants.revoke": technical(),
  "provider_settings.manage": technical(), "security_audit.read": technical(),
  "profile.read_self": self(), "profile.update_self_basic": self(), "profile.request_self": self(),
  "employees.read_operational": operational(["hr", ...managers, "aom", "ptch"]), "employees.read_sensitive": denied(),
  "employees.read_hr": operational(["hr"]), "directory.read_store": operational(workers),
  "employees.create": operational(["hr"]), "employees.update_other": operational(["hr"]), "employees.review": operational(["hr"]),
  "employees.lifecycle_request": operational(["hr"]), "employees.lifecycle_review": operational(["hr"]),
  "employees.transfer_confirm": operational(managers),
  "onboarding.propose": operational(["sm"]), "onboarding.draft": operational(["hr"]), "onboarding.review": operational(["hr"]),
  "onboarding.reporting_propose": operational(["sm"]), "onboarding.reporting_review": operational(),
  "employees.transfer": operational(["hr"]), "departments.read": pending(["system_admin", "hr", ...managers]),
  "departments.configure": pending(["system_admin"]), "stores.read": operational(workers.filter((profile) => profile !== "staff")), "stores.configure": pending(["system_admin"]),
  "dashboard.read": operational(["hr", ...managers, "aom", "ptch"]), "projects.read_assigned": assigned(), "projects.read_managed": operational(),
  "projects.create": operational(managers, true), "projects.assign": operational(managers, true), "assignment.respond": assigned(), "assignment.review": operational(),
  "assignment.handover": assigned(), "assignment.discuss": assigned(), "assignment.escalation_review": operational(),
  "projects.execute": assigned(), "reports.submit": assigned(), "reports.review": operational(managers, true), "assignment.audit_read": assigned(),
  "delegations.manage": denied(), "delegations.request": operational(managers), "delegations.review": operational(managers),
  "policies.read": operational(everyone), "attachments.read": operational(everyone),
  "chatbot.data_read": self(), "chatbot.execute": denied(), "legacy.operations": denied(),
  "kpi.read_self": self(), "kpi.read_department": operational(["hr", ...managers, "aom"]),
  "kpi.manage": operational(["hr", ...managers, "aom"]), "kpi.publish": operational(["hr", ...managers, "aom"]),
  "kpi.override": operational(["hr", ...managers, "aom"]),
  "kpi.write": denied(), "payroll.write": denied(), "promotion.approve": denied(), "raw_source.read": denied(),
});

export interface AuthorizationPrincipal {
  userId: string;
  role: "Admin" | "Employee";
  isGlobalAdmin: boolean;
  employeeId: string | null;
  employeeActive: boolean;
  accountActive: boolean;
  mustChangePassword: boolean;
  securityVersion: number;
  authorization: AuthorizationState | null;
}
export interface AuthorizationResource {
  // These fields are resolved by the API, never authority from a request body.
  userId?: string | null; employeeId?: string | null;
  storeId?: string | null; regionId?: string | null;
  canonicalStoreVerified?: boolean; canonicalRegionVerified?: boolean;
  requesterUserId?: string | null; subjectEmployeeId?: string | null;
  requiresIndependentApproval?: boolean;
  conflictUserIds?: string[];
  reportingVerified?: boolean;
}
export type AuthorizationDecision = { allowed: boolean; reason: string; grantId?: string };
const deny = (reason: string): AuthorizationDecision => ({ allowed: false, reason });
export function activeWindow(value: { validFrom: string; validUntil: string | null; revokedAt?: string | null }, now: Date): boolean {
  return !value.revokedAt && Date.parse(value.validFrom) <= now.getTime() &&
    (value.validUntil === null || now.getTime() < Date.parse(value.validUntil));
}
export function scopeAllows(scope: AuthorizationScope, principal: Pick<AuthorizationPrincipal, "userId" | "employeeId">, resource: AuthorizationResource): boolean {
  const parsed = AuthorizationScopeSchema.safeParse(scope);
  if (!parsed.success) return false;
  scope = parsed.data;
  if (scope.kind === "self") {
    const hasOwner = !!(resource.userId || resource.employeeId);
    return hasOwner && (!resource.userId || resource.userId === principal.userId) &&
      (!resource.employeeId || !!principal.employeeId && resource.employeeId === principal.employeeId);
  }
  if (scope.kind === "system") return true; // Caller must separately require a technical capability/profile.
  // When both location and reporting constraints exist, apply BOTH (intersection).
  const hasLocation = !!(scope.storeIds.length || scope.regionIds.length);
  const location = !!resource.canonicalStoreVerified && !!resource.storeId && (scope.storeIds.includes(resource.storeId) ||
    !!resource.canonicalRegionVerified && !!resource.regionId && scope.regionIds.includes(resource.regionId));
  const reporting = !scope.reportingEmployeeIds.length || !!resource.employeeId && scope.reportingEmployeeIds.includes(resource.employeeId);
  return (!hasLocation || location) && reporting;
}
export function evaluateAuthorization(principal: AuthorizationPrincipal, capability: AuthorizationCapability, resource: AuthorizationResource, now = new Date()): AuthorizationDecision {
  if (!principal.accountActive) return deny("ACCOUNT_DISABLED");
  if (principal.mustChangePassword) return deny("PASSWORD_CHANGE_REQUIRED");
  const parsed = AuthorizationStateSchema.safeParse(principal.authorization);
  if (!parsed.success) return deny("AUTHORIZATION_UNCONFIGURED");
  const state = parsed.data;
  // Legacy role/global flags do not grant (or substitute for) any V1 capability.
  if (state.profile !== "system_admin" && (!principal.employeeId || !principal.employeeActive)) return deny("EMPLOYEE_UNAVAILABLE");
  const policy = AUTHORIZATION_POLICY[capability];
  if (!policy) return deny("UNKNOWN_CAPABILITY");
  if (policy.status !== "APPROVED") return deny(policy.status === "PENDING" ? "POLICY_PENDING" : "POLICY_DENIED");
  if (!policy.profiles.includes(state.profile)) return deny("CAPABILITY_DENIED");
  if (capability !== "authorization.inspect_self" && policy.scope === "self" && (!principal.employeeId || !principal.employeeActive)) return deny("EMPLOYEE_UNAVAILABLE");
  if (resource.requiresIndependentApproval && (resource.requesterUserId === principal.userId ||
    !!principal.employeeId && (resource.subjectEmployeeId === principal.employeeId || resource.employeeId === principal.employeeId) ||
    resource.conflictUserIds?.includes(principal.userId))) return deny("SELF_APPROVAL_DENIED");
  for (const grant of state.grants) {
    if (!activeWindow(grant, now) || grant.scope.kind !== policy.scope || !grant.capabilities.includes(capability)) continue;
    if (["projects.read_managed", "projects.create", "projects.assign", "reports.review", "assignment.review", "assignment.escalation_review", "employees.transfer_confirm", "delegations.review"].includes(capability) && resource.employeeId && resource.reportingVerified !== true) continue;
    if (scopeAllows(grant.scope, principal, resource)) return { allowed: true, reason: "EXPLICIT_GRANT", grantId: grant.id };
  }
  return deny("SCOPE_OR_VALIDITY_DENIED");
}

export function delegationScopeWithin(target: AuthorizationScope, source: AuthorizationScope, verifiedSourceStoreIds: string[] = []): boolean {
  if (source.kind !== "organization" || target.kind !== "organization") return false;
  if (target.storeIds.some((id) => !source.storeIds.includes(id) && !verifiedSourceStoreIds.includes(id)) || target.regionIds.some((id) => !source.regionIds.includes(id))) return false;
  if ((source.storeIds.length || source.regionIds.length) && !target.storeIds.length && !target.regionIds.length) return false;
  return !source.reportingEmployeeIds.length || target.reportingEmployeeIds.length > 0 && target.reportingEmployeeIds.every((id) => source.reportingEmployeeIds.includes(id));
}
export function validateDelegation(delegation: AuthorizationDelegation, source: AuthorizationGrant, delegator: AuthorizationPrincipal, recipient: AuthorizationPrincipal, now = new Date(), approval?: { approver: AuthorizationPrincipal; directManagerVerified: boolean; verifiedSourceStoreIds?: string[] }): AuthorizationDecision {
  const parsed = AuthorizationDelegationSchema.safeParse(delegation);
  if (!parsed.success) return deny("INVALID_DELEGATION");
  if (!activeWindow(delegation, now)) return deny("DELEGATION_EXPIRED_OR_REVOKED");
  const sourceState = AuthorizationStateSchema.safeParse(delegator.authorization);
  if (!sourceState.success || !sourceState.data.grants.some((grant) => grant.id === source.id && JSON.stringify(grant) === JSON.stringify(source))) return deny("SOURCE_GRANT_UNAVAILABLE");
  if (delegation.sourceGrantId !== source.id || delegation.delegatorUserId !== delegator.userId || delegation.recipientUserId !== recipient.userId) return deny("DELEGATION_IDENTITY_MISMATCH");
  if (!delegator.accountActive || !recipient.accountActive || !delegator.employeeActive || !recipient.employeeActive || delegator.mustChangePassword || recipient.mustChangePassword ||
    !activeWindow(source, now)) return deny("SOURCE_OR_RECIPIENT_UNAVAILABLE");
  if (Date.parse(delegation.validFrom) < Date.parse(source.validFrom) || source.validUntil !== null && Date.parse(delegation.validUntil!) > Date.parse(source.validUntil)) return deny("DELEGATION_WINDOW_EXCEEDED");
  if (source.scope.kind !== "organization" || delegation.scope.kind !== "organization") return deny("DELEGATION_SCOPE_DENIED");
  // Region-to-store narrowing needs canonical evidence supplied by the server resolver.
  if (!delegationScopeWithin(delegation.scope, source.scope, approval?.verifiedSourceStoreIds)) return deny("DELEGATION_SCOPE_EXCEEDED");
  if (!delegation.approvedByUserId || !delegation.approvedAt || !approval?.directManagerVerified || !approval.approver.accountActive || approval.approver.mustChangePassword ||
    approval.approver.userId !== delegation.approvedByUserId || [delegator.userId, recipient.userId].includes(approval.approver.userId)) return deny("INDEPENDENT_DELEGATION_APPROVAL_REQUIRED");
  const sourceProfile = delegator.authorization?.profile, recipientProfile = recipient.authorization?.profile;
  // Both approved branches may have an operational direct superior (AM or SM
  // acting as the SM3 position). Profile/grade never proves direct authority:
  // verified() must check a current direct edge + explicit scoped review grant
  // for EVERY selected store before calling this validator.
  if (sourceProfile === "sm" && (recipientProfile !== "ptch" || !managers.includes(approval.approver.authorization?.profile ?? "staff"))) return deny("DELEGATION_PROFILE_DENIED");
  if (sourceProfile === "om" && recipientProfile !== "aom") return deny("DELEGATION_PROFILE_DENIED");
  if (!["om", "sam", "am", "sm"].includes(sourceProfile ?? "") || !["aom", "sam", "am", "sm", "ptch"].includes(recipientProfile ?? "")) return deny("DELEGATION_PROFILE_DENIED");
  if (delegation.capabilities.some((capability) => !AUTHORIZATION_POLICY[capability].delegable || AUTHORIZATION_POLICY[capability].status !== "APPROVED" || !source.capabilities.includes(capability))) return deny("CAPABILITY_NOT_DELEGABLE");
  return { allowed: true, reason: "APPROVED_BOUNDED_DELEGATION", grantId: source.id };
}

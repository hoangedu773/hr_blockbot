import { randomUUID } from "node:crypto";
import { z } from "zod";
import { AuthorizationProfileSchema, AuthorizationCapabilitySchema, AuthorizationScopeSchema, AuthorizationGrantSchema, AuthorizationStateSchema } from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
import { EmployeeModel } from "../models/Employee.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { AUTHORIZATION_POLICY } from "./authorization-policy.service.js";
import { requireCapability, resolveCanonicalContext } from "./authorization-scope.service.js";
import { mutateAccountSecurity, withAccountSecurityLock, accountMetadata } from "./account-security.service.js";
import { objectId, WorkflowError } from "./project-workflow.service.js";

export const ConfigureGrantSchema = z.object({ profile: AuthorizationProfileSchema, capabilities: z.array(AuthorizationCapabilitySchema).min(1).max(50),
  scope: AuthorizationScopeSchema, validUntil: z.string().datetime({ offset: true }).nullable(), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2000) }).strict();
export async function configureGrant(actor: AuthenticatedUser, target: string, input: unknown) {
  target = String(objectId(target));
  const parsed = ConfigureGrantSchema.safeParse(input);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Profile/capability/phạm vi/thời hạn không hợp lệ.");
  requireCapability(actor, "grants.configure");
  return withAccountSecurityLock(actor, async () => {
    const body = parsed.data;
    const row: any = await UserModel.findById(objectId(target)).lean();
    if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tài khoản.");
    if (target === actor.userId) throw new WorkflowError(403, "SELF_AUTHORIZATION_CHANGE_DENIED", "Không tự cấu hình profile/quyền.");
    if (row.provisioningRequestId && row.status === "pending_activation") throw new WorkflowError(409, "ONBOARDING_WORKFLOW_REQUIRED", "Không sửa phân quyền tài khoản chưa hoàn tất tiếp nhận.");
    if (row.authorization?.profile && row.authorization.profile !== body.profile) throw new WorkflowError(409, "PROFILE_REASSIGNMENT_REVIEW_REQUIRED", "Đổi profile đang có cần quyết định phân công riêng; V1 không tự nâng chức danh qua cấp grant.");
    for (const capability of body.capabilities) {
      const policy = AUTHORIZATION_POLICY[capability];
      if (policy.status !== "APPROVED" || !policy.profiles.includes(body.profile) || policy.scope !== body.scope.kind) throw new WorkflowError(403, "CAPABILITY_POLICY_DENIED", "Capability chưa duyệt, sai profile hoặc sai loại scope.");
    }
    const employee: any = row.employeeId ? await EmployeeModel.findById(row.employeeId).lean() : null;
    if (body.profile !== "system_admin" && (!employee || employee.status !== "active" || employee.userId && String(employee.userId) !== target)) throw new WorkflowError(409, "CANONICAL_EMPLOYEE_REQUIRED", "Chưa có liên kết nhân viên active được xác minh.");
    if (body.scope.kind === "organization") {
      const canonical = await resolveCanonicalContext(employee);
      const stores = canonical.verifiedStores.filter((store) => body.scope.storeIds.includes(store.id) || !!store.regionId && body.scope.regionIds.includes(store.regionId));
      if (!stores.length || body.scope.storeIds.some((id) => !stores.some((store) => store.id === id)) || body.scope.regionIds.some((id) => !stores.some((store) => store.regionId === id))) throw new WorkflowError(409, "CANONICAL_SCOPE_REQUIRED", "Scope thiếu mapping canonical.");
      if (body.profile === "staff" && (stores.length !== 1 || stores[0].id !== canonical.ownStoreId || body.scope.regionIds.length)) throw new WorkflowError(403, "STAFF_HOME_STORE_ONLY", "Staff chỉ có danh bạ cửa hàng của mình.");
      const managerial = body.capabilities.some((capability) => ["projects.create", "projects.assign", "projects.read_managed", "reports.review", "assignment.review", "assignment.escalation_review", "employees.transfer_confirm", "onboarding.propose", "delegations.request", "delegations.review"].includes(capability));
      if (managerial && stores.some((store) => !canonical.managedByStore[store.id]?.length)) throw new WorkflowError(409, "VERIFIED_REPORTING_REQUIRED", "Chưa có quan hệ quản lý thực tế cho từng cửa hàng.");
      if (body.scope.reportingEmployeeIds.length) {
        const people: any[] = await EmployeeModel.find({ _id: { $in: body.scope.reportingEmployeeIds.map(objectId) }, storeId: { $in: stores.map((store) => objectId(store.id)) }, storeMappingRef: { $type: "string", $ne: "" } }).select("storeId").lean();
        if (people.length !== new Set(body.scope.reportingEmployeeIds).size || managerial && people.some((person) => !canonical.managedByStore[String(person.storeId)]?.includes(String(person._id)))) throw new WorkflowError(409, "REPORTING_SCOPE_MISMATCH", "Subject ngoài scope hoặc chưa có quan hệ xác minh.");
      }
    }
    const now = new Date().toISOString();
    if (body.validUntil && Date.parse(body.validUntil) <= Date.now()) throw new WorkflowError(400, "GRANT_EXPIRED", "Thời hạn cần ở tương lai.");
    const previous = row.authorization ? AuthorizationStateSchema.parse(row.authorization) : { schemaVersion: 1 as const, profile: body.profile, grants: [] };
    const grant = AuthorizationGrantSchema.parse({ id: randomUUID(), profile: body.profile, capabilities: [...new Set(body.capabilities)], scope: body.scope,
      validFrom: now, validUntil: body.validUntil, approvalRef: "PROJECT_OWNER_AUTHORIZATION_V1", grantedBy: actor.userId, grantedAt: now, revokedAt: null });
    const authorization = AuthorizationStateSchema.parse({ ...previous, grants: [...previous.grants, grant] });
    return accountMetadata(await mutateAccountSecurity(actor, target, body.expectedVersion, body.reason, { authorization }));
  }, "grants.configure");
}
export async function revokeGrant(actor: AuthenticatedUser, target: string, grantId: string, version: number, reason: string) {
  requireCapability(actor, "grants.revoke");
  return withAccountSecurityLock(actor, async () => {
    const row: any = await UserModel.findById(objectId(target)).lean();
    const parsed = AuthorizationStateSchema.safeParse(row?.authorization);
    if (!row || !parsed.success || !parsed.data.grants.some((grant) => grant.id === grantId && !grant.revokedAt)) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy grant còn hiệu lực.");
    const authorization = { ...parsed.data, grants: parsed.data.grants.map((grant) => grant.id === grantId ? { ...grant, revokedAt: new Date().toISOString() } : grant) };
    return accountMetadata(await mutateAccountSecurity(actor, target, version, reason, { authorization }));
  }, "grants.revoke");
}

import { Router } from "express";
import { z } from "zod";
import { PaginationQuerySchema } from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { workflowEndpoint as endpoint } from "./projects.js";
import { requireCapability, resolveCanonicalContext } from "../services/authorization-scope.service.js";
import { EmployeeModel } from "../models/Employee.js";
import { accountMetadata, setAccountStatus, redactedSecurityAudit } from "../services/account-security.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import { configureGrant, revokeGrant } from "../services/grant-management.service.js";
import { AUTHORIZATION_POLICY } from "../services/authorization-policy.service.js";
import { issuePasswordRecovery } from "../services/password-recovery.service.js";
const router = Router();
router.get("/admin/authorization-catalog", authenticateToken, endpoint(async (req, res) => {
  requireCapability(req.user!, "grants.configure");
  res.json({ policies: AUTHORIZATION_POLICY, stores: req.user!.canonical?.verifiedStores ?? [] });
}));
router.get("/admin/users/:id/grant-scope", authenticateToken, endpoint(async (req, res) => {
  requireCapability(req.user!, "grants.configure");
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) throw new WorkflowError(400, "VALIDATION_FAILED", "ID không hợp lệ.");
  const target: any = await UserModel.findById(req.params.id).select("employeeId securityVersion").lean();
  if (!target) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tài khoản.");
  const employee = target.employeeId ? await EmployeeModel.findById(target.employeeId).lean() : null;
  const canonical = await resolveCanonicalContext(employee);
  // IDs and mapping metadata only: technical administration is not an HR directory.
  res.json({ targetId: String(target._id), securityVersion: target.securityVersion ?? 0, ownStoreId: canonical.ownStoreId,
    stores: canonical.verifiedStores.map((store) => ({ ...store, managedEmployeeIds: canonical.managedByStore[store.id] ?? [] })) });
}));
router.post("/admin/users/:id/grants", authenticateToken, endpoint(async (req, res) => { res.json(await configureGrant(req.user!, req.params.id, req.body)); }));
router.post("/admin/users/:id/grants/:grantId/revoke", authenticateToken, endpoint(async (req, res) => {
  const body = z.object({ expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
  if (!body.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần phiên bản và lý do thu hồi.");
  res.json(await revokeGrant(req.user!, req.params.id, req.params.grantId, body.data.expectedVersion, body.data.reason));
}));
router.get("/admin/users/:id/security-audit", authenticateToken, endpoint(async (req, res) => {
  requireCapability(req.user!, "security_audit.read");
  if (!/^[a-f0-9]{24}$/i.test(req.params.id)) throw new WorkflowError(400, "VALIDATION_FAILED", "ID không hợp lệ.");
  const row: any = await UserModel.findById(req.params.id).select("securityAudit").lean();
  if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tài khoản.");
  res.json(redactedSecurityAudit(row));
}));
router.get("/admin/users", authenticateToken, endpoint(async (req, res) => {
  requireCapability(req.user!, "accounts.manage");
  const { page, limit } = PaginationQuerySchema.parse(req.query);
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 64).replace(/[.*+?^$(){}|[\]\\]/g, "\\$&") : "";
  const query = q ? { username: { $regex: q, $options: "i" } } : {};
  const [users, totalItems] = await Promise.all([UserModel.find(query).select("-passwordHash -securityAudit -passwordRecovery.tokenHash").sort({ username: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), UserModel.countDocuments(query)]);
  res.json({ items: users.map(accountMetadata), paging: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNext: page * limit < totalItems, hasPrev: page > 1 } });
}));
router.patch("/admin/users/:id", authenticateToken, endpoint(async (req, res) => {
  requireCapability(req.user!, "accounts.manage");
  const parsed = z.object({ status: z.enum(["active", "disabled"]), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(2000) }).strict().safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Chỉ đổi trạng thái có lý do và version; role/profile/employee link không sửa trực tiếp.");
  res.json(await setAccountStatus(req.user!, req.params.id, parsed.data.status, parsed.data.expectedVersion, parsed.data.reason));
}));
router.post("/admin/users", authenticateToken, endpoint(async (req, res) => {
  requireCapability(req.user!, "accounts.manage");
  throw new WorkflowError(409, "ONBOARDING_WORKFLOW_REQUIRED", "Staff account chỉ được provision từ đề nghị đã được HR độc lập duyệt. Bootstrap tài khoản kỹ thuật dùng manifest maintenance được duyệt.");
}));
router.post("/admin/users/:id/reset-password", authenticateToken, endpoint(async (req, res) => {
  // Keep the retired unconfigured endpoint fail-closed even for legacy payloads.
  requireCapability(req.user!, "accounts.manage");
  if (!req.app.locals.recoveryOptions?.deliverRecovery) throw new WorkflowError(503, "SECURE_RECOVERY_DELIVERY_REQUIRED", "Chưa cấu hình kênh khôi phục an toàn.");
  res.json(await issuePasswordRecovery(req.user!, req.params.id, req.body, req.app.locals.recoveryOptions));
}));
router.delete("/admin/users/:id", authenticateToken, endpoint(async (req, res) => {
  requireCapability(req.user!, "accounts.manage");
  throw new WorkflowError(405, "USE_AUDITED_ACCOUNT_DISABLE", "Khóa có lý do/version thay cho xóa lịch sử tài khoản.");
}));
export default router;

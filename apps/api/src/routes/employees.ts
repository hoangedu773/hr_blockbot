import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import {
  EmployeeSummarySchema,
  EmployeeDetailSchema,
  PaginatedEmployeesResponseSchema,
  PaginationQuerySchema,
  CreateProfileChangeRequestSchema,
  EmployeeLevelSchema,
  EmployeeUpdateSchema, ReviewProfileChangeRequestSchema, ProfileTargetFieldsSchema,
} from "@hr-blockbot/contracts";
import { EmployeeModel } from "../models/Employee.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { departmentIdMatch } from "../lib/department-scope.js";
import { workflowEndpoint as endpoint } from "./projects.js";
import { WorkflowError, objectId } from "../services/project-workflow.service.js";
import { hasCapability, requireCapability, employeeScopeQuery, resourceScope, AuthorizationDeniedError } from "../services/authorization-scope.service.js";
import { canActOnEmployee, employeeDepartmentScope, employeeDto, saveProfile, toProfileChangeRequest } from "../services/employee-profile.service.js";
import { employeeStatus, employeeSearch } from "../services/employee-read-model.service.js";

const router = Router();

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// V1 list/detail: queries, totals and projections share the same explicit scope.
router.get("/employees", authenticateToken, endpoint(async (req, res) => {
  const user = req.user!;
  const cap = "employees.read_operational";
  const parsed = PaginationQuerySchema.extend({ q: z.string().trim().max(50).optional(), storeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), departmentId: z.string().trim().min(1).max(200).optional(), level: EmployeeLevelSchema.optional(), status: z.enum(["active", "inactive", "UNKNOWN"]).optional() }).safeParse(req.query);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Phân trang không hợp lệ.");
  const clauses: Record<string, any>[] = [employeeScopeQuery(user, cap)];
  const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 200) : "";
  if (q) clauses.push(employeeSearch(q));
  if (parsed.data.storeId) clauses.push({ storeId: objectId(parsed.data.storeId) });
  if (req.query.status !== undefined) {
    clauses.push({ status: req.query.status === "UNKNOWN" ? { $nin: ["active", "inactive"] } : req.query.status });
  }
  if (req.query.departmentId) clauses.push({ departmentId: departmentIdMatch(String(req.query.departmentId)) });
  if (req.query.level) {
    const level = EmployeeLevelSchema.safeParse(req.query.level);
    if (!level.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cấp bậc lọc không hợp lệ.");
    clauses.push({ level: level.data });
  }
  const { page, limit } = parsed.data, query = { $and: clauses };
  const [rows, totalItems] = await Promise.all([
    EmployeeModel.find(query).select("fullName full_name employeeCode employee_code storeId level skills departmentId department status").sort({ fullName: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(),
    EmployeeModel.countDocuments(query),
  ]);
  // Store directory never exposes phone, hiring date, personal notes, workload or banking.
  const items = rows.map((row: any) => EmployeeSummarySchema.parse({ ...employeeDto(user, row), status: employeeStatus(row), activeLoad: null }));
  res.json(PaginatedEmployeesResponseSchema.parse({ items, paging: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNext: page * limit < totalItems, hasPrev: page > 1 } }));
}));
router.get("/employees/:id", authenticateToken, endpoint(async (req, res) => {
  const user = req.user!, employee: any = await EmployeeModel.findById(objectId(req.params.id)).lean();
  if (!employee) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ.");
  if (user.employeeId === String(employee._id)) requireCapability(user, "profile.read_self", { employeeId: user.employeeId });
  else {
    const cap = "employees.read_operational";
    const found = await EmployeeModel.exists({ $and: [{ _id: employee._id }, employeeScopeQuery(user, cap)] });
    if (!found) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ trong phạm vi.");
  }
  res.json(employeeDto(user, employee));
}));
router.get("/directory", authenticateToken, endpoint(async (req, res) => {
  const scope = employeeScopeQuery(req.user!, "directory.read_store");
  const { page, limit, q } = PaginationQuerySchema.extend({ q: z.string().trim().max(100).optional() }).parse(req.query);
  const query = { $and: [scope, { status: "active" }, ...(q ? [employeeSearch(q)] : [])] };
  const [rows, totalItems] = await Promise.all([EmployeeModel.find(query).select("fullName full_name employeeCode employee_code job_title storeId").sort({ fullName: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), EmployeeModel.countDocuments(query)]);
  res.json({ items: rows.map((row: any) => ({ employeeId: String(row._id), employeeCode: row.employeeCode || row.employee_code || "", fullName: row.fullName || row.full_name || "", jobTitle: row.job_title ?? null, storeId: String(row.storeId) })),
    paging: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNext: page * limit < totalItems, hasPrev: page > 1 } });
}));

// --- Profile change requests (P1-8) -------------------------------------------
// The Employee model, the contracts and the web client already spoke this contract;
// only the routes were missing, so the profile screen called a 404. Requests are
// embedded in the employee document on purpose (ADR-018: no new collection).

router.patch("/employees/:id", authenticateToken, endpoint(async (req, res) => {
  const parsed = EmployeeUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Thông tin thường hoặc phiên bản hồ sơ không hợp lệ.");
  const employee: any = await EmployeeModel.findById(objectId(req.params.id)).lean();
  if (!employee) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ.");
  if (String(employee._id) === req.user!.employeeId) requireCapability(req.user!, "profile.update_self_basic", { employeeId: req.user!.employeeId });
  else requireCapability(req.user!, "employees.update_other", resourceScope(req.user!, { ...employee, employeeId: employee._id }));
  const { expectedVersion, clientMessageId, ...changes } = parsed.data;
  if (!Object.keys(changes).length) throw new WorkflowError(400, "VALIDATION_FAILED", "Chưa có thông tin thường cần thay đổi.");
  if (expectedVersion !== (employee.profileRevision ?? 0)) throw new WorkflowError(409, "PROFILE_VERSION_CONFLICT", "Hồ sơ đã đổi. Tải lại trước khi lưu; giữ bản nháp để đối chiếu.");
  const updated = await saveProfile(employee, req.user!, changes, "PROFILE_EDITED", "Cập nhật thông tin thường");
  res.json(employeeDto(req.user!, updated.toObject()));
}));

// POST /api/employees/:id/change-requests - employee asks to change level/hiredAt/jobTitle
router.post("/employees/:id/change-requests", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const parsed = CreateProfileChangeRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid change request", details: parsed.error.flatten() },
    });
    return;
  }
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid employee ID format" } });
    return;
  }

  try {
    const employee: any = await EmployeeModel.findById(id).lean();
    if (!employee) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Employee not found" } });
      return;
    }
    if (!canActOnEmployee(user, employee)) {
      // 404, not 403: do not confirm that an out-of-scope employee exists.
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Employee not found" } });
      return;
    }
    if (String(employee._id) === user.employeeId) requireCapability(user, "profile.request_self", { employeeId: user.employeeId });
    else requireCapability(user, "employees.update_other", resourceScope(user, { ...employee, employeeId: employee._id }));

    const previousRequests = employee.profileChangeRequests ?? [];
    if (parsed.data.clientMessageId) {
      const duplicate = previousRequests.find((item: any) => item.clientMessageId === parsed.data.clientMessageId && item.requestedBy === String(user.employeeId || user.userId));
      if (duplicate) { res.status(200).json(toProfileChangeRequest(duplicate)); return; }
    }
    if (previousRequests.some((item: any) => item.status === "PENDING")) throw new WorkflowError(409, "PROFILE_REQUEST_PENDING", "Hồ sơ đã có yêu cầu chờ duyệt.");
    if (previousRequests.length >= 100) throw new WorkflowError(409, "PROFILE_STORAGE_LIMIT", "Đã đạt giới hạn 100 yêu cầu; không xóa lịch sử tự động.");
    if (parsed.data.previousRequestId && !previousRequests.some((item: any) => String(item.id ?? item._id) === parsed.data.previousRequestId && item.status === "REJECTED" && item.requestedBy === String(user.employeeId || user.userId))) {
      throw new WorkflowError(400, "VALIDATION_FAILED", "Chỉ gửi lại từ yêu cầu đã bị từ chối của chính bạn.");
    }
    const previousSnapshot = {
      level: employee.level,
      hiredAt: employee.hiredAt,
      jobTitle: employee.job_title ?? employee.jobTitle,
    };
    const request = {
      id: new mongoose.Types.ObjectId().toString(),
      clientMessageId: parsed.data.clientMessageId,
      requestedBy: String(user.employeeId || user.userId),
      requestedAt: new Date(),
      status: "PENDING" as const,
      targetFields: parsed.data.targetFields,
      previousSnapshot,
      previousRequestId: parsed.data.previousRequestId,
    };

    await saveProfile(employee, user, { profileChangeRequests: [...previousRequests, request] }, "PROFILE_CHANGE_REQUESTED", "Gửi yêu cầu thay đổi nhạy cảm");

    res.status(201).json(toProfileChangeRequest(request));
  } catch (err) {
    if (err instanceof WorkflowError || err instanceof AuthorizationDeniedError) { res.status(err.status).json({ error: { code: err.code, message: err.message } }); return; }
    console.error("[Employees] Change request error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to create change request" } });
  }
});

router.post("/employees/:id/change-requests/:requestId/review", authenticateToken, endpoint(async (req, res) => {
  const user = req.user!;
  requireCapability(user, "employees.review");
  const parsed = ReviewProfileChangeRequestSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần quyết định và lý do khi từ chối.");
  const employee: any = await EmployeeModel.findById(objectId(req.params.id)).lean();
  if (!employee) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ.");
  const request = (employee.profileChangeRequests ?? []).find((item: any) => String(item.id ?? item._id) === req.params.requestId);
  if (!request) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu.");
  requireCapability(user, "employees.review", { ...resourceScope(user, { ...employee, employeeId: employee._id }),
    requiresIndependentApproval: true, subjectEmployeeId: String(employee._id), requesterUserId: request.requestedBy,
    conflictUserIds: request.conflictUserIds ?? [] });
  if ([user.userId, user.employeeId].includes(String(request.requestedBy)) || user.employeeId === String(employee._id) || String(employee.userId) === user.userId) throw new WorkflowError(403, "SELF_APPROVAL", "Không được tự duyệt thay đổi hồ sơ của mình.");
  if (request.status !== "PENDING") throw new WorkflowError(409, "PROFILE_REQUEST_REVIEWED", "Yêu cầu đã được xử lý.");
  const approved = parsed.data.action === "APPROVE";
  if (approved && (request.targetFields?.level !== undefined || request.targetFields?.jobTitle !== undefined)) {
    throw new WorkflowError(403, "POLICY_PENDING", "Chính sách thăng chức/đổi cấp bậc chưa được phê duyệt; yêu cầu tiếp tục chờ xử lý hoặc từ chối có lý do.");
  }
  const target = ProfileTargetFieldsSchema.safeParse(toProfileChangeRequest(request).targetFields);
  if (approved && !target.success) throw new WorkflowError(409, "LEGACY_PROFILE_REQUEST_INVALID", "Yêu cầu cũ có trường ngoài phạm vi hoặc giá trị không hợp lệ; cần từ chối và gửi lại.");
  const reviewed = { ...request, status: approved ? "APPROVED" : "REJECTED", reviewedBy: user.userId, reviewedAt: new Date(), rejectionReason: approved ? null : parsed.data.reason };
  const changes: Record<string, any> = { profileChangeRequests: employee.profileChangeRequests.map((item: any) => String(item.id ?? item._id) === req.params.requestId ? reviewed : item) };
  const snapshotFilter: Record<string, any> = {};
  if (approved && target.success) for (const [field, value] of Object.entries(target.data)) {
    const storedField = field === "jobTitle" ? "job_title" : field;
    const current = field === "jobTitle" ? employee.job_title ?? employee.jobTitle : employee[storedField];
    const previous = request.previousSnapshot?.[field];
    const same = field === "hiredAt" ? (current ? new Date(current).toISOString() : null) === (previous ? new Date(previous).toISOString() : null) : (current ?? null) === (previous ?? null);
    if (!same) throw new WorkflowError(409, "PROFILE_SNAPSHOT_CONFLICT", "Thông tin gốc đã đổi từ lúc gửi yêu cầu; cần từ chối và gửi lại để đối chiếu.");
    changes[storedField] = field === "hiredAt" ? new Date(String(value)) : value;
    snapshotFilter[storedField] = employee[storedField] === undefined ? { $exists: false } : employee[storedField];
    if (field === "jobTitle" && employee.jobTitle !== undefined) {
      // Only during an explicitly approved title change, keep the imported alias
      // in sync; this is not a production-wide backfill or a role grant.
      changes.jobTitle = value;
      snapshotFilter.jobTitle = employee.jobTitle;
    }
  }
  await saveProfile(employee, user, changes, approved ? "PROFILE_CHANGE_APPROVED" : "PROFILE_CHANGE_REJECTED", parsed.data.reason || "Duyệt thay đổi hồ sơ", snapshotFilter);
  res.json(toProfileChangeRequest(reviewed));
}));

// GET /api/employees/:id/change-requests - own history (or Admin in scope)
router.get("/employees/:id/change-requests", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid employee ID format" } });
    return;
  }

  try {
    const employee: any = await EmployeeModel.findById(id).lean();
    if (!employee || !canActOnEmployee(user, employee)) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Employee not found" } });
      return;
    }
    const items = (employee.profileChangeRequests ?? []).map(toProfileChangeRequest);
    res.status(200).json({ items });
  } catch (err) {
    console.error("[Employees] Change request list error:", err instanceof Error ? err.message : "internal error");
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch change requests" } });
  }
});

// HR review queue: no role/global/department fallback.
router.get("/change-requests", authenticateToken, endpoint(async (req, res) => {
  const user = req.user!, scope = employeeScopeQuery(user, "employees.review");
  const status = req.query.status ?? "PENDING";
  if (!["PENDING", "APPROVED", "REJECTED"].includes(String(status))) throw new WorkflowError(400, "VALIDATION_FAILED", "Trạng thái không hợp lệ.");
  const paging = PaginationQuerySchema.parse(req.query);
  const employees: any[] = await EmployeeModel.find(scope).select("fullName full_name profileChangeRequests").lean();
  const all = employees.flatMap((employee) => (employee.profileChangeRequests ?? []).filter((item: any) => item.status === status)
    .map((item: any) => ({ employeeId: String(employee._id), employeeName: String(employee.fullName || employee.full_name || ""), request: toProfileChangeRequest(item) })))
    .sort((a, b) => b.request.requestedAt.localeCompare(a.request.requestedAt));
  const { page, limit } = paging;
  res.json({ items: all.slice((page - 1) * limit, page * limit), paging: { page, limit, totalItems: all.length, totalPages: Math.max(1, Math.ceil(all.length / limit)), hasNext: page * limit < all.length, hasPrev: page > 1 } });
}));

export default router;

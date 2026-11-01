import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import { z } from "zod";
import { endpoint } from "../lib/endpoint.js";
import {
  ProjectCreateSchema, ProjectUpdateSchema, ProjectAssignSchema, ProjectTransitionSchema,
  ProjectProgressSchema, PaginationQuerySchema, ProjectStatusSchema, PaginatedProjectsResponseSchema,
} from "@hr-blockbot/contracts";
import { ProjectModel, assertStateTransitionAllowed } from "../models/Project.js";
import { EmployeeModel } from "../models/Employee.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { departmentIdMatch } from "../lib/department-scope.js";
import {
  WorkflowError, projectReadScope, visibleProject, assertProjectWrite, assertProjectManagement,
  referenceMatch, objectId, projectDto, projectDtos, versionFilter, conflict, historyEntry, assertExecutionAllowed,
} from "../services/project-workflow.service.js";
import { auditedUpdate, auditEntry } from "../services/project-audit.service.js";
import { notice, managers, ownAssignment } from "../services/assignment.service.js";
import { requireCapability, resourceScope, allowedStoreIds, employeeScopeQuery, managedEmployeeIds } from "../services/authorization-scope.service.js";
import { withCrmWriter, assertEmployeeReceivesWork } from "../services/crm-writer.service.js";

const router = Router();
const filtersSchema = PaginationQuerySchema.extend({
  status: ProjectStatusSchema.optional(), overdue: z.enum(["true", "false"]).optional(),
  mine: z.enum(["true", "false"]).optional(), q: z.string().trim().max(200).optional(),
  departmentId: z.string().trim().min(1).max(200).optional(),
  storeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), assigneeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(),
  dueFrom: z.string().datetime({ offset: true }).optional(), dueTo: z.string().datetime({ offset: true }).optional(),
  assignmentView: z.enum(["AWAITING_ACCEPTANCE", "PENDING_REQUESTS", "HANDOVER"]).optional(),
});

async function validateAssignee(user: NonNullable<Express.Request["user"]>, id: string, project: any): Promise<void> {
  const employee: any = await EmployeeModel.findById(objectId(id)).lean();
  if (!employee || employee.status !== "active" || !employee.storeMappingRef || String(employee.storeId) !== String(project.storeId)) {
    throw new WorkflowError(400, "INVALID_ASSIGNEE", "Chọn nhân sự đang hoạt động thuộc đúng phòng ban của công việc.");
  }
  requireCapability(user, "projects.assign", resourceScope(user, { ...project, employeeId: employee._id }));
}

// Directory only; job titles do not grant additional system privileges.
router.get("/departments", authenticateToken, endpoint(async (req, res) => {
  const user = req.user!;
  requireCapability(user, "projects.create");
  const permitted = new Set(allowedStoreIds(user, "projects.create"));
  const ids = (user.canonical?.verifiedStores ?? []).filter((store) => permitted.has(store.id) && store.departmentId).map((store) => store.departmentId!);
  const scope: Record<string, any> = { _id: { $in: ids.flatMap((id) => [id, objectId(id)]) } };
  const rows = await mongoose.connection.collection<any>("departments").find(scope, {
    projection: { _id: 1, code: 1, name: 1, department_name: 1 },
  }).sort({ name: 1, _id: 1 }).limit(500).toArray();
  const items = new Map<string, { id: string; name: string; code: string }>();
  for (const row of rows) items.set(String(row._id), {
    id: String(row._id), name: String(row.name ?? row.department_name ?? row.code ?? row._id), code: String(row.code ?? row._id),
  });
  // Imported personnel may use department/store_raw rather than departmentId.
  // Read their existing canonical fallback; never backfill production implicitly.
  res.json({ items: [...items.values()].sort((a, b) => a.name.localeCompare(b.name, "vi")) });
}));

router.get("/projects", authenticateToken, endpoint(async (req, res) => {
  const parsed = filtersSchema.safeParse(req.query);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Bộ lọc hoặc phân trang công việc không hợp lệ.");
  const { page, limit, status, overdue, mine, q, departmentId, assignmentView } = parsed.data;
  const user = req.user!;
  const clauses: Record<string, unknown>[] = [projectReadScope(user)];
  if (parsed.data.storeId) clauses.push({ storeId: objectId(parsed.data.storeId) });
  if (parsed.data.assigneeId) clauses.push({ assigneeId: referenceMatch(parsed.data.assigneeId) });
  if (parsed.data.dueFrom && parsed.data.dueTo && Date.parse(parsed.data.dueFrom) > Date.parse(parsed.data.dueTo)) throw new WorkflowError(400, "VALIDATION_FAILED", "Khoảng hạn không hợp lệ.");
  if (parsed.data.dueFrom || parsed.data.dueTo) clauses.push({ dueDate: { ...(parsed.data.dueFrom ? { $gte: new Date(parsed.data.dueFrom) } : {}), ...(parsed.data.dueTo ? { $lte: new Date(parsed.data.dueTo) } : {}) } });
  if (status) clauses.push({ status });
  if (assignmentView === "AWAITING_ACCEPTANCE") clauses.push({ status: "ASSIGNED", $or: [{ assignmentStatus: "PENDING_ACCEPTANCE" }, { assignmentStatus: null }] });
  if (assignmentView === "PENDING_REQUESTS") clauses.push({ "assignmentRequests.status": "PENDING", status: { $ne: "COMPLETED" } });
  if (assignmentView === "HANDOVER") clauses.push({ assignmentStatus: "HANDOVER_PENDING" });
  if (departmentId) clauses.push({ departmentId: departmentIdMatch(departmentId) });
  if (mine === "true") clauses.push({ assigneeId: user.employeeId ? referenceMatch(user.employeeId) : { $in: [] } });
  if (overdue === "true") clauses.push({ dueDate: { $ne: null, $lt: new Date() }, status: { $ne: "COMPLETED" } });
  if (q) {
    const escaped = q.replace(/[.*+?^$(){}|[\]\\]/g, "\\$&");
    clauses.push({ $or: [{ title: { $regex: escaped, $options: "i" } }, { description: { $regex: escaped, $options: "i" } }] });
  }
  const query = { $and: clauses };
  const [totalItems, projects] = await Promise.all([
    ProjectModel.countDocuments(query),
    ProjectModel.find(query).select("-reports -assignmentAudit -responsibilities").sort({ createdAt: -1, _id: -1 }).skip((page - 1) * limit).limit(limit).lean(),
  ]);
  res.json(PaginatedProjectsResponseSchema.parse({
    items: await projectDtos(projects),
    paging: { page, limit, totalItems, totalPages: Math.max(1, Math.ceil(totalItems / limit)), hasNext: page * limit < totalItems, hasPrev: page > 1 },
  }));
}));

router.post("/projects", authenticateToken, endpoint(async (req, res) => withCrmWriter(async () => {
  const parsed = ProjectCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Tiêu đề, phòng ban hoặc hạn hoàn thành không hợp lệ.");
  const user = req.user!;
  const payload = parsed.data;
  if (!payload.storeId) throw new WorkflowError(400, "CANONICAL_STORE_REQUIRED", "Cần cửa hàng canonical, không suy ra từ department.");
  const store = user.canonical?.verifiedStores.find((store) => store.id === payload.storeId);
  requireCapability(user, "projects.create", resourceScope(user, { storeId: payload.storeId, storeMappingRef: "verified" }));
  if (!store?.departmentId || store.departmentId !== payload.departmentId) throw new WorkflowError(409, "STORE_DEPARTMENT_MAPPING_REQUIRED", "Đơn vị/cửa hàng chưa được đối chiếu canonical.");
  const knownDepartment = await mongoose.connection.collection<any>("departments").findOne({
    $or: [{ _id: referenceMatch(payload.departmentId) }, { code: payload.departmentId }],
  }, { projection: { _id: 1 } });
  if (!knownDepartment && !await EmployeeModel.exists({ $or: [
    { departmentId: departmentIdMatch(payload.departmentId) },
    { departmentId: { $in: [null, ""] }, department: payload.departmentId },
    { departmentId: { $in: [null, ""] }, department: { $in: [null, ""] }, store_raw: payload.departmentId },
  ] })) {
    throw new WorkflowError(400, "INVALID_DEPARTMENT", "Chọn phòng ban có trong danh mục.");
  }
  if (payload.assigneeId) await validateAssignee(user, payload.assigneeId, { storeId: payload.storeId, storeMappingRef: "verified" });
  if (payload.assigneeId) await assertEmployeeReceivesWork(payload.assigneeId, payload.storeId);
  const project = new ProjectModel({
    ...payload, storeMappingRef: "authorization-v1:create", dueDate: payload.dueDate ? new Date(payload.dueDate) : null, assigneeId: payload.assigneeId ?? null,
    createdBy: user.employeeId || user.userId, status: "DRAFT", progress: 0, version: 1, auditRequired: true,
    statusHistory: [{ from: null, to: "DRAFT", changedBy: user.employeeId || user.userId, changedAt: new Date(), reason: "Tạo công việc" }],
  });
  project.assignmentAudit = [auditEntry({}, project.toObject(), user, "CREATED", "Tạo công việc")];
  await project.save();
  res.status(201).json({ id: String(project._id), status: project.status, version: project.version });
})));

router.get("/projects/:id", authenticateToken, endpoint(async (req, res) => {
  res.json((await projectDtos([await visibleProject(req.user!, req.params.id)]))[0]);
}));
router.get("/projects/:id/eligible-assignees", authenticateToken, endpoint(async (req, res) => {
  const user = req.user!, project = await visibleProject(user, req.params.id);
  assertProjectManagement(user, project, "projects.assign");
  const { page, limit } = PaginationQuerySchema.parse(req.query);
  const q = typeof req.query.q === "string" ? req.query.q.slice(0, 100).replace(/[.*+?^${}()|[\]\\]/g, "\\$&") : "";
  const query = { $and: [employeeScopeQuery(user, "projects.assign"), { status: "active", storeId: project.storeId,
    _id: { $in: managedEmployeeIds(user, String(project.storeId), "projects.assign").map(objectId) } }, ...(q ? [{ $or: [{ fullName: { $regex: q, $options: "i" } }, { full_name: { $regex: q, $options: "i" } }] }] : [])] };
  const [rows, total] = await Promise.all([EmployeeModel.find(query).select("fullName full_name skills level").sort({ fullName: 1, _id: 1 }).skip((page - 1) * limit).limit(limit).lean(), EmployeeModel.countDocuments(query)]);
  res.json({ items: rows.map((row: any) => ({ employeeId: String(row._id), fullName: row.fullName || row.full_name || "", level: row.level ?? "Junior", skills: row.skills ?? [], status: "active", department: String(project.departmentId) })), paging: { page, limit, totalItems: total, totalPages: Math.max(1, Math.ceil(total / limit)), hasNext: page * limit < total, hasPrev: page > 1 } });
}));

router.patch("/projects/:id", authenticateToken, endpoint(async (req, res) => {
  const parsed = ProjectUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Thông tin cập nhật không hợp lệ.");
  const project = await visibleProject(req.user!, req.params.id);
  assertProjectManagement(req.user!, project, "projects.create");
  if (!["DRAFT", "ASSIGNED", "IN_PROGRESS"].includes(project.status)) throw new WorkflowError(409, "PROJECT_READ_ONLY", "Công việc đang nghiệm thu hoặc đã hoàn thành không được sửa.");
  if (project.assignmentStatus === "HANDOVER_PENDING") throw new WorkflowError(409, "ASSIGNMENT_STATE_CONFLICT", "Đang chờ hai bên xác nhận bàn giao; cần quản lý hủy phương án trước khi sửa nội dung nhiệm vụ.");
  const { expectedVersion, ...changes } = parsed.data;
  if (!Object.keys(changes).length) throw new WorkflowError(400, "VALIDATION_FAILED", "Chưa có thông tin thay đổi.");
  const updated = await auditedUpdate(project, req.user!, expectedVersion, "WORK_EDITED", "Cập nhật thông tin công việc", {
    $set: { ...changes, ...(changes.dueDate !== undefined ? { dueDate: changes.dueDate ? new Date(changes.dueDate) : null } : {}) },
    $push: { statusHistory: historyEntry(req.user!, project.status, project.status, "Cập nhật thông tin công việc") },
  }, { changes });
  if (!updated) conflict();
  res.json(projectDto(updated.toObject()));
}));

router.post("/projects/:id/assign", authenticateToken, endpoint(async (req, res) => {
  const parsed = ProjectAssignSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Thông tin giao việc không hợp lệ.");
  const user = req.user!;
  const project = await visibleProject(user, req.params.id);
  assertProjectManagement(user, project, "projects.assign");
  assertStateTransitionAllowed(project.status, "ASSIGNED");
  await validateAssignee(user, parsed.data.assigneeId, project);
  const updated = await auditedUpdate(project, user, parsed.data.expectedVersion, "ASSIGNMENT_OFFERED", "Giao nhiệm vụ, chờ nhân viên tiếp nhận", {
    $set: { status: "ASSIGNED", assigneeId: parsed.data.assigneeId, assignmentStatus: "PENDING_ACCEPTANCE",
      assignmentRound: (project.assignmentRound ?? 0) + 1, responsibleEmployeeId: null, acceptedAt: null },
    $push: { statusHistory: historyEntry(user, project.status, "ASSIGNED", "Chờ nhân viên tiếp nhận"),
      assignmentNotices: notice(project, "Bạn có nhiệm vụ mới đang chờ tiếp nhận; chưa phát sinh trách nhiệm thực hiện.", ["employee:" + parsed.data.assigneeId]) },
  }, { assigneeId: parsed.data.assigneeId });
  if (!updated) conflict();
  res.json({ id: String(updated._id), status: updated.status, version: updated.version });
}));

router.post("/projects/:id/transition", authenticateToken, endpoint(async (req, res) => {
  const parsed = ProjectTransitionSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Trạng thái yêu cầu không hợp lệ.");
  const user = req.user!;
  const project = await visibleProject(user, req.params.id);
  assertProjectWrite(user, project);
  assertStateTransitionAllowed(project.status, parsed.data.targetStatus);
  if (project.status !== "ASSIGNED" || parsed.data.targetStatus !== "IN_PROGRESS") {
    throw new WorkflowError(409, "REPORT_WORKFLOW_REQUIRED", "Nộp hoặc duyệt báo cáo qua luồng nghiệm thu; không được bỏ qua báo cáo.");
  }
  if (!project.assigneeId) throw new WorkflowError(409, "ASSIGNEE_REQUIRED", "Cần giao nhân sự trước khi bắt đầu.");
  ownAssignment(user, project);
  assertExecutionAllowed(project, true);
  const updated = await auditedUpdate(project, user, parsed.data.expectedVersion, "STARTED", parsed.data.reason || "Bắt đầu thực hiện", {
    $set: { status: "IN_PROGRESS" },
    $push: { statusHistory: historyEntry(user, project.status, "IN_PROGRESS", parsed.data.reason || "Bắt đầu thực hiện") },
  });
  if (!updated) conflict();
  res.json({ id: String(updated._id), status: updated.status, version: updated.version });
}));

router.post("/projects/:id/progress", authenticateToken, endpoint(async (req, res) => {
  const parsed = ProjectProgressSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Tiến độ phải là số nguyên 0–100 và có phiên bản hiện tại.");
  const project = await visibleProject(req.user!, req.params.id);
  assertProjectWrite(req.user!, project);
  if (project.status !== "IN_PROGRESS") throw new WorkflowError(409, "PROJECT_READ_ONLY", "Chỉ cập nhật tiến độ khi công việc đang thực hiện.");
  assertExecutionAllowed(project);
  const updated = await auditedUpdate(project, req.user!, parsed.data.expectedVersion, "PROGRESS_UPDATED", "Cập nhật tiến độ " + parsed.data.progress + "%", {
    $set: { progress: parsed.data.progress },
    $push: { statusHistory: historyEntry(req.user!, project.status, project.status, "Cập nhật tiến độ " + parsed.data.progress + "%") },
  }, { progress: parsed.data.progress });
  if (!updated) conflict();
  res.json({ id: String(updated._id), progress: updated.progress, version: updated.version });
}));

export default router;

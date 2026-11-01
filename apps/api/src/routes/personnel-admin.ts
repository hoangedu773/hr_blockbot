import { Router } from "express";
import mongoose from "mongoose";
import { EmployeeCreateSchema, DepartmentCreateSchema, DepartmentUpdateSchema, DepartmentSchema, EmployeeManagementSchema, PaginationQuerySchema } from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { EmployeeModel } from "../models/Employee.js";
import { DepartmentModel } from "../models/Department.js";
import { workflowEndpoint as endpoint } from "./projects.js";
import { WorkflowError, assertDepartmentWrite, referenceMatch, objectId } from "../services/project-workflow.service.js";
import { employeeDepartment, employeeDepartmentScope, employeeDto, canActOnEmployee } from "../services/employee-profile.service.js";
import { requireCapability, resourceScope } from "../services/authorization-scope.service.js";
import { createOnboarding, onboardingDto } from "../services/onboarding.service.js";

const router = Router();
router.use(["/employees", "/departments"], authenticateToken);
const duplicate = (error: any) => error?.code === 11000;
function globalOnly(user: NonNullable<Express.Request["user"]>) {
  requireCapability(user, "departments.configure");
}
function departmentDto(row: any) {
  const manager = Object.prototype.hasOwnProperty.call(row, "managerId") ? row.managerId : row.headEmployeeId;
  return DepartmentSchema.parse({ id: String(row._id), code: String(row.code ?? row._id), name: String(row.name ?? row.department_name ?? row.code ?? row._id),
    description: row.description ?? "", managerId: manager == null ? null : String(manager), version: row.version ?? 1 });
}
async function indexReady(model: typeof EmployeeModel, name: string) {
  await model.init();
  const indexes = await model.collection.indexes();
  if (!indexes.some((index: any) => index.name === name && index.unique)) throw new WorkflowError(503, "PERSONNEL_WRITE_NOT_READY", "Chưa có unique index bảo vệ tạo mới. Cần triển khai index được phê duyệt trước khi ghi.");
}
async function managerInUnit(id: string, unit: string) {
  const employee: any = await EmployeeModel.findById(id).lean();
  if (!employee || employee.status === "inactive" || employeeDepartment(employee) !== unit) throw new WorkflowError(400, "INVALID_DEPARTMENT_MANAGER", "Người phụ trách phải đang hoạt động trong đúng phòng ban; chức danh không cấp thêm quyền đăng nhập.");
}

router.get("/employees/:id/management", endpoint(async (req, res) => {
  const user = req.user!;
  const employee: any = await EmployeeModel.findById(objectId(req.params.id)).lean();
  if (!employee || !canActOnEmployee(user, employee)) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ trong phạm vi quản trị.");
  requireCapability(user, "employees.read_hr", resourceScope(user, { ...employee, employeeId: employee._id }));
  // Deliberate management surface, not the generic summary consumed by matching.
  const ownShape = employeeDto({ ...user, employeeId: String(employee._id) }, employee);
  res.json(EmployeeManagementSchema.parse({ ...ownShape, jobTitle: employee.job_title ?? employee.jobTitle ?? null }));
}));
router.get("/employees/:id/profile-history", endpoint(async (req, res) => {
  const user = req.user!, employee: any = await EmployeeModel.findById(objectId(req.params.id)).lean();
  if (!employee || !canActOnEmployee(user, employee)) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ trong phạm vi HR.");
  requireCapability(user, "employees.read_hr", resourceScope(user, { ...employee, employeeId: employee._id }));
  const { page, limit } = PaginationQuerySchema.parse(req.query);
  const fields = new Set(["fullName", "phone", "skills", "hiredAt"]);
  const safe = (snapshot: any) => Object.fromEntries(Object.entries(snapshot ?? {}).filter(([key, value]) => fields.has(key) && (key === "skills" ? Array.isArray(value) && value.length <= 30 && value.every((item) => typeof item === "string" && item.length <= 100) : key === "hiredAt" ? (typeof value === "string" || value instanceof Date) && Number.isFinite(new Date(value as any).getTime()) : typeof value === "string" && value.length <= (key === "phone" ? 30 : 200))).map(([key, value]) => [key, key === "hiredAt" ? new Date(value as any).toISOString() : value]));
  const all = (employee.profileHistory ?? []).filter((event: any) => ["PROFILE_EDITED", "PROFILE_CHANGE_REQUESTED", "PROFILE_CHANGE_APPROVED", "PROFILE_CHANGE_REJECTED"].includes(event.type)).map((event: any) => ({ id: String(event.id ?? ""), type: event.type, actorId: String(event.actorId ?? ""), at: event.at, reason: String(event.reason ?? "").slice(0, 2000), before: safe(event.before), after: safe(event.after) })).reverse();
  res.json({ items: all.slice((page - 1) * limit, page * limit), paging: { page, limit, totalItems: all.length, totalPages: Math.max(1, Math.ceil(all.length / limit)), hasNext: page * limit < all.length, hasPrev: page > 1 }, integrity: "APPEND_ONLY_APPLICATION_HISTORY_NOT_BLOCKCHAIN" });
}));

router.post("/employees", endpoint(async (req, res) => {
  requireCapability(req.user!, "employees.create");
  res.status(201).json(onboardingDto(await createOnboarding(req.user!, req.body, true)));
}));

router.post("/departments", endpoint(async (req, res) => {
  const user = req.user!; globalOnly(user);
  const parsed = DepartmentCreateSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Mã, tên hoặc thông tin phòng ban không hợp lệ.");
  const values = parsed.data;
  if (await DepartmentModel.exists({ $or: [{ code: values.code }, { _id: referenceMatch(values.code) }, { creationKey: values.code }] })) throw new WorkflowError(409, "DUPLICATE_KEY", "Mã phòng ban đã tồn tại.");
  if (await EmployeeModel.exists(employeeDepartmentScope(values.code))) throw new WorkflowError(409, "DEPARTMENT_MAPPING_REQUIRED", "Mã đang là đơn vị legacy. Cần nhóm chốt mapping trước khi tạo bản ghi phòng ban; không tự chuyển hồ sơ cũ.");
  const id = new mongoose.Types.ObjectId();
  if (values.managerId) await managerInUnit(values.managerId, String(id));
  await indexReady(DepartmentModel, "f1_department_creation_key");
  try {
    const department = await DepartmentModel.create({ _id: id, ...values, creationKey: values.code, version: 1,
      history: [{ actorId: user.userId, at: new Date(), reason: "Tạo phòng ban", before: null, after: values }] });
    res.status(201).json(departmentDto(department.toObject()));
  } catch (error) { if (duplicate(error)) throw new WorkflowError(409, "DUPLICATE_KEY", "Mã phòng ban vừa được tạo bởi thao tác khác."); throw error; }
}));

router.get("/departments/:id", endpoint(async (req, res) => {
  assertDepartmentWrite(req.user!, req.params.id);
  const row: any = await DepartmentModel.findOne({ _id: referenceMatch(req.params.id) }).lean();
  if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Chưa có hồ sơ phòng ban cho đơn vị này; không tự chuyển đổi alias legacy.");
  res.json(departmentDto(row));
}));

router.patch("/departments/:id", endpoint(async (req, res) => {
  const user = req.user!; assertDepartmentWrite(user, req.params.id);
  const parsed = DepartmentUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Chỉ sửa tên, mô tả, người phụ trách và cần phiên bản hiện tại. Mã/đơn vị không thay đổi tại đây.");
  const row: any = await DepartmentModel.findOne({ _id: referenceMatch(req.params.id) }).lean();
  if (!row) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy hồ sơ phòng ban; alias legacy chưa được tự chuyển đổi.");
  const { expectedVersion, ...changes } = parsed.data;
  if (!Object.keys(changes).length) throw new WorkflowError(400, "VALIDATION_FAILED", "Chưa có thay đổi.");
  if (expectedVersion !== (row.version ?? 1)) throw new WorkflowError(409, "DEPARTMENT_VERSION_CONFLICT", "Phòng ban đã thay đổi. Tải lại và đối chiếu bản nháp.");
  if (changes.managerId) await managerInUnit(changes.managerId, String(row._id));
  const history = { actorId: user.userId, at: new Date(), reason: "Sửa thông tin phòng ban", before: departmentDto(row), after: changes };
  const after = { ...row, ...changes, version: expectedVersion + 1, history: [...(row.history ?? []), history] };
  if ((row.history?.length ?? 0) >= 1000 || mongoose.mongo.BSON.calculateObjectSize(after) > 8 * 1024 * 1024) throw new WorkflowError(409, "DEPARTMENT_STORAGE_LIMIT", "Phòng ban đạt giới hạn lịch sử; cần lưu trữ, không xóa tự động.");
  const updated: any = await DepartmentModel.findOneAndUpdate({ _id: row._id, version: row.version === undefined ? { $exists: false } : expectedVersion },
    { $set: { ...changes, version: expectedVersion + 1 }, $push: { history } }, { new: true, runValidators: true }).lean();
  if (!updated) throw new WorkflowError(409, "DEPARTMENT_VERSION_CONFLICT", "Phòng ban đã thay đổi. Tải lại và đối chiếu bản nháp.");
  res.json(departmentDto(updated));
}));

export default router;

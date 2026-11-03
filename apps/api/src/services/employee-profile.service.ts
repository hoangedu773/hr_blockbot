import mongoose from "mongoose";
import { EmployeeDetailSchema, EmployeeSummarySchema } from "@hr-blockbot/contracts";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { EmployeeModel } from "../models/Employee.js";
import { departmentIdMatch } from "../lib/department-scope.js";
import { WorkflowError } from "./project-workflow.service.js";
import { requireCapability, resourceScope } from "./authorization-scope.service.js";
import { withCrmWriter } from "./crm-writer.service.js";
import { employeeStatus } from "./employee-read-model.service.js";

export const employeeDepartment = (employee: any): string => String(employee.departmentId || employee.department || employee.store_raw || "").trim();
export function employeeDepartmentScope(department: string): Record<string, any> {
  return { $or: [
    { departmentId: departmentIdMatch(department) },
    { departmentId: { $in: [null, ""] }, department },
    { departmentId: { $in: [null, ""] }, department: { $in: [null, ""] }, store_raw: department },
  ] };
}
export function canActOnEmployee(user: AuthenticatedUser, employee: any): boolean {
  try {
    if (user.employeeId === String(employee._id)) requireCapability(user, "profile.read_self", { employeeId: user.employeeId });
    else requireCapability(user, "employees.read_hr", resourceScope(user, { ...employee, employeeId: employee._id }));
    return true;
  } catch { return false; }
}
export function employeeDto(user: AuthenticatedUser, employee: any) {
  const summary = {
    employeeId: String(employee._id), fullName: employee.fullName || employee.full_name || "", level: employee.level || "Junior",
    jobTitle: typeof employee.job_title === "string" && employee.job_title.trim() ? employee.job_title.trim() : null,
    employeeCode: employee.employeeCode || employee.employee_code || "", storeId: employee.storeId ? String(employee.storeId) : null,
    storeName: user.canonical?.verifiedStores.find((store) => store.id === String(employee.storeId))?.name ?? null,
    department: employeeDepartment(employee), skills: employee.skills ?? [], activeLoad: employee.activeLoad ?? null,
    status: employeeStatus(employee),
  };
  if (user.employeeId !== String(employee._id)) return EmployeeSummarySchema.parse(summary);
  return EmployeeDetailSchema.parse({ ...summary, profileVersion: employee.profileRevision ?? 0,
    employeeCode: employee.employeeCode || employee.employee_code || "", departmentId: summary.department,
    phone: employee.phone ?? null, hiredAt: employee.hiredAt ? new Date(employee.hiredAt).toISOString() : employee.hire_date || null });
}
export function toProfileChangeRequest(raw: any) {
  return { id: String(raw.id ?? raw._id), requestedBy: String(raw.requestedBy), requestedAt: new Date(raw.requestedAt).toISOString(),
    status: raw.status, targetFields: { ...raw.targetFields, ...(raw.targetFields?.hiredAt ? { hiredAt: new Date(raw.targetFields.hiredAt).toISOString() } : {}) },
    previousSnapshot: raw.previousSnapshot ?? {}, reviewedBy: raw.reviewedBy ?? null, reviewedAt: raw.reviewedAt ? new Date(raw.reviewedAt).toISOString() : null,
    rejectionReason: raw.rejectionReason ?? null, previousRequestId: raw.previousRequestId ?? null };
}
export async function saveProfile(employee: any, user: AuthenticatedUser, changes: Record<string, any>, type: string, reason: string, extraFilter = {}) {
  return withCrmWriter(async () => {
  const current: any = await EmployeeModel.findById(employee._id).lean();
  if (current?.lifecyclePendingRequestId || current?.provisioningRequestId && !await mongoose.connection.collection("onboarding_requests").findOne({ _id: current.provisioningRequestId, status: "ACTIVE" })) throw new WorkflowError(409, "CRM_EMPLOYEE_FENCED", "Hồ sơ đang áp dụng lifecycle/kích hoạt; giữ bản nhập và đợi workflow hoàn tất.");
  const revision = employee.profileRevision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) throw new WorkflowError(409, "PROFILE_VERSION_CONFLICT", "Phiên bản hồ sơ không hợp lệ.");
  if ((employee.profileHistory?.length ?? 0) >= 1000) throw new WorkflowError(409, "PROFILE_STORAGE_LIMIT", "Hồ sơ đạt giới hạn lịch sử; cần lưu trữ trước khi tiếp tục.");
  const history = { id: new mongoose.Types.ObjectId().toString(), actorId: user.userId, at: new Date(), type, reason,
    before: Object.fromEntries(Object.keys(changes).filter((key) => key !== "profileChangeRequests").map((key) => [key, employee[key] ?? null])),
    after: Object.fromEntries(Object.entries(changes).filter(([key]) => key !== "profileChangeRequests")) };
  const after = { ...employee, ...changes, profileRevision: revision + 1, profileHistory: [...(employee.profileHistory ?? []), history] };
  if (mongoose.mongo.BSON.calculateObjectSize(after) > 8 * 1024 * 1024) throw new WorkflowError(409, "PROFILE_STORAGE_LIMIT", "Hồ sơ đạt ngưỡng lưu trữ; không xóa lịch sử tự động.");
  const updated = await EmployeeModel.findOneAndUpdate({ _id: employee._id,
    storeId: employee.storeId ?? null, storeMappingRef: employee.storeMappingRef ?? null,
    lifecyclePendingRequestId: null,
    profileRevision: employee.profileRevision === undefined ? { $exists: false } : revision, ...extraFilter },
  { $set: { ...changes, profileRevision: revision + 1 }, $push: { profileHistory: history } }, { new: true, runValidators: true });
  if (!updated) throw new WorkflowError(409, "PROFILE_VERSION_CONFLICT", "Hồ sơ/yêu cầu đã thay đổi. Tải lại để đối chiếu; bản nháp không tự ghi đè.");
  return updated;
  });
}

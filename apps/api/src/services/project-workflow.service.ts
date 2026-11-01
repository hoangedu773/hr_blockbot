import mongoose from "mongoose";
import { ProjectSchema, ReportSchema } from "@hr-blockbot/contracts";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { ProjectModel } from "../models/Project.js";
import { EmployeeModel } from "../models/Employee.js";
import { UserModel } from "../models/User.js";
import { departmentIdMatch } from "../lib/department-scope.js";
import { allowedStoreIds, hasCapability, requireCapability, resourceScope, grantsFor } from "./authorization-scope.service.js";
import type { AuthorizationCapability } from "@hr-blockbot/contracts";

export class WorkflowError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

export function referenceMatch(value: string): unknown {
  return departmentIdMatch(value);
}

export function projectReadScope(user: AuthenticatedUser): Record<string, unknown> {
  const clauses: Record<string, unknown>[] = [];
  if (hasCapability(user, "projects.read_assigned") && user.employeeId) {
    clauses.push({ $or: [{ assigneeId: referenceMatch(user.employeeId) }, { "assignmentRequests.replacementId": user.employeeId },
      { "responsibilities.employeeId": user.employeeId }, { "assignmentRequests.employeeId": user.employeeId }] });
  }
  for (const storeId of allowedStoreIds(user, "projects.read_managed")) {
    const managed = user.canonical?.managedByStore[storeId] ?? [];
    const store = user.canonical!.verifiedStores.find((store) => store.id === storeId)!;
    const grants = grantsFor(user, "projects.read_managed").filter((grant) => grant.scope.storeIds.includes(storeId) || !!store.regionId && grant.scope.regionIds.includes(store.regionId));
    const eligible = managed.filter((id) => grants.some((grant) => !grant.scope.reportingEmployeeIds.length || grant.scope.reportingEmployeeIds.includes(id)));
    clauses.push({ storeId: objectId(storeId), $or: [{ assigneeId: null }, { assigneeId: { $in: eligible.flatMap((id) => [id, objectId(id)]) } }] });
  }
  // A delegated action needs its minimum resource read; this never grants personnel/directory access.
  for (const delegation of user.effectiveDelegations ?? []) {
    if (!delegation.grant.capabilities.some((capability) => ["projects.create", "projects.assign", "reports.review"].includes(capability))) continue;
    for (const [storeId, employees] of Object.entries(delegation.managedByStore)) {
      clauses.push({ storeId: objectId(storeId), $or: [{ assigneeId: null }, { assigneeId: { $in: employees.flatMap((id) => [id, objectId(id)]) } }] });
    }
  }
  if (!clauses.length) throw new WorkflowError(403, "RBAC_DENIED", "Chưa có capability/phạm vi công việc được xác minh.");
  return { $and: [{ storeId: { $in: (user.canonical?.verifiedStores ?? []).map((store) => objectId(store.id)) }, storeMappingRef: { $type: "string", $ne: "" } }, { $or: clauses }] };
}

export function assertDepartmentWrite(user: AuthenticatedUser, departmentId: string): void {
  throw new WorkflowError(403, "LEGACY_SCOPE_DISABLED", "Department/title/global không cấp quyền ghi; cần capability và scope canonical.");
}
export function assertProjectManagement(user: AuthenticatedUser, project: any, capability: AuthorizationCapability = "projects.assign") {
  requireCapability(user, capability, resourceScope(user, { ...project, employeeId: project.assigneeId }));
}

export async function visibleProject(user: AuthenticatedUser, id: string): Promise<any> {
  if (!/^[a-f0-9]{24}$/i.test(id)) throw new WorkflowError(400, "VALIDATION_FAILED", "Mã công việc không hợp lệ.");
  const project = await ProjectModel.findOne({ $and: [{ _id: id }, projectReadScope(user)] }).lean();
  if (!project) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy công việc.");
  return project;
}

export function assertProjectWrite(user: AuthenticatedUser, project: any): void {
  requireCapability(user, "projects.execute", { employeeId: user.employeeId });
  if (!user.employeeId || String(project.assigneeId ?? "") !== user.employeeId) {
    throw new WorkflowError(403, "NOT_ASSIGNEE", "Chỉ người được giao việc mới được cập nhật hoặc nộp báo cáo.");
  }
}

export function assignmentPhase(project: any): string | null {
  return project.assignmentStatus || (project.status === "ASSIGNED" ? "PENDING_ACCEPTANCE" : ["IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"].includes(project.status) && project.assigneeId ? "ACCEPTED" : null);
}
export function assertExecutionAllowed(project: any, submittingReport = false): void {
  if (assignmentPhase(project) !== "ACCEPTED") throw new WorkflowError(409, "ASSIGNMENT_NOT_ACCEPTED", "Nhiệm vụ chưa được tiếp nhận hoặc đang chờ xác nhận bàn giao.");
  if (submittingReport && (project.assignmentRequests ?? []).some((item: any) => ["PENDING", "HANDOVER_PENDING"].includes(item.status))) {
    throw new WorkflowError(409, "ASSIGNMENT_REQUEST_PENDING", "Cần xử lý yêu cầu đổi/chuyển giao trước khi nộp nghiệm thu.");
  }
}

export function projectDto(project: any) {
  return ProjectSchema.parse({
    id: String(project._id), title: project.title, description: project.description ?? "",
    requiredSkills: project.requiredSkills ?? [],
    departmentId: String(project.departmentId ?? ""), createdBy: String(project.createdBy ?? ""),
    storeId: project.storeId ? String(project.storeId) : null,
    assigneeId: project.assigneeId ? String(project.assigneeId) : null,
    assigneeName: project.assigneeName ?? null,
    actorNames: project.actorNames ?? {},
    status: project.status, progress: project.progress ?? 0, version: project.version ?? 1,
    dueDate: project.dueDate ? new Date(project.dueDate).toISOString() : null,
    statusHistory: (project.statusHistory ?? []).map((entry: any) => ({
      ...entry, from: entry.from ?? null, changedBy: String(entry.changedBy), changedAt: new Date(entry.changedAt).toISOString(),
    })),
    assignmentStatus: assignmentPhase(project), assignmentRound: project.assignmentRound ?? 0, acceptedAt: project.acceptedAt ?? null,
    responsibleEmployeeId: ["PENDING_ACCEPTANCE", "MANAGER_REVIEW"].includes(assignmentPhase(project) ?? "") ? null : project.responsibleEmployeeId || (project.status !== "ASSIGNED" ? String(project.assigneeId ?? "") || null : null),
    assignmentRequests: project.assignmentRequests ?? [], responsibilities: project.responsibilities ?? [], assignmentAudit: project.assignmentAudit ?? [],
  });
}

/** Enrich already-authorized work only; never expose full personnel records. */
export async function projectDtos(projects: any[]) {
  const idsFor = (project: any): string[] => [String(project.assigneeId ?? ""),
    ...(project.assignmentRequests ?? []).flatMap((request: any) => [request.employeeId, request.requestedBy, request.reviewedBy, request.replacementId, ...(request.comments ?? []).map((comment: any) => comment.actorId)]),
    ...(project.responsibilities ?? []).map((interval: any) => interval.employeeId),
    ...(project.assignmentAudit ?? []).map((event: any) => event.actorId),
  ].filter((id) => typeof id === "string" && /^[a-f0-9]{24}$/i.test(id));
  const ids = [...new Set<string>(projects.flatMap(idsFor))];
  const users: any[] = ids.length ? await UserModel.find({ _id: { $in: ids } }).select("username employeeId").lean() : [];
  const employeeIds = [...ids, ...users.filter((user) => user.employeeId).map((user) => String(user.employeeId))];
  const employees = employeeIds.length ? await EmployeeModel.find({ _id: { $in: employeeIds } }).select("fullName full_name").lean() : [];
  const names = new Map(employees.map((employee: any) => [String(employee._id), String(employee.fullName || employee.full_name || "")]));
  const actorNames = Object.fromEntries([...names.entries(), ...users.map((user) => [String(user._id), names.get(String(user.employeeId)) || String(user.username)])]);
  return projects.map((project) => projectDto({ ...project, assigneeName: names.get(String(project.assigneeId)) || null,
    actorNames: Object.fromEntries(idsFor(project).filter((id) => actorNames[id]).map((id) => [id, actorNames[id]])) }));
}

export function reportDto(report: any, projectId: unknown = report.projectId) {
  return ReportSchema.parse({
    id: String(report._id ?? report.id), projectId: String(projectId), submittedBy: String(report.submittedBy),
    submittedAt: new Date(report.submittedAt ?? report.createdAt).toISOString(), content: report.content,
    attachments: report.attachments ?? [], status: report.status,
    reviewedBy: report.reviewedBy ? String(report.reviewedBy) : null,
    reviewedAt: report.reviewedAt ? new Date(report.reviewedAt).toISOString() : null, reason: report.reason ?? null,
  });
}

export function versionFilter(project: any, version: number) {
  // Missing legacy versions read as 1, but must still match a missing field in
  // Mongo. Never turn an undefined version into an unguarded update or NaN.
  if (version !== (project.version ?? 1)) conflict();
  if (project.version !== undefined && (!Number.isSafeInteger(project.version) || project.version < 1)) {
    throw new WorkflowError(409, "LEGACY_DATA_REPAIR_REQUIRED", "Phiên bản dữ liệu cũ không hợp lệ; cần kiểm tra trước khi cập nhật.");
  }
  return { _id: project._id, version: project.version === undefined ? { $exists: false } : version, status: project.status,
    storeId: project.storeId ?? null, storeMappingRef: project.storeMappingRef ?? null,
    // Read receipts do not change business version/hash. If one races our BSON
    // size estimate, retry against fresh metadata instead of exceeding the bound.
    $expr: { $eq: [{ $size: { $ifNull: ["$notificationReads", []] } }, project.notificationReads?.length ?? 0] },
  };
}

export function conflict(): never {
  throw new WorkflowError(409, "PROJECT_VERSION_CONFLICT", "Dữ liệu đã thay đổi. Hãy tải lại trước khi tiếp tục.");
}

export function historyEntry(user: AuthenticatedUser, from: string, to: string, reason: string) {
  return { from, to, changedBy: user.employeeId || user.userId, changedAt: new Date(), reason };
}

export function objectId(value: string): mongoose.Types.ObjectId {
  if (!/^[a-f0-9]{24}$/i.test(value)) throw new WorkflowError(400, "VALIDATION_FAILED", "Mã đối tượng không hợp lệ.");
  return new mongoose.Types.ObjectId(value);
}

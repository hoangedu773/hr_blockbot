import { randomUUID } from "node:crypto";
import { EmployeeModel } from "../models/Employee.js";
import { UserModel } from "../models/User.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { WorkflowError, visibleProject, assertProjectManagement, objectId, historyEntry, assignmentPhase } from "./project-workflow.service.js";
import { auditedUpdate } from "./project-audit.service.js";
import { requireCapability, resourceScope, hasCapability } from "./authorization-scope.service.js";
import { resolvePrincipal, securityVersion } from "./principal.service.js";

export function effectiveAssignment(project: any): string | null {
  return assignmentPhase(project);
}
export function responsible(project: any): string | null {
  return effectiveAssignment(project) === "PENDING_ACCEPTANCE" || effectiveAssignment(project) === "MANAGER_REVIEW" ? null
    : String(project.responsibleEmployeeId || project.assigneeId || "") || null;
}
export function ownAssignment(user: AuthenticatedUser, project: any): void {
  if (!user.employeeId || String(project.assigneeId) !== user.employeeId) throw new WorkflowError(403, "NOT_ASSIGNEE", "Chỉ người được đề nghị nhận nhiệm vụ mới được phản hồi.");
}
export async function validateReplacement(id: string, project: any) {
  const employee: any = await EmployeeModel.findById(objectId(id)).lean();
  if (!employee || employee.status !== "active" || !employee.storeMappingRef || String(employee.storeId) !== String(project.storeId)) {
    throw new WorkflowError(400, "INVALID_ASSIGNEE", "Người thay thế phải đang hoạt động và thuộc đúng đơn vị.");
  }
  return employee;
}
export function notice(project: any, message: string, recipients: string[]) {
  return { id: randomUUID(), message, at: new Date().toISOString(), recipients: [...new Set(recipients)] };
}
export const managers = (project: any) => ["store-managers:" + String(project.storeId)];
export function intervals(project: any): any[] {
  if (project.responsibilities?.length) return project.responsibilities;
  const id = responsible(project);
  // Existing in-progress work has no invented acceptance timestamp.
  return id ? [{ employeeId: id, assignmentRound: project.assignmentRound ?? 0, startAt: null, endAt: null,
    progressStart: 0, progressEnd: null, legacy: true }] : [];
}
function closeInterval(project: any, at: string) {
  return intervals(project).map((item: any) => item.endAt === null ? { ...item, endAt: at, progressEnd: project.progress ?? 0 } : item);
}
function activeRequest(project: any) {
  return (project.assignmentRequests ?? []).some((item: any) => ["PENDING", "HANDOVER_PENDING"].includes(item.status));
}
function rejectState(message: string): never { throw new WorkflowError(409, "ASSIGNMENT_STATE_CONFLICT", message); }
async function save(project: any, user: AuthenticatedUser, version: number, type: string, reason: string, changes: any, recipients: string[]) {
  // Persist the full state atomically, but audit only changed requests/new comments
  // instead of recursively copying the entire conversation on every reply.
  const { assignmentRequests, ...otherChanges } = changes;
  const requestChanges = (assignmentRequests ?? []).filter((request: any) => JSON.stringify(request) !== JSON.stringify((project.assignmentRequests ?? []).find((old: any) => old.id === request.id)))
    .map((request: any) => {
      const old = (project.assignmentRequests ?? []).find((item: any) => item.id === request.id);
      const { comments, ...fields } = request;
      return { ...fields, commentsAdded: (comments ?? []).slice(old?.comments?.length ?? 0) };
    });
  const labels: Record<string, string> = { ASSIGNMENT_REJECT: "Quản lý từ chối yêu cầu", ASSIGNMENT_APPROVE: "Quản lý phê duyệt phương án thay thế", ASSIGNMENT_CANCEL_HANDOVER: "Quản lý hủy bàn giao", HANDOVER_COMPLETED: "Đã hoàn tất bàn giao", HANDOVER_DECLINED: "Người nhận từ chối bàn giao", ESCALATED: "Yêu cầu đã chuyển cấp", DISCUSSION_ADDED: "Trao đổi mới" };
  return auditedUpdate(project, user, version, type, reason, {
    $set: changes,
    $push: { statusHistory: historyEntry(user, project.status, changes.status ?? project.status, reason),
      assignmentNotices: notice(project, (labels[type] ? labels[type] + ": " : "") + reason, recipients) },
  }, { changes: otherChanges, requestChanges });
}

export async function respondToAssignment(user: AuthenticatedUser, id: string, body: { action: string; reason?: string; expectedVersion: number }) {
  const project = await visibleProject(user, id);
  requireCapability(user, "assignment.respond", { employeeId: user.employeeId });
  ownAssignment(user, project);
  if (!["ASSIGNED", "IN_PROGRESS"].includes(project.status)) rejectState("Không thể phản hồi nhiệm vụ đang nghiệm thu hoặc đã hoàn thành.");
  if (activeRequest(project)) rejectState("Đã có yêu cầu đang chờ xử lý/bàn giao.");
  const assignment = effectiveAssignment(project);
  const at = new Date().toISOString();
  if (body.action === "ACCEPT") {
    if (project.status !== "ASSIGNED" || assignment !== "PENDING_ACCEPTANCE") rejectState("Nhiệm vụ không còn chờ tiếp nhận.");
    return save(project, user, body.expectedVersion, "ACCEPTED", "Nhân viên xác nhận tiếp nhận nhiệm vụ", {
      assignmentStatus: "ACCEPTED", acceptedAt: at, responsibleEmployeeId: user.employeeId,
      responsibilities: [...intervals(project), { employeeId: user.employeeId, assignmentRound: project.assignmentRound ?? 0,
        startAt: at, endAt: null, progressStart: project.progress ?? 0, progressEnd: null }],
    }, managers(project));
  }
  if (body.action === "DECLINE" && assignment !== "PENDING_ACCEPTANCE") rejectState("Đã tiếp nhận: sử dụng yêu cầu đổi/chuyển giao thay vì từ chối ban đầu.");
  if (body.action === "REQUEST_CHANGE" && assignment !== "ACCEPTED") rejectState("Chỉ xin đổi/chuyển giao sau khi đã tiếp nhận.");
  const request = { id: randomUUID(), kind: body.action === "DECLINE" ? "DECLINE" : project.status === "IN_PROGRESS" ? "TRANSFER" : "CHANGE",
    status: "PENDING", requestedBy: user.userId, employeeId: user.employeeId, requestedAt: at, reason: body.reason!,
    assignmentRound: project.assignmentRound ?? 0, comments: [] };
  if ((project.assignmentRequests?.length ?? 0) >= 100) rejectState("Đã đạt giới hạn 100 yêu cầu; cần quy trình lưu trữ.");
  return save(project, user, body.expectedVersion, request.kind + "_REQUESTED", body.reason!, {
    assignmentRequests: [...(project.assignmentRequests ?? []), request],
    ...(request.kind === "DECLINE" ? { assignmentStatus: "MANAGER_REVIEW", responsibleEmployeeId: null } : {}),
  }, managers(project));
}

export async function reviewAssignment(user: AuthenticatedUser, id: string, requestId: string,
  body: { action: string; reason: string; expectedVersion: number; replacementId?: string; handoverNote?: string }) {
  const project = await visibleProject(user, id);
  assertProjectManagement(user, project, "assignment.review");
  const request = (project.assignmentRequests ?? []).find((item: any) => item.id === requestId);
  if (!request) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu.");
  if (request.requestedBy === user.userId || request.employeeId === user.employeeId) throw new WorkflowError(403, "SELF_APPROVAL", "Không được tự xử lý yêu cầu của chính mình.");
  if (request.kind === "ESCALATION") {
    const parent = project.assignmentRequests.find((item: any) => item.id === request.parentId);
    assertProjectManagement(user, project, "assignment.escalation_review");
    const priorReviewer = parent?.reviewedBy ? await UserModel.findById(parent.reviewedBy).select("employeeId").lean() as any : null;
    if (!priorReviewer?.employeeId || parent.reviewedBy === user.userId || !user.canonical?.managedByStore[String(project.storeId)]?.includes(String(priorReviewer.employeeId))) {
      throw new WorkflowError(403, "ESCALATION_SCOPE_DENIED", "Cần cấp quản lý độc lập có quan hệ quản lý thực tế với người đã ra quyết định.");
    }
  }
  if (request.assignmentRound !== (project.assignmentRound ?? 0)) rejectState("Yêu cầu thuộc lần phân công cũ.");
  if (body.action === "CANCEL_HANDOVER") {
    if (request.status !== "HANDOVER_PENDING") rejectState("Không có bàn giao chờ xác nhận để hủy.");
  } else if (request.status !== "PENDING") rejectState("Yêu cầu đã được xử lý.");
  if (!["ASSIGNED", "IN_PROGRESS"].includes(project.status)) rejectState("Không thay người khi đang nghiệm thu/đã hoàn thành.");
  const at = new Date().toISOString();
  const reviewed = { ...request, reviewedBy: user.userId, reviewedAt: at, decisionReason: body.reason };
  let changes: any = {};
  let recipients = ["employee:" + request.employeeId];
  if (body.action !== "APPROVE") {
    reviewed.status = body.action === "CANCEL_HANDOVER" ? "CANCELLED" : "REJECTED";
    changes.assignmentStatus = responsible(project) ? "ACCEPTED" : "PENDING_ACCEPTANCE";
    if (request.replacementId) recipients.push("employee:" + request.replacementId);
  } else {
    const replacement = await validateReplacement(body.replacementId!, project);
    requireCapability(user, "projects.assign", resourceScope(user, { ...project, employeeId: replacement._id }));
    if (body.replacementId === String(project.assigneeId)) throw new WorkflowError(400, "INVALID_ASSIGNEE", "Người thay thế phải khác người đang được giao.");
    reviewed.replacementId = body.replacementId;
    recipients.push("employee:" + body.replacementId);
    if (project.status === "IN_PROGRESS") {
      if (!body.handoverNote?.trim()) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần ghi chú bàn giao và tiến độ hiện tại.");
      reviewed.status = "HANDOVER_PENDING"; reviewed.progressSnapshot = project.progress ?? 0; reviewed.handoverNote = body.handoverNote;
      changes.assignmentStatus = "HANDOVER_PENDING";
    } else {
      reviewed.status = "REASSIGNED";
      changes = { assigneeId: body.replacementId, assignmentStatus: "PENDING_ACCEPTANCE", acceptedAt: null,
        responsibleEmployeeId: null, assignmentRound: (project.assignmentRound ?? 0) + 1, responsibilities: closeInterval(project, at) };
    }
  }
  changes.assignmentRequests = project.assignmentRequests.map((item: any) => item.id === requestId ? reviewed : item);
  return save(project, user, body.expectedVersion, "ASSIGNMENT_" + body.action, body.reason, changes, recipients);
}

export async function confirmHandover(user: AuthenticatedUser, id: string, requestId: string,
  body: { action: string; reason: string; expectedVersion: number }) {
  const project = await visibleProject(user, id);
  requireCapability(user, "assignment.handover", { employeeId: user.employeeId });
  const request = (project.assignmentRequests ?? []).find((item: any) => item.id === requestId);
  if (!request || request.status !== "HANDOVER_PENDING" || effectiveAssignment(project) !== "HANDOVER_PENDING") rejectState("Không có bàn giao đang chờ xác nhận.");
  const outgoing = user.employeeId === String(project.assigneeId);
  const incoming = user.employeeId === request.replacementId;
  if (!outgoing && !incoming) throw new WorkflowError(403, "NOT_HANDOVER_PARTY", "Chỉ hai nhân viên bàn giao mới được xác nhận.");
  if (request.assignmentRound !== (project.assignmentRound ?? 0)) rejectState("Bàn giao đã hết hiệu lực.");
  const at = new Date().toISOString();
  const next = { ...request };
  let changes: any = {};
  if (body.action === "DECLINE") {
    if (!incoming) throw new WorkflowError(403, "RBAC_DENIED", "Người giao cần trao đổi với quản lý để hủy phương án đã duyệt.");
    next.status = "CANCELLED"; next.decisionReason = body.reason;
    changes.assignmentStatus = "ACCEPTED";
  } else {
    const field = outgoing ? "outgoingConfirmedAt" : "incomingConfirmedAt";
    if (next[field]) rejectState("Bạn đã xác nhận lần bàn giao này.");
    next[field] = at;
    if (next.outgoingConfirmedAt && next.incomingConfirmedAt) {
      await validateReplacement(next.replacementId, project);
      try {
        const reviewer: any = await UserModel.findById(next.reviewedBy).select("role securityVersion").lean();
        if (!reviewer) throw new WorkflowError(409, "HANDOVER_APPROVAL_STALE", "Không còn chủ thể phê duyệt hợp lệ.");
        const current = await resolvePrincipal({ sub: String(reviewer._id), role: reviewer.role, securityVersion: securityVersion(reviewer) });
        assertProjectManagement(current, project, "assignment.review");
        requireCapability(current, "projects.assign", resourceScope(current, { ...project, employeeId: next.replacementId }));
        if (current.employeeId === next.employeeId || current.employeeId === next.replacementId || current.userId === next.requestedBy) throw new WorkflowError(409, "HANDOVER_APPROVAL_STALE", "Phê duyệt không còn độc lập.");
        if (next.kind === "ESCALATION") {
          assertProjectManagement(current, project, "assignment.escalation_review");
          const parent = project.assignmentRequests.find((entry: any) => entry.id === next.parentId);
          const previous: any = parent?.reviewedBy ? await UserModel.findById(parent.reviewedBy).select("employeeId").lean() : null;
          if (!previous?.employeeId || parent.reviewedBy === current.userId || !current.canonical?.managedByStore[String(project.storeId)]?.includes(String(previous.employeeId))) throw new WorkflowError(409, "HANDOVER_APPROVAL_STALE", "Quan hệ xử lý chuyển cấp không còn hợp lệ.");
        }
      } catch (error: any) {
        if ([401, 403, 409].includes(error?.status)) throw new WorkflowError(409, "HANDOVER_APPROVAL_STALE", "Phê duyệt giao lại đã hết hiệu lực/không còn độc lập; quản lý cần hủy và xem xét lại. Trách nhiệm chưa chuyển.");
        throw error;
      }
      next.status = "TRANSFERRED"; next.transferredAt = at;
      const round = (project.assignmentRound ?? 0) + 1;
      changes = { assigneeId: next.replacementId, responsibleEmployeeId: next.replacementId, assignmentStatus: "ACCEPTED", acceptedAt: at,
        assignmentRound: round, responsibilities: [...closeInterval(project, at), { employeeId: next.replacementId, assignmentRound: round,
          startAt: at, endAt: null, progressStart: project.progress ?? 0, progressEnd: null }] };
    }
  }
  changes.assignmentRequests = project.assignmentRequests.map((item: any) => item.id === requestId ? next : item);
  return save(project, user, body.expectedVersion, next.status === "TRANSFERRED" ? "HANDOVER_COMPLETED" : body.action === "DECLINE" ? "HANDOVER_DECLINED" : "HANDOVER_CONFIRMED",
    body.reason, changes, [...managers(project), "employee:" + String(project.assigneeId), "employee:" + next.replacementId]);
}

export async function assignmentMessage(user: AuthenticatedUser, id: string, requestId: string,
  body: { message: string; expectedVersion: number }, escalate: boolean) {
  const project = await visibleProject(user, id);
  const request = (project.assignmentRequests ?? []).find((item: any) => item.id === requestId);
  if (!request) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy yêu cầu.");
  if (user.userId !== request.requestedBy && user.employeeId !== request.replacementId) assertProjectManagement(user, project, "assignment.review");
  else requireCapability(user, "assignment.discuss", { employeeId: user.employeeId });
  let requests = project.assignmentRequests;
  if (escalate) {
    if (user.userId !== request.requestedBy || request.status !== "REJECTED") rejectState("Chỉ người yêu cầu được chuyển cấp sau khi bị từ chối.");
    if (request.assignmentRound !== (project.assignmentRound ?? 0) || !["ASSIGNED", "IN_PROGRESS"].includes(project.status)) rejectState("Lần phân công này đã kết thúc hoặc công việc không còn cho phép đổi.");
    if (activeRequest(project)) rejectState("Đang có yêu cầu chờ xử lý.");
    if (requests.length >= 100) rejectState("Đã đạt giới hạn 100 yêu cầu.");
    requests = [...requests, { id: randomUUID(), kind: "ESCALATION", parentId: request.id, status: "PENDING", requestedBy: user.userId,
      employeeId: request.employeeId, requestedAt: new Date().toISOString(), reason: body.message, assignmentRound: project.assignmentRound ?? 0, comments: [] }];
  } else {
    if ((request.comments?.length ?? 0) >= 100) rejectState("Đã đạt giới hạn 100 trao đổi trong yêu cầu.");
    const updated = { ...request, comments: [...(request.comments ?? []), { id: randomUUID(), actorId: user.userId, at: new Date().toISOString(), message: body.message }] };
    requests = requests.map((item: any) => item.id === requestId ? updated : item);
  }
  return save(project, user, body.expectedVersion, escalate ? "ESCALATED" : "DISCUSSION_ADDED", body.message, { assignmentRequests: requests },
    escalate ? managers(project) : [...managers(project), "employee:" + request.employeeId, ...(request.replacementId ? ["employee:" + request.replacementId] : [])]);
}

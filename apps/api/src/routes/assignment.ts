import { Router } from "express";
import {
  AssignmentResponseSchema, AssignmentReviewSchema, AssignmentHandoverSchema, AssignmentMessageSchema,
  PaginationQuerySchema,
} from "@hr-blockbot/contracts";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { ProjectModel } from "../models/Project.js";
import { workflowEndpoint as endpoint } from "./projects.js";
import { WorkflowError, projectReadScope, visibleProject, projectDtos, assertProjectManagement } from "../services/project-workflow.service.js";
import { allowedStoreIds, hasCapability } from "../services/authorization-scope.service.js";
import { respondToAssignment, reviewAssignment, confirmHandover, assignmentMessage, effectiveAssignment } from "../services/assignment.service.js";
import { verifyProjectAudit } from "../services/project-audit.service.js";
import { replacementCandidates } from "../services/assignment-candidates.service.js";
import { prepareDecisionAnchor, verifyDecisionAnchor } from "../services/decision-anchor.service.js";
import { z } from "zod";
import { objectId } from "../services/project-workflow.service.js";
import { DecisionAnchorModel } from "../models/DecisionAnchor.js";

const router = Router();
router.use(["/projects", "/assignment"], authenticateToken);
function parse<T>(schema: { safeParse: (value: any) => { success: boolean; data?: T } }, body: any): T {
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Thiếu lý do, lựa chọn hoặc phiên bản hiện tại.");
  return parsed.data!;
}
router.post("/projects/:id/assignment/respond", endpoint(async (req, res) => {
  const updated = await respondToAssignment(req.user!, req.params.id, parse(AssignmentResponseSchema, req.body));
  res.json((await projectDtos([updated.toObject()]))[0]);
}));
router.post("/projects/:id/assignment/requests/:requestId/review", endpoint(async (req, res) => {
  const updated = await reviewAssignment(req.user!, req.params.id, req.params.requestId, parse(AssignmentReviewSchema, req.body));
  res.json((await projectDtos([updated.toObject()]))[0]);
}));
router.post("/projects/:id/assignment/requests/:requestId/handover", endpoint(async (req, res) => {
  const updated = await confirmHandover(req.user!, req.params.id, req.params.requestId, parse(AssignmentHandoverSchema, req.body));
  res.json((await projectDtos([updated.toObject()]))[0]);
}));
for (const action of ["comments", "escalate"]) router.post(`/projects/:id/assignment/requests/:requestId/${action}`, endpoint(async (req, res) => {
  const updated = await assignmentMessage(req.user!, req.params.id, req.params.requestId, parse(AssignmentMessageSchema, req.body), action === "escalate");
  res.json((await projectDtos([updated.toObject()]))[0]);
}));
router.get("/projects/:id/assignment/candidates", endpoint(async (req, res) => {
  const project = await visibleProject(req.user!, req.params.id);
  assertProjectManagement(req.user!, project, "projects.assign");
  res.json(await replacementCandidates(project, req.user!));
}));
router.get("/projects/:id/assignment/audit", endpoint(async (req, res) => {
  const project = await visibleProject(req.user!, req.params.id);
  res.json({ valid: verifyProjectAudit(project), events: project.assignmentAudit ?? [],
    warning: "Hash-chain cục bộ chỉ phát hiện sửa đổi, không tương đương xác thực Blockchain. Cần đối chiếu checkpoint đã ghi smart contract." });
}));
router.get("/projects/:id/assignment/proofs", endpoint(async (req, res) => {
  const project = await visibleProject(req.user!, req.params.id);
  const proofs: any[] = await DecisionAnchorModel.find({ projectId: String(project._id) }).select("-_id -__v").lean();
  const items = proofs.map((proof) => ({ ...proof, matchesCurrentEvent: (project.assignmentAudit ?? []).some((event: any) => event.id === proof.eventId && event.hash === proof.decisionHash) }));
  res.json({ auditValid: verifyProjectAudit(project), items, configured: !!(process.env.ASSIGNMENT_CHAIN_RPC_URL && process.env.ASSIGNMENT_CHAIN_ID && process.env.ASSIGNMENT_REGISTRY_ADDRESS),
    warning: "Trạng thái lưu là kết quả kiểm tra lần trước; dùng Xác minh để đọc lại chuỗi và phát hiện reorg/thay đổi lịch sử." });
}));
router.post("/projects/:id/assignment/audit/:eventId/prepare", endpoint(async (req, res) => {
  const project = await visibleProject(req.user!, req.params.id);
  assertProjectManagement(req.user!, project, "projects.assign");
  res.json(await prepareDecisionAnchor(project, req.params.eventId));
}));
router.post("/projects/:id/assignment/audit/:eventId/verify", endpoint(async (req, res) => {
  const project = await visibleProject(req.user!, req.params.id);
  if (typeof req.body.transactionHash !== "string") throw new WorkflowError(400, "VALIDATION_FAILED", "Cần mã giao dịch.");
  res.json(await verifyDecisionAnchor(project, req.params.eventId, req.body.transactionHash));
}));
router.get("/assignment/summary", endpoint(async (req, res) => {
  const filters = z.object({ storeId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), createdFrom: z.string().datetime({ offset: true }).optional(), createdTo: z.string().datetime({ offset: true }).optional() }).parse(req.query);
  if (filters.createdFrom && filters.createdTo && Date.parse(filters.createdFrom) > Date.parse(filters.createdTo)) throw new WorkflowError(400, "VALIDATION_FAILED", "Khoảng ngày tạo không hợp lệ.");
  const clauses: any[] = [projectReadScope(req.user!)];
  if (filters.storeId) clauses.push({ storeId: objectId(filters.storeId) });
  if (filters.createdFrom || filters.createdTo) clauses.push({ createdAt: { ...(filters.createdFrom ? { $gte: new Date(filters.createdFrom) } : {}), ...(filters.createdTo ? { $lte: new Date(filters.createdTo) } : {}) } });
  const projects: any[] = await ProjectModel.find({ $and: clauses }).select("status assignmentStatus assignmentRequests dueDate").lean();
  const open = projects.filter((project) => project.status !== "COMPLETED");
  res.json({ total: projects.length, completed: projects.filter((project) => project.status === "COMPLETED").length, pendingReview: projects.filter((project) => project.status === "PENDING_REVIEW").length,
    periodBasis: "createdAt", generatedAt: new Date().toISOString(), awaitingAcceptance: open.filter((project) => effectiveAssignment(project) === "PENDING_ACCEPTANCE").length,
    inProgress: open.filter((project) => project.status === "IN_PROGRESS").length,
    pendingRequests: open.filter((project) => (project.assignmentRequests ?? []).some((item: any) => item.status === "PENDING")).length,
    pendingHandover: open.filter((project) => effectiveAssignment(project) === "HANDOVER_PENDING").length,
    overdue: open.filter((project) => project.dueDate && new Date(project.dueDate).getTime() < Date.now()).length });
}));
function recipients(user: NonNullable<Express.Request["user"]>) {
  return [...(user.employeeId ? ["employee:" + user.employeeId] : []), ...allowedStoreIds(user, "assignment.review").map((id) => "store-managers:" + id)];
}
router.get("/assignment/notifications", endpoint(async (req, res) => {
  const { page, limit } = PaginationQuerySchema.parse(req.query);
  const allowed = recipients(req.user!);
  const projects: any[] = await ProjectModel.find({ $and: [projectReadScope(req.user!), { "assignmentNotices.recipients": { $in: allowed } }] })
    .select("title assignmentNotices notificationReads").lean();
  const items = projects.flatMap((project) => (project.assignmentNotices ?? []).filter((item: any) => item.recipients.some((to: string) => allowed.includes(to)))
    .map((item: any) => ({ id: item.id, projectId: String(project._id), projectTitle: project.title, message: item.message, at: item.at,
      read: (project.notificationReads ?? []).includes(req.user!.userId + ":" + item.id) }))).sort((a, b) => b.at.localeCompare(a.at));
  res.json({ items: items.slice((page - 1) * limit, page * limit), totalItems: items.length, unreadCount: items.filter((item) => !item.read).length,
    paging: { page, limit, totalItems: items.length, totalPages: Math.max(1, Math.ceil(items.length / limit)), hasNext: page * limit < items.length, hasPrev: page > 1 } });
}));
router.post("/assignment/notifications/:projectId/:noticeId/read", endpoint(async (req, res) => {
  const project = await visibleProject(req.user!, req.params.projectId);
  const allowed = recipients(req.user!);
  const item = (project.assignmentNotices ?? []).find((entry: any) => entry.id === req.params.noticeId && entry.recipients.some((to: string) => allowed.includes(to)));
  if (!item) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy thông báo.");
  // Read receipts are metadata, never overwrite the immutable notification/event.
  const key = req.user!.userId + ":" + item.id;
  if (!(project.notificationReads ?? []).includes(key)) {
    const saved = await ProjectModel.updateOne({ _id: project._id, "notificationReads.9999": { $exists: false },
      $expr: { $lt: [{ $bsonSize: "$$ROOT" }, 8 * 1024 * 1024 - 256] } }, { $addToSet: { notificationReads: key } });
    if (!saved.matchedCount) throw new WorkflowError(409, "PROJECT_STORAGE_LIMIT", "Đã đạt giới hạn lưu xác nhận đọc; không xóa lịch sử tự động.");
  }
  res.status(204).end();
}));
export default router;

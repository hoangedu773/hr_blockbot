import { Router } from "express";
import mongoose from "mongoose";
import { ReportSubmitSchema, ReportReviewSchema, PaginationQuerySchema, ReportStatusSchema } from "@hr-blockbot/contracts";
import { ProjectModel } from "../models/Project.js";
import { ReportModel } from "../models/Report.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { endpoint as endpoint } from "../lib/endpoint.js";
import { pagingMeta } from "../lib/paging.js";
import {
  WorkflowError, visibleProject, assertProjectWrite, assertProjectManagement, objectId,
  reportDto, referenceMatch, versionFilter, conflict, historyEntry, assertExecutionAllowed,
} from "../services/project-workflow.service.js";
import { auditedUpdate } from "../services/project-audit.service.js";
import { intervals, notice, managers } from "../services/assignment.service.js";
import { requireCapability } from "../services/authorization-scope.service.js";

const router = Router();

// Source of truth is embedded in the project. The legacy collection is a
// best-effort projection: a write failure here must not undo an acknowledged,
// already committed project/report decision.
async function projectReport(report: any, projectId: unknown, version: number): Promise<void> {
  try {
    const dto = reportDto(report, projectId);
    const { id, ...values } = dto;
    await ReportModel.updateOne({
      _id: objectId(id), $or: [{ projectVersion: { $lte: version } }, { projectVersion: { $exists: false } }],
    }, { $set: { ...values, projectVersion: version } }, { upsert: true, runValidators: true });
  } catch {
    console.error("[Reports] Compatibility projection delayed; canonical project record remains available");
  }
}

async function findReport(user: Parameters<typeof visibleProject>[0], id: string) {
  objectId(id);
  const embeddedProject: any = await ProjectModel.findOne({ "reports._id": referenceMatch(id) }).lean();
  if (embeddedProject) {
    const project = await visibleProject(user, String(embeddedProject._id));
    const report = (project.reports ?? []).find((item: any) => String(item._id) === id);
    if (!report) conflict();
    return { project, report };
  }
  const legacy: any = await ReportModel.findById(id).lean();
  if (!legacy) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy báo cáo.");
  const project = await visibleProject(user, String(legacy.projectId));
  return { project, report: legacy };
}

// Caller must identify a visible project; this prevents cross-scope enumeration.
router.get("/reports", authenticateToken, endpoint(async (req, res) => {
  if (typeof req.query.projectId !== "string") throw new WorkflowError(400, "VALIDATION_FAILED", "Cần chọn công việc để xem báo cáo.");
  const paging = PaginationQuerySchema.safeParse(req.query);
  const status = req.query.status === undefined ? undefined : ReportStatusSchema.safeParse(req.query.status);
  if (!paging.success || (status && !status.success)) throw new WorkflowError(400, "VALIDATION_FAILED", "Bộ lọc báo cáo không hợp lệ.");
  const project = await visibleProject(req.user!, req.query.projectId);
  const legacy = await ReportModel.find({ projectId: referenceMatch(String(project._id)) }).lean();
  const reports = new Map<string, ReturnType<typeof reportDto>>();
  for (const item of legacy) reports.set(String(item._id), reportDto(item, project._id));
  for (const item of project.reports ?? []) reports.set(String(item._id), reportDto(item, project._id));
  const items = [...reports.values()].filter((item) => !status?.success || item.status === status.data)
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt) || b.id.localeCompare(a.id));
  const { page, limit } = paging.data;
  res.json({
    items: items.slice((page - 1) * limit, page * limit),
    paging: pagingMeta({ page, limit, totalItems: items.length }),
  });
}));

router.post("/reports", authenticateToken, endpoint(async (req, res) => {
  const parsed = ReportSubmitSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Nội dung báo cáo, liên kết hoặc phiên bản không hợp lệ.");
  const user = req.user!;
  const project = await visibleProject(user, parsed.data.projectId);
  requireCapability(user, "reports.submit", { employeeId: user.employeeId });
  assertProjectWrite(user, project);
  if (project.status !== "IN_PROGRESS") throw new WorkflowError(409, "ILLEGAL_STATE_TRANSITION", "Chỉ nộp báo cáo khi công việc đang thực hiện.");
  assertExecutionAllowed(project, true);
  if ((project.reports?.length ?? 0) >= 100) throw new WorkflowError(409, "REPORT_LIMIT_REACHED", "Công việc đã đạt giới hạn 100 lần nộp; cần quản lý xử lý.");
  const report = {
    _id: String(new mongoose.Types.ObjectId()), projectId: String(project._id),
    submittedBy: user.employeeId || user.userId, submittedAt: new Date(), content: parsed.data.content,
    attachments: parsed.data.attachments, status: "PENDING", reviewedBy: null, reviewedAt: null, reason: null,
  };
  const updated = await auditedUpdate(project, user, parsed.data.expectedVersion, "REPORT_SUBMITTED", "Nộp báo cáo nghiệm thu", {
    $set: { status: "PENDING_REVIEW" },
    $push: {
      reports: report,
      statusHistory: historyEntry(user, project.status, "PENDING_REVIEW", "Nộp báo cáo nghiệm thu"),
      assignmentNotices: notice(project, "Có báo cáo mới chờ quản lý nghiệm thu.", managers(project)),
    },
  }, { reportId: report._id });
  if (!updated) conflict();
  await projectReport(report, project._id, updated.version);
  res.status(201).json({ reportId: report._id, projectId: String(updated._id), status: updated.status, version: updated.version });
}));

router.get("/reports/:id", authenticateToken, endpoint(async (req, res) => {
  const { project, report } = await findReport(req.user!, req.params.id);
  res.json(reportDto(report, project._id));
}));

router.post("/reports/:id/review", authenticateToken, endpoint(async (req, res) => {
  const user = req.user!;
  const parsed = ReportReviewSchema.safeParse(req.body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Cần phiên bản hiện tại và lý do khi từ chối.");
  const { project, report } = await findReport(user, req.params.id);
  assertProjectManagement(user, project, "reports.review");
  if (String(project.assigneeId) === user.employeeId) throw new WorkflowError(403, "SELF_APPROVAL", "Người thực hiện không được tự nghiệm thu.");
  if ([user.userId, user.employeeId].filter(Boolean).includes(String(report.submittedBy))) {
    throw new WorkflowError(403, "SELF_APPROVAL", "Không được tự duyệt báo cáo do chính mình nộp.");
  }
  if (project.status !== "PENDING_REVIEW" || report.status !== "PENDING") {
    throw new WorkflowError(409, "REPORT_ALREADY_REVIEWED", "Báo cáo không còn ở trạng thái chờ duyệt.");
  }
  // Legacy pending records that were bypassed in old UI cannot supersede a
  // newer canonical submission after the assignee resubmits.
  const canonicalPending = (project.reports ?? []).find((item: any) => item.status === "PENDING");
  if (canonicalPending && String(canonicalPending._id) !== req.params.id) {
    throw new WorkflowError(409, "REPORT_SUPERSEDED", "Có báo cáo mới hơn đang chờ duyệt.");
  }
  if (!canonicalPending) {
    const latest: any = await ReportModel.findOne({ projectId: referenceMatch(String(project._id)), status: "PENDING" })
      .sort({ submittedAt: -1, _id: -1 }).lean();
    if (latest && String(latest._id) !== req.params.id) throw new WorkflowError(409, "REPORT_SUPERSEDED", "Có báo cáo mới hơn đang chờ duyệt.");
  }
  const approved = parsed.data.action === "APPROVE";
  const reviewed = {
    ...report, _id: String(report._id), projectId: String(project._id), status: approved ? "APPROVED" : "REJECTED",
    reviewedBy: user.employeeId || user.userId, reviewedAt: new Date(), reason: parsed.data.reason || null,
  };
  const entries = (project.reports ?? []).filter((item: any) => String(item._id) !== req.params.id);
  if (entries.length >= 100) throw new WorkflowError(409, "REPORT_LIMIT_REACHED", "Công việc đã đạt giới hạn lịch sử báo cáo.");
  entries.push(reviewed);
  const target = approved ? "COMPLETED" : "IN_PROGRESS";
  const updated = await auditedUpdate(project, user, parsed.data.expectedVersion, approved ? "REPORT_APPROVED" : "REPORT_REJECTED", parsed.data.reason || "Duyệt nghiệm thu", {
    $set: { status: target, reports: entries, ...(approved ? { progress: 100,
      responsibilities: intervals(project).map((entry: any) => entry.endAt === null ? { ...entry, endAt: new Date().toISOString(), progressEnd: 100 } : entry) } : {}) },
    $push: { statusHistory: historyEntry(user, project.status, target, parsed.data.reason || "Duyệt nghiệm thu"),
      assignmentNotices: notice(project, (approved ? "Báo cáo đã được nghiệm thu. " : "Báo cáo cần bổ sung. ") + (parsed.data.reason || ""), ["employee:" + String(project.assigneeId)]) },
  }, { reportId: req.params.id, decision: parsed.data.action });
  if (!updated) conflict();
  await projectReport(reviewed, project._id, updated.version);
  res.json({ reportId: req.params.id, projectId: String(updated._id), projectStatus: updated.status, version: updated.version });
}));

export default router;

import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import {
  ReportSubmitSchema,
  ReportReviewSchema,
} from "@hr-blockbot/contracts";
import { ReportModel } from "../models/Report.js";
import {
  ProjectModel,
  transitionProject,
  IllegalTransitionError,
  ForbiddenTransitionError,
} from "../models/Project.js";
import { authenticateToken, AuthenticatedUser } from "../middlewares/auth.middleware.js";
import {
  assertInScope,
  ActorContext,
  ResourceTarget,
  RbacDeniedError,
} from "../services/rbac.service.js";

const router = Router();

/**
 * Scope guard for a report. A report has no department of its own, so the
 * owning project supplies it. Denials surface as 404 upstream so the caller
 * cannot probe for the existence of out-of-scope reports.
 */
async function assertReportScope(
  user: AuthenticatedUser,
  report: Record<string, any>
): Promise<void> {
  const project: any = await ProjectModel.findById(report.projectId).lean();
  if (!project) {
    throw new RbacDeniedError("Report is not attached to a project");
  }

  const actor: ActorContext = {
    userId: user.userId,
    role: user.role,
    employeeId: user.employeeId ?? null,
    departmentId: user.departmentId ?? null,
  };
  const owner = report.submittedBy ? report.submittedBy.toString() : null;
  const target: ResourceTarget = {
    employeeId: owner,
    userId: owner,
    departmentId: project.departmentId ? project.departmentId.toString() : null,
  };

  try {
    assertInScope(actor, target);
    return;
  } catch (err) {
    if (!(err instanceof RbacDeniedError)) throw err;
    // Employees also see reports of their own department, mirroring the
    // project visibility window used by the list endpoints.
    const sameDepartment =
      actor.role === "Employee" &&
      Boolean(actor.departmentId) &&
      target.departmentId === actor.departmentId;
    if (!sameDepartment) throw err;
  }
}

// POST /api/reports - Nộp báo cáo nghiệm thu (chuyển Project sang PENDING_REVIEW)
router.post("/reports", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const parsed = ReportSubmitSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid report payload", details: parsed.error.format() },
    });
    return;
  }

  try {
    const project: any = await ProjectModel.findById(parsed.data.projectId);
    if (!project) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Project not found" } });
      return;
    }

    if (user.role === "Employee" && project.assigneeId?.toString() !== user.employeeId) {
      res.status(403).json({ error: { code: "NOT_ASSIGNEE", message: "Only assignee can submit reports" } });
      return;
    }

    // 1. Tạo bản ghi báo cáo
    const report = await ReportModel.create({
      projectId: parsed.data.projectId,
      submittedBy: user.employeeId || user.userId,
      content: parsed.data.content,
      attachments: parsed.data.attachments,
      status: "PENDING",
    });

    // 2. Chuyển trạng thái Project sang PENDING_REVIEW atomic.
    // If the transition fails, the report created above is an orphan: the project
    // never entered PENDING_REVIEW, so any later review would act on a report that
    // does not belong to that state. ADR-004 forbids multi-document transactions,
    // so the compensation is explicit and its failure is swallowed on purpose —
    // the original transition error is the one worth reporting.
    let updatedProject: any;
    try {
      updatedProject = await transitionProject({
        projectId: parsed.data.projectId,
        expectedStatus: "IN_PROGRESS",
        expectedVersion: parsed.data.expectedVersion,
        newStatus: "PENDING_REVIEW",
        changedBy: user.employeeId || user.userId,
        actorRole: user.role,
        reason: "Submitted report for review",
      });
    } catch (transitionError) {
      await ReportModel.findByIdAndDelete(report._id).catch(() => undefined);
      throw transitionError;
    }

    res.status(201).json({
      reportId: report._id.toString(),
      projectId: updatedProject._id.toString(),
      status: "PENDING_REVIEW",
      version: updatedProject.version,
    });
  } catch (err: any) {
    if (err instanceof IllegalTransitionError) {
      res.status(409).json({ error: { code: "ILLEGAL_STATE_TRANSITION", message: err.message } });
      return;
    }
    if (err instanceof ForbiddenTransitionError) {
      res.status(403).json({ error: { code: "FORBIDDEN_TRANSITION", message: err.message } });
      return;
    }
    if (err.code === "PROJECT_VERSION_CONFLICT") {
      res.status(409).json({ error: { code: "PROJECT_VERSION_CONFLICT", message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to submit report" } });
  }
});

// GET /api/reports/:id - Xem chi tiết báo cáo
router.get("/reports/:id", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid report ID" } });
    return;
  }

  try {
    const report = await ReportModel.findById(id).lean();
    if (!report) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Report not found" } });
      return;
    }

    try {
      await assertReportScope(user, report as Record<string, any>);
    } catch (err) {
      if (err instanceof RbacDeniedError) {
        res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Report not found" } });
        return;
      }
      throw err;
    }

    res.status(200).json(report);
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch report" } });
  }
});

// POST /api/reports/:id/review - Admin phê duyệt hoặc từ chối báo cáo
router.post("/reports/:id/review", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== "Admin") {
    res.status(403).json({ error: { code: "RBAC_DENIED", message: "Only Admin can review reports" } });
    return;
  }

  const { id } = req.params;
  const parsed = ReportReviewSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid review payload", details: parsed.error.format() },
    });
    return;
  }

  try {
    const report: any = await ReportModel.findById(id);
    if (!report) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Report not found" } });
      return;
    }

    try {
      await assertReportScope(user, report);
    } catch (err) {
      if (err instanceof RbacDeniedError) {
        res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Report not found" } });
        return;
      }
      throw err;
    }

    const newProjectStatus = parsed.data.action === "APPROVE" ? "COMPLETED" : "IN_PROGRESS";

    // 1. Chuyển trạng thái Project atomic
    const updatedProject = await transitionProject({
      projectId: report.projectId,
      expectedStatus: "PENDING_REVIEW",
      expectedVersion: parsed.data.expectedVersion,
      newStatus: newProjectStatus,
      changedBy: user.employeeId || user.userId,
      actorRole: user.role,
      reason: parsed.data.reason || `Admin ${parsed.data.action} report`,
    });

    // 2. Cập nhật bản ghi report
    report.status = parsed.data.action === "APPROVE" ? "APPROVED" : "REJECTED";
    report.reviewedBy = user.employeeId || user.userId;
    report.reviewedAt = new Date();
    report.reason = parsed.data.reason || null;
    await report.save();

    res.status(200).json({
      reportId: report._id.toString(),
      projectId: updatedProject._id.toString(),
      projectStatus: updatedProject.status,
      version: updatedProject.version,
    });
  } catch (err: any) {
    if (err instanceof IllegalTransitionError) {
      res.status(409).json({ error: { code: "ILLEGAL_STATE_TRANSITION", message: err.message } });
      return;
    }
    if (err instanceof ForbiddenTransitionError) {
      res.status(403).json({ error: { code: "FORBIDDEN_TRANSITION", message: err.message } });
      return;
    }
    if (err.code === "PROJECT_VERSION_CONFLICT") {
      res.status(409).json({ error: { code: "PROJECT_VERSION_CONFLICT", message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to review report" } });
  }
});

export default router;

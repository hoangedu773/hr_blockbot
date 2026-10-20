import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import {
  ReportSubmitSchema,
  ReportReviewSchema,
} from "@hr-blockbot/contracts";
import { ReportModel } from "../models/Report.js";
import { ProjectModel, transitionProject } from "../models/Project.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

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

    // 2. Chuyển trạng thái Project sang PENDING_REVIEW atomic
    const updatedProject = await transitionProject({
      projectId: parsed.data.projectId,
      expectedStatus: "IN_PROGRESS",
      expectedVersion: parsed.data.expectedVersion,
      newStatus: "PENDING_REVIEW",
      changedBy: user.employeeId || user.userId,
      reason: "Submitted report for review",
    });

    res.status(201).json({
      reportId: report._id.toString(),
      projectId: updatedProject._id.toString(),
      status: "PENDING_REVIEW",
      version: updatedProject.version,
    });
  } catch (err: any) {
    if (err.code === "PROJECT_VERSION_CONFLICT") {
      res.status(409).json({ error: { code: "PROJECT_VERSION_CONFLICT", message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to submit report" } });
  }
});

// GET /api/reports/:id - Xem chi tiết báo cáo
router.get("/reports/:id", authenticateToken, async (req: Request, res: Response) => {
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

    const newProjectStatus = parsed.data.action === "APPROVE" ? "COMPLETED" : "IN_PROGRESS";

    // 1. Chuyển trạng thái Project atomic
    const updatedProject = await transitionProject({
      projectId: report.projectId,
      expectedStatus: "PENDING_REVIEW",
      expectedVersion: parsed.data.expectedVersion,
      newStatus: newProjectStatus,
      changedBy: user.employeeId || user.userId,
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
    if (err.code === "PROJECT_VERSION_CONFLICT") {
      res.status(409).json({ error: { code: "PROJECT_VERSION_CONFLICT", message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to review report" } });
  }
});

export default router;

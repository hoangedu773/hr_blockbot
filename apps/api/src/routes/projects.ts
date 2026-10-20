import { Router, Request, Response } from "express";
import mongoose from "mongoose";
import {
  ProjectCreateSchema,
  ProjectUpdateSchema,
  ProjectAssignSchema,
  ProjectTransitionSchema,
  ProjectProgressSchema,
  PaginationQuerySchema,
  PaginatedProjectsResponseSchema,
  ProjectSchema,
} from "@hr-blockbot/contracts";
import {
  ProjectModel,
  transitionProject,
  ProjectVersionConflictError,
  ProjectNotFoundError,
} from "../models/Project.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";

const router = Router();

// GET /api/projects - Danh sách đề tài có filter và pagination
router.get("/projects", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const paginationParse = PaginationQuerySchema.safeParse(req.query);
  const { page, limit } = paginationParse.success
    ? paginationParse.data
    : { page: 1, limit: 20 };

  try {
    const query: Record<string, unknown> = {};

    // Scope: Admin xem theo department, Employee xem việc được giao hoặc cùng dept
    if (user.role === "Admin" && user.departmentId) {
      query.departmentId = user.departmentId;
    } else if (user.role === "Employee" && user.employeeId) {
      query.$or = [{ assigneeId: user.employeeId }, { departmentId: user.departmentId }];
    }

    if (req.query.status && typeof req.query.status === "string") {
      query.status = req.query.status;
    }

    // Derived overdue filter: dueDate < now AND status != COMPLETED
    if (req.query.overdue === "true") {
      query.dueDate = { $lt: new Date() };
      query.status = { $ne: "COMPLETED" };
    }

    const totalItems = await ProjectModel.countDocuments(query);
    const projects = await ProjectModel.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    const items = projects.map((p: any) => ({
      id: p._id.toString(),
      title: p.title,
      description: p.description || "",
      departmentId: p.departmentId ? p.departmentId.toString() : "",
      createdBy: p.createdBy ? p.createdBy.toString() : "",
      assigneeId: p.assigneeId ? p.assigneeId.toString() : null,
      status: p.status,
      progress: typeof p.progress === "number" ? p.progress : 0,
      dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : null,
      version: typeof p.version === "number" ? p.version : 1,
      statusHistory: Array.isArray(p.statusHistory)
        ? p.statusHistory.map((h: any) => ({
            from: h.from || null,
            to: h.to,
            changedBy: h.changedBy,
            changedAt: new Date(h.changedAt).toISOString(),
            reason: h.reason,
          }))
        : [],
    }));

    const response = PaginatedProjectsResponseSchema.parse({
      items,
      paging: {
        page,
        limit,
        totalItems,
        totalPages: Math.ceil(totalItems / limit) || 1,
        hasNext: page * limit < totalItems,
        hasPrev: page > 1,
      },
    });

    res.status(200).json(response);
  } catch (err) {
    console.error("[Projects] List error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to fetch projects" },
    });
  }
});

// POST /api/projects - Admin tạo đề tài mới (trạng thái khởi tạo DRAFT, version=1)
router.post("/projects", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== "Admin") {
    res.status(403).json({
      error: { code: "RBAC_DENIED", message: "Only Admin can create projects" },
    });
    return;
  }

  const parsed = ProjectCreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: { code: "VALIDATION_FAILED", message: "Invalid project payload", details: parsed.error.format() },
    });
    return;
  }

  try {
    const project = await ProjectModel.create({
      title: parsed.data.title,
      description: parsed.data.description || "",
      departmentId: parsed.data.departmentId,
      createdBy: user.employeeId || user.userId,
      assigneeId: parsed.data.assigneeId || null,
      status: "DRAFT",
      progress: 0,
      dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
      version: 1,
      statusHistory: [
        {
          from: null,
          to: "DRAFT",
          changedBy: user.employeeId || user.userId,
          changedAt: new Date(),
          reason: "Project created",
        },
      ],
    });

    res.status(201).json({ id: project._id.toString(), status: "DRAFT", version: 1 });
  } catch (err) {
    console.error("[Projects] Create error:", err);
    res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to create project" },
    });
  }
});

// GET /api/projects/:id - Chi tiết đề tài
router.get("/projects/:id", authenticateToken, async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid project ID format" } });
    return;
  }

  try {
    const p: any = await ProjectModel.findById(id).lean();
    if (!p) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Project not found" } });
      return;
    }

    const projectData = ProjectSchema.parse({
      id: p._id.toString(),
      title: p.title,
      description: p.description || "",
      departmentId: p.departmentId ? p.departmentId.toString() : "",
      createdBy: p.createdBy ? p.createdBy.toString() : "",
      assigneeId: p.assigneeId ? p.assigneeId.toString() : null,
      status: p.status,
      progress: typeof p.progress === "number" ? p.progress : 0,
      dueDate: p.dueDate ? new Date(p.dueDate).toISOString() : null,
      version: typeof p.version === "number" ? p.version : 1,
      statusHistory: Array.isArray(p.statusHistory)
        ? p.statusHistory.map((h: any) => ({
            from: h.from || null,
            to: h.to,
            changedBy: h.changedBy,
            changedAt: new Date(h.changedAt).toISOString(),
            reason: h.reason,
          }))
        : [],
    });

    res.status(200).json(projectData);
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to fetch project detail" } });
  }
});

// POST /api/projects/:id/assign - Admin phân công đề tài
router.post("/projects/:id/assign", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  if (user.role !== "Admin") {
    res.status(403).json({ error: { code: "RBAC_DENIED", message: "Only Admin can assign projects" } });
    return;
  }

  const { id } = req.params;
  const parsed = ProjectAssignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid assign payload", details: parsed.error.format() } });
    return;
  }

  try {
    const updated = await transitionProject({
      projectId: id,
      expectedStatus: "DRAFT",
      expectedVersion: parsed.data.expectedVersion,
      newStatus: "ASSIGNED",
      changedBy: user.employeeId || user.userId,
      reason: "Admin assigned project",
      updates: { assigneeId: parsed.data.assigneeId },
    });

    res.status(200).json({ id: updated._id.toString(), status: updated.status, version: updated.version });
  } catch (err: any) {
    if (err instanceof ProjectVersionConflictError) {
      res.status(409).json({ error: { code: "PROJECT_VERSION_CONFLICT", message: err.message, details: err.currentProject } });
      return;
    }
    if (err instanceof ProjectNotFoundError) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: err.message } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to assign project" } });
  }
});

// POST /api/projects/:id/transition - Chuyển đổi trạng thái nguyên tử (F2 State Machine)
router.post("/projects/:id/transition", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const parsed = ProjectTransitionSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid transition payload", details: parsed.error.format() } });
    return;
  }

  try {
    const project: any = await ProjectModel.findById(id).lean();
    if (!project) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Project not found" } });
      return;
    }

    // Role checks
    if (parsed.data.targetStatus === "IN_PROGRESS" && user.role === "Employee") {
      if (project.assigneeId && project.assigneeId.toString() !== user.employeeId) {
        res.status(403).json({ error: { code: "NOT_ASSIGNEE", message: "Only assigned employee can start this project" } });
        return;
      }
    }

    const updated = await transitionProject({
      projectId: id,
      expectedStatus: project.status,
      expectedVersion: parsed.data.expectedVersion,
      newStatus: parsed.data.targetStatus,
      changedBy: user.employeeId || user.userId,
      reason: parsed.data.reason,
    });

    res.status(200).json({ id: updated._id.toString(), status: updated.status, version: updated.version });
  } catch (err: any) {
    if (err instanceof ProjectVersionConflictError) {
      res.status(409).json({ error: { code: "PROJECT_VERSION_CONFLICT", message: err.message, details: err.currentProject } });
      return;
    }
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to transition project" } });
  }
});

// POST /api/projects/:id/progress - Employee cập nhật tiến độ %
router.post("/projects/:id/progress", authenticateToken, async (req: Request, res: Response) => {
  const user = req.user!;
  const { id } = req.params;
  const parsed = ProjectProgressSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: { code: "VALIDATION_FAILED", message: "Invalid progress payload", details: parsed.error.format() } });
    return;
  }

  try {
    const project: any = await ProjectModel.findById(id);
    if (!project) {
      res.status(404).json({ error: { code: "RESOURCE_NOT_FOUND", message: "Project not found" } });
      return;
    }

    if (user.role === "Employee" && project.assigneeId?.toString() !== user.employeeId) {
      res.status(403).json({ error: { code: "NOT_ASSIGNEE", message: "Only assignee can update progress" } });
      return;
    }

    project.progress = parsed.data.progress;
    await project.save();

    res.status(200).json({ id: project._id.toString(), progress: project.progress });
  } catch (err) {
    res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update progress" } });
  }
});

export default router;

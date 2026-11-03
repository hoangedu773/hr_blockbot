import { Router } from "express";
import { endpoint } from "../lib/endpoint.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notification.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";

const router = Router();
router.get("/notifications", authenticateToken, endpoint(async (req, res) => {
  const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) throw new WorkflowError(400, "VALIDATION_FAILED", "Giới hạn thông báo không hợp lệ.");
  res.json(await listNotifications(req.user!.userId, {
    unreadOnly: req.query.unread === "true", limit,
    before: typeof req.query.before === "string" ? req.query.before : undefined,
  }));
}));
router.post("/notifications/:id/read", authenticateToken, endpoint(async (req, res) => {
  if (!(await markNotificationRead(req.user!.userId, req.params.id))) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy thông báo chưa đọc.");
  res.json({ id: req.params.id, read: true });
}));
router.post("/notifications/read-all", authenticateToken, endpoint(async (req, res) => {
  res.json({ updated: await markAllNotificationsRead(req.user!.userId) });
}));
export default router;

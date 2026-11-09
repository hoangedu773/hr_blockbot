import { Router } from "express";
import { endpoint } from "../lib/endpoint.js";
import { authenticateToken } from "../middlewares/auth.middleware.js";
import { listNotifications, markAllNotificationsRead, markNotificationRead } from "../services/notification.service.js";
import { WorkflowError } from "../services/project-workflow.service.js";
import { NotificationGroupSchema } from "@hr-blockbot/contracts";
import { z } from "zod";
import { listNotificationInbox } from "../services/notification-inbox.service.js";

const router = Router();
const inboxQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  group: NotificationGroupSchema.optional(),
  unread: z.enum(['true', 'false']).optional(),
  action: z.enum(['true', 'false']).optional(),
  before: z.string().datetime().optional(),
  beforeId: z.string().max(36).optional(),
  beforeSource: z.enum(['notification', 'assignment']).optional(),
}).strict();

router.get("/notifications/inbox", authenticateToken, endpoint(async (req, res) => {
  const { limit, group, unread, action, before, beforeId, beforeSource } = inboxQuery.parse(req.query);
  const hasCursor = before !== undefined || beforeId !== undefined || beforeSource !== undefined;
  const validId = beforeSource === 'notification'
    ? /^[a-f0-9]{24}$/.test(beforeId ?? '')
    : z.string().uuid().safeParse(beforeId).success;
  if (hasCursor && !(before && beforeId && beforeSource && validId)) {
    throw new WorkflowError(400, "VALIDATION_FAILED", "Vị trí tải thông báo không hợp lệ.");
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listNotificationInbox(req.user!, {
    limit, group, unreadOnly: unread === 'true', actionOnly: action === 'true',
    cursor: before && beforeId && beforeSource ? { createdAt: new Date(before).toISOString(), id: beforeId, source: beforeSource } : undefined,
  }));
}));

router.get("/notifications", authenticateToken, endpoint(async (req, res) => {
  const limit = req.query.limit === undefined ? undefined : Number(req.query.limit);
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 1 || limit > 100)) throw new WorkflowError(400, "VALIDATION_FAILED", "Giới hạn thông báo không hợp lệ.");
  if (req.query.entityKind !== undefined && !['schedule', 'revenue_kpi', 'performance_kpi', 'task'].includes(String(req.query.entityKind))) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Loại thông báo không hợp lệ.');
  res.setHeader("Cache-Control", "private, no-store");
  res.json(await listNotifications(req.user!.userId, {
    unreadOnly: req.query.unread === "true", limit,
    before: typeof req.query.before === "string" ? req.query.before : undefined,
    entityKind: req.query.entityKind as 'schedule' | 'revenue_kpi' | 'performance_kpi' | 'task' | undefined,
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

import mongoose from "mongoose";
import { NotificationItemSchema, NotificationNewPayloadSchema, type NotificationItem, type NotificationType } from "@hr-blockbot/contracts";
import { NotificationModel } from "../models/Notification.js";
import { getIO } from "../socket.js";
import { performanceNotificationContent } from "./performance-notification-content.js";

export interface NotifyInput {
  userId: string;
  employeeId?: string | null;
  type: NotificationType;
  title: string;
  body: string;
  dedupeKey: string;
  entityKind?: string | null;
  entityId?: string | null;
  severity?: 'INFO' | 'ACTION_REQUIRED' | 'URGENT';
  actionRef?: string | null;
}

/** Idempotent in-app notification. A replay with the same dedupeKey never emits twice. */
export async function notifyUser(input: NotifyInput): Promise<{ created: boolean; id: string }> {
  if (!mongoose.Types.ObjectId.isValid(input.userId)) return { created: false, id: "" };
  const now = new Date();
  const result = await NotificationModel.updateOne(
    { userId: new mongoose.Types.ObjectId(input.userId), dedupeKey: input.dedupeKey },
    {
      $setOnInsert: {
        userId: new mongoose.Types.ObjectId(input.userId),
        employeeId: input.employeeId && mongoose.Types.ObjectId.isValid(input.employeeId) ? new mongoose.Types.ObjectId(input.employeeId) : null,
        // Main API shares this collection but has an older notification enum.
        // Persist a compatible system type; the new service projects the subtype.
        type: /^(revenue_kpi_|performance_kpi_|task_)/.test(input.type) ? 'system' : input.type,
        performanceType: /^(performance_kpi_|task_)/.test(input.type) ? input.type : null,
        revenueType: input.type.startsWith('revenue_kpi_') ? input.type : null,
        title: input.title.slice(0, 200), body: input.body.slice(0, 1000),
        channel: "in_app", dedupeKey: input.dedupeKey,
        entityKind: input.entityKind ?? null, entityId: input.entityId ?? null,
        severity: input.severity ?? 'INFO',
        actionRef: input.actionRef ?? null,
        readAt: null, createdAt: now,
      },
    },
    { upsert: true }
  );
  const id = result.upsertedId ? String(result.upsertedId) : "";
  if (id) {
    const payload = NotificationNewPayloadSchema.parse({
      notificationId: id, type: input.type, title: input.title.slice(0, 200),
      body: input.body.slice(0, 1000), channel: "ws", createdAt: now.toISOString(),
    });
    getIO()?.to(`user:${input.userId}`).emit("notification:new", payload);
  }
  return { created: !!id, id };
}

export function notificationDto(row: any): NotificationItem {
  const type = row.performanceType ?? row.revenueType ?? row.type;
  const legacyContent = row.title === 'Cập nhật nhiệm vụ' || row.title === 'Cập nhật KPI hiệu suất'
    ? performanceNotificationContent(type, row.dedupeKey)
    : undefined;
  return NotificationItemSchema.parse({
    id: String(row._id), type, title: legacyContent?.title ?? row.title, body: legacyContent?.body ?? row.body,
    channel: "in_app", entityKind: row.entityKind ?? null, entityId: row.entityId ?? null,
    severity: legacyContent?.severity ?? row.severity ?? "INFO",
    actionRef: row.actionRef ?? (legacyContent ? row.entityId : null) ?? null,
    readAt: row.readAt ? new Date(row.readAt).toISOString() : null,
    createdAt: new Date(row.createdAt).toISOString(),
  });
}

export async function listNotifications(userId: string, options: { unreadOnly?: boolean; limit?: number; before?: string; entityKind?: 'schedule' | 'revenue_kpi' | 'performance_kpi' | 'task' } = {}) {
  const limit = Math.min(Math.max(options.limit ?? 30, 1), 100);
  const filter: Record<string, any> = { userId: new mongoose.Types.ObjectId(userId) };
  if (options.entityKind) filter.entityKind = options.entityKind;
  if (options.unreadOnly) filter.readAt = null;
  if (options.before && !Number.isNaN(Date.parse(options.before))) filter.createdAt = { $lt: new Date(options.before) };
  const rows = await NotificationModel.find(filter).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  const unread = await NotificationModel.countDocuments({ userId: new mongoose.Types.ObjectId(userId), readAt: null, ...(options.entityKind ? { entityKind: options.entityKind } : {}) });
  return { items: rows.map(notificationDto), unread };
}

export async function markNotificationRead(userId: string, id: string): Promise<boolean> {
  if (!mongoose.Types.ObjectId.isValid(id)) return false;
  const result = await NotificationModel.updateOne(
    { _id: new mongoose.Types.ObjectId(id), userId: new mongoose.Types.ObjectId(userId), readAt: null },
    { $set: { readAt: new Date() } }
  );
  return result.modifiedCount > 0;
}

export async function markAllNotificationsRead(userId: string): Promise<number> {
  const result = await NotificationModel.updateMany({ userId: new mongoose.Types.ObjectId(userId), readAt: null }, { $set: { readAt: new Date() } });
  return result.modifiedCount;
}

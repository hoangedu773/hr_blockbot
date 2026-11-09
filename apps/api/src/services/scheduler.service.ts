import mongoose from "mongoose";
import { ProjectModel } from "../models/Project.js";
import { TaskInstanceModel } from "../models/TaskInstance.js";
import { UserModel } from "../models/User.js";
import { EvaluationModel } from "../models/Evaluation.js";
import { notifyUser } from "./notification.service.js";

/**
 * F7 in-process reminder scheduler. Idempotency comes from the unique
 * `(userId, dedupeKey)` index, not from the timer being reliable.
 * Render free instances sleep; on wake the next cycle catches up for the day.
 */
const DAY = 86400000;
const bucket = (now: Date) => now.toISOString().slice(0, 10);
const asId = (value: unknown) => mongoose.Types.ObjectId.isValid(String(value)) ? new mongoose.Types.ObjectId(String(value)) : null;

async function activeUserForEmployee(employeeId: unknown) {
  const id = asId(employeeId);
  if (!id) return null;
  const row: any = await UserModel.findOne({ employeeId: id, status: "active" }).select("_id employeeId").lean();
  return row;
}
async function managerUserFor(project: any) {
  const assignee = asId(project.responsibleEmployeeId ?? project.assigneeId);
  const storeId = asId(project.storeId);
  if (!assignee || !storeId) return null;
  const now = new Date();
  const relation: any = await mongoose.connection.collection("management_relations").findOne({
    employeeId: assignee, storeId, revokedAt: null, validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gt: now } }],
  }, { projection: { managerEmployeeId: 1 }, sort: { validFrom: -1 } });
  if (!relation) return null;
  return activeUserForEmployee(relation.managerEmployeeId);
}

export async function runDeadlineReminders(now = new Date()): Promise<{ considered: number; sent: number }> {
  const today = bucket(now);
  const horizon = new Date(now.getTime() + 3 * DAY);
  const projects: any[] = await ProjectModel.find({
    status: { $in: ["ASSIGNED", "IN_PROGRESS"] },
    dueDate: { $ne: null, $lte: horizon },
  }).select("title status dueDate responsibleEmployeeId assigneeId storeId").limit(1000).lean();
  let sent = 0;
  for (const project of projects) {
    const due = new Date(project.dueDate);
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / DAY);
    if (daysLeft > 3) continue;
    const type = daysLeft <= 0 ? "deadline_overdue" : daysLeft <= 1 ? "deadline_1d" : "deadline_3d";
    const employee = await activeUserForEmployee(project.responsibleEmployeeId ?? project.assigneeId);
    const title = type === "deadline_overdue" ? `Quá hạn: ${project.title}`
      : daysLeft <= 1 ? `Còn 1 ngày: ${project.title}` : `Còn 3 ngày: ${project.title}`;
    const body = type === "deadline_overdue"
      ? `Công việc đã quá hạn từ ${due.toISOString().slice(0, 10)}. Nộp báo cáo hoặc báo quản lý ngay.`
      : `Hạn hoàn thành ${due.toISOString().slice(0, 10)} (còn ${Math.max(0, daysLeft)} ngày).`;
    if (employee) {
      const result = await notifyUser({
        userId: String(employee._id), employeeId: String(project.responsibleEmployeeId ?? project.assigneeId),
        type, title, body, dedupeKey: `${type}:${String(project._id)}:${today}`,
        entityKind: "project", entityId: String(project._id),
      });
      if (result.created) sent += 1;
    }
    if (type === "deadline_overdue") {
      const manager = await managerUserFor(project);
      if (manager && String(manager._id) !== String(employee?._id ?? "")) {
        const result = await notifyUser({
          userId: String(manager._id), type: "deadline_overdue",
          title: `Nhân viên quá hạn: ${project.title}`, body: `Công việc đã quá hạn từ ${due.toISOString().slice(0, 10)} và chưa hoàn tất.`,
          dedupeKey: `deadline_overdue_manager:${String(project._id)}:${today}`,
          entityKind: "project", entityId: String(project._id),
        });
        if (result.created) sent += 1;
      }
    }
  }
  const tasks: any[] = await TaskInstanceModel.find({
    status: { $in: ["ASSIGNED", "PENDING_ACCEPTANCE", "ACCEPTED", "IN_PROGRESS", "REJECTED"] },
    assigneeEmployeeId: { $ne: null },
  }).select("title status dueAt extendedDueAt assigneeEmployeeId assignerEmployeeId storeId").limit(1000).lean();
  let taskConsidered = 0;
  for (const task of tasks) {
    const due = new Date(task.extendedDueAt ?? task.dueAt);
    if (Number.isNaN(due.getTime()) || due > horizon) continue;
    const daysLeft = Math.ceil((due.getTime() - now.getTime()) / DAY);
    if (daysLeft > 3) continue;
    taskConsidered += 1;
    const type = daysLeft <= 0 ? "deadline_overdue" : daysLeft <= 1 ? "deadline_1d" : "deadline_3d";
    const employee = await activeUserForEmployee(task.assigneeEmployeeId);
    const title = type === "deadline_overdue" ? `Quá hạn: ${task.title}`
      : daysLeft <= 1 ? `Còn 1 ngày: ${task.title}` : `Còn 3 ngày: ${task.title}`;
    const body = type === "deadline_overdue"
      ? `Nhiệm vụ đã quá hạn từ ${due.toISOString().slice(0, 10)}. Nộp minh chứng hoặc báo quản lý ngay.`
      : `Hạn hoàn thành ${due.toISOString().slice(0, 10)} (còn ${Math.max(0, daysLeft)} ngày).`;
    if (employee) {
      const result = await notifyUser({
        userId: String(employee._id), employeeId: String(task.assigneeEmployeeId),
        type, title, body, dedupeKey: `task_${type}:${String(task._id)}:${today}`,
        entityKind: "project", entityId: String(task._id),
      });
      if (result.created) sent += 1;
    }
    if (type === "deadline_overdue") {
      const manager = (await managerUserFor({ responsibleEmployeeId: task.assigneeEmployeeId, storeId: task.storeId }))
        ?? (await activeUserForEmployee(task.assignerEmployeeId));
      if (manager && String(manager._id) !== String(employee?._id ?? "")) {
        const result = await notifyUser({
          userId: String(manager._id), type: "deadline_overdue",
          title: `Nhân viên quá hạn: ${task.title}`, body: `Nhiệm vụ đã quá hạn từ ${due.toISOString().slice(0, 10)} và chưa hoàn tất.`,
          dedupeKey: `task_deadline_overdue_manager:${String(task._id)}:${today}`,
          entityKind: "project", entityId: String(task._id),
        });
        if (result.created) sent += 1;
      }
    }
  }
  return { considered: projects.length + taskConsidered, sent };
}

export async function runAcknowledgementReminders(now = new Date()): Promise<{ considered: number; sent: number }> {
  const today = bucket(now);
  const stale = new Date(now.getTime() - DAY);
  const projects: any[] = await ProjectModel.find({
    assignmentStatus: "PENDING_ACCEPTANCE", status: "ASSIGNED", updatedAt: { $lte: stale },
  }).select("title assigneeId responsibleEmployeeId storeId updatedAt").limit(500).lean();
  let sent = 0;
  for (const project of projects) {
    const employee = await activeUserForEmployee(project.responsibleEmployeeId ?? project.assigneeId);
    if (employee) {
      const result = await notifyUser({
        userId: String(employee._id), employeeId: String(project.responsibleEmployeeId ?? project.assigneeId),
        type: "system", title: `Chưa xác nhận phân công: ${project.title}`,
        body: "Bạn chưa phản hồi đề tài được giao. Vào mục Công việc để xác nhận hoặc yêu cầu đổi người.",
        dedupeKey: `assignment_ack:${String(project._id)}:${today}`, entityKind: "project", entityId: String(project._id),
      });
      if (result.created) sent += 1;
    }
    if (now.getTime() - new Date(project.updatedAt).getTime() >= 3 * DAY) {
      const manager = await managerUserFor(project);
      if (manager) {
        const result = await notifyUser({
          userId: String(manager._id), type: "system", title: `Phân công chưa được xác nhận: ${project.title}`,
          body: "Đã quá 3 ngày nhân viên chưa phản hồi phân công. Cần xử lý thủ công.",
          dedupeKey: `assignment_ack_escalate:${String(project._id)}:${today}`, entityKind: "project", entityId: String(project._id),
        });
        if (result.created) sent += 1;
      }
    }
  }
  const tasks: any[] = await TaskInstanceModel.find({
    assignmentStatus: "PENDING_ACCEPTANCE",
    status: { $in: ["ASSIGNED", "PENDING_ACCEPTANCE", "HANDOVER"] },
    assignedAt: { $ne: null, $lte: stale.toISOString() },
  }).select("title assigneeEmployeeId assignerEmployeeId storeId assignedAt").limit(500).lean();
  for (const task of tasks) {
    const employee = await activeUserForEmployee(task.assigneeEmployeeId);
    if (employee) {
      const result = await notifyUser({
        userId: String(employee._id), employeeId: String(task.assigneeEmployeeId),
        type: "system", title: `Chưa xác nhận nhiệm vụ: ${task.title}`,
        body: "Bạn chưa phản hồi nhiệm vụ có chấm điểm được giao. Vào mục Công việc để nhận hoặc phản hồi.",
        dedupeKey: `task_ack:${String(task._id)}:${today}`, entityKind: "project", entityId: String(task._id),
      });
      if (result.created) sent += 1;
    }
    if (now.getTime() - new Date(task.assignedAt).getTime() >= 3 * DAY) {
      const manager = (await managerUserFor({ responsibleEmployeeId: task.assigneeEmployeeId, storeId: task.storeId }))
        ?? (await activeUserForEmployee(task.assignerEmployeeId));
      if (manager) {
        const result = await notifyUser({
          userId: String(manager._id), type: "system", title: `Nhiệm vụ chưa được xác nhận: ${task.title}`,
          body: "Đã quá 3 ngày nhân viên chưa phản hồi nhiệm vụ. Cần xử lý thủ công.",
          dedupeKey: `task_ack_escalate:${String(task._id)}:${today}`, entityKind: "project", entityId: String(task._id),
        });
        if (result.created) sent += 1;
      }
    }
  }
  return { considered: projects.length + tasks.length, sent };
}

export async function runKpiReviewDigest(now = new Date()): Promise<{ pending: number; sent: number }> {
  const today = bucket(now);
  const pending: any[] = await EvaluationModel.find({
    $or: [
      { frameworkVersion: { $not: { $gte: 2 } }, status: "ANALYZED" },
      { frameworkVersion: { $gte: 2 }, evaluationStatus: { $in: ["MANAGER_REVIEW", "PROVISIONAL", "PENDING_DISPUTE"] } },
    ],
  })
    .select("storeId departmentId").limit(2000).lean();
  if (!pending.length) return { pending: 0, sent: 0 };
  const byStore = new Map<string, number>();
  for (const row of pending) {
    const key = row.storeId ? String(row.storeId) : `dept:${String(row.departmentId ?? "")}`;
    byStore.set(key, (byStore.get(key) ?? 0) + 1);
  }
  const managers: any[] = await UserModel.find({
    status: "active", "authorization.profile": { $in: ["hr", "om", "sam", "am", "sm", "aom"] },
    "authorization.grants.0": { $exists: true },
  }).select("_id authorization").limit(1000).lean();
  let sent = 0;
  for (const manager of managers) {
    let count = 0;
    for (const grant of manager.authorization?.grants ?? []) {
      if (grant.revokedAt) continue;
      if (grant.scope?.kind !== "organization") continue;
      for (const storeId of grant.scope.storeIds ?? []) count += byStore.get(String(storeId)) ?? 0;
    }
    if (!count) continue;
    const result = await notifyUser({
      userId: String(manager._id), type: "kpi_review_digest",
      title: "KPI cần duyệt hôm nay", body: `Có ${count} kỳ KPI đã phân tích nhưng chưa công bố trong phạm vi bạn quản lý.`,
      dedupeKey: `kpi_review_digest:${String(manager._id)}:${today}`, entityKind: "evaluation", entityId: null,
    });
    if (result.created) sent += 1;
  }
  return { pending: pending.length, sent };
}

export async function runReminderCycle(now = new Date()) {
  const results: Record<string, unknown> = {};
  const jobs = [["deadlines", runDeadlineReminders], ["acknowledgements", runAcknowledgementReminders], ["kpiDigest", runKpiReviewDigest]] as const;
  for (const [name, job] of jobs) {
    try { results[name] = await job(now); }
    catch { results[name] = { error: "JOB_FAILED" }; console.error(`[Scheduler] ${name} failed`); }
  }
  return results;
}

let timer: ReturnType<typeof setInterval> | null = null;
export function startReminderScheduler(): void {
  if (timer || process.env.REMINDER_SCHEDULER_ENABLED !== "true") return;
  const interval = Math.max(60000, Number(process.env.REMINDER_INTERVAL_MS) || 900000);
  const tick = () => { void runReminderCycle(); };
  setTimeout(tick, 15000).unref?.();
  timer = setInterval(tick, interval);
  timer.unref?.();
  console.log(`[Scheduler] reminder cycle every ${Math.round(interval / 1000)}s`);
}

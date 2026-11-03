import { randomUUID } from 'node:crypto';
import { UserModel } from '../models/User.js';
import { RevenueKpiAssignmentModel as Assignment } from '../models/RevenueKpiAssignment.js';
import { RevenueKpiResultModel as Result } from '../models/RevenueKpiResult.js';
import { withCrmWriter } from './crm-writer.service.js';
import { resolvePrincipal } from './principal.service.js';
import { requireCapability, resourceScope, hasCapability } from './authorization-scope.service.js';
import { notifyUser } from './notification.service.js';
import type { NotificationType } from '@hr-blockbot/contracts';
import { digest } from './project-audit.service.js';
import { ensureRevenueKpiStorage } from './revenue-kpi-storage.service.js';

async function eligible(user: any, assignment: any, own: boolean) {
  try {
    const u = await resolvePrincipal({ sub: String(user._id), role: user.role, securityVersion: user.securityVersion ?? 0 });
    if (own) return u.employeeId === assignment.assigneeEmployeeId && hasCapability(u, 'revenue_kpi.read_self');
    if (u.authorization?.profile !== 'hr') return false;
    for (const s of assignment.stores) requireCapability(u, 'revenue_kpi.read_scope', resourceScope(u, { storeId: s.storeId, storeMappingRef: 'revenue-kpi-notification' }));
    return true;
  } catch { return false; }
}
/** History is the durable event source: replay retries delivery after failures.
 * Messages contain no target, revenue, reason or employee name after revocation. */
export async function flushRevenueKpiNotices(assignmentId?: string) {
  if (process.env.REVENUE_KPI_ENABLED !== 'true') return;
  await ensureRevenueKpiStorage();
  const rows: any[] = await Assignment.find(assignmentId ? { _id: assignmentId } : {}).limit(1000).lean();
  const hr: any[] = await UserModel.find({ status: 'active', 'authorization.profile': 'hr' }).select('_id role securityVersion').limit(1000).lean();
  for (const a of rows) {
    const owner: any = await UserModel.findOne({ employeeId: a.assigneeEmployeeId, status: 'active' }).select('_id role securityVersion').lean();
    const results: any[] = await Result.find({ assignmentId: a._id }).sort({ version: -1 }).limit(1).lean();
    const events = [...a.history.map((e: any) => ({ ...e, entity: a._id })), ...results.flatMap(r => r.history.map((e: any) => ({ ...e, entity: a._id })))];
    for (const e of events) {
      let type: NotificationType, title: string;
      if (e.toStatus === 'PENDING_ACCEPTANCE') { type = 'revenue_kpi_assigned'; title = 'KPI doanh thu cần xác nhận'; }
      else if (e.action === 'accept') { type = 'revenue_kpi_accepted'; title = 'Đã xác nhận KPI doanh thu'; }
      else if (e.action === 'refuse') { type = 'revenue_kpi_refused'; title = 'KPI doanh thu cần HR xem xét'; }
      else if (e.toStatus === 'AWAITING_REASON') { type = 'revenue_kpi_reason_required'; title = 'KPI doanh thu cần giải trình'; }
      else if (e.action === 'COMPUTE_RESULT') { type = 'revenue_kpi_result_ready'; title = 'KPI doanh thu có kết quả mới'; }
      else if (e.action === 'CLOSE_ASSIGNMENT') { type = 'revenue_kpi_closed'; title = 'KPI doanh thu đã chốt kỳ'; }
      else if (e.action.startsWith('adjustment-') || e.action === 'correct' || e.action === 'responsibility') { type = 'revenue_kpi_adjusted'; title = 'KPI doanh thu có cập nhật cần xem'; }
      else if (e.action === 'OVERDUE_REMINDER') { type = 'revenue_kpi_assigned'; title = 'KPI doanh thu quá hạn xác nhận'; }
      else continue;
      for (const [recipient, isOwner] of [...(owner ? [[owner, true]] : []), ...hr.map(h => [h, false])] as [any, boolean][]) {
        if (!await eligible(recipient, a, isOwner)) continue;
        // An old participant's request must not be disclosed to a new participant.
        if (isOwner && a.responsibility?.length && !a.responsibility.some((r: any) => r.employeeId === a.assigneeEmployeeId && r.from <= e.at && (!r.to || e.at < r.to))) continue;
        await notifyUser({ userId: String(recipient._id), type, title, body: `Kỳ ${a.period}: mở KPI doanh thu để xem trạng thái trong phạm vi được cấp.`,
          dedupeKey: `${type}:${a._id}:${e.requestId}`, entityKind: 'revenue_kpi', entityId: String(a._id) });
      }
    }
  }
}
export async function runRevenueKpiReminders(now = new Date()) {
  if (process.env.REVENUE_KPI_ENABLED !== 'true') return { considered: 0, overdue: 0 };
  await ensureRevenueKpiStorage();
  const rows: any[] = await Assignment.find({ status: 'PENDING_ACCEPTANCE', deadlineAt: { $lt: now.toISOString() }, overdue: false }).limit(1000).lean();
  let changed = 0;
  for (const a of rows) await withCrmWriter(async () => {
    const input = { deadlineAt: a.deadlineAt }, at = now.toISOString();
    const event = { at, by: a.history[0].by, actorKind: 'SYSTEM', action: 'OVERDUE_REMINDER', fromStatus: a.status, toStatus: a.status, fromTargetVnd: a.targetVnd, toTargetVnd: a.targetVnd,
      reason: 'Hệ thống nhắc quá hạn; không tự chấp nhận KPI.', requestId: randomUUID(), payloadHash: digest(input) };
    const r = await Assignment.updateOne({ _id: a._id, version: a.version, status: 'PENDING_ACCEPTANCE', overdue: false }, { $set: { overdue: true, updatedAt: at }, $inc: { version: 1 }, $push: { history: event } });
    changed += r.modifiedCount;
  });
  await flushRevenueKpiNotices(); return { considered: rows.length, overdue: changed };
}
let timer: ReturnType<typeof setInterval> | undefined;
export function startRevenueKpiReminderScheduler() {
  if (timer || process.env.REVENUE_KPI_ENABLED !== 'true') return;
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await runRevenueKpiReminders(); } catch { console.error('[RevenueKpi] reminder/delivery deferred'); } finally { running = false; } };
  timer = setInterval(() => void tick(), 15 * 60000); timer.unref(); setTimeout(() => void tick(), 15000).unref();
}

import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';
import { UserModel } from '../models/User.js';
import { RevenueKpiAssignmentModel as Assignment } from '../models/RevenueKpiAssignment.js';
import { RevenueKpiResultModel as Result } from '../models/RevenueKpiResult.js';
import { RevenueKpiPeriodModel as Period } from '../models/RevenueKpiPeriod.js';
import { withCrmWriter } from './crm-writer.service.js';
import { resolvePrincipal } from './principal.service.js';
import { requireCapability, resourceScope, hasCapability } from './authorization-scope.service.js';
import { notifyUser } from './notification.service.js';
import type { NotificationType } from '@hr-blockbot/contracts';
import { digest } from './project-audit.service.js';
import { ensureRevenueKpiStorage } from './revenue-kpi-storage.service.js';
import { periodRangeVN } from './revenue-kpi-calc.service.js';
async function eligible(user: any, assignment: any, own: boolean) {
  try {
    const u = await resolvePrincipal({ sub: String(user._id), role: user.role, securityVersion: user.securityVersion ?? 0 });
    if (own) return u.employeeId === assignment.assigneeEmployeeId && hasCapability(u, 'revenue_kpi.read_self');
    const profile = u.authorization?.profile;
    if (profile !== 'hr' && profile !== 'am') return false;
    for (const s of assignment.stores) {
      const scope = resourceScope(u, { storeId: s.storeId, storeMappingRef: 'revenue-kpi-notification' });
      let ok = false;
      try {
        requireCapability(u, 'revenue_kpi.read_scope', scope);
        ok = true;
      } catch {
        try {
          requireCapability(u, 'revenue_kpi.verify_adjustment', scope);
          ok = true;
        } catch {
          ok = false;
        }
      }
      if (!ok) return false;
    }
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
  const amList: any[] = await UserModel.find({ status: 'active', 'authorization.profile': 'am' }).select('_id role securityVersion').limit(1000).lean();
  for (const a of rows) {
    const empIdFilter = mongoose.Types.ObjectId.isValid(a.assigneeEmployeeId)
      ? { $in: [a.assigneeEmployeeId, new mongoose.Types.ObjectId(a.assigneeEmployeeId)] }
      : a.assigneeEmployeeId;
    const owner: any = await UserModel.findOne({ employeeId: empIdFilter, status: 'active' }).select('_id role securityVersion').lean();
    const results: any[] = await Result.find({ assignmentId: a._id }).sort({ version: -1 }).limit(1).lean();
    const events = [...a.history.map((e: any) => ({ ...e, entity: a._id })), ...results.flatMap(r => r.history.map((e: any) => ({ ...e, entity: a._id })))];
    for (const e of events) {
      let type: NotificationType;
      let title: string;
      let severity: 'INFO' | 'ACTION_REQUIRED' | 'URGENT';
      let targets: Array<{ user: any; isOwner: boolean }> = [];
      const actionRef = String(a._id);

      if (e.action === 'adjustment-request') {
        type = 'revenue_kpi_adjustment_requested';
        severity = 'ACTION_REQUIRED';
        title = 'Yêu cầu điều chỉnh KPI doanh thu';
        targets = [
          ...(a.unitType === 'STORE' ? amList.map(u => ({ user: u, isOwner: false })) : []),
          ...hr.map(h => ({ user: h, isOwner: false })),
        ];
      } else if (e.action === 'adjustment-verify') {
        type = 'revenue_kpi_adjustment_verified';
        severity = 'ACTION_REQUIRED';
        title = 'Yêu cầu điều chỉnh KPI đã được AM xác minh';
        targets = hr.map(h => ({ user: h, isOwner: false }));
      } else if (e.action === 'adjustment-decision') {
        type = 'revenue_kpi_adjustment_decided';
        severity = 'INFO';
        title = 'HR đã quyết định yêu cầu điều chỉnh KPI';
        targets = [
          ...(owner ? [{ user: owner, isOwner: true }] : []),
          ...amList.map(u => ({ user: u, isOwner: false })),
        ];
      } else if (e.action === 'OVERDUE_REMINDER') {
        type = 'revenue_kpi_acceptance_overdue';
        severity = 'URGENT';
        title = 'KPI doanh thu quá hạn xác nhận';
        targets = owner ? [{ user: owner, isOwner: true }] : [];
      } else if (e.toStatus === 'PENDING_ACCEPTANCE') {
        type = 'revenue_kpi_assigned';
        severity = 'ACTION_REQUIRED';
        title = 'KPI doanh thu cần xác nhận';
        targets = [
          ...(owner ? [{ user: owner, isOwner: true }] : []),
          ...hr.map(h => ({ user: h, isOwner: false })),
        ];
      } else if (e.action === 'accept') {
        type = 'revenue_kpi_accepted';
        severity = 'INFO';
        title = 'Đã xác nhận KPI doanh thu';
        targets = [
          ...(owner ? [{ user: owner, isOwner: true }] : []),
          ...hr.map(h => ({ user: h, isOwner: false })),
        ];
      } else if (e.action === 'refuse') {
        type = 'revenue_kpi_refused';
        severity = 'ACTION_REQUIRED';
        title = 'KPI doanh thu cần HR xem xét';
        targets = hr.map(h => ({ user: h, isOwner: false }));
      } else if (e.toStatus === 'AWAITING_REASON') {
        type = 'revenue_kpi_reason_required';
        severity = 'ACTION_REQUIRED';
        title = 'KPI doanh thu cần giải trình';
        targets = owner ? [{ user: owner, isOwner: true }] : [];
      } else if (e.action === 'COMPUTE_RESULT') {
        type = 'revenue_kpi_result_ready';
        severity = 'INFO';
        title = 'KPI doanh thu có kết quả mới';
        targets = [
          ...(owner ? [{ user: owner, isOwner: true }] : []),
          ...hr.map(h => ({ user: h, isOwner: false })),
        ];
      } else if (e.action === 'CLOSE_ASSIGNMENT') {
        type = 'revenue_kpi_closed';
        severity = 'INFO';
        title = 'KPI doanh thu đã chốt kỳ';
        targets = [
          ...(owner ? [{ user: owner, isOwner: true }] : []),
          ...hr.map(h => ({ user: h, isOwner: false })),
        ];
      } else if (e.action === 'correct' || e.action === 'responsibility') {
        type = 'revenue_kpi_adjusted';
        severity = 'INFO';
        title = 'KPI doanh thu có cập nhật cần xem';
        targets = [
          ...(owner ? [{ user: owner, isOwner: true }] : []),
          ...hr.map(h => ({ user: h, isOwner: false })),
        ];
      } else {
        continue;
      }

      for (const { user: recipient, isOwner } of targets) {
        if (!await eligible(recipient, a, isOwner)) continue;
        // An old participant's request must not be disclosed to a new participant.
        if (isOwner && a.responsibility?.length && !a.responsibility.some((r: any) => r.employeeId === a.assigneeEmployeeId && r.from <= e.at && (!r.to || e.at < r.to))) continue;
        await notifyUser({
          userId: String(recipient._id),
          type,
          title,
          body: `Kỳ ${a.period}: mở KPI doanh thu để xem trạng thái trong phạm vi được cấp.`,
          dedupeKey: `${type}:${a._id}:${e.requestId}`,
          entityKind: 'revenue_kpi',
          entityId: String(a._id),
          severity,
          actionRef,
        });
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
  await flushRevenueKpiNotices();
  const openPeriods: any[] = await Period.find({ status: 'OPEN' }).lean();
  const hrUsers: any[] = await UserModel.find({ status: 'active', 'authorization.profile': 'hr' }).select('_id role securityVersion').limit(1000).lean();
  for (const p of openPeriods) {
    if (periodRangeVN(p.period).end < now) {
      for (const hr of hrUsers) {
        try {
          const u = await resolvePrincipal({ sub: String(hr._id), role: hr.role, securityVersion: hr.securityVersion ?? 0 });
          if (u.authorization?.profile !== 'hr' || !hasCapability(u, 'revenue_kpi.close')) continue;
          await notifyUser({
            userId: String(hr._id),
            type: 'revenue_kpi_period_closing',
            title: 'Kỳ KPI doanh thu đến hạn chốt',
            body: `Kỳ ${p.period} đã kết thúc. Vui lòng kiểm tra và chốt kỳ KPI doanh thu.`,
            dedupeKey: `revenue_kpi_period_closing:${p.period}:${now.toISOString().slice(0, 10)}`,
            entityKind: 'revenue_kpi',
            entityId: p.period,
            severity: 'URGENT',
            actionRef: p.period,
          });
        } catch { /* skip */ }
      }
    }
  }
  return { considered: rows.length, overdue: changed };
}
let timer: ReturnType<typeof setInterval> | undefined;
export function startRevenueKpiReminderScheduler() {
  if (timer || process.env.REVENUE_KPI_ENABLED !== 'true') return;
  let running = false;
  const tick = async () => { if (running) return; running = true; try { await runRevenueKpiReminders(); } catch { console.error('[RevenueKpi] reminder/delivery deferred'); } finally { running = false; } };
  timer = setInterval(() => void tick(), 15 * 60000); timer.unref(); setTimeout(() => void tick(), 15000).unref();
}

import { useEffect, useRef, useState } from 'react';
import { type AuthorizationCapability, type RevenueKpiAssignment, type RevenueKpiDashboard } from '@hr-blockbot/contracts';
import * as api from '../../services/revenue-kpi-api';
import { fetchMe } from '../../services/api';
import {
  assignmentStatus, bulkRevenuePlan, canUseUnit, choose, closeBlockers, computeOrClose, createRevenuePlan,
  currentRevenueMonth, diversifyRevenuePlan, draftRevenuePlan, isUnitIntent, openRevenuePlan, periodStatus, resultStatus,
  revenueMoney, seedBaselinePlan, unitName, unitRevenuePlan, type Plan, type Step, type UnitIntent,
} from './revenue-chat-actions';
import { detectRevenueIntent, pickRevenueChoice, revenueMonth, revenueParts, revenueText, type RevenueIntent } from './revenue-chat-intent';

type Turn = { sender: 'user' | 'assistant'; text: string };
type Session = { period: string; options: string[]; selected?: string };
type Decision = { step: Step<Plan> } | { plan: Plan };

const capabilities: Partial<Record<RevenueIntent, AuthorizationCapability>> = {
  create: 'revenue_kpi.assign', open: 'revenue_kpi.assign', 'seed-baseline': 'revenue_kpi.assign', diversify: 'revenue_kpi.assign',
  draft: 'revenue_kpi.assign', edit: 'revenue_kpi.assign',
  publish: 'revenue_kpi.assign', ai: 'revenue_kpi.assign', 'apply-ai': 'revenue_kpi.assign', responsibility: 'revenue_kpi.assign',
  accept: 'revenue_kpi.respond', refuse: 'revenue_kpi.respond', request: 'revenue_kpi.request_adjustment',
  'miss-reason': 'revenue_kpi.respond', verify: 'revenue_kpi.verify_adjustment',
  keep: 'revenue_kpi.approve', force: 'revenue_kpi.approve', 'cancel-target': 'revenue_kpi.approve', 'adjust-target': 'revenue_kpi.approve',
  'approve-adjustment': 'revenue_kpi.approve', 'reject-adjustment': 'revenue_kpi.approve',
  'review-reason': 'revenue_kpi.approve', 'return-reason': 'revenue_kpi.approve',
  compute: 'revenue_kpi.close', close: 'revenue_kpi.close', 'close-check': 'revenue_kpi.close',
  confirm: 'revenue_kpi.close', waive: 'revenue_kpi.close', correct: 'revenue_kpi.close',
};
const eventLabels: Record<string, string> = {
  SAVE_DRAFT: 'Lưu bản nháp', AUTO_DRAFT: 'Tạo bản nháp', publish: 'Phát hành', accept: 'Chấp nhận', refuse: 'Từ chối',
  'adjustment-request': 'Xin điều chỉnh', 'adjustment-verify': 'AM xác minh', 'adjustment-decision': 'HR quyết định điều chỉnh',
  COMPUTE_RESULT: 'Tính kết quả', 'miss-reason': 'Gửi giải trình', 'review-reason': 'Xét giải trình', confirm: 'Xác nhận kết quả',
  CLOSE_ASSIGNMENT: 'Đóng KPI', correct: 'Điều chỉnh sau chốt',
};
const localTime = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
const owner = (a: RevenueKpiAssignment, employeeId?: string) => a.assigneeEmployeeId === employeeId;
const planned = (plan: Plan) => plan.summary + '\n\nNhắn “xác nhận” để thực hiện hoặc “hủy” để dừng.';

function describe(d: RevenueKpiDashboard, a: RevenueKpiAssignment, history: boolean) {
  const r = d.results.find(row => row.assignmentId === a.id);
  const lines = [`${unitName(a)} · kỳ ${a.period}`,
    `Phụ trách · ${a.assigneeName} (${a.assigneeRole})`,
    `Trạng thái · ${assignmentStatus[a.status]}`,
    `Mục tiêu · ${revenueMoney(a.targetVnd)}`,
    `Tháng gốc ${a.basePeriod ?? '—'} · ${revenueMoney(a.baseRevenueVnd)}`];
  if (a.deadlineAt) lines.push(`Hạn nhận · ${localTime(a.deadlineAt)}${a.overdue ? ' · đã quá hạn' : ''}`);
  if (a.refusal) lines.push(`Từ chối · ${a.refusal.reason}`);
  if (a.adjustment) {
    const status = { PENDING: 'Chờ AM xác minh', VERIFIED: 'Chờ HR quyết định', APPROVED: 'Đã duyệt', REJECTED: 'Đã từ chối' };
    lines.push(`Điều chỉnh · ${status[a.adjustment.status]}`, `Lý do · ${a.adjustment.reason}`, `Bằng chứng · ${a.adjustment.evidenceRef}`);
    if (a.adjustment.amNote) lines.push('Ghi chú AM · ' + a.adjustment.amNote);
    if (a.adjustment.hrDecision) lines.push('Quyết định HR · ' + a.adjustment.hrDecision.reason);
  }
  if (a.aiProposal) lines.push(`Đề xuất AI · ${a.aiProposal.suggestedGrowthPercent == null ? 'chưa đủ dữ liệu' : a.aiProposal.suggestedGrowthPercent + '%'}`, a.aiProposal.rationale ?? '');
  if (r) {
    lines.push(`Kết quả · ${resultStatus[r.status]} · thực tế ${revenueMoney(r.actualRevenueVnd)}`,
      `Hoàn thành · ${r.achievementPercent == null ? '—' : r.achievementPercent + '%'}${r.achieved === null ? '' : r.achieved ? ' · đạt' : ' · chưa đạt'}`);
    if (r.dataKind === 'demo') lines.push('Nguồn kết quả · POS demo');
    if (r.missReason) lines.push('Giải trình · ' + r.missReason.text, ...(r.missReason.reviewNote ? ['Ghi chú HR · ' + r.missReason.reviewNote] : []));
    if (a.unitType === 'AREA') lines.push(...r.stores.map(store => `• ${store.storeName} · ${revenueMoney(store.actualRevenueVnd)} / ${revenueMoney(store.targetVnd)}`));
  }
  if (history) {
    lines.push('', 'Thời gian phụ trách', ...a.responsibility.map(s => `• ${s.employeeName} · ${localTime(s.from)} → ${s.to ? localTime(s.to) : 'hiện tại'}`),
      '', 'Lịch sử xử lý');
    for (const event of [...a.history, ...(r?.history ?? [])].sort((x, y) => x.at.localeCompare(y.at))) {
      lines.push(`• ${localTime(event.at)} · ${eventLabels[event.action] ?? event.action}${event.reason ? ' · ' + event.reason : ''}`);
    }
  }
  return lines.filter((line, i) => line || i > 0).join('\n');
}

function exportReport(d: RevenueKpiDashboard, rows: RevenueKpiAssignment[]) {
  const escape = (raw: string | number | null) => {
    const value = String(raw ?? '');
    const safe = typeof raw === 'string' && /^[\s\uFEFF]*[=+\-@\t\r\n]/.test(value) ? "'" + value : value;
    return '"' + safe.replace(/"/g, '""') + '"';
  };
  const headers = ['Kỳ', 'Cửa hàng / Khu vực', 'Người phụ trách', 'Mục tiêu', 'Doanh thu thực tế', '% hoàn thành', 'Trạng thái KPI', 'Kết quả', 'Nguồn'];
  const lines = rows.map(a => {
    const r = d.results.find(item => item.assignmentId === a.id);
    return [a.period, unitName(a), a.assigneeName, a.targetVnd, r?.actualRevenueVnd ?? null, r?.achievementPercent ?? null,
      assignmentStatus[a.status], r ? resultStatus[r.status] : '', r?.dataKind ?? ''].map(escape).join(',');
  });
  const url = URL.createObjectURL(new Blob(['\uFEFF' + [headers.map(escape).join(','), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `GUTA_KPI_DoanhThu_${d.period.period}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function pendingLabel(d: RevenueKpiDashboard, a: RevenueKpiAssignment, employeeId: string | undefined, can: (cap: AuthorizationCapability) => boolean) {
  const r = d.results.find(row => row.assignmentId === a.id);
  if (owner(a, employeeId) && a.status === 'PENDING_ACCEPTANCE') return a.overdue ? 'Quá hạn nhận KPI' : 'Chờ bạn nhận KPI';
  if (owner(a, employeeId) && r?.status === 'AWAITING_REASON') return 'Chờ bạn giải trình chưa đạt';
  if (can('revenue_kpi.verify_adjustment') && canUseUnit(d, a, 'verify', employeeId)) return 'Chờ AM xác minh điều chỉnh';
  if (can('revenue_kpi.approve')) {
    if (['REFUSED', 'HR_REVIEW'].includes(a.status)) return 'Chờ HR xử lý mục tiêu bị từ chối';
    if (a.adjustment?.status === 'VERIFIED') return 'Chờ HR quyết định điều chỉnh';
    if (r?.missReason && !r.missReason.reviewDecision) return 'Chờ HR xét giải trình';
    if (canUseUnit(d, a, 'confirm', employeeId)) return 'Chờ HR xác nhận kết quả';
    if (r?.status === 'PENDING_DATA') return 'Thiếu dữ liệu POS';
    if (a.status === 'DRAFT') return 'Bản nháp chưa phát hành';
  }
  return null;
}

function filteredRows(d: RevenueKpiDashboard, text: string, employeeId?: string) {
  const q = revenueText(text);
  const rows = d.assignments.filter(a => {
    if (/cua toi|cua minh|cua em/.test(q) && !owner(a, employeeId)) return false;
    if (/\b(?:khu vuc|cum cua hang)\b/.test(q) && a.unitType !== 'AREA') return false;
    if (/\b(?:cua hang|chi nhanh)\b/.test(q) && !/cum cua hang/.test(q) && a.unitType !== 'STORE') return false;
    if (/\bban nhap\b/.test(q) && a.status !== 'DRAFT') return false;
    if (/\bchua dat\b/.test(q) && d.results.find(r => r.assignmentId === a.id)?.achieved !== false) return false;
    if (/\bda dat\b/.test(q) && d.results.find(r => r.assignmentId === a.id)?.achieved !== true) return false;
    if (/\bda xac nhan\b/.test(q) && !d.results.some(r => r.assignmentId === a.id && ['CONFIRMED', 'CORRECTED'].includes(r.status))) return false;
    if (/\bda chot\b/.test(q) && a.status !== 'CLOSED') return false;
    return true;
  });
  const named = pickRevenueChoice(text, rows, unitName);
  const byPerson = named.length ? named : pickRevenueChoice(text, rows, a => a.assigneeName);
  return byPerson.length ? byPerson : rows;
}

export function useRevenueKpiChat({
  grants, onChanged,
}: { grants: readonly AuthorizationCapability[]; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const session = useRef<Session>();
  const decision = useRef<Decision>();
  const inFlight = useRef<AbortController>();
  const can = (cap: AuthorizationCapability) => grants.includes(cap);

  const reset = () => {
    inFlight.current?.abort();
    inFlight.current = undefined;
    session.current = undefined;
    decision.current = undefined;
    setBusy(false);
  };
  useEffect(() => () => inFlight.current?.abort(), []);

  function send(text: string, append: (turn: Turn) => void, allowContext = true) {
    const intent = detectRevenueIntent(text, allowContext && !!session.current);
    if (!intent && !decision.current) return false;
    if (inFlight.current) return true;
    const controller = new AbortController();
    inFlight.current = controller;
    const signal = controller.signal;
    const say = (reply: string) => { if (!signal.aborted) append({ sender: 'assistant', text: reply }); };
    const q = revenueText(text).replace(/[.!?]+$/, '');
    const { instruction } = revenueParts(text);
    append({ sender: 'user', text });
    setBusy(true);

    async function advance(result: IteratorResult<string, Plan>, step: Step<Plan>) {
      if (result.done) {
        if (result.value.readOnly) { say(await result.value.execute(signal)); return; }
        decision.current = { plan: result.value };
        say(planned(result.value));
      } else {
        decision.current = { step };
        say(result.value);
      }
    }

    async function respond() {
      const pending = decision.current;
      if (pending && /^(?:huy|huy thao tac|dung lai|bo qua|thoi)$/.test(q)) {
        decision.current = undefined;
        say('Đã hủy thao tác KPI đang chuẩn bị.');
        return;
      }
      if (pending && 'step' in pending) {
        decision.current = undefined;
        await advance(pending.step.next(text), pending.step);
        return;
      }
      if (pending && 'plan' in pending) {
        if (/^(?:toi )?(?:xac nhan(?: thuc hien)?|dong y|tien hanh|thuc hien)$/.test(q)) {
          decision.current = undefined;
          say(await pending.plan.execute(signal));
          if (!signal.aborted) onChanged();
          return;
        }
        if (intent !== 'seed-baseline' && intent !== 'diversify') {
          say('Nhắn “xác nhận” để thực hiện nội dung vừa xem hoặc “hủy” để dừng.');
          return;
        }
        decision.current = undefined;
      }
      if (!intent) return;
      if (!can('revenue_kpi.read_scope') && !can('revenue_kpi.read_self')) {
        say('Tài khoản của bạn chưa có quyền xem KPI doanh thu.');
        return;
      }
      const capability = capabilities[intent];
      if (capability && !can(capability)) {
        say('Tài khoản của bạn chưa có quyền thực hiện thao tác KPI doanh thu này.');
        return;
      }
      if (intent === 'help') {
        const lines = ['Bạn có thể hỏi “KPI doanh thu tháng này của tôi”, “xem mục 1”, “xem lịch sử” hoặc “xuất báo cáo”.'];
        if (can('revenue_kpi.respond')) lines.push('Bạn có thể chấp nhận, từ chối nhận KPI, xin điều chỉnh hoặc gửi giải trình chưa đạt.');
        if (can('revenue_kpi.verify_adjustment')) lines.push('Bạn có thể xác minh yêu cầu điều chỉnh của cửa hàng thuộc khu vực.');
        if (can('revenue_kpi.assign')) lines.push('Bạn có thể tạo và mở kỳ, giao hoặc sửa mục tiêu, lấy và áp dụng đề xuất AI, phát hành, đổi SM và xử lý các yêu cầu.');
        if (can('revenue_kpi.close')) lines.push('Bạn có thể tính kết quả, xét giải trình, xác nhận kết quả, kiểm tra điều kiện chốt, chốt kỳ và điều chỉnh sau chốt.');
        say(lines.join('\n'));
        return;
      }
      const period = revenueMonth(instruction, session.current?.period ?? currentRevenueMonth());
      const current = session.current?.period === period ? session.current : { period, options: [] };
      session.current = current;
      if (intent === 'periods') {
        const { items } = await api.listRevenueKpiPeriods();
        say(items.length ? items.map(p => `${p.period} · ${periodStatus[p.status]}`).join('\n') : 'Chưa có kỳ KPI doanh thu.');
        return;
      }
      if (intent === 'create') {
        const step = createRevenuePlan(period);
        await advance(step.next(), step);
        return;
      }
      if (intent === 'open') {
        const plan = await openRevenuePlan(period);
        if (signal.aborted) return;
        decision.current = { plan };
        say(planned(plan));
        return;
      }
      if (intent === 'seed-baseline') {
        const plan = await seedBaselinePlan(period);
        if (signal.aborted) return;
        decision.current = { plan };
        say(planned(plan));
        return;
      }
      const [d, me] = await Promise.all([api.getRevenueKpiDashboard(period), fetchMe()]);
      const employeeId = me.employeeId ?? undefined;
      if (signal.aborted) return;
      if (intent === 'diversify') {
        const plan = diversifyRevenuePlan(d);
        decision.current = { plan };
        say(planned(plan));
        return;
      }
      if (intent === 'close-check') {
        const blockers = closeBlockers(d);
        say(blockers.length ? `Kỳ ${period} còn ${blockers.length} mục chặn chốt.\n${blockers.map(item => '• ' + item).join('\n')}`
          : `Kỳ ${period} đã đủ điều kiện. Bạn có thể nhắn “chốt kỳ”.`);
        return;
      }
      if (intent === 'compute' || intent === 'close') {
        const plan = computeOrClose(d, intent === 'close');
        decision.current = { plan };
        say(planned(plan));
        return;
      }
      if (intent === 'draft') {
        const step = draftRevenuePlan(d, text);
        await advance(step.next(), step);
        return;
      }
      if (intent === 'list' || intent === 'pending' || intent === 'export') {
        const rows = filteredRows(d, instruction, employeeId);
        const selected = intent === 'pending'
          ? rows.flatMap(a => { const label = pendingLabel(d, a, employeeId, can); return label ? [{ a, label }] : []; })
          : rows.map(a => ({ a, label: assignmentStatus[a.status] }));
        if (intent === 'export') {
          exportReport(d, rows);
          say(`Đã xuất báo cáo KPI doanh thu kỳ ${period} với ${rows.length} mục, dạng CSV mở được bằng Excel.`);
          return;
        }
        current.options = selected.map(({ a }) => a.id);
        current.selected = selected.length === 1 ? selected[0].a.id : undefined;
        say([`Kỳ ${period} · ${periodStatus[d.period.status]} · ${selected.length} ${intent === 'pending' ? 'mục cần xử lý' : 'KPI'}.`,
          ...selected.map(({ a, label }, i) => `${i + 1}. ${unitName(a)} · ${label} · ${revenueMoney(a.targetVnd)}`),
          ...(selected.length ? ['\nNhắn “xem mục 1” để đọc chi tiết.'] : []), ...(intent === 'pending' ? d.flags.map(flag => '• ' + flag) : [])].join('\n'));
        return;
      }
      if (isUnitIntent(intent) && /\b(?:hang loat|tat ca|toan bo|dong loat)\b/.test(revenueText(instruction))
        && (intent === 'ai' || intent === 'apply-ai' || intent === 'publish' || intent === 'confirm')) {
        const plan = bulkRevenuePlan(d, intent, filteredRows(d, instruction, employeeId));
        decision.current = { plan };
        say(planned(plan));
        return;
      }
      const unitIntent = isUnitIntent(intent) ? intent : undefined;
      function* select(): Step<Plan> {
        const a = yield* selectAssignment(d, current, instruction, unitIntent, employeeId);
        current.selected = a.id;
        if (!unitIntent) return { summary: '', readOnly: true, execute: async () => describe(d, a, intent === 'history') };
        return yield* unitRevenuePlan(d, a, unitIntent, text);
      }
      if (!unitIntent && intent !== 'detail' && intent !== 'history') return;
      const step = select();
      await advance(step.next(), step);
    }

    void respond().catch(error => say(error instanceof Error ? error.message : 'Chưa xử lý được KPI doanh thu.')).finally(() => {
      if (!signal.aborted) { inFlight.current = undefined; setBusy(false); }
    });
    return true;
  }
  return { busy, reset, send };
}

function* selectAssignment(d: RevenueKpiDashboard, current: Session, text: string, intent: UnitIntent | undefined, employeeId?: string): Step<RevenueKpiAssignment> {
  const ordered = current.options.map(id => d.assignments.find(a => a.id === id)).filter((a): a is RevenueKpiAssignment => !!a);
  const query = revenueText(text);
  const fromList = /\b(?:muc|so|cai) (?:\d+|dau tien)\b/.test(query) || /^(?:(?:chon|xem|doc|mo) )?\d+[.!?]*$/.test(query);
  const unitMatches = pickRevenueChoice(text, fromList ? ordered : d.assignments, unitName);
  const named = unitMatches.length || fromList ? unitMatches : pickRevenueChoice(text, d.assignments, a => a.assigneeName);
  const allowed = (a: RevenueKpiAssignment) => !intent || canUseUnit(d, a, intent, employeeId);
  if (fromList && !named.length) throw new Error('Mục này chưa có trong danh sách KPI vừa hiển thị.');
  if (named.length === 1) {
    if (!allowed(named[0])) throw new Error('KPI bạn chọn chưa đủ điều kiện cho thao tác này. Bạn có thể xem chi tiết KPI để kiểm tra trạng thái.');
    return named[0];
  }
  if (named.length > 1) return yield* choose(named.filter(allowed), unitName, 'Bạn muốn thao tác trên KPI nào?');
  const last = d.assignments.find(a => a.id === current.selected);
  if (last && !/\b(?:cua hang|chi nhanh|khu vuc)\b/.test(query)) {
    if (allowed(last)) return last;
    if (/\b(?:nay|do|vua xem)\b/.test(query)) throw new Error('KPI vừa xem chưa đủ điều kiện cho thao tác này.');
  }
  return yield* choose(filteredRows(d, text, employeeId).filter(allowed), unitName, 'Bạn muốn chọn KPI nào?');
}

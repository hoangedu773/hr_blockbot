import { RevenueKpiOpenCard, requestRevenueOpenProposal } from './RevenueKpiOpenCard';
import type { RevenueKpiOpenAction } from '@hr-blockbot/contracts';
import { useEffect, useRef, useState } from 'react';
import { RevenueKpiDashboardSchema, RevenueKpiPolicySchema, type NotificationItem, type RevenueKpiAssignment as Assignment, type RevenueKpiResult as Result, type RevenueKpiDashboard as Dashboard } from '@hr-blockbot/contracts';
import { useAuthorization } from '../context/useAuthorization';
import * as api from '../services/revenue-kpi-api';
import { ApiError, fetchMe, fetchNotifications, markNotificationRead, newClientMessageId } from '../services/api';
import './revenue-kpi.css';
const money = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n);
const percentage = (n: number | null | undefined) => n == null ? '—' : new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(n) + '%';
const date = (s: string | null) => s ? new Intl.DateTimeFormat('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'short', timeStyle: 'short' }).format(new Date(s)) : '—';
const labels: Record<string, string> = { DRAFT: 'Nháp', OPEN: 'Đang mở', PENDING_ACCEPTANCE: 'Chờ xác nhận', ACCEPTED: 'Đã xác nhận', ACTIVE: 'Đang thực hiện', REFUSED: 'Đã từ chối', HR_REVIEW: 'HR đang xem xét', ADJUSTMENT_REQUESTED: 'Yêu cầu điều chỉnh', CLOSED: 'Đã chốt', CANCELLED: 'Đã hủy', PENDING: 'Chờ tính', PENDING_DATA: 'Thiếu dữ liệu', COMPUTED: 'Đã tính', AWAITING_REASON: 'Chờ giải trình', CONFIRMED: 'Đã xác nhận kết quả', CORRECTED: 'Đã điều chỉnh', ARCHIVED: 'Đã lưu trữ' };
const pendingLabels: Record<string, string> = { STORE_WITHOUT_DATA: 'Cửa hàng chưa đủ doanh thu', INVALID_ORDERS: 'Số liệu đơn hàng cần đối chiếu', MIXED_DATA_SOURCES: 'Các cửa hàng đang dùng nguồn doanh thu khác nhau', INVALID_TARGET: 'Mục tiêu chưa hợp lệ', NO_VALID_STORES: 'Chưa có cửa hàng đủ điều kiện' };
type Modal = { kind: string; a?: Assignment; r?: Result };
type Values = { reason: string; evidenceRef: string; amount: string; growth: string; mode: string; action: string; storeId: string; employeeId: string; unitType: string; force: boolean; allowDemo: boolean; threshold: string; days: string; waive: boolean; from: string };
const defaults = (): Values => ({ reason: '', evidenceRef: '', amount: '', growth: '3', mode: 'GROWTH_PERCENT', action: 'ADJUST', storeId: '', employeeId: '', unitType: 'STORE', force: false, allowDemo: false, threshold: '30', days: '3', waive: false, from: '' });
const initialMonth = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' }).format(new Date()).slice(0, 7);
const saveAiTarget = (a: Assignment, growthPercent: number, clientRequestId: string) =>
  api.saveRevenueKpiAssignment({
    id: a.id, expectedVersion: a.version, clientRequestId, period: a.period, unitType: 'STORE',
    storeId: a.storeId, assigneeEmployeeId: a.assigneeEmployeeId, targetMode: 'GROWTH_PERCENT',
    growthPercent, reason: 'HR áp dụng đề xuất tham khảo sau xem xét.',
  });
export function RevenueKpiView() {
  const { can, summary } = useAuthorization();
  const [employeeId, setEmployeeId] = useState<string | null>(null), [identityError, setIdentityError] = useState('');
  const [period, setPeriod] = useState(initialMonth), [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [periods, setPeriods] = useState<string[]>([]), [missing, setMissing] = useState(false), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState(''), [reload, setReload] = useState(0);
  const [openProposal, setOpenProposal] = useState<RevenueKpiOpenAction | null>(null);
  const [previewBusy, setPreviewBusy] = useState(false);
  const [modal, setModal] = useState<Modal | null>(null), [values, setValues] = useState<Values>(defaults);
  const [notices, setNotices] = useState<NotificationItem[]>([]), [unread, setUnread] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null), trigger = useRef<HTMLElement | null>(null), commandCache = useRef<{ key: string; id: string } | null>(null);
  const hr = can('revenue_kpi.assign'), am = can('revenue_kpi.verify_adjustment');
  const authority = JSON.stringify(summary);
  useEffect(() => { let alive = true; setNotices([]); const load = () => { void fetchNotifications(30, 'revenue_kpi').then(r => { if (alive) { setNotices(r.items); setUnread(r.unread); } }).catch(() => {}); }; load(); const timer = setInterval(load, 30000); return () => { alive = false; clearInterval(timer); }; }, [authority, reload]);
  useEffect(() => { let live = true; setEmployeeId(null); setIdentityError(''); void fetchMe().then(me => { if (live) setEmployeeId(me.employeeId ?? null); }).catch(() => { if (live) setIdentityError('Không xác định được tài khoản của bạn; các thao tác của người phụ trách tạm ẩn. Tải lại trang để thử lại.'); }); return () => { live = false; }; }, [authority]);
  useEffect(() => {
    let live = true; setLoading(true); setDashboard(null); setError(''); setMissing(false); setModal(null);
    if (!['hr', 'am', 'sm'].includes(summary?.profile ?? '')) { setLoading(false); setError('Bạn chưa có quyền KPI doanh thu.'); return; }
    Promise.all([api.listRevenueKpiPeriods(), api.getRevenueKpiDashboard(period)]).then(([p, d]) => { if (live) { setPeriods(p.items.map(p => p.period)); setDashboard(RevenueKpiDashboardSchema.parse(d)); } })
      .catch(e => { if (!live) return; if (e instanceof ApiError && e.status === 404) { setMissing(true); void api.listRevenueKpiPeriods().then(p => { if (live) setPeriods(p.items.map(p => p.period)); }); } else setError(e instanceof Error ? e.message : 'Không tải được KPI doanh thu.'); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [period, reload, authority]);
  useEffect(() => { if (modal && !dialog.current?.open) dialog.current?.showModal(); if (!modal && dialog.current?.open) dialog.current.close(); }, [modal]);
  const cmd = (version: number, extras: Record<string, unknown> = {}) => {
    const key = JSON.stringify({ period, modal: modal?.kind, a: modal?.a?.id, version, extras });
    if (commandCache.current?.key !== key) commandCache.current = { key, id: newClientMessageId() };
    return { expectedVersion: version, clientRequestId: commandCache.current.id, ...extras };
  };
  const open = (kind: string, a?: Assignment, r?: Result) => {
    trigger.current = document.activeElement as HTMLElement; commandCache.current = null;
    setValues({ ...defaults(), growth: String(a?.growthPercent ?? dashboard?.period.policy.defaultGrowthPercent ?? 3), amount: a ? String(a.targetVnd) : '', storeId: a?.storeId ?? '', employeeId: a?.assigneeEmployeeId ?? '', unitType: a?.unitType ?? 'STORE', mode: a?.targetMode ?? 'GROWTH_PERCENT' }); setError(''); setModal({ kind, a, r });
  };
  const close = () => { if (busy) return; setModal(null); trigger.current?.focus(); };
  const run = async (operation: () => Promise<unknown>, message: string) => {
    setBusy(true); setError(''); try { await operation(); commandCache.current = null; setModal(null); setNotice(message); setReload(n => n + 1); trigger.current?.focus(); } catch (e) { setError(e instanceof Error ? e.message : 'Thao tác chưa hoàn tất.'); } finally { setBusy(false); }
  };
  const ask = (kind: string, a?: Assignment, r?: Result) => <button type="button" disabled={busy} onClick={() => open(kind, a, r)}>{({ publish: 'Phát hành', accept: 'Chấp nhận', refuse: 'Từ chối', decision: 'HR xử lý', request: 'Xin điều chỉnh', verify: 'AM xác minh', adjustment: 'HR quyết định', reason: 'Gửi giải trình', review: 'Xem xét giải trình', confirm: 'Xác nhận kết quả', correct: 'Điều chỉnh sau chốt', edit: 'Sửa mục tiêu', responsibility: 'Đổi SM phụ trách', ai: 'Đề xuất AI' } as Record<string, string>)[kind]}</button>;
  const submit = async () => {
    if (!modal) return;
    const { kind, a, r } = modal, p = dashboard?.period, reason = values.reason.trim();
    const targetChange = () => values.mode === 'ABSOLUTE_VND' || a?.unitType === 'AREA' ? { newTargetVnd: Number(values.amount) } : { newGrowthPercent: Number(values.growth) };
    await run(async () => {
      if (kind === 'create') return api.createRevenueKpiPeriod(cmd(0, { period, policy: RevenueKpiPolicySchema.parse({ defaultGrowthPercent: Number(values.growth), underperformingRateThresholdPercent: Number(values.threshold), acceptanceWindowWorkingDays: Number(values.days), allowDemoData: values.allowDemo }) }));
      if (kind === 'compute') return api.computeRevenueKpiPeriod(period, cmd(p!.version));
      if (kind === 'close') return api.closeRevenueKpiPeriod(period, cmd(p!.version));
      if (kind === 'draft' || kind === 'edit') return api.saveRevenueKpiAssignment(cmd(a?.version ?? 0, { ...(a ? { id: a.id } : {}), period, unitType: values.unitType, ...(values.unitType === 'STORE' ? { storeId: values.storeId } : {}), assigneeEmployeeId: values.employeeId,
        targetMode: values.mode, ...(values.unitType === 'STORE' ? values.mode === 'ABSOLUTE_VND' ? { targetVnd: Number(values.amount) } : { growthPercent: Number(values.growth) } : {}), reason }));
      if (kind === 'publish') return api.publishRevenueKpiAssignment(a!.id, cmd(a!.version));
      if (kind === 'accept') return api.acceptRevenueKpiAssignment(a!.id, cmd(a!.version));
      if (kind === 'refuse') return api.refuseRevenueKpiAssignment(a!.id, cmd(a!.version, { reason }));
      if (kind === 'decision') return api.decideRevenueKpiAssignment(a!.id, cmd(a!.version, { action: values.action, reason, force: values.force, ...(values.action === 'ADJUST' ? targetChange() : {}) }));
      if (kind === 'request') return api.requestRevenueKpiAdjustment(a!.id, cmd(a!.version, { reason, evidenceRef: values.evidenceRef }));
      if (kind === 'verify') return api.verifyRevenueKpiAdjustment(a!.id, cmd(a!.version, { reason }));
      if (kind === 'adjustment') return api.decideRevenueKpiAdjustment(a!.id, cmd(a!.version, { action: values.action === 'REJECT' ? 'REJECT' : 'APPROVE', reason, ...(values.action === 'REJECT' ? {} : targetChange()) }));
      if (kind === 'reason') return api.submitRevenueKpiMissReason(r!.id, cmd(r!.version, { text: reason }));
      if (kind === 'review') return api.reviewRevenueKpiReason(r!.id, cmd(r!.version, { decision: values.action === 'REJECT' ? 'REJECTED' : 'ACKNOWLEDGED', note: reason }));
      if (kind === 'confirm') return api.confirmRevenueKpiResult(r!.id, cmd(r!.version, values.waive ? { waiveReason: reason } : {}));
      if (kind === 'correct') return api.correctRevenueKpiResult(r!.id, cmd(r!.version, { reason }));
      if (kind === 'ai') return api.proposeRevenueKpiTarget(a!.id, cmd(a!.version));
      if (kind === 'apply-ai' && a?.aiProposal?.suggestedGrowthPercent != null)
        return saveAiTarget(a, a.aiProposal.suggestedGrowthPercent, cmd(a.version).clientRequestId);
      if (kind === 'responsibility') return api.changeRevenueKpiResponsibility(a!.id, cmd(a!.version, { assigneeEmployeeId: values.employeeId, from: new Date(values.from + '+07:00').toISOString(), reason }));
    }, kind === 'apply-ai' ? 'Đã áp dụng đề xuất cho bản nháp cửa hàng. Bạn có thể chỉnh sửa trước khi phát hành.' : 'Đã lưu thay đổi KPI doanh thu.');
  };
  const bulk = (kind: 'ai' | 'apply' | 'publish') => run(async () => {
    const drafts = dashboard!.assignments.filter(a => a.status === 'DRAFT' && (kind !== 'ai' && kind !== 'apply' || a.unitType === 'STORE'));
    for (const a of drafts) {
      if (kind === 'ai') await api.proposeRevenueKpiTarget(a.id, { expectedVersion: a.version, clientRequestId: newClientMessageId() });
      else if (kind === 'publish') {
        const prepared = a.unitType === 'AREA' ? await api.saveRevenueKpiAssignment({ id: a.id, period, unitType: 'AREA', assigneeEmployeeId: a.assigneeEmployeeId, targetMode: 'ABSOLUTE_VND', reason: 'HR đồng bộ tổng mục tiêu các cửa hàng trước phát hành.', expectedVersion: a.version, clientRequestId: newClientMessageId() }) : a;
        await api.publishRevenueKpiAssignment(prepared.id, { expectedVersion: prepared.version, clientRequestId: newClientMessageId() });
      }
      else if (a.aiProposal?.suggestedGrowthPercent != null) await saveAiTarget(a, a.aiProposal.suggestedGrowthPercent, newClientMessageId());
    }
  }, kind === 'apply' ? 'Đã áp dụng đề xuất vào bản nháp. Cần kiểm tra và phát hành riêng.' : kind === 'ai' ? 'Đã lấy đề xuất cho các cửa hàng đủ dữ liệu.' : 'Đã phát hành các bản nháp đủ điều kiện.');
  const v = (key: keyof Values, value: string | boolean) => setValues(x => ({ ...x, [key]: value }));
  const previewOpen = async () => {
    setError('');
    setPreviewBusy(true);
    try { setOpenProposal(await requestRevenueOpenProposal(period)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Chưa lập được bản xem trước.'); }
    finally { setPreviewBusy(false); }
  };
  const isOpen = dashboard?.period.status === 'OPEN', selected = modal?.a;
  return <section className="revenue-kpi" aria-labelledby="rk-title" aria-busy={loading || busy}>
    <header><div><p className="rk-eyebrow">MỤC TIÊU VẬN HÀNH</p><h1 id="rk-title">KPI doanh thu</h1><p>Mục tiêu theo cửa hàng và khu vực · HR xem xét, người nhận xác nhận.</p></div>
      <label>Kỳ tháng<input aria-label="Kỳ KPI doanh thu" type="month" value={period} onChange={e => setPeriod(e.target.value)} /></label></header>
    {periods.length > 0 && <nav aria-label="Các kỳ KPI">{periods.map(p => <button key={p} type="button" aria-pressed={p === period} onClick={() => setPeriod(p)}>{p.slice(5)}/{p.slice(0, 4)}</button>)}</nav>}
    {notice && <p role="status" className="rk-notice">{notice}</p>}{error && !modal && <p role="alert" className="rk-error">{error}</p>}{identityError && <p role="alert" className="rk-error">{identityError}</p>}
    <details className="rk-flags"><summary>Thông báo KPI doanh thu · {unread} chưa đọc</summary>{!notices.length && <p>Chưa có thông báo gần đây.</p>}{notices.map(n => <article key={n.id}><p><strong>{n.title}</strong> · {date(n.createdAt)}</p><p>{n.body}</p>{!n.readAt && <button type="button" onClick={() => void markNotificationRead(n.id).then(() => { setNotices(old => old.map(item => item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item)); setUnread(n => Math.max(0, n - 1)); }).catch(() => setError('Chưa đánh dấu được thông báo.'))}>Đánh dấu đã đọc</button>}</article>)}{notices.length >= 30 && <button type="button" onClick={() => void fetchNotifications(30, 'revenue_kpi', notices[notices.length - 1].createdAt).then(r => setNotices(old => [...old, ...r.items.filter(n => !old.some(item => item.id === n.id))]))}>Xem thông báo cũ</button>}</details>
        {hr && openProposal?.preview.period === period && <RevenueKpiOpenCard key={openProposal.actionId} initial={openProposal} onExecuted={() => setReload(n => n + 1)} />}
    {loading ? <p role="status">Đang tải KPI doanh thu…</p> : missing ? <div className="rk-empty"><h2>Chưa có kỳ KPI này</h2><p>{hr ? 'Tạo kỳ, đặt mức tăng và ngưỡng đánh giá trước khi giao mục tiêu.' : 'HR chưa giao mục tiêu cho bạn trong kỳ này.'}</p>{hr && <button type="button" onClick={() => open('create')}>Tạo kỳ KPI</button>}</div> : dashboard && <>
      <div className="rk-policy"><strong>{labels[dashboard.period.status]}</strong><span>Tăng mặc định {percentage(dashboard.period.policy.defaultGrowthPercent)}</span><span>Ngưỡng cửa hàng chưa đạt ≤ {percentage(dashboard.period.policy.underperformingRateThresholdPercent)}</span><span>Xác nhận trong {dashboard.period.policy.acceptanceWindowWorkingDays} ngày làm việc</span></div>
      {hr && <div className="rk-toolbar">
        {(dashboard.period.status === 'DRAFT' || isOpen) && <button type="button" disabled={busy || previewBusy}
          onClick={() => void previewOpen()}>{previewBusy ? 'Đang lập bản xem trước…' : isOpen ? 'Xem trước bản nháp còn thiếu' : 'Xem trước mở kỳ'}</button>}
        {isOpen && <><button type="button" disabled={busy} onClick={() => open('draft')}>Thêm mục tiêu</button><button type="button" disabled={busy || !dashboard.assignments.some(a => a.status === 'DRAFT' && a.unitType === 'STORE')} onClick={() => void bulk('ai')}>Đề xuất AI hàng loạt</button><button type="button" disabled={busy || !dashboard.assignments.some(a => a.status === 'DRAFT' && a.aiProposal?.suggestedGrowthPercent != null)} onClick={() => open('bulk-apply')}>Áp dụng đề xuất đã xem</button><button type="button" disabled={busy || !dashboard.assignments.some(a => a.status === 'DRAFT')} onClick={() => open('bulk-publish')}>Phát hành bản nháp</button><button type="button" disabled={busy} onClick={() => open('compute')}>Tính kết quả</button><button type="button" disabled={busy} onClick={() => open('close')}>Chốt kỳ</button></>}
      </div>}
      {hr && dashboard.flags.length > 0 && <details className="rk-flags"><summary>Cần kiểm tra người phụ trách ({dashboard.flags.length})</summary><ul>{dashboard.flags.map((f, i) => <li key={i}>{f}</li>)}</ul><p>Không có SM: chưa giao. Chưa xác định SM chính: HR chọn người có căn cứ khi thêm mục tiêu.</p></details>}
      {!dashboard.assignments.length && <p className="rk-empty">Chưa có mục tiêu trong phạm vi của bạn.</p>}
      <div className="rk-assignment-list">{dashboard.assignments.map(a => { const result = dashboard.results.find(r => r.assignmentId === a.id), own = a.assigneeEmployeeId === employeeId, needsReason = result?.achieved === false;
        return <article key={a.id} className="rk-assignment" aria-label={`KPI ${a.unitType === 'AREA' ? 'khu vực' : 'cửa hàng'} ${a.assigneeName}`}>
          <div className="rk-assignment-head"><div><p>{a.unitType === 'AREA' ? 'KHU VỰC · AM' : 'CỬA HÀNG · SM'}</p><h2>{a.unitType === 'AREA' ? `Khu vực ${a.assigneeName}` : a.stores[0].storeName}</h2><span>Phụ trách: {a.assigneeName}</span></div><strong className={'rk-state rk-state-' + a.status.toLowerCase()}>{labels[a.status]}</strong></div>
          <div className="rk-metrics"><div><span>Tháng gốc {a.basePeriod?.slice(5)}/{a.basePeriod?.slice(0, 4)}</span><strong>{money(a.baseRevenueVnd)}</strong></div><div><span>Mục tiêu {a.growthPercent == null ? 'VND' : `(${percentage(a.growthPercent)})`}</span><strong>{money(a.targetVnd)}</strong></div><div><span>Doanh thu kỳ này</span><strong>{money(result?.actualRevenueVnd)}</strong></div><div><span>Hoàn thành</span><strong>{percentage(result?.achievementPercent)}</strong><small>{result?.achieved === true ? 'Đạt' : result?.achieved === false ? 'Chưa đạt' : 'Chưa kết luận'}</small></div></div>
          {a.deadlineAt && a.status === 'PENDING_ACCEPTANCE' && <p className="rk-sub">Hạn xác nhận: {date(a.deadlineAt)}{a.overdue || Date.parse(a.deadlineAt) < Date.now() ? ' · Quá hạn — chờ HR xem xét, chưa tự chấp nhận' : ''}</p>}
          {result && <p className="rk-result-status">{labels[result.status]}{a.unitType === 'AREA' && result.underperformingStoreCount !== null ? ` · ${result.underperformingStoreCount}/${result.stores.length} cửa hàng chưa đạt (${percentage(result.underperformingStoreRatePercent)})` : ''}{result.assignmentVersion !== a.version && a.status !== 'CLOSED' ? ' · Mục tiêu đã cập nhật, cần tính lại' : ''}</p>}
          {result?.pendingReasons.length ? <ul className="rk-pending">{result.pendingReasons.map(r => <li key={r}>{pendingLabels[r] ?? 'Dữ liệu cần đối chiếu'}</li>)}</ul> : null}
          {a.refusal && <p className="rk-note"><strong>Lý do từ chối:</strong> {a.refusal.reason}</p>}
          {a.adjustment && <div className="rk-note"><p><strong>Điều chỉnh:</strong> {a.adjustment.reason}</p><p>Bằng chứng/tham chiếu: {a.adjustment.evidenceRef}</p>{a.adjustment.amNote && <p>AM xác minh: {a.adjustment.amNote}</p>}{a.adjustment.hrDecision && <p>HR: {a.adjustment.hrDecision.reason}</p>}</div>}
          {result?.missReason && <p className="rk-note"><strong>Giải trình:</strong> {result.missReason.text}{result.missReason.reviewNote ? ` · HR xem xét: ${result.missReason.reviewNote}` : ''}</p>}
          {a.aiProposal && <div className="rk-ai">
            <strong>Đề xuất tham khảo, HR quyết định</strong>
            <p>{a.aiProposal.suggestedGrowthPercent == null ? 'Chưa đủ dữ liệu để đề xuất.' : `Mức đề xuất ${percentage(a.aiProposal.suggestedGrowthPercent)} · Khoảng ${percentage(a.aiProposal.rangeMinPercent)} đến ${percentage(a.aiProposal.rangeMaxPercent)}`}</p>
            <p>{a.aiProposal.rationale}</p>
            <small>{a.aiProposal.degraded ? 'Đang dùng phân tích dự phòng' : 'Đề xuất AI'} · {a.aiProposal.dataMonths}/3 tháng dữ liệu</small>
            {hr && isOpen && a.unitType === 'STORE' && a.status === 'DRAFT' && a.aiProposal.suggestedGrowthPercent != null &&
              (a.growthPercent === a.aiProposal.suggestedGrowthPercent
                ? <small>Mục tiêu nháp đã khớp mức đề xuất.</small>
                : <button type="button" disabled={busy} onClick={() => open('apply-ai', a)}>Áp dụng đề xuất</button>)}
          </div>}
          {a.unitType === 'AREA' && <div className="rk-table"><table><thead><tr><th>Cửa hàng đã giao</th><th>Mục tiêu</th><th>Doanh thu</th><th>Hoàn thành</th></tr></thead><tbody>{a.stores.map(s => { const r = result?.stores.find(r => r.storeId === s.storeId); return <tr key={s.storeId}><td>{s.storeName}</td><td>{money(s.targetVnd)}</td><td>{money(r?.actualRevenueVnd)}</td><td>{percentage(r?.achievementPercent)} {r?.achieved === true ? '· Đạt' : r?.achieved === false ? '· Chưa đạt' : ''}</td></tr>; })}</tbody></table></div>}
          <div className="rk-actions">
            {hr && isOpen && a.status === 'DRAFT' && <>{ask('edit', a)}{a.unitType === 'STORE' && ask('ai', a)}{ask('publish', a)}</>}
            {own && can('revenue_kpi.respond') && a.status === 'PENDING_ACCEPTANCE' && isOpen && <>{ask('accept', a)}{ask('refuse', a)}</>}
            {hr && isOpen && !['CANCELLED', 'CLOSED'].includes(a.status) && ask('decision', a)}
            {own && can('revenue_kpi.request_adjustment') && a.status === 'ACTIVE' && isOpen && ask('request', a)}
            {am && !own && a.unitType === 'STORE' && a.status === 'ADJUSTMENT_REQUESTED' && a.adjustment?.status === 'PENDING' && ask('verify', a)}
            {hr && isOpen && a.status === 'ADJUSTMENT_REQUESTED' && ask('adjustment', a)}
            {own && result && needsReason && ['AWAITING_REASON', 'COMPUTED'].includes(result.status) && isOpen && ask('reason', a, result)}
            {hr && result && isOpen && result.status === 'COMPUTED' && result.missReason && ask('review', a, result)}
            {hr && result && isOpen && ['COMPUTED', 'AWAITING_REASON'].includes(result.status) && ask('confirm', a, result)}
            {hr && result && dashboard.period.status === 'CLOSED' && ask('correct', a, result)}
            {hr && isOpen && a.unitType === 'STORE' && ['ACTIVE', 'PENDING_ACCEPTANCE'].includes(a.status) && ask('responsibility', a)}
          </div>
          <details className="rk-history"><summary>Lịch sử và thời gian phụ trách</summary>{a.responsibility.map((r, i) => <p key={i}>{r.employeeName}: {date(r.from)} → {r.to ? date(r.to) : 'hiện tại'}</p>)}<ol>{[...a.history, ...(result?.history ?? [])].map((h, i) => <li key={i}>{date(h.at)} · {h.actorKind === 'SYSTEM' ? 'Hệ thống nhắc hạn' : labels[h.toStatus ?? ''] ?? 'Cập nhật KPI'}{h.reason ? ` · ${h.reason}` : ''}</li>)}</ol></details>
        </article>;
      })}</div>
    </>}
    <dialog ref={dialog} className="rk-dialog" aria-labelledby="rk-dialog-title" onCancel={e => { e.preventDefault(); close(); }}>
      {modal && <form onSubmit={e => { e.preventDefault(); if (modal.kind === 'bulk-apply' || modal.kind === 'bulk-publish') void bulk(modal.kind === 'bulk-apply' ? 'apply' : 'publish'); else void submit(); }}>
        <div className="rk-dialog-head"><h2 id="rk-dialog-title">{({ create: 'Tạo kỳ KPI doanh thu', compute: 'Tính kết quả doanh thu', close: 'Chốt kỳ KPI', draft: 'Thêm mục tiêu', edit: 'Sửa mục tiêu nháp', publish: 'Phát hành mục tiêu', accept: 'Chấp nhận KPI', refuse: 'Từ chối KPI', decision: 'HR xử lý mục tiêu', request: 'Yêu cầu điều chỉnh', verify: 'AM xác minh', adjustment: 'HR quyết định điều chỉnh', reason: 'Giải trình kết quả', review: 'Xem xét giải trình', confirm: 'Xác nhận kết quả', correct: 'Điều chỉnh sau chốt', responsibility: 'Cập nhật SM phụ trách', ai: 'Lấy đề xuất AI', 'apply-ai': 'Áp dụng đề xuất cho cửa hàng', 'bulk-apply': 'Áp dụng đề xuất vào bản nháp', 'bulk-publish': 'Phát hành các bản nháp' } as Record<string, string>)[modal.kind]}</h2><button type="button" disabled={busy} onClick={close} aria-label="Đóng hộp thoại KPI">×</button></div>
        {selected && <p>{selected.unitType === 'STORE' ? selected.stores[0].storeName : `Khu vực ${selected.assigneeName}`} · {money(selected.targetVnd)}</p>}
        {['draft', 'edit'].includes(modal.kind) && <>
          <label>Loại mục tiêu<select aria-label="Loại mục tiêu" value={values.unitType} disabled={modal.kind === 'edit'} onChange={e => { v('unitType', e.target.value); v('employeeId', ''); }}><option value="STORE">Cửa hàng · SM</option><option value="AREA">Khu vực · AM</option></select></label>
          {values.unitType === 'STORE' && <label>Cửa hàng<select aria-label="Cửa hàng KPI" required value={values.storeId} disabled={modal.kind === 'edit'} onChange={e => { v('storeId', e.target.value); v('employeeId', ''); }}><option value="">Chọn cửa hàng</option>{dashboard?.stores.map(s => <option key={s.id} value={s.id} disabled={s.smStatus === 'MISSING'}>{s.name}{s.smStatus === 'MISSING' ? ' · chưa có SM' : s.smStatus === 'AMBIGUOUS' ? ' · HR chọn SM' : ''}</option>)}</select></label>}
          <label>Người phụ trách<select aria-label="Người phụ trách KPI" required value={values.employeeId} onChange={e => v('employeeId', e.target.value)}><option value="">Chọn người phụ trách</option>{dashboard?.candidates.filter(c => c.role === (values.unitType === 'STORE' ? 'SM' : 'AM') && (values.unitType !== 'STORE' || c.storeIds.includes(values.storeId))).map(c => <option key={c.employeeId} value={c.employeeId}>{c.name}</option>)}</select></label>
          {values.unitType === 'AREA' && <p>Khu vực lấy toàn bộ cửa hàng của AM đã xác minh, cộng mục tiêu từng cửa hàng. Cần tạo mục tiêu cửa hàng trước.</p>}
        </>}
        {modal.kind === 'create' && <><label>Ngưỡng cửa hàng không đạt (%)<input aria-label="Ngưỡng cửa hàng không đạt" type="number" min="0" max="100" step="0.01" required value={values.threshold} onChange={e => v('threshold', e.target.value)} /></label><label>Thời hạn xác nhận (ngày làm việc)<input type="number" min="1" max="30" required value={values.days} onChange={e => v('days', e.target.value)} /></label><label className="rk-check"><input type="checkbox" aria-label="Cho phép dữ liệu POS demo trong kỳ này" checked={values.allowDemo} onChange={e => v('allowDemo', e.target.checked)} />Cho phép dữ liệu POS mô phỏng trong kỳ này</label></>}
        {modal.kind === 'decision' && <label>Quyết định HR<select aria-label="Quyết định HR" value={values.action} onChange={e => v('action', e.target.value)}><option value="ADJUST">Điều chỉnh và yêu cầu xác nhận lại</option><option value="KEEP">Giữ nguyên mục tiêu</option><option value="CANCEL">Hủy KPI</option></select></label>}
        {modal.kind === 'adjustment' && <label>Quyết định điều chỉnh<select value={values.action} onChange={e => v('action', e.target.value)}><option value="ADJUST">Phê duyệt mục tiêu mới</option><option value="REJECT">Từ chối điều chỉnh</option></select></label>}
        {modal.kind === 'review' && <label>Xem xét giải trình<select value={values.action} onChange={e => v('action', e.target.value)}><option value="ADJUST">Đã xem xét, ghi nhận</option><option value="REJECT">Yêu cầu giải trình lại</option></select></label>}
        {modal.kind === 'create' || ['draft', 'edit'].includes(modal.kind) && values.unitType === 'STORE' || modal.kind === 'decision' && values.action === 'ADJUST' || modal.kind === 'adjustment' && values.action !== 'REJECT' ? <>
          {modal.kind !== 'create' && selected?.unitType !== 'AREA' && <label>Cách giao mục tiêu<select aria-label="Cách giao mục tiêu" value={values.mode} onChange={e => v('mode', e.target.value)}><option value="GROWTH_PERCENT">Tăng trưởng so tháng trước (%)</option><option value="ABSOLUTE_VND">Mục tiêu VND tuyệt đối</option></select></label>}
          {modal.kind !== 'create' && (values.mode === 'ABSOLUTE_VND' || selected?.unitType === 'AREA') ? <label>Mục tiêu VND<input aria-label="Mục tiêu VND" type="number" min="1" step="1" max={Number.MAX_SAFE_INTEGER} required value={values.amount} onChange={e => v('amount', e.target.value)} /></label> : <label>Mức tăng (%)<input aria-label="Mức tăng KPI" type="number" min="-50" max="100" step="0.01" required value={values.growth} onChange={e => v('growth', e.target.value)} /></label>}
        </> : null}
        {modal.kind === 'decision' && values.action === 'KEEP' && <label className="rk-check"><input type="checkbox" checked={values.force} onChange={e => v('force', e.target.checked)} />HR chủ động giữ nguyên trước hạn, lưu lý do</label>}
        {modal.kind === 'request' && <label>Bằng chứng / tài liệu tham chiếu<textarea aria-label="Bằng chứng điều chỉnh" minLength={5} maxLength={2000} required value={values.evidenceRef} onChange={e => v('evidenceRef', e.target.value)} /></label>}
        {modal.kind === 'confirm' && modal.r?.achieved === false && <label className="rk-check"><input type="checkbox" checked={values.waive} onChange={e => v('waive', e.target.checked)} />HR miễn yêu cầu giải trình hoặc xác nhận ngoại lệ, có lý do</label>}
        {modal.kind === 'responsibility' && <><label>SM phụ trách mới<select required value={values.employeeId} onChange={e => v('employeeId', e.target.value)}>{dashboard?.candidates.filter(c => c.role === 'SM' && c.storeIds.includes(selected!.storeId!)).map(c => <option key={c.employeeId} value={c.employeeId}>{c.name}</option>)}</select></label><label>Thời điểm bắt đầu (giờ Việt Nam)<input type="datetime-local" required value={values.from} onChange={e => v('from', e.target.value)} /></label><p>Mục tiêu cửa hàng giữ nguyên; người mới cần xác nhận lại. Lịch sử người phụ trách cũ được lưu.</p></>}
        {['draft', 'edit', 'refuse', 'decision', 'request', 'verify', 'adjustment', 'reason', 'review', 'correct', 'responsibility'].includes(modal.kind) || modal.kind === 'confirm' && values.waive ? <label>{modal.kind === 'reason' ? 'Lý do chưa đạt' : 'Lý do / ghi chú'}<textarea aria-label="Lý do KPI doanh thu" minLength={5} maxLength={2000} required value={values.reason} onChange={e => v('reason', e.target.value)} /></label> : null}
        {['ai', 'bulk-apply'].includes(modal.kind) && <p>Đề xuất tham khảo; HR quyết định. Lấy đề xuất không tự thay mục tiêu. Áp dụng chỉ sửa bản nháp, phát hành là bước riêng.</p>}
        {modal.kind === 'apply-ai' && <p>Áp dụng mức {percentage(selected?.aiProposal?.suggestedGrowthPercent)} so với tháng gốc cho bản nháp của cửa hàng này. Bạn có thể chỉnh sửa trước khi phát hành.</p>}
        {modal.kind === 'bulk-publish' && <p>Phát hành tất cả bản nháp đủ điều kiện. Mỗi SM/AM sẽ nhận yêu cầu xác nhận KPI của mình.</p>}
        {modal.kind === 'compute' && <p>Tính từ doanh thu POS của kỳ. Thiếu dữ liệu sẽ chưa kết luận; không tự xác nhận hoặc chốt kết quả.</p>}
        {modal.kind === 'close' && <p>Chỉ chốt khi đã hết tháng, mọi KPI không hủy đã xác nhận đầy đủ. Sau chốt, thay đổi cần tạo bản điều chỉnh có lý do.</p>}
        {error && <p role="alert" className="rk-error">{error}</p>}
        <footer><button type="button" disabled={busy} onClick={close}>Hủy</button><button type="submit" disabled={busy}>{busy ? 'Đang xử lý…' : 'Xác nhận'}</button></footer>
      </form>}
    </dialog>
  </section>;
}

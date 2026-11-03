import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationItem, PersonalSchedule, ScheduleAssignment, ScheduleChange, OperationalScheduleWeek as ScheduleWeek, SchedulingAccess, ShiftDefinition, ShiftDefinitionInput } from '@hr-blockbot/contracts';
import { ShiftDefinitionInputSchema } from '@hr-blockbot/contracts';
import { requestJson } from '../services/api';
import { fetchNotifications, markNotificationRead } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';
import '../styles/scheduling.css';

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const dayPlus = (day: string, n: number) => new Date(Date.parse(day + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const monday = (day: string) => dayPlus(day, -(new Date(day + 'T00:00:00Z').getUTCDay() + 6) % 7);
const clock = (n: number) => String(Math.floor(n % 1440 / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
const minute = (s: string) => Number(s.split(':')[0]) * 60 + Number(s.split(':')[1]);
const hours = (a: { intervals: { startMinute: number; endMinute: number }[] }) => a.intervals.map((p) =>
  `${clock(p.startMinute)}${p.startMinute >= 1440 ? ` (+${Math.floor(p.startMinute / 1440)} ngày)` : ''}–${clock(p.endMinute)}${p.endMinute >= 1440 ? ` (+${Math.floor(p.endMinute / 1440)} ngày)` : ''}`).join(' · ');
const future = (a: ScheduleAssignment) => a.intervals.every((p) => Date.parse(a.date + 'T00:00:00+07:00') + p.startMinute * 60000 > Date.now());
const STATUS: Record<ScheduleChange['status'], string> = { PENDING_MANAGER: 'Chờ quản lý điều phối', PENDING_RECEIVER: 'Chờ người nhận', PENDING_REQUESTER: 'Chờ người đề nghị xác nhận', READY_FOR_REVIEW: 'Chờ quản lý duyệt', APPROVED: 'Đã cập nhật lịch', REJECTED: 'Đã từ chối', CANCELLED: 'Đã hủy' };
const pending = (r: ScheduleChange) => ['PENDING_MANAGER', 'PENDING_RECEIVER', 'PENDING_REQUESTER', 'READY_FOR_REVIEW'].includes(r.status);
const sourceLabel = (a: Pick<ScheduleAssignment, 'source'>) => a.source?.kind === 'DEMO_RANDOM' ? 'Lịch mẫu ngẫu nhiên' : a.source?.kind === 'LEGACY_MATCHED' ? 'Đối chiếu lịch cũ' : '';
type Roster = { employeeId: string; fullName: string; employeeCode: string; jobTitle: string | null; assignments?: Pick<ScheduleAssignment, 'id' | 'date' | 'shiftCode' | 'intervals'>[] };
type Draft = { id: string; employeeId: string; date: string; shiftId: string }[];
const draftOf = (w: ScheduleWeek | null): Draft => w?.draft.map(({ id, employeeId, date, shiftId }) => ({ id, employeeId, date, shiftId })) ?? [];
type ChangeModal = { mode: 'create'; a: PersonalSchedule['assignments'][number] } | { mode: 'action'; r: ScheduleChange; weekId: string; version: number; action: string };

export function SchedulingView() {
  const [access, setAccess] = useState<SchedulingAccess | null>(null), [tab, setTab] = useState<'week' | 'mine' | 'shifts'>('mine');
  const [storeId, setStoreId] = useState(''), [weekStart, setWeekStart] = useState(monday(today()));
  const [week, setWeek] = useState<ScheduleWeek | null>(null), [draft, setDraft] = useState<Draft>([]), [roster, setRoster] = useState<Roster[]>([]), [shifts, setShifts] = useState<ShiftDefinition[]>([]);
  const [mine, setMine] = useState<PersonalSchedule | null>(null), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true), [error, setError] = useState(''), [message, setMessage] = useState('');
  const [reason, setReason] = useState(''), [slot, setSlot] = useState<{ oldId?: string; employeeId: string; dates: string[]; shiftId: string } | null>(null);
  const [shiftForm, setShiftForm] = useState<(ShiftDefinitionInput & { version: number }) | null>(null);
  const [change, setChange] = useState<ChangeModal | null>(null), [partners, setPartners] = useState<Roster[]>([]), [receiverId, setReceiverId] = useState(''), [kind, setKind] = useState<'COVER' | 'SWAP'>('COVER'), [targetId, setTargetId] = useState(''), [requestKey, setRequestKey] = useState('');
  const [targets, setTargets] = useState<PersonalSchedule['assignments']>([]);
  const [arrangement, setArrangement] = useState<'DIRECT' | 'MANAGER'>('DIRECT');
  const [notices, setNotices] = useState<NotificationItem[]>([]), [noticeError, setNoticeError] = useState(''), [unreadNotices, setUnreadNotices] = useState(0);
  useEffect(() => {
    let current = true;
    const refresh = () => { if (document.visibilityState === 'hidden') return; void fetchNotifications(50, 'schedule').then(data => { if (current) { setNotices(old => [...data.items, ...old.filter(n => !data.items.some(item => item.id === n.id))]); setUnreadNotices(data.unread); setNoticeError(''); } }).catch(() => { if (current) setNoticeError('Chưa tải được thông báo lịch. Hệ thống sẽ thử lại.'); }); };
    refresh(); const timer = window.setInterval(refresh, 30000); window.addEventListener('focus', refresh);
    return () => { current = false; window.clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, []);
  const sequence = useRef(0);
  const selectedStore = access?.stores.find((s) => s.id === storeId);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftOf(week));
  const days = Array.from({ length: 7 }, (_, i) => dayPlus(weekStart, i));
  useEffect(() => { let live = true; void requestJson<SchedulingAccess>('/scheduling/access').then((a) => {
    if (!live) return; setAccess(a); setStoreId(a.stores[0]?.id ?? ''); setTab(a.stores.length ? 'week' : 'mine');
  }).catch((e) => { if (live) setError(e.message); }); return () => { live = false; }; }, []);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      if (tab === 'mine') { const result = await requestJson<PersonalSchedule>(`/scheduling/me?from=${weekStart}&to=${dayPlus(weekStart, 6)}`); if (current === sequence.current) setMine(result); }
      else if (storeId) {
        const [w, definitions, people] = await Promise.all([
          requestJson<{ week: ScheduleWeek | null }>(`/scheduling/stores/${storeId}/week?weekStart=${weekStart}`),
          requestJson<{ items: ShiftDefinition[] }>(`/scheduling/stores/${storeId}/shifts`),
          selectedStore?.canManage ? requestJson<{ items: Roster[] }>(`/scheduling/stores/${storeId}/roster`) : Promise.resolve({ items: [] as Roster[] }),
        ]);
        if (current === sequence.current) { setWeek(w.week); setDraft(draftOf(w.week)); setShifts(definitions.items); setRoster(people.items); }
      }
    } catch (e) { if (current === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được lịch.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [tab, storeId, weekStart, selectedStore?.canManage]);
  useEffect(() => { setWeek(null); setDraft([]); setMine(null); setShifts([]); setRoster([]); if (access) void load(); return () => { sequence.current++; }; }, [access, load]);
  const run = async (work: () => Promise<unknown>, success: string) => {
    if (busy) return; setBusy(true); setError('');
    try { await work(); setMessage(success); setSlot(null); setShiftForm(null); setChange(null); await load(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Chưa lưu được. Bản nhập vẫn được giữ lại.'); }
    finally { setBusy(false); }
  };
  const reload = () => { if (!dirty || window.confirm('Bỏ các thay đổi chưa lưu và tải lại lịch mới nhất?')) void load(); };
  const openAction = async (r: ScheduleChange, weekId: string, version: number, action: string) => {
    setChange({ mode: 'action', r, weekId, version, action }); setReason(''); setReceiverId(''); setTargetId(''); setTargets([]); setError('');
    if (action === 'ACCEPT' && r.kind === 'SWAP' && r.policyVersion !== 2) try {
      const from = monday(r.source.date), result = await requestJson<PersonalSchedule>(`/scheduling/me?from=${from}&to=${dayPlus(from, 6)}`);
      setTargets(result.assignments.filter((a) => a.weekId === weekId && future(a)));
    } catch (e) { setError(e instanceof Error ? e.message : 'Không tải được ca để đổi lại.'); }
  };
  const openRequest = async (a: PersonalSchedule['assignments'][number]) => {
    setError(''); setReceiverId(''); setKind('COVER'); setArrangement('DIRECT'); setTargetId(''); setReason(''); setRequestKey(crypto.randomUUID()); setChange({ mode: 'create', a }); setPartners([]);
    try { setPartners((await requestJson<{ items: Roster[] }>(`/scheduling/weeks/${a.weekId}/partners`)).items); }
    catch (e) { setError(e instanceof Error ? e.message : 'Không tải được người nhận.'); }
  };
  const renderRequest = (r: ScheduleChange, weekId: string, version: number, manager = false) => {
    const requester = r.requesterEmployeeId === access?.employeeId, receiver = r.receiverEmployeeId === access?.employeeId;
    return <article key={r.id} className="schedule-request">
      <div className="schedule-request-heading"><strong>{r.kind === 'SWAP' ? 'Đổi ca hai chiều' : 'Nhận ca thay'}</strong><span className="crm-work-status">{STATUS[r.status]}</span></div>
      <p>{r.source.employeeName} · {r.source.date} · {r.source.shiftCode} · {hours(r.source)}{sourceLabel(r.source) && ` · ${sourceLabel(r.source)}`}</p>
      {r.target && <p>Ca đổi lại: {r.target.employeeName} · {r.target.date} · {r.target.shiftCode} · {hours(r.target)}</p>}
      <p>Lý do: {r.reason}</p>{r.decisionReason && <p>Phản hồi: {r.decisionReason}</p>}
      {r.policyVersion === 2 && <p>{r.arrangement === 'DIRECT' ? 'Hai bên xác nhận hợp lệ sẽ cập nhật lịch và báo SM; không cần duyệt.' : 'Quản lý điều phối; người được chọn phải đồng ý nhận ca.'}{r.urgent && ' Yêu cầu khẩn dưới 24 giờ.'}{r.receiverName && ` Người nhận: ${r.receiverName}.`}</p>}
      <div className="crm-work-actions">
        {receiver && r.status === 'PENDING_RECEIVER' && <button className="btn btn--primary" disabled={busy || dirty} onClick={() => openAction(r, weekId, version, 'ACCEPT')}>Đồng ý nhận / đổi ca</button>}
        {receiver && pending(r) && <button className="btn" disabled={busy || dirty} onClick={() => openAction(r, weekId, version, 'DECLINE')}>Từ chối</button>}
        {requester && r.status === 'PENDING_REQUESTER' && <button className="btn btn--primary" disabled={busy || dirty} onClick={() => openAction(r, weekId, version, 'CONFIRM')}>Xác nhận ca đổi lại</button>}
        {requester && pending(r) && <button className="btn" disabled={busy || dirty} onClick={() => openAction(r, weekId, version, 'CANCEL')}>Hủy yêu cầu</button>}
        {manager && !requester && !receiver && r.status === 'PENDING_MANAGER' && <button className="btn btn--primary" disabled={busy || dirty} onClick={() => openAction(r, weekId, version, r.kind === 'SWAP' ? 'APPROVE' : 'SELECT')}>{r.kind === 'SWAP' ? 'Cho phép gửi đề nghị khẩn' : 'Chọn người thay ca'}</button>}
        {manager && !requester && !receiver && r.status === 'READY_FOR_REVIEW' && <button className="btn btn--primary" disabled={busy || dirty || !!week?.hasUnpublishedChanges} onClick={() => openAction(r, weekId, version, 'APPROVE')}>Duyệt đổi ca</button>}
        {manager && !requester && !receiver && pending(r) && (r.policyVersion !== 2 || r.arrangement === 'MANAGER') && <button className="btn" disabled={busy || dirty} onClick={() => openAction(r, weekId, version, 'REJECT')}>Không duyệt</button>}
      </div>
    </article>;
  };
  if (!access) return <section className="crm-workspace" aria-label="Lịch làm & phân ca"><p role={error ? 'alert' : 'status'}>{error || 'Đang tải quyền lịch làm…'}</p></section>;
  return <section className="crm-workspace schedule-workspace" aria-label="Lịch làm & phân ca">
    <header className="crm-work-heading"><div><p className="crm-work-eyebrow">ĐIỀU PHỐI CỬA HÀNG</p><h2>Lịch làm & phân ca</h2><p>Giờ Việt Nam · Lịch nháp được công bố sau khi quản lý kiểm tra.</p></div><button className="btn" disabled={busy || loading} onClick={reload}>Tải lại lịch</button></header>
    <div className="crm-work-actions" role="tablist" aria-label="Khu vực lịch làm">
      {access.canReadSelf && <button className={`btn ${tab === 'mine' ? 'btn--primary' : ''}`} role="tab" aria-selected={tab === 'mine'} disabled={dirty || busy} onClick={() => setTab('mine')}>Lịch của tôi</button>}
      {!!access.stores.length && <button className={`btn ${tab === 'week' ? 'btn--primary' : ''}`} role="tab" aria-selected={tab === 'week'} disabled={dirty || busy} onClick={() => setTab('week')}>Lịch tuần cửa hàng</button>}
      {access.stores.some((s) => s.canConfigure) && <button className={`btn ${tab === 'shifts' ? 'btn--primary' : ''}`} role="tab" aria-selected={tab === 'shifts'} disabled={dirty || busy} onClick={() => setTab('shifts')}>Danh mục ca</button>}
    </div>
    <div className="crm-work-toolbar schedule-filters">
      {tab !== 'mine' && <label className="field">Cửa hàng<select className="input" aria-label="Cửa hàng" value={storeId} disabled={busy || dirty} onChange={(e) => setStoreId(e.target.value)}>{access.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}
      {tab !== 'shifts' && <><button className="btn" disabled={dirty || busy} onClick={() => setWeekStart(dayPlus(weekStart, -7))}>Tuần trước</button><label className="field">Tuần bắt đầu<input className="input" type="date" value={weekStart} disabled={dirty || busy} onChange={(e) => { if (e.target.value) setWeekStart(monday(e.target.value)); }} /></label><button className="btn" disabled={dirty || busy} onClick={() => setWeekStart(dayPlus(weekStart, 7))}>Tuần sau</button></>}
    </div>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="banner banner--error">{error}</p>}
    <details className="schedule-request"><summary>Thông báo lịch làm · {unreadNotices} chưa đọc</summary><p>Thông báo được lưu trong hệ thống; tự tải lại mỗi 30 giây khi đang mở trang.</p>{noticeError && <p role="status">{noticeError}</p>}{!notices.length && <p>Chưa có thông báo lịch trong danh sách gần đây.</p>}{notices.map(n => <article key={n.id}><h3>{n.title}</h3><p>{n.body}</p><p>{new Date(n.createdAt).toLocaleString('vi-VN')}</p>{!n.readAt && <button className="btn" onClick={() => void markNotificationRead(n.id).then(() => { setNotices(old => old.map(item => item.id === n.id ? { ...item, readAt: new Date().toISOString() } : item)); setUnreadNotices(old => Math.max(0, old - 1)); }).catch(() => setNoticeError('Chưa đánh dấu được thông báo.'))}>Đánh dấu đã đọc</button>}</article>)}{notices.length >= 50 && <button className="btn" onClick={() => void fetchNotifications(50, 'schedule', notices[notices.length - 1]?.createdAt).then(data => setNotices(old => [...old, ...data.items.filter(n => !old.some(item => item.id === n.id))])).catch(() => setNoticeError('Chưa tải được thông báo cũ.'))}>Xem thông báo cũ hơn</button>}</details>
    {loading ? <p role="status">Đang tải lịch…</p> : tab === 'shifts' ? <>
      <div className="crm-work-heading"><div><h3>Danh mục ca của cửa hàng</h3><p>Cấu hình giờ thực tế. Ca gãy dùng nhiều khoảng giờ; ca qua đêm chọn ngày hôm sau.</p></div>{selectedStore?.canConfigure && <button className="btn btn--primary" onClick={() => { setShiftForm({ code: '', name: '', active: true, intervals: [{ startMinute: 0, endMinute: 0 }], version: 0 }); setError(''); }}>Thêm mã ca</button>}</div>
      {!shifts.length && <div className="empty"><h3>Chưa có mã ca được cấu hình</h3><p>Nhập mã ca và giờ chuẩn trước khi xếp lịch.</p></div>}
      <div className="schedule-shift-list">{shifts.map((s) => <article key={s.id} className="schedule-request"><div><strong>{s.code} · {s.name}</strong><p>{hours(s)}</p><p>{s.active ? 'Đang dùng' : 'Ngừng dùng cho phân công mới'}</p></div>{selectedStore?.canConfigure && <button className="btn" onClick={() => { setShiftForm({ code: s.code, name: s.name, active: s.active, intervals: s.intervals.map((p) => ({ ...p })), version: s.version }); setError(''); }}>Sửa mã ca</button>}</article>)}</div>
      <p className="text-xs">Thay đổi danh mục áp dụng cho phân công mới. Lịch đã lưu giữ nguyên giờ để đối chiếu.</p>
    </> : tab === 'week' ? <>
      {!week ? <div className="empty"><h3>Tuần này chưa có lịch</h3><p>Tạo bản nháp, xếp ca rồi công bố để nhân viên xem.</p>{selectedStore?.canManage && <button className="btn btn--primary" disabled={busy} onClick={() => void run(() => requestJson(`/scheduling/stores/${storeId}/weeks`, post({ weekStart })), 'Đã tạo bản nháp tuần lịch.')}>Tạo lịch tuần</button>}</div> : <>
        {week.history.some((e) => e.action === 'DEMO_SCHEDULE_PUBLISHED') && <p className="schedule-source-notice" role="status">Lịch mẫu tháng 10–11 được tạo theo yêu cầu để test. Ca ngẫu nhiên và ca đối chiếu lịch cũ có nhãn riêng; lịch này không xác nhận chấm công thực tế. LĐ: đứng trước quán vẫy/đón khách. Ô trống là chưa xếp ca, không tự xác định loại nghỉ.</p>}
        <div className="schedule-week-status"><span>{week.publishedAt ? `Đã công bố · ${new Date(week.publishedAt).toLocaleString('vi-VN')}` : 'Bản nháp · nhân viên chưa nhìn thấy'}</span>{(dirty || week.hasUnpublishedChanges) && <strong>Có thay đổi chưa công bố</strong>}</div>
        {selectedStore?.canManage && <div className="crm-work-toolbar"><label className="field">Ghi chú lần lưu / công bố<input className="input" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Nêu nội dung điều chỉnh lịch..." /></label><button className="btn" disabled={busy || !dirty || reason.trim().length < 5} onClick={() => void run(() => requestJson(`/scheduling/weeks/${week.id}/draft`, post({ expectedVersion: week.version, assignments: draft, reason })), 'Đã lưu nháp; nhân viên vẫn xem lịch công bố trước đó.')}>Lưu nháp</button><button className="btn" disabled={busy || !dirty} onClick={() => setDraft(draftOf(week))}>Bỏ thay đổi chưa lưu</button>{selectedStore.canPublish && <button className="btn btn--primary" disabled={busy || dirty || reason.trim().length < 5 || !!week.publishedAt && !week.hasUnpublishedChanges} onClick={() => void run(() => requestJson(`/scheduling/weeks/${week.id}/publish`, post({ expectedVersion: week.version, reason })), 'Đã công bố lịch và lưu thông báo cho nhân viên.')}>Công bố lịch</button>}</div>}
        {selectedStore?.canManage && !shifts.some((s) => s.active) && <p>Chưa có mã ca đang dùng. Mở Danh mục ca để cấu hình trước khi xếp lịch.</p>}
        <div className="schedule-grid-scroll"><table className="schedule-grid"><caption className="sr-only">Lịch tuần cửa hàng</caption><thead><tr><th>Nhân viên</th>{days.map((d, i) => <th key={d}>{['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật'][i]}<small>{d.slice(8)}/{d.slice(5, 7)}</small></th>)}</tr></thead><tbody>{[...new Map([...roster, ...(selectedStore?.canManage ? week.draft : week.published).map((a) => ({ employeeId: a.employeeId, employeeCode: a.employeeCode, fullName: a.employeeName, jobTitle: null }))].map((p) => [p.employeeId, p])).values()].map((p) => <tr key={p.employeeId}><th scope="row">{p.fullName}<small>{p.employeeCode}</small></th>{days.map((d) => {
          const cells = selectedStore?.canManage ? draft.filter((a) => a.employeeId === p.employeeId && a.date === d) : week.published.filter((a) => a.employeeId === p.employeeId && a.date === d);
          return <td key={d}>{cells.map((a) => { const saved = week.draft.find((x) => x.id === a.id) ?? week.published.find((x) => x.id === a.id); const definition = shifts.find((s) => s.id === a.shiftId); return <button key={a.id} className="schedule-cell" disabled={!selectedStore?.canManage || busy || !!week.published.find((x) => x.id === a.id && !future(x))} onClick={() => { setSlot({ oldId: a.id, employeeId: p.employeeId, dates: [d], shiftId: a.shiftId }); setError(''); }}><strong>{saved?.shiftCode ?? definition?.code}</strong><small>{saved ? hours(saved) : definition ? hours(definition) : 'Chưa cấu hình'}</small>{saved && sourceLabel(saved) && <small>{sourceLabel(saved)}</small>}</button>; })}{selectedStore?.canManage && d >= today() && <button className="schedule-add" aria-label={`Xếp ca ${p.employeeCode} ${d}`} disabled={busy || !shifts.some((s) => s.active)} onClick={() => { setSlot({ employeeId: p.employeeId, dates: [d], shiftId: shifts.find((s) => s.active)?.id ?? '' }); setError(''); }}>+ Xếp ca</button>}</td>;
        })}</tr>)}</tbody></table></div>
        {!!week.pendingNotifications && selectedStore?.canPublish && <p role="status">Còn {week.pendingNotifications} thông báo chờ gửi. <button className="btn" disabled={busy || dirty} onClick={() => void run(() => requestJson(`/scheduling/weeks/${week.id}/retry-notices`, post({})), 'Đã thử gửi lại thông báo đang chờ.')}>Thử gửi lại</button></p>}
        <h3>Yêu cầu đổi ca trong tuần</h3>{!week.requests.length && <p>Chưa có yêu cầu đổi ca.</p>}{week.hasUnpublishedChanges && <p>Đối chiếu bản nháp trước khi duyệt đổi ca. Công bố lại lịch sẽ hủy các yêu cầu đang chờ để nhân viên kiểm tra lịch mới.</p>}{week.requests.map((r) => renderRequest(r, week.id, week.version, selectedStore?.canReview))}
        <details><summary>Lịch sử thay đổi</summary><ol className="crm-work-history">{week.history.slice().reverse().map((e, i) => <li key={i}>{new Date(e.at).toLocaleString('vi-VN')} · {e.action} · {e.reason}</li>)}</ol></details>
      </>}
    </> : <>
      <h3>Lịch của tôi · {weekStart}–{dayPlus(weekStart, 6)}</h3><p>Chỉ hiển thị ca đã công bố. Ô trống nghĩa là chưa có ca được công bố trong hệ thống.</p>
      {mine?.assignments.some((a) => a.source) && <p className="schedule-source-notice">Có dữ liệu lịch mẫu để test hoặc đối chiếu lịch cũ; xem nhãn tại từng ca. LĐ là đứng trước quán vẫy/đón khách.</p>}
      {!mine?.assignments.length && <div className="empty"><h3>Chưa có ca đã công bố trong tuần này</h3><p>Liên hệ quản lý cửa hàng nếu bạn đang chờ lịch.</p></div>}
      <div className="schedule-personal">{mine?.assignments.map((a) => <article key={a.weekId + a.id} className="schedule-request"><div><strong>{a.date} · {a.shiftCode} · {a.shiftName}</strong><p>{hours(a)}</p><p>{a.storeName}</p>{sourceLabel(a) && <p className="schedule-source-notice">{sourceLabel(a)}</p>}</div>{access.canRequest && future(a) && <button className="btn" disabled={busy || mine.requests.some((r) => pending(r) && (r.source.id === a.id || r.target?.id === a.id))} onClick={() => void openRequest(a)}>Xin đổi / nhận ca thay</button>}</article>)}</div>
      <h3>Yêu cầu tôi tham gia</h3>{!mine?.requests.length && <p>Chưa có yêu cầu đổi ca.</p>}{mine?.requests.map((r) => renderRequest(r, r.weekId, r.weekVersion))}
      <details><summary>Lịch nhập cũ của tôi trong tuần đã chọn</summary><p>Lịch nguồn chưa được đối chiếu cửa hàng và giờ ca. Giữ nguyên mã gốc để tra cứu; phần này không được dùng để đổi ca hoặc coi là lịch đã công bố mới.</p>{!mine?.legacyEntries?.length ? <p>Không có lịch nguồn của bạn trong khoảng ngày này.</p> : <ul className="crm-work-history">{mine.legacyEntries.map((r) => <li key={r.id}>{r.date} · Mã ca {r.shiftCode} · {r.sourceType === 'registered' ? 'Đăng ký từ nguồn' : r.sourceType === 'actual' ? 'Ghi nhận từ nguồn' : 'Loại lịch nguồn chưa xác định'}</li>)}</ul>}{mine?.legacyTruncated && <p>Chỉ hiển thị 500 dòng đầu. Chọn khoảng thời gian ngắn hơn để đối chiếu.</p>}</details>
    </>}

    {slot && <CrmDialog title="Xếp ca làm" busy={busy} onClose={() => setSlot(null)}><form className="crm-work-form" onSubmit={(e) => { e.preventDefault(); const replacements = slot.dates.map((date) => ({ id: crypto.randomUUID(), employeeId: slot.employeeId, date, shiftId: slot.shiftId })); setDraft((old) => [...old.filter((a) => a.id !== slot.oldId), ...replacements]); setSlot(null); }}>
      <label className="field">Nhân viên<select className="input" aria-label="Nhân viên" value={slot.employeeId} required onChange={(e) => setSlot({ ...slot, employeeId: e.target.value })}>{roster.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.fullName} · {p.employeeCode}</option>)}</select></label>
      <label className="field">Mã ca<select className="input" aria-label="Mã ca" value={slot.shiftId} required onChange={(e) => setSlot({ ...slot, shiftId: e.target.value })}>{shifts.filter((s) => s.active).map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name} · {hours(s)}</option>)}</select></label>
      <fieldset><legend>Áp dụng cho ngày</legend><div className="schedule-days">{days.map((d) => <label key={d}><input type="checkbox" checked={slot.dates.includes(d)} disabled={d < today()} onChange={(e) => setSlot({ ...slot, dates: e.target.checked ? [...slot.dates, d] : slot.dates.filter((x) => x !== d) })} />{d.slice(8)}/{d.slice(5, 7)}</label>)}</div></fieldset>
      <p>Chọn ca dùng cấu hình giờ hiện tại. Thay đổi được giữ ở bản đang sửa cho đến khi bạn lưu nháp và công bố.</p>
      <div className="crm-work-actions"><button className="btn btn--primary" disabled={!slot.dates.length || !slot.shiftId}>Áp dụng vào bản nháp</button>{slot.oldId && <button type="button" className="btn" onClick={() => { setDraft((old) => old.filter((a) => a.id !== slot.oldId)); setSlot(null); }}>Bỏ ca khỏi bản nháp</button>}</div>
    </form></CrmDialog>}

    {shiftForm && <CrmDialog title={shiftForm.version ? 'Sửa mã ca' : 'Thêm mã ca'} busy={busy} onClose={() => setShiftForm(null)}><form className="crm-work-form" onSubmit={(e) => {
      e.preventDefault(); const { version, ...definition } = shiftForm, checked = ShiftDefinitionInputSchema.safeParse(definition);
      if (!checked.success) { setError(checked.error.issues[0]?.message || 'Kiểm tra lại giờ ca.'); return; }
      void run(() => requestJson(`/scheduling/stores/${storeId}/shifts`, post({ expectedVersion: version, definition: checked.data })), 'Đã lưu danh mục ca. Giờ của lịch đã lưu được giữ nguyên.');
    }}>
      <label className="field">Mã ca<input className="input" required maxLength={30} disabled={busy || shiftForm.version > 0} value={shiftForm.code} onChange={(e) => setShiftForm({ ...shiftForm, code: e.target.value })} placeholder="Ví dụ mã ca đang dùng tại cửa hàng" /></label>
      <label className="field">Tên ca<input className="input" required maxLength={100} disabled={busy} value={shiftForm.name} onChange={(e) => setShiftForm({ ...shiftForm, name: e.target.value })} /></label>
      <p>Nhập giờ chuẩn của cửa hàng. Chọn “Ngày hôm sau” nếu ca đi qua nửa đêm.</p>
      {shiftForm.intervals.map((p, index) => <fieldset className="schedule-interval" key={index}><legend>Khoảng giờ {index + 1}</legend>{(['startMinute', 'endMinute'] as const).map((field) => <label className="field" key={field}>{field === 'startMinute' ? 'Bắt đầu' : 'Kết thúc'}<input className="input" type="time" aria-label={`${field === 'startMinute' ? 'Bắt đầu' : 'Kết thúc'} khoảng ${index + 1}`} step={60} required value={clock(p[field])} onChange={(e) => { const intervals = shiftForm.intervals.map((x) => ({ ...x })); intervals[index][field] = Math.floor(p[field] / 1440) * 1440 + minute(e.target.value); setShiftForm({ ...shiftForm, intervals }); }} /><select className="input" aria-label={`${field === 'startMinute' ? 'Ngày bắt đầu' : 'Ngày kết thúc'} khoảng ${index + 1}`} value={Math.floor(p[field] / 1440)} onChange={(e) => { const intervals = shiftForm.intervals.map((x) => ({ ...x })); intervals[index][field] = Number(e.target.value) * 1440 + p[field] % 1440; setShiftForm({ ...shiftForm, intervals }); }}><option value={0}>Ngày bắt đầu ca</option><option value={1}>Ngày hôm sau</option></select></label>)}{shiftForm.intervals.length > 1 && <button className="btn" type="button" onClick={() => setShiftForm({ ...shiftForm, intervals: shiftForm.intervals.filter((_, i) => i !== index) })}>Bỏ khoảng giờ</button>}</fieldset>)}
      <div className="crm-work-actions">{shiftForm.intervals.length < 4 && <button className="btn" type="button" onClick={() => setShiftForm({ ...shiftForm, intervals: [...shiftForm.intervals, { startMinute: 0, endMinute: 0 }] })}>Thêm khoảng giờ cho ca gãy</button>}<label><input type="checkbox" checked={shiftForm.active} onChange={(e) => setShiftForm({ ...shiftForm, active: e.target.checked })} /> Đang dùng cho phân công mới</label></div>
      {error && <p role="alert">{error}</p>}<button className="btn btn--primary" disabled={busy}>{busy ? 'Đang lưu…' : 'Lưu mã ca'}</button>
    </form></CrmDialog>}

    {change && <CrmDialog title={change.mode === 'create' ? 'Đề nghị đổi ca' : 'Xác nhận xử lý đổi ca'} busy={busy} onClose={() => setChange(null)}><form className="crm-work-form" onSubmit={(e) => {
      e.preventDefault();
      if (change.mode === 'create') void run(() => requestJson(`/scheduling/weeks/${change.a.weekId}/changes`, post({ expectedVersion: change.a.weekVersion, clientRequestId: requestKey, assignmentId: change.a.id, receiverEmployeeId: arrangement === 'DIRECT' ? receiverId : null, arrangement, kind: arrangement === 'MANAGER' ? 'COVER' : kind, reason, ...(arrangement === 'DIRECT' && kind === 'SWAP' ? { targetAssignmentId: targetId } : {}) })), 'Đã gửi yêu cầu. Xem trạng thái để biết đang chờ đồng nghiệp hay quản lý điều phối.');
      else void run(() => requestJson(`/scheduling/weeks/${change.weekId}/changes/${change.r.id}`, post({ expectedVersion: change.version, action: change.action, reason, ...(targetId ? { targetAssignmentId: targetId } : {}), ...(change.action === 'SELECT' ? { receiverEmployeeId: receiverId } : {}) })), 'Đã lưu phản hồi. Xem trạng thái và lịch đã công bố để đối chiếu.');
    }}>
      {change.mode === 'create' ? <>
        <p>Ca của bạn: {change.a.date} · {change.a.shiftCode} · {hours(change.a)}</p>
        <label className="field">Cách xử lý<select className="input" aria-label="Cách xử lý" value={arrangement} onChange={e => { setArrangement(e.target.value as 'DIRECT' | 'MANAGER'); setError(''); }}><option value="DIRECT">Đã có người nhận / đổi ca</option><option value="MANAGER">Chưa có người — nhờ quản lý tìm</option></select></label>
        {arrangement === 'DIRECT' ? <><label className="field">Hình thức<select className="input" aria-label="Hình thức" value={kind} onChange={(e) => { setKind(e.target.value as 'COVER' | 'SWAP'); setTargetId(''); }}><option value="COVER">Nhờ đồng nghiệp nhận ca thay</option><option value="SWAP">Đổi ca hai chiều trong cùng tuần</option></select></label>
        <label className="field">Đồng nghiệp<select className="input" aria-label="Đồng nghiệp" required value={receiverId} onChange={(e) => { setReceiverId(e.target.value); setTargetId(''); }}><option value="">Chọn đồng nghiệp</option>{partners.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.fullName} · {p.employeeCode}</option>)}</select></label>
        {kind === 'SWAP' && <label className="field">Ca muốn nhận lại<select aria-label="Ca muốn nhận lại" className="input" required value={targetId} onChange={e => setTargetId(e.target.value)}><option value="">Chọn ca cụ thể của đồng nghiệp</option>{(partners.find(p => p.employeeId === receiverId)?.assignments ?? []).map(a => <option value={a.id} key={a.id}>{a.date} · {a.shiftCode} · {hours(a)}</option>)}</select></label>}<p>Hai bên đồng ý và lịch không chồng giờ thì cập nhật, thông báo SM. Nếu còn dưới 24 giờ, quản lý phải xử lý khẩn trước.</p></> : <p>Gửi trước ít nhất 24 giờ, kèm lý do. Quản lý chọn người thay hoặc từ chối; người được chọn cần đồng ý. Dưới 24 giờ được đánh dấu khẩn.</p>}
      </> : <>
        <p>{STATUS[change.r.status]} · {change.r.source.employeeName} · {change.r.source.date} · {change.r.source.shiftCode} · {hours(change.r.source)}</p>
        {change.r.target && <p>Ca đổi lại: {change.r.target.date} · {change.r.target.shiftCode} · {hours(change.r.target)}</p>}
        {change.action === 'ACCEPT' && change.r.kind === 'SWAP' && change.r.policyVersion !== 2 && <label className="field">Ca của bạn để đổi lại<select className="input" aria-label="Ca của bạn để đổi lại" required value={targetId} onChange={(e) => setTargetId(e.target.value)}><option value="">Chọn ca đã công bố trong cùng tuần</option>{targets.map((a) => <option key={a.id} value={a.id}>{a.date} · {a.shiftCode} · {hours(a)}</option>)}</select></label>}
        {change.action === 'SELECT' && <label className="field">Người nhận ca thay<select className="input" aria-label="Người nhận ca thay" required value={receiverId} onChange={e => setReceiverId(e.target.value)}><option value="">Chọn nhân viên trong phạm vi quản lý</option>{roster.filter(p => p.employeeId !== change.r.requesterEmployeeId && p.employeeId !== access.employeeId).map(p => <option key={p.employeeId} value={p.employeeId}>{p.fullName} · {p.employeeCode}</option>)}</select></label>}
        {change.action === 'APPROVE' && <p>{change.r.policyVersion === 2 ? 'Cho phép gửi đề nghị khẩn đến người nhận. Lịch vẫn giữ nguyên cho đến khi người nhận đồng ý và hệ thống kiểm tra lại.' : 'Xác nhận cập nhật lịch đã công bố theo sự đồng ý của các bên. Hệ thống sẽ kiểm tra lại trùng giờ và điều kiện nhân viên.'}</p>}
      </>}
      <label className="field">Lý do / phản hồi<textarea aria-label="Lý do / phản hồi" className="textarea" required minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
      {error && <p role="alert">{error}</p>}<button className="btn btn--primary" disabled={busy || reason.trim().length < 5}>{busy ? 'Đang lưu…' : change.mode === 'create' ? 'Gửi đề nghị đổi ca' : 'Xác nhận phản hồi'}</button>
    </form></CrmDialog>}
  </section>;
}

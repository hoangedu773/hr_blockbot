import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScheduleAssignment, ScheduleRegistration, ScheduleRegistrationAction, ScheduleRegistrations } from '@hr-blockbot/contracts';
import { requestJson } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';

const actions = { REGISTER: 'Đăng ký ca làm', ADD: 'Thêm ca cho nhân viên', APPROVE: 'Duyệt ca', EDIT: 'Chỉnh ca', REMOVE: 'Xóa ca' } as const;
type Action = keyof typeof actions;
type Dialog = { action: 'REGISTER' | 'ADD'; clientRequestId: string } | { action: ScheduleRegistrationAction; item: ScheduleRegistration };
const pending = (item: ScheduleRegistration) => item.status === 'PENDING_MANAGER' || item.status === 'PENDING_EMPLOYEE';
function status(item: ScheduleRegistration, published: boolean) {
  if (pending(item)) return published ? 'Không vào lịch công bố' : 'Chờ quản lý duyệt';
  if (item.placement === 'PUBLISHED') return 'Đã công bố';
  if (item.placement === 'DRAFT') return 'Đã xếp vào nháp';
  return 'Ca đã được điều chỉnh';
}

export function ScheduleRegistrationPanel({ storeId, days, today, hours, blocked, canRequest, onChanged }: {
  storeId?: string; days: string[]; today: string; hours: (slot: Pick<ScheduleAssignment, 'intervals'>) => string;
  blocked: boolean; canRequest?: boolean; onChanged: () => Promise<void>;
}) {
  const weekStart = days[0];
  const [data, setData] = useState<ScheduleRegistrations | null>(null);
  const [error, setError] = useState(''), [saveError, setSaveError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [date, setDate] = useState(''), [shiftId, setShiftId] = useState(''), [reason, setReason] = useState(''), [employeeId, setEmployeeId] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async (background = false) => {
    const current = ++sequence.current;
    if (!background) setLoading(true);
    try {
      const path = storeId ? '/scheduling/stores/' + storeId + '/registrations' : '/scheduling/registrations/me';
      const result = await requestJson<ScheduleRegistrations>(path + '?weekStart=' + weekStart);
      if (current === sequence.current) { setData(result); setError(''); }
    } catch (e) { if (current === sequence.current) setError(e instanceof Error ? e.message : 'Chưa tải được bảng đăng ký.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [storeId, weekStart]);
  useEffect(() => {
    void load();
    const refresh = () => { if (document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(refresh, 30000);
    window.addEventListener('focus', refresh);
    window.addEventListener('schedule:published', refresh);
    return () => {
      sequence.current++;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('schedule:published', refresh);
    };
  }, [load]);

  const futureDays = days.filter((d) => d >= today);
  const currentShifts = (data?.shifts ?? []).filter((shift) => shift.intervals.every((p) =>
    Date.parse(date + 'T00:00:00+07:00') + p.startMinute * 60000 > Date.now()));
  const shift = currentShifts.find((s) => s.id === shiftId);
  const open = (next: Dialog) => {
    const existing = 'item' in next ? next.item.slot : null;
    setDate(existing && futureDays.includes(existing.date) ? existing.date : futureDays[0] ?? '');
    setShiftId(existing?.shiftId ?? ''); setReason(''); setEmployeeId(''); setSaveError(''); setDialog(next);
  };
  const action = dialog?.action;
  const needsSlot = action === 'REGISTER' || action === 'ADD' || action === 'EDIT';
  const needsReason = action === 'EDIT' || action === 'REMOVE';
  const disabled = blocked || busy || loading || !!error || !data || data.published;
  const invalid = (needsSlot && !shift) || (needsReason && reason.trim().length < 5) || (action === 'ADD' && !employeeId);
  const submit = async () => {
    if (!data || !dialog || disabled || invalid) return;
    const slot = shift ? { date, shiftId: shift.id, shiftVersion: shift.version } : undefined;
    const storePath = '/scheduling/stores/' + data.storeId + '/registrations';
    const path = 'item' in dialog ? storePath + '/' + dialog.item.id : dialog.action === 'ADD' ? storePath : '/scheduling/registrations';
    const body = 'item' in dialog ? { weekStart, expectedVersion: dialog.item.version, action: dialog.action,
      ...(needsSlot ? { slot } : {}), ...(needsReason ? { reason } : {}) } :
      { weekStart, clientRequestId: dialog.clientRequestId, slot, ...(dialog.action === 'ADD' ? { employeeId } : {}) };
    setBusy(true); setSaveError('');
    try {
      await requestJson(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setDialog(null);
      await Promise.all([load(), onChanged()]);
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Chưa lưu được đăng ký.'); }
    finally { setBusy(false); }
  };
  const addAction: Action = storeId ? 'ADD' : 'REGISTER';
  return <section aria-label="Bảng đăng ký ca" className="schedule-request">
    <div className="crm-work-heading"><div><h3>Bảng đăng ký ca</h3>{data && <p>{data.storeName} · {data.published ?
      'Tuần đã công bố. Muốn đổi hoặc nhận ca thay, mở Lịch của tôi.' :
      'Mọi người tại cửa hàng có thể xem bảng. Ca chỉ vào lịch chính thức sau khi quản lý công bố.'}</p>}</div>
      <div className="crm-work-actions">
        {data && !data.published && (storeId ? data.roster.length > 0 : canRequest) &&
          <button type="button" className="btn btn--primary" disabled={disabled || !data.shifts.length || !futureDays.length}
            onClick={() => open({ action: addAction, clientRequestId: crypto.randomUUID() })}>{actions[addAction]}</button>}
        <button type="button" className="btn" disabled={busy || loading} onClick={() => void load()}>Tải lại bảng</button>
      </div>
    </div>
    {data && !data.published && !data.shifts.length && <p>Cửa hàng chưa có ca đang dùng để đăng ký.</p>}
    {storeId && blocked && <p>Lưu hoặc bỏ chỉnh sửa lịch nháp trước khi xử lý đăng ký.</p>}
    {error && <p className="banner banner--error" role="alert">{error}</p>}
    {loading && <p role="status">Đang tải bảng đăng ký…</p>}
    {data && !error && (data.items.length ? <div className="schedule-grid-scroll"><table className="schedule-grid">
      <caption className="sr-only">Đăng ký ca trong tuần</caption>
      <thead><tr><th>Nhân viên</th><th>Ngày</th><th>Ca làm</th><th>Trạng thái</th>{storeId && !data.published && <th>Thao tác</th>}</tr></thead>
      <tbody>{data.items.map((item) => <tr key={item.id}>
        <th scope="row">{item.employeeName}{item.isOwn && <small>Bạn</small>}</th>
        <td>{item.slot.date.slice(8)}/{item.slot.date.slice(5, 7)}</td>
        <td>{item.slot.shiftCode} · {item.slot.shiftName}<small>{hours(item.slot)}</small></td>
        <td><span>{status(item, data.published)}</span>{item.reviewReason && <small>{item.reviewReason}</small>}</td>
        {storeId && !data.published && <td>{item.canManage && <div className="crm-work-actions">
          {pending(item) && !item.expired && <button type="button" className="btn btn--primary" disabled={disabled}
            onClick={() => open({ action: 'APPROVE', item })}>{actions.APPROVE}</button>}
          <button type="button" className="btn" disabled={disabled || !data.shifts.length || !futureDays.length}
            onClick={() => open({ action: 'EDIT', item })}>{actions.EDIT}</button>
          <button type="button" className="btn" disabled={disabled} onClick={() => open({ action: 'REMOVE', item })}>{actions.REMOVE}</button>
        </div>}</td>}
      </tr>)}</tbody>
    </table></div> : <p>Chưa có đăng ký ca trong tuần này.</p>)}
    {dialog && <CrmDialog title={actions[dialog.action]} busy={busy} onClose={() => setDialog(null)}>
      <form className="crm-work-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {'item' in dialog && <p>{dialog.item.employeeName} · {dialog.item.slot.date} · {dialog.item.slot.shiftCode}</p>}
        {action === 'REMOVE' && <p>Ca sẽ được gỡ khỏi bảng đăng ký và bản nháp lịch tuần.</p>}
        {action === 'ADD' && <label className="field">Nhân viên<select aria-label="Nhân viên" className="input" required disabled={busy}
          value={employeeId} onChange={(e) => setEmployeeId(e.target.value)}><option value="">Chọn nhân viên</option>
          {data?.roster.map((p) => <option key={p.employeeId} value={p.employeeId}>{p.fullName} · {p.employeeCode}</option>)}</select></label>}
        {needsSlot && <>
          <label className="field">Ngày làm<select aria-label="Ngày làm" className="input" required disabled={busy} value={date} onChange={(e) => { setDate(e.target.value); setShiftId(''); }}>
            {futureDays.map((d) => <option key={d} value={d}>{d.slice(8)}/{d.slice(5, 7)}</option>)}
          </select></label>
          <label className="field">Ca làm<select aria-label="Ca làm" className="input" required disabled={busy} value={shift ? shiftId : ''} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Chọn ca</option>
            {currentShifts.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name} · {hours(s)}</option>)}
          </select></label>
          {!currentShifts.length && <p>Ngày này không còn ca có thể đăng ký. Hãy chọn ngày khác.</p>}
        </>}
        {needsReason && <label className="field">Lý do<textarea aria-label="Lý do" className="textarea" required disabled={busy} minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        {data?.published && <p role="alert">Tuần đã công bố. Hãy dùng luồng đổi hoặc nhận ca thay.</p>}
        {saveError && <p className="banner banner--error" role="alert">{saveError}</p>}
        <button className="btn btn--primary" disabled={disabled || invalid}>{busy ? 'Đang lưu…' : action === 'REGISTER' ? 'Gửi đăng ký' : actions[dialog.action]}</button>
      </form>
    </CrmDialog>}
  </section>;
}

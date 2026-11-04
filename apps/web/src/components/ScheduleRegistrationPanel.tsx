import { useCallback, useEffect, useRef, useState } from 'react';
import type { ScheduleAssignment, ScheduleRegistration, ScheduleRegistrationAction, ScheduleRegistrations } from '@hr-blockbot/contracts';
import { requestJson } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';

const actions: Record<ScheduleRegistrationAction, string> = {
  APPROVE: 'Duyệt ca', PROPOSE: 'Đề xuất ca khác', REJECT: 'Từ chối đăng ký',
  ACCEPT: 'Đồng ý ca đề xuất', DECLINE: 'Từ chối ca đề xuất', CANCEL: 'Hủy đăng ký',
};
const states: Record<ScheduleRegistration['status'], string> = {
  PENDING_MANAGER: 'Chờ quản lý duyệt', PENDING_EMPLOYEE: 'Chờ nhân viên phản hồi',
  APPROVED: 'Đã duyệt', REJECTED: 'Quản lý đã từ chối', DECLINED: 'Nhân viên đã từ chối ca đề xuất', CANCELLED: 'Đã hủy',
};
type Dialog = { clientRequestId: string } | { item: ScheduleRegistration; action: ScheduleRegistrationAction };

export function ScheduleRegistrationPanel({ storeId, days, today, hours, blocked, canRespond, onChanged }: {
  storeId?: string; days: string[]; today: string; hours: (slot: Pick<ScheduleAssignment, 'intervals'>) => string;
  blocked: boolean; canRespond?: boolean; onChanged: () => Promise<void>;
}) {
  const weekStart = days[0];
  const [data, setData] = useState<ScheduleRegistrations | null>(null);
  const [error, setError] = useState(''), [saveError, setSaveError] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [date, setDate] = useState(''), [shiftId, setShiftId] = useState(''), [reason, setReason] = useState('');
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try {
      const path = storeId ? '/scheduling/stores/' + storeId + '/registrations' : '/scheduling/registrations/me';
      const result = await requestJson<ScheduleRegistrations>(path + '?weekStart=' + weekStart);
      if (current === sequence.current) setData(result);
    } catch (e) { if (current === sequence.current) setError(e instanceof Error ? e.message : 'Chưa tải được đăng ký ca.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [storeId, weekStart]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);

  const futureDays = days.filter((d) => d >= today);
  const currentShifts = (data?.shifts ?? []).filter((shift) => shift.intervals.every((p) =>
    Date.parse(date + 'T00:00:00+07:00') + p.startMinute * 60000 > Date.now()));
  const shift = currentShifts.find((s) => s.id === shiftId);
  const open = (next: Dialog) => {
    setDate(futureDays[0] ?? ''); setShiftId(''); setReason(''); setSaveError(''); setDialog(next);
  };
  const action = dialog && 'action' in dialog ? dialog.action : null;
  const isSlotNeeded = !!dialog && (!('action' in dialog) || action === 'PROPOSE');
  const isReasonNeeded = action === 'PROPOSE' || action === 'REJECT';
  const title = action ? actions[action] : 'Đăng ký ca làm';
  const submit = async () => {
    if (!data || !dialog || busy || blocked || (isSlotNeeded && !shift) || (isReasonNeeded && reason.trim().length < 5)) return;
    const slot = shift ? { date, shiftId: shift.id, shiftVersion: shift.version } : undefined;
    const path = 'action' in dialog ? '/scheduling/stores/' + data.storeId + '/registrations/' + dialog.item.id : '/scheduling/registrations';
    const body = 'action' in dialog ? { weekStart, expectedVersion: dialog.item.version, action: dialog.action,
      ...(dialog.action === 'PROPOSE' ? { alternative: slot } : {}), ...(isReasonNeeded ? { reason } : {}) } :
      { weekStart, clientRequestId: dialog.clientRequestId, slot };
    setBusy(true); setSaveError('');
    try {
      await requestJson(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      setDialog(null);
      await Promise.all([load(), onChanged()]);
    } catch (e) { setSaveError(e instanceof Error ? e.message : 'Chưa lưu được yêu cầu.'); }
    finally { setBusy(false); }
  };
  const buttons = (item: ScheduleRegistration): ScheduleRegistrationAction[] => {
    if (storeId) {
      if (item.status === 'PENDING_MANAGER') return [...(item.expired ? [] : ['APPROVE'] as const), ...(futureDays.length && data?.shifts.length ? ['PROPOSE'] as const : []), 'REJECT'];
      return item.status === 'PENDING_EMPLOYEE' ? ['REJECT'] : [];
    }
    if (item.status === 'PENDING_MANAGER') return ['CANCEL'];
    if (item.status === 'PENDING_EMPLOYEE') return canRespond ? [...(item.expired ? [] : ['ACCEPT'] as const), 'DECLINE'] : ['CANCEL'];
    return [];
  };
  const slotLabel = (slot: ScheduleAssignment) => slot.date.slice(8) + '/' + slot.date.slice(5, 7) + ' · ' + slot.shiftCode + ' · ' + hours(slot);
  const pendingCount = data?.items.filter((item) => item.status === (storeId ? 'PENDING_MANAGER' : 'PENDING_EMPLOYEE')).length ?? 0;
  const card = (item: ScheduleRegistration) => <article key={item.id} className="schedule-request">
    <div>
      <strong>{storeId && item.requested.employeeName + ' · '}{slotLabel(item.requested)}</strong>
      <p>{states[item.status]}{item.status === 'APPROVED' ? item.placement === 'PUBLISHED' ? ' · Đã công bố' :
        item.placement === 'DRAFT' ? ' · Chờ công bố lịch' : ' · Ca đã được điều chỉnh trong lịch' :
        item.expired && (item.status === 'PENDING_MANAGER' || item.status === 'PENDING_EMPLOYEE') ? ' · Ca đã qua giờ bắt đầu' : ''}</p>
      {item.alternative && <p>Ca đề xuất <strong>{slotLabel(item.alternative)}</strong></p>}
      {item.reviewReason && <p>Phản hồi quản lý · {item.reviewReason}</p>}
    </div>
    <div className="crm-work-actions">{buttons(item).map((a) => <button type="button" key={a}
      className={a === 'APPROVE' || a === 'ACCEPT' ? 'btn btn--primary' : 'btn'}
      disabled={blocked || busy || loading || !!error} onClick={() => open({ item, action: a })}>{actions[a]}</button>)}</div>
  </article>;
  const content = <>
    <div className="crm-work-toolbar">
      {!storeId && <button type="button" className="btn btn--primary" disabled={blocked || busy || loading || !!error || !data?.shifts.length || !futureDays.length}
        onClick={() => open({ clientRequestId: crypto.randomUUID() })}>Đăng ký ca làm</button>}
      <button type="button" className="btn" disabled={busy || loading} onClick={() => void load()}>Tải yêu cầu mới nhất</button>
    </div>
    {!storeId && data && <p>{data.storeName} · Chọn ca muốn làm và gửi quản lý. Ca chỉ vào lịch của bạn sau khi được công bố.</p>}
    {!storeId && data && !data.shifts.length && <p>Cửa hàng chưa có ca đang dùng để đăng ký.</p>}
    {storeId && blocked && <p>Lưu hoặc bỏ chỉnh sửa lịch nháp trước khi xử lý đăng ký.</p>}
    {error && <p className="banner banner--error" role="alert">{error}</p>}
    {loading && <p role="status">Đang tải đăng ký ca…</p>}
    {data && !error && (data.items.length ? data.items.map(card) : <p>Chưa có đăng ký ca trong tuần này.</p>)}
  </>;
  return <section aria-label={storeId ? 'Duyệt đăng ký ca' : 'Đăng ký ca của tôi'} className="schedule-request">
    {storeId ? <details><summary>Đăng ký ca của nhân viên · {pendingCount} chờ duyệt</summary>{content}</details> :
      <><h3>Đăng ký ca của tôi{pendingCount > 0 ? ' · ' + pendingCount + ' chờ bạn phản hồi' : ''}</h3>{content}</>}
    {dialog && <CrmDialog title={title} busy={busy} onClose={() => setDialog(null)}>
      <form className="crm-work-form" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
        {'item' in dialog && <p>{slotLabel(dialog.action === 'ACCEPT' || dialog.action === 'DECLINE' ? dialog.item.alternative! : dialog.item.requested)}</p>}
        {isSlotNeeded && <>
          <label className="field">Ngày làm<select aria-label="Ngày làm" className="input" required disabled={busy} value={date} onChange={(e) => { setDate(e.target.value); setShiftId(''); }}>
            {futureDays.map((d) => <option key={d} value={d}>{d.slice(8)}/{d.slice(5, 7)}</option>)}
          </select></label>
          <label className="field">Ca làm<select aria-label="Ca làm" className="input" required disabled={busy} value={shiftId} onChange={(e) => setShiftId(e.target.value)}>
            <option value="">Chọn ca</option>
            {currentShifts.map((s) => <option key={s.id} value={s.id}>{s.code} · {s.name} · {hours(s)}</option>)}
          </select></label>
          {!currentShifts.length && <p>Ngày này không còn ca có thể đăng ký. Hãy chọn ngày khác.</p>}
        </>}
        {isReasonNeeded && <label className="field">Lý do<textarea aria-label="Lý do" className="textarea" required disabled={busy} minLength={5} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>}
        {saveError && <p className="banner banner--error" role="alert">{saveError}</p>}
        <button className="btn btn--primary" disabled={busy || (isSlotNeeded && !shift) || (isReasonNeeded && reason.trim().length < 5)}>
          {busy ? 'Đang lưu…' : action ? title : 'Gửi quản lý'}
        </button>
      </form>
    </CrmDialog>}
  </section>;
}

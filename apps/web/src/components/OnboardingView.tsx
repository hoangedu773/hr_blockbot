import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuthorization } from '../context/useAuthorization';
import { useAuth } from '../context/AuthContext';
import { requestJson } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';
import { WorkflowHistoryNavigation, WorkflowAuditNotice } from './WorkflowHistoryNavigation';
type RequestRow = { id: string; version: number; auditIntegrity?: string; status: string; storeId: string; requestedBy: string; deliveryState: string;
  payload: { employeeCode: string; fullName: string; phone: string; hiredAt: string }; history: { type: string; actor: string; at: string; reason: string }[] };
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const states: Record<string, string> = { DRAFT: 'Bản nháp', PENDING_HR_REVIEW: 'Chờ HR độc lập duyệt', REJECTED: 'Từ chối', PROVISIONING: 'Đang tạo liên kết', PENDING_ACTIVATION: 'Chờ nhân viên kích hoạt', ACTIVATING: 'Đang hoàn tất kích hoạt', ACTIVE: 'Đã kích hoạt' };
export function OnboardingView() {
  const { user } = useAuth(); const { can, stores } = useAuthorization();
  const [rows, setRows] = useState<RequestRow[]>([]), [error, setError] = useState(''), [message, setMessage] = useState(''), [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false), [selected, setSelected] = useState<RequestRow | null>(null), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const [values, setValues] = useState({ employeeCode: '', fullName: '', phone: '', hiredAt: '', storeId: '', reason: '' });
  const [amending, setAmending] = useState<RequestRow | null>(null);
  const [page, setPage] = useState(1), [hasNext, setHasNext] = useState(false);
  const writing = useRef(false), sequence = useRef(0), detailSequence = useRef(0);
  const openHistory = async (id: string) => { const current = ++detailSequence.current; try { const row = await requestJson<RequestRow>('/onboarding/' + id); if (current === detailSequence.current) { setSelected(row); setReason(''); setError(''); } } catch (failure) { if (current === detailSequence.current) setError(failure instanceof Error ? failure.message : 'Không truy hồi được lịch sử.'); } };
  const creation = can('onboarding.propose') ? 'onboarding.propose' : 'onboarding.draft';
  const options = stores.filter((store) => store.capabilities.includes(creation));
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true);
    try { const response = await requestJson<{ items: RequestRow[]; paging: { hasNext: boolean } }>('/onboarding?page=' + page + '&limit=20'); if (current === sequence.current) { setRows(response.items); setHasNext(response.paging?.hasNext ?? false); setError(''); } }
    catch (failure) { if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Không tải được yêu cầu.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [page]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  const run = async (path: string, body: unknown, success: string) => {
    if (writing.current) return; writing.current = true; setBusy(true); setError('');
    try { await requestJson(path, post(body)); setMessage(success); setForm(false); setSelected(null); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thực hiện được. Bản nhập được giữ lại.'); }
    finally { writing.current = false; setBusy(false); }
  };
  const submit = (event: FormEvent) => { event.preventDefault(); const hiredAt = new Date(values.hiredAt + 'T00:00:00+07:00').toISOString(); void run(amending ? '/onboarding/' + amending.id + '/resubmit' : '/onboarding', amending ? { fullName: values.fullName, phone: values.phone, hiredAt, reason: values.reason, expectedVersion: amending.version } : { ...values, hiredAt }, amending ? 'Đã sửa/gửi lại trên cùng identity; lịch sử từ chối vẫn được giữ, cần HR độc lập duyệt lại.' : creation === 'onboarding.draft' ? 'Đã lưu nháp. Cần gửi HR khác duyệt.' : 'Đã gửi đề nghị đến HR. Chưa tạo tài khoản active.'); };
  return <section className="crm-workspace" aria-label="Tiếp nhận nhân viên mới">
    <header className="crm-work-heading"><div><h2>Tiếp nhận nhân viên mới</h2><p>SM đề nghị · HR độc lập duyệt · hệ thống tạo staff chờ kích hoạt. Chức danh không cấp quyền.</p></div>
      <div className="crm-work-actions"><button className="btn" disabled={busy || loading} onClick={() => void load()}>Làm mới yêu cầu</button>{can(creation) && <button className="btn btn--primary" onClick={() => { setAmending(null); setForm(true); setError(''); setValues((old) => ({ ...old, storeId: old.storeId || options[0]?.id || '' })); }}>Tạo đề nghị nhân viên</button>}</div></header>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Đang tải đề nghị…</p> : !rows.length ? <p>Chưa có đề nghị trong phạm vi được cấp.</p> : rows.map((row) => <article className="crm-report-card" key={row.id}>
      <h3>{row.payload.fullName} · {row.payload.employeeCode}</h3><p>{stores.find((store) => store.id === row.storeId)?.name || row.storeId} · {states[row.status] || row.status}</p>
      <p>Kênh kích hoạt: {row.deliveryState === 'NOT_CONFIGURED' ? 'Chưa cấu hình kênh gửi an toàn; tài khoản vẫn chờ kích hoạt' : row.deliveryState}</p>
      <button className="btn" onClick={() => void openHistory(row.id)}>Đối chiếu và lịch sử</button>
      {row.status === 'REJECTED' && row.requestedBy === user?.id && can(creation) && <button className="btn" disabled={busy} onClick={() => { setAmending(row); setValues({ ...row.payload, storeId: row.storeId, hiredAt: new Date(row.payload.hiredAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }), reason: '' }); setForm(true); }}>Chỉnh sửa và gửi lại</button>}
      {row.status === 'DRAFT' && row.requestedBy === user?.id && can('onboarding.draft') && <button className="btn" disabled={busy} onClick={() => void run(`/onboarding/${row.id}/submit`, { expectedVersion: row.version }, 'Đã chuyển HR độc lập duyệt.')}>Gửi duyệt</button>}
      {['PROVISIONING', 'PENDING_ACTIVATION', 'ACTIVATING'].includes(row.status) && can('onboarding.review') && row.requestedBy !== user?.id && <button className="btn" disabled={busy} onClick={() => void run(`/onboarding/${row.id}/resume`, {}, 'Đã tiếp tục xử lý an toàn; xem trạng thái hiện tại.')}>Tiếp tục xử lý</button>}
    </article>)}
    <WorkflowHistoryNavigation label="onboarding" page={page} hasNext={hasNext} loading={loading || busy} onPage={setPage} onLookup={openHistory} />
    {form && <CrmDialog title="Đề nghị tiếp nhận nhân viên" busy={busy} onClose={() => { if (!busy) setForm(false); }}><form className="crm-work-form" onSubmit={submit}>
      <label className="field">Cửa hàng<select aria-label="Cửa hàng" className="input" required value={values.storeId} disabled={busy || !!amending} onChange={(event) => setValues({ ...values, storeId: event.target.value })}><option value="">Chọn cửa hàng được cấp</option>{options.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      {([['employeeCode', 'Mã nhân viên'], ['fullName', 'Họ tên'], ['phone', 'Thông tin điện thoại'], ['hiredAt', 'Ngày bắt đầu'], ['reason', 'Lý do đề nghị']] as const).map(([field, label]) => <label className="field" key={field}>{label}<input className="input" required disabled={busy || !!amending && field === 'employeeCode'} maxLength={field === 'reason' ? 2000 : field === 'employeeCode' ? 64 : field === 'phone' ? 30 : 200} type={field === 'hiredAt' ? 'date' : 'text'} value={values[field]} onChange={(event) => setValues({ ...values, [field]: event.target.value })} /></label>)}
      {error && <p role="alert">{error}</p>}<button className="btn btn--primary" disabled={busy || !options.length}>{amending ? 'Gửi lại đề nghị đã chỉnh sửa' : 'Lưu đề nghị'}</button>
    </form></CrmDialog>}
    {selected && <CrmDialog title="Đối chiếu đề nghị tiếp nhận" busy={busy} onClose={() => { if (!busy) setSelected(null); }}>
      <WorkflowAuditNotice integrity={selected.auditIntegrity} /><p style={{ overflowWrap: 'anywhere' }}>Mã yêu cầu: {selected.id}</p><dl><dt>Nhân viên</dt><dd>{selected.payload.fullName} · {selected.payload.employeeCode}</dd><dt>Liên hệ</dt><dd>{selected.payload.phone}</dd><dt>Ngày vào làm</dt><dd>{new Date(selected.payload.hiredAt).toLocaleDateString('vi-VN')}</dd><dt>Trạng thái</dt><dd>{states[selected.status]}</dd></dl>
      {selected.history.map((entry, index) => <p key={index}>{new Date(entry.at).toLocaleString('vi-VN')} · {entry.type} · {entry.reason}</p>)}
      {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.status === 'PENDING_HR_REVIEW' && can('onboarding.review') && selected.requestedBy !== user?.id && <><label className="field">Lý do quyết định<textarea className="input" maxLength={2000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
        {['APPROVE', 'REJECT'].map((decision) => <button className="btn" key={decision} disabled={busy || !reason.trim()} onClick={() => void run(`/onboarding/${selected.id}/review`, { expectedVersion: selected.version, decision, reason: reason.trim() }, decision === 'APPROVE' ? 'Đã duyệt. Tài khoản staff chờ nhân viên kích hoạt.' : 'Đã từ chối và lưu lý do.')}>{decision === 'APPROVE' ? 'Phê duyệt tiếp nhận' : 'Từ chối đề nghị'}</button>)}</>}
      {error && <p role="alert">{error}</p>}
    </CrmDialog>}
  </section>;
}

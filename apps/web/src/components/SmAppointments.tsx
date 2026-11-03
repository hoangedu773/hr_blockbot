import { useCallback, useEffect, useRef, useState } from 'react';
import type { SmAppointment } from '@hr-blockbot/contracts';
import { useAuthorization } from '../context/useAuthorization';
import { useAuth } from '../context/AuthContext';
import { requestJson } from '../services/api';

export const SM_POSITION_LABELS = { PRIMARY: 'SM phụ trách chính cửa hàng', ADDITIONAL: 'SM kiêm nhiệm outlet khác', SUPERVISORY: 'SM giám sát', TEMPORARY: 'SM thay tạm' };
// Visibility hint only; the API verifies source title and authority independently.
export const isSmPositionCandidate = (title: string | null | undefined) => ['SM', 'SM (CỬA HÀNG TRƯỞNG)', 'CỬA HÀNG TRƯỞNG'].includes(title?.trim().normalize('NFC').toUpperCase() || '');
const states: Record<string, string> = { PENDING: 'Chờ xác nhận độc lập', SCHEDULED: 'Chưa đến ngày hiệu lực', EFFECTIVE: 'Đang hiệu lực', EXPIRED: 'Hết hạn', REJECTED: 'Đã từ chối', REVOKED: 'Đã thu hồi' };
type Page = { items: SmAppointment[]; paging: { hasNext: boolean } };
const post = (body: unknown) => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function SmAppointments({ employeeId }: { employeeId: string }) {
  const { can, stores } = useAuthorization(), { user } = useAuth();
  const [data, setData] = useState<Page | null>(null), [page, setPage] = useState(1), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<SmAppointment['kind']>('PRIMARY'), [storeId, setStoreId] = useState(''), [from, setFrom] = useState(''), [until, setUntil] = useState('');
  const [basis, setBasis] = useState<SmAppointment['basis']>('SIMULATION_APPROVED'), [evidenceRef, setEvidence] = useState(''), [reason, setReason] = useState(''), [replacement, setReplacement] = useState('');
  const [detail, setDetail] = useState<SmAppointment | null>(null), [decisionReason, setDecisionReason] = useState(''), [handover, setHandover] = useState(''), [message, setMessage] = useState('');
  const sequence = useRef(0), detailSequence = useRef(0), requestId = useRef<string | null>(null);
  const load = useCallback(async () => {
    const seq = ++sequence.current; setError('');
    try { const value = await requestJson<Page>(`/employees/${employeeId}/sm-appointments?page=${page}&limit=10`); if (seq === sequence.current) setData(value); }
    catch (e) { if (seq === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được phân công.'); }
  }, [employeeId, page]);
  useEffect(() => { setData(null); void load(); return () => { sequence.current++; detailSequence.current++; }; }, [load]);
  const open = async (id: string) => { const seq = ++detailSequence.current; setError(''); setDecisionReason(''); setHandover(''); try {
    const row = await requestJson<SmAppointment>(`/employees/${employeeId}/sm-appointments/${id}`); if (seq === detailSequence.current) setDetail(row);
  } catch (e) { if (seq === detailSequence.current) setError(e instanceof Error ? e.message : 'Không tải được lịch sử.'); } };
  const mutate = async (path: string, body: unknown) => { if (busy) return; setBusy(true); setError(''); setMessage(''); try {
    const row = await requestJson<SmAppointment>(path, post(body)); setDetail(row); setMessage('Đã lưu hồ sơ phân công. Không thay đổi quyền hoặc quan hệ quản lý.'); requestId.current = null; await load();
  } catch (e) { setError(e instanceof Error ? e.message : 'Chưa lưu được. Giữ bản nhập và thử lại.'); } finally { setBusy(false); } };
  const canReview = can('employees.review') && detail && detail.requestedBy !== user?.id;
  return <section aria-label="Hồ sơ phân công SM" className="crm-report-card"><h3>Vị trí và phân công SM</h3>
    <button type="button" className="btn" disabled={busy} onClick={() => { void load(); if (detail) void open(detail.id); }}>Tải lại phân công</button>
    <p>SM cửa hàng và SM giám sát dùng chung profile <strong>sm</strong>. Căn cứ phân biệt là hồ sơ phân công được xác nhận, phạm vi và thời hạn; không suy từ SM1/2/3 hay số cửa hàng.</p>
    <p>Ghi nhận phân công không tự đổi chức danh hoặc quyền truy cập. Khi thay tạm cần xử lý riêng quyền được giao và bàn giao công việc; SM chính vẫn giữ chức vụ.</p>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}
    {!data && !error && <p role="status">Đang tải phân công…</p>}
    {data && <>{!data.items.length && <p>Chưa có hồ sơ phân công được ghi nhận. Quan hệ quản lý hiện có không thay thế quyết định bổ nhiệm.</p>}
      {data.items.map((row) => <article key={row.id}><h4>{SM_POSITION_LABELS[row.kind]}</h4><p>{states[row.effectiveState]} · {stores.find(s => s.id === row.storeId)?.name || row.storeId}</p><p>{new Date(row.validFrom).toLocaleString('vi-VN')} → {row.validUntil ? new Date(row.validUntil).toLocaleString('vi-VN') : 'Không ấn định ngày kết thúc'}</p><button className="btn" type="button" disabled={busy} onClick={() => void open(row.id)}>Căn cứ và lịch sử phân công</button></article>)}
      <nav aria-label="Phân trang phân công SM"><button className="btn" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page}</span><button className="btn" disabled={busy || !data.paging.hasNext} onClick={() => setPage(page + 1)}>Trang sau</button></nav></>}
    {detail && <div className="crm-report-card"><h4>{SM_POSITION_LABELS[detail.kind]} · {states[detail.effectiveState]}</h4><p>Căn cứ: {detail.evidenceRef}</p><p>Nguồn: {detail.basis === 'SIMULATION_APPROVED' ? 'Cơ cấu mô phỏng được duyệt' : 'Văn bản phân công đã đối chiếu'} · Cấp bậc: chưa xác minh</p><p>Lý do: {detail.reason}</p><p>Người đề nghị: {detail.requestedBy} · Người xác nhận: {detail.approvedBy || 'Chưa có'}</p>{detail.replacesAppointmentId && <p>Thay tạm phân công: {detail.replacesAppointmentId}</p>}<p>Lịch sử: {detail.auditIntegrity === 'VALID_LOCAL_CHAIN' ? 'Hash-chain ứng dụng hợp lệ, chưa neo công khai' : 'Không hợp lệ — không xử lý tiếp'}</p>
      {detail.history.map(item => <p key={item.id}>{new Date(item.at).toLocaleString('vi-VN')} · {item.before || 'Mới'} → {item.after} · {item.actorId} · {item.reason}{item.handoverRef ? ` · Bàn giao: ${item.handoverRef}` : ''}</p>)}
      {canReview && detail.auditIntegrity === 'VALID_LOCAL_CHAIN' && ['PENDING', 'APPROVED'].includes(detail.status) && <fieldset disabled={busy}><legend>Xác nhận độc lập trong phạm vi HR được cấp</legend><label className="field">Lý do quyết định<textarea aria-label="Lý do quyết định" className="input" value={decisionReason} maxLength={2000} onChange={e => setDecisionReason(e.target.value)} /></label>
        {detail.status === 'APPROVED' && <label className="field">Căn cứ bàn giao / thu hồi<input className="input" value={handover} maxLength={300} onChange={e => setHandover(e.target.value)} /></label>}
        {(detail.status === 'PENDING' ? ['APPROVE', 'REJECT'] : ['REVOKE']).map(action => <button type="button" className="btn" key={action} disabled={busy || decisionReason.trim().length < 3 || action === 'REVOKE' && handover.trim().length < 3} onClick={() => void mutate(`/employees/${employeeId}/sm-appointments/${detail.id}/decision`, { expectedVersion: detail.version, action, reason: decisionReason, ...(action === 'REVOKE' ? { handoverRef: handover } : {}) })}>{action === 'APPROVE' ? 'Xác nhận phân công' : action === 'REJECT' ? 'Từ chối đề nghị' : 'Thu hồi phân công'}</button>)}</fieldset>}
      <button type="button" className="btn" disabled={busy} onClick={() => setDetail(null)}>Đóng lịch sử</button></div>}
    {can('employees.update_other') && <details><summary>Đề nghị ghi nhận phân công SM</summary><form onSubmit={e => { e.preventDefault(); if (!from || busy) return; requestId.current ??= crypto.randomUUID(); void mutate(`/employees/${employeeId}/sm-appointments`, { clientRequestId: requestId.current, kind, storeId, validFrom: new Date(from).toISOString(), validUntil: until ? new Date(until).toISOString() : null, evidenceRef, basis, reason, replacesAppointmentId: kind === 'TEMPORARY' ? replacement : null }); }} onChange={() => { requestId.current = null; }}><fieldset disabled={busy}>
      <label className="field">Loại phân công<select aria-label="Loại phân công" className="input" value={kind} onChange={e => setKind(e.target.value as SmAppointment['kind'])}>{Object.entries(SM_POSITION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label className="field">Outlet được phân công<select aria-label="Outlet được phân công" className="input" required value={storeId} onChange={e => setStoreId(e.target.value)}><option value="">Chọn cửa hàng</option>{stores.filter(s => s.capabilities.includes('employees.update_other')).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label className="field">Hiệu lực từ<input type="datetime-local" className="input" required value={from} onChange={e => setFrom(e.target.value)} /></label><label className="field">Hiệu lực đến<input type="datetime-local" className="input" required={['TEMPORARY', 'ADDITIONAL'].includes(kind)} value={until} onChange={e => setUntil(e.target.value)} /></label>
      {kind === 'TEMPORARY' && <label className="field">Mã hồ sơ phân công SM chính được thay<input className="input" required pattern="[a-fA-F0-9]{24}" value={replacement} onChange={e => setReplacement(e.target.value)} /></label>}
      <label className="field">Nguồn căn cứ<select aria-label="Nguồn căn cứ" className="input" value={basis} onChange={e => setBasis(e.target.value as SmAppointment['basis'])}><option value="SIMULATION_APPROVED">Cơ cấu mô phỏng được duyệt</option><option value="DOCUMENTED_ASSIGNMENT">Văn bản phân công đã đối chiếu</option></select></label>
      <label className="field">Mã / tham chiếu quyết định<input className="input" required minLength={3} maxLength={300} value={evidenceRef} onChange={e => setEvidence(e.target.value)} /></label><label className="field">Lý do phân công<textarea aria-label="Lý do phân công" className="input" required minLength={3} maxLength={2000} value={reason} onChange={e => setReason(e.target.value)} /></label>
      <button className="btn" disabled={busy} type="submit">Gửi HR độc lập xác nhận</button></fieldset></form></details>}
  </section>;
}

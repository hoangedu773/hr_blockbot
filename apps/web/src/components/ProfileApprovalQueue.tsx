import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchMe, fetchProfileApprovalPage, reviewProfileChangeRequest, type PendingChangeRequestItem } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';
import { useAuth } from '../context/AuthContext';
import { useAuthorization } from '../context/useAuthorization';

const fieldName: Record<string, string> = { level: 'Cấp bậc', hiredAt: 'Ngày vào làm', jobTitle: 'Chức danh' };
const display = (value: unknown) => value == null ? 'Chưa có dữ liệu' : String(value);

/** Existing profile workflow with capability/store authorization, not rank inheritance. */
export function ProfileApprovalQueue() {
  const { user } = useAuth(); const { can } = useAuthorization();
  const [employeeId, setEmployeeId] = useState<string | null>(null);
  useEffect(() => { let current = true; void fetchMe().then((me) => { if (current) setEmployeeId(me.employeeId ?? null); }).catch(() => { if (current) setEmployeeId(null); }); return () => { current = false; }; }, [user?.id]);
  const [items, setItems] = useState<PendingChangeRequestItem[]>([]);
  const [page, setPage] = useState(1), [status, setStatus] = useState('PENDING'), [hasNext, setHasNext] = useState(false), [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<PendingChangeRequestItem | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState('');
  const [message, setMessage] = useState('');
  const writing = useRef(false);
  const sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true); setError('');
    try { const result = await fetchProfileApprovalPage(page, status); if (current === sequence.current) { setItems(result.items); setHasNext(result.paging.hasNext); setTotal(result.paging.totalItems); } }
    catch (failure) { if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Không tải được hàng đợi.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [page, status]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  const review = async (action: 'APPROVE' | 'REJECT') => {
    if (!selected || writing.current || !independent || action === 'APPROVE' && promotionPending) return;
    writing.current = true; setBusy(true); setDecisionError('');
    try {
      await reviewProfileChangeRequest(selected.employeeId, selected.request.id, { action, ...(reason.trim() ? { reason: reason.trim() } : {}) });
      setSelected(null); setMessage(action === 'APPROVE' ? 'Đã duyệt thay đổi hồ sơ. Nhân viên xem quyết định trong lịch sử của mình.' : 'Đã từ chối và lưu lý do để nhân viên xem, sửa và gửi lại.');
      await load();
    } catch (failure) { setDecisionError(failure instanceof Error ? failure.message : 'Không lưu được quyết định.'); }
    finally { writing.current = false; setBusy(false); }
  };
  const independent = can('employees.review') && !!employeeId && !!selected && selected.request.status === 'PENDING' && selected.employeeId !== employeeId && ![user?.id, employeeId].includes(selected.request.requestedBy);
  const promotionPending = !!selected && (selected.request.targetFields.level !== undefined || selected.request.targetFields.jobTitle !== undefined);
  return <section className="crm-work-detail" aria-label="Duyệt thay đổi hồ sơ">
    <header className="crm-work-heading"><div><h3>Duyệt thay đổi hồ sơ</h3><p>Đối chiếu giá trị cũ/mới. Không tự duyệt hồ sơ của mình; từ chối phải có lý do.</p></div><button className="btn" type="button" disabled={loading} onClick={() => void load()}>Làm mới hàng đợi</button></header>
    <label className="field">Trạng thái yêu cầu hồ sơ<select aria-label="Trạng thái yêu cầu hồ sơ" className="input" value={status} disabled={busy} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="PENDING">Chờ duyệt</option><option value="APPROVED">Đã duyệt</option><option value="REJECTED">Đã từ chối</option></select></label>
    <nav className="crm-work-actions" aria-label="Phân trang duyệt hồ sơ"><button className="btn" disabled={loading || busy || page === 1} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page} · {total} yêu cầu</span><button className="btn" disabled={loading || busy || !hasNext} onClick={() => setPage(page + 1)}>Trang sau</button></nav>
    {message && <p role="status">{message}</p>}
    {loading ? <p role="status">Đang tải yêu cầu chờ duyệt…</p> : error ? <p role="alert">{error}</p> : !items.length ? <p>Không có yêu cầu hồ sơ chờ duyệt trong phạm vi của bạn.</p> : items.map((item) => <article className="crm-report-card" key={item.employeeId + item.request.id}><strong>{item.employeeName}</strong><p>{new Date(item.request.requestedAt).toLocaleString('vi-VN')} · {Object.keys(item.request.targetFields).map((key) => fieldName[key] || key).join(', ')}</p><button className="btn" type="button" onClick={() => { setSelected(item); setReason(''); setDecisionError(''); }}>Đối chiếu & quyết định</button></article>)}
    {selected && <CrmDialog title="Duyệt thay đổi hồ sơ" busy={busy} onClose={() => { if (!writing.current) setSelected(null); }}>
      <p>{selected.employeeName}</p>
      <p>Trạng thái: {selected.request.status}{selected.request.rejectionReason ? ' · ' + selected.request.rejectionReason : ''}</p>
      {!independent && <p role="status">Không tự duyệt yêu cầu do mình lập hoặc hồ sơ của mình; cần HR độc lập có grant review phù hợp.</p>}
      {promotionPending && <p role="status">Đổi chức danh/cấp bậc đang PENDING chính sách riêng. Chưa thể phê duyệt; có thể giữ chờ hoặc từ chối có lý do.</p>}
      <div className="crm-work-table-wrap"><table className="table"><caption>Thông tin cần thay đổi</caption><thead><tr><th>Trường</th><th>Khi gửi yêu cầu</th><th>Đề nghị</th></tr></thead><tbody>{Object.entries(selected.request.targetFields).map(([key, value]) => <tr key={key}><td>{fieldName[key] || key}</td><td>{display(selected.request.previousSnapshot[key])}</td><td>{display(value)}</td></tr>)}</tbody></table></div>
      <label className="field"><span className="field__label">Lý do quyết định hồ sơ (bắt buộc khi từ chối)</span><textarea className="textarea" maxLength={2000} disabled={busy} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
      {decisionError && <p role="alert">{decisionError}</p>}
      <div className="crm-work-actions"><button className="btn" type="button" disabled={busy || !independent || !reason.trim()} onClick={() => void review('REJECT')}>Từ chối thay đổi hồ sơ</button><button className="btn btn--primary" type="button" disabled={busy || !independent || promotionPending} onClick={() => void review('APPROVE')}>Xác nhận duyệt hồ sơ</button></div>
    </CrmDialog>}
  </section>;
}

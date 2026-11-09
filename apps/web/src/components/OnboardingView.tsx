import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuthorization } from '../context/useAuthorization';
import { useAuth } from '../context/AuthContext';
import { requestJson } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';
import { WorkflowHistoryNavigation } from './WorkflowHistoryNavigation';
import { InitialManagerPicker } from './InitialManagerPicker';
type RequestRow = { id: string; version: number; auditIntegrity?: string; status: string; storeId: string; requestedBy: string; deliveryState: string;
  initialReporting?: { managerName: string; status: string; validFrom: string | null } | null;
  payload: { employeeCode: string; fullName: string; phone: string; email?: string; hiredAt: string }; history: { type: string; actor: string; at: string; reason: string }[] };
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const states: Record<string, string> = { DRAFT: 'Bản nháp', PENDING_HR_REVIEW: 'Chờ HR độc lập duyệt', REJECTED: 'Từ chối', PROVISIONING: 'Đang tạo liên kết', PENDING_ACTIVATION: 'Chờ nhân viên kích hoạt', ACTIVATING: 'Đang hoàn tất kích hoạt', ACTIVE: 'Đã kích hoạt' };
const reportingStates: Record<string, string> = { NOT_SUBMITTED: 'Chưa gửi đề xuất', PENDING: 'Chờ cấp trên trực tiếp của người đề nghị duyệt sau HR', APPROVED: 'Đã duyệt, chờ áp dụng', APPLIED: 'Đã có hiệu lực' };
const intakeFields = [['fullName', 'Họ tên'], ['phone', 'Thông tin điện thoại'], ['email', 'Email nhận link kích hoạt'], ['hiredAt', 'Ngày vào làm'], ['reason', 'Lý do đề nghị']] as const;
const emptyIntake = (storeId: string) => {
  const clientRequestId: string = crypto.randomUUID();
  return { clientRequestId, fullName: '', phone: '', email: '', hiredAt: '', storeId, reason: '' };
};
export function OnboardingView({ chatMode, initialRequestId }: { chatMode?: 'review'; initialRequestId?: string } = {}) {
  const { user } = useAuth(); const { can, stores } = useAuthorization();
  const creation = can('onboarding.propose') ? 'onboarding.propose' : 'onboarding.draft';
  const options = stores.filter((store) => store.capabilities.includes(creation));
  const onlyStore = options.length === 1 ? options[0].id : '';
  const [rows, setRows] = useState<RequestRow[]>([]), [error, setError] = useState(''), [message, setMessage] = useState(''), [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false), [selected, setSelected] = useState<RequestRow | null>(null), [reason, setReason] = useState(''), [busy, setBusy] = useState(false);
  const [values, setValues] = useState(() => emptyIntake(''));
  const [amending, setAmending] = useState<RequestRow | null>(null);
  const [managerId, setManagerId] = useState('');
  const [managerReadyStore, setManagerReadyStore] = useState('');
  const [page, setPage] = useState(1), [hasNext, setHasNext] = useState(false);
  const writing = useRef(false), sequence = useRef(0), detailSequence = useRef(0);
  const openHistory = useCallback(async (id: string) => { const current = ++detailSequence.current; try { const row = await requestJson<RequestRow>('/onboarding/' + id); if (current === detailSequence.current) { setSelected(row); setReason(''); setError(''); } } catch (failure) { if (current === detailSequence.current) setError(failure instanceof Error ? failure.message : 'Không truy hồi được lịch sử.'); } }, []);
  useEffect(() => {
    if (initialRequestId) void openHistory(initialRequestId);
    return () => { detailSequence.current++; };
  }, [initialRequestId, openHistory]);
  const canChooseManager = !amending && options.some(store => store.id === values.storeId && store.capabilities.includes('onboarding.reporting_propose'));
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true);
    const path = chatMode === 'review' ? '/onboarding/pending-review' : '/onboarding';
    try { const response = await requestJson<{ items: RequestRow[]; paging: { hasNext: boolean } }>(path + '?page=' + page + '&limit=20'); if (current === sequence.current) { setRows(response.items); setHasNext(response.paging?.hasNext ?? false); } }
    catch (failure) { if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Không tải được yêu cầu.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [page, chatMode]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  const run = async (path: string, body: unknown, success: string) => {
    if (writing.current) return; writing.current = true; setBusy(true); setError('');
    try { const saved = await requestJson<RequestRow>(path, post(body)); setMessage(success + (path === '/onboarding' ? ' Mã nhân viên: ' + saved.payload.employeeCode + '.' : '')); setForm(false); setSelected(null); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Không thực hiện được. Bản nhập được giữ lại.'); }
    finally { writing.current = false; setBusy(false); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (canChooseManager && managerReadyStore !== values.storeId) return;
    const hiredAt = new Date(values.hiredAt + 'T00:00:00+07:00').toISOString();
    void run(amending ? '/onboarding/' + amending.id + '/resubmit' : '/onboarding',
      amending ? { fullName: values.fullName, phone: values.phone, email: values.email, hiredAt, reason: values.reason, expectedVersion: amending.version }
        : { ...values, hiredAt, ...(canChooseManager && managerId ? { initialManagerEmployeeId: managerId } : {}) },
      amending ? 'Đã sửa và gửi lại đề nghị. Hồ sơ cần HR độc lập duyệt lại.' : creation === 'onboarding.draft' ? 'Đã lưu nháp. Cần gửi HR khác duyệt.'
        : canChooseManager && managerId ? 'Đã gửi đề nghị đến HR và lưu quản lý trực tiếp đề xuất.' : 'Đã gửi đề nghị đến HR.');
  };
  return <section className="crm-workspace" aria-label="Tiếp nhận nhân viên mới">
    <header className="crm-work-heading"><div><h2>{chatMode === 'review' ? 'Hồ sơ chờ HR duyệt' : 'Tiếp nhận nhân viên mới'}</h2><p>SM đề nghị · HR độc lập duyệt · nhân viên kích hoạt tài khoản.</p></div>
      <div className="crm-work-actions"><button className="btn" disabled={busy || loading} onClick={() => { setError(''); void load(); }}>Làm mới yêu cầu</button>{chatMode !== 'review' && can(creation) && <button className="btn btn--primary" onClick={() => { setAmending(null); setManagerId(''); setManagerReadyStore(''); setForm(true); setError(''); setValues(emptyIntake(onlyStore)); }}>Tạo đề nghị nhân viên</button>}</div></header>
    {message && <p role="status">{message}</p>}{error && <p role="alert">{error}</p>}
    {loading ? <p role="status">Đang tải đề nghị…</p> : !rows.length ? <p>Chưa có đề nghị trong phạm vi được cấp.</p> : rows.map((row) => <article className="crm-report-card" key={row.id}>
      <h3>{row.payload.fullName} · {row.payload.employeeCode}</h3><p>{stores.find((store) => store.id === row.storeId)?.name || row.storeId} · {states[row.status] || row.status}</p>
      <p>Kênh kích hoạt: {row.deliveryState === 'NOT_CONFIGURED' ? 'Chưa cấu hình kênh gửi an toàn; tài khoản vẫn chờ kích hoạt' : row.deliveryState}</p>
      <button className="btn" onClick={() => void openHistory(row.id)}>Đối chiếu và lịch sử</button>
      {row.status === 'REJECTED' && row.requestedBy === user?.id && can(creation) && <button className="btn" disabled={busy} onClick={() => { setAmending(row); setValues({ clientRequestId: '', fullName: row.payload.fullName, phone: row.payload.phone, email: row.payload.email ?? '', storeId: row.storeId, hiredAt: new Date(row.payload.hiredAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' }), reason: '' }); setForm(true); }}>Chỉnh sửa và gửi lại</button>}
      {row.status === 'DRAFT' && row.requestedBy === user?.id && can('onboarding.draft') && <button className="btn" disabled={busy} onClick={() => void run(`/onboarding/${row.id}/submit`, { expectedVersion: row.version }, 'Đã chuyển HR độc lập duyệt.')}>Gửi duyệt</button>}
      {['PROVISIONING', 'PENDING_ACTIVATION', 'ACTIVATING'].includes(row.status) && can('onboarding.review') && row.requestedBy !== user?.id && <button className="btn" disabled={busy} onClick={() => void run(`/onboarding/${row.id}/resume`, {}, 'Đã tiếp tục xử lý an toàn; xem trạng thái hiện tại.')}>Tiếp tục xử lý</button>}
    </article>)}
    <WorkflowHistoryNavigation label="onboarding" page={page} hasNext={hasNext} loading={loading || busy} onPage={setPage} onLookup={openHistory} />
    {form && can(creation) && <CrmDialog title="Đề nghị tiếp nhận nhân viên" busy={busy} onClose={() => { if (!busy) setForm(false); }}><form className="crm-work-form" onSubmit={submit}>
      <p>Nhân viên sẽ công tác tại cửa hàng tiếp nhận đã chọn.</p>
      <label className="field">Cửa hàng<select aria-label="Cửa hàng" className="input" required value={values.storeId} disabled={busy || !!amending} onChange={(event) => { setManagerId(''); setManagerReadyStore(''); setValues({ ...values, storeId: event.target.value }); }}><option value="">Chọn cửa hàng được cấp</option>{options.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
      {canChooseManager && <InitialManagerPicker key={values.storeId} storeId={values.storeId} value={managerId} onChange={setManagerId} onReady={setManagerReadyStore} busy={busy} />}
      <label className="field">Mã nhân viên<input className="input" readOnly value={amending ? amending.payload.employeeCode : 'Tự động cấp khi lưu đề nghị'} /></label>
      <p>{amending ? 'Mã đã cấp được giữ nguyên khi chỉnh sửa hoặc gửi lại.' : 'Mã có dạng GT-CH + 2 số năm + 2 số tháng bắt đầu + 4 số thứ tự.'}</p>
      {intakeFields.map(([field, label]) => <label className="field" key={field}>{label}<input className="input" required disabled={busy} maxLength={field === 'reason' ? 2000 : field === 'phone' ? 30 : field === 'email' ? 254 : 200} type={field === 'hiredAt' ? 'date' : field === 'email' ? 'email' : 'text'} value={values[field]} onChange={(event) => setValues({ ...values, [field]: event.target.value })} /></label>)}
      {error && <p role="alert">{error}</p>}<button className="btn btn--primary" disabled={busy || !options.length || canChooseManager && managerReadyStore !== values.storeId}>{amending ? 'Gửi lại đề nghị đã chỉnh sửa' : 'Lưu đề nghị'}</button>
    </form></CrmDialog>}
    {selected && <CrmDialog title="Đối chiếu đề nghị tiếp nhận" busy={busy} onClose={() => { if (!busy) setSelected(null); }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '12px',
        padding: '10px 14px',
        background: selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)',
        border: `1px solid ${selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)'}`,
        borderRadius: '8px',
        marginBottom: '16px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
          <span>{selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? '🛡️' : '⚠️'}</span>
          <span style={{ color: selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? '#4ade80' : '#f87171', fontWeight: 500 }}>
            {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? 'Chuỗi kiểm toán hợp lệ (Local Hash-chain Verified)' : 'Cảnh báo tính toàn vẹn bản ghi'}
          </span>
        </div>
        <code style={{ fontSize: '11px', color: '#94a3b8', background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px' }}>
          Mã: {selected.id}
        </code>
      </div>

      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '14px',
        padding: '14px',
        background: 'rgba(255, 255, 255, 0.03)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 255, 255, 0.07)',
        marginBottom: '16px'
      }}>
        <div style={{
          width: '46px',
          height: '46px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '18px',
          fontWeight: 'bold',
          color: '#fff',
          flexShrink: 0
        }}>
          {selected.payload.fullName.charAt(0).toUpperCase()}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 600, color: '#f8fafc' }}>
              {selected.payload.fullName}
            </h3>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              padding: '2px 8px',
              borderRadius: '4px',
              background: 'rgba(59, 130, 246, 0.15)',
              color: '#60a5fa',
              border: '1px solid rgba(59, 130, 246, 0.3)'
            }}>
              {selected.payload.employeeCode}
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '12.5px', color: '#94a3b8' }}>
            {stores.find(s => s.id === selected.storeId)?.name || 'Cửa hàng tiếp nhận'}
          </p>
        </div>
        <div style={{
          fontSize: '12px',
          fontWeight: 600,
          padding: '4px 10px',
          borderRadius: '16px',
          background: selected.status === 'PENDING_HR_REVIEW' ? 'rgba(245, 158, 11, 0.15)' : selected.status === 'APPROVED' || selected.status === 'ACTIVE' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(148, 163, 184, 0.15)',
          color: selected.status === 'PENDING_HR_REVIEW' ? '#fbbf24' : selected.status === 'APPROVED' || selected.status === 'ACTIVE' ? '#4ade80' : '#cbd5e1',
          border: `1px solid ${selected.status === 'PENDING_HR_REVIEW' ? 'rgba(245, 158, 11, 0.3)' : selected.status === 'APPROVED' || selected.status === 'ACTIVE' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`,
          whiteSpace: 'nowrap'
        }}>
          {states[selected.status] || selected.status}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Số điện thoại</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#f1f5f9', marginTop: '4px' }}>
            📞 {selected.payload.phone}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Email kích hoạt</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#f1f5f9', marginTop: '4px', overflowWrap: 'anywhere' }}>
            ✉️ {selected.payload.email || 'Chưa có email'}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Ngày vào làm</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#f1f5f9', marginTop: '4px' }}>
            📅 {new Date(selected.payload.hiredAt).toLocaleDateString('vi-VN')}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Kênh kích hoạt</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#f1f5f9', marginTop: '4px' }}>
            🔗 {selected.deliveryState === 'DELIVERED' ? 'Đã gửi lời mời' : selected.deliveryState === 'PENDING' ? 'Đang gửi' : 'Chờ kích hoạt'}
          </div>
        </div>
      </div>

      {selected.initialReporting && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          padding: '10px 14px',
          background: 'rgba(99, 102, 241, 0.08)',
          borderRadius: '8px',
          border: '1px solid rgba(99, 102, 241, 0.2)',
          marginBottom: '16px'
        }}>
          <span style={{ fontSize: '18px' }}>👤</span>
          <div style={{ fontSize: '13px', lineHeight: 1.4 }}>
            <span style={{ color: '#94a3b8' }}>Quản lý trực tiếp đề xuất: </span>
            <strong style={{ color: '#e2e8f0' }}>{selected.initialReporting.managerName}</strong>
            <span style={{ color: '#a5b4fc', marginLeft: '6px' }}>
              ({reportingStates[selected.initialReporting.status] ?? selected.initialReporting.status})
            </span>
          </div>
        </div>
      )}

      {selected.history && selected.history.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <div style={{ fontSize: '12px', fontWeight: 600, color: '#94a3b8', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Lịch sử xử lý hồ sơ
          </div>
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
            maxHeight: '140px',
            overflowY: 'auto',
            padding: '8px 12px',
            background: 'rgba(0, 0, 0, 0.2)',
            borderRadius: '8px',
            border: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            {selected.history.map((entry, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', fontSize: '12.5px', lineHeight: 1.4 }}>
                <span style={{ color: '#64748b', fontSize: '11px', whiteSpace: 'nowrap', marginTop: '2px' }}>
                  {new Date(entry.at).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })} · {new Date(entry.at).toLocaleDateString('vi-VN')}
                </span>
                <span style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  background: 'rgba(255, 255, 255, 0.08)',
                  color: '#cbd5e1'
                }}>
                  {entry.type}
                </span>
                <span style={{ color: '#e2e8f0', flex: 1 }}>
                  {entry.reason}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.status === 'PENDING_HR_REVIEW' && can('onboarding.review') && selected.requestedBy !== user?.id ? (
        <div style={{
          marginTop: '16px',
          paddingTop: '16px',
          borderTop: '1px solid rgba(255, 255, 255, 0.1)'
        }}>
          <label className="field" style={{ marginBottom: '14px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Lý do quyết định (ghi chú kiểm duyệt)</span>
            <textarea
              className="input"
              maxLength={2000}
              value={reason}
              disabled={busy}
              placeholder="Nhập nhận xét hoặc lý do phê duyệt/từ chối tiếp nhận..."
              style={{ minHeight: '70px', marginTop: '6px' }}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn"
              disabled={busy}
              style={{
                background: 'transparent',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                color: '#cbd5e1',
                padding: '8px 16px',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
              onClick={() => setSelected(null)}
            >
              Đóng
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || !reason.trim()}
              style={{
                background: '#dc2626',
                color: '#fff',
                fontWeight: 600,
                border: 'none',
                padding: '8px 18px',
                borderRadius: '8px',
                cursor: busy || !reason.trim() ? 'not-allowed' : 'pointer',
                opacity: busy || !reason.trim() ? 0.6 : 1
              }}
              onClick={() => void run(`/onboarding/${selected.id}/review`, { expectedVersion: selected.version, decision: 'REJECT', reason: reason.trim() }, 'Đã từ chối và lưu lý do.')}
            >
              ✕ Từ chối đề nghị
            </button>
            <button
              type="button"
              className="btn btn--primary"
              disabled={busy || !reason.trim()}
              style={{
                background: '#16a34a',
                color: '#fff',
                fontWeight: 600,
                border: 'none',
                padding: '8px 20px',
                borderRadius: '8px',
                cursor: busy || !reason.trim() ? 'not-allowed' : 'pointer',
                opacity: busy || !reason.trim() ? 0.6 : 1
              }}
              onClick={() => void run(`/onboarding/${selected.id}/review`, { expectedVersion: selected.version, decision: 'APPROVE', reason: reason.trim() }, 'Đã duyệt. Tài khoản staff chờ nhân viên kích hoạt.')}
            >
              ✓ Phê duyệt tiếp nhận
            </button>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <button
            type="button"
            className="btn"
            disabled={busy}
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              color: '#f1f5f9',
              padding: '8px 18px',
              borderRadius: '8px',
              cursor: 'pointer'
            }}
            onClick={() => setSelected(null)}
          >
            Đóng
          </button>
        </div>
      )}
      {error && <p role="alert" style={{ marginTop: '12px' }}>{error}</p>}
    </CrmDialog>}
  </section>;
}

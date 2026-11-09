import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { AuthorizationCapability, AuthorizationScope } from '@hr-blockbot/contracts';
import { useAuthorization } from '../context/useAuthorization';
import { useAuth } from '../context/AuthContext';
import { requestJson } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';
import { WorkflowHistoryNavigation, HashChainLedger, type HashChainBlockItem } from './WorkflowHistoryNavigation';
type Row = { id: string; version: number; auditIntegrity?: string; status: string; delegatorUserId: string; recipientUserId: string; approvedByUserId: string | null; capabilities: AuthorizationCapability[]; scope: AuthorizationScope; validFrom: string; validUntil: string; history: HashChainBlockItem[] };
type Recipient = { userId: string; fullName: string; profile: string };
const allowed = ['projects.create', 'projects.assign', 'reports.review'] as const;
const capabilityLabels: Record<string, string> = {
  'projects.create': 'Tạo công việc mới (projects.create)',
  'projects.assign': 'Giao việc cho nhân sự (projects.assign)',
  'reports.review': 'Duyệt báo cáo & nghiệm thu (reports.review)',
};
const capabilityShortLabels: Record<string, string> = {
  'projects.create': 'Tạo việc',
  'projects.assign': 'Giao việc',
  'reports.review': 'Duyệt báo cáo',
};
const statusLabels: Record<string, string> = {
  PENDING: 'Chờ cấp trên duyệt (PENDING)',
  APPROVED: 'Đã duyệt có hiệu lực (APPROVED)',
  REJECTED: 'Đã từ chối (REJECTED)',
  REVOKED: 'Đã thu hồi (REVOKED)',
};
const formatProfile = (p: string) => {
  const up = p.toUpperCase();
  if (up === 'PTCH') return 'Phó cửa hàng trưởng (PTCH)';
  if (up === 'SM') return 'Cửa hàng trưởng (SM)';
  if (up === 'AM') return 'Quản lý khu vực (AM)';
  if (up === 'AOM') return 'Trợ lý vận hành (AOM)';
  return p;
};
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function DelegationView() {
  const { user } = useAuth(); const { can, summary, stores } = useAuthorization();
  const [rows, setRows] = useState<Row[]>([]), [recipients, setRecipients] = useState<Recipient[]>([]), [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [form, setForm] = useState(false), [selected, setSelected] = useState<Row | null>(null), [reason, setReason] = useState(''), [storeId, setStoreId] = useState(''), [recipient, setRecipient] = useState(''), [sourceId, setSourceId] = useState(''), [caps, setCaps] = useState<AuthorizationCapability[]>([]), [until, setUntil] = useState('');
  const [page, setPage] = useState(1), [hasNext, setHasNext] = useState(false);
  const writing = useRef(false), sequence = useRef(0), detailSequence = useRef(0);
  const openHistory = async (id: string) => { const current = ++detailSequence.current; try { const row = await requestJson<Row>('/delegations/' + id); if (current === detailSequence.current) { setSelected(row); setReason(''); setError(''); } } catch (failure) { if (current === detailSequence.current) setError(failure instanceof Error ? failure.message : 'Không truy hồi được lịch sử.'); } };
  const sources = summary?.grants.filter((grant) => grant.scope.kind === 'organization' && !grant.revokedAt && grant.capabilities.some((capability) => allowed.some((value) => value === capability))) ?? [];
  const source = sources.find((grant) => grant.id === sourceId);
  const options = stores.filter((store) => store.capabilities.includes('delegations.request') && source && (source.scope.storeIds.includes(store.id) || !!store.regionId && source.scope.regionIds.includes(store.regionId)));
  const load = useCallback(async () => { const current = ++sequence.current; setLoading(true); try { const response = await requestJson<{ items: Row[]; paging: { hasNext: boolean } }>('/delegations?page=' + page + '&limit=20'); if (current === sequence.current) { setRows(response.items); setHasNext(response.paging?.hasNext ?? false); setError(''); } } catch (failure) { if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Không tải được ủy quyền.'); } finally { if (current === sequence.current) setLoading(false); } }, [page]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => { let current = true; setRecipients([]); setRecipient(''); if (storeId && can('delegations.request')) void requestJson<{ items: Recipient[] }>('/delegations/recipients?storeId=' + storeId).then((response) => { if (current) setRecipients(response.items); }).catch((failure) => { if (current) setError(failure instanceof Error ? failure.message : 'Không tải được người nhận.'); }); return () => { current = false; }; }, [storeId, can('delegations.request')]);
  const run = async (path: string, body: unknown) => { if (writing.current) return; writing.current = true; setBusy(true); setError(''); try { await requestJson(path, post(body)); setSelected(null); setForm(false); setMessage('Đã lưu đề nghị/quyết định và lịch sử. Quyền chỉ có hiệu lực khi mọi điều kiện được xác minh.'); await load(); } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không xử lý được. Không tự bỏ qua bước duyệt.'); } finally { writing.current = false; setBusy(false); } };
  const submit = (event: FormEvent) => { event.preventDefault(); if (!source || !until) return; void run('/delegations', { sourceGrantId: source.id, recipientUserId: recipient, capabilities: caps, scope: { kind: 'organization', storeIds: [storeId], regionIds: [], reportingEmployeeIds: source.scope.reportingEmployeeIds }, validFrom: new Date().toISOString(), validUntil: new Date(until).toISOString(), reason }); };
  return <section className="crm-workspace" aria-label="Ủy quyền nghiệp vụ"><header className="crm-work-heading"><div><h2>Ủy quyền nghiệp vụ</h2><p>Tối đa 14 ngày; cần cấp trên trực tiếp độc lập duyệt. Không ủy quyền tiếp, quyền HR hoặc quyền hệ thống.</p></div><div className="crm-work-actions"><button className="btn" onClick={() => void load()}>Làm mới ủy quyền</button>{can('delegations.request') && <button className="btn btn--primary" onClick={() => { setForm(true); setSourceId(sources[0]?.id || ''); setStoreId(''); setCaps([]); setReason(''); setUntil(''); }}>Đề nghị ủy quyền</button>}</div></header>
    {error && <p role="alert">{error}</p>}{message && <p role="status">{message}</p>}{loading ? <p role="status">Đang tải ủy quyền…</p> : !rows.length ? <p>Chưa có ủy quyền trong phạm vi.</p> : rows.map((row) => <article className="crm-report-card" key={row.id}><h3>{row.capabilities.map((c) => capabilityShortLabels[c] || c).join(', ')}</h3><p>{statusLabels[row.status] || row.status} · {new Date(row.validFrom).toLocaleString('vi-VN')} → {new Date(row.validUntil).toLocaleString('vi-VN')}</p><p>Hết thời hạn/thu hồi quyền gốc hoặc mất quan hệ quản lý sẽ mất quyền ngay, dù trạng thái lịch sử vẫn là APPROVED.</p><button className="btn" onClick={() => void openHistory(row.id)}>Chi tiết và xử lý</button></article>)}
    <WorkflowHistoryNavigation label="delegations" page={page} hasNext={hasNext} loading={loading || busy} onPage={setPage} onLookup={openHistory} />
    {form && <CrmDialog title="Đề nghị ủy quyền có thời hạn" busy={busy} onClose={() => { if (!busy) setForm(false); }}><form className="crm-work-form" onSubmit={submit}>
      <label className="field">Quyền hạn gốc của bạn (Grant gốc)<select className="input" required value={sourceId} onChange={(event) => { setSourceId(event.target.value); setCaps([]); setStoreId(''); }}>{sources.map((grant) => <option key={grant.id} value={grant.id}>{grant.capabilities.filter((capability) => allowed.some((value) => value === capability)).map((c) => capabilityShortLabels[c] || c).join(', ')} · Mã: {grant.id.slice(0, 8)}</option>)}</select></label>
      <label className="field">Cửa hàng áp dụng<select className="input" required value={storeId} onChange={(event) => setStoreId(event.target.value)}><option value="">Chọn cửa hàng</option>{options.map((store) => <option value={store.id} key={store.id}>{store.name}</option>)}</select></label>
      <label className="field">Người nhận ủy quyền (đủ điều kiện)<select className="input" required value={recipient} onChange={(event) => setRecipient(event.target.value)}><option value="">Chọn người nhận</option>{recipients.map((person) => <option value={person.userId} key={person.userId}>{person.fullName} · {formatProfile(person.profile)}</option>)}</select>
        {storeId && !recipients.length && <span style={{ fontSize: '12px', color: '#f59e0b', marginTop: '4px' }}>Cửa hàng này hiện chưa có nhân sự cấp phó (PTCH) để nhận ủy quyền. Bạn có thể thêm nhân sự tại mục "Tiếp nhận nhân viên".</span>}
      </label>
      <fieldset style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: '8px', padding: '12px 14px', margin: '10px 0' }}>
        <legend style={{ padding: '0 8px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary, #aaa)' }}>
          Chọn quyền hạn chuyển giao (thuộc phạm vi quyền gốc)
        </legend>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '6px' }}>
          {allowed.filter((capability) => source?.capabilities.includes(capability)).map((capability) => (
            <label
              key={capability}
              style={{
                display: 'flex',
                flexDirection: 'row',
                alignItems: 'center',
                gap: '12px',
                cursor: 'pointer',
                fontSize: '13.5px',
                lineHeight: 1.4,
                padding: '4px 0',
                userSelect: 'none'
              }}
            >
              <input
                type="checkbox"
                style={{ width: '18px', height: '18px', margin: 0, cursor: 'pointer', accentColor: '#3b82f6', flexShrink: 0 }}
                checked={caps.includes(capability)}
                onChange={(event) => setCaps(event.target.checked ? [...caps, capability] : caps.filter((value) => value !== capability))}
              />
              <span>{capabilityLabels[capability] || capability}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <label className="field">Thời hạn hiệu lực (tối đa 14 ngày)<input className="input" type="datetime-local" required value={until} onChange={(event) => setUntil(event.target.value)} /></label><label className="field">Lý do ủy quyền (mục đích công việc)<textarea className="input" required maxLength={2000} placeholder="Ví dụ: Ủy quyền duyệt báo cáo và giao việc trong thời gian SM nghỉ phép..." value={reason} onChange={(event) => setReason(event.target.value)} /></label>{error && <p role="alert">{error}</p>}<button className="btn btn--primary" disabled={busy || !caps.length}>Gửi đề nghị ủy quyền</button>
    </form></CrmDialog>}
    {selected && <CrmDialog title="Chi tiết và lịch sử ủy quyền" busy={busy} onClose={() => { if (!busy) setSelected(null); }}>
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
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '12px',
        marginBottom: '16px'
      }}>
        <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Người đề nghị</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#f1f5f9', marginTop: '4px' }}>
            👤 {selected.delegatorUserId}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Người nhận ủy quyền</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#f1f5f9', marginTop: '4px' }}>
            🤝 {selected.recipientUserId}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Cửa hàng áp dụng</div>
          <div style={{ fontSize: '14px', fontWeight: 500, color: '#f1f5f9', marginTop: '4px' }}>
            ☕ {selected.scope.storeIds.map((id) => stores.find((store) => store.id === id)?.name || id).join(', ')}
          </div>
        </div>
        <div style={{ padding: '10px 12px', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '8px', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Trạng thái</div>
          <div style={{ fontSize: '14px', fontWeight: 600, color: selected.status === 'APPROVED' ? '#4ade80' : selected.status === 'PENDING' ? '#fbbf24' : '#f87171', marginTop: '4px' }}>
            {statusLabels[selected.status] || selected.status}
          </div>
        </div>
      </div>

      {selected.history && selected.history.length > 0 && (
        <div style={{ marginBottom: '16px' }}>
          <HashChainLedger
            entries={selected.history}
            integrity={selected.auditIntegrity}
            title="Chuỗi băm ủy quyền nghiệp vụ (Delegation SHA-256 Hash-chain)"
          />
        </div>
      )}

      {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.status === 'PENDING' && can('delegations.review') && ![selected.delegatorUserId, selected.recipientUserId].includes(user?.id || '') && (
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <label className="field" style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Lý do quyết định phê duyệt</span>
            <textarea className="input" value={reason} maxLength={2000} placeholder="Nhập lý do phê duyệt hoặc từ chối..." style={{ minHeight: '60px', marginTop: '6px' }} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button className="btn" style={{ background: '#dc2626', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '8px' }} disabled={busy || !reason.trim()} onClick={() => void run('/delegations/' + selected.id + '/review', { expectedVersion: selected.version, decision: 'REJECT', reason })}>
              ✕ Từ chối ủy quyền
            </button>
            <button className="btn btn--primary" style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px' }} disabled={busy || !reason.trim()} onClick={() => void run('/delegations/' + selected.id + '/review', { expectedVersion: selected.version, decision: 'APPROVE', reason })}>
              ✓ Duyệt ủy quyền
            </button>
          </div>
        </div>
      )}
      {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && ['PENDING', 'APPROVED'].includes(selected.status) && [selected.delegatorUserId, selected.approvedByUserId].includes(user?.id || '') && (
        <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid rgba(255, 255, 255, 0.1)' }}>
          <label className="field" style={{ marginBottom: '12px' }}>
            <span style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0' }}>Lý do thu hồi ủy quyền</span>
            <textarea className="input" value={reason} maxLength={2000} placeholder="Nhập lý do thu hồi..." style={{ minHeight: '60px', marginTop: '6px' }} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button className="btn" style={{ background: '#e11d48', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px' }} disabled={busy || !reason.trim()} onClick={() => void run('/delegations/' + selected.id + '/revoke', { expectedVersion: selected.version, reason })}>
              Thu hồi ủy quyền
            </button>
          </div>
        </div>
      )}
      {error && <p role="alert" style={{ marginTop: '12px' }}>{error}</p>}
    </CrmDialog>}
  </section>;
}

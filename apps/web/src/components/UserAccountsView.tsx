import { useCallback, useEffect, useRef, useState } from 'react';
import { AuthorizationProfileSchema, type AuthorizationCapability, type AuthorizationGrant, type AuthorizationProfile } from '@hr-blockbot/contracts';
import { requestJson } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useAuthorization } from '../context/useAuthorization';
import { CrmDialog } from './ui/CrmDialog';
import type { NotifyFn } from './Toast';

type Account = { id: string; username: string; status: 'active' | 'disabled' | 'pending_activation'; securityVersion: number; profile: AuthorizationProfile | null; recovery?: { id: string; state: string; expiresAt: string | null } | null; authorization: { grants: AuthorizationGrant[] } | null };
type Catalog = { policies: Record<AuthorizationCapability, { status: string; profiles: AuthorizationProfile[]; scope: string }>; stores: { id: string; name: string; regionId: string | null }[] };
type ScopeMetadata = { targetId: string; securityVersion: number; ownStoreId: string | null; stores: { id: string; name: string; regionId: string | null; managedEmployeeIds: string[] }[] };
type AuditSnapshot = { status: string | null; profile: string | null; securityVersion: number | null } | null;
type AuditEntry = { id: string | null; actorId: string | null; at: string | null; type: string; before: AuditSnapshot; after: AuditSnapshot; hash: string | null; previousHash: string | null };
type AuditResponse = { items: AuditEntry[]; integrityValid: boolean; legacyUnhashedCount: number };
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
export function UserAccountsView({ onNotify }: { onNotify?: NotifyFn }) {
  const { user } = useAuth(); const { can } = useAuthorization();
  const [rows, setRows] = useState<Account[]>([]), [catalog, setCatalog] = useState<Catalog | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false);
  const [q, setQ] = useState(''), [page, setPage] = useState(1), [hasNext, setHasNext] = useState(false);
  const [target, setTarget] = useState<Account | null>(null), [mode, setMode] = useState<'status' | 'grant' | 'audit' | 'recovery'>('status'), [reason, setReason] = useState('');
  const [profile, setProfile] = useState<AuthorizationProfile>('staff'), [kind, setKind] = useState('self'), [selectedStores, setSelectedStores] = useState<string[]>([]), [caps, setCaps] = useState<AuthorizationCapability[]>([]), [until, setUntil] = useState('');
  const [selectedRegions, setSelectedRegions] = useState<string[]>([]), [selectedPeople, setSelectedPeople] = useState<string[]>([]), [scopeMetadata, setScopeMetadata] = useState<ScopeMetadata | null>(null);
  const [audit, setAudit] = useState<AuditResponse | null>(null), [grantToRevoke, setGrantToRevoke] = useState('');
  const writing = useRef(false), sequence = useRef(0);
  const load = useCallback(async () => {
    const current = ++sequence.current; setLoading(true); setError('');
    try { const response = await requestJson<{ items: Account[]; paging: { hasNext: boolean } }>('/admin/users?q=' + encodeURIComponent(q) + '&page=' + page + '&limit=20');
      if (current === sequence.current) { setRows(response.items); setHasNext(response.paging.hasNext); }
    } catch (failure) { if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Không tải được tài khoản.'); }
    finally { if (current === sequence.current) setLoading(false); }
  }, [q, page]);
  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => { if (can('grants.configure')) void requestJson<Catalog>('/admin/authorization-catalog').then(setCatalog).catch(() => setCatalog(null)); }, [can('grants.configure')]);
  useEffect(() => {
    let active = true; setScopeMetadata(null);
    if (target && mode === 'grant' && can('grants.configure')) void requestJson<ScopeMetadata>('/admin/users/' + target.id + '/grant-scope').then((value) => { if (active) setScopeMetadata(value); }).catch((failure) => { if (active) setError(failure instanceof Error ? failure.message : 'Không tải được mapping quyền.'); });
    return () => { active = false; };
  }, [target?.id, mode, can('grants.configure')]);
  const open = (row: Account, action: typeof mode) => { setTarget(row); setMode(action); setReason(''); setError(''); setProfile(row.profile || 'staff'); setKind('self'); setSelectedStores([]); setSelectedRegions([]); setSelectedPeople([]); setScopeMetadata(null); setCaps([]); setUntil(''); setAudit(null); setGrantToRevoke(''); };
  const mutate = async (path: string, body: unknown, method = 'POST') => {
    if (writing.current) return; writing.current = true; setBusy(true); setError('');
    try { await requestJson(path, { ...post(body), method }); setTarget(null); onNotify?.('Đã lưu thay đổi bảo mật; phiên/token cũ của tài khoản bị thu hồi.', 'success'); await load(); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Chưa lưu được; đối chiếu phiên bản trước khi thử lại.'); }
    finally { writing.current = false; setBusy(false); }
  };
  const allowedCaps = catalog ? (Object.entries(catalog.policies) as [AuthorizationCapability, Catalog['policies'][AuthorizationCapability]][]).filter(([, policy]) => policy.status === 'APPROVED' && policy.profiles.includes(profile) && policy.scope === kind) : [];
  const regions = [...new Set((scopeMetadata?.stores ?? []).flatMap((store) => store.regionId ? [store.regionId] : []))];
  const selectedScopeStores = (scopeMetadata?.stores ?? []).filter((store) => selectedStores.includes(store.id) || !!store.regionId && selectedRegions.includes(store.regionId));
  const reportingIds = [...new Set(selectedScopeStores.flatMap((store) => store.managedEmployeeIds))];
  const mappingReady = !!target && scopeMetadata?.targetId === target.id && scopeMetadata.securityVersion === target.securityVersion;
  if (!can('accounts.manage')) return <p role="status">Chưa có capability quản lý tài khoản.</p>;
  return <section className="crm-workspace" aria-label="Quản lý tài khoản và quyền"><header className="crm-work-heading"><div><h2>Tài khoản và phân quyền</h2><p>Không có tài khoản toàn quyền. Không suy ra quyền từ chức danh. Tạo staff mới qua tiếp nhận HR; không tạo trực tiếp tài khoản active.</p></div><button className="btn" onClick={() => void load()}>Làm mới tài khoản</button></header>
    <label className="field">Tìm mã đăng nhập<input className="input" value={q} maxLength={64} onChange={(event) => { setQ(event.target.value); setPage(1); }} /></label>
    {error && <p role="alert">{error}</p>}{loading ? <p role="status">Đang tải tài khoản…</p> : rows.map((row) => <article className="crm-report-card" key={row.id}><h3>{row.username}</h3><p>{row.profile || 'Chưa cấu hình profile'} · {row.status} · phiên bản bảo mật {row.securityVersion}</p>
      {row.id !== user?.id && <div className="crm-work-actions"><button className="btn" disabled={row.status === 'pending_activation'} onClick={() => open(row, 'status')}>{row.status === 'disabled' ? 'Mở khóa có kiểm soát' : 'Khóa tài khoản'}</button>{can('grants.configure') && <button className="btn" onClick={() => open(row, 'grant')}>Phạm vi và capability</button>}</div>}
      {row.recovery && <p>Khôi phục gần nhất: {row.recovery.state}{row.recovery.expiresAt ? ' · hết hạn ' + new Date(row.recovery.expiresAt).toLocaleString('vi-VN') : ''}. Nếu gửi bị gián đoạn, phát hành lại ở phiên bản mới để vô hiệu liên kết trước.</p>}
      {row.id !== user?.id && row.status === 'active' && <button className="btn" onClick={() => open(row, 'recovery')}>Gửi liên kết khôi phục mật khẩu</button>}
      {row.id === user?.id && <p>Không tự sửa profile, scope hoặc cấp/thu hồi quyền của mình.</p>}
      {can('security_audit.read') && <button className="btn" onClick={() => { open(row, 'audit'); void requestJson<AuditResponse>('/admin/users/' + row.id + '/security-audit').then(setAudit).catch((failure) => setError(failure instanceof Error ? failure.message : 'Không tải được audit.')); }}>Security audit đã che thông tin</button>}
    </article>)}
    <nav aria-label="Phân trang tài khoản"><button className="btn" disabled={page <= 1 || loading} onClick={() => setPage(page - 1)}>Trang trước</button><span>Trang {page}</span><button className="btn" disabled={!hasNext || loading} onClick={() => setPage(page + 1)}>Trang sau</button></nav>
    {target && <CrmDialog title={mode === 'audit' ? 'Security audit' : mode === 'recovery' ? 'Khôi phục mật khẩu an toàn' : mode === 'grant' ? 'Quyền được cấp tường minh' : 'Thay đổi trạng thái tài khoản'} busy={busy} onClose={() => { if (!busy) setTarget(null); }}>
      <p>{target.username} · version {target.securityVersion}</p>{error && <p role="alert">{error}</p>}
      {mode === 'audit' ? !audit ? <p role="status">Đang kiểm tra lịch sử bảo mật…</p> : <>
        <p role={audit.integrityValid ? 'status' : 'alert'}>{audit.integrityValid ? 'Phần hash-chain kiểm chứng hợp lệ' : 'Phát hiện lịch sử không khớp hash-chain; cần đối chiếu, không sửa âm thầm.'}</p>
        {audit.legacyUnhashedCount > 0 && <p>{audit.legacyUnhashedCount} sự kiện nhập cũ chưa có mã băm. Không coi đây là lịch sử đã được xác thực đầy đủ.</p>}
        {!audit.items.length && <p>Chưa có sự kiện bảo mật được ghi nhận.</p>}
        {audit.items.map((entry, index) => <article className="crm-report-card" key={entry.id || index} style={{ overflowWrap: 'anywhere' }}><h3>Sự kiện bảo mật {index + 1}</h3><p>{entry.at ? new Date(entry.at).toLocaleString('vi-VN') : 'Chưa xác minh thời điểm'} · Người thao tác: {entry.actorId || 'Không có mã định danh đã xác minh'}</p>
          <p>Trạng thái: {entry.before?.status || '—'} → {entry.after?.status || '—'}</p><p>Profile: {entry.before?.profile || '—'} → {entry.after?.profile || '—'}; phiên bản: {entry.before?.securityVersion ?? '—'} → {entry.after?.securityVersion ?? '—'}</p>
          <details><summary>Mã băm kiểm tra toàn vẹn</summary><p>Hiện tại: {entry.hash || 'Chưa có'}</p><p>Liền trước: {entry.previousHash || 'Chưa có'}</p><p>Đây là kiểm chứng local, không phải bằng chứng neo Blockchain công khai.</p></details>
        </article>)}
      </> : <>
        <label className="field">Lý do bắt buộc<textarea className="input" value={reason} maxLength={2000} disabled={busy} onChange={(event) => setReason(event.target.value)} /></label>
        {mode === 'recovery' ? <><p>Chỉ phát hành qua kênh an toàn đã cấu hình, tối đa 24 giờ và một lần dùng. Không hiển thị token/mật khẩu. Nếu gửi gián đoạn, làm mới phiên bản và phát hành lại; liên kết cũ bị thay thế. Không mở khóa hoặc tái kích hoạt nhân sự.</p><button className="btn btn--primary" disabled={busy || !reason.trim()} onClick={() => void mutate('/admin/users/' + target.id + '/reset-password', { expectedVersion: target.securityVersion, reason })}>Xác nhận gửi liên kết an toàn</button></> : mode === 'status' ? <button className="btn btn--primary" disabled={busy || !reason.trim()} onClick={() => void mutate('/admin/users/' + target.id, { status: target.status === 'disabled' ? 'active' : 'disabled', expectedVersion: target.securityVersion, reason }, 'PATCH')}>Xác nhận {target.status === 'disabled' ? 'mở khóa' : 'khóa'}</button> : <>
          <p>Chỉ hiển thị capability đã được chủ dự án duyệt. Profile đang có không đổi qua biểu mẫu này. AOM/PTCH nhận quyền quản lý qua ủy quyền, không qua grant trực tiếp.</p>
          <label className="field">Profile<select className="input" value={profile} disabled={busy || !!target.profile} onChange={(event) => { setProfile(event.target.value as AuthorizationProfile); setCaps([]); }}>{AuthorizationProfileSchema.options.map((value) => <option key={value}>{value}</option>)}</select></label>
          <label className="field">Loại phạm vi<select className="input" value={kind} disabled={busy} onChange={(event) => { setKind(event.target.value); setCaps([]); setSelectedStores([]); setSelectedRegions([]); setSelectedPeople([]); }}><option value="self">Bản thân</option><option value="organization">Cửa hàng / khu vực / quan hệ quản lý</option>{profile === 'system_admin' && <option value="system">Kỹ thuật</option>}</select></label>
          {kind === 'organization' && <>
            {!mappingReady && <p role="status">Đang đối chiếu mapping và phiên bản tài khoản. Nếu phiên bản đã đổi, đóng biểu mẫu và làm mới.</p>}
            <fieldset><legend>Cửa hàng canonical</legend>{scopeMetadata?.stores.map((store) => <label className="field" key={store.id}><input type="checkbox" checked={selectedStores.includes(store.id)} disabled={busy || !mappingReady} onChange={(event) => { setSelectedStores(event.target.checked ? [...selectedStores, store.id] : selectedStores.filter((id) => id !== store.id)); setSelectedPeople([]); }} />{store.name}</label>)}</fieldset>
            <fieldset><legend>Khu vực đã xác minh</legend>{regions.map((id) => <label className="field" key={id}><input type="checkbox" checked={selectedRegions.includes(id)} disabled={busy || !mappingReady || profile === 'staff'} onChange={(event) => { setSelectedRegions(event.target.checked ? [...selectedRegions, id] : selectedRegions.filter((value) => value !== id)); setSelectedPeople([]); }} />Khu vực {id} ({scopeMetadata?.stores.filter((store) => store.regionId === id).length} cửa hàng)</label>)}</fieldset>
            <fieldset><legend>Giới hạn thêm theo quan hệ quản lý đã xác minh</legend><p>Để trống: không thêm bộ lọc nhân viên. Nếu chọn: lấy giao với cửa hàng/khu vực; không mở rộng phạm vi. Chỉ hiện mã liên kết, không hồ sơ HR.</p>{reportingIds.map((id) => <label className="field" key={id}><input type="checkbox" checked={selectedPeople.includes(id)} disabled={busy || !mappingReady} onChange={(event) => setSelectedPeople(event.target.checked ? [...selectedPeople, id] : selectedPeople.filter((value) => value !== id))} />Nhân viên {id}</label>)}</fieldset>
          </>}
          <fieldset><legend>Capability APPROVED</legend>{allowedCaps.map(([capability]) => <label className="field" key={capability}><input type="checkbox" checked={caps.includes(capability)} disabled={busy} onChange={(event) => setCaps(event.target.checked ? [...caps, capability] : caps.filter((value) => value !== capability))} />{capability}</label>)}</fieldset>
          <label className="field">Hết hạn (để trống nếu đến khi thu hồi)<input className="input" type="datetime-local" value={until} disabled={busy} onChange={(event) => setUntil(event.target.value)} /></label>
          <button className="btn btn--primary" disabled={busy || !reason.trim() || !caps.length || kind === 'organization' && (!mappingReady || !selectedStores.length && !selectedRegions.length)} onClick={() => void mutate('/admin/users/' + target.id + '/grants', { profile, capabilities: caps, scope: { kind, storeIds: kind === 'organization' ? selectedStores : [], regionIds: kind === 'organization' ? selectedRegions : [], reportingEmployeeIds: kind === 'organization' ? selectedPeople : [] }, validUntil: until ? new Date(until).toISOString() : null, expectedVersion: target.securityVersion, reason })}>Cấp grant theo chính sách V1</button>
          <h3>Grants đã cấp</h3>{target.authorization?.grants.map((grant) => <article className="crm-report-card" key={grant.id}><p>{grant.capabilities.join(', ') || 'Không có capability'} · {grant.scope.kind} · {grant.scope.storeIds.length} cửa hàng / {grant.scope.regionIds.length} khu vực</p><p>{grant.validFrom} → {grant.validUntil || 'đến khi thu hồi'}{grant.revokedAt ? ' · đã thu hồi' : ''}</p>
            <p style={{ overflowWrap: 'anywhere' }}>Cửa hàng: {grant.scope.storeIds.join(', ') || '—'}; khu vực: {grant.scope.regionIds.join(', ') || '—'}; quan hệ: {grant.scope.reportingEmployeeIds.join(', ') || '—'}; căn cứ: {grant.approvalRef}</p>
            {!grant.revokedAt && can('grants.revoke') && <button className="btn" disabled={busy || !reason.trim()} onClick={() => setGrantToRevoke(grant.id)}>Chọn thu hồi grant</button>}
            {grantToRevoke === grant.id && <button className="btn" disabled={busy || !reason.trim()} onClick={() => void mutate('/admin/users/' + target.id + '/grants/' + grant.id + '/revoke', { expectedVersion: target.securityVersion, reason })}>Xác nhận thu hồi và vô hiệu token cũ</button>}
          </article>)}
        </>}
      </>}
    </CrmDialog>}
    <p>Khôi phục mật khẩu cần kênh gửi an toàn được cấu hình; hệ thống không trả mật khẩu plaintext. Không xóa tài khoản/lịch sử.</p>
  </section>;
}

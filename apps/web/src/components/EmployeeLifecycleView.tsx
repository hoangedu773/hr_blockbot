import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { EmployeeSummary } from '@hr-blockbot/contracts';
import { fetchEmployees, fetchPersonnelManagement, requestJson } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useAuthorization } from '../context/useAuthorization';
import { CrmDialog } from './ui/CrmDialog';
import { WorkflowHistoryNavigation, WorkflowAuditNotice, HashChainLedger, type HashChainBlockItem } from './WorkflowHistoryNavigation';

type Row = {
  id: string; employeeId: string; employeeName?: string | null; employeeCode?: string | null; employeeJobTitle?: string | null;
  kind: 'TRANSFER' | 'EXIT' | 'REACTIVATE'; status: string; auditIntegrity?: string; version: number;
  requestedBy: string; requesterName?: string | null;
  sourceStoreId: string; sourceStoreName?: string | null; targetStoreId: string | null; targetStoreName?: string | null;
  staffingRequestId?: string | null; effectiveAt: string; deliveryState: string;
  confirmations: { storeId: string; managerUserId: string; managerName?: string | null; at: string; reason: string }[];
  history: HashChainBlockItem[];
};
type StaffingRow = {
  id: string; storeId: string; storeName: string | null; quantity: number; jobTitle: string | null;
  neededBy: string; reason: string; status: 'PENDING_AM' | 'IN_PROGRESS' | 'FULFILLED' | 'REJECTED' | 'CANCELLED';
  version: number; requestedBy: string; requesterName: string | null; handledBy: string | null; handlerName: string | null;
  decisionReason: string | null; transferRequestIds: string[];
  progress: { linked: number; completed: number; pending: number };
};
const labels: Record<string, string> = {
  TRANSFER: 'Điều chuyển cửa hàng', EXIT: 'Nghỉ việc', REACTIVATE: 'Tái kích hoạt',
  PENDING_REVIEW: 'Chờ HR độc lập duyệt', APPROVED: 'HR đã duyệt · chờ 2 cửa hàng đồng ý',
  PENDING_CONFIRMATIONS: 'HR đã duyệt · chờ đủ 2 cửa hàng đồng ý', PENDING_EFFECTIVE: 'Đã đủ xác nhận · chờ ngày hiệu lực',
  PENDING_HANDOVER: 'Chờ xử lý bàn giao công việc CRM', PENDING_ACTIVATION: 'Chờ nhân viên đặt mật khẩu mới',
  ACTIVATING: 'Đang hoàn tất kích hoạt', APPLYING: 'Đang áp dụng thay đổi', COMPLETED: 'Hoàn tất', REJECTED: 'Từ chối',
};
const staffingLabels: Record<StaffingRow['status'], string> = {
  PENDING_AM: 'Chờ AM điều phối', IN_PROGRESS: 'AM đang điều chuyển', FULFILLED: 'Đã đủ nhân sự', REJECTED: 'AM từ chối', CANCELLED: 'Đã hủy',
};
const roleTitles: Record<string, { badge: string; title: string; subtitle: string; steps: string[] }> = {
  sm: {
    badge: 'Giao diện Cửa hàng trưởng (SM)',
    title: 'Đề xuất nhân sự & Xác nhận điều chuyển cửa hàng',
    subtitle: 'SM đề xuất nghỉ việc/tái kích hoạt gửi HR duyệt; gửi số lượng nhân sự cần bổ sung cho AM và bấm đồng ý khi có nhân sự điều chuyển đi/đến cửa hàng.',
    steps: ['1. SM gửi số lượng NV cần cho AM', '2. AM lập yêu cầu đổi nhân sự giữa 2 cửa hàng', '3. HR phê duyệt', '4. SM 2 cửa hàng bấm đồng ý là hoàn tất'],
  },
  am: {
    badge: 'Giao diện Quản lý khu vực (AM)',
    title: 'Điều phối nhân sự liên cửa hàng & Đề xuất trạng thái',
    subtitle: 'AM nhận yêu cầu số lượng nhân sự từ SM, chọn nhân sự điều chuyển giữa 2 cửa hàng gửi HR duyệt; sau khi HR duyệt, 2 cửa hàng đồng ý sẽ tự hoàn tất.',
    steps: ['1. Nhận yêu cầu số lượng từ SM', '2. AM lập điều chuyển giữa 2 cửa hàng', '3. HR phê duyệt', '4. 2 cửa hàng đồng ý → Hoàn tất'],
  },
  hr: {
    badge: 'Giao diện Nhân sự (HR)',
    title: 'Phê duyệt nghỉ việc, tái kích hoạt & điều chuyển cửa hàng',
    subtitle: 'HR duyệt đề xuất nghỉ việc/tái kích hoạt từ SM và đề nghị điều chuyển giữa 2 cửa hàng từ AM. Điều chuyển sau khi HR duyệt sẽ tự hoàn tất ngay khi 2 cửa hàng đồng ý.',
    steps: ['1. SM/AM gửi đề xuất', '2. HR độc lập kiểm tra & phê duyệt', '3. Với điều chuyển: 2 cửa hàng xác nhận', '4. Tự động cập nhật hồ sơ & phạm vi'],
  },
};
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

export function EmployeeLifecycleView({
  chatMode,
  initialRequestId,
}: {
  chatMode?: 'review' | 'awaiting_me';
  initialRequestId?: string;
} = {}) {
  const { user } = useAuth();
  const { summary, can, stores } = useAuthorization();
  const profile = summary?.profile ?? user?.authorization?.profile ?? 'staff';
  const roleInfo = roleTitles[profile] ?? {
    badge: `Giao diện ${profile.toUpperCase()}`,
    title: 'Điều chuyển và trạng thái nhân sự',
    subtitle: 'SM đề xuất nghỉ việc/tái kích hoạt cho HR duyệt; điều chuyển cửa hàng theo luồng SM báo số lượng → AM lập điều chuyển → HR duyệt → 2 cửa hàng đồng ý.',
    steps: ['1. SM gửi nhu cầu cho AM', '2. AM lập điều chuyển 2 cửa hàng', '3. HR phê duyệt', '4. 2 cửa hàng đồng ý → Hoàn tất'],
  };
  const isSm = profile === 'sm';
  const isCoordinator = profile !== 'hr' && can('employees.transfer');
  const canViewStaffing = isSm || isCoordinator || can('employees.lifecycle_review');

  const [rows, setRows] = useState<Row[]>([]), [staffingRows, setStaffingRows] = useState<StaffingRow[]>([]);
  const [group, setGroup] = useState<'all' | 'pending_review' | 'in_progress' | 'awaiting_me' | 'closed'>(
    chatMode === 'review' ? 'pending_review' : chatMode === 'awaiting_me' ? 'awaiting_me' : 'all'
  );
  const [people, setPeople] = useState<EmployeeSummary[]>([]), [q, setQ] = useState(''), [peoplePage, setPeoplePage] = useState(1), [peopleMore, setPeopleMore] = useState(false);
  const [form, setForm] = useState(false), [staffingForm, setStaffingForm] = useState(false), [selected, setSelected] = useState<Row | null>(null), [selectedStaffing, setSelectedStaffing] = useState<StaffingRow | null>(null);
  const [linkedStaffing, setLinkedStaffing] = useState<StaffingRow | null>(null);
  const [error, setError] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false), [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState(''), [kind, setKind] = useState<Row['kind']>('EXIT'), [sourceFilter, setSourceFilter] = useState(''), [target, setTarget] = useState(''), [effective, setEffective] = useState(''), [reason, setReason] = useState('');
  const [staffStoreId, setStaffStoreId] = useState(''), [quantity, setQuantity] = useState('1'), [jobTitle, setJobTitle] = useState(''), [neededBy, setNeededBy] = useState(''), [staffReason, setStaffReason] = useState('');
  const [page, setPage] = useState(1), [hasNext, setHasNext] = useState(false);
  const writing = useRef(false), sequence = useRef(0), detailSequence = useRef(0);

  const storeName = (id: string | null, fallback?: string | null) => fallback || stores.find((store) => store.id === id)?.name || id || 'Không có';
  const smStores = stores.filter((store) => store.capabilities.includes('employees.lifecycle_request') || store.capabilities.includes('onboarding.propose'));
  const transferStores = stores.filter((store) => store.capabilities.includes('employees.transfer'));

  const openHistory = async (id: string) => {
    const current = ++detailSequence.current;
    try {
      const row = await requestJson<Row>('/employee-lifecycle/' + id);
      if (current === detailSequence.current) { setSelected(row); setReason(''); setError(''); }
    } catch (failure) {
      if (current === detailSequence.current) setError(failure instanceof Error ? failure.message : 'Không truy hồi được lịch sử.');
    }
  };
  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const groupParam = group === 'all' ? '' : `&group=${group}`;
      const [lifecycleRes, staffingRes] = await Promise.all([
        requestJson<{ items: Row[]; paging: { hasNext: boolean } }>(`/employee-lifecycle?page=${page}&limit=20${groupParam}`),
        canViewStaffing ? requestJson<{ items: StaffingRow[] }>('/staffing-requests?page=1&limit=20').catch(() => ({ items: [] as StaffingRow[] })) : Promise.resolve({ items: [] as StaffingRow[] }),
      ]);
      if (current === sequence.current) {
        setRows(lifecycleRes.items);
        setHasNext(lifecycleRes.paging?.hasNext ?? false);
        setStaffingRows(staffingRes.items);
        setError('');
      }
    } catch (failure) {
      if (current === sequence.current) setError(failure instanceof Error ? failure.message : 'Không tải được workflow nhân sự.');
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [page, group, canViewStaffing]);

  useEffect(() => { void load(); return () => { sequence.current++; }; }, [load]);
  useEffect(() => { if (initialRequestId) void openHistory(initialRequestId); }, [initialRequestId]);
  useEffect(() => {
    if (!form) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void fetchEmployees({ q, storeId: kind === 'TRANSFER' && sourceFilter ? sourceFilter : undefined, status: kind === 'REACTIVATE' ? 'inactive' : 'active', page: peoplePage, limit: 20 })
        .then((response) => {
          if (current) {
            const items = kind === 'TRANSFER' && target ? response.items.filter((person) => person.storeId !== target) : response.items;
            setPeople((old) => peoplePage === 1 ? items : [...old, ...items.filter((person) => !old.some((entry) => entry.employeeId === person.employeeId))]);
            setPeopleMore(response.paging.hasNext);
          }
        })
        .catch((failure) => { if (current) setError(failure instanceof Error ? failure.message : 'Không tải được nhân viên trong scope.'); });
    }, 200);
    return () => { current = false; clearTimeout(timer); };
  }, [form, q, peoplePage, kind, sourceFilter, target]);

  const run = async (path: string, body: unknown, customMessage?: string) => {
    if (writing.current) return;
    writing.current = true; setBusy(true); setError('');
    try {
      await requestJson(path, post(body));
      setForm(false); setStaffingForm(false); setSelected(null); setSelectedStaffing(null); setLinkedStaffing(null);
      setMessage(customMessage || 'Đã lưu theo workflow; xem trạng thái thực tế. Không thay đổi KPI hoặc tự chuyển nhiệm vụ.');
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không xử lý được; giữ trạng thái chờ.');
    } finally {
      writing.current = false; setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !employeeId) return;
    try {
      const employee = can('employees.read_hr') ? await fetchPersonnelManagement(employeeId) : null;
      await run('/employee-lifecycle', {
        employeeId, kind,
        ...(kind === 'TRANSFER' ? { targetStoreId: target } : {}),
        ...(kind === 'TRANSFER' && linkedStaffing ? { staffingRequestId: linkedStaffing.id } : {}),
        ...(employee ? { expectedProfileVersion: employee.profileVersion } : {}),
        effectiveAt: new Date(effective).toISOString(),
        reason,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không đối chiếu được hồ sơ.');
    }
  };

  const submitStaffing = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !staffStoreId) return;
    await run('/staffing-requests', {
      storeId: staffStoreId,
      quantity: Number(quantity),
      ...(jobTitle.trim() ? { jobTitle: jobTitle.trim() } : {}),
      neededBy: new Date(neededBy).toISOString(),
      reason: staffReason,
    }, 'Đã gửi yêu cầu bổ sung nhân sự cho AM khu vực.');
  };

  const openTransferForStaffing = (staffing: StaffingRow) => {
    setLinkedStaffing(staffing);
    setKind('TRANSFER');
    setTarget(staffing.storeId);
    setSourceFilter('');
    setEmployeeId('');
    setEffective(staffing.neededBy ? new Date(staffing.neededBy).toISOString().slice(0, 16) : '');
    setReason(`Điều chuyển bổ sung nhân sự cho ${storeName(staffing.storeId, staffing.storeName)} (${staffing.reason})`);
    setPeoplePage(1);
    setQ('');
    setError('');
    setForm(true);
  };

  return (
    <section className="crm-workspace" aria-label="Điều chuyển và trạng thái nhân sự">
      <header className="crm-work-heading">
        <div>
          <span className="chip chip--info">{roleInfo.badge}</span>
          <h2>Điều chuyển và trạng thái nhân sự</h2>
          <p>{roleInfo.subtitle}</p>
        </div>
        <div className="crm-work-actions">
          <button className="btn" onClick={() => void load()}>Làm mới workflow</button>
          {isSm && smStores.length > 0 && (
            <button className="btn" onClick={() => { setStaffingForm(true); setStaffStoreId(smStores[0]?.id ?? ''); setQuantity('1'); setJobTitle(''); setNeededBy(''); setStaffReason(''); setError(''); }}>
              Xin bổ sung nhân sự (gửi AM)
            </button>
          )}
          {(can('employees.lifecycle_request') || can('employees.transfer')) && (
            <button className="btn btn--primary" onClick={() => { setLinkedStaffing(null); setForm(true); setKind(can('employees.lifecycle_request') ? 'EXIT' : 'TRANSFER'); setSourceFilter(''); setTarget(''); setEmployeeId(''); setReason(''); setEffective(''); setPeoplePage(1); setQ(''); setError(''); }}>
              Lập yêu cầu nhân sự
            </button>
          )}
        </div>
      </header>

      <div className="crm-work-toolbar" aria-label="Quy trình và bộ lọc theo vai trò" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {roleInfo.steps.map((step) => <span key={step} className="chip">{step}</span>)}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          <button type="button" className={`btn ${group === 'all' ? 'btn--primary' : ''}`} onClick={() => { setGroup('all'); setPage(1); }}>Tất cả</button>
          {can('employees.lifecycle_review') && (
            <button type="button" className={`btn ${group === 'pending_review' ? 'btn--primary' : ''}`} onClick={() => { setGroup('pending_review'); setPage(1); }}>Chờ HR duyệt</button>
          )}
          {stores.some((store) => store.capabilities.includes('employees.transfer_confirm')) && (
            <button type="button" className={`btn ${group === 'awaiting_me' ? 'btn--primary' : ''}`} onClick={() => { setGroup('awaiting_me'); setPage(1); }}>Chờ cửa hàng tôi đồng ý</button>
          )}
          <button type="button" className={`btn ${group === 'in_progress' ? 'btn--primary' : ''}`} onClick={() => { setGroup('in_progress'); setPage(1); }}>Đang xử lý</button>
          <button type="button" className={`btn ${group === 'closed' ? 'btn--primary' : ''}`} onClick={() => { setGroup('closed'); setPage(1); }}>Đã hoàn tất / từ chối</button>
        </div>
      </div>

      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}

      {canViewStaffing && (isSm || isCoordinator || staffingRows.length > 0) && (
        <section className="crm-assignment-inbox" aria-label="Yêu cầu bổ sung nhân sự từ cửa hàng (SM gửi AM)">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <h3 style={{ margin: 0, fontSize: 15 }}>
                {isSm ? 'Bước 1 điều chuyển: Yêu cầu bổ sung nhân sự gửi AM' : isCoordinator ? 'Bước 1 → 2: Yêu cầu bổ sung nhân sự từ SM (chờ AM lập điều chuyển)' : 'Yêu cầu bổ sung nhân sự (SM → AM)'}
              </h3>
              <p className="crm-work-secondary">
                {isSm
                  ? 'Khi cửa hàng thiếu người, nhập số lượng nhân viên cần để AM điều phối nhân sự từ cửa hàng khác sang.'
                  : 'Chọn yêu cầu của SM để lập đề nghị đổi/điều chuyển nhân sự giữa 2 cửa hàng gửi HR duyệt.'}
              </p>
            </div>
          </div>
          {!staffingRows.length ? (
            <p className="crm-work-secondary" style={{ marginTop: 8 }}>Chưa có yêu cầu bổ sung nhân sự nào trong phạm vi.</p>
          ) : (
            staffingRows.map((item) => (
              <div className="crm-report-card" key={item.id} style={{ display: 'grid', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                  <strong>Cửa hàng cần người: {storeName(item.storeId, item.storeName)} · Cần {item.quantity} nhân viên{item.jobTitle ? ` (${item.jobTitle})` : ''}</strong>
                  <span className={`chip ${item.status === 'FULFILLED' ? 'chip--ok' : item.status === 'REJECTED' || item.status === 'CANCELLED' ? 'chip--err' : 'chip--warn'}`}>
                    {staffingLabels[item.status]} · Đã hoàn tất {item.progress.completed}/{item.quantity} (đã lập {item.progress.linked}/{item.quantity})
                  </span>
                </div>
                <p className="crm-work-secondary">
                  SM đề xuất: {item.requesterName || 'SM cửa hàng'} · Cần trước: {new Date(item.neededBy).toLocaleString('vi-VN')} · Lý do: {item.reason}
                </p>
                {item.decisionReason && <p className="crm-work-secondary">Phản hồi điều phối: {item.decisionReason}</p>}
                <div className="crm-work-actions" style={{ justifyContent: 'flex-start' }}>
                  {isCoordinator && ['PENDING_AM', 'IN_PROGRESS'].includes(item.status) && item.progress.linked < item.quantity && (
                    <button type="button" className="btn btn--primary" onClick={() => openTransferForStaffing(item)}>
                      Lập điều chuyển đáp ứng ({item.progress.linked}/{item.quantity})
                    </button>
                  )}
                  {isCoordinator && ['PENDING_AM', 'IN_PROGRESS'].includes(item.status) && item.requestedBy !== user?.id && (
                    <button type="button" className="btn" onClick={() => { setSelectedStaffing(item); setReason(''); setError(''); }}>
                      AM phản hồi / từ chối
                    </button>
                  )}
                  {isSm && item.requestedBy === user?.id && ['PENDING_AM', 'IN_PROGRESS'].includes(item.status) && item.progress.pending === 0 && (
                    <button type="button" className="btn" onClick={() => { setSelectedStaffing(item); setReason(''); setError(''); }}>
                      Hủy yêu cầu bổ sung
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {loading ? (
        <p role="status">Đang tải workflow…</p>
      ) : !rows.length ? (
        <p>Chưa có yêu cầu trong phạm vi được cấp.</p>
      ) : (
        rows.map((row) => {
          const sourceConfirmed = row.confirmations.some((entry) => entry.storeId === row.sourceStoreId);
          const targetConfirmed = row.targetStoreId ? row.confirmations.some((entry) => entry.storeId === row.targetStoreId) : false;
          const canConfirmStores = row.kind === 'TRANSFER' && ['APPROVED', 'PENDING_CONFIRMATIONS'].includes(row.status)
            ? [row.sourceStoreId, row.targetStoreId].filter((id): id is string => !!id).filter((id) => stores.find((store) => store.id === id)?.capabilities.includes('employees.transfer_confirm') && !row.confirmations.some((confirmation) => confirmation.storeId === id))
            : [];
          return (
            <article className="crm-report-card" key={row.id}>
              <h3>{labels[row.kind]} · {row.employeeId}</h3>
              {row.employeeName && (
                <p>
                  <strong>{row.employeeName}</strong>
                  {row.employeeCode ? ` (${row.employeeCode})` : ''}
                  {row.employeeJobTitle ? ` · ${row.employeeJobTitle}` : ''}
                  {row.requesterName ? ` · Người lập: ${row.requesterName}` : ''}
                </p>
              )}
              <p>{labels[row.status] || row.status} · hiệu lực {new Date(row.effectiveAt).toLocaleString('vi-VN')}</p>
              <p>{storeName(row.sourceStoreId, row.sourceStoreName)}{row.targetStoreId ? ' → ' + storeName(row.targetStoreId, row.targetStoreName) : ''}</p>
              {row.kind === 'TRANSFER' && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0' }}>
                  <span className="chip chip--ok">1. AM/HR đã lập điều chuyển</span>
                  <span className={`chip ${row.status === 'PENDING_REVIEW' ? 'chip--warn' : row.status === 'REJECTED' ? 'chip--err' : 'chip--ok'}`}>
                    2. {row.status === 'PENDING_REVIEW' ? 'Chờ HR duyệt' : row.status === 'REJECTED' ? 'HR từ chối' : 'HR đã duyệt'}
                  </span>
                  <span className={`chip ${sourceConfirmed ? 'chip--ok' : 'chip--warn'}`}>
                    3a. Cửa hàng đi ({storeName(row.sourceStoreId, row.sourceStoreName)}): {sourceConfirmed ? 'Đã đồng ý' : 'Chờ đồng ý'}
                  </span>
                  <span className={`chip ${targetConfirmed ? 'chip--ok' : 'chip--warn'}`}>
                    3b. Cửa hàng đến ({storeName(row.targetStoreId, row.targetStoreName)}): {targetConfirmed ? 'Đã đồng ý' : 'Chờ đồng ý'}
                  </span>
                </div>
              )}
              <div className="crm-work-actions" style={{ justifyContent: 'flex-start', marginTop: 8 }}>
                <button className="btn" onClick={() => void openHistory(row.id)}>Đối chiếu và xử lý</button>
                {canConfirmStores.length > 0 && (
                  <span className="chip chip--info">Cửa hàng của bạn cần xác nhận đồng ý trong phần Đối chiếu và xử lý</span>
                )}
              </div>
            </article>
          );
        })
      )}

      <WorkflowHistoryNavigation label="employee-lifecycle" page={page} hasNext={hasNext} loading={loading || busy} onPage={setPage} onLookup={openHistory} />

      {staffingForm && (
        <CrmDialog title="Xin bổ sung nhân sự gửi AM" busy={busy} onClose={() => { if (!busy) setStaffingForm(false); }}>
          <form className="crm-work-form" onSubmit={(event) => void submitStaffing(event)}>
            <p>SM nhập số lượng nhân viên cần bổ sung tại cửa hàng mình. AM khu vực sẽ nhận yêu cầu và lập đề nghị điều chuyển nhân sự giữa 2 cửa hàng trình HR duyệt.</p>
            <label className="field">
              Cửa hàng cần bổ sung
              <select aria-label="Cửa hàng cần bổ sung" className="input" required value={staffStoreId} disabled={busy} onChange={(event) => setStaffStoreId(event.target.value)}>
                {smStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
              </select>
            </label>
            <label className="field">
              Số lượng nhân viên cần
              <input aria-label="Số lượng nhân viên cần" className="input" type="number" min={1} max={20} required value={quantity} disabled={busy} onChange={(event) => setQuantity(event.target.value)} />
            </label>
            <label className="field">
              Vị trí / chức danh cần (tùy chọn)
              <input aria-label="Vị trí cần" className="input" maxLength={120} placeholder="VD: Pha chế / Thu ngân / Phục vụ" value={jobTitle} disabled={busy} onChange={(event) => setJobTitle(event.target.value)} />
            </label>
            <label className="field">
              Ngày giờ cần nhân sự
              <input aria-label="Ngày giờ cần nhân sự" className="input" type="datetime-local" required value={neededBy} disabled={busy} onChange={(event) => setNeededBy(event.target.value)} />
            </label>
            <label className="field">
              Lý do đề xuất bổ sung
              <textarea aria-label="Lý do đề xuất bổ sung" className="input" required maxLength={2000} value={staffReason} disabled={busy} onChange={(event) => setStaffReason(event.target.value)} />
            </label>
            {error && <p role="alert">{error}</p>}
            <button className="btn btn--primary" disabled={busy}>Gửi AM điều phối</button>
          </form>
        </CrmDialog>
      )}

      {selectedStaffing && (
        <CrmDialog title="Xử lý yêu cầu bổ sung nhân sự" busy={busy} onClose={() => { if (!busy) setSelectedStaffing(null); }}>
          <div className="crm-work-form">
            <p><strong>{storeName(selectedStaffing.storeId, selectedStaffing.storeName)}</strong> · Cần {selectedStaffing.quantity} nhân viên{selectedStaffing.jobTitle ? ` (${selectedStaffing.jobTitle})` : ''}</p>
            <p>Lý do SM: {selectedStaffing.reason}</p>
            <label className="field">
              Lý do phản hồi
              <textarea aria-label="Lý do phản hồi" className="input" required maxLength={2000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
            </label>
            <div className="crm-work-actions" style={{ justifyContent: 'flex-start' }}>
              {isCoordinator && selectedStaffing.status === 'PENDING_AM' && (
                <button type="button" className="btn btn--primary" disabled={busy || !reason.trim()} onClick={() => void run(`/staffing-requests/${selectedStaffing.id}/decision`, { decision: 'ACCEPT', expectedVersion: selectedStaffing.version, reason }, 'AM đã tiếp nhận yêu cầu bổ sung nhân sự.')}>
                  AM tiếp nhận yêu cầu
                </button>
              )}
              {isCoordinator && ['PENDING_AM', 'IN_PROGRESS'].includes(selectedStaffing.status) && (
                <button type="button" className="btn" disabled={busy || !reason.trim()} onClick={() => void run(`/staffing-requests/${selectedStaffing.id}/decision`, { decision: 'REJECT', expectedVersion: selectedStaffing.version, reason }, 'AM đã từ chối yêu cầu bổ sung nhân sự.')}>
                  AM từ chối yêu cầu
                </button>
              )}
              {isSm && selectedStaffing.requestedBy === user?.id && (
                <button type="button" className="btn" disabled={busy || !reason.trim()} onClick={() => void run(`/staffing-requests/${selectedStaffing.id}/cancel`, { expectedVersion: selectedStaffing.version, reason }, 'SM đã hủy yêu cầu bổ sung nhân sự.')}>
                  Xác nhận hủy yêu cầu
                </button>
              )}
            </div>
            {error && <p role="alert">{error}</p>}
          </div>
        </CrmDialog>
      )}

      {form && (
        <CrmDialog title="Lập yêu cầu nhân sự" busy={busy} onClose={() => { if (!busy) { setForm(false); setLinkedStaffing(null); } }}>
          <form className="crm-work-form" onSubmit={(event) => void submit(event)}>
            {linkedStaffing && (
              <p className="chip chip--info">
                Đang lập điều chuyển đáp ứng yêu cầu của {storeName(linkedStaffing.storeId, linkedStaffing.storeName)} (cần {linkedStaffing.quantity} NV)
              </p>
            )}
            <label className="field">
              Nghiệp vụ
              <select
                aria-label="Nghiệp vụ"
                className="input"
                value={kind}
                disabled={busy || !!linkedStaffing}
                onChange={(event) => { setKind(event.target.value as Row['kind']); setPeoplePage(1); setEmployeeId(''); }}
              >
                {can('employees.lifecycle_request') && <><option value="EXIT">Nghỉ việc</option><option value="REACTIVATE">Tái kích hoạt</option></>}
                {can('employees.transfer') && <option value="TRANSFER">Điều chuyển cửa hàng</option>}
              </select>
            </label>
            {kind === 'TRANSFER' && transferStores.length > 1 && (
              <label className="field">
                Lọc theo cửa hàng nguồn (tùy chọn)
                <select aria-label="Lọc theo cửa hàng nguồn" className="input" value={sourceFilter} disabled={busy} onChange={(event) => { setSourceFilter(event.target.value); setPeoplePage(1); setEmployeeId(''); }}>
                  <option value="">Tất cả cửa hàng trong quyền điều chuyển</option>
                  {transferStores.filter((store) => store.id !== target).map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              Tìm nhân viên trong scope
              <input className="input" value={q} maxLength={50} onChange={(event) => { setQ(event.target.value); setPeoplePage(1); }} />
            </label>
            <label className="field">
              Nhân viên
              <select aria-label="Nhân viên" className="input" required value={employeeId} disabled={busy} onChange={(event) => setEmployeeId(event.target.value)}>
                <option value="">Chọn nhân viên</option>
                {people.map((person) => <option key={person.employeeId} value={person.employeeId}>{person.fullName} · {person.employeeId}</option>)}
              </select>
            </label>
            {peopleMore && <button className="btn" type="button" onClick={() => setPeoplePage(peoplePage + 1)}>Tải thêm nhân viên</button>}
            {kind === 'TRANSFER' && (
              <label className="field">
                Cửa hàng đích
                <select aria-label="Cửa hàng đích" className="input" required value={target} disabled={busy || !!linkedStaffing} onChange={(event) => setTarget(event.target.value)}>
                  <option value="">Chọn cửa hàng được cấp</option>
                  {transferStores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
                </select>
              </label>
            )}
            <label className="field">
              Ngày giờ hiệu lực
              <input className="input" type="datetime-local" required value={effective} disabled={busy} onChange={(event) => setEffective(event.target.value)} />
            </label>
            <label className="field">
              Lý do yêu cầu
              <textarea className="input" required maxLength={2000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
            </label>
            {error && <p role="alert">{error}</p>}
            <button className="btn btn--primary" disabled={busy}>Gửi HR độc lập duyệt</button>
          </form>
        </CrmDialog>
      )}

      {selected && (
        <CrmDialog title="Đối chiếu workflow nhân sự" busy={busy} onClose={() => { if (!busy) setSelected(null); }}>
          <WorkflowAuditNotice integrity={selected.auditIntegrity} />
          <p style={{ overflowWrap: 'anywhere' }}>Mã yêu cầu: {selected.id}</p>
          {selected.employeeName && <p>Nhân viên: <strong>{selected.employeeName}</strong> {selected.employeeCode ? `(${selected.employeeCode})` : ''}</p>}
          <p>{labels[selected.kind]} · {labels[selected.status]}</p>
          <p>{storeName(selected.sourceStoreId, selected.sourceStoreName)} → {storeName(selected.targetStoreId, selected.targetStoreName)}</p>
          {selected.kind === 'TRANSFER' && (
            <div style={{ display: 'grid', gap: 4, margin: '8px 0' }}>
              <p className="crm-work-secondary">
                • Cửa hàng đi ({storeName(selected.sourceStoreId, selected.sourceStoreName)}):{' '}
                {selected.confirmations.find((c) => c.storeId === selected.sourceStoreId) ? 'Đã đồng ý' : 'Chưa xác nhận'}
              </p>
              <p className="crm-work-secondary">
                • Cửa hàng đến ({storeName(selected.targetStoreId, selected.targetStoreName)}):{' '}
                {selected.confirmations.find((c) => c.storeId === selected.targetStoreId) ? 'Đã đồng ý' : 'Chưa xác nhận'}
              </p>
            </div>
          )}
          {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.status === 'PENDING_HANDOVER' && (
            <p>Quản lý cần xử lý nhiệm vụ bằng workflow CRM hiện có. HR không tự giao lại hoặc xóa khoảng trách nhiệm.</p>
          )}
          {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.status === 'PENDING_ACTIVATION' && (
            <p>Nhân viên cần đặt mật khẩu mới. Kênh gửi: {selected.deliveryState}. Chưa có quyền đăng nhập khi chưa hoàn tất.</p>
          )}
          <label className="field">
            Lý do quyết định
            <textarea className="input" maxLength={2000} value={reason} disabled={busy} onChange={(event) => setReason(event.target.value)} />
          </label>
          <div className="crm-work-actions" style={{ justifyContent: 'flex-start' }}>
            {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.status === 'PENDING_REVIEW' && can('employees.lifecycle_review') && selected.requestedBy !== user?.id && ['APPROVE', 'REJECT'].map((decision) => (
              <button className={decision === 'APPROVE' ? 'btn btn--primary' : 'btn'} key={decision} disabled={busy || !reason.trim()} onClick={() => void run('/employee-lifecycle/' + selected.id + '/review', { expectedVersion: selected.version, decision, reason })}>
                {decision === 'APPROVE' ? 'HR phê duyệt' : 'HR từ chối'}
              </button>
            ))}
            {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.kind === 'TRANSFER' && ['APPROVED', 'PENDING_CONFIRMATIONS'].includes(selected.status) && [selected.sourceStoreId, selected.targetStoreId].filter((id): id is string => !!id).filter((id) => stores.find((store) => store.id === id)?.capabilities.includes('employees.transfer_confirm') && !selected.confirmations.some((confirmation) => confirmation.storeId === id)).map((id) => (
              <button className="btn btn--primary" key={id} disabled={busy || !reason.trim()} onClick={() => void run('/employee-lifecycle/' + selected.id + '/confirm-store', { expectedVersion: selected.version, storeId: id, reason })}>
                Quản lý xác nhận {storeName(id, id === selected.sourceStoreId ? selected.sourceStoreName : selected.targetStoreName)}
              </button>
            ))}
            {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && ['APPROVED', 'PENDING_CONFIRMATIONS', 'PENDING_EFFECTIVE', 'PENDING_HANDOVER', 'PENDING_ACTIVATION', 'ACTIVATING', 'APPLYING', 'COMPLETED'].includes(selected.status) && can('employees.lifecycle_review') && selected.requestedBy !== user?.id && (
              <button className="btn" disabled={busy} onClick={() => void run('/employee-lifecycle/' + selected.id + '/resume', {})}>
                Kiểm tra điều kiện và tiếp tục xử lý
              </button>
            )}
          </div>
          <HashChainLedger
            entries={selected.history}
            integrity={selected.auditIntegrity}
            title="Chuỗi băm điều chuyển & trạng thái (Lifecycle SHA-256 Hash-chain)"
          />
          {error && <p role="alert">{error}</p>}
        </CrmDialog>
      )}
    </section>
  );
}

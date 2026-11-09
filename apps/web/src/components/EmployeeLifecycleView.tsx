import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type { EmployeeSummary } from '@hr-blockbot/contracts';
import { fetchEmployees, fetchPersonnelManagement, requestJson } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { useAuthorization } from '../context/useAuthorization';
import { CrmDialog } from './ui/CrmDialog';
import { WorkflowHistoryNavigation, HashChainLedger, type HashChainBlockItem } from './WorkflowHistoryNavigation';

type Row = {
  id: string;
  employeeId: string;
  kind: 'TRANSFER' | 'EXIT' | 'REACTIVATE';
  status: string;
  auditIntegrity?: string;
  version: number;
  requestedBy: string;
  sourceStoreId: string;
  targetStoreId: string | null;
  effectiveAt: string;
  deliveryState: string;
  confirmations: { storeId: string; managerUserId: string; at: string; reason: string }[];
  history: HashChainBlockItem[];
};

const labels: Record<string, string> = {
  TRANSFER: 'Điều chuyển cửa hàng',
  EXIT: 'Nghỉ việc',
  REACTIVATE: 'Tái kích hoạt',
  PENDING_REVIEW: 'Chờ HR độc lập duyệt',
  APPROVED: 'Đã duyệt',
  PENDING_CONFIRMATIONS: 'Chờ quản lý nguồn/đích xác nhận',
  PENDING_EFFECTIVE: 'Chờ ngày hiệu lực',
  PENDING_HANDOVER: 'Chờ xử lý phân công CRM',
  PENDING_ACTIVATION: 'Chờ nhân viên đặt mật khẩu mới',
  ACTIVATING: 'Đang hoàn tất kích hoạt',
  APPLYING: 'Đang áp dụng thay đổi',
  COMPLETED: 'Hoàn tất',
  REJECTED: 'Từ chối',
};

const KIND_BADGE: Record<Row['kind'], { icon: string; bg: string; color: string; border: string }> = {
  TRANSFER: { icon: '🔄', bg: 'rgba(59, 130, 246, 0.14)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.32)' },
  EXIT: { icon: '🚪', bg: 'rgba(239, 68, 68, 0.14)', color: '#f87171', border: 'rgba(239, 68, 68, 0.32)' },
  REACTIVATE: { icon: '✨', bg: 'rgba(16, 185, 129, 0.14)', color: '#34d399', border: 'rgba(16, 185, 129, 0.32)' },
};

const STATUS_STYLE: Record<string, { bg: string; color: string; border: string }> = {
  PENDING_REVIEW: { bg: 'rgba(245, 158, 11, 0.14)', color: '#fbbf24', border: 'rgba(245, 158, 11, 0.32)' },
  PENDING_CONFIRMATIONS: { bg: 'rgba(59, 130, 246, 0.14)', color: '#60a5fa', border: 'rgba(59, 130, 246, 0.32)' },
  APPROVED: { bg: 'rgba(16, 185, 129, 0.14)', color: '#34d399', border: 'rgba(16, 185, 129, 0.32)' },
  COMPLETED: { bg: 'rgba(16, 185, 129, 0.16)', color: '#34d399', border: 'rgba(16, 185, 129, 0.35)' },
  REJECTED: { bg: 'rgba(239, 68, 68, 0.14)', color: '#f87171', border: 'rgba(239, 68, 68, 0.32)' },
};

const post = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function EmployeeLifecycleView() {
  const { user } = useAuth();
  const { can, stores } = useAuthorization();
  const [rows, setRows] = useState<Row[]>([]);
  const [people, setPeople] = useState<EmployeeSummary[]>([]);
  const [q, setQ] = useState('');
  const [peoplePage, setPeoplePage] = useState(1);
  const [peopleMore, setPeopleMore] = useState(false);
  const [form, setForm] = useState(false);
  const [selected, setSelected] = useState<Row | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [employeeId, setEmployeeId] = useState('');
  const [kind, setKind] = useState<Row['kind']>('EXIT');
  const [target, setTarget] = useState('');
  const [effective, setEffective] = useState('');
  const [reason, setReason] = useState('');
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const writing = useRef(false);
  const sequence = useRef(0);
  const detailSequence = useRef(0);

  const openHistory = async (id: string) => {
    const current = ++detailSequence.current;
    try {
      const row = await requestJson<Row>('/employee-lifecycle/' + id);
      if (current === detailSequence.current) {
        setSelected(row);
        setReason('');
        setError('');
      }
    } catch (failure) {
      if (current === detailSequence.current) {
        setError(failure instanceof Error ? failure.message : 'Không truy hồi được lịch sử.');
      }
    }
  };

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const response = await requestJson<{ items: Row[]; paging: { hasNext: boolean } }>(
        '/employee-lifecycle?page=' + page + '&limit=20'
      );
      if (current === sequence.current) {
        setRows(response.items);
        setHasNext(response.paging?.hasNext ?? false);
        setError('');
      }
    } catch (failure) {
      if (current === sequence.current) {
        setError(failure instanceof Error ? failure.message : 'Không tải được workflow nhân sự.');
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);

  useEffect(() => {
    if (!form) return;
    let current = true;
    const timer = window.setTimeout(() => {
      void fetchEmployees({
        q,
        status: kind === 'REACTIVATE' ? 'inactive' : 'active',
        page: peoplePage,
        limit: 20,
      })
        .then((response) => {
          if (current) {
            setPeople((old) =>
              peoplePage === 1
                ? response.items
                : [...old, ...response.items.filter((person) => !old.some((entry) => entry.employeeId === person.employeeId))]
            );
            setPeopleMore(response.paging.hasNext);
          }
        })
        .catch((failure) => {
          if (current) setError(failure instanceof Error ? failure.message : 'Không tải được nhân viên trong scope.');
        });
    }, 200);
    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [form, q, peoplePage, kind]);

  const run = async (path: string, body: unknown) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError('');
    try {
      await requestJson(path, post(body));
      setForm(false);
      setSelected(null);
      setMessage('Đã lưu theo workflow; xem trạng thái thực tế. Không thay đổi KPI hoặc tự chuyển nhiệm vụ.');
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không xử lý được; giữ trạng thái chờ.');
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (busy || !employeeId) return;
    try {
      const employee = await fetchPersonnelManagement(employeeId);
      await run('/employee-lifecycle', {
        employeeId,
        kind,
        ...(kind === 'TRANSFER' ? { targetStoreId: target } : {}),
        expectedProfileVersion: employee.profileVersion,
        effectiveAt: new Date(effective).toISOString(),
        reason,
      });
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không đối chiếu được hồ sơ.');
    }
  };

  const storeName = (id: string | null) => stores.find((store) => store.id === id)?.name || id || 'Không có';

  return (
    <section className="crm-workspace" aria-label="Điều chuyển và trạng thái nhân sự">
      <header className="crm-work-heading">
        <div>
          <h2>Điều chuyển và trạng thái nhân sự</h2>
          <p>
            SM/AM/HR lập đề nghị nghỉ việc hoặc tái kích hoạt, AM/HR lập đề nghị điều chuyển cửa hàng; HR độc lập phê duyệt và quản lý nguồn/đích xác nhận điều chuyển.
          </p>
        </div>
        <div className="crm-work-actions">
          <button className="btn" onClick={() => void load()}>Làm mới workflow</button>
          {(can('employees.lifecycle_request') || can('employees.transfer')) && (
            <button
              className="btn btn--primary"
              onClick={() => {
                setForm(true);
                setKind(can('employees.lifecycle_request') ? 'EXIT' : 'TRANSFER');
                setEmployeeId('');
                setReason('');
                setEffective('');
                setPeoplePage(1);
                setQ('');
              }}
            >
              + Lập yêu cầu nhân sự
            </button>
          )}
        </div>
      </header>

      {error && (
        <div role="alert" style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(239, 68, 68, 0.12)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>
          {error}
        </div>
      )}
      {message && (
        <div role="status" style={{ padding: '12px 16px', borderRadius: '10px', background: 'rgba(16, 185, 129, 0.12)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', fontSize: '13px', marginBottom: '12px' }}>
          {message}
        </div>
      )}

      {loading ? (
        <p role="status">Đang tải workflow…</p>
      ) : !rows.length ? (
        <div style={{ padding: '28px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', color: '#94a3b8' }}>
          Chưa có yêu cầu điều chuyển hoặc thay đổi trạng thái trong phạm vi được cấp.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {rows.map((row) => {
            const kBadge = KIND_BADGE[row.kind] || KIND_BADGE.TRANSFER;
            const sBadge = STATUS_STYLE[row.status] || { bg: 'rgba(148, 163, 184, 0.12)', color: '#cbd5e1', border: 'rgba(148, 163, 184, 0.25)' };
            return (
              <article
                className="crm-report-card"
                key={row.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '14px',
                  padding: '16px 18px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.025)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '12px', fontWeight: 600, padding: '3px 10px', borderRadius: '999px', background: kBadge.bg, color: kBadge.color, border: `1px solid ${kBadge.border}` }}>
                      {kBadge.icon} {labels[row.kind]}
                    </span>
                    <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                      Nhân sự #{row.employeeId.slice(-8).toUpperCase()}
                    </span>
                    <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 9px', borderRadius: '999px', background: sBadge.bg, color: sBadge.color, border: `1px solid ${sBadge.border}` }}>
                      {labels[row.status] || row.status}
                    </span>
                  </div>
                  <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                    <span>🏪 {storeName(row.sourceStoreId)}</span>
                    {row.targetStoreId && (
                      <>
                        <span style={{ color: '#60a5fa', fontWeight: 700 }}>➔</span>
                        <span style={{ color: '#93c5fd', fontWeight: 600 }}>{storeName(row.targetStoreId)}</span>
                      </>
                    )}
                    <span style={{ color: '#64748b' }}>·</span>
                    <span style={{ color: '#94a3b8', fontSize: '12px' }}>
                      Hiệu lực: {new Date(row.effectiveAt).toLocaleString('vi-VN')}
                    </span>
                  </div>
                </div>
                <button className="btn" onClick={() => void openHistory(row.id)}>
                  Đối chiếu & xử lý
                </button>
              </article>
            );
          })}
        </div>
      )}

      <WorkflowHistoryNavigation
        label="employee-lifecycle"
        page={page}
        hasNext={hasNext}
        loading={loading || busy}
        onPage={setPage}
        onLookup={openHistory}
      />

      {form && (
        <CrmDialog title="Lập yêu cầu điều chuyển / trạng thái nhân sự" busy={busy} onClose={() => { if (!busy) setForm(false); }}>
          <form className="crm-work-form" onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>Loại nghiệp vụ</span>
              <select
                aria-label="Nghiệp vụ"
                className="input"
                value={kind}
                disabled={busy}
                onChange={(event) => {
                  setKind(event.target.value as Row['kind']);
                  setPeoplePage(1);
                  setEmployeeId('');
                }}
              >
                {can('employees.lifecycle_request') && (
                  <>
                    <option value="EXIT">🚪 Nghỉ việc (Exit)</option>
                    <option value="REACTIVATE">✨ Tái kích hoạt nhân sự (Reactivate)</option>
                  </>
                )}
                {can('employees.transfer') && <option value="TRANSFER">🔄 Điều chuyển cửa hàng (Store Transfer)</option>}
              </select>
            </label>
            <label className="field">
              <span>Tìm nhanh nhân viên trong phạm vi</span>
              <input
                className="input"
                placeholder="Nhập tên hoặc mã nhân viên..."
                value={q}
                maxLength={50}
                onChange={(event) => {
                  setQ(event.target.value);
                  setPeoplePage(1);
                }}
              />
            </label>
            <label className="field">
              <span>Chọn nhân sự áp dụng</span>
              <select
                aria-label="Nhân viên"
                className="input"
                required
                value={employeeId}
                disabled={busy}
                onChange={(event) => setEmployeeId(event.target.value)}
              >
                <option value="">-- Chọn nhân viên --</option>
                {people.map((person) => (
                  <option key={person.employeeId} value={person.employeeId}>
                    {person.fullName} · {person.employeeCode || person.employeeId}
                  </option>
                ))}
              </select>
            </label>
            {peopleMore && (
              <button className="btn" type="button" onClick={() => setPeoplePage(peoplePage + 1)}>
                Tải thêm nhân viên
              </button>
            )}
            {kind === 'TRANSFER' && (
              <label className="field">
                <span>Cửa hàng đích tiếp nhận</span>
                <select
                  aria-label="Cửa hàng đích"
                  className="input"
                  required
                  value={target}
                  disabled={busy}
                  onChange={(event) => setTarget(event.target.value)}
                >
                  <option value="">-- Chọn cửa hàng đích --</option>
                  {stores
                    .filter((store) => store.capabilities.includes('employees.transfer'))
                    .map((store) => (
                      <option key={store.id} value={store.id}>
                        {store.name}
                      </option>
                    ))}
                </select>
              </label>
            )}
            <label className="field">
              <span>Thời điểm bắt đầu hiệu lực</span>
              <input
                className="input"
                type="datetime-local"
                required
                value={effective}
                disabled={busy}
                onChange={(event) => setEffective(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Lý do & căn cứ đề nghị</span>
              <textarea
                className="input"
                required
                maxLength={2000}
                placeholder="Ghi rõ lý do điều chuyển, nghỉ việc hoặc tái kích hoạt..."
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {error && <p role="alert" style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '8px' }}>
              <button type="button" className="btn" disabled={busy} onClick={() => setForm(false)}>Hủy</button>
              <button className="btn btn--primary" disabled={busy}>
                {busy ? 'Đang gửi…' : 'Gửi HR độc lập duyệt'}
              </button>
            </div>
          </form>
        </CrmDialog>
      )}

      {selected && (
        <CrmDialog
          title="Đối chiếu workflow nhân sự"
          busy={busy}
          onClose={() => {
            if (!busy) setSelected(null);
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {/* Hash-chain Integrity Banner */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.35)'}`,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px' }}>{selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? '🛡️' : '⚠️'}</span>
                <div>
                  <div style={{ fontSize: '12px', fontWeight: 700, color: selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? '#34d399' : '#f87171' }}>
                    {selected.auditIntegrity === 'VALID_LOCAL_CHAIN'
                      ? 'Chuỗi kiểm toán nội bộ hợp lệ · SHA-256 Hash-chain'
                      : 'Cảnh báo: Không xác minh được tính toàn vẹn chuỗi sự kiện'}
                  </div>
                  <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                    Mã hồ sơ: <code style={{ color: '#cbd5e1' }}>{selected.id}</code> · Phiên bản v{selected.version}
                  </div>
                </div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 9px',
                  borderRadius: '999px',
                  background: (STATUS_STYLE[selected.status] || STATUS_STYLE.PENDING_REVIEW).bg,
                  color: (STATUS_STYLE[selected.status] || STATUS_STYLE.PENDING_REVIEW).color,
                  border: `1px solid ${(STATUS_STYLE[selected.status] || STATUS_STYLE.PENDING_REVIEW).border}`,
                }}
              >
                {labels[selected.status] || selected.status}
              </span>
            </div>

            {/* Summary & Store Route Card */}
            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Loại yêu cầu</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                  {KIND_BADGE[selected.kind]?.icon} {labels[selected.kind]}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8', textTransform: 'uppercase' }}>Ngày hiệu lực</div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: '#e2e8f0', marginTop: '2px' }}>
                  {new Date(selected.effectiveAt).toLocaleString('vi-VN')}
                </div>
              </div>
              <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>Lộ trình điểm bán</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', fontSize: '13px', fontWeight: 600 }}>
                  <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(255,255,255,0.05)', color: '#e2e8f0' }}>
                    🏪 Nguồn: {storeName(selected.sourceStoreId)}
                  </span>
                  {selected.targetStoreId && (
                    <>
                      <span style={{ color: '#60a5fa' }}>➔</span>
                      <span style={{ padding: '4px 10px', borderRadius: '6px', background: 'rgba(59, 130, 246, 0.14)', color: '#93c5fd', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                        🎯 Đích: {storeName(selected.targetStoreId)}
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>

            {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.status === 'PENDING_HANDOVER' && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(245, 158, 11, 0.12)', border: '1px solid rgba(245, 158, 11, 0.3)', color: '#fbbf24', fontSize: '12px' }}>
                ⚠️ Quản lý cần xử lý bàn giao nhiệm vụ bằng workflow CRM hiện có. HR không tự giao lại hoặc xóa khoảng trách nhiệm.
              </div>
            )}

            {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' && selected.status === 'PENDING_ACTIVATION' && (
              <div style={{ padding: '10px 12px', borderRadius: '8px', background: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)', color: '#93c5fd', fontSize: '12px' }}>
                🔑 Nhân viên cần đặt mật khẩu mới. Trạng thái kênh gửi: <strong>{selected.deliveryState}</strong>.
              </div>
            )}

            {/* Immutable Audit History (SHA-256 Hash-chain Ledger) */}
            <HashChainLedger
              entries={selected.history}
              integrity={selected.auditIntegrity}
              title="Chuỗi băm điều chuyển & trạng thái (Lifecycle SHA-256 Hash-chain)"
            />

            {/* Decision Form */}
            <label className="field" style={{ margin: 0 }}>
              <span style={{ fontSize: '12px', fontWeight: 600, color: '#cbd5e1' }}>Lý do phê duyệt / xác nhận / từ chối</span>
              <textarea
                aria-label="Lý do quyết định"
                className="input"
                maxLength={2000}
                placeholder="Nhập ý kiến thẩm định hoặc lý do xác nhận điều chuyển..."
                value={reason}
                disabled={busy}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', justifyContent: 'flex-end' }}>
              {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' &&
                selected.status === 'PENDING_REVIEW' &&
                can('employees.lifecycle_review') &&
                selected.requestedBy !== user?.id && (
                  <>
                    <button
                      type="button"
                      className="btn"
                      style={{ background: 'rgba(239, 68, 68, 0.16)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.35)' }}
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void run('/employee-lifecycle/' + selected.id + '/review', {
                          expectedVersion: selected.version,
                          decision: 'REJECT',
                          reason,
                        })
                      }
                    >
                      ✕ HR từ chối
                    </button>
                    <button
                      type="button"
                      className="btn btn--primary"
                      style={{ background: '#10b981', borderColor: '#059669', color: '#fff' }}
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void run('/employee-lifecycle/' + selected.id + '/review', {
                          expectedVersion: selected.version,
                          decision: 'APPROVE',
                          reason,
                        })
                      }
                    >
                      ✓ HR phê duyệt
                    </button>
                  </>
                )}

              {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' &&
                selected.kind === 'TRANSFER' &&
                ['PENDING_REVIEW', 'APPROVED', 'PENDING_CONFIRMATIONS'].includes(selected.status) &&
                [selected.sourceStoreId, selected.targetStoreId]
                  .filter((id): id is string => !!id)
                  .filter(
                    (id) =>
                      stores.find((store) => store.id === id)?.capabilities.includes('employees.transfer_confirm') &&
                      !selected.confirmations.some((confirmation) => confirmation.storeId === id)
                  )
                  .map((id) => (
                    <button
                      type="button"
                      className="btn btn--primary"
                      key={id}
                      disabled={busy || !reason.trim()}
                      onClick={() =>
                        void run('/employee-lifecycle/' + selected.id + '/confirm-store', {
                          expectedVersion: selected.version,
                          storeId: id,
                          reason,
                        })
                      }
                    >
                      ✓ Quản lý xác nhận ({storeName(id)})
                    </button>
                  ))}

              {selected.auditIntegrity === 'VALID_LOCAL_CHAIN' &&
                ['APPROVED', 'PENDING_CONFIRMATIONS', 'PENDING_EFFECTIVE', 'PENDING_HANDOVER', 'PENDING_ACTIVATION', 'ACTIVATING', 'APPLYING'].includes(
                  selected.status
                ) &&
                can('employees.lifecycle_review') &&
                selected.requestedBy !== user?.id && (
                  <button
                    type="button"
                    className="btn"
                    disabled={busy}
                    onClick={() => void run('/employee-lifecycle/' + selected.id + '/resume', {})}
                  >
                    ⚡ Kiểm tra điều kiện và tiếp tục xử lý
                  </button>
                )}
            </div>

            {error && <p role="alert" style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}
          </div>
        </CrmDialog>
      )}
    </section>
  );
}

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useAuthorization } from '../context/useAuthorization';
import { requestJson } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';
import { AppIcon } from './ui/AppIcon';
import { WorkflowHistoryNavigation, HashChainLedger, type HashChainBlockItem } from './WorkflowHistoryNavigation';

type Row = {
  onboardingStatus: string | null;
  id: string;
  onboardingId: string;
  employeeId: string;
  employeeName: string;
  employeeCode: string;
  managerEmployeeId: string;
  managerName: string;
  storeId: string;
  status: string;
  version: number;
  requestedBy: string;
  approvedBy: string | null;
  validFrom: string;
  evidenceRef: string;
  auditIntegrity?: string;
  history: HashChainBlockItem[];
};

type Option = { id: string; fullName: string; employeeCode: string; storeId: string };
type Manager = { employeeId: string; fullName: string; employeeCode: string };

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ cấp trên độc lập duyệt',
  APPROVED: 'Đã phê duyệt · Chờ áp dụng',
  APPLIED: 'Đã thiết lập quan hệ quản lý',
  REJECTED: 'Đã từ chối',
};

const post = (value: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(value),
});

export function InitialReportingView() {
  const { can, stores } = useAuthorization();
  const [rows, setRows] = useState<Row[]>([]);
  const [options, setOptions] = useState<Option[]>([]);
  const [managers, setManagers] = useState<Manager[]>([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [selected, setSelected] = useState<Row | null>(null);
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState('');
  const [onboardingId, setOnboardingId] = useState('');
  const [managerId, setManagerId] = useState('');
  const [validFrom, setValidFrom] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const [optionPage, setOptionPage] = useState(1);
  const [optionNext, setOptionNext] = useState(false);
  const [optionBusy, setOptionBusy] = useState(false);
  const [managerPage, setManagerPage] = useState(1);
  const [managerNext, setManagerNext] = useState(false);
  const [managerBusy, setManagerBusy] = useState(false);
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const writing = useRef(false);

  const mayPropose = can('onboarding.reporting_propose');
  const storeId = options.find((item) => item.id === onboardingId)?.storeId;

  const load = useCallback(async () => {
    const current = ++sequence.current;
    setLoading(true);
    try {
      const result = await requestJson<{ items: Row[]; paging: { hasNext: boolean } }>(
        `/initial-reporting?page=${page}&limit=20`
      );
      if (current === sequence.current) {
        setRows(result.items);
        setHasNext(result.paging.hasNext);
        setError('');
      }
    } catch (failure) {
      if (current === sequence.current) {
        setError(failure instanceof Error ? failure.message : 'Không tải được.');
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
    let current = true;
    if (!mayPropose) return;
    setOptionBusy(true);
    void requestJson<{ items: Option[]; paging: { hasNext: boolean } }>(
      `/initial-reporting/options?page=${optionPage}&limit=20`
    )
      .then((value) => {
        if (current) {
          setOptions((old) =>
            optionPage === 1
              ? value.items
              : [...old, ...value.items.filter((item) => !old.some((existing) => existing.id === item.id))]
          );
          setOptionNext(value.paging.hasNext);
        }
      })
      .catch((failure) => {
        if (current) setError(failure instanceof Error ? failure.message : 'Không tải được tiếp nhận.');
      })
      .finally(() => {
        if (current) setOptionBusy(false);
      });
    return () => {
      current = false;
    };
  }, [mayPropose, optionPage, form]);

  useEffect(() => {
    setManagers([]);
    setManagerId('');
    setManagerPage(1);
    setManagerNext(false);
  }, [storeId]);

  useEffect(() => {
    let current = true;
    if (!storeId) return;
    setManagerBusy(true);
    void requestJson<{ items: Manager[]; paging: { hasNext: boolean } }>(
      `/initial-reporting/managers?storeId=${storeId}&page=${managerPage}&limit=20`
    )
      .then((value) => {
        if (current) {
          setManagers((old) =>
            managerPage === 1
              ? value.items
              : [...old, ...value.items.filter((item) => !old.some((existing) => existing.employeeId === item.employeeId))]
          );
          setManagerNext(value.paging.hasNext);
        }
      })
      .catch((failure) => {
        if (current) setError(failure instanceof Error ? failure.message : 'Không tải được quản lý.');
      })
      .finally(() => {
        if (current) setManagerBusy(false);
      });
    return () => {
      current = false;
    };
  }, [storeId, managerPage]);

  const details = async (id: string) => {
    const current = ++detailSequence.current;
    try {
      const row = await requestJson<Row>('/initial-reporting/' + id);
      if (current === detailSequence.current) {
        setSelected(row);
        setReason('');
        setError('');
      }
    } catch (failure) {
      if (current === detailSequence.current) {
        setError(failure instanceof Error ? failure.message : 'Không truy hồi được.');
      }
    }
  };

  const run = async (path: string, body: unknown) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    setError('');
    try {
      await requestJson(path, post(body));
      setSelected(null);
      setForm(false);
      setMessage('Đã lưu. Quan hệ chỉ có hiệu lực sau duyệt độc lập, activation và ngày hiệu lực; không tự cấp grant.');
      await load();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Không lưu được.');
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!validFrom) return;
    void run('/initial-reporting', {
      onboardingId,
      managerEmployeeId: managerId,
      validFrom: new Date(validFrom).toISOString(),
      evidenceRef,
      reason,
    });
  };

  return (
    <section className="crm-workspace" aria-label="Quan hệ quản lý ban đầu">
      <header className="crm-work-heading">
        <div>
          <h2>Quản lý ban đầu sau tiếp nhận</h2>
          <p>
            SM đề xuất rõ người quản lý; HR duyệt hồ sơ trước, sau đó cấp trên trực tiếp độc lập đã được xác minh duyệt.
          </p>
        </div>
        <div className="crm-work-actions">
          <button className="btn" disabled={busy || loading} onClick={() => void load()}>
            Làm mới quan hệ ban đầu
          </button>
          {mayPropose && (
            <button
              className="btn btn--primary"
              onClick={() => {
                setOptionPage(1);
                setForm(true);
                setReason('');
                setError('');
              }}
            >
              + Đề xuất quản lý ban đầu
            </button>
          )}
        </div>
      </header>

      {error && <p role="alert" style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>}
      {message && <p role="status" style={{ color: '#34d399', fontSize: '13px' }}>{message}</p>}

      {loading ? (
        <p role="status">Đang tải quan hệ…</p>
      ) : !rows.length ? (
        <div style={{ padding: '24px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.1)', textAlign: 'center', color: '#94a3b8' }}>
          Chưa có đề nghị thiết lập quản lý ban đầu trong phạm vi.
        </div>
      ) : (
        <div style={{ display: 'grid', gap: '12px' }}>
          {rows.map((row) => (
            <article
              className="crm-report-card"
              key={row.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '12px',
                padding: '16px 18px',
                borderRadius: '12px',
                background: 'rgba(255,255,255,0.025)',
                border: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <strong style={{ fontSize: '15px', color: '#f8fafc' }}>{row.employeeName}</strong>
                  <code style={{ fontSize: '11px', padding: '2px 7px', borderRadius: '6px', background: 'rgba(255,255,255,0.06)', color: '#93c5fd' }}>
                    {row.employeeCode}
                  </code>
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 9px',
                      borderRadius: '999px',
                      background: row.status === 'APPLIED' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                      color: row.status === 'APPLIED' ? '#34d399' : '#fbbf24',
                    }}
                  >
                    {STATUS_LABELS[row.status] || row.status}
                  </span>
                </div>
                <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  <AppIcon name="store" size={16} />
                  <span>
                    {stores.find((store) => store.id === row.storeId)?.name || row.storeId} · Quản lý trực tiếp:{' '}
                    <strong style={{ color: '#60a5fa' }}>{row.managerName}</strong> · Hiệu lực:{' '}
                    {new Date(row.validFrom).toLocaleString('vi-VN')}
                  </span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button className="btn" onClick={() => void details(row.id)}>
                  Lịch sử quan hệ ban đầu
                </button>
                {['APPROVED', 'APPLIED'].includes(row.status) && (
                  <button
                    className="btn btn--primary"
                    disabled={busy}
                    onClick={() => void run(`/initial-reporting/${row.id}/resume`, {})}
                  >
                    Áp dụng quan hệ đã duyệt
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <WorkflowHistoryNavigation
        label="quan hệ ban đầu"
        page={page}
        hasNext={hasNext}
        loading={loading || busy}
        onPage={setPage}
        onLookup={details}
      />

      {form && (
        <CrmDialog title="Đề xuất quản lý ban đầu" busy={busy} onClose={() => { if (!busy) setForm(false); }}>
          <form onSubmit={submit} className="crm-work-form">
            <label className="field">
              <span>Nhân viên tiếp nhận</span>
              <select
                aria-label="Nhân viên tiếp nhận"
                className="input"
                required
                value={onboardingId}
                disabled={busy}
                onChange={(event) => setOnboardingId(event.target.value)}
              >
                <option value="">Chọn identity tiếp nhận</option>
                {options.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.fullName} · {item.employeeCode}
                  </option>
                ))}
              </select>
            </label>
            {optionNext && (
              <button
                type="button"
                className="btn"
                disabled={busy || optionBusy}
                onClick={() => setOptionPage((value) => value + 1)}
              >
                Tải thêm nhân viên tiếp nhận
              </button>
            )}
            <label className="field">
              <span>Quản lý trực tiếp đề xuất</span>
              <select
                aria-label="Quản lý trực tiếp đề xuất"
                className="input"
                required
                value={managerId}
                disabled={busy}
                onChange={(event) => setManagerId(event.target.value)}
              >
                <option value="">Chọn quản lý đã được xác minh</option>
                {managers.map((item) => (
                  <option key={item.employeeId} value={item.employeeId}>
                    {item.fullName} · {item.employeeCode}
                  </option>
                ))}
              </select>
            </label>
            {managerNext && (
              <button
                type="button"
                className="btn"
                disabled={busy || managerBusy}
                onClick={() => setManagerPage((value) => value + 1)}
              >
                Tải thêm quản lý hợp lệ
              </button>
            )}
            <label className="field">
              <span>Ngày giờ hiệu lực quan hệ</span>
              <input
                className="input"
                type="datetime-local"
                required
                disabled={busy}
                value={validFrom}
                onChange={(event) => setValidFrom(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Tham chiếu bằng chứng quan hệ</span>
              <input
                className="input"
                required
                maxLength={500}
                disabled={busy}
                value={evidenceRef}
                onChange={(event) => setEvidenceRef(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Lý do đề xuất quan hệ</span>
              <textarea
                className="input"
                required
                maxLength={2000}
                disabled={busy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>
            {error && <p role="alert" style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>}
            <button className="btn btn--primary" disabled={busy}>
              Gửi đề xuất quan hệ
            </button>
          </form>
        </CrmDialog>
      )}

      {selected && (
        <CrmDialog title="Duyệt quan hệ quản lý ban đầu" busy={busy} onClose={() => { if (!busy) setSelected(null); }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '10px 14px',
                borderRadius: '10px',
                background: selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.12)',
                border: `1px solid ${selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? 'rgba(16, 185, 129, 0.3)' : 'rgba(239, 68, 68, 0.35)'}`,
              }}
            >
              {selected.auditIntegrity === 'VALID_LOCAL_CHAIN'
                ? <AppIcon name="shieldCheck" size={18} style={{ color: '#34d399' }} />
                : <AppIcon name="alert" size={18} style={{ color: '#f87171' }} />}
              <div>
                <div style={{ fontSize: '12px', fontWeight: 700, color: selected.auditIntegrity === 'VALID_LOCAL_CHAIN' ? '#34d399' : '#f87171' }}>
                  {selected.auditIntegrity === 'VALID_LOCAL_CHAIN'
                    ? 'Chuỗi kiểm toán nội bộ hợp lệ · SHA-256 Hash-chain'
                    : 'Không xác minh được chuỗi sự kiện'}
                </div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>
                  Trạng thái: <strong style={{ color: '#e2e8f0' }}>{STATUS_LABELS[selected.status] || selected.status}</strong>
                </div>
              </div>
            </div>

            <div
              style={{
                padding: '14px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'grid',
                gridTemplateColumns: '1fr auto 1fr',
                alignItems: 'center',
                gap: '12px',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>NHÂN VIÊN TIẾP NHẬN</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>{selected.employeeName}</div>
                <div style={{ fontSize: '11px', color: '#60a5fa' }}>{selected.employeeCode}</div>
              </div>
              <div style={{ fontSize: '18px', color: '#60a5fa' }}>➔</div>
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>QUẢN LÝ TRỰC TIẾP</div>
                <div style={{ fontSize: '14px', fontWeight: 700, color: '#34d399' }}>{selected.managerName}</div>
              </div>
            </div>

            <div style={{ fontSize: '13px', color: '#cbd5e1', display: 'grid', gap: '4px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AppIcon name="document" size={16} /><span><strong>Bằng chứng:</strong> {selected.evidenceRef}</span></div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><AppIcon name="clock" size={16} /><span><strong>Hiệu lực:</strong> {new Date(selected.validFrom).toLocaleString('vi-VN')}</span></div>
            </div>

            <HashChainLedger
              entries={selected.history}
              integrity={selected.auditIntegrity}
              title="Chuỗi băm quan hệ quản lý ban đầu (Reporting SHA-256 Hash-chain)"
            />

            {selected.status === 'PENDING' &&
              !['PROVISIONING', 'PENDING_ACTIVATION', 'ACTIVATING', 'ACTIVE'].includes(selected.onboardingStatus || '') && (
                <p role="status" style={{ color: '#fbbf24', fontSize: '13px', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <AppIcon name="clock" size={16} />
                  <span>Chờ HR phê duyệt hồ sơ tiếp nhận trước khi duyệt quan hệ quản lý.</span>
                </p>
              )}

            {selected.status === 'PENDING' &&
              ['PROVISIONING', 'PENDING_ACTIVATION', 'ACTIVATING', 'ACTIVE'].includes(selected.onboardingStatus || '') &&
              can('onboarding.reporting_review') && (
                <>
                  <label className="field" style={{ margin: 0 }}>
                    <span>Lý do phê duyệt quan hệ</span>
                    <textarea
                      className="input"
                      required
                      maxLength={2000}
                      value={reason}
                      disabled={busy}
                      onChange={(event) => setReason(event.target.value)}
                    />
                  </label>
                  <button
                    className="btn btn--primary"
                    style={{ background: '#10b981', borderColor: '#059669', color: '#fff' }}
                    disabled={busy || !reason.trim()}
                    onClick={() =>
                      void run(`/initial-reporting/${selected.id}/approve`, {
                        expectedVersion: selected.version,
                        reason,
                      })
                    }
                  >
                    ✓ Phê duyệt quan hệ ban đầu
                  </button>
                </>
              )}
            {error && <p role="alert" style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{error}</p>}
          </div>
        </CrmDialog>
      )}
    </section>
  );
}

import { useMemo, useRef, useState } from 'react';
import {
  RevenueKpiOpenActionSchema, RevenueKpiOpenPreviewSchema,
  type RevenueKpiOpenAction, type RevenueKpiOpenPreview,
} from '@hr-blockbot/contracts';
import { apiFetch, API_BASE } from '../services/auth';
import { newClientMessageId } from '../services/api';
import './revenue-kpi-open-card.css';

const itemLabels: Record<string, string> = {
  CREATE: 'Dự kiến tạo',
  SKIP_ALREADY_EXISTS: 'Đã có KPI',
  BLOCKED: 'Cần xử lý',
  CREATED: 'Đã tạo',
  SKIPPED: 'Đã bỏ qua',
  FAILED: 'Lưu thất bại',
};

const formatMoney = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

async function readResponse(response: Response) {
  const data = await response.json();
  if (!response.ok) {
    const preview = RevenueKpiOpenPreviewSchema.safeParse(data.preview);
    throw Object.assign(new Error(data.error?.message || 'Chưa xử lý được đề xuất KPI.'), {
      preview: preview.success ? preview.data : undefined,
      code: typeof data.error?.code === 'string' ? data.error.code : undefined,
      status: response.status,
    });
  }
  return RevenueKpiOpenActionSchema.parse(data);
}

async function fetchAction(actionId: string) {
  return readResponse(await apiFetch(API_BASE + '/chat/actions/' + encodeURIComponent(actionId)));
}

export async function requestRevenueOpenProposal(period: string) {
  return readResponse(await apiFetch(API_BASE + '/revenue-kpi/periods/' + encodeURIComponent(period) + '/open-proposal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{}',
  }));
}

export function RevenueKpiOpenCard({ initial, onExecuted }: {
  initial: RevenueKpiOpenAction;
  onExecuted?: () => void;
}) {
  const [action, setAction] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [changed, setChanged] = useState<RevenueKpiOpenPreview>();
  const [filter, setFilter] = useState<'ALL' | 'BLOCKED' | 'SKIPPED' | 'CREATE'>('ALL');
  const [search, setSearch] = useState('');
  const inFlight = useRef(false);
  const request = useRef<{ key: string; id: string }>();

  const preview = changed ?? action.preview;
  const result = action.result;
  const rows = result ? [...result.created, ...result.skipped, ...result.blocked, ...result.failed] : preview.items;

  const run = async (operation: () => Promise<RevenueKpiOpenAction>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    try {
      const next = await operation();
      setAction(next);
      setChanged(undefined);
      if (next.executed) onExecuted?.();
    } catch (cause) {
      const failure = cause as Error & { preview?: RevenueKpiOpenPreview; code?: string; status?: number };
      if (failure.status === 409 && ['REVENUE_KPI_ACTION_DECIDED', 'REVENUE_KPI_ACTION_EXPIRED'].includes(failure.code ?? '')) {
        try {
          const stored = await fetchAction(action.actionId);
          setAction(stored);
          setChanged(undefined);
          return;
        } catch {
          /* fall through to original error */
        }
      }
      setError(failure.message || 'Chưa xử lý được đề xuất KPI.');
      if (failure.preview) setChanged(failure.preview);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const decide = (approve: boolean) => run(async () => {
    const key = action.actionId + ':' + approve;
    if (request.current?.key !== key) request.current = { key, id: newClientMessageId() };
    const body = approve
      ? { approve, clientRequestId: request.current.id, expectedVersion: action.preview.version, planDigest: action.preview.planDigest }
      : { approve, clientRequestId: request.current.id };
    return readResponse(await apiFetch(API_BASE + '/chat/actions/' + encodeURIComponent(action.actionId) + '/decision', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }));
  });

  const expired = action.status === 'EXPIRED' || (action.status === 'PENDING' && Date.parse(action.expiresAt) <= Date.now());
  const pending = action.status === 'PENDING' && !expired;
  const canRetry = changed || expired || ['FAILED', 'CONFIRMED'].includes(action.status)
    || result?.blocked.some(item => item.retryable) || result?.failed.some(item => item.retryable);

  const filteredRows = useMemo(() => {
    return rows.filter(item => {
      if (filter === 'BLOCKED' && item.status !== 'BLOCKED') return false;
      if (filter === 'SKIPPED' && item.status !== 'SKIP_ALREADY_EXISTS' && item.status !== 'SKIPPED') return false;
      if (filter === 'CREATE' && item.status !== 'CREATE' && item.status !== 'CREATED') return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchName = item.label.toLowerCase().includes(q);
        const matchAssignee = item.assigneeName ? item.assigneeName.toLowerCase().includes(q) : false;
        const matchMsg = item.message ? item.message.toLowerCase().includes(q) : false;
        return matchName || matchAssignee || matchMsg;
      }
      return true;
    });
  }, [rows, filter, search]);

  const countCreate = result ? result.summary.created : preview.summary.create;
  const countSkipped = result ? result.summary.skipped : preview.summary.skipped;
  const countBlocked = result ? result.summary.blocked : preview.summary.blocked;
  const countFailed = result ? result.summary.failed : 0;

  return (
    <section className="guta-chat-card rk-open-card" aria-label="Kế hoạch mở kỳ KPI doanh thu" aria-busy={busy}>
      <div className="rk-open-header">
        <div className="rk-open-header-left">
          <div className="rk-open-badge-row">
            <span className="rk-open-eyebrow">KẾ HOẠCH MỞ KỲ</span>
            <span className={`rk-open-pill rk-open-pill-${action.status.toLowerCase()}`}>
              {action.status === 'PENDING' ? '⏳ Chờ duyệt' :
               action.status === 'CONFIRMED' || action.status === 'EXECUTED' ? '✓ Đã xác nhận' :
               action.status === 'CANCELLED' ? '✕ Đã hủy' : 'Hết hạn'}
            </span>
          </div>
          <h2 className="rk-open-title">KPI doanh thu kỳ {preview.period.slice(5)}/{preview.period.slice(0, 4)}</h2>
          <p className="rk-open-subtitle">
            Kế hoạch đề xuất mục tiêu doanh thu và người phụ trách cho hệ thống chi nhánh GUTA
          </p>
        </div>
      </div>

      {result ? (
        <p role="status" className="rk-open-summary-text">
          Kỳ đang mở. Đã tạo {result.summary.created} · Bỏ qua {result.summary.skipped} · Cần xử lý {result.summary.blocked} · Lỗi {result.summary.failed}.
        </p>
      ) : (
        <p className="rk-open-summary-text">
          Dự kiến tạo {preview.summary.create} · Đã có {preview.summary.skipped} · Cần xử lý {preview.summary.blocked}.
        </p>
      )}

      {action.status === 'CANCELLED' && <div role="status" className="rk-open-alert rk-open-alert-neutral">Đã hủy đề xuất. Kỳ và bản nháp giữ nguyên.</div>}
      {expired && <div role="status" className="rk-open-alert rk-open-alert-warning">Đề xuất đã hết hạn.</div>}
      {['FAILED', 'CONFIRMED'].includes(action.status) && <div role="status" className="rk-open-alert rk-open-alert-danger">Cần đối chiếu kết quả bằng bản xem trước mới.</div>}

      <div className="rk-open-stats-grid">
        <div
          className={`rk-open-stat-card rk-stat-create ${filter === 'CREATE' ? 'active' : ''}`}
          onClick={() => setFilter(f => f === 'CREATE' ? 'ALL' : 'CREATE')}
          role="button"
          tabIndex={0}
        >
          <div className="rk-stat-icon">🎯</div>
          <div className="rk-stat-info">
            <span className="rk-stat-label">Dự kiến tạo mới</span>
            <strong className="rk-stat-number">{countCreate}</strong>
            <span className="rk-stat-desc">Đủ điều kiện giao chỉ tiêu</span>
          </div>
        </div>

        <div
          className={`rk-open-stat-card rk-stat-skipped ${filter === 'SKIPPED' ? 'active' : ''}`}
          onClick={() => setFilter(f => f === 'SKIPPED' ? 'ALL' : 'SKIPPED')}
          role="button"
          tabIndex={0}
        >
          <div className="rk-stat-icon">✓</div>
          <div className="rk-stat-info">
            <span className="rk-stat-label">{result ? 'Đã bỏ qua' : 'Đã có KPI'}</span>
            <strong className="rk-stat-number">{countSkipped}</strong>
            <span className="rk-stat-desc">Đã có mục tiêu từ trước</span>
          </div>
        </div>

        <div
          className={`rk-open-stat-card rk-stat-blocked ${filter === 'BLOCKED' ? 'active' : ''}`}
          onClick={() => setFilter(f => f === 'BLOCKED' ? 'ALL' : 'BLOCKED')}
          role="button"
          tabIndex={0}
        >
          <div className="rk-stat-icon">⚠️</div>
          <div className="rk-stat-info">
            <span className="rk-stat-label">Cần xử lý</span>
            <strong className="rk-stat-number">{countBlocked}</strong>
            <span className="rk-stat-desc">Chưa xác nhận SM phụ trách</span>
          </div>
        </div>

        {countFailed > 0 && (
          <div className="rk-open-stat-card rk-stat-failed">
            <div className="rk-stat-icon">✕</div>
            <div className="rk-stat-info">
              <span className="rk-stat-label">Lưu thất bại</span>
              <strong className="rk-stat-number">{countFailed}</strong>
              <span className="rk-stat-desc">Lỗi trong quá trình lưu</span>
            </div>
          </div>
        )}
      </div>

      <details className="rk-open-details" open={true}>
        <summary className="rk-open-summary">
          <div className="rk-open-summary-title">
            <span className="rk-summary-chevron">▼</span>
            <span>Chi tiết từng cửa hàng và khu vực</span>
            <span className="rk-summary-count">({filteredRows.length} / {rows.length})</span>
          </div>
        </summary>

        <div className="rk-open-details-body">
          <div className="rk-filter-toolbar">
            <div className="rk-search-box">
              <span className="rk-search-icon">🔍</span>
              <input
                type="text"
                placeholder="Tìm theo tên cửa hàng, quận, SM..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="rk-search-input"
                aria-label="Tìm kiếm chi nhánh đề xuất"
              />
              {search && (
                <button
                  type="button"
                  className="rk-search-clear"
                  onClick={() => setSearch('')}
                  aria-label="Xóa tìm kiếm"
                >
                  ×
                </button>
              )}
            </div>

            <div className="rk-pill-filters">
              <button
                type="button"
                className={`rk-filter-btn ${filter === 'ALL' ? 'active' : ''}`}
                onClick={() => setFilter('ALL')}
              >
                Tất cả ({rows.length})
              </button>
              <button
                type="button"
                className={`rk-filter-btn rk-filter-blocked ${filter === 'BLOCKED' ? 'active' : ''}`}
                onClick={() => setFilter('BLOCKED')}
              >
                ⚠️ Cần xử lý ({countBlocked})
              </button>
              <button
                type="button"
                className={`rk-filter-btn rk-filter-skipped ${filter === 'SKIPPED' ? 'active' : ''}`}
                onClick={() => setFilter('SKIPPED')}
              >
                ✓ {result ? 'Đã bỏ qua' : 'Đã có KPI'} ({countSkipped})
              </button>
              <button
                type="button"
                className={`rk-filter-btn ${filter === 'CREATE' ? 'active' : ''}`}
                onClick={() => setFilter('CREATE')}
              >
                🎯 Dự kiến tạo ({countCreate})
              </button>
            </div>
          </div>

          <div className="rk-store-table-container">
            <table className="rk-store-table">
              <thead>
                <tr>
                  <th>Cửa hàng / Chi nhánh</th>
                  <th>Trạng thái đề xuất</th>
                  <th>Người phụ trách (SM/AM)</th>
                  <th style={{ textAlign: 'right' }}>Mục tiêu đề xuất</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="rk-table-empty">
                      Không tìm thấy chi nhánh nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                ) : (
                  filteredRows.map(item => {
                    const isBlocked = item.status === 'BLOCKED';
                    const isSkipped = item.status === 'SKIP_ALREADY_EXISTS' || item.status === 'SKIPPED';
                    const isCreated = item.status === 'CREATE' || item.status === 'CREATED';
                    const isFailed = item.status === 'FAILED';

                    return (
                      <tr key={item.storeId ?? item.areaKey} className={`rk-store-row ${isBlocked ? 'rk-row-blocked' : ''}`}>
                        <td className="rk-store-name-cell">
                          <div className="rk-store-info">
                            <span className="rk-store-name">{item.label}</span>
                            {item.unitType === 'AREA' && <span className="rk-area-tag">Khu vực AM</span>}
                          </div>
                          {item.message && (
                            <div className="rk-store-warning">
                              <span className="rk-warning-icon">⚠️</span>
                              <span>{item.message} {item.fixHint}</span>
                            </div>
                          )}
                        </td>
                        <td>
                          <span className={`rk-status-badge ${
                            isBlocked ? 'rk-badge-blocked' :
                            isSkipped ? 'rk-badge-skipped' :
                            isCreated ? 'rk-badge-create' : 'rk-badge-failed'
                          }`}>
                            {isBlocked && '⚠️ '}
                            {isSkipped && '✓ '}
                            {isCreated && '🎯 '}
                            {isFailed && '✕ '}
                            {itemLabels[item.status]}
                          </span>
                        </td>
                        <td className="rk-assignee-cell">
                          {item.assigneeName ? (
                            <div className="rk-assignee-info">
                              <span className="rk-user-avatar">👤</span>
                              <span className="rk-assignee-name">{item.assigneeName}</span>
                              <span className="rk-role-pill">{item.assigneeRole}</span>
                            </div>
                          ) : (
                            <span className="rk-no-assignee">⚠️ Chưa có SM phụ trách</span>
                          )}
                        </td>
                        <td className="rk-target-cell">
                          {item.targetVnd != null ? (
                            <strong className="rk-target-amount">{formatMoney.format(item.targetVnd)}</strong>
                          ) : (
                            <span className="rk-target-empty">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </details>

      {error && <p role="alert" className="rk-alert-error">{error}</p>}

      {pending && (
        <div className="guta-chat-actions rk-open-actions">
          <button
            type="button"
            className="rk-btn-primary"
            disabled={busy || !!changed}
            onClick={() => void decide(true)}
          >
            {busy ? 'Đang xử lý…' : 'Xác nhận kế hoạch'}
          </button>
          <button
            type="button"
            className="rk-btn-danger-outline"
            disabled={busy}
            onClick={() => void decide(false)}
          >
            Hủy đề xuất
          </button>
        </div>
      )}

      {canRetry && (
        <div className="rk-open-actions">
          <button
            type="button"
            className="rk-btn-secondary"
            disabled={busy}
            onClick={() => void run(() => requestRevenueOpenProposal(preview.period))}
          >
            Xem trước để thử lại
          </button>
        </div>
      )}
    </section>
  );
}

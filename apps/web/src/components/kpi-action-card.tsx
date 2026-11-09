import React, { useRef, useState } from 'react';
import {
  RevenueKpiChatActionSchema,
  PerformanceKpiChatActionSchema,
  type RevenueKpiChatAction,
  type PerformanceKpiChatAction,
} from '@hr-blockbot/contracts';
import { apiFetch, API_BASE } from '../services/auth';

const formatMoney = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

function uuidv4(): string {
  if (typeof crypto !== 'undefined') {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    if (typeof crypto.getRandomValues === 'function') {
      const bytes = crypto.getRandomValues(new Uint8Array(16));
      bytes[6] = (bytes[6] & 0x0f) | 0x40;
      bytes[8] = (bytes[8] & 0x3f) | 0x80;
      const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
    }
  }
  throw new Error('Môi trường thiếu nguồn sinh UUID an toàn (Web Crypto).');
}

async function readActionResponse(response: Response): Promise<RevenueKpiChatAction | PerformanceKpiChatAction> {
  const data = await response.json();
  if (!response.ok) {
    const errorObj = data && typeof data === 'object' && 'error' in data && data.error && typeof data.error === 'object' ? data.error : null;
    const message = errorObj && 'message' in errorObj && typeof errorObj.message === 'string' ? errorObj.message : 'Chưa xử lý được đề xuất KPI.';
    const code = errorObj && 'code' in errorObj && typeof errorObj.code === 'string' ? errorObj.code : undefined;
    throw Object.assign(new Error(message), {
      code,
      status: response.status,
    });
  }
  const perf = PerformanceKpiChatActionSchema.safeParse(data);
  if (perf.success) return perf.data;
  return RevenueKpiChatActionSchema.parse(data);
}

async function fetchChatAction(actionId: string): Promise<RevenueKpiChatAction | PerformanceKpiChatAction> {
  const res = await apiFetch(`${API_BASE}/chat/actions/${encodeURIComponent(actionId)}`);
  return readActionResponse(res);
}

function buildDecisionBody(
  action: RevenueKpiChatAction | PerformanceKpiChatAction,
  approve: boolean,
  clientRequestId: string,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  if (!approve) {
    return { approve: false, clientRequestId };
  }

  let expectedVersion = 0;
  let planDigest = '';

  switch (action.type) {
    case 'revenue_kpi.open_period':
      expectedVersion = action.preview.version;
      planDigest = action.preview.planDigest;
      break;
    case 'revenue_kpi.mutate_assignment':
      expectedVersion = action.preview.expectedVersion;
      planDigest = action.preview.planDigest;
      break;
    case 'revenue_kpi.result_action':
      expectedVersion = action.preview.expectedVersion;
      planDigest = action.preview.planDigest;
      break;
    case 'revenue_kpi.create_period':
      expectedVersion = 0;
      planDigest = action.preview.planDigest;
      break;
    case 'revenue_kpi.save_assignment':
      expectedVersion = action.args.expectedVersion;
      planDigest = action.preview.planDigest;
      break;
    case 'performance_kpi.task_action':
      expectedVersion = action.preview.expectedVersion;
      planDigest = action.preview.planDigest;
      break;
    case 'performance_kpi.evaluation_action':
      expectedVersion = action.preview.expectedVersion;
      planDigest = action.preview.planDigest;
      break;
  }

  return {
    approve: true,
    clientRequestId,
    expectedVersion,
    planDigest,
    ...extra,
  };
}

export interface KpiActionCardProps {
  initial: RevenueKpiChatAction | PerformanceKpiChatAction;
  onExecuted?: () => void;
}

export const KpiActionCard: React.FC<KpiActionCardProps> = ({ initial, onExecuted }) => {
  const [action, setAction] = useState<RevenueKpiChatAction | PerformanceKpiChatAction>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [reason, setReason] = useState('');
  const [evidenceRef, setEvidenceRef] = useState('');
  const inFlight = useRef(false);
  React.useEffect(() => {
    if (!inFlight.current) setAction(initial);
  }, [initial]);
  const request = useRef<{ key: string; id: string }>();

  const run = async (operation: () => Promise<RevenueKpiChatAction | PerformanceKpiChatAction>) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    setError('');
    setStatusMessage('');
    try {
      const next = await operation();
      setAction(next);
      if (next.status === 'CONFIRMED' || next.status === 'EXECUTED') {
        setStatusMessage(next.status === 'EXECUTED' ? 'Thao tác đã được thực thi thành công.' : 'Thao tác đã được xác nhận.');
      } else if (next.status === 'CANCELLED') {
        setStatusMessage('Đã hủy đề xuất.');
      }
      if (next.executed) onExecuted?.();
    } catch (cause) {
      const failure = cause as Error & { code?: string; status?: number };
      if (failure.status === 409 && [
        'REVENUE_KPI_ACTION_DECIDED', 'REVENUE_KPI_ACTION_EXPIRED',
        'PERFORMANCE_KPI_ACTION_DECIDED', 'PERFORMANCE_KPI_ACTION_EXPIRED',
      ].includes(failure.code ?? '')) {
        try {
          const stored = await fetchChatAction(action.actionId);
          setAction(stored);
          return;
        } catch { /* fall through to the original error */ }
      }
      if (failure.status === 409 && ['REVENUE_KPI_PLAN_CHANGED', 'PERFORMANCE_KPI_PLAN_CHANGED'].includes(failure.code ?? '')) {
        setError('Dữ liệu kế hoạch đã thay đổi. Nút xác nhận cũ đã bị khóa; vui lòng tạo đề xuất mới.');
        setAction((current) => ({ ...current, status: 'FAILED', requiresConfirmation: false }));
        return;
      }
      setError(failure.message || 'Chưa xử lý được đề xuất KPI.');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const isAdjustmentRequest = action.type === 'revenue_kpi.mutate_assignment'
    && action.args.action === 'adjustment-request';
  const reasonValid = reason.trim().length >= 5 && evidenceRef.trim().length >= 5;

  const decide = (approve: boolean) => run(async () => {
    const key = action.actionId + ':' + approve;
    if (request.current?.key !== key) request.current = { key, id: uuidv4() };
    const extra: Record<string, unknown> = isAdjustmentRequest && approve
      ? { reason: reason.trim(), evidenceRef: evidenceRef.trim() }
      : {};
    const body = buildDecisionBody(action, approve, request.current.id, extra);
    const res = await apiFetch(`${API_BASE}/chat/actions/${encodeURIComponent(action.actionId)}/decision`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    return readActionResponse(res);
  });

  const expiresTime = Date.parse(action.expiresAt);
  const expired = action.status === 'EXPIRED' || (action.status === 'PENDING' && !Number.isNaN(expiresTime) && expiresTime <= Date.now());
  const pending = action.status === 'PENDING' && !expired && action.requiresConfirmation;

  const renderCardContent = () => {
    switch (action.type) {
      case 'revenue_kpi.open_period': {
        const p = action.preview;
        return (
          <>
            <strong>KPI doanh thu kỳ {p.period}</strong>
            <p>Dự kiến tạo {p.summary.create} · Đã có {p.summary.skipped} · Cần xử lý {p.summary.blocked}.</p>
          </>
        );
      }
      case 'revenue_kpi.mutate_assignment': {
        const p = action.preview;
        return (
          <>
            <strong>Điều chỉnh chỉ tiêu KPI · Kỳ {p.period}</strong>
            <p>{p.summary}</p>
            {p.impacts.length > 0 && (
              <details>
                <summary>Chi tiết tác động ({p.impacts.length})</summary>
                <ul>
                  {p.impacts.map((imp) => (
                    <li key={imp.field}>
                      <strong>{imp.field}</strong>: {imp.from ?? '—'} → {imp.to ?? '—'}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {p.warnings && p.warnings.length > 0 && (
              <ul>
                {p.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </>
        );
      }
      case 'revenue_kpi.result_action': {
        const p = action.preview;
        return (
          <>
            <strong>Thao tác kết quả KPI ({p.kind}) · Kỳ {p.period}</strong>
            <p>{p.summary}</p>
            {p.requirements.length > 0 && (
              <details>
                <summary>Điều kiện thực hiện ({p.requirements.filter((r) => r.met).length}/{p.requirements.length} đạt)</summary>
                <ul>
                  {p.requirements.map((req, idx) => (
                    <li key={idx}>
                      {req.met ? '✓ ' : '✗ '}
                      <strong>{req.label}</strong>
                      {req.detail ? `: ${req.detail}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {p.warnings && p.warnings.length > 0 && (
              <ul>
                {p.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </>
        );
      }
      case 'revenue_kpi.create_period': {
        const p = action.preview;
        return (
          <>
            <strong>Tạo kỳ KPI mới · Kỳ {p.period}</strong>
            <p>{p.summary}</p>
            <details>
              <summary>Chính sách kỳ KPI</summary>
              <ul>
                <li>Tăng trưởng mặc định: {p.policy.defaultGrowthPercent}%</li>
                <li>Ngưỡng chưa đạt: {p.policy.underperformingRateThresholdPercent}%</li>
                <li>Thời hạn xác nhận: {p.policy.acceptanceWindowWorkingDays} ngày làm việc</li>
              </ul>
            </details>
            {p.warnings && p.warnings.length > 0 && (
              <ul>
                {p.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </>
        );
      }
      case 'revenue_kpi.save_assignment': {
        const p = action.preview;
        const totalItems = [...p.willCreate, ...p.willSkip, ...p.blocked];
        return (
          <>
            <strong>Giao chỉ tiêu KPI doanh thu {p.bulk ? '(Hàng loạt)' : ''} · Kỳ {p.period}</strong>
            <p>{p.summary}</p>
            <p>Dự kiến tạo: {p.willCreate.length} · Bỏ qua: {p.willSkip.length} · Cần xử lý: {p.blocked.length}</p>
            {totalItems.length > 0 && (
              <details>
                <summary>Chi tiết cửa hàng và nhân sự ({totalItems.length})</summary>
                <ul>
                  {totalItems.map((item, idx) => (
                    <li key={idx}>
                      <strong>{item.assigneeName || item.storeId || 'Cửa hàng'}</strong>
                      {item.targetVnd != null ? ` · ${formatMoney.format(item.targetVnd)}` : ''}
                      {item.message ? ` · ${item.message}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {p.warnings && p.warnings.length > 0 && (
              <ul>
                {p.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </>
        );
      }
      case 'performance_kpi.task_action': {
        const p = action.preview;
        const totalItems = [...p.willCreate, ...p.willSkip, ...p.blocked];
        return (
          <>
            <strong>Nhiệm vụ KPI ({p.kind}) {p.period ? `· Kỳ ${p.period}` : ''}</strong>
            <p>{p.summary}</p>
            <p>Dự kiến tạo: {p.willCreate.length} · Bỏ qua: {p.willSkip.length} · Bị chặn: {p.blocked.length}</p>
            {totalItems.length > 0 && (
              <details>
                <summary>Chi tiết nhiệm vụ ({totalItems.length})</summary>
                <ul>
                  {totalItems.map((item, idx) => (
                    <li key={idx}>
                      <strong>{item.title || item.taskId || 'Nhiệm vụ'}</strong>
                      {item.taskWeightPercent != null ? ` · Trọng số: ${item.taskWeightPercent}%` : ''}
                      {item.message ? ` · ${item.message}` : ''}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {p.warnings && p.warnings.length > 0 && (
              <ul>
                {p.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </>
        );
      }
      case 'performance_kpi.evaluation_action': {
        const p = action.preview;
        return (
          <>
            <strong>Đánh giá KPI hiệu suất ({p.kind}) · Kỳ {p.period}</strong>
            <p>{p.summary}</p>
            <p>
              Điểm dự kiến: {p.projectedFinalScore != null ? `${p.projectedFinalScore} / 100` : 'Chưa tính'} (Trạng thái: {p.currentStatus} → {p.projectedStatus})
            </p>
            {p.criteriaScores && p.criteriaScores.length > 0 && (
              <details>
                <summary>Tiêu chí đánh giá ({p.criteriaScores.length})</summary>
                <ul>
                  {p.criteriaScores.map((c, idx) => (
                    <li key={idx}>
                      <strong>{c.name}</strong> ({c.code}): {c.currentScore != null ? c.currentScore : '—'} → {c.projectedScore != null ? c.projectedScore : '—'} / {c.maxScore} (Trọng số: {c.effectiveWeightPercent}%)
                    </li>
                  ))}
                </ul>
              </details>
            )}
            {p.warnings && p.warnings.length > 0 && (
              <ul>
                {p.warnings.map((w, idx) => (
                  <li key={idx}>{w}</li>
                ))}
              </ul>
            )}
          </>
        );
      }
    }
  };

  return (
    <section
      className="guta-chat-card"
      aria-label={`Đề xuất thao tác KPI ${action.type}`}
      aria-busy={busy}
    >
      {renderCardContent()}

      {action.status === 'CANCELLED' && <p role="status">Đã hủy đề xuất.</p>}
      {action.status === 'EXECUTED' && <p role="status">Đã thực hiện thành công.</p>}
      {action.status === 'CONFIRMED' && <p role="status">Đã xác nhận thao tác.</p>}
      {action.status === 'FAILED' && <p role="status">Thao tác thất bại.</p>}
      {expired && <p role="status">Đề xuất đã hết hạn.</p>}
      {statusMessage && <div role="status" aria-live="polite">{statusMessage}</div>}

      {error && <p role="alert">{error}</p>}

      {pending && isAdjustmentRequest && (
        <div className="guta-chat-actions" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
            Lý do yêu cầu điều chỉnh (bắt buộc, ≥ 5 ký tự)
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={2000}
              rows={3}
              aria-label="Lý do yêu cầu điều chỉnh"
            />
          </label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '4px', fontSize: '13px' }}>
            Bằng chứng — link hoặc mã tài liệu (bắt buộc, ≥ 5 ký tự)
            <input
              type="text"
              value={evidenceRef}
              onChange={(event) => setEvidenceRef(event.target.value)}
              maxLength={2000}
              aria-label="Bằng chứng yêu cầu điều chỉnh"
            />
          </label>
        </div>
      )}

      {pending && (
        <div className="guta-chat-actions">
          <button
            type="button"
            disabled={busy || (isAdjustmentRequest && !reasonValid)}
            onClick={() => void decide(true)}
          >
            Xác nhận thực hiện
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void decide(false)}
          >
            Hủy đề xuất
          </button>
        </div>
      )}
    </section>
  );
};

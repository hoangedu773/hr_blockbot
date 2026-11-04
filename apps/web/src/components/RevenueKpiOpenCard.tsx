import { useRef, useState } from 'react';
import {
  RevenueKpiOpenActionSchema, RevenueKpiOpenPreviewSchema,
  type RevenueKpiOpenAction, type RevenueKpiOpenPreview,
} from '@hr-blockbot/contracts';
import { apiFetch, API_BASE } from '../services/auth';
import { newClientMessageId } from '../services/api';

const itemLabels = {
  CREATE: 'Dự kiến tạo', SKIP_ALREADY_EXISTS: 'Đã có KPI', BLOCKED: 'Cần xử lý',
  CREATED: 'Đã tạo', SKIPPED: 'Đã bỏ qua', FAILED: 'Lưu thất bại',
};
const formatMoney = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });

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
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
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
      // Another tab/session already decided this action. Show the persisted
      // outcome instead of leaving stale PENDING buttons that always 409.
      if (failure.status === 409 && ['REVENUE_KPI_ACTION_DECIDED', 'REVENUE_KPI_ACTION_EXPIRED'].includes(failure.code ?? '')) {
        try { const stored = await fetchAction(action.actionId); setAction(stored); setChanged(undefined); return; }
        catch { /* fall through to the original error */ }
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
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    }));
  });
  const expired = action.status === 'EXPIRED' || (action.status === 'PENDING' && Date.parse(action.expiresAt) <= Date.now());
  const pending = action.status === 'PENDING' && !expired;
  const canRetry = changed || expired || ['FAILED', 'CONFIRMED'].includes(action.status)
    || result?.blocked.some(item => item.retryable) || result?.failed.some(item => item.retryable);
  return <section className="guta-chat-card" aria-label="Kế hoạch mở kỳ KPI doanh thu" aria-busy={busy}>
    <strong>KPI doanh thu kỳ {preview.period.slice(5)}/{preview.period.slice(0, 4)}</strong>
    {result
      ? <p role="status">Kỳ đang mở. Đã tạo {result.summary.created} · Bỏ qua {result.summary.skipped} · Cần xử lý {result.summary.blocked} · Lỗi {result.summary.failed}.</p>
      : <p>Dự kiến tạo {preview.summary.create} · Đã có {preview.summary.skipped} · Cần xử lý {preview.summary.blocked}.</p>}
    {action.status === 'CANCELLED' && <p role="status">Đã hủy đề xuất. Kỳ và bản nháp giữ nguyên.</p>}
    {expired && <p role="status">Đề xuất đã hết hạn.</p>}
    {['FAILED', 'CONFIRMED'].includes(action.status) && <p role="status">Cần đối chiếu kết quả bằng bản xem trước mới.</p>}
    <details open={!!result || !!changed}>
      <summary>Chi tiết từng cửa hàng và khu vực</summary>
      <ul>{rows.map(item => <li key={item.storeId ?? item.areaKey}>
        <strong>{item.label}</strong> · {itemLabels[item.status]}
        {item.assigneeName && ' · ' + item.assigneeName}
        {item.targetVnd != null && ' · ' + formatMoney.format(item.targetVnd)}
        {item.message && <p>{item.message} {item.fixHint}</p>}
      </li>)}</ul>
    </details>
    {error && <p role="alert">{error}</p>}
    {pending && <div className="guta-chat-actions">
      <button type="button" disabled={busy || !!changed} onClick={() => void decide(true)}>Xác nhận kế hoạch</button>
      <button type="button" disabled={busy} onClick={() => void decide(false)}>Hủy đề xuất</button>
    </div>}
    {canRetry && <button type="button" disabled={busy} onClick={() => void run(() => requestRevenueOpenProposal(preview.period))}>Xem trước để thử lại</button>}
  </section>;
}

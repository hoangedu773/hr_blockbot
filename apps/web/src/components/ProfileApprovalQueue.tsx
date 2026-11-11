import { useCallback, useEffect, useRef, useState } from 'react';
import type { fetchMe, PendingChangeRequestItem } from '../services/api';
import { fetchMe as getMe, fetchProfileApprovalPage, reviewProfileChangeRequest } from '../services/api';
import { CrmDialog } from './ui/CrmDialog';
import { AppIcon } from './ui/AppIcon';
import { useAuth } from '../context/AuthContext';
import { useAuthorization } from '../context/useAuthorization';

const fieldName: Record<string, string> = { level: 'Cấp bậc', hiredAt: 'Ngày vào làm', jobTitle: 'Chức danh' };
const display = (value: unknown) => (value == null ? 'Chưa có dữ liệu' : String(value));

const STATUS_LABELS: Record<string, string> = {
  PENDING: 'Chờ HR độc lập duyệt',
  APPROVED: 'Đã phê duyệt',
  REJECTED: 'Đã từ chối',
};

/** Existing profile workflow with capability/store authorization, not rank inheritance. */
export function ProfileApprovalQueue() {
  const { user } = useAuth();
  const { can } = useAuthorization();
  const [employeeId, setEmployeeId] = useState<string | null>(null);

  useEffect(() => {
    let current = true;
    void getMe()
      .then((me: Awaited<ReturnType<typeof fetchMe>>) => {
        if (current) setEmployeeId(me.employeeId ?? null);
      })
      .catch(() => {
        if (current) setEmployeeId(null);
      });
    return () => {
      current = false;
    };
  }, [user?.id]);

  const [items, setItems] = useState<PendingChangeRequestItem[]>([]);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('PENDING');
  const [hasNext, setHasNext] = useState(false);
  const [total, setTotal] = useState(0);
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
    setLoading(true);
    setError('');
    try {
      const result = await fetchProfileApprovalPage(page, status);
      if (current === sequence.current) {
        setItems(result.items);
        setHasNext(result.paging.hasNext);
        setTotal(result.paging.totalItems);
      }
    } catch (failure) {
      if (current === sequence.current) {
        setError(failure instanceof Error ? failure.message : 'Không tải được hàng đợi.');
      }
    } finally {
      if (current === sequence.current) setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
    return () => {
      sequence.current++;
    };
  }, [load]);

  const review = async (action: 'APPROVE' | 'REJECT') => {
    if (!selected || writing.current || !independent || (action === 'APPROVE' && promotionPending)) return;
    writing.current = true;
    setBusy(true);
    setDecisionError('');
    try {
      await reviewProfileChangeRequest(selected.employeeId, selected.request.id, {
        action,
        ...(reason.trim() ? { reason: reason.trim() } : {}),
      });
      setSelected(null);
      setMessage(
        action === 'APPROVE'
          ? 'Đã duyệt thay đổi hồ sơ. Nhân viên xem quyết định trong lịch sử của mình.'
          : 'Đã từ chối và lưu lý do để nhân viên xem, sửa và gửi lại.'
      );
      await load();
    } catch (failure) {
      setDecisionError(failure instanceof Error ? failure.message : 'Không lưu được quyết định.');
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  const independent =
    can('employees.review') &&
    !!employeeId &&
    !!selected &&
    selected.request.status === 'PENDING' &&
    selected.employeeId !== employeeId &&
    ![user?.id, employeeId].includes(selected.request.requestedBy);

  const promotionPending =
    !!selected && (selected.request.targetFields.level !== undefined || selected.request.targetFields.jobTitle !== undefined);

  return (
    <section
      className="crm-work-detail"
      aria-label="Duyệt thay đổi hồ sơ"
      style={{
        marginTop: '18px',
        padding: '16px 18px',
        borderRadius: '12px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <header className="crm-work-heading" style={{ marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: '16px', fontWeight: 700, color: '#f8fafc', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AppIcon name="clipboard" size={18} />
            <span>Hàng đợi duyệt thay đổi hồ sơ nhân sự</span>
          </h3>
          <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#94a3b8' }}>
            Đối chiếu giá trị cũ/mới. Không tự duyệt hồ sơ của mình; từ chối phải có lý do.
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <select
            aria-label="Trạng thái yêu cầu hồ sơ"
            className="input"
            style={{ width: 'auto', minWidth: '150px' }}
            value={status}
            disabled={busy}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
          >
            <option value="PENDING">Chờ duyệt</option>
            <option value="APPROVED">✓ Đã duyệt</option>
            <option value="REJECTED">✕ Đã từ chối</option>
          </select>
          <button className="btn" type="button" disabled={loading} onClick={() => void load()}>
            Làm mới hàng đợi
          </button>
        </div>
      </header>

      {message && (
        <p role="status" style={{ color: '#34d399', fontSize: '13px', marginBottom: '10px' }}>
          {message}
        </p>
      )}

      {loading ? (
        <p role="status" style={{ fontSize: '13px', color: '#94a3b8' }}>Đang tải yêu cầu chờ duyệt…</p>
      ) : error ? (
        <p role="alert" style={{ color: '#f87171', fontSize: '13px' }}>{error}</p>
      ) : !items.length ? (
        <p style={{ fontSize: '13px', color: '#94a3b8', margin: '8px 0' }}>
          Không có yêu cầu hồ sơ chờ duyệt trong phạm vi của bạn.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: '10px', marginBottom: '12px' }}>
          {items.map((item) => (
            <article
              className="crm-report-card"
              key={item.employeeId + item.request.id}
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '10px',
                padding: '12px 16px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
              }}
            >
              <div>
                <strong style={{ fontSize: '14px', color: '#f8fafc' }}>{item.employeeName}</strong>
                <div style={{ fontSize: '12px', color: '#94a3b8', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                  <AppIcon name="clock" size={14} />
                  <span>{new Date(item.request.requestedAt).toLocaleString('vi-VN')} · Trường thay đổi:{' '}</span>
                  <span style={{ color: '#60a5fa', fontWeight: 600 }}>
                    {Object.keys(item.request.targetFields)
                      .map((key) => fieldName[key] || key)
                      .join(', ')}
                  </span>
                </div>
              </div>
              <button
                className="btn"
                type="button"
                onClick={() => {
                  setSelected(item);
                  setReason('');
                  setDecisionError('');
                }}
              >
                Đối chiếu & quyết định
              </button>
            </article>
          ))}
        </div>
      )}

      <nav className="crm-work-actions" aria-label="Phân trang duyệt hồ sơ" style={{ fontSize: '12px' }}>
        <button className="btn" disabled={loading || busy || page === 1} onClick={() => setPage(page - 1)}>
          Trang trước
        </button>
        <span style={{ color: '#94a3b8' }}>
          Trang {page} · {total} yêu cầu
        </span>
        <button className="btn" disabled={loading || busy || !hasNext} onClick={() => setPage(page + 1)}>
          Trang sau
        </button>
      </nav>

      {selected && (
        <CrmDialog
          title="Duyệt thay đổi hồ sơ"
          busy={busy}
          onClose={() => {
            if (!writing.current) setSelected(null);
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            <div
              style={{
                padding: '12px 14px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.08)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '11px', color: '#94a3b8' }}>NHÂN SỰ ĐỀ NGHỊ CẬP NHẬT</div>
                <div style={{ fontSize: '15px', fontWeight: 700, color: '#f8fafc' }}>{selected.employeeName}</div>
              </div>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '3px 10px',
                  borderRadius: '999px',
                  background: 'rgba(245, 158, 11, 0.14)',
                  color: '#fbbf24',
                }}
              >
                {STATUS_LABELS[selected.request.status] || selected.request.status}
              </span>
            </div>

            {!independent && (
              <p role="status" style={{ fontSize: '12px', color: '#fbbf24', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AppIcon name="alert" size={16} />
                <span>Không tự duyệt yêu cầu do mình lập hoặc hồ sơ của mình; cần HR độc lập có grant review phù hợp.</span>
              </p>
            )}
            {promotionPending && (
              <p role="status" style={{ fontSize: '12px', color: '#fbbf24', margin: 0, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <AppIcon name="alert" size={16} />
                <span>Đổi chức danh/cấp bậc đang PENDING chính sách riêng. Chưa thể phê duyệt; có thể giữ chờ hoặc từ chối có lý do.</span>
              </p>
            )}

            <div className="crm-work-table-wrap">
              <table className="table">
                <caption>Thông tin cần thay đổi</caption>
                <thead>
                  <tr>
                    <th>Trường thông tin</th>
                    <th>Giá trị trước</th>
                    <th>Giá trị đề nghị</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(selected.request.targetFields).map(([key, value]) => (
                    <tr key={key}>
                      <td style={{ fontWeight: 600 }}>{fieldName[key] || key}</td>
                      <td style={{ color: '#94a3b8' }}>{display(selected.request.previousSnapshot[key])}</td>
                      <td style={{ color: '#34d399', fontWeight: 600 }}>{display(value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <label className="field" style={{ margin: 0 }}>
              <span className="field__label">Lý do quyết định hồ sơ (bắt buộc khi từ chối)</span>
              <textarea
                className="textarea"
                maxLength={2000}
                disabled={busy}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </label>

            {decisionError && <p role="alert" style={{ color: '#f87171', fontSize: '13px', margin: 0 }}>{decisionError}</p>}

            <div className="crm-work-actions" style={{ justifyContent: 'flex-end' }}>
              <button
                className="btn"
                style={{ background: 'rgba(239, 68, 68, 0.16)', color: '#f87171', borderColor: 'rgba(239, 68, 68, 0.35)' }}
                type="button"
                disabled={busy || !independent || !reason.trim()}
                onClick={() => void review('REJECT')}
              >
                ✕ Từ chối thay đổi hồ sơ
              </button>
              <button
                className="btn btn--primary"
                style={{ background: '#10b981', borderColor: '#059669', color: '#fff' }}
                type="button"
                disabled={busy || !independent || promotionPending}
                onClick={() => void review('APPROVE')}
              >
                ✓ Xác nhận duyệt hồ sơ
              </button>
            </div>
          </div>
        </CrmDialog>
      )}
    </section>
  );
}

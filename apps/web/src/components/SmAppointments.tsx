import { useCallback, useEffect, useRef, useState } from 'react';
import type { SmAppointment } from '@hr-blockbot/contracts';
import { useAuthorization } from '../context/useAuthorization';
import { useAuth } from '../context/AuthContext';
import { requestJson } from '../services/api';

export const SM_POSITION_LABELS = {
  PRIMARY: 'SM phụ trách chính cửa hàng',
  ADDITIONAL: 'SM kiêm nhiệm cửa hàng khác',
  SUPERVISORY: 'SM giám sát',
  TEMPORARY: 'SM thay tạm',
};

// Visibility hint only; the API verifies source title and authority independently.
export const isSmPositionCandidate = (title: string | null | undefined) =>
  ['SM', 'SM (CỬA HÀNG TRƯỞNG)', 'CỬA HÀNG TRƯỞNG'].includes(title?.trim().normalize('NFC').toUpperCase() || '');

const states: Record<string, string> = {
  PENDING: 'Chờ xác nhận độc lập',
  SCHEDULED: 'Chưa đến ngày hiệu lực',
  EFFECTIVE: 'Đang hiệu lực',
  EXPIRED: 'Hết hạn',
  REJECTED: 'Đã từ chối',
  REVOKED: 'Đã thu hồi',
};

type Page = { items: SmAppointment[]; paging: { hasNext: boolean } };
const post = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

export function SmAppointments({ employeeId }: { employeeId: string }) {
  const { can, stores } = useAuthorization();
  const { user } = useAuth();
  const [data, setData] = useState<Page | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<SmAppointment['kind']>('PRIMARY');
  const [storeId, setStoreId] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [basis, setBasis] = useState<SmAppointment['basis']>('SIMULATION_APPROVED');
  const [evidenceRef, setEvidence] = useState('');
  const [reason, setReason] = useState('');
  const [replacement, setReplacement] = useState('');
  const [detail, setDetail] = useState<SmAppointment | null>(null);
  const [decisionReason, setDecisionReason] = useState('');
  const [handover, setHandover] = useState('');
  const [message, setMessage] = useState('');
  const sequence = useRef(0);
  const detailSequence = useRef(0);
  const requestId = useRef<string | null>(null);

  const load = useCallback(async () => {
    const seq = ++sequence.current;
    setError('');
    try {
      const value = await requestJson<Page>(`/employees/${employeeId}/sm-appointments?page=${page}&limit=10`);
      if (seq === sequence.current) setData(value);
    } catch (e) {
      if (seq === sequence.current) setError(e instanceof Error ? e.message : 'Không tải được phân công.');
    }
  }, [employeeId, page]);

  useEffect(() => {
    setData(null);
    void load();
    return () => {
      sequence.current++;
      detailSequence.current++;
    };
  }, [load]);

  const open = async (id: string) => {
    const seq = ++detailSequence.current;
    setError('');
    setDecisionReason('');
    setHandover('');
    try {
      const row = await requestJson<SmAppointment>(`/employees/${employeeId}/sm-appointments/${id}`);
      if (seq === detailSequence.current) setDetail(row);
    } catch (e) {
      if (seq === detailSequence.current) setError(e instanceof Error ? e.message : 'Không tải được lịch sử.');
    }
  };

  const mutate = async (path: string, body: unknown) => {
    if (busy) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const row = await requestJson<SmAppointment>(path, post(body));
      setDetail(row);
      setMessage('Đã lưu hồ sơ phân công.');
      requestId.current = null;
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Chưa lưu được. Giữ bản nhập và thử lại.');
    } finally {
      setBusy(false);
    }
  };

  const canReview = can('employees.review') && detail && detail.requestedBy !== user?.id;

  return (
    <section
      aria-label="Hồ sơ phân công SM"
      className="crm-report-card"
      style={{
        marginTop: '14px',
        padding: '14px',
        borderRadius: '10px',
        background: 'rgba(255,255,255,0.025)',
        border: '1px solid rgba(255,255,255,0.08)',
      }}
    >
      <div className="crm-work-heading" style={{ marginBottom: '10px' }}>
        <h3 style={{ margin: 0, fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
          🏪 Vị trí & Phân công Cửa hàng trưởng (SM)
        </h3>
        <button
          type="button"
          className="btn"
          disabled={busy}
          onClick={() => {
            void load();
            if (detail) void open(detail.id);
          }}
        >
          Tải lại phân công
        </button>
      </div>

      {error && <p role="alert" style={{ color: '#f87171', fontSize: '12px' }}>{error}</p>}
      {message && <p role="status" style={{ color: '#34d399', fontSize: '12px' }}>{message}</p>}
      {!data && !error && <p role="status" style={{ fontSize: '12px', color: '#94a3b8' }}>Đang tải phân công…</p>}

      {data && (
        <>
          {!data.items.length ? (
            <p style={{ fontSize: '12px', color: '#94a3b8' }}>Chưa có hồ sơ phân công được ghi nhận.</p>
          ) : (
            <div style={{ display: 'grid', gap: '8px', marginBottom: '10px' }}>
              {data.items.map((row) => (
                <article
                  key={row.id}
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '10px',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: '13px', color: '#f8fafc' }}>{SM_POSITION_LABELS[row.kind]}</strong>
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: row.effectiveState === 'EFFECTIVE' ? 'rgba(16, 185, 129, 0.14)' : 'rgba(245, 158, 11, 0.14)',
                          color: row.effectiveState === 'EFFECTIVE' ? '#34d399' : '#fbbf24',
                        }}
                      >
                        {states[row.effectiveState]}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: '#cbd5e1', marginTop: '3px' }}>
                      {stores.find((s) => s.id === row.storeId)?.name || 'Chưa cập nhật tên cửa hàng'} ·{' '}
                      <span style={{ color: '#94a3b8' }}>
                        {new Date(row.validFrom).toLocaleDateString('vi-VN')} ➔{' '}
                        {row.validUntil ? new Date(row.validUntil).toLocaleDateString('vi-VN') : 'Không ấn định kết thúc'}
                      </span>
                    </div>
                  </div>
                  <button className="btn" type="button" disabled={busy} onClick={() => void open(row.id)}>
                    Căn cứ & lịch sử
                  </button>
                </article>
              ))}
            </div>
          )}
          {(page > 1 || data.paging.hasNext) && (
            <nav aria-label="Phân trang phân công SM" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <button className="btn" disabled={busy || page === 1} onClick={() => setPage(page - 1)}>
                Trang trước
              </button>
              <span>Trang {page}</span>
              <button className="btn" disabled={busy || !data.paging.hasNext} onClick={() => setPage(page + 1)}>
                Trang sau
              </button>
            </nav>
          )}
        </>
      )}

      {detail && (
        <div
          className="crm-report-card"
          style={{
            marginTop: '12px',
            padding: '12px 14px',
            borderRadius: '10px',
            background: 'rgba(15, 23, 42, 0.6)',
            border: '1px solid rgba(59, 130, 246, 0.25)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <h4 style={{ margin: 0, fontSize: '13px', color: '#93c5fd' }}>
              {SM_POSITION_LABELS[detail.kind]} · {states[detail.effectiveState]}
            </h4>
            <button type="button" className="btn" disabled={busy} onClick={() => setDetail(null)}>
              Đóng lịch sử
            </button>
          </div>
          <div style={{ fontSize: '12px', color: '#cbd5e1', display: 'grid', gap: '4px', marginBottom: '8px' }}>
            <div>📄 <strong>Căn cứ:</strong> {detail.evidenceRef}</div>
            <div>🏛️ <strong>Nguồn:</strong> {detail.basis === 'SIMULATION_APPROVED' ? 'Cơ cấu mô phỏng được duyệt' : 'Văn bản phân công đã đối chiếu'}</div>
            <div>📝 <strong>Lý do:</strong> {detail.reason}</div>
            {detail.approvedAt && <div>✓ <strong>Xác nhận ngày:</strong> {new Date(detail.approvedAt).toLocaleString('vi-VN')}</div>}
          </div>
          {detail.auditIntegrity !== 'VALID_LOCAL_CHAIN' && (
            <p role="alert" style={{ color: '#f87171', fontSize: '12px' }}>
              ⚠️ Không xác minh được lịch sử. Vui lòng liên hệ quản trị để kiểm tra.
            </p>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
            {detail.history.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: '6px 10px',
                  borderRadius: '6px',
                  background: 'rgba(255,255,255,0.03)',
                  borderLeft: '2px solid #3b82f6',
                  fontSize: '11px',
                  color: '#cbd5e1',
                }}
              >
                {new Date(item.at).toLocaleString('vi-VN')} · {item.before ? states[item.before] || 'Đã ghi nhận' : 'Mới'} ➔{' '}
                <strong style={{ color: '#34d399' }}>{states[item.after] || 'Đã xác nhận'}</strong> · {item.reason}
                {item.handoverRef ? ` · Bàn giao: ${item.handoverRef}` : ''}
              </div>
            ))}
          </div>

          {canReview && detail.auditIntegrity === 'VALID_LOCAL_CHAIN' && ['PENDING', 'APPROVED'].includes(detail.status) && (
            <fieldset disabled={busy} style={{ border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px' }}>
              <legend style={{ fontSize: '12px', fontWeight: 600, color: '#93c5fd', padding: '0 6px' }}>
                Xác nhận độc lập trong phạm vi HR được cấp
              </legend>
              <label className="field">
                <span>Lý do quyết định</span>
                <textarea
                  aria-label="Lý do quyết định"
                  className="input"
                  value={decisionReason}
                  maxLength={2000}
                  onChange={(e) => setDecisionReason(e.target.value)}
                />
              </label>
              {detail.status === 'APPROVED' && (
                <label className="field">
                  <span>Căn cứ bàn giao / thu hồi</span>
                  <input
                    className="input"
                    value={handover}
                    maxLength={300}
                    onChange={(e) => setHandover(e.target.value)}
                  />
                </label>
              )}
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
                {(detail.status === 'PENDING' ? ['APPROVE', 'REJECT'] : ['REVOKE']).map((action) => (
                  <button
                    type="button"
                    className={action === 'APPROVE' ? 'btn btn--primary' : 'btn'}
                    key={action}
                    disabled={
                      busy ||
                      decisionReason.trim().length < 3 ||
                      (action === 'REVOKE' && handover.trim().length < 3)
                    }
                    onClick={() =>
                      void mutate(`/employees/${employeeId}/sm-appointments/${detail.id}/decision`, {
                        expectedVersion: detail.version,
                        action,
                        reason: decisionReason,
                        ...(action === 'REVOKE' ? { handoverRef: handover } : {}),
                      })
                    }
                  >
                    {action === 'APPROVE' ? '✓ Xác nhận phân công' : action === 'REJECT' ? '✕ Từ chối đề nghị' : 'Thu hồi phân công'}
                  </button>
                ))}
              </div>
            </fieldset>
          )}
        </div>
      )}

      {can('employees.update_other') && (
        <details style={{ marginTop: '10px', fontSize: '12px' }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600, color: '#60a5fa' }}>
            + Đề nghị ghi nhận phân công SM mới
          </summary>
          <form
            style={{ marginTop: '10px' }}
            onSubmit={(e) => {
              e.preventDefault();
              if (!from || busy) return;
              requestId.current ??= crypto.randomUUID();
              void mutate(`/employees/${employeeId}/sm-appointments`, {
                clientRequestId: requestId.current,
                kind,
                storeId,
                validFrom: new Date(from).toISOString(),
                validUntil: until ? new Date(until).toISOString() : null,
                evidenceRef,
                basis,
                reason,
                replacesAppointmentId: kind === 'TEMPORARY' ? replacement : null,
              });
            }}
            onChange={() => {
              requestId.current = null;
            }}
          >
            <fieldset disabled={busy} style={{ border: 'none', padding: 0, display: 'grid', gap: '8px' }}>
              <label className="field">
                <span>Loại phân công</span>
                <select
                  aria-label="Loại phân công"
                  className="input"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as SmAppointment['kind'])}
                >
                  {Object.entries(SM_POSITION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Cửa hàng được phân công</span>
                <select
                  aria-label="Cửa hàng được phân công"
                  className="input"
                  required
                  value={storeId}
                  onChange={(e) => setStoreId(e.target.value)}
                >
                  <option value="">Chọn cửa hàng</option>
                  {stores
                    .filter((s) => s.capabilities.includes('employees.update_other'))
                    .map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="field">
                <span>Hiệu lực từ</span>
                <input
                  type="datetime-local"
                  className="input"
                  required
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Hiệu lực đến</span>
                <input
                  type="datetime-local"
                  className="input"
                  required={['TEMPORARY', 'ADDITIONAL'].includes(kind)}
                  value={until}
                  onChange={(e) => setUntil(e.target.value)}
                />
              </label>
              {kind === 'TEMPORARY' && (
                <label className="field">
                  <span>Mã hồ sơ phân công SM chính được thay</span>
                  <input
                    className="input"
                    required
                    pattern="[a-fA-F0-9]{24}"
                    value={replacement}
                    onChange={(e) => setReplacement(e.target.value)}
                  />
                </label>
              )}
              <label className="field">
                <span>Nguồn căn cứ</span>
                <select
                  aria-label="Nguồn căn cứ"
                  className="input"
                  value={basis}
                  onChange={(e) => setBasis(e.target.value as SmAppointment['basis'])}
                >
                  <option value="SIMULATION_APPROVED">Cơ cấu mô phỏng được duyệt</option>
                  <option value="DOCUMENTED_ASSIGNMENT">Văn bản phân công đã đối chiếu</option>
                </select>
              </label>
              <label className="field">
                <span>Mã / tham chiếu quyết định</span>
                <input
                  className="input"
                  required
                  minLength={3}
                  maxLength={300}
                  value={evidenceRef}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </label>
              <label className="field">
                <span>Lý do phân công</span>
                <textarea
                  aria-label="Lý do phân công"
                  className="input"
                  required
                  minLength={3}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <button className="btn btn--primary" disabled={busy} type="submit">
                Gửi HR độc lập xác nhận
              </button>
            </fieldset>
          </form>
        </details>
      )}
    </section>
  );
}

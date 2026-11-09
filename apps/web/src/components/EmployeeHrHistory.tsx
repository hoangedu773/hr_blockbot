import { useEffect, useState } from 'react';
import { createProfileChangeRequest, requestJson } from '../services/api';
import { useAuthorization } from '../context/useAuthorization';

type History = {
  items: {
    id: string;
    type: string;
    actorId: string;
    at: string;
    reason: string;
    before: Record<string, unknown>;
    after: Record<string, unknown>;
  }[];
  paging: { hasNext: boolean };
};

const FIELD_LABELS: Record<string, string> = {
  fullName: 'Họ tên',
  phone: 'Điện thoại',
  hiredAt: 'Ngày vào làm',
  jobTitle: 'Chức danh',
  level: 'Cấp bậc',
  status: 'Trạng thái',
  skills: 'Kỹ năng',
  storeId: 'Cửa hàng',
};

const formatSnapshot = (snap: Record<string, unknown> | undefined) => {
  if (!snap || Object.keys(snap).length === 0) return 'Không có';
  return Object.entries(snap)
    .map(([k, v]) => `${FIELD_LABELS[k] || k}: ${Array.isArray(v) ? v.join(', ') : v ?? 'Trống'}`)
    .join(' · ');
};

export function EmployeeHrHistory({ employeeId }: { employeeId: string }) {
  const { can } = useAuthorization();
  const [data, setData] = useState<History | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [hiredAt, setHiredAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let current = true;
    setData(null);
    setError('');
    void requestJson<History>(`/employees/${employeeId}/profile-history?page=${page}&limit=20`)
      .then((value) => {
        if (current) setData(value);
      })
      .catch((failure) => {
        if (current) setError(failure instanceof Error ? failure.message : 'Không tải được lịch sử.');
      });
    return () => {
      current = false;
    };
  }, [employeeId, page, message]);

  return (
    <section
      aria-label="Lịch sử thông tin thường"
      style={{
        marginTop: '14px',
        padding: '14px',
        borderRadius: '10px',
        background: 'rgba(15, 23, 42, 0.45)',
        border: '1px solid rgba(255,255,255,0.07)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <h4 style={{ margin: 0, fontSize: '13px', fontWeight: 700, color: '#e2e8f0' }}>
          📜 Lịch sử cập nhật hồ sơ HR
        </h4>
        <span style={{ fontSize: '11px', color: '#94a3b8' }}>Audit Log nội bộ</span>
      </div>
      {error && <p role="alert" style={{ color: '#f87171', fontSize: '12px' }}>{error}</p>}
      {!data ? (
        <p role="status" style={{ fontSize: '12px', color: '#94a3b8' }}>Đang tải lịch sử…</p>
      ) : (
        <>
          {!data.items.length ? (
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0' }}>
              Chưa có cập nhật thông tin thường được ghi nhận.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '10px' }}>
              {data.items.map((item, index) => (
                <article
                  key={item.id || index}
                  style={{
                    padding: '10px 12px',
                    borderRadius: '8px',
                    background: 'rgba(255,255,255,0.03)',
                    borderLeft: '3px solid #3b82f6',
                    fontSize: '12px',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#94a3b8', marginBottom: '4px' }}>
                    <strong style={{ color: '#e2e8f0' }}>{item.type}</strong>
                    <span>{new Date(item.at).toLocaleString('vi-VN')}</span>
                  </div>
                  {item.reason && <div style={{ color: '#cbd5e1', marginBottom: '4px' }}>Lý do: {item.reason}</div>}
                  <div style={{ display: 'grid', gap: '2px', fontSize: '11px', color: '#94a3b8' }}>
                    <div>Trước: <span style={{ color: '#cbd5e1' }}>{formatSnapshot(item.before)}</span></div>
                    <div>Sau: <span style={{ color: '#34d399' }}>{formatSnapshot(item.after)}</span></div>
                  </div>
                </article>
              ))}
            </div>
          )}
          {(page > 1 || data.paging.hasNext) && (
            <nav aria-label="Phân trang lịch sử hồ sơ" style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px' }}>
              <button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Trang trước</button>
              <span>Trang {page}</span>
              <button className="btn" disabled={!data.paging.hasNext} onClick={() => setPage(page + 1)}>Trang sau</button>
            </nav>
          )}
        </>
      )}

      {can('employees.update_other') && (
        <form
          style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.07)', display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px' }}
          onSubmit={(event) => {
            event.preventDefault();
            if (busy || !hiredAt) return;
            setBusy(true);
            setError('');
            void createProfileChangeRequest(employeeId, {
              targetFields: { hiredAt: new Date(hiredAt + 'T00:00:00+07:00').toISOString() },
            })
              .then(() => {
                setMessage('Đã gửi đề nghị ngày vào làm; HR độc lập phải duyệt.');
                setHiredAt('');
              })
              .catch((failure) => setError(failure instanceof Error ? failure.message : 'Chưa gửi được.'))
              .finally(() => setBusy(false));
          }}
        >
          <label className="field" style={{ flex: '1 1 180px', margin: 0 }}>
            <span style={{ fontSize: '12px', color: '#cbd5e1' }}>Đề nghị điều chỉnh ngày vào làm</span>
            <input
              className="input"
              type="date"
              required
              disabled={busy}
              value={hiredAt}
              onChange={(event) => setHiredAt(event.target.value)}
            />
          </label>
          <button className="btn" disabled={busy}>Gửi đề nghị ngày vào làm</button>
          {message && <p role="status" style={{ width: '100%', margin: 0, fontSize: '12px', color: '#34d399' }}>{message}</p>}
        </form>
      )}
    </section>
  );
}

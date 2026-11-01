import { useEffect, useState } from 'react';
import { AuthorizationSummarySchema, type AuthorizationSummary } from '@hr-blockbot/contracts';
import { fetchMe } from '../services/api';
import { useAuth } from '../context/AuthContext';

/** Diagnostic only: never use a role label or this summary to authorize a write. */
export function AuthorizationStatus() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = useState<AuthorizationSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let current = true;
    setSummary(null); setError('');
    void fetchMe().then((me) => {
      if (!current) return;
      const parsed = AuthorizationSummarySchema.safeParse(me.authorization);
      if (parsed.success) setSummary(parsed.data);
      else setError('Máy chủ chưa cung cấp thông tin cấp quyền mới.');
    }).catch(() => { if (current) setError('Chưa tải được thông tin cấp quyền.'); });
    return () => { current = false; };
  }, [user?.id, accessToken]);
  return <section className="card" aria-label="Thông tin cấp quyền" style={{ padding: 18, overflowWrap: 'anywhere' }}>
    <h3>Thông tin cấp quyền</h3>
    {error ? <p role="status">{error}</p> : !summary ? <p role="status">Đang tải quyền của phiên hiện tại…</p> : <>
      <p>Profile phần mềm: <strong>{summary.profile ?? 'Chưa được cấp'}</strong>. Chức danh không tự cấp quyền truy cập.</p>
      {summary.enforcement === 'FOUNDATION_ONLY' && <p role="status">Hệ thống quyền mới đang được tích hợp. Thông tin dưới đây chưa thay thế toàn bộ kiểm quyền CRM hiện tại.</p>}
      {summary.enforcement === 'MIGRATING' && <p role="status">Các API đã chuyển đổi sử dụng quyền V1. Toàn bộ hệ thống vẫn đang tích hợp và kiểm thử; chưa nghiệm thu Authorization V1.</p>}
      <details><summary>Phạm vi và hiệu lực được cấp ({summary.grants.length})</summary>
        {!summary.grants.length ? <p>Chưa có phân công quyền tường minh. Không suy ra phạm vi từ tên phòng ban hoặc chức danh.</p> :
          <ul>{summary.grants.map((grant) => <li key={grant.id}>
            {grant.scope.kind} — {grant.scope.storeIds.length} cửa hàng, {grant.scope.regionIds.length} khu vực,
            {' '}{grant.scope.reportingEmployeeIds.length} quan hệ quản lý.
            <br />Từ {new Date(grant.validFrom).toLocaleString('vi-VN')} đến {grant.validUntil ? new Date(grant.validUntil).toLocaleString('vi-VN') : 'khi thu hồi'}
            {grant.revokedAt ? ' — đã thu hồi' : ''}.
          </li>)}</ul>}
      </details>
      <p>{summary.pendingCapabilities.length} capability đang chờ duyệt chính sách; các quyền này bị từ chối trong bộ kiểm quyền mới.</p>
    </>}
  </section>;
}

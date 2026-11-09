import { useEffect, useState } from 'react';
import { requestJson } from '../services/api';

type Manager = { employeeId: string; fullName: string; employeeCode: string };
type ManagerPage = { items: Manager[]; defaultManager: Manager | null; paging: { hasNext: boolean } };

export function InitialManagerPicker({ storeId, value, onChange, onReady, busy }: {
  storeId: string;
  value: string;
  onChange: (id: string) => void;
  onReady: (storeId: string) => void;
  busy: boolean;
}) {
  const [items, setItems] = useState<Manager[]>([]);
  const [primary, setPrimary] = useState('');
  const [page, setPage] = useState(1);
  const [loadedPage, setLoadedPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void requestJson<ManagerPage>(`/initial-reporting/managers?storeId=${storeId}&page=${page}&limit=20`, { signal: controller.signal })
      .then(result => {
        if (controller.signal.aborted) return;
        setItems(previous => {
          const candidates = page === 1 ? [] : previous;
          return [...new Map([...candidates, ...(result.defaultManager ? [result.defaultManager] : []), ...result.items]
            .map(item => [item.employeeId, item])).values()];
        });
        if (page === 1) {
          const id = result.defaultManager?.employeeId ?? '';
          setPrimary(id);
          onChange(id);
        }
        setHasNext(result.paging.hasNext);
      }).catch(() => {
        if (!controller.signal.aborted) setError('Chưa tải được danh sách quản lý. Bạn có thể bổ sung sau trong mục Quản lý trực tiếp.');
      }).finally(() => {
        if (!controller.signal.aborted) {
          setLoadedPage(page);
          if (page === 1) onReady(storeId);
        }
      });
    return () => controller.abort();
  }, [storeId, page, onChange, onReady]);

  return <>
    <label className="field">Quản lý trực tiếp
      <select className="input" aria-label="Quản lý trực tiếp" value={value} onChange={event => onChange(event.target.value)}
        disabled={busy || loadedPage === 0}>
        <option value="">{loadedPage === 0 ? 'Đang tìm quản lý…' : 'Chưa chọn quản lý'}</option>
        {items.map(manager => <option key={manager.employeeId} value={manager.employeeId}>
          {manager.fullName} · {manager.employeeCode}{manager.employeeId === primary ? ' (SM chính)' : ''}
        </option>)}
      </select>
    </label>
    {hasNext && <button type="button" className="btn" disabled={busy || page !== loadedPage}
      onClick={() => setPage(current => current + 1)}>Tải thêm quản lý</button>}
    {error ? <p role="status">{error}</p> : loadedPage > 0 && <p>
      {primary ? 'Đã điền SM chính của cửa hàng. Bạn có thể chọn quản lý khác nếu cần.'
        : 'Chưa xác định được một SM chính. Bạn có thể chọn quản lý hợp lệ hoặc bổ sung sau.'}
      {' '}Cấp trên duyệt quan hệ quản lý sau khi HR duyệt tiếp nhận.
    </p>}
  </>;
}

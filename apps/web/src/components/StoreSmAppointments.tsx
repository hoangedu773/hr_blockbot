import { useEffect, useState } from 'react';
import type { SmAppointment } from '@hr-blockbot/contracts';
import { useAuthorization } from '../context/useAuthorization';
import { fetchStoreSmAppointments } from '../services/api';
import { SM_POSITION_LABELS } from './SmAppointments';

type Page = { items: (Pick<SmAppointment, 'id' | 'kind' | 'validFrom' | 'validUntil' | 'evidenceRef' | 'basis' | 'approvedBy'> & { fullName: string })[]; paging: { hasNext: boolean } };
export function StoreSmAppointments({ storeId }: { storeId: string }) {
  const { can } = useAuthorization(), permitted = can('stores.read') && can('employees.read_operational');
  const [data, setData] = useState<Page | null>(null), [page, setPage] = useState(1), [error, setError] = useState('');
  useEffect(() => { if (!permitted) return; let current = true; setData(null); setError('');
    void fetchStoreSmAppointments<Page>(storeId, page).then(value => { if (current) setData(value); }).catch(e => { if (current) setError(e instanceof Error ? e.message : 'Không tải được phân công.'); });
    return () => { current = false; };
  }, [storeId, page, permitted]);
  if (!permitted) return null;
  return <section aria-label="Vị trí SM theo quyết định" className="rounded-xl border border-border p-3.5 text-xs space-y-3"><h3 className="font-semibold">Phân công SM đã xác nhận</h3><p>Phân biệt SM cửa hàng, SM giám sát và thay tạm theo hồ sơ; quyền thực hiện vẫn do grants và quan hệ quản lý quyết định.</p>
    {error ? <p role="alert">{error}</p> : !data ? <p role="status">Đang tải phân công…</p> : <>{!data.items.length && <p>Chưa có hồ sơ phân công đang hiệu lực. Người phụ trách ở trên lấy từ quan hệ quản lý, chưa phải quyết định bổ nhiệm.</p>}
      {data.items.map(row => <article key={row.id}><h4>{SM_POSITION_LABELS[row.kind]}</h4><p>{row.fullName}</p><p>{new Date(row.validFrom).toLocaleDateString('vi-VN')} → {row.validUntil ? new Date(row.validUntil).toLocaleDateString('vi-VN') : 'Chưa ấn định kết thúc'}</p><p>Căn cứ: {row.evidenceRef} · {row.basis === 'SIMULATION_APPROVED' ? 'Mô phỏng được duyệt' : 'Văn bản phân công'}</p><p>Người xác nhận: {row.approvedBy}</p></article>)}
      {(page > 1 || data.paging.hasNext) && <nav aria-label="Phân trang vị trí SM cửa hàng"><button className="btn" disabled={page === 1} onClick={() => setPage(page - 1)}>Trang trước</button><button className="btn" disabled={!data.paging.hasNext} onClick={() => setPage(page + 1)}>Trang sau</button></nav>}</>}
  </section>;
}

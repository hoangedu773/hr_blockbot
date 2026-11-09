import { useEffect, useState } from 'react';
import type { StoreManager, StoreSummary } from '@hr-blockbot/contracts';
import { fetchStores } from '../services/api';

const roleLabels: Record<NonNullable<StoreManager['role']>, string> = {
  am: 'AM — Quản lý khu vực', sam: 'SAM — Quản lý khu vực cấp cao',
  om: 'OM — Quản lý vùng', aom: 'AOM — Trợ lý OM', sm: 'SM — Cửa hàng trưởng',
  ptch: 'PTCH — Phụ trách cửa hàng', unknown: 'Chưa xác minh chức danh',
};
type ManagerRow = { employeeId: string; fullName: string; role: keyof typeof roleLabels; stores: string[] };

export function ScopedManagerList({ initialRole }: { initialRole: string }) {
  const [stores, setStores] = useState<StoreSummary[]>([]);
  const [role, setRole] = useState(initialRole);
  const [storeId, setStoreId] = useState('');
  const [search, setSearch] = useState('');
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    async function load() {
      const first = await fetchStores({ limit: 100 });
      const rows = [...first.items];
      for (let page = 2; active && page <= first.paging.totalPages; page++) {
        rows.push(...(await fetchStores({ page, limit: 100 })).items);
      }
      if (active) setStores(rows);
    }
    void load().catch(() => { if (active) setError('Chưa tải được phân công quản lý. Hãy thử lại.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload]);

  const byEmployee = new Map<string, ManagerRow>();
  const query = search.trim().normalize('NFC').toLocaleLowerCase('vi');
  for (const store of stores) {
    if (storeId && store.id !== storeId) continue;
    for (const manager of store.managers ?? []) {
      const managerRole = manager.role ?? 'unknown';
      if (role && managerRole !== role) continue;
      if (!manager.fullName.normalize('NFC').toLocaleLowerCase('vi').includes(query)) continue;
      const row = byEmployee.get(manager.employeeId) ?? {
        employeeId: manager.employeeId, fullName: manager.fullName, role: managerRole, stores: [],
      };
      row.stores.push(store.name);
      byEmployee.set(manager.employeeId, row);
    }
  }
  const rows = [...byEmployee.values()].sort((a, b) => a.fullName.localeCompare(b.fullName, 'vi'));

  return <section className="crm-workspace" aria-label="Quản lý theo phạm vi">
    <header className="crm-work-heading">
      <div><p className="crm-work-eyebrow">DỮ LIỆU NHÂN SỰ</p><h2>Quản lý theo phạm vi</h2>
        <p>Hiển thị quản lý đang hoạt động có phân công còn hiệu lực tại các cửa hàng bạn được phép xem.</p></div>
      <button type="button" className="btn" onClick={() => setReload(value => value + 1)} disabled={loading}>Làm mới</button>
    </header>
    <div className="crm-work-toolbar">
      <label className="field">Tìm quản lý<input type="search" className="input" maxLength={100} value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label className="field">Chức danh quản lý<select aria-label="Chức danh quản lý" className="input" value={role} onChange={event => setRole(event.target.value)}>
        <option value="">Tất cả chức danh quản lý</option>
        {Object.entries(roleLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></label>
      <label className="field">Cửa hàng phụ trách<select aria-label="Cửa hàng phụ trách" className="input" value={storeId} onChange={event => setStoreId(event.target.value)}>
        <option value="">Tất cả cửa hàng được cấp</option>
        {stores.map(store => <option key={store.id} value={store.id}>{store.name}</option>)}
      </select></label>
      {(role || storeId || search) && <button type="button" className="btn" onClick={() => { setRole(''); setStoreId(''); setSearch(''); }}>Xóa bộ lọc</button>}
    </div>
    {loading ? <p role="status">Đang tải phân công quản lý…</p> : error ? <p role="alert">{error}</p> : <>
      <p role="status" className="crm-work-count">{rows.length} quản lý phù hợp</p>
      {rows.length ? <div className="crm-work-table-wrap"><table className="table crm-work-table">
        <caption className="sr-only">Quản lý và cửa hàng phụ trách</caption>
        <thead><tr><th>Họ tên</th><th>Chức danh</th><th>Cửa hàng phụ trách</th></tr></thead>
        <tbody>{rows.map(row => <tr key={row.employeeId}><td>{row.fullName}</td><td>{roleLabels[row.role]}</td>
          <td><ul>{row.stores.map((name, index) => <li key={index}>{name}</li>)}</ul></td></tr>)}</tbody>
      </table></div> : <p>Không có phân công phù hợp trong phạm vi được cấp.</p>}
    </>}
  </section>;
}

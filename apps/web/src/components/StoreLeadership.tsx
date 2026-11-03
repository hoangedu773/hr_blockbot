import type { StoreManager, StoreSummary } from '@hr-blockbot/contracts';

export function storeManagerText(store: StoreSummary): string {
  if (store.storeManagerStatus === 'identified' && store.managerName) return store.managerName;
  return store.storeManagerStatus === 'ambiguous'
    ? 'Chưa xác định SM phụ trách chính'
    : 'Chưa xác định cửa hàng trưởng';
}

const ROLE_LABELS: Record<string, string> = {
  am: 'Quản lý khu vực · AM', sam: 'Quản lý khu vực cấp cao · SAM',
  om: 'Quản lý vận hành · OM', aom: 'Quản lý vận hành · AOM',
  ptch: 'Phụ trách cửa hàng · PTCH', unknown: 'Vai trò chưa xác định',
};

function managerLabel(manager: StoreManager): string {
  if (manager.role === 'sm') {
    if (manager.assignmentKind === 'cover') return 'SM kiêm nhiệm';
    if (manager.assignmentKind === 'home') return 'SM có quan hệ quản lý';
    return 'SM · chưa xác định hình thức phụ trách';
  }
  return ROLE_LABELS[manager.role ?? 'unknown'] ?? ROLE_LABELS.unknown;
}

export function StoreLeadership({ store }: { store: StoreSummary }) {
  const otherManagers = (store.managers ?? []).filter((manager) =>
    !(store.storeManagerStatus === 'identified' && manager.employeeId === store.managerEmployeeId));
  return <section aria-label="Phân công quản lý" className="rounded-xl border border-border bg-background/80 p-3.5">
    <h3 className="text-xs font-semibold mb-3">Người phụ trách</h3>
    <dl className="space-y-3 text-xs">
      <div>
        <dt className="text-muted-foreground">Cửa hàng trưởng · SM</dt>
        <dd className="font-medium mt-1">{storeManagerText(store)}</dd>
      </div>
      {otherManagers.map((manager) => <div key={manager.employeeId}>
        <dt className="text-muted-foreground">{managerLabel(manager)}</dt>
        <dd className="font-medium mt-1">{manager.fullName}</dd>
        {manager.relationValidUntil && <dd className="text-muted-foreground mt-1">
          Quan hệ quản lý đến {new Date(manager.relationValidUntil).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
        </dd>}
      </div>)}
    </dl>
  </section>;
}

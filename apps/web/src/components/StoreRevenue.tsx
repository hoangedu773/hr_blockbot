import { useEffect, useState } from 'react';
import type { DashboardRevenue } from '@hr-blockbot/contracts';
import { fetchStoreRevenue } from '../services/api';
import { revenueMoney, revenueCaption } from '../services/revenue-display';
import { useAuthorization } from '../context/useAuthorization';

export function StoreRevenue({ storeId }: { storeId: string }) {
  const { can } = useAuthorization(), permitted = can('dashboard.read');
  const [data, setData] = useState<DashboardRevenue | null>(null), [error, setError] = useState('');
  useEffect(() => {
    let current = true; setData(null); setError('');
    if (permitted) void fetchStoreRevenue(storeId).then(r => { if (current) setData(r); }).catch(() => { if (current) setError('Chưa tải được doanh thu cửa hàng.'); });
    return () => { current = false; };
  }, [storeId, permitted]);
  if (!permitted) return null;
  return <section aria-label="Doanh thu cửa hàng" className="p-3.5 rounded-xl border border-border bg-background/80">
    <h3 className="text-xs font-semibold text-muted-foreground">Doanh thu tháng này</h3>
    <p className="text-xl font-bold mt-2" data-testid="store-revenue-value">{data?.value != null ? revenueMoney(data.value) : data || error ? '—' : '…'}</p>
    <p className="text-xs text-muted-foreground mt-2" role={error ? 'status' : undefined}>{error || (data ? revenueCaption(data) : 'Đang tải doanh thu…')}</p>
  </section>;
}

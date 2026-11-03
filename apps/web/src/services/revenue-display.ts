import type { DashboardOverview } from '@hr-blockbot/contracts';
export const revenueMoney = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
export function revenueCaption(metric: DashboardOverview['revenue']) {
  if (metric.value === null) return metric.reason || 'Chưa có giao dịch trong tháng này.';
  if (!('period' in metric)) return 'Doanh thu trong tháng này';
  const date = (v: string) => new Date(v).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
  return `${date(metric.period.from)}–${date(metric.period.to)} · ${metric.orderCount} đơn`;
}

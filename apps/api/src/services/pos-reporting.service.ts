import mongoose from 'mongoose';
import { DashboardRevenueSchema } from '@hr-blockbot/contracts';
import { PosOrderModel } from '../models/PosOrder.js';
import { allowedStoreIds, requireCapability, resourceScope } from './authorization-scope.service.js';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';

/** Month-to-date in Vietnam, cutoff is the actual observation time, not month end. */
export function currentMonthPeriod(now = new Date()) {
  if (!Number.isFinite(now.getTime())) throw new Error('Invalid reporting time');
  const vn = new Date(now.getTime() + 7 * 3600000);
  return { from: new Date(Date.UTC(vn.getUTCFullYear(), vn.getUTCMonth(), 1) - 7 * 3600000), to: now };
}
export async function scopedRevenueMetric(user: AuthenticatedUser, period = currentMonthPeriod(), selectedStoreId?: string) {
  requireCapability(user, 'dashboard.read');
  if (selectedStoreId) requireCapability(user, 'dashboard.read', resourceScope(user, { storeId: selectedStoreId, storeMappingRef: 'pos-canonical' }));
  const ids = allowedStoreIds(user, 'dashboard.read').filter(id => {
    if (selectedStoreId && id !== selectedStoreId) return false;
    try { requireCapability(user, 'dashboard.read', resourceScope(user, { storeId: id, storeMappingRef: 'pos-canonical' })); return true; } catch { return false; }
  });
  const common = { period: { from: period.from.toISOString(), to: period.to.toISOString(), timezone: 'Asia/Ho_Chi_Minh' as const }, asOf: period.to.toISOString() };
  const match = {
    storeId: { $in: ids.map(id => new mongoose.Types.ObjectId(id)) }, ledgerVersion: 1,
    orderedAt: { $gte: period.from, $lte: period.to }, status: { $in: ['COMPLETED', 'REFUNDED', 'CANCELLED'] },
  };
  // Never add demo sales to live sales. Live data takes precedence across this requested scope.
  const live = await PosOrderModel.exists({ ...match, source: { $in: ['pos_api', 'pos_export'] } });
  const source = live ? { $in: ['pos_api', 'pos_export'] } : 'demo';
  const [summary] = await PosOrderModel.aggregate<{ total: number; count: number; invalid: number }>([
    { $match: { ...match, source } },
    { $group: { _id: null,
      total: { $sum: { $cond: [{ $in: ['$status', ['COMPLETED', 'REFUNDED']] }, '$netRevenueVnd', 0] } },
      count: { $sum: { $cond: [{ $in: ['$status', ['COMPLETED', 'REFUNDED']] }, 1, 0] } },
      invalid: { $sum: { $cond: [{ $and: [
        { $isNumber: '$netRevenueVnd' }, { $isNumber: '$subtotalVnd' }, { $isNumber: '$discountVnd' }, { $isNumber: '$refundVnd' },
        { $gte: ['$netRevenueVnd', 0] }, { $gte: ['$discountVnd', 0] }, { $gte: ['$refundVnd', 0] },
        { $gte: ['$subtotalVnd', { $add: ['$discountVnd', '$refundVnd'] }] },
        ...['netRevenueVnd', 'subtotalVnd', 'discountVnd', 'refundVnd'].map(field => ({ $eq: [`$${field}`, { $trunc: { $convert: { input: `$${field}`, to: 'double', onError: -1, onNull: -1 } } }] })),
        { $or: [{ $ne: ['$status', 'REFUNDED'] }, { $eq: ['$refundVnd', { $subtract: ['$subtotalVnd', '$discountVnd'] }] }] },
        { $eq: ['$netRevenueVnd', { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 0, { $subtract: [{ $subtract: ['$subtotalVnd', '$discountVnd'] }, '$refundVnd'] }] }] },
      ] }, 0, 1] } },
    } },
  ]);
  if (summary?.invalid || summary && (!Number.isSafeInteger(summary.total) || summary.total < 0))
    return DashboardRevenueSchema.parse({ ...common, value: null, source: 'none', dataKind: 'none', orderCount: 0, reason: 'Số liệu POS cần đối chiếu trước khi tổng hợp.' });
  if (!summary) return DashboardRevenueSchema.parse({ ...common, value: null, source: 'none', dataKind: 'none', orderCount: 0, reason: 'Chưa có giao dịch POS trong tháng này.' });
  return DashboardRevenueSchema.parse({ ...common, value: summary.total, reason: null, source: 'pos_orders', orderCount: summary.count, dataKind: live ? 'live' : 'demo' });
}

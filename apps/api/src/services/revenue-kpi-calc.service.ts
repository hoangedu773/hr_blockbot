import mongoose from 'mongoose';
import { RevenueKpiMonthSchema, type RevenueKpiPolicy, type RevenueKpiAssignment } from '@hr-blockbot/contracts';
import { PosOrderModel } from '../models/PosOrder.js';
import { WorkflowError } from './project-workflow.service.js';
export const round2 = (n: number) => Math.round(n * 100) / 100;
export function periodRangeVN(period: string) {
  RevenueKpiMonthSchema.parse(period); const [y, m] = period.split('-').map(Number);
  return { start: new Date(Date.UTC(y, m - 1, 1) - 7 * 3600000), end: new Date(Date.UTC(y, m, 1) - 7 * 3600000) };
}
export function priorMonth(period: string, steps = 1) {
  RevenueKpiMonthSchema.parse(period); const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 - steps, 1)).toISOString().slice(0, 7);
}
export function addWorkingDays(now: Date, days: number) {
  const date = new Date(now.getTime() + 7 * 3600000);
  for (let i = 0; i < days;) { date.setUTCDate(date.getUTCDate() + 1); if (![0, 6].includes(date.getUTCDay())) i++; }
  return new Date(date.getTime() - 7 * 3600000);
}
export async function computeStoreRevenue(storeId: string, period: string, policy: Pick<RevenueKpiPolicy, 'allowDemoData'>, now = new Date()) {
  const { start, end } = periodRangeVN(period);
  const base = { storeId: new mongoose.Types.ObjectId(storeId), orderedAt: { $gte: start, $lt: new Date(Math.min(end.getTime(), now.getTime() + 1)) }, ledgerVersion: 1, status: { $in: ['COMPLETED', 'REFUNDED'] } };
  const live = await PosOrderModel.exists({ ...base, source: { $in: ['pos_api', 'pos_export'] } });
  const source = live ? { $in: ['pos_api', 'pos_export'] } : 'demo';
  const none = { actualRevenueVnd: null as number | null, orderCount: 0, invalidOrderCount: 0, dataKind: 'none' as 'none' | 'demo' | 'live', pending: 'STORE_WITHOUT_DATA' as string | null };
  if (!live && !policy.allowDemoData) return none;
  const valid = { $and: [
    ...['netRevenueVnd', 'subtotalVnd', 'discountVnd', 'refundVnd'].flatMap(f => [{ $isNumber: '$' + f }, { $gte: ['$' + f, 0] }, { $lte: ['$' + f, Number.MAX_SAFE_INTEGER] },
      { $eq: ['$' + f, { $trunc: { $convert: { input: '$' + f, to: 'double', onError: -1, onNull: -1 } } }] }]),
    { $gte: ['$subtotalVnd', { $add: ['$discountVnd', '$refundVnd'] }] },
    { $eq: ['$netRevenueVnd', { $subtract: [{ $subtract: ['$subtotalVnd', '$discountVnd'] }, '$refundVnd'] }] },
    { $or: [{ $ne: ['$status', 'REFUNDED'] }, { $eq: ['$refundVnd', { $subtract: ['$subtotalVnd', '$discountVnd'] }] }] },
  ] };
  let row: any;
  try { [row] = await PosOrderModel.aggregate([{ $match: { ...base, source } }, { $group: { _id: null, total: { $sum: '$netRevenueVnd' }, orderCount: { $sum: 1 }, invalidOrderCount: { $sum: { $cond: [valid, 0, 1] } } } }]).option({ maxTimeMS: 10000 }); }
  catch { return { ...none, pending: 'INVALID_ORDERS' }; }
  if (!row) return none;
  const invalid = row.invalidOrderCount || (!Number.isSafeInteger(row.total) || row.total < 0 ? 1 : 0);
  return { actualRevenueVnd: invalid ? null : row.total as number, orderCount: row.orderCount as number, invalidOrderCount: invalid as number, dataKind: live ? 'live' as const : 'demo' as const, pending: invalid ? 'INVALID_ORDERS' : null };
}
export function combineRevenueResults(stores: any[], unitType: 'STORE' | 'AREA', threshold: number) {
  const pendingReasons: string[] = [];
  if (!stores.length) pendingReasons.push('NO_VALID_STORES');
  for (const s of stores) {
    if (!Number.isSafeInteger(s.targetVnd) || s.targetVnd <= 0) pendingReasons.push('INVALID_TARGET');
    if (s.actualRevenueVnd === null || s.dataKind === 'none') pendingReasons.push(s.invalidOrderCount ? 'INVALID_ORDERS' : 'STORE_WITHOUT_DATA');
  }
  const kinds = new Set(stores.filter(s => s.dataKind !== 'none').map(s => s.dataKind));
  if (kinds.size > 1) pendingReasons.push('MIXED_DATA_SOURCES');
  const total = stores.reduce((n, s) => n + (s.actualRevenueVnd ?? 0), 0), targetVnd = stores.reduce((n, s) => n + s.targetVnd, 0);
  if (!Number.isSafeInteger(total) || !Number.isSafeInteger(targetVnd)) pendingReasons.push('INVALID_ORDERS');
  const valid = stores.filter(s => s.targetVnd > 0 && s.actualRevenueVnd !== null && s.dataKind !== 'none' && !s.invalidOrderCount);
  const underperformingStoreCount = valid.filter(s => round2(s.actualRevenueVnd / s.targetVnd * 100) < 100 - 1e-9).length;
  const rate = valid.length ? round2(underperformingStoreCount / valid.length * 100) : null;
  const pending = pendingReasons.length > 0, achievementPercent = pending ? null : round2(total / targetVnd * 100);
  return { actualRevenueVnd: pending ? null : total, achievementPercent, achieved: pending ? null : achievementPercent! >= 100 - 1e-9 && (unitType === 'STORE' || rate! <= threshold + 1e-9),
    underperformingStoreCount: pending ? null : underperformingStoreCount, underperformingStoreRatePercent: pending ? null : rate,
    dataKind: kinds.size > 1 ? 'mixed' : kinds.size ? [...kinds][0] : 'none', pendingReasons: [...new Set(pendingReasons)],
    orderCount: stores.reduce((n, s) => n + s.orderCount, 0), invalidOrderCount: stores.reduce((n, s) => n + s.invalidOrderCount, 0) };
}
export async function calculateRevenueKpi(assignment: RevenueKpiAssignment, policy: RevenueKpiPolicy, now = new Date()) {
  const stores = [];
  for (const s of assignment.stores) {
    const r = await computeStoreRevenue(s.storeId, assignment.period, policy, now);
    const achievementPercent = r.actualRevenueVnd === null ? null : round2(r.actualRevenueVnd / s.targetVnd * 100);
    stores.push({ storeId: s.storeId, storeName: s.storeName, targetVnd: s.targetVnd, actualRevenueVnd: r.actualRevenueVnd, achievementPercent, achieved: achievementPercent === null ? null : achievementPercent >= 100 - 1e-9, orderCount: r.orderCount, invalidOrderCount: r.invalidOrderCount, dataKind: r.dataKind });
  }
  return { stores, ...combineRevenueResults(stores, assignment.unitType, policy.underperformingRateThresholdPercent) };
}
export function targetFromGrowth(base: number | null, growth: number) {
  const value = base === null ? NaN : Math.round(base * (1 + growth / 100));
  if (!Number.isSafeInteger(value) || value <= 0) throw new WorkflowError(409, 'REVENUE_KPI_TARGET_INVALID', 'Thiếu doanh thu tháng gốc; HR cần nhập mục tiêu tuyệt đối.');
  return value;
}

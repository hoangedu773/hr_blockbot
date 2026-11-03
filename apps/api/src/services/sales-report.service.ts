import mongoose from 'mongoose';
import { SalesReportSchema, type SalesReportQuery } from '@hr-blockbot/contracts';
import { PosOrderModel } from '../models/PosOrder.js';
import { StoreModel } from '../models/Store.js';
import type { AuthenticatedUser } from '../middlewares/auth.middleware.js';
import { allowedStoreIds, requireCapability, resourceScope } from './authorization-scope.service.js';
import { WorkflowError } from './project-workflow.service.js';

const DAY = 86400000, VN = 7 * 3600000;
const dayString = (d: Date) => new Date(d.getTime() + VN).toISOString().slice(0, 10);
export function salesPeriod(from: string, to: string, now = new Date(), preset: SalesReportQuery['preset'] = 'custom') {
  const parse = (s: string) => {
    const t = Date.parse(s + 'T00:00:00+07:00');
    if (!/^20\d{2}-\d{2}-\d{2}$/.test(s) || !Number.isFinite(t) || dayString(new Date(t)) !== s)
      throw new WorkflowError(400, 'VALIDATION_FAILED', 'Ngày báo cáo không hợp lệ.');
    return t;
  };
  const start = parse(from), endDay = parse(to), days = (endDay - start) / DAY + 1;
  if (days < 1 || days > 93 || to > dayString(now)) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Chọn tối đa 93 ngày, đến hôm nay.');
  const end = Math.min(endDay + DAY, now.getTime() + 1);
  let previousStart = start - days * DAY, previousEnd = end - days * DAY;
  if (preset === 'week') {
    if (days > 7 || new Date(start + VN).getUTCDay() !== 1 || to !== dayString(now)) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Khoảng tuần báo cáo không hợp lệ.');
    previousStart = start - 7 * DAY; previousEnd = end - 7 * DAY;
  }
  if (preset === 'month') {
    if (!from.endsWith('-01') || from.slice(0, 7) !== to.slice(0, 7) || to !== dayString(now)) throw new WorkflowError(400, 'VALIDATION_FAILED', 'Khoảng tháng báo cáo không hợp lệ.');
    const first = new Date(start + VN), last = new Date(end - 1 + VN);
    const y = first.getUTCFullYear(), m = first.getUTCMonth(), lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
    previousStart = Date.UTC(y, m - 1, 1) - VN;
    previousEnd = Date.UTC(y, m - 1, Math.min(last.getUTCDate(), lastDay), last.getUTCHours(), last.getUTCMinutes(), last.getUTCSeconds(), last.getUTCMilliseconds()) - VN + 1;
  }
  return { start: new Date(start), end: new Date(end), previousStart: new Date(previousStart), previousEnd: new Date(previousEnd) };
}

// Validate raw imported ledger rows before reporting, including the whole selected scope.
// There is no client-selected Mongo field, source, scope or aggregation expression.
const moneyFields = ['subtotalVnd', 'discountVnd', 'refundVnd', 'netRevenueVnd'];
const validLedger = { $and: [
  ...moneyFields.flatMap(f => [{ $isNumber: '$' + f }, { $gte: ['$' + f, 0] }, { $lte: ['$' + f, Number.MAX_SAFE_INTEGER] },
    { $eq: ['$' + f, { $trunc: { $convert: { input: '$' + f, to: 'double', onError: -1, onNull: -1 } } }] }]),
  { $gte: ['$subtotalVnd', { $add: ['$discountVnd', '$refundVnd'] }] },
  { $eq: ['$netRevenueVnd', { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 0, { $subtract: [{ $subtract: ['$subtotalVnd', '$discountVnd'] }, '$refundVnd'] }] }] },
  { $or: [{ $ne: ['$status', 'REFUNDED'] }, { $eq: ['$refundVnd', { $subtract: ['$subtotalVnd', '$discountVnd'] }] }] },
  { $in: ['$channel', ['IN_STORE', 'APP', 'SHOPEEFOOD', 'PARTNER']] },
  { $in: ['$paymentMethod', ['CASH', 'CARD', 'MOMO', 'ZALOPAY', 'VNPAY']] },
  { $isArray: '$items' }, { $gt: [{ $size: { $ifNull: ['$items', []] } }, 0] },
  { $lte: [{ $size: { $ifNull: ['$items', []] } }, 100] },
  { $eq: [{ $sum: '$items.lineTotalVnd' }, '$subtotalVnd'] },
  { $allElementsTrue: [{ $map: { input: { $ifNull: ['$items', []] }, as: 'item', in: { $and: [
    { $eq: [{ $type: '$$item.productName' }, 'string'] },
    ...['quantity', 'unitPriceVnd', 'lineTotalVnd'].flatMap(f => [{ $isNumber: '$$item.' + f }, { $gte: ['$$item.' + f, f === 'quantity' ? 1 : 0] },
      { $eq: ['$$item.' + f, { $trunc: { $convert: { input: '$$item.' + f, to: 'double', onError: -1, onNull: -1 } } }] }]),
    { $eq: ['$$item.lineTotalVnd', { $multiply: ['$$item.quantity', '$$item.unitPriceVnd'] }] },
  ] } } }] },
] };
const sold = { $ne: ['$status', 'CANCELLED'] };
const group = { _id: null, totalOrders: { $sum: 1 }, cancelledOrders: { $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 1, 0] } },
  externalOrders: { $sum: { $cond: [{ $ne: ['$channel', 'IN_STORE'] }, 1, 0] } },
  salesOrders: { $sum: { $cond: [sold, 1, 0] } }, revenueVnd: { $sum: { $cond: [sold, '$netRevenueVnd', 0] } },
  discountVnd: { $sum: { $cond: [sold, '$discountVnd', 0] } }, refundVnd: { $sum: { $cond: [sold, '$refundVnd', 0] } },
  itemCount: { $sum: { $cond: [sold, { $sum: '$items.quantity' }, 0] } } };
const metric = (v: any) => v ? { totalOrders: v.totalOrders, cancelledOrders: v.cancelledOrders, externalOrders: v.externalOrders,
  salesOrders: v.salesOrders, revenueVnd: v.revenueVnd, discountVnd: v.discountVnd, refundVnd: v.refundVnd, itemCount: v.itemCount,
  averageOrderVnd: v.salesOrders ? Math.round(v.revenueVnd / v.salesOrders) : null,
  averageItems: v.salesOrders ? Math.round(v.itemCount / v.salesOrders * 100) / 100 : null } : null;
export async function salesReport(user: AuthenticatedUser, query: SalesReportQuery, now = new Date()) {
  requireCapability(user, 'dashboard.read');
  const scope = (id: string) => resourceScope(user, { storeId: id, storeMappingRef: 'pos-canonical' });
  if (query.storeId) requireCapability(user, 'dashboard.read', scope(query.storeId));
  const ids = allowedStoreIds(user, 'dashboard.read').filter(id => { try { requireCapability(user, 'dashboard.read', scope(id)); return true; } catch { return false; } });
  const period = salesPeriod(query.from, query.to, now, query.preset);
  const stores: any[] = await StoreModel.find({ _id: { $in: ids } }).select('store_name').sort({ store_name: 1, _id: 1 }).lean();
  const selected = query.storeId ? ids.filter(id => id === query.storeId) : ids;
  const base: any = { storeId: { $in: selected.map(id => new mongoose.Types.ObjectId(id)) }, ledgerVersion: 1,
    status: { $in: ['COMPLETED', 'REFUNDED', 'CANCELLED'] } };
  // Fix the source before filters/period comparison: never compare live sales with demo sales.
  const live = await PosOrderModel.exists({ ...base, source: { $in: ['pos_api', 'pos_export'] }, orderedAt: { $gte: period.previousStart, $lt: period.end } });
  base.source = live ? { $in: ['pos_api', 'pos_export'] } : 'demo';
  if (query.channel) base.channel = query.channel;
  if (query.paymentMethod) base.paymentMethod = query.paymentMethod;
  if (query.status) base.status = query.status;
  const aggregate = async (from: Date, to: Date, details: boolean) => {
    const summary = [{ $group: group }];
    const facets: any = { summary, invalid: [{ $match: { $expr: { $not: [validLedger] } } }, { $limit: 1 }, { $count: 'count' }] };
    if (details) Object.assign(facets, {
      hourly: [{ $group: { ...group, _id: { $hour: { date: '$orderedAt', timezone: 'Asia/Ho_Chi_Minh' } } } }, { $sort: { _id: 1 } }],
      channels: [{ $match: { status: { $ne: 'CANCELLED' } } }, { $group: { _id: '$channel', count: { $sum: 1 } } }],
      payments: [{ $match: { status: { $ne: 'CANCELLED' } } }, { $group: { _id: '$paymentMethod', count: { $sum: 1 } } }],
      orders: [{ $sort: { orderedAt: -1, _id: -1 } }, { $skip: (query.page - 1) * 20 }, { $limit: 20 },
        { $project: { orderId: 1, storeId: 1, orderedAt: 1, channel: 1, paymentMethod: 1, status: 1,
          subtotalVnd: 1, discountVnd: 1, refundVnd: 1, netRevenueVnd: 1, 'items.productName': 1, 'items.quantity': 1, 'items.unitPriceVnd': 1, 'items.lineTotalVnd': 1 } }],
    });
    const [r] = await PosOrderModel.aggregate([{ $match: { ...base, orderedAt: { $gte: from, $lt: to } } }, { $facet: facets }]).option({ maxTimeMS: 8000 });
    return r;
  };
  let current: any, previous: any;
  try { [current, previous] = await Promise.all([aggregate(period.start, period.end, true), aggregate(period.previousStart, period.previousEnd, false)]); }
  catch { throw new WorkflowError(503, 'POS_REPORT_UNAVAILABLE', 'Chưa thể tổng hợp dữ liệu POS. Vui lòng thử lại.'); }
  const valid = (v: any) => !v.invalid.length && (!v.summary[0] || Object.values(metric(v.summary[0])!).every(n => n === null || typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= Number.MAX_SAFE_INTEGER));
  const bad = !valid(current), priorValid = valid(previous), summary = bad ? null : metric(current.summary[0]);
  const old = priorValid ? metric(previous.summary[0]) : null;
  const change = (key: 'totalOrders' | 'cancelledOrders' | 'externalOrders' | 'revenueVnd') => summary && old && old[key] > 0 ? Math.round((summary[key] - old[key]) / old[key] * 1000) / 10 : null;
  return SalesReportSchema.parse({
    period: { from: query.from, to: query.to, fromAt: period.start.toISOString(), toAt: new Date(period.end.getTime() - 1).toISOString(), timezone: 'Asia/Ho_Chi_Minh' },
    comparison: { fromAt: period.previousStart.toISOString(), toAt: new Date(period.previousEnd.getTime() - 1).toISOString(), available: !!old && !bad,
      changes: { totalOrders: change('totalOrders'), cancelledOrders: change('cancelledOrders'), externalOrders: change('externalOrders'), revenueVnd: change('revenueVnd') } },
    stores: stores.map(s => ({ id: String(s._id), name: s.store_name || 'Cửa hàng chưa cập nhật tên' })), dataKind: summary ? live ? 'live' : 'demo' : 'none',
    reason: bad ? 'Số liệu POS cần đối chiếu trước khi tổng hợp.' : summary ? null : 'Chưa có đơn hàng trong khoảng thời gian và bộ lọc đã chọn.', asOf: now.toISOString(), summary,
    hourly: summary ? Array.from({ length: 24 }, (_, hour) => { const row = current.hourly.find((h: any) => h._id === hour), m = metric(row);
      return { hour, revenueVnd: m?.revenueVnd ?? 0, orders: m?.totalOrders ?? 0, averageOrderVnd: m?.averageOrderVnd ?? null, averageItems: m?.averageItems ?? null }; }) : [],
    channels: summary ? current.channels.map((c: any) => ({ key: c._id, count: c.count })).sort((a: any, b: any) => b.count - a.count) : [],
    payments: summary ? current.payments.map((c: any) => ({ key: c._id, count: c.count })).sort((a: any, b: any) => b.count - a.count) : [],
    orders: summary ? current.orders.map((o: any) => ({ id: String(o._id), orderId: o.orderId, storeId: String(o.storeId), storeName: stores.find(s => String(s._id) === String(o.storeId))?.store_name ?? 'Cửa hàng',
      orderedAt: o.orderedAt.toISOString(), channel: o.channel, paymentMethod: o.paymentMethod, status: o.status,
      subtotalVnd: o.subtotalVnd, discountVnd: o.discountVnd, refundVnd: o.refundVnd, netRevenueVnd: o.netRevenueVnd,
      items: o.items.map((i: any) => ({ productName: i.productName, quantity: i.quantity, unitPriceVnd: i.unitPriceVnd, lineTotalVnd: i.lineTotalVnd })) })) : [],
    paging: { page: query.page, limit: 20, totalItems: summary?.totalOrders ?? 0, totalPages: summary ? Math.ceil(summary.totalOrders / 20) : 0 },
  });
}

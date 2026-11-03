import mongoose from 'mongoose';
import { revenueSchema } from './RevenueKpiPeriod.js';
const schema = revenueSchema(['assignmentId', 'period', 'unitType', 'storeId', 'areaKey', 'assigneeEmployeeId', 'status', 'targetVnd', 'actualRevenueVnd', 'achievementPercent', 'achieved',
  'underperformingStoreCount', 'underperformingStoreRatePercent', 'stores', 'dataKind', 'orderCount', 'invalidOrderCount', 'pendingReasons', 'missReason', 'computedBy', 'computedAt', 'confirmedBy', 'confirmedAt',
  'version', 'supersedesResultId', 'history', 'createdAt', 'updatedAt'], 'revenue_kpi_results');
schema.index({ assignmentId: 1, version: 1 }, { unique: true });
schema.index({ period: 1, status: 1 });
schema.index({ assigneeEmployeeId: 1, period: 1 });
for (const method of ['updateOne', 'updateMany', 'findOneAndUpdate', 'deleteOne', 'deleteMany', 'findOneAndDelete', 'replaceOne'] as const)
  schema.pre(method as any, function () { throw new Error('Revenue KPI results are append-only'); });
export const RevenueKpiResultModel = mongoose.models.RevenueKpiResult || mongoose.model('RevenueKpiResult', schema);

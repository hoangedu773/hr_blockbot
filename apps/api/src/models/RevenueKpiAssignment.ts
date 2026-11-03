import mongoose from 'mongoose';
import { revenueSchema } from './RevenueKpiPeriod.js';
const schema = revenueSchema(['period', 'unitType', 'storeId', 'areaKey', 'assigneeEmployeeId', 'assigneeRole', 'assigneeName', 'targetMode', 'basePeriod', 'baseRevenueVnd', 'growthPercent', 'targetVnd',
  'stores', 'responsibility', 'status', 'acceptance', 'refusal', 'hrDecision', 'adjustment', 'aiProposal', 'deadlineAt', 'overdue', 'version', 'history', 'createdAt', 'updatedAt'], 'revenue_kpi_assignments');
schema.index({ period: 1, unitType: 1, storeId: 1 }, { unique: true, partialFilterExpression: { unitType: 'STORE' } });
schema.index({ period: 1, unitType: 1, areaKey: 1 }, { unique: true, partialFilterExpression: { unitType: 'AREA' } });
schema.index({ period: 1, assigneeEmployeeId: 1 });
schema.index({ period: 1, status: 1 });
export const RevenueKpiAssignmentModel = mongoose.models.RevenueKpiAssignment || mongoose.model('RevenueKpiAssignment', schema);

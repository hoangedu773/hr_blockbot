import mongoose, { Schema } from 'mongoose';
// Nested structures are validated by strict shared contracts on every read/write.
export function revenueSchema(fields: string[], collection: string) {
  const definition: Record<string, any> = { _id: { type: String, required: true } };
  for (const field of fields) definition[field] = { type: Schema.Types.Mixed, required: false };
  return new Schema(definition, { collection, strict: 'throw', versionKey: false, autoCreate: false, autoIndex: false });
}
const schema = revenueSchema(['period', 'status', 'policy', 'openedBy', 'openedAt', 'closedBy', 'closedAt', 'version', 'history', 'createdAt', 'updatedAt'], 'revenue_kpi_periods');
schema.index({ period: 1 }, { unique: true });
export const RevenueKpiPeriodModel = mongoose.models.RevenueKpiPeriod || mongoose.model('RevenueKpiPeriod', schema);

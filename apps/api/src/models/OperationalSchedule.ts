import mongoose, { Schema } from 'mongoose';

const shift = new Schema({
  storeId: { type: Schema.Types.ObjectId, required: true, index: true },
  code: { type: String, required: true }, name: { type: String, required: true },
  intervals: { type: [Schema.Types.Mixed], required: true }, active: { type: Boolean, required: true },
  version: { type: Number, required: true }, history: { type: [Schema.Types.Mixed], default: [] },
}, { collection: 'operational_shift_definitions', strict: 'throw', timestamps: true });
const week = new Schema({
  storeId: { type: Schema.Types.ObjectId, required: true, index: true }, weekStart: { type: String, required: true, index: true },
  version: { type: Number, required: true }, draft: { type: [Schema.Types.Mixed], default: [] },
  published: { type: [Schema.Types.Mixed], default: [] }, publishedAt: { type: String, default: null },
  requests: { type: [Schema.Types.Mixed], default: [] }, history: { type: [Schema.Types.Mixed], default: [] },
  registrations: { type: [Schema.Types.Mixed], default: undefined },
  deliveredNoticeIds: { type: [String], default: [] },
}, { collection: 'operational_schedule_weeks', strict: 'throw', timestamps: true });
export const OperationalShiftModel = mongoose.models.OperationalShift || mongoose.model('OperationalShift', shift);
export const OperationalWeekModel = mongoose.models.OperationalWeek || mongoose.model('OperationalWeek', week);

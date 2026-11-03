import mongoose, { Schema } from 'mongoose';

// Evidence register only: never consumed by principal/grant/reporting resolution.
const schema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, required: true }, storeId: { type: Schema.Types.ObjectId, required: true },
  clientRequestId: { type: String, required: true }, payloadHash: { type: String, required: true },
  kind: { type: String, enum: ['PRIMARY', 'ADDITIONAL', 'SUPERVISORY', 'TEMPORARY'], required: true },
  status: { type: String, enum: ['PENDING', 'APPROVED', 'REJECTED', 'REVOKED'], required: true },
  validFrom: { type: Date, required: true }, validUntil: { type: Date, default: null },
  evidenceRef: { type: String, required: true }, basis: { type: String, enum: ['SIMULATION_APPROVED', 'DOCUMENTED_ASSIGNMENT'], required: true },
  reason: { type: String, required: true }, replacesAppointmentId: { type: Schema.Types.ObjectId, default: null },
  requestedBy: { type: Schema.Types.ObjectId, required: true }, requesterEmployeeId: { type: Schema.Types.ObjectId, required: true },
  approvedBy: { type: Schema.Types.ObjectId, default: null }, approvedAt: { type: Date, default: null },
  version: { type: Number, min: 1, required: true }, history: { type: [Schema.Types.Mixed], required: true },
}, { collection: 'sm_appointments', strict: 'throw', timestamps: true });
schema.index({ requestedBy: 1, clientRequestId: 1 }, { unique: true });
schema.index({ employeeId: 1, storeId: 1, createdAt: -1 });
schema.index({ storeId: 1, status: 1, validFrom: 1, validUntil: 1 });
export const SmAppointmentModel = mongoose.models.SmAppointment || mongoose.model('SmAppointment', schema);

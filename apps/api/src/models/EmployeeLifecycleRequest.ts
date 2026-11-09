import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  employeeId: { type: Schema.Types.ObjectId, required: true }, openKey: { type: String },
  kind: { type: String, required: true, enum: ["TRANSFER", "EXIT", "REACTIVATE"] },
  sourceStoreId: { type: Schema.Types.ObjectId, required: true }, targetStoreId: { type: Schema.Types.ObjectId, default: null },
  effectiveAt: { type: Date, required: true }, reason: { type: String, required: true }, snapshot: { type: Schema.Types.Mixed, required: true },
  requestedBy: { type: Schema.Types.ObjectId, required: true }, requesterEmployeeId: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, required: true, enum: ["PENDING_REVIEW", "APPROVED", "PENDING_CONFIRMATIONS", "PENDING_EFFECTIVE", "PENDING_HANDOVER", "PENDING_ACTIVATION", "ACTIVATING", "APPLYING", "COMPLETED", "REJECTED"] },
  approvedBy: { type: Schema.Types.ObjectId, default: null }, approvedAt: { type: Date, default: null },
  confirmations: { type: [Schema.Types.Mixed], default: [] }, version: { type: Number, required: true },
  recoveryTokenHash: { type: String }, recoveryExpiresAt: { type: Date }, recoveryPasswordHash: { type: String },
  deliveryState: { type: String, default: "NOT_CONFIGURED", enum: ["NOT_CONFIGURED", "PENDING", "DELIVERED", "FAILED"] },
  history: { type: [Schema.Types.Mixed], default: [] },
  staffingRequestId: { type: Schema.Types.ObjectId, default: null },
}, { collection: "employee_lifecycle_requests", strict: "throw", timestamps: true });
schema.index({ openKey: 1 }, { unique: true, partialFilterExpression: { openKey: { $type: "string" } } });
schema.index({ recoveryTokenHash: 1 }, { unique: true, partialFilterExpression: { recoveryTokenHash: { $type: "string" } } });
schema.index({ sourceStoreId: 1, targetStoreId: 1, createdAt: -1, _id: -1 });
schema.index({ targetStoreId: 1, kind: 1, createdAt: -1, _id: -1 });
export const EmployeeLifecycleRequestModel = mongoose.models.EmployeeLifecycleRequest || mongoose.model("EmployeeLifecycleRequest", schema);

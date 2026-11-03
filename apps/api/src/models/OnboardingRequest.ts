import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  employeeKey: { type: String, required: true, unique: true },
  creationFingerprint: { type: String },
  payload: { type: Schema.Types.Mixed, required: true },
  storeId: { type: Schema.Types.ObjectId, required: true, index: true },
  requestedBy: { type: Schema.Types.ObjectId, required: true }, requesterEmployeeId: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, required: true, enum: ["DRAFT", "PENDING_HR_REVIEW", "REJECTED", "PROVISIONING", "PENDING_ACTIVATION", "ACTIVATING", "ACTIVE"] },
  version: { type: Number, required: true, min: 1 },
  employeeId: { type: Schema.Types.ObjectId, required: true }, userId: { type: Schema.Types.ObjectId, required: true },
  approvedBy: { type: Schema.Types.ObjectId, default: null }, approvedAt: { type: Date, default: null },
  approvalReason: { type: String, default: null },
  activationTokenHash: { type: String }, activationExpiresAt: { type: Date }, activationPasswordHash: { type: String },
  deliveryState: { type: String, enum: ["NOT_CONFIGURED", "PENDING", "DELIVERED", "FAILED"], default: "NOT_CONFIGURED" },
  history: { type: [Schema.Types.Mixed], default: [] },
}, { collection: "onboarding_requests", strict: "throw", timestamps: true });
schema.index({ activationTokenHash: 1 }, { unique: true, partialFilterExpression: { activationTokenHash: { $type: "string" } } });
schema.index({ requestedBy: 1, createdAt: -1, _id: -1 });
schema.index({ storeId: 1, createdAt: -1, _id: -1 });
export const OnboardingRequestModel = mongoose.models.OnboardingRequest || mongoose.model("OnboardingRequest", schema);

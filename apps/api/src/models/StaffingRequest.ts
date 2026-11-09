import mongoose, { Schema } from "mongoose";
// SM headcount request for one canonical store. It never moves people by
// itself: the AM fulfils it with ordinary TRANSFER lifecycle requests that keep
// their own HR approval and source/destination manager confirmations.
const schema = new Schema({
  storeId: { type: Schema.Types.ObjectId, required: true },
  quantity: { type: Number, required: true, min: 1, max: 20 },
  jobTitle: { type: String, default: null, maxlength: 120 },
  neededBy: { type: Date, required: true },
  reason: { type: String, required: true, maxlength: 2000 },
  requestedBy: { type: Schema.Types.ObjectId, required: true }, requesterEmployeeId: { type: Schema.Types.ObjectId, required: true },
  status: { type: String, required: true, enum: ["PENDING_AM", "IN_PROGRESS", "FULFILLED", "REJECTED", "CANCELLED"] },
  handledBy: { type: Schema.Types.ObjectId, default: null }, handlerEmployeeId: { type: Schema.Types.ObjectId, default: null }, handledAt: { type: Date, default: null }, decisionReason: { type: String, default: null, maxlength: 2000 },
  transferRequestIds: { type: [Schema.Types.ObjectId], default: [] },
  version: { type: Number, required: true },
  history: { type: [Schema.Types.Mixed], default: [] },
}, { collection: "staffing_requests", strict: "throw", timestamps: true });
schema.index({ storeId: 1, createdAt: -1, _id: -1 });
schema.index({ requestedBy: 1, createdAt: -1, _id: -1 });
export const StaffingRequestModel = mongoose.models.StaffingRequest || mongoose.model("StaffingRequest", schema);

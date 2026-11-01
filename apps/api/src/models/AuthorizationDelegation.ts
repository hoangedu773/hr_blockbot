import mongoose, { Schema } from "mongoose";
const schema = new Schema({
  delegationId: { type: String, required: true, unique: true },
  sourceGrantId: { type: String, required: true }, delegatorUserId: { type: Schema.Types.ObjectId, required: true },
  recipientUserId: { type: Schema.Types.ObjectId, required: true },
  capabilities: { type: [String], required: true }, scope: { type: Schema.Types.Mixed, required: true },
  validFrom: { type: Date, required: true }, validUntil: { type: Date, required: true },
  reason: { type: String, required: true }, status: { type: String, enum: ["PENDING", "APPROVED", "REJECTED", "REVOKED"], required: true },
  version: { type: Number, required: true }, approvedByUserId: { type: Schema.Types.ObjectId }, approvedAt: { type: Date }, revokedAt: { type: Date, default: null },
  history: { type: [Schema.Types.Mixed], default: [] },
}, { collection: "authorization_delegations", strict: "throw", timestamps: true });
schema.index({ recipientUserId: 1, status: 1, validUntil: 1 });
schema.index({ recipientUserId: 1, createdAt: -1, _id: -1 });
schema.index({ delegatorUserId: 1, createdAt: -1, _id: -1 });
export const AuthorizationDelegationModel = mongoose.models.AuthorizationDelegation || mongoose.model("AuthorizationDelegation", schema);

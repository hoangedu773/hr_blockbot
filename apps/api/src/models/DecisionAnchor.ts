import mongoose, { Schema } from "mongoose";

const schema = new Schema({
  _id: { type: String, required: true }, projectId: { type: String, required: true, index: true },
  eventId: { type: String, required: true }, decisionHash: { type: String, required: true },
  chainId: { type: String, required: true }, registryAddress: { type: String, required: true },
  transactionHash: { type: String, required: true }, status: { type: String, enum: ["PENDING", "VERIFIED"], required: true },
  blockNumber: { type: Number, default: null }, verifiedAt: { type: String, default: null },
}, { collection: "decision_anchors", timestamps: true });
export const DecisionAnchorModel = mongoose.models.DecisionAnchor || mongoose.model("DecisionAnchor", schema);

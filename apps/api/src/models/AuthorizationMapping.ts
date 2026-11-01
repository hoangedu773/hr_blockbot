import mongoose, { Schema } from "mongoose";

const regionSchema = new Schema({
  code: { type: String, required: true, unique: true }, name: { type: String, required: true },
  status: { type: String, enum: ["ACTIVE", "INACTIVE"], required: true }, approvalRef: { type: String, required: true },
  version: { type: Number, required: true, min: 1 },
}, { collection: "authorization_regions", strict: "throw" });
const relationSchema = new Schema({
  managerEmployeeId: { type: Schema.Types.ObjectId, required: true }, employeeId: { type: Schema.Types.ObjectId, required: true },
  storeId: { type: Schema.Types.ObjectId, required: true }, approvalRef: { type: String, required: true },
  validFrom: { type: Date, required: true }, validUntil: { type: Date, default: null }, revokedAt: { type: Date, default: null },
  version: { type: Number, required: true, min: 1 },
}, { collection: "management_relations", strict: "throw" });
relationSchema.index({ managerEmployeeId: 1, storeId: 1, employeeId: 1 });
export const AuthorizationRegionModel = mongoose.models.AuthorizationRegion || mongoose.model("AuthorizationRegion", regionSchema);
export const ManagementRelationModel = mongoose.models.ManagementRelation || mongoose.model("ManagementRelation", relationSchema);

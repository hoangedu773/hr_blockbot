import mongoose, { Schema } from "mongoose";

const departmentSchema = new Schema({
  _id: { type: Schema.Types.Mixed, default: () => new mongoose.Types.ObjectId() },
  name: { type: String }, code: { type: String }, description: { type: String },
  managerId: { type: String, default: null }, version: { type: Number, default: 1 },
  creationKey: { type: String }, history: { type: [Schema.Types.Mixed], default: [] },
}, { collection: "departments", timestamps: true, strict: false, minimize: false });
departmentSchema.index({ creationKey: 1 }, { name: "f1_department_creation_key", unique: true,
  partialFilterExpression: { creationKey: { $type: "string" } } });
export const DepartmentModel = mongoose.models.Department || mongoose.model("Department", departmentSchema);

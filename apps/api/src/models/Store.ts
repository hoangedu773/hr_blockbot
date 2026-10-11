import mongoose, { Schema, Document } from "mongoose";

export interface IStore extends Document {
  store_name: string;
  employee_count: number;
}

const StoreSchema = new Schema<IStore>(
  {
    store_name: { type: String, required: true, unique: true, index: true },
    employee_count: { type: Number, default: 0 },
  },
  {
    collection: "stores",
    timestamps: false,
  }
);

export const StoreModel =
  mongoose.models.Store || mongoose.model<IStore>("Store", StoreSchema);

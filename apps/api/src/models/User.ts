import mongoose, { Schema, Document } from "mongoose";

export interface IUser extends Document {
  email: string;
  passwordHash: string;
  role: "Admin" | "Employee";
  employeeId?: mongoose.Types.ObjectId | null;
  createdAt: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ["Admin", "Employee"], required: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "users",
    timestamps: false,
  }
);

export const UserModel =
  mongoose.models.User || mongoose.model<IUser>("User", UserSchema);

import mongoose, { Schema, Document } from "mongoose";

export interface IEmployee extends Document {
  employee_code?: string;
  employeeCode?: string;
  full_name?: string;
  fullName?: string;
  job_title?: string;
  store_raw?: string;
  department?: string;
  departmentId?: mongoose.Types.ObjectId | string;
  userId?: mongoose.Types.ObjectId;
  level?: "Intern" | "Junior" | "Middle" | "Senior" | "Lead";
  skills?: string[];
  activeLoad?: number;
  status?: "active" | "inactive";
  phone?: string;
  hiredAt?: Date;
  hire_date?: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_raw?: string;
  leave_date?: string | null;
  leave_reason?: string | null;
  profile_status?: string;
  source_row?: number;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    employee_code: { type: String, index: true },
    employeeCode: { type: String, index: true },
    full_name: { type: String },
    fullName: { type: String },
    job_title: { type: String, index: true },
    store_raw: { type: String, index: true },
    department: { type: String, index: true },
    departmentId: { type: Schema.Types.Mixed, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", index: true },
    level: {
      type: String,
      enum: ["Intern", "Junior", "Middle", "Senior", "Lead"],
      default: "Junior",
    },
    skills: { type: [String], default: [] },
    activeLoad: { type: Number, default: 0 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    phone: { type: String },
    hiredAt: { type: Date },
    hire_date: { type: String },
    bank_name: { type: String },
    bank_account_number: { type: String },
    bank_account_raw: { type: String },
    leave_date: { type: String, default: null },
    leave_reason: { type: String, default: null },
    profile_status: { type: String, default: "ĐÃ HOÀN TẤT" },
    source_row: { type: Number },
  },
  {
    collection: "employees",
    timestamps: false,
    strict: false,
  }
);

export const EmployeeModel =
  mongoose.models.Employee ||
  mongoose.model<IEmployee>("Employee", EmployeeSchema);

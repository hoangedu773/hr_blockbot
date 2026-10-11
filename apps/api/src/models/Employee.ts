import mongoose, { Schema, Document } from "mongoose";

export interface IEmployee extends Document {
  employee_code: string;
  full_name: string;
  job_title: string;
  store_raw: string;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_raw?: string;
  hire_date?: string;
  leave_date?: string | null;
  leave_reason?: string | null;
  profile_status?: string;
  source_row?: number;
}

const EmployeeSchema = new Schema<IEmployee>(
  {
    employee_code: { type: String, required: true, index: true },
    full_name: { type: String, required: true },
    job_title: { type: String, index: true },
    store_raw: { type: String, index: true },
    bank_name: { type: String },
    bank_account_number: { type: String },
    bank_account_raw: { type: String },
    hire_date: { type: String },
    leave_date: { type: String, default: null },
    leave_reason: { type: String, default: null },
    profile_status: { type: String, default: "ĐÃ HOÀN TẤT" },
    source_row: { type: Number },
  },
  {
    collection: "employees",
    timestamps: false,
  }
);

export const EmployeeModel =
  mongoose.models.Employee ||
  mongoose.model<IEmployee>("Employee", EmployeeSchema);

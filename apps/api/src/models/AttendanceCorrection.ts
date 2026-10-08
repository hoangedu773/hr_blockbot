import mongoose, { Schema, Document } from "mongoose";

export interface IAttendanceCorrection extends Document {
  id?: number;
  employee_code: string;
  employee_name?: string | null;
  store_name: string;
  work_date: string;
  shift_code: string;
  period_banner?: string;
  note: string;
  status: "PENDING" | "APPROVED" | "REJECTED";
  reviewed_by?: string;
  reviewed_at?: Date;
  source_row?: number;
}

const AttendanceCorrectionSchema = new Schema<IAttendanceCorrection>(
  {
    id: { type: Number },
    employee_code: { type: String, required: true, index: true },
    employee_name: { type: String, default: null },
    store_name: { type: String, required: true, index: true },
    work_date: { type: String, required: true, index: true },
    shift_code: { type: String, required: true },
    period_banner: {
      type: String,
      default: "CHẤM THEO KỲ LƯƠNG 6/5-5/6/2026",
    },
    note: { type: String, required: true },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      index: true,
    },
    reviewed_by: { type: String },
    reviewed_at: { type: Date },
    source_row: { type: Number },
  },
  {
    collection: "attendance_corrections",
    timestamps: true,
  }
);

export const AttendanceCorrectionModel =
  mongoose.models.AttendanceCorrection ||
  mongoose.model<IAttendanceCorrection>(
    "AttendanceCorrection",
    AttendanceCorrectionSchema
  );

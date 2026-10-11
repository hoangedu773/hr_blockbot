import mongoose, { Schema, Document } from "mongoose";

export interface IScheduleEntry extends Document {
  id?: number;
  employee_code: string;
  employee_name: string;
  block_code: string;
  block_index: number;
  work_date: string;
  shift_code: string;
  schedule_type: string;
  sheet_name?: string;
  source_row?: number;
  row_kind?: string;
}

const ScheduleEntrySchema = new Schema<IScheduleEntry>(
  {
    id: { type: Number },
    employee_code: { type: String, required: true, index: true },
    employee_name: { type: String, required: true },
    block_code: { type: String, index: true },
    block_index: { type: Number, default: 0 },
    work_date: { type: String, required: true, index: true },
    shift_code: { type: String, required: true },
    schedule_type: { type: String, default: "actual" },
    sheet_name: { type: String },
    source_row: { type: Number },
    row_kind: { type: String, default: "employee" },
  },
  {
    collection: "schedule_entries",
    timestamps: false,
  }
);

ScheduleEntrySchema.index({ employee_code: 1, work_date: 1 });
ScheduleEntrySchema.index({ block_code: 1, work_date: 1 });

export const ScheduleEntryModel =
  mongoose.models.ScheduleEntry ||
  mongoose.model<IScheduleEntry>("ScheduleEntry", ScheduleEntrySchema);

import mongoose, { Schema, Document } from "mongoose";

export interface IProfileChangeTargetFields {
  level?: "Intern" | "Junior" | "Middle" | "Senior" | "Lead";
  hiredAt?: Date;
  jobTitle?: string;
}

/**
 * Business role derived from `job_title` (the ladder documented in
 * `in_context_policy.py`: Nhan vien -> Ca truong -> SM -> AOM, plus office OD/OM).
 * The auth `role` only knows Admin | Employee, so an SM logging in would be
 * treated exactly like a barista; this tier carries manager authority.
 */
export type BusinessRole = "admin" | "aom" | "sm" | "am" | "ptch" | "staff";

export function deriveBusinessRole(
  jobTitle: string | null | undefined,
  authRole?: string | null
): BusinessRole {
  if (authRole === "Admin") return "admin";
  const title = (jobTitle ?? "").toUpperCase();
  if (/\bAOM\b/.test(title)) return "aom";
  if (/\bSM\b/.test(title) || title.includes("CỬA HÀNG TRƯỞNG")) return "sm";
  if (/\bAM\b/.test(title)) return "am";
  if (title.includes("PHỤ TRÁCH CỬA HÀNG") || /\bPTCH\b/.test(title)) return "ptch";
  if (/\b(OD|OM)\b/.test(title)) return "admin";
  return "staff";
}

export interface IProfileChangePreviousSnapshot {
  level?: string;
  hiredAt?: Date;
  jobTitle?: string;
}

export interface IProfileChangeRequest {
  id?: string;
  _id?: mongoose.Types.ObjectId | string;
  requestedBy: string;
  requestedAt: Date;
  status: "PENDING" | "APPROVED" | "REJECTED";
  targetFields: IProfileChangeTargetFields;
  previousSnapshot: IProfileChangePreviousSnapshot;
  reviewedBy?: string;
  reviewedAt?: Date;
  rejectionReason?: string;
  previousRequestId?: string;
}

export class SelfApprovalError extends Error {
  code = "SELF_APPROVAL";
  status = 403;
  constructor(message = "Admin cannot review own profile change request") {
    super(message);
    this.name = "SelfApprovalError";
  }
}

export function assertNoSelfApproval(reviewerId: string, requestedById: string): void {
  if (reviewerId === requestedById) {
    throw new SelfApprovalError();
  }
}

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
  profileChangeRequests?: IProfileChangeRequest[];
}

const ProfileChangeRequestSchema = new Schema<IProfileChangeRequest>(
  {
    requestedBy: { type: String, required: true },
    requestedAt: { type: Date, default: Date.now },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      required: true,
    },
    targetFields: {
      level: {
        type: String,
        enum: ["Intern", "Junior", "Middle", "Senior", "Lead"],
      },
      hiredAt: { type: Date },
      jobTitle: { type: String },
    },
    previousSnapshot: {
      level: { type: String },
      hiredAt: { type: Date },
      jobTitle: { type: String },
    },
    reviewedBy: { type: String },
    reviewedAt: { type: Date },
    rejectionReason: { type: String },
    previousRequestId: { type: String },
  },
  {
    _id: true,
    timestamps: false,
  }
);

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
    profileChangeRequests: {
      type: [ProfileChangeRequestSchema],
      default: [],
    },
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

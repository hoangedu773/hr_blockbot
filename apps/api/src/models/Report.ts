import mongoose, { Schema, Document } from "mongoose";

export type ReportStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface IReport extends Document {
  projectId: mongoose.Types.ObjectId | string;
  submittedBy: mongoose.Types.ObjectId | string;
  submittedAt: Date;
  content: string;
  attachments: string[];
  status: ReportStatus;
  reviewedBy?: mongoose.Types.ObjectId | string | null;
  reviewedAt?: Date | null;
  reason?: string | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const ReportSchema = new Schema<IReport>(
  {
    projectId: { type: Schema.Types.Mixed, required: true, index: true },
    submittedBy: { type: Schema.Types.Mixed, required: true, index: true },
    submittedAt: { type: Date, default: Date.now },
    content: { type: String, required: true },
    attachments: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["PENDING", "APPROVED", "REJECTED"],
      default: "PENDING",
      required: true,
      index: true,
    },
    reviewedBy: { type: Schema.Types.Mixed, default: null },
    reviewedAt: { type: Date, default: null },
    reason: { type: String, default: null },
  },
  {
    collection: "reports",
    timestamps: true,
  }
);

export const ReportModel =
  mongoose.models.Report ||
  mongoose.model<IReport>("Report", ReportSchema);

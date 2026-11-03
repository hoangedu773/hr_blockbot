import mongoose, { Schema, Document } from "mongoose";

export interface INotification extends Document {
  userId: mongoose.Types.ObjectId;
  employeeId: mongoose.Types.ObjectId | null;
  type: string;
  title: string;
  body: string;
  channel: "in_app";
  dedupeKey: string;
  entityKind: string | null;
  entityId: string | null;
  readAt: Date | null;
  createdAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", default: null },
    type: {
      type: String,
      enum: [
        "deadline_3d", "deadline_1d", "deadline_overdue", "report_submitted",
        "report_approved", "report_rejected", "kpi_published", "kpi_review_digest", "system",
      ],
      required: true,
    },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 1000 },
    channel: { type: String, enum: ["in_app"], default: "in_app", required: true },
    dedupeKey: { type: String, required: true },
    entityKind: { type: String, default: null },
    entityId: { type: String, default: null },
    readAt: { type: Date, default: null },
  },
  { collection: "notifications", timestamps: { createdAt: true, updatedAt: false } }
);

// FR-044: replaying a job must not create a second notification for the same day.
NotificationSchema.index({ userId: 1, dedupeKey: 1 }, { unique: true });
NotificationSchema.index({ userId: 1, readAt: 1, createdAt: -1 });

export const NotificationModel =
  mongoose.models.Notification ||
  mongoose.model<INotification>("Notification", NotificationSchema);

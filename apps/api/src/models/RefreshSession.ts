import mongoose, { Schema, Document } from "mongoose";

export interface IRefreshSession extends Document {
  userId: mongoose.Types.ObjectId;
  familyId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date | null;
  replacedBy?: string | null;
  userAgent?: string | null;
  ipHash?: string | null;
  reusedDetectedAt?: Date | null;
  createdAt: Date;
}

const RefreshSessionSchema = new Schema<IRefreshSession>(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    familyId: { type: String, required: true, index: true },
    tokenHash: { type: String, required: true, unique: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    replacedBy: { type: String, default: null },
    userAgent: { type: String, default: null },
    ipHash: { type: String, default: null },
    reusedDetectedAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  {
    collection: "refresh_sessions",
    timestamps: false,
  }
);

// TTL index
RefreshSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// Compound index for family revocation
RefreshSessionSchema.index({ userId: 1, familyId: 1 });

export const RefreshSessionModel =
  mongoose.models.RefreshSession ||
  mongoose.model<IRefreshSession>("RefreshSession", RefreshSessionSchema);

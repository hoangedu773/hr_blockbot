import mongoose, { Schema, Document } from "mongoose";

export type EvaluationStatus = "OPEN" | "ANALYZED" | "PUBLISHED";

export interface IEvaluation extends Document {
  employeeId: mongoose.Types.ObjectId;
  employeeName: string;
  departmentId: mongoose.Types.ObjectId | null;
  storeId: mongoose.Types.ObjectId | null;
  period: string;
  status: EvaluationStatus;
  selfReview: string | null;
  managerReview: string | null;
  managerScore: number | null;
  analysis: Record<string, unknown> | null;
  objectiveCompletionScore: number | null;
  machineScore: number | null;
  breakdown: Record<string, unknown> | null;
  finalScore: number | null;
  overrideReason: string | null;
  changedBy: string | null;
  changedAt: Date | null;
  publishedAt: Date | null;
  version: number;
  history: Array<Record<string, unknown>>;
  frameworkVersion?: number | null;
  performanceSnapshot?: Record<string, unknown> | null;
  frameworkId?: string | null;
  evaluationStatus?: string | null;
  criteriaScores?: any;
  taskBreakdown?: any;
  taskGroupScore?: number | null;
  finalScoreVersion?: number | null;
  createdAt?: Date;
  updatedAt?: Date;
}

const HistorySchema = new Schema(
  {
    at: { type: String, required: true },
    by: { type: String, required: true },
    action: {
      type: String,
      enum: ["OPENED", "SELF_REVIEW", "MANAGER_REVIEW", "ANALYZED", "PUBLISHED", "OVERRIDE"],
      required: true,
    },
    fromScore: { type: Number, default: null },
    toScore: { type: Number, default: null },
    reason: { type: String, default: null },
  },
  { _id: false }
);

const EvaluationSchema = new Schema<IEvaluation>(
  {
    employeeId: { type: Schema.Types.ObjectId, ref: "Employee", required: true, index: true },
    employeeName: { type: String, required: true },
    departmentId: { type: Schema.Types.ObjectId, default: null, index: true },
    storeId: { type: Schema.Types.ObjectId, default: null, index: true },
    period: { type: String, required: true, index: true },
    status: { type: String, enum: ["OPEN", "ANALYZED", "PUBLISHED"], default: "OPEN", required: true, index: true },
    selfReview: { type: String, default: null },
    managerReview: { type: String, default: null },
    managerScore: { type: Number, default: null, min: 0, max: 100 },
    analysis: { type: Schema.Types.Mixed, default: null },
    objectiveCompletionScore: { type: Number, default: null, min: 0, max: 1 },
    machineScore: { type: Number, default: null },
    breakdown: { type: Schema.Types.Mixed, default: null },
    finalScore: { type: Number, default: null },
    overrideReason: { type: String, default: null },
    changedBy: { type: String, default: null },
    changedAt: { type: Date, default: null },
    publishedAt: { type: Date, default: null },
    version: { type: Number, default: 0, min: 0 },
    history: { type: [HistorySchema], default: [] },
    frameworkVersion: { type: Number, default: null },
    performanceSnapshot: { type: Schema.Types.Mixed, default: null },
    frameworkId: { type: String, default: null },
    evaluationStatus: { type: String, default: null },
    criteriaScores: { type: Schema.Types.Mixed, default: null },
    taskBreakdown: { type: Schema.Types.Mixed, default: null },
    taskGroupScore: { type: Number, default: null },
    finalScoreVersion: { type: Number, default: null },
  },
  { collection: "evaluations", timestamps: true }
);

// BR-17: one evaluation per (employeeId, period).
EvaluationSchema.index({ employeeId: 1, period: 1 }, { unique: true });
EvaluationSchema.index({ period: 1, status: 1, storeId: 1 });

export const EvaluationModel =
  mongoose.models.Evaluation ||
  mongoose.model<IEvaluation>("Evaluation", EvaluationSchema);

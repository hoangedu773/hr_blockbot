import mongoose, { Schema, Document } from "mongoose";

export type ProjectStatus =
  | "DRAFT"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "PENDING_REVIEW"
  | "COMPLETED";

export interface IProjectStatusHistory {
  from: ProjectStatus;
  to: ProjectStatus;
  changedBy: string;
  changedAt: Date;
  reason?: string;
}

export interface IProject extends Document {
  title: string;
  description?: string;
  departmentId: mongoose.Types.ObjectId | string;
  createdBy: mongoose.Types.ObjectId | string;
  assigneeId?: mongoose.Types.ObjectId | string | null;
  status: ProjectStatus;
  progress: number;
  dueDate?: Date | null;
  version: number;
  statusHistory: IProjectStatusHistory[];
  createdAt?: Date;
  updatedAt?: Date;
}

export class ProjectVersionConflictError extends Error {
  code = "PROJECT_VERSION_CONFLICT";
  status = 409;
  currentProject?: unknown;

  constructor(message: string, currentProject?: unknown) {
    super(message);
    this.name = "ProjectVersionConflictError";
    this.currentProject = currentProject;
  }
}

export class ProjectNotFoundError extends Error {
  code = "RESOURCE_NOT_FOUND";
  status = 404;

  constructor(message = "Project not found") {
    super(message);
    this.name = "ProjectNotFoundError";
  }
}

const StatusHistorySchema = new Schema<IProjectStatusHistory>(
  {
    from: {
      type: String,
      enum: ["DRAFT", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"],
      required: true,
    },
    to: {
      type: String,
      enum: ["DRAFT", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"],
      required: true,
    },
    changedBy: { type: String, required: true },
    changedAt: { type: Date, default: Date.now },
    reason: { type: String },
  },
  { _id: false }
);

const ProjectSchema = new Schema<IProject>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    departmentId: { type: Schema.Types.Mixed, required: true, index: true },
    createdBy: { type: Schema.Types.Mixed, required: true, index: true },
    assigneeId: { type: Schema.Types.Mixed, default: null, index: true },
    status: {
      type: String,
      enum: ["DRAFT", "ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW", "COMPLETED"],
      default: "DRAFT",
      required: true,
      index: true,
    },
    progress: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    dueDate: { type: Date, default: null },
    version: {
      type: Number,
      default: 1,
      required: true,
    },
    statusHistory: {
      type: [StatusHistorySchema],
      default: [],
    },
  },
  {
    collection: "projects",
    timestamps: true,
  }
);

export const ProjectModel =
  mongoose.models.Project ||
  mongoose.model<IProject>("Project", ProjectSchema);

export interface TransitionProjectOptions {
  projectId: string | mongoose.Types.ObjectId;
  expectedStatus: ProjectStatus;
  expectedVersion: number;
  newStatus: ProjectStatus;
  changedBy: string;
  reason?: string;
  updates?: {
    progress?: number;
    assigneeId?: mongoose.Types.ObjectId | string | null;
    dueDate?: Date | null;
    title?: string;
    description?: string;
  };
}

export async function transitionProject({
  projectId,
  expectedStatus,
  expectedVersion,
  newStatus,
  changedBy,
  reason,
  updates = {},
}: TransitionProjectOptions): Promise<IProject> {
  const historyEntry: IProjectStatusHistory = {
    from: expectedStatus,
    to: newStatus,
    changedBy,
    changedAt: new Date(),
    reason,
  };

  const setClause: Record<string, unknown> = {
    status: newStatus,
    ...updates,
  };

  const updated = await ProjectModel.findOneAndUpdate(
    {
      _id: projectId,
      status: expectedStatus,
      version: expectedVersion,
    },
    {
      $set: setClause,
      $inc: { version: 1 },
      $push: { statusHistory: historyEntry },
    },
    { new: true }
  );

  if (!updated) {
    const existing = await ProjectModel.findById(projectId).lean();
    if (!existing) {
      throw new ProjectNotFoundError(`Project ${projectId} not found`);
    }
    const currentStatus = (existing as Record<string, unknown>).status;
    const currentVersion = (existing as Record<string, unknown>).version;
    throw new ProjectVersionConflictError(
      `Project transition conflict: current status is '${currentStatus}' with version ${currentVersion}, expected status '${expectedStatus}' with version ${expectedVersion}`,
      existing
    );
  }

  return updated;
}

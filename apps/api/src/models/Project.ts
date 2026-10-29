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

export type TransitionActorRole = "Admin" | "Employee";

/**
 * (from -> to) pairs are the only legal moves; the value lists the roles
 * allowed to make that move. Anything not listed here is rejected.
 */
export const PROJECT_TRANSITIONS: Record<
  ProjectStatus,
  Partial<Record<ProjectStatus, ReadonlyArray<TransitionActorRole>>>
> = {
  DRAFT: { ASSIGNED: ["Admin"], IN_PROGRESS: ["Admin"] },
  ASSIGNED: { IN_PROGRESS: ["Admin", "Employee"] },
  IN_PROGRESS: { PENDING_REVIEW: ["Admin", "Employee"] },
  PENDING_REVIEW: { COMPLETED: ["Admin"], IN_PROGRESS: ["Admin"] },
  COMPLETED: {},
};

export class IllegalTransitionError extends Error {
  code = "ILLEGAL_STATE_TRANSITION";
  status = 409;

  constructor(from: ProjectStatus, to: ProjectStatus) {
    super(`Illegal project transition: ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

export class ForbiddenTransitionError extends Error {
  code = "FORBIDDEN_TRANSITION";
  status = 403;

  constructor(from: ProjectStatus, to: ProjectStatus, role: TransitionActorRole) {
    super(`Role ${role} is not allowed to move a project from ${from} to ${to}`);
    this.name = "ForbiddenTransitionError";
  }
}

/**
 * Reject a transition that is not in the whitelist (409) or whose role is not
 * permitted for that pair (403). Every entrypoint goes through here.
 */
export function assertTransitionAllowed(
  from: ProjectStatus,
  to: ProjectStatus,
  actorRole: TransitionActorRole
): void {
  const allowedRoles = PROJECT_TRANSITIONS[from]?.[to];
  if (!allowedRoles) {
    throw new IllegalTransitionError(from, to);
  }
  if (!allowedRoles.includes(actorRole)) {
    throw new ForbiddenTransitionError(from, to, actorRole);
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
  actorRole: TransitionActorRole;
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
  actorRole,
  reason,
  updates = {},
}: TransitionProjectOptions): Promise<IProject> {
  assertTransitionAllowed(expectedStatus, newStatus, actorRole);

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

import mongoose, { Schema, Document } from "mongoose";

export type ProjectStatus =
  | "DRAFT"
  | "ASSIGNED"
  | "IN_PROGRESS"
  | "PENDING_REVIEW"
  | "COMPLETED";

export interface IProjectStatusHistory {
  from: ProjectStatus | null;
  to: ProjectStatus;
  changedBy: string;
  changedAt: Date;
  reason?: string;
}

export interface IProject extends Document {
  storeId?: mongoose.Types.ObjectId | null;
  storeMappingRef?: string | null;
  title: string;
  description?: string;
  requiredSkills: string[];
  departmentId: mongoose.Types.ObjectId | string;
  createdBy: mongoose.Types.ObjectId | string;
  assigneeId?: mongoose.Types.ObjectId | string | null;
  status: ProjectStatus;
  progress: number;
  dueDate?: Date | null;
  version: number;
  statusHistory: IProjectStatusHistory[];
  reports: any[];
  assignmentStatus?: "PENDING_ACCEPTANCE" | "ACCEPTED" | "MANAGER_REVIEW" | "HANDOVER_PENDING" | null;
  assignmentRound: number;
  acceptedAt?: string | null;
  responsibleEmployeeId?: string | null;
  assignmentRequests: any[];
  responsibilities: any[];
  assignmentAudit: any[];
  auditRequired: boolean;
  assignmentNotices: any[];
  notificationReads: string[];
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

/** Pure state validation; actor authorization is performed by the shared kernel. */
export function assertStateTransitionAllowed(from: ProjectStatus, to: ProjectStatus): void {
  if (!PROJECT_TRANSITIONS[from]?.[to]) throw new IllegalTransitionError(from, to);
}

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
      default: null,
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
    storeId: { type: Schema.Types.ObjectId, ref: "Store", default: null, index: true },
    storeMappingRef: { type: String, default: null },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    requiredSkills: { type: [String], default: [] },
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
    // Canonical report state: committed atomically with project status/version.
    // The standalone reports collection is a compatibility projection only.
    reports: { type: [Schema.Types.Mixed], default: [] } as any,
    assignmentStatus: { type: String, enum: ["PENDING_ACCEPTANCE", "ACCEPTED", "MANAGER_REVIEW", "HANDOVER_PENDING", null], default: null },
    assignmentRound: { type: Number, default: 0 },
    acceptedAt: { type: String, default: null },
    responsibleEmployeeId: { type: String, default: null },
    assignmentRequests: { type: [Schema.Types.Mixed], default: [] } as any,
    responsibilities: { type: [Schema.Types.Mixed], default: [] } as any,
    assignmentAudit: { type: [Schema.Types.Mixed], default: [] } as any,
    auditRequired: { type: Boolean, default: false },
    assignmentNotices: { type: [Schema.Types.Mixed], default: [] } as any,
    notificationReads: { type: [String], default: [] },
  },
  {
    collection: "projects",
    timestamps: true,
    // Empty audit objects are part of the canonical commitment, not removable noise.
    minimize: false,
  }
);

ProjectSchema.index({ departmentId: 1, createdAt: -1, _id: -1 });
ProjectSchema.index({ status: 1, dueDate: 1 });
ProjectSchema.index({ "reports._id": 1 });

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

/** @deprecated No runtime callers. Use consent/report services with a verified actor. */
export async function transitionProject(options: TransitionProjectOptions): Promise<IProject> {
  void options;
  // Keep the export to fail closed for stale imports instead of leaving an
  // unaudited bypass for either old or newly created documents.
  throw new ProjectVersionConflictError("Use the consent/report workflow; legacy transition cannot bypass audited decisions");
}

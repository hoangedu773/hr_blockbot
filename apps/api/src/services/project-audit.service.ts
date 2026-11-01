import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { ProjectModel } from "../models/Project.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { WorkflowError, versionFilter, conflict } from "./project-workflow.service.js";
import { withCrmWriter, assertEmployeeReceivesWork } from "./crm-writer.service.js";

const ZERO = "0".repeat(64);
export function canonical(value: any): any {
  if (value instanceof Date) return value.toISOString();
  if (value && typeof value.toHexString === "function") return value.toHexString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().filter((key) => value[key] !== undefined).map((key) => [key, canonical(value[key])]));
  return value;
}
export const digest = (value: any): string => createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
const STATE_FIELDS = ["title", "description", "departmentId", "requiredSkills", "createdBy", "assigneeId", "status", "progress", "dueDate", "version", "statusHistory", "reports", "assignmentStatus", "assignmentRound", "acceptedAt", "responsibleEmployeeId", "assignmentRequests", "responsibilities", "assignmentNotices", "auditRequired"];
function state(project: any, encodingVersion = 3) {
  const defaults: Record<string, any> = { assignmentRound: 0, progress: 0, version: 1, description: "", auditRequired: false };
  const fields = encodingVersion >= 3 ? [...STATE_FIELDS, "storeId", "storeMappingRef"] : STATE_FIELDS;
  return canonical(Object.fromEntries(fields.map((key) => [key, project[key] ?? (encodingVersion >= 2 && key in defaults ? defaults[key] : key === "assignmentRound" ? 0 : ["assignmentRequests", "responsibilities", "assignmentNotices", "reports", "requiredSkills", "statusHistory"].includes(key) ? [] : null)])));
}

/** Reject inconsistent responsibility data, even if a privileged import rehashed it. */
export function assertAssignmentConsistency(project: any): void {
  const fail = () => { throw new WorkflowError(409, "ASSIGNMENT_INTEGRITY_FAILED", "Phân công và khoảng trách nhiệm không nhất quán; cần quản trị kiểm tra, không tự sửa lịch sử."); };
  const rows = project.responsibilities ?? [];
  const active = rows.filter((row: any) => row.endAt == null);
  const pending = (project.assignmentRequests ?? []).filter((row: any) => ["PENDING", "HANDOVER_PENDING"].includes(row.status));
  if (pending.length > 1 || pending.some((row: any) => row.assignmentRound !== (project.assignmentRound ?? 0))) fail();
  if (project.assignmentStatus === "HANDOVER_PENDING" && (project.status !== "IN_PROGRESS" || pending[0]?.status !== "HANDOVER_PENDING")) fail();
  if (project.assignmentStatus === "HANDOVER_PENDING" && (!pending[0]?.replacementId || pending[0].replacementId === String(project.assigneeId) || pending[0].progressSnapshot !== (project.progress ?? 0))) fail();
  if (pending.some((row: any) => row.status === "HANDOVER_PENDING") && project.assignmentStatus !== "HANDOVER_PENDING") fail();
  if (active.length > 1 || (project.status === "COMPLETED" && active.length)) fail();
  if (["PENDING_ACCEPTANCE", "MANAGER_REVIEW"].includes(project.assignmentStatus) && (project.responsibleEmployeeId || active.length)) fail();
  if (project.responsibleEmployeeId && String(project.responsibleEmployeeId) !== String(project.assigneeId)) fail();
  if (active.length && (String(active[0].employeeId) !== String(project.responsibleEmployeeId || project.assigneeId) || active[0].assignmentRound !== (project.assignmentRound ?? 0))) fail();
  // Pre-consent legacy records legitimately have no intervals/timestamps.
  if (project.acceptedAt && ["ACCEPTED", "HANDOVER_PENDING"].includes(project.assignmentStatus) && project.status !== "COMPLETED" && active.length !== 1) fail();
  if (project.acceptedAt && ["ACCEPTED", "HANDOVER_PENDING"].includes(project.assignmentStatus) && !project.responsibleEmployeeId) fail();
  for (const [index, row] of rows.entries()) {
    if (!row.employeeId || !Number.isFinite(row.progressStart) || row.progressStart < 0 || row.progressStart > 100) fail();
    if (row.startAt == null && !row.legacy) fail();
    if (row.startAt != null && !Number.isFinite(Date.parse(row.startAt))) fail();
    if (row.endAt != null && (!Number.isFinite(Date.parse(row.endAt)) || row.startAt && Date.parse(row.endAt) < Date.parse(row.startAt) || !Number.isFinite(row.progressEnd) || row.progressEnd < 0 || row.progressEnd > 100)) fail();
    if (index < rows.length - 1 && row.endAt == null) fail();
    if (index && rows[index - 1].endAt && row.startAt && Date.parse(row.startAt) < Date.parse(rows[index - 1].endAt)) fail();
    if (index && row.assignmentRound <= rows[index - 1].assignmentRound) fail();
  }
}

export function assertProjectStorage(project: any): void {
  // JSON byte length is not BSON size (array keys / type tags add overhead).
  if (mongoose.mongo.BSON.calculateObjectSize(project) > 8 * 1024 * 1024) {
    throw new WorkflowError(409, "PROJECT_STORAGE_LIMIT", "Hồ sơ nhiệm vụ đạt ngưỡng lưu trữ an toàn; cần lưu trữ có kiểm chứng, không cắt/xóa lịch sử tự động.");
  }
}
function snapshot(project: any) {
  return canonical({ status: project.status ?? null, assignmentStatus: project.assignmentStatus ?? null, assigneeId: project.assigneeId ?? null,
    responsibleEmployeeId: project.responsibleEmployeeId ?? null, progress: project.progress ?? 0, version: project.version ?? 0 });
}
export function verifyProjectAudit(project: any): boolean {
  const entries = project.assignmentAudit ?? [];
  if (project.auditRequired && !entries.length) return false;
  let previous = ZERO;
  for (const [index, entry] of entries.entries()) {
    const { hash, ...payload } = entry;
    if (entry.sequence !== index + 1 || entry.previousHash !== previous || hash !== digest(payload)) return false;
    previous = hash;
  }
  const last = entries[entries.length - 1];
  // Old commitments remain verifiable byte-for-byte. Never recompute/rewrite an
  // existing hash when introducing normalized defaults for legacy Mongo shapes.
  if (last?.stateVersion !== undefined && ![2, 3].includes(last.stateVersion)) return false;
  return !last || last.stateHash === digest(state(project, last.stateVersion ?? 1));
}
export function auditEntry(before: any, after: any, user: AuthenticatedUser, type: string, reason: string, details: any = {}) {
  const entries = before.assignmentAudit ?? [];
  const entry = {
    id: "0x" + randomBytes(32).toString("hex"), sequence: entries.length + 1, type,
    actorId: user.userId, at: new Date().toISOString(), reason,
    before: snapshot(before), after: snapshot(after), details: canonical(details),
    previousHash: entries[entries.length - 1]?.hash ?? ZERO, nonce: randomBytes(32).toString("hex"), stateVersion: 3, stateHash: digest(state(after)),
  };
  return { ...entry, hash: digest(entry) };
}
export async function auditedUpdate(project: any, user: AuthenticatedUser, expectedVersion: number, type: string, reason: string,
  update: { $set?: Record<string, any>; $push?: Record<string, any> }, details: any = {}) {
  return withCrmWriter(async () => {
  if (!verifyProjectAudit(project)) throw new WorkflowError(409, "AUDIT_INTEGRITY_FAILED", "Dữ liệu/lịch sử không khớp mã băm. Cần quản trị kiểm tra, không ghi đè lịch sử.");
  assertAssignmentConsistency(project);
  if ((project.assignmentAudit?.length ?? 0) >= 1000) throw new WorkflowError(409, "AUDIT_LIMIT_REACHED", "Đã đạt giới hạn 1000 sự kiện; cần quy trình lưu trữ trước khi tiếp tục.");
  update = { ...update, $set: { ...update.$set, auditRequired: true } };
  const filter = versionFilter(project, expectedVersion);
  update.$set!.version = expectedVersion + 1;
  const after = { ...project, ...update.$set };
  for (const [key, value] of Object.entries(update.$push ?? {})) after[key] = [...(project[key] ?? []), value];
  // Revalidate recipients INSIDE the same serialization boundary as lifecycle's
  // obligation check and employee commit, not just when the form was opened.
  if (after.status !== "COMPLETED" && after.assigneeId) await assertEmployeeReceivesWork(after.assigneeId, after.storeId);
  for (const request of after.assignmentRequests ?? []) if (request.status === "HANDOVER_PENDING") await assertEmployeeReceivesWork(request.replacementId, after.storeId);
  const event = auditEntry(project, after, user, type, reason, details);
  assertAssignmentConsistency(after);
  assertProjectStorage({ ...after, assignmentAudit: [...(project.assignmentAudit ?? []), event] });
  const updated = await ProjectModel.findOneAndUpdate(filter, {
    ...update, $push: { ...update.$push, assignmentAudit: event },
  }, { new: true, runValidators: true });
  if (!updated) conflict();
  return updated;
  });
}

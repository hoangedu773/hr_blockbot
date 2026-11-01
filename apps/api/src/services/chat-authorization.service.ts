import mongoose from "mongoose";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { getJwtSecret } from "./auth.service.js";
import { resolvePrincipal } from "./principal.service.js";
import { requireCapability, employeeScopeQuery } from "./authorization-scope.service.js";
import { projectReadScope, visibleProject, WorkflowError, assertProjectWrite, assertExecutionAllowed, objectId } from "./project-workflow.service.js";
import { EmployeeModel } from "../models/Employee.js";
import { ProjectModel } from "../models/Project.js";
import { approvedDocuments, documentAllowed, documentReceipt } from "./document-authorization.service.js";
import { chatWithAiService } from "./ai-client.service.js";
import { digest } from "./project-audit.service.js";

const receipts = () => mongoose.connection.collection<any>("chat_authorization_requests");
const contextHash = (user: AuthenticatedUser) => digest({ authorization: user.authorization, canonical: user.canonical, delegations: user.effectiveDelegations ?? [], employeeId: user.employeeId });
export const GatewayToolRequestSchema = z.object({ requestId: z.string().uuid(), tool: z.enum(["get_my_profile", "list_projects", "get_project_status", "query_policy", "directory", "submit_report", "get_my_kpi", "get_department_kpi", "validate_context"]),
  args: z.object({ projectId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), query: z.string().max(2000).optional() }).strict().default({}) }).strict();
export function serviceKeyValid(provided: string): boolean {
  const expected = process.env.AI_SERVICE_API_KEY;
  if (!expected || !provided) return false;
  const a = Buffer.from(expected), b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function beginAuthorizedChat(user: AuthenticatedUser) {
  requireCapability(user, "chatbot.data_read", { userId: user.userId, employeeId: user.employeeId });
  const requestId = randomUUID(), version = user.securityVersion ?? 0;
  await receipts().createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await receipts().insertOne({ _id: requestId, userId: user.userId, securityVersion: version, contextHash: contextHash(user), status: "ACTIVE", expiresAt: new Date(Date.now() + 90000), documents: [], projects: [] });
  const delegationToken = await new SignJWT({ av: version, requestId, purpose: "authorized-tools" }).setSubject(user.userId)
    .setProtectedHeader({ alg: "HS256" }).setAudience("hr-blockbot-scoped-tools").setIssuedAt().setExpirationTime("90s").sign(getJwtSecret());
  return { requestId, delegationToken };
}
export async function executeGatewayTool(token: string, body: unknown) {
  const parsed = GatewayToolRequestSchema.safeParse(body);
  if (!parsed.success) throw new WorkflowError(400, "VALIDATION_FAILED", "Tool/arguments are not allowlisted");
  let payload;
  try { ({ payload } = await jwtVerify(token, getJwtSecret(), { algorithms: ["HS256"], audience: "hr-blockbot-scoped-tools" })); }
  catch { throw new WorkflowError(401, "UNAUTHENTICATED", "Invalid scoped tool token"); }
  const { requestId, tool, args } = parsed.data;
  if (!payload.sub || payload.purpose !== "authorized-tools" || payload.requestId !== requestId || !Number.isSafeInteger(payload.av)) throw new WorkflowError(401, "UNAUTHENTICATED", "Scoped token binding mismatch");
  const user = await resolvePrincipal({ sub: payload.sub, role: "Employee", securityVersion: payload.av as number });
  requireCapability(user, "chatbot.data_read", { userId: user.userId, employeeId: user.employeeId });
  const request = await receipts().findOne({ _id: requestId, userId: user.userId, securityVersion: payload.av, status: "ACTIVE", expiresAt: { $gt: new Date() } });
  if (!request) throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request expired or closed");
  if (request.contextHash !== contextHash(user)) throw new WorkflowError(409, "CHAT_AUTHORIZATION_CHANGED", "Authority changed during context preparation");
  let result: unknown, documents: any[] = [], projects: any[] = [];
  if (tool === "get_my_profile") {
    requireCapability(user, "profile.read_self", { employeeId: user.employeeId });
    const employee: any = await EmployeeModel.findById(user.employeeId).select("fullName full_name job_title skills").lean();
    result = employee ? { fullName: employee.fullName || employee.full_name, jobTitle: employee.job_title ?? null, skills: employee.skills ?? [] } : { unavailable: true };
  } else if (tool === "list_projects") {
    const rows: any[] = await ProjectModel.find(projectReadScope(user)).select("title status progress assigneeId version").sort({ updatedAt: -1, _id: -1 }).limit(20).lean();
    projects = rows.map((row) => ({ projectId: String(row._id), version: row.version ?? 1 }));
    result = rows.map((row) => ({ projectId: String(row._id), title: row.title, status: row.status, progress: row.progress, version: row.version ?? 1 }));
  } else if (tool === "get_project_status" || tool === "submit_report") {
    if (!args.projectId) throw new WorkflowError(400, "VALIDATION_FAILED", "Canonical projectId required");
    const project = await visibleProject(user, args.projectId);
    projects = [{ projectId: String(project._id), version: project.version ?? 1 }];
    if (tool === "submit_report") {
      requireCapability(user, "reports.submit", { employeeId: user.employeeId }); assertProjectWrite(user, project); assertExecutionAllowed(project, true);
      if (project.status !== "IN_PROGRESS") throw new WorkflowError(409, "ILLEGAL_STATE_TRANSITION", "Report is not ready to submit");
      result = { proposalOnly: true, projectId: String(project._id), expectedVersion: project.version, requiresConfirmation: true, executed: false };
    } else result = { projectId: String(project._id), title: project.title, status: project.status, progress: project.progress };
  } else if (tool === "directory") {
    const rows: any[] = await EmployeeModel.find({ $and: [employeeScopeQuery(user, "directory.read_store"), { status: "active" }] }).select("fullName full_name job_title").sort({ fullName: 1, _id: 1 }).limit(20).lean();
    result = rows.map((row) => ({ fullName: row.fullName || row.full_name, jobTitle: row.job_title ?? null }));
  } else if (tool === "query_policy") {
    const rows = await approvedDocuments(user, args.query ?? "");
    documents = rows.map(({ document }) => documentReceipt(document));
    result = rows.map(({ document, text }) => ({ documentId: String(document._id), title: document.title, version: document.version ?? "", text: text.slice(0, 5000) }));
  } else if (tool === "validate_context") result = { valid: true };
  else result = { unavailable: true, reason: "KPI is outside Authorization V1; no guessed data" };
  const record = await receipts().updateOne({ _id: requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } },
    { $addToSet: { documents: { $each: documents }, projects: { $each: projects } } });
  if (!record.matchedCount) throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request closed during read");
  return { result, proposalOnly: true };
}
export async function authorizedChat(user: AuthenticatedUser, message: string, conversationId?: string) {
  const authorization = await beginAuthorizedChat(user);
  try {
    const result = await chatWithAiService(message, {}, conversationId, authorization);
    const current = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
    requireCapability(current, "chatbot.data_read", { userId: current.userId, employeeId: current.employeeId });
    const row = await receipts().findOne({ _id: authorization.requestId, status: "ACTIVE", expiresAt: { $gt: new Date() } });
    if (!row) throw new WorkflowError(403, "CHAT_REQUEST_UNAVAILABLE", "Request no longer valid");
    if (row.contextHash !== contextHash(current)) throw new WorkflowError(409, "CHAT_AUTHORIZATION_CHANGED", "Authority changed while generating a response");
    const citations = [];
    for (const receipt of row.documents) {
      const document = await mongoose.connection.collection("policies").findOne({ _id: objectId(receipt.documentId) });
      if (!document || !documentAllowed(current, document) || documentReceipt(document).digest !== receipt.digest) throw new WorkflowError(403, "DOCUMENT_ACCESS_CHANGED", "Document ACL changed during response");
      citations.push({ document: String(document.title), version: String(document.version ?? ""), score: 1 });
    }
    for (const receipt of row.projects) {
      const project = await visibleProject(current, receipt.projectId);
      if ((project.version ?? 1) !== receipt.version) throw new WorkflowError(409, "CHAT_RESOURCE_CHANGED", "Project changed during response");
    }
    // Provider output cannot invent citations, attachment access, or executable actions.
    return { ...result, citations, attachments: [], proposedAction: null };
  } finally { await receipts().updateOne({ _id: authorization.requestId }, { $set: { status: "CLOSED" } }); }
}

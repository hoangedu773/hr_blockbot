import mongoose from "mongoose";
import { randomUUID } from "node:crypto";
import { F4SuggestionsSchema, F4_MODEL, F4_REVISION, type F4Suggestions } from "@hr-blockbot/contracts";
import { EmployeeModel } from "../models/Employee.js";
import { ProjectModel } from "../models/Project.js";
import { responsible } from "./assignment.service.js";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { employeeScopeQuery, managedEmployeeIds } from "./authorization-scope.service.js";
import { projectReadScope, visibleProject, assertProjectManagement, WorkflowError } from "./project-workflow.service.js";
import { resolvePrincipal } from "./principal.service.js";
import { digest } from "./project-audit.service.js";
import { semanticCandidates } from "./f4-client.service.js";

const normalize = (s: string) => s.normalize("NFC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("vi");
const skillsOf = (value: unknown): string[] => Array.isArray(value) ? [...new Set(value.filter((s): s is string => typeof s === "string" && !!s.trim() && s.trim().length <= 100).map((s) => s.normalize("NFC").trim()))].slice(0, 30) : [];
async function snapshot(project: any, user: AuthenticatedUser) {
  if (!["DRAFT", "ASSIGNED", "IN_PROGRESS"].includes(project.status)) throw new WorkflowError(409, "F4_PROJECT_STATE", "Chỉ gợi ý cho công việc đang cần phân công/chuyển giao.");
  assertProjectManagement(user, project, "projects.assign");
  const employees: any[] = await EmployeeModel.find({ $and: [employeeScopeQuery(user, "projects.assign"), {
    status: "active", storeId: project.storeId, lifecyclePendingRequestId: null,
    _id: { $in: managedEmployeeIds(user, String(project.storeId), "projects.assign").map((id) => new mongoose.Types.ObjectId(id)), $ne: project.assigneeId },
  }] }).select("fullName full_name skills").sort({ _id: 1 }).limit(201).lean();
  const work: any[] = await ProjectModel.find({ $and: [projectReadScope(user), { status: { $in: ["ASSIGNED", "IN_PROGRESS", "PENDING_REVIEW"] } }] })
    .select("assigneeId responsibleEmployeeId assignmentStatus status assignmentRequests").lean();
  const loads = new Map<string, number>(), reservations = new Map<string, number>();
  for (const item of work) { const id = responsible(item); if (id) loads.set(id, (loads.get(id) ?? 0) + 1);
    for (const request of item.assignmentRequests ?? []) if (request.status === "HANDOVER_PENDING" && request.replacementId) reservations.set(request.replacementId, (reservations.get(request.replacementId) ?? 0) + 1); }
  return employees.map((e) => ({ employeeId: String(e._id), fullName: String(e.fullName || e.full_name || e._id), skills: skillsOf(e.skills), activeLoad: loads.get(String(e._id)) ?? 0, incomingReservations: reservations.get(String(e._id)) ?? 0 }));
}

/** The sole initial/replacement ranking orchestrator. Never reads or writes KPI. */
export async function recommendCandidates(project: any, user: AuthenticatedUser): Promise<F4Suggestions> {
  const rows = await snapshot(project, user), required = skillsOf(project.requiredSkills);
  const authority = (p: AuthenticatedUser) => digest({ authorization: p.authorization, canonical: p.canonical, delegations: p.effectiveDelegations ?? [] });
  const beforeAuthority = authority(user), before = digest(rows);
  const mode = process.env.F4_MODE ?? "OFF";
  if (!["OFF", "PHOBERT"].includes(mode)) throw new WorkflowError(503, "F4_CONFIGURATION_INVALID", "Cấu hình F4 chưa hợp lệ; chọn người thủ công.");
  const alphaText = process.env.F4_SEMANTIC_WEIGHT;
  const alpha = alphaText !== undefined && alphaText.trim() !== "" ? Number(alphaText) : NaN;
  let status: F4Suggestions["status"] = !required.length || !rows.length || !rows.some((row) => row.skills.length) ? "INSUFFICIENT_DATA" : rows.length > 200 ? "CAPACITY_EXCEEDED" : "READY";
  let source: F4Suggestions["source"] = status === "READY" ? "BASELINE_EXACT" : "MANUAL";
  let semantic: Awaited<ReturnType<typeof semanticCandidates>> | null = null;
  if (status === "READY" && mode === "PHOBERT") {
    // A fresh current principal is required before even the local model receives data.
    const preflight = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
    const preflightProject = await visibleProject(preflight, String(project._id));
    if (authority(preflight) !== beforeAuthority || preflightProject.version !== project.version || digest(await snapshot(preflightProject, preflight)) !== before) throw new WorkflowError(409, "F4_CONTEXT_CHANGED", "Quyền hoặc dữ liệu đã thay đổi trước khi phân tích.");
    try {
      if (!Number.isFinite(alpha) || alpha <= 0 || alpha > 1) throw new Error("F4_WEIGHT_NOT_SELECTED_ON_DEV");
      const description = String(project.description ?? "").slice(0, 10000);
      if ([description, ...required, ...rows.flatMap((row) => row.skills)].some((text) => /\d{6}|[\w.-]+@|\b(?:cccd|cmnd|salary)\b|lương|điện\s*thoại/i.test(text))) throw new Error("F4_CONTEXT_REQUIRES_REDACTION");
      semantic = await semanticCandidates({ requestId: randomUUID(), requiredSkills: required, description, candidates: rows.map((row, index) => ({ id: "c" + index, skills: row.skills })) });
      source = "PHOBERT";
    } catch { status = "MODEL_UNAVAILABLE"; source = "BASELINE_FALLBACK"; }
  }
  const current = await resolvePrincipal({ sub: user.userId, role: user.role, securityVersion: user.securityVersion });
  const latest = await visibleProject(current, String(project._id));
  if (authority(current) !== beforeAuthority || latest.version !== project.version || digest({ required: latest.requiredSkills, description: latest.description, status: latest.status }) !== digest({ required: project.requiredSkills, description: project.description, status: project.status }) || digest(await snapshot(latest, current)) !== before) throw new WorkflowError(409, "F4_CONTEXT_CHANGED", "Quyền hoặc dữ liệu đã thay đổi trong lúc gợi ý. Tải lại trước khi chọn.");
  const items = source === "MANUAL" ? [] : rows.map((row, index) => {
    const own = new Set(row.skills.map(normalize)), matched = required.filter((s) => own.has(normalize(s))), missing = required.filter((s) => !own.has(normalize(s)));
    const exact = matched.length / required.length, inferred = semantic?.items.find((item) => item.id === "c" + index);
    const enough = row.skills.length > 0, score = enough ? (inferred ? alpha * inferred.semanticScore + (1 - alpha) * exact : exact) : null;
    return { ...row, skillScore: exact, semanticScore: inferred?.semanticScore ?? null, suitabilityScore: score === null ? null : Math.round(score * 10000) / 100,
      kpi: null, matchedSkills: matched, missingSkills: missing, semanticEvidence: inferred?.pairs ?? [], missingData: enough ? [] : ["Chưa có kỹ năng để đánh giá; chọn thủ công sau xác minh."],
      explanation: `Khớp chính xác ${matched.length}/${required.length} kỹ năng; ${row.activeLoad} nhiệm vụ chịu trách nhiệm; ${row.incomingReservations} bàn giao dự kiến. ${inferred ? "Có đối sánh PhoBERT, không phải xác suất hay xác nhận năng lực." : "Baseline so khớp chính xác, chưa chạy PhoBERT."}` };
  }).sort((a, b) => (b.suitabilityScore ?? -1) - (a.suitabilityScore ?? -1) || a.activeLoad - b.activeLoad || a.employeeId.localeCompare(b.employeeId)).slice(0, 10);
  return F4SuggestionsSchema.parse({ items, candidatesConsidered: rows.length, advisoryOnly: true, status, source, model: semantic ? F4_MODEL : null, revision: semantic ? F4_REVISION : null, semanticWeight: semantic ? alpha : null,
    projectVersion: project.version ?? 1, generatedAt: new Date().toISOString(), warning: "Quản lý quyết định cuối cùng. Không sử dụng KPI; workload chỉ phá hòa điểm, không là năng lực. Chỉ xét tải trong phạm vi được đọc. Thiếu dữ liệu/model thì chọn thủ công; xem gợi ý không ghi dữ liệu." });
}

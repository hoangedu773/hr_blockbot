import mongoose from "mongoose";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { hasCapability, allowedStoreIds } from "./authorization-scope.service.js";
import { WorkflowError } from "./project-workflow.service.js";
import { digest } from "./project-audit.service.js";
import { z } from "zod";
import { AuthorizationProfileSchema } from "@hr-blockbot/contracts";

const AclSchema = z.object({
  reviewStatus: z.literal("APPROVED"), approvalRef: z.string().trim().min(1).max(200),
  tier: z.enum(["T1_GENERAL", "T2_OPERATIONAL", "T3_HR_SENSITIVE", "T3_TECHNICAL"]),
  classification: z.enum(["operational", "technical"]), allowedProfiles: z.array(AuthorizationProfileSchema).min(1).max(9),
  validFrom: z.string().datetime({ offset: true }), validUntil: z.string().datetime({ offset: true }).nullable(),
  revokedAt: z.string().datetime({ offset: true }).nullable(), scopeKind: z.enum(["global", "stores"]),
  storeIds: z.array(z.string().regex(/^[a-f0-9]{24}$/)).max(500),
}).strict().superRefine((acl, context) => {
  const profiles = new Set(acl.allowedProfiles);
  if (acl.tier === "T1_GENERAL" && profiles.size !== AuthorizationProfileSchema.options.length) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedProfiles"], message: "T1_GENERAL must allow all nine profiles" });
  }
  if (acl.tier === "T2_OPERATIONAL" && profiles.has("system_admin")) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedProfiles"], message: "T2_OPERATIONAL cannot grant system_admin" });
  }
  if (acl.tier === "T3_HR_SENSITIVE" && (profiles.size !== 1 || !profiles.has("hr"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedProfiles"], message: "T3_HR_SENSITIVE is restricted to hr" });
  }
  if (acl.tier === "T3_TECHNICAL" && (profiles.size !== 1 || !profiles.has("system_admin"))) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["allowedProfiles"], message: "T3_TECHNICAL is restricted to system_admin" });
  }
  if (acl.tier === "T1_GENERAL" && acl.classification !== "operational") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["classification"], message: "T1_GENERAL must use operational classification" });
  }
  if (acl.tier === "T2_OPERATIONAL" && acl.classification !== "operational") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["classification"], message: "T2_OPERATIONAL must use operational classification" });
  }
  if (acl.tier === "T3_HR_SENSITIVE" && acl.classification !== "operational") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["classification"], message: "T3_HR_SENSITIVE must use operational classification" });
  }
  if (acl.tier === "T3_TECHNICAL" && acl.classification !== "technical") {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["classification"], message: "T3_TECHNICAL must use technical classification" });
  }
  if (acl.validUntil !== null && Date.parse(acl.validFrom) >= Date.parse(acl.validUntil)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["validUntil"], message: "validUntil must be after validFrom" });
  }
  if (acl.scopeKind === "global" && acl.storeIds.length !== 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["storeIds"], message: "global ACL cannot carry storeIds" });
  }
  if (acl.scopeKind === "stores" && acl.storeIds.length === 0) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["storeIds"], message: "store-scoped ACL requires storeIds" });
  }
});

// An approved ACL envelope must be maintained outside model/prompt authority.
export function documentAllowed(user: AuthenticatedUser, document: any, capability: "policies.read" | "attachments.read" = "policies.read"): boolean {
  const parsed = AclSchema.safeParse(document.acl);
  if (!hasCapability(user, capability) || !parsed.success) return false;
  const acl = parsed.data;
  if (!user.authorization || !acl.allowedProfiles.includes(user.authorization.profile)) return false;
  if (Date.parse(acl.validFrom) > Date.now() || acl.validUntil && Date.parse(acl.validUntil) <= Date.now() || acl.revokedAt) return false;
  if (acl.scopeKind === "global") return true;
  if (acl.scopeKind !== "stores" || !Array.isArray(acl.storeIds)) return false;
  const stores = allowedStoreIds(user, capability);
  return acl.storeIds.some((id: unknown) => stores.includes(String(id)));
}
export function documentReceipt(document: any) {
  return { documentId: String(document._id), digest: digest({ acl: document.acl, title: document.title, version: document.version,
    content: document.content, chunks: document.chunks, attachments: document.attachments }) };
}
const STOPWORDS = new Set(("la cua va cho voi thi ma nhu de den tu trong mot cac nhung hay khi nao vi sao the nao toi ban minh chung em anh chi o cai gi co khong duoc lam ra vao ra se da dang can phai nen roi cung rat qua moi nay do day hom thang nam").split(" "));
const SYNONYMS: Array<[RegExp, string[]]> = [
  [/nghỉ\s*phép|phép\s*năm|annual\s*leave/i, ["phép", "nghỉ", "leave"]],
  [/lương|thu\s*nhập|salary|payroll/i, ["lương", "thu nhập", "salary", "bảng lương"]],
  [/chấm\s*công|điểm\s*danh|giờ\s*công/i, ["chấm công", "điểm danh", "giờ công"]],
  [/kỷ\s*luật|nội\s*quy|vi\s*phạm/i, ["kỷ luật", "nội quy", "vi phạm"]],
  [/đồng\s*phục|trang\s*phục/i, ["đồng phục", "trang phục"]],
  [/tăng\s*ca|làm\s*thêm|overtime/i, ["tăng ca", "làm thêm", "overtime"]],
  [/nghỉ\s*việc|thôi\s*việc|resign/i, ["nghỉ việc", "thôi việc", "resign"]],
  [/đào\s*tạo|huấn\s*luyện|training/i, ["đào tạo", "huấn luyện", "training"]],
];
function normalizeText(value: unknown): string {
  return String(value ?? "").normalize("NFC").toLocaleLowerCase("vi")
    .replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
}
function termsOf(text: string): string[] {
  return [...new Set(normalizeText(text).split(" ").filter((term) => term.length > 1 && !STOPWORDS.has(term)))].slice(0, 40);
}
function expand(query: string): string[] {
  const base = termsOf(query);
  const extra: string[] = [];
  for (const [pattern, words] of SYNONYMS) if (pattern.test(query)) extra.push(...words.flatMap((word) => termsOf(word)));
  return [...new Set([...base, ...extra])].slice(0, 60);
}
function countTerm(tokens: string[], term: string): number {
  return tokens.reduce((count, token) => count + (token === term ? 1 : 0), 0);
}
function scoreText(queryTerms: string[], phrase: string, title: string, text: string): number {
  const titleTokens = termsOf(title), bodyTokens = termsOf(text);
  if (!queryTerms.length) return 0;
  let score = 0, matched = 0;
  for (const term of queryTerms) {
    const inTitle = countTerm(titleTokens, term), inBody = countTerm(bodyTokens, term);
    if (inTitle || inBody) matched += 1;
    score += inTitle * 3 + (inBody ? 1 + Math.log(inBody) : 0);
  }
  const coverage = matched / queryTerms.length;
  score += coverage * 2;
  const normalizedPhrase = normalizeText(phrase);
  if (normalizedPhrase.length > 3 && normalizeText(text).includes(normalizedPhrase)) score += 5;
  return score;
}
function bestChunks(queryTerms: string[], content: unknown, chunks: unknown): string {
  return bestChunkMeta(queryTerms, content, chunks).text;
}

/** Chọn chunk tốt nhất kèm article + score để citation chỉ đúng điều khoản. */
function bestChunkMeta(queryTerms: string[], content: unknown, chunks: unknown): { text: string; article: string | null; score: number | null } {
  const pool: { text: string; article: string | null }[] = [];
  if (typeof content === "string" && content.trim()) pool.push({ text: content.trim(), article: null });
  if (Array.isArray(chunks)) for (const chunk of chunks) {
    const text = typeof chunk === "string" ? chunk : typeof chunk?.text === "string" ? chunk.text : "";
    const article = typeof chunk === "object" && chunk !== null && typeof chunk?.article === "string" ? chunk.article : null;
    if (text.trim()) pool.push({ text: text.trim(), article });
  }
  if (!pool.length) return { text: "", article: null, score: null };
  if (pool.length === 1) return { text: pool[0].text.slice(0, 6000), article: pool[0].article, score: null };
  const ranked = pool.map((item) => ({ ...item, score: scoreText(queryTerms, "", "", item.text) }))
    .sort((a, b) => b.score - a.score).filter((row) => row.score > 0).slice(0, 2);
  const selected = (ranked.length ? ranked : pool.slice(0, 1).map((item) => ({ ...item, score: 0 })));
  return {
    text: selected.map((row) => row.text).join(String.fromCharCode(10, 10)).slice(0, 6000),
    article: selected[0].article,
    score: selected[0].score > 0 ? selected[0].score : null,
  };
}

export async function approvedDocuments(user: AuthenticatedUser, query = "") {
  if (!hasCapability(user, "policies.read")) return [];
  const metadata = await mongoose.connection.collection("policies").find({ "acl.reviewStatus": "APPROVED", "acl.allowedProfiles": user.authorization!.profile,
    "acl.classification": { $in: ["operational", "technical"] } }, { projection: { acl: 1 } }).limit(500).toArray();
  const ids = metadata.filter((document) => documentAllowed(user, document)).map((document) => document._id);
  if (!ids.length) return [];
  // Only ACL-approved IDs are allowed into content retrieval. Recheck the ACL
  // from the content snapshot as well, in case it changed between the two reads.
  const candidates = await mongoose.connection.collection("policies").find({ _id: { $in: ids } },
    { projection: { title: 1, version: 1, content: 1, chunks: 1, acl: 1, attachments: 1 } }).toArray();
  // Filter BEFORE text scoring/projection/context/provider. Missing ACL never means public.
  const queryTerms = expand(query);
  const allowed = candidates.filter((document) => documentAllowed(user, document));
  const scored = allowed.map((document: any) => {
    const best = bestChunkMeta(queryTerms, document.content, document.chunks);
    const enriched = { ...document, __bestArticle: best.article ?? null, __bestScore: best.score ?? null };
    return { document: enriched, text: best.text, score: scoreText(queryTerms, query, String(document.title ?? ""), best.text), article: best.article };
  });
  if (!queryTerms.length) return scored.slice(0, 5);
  const positive = scored.filter((row) => row.score > 0).sort((a, b) => b.score - a.score);
  if (!positive.length) return [];
  const floor = Math.max(1, positive[0].score * 0.3);
  return positive.filter((row) => row.score >= floor).slice(0, 5);
}
export async function authorizeAttachment(user: AuthenticatedUser, category: string, filename: string): Promise<void> {
  const candidates = await mongoose.connection.collection("policies").find({ "attachments": { $elemMatch: { category, filename } }, "acl.reviewStatus": "APPROVED" },
    { projection: { acl: 1 } }).limit(20).toArray();
  if (!candidates.some((document) => documentAllowed(user, document, "attachments.read"))) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tài liệu được phép truy cập.");
}

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
  const terms = query.toLocaleLowerCase("vi").split(/\s+/).filter((term) => term.length > 2).slice(0, 30);
  const allowed = candidates.filter((document) => documentAllowed(user, document));
  return allowed.map((document) => {
    const text = [typeof document.content === "string" ? document.content : "", ...(Array.isArray(document.chunks) ? document.chunks.map((chunk: any) => typeof chunk.text === "string" ? chunk.text : "") : [])].join("\n");
    const score = terms.filter((term) => (String(document.title) + " " + text).toLocaleLowerCase("vi").includes(term)).length;
    return { document, text, score };
  }).filter((row) => !terms.length || row.score > 0).sort((a, b) => b.score - a.score).slice(0, 5);
}
export async function authorizeAttachment(user: AuthenticatedUser, category: string, filename: string): Promise<void> {
  const candidates = await mongoose.connection.collection("policies").find({ "attachments": { $elemMatch: { category, filename } }, "acl.reviewStatus": "APPROVED" },
    { projection: { acl: 1 } }).limit(20).toArray();
  if (!candidates.some((document) => documentAllowed(user, document, "attachments.read"))) throw new WorkflowError(404, "RESOURCE_NOT_FOUND", "Không tìm thấy tài liệu được phép truy cập.");
}

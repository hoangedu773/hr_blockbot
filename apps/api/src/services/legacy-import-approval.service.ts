import { z } from "zod";
import { AuthorizationProfileSchema } from "@hr-blockbot/contracts";
import { digest } from "./project-audit.service.js";
const Id = z.string().regex(/^[a-f0-9]{24}$/);
export const LegacyApprovalTermsSchema = z.object({
  purpose: z.literal("LEGACY_IMPORT"), batchId: z.string().min(1).max(150), targetDatabase: z.string().min(1),
  userId: Id, employeeId: Id, profile: AuthorizationProfileSchema,
  approvalKind: z.enum(["TEST_ONLY", "OWNER_MANIFEST"]), authorityRef: z.string().min(1).max(200),
  stageRefs: z.object({ accountState: z.string().min(1), profileAssignment: z.string().min(1), managementRelation: z.string().min(1), explicitGrant: z.string().min(1) }).strict()
    .refine(value => new Set(Object.values(value)).size === 4, "Four separate stage decisions required"),
  authorizationHash: z.string().regex(/^[a-f0-9]{64}$/), storeIds: z.array(Id).min(1).max(500),
  validFrom: z.string().datetime(), validUntil: z.string().datetime(),
}).strict().refine(value => Date.parse(value.validUntil) > Date.parse(value.validFrom));
export function legacyApprovalTerms(row: any) {
  const keys = ["purpose", "batchId", "targetDatabase", "userId", "employeeId", "profile", "approvalKind", "authorityRef", "stageRefs", "authorizationHash", "storeIds", "validFrom", "validUntil"];
  return LegacyApprovalTermsSchema.parse(Object.fromEntries(keys.map(key => [key, ["userId", "employeeId"].includes(key) ? String(row[key]) : row[key]])));
}
export function legacyApprovalIntact(row: any): boolean {
  try {
    const terms = legacyApprovalTerms(row);
    if (row.termsHash !== digest(terms) || !Number.isSafeInteger(row.version) || row.version < 1) return false;
    let previous = "0".repeat(64);
    for (const event of row.history ?? []) { const { hash, ...payload } = event; if (payload.previousHash !== previous || digest(payload) !== hash || payload.termsHash !== row.termsHash) return false; previous = hash; }
    const last = row.history?.at(-1);
    return !!last && last.stateHash === digest({ status: row.status, version: row.version });
  } catch { return false; }
}
export function legacyApprovalBindsUser(row: any, user: any): boolean {
  const invitation = user.legacyImportActivation;
  return legacyApprovalIntact(row) && row.status === "APPROVED" && String(row._id) === String(user.legacyImportApprovalId) && invitation?.approvalId === String(row._id) &&
    String(row.userId) === String(user._id) && String(row.employeeId) === String(user.employeeId) && invitation?.purpose === "LEGACY_IMPORT" &&
    invitation.approvalVersion === row.version && invitation.approvalTermsHash === row.termsHash && invitation.batchId === row.batchId;
}

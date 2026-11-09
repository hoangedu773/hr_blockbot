import mongoose from "mongoose";
import type { AuthorizationCapability } from "@hr-blockbot/contracts";
import { UserModel } from "../models/User.js";
import { resolvePrincipal, securityVersion } from "./principal.service.js";
import { requireCapability, resourceScope } from "./authorization-scope.service.js";
import { notifyUser } from "./notification.service.js";

type Notice = { title: string; body: string; dedupeKey: string; entityId: string; severity?: "INFO" | "ACTION_REQUIRED" | "URGENT" };

/**
 * In-app notice to people who CURRENTLY hold `capability` on `storeId`.
 * Candidates come from explicit store grants and are re-authorized through the
 * normal principal resolver; this never grants anything. Failures are swallowed:
 * the workflow state is the source of truth, a notice is only a pointer to it.
 */
const candidateCapabilities = (capability: AuthorizationCapability): AuthorizationCapability[] =>
  capability === "employees.transfer"
    ? ["employees.transfer", "employees.transfer_confirm", "projects.assign"]
    : capability === "employees.lifecycle_request"
      ? ["employees.lifecycle_request", "onboarding.propose", "employees.transfer_confirm"]
      : [capability];

export async function notifyStoreCapable(capability: AuthorizationCapability, storeId: string, notice: Notice, options: { excludeUserIds?: string[]; profiles?: string[]; requireManaged?: boolean } = {}) {
  try {
    if (!mongoose.Types.ObjectId.isValid(storeId)) return 0;
    const exclude = new Set(options.excludeUserIds ?? []);
    const candidates: any[] = await UserModel.find({ status: { $ne: "disabled" }, "authorization.grants": { $elemMatch: { capabilities: { $in: candidateCapabilities(capability) }, revokedAt: null, "scope.storeIds": storeId } } })
      .select("_id role securityVersion authorization.profile employeeId").limit(50).lean();
    let sent = 0;
    for (const candidate of candidates) {
      const id = String(candidate._id);
      if (exclude.has(id) || options.profiles && !options.profiles.includes(candidate.authorization?.profile)) continue;
      try {
        const principal = await resolvePrincipal({ sub: id, role: candidate.role, securityVersion: securityVersion(candidate) });
        requireCapability(principal, capability, resourceScope(principal, { storeId, storeMappingRef: "verified" }));
        if (options.requireManaged && !principal.canonical?.managedByStore[storeId]?.length) continue;
        const result = await notifyUser({ userId: id, employeeId: principal.employeeId ?? null, type: "system", title: notice.title, body: notice.body,
          dedupeKey: notice.dedupeKey, entityKind: "personnel", entityId: notice.entityId, severity: notice.severity ?? "ACTION_REQUIRED", actionRef: "lifecycle" });
        if (result.created) sent++;
      } catch { /* not currently authorized: skip silently */ }
    }
    return sent;
  } catch { return 0; }
}

export async function notifyUserSafe(userId: string | null | undefined, notice: Notice) {
  if (!userId) return;
  try { await notifyUser({ userId, type: "system", title: notice.title, body: notice.body, dedupeKey: notice.dedupeKey, entityKind: "personnel", entityId: notice.entityId, severity: notice.severity ?? "INFO", actionRef: "lifecycle" }); }
  catch { /* best effort */ }
}

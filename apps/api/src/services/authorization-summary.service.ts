import { AuthorizationCapabilitySchema, AuthorizationSummarySchema } from "@hr-blockbot/contracts";
import type { AuthenticatedUser } from "../middlewares/auth.middleware.js";
import { AUTHORIZATION_POLICY, evaluateAuthorization, type AuthorizationPrincipal } from "./authorization-policy.service.js";
import { allowedStoreIds, hasCapability } from "./authorization-scope.service.js";

export function authorizationSummary(user: AuthenticatedUser) {
  const principal: AuthorizationPrincipal = {
    ...user, employeeId: user.employeeId ?? null,
    securityVersion: user.securityVersion ?? 0, accountActive: user.accountActive === true,
    employeeActive: user.employeeActive === true, authorization: user.authorization ?? null,
  };
  const profile = principal.authorization?.profile ?? null;
  return AuthorizationSummarySchema.parse({
    configured: !!principal.authorization, profile, securityVersion: principal.securityVersion,
    enforcement: "MIGRATING",
    capabilities: AuthorizationCapabilitySchema.options.filter((capability) => hasCapability(user, capability)),
    pendingCapabilities: AuthorizationCapabilitySchema.options.filter((capability) => AUTHORIZATION_POLICY[capability].status === "PENDING" && !!profile && AUTHORIZATION_POLICY[capability].profiles.includes(profile)),
    grants: principal.authorization?.grants ?? [],
    stores: (user.canonical?.verifiedStores ?? []).map((store) => ({ id: store.id, name: store.name, departmentId: store.departmentId, regionId: store.regionId,
      capabilities: AuthorizationCapabilitySchema.options.filter((capability) => allowedStoreIds(user, capability).includes(store.id)) })).filter((store) => store.capabilities.length > 0),
    delegations: (user.effectiveDelegations ?? []).map((item) => ({ id: item.delegationId, capabilities: item.grant.capabilities, validUntil: item.grant.validUntil })),
  });
}

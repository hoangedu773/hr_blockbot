import type { StoreManager } from "@hr-blockbot/contracts";

type Person = {
  _id: unknown;
  fullName?: string;
  full_name?: string;
  job_title?: string;
  storeId?: unknown;
  storeIds?: unknown[];
  smCoverRef?: string;
  hrmProfileMappingV1?: {
    identityMappingVerified?: boolean;
    sourceTitleVerified?: boolean;
    sourceJobTitle?: string;
  };
};
type Relation = { managerEmployeeId: unknown; storeId: unknown; validUntil?: Date | null };

/** Business-title display only, independent of account profiles and grants. */
function personnelRole(person: Person): StoreManager["role"] {
  const source = person.hrmProfileMappingV1;
  if (source?.identityMappingVerified !== true || source.sourceTitleVerified !== true
    || typeof source.sourceJobTitle !== "string" || typeof person.job_title !== "string") return "unknown";
  const title = source.sourceJobTitle.trim().normalize("NFC").toUpperCase();
  // A historical verification must not silently classify a subsequently changed title.
  if (person.job_title.trim().normalize("NFC").toUpperCase() !== title) return "unknown";
  const roles: Record<string, StoreManager["role"]> = {
    SM: "sm", "CỬA HÀNG TRƯỞNG": "sm", AM: "am", SAM: "sam", OM: "om", AOM: "aom",
    PTCH: "ptch", "PHỤ TRÁCH CỬA HÀNG": "ptch",
  };
  return (title && Object.hasOwn(roles, title) ? roles[title] : undefined) ?? "unknown";
}

/** Caller supplies only approved, currently effective relations and active mapped personnel. */
export function groupStoreManagers(people: Person[], relations: Relation[]): Map<string, StoreManager[]> {
  const peopleById = new Map(people.map((person) => [String(person._id), person]));
  const groups = new Map<string, Map<string, StoreManager>>();
  for (const relation of relations) {
    const employeeId = String(relation.managerEmployeeId), storeId = String(relation.storeId);
    const person = peopleById.get(employeeId);
    if (!person) continue;
    const role = personnelRole(person);
    const assignmentKind = role === "sm"
      ? String(person.storeId) === storeId ? "home"
        : typeof person.smCoverRef === "string" && person.smCoverRef.trim()
          && Array.isArray(person.storeIds) && person.storeIds.some((id) => String(id) === storeId) ? "cover" : "unclassified"
      : role === "unknown" ? "unclassified" : "supervisory";
    const managers = groups.get(storeId) ?? new Map<string, StoreManager>();
    const existing = managers.get(employeeId);
    const until = relation.validUntil ? new Date(relation.validUntil).toISOString() : null;
    managers.set(employeeId, {
      employeeId, fullName: person.fullName || person.full_name || employeeId, role, assignmentKind,
      // End of the currently supported graph relation, not a fabricated appointment term.
      relationValidUntil: existing
        ? existing.relationValidUntil === null || until === null ? null
          : [existing.relationValidUntil!, until].sort().at(-1)!
        : until,
    });
    groups.set(storeId, managers);
  }
  return new Map([...groups].map(([storeId, managers]) => [storeId, [...managers.values()]
    .sort((a, b) => a.fullName.localeCompare(b.fullName, "vi") || a.employeeId.localeCompare(b.employeeId))]));
}

export function summarizeStoreLeadership(managers: StoreManager[]) {
  const homeManagers = managers.filter((manager) => manager.role === "sm" && manager.assignmentKind === "home");
  const primary = homeManagers.length === 1 ? homeManagers[0] : null;
  return {
    managerName: primary?.fullName ?? null,
    managerEmployeeId: primary?.employeeId ?? null,
    storeManagerStatus: homeManagers.length > 1 ? "ambiguous" as const : primary ? "identified" as const : "unconfirmed" as const,
    managers,
  };
}

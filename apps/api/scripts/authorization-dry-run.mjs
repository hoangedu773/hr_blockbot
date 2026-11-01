/** Local JSON only. No dotenv, network client, Mongo URI, or apply mode. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { AuthorizationStateSchema } from "@hr-blockbot/contracts";

const textId = (value) => typeof value === "string" ? value.toLowerCase() : value?.$oid?.toLowerCase() ?? value?.toHexString?.() ?? null;
export function auditAuthorizationSnapshot(snapshot) {
  for (const name of ["users", "employees", "departments", "stores"]) {
    if (!Array.isArray(snapshot?.[name])) throw new Error(`Snapshot requires ${name} array`);
  }
  const issues = [];
  const issue = (collection, id, code) => issues.push({ collection, id: textId(id), code });
  const indexed = (name) => {
    const result = new Map();
    for (const row of snapshot[name]) {
      const id = textId(row._id);
      if (!id) issue(name, row._id, "MISSING_ID");
      else if (result.has(id)) issue(name, row._id, "DUPLICATE_ID");
      else result.set(id, row);
    }
    return result;
  };
  const users = indexed("users"), employees = indexed("employees"), stores = indexed("stores"), departments = indexed("departments");
  const links = new Map();
  for (const [id, user] of users) {
    const employeeId = textId(user.employeeId);
    if (!user.authorization) issue("users", id, "PROFILE_REVIEW_REQUIRED");
    else {
      const parsed = AuthorizationStateSchema.safeParse(user.authorization);
      if (!parsed.success) issue("users", id, "AUTHORIZATION_STATE_INVALID");
      else {
        // Legacy Admin/global flags are not a V1 identity or authority requirement.
        for (const grant of parsed.data.grants) if (!grant.capabilities.length) issue("users", id, "GRANT_CAPABILITIES_UNREVIEWED");
        for (const grant of parsed.data.grants) {
          for (const storeId of grant.scope.storeIds) {
            const store = stores.get(storeId);
            if (!store) issue("users", id, "GRANT_STORE_ORPHAN");
            else if (store.kind !== "outlet" || store.status !== "ACTIVE" || store.deleted_at || !store.scopeApprovalRef) issue("users", id, "GRANT_STORE_UNVERIFIED");
          }
          if (grant.scope.regionIds.length) issue("users", id, "REGION_ASSIGNMENT_REVIEW_REQUIRED");
          if (grant.scope.reportingEmployeeIds.length) issue("users", id, "REPORTING_RELATION_REVIEW_REQUIRED");
          for (const employeeId of grant.scope.reportingEmployeeIds) if (!employees.has(employeeId)) issue("users", id, "REPORTING_EMPLOYEE_ORPHAN");
        }
      }
    }
    if (!["active", "disabled", "pending_activation"].includes(user.status)) issue("users", id, "ACCOUNT_STATUS_UNREVIEWED");
    if (user.securityVersion === undefined) issue("users", id, "SECURITY_VERSION_MISSING");
    if (!employeeId) { if (user.role !== "Admin") issue("users", id, "EMPLOYEE_LINK_MISSING"); continue; }
    if (links.has(employeeId)) issue("users", id, "EMPLOYEE_LINK_DUPLICATE");
    links.set(employeeId, id);
    const employee = employees.get(employeeId);
    if (!employee) issue("users", id, "EMPLOYEE_LINK_ORPHAN");
    else {
      if (employee.status !== "active") issue("users", id, "EMPLOYEE_INACTIVE_OR_UNREVIEWED");
      if (employee.userId && textId(employee.userId) !== id) issue("users", id, "REVERSE_LINK_CONFLICT");
    }
  }
  for (const [id, employee] of employees) {
    const storeId = textId(employee.storeId);
    if (!storeId) {
      const candidates = snapshot.stores.filter((store) => store.store_name && store.store_name === employee.store_raw);
      issue("employees", id, candidates.length === 1 ? "STORE_MAPPING_CANDIDATE_REQUIRES_APPROVAL" : candidates.length > 1 ? "STORE_MAPPING_AMBIGUOUS" : "STORE_MAPPING_MISSING");
    } else if (!stores.has(storeId)) issue("employees", id, "STORE_ORPHAN");
    else if (employee.store_raw && stores.get(storeId).store_name !== employee.store_raw) issue("employees", id, "STORE_SOURCE_MISMATCH_REQUIRES_REVIEW");
    const departmentId = textId(employee.departmentId);
    if (!departmentId || !departments.has(departmentId)) issue("employees", id, "DEPARTMENT_MAPPING_MISSING");
    if (employee.userId && !users.has(textId(employee.userId))) issue("employees", id, "REVERSE_LINK_ORPHAN");
  }
  for (const [id, store] of stores) {
    if (!["outlet", "group", "support"].includes(store.kind) || !["ACTIVE", "INACTIVE"].includes(store.status)) issue("stores", id, "STORE_CLASSIFICATION_UNREVIEWED");
    if (!store.scopeApprovalRef) issue("stores", id, "STORE_SCOPE_EVIDENCE_MISSING");
  }
  for (const project of snapshot.projects ?? []) {
    if (!textId(project.storeId) || !stores.has(textId(project.storeId))) issue("projects", project._id, "PROJECT_STORE_MAPPING_REQUIRED");
  }
  const countsByCode = {};
  for (const finding of issues) countsByCode[finding.code] = (countsByCode[finding.code] ?? 0) + 1;
  return { mode: "DRY_RUN", mutations: 0, autoGrantedProfiles: 0,
    sourceCounts: Object.fromEntries(["users", "employees", "departments", "stores"].map((name) => [name, snapshot[name].length])),
    countsByCode, issues: issues.sort((a, b) => `${a.collection}/${a.id}/${a.code}`.localeCompare(`${b.collection}/${b.id}/${b.code}`)),
    limitations: ["Snapshot audit, not live Atlas verification", "No role/title inference or automatic management assignments", "No apply/rollback command; reviewed migration manifest required before writes", "Reports contain internal IDs; keep outside public repositories"],
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2 || args[0] !== "--snapshot" || /^(mongodb|https?):/i.test(args[1])) {
    console.error("Usage: node scripts/authorization-dry-run.mjs --snapshot <local-json-path>; no network/apply mode");
    process.exitCode = 1;
  } else {
    try { console.log(JSON.stringify(auditAuthorizationSnapshot(JSON.parse(await readFile(args[1], "utf8"))), null, 2)); }
    catch { console.error("Unable to audit local snapshot; check JSON shape and file access"); process.exitCode = 1; }
  }
}

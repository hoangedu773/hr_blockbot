import mongoose from "mongoose";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

const CORE_COLLECTIONS = [
  "users", "employees", "stores", "departments", "authorization_regions",
  "management_relations", "authorization_controls", "legacy_import_approvals", "policies",
  "settings", "revenue_kpi_grants", "performance_kpi_grants", "pos_orders",
  "operational_shift_definitions", "operational_schedule_weeks",
  "chat_conversations", "chat_conversation_turns", "chat_authorization_requests",
  "revenue_kpi_periods", "revenue_kpi_assignments", "revenue_kpi_results",
  "revenue_kpi_open_actions", "notifications",
  "performance_kpi_frameworks", "performance_kpi_policies",
  "task_templates", "task_instances", "task_evaluations",
  "performance_kpi_events",
];
const STATUS = { PASS: "PASS", FAIL: "FAIL", WARN: "WARN", INFO: "INFO" };
const hasText = (value) => typeof value === "string" && value.trim().length > 0;
const textId = (value) => value == null ? "" : String(value);
const addCheck = (checks, code, status, message, details) => checks.push({ code, status, message, ...(details ? { details } : {}) });
const hasMatchingUniqueIndex = (index, field, expectedPartial) => {
  if (index?.unique !== true) return false;
  const key = index.key ?? {};
  if (Object.keys(key).length !== 1 || key[field] !== 1) return false;
  if (expectedPartial == null) {
    return !index.partialFilterExpression || Object.keys(index.partialFilterExpression).length === 0;
  }
  return isDeepStrictEqual(index.partialFilterExpression, expectedPartial);
};

function databaseFrom(connection) {
  if (connection?.db?.collection) return connection.db;
  if (connection?.collection && connection?.client) return connection;
  throw new TypeError("Expected a connected MongoDB database or Mongoose connection");
}

async function collectionNames(db) {
  return new Set((await db.listCollections({}, { nameOnly: true }).toArray()).map(({ name }) => name));
}

async function collectionIndexes(db, name) {
  if (!(await collectionNames(db)).has(name)) return [];
  return db.collection(name).indexes();
}

function containsManagementCycle(relations) {
  const graphs = new Map();
  for (const { storeId, managerEmployeeId, employeeId } of relations) {
    const scope = textId(storeId), manager = textId(managerEmployeeId), employee = textId(employeeId);
    if (!manager || !employee) continue;
    if (!graphs.has(scope)) graphs.set(scope, new Map());
    const graph = graphs.get(scope);
    if (!graph.has(manager)) graph.set(manager, []);
    if (!graph.has(employee)) graph.set(employee, []);
    graph.get(manager).push(employee);
  }
  for (const graph of graphs.values()) {
    const indegree = new Map([...graph.keys()].map((node) => [node, 0]));
    for (const children of graph.values()) for (const child of children) indegree.set(child, indegree.get(child) + 1);
    const queue = [...indegree].filter(([, degree]) => degree === 0).map(([node]) => node);
    let visited = 0;
    for (let index = 0; index < queue.length; index += 1) {
      const node = queue[index];
      visited += 1;
      for (const child of graph.get(node)) {
        indegree.set(child, indegree.get(child) - 1);
        if (indegree.get(child) === 0) queue.push(child);
      }
    }
    if (visited !== graph.size) return true;
  }
  return false;
}

async function checkUniqueIndexes(db, checks) {
  const requirements = [
    {
      collection: "departments",
      code: "DEPARTMENTS_CREATION_KEY_INDEX",
      field: "creationKey",
      expectedPartial: { creationKey: { $type: "string" } },
    },
    {
      collection: "users",
      code: "USERS_USERNAME_INDEX",
      field: "username",
      expectedPartial: null,
    },
    {
      collection: "users",
      code: "USERS_EMPLOYEE_ID_INDEX",
      field: "employeeId",
      expectedPartial: { employeeId: { $type: "objectId" } },
    },
    {
      collection: "employees",
      code: "EMPLOYEES_PERSONNEL_KEY_INDEX",
      field: "personnelKey",
      expectedPartial: { personnelKey: { $type: "string" } },
    },
    {
      collection: "onboarding_requests",
      code: "ONBOARDING_EMPLOYEE_KEY_INDEX",
      field: "employeeKey",
      expectedPartial: null,
    },
  ];
  const indexesByCollection = new Map();
  for (const { collection, code, field, expectedPartial } of requirements) {
    if (!indexesByCollection.has(collection)) indexesByCollection.set(collection, await collectionIndexes(db, collection));
    const indexes = indexesByCollection.get(collection);
    const found = indexes.some((index) => hasMatchingUniqueIndex(index, field, expectedPartial));
    addCheck(checks, code, found ? STATUS.PASS : STATUS.FAIL,
      found ? `Unique index for ${collection}.${field} exists.` : `Required unique index for ${collection}.${field} is missing.`);
  }
}

export async function auditDatabaseReadiness(conn, options = {}) {
  const target = databaseFrom(conn);
  const targetDb = options.targetDb ?? options.targetDatabase ?? target.databaseName ?? conn.name ?? null;
  const client = conn.getClient?.() ?? conn.client ?? target.client;
  const baseline = options.baselineDb
    ? typeof options.baselineDb === "string" ? client?.db(options.baselineDb) : databaseFrom(options.baselineDb)
    : null;
  const baselineDb = baseline ? typeof options.baselineDb === "string" ? options.baselineDb : baseline.databaseName : null;
  const checks = [], comparison = [];
  addCheck(checks, "TARGET_DATABASE_NAME", hasText(targetDb) ? STATUS.PASS : STATUS.FAIL,
    hasText(targetDb) ? "Target database name is resolved." : "Target database name could not be resolved.");

  if (baseline) {
    const [targetNames, baselineNames] = await Promise.all([collectionNames(target), collectionNames(baseline)]);
    for (const name of CORE_COLLECTIONS) {
      const targetExists = targetNames.has(name), baselineExists = baselineNames.has(name);
      const [targetCount, baselineCount] = await Promise.all([
        targetExists ? target.collection(name).estimatedDocumentCount() : Promise.resolve(null),
        baselineExists ? baseline.collection(name).estimatedDocumentCount() : Promise.resolve(null),
      ]);
      const same = targetExists === baselineExists && (!targetExists || targetCount === baselineCount);
      comparison.push({ collection: name, status: same ? STATUS.PASS : STATUS.FAIL, targetExists, baselineExists, targetCount, baselineCount });
    }
    const differences = comparison.filter((item) => item.status !== STATUS.PASS).length;
    addCheck(checks, "CORE_COLLECTION_COMPARISON", differences ? STATUS.FAIL : STATUS.PASS,
      differences ? `${differences} core collection(s) differ from baseline; review comparison details.` : "Core collection presence and estimated counts match baseline.",
      { compared: comparison.length, differences });
  } else {
    addCheck(checks, "CORE_COLLECTION_COMPARISON", STATUS.INFO, "No baseline database supplied; comparison was skipped.");
  }

  await checkUniqueIndexes(target, checks);

  const controls = target.collection("authorization_controls");
  for (const [id, code] of [["crm-writers", "CRM_WRITERS_LOCK"], ["account-security", "ACCOUNT_SECURITY_LOCK"]]) {
    const row = await controls.findOne({ _id: id }, { projection: { locked: 1 } });
    const locked = row?.locked === true;
    addCheck(checks, code, locked ? STATUS.FAIL : STATUS.PASS,
      locked ? `Distributed control ${id} is locked.` : `Distributed control ${id} is not locked.`);
  }

  const users = target.collection("users"), employees = target.collection("employees");
  const activeLegacyUsers = await users.find({ status: "active", "legacyImportActivation.state": "CONSUMED", legacyImportApprovalId: { $ne: null } },
    { projection: { legacyImportApprovalId: 1 } }).toArray();
  const approvalIds = activeLegacyUsers.map(({ legacyImportApprovalId }) => legacyImportApprovalId).filter((id) => id != null);
  const approvals = approvalIds.length ? await target.collection("legacy_import_approvals").find({ _id: { $in: approvalIds } },
    { projection: { targetDatabase: 1 } }).toArray() : [];
  const approvalsById = new Map(approvals.map((row) => [textId(row._id), row]));
  const legacyMismatches = activeLegacyUsers.filter((user) => {
    const approval = approvalsById.get(textId(user.legacyImportApprovalId));
    return !approval || approval.targetDatabase !== targetDb;
  }).length;
  addCheck(checks, "LEGACY_IMPORT_TARGET_DATABASE", legacyMismatches ? STATUS.FAIL : STATUS.PASS,
    legacyMismatches ? `${legacyMismatches} consumed active legacy import approval(s) are missing or bound to another database.` : "Consumed active legacy imports are bound to target database.",
    { affectedUsers: legacyMismatches });

  const activeUsers = await users.find({ status: "active", employeeId: { $ne: null } }, { projection: { employeeId: 1 } }).toArray();
  const employeeIds = [...new Map(activeUsers.map((row) => [textId(row.employeeId), row.employeeId])).values()];
  const linkedEmployees = employeeIds.length ? await employees.find({ _id: { $in: employeeIds } },
    { projection: { status: 1, storeMappingRef: 1, storeId: 1, lifecyclePendingRequestId: 1 } }).toArray() : [];
  const employeeById = new Map(linkedEmployees.map((row) => [textId(row._id), row]));
  const lifecycleIds = [...new Map(linkedEmployees.filter((row) => row.lifecyclePendingRequestId && /^[a-f\d]{24}$/i.test(textId(row.lifecyclePendingRequestId)))
    .map((row) => [textId(row.lifecyclePendingRequestId), row.lifecyclePendingRequestId])).values()];
  const completedLifecycle = lifecycleIds.length ? await target.collection("employee_lifecycle_requests").find({ _id: { $in: lifecycleIds }, status: "COMPLETED" },
    { projection: { _id: 1 } }).toArray() : [];
  const completedLifecycleIds = new Set(completedLifecycle.map((row) => textId(row._id)));
  const storeIds = [...new Map(linkedEmployees.filter((row) => row.storeId != null).map((row) => [textId(row.storeId), row.storeId])).values()];
  const canonicalStores = storeIds.length ? await target.collection("stores").find({ _id: { $in: storeIds }, kind: "outlet", status: "ACTIVE", deleted_at: null,
    scopeApprovalRef: { $type: "string", $ne: "" } }, { projection: { _id: 1 } }).toArray() : [];
  const canonicalStoreIds = new Set(canonicalStores.map((row) => textId(row._id)));
  const invalidUserLinks = activeUsers.filter((user) => {
    const employee = employeeById.get(textId(user.employeeId));
    return !employee || employee.status !== "active" || !hasText(employee.storeMappingRef) || !canonicalStoreIds.has(textId(employee.storeId)) ||
      (employee.lifecyclePendingRequestId != null && !completedLifecycleIds.has(textId(employee.lifecyclePendingRequestId)));
  }).length;
  addCheck(checks, "ACTIVE_USER_CANONICAL_EMPLOYEE", invalidUserLinks ? STATUS.FAIL : STATUS.PASS,
    invalidUserLinks ? `${invalidUserLinks} active user(s) lack an active canonical employee, approved outlet mapping, or completed lifecycle.` : "Active user employee links have active employees, approved outlet mappings, and no pending lifecycle fence.",
    { invalidLinks: invalidUserLinks });

  const invalidStores = await target.collection("stores").countDocuments({ kind: "outlet", status: "ACTIVE", $or: [
    { scopeApprovalRef: { $exists: false } }, { scopeApprovalRef: null }, { scopeApprovalRef: "" },
    { $expr: { $ne: [{ $type: "$scopeApprovalRef" }, "string"] } },
  ] });
  addCheck(checks, "ACTIVE_OUTLET_SCOPE_APPROVAL", invalidStores ? STATUS.FAIL : STATUS.PASS,
    invalidStores ? `${invalidStores} active outlet store(s) lack scopeApprovalRef.` : "Active outlet stores have scopeApprovalRef.", { invalidStores });

  const now = new Date();
  const activeRelations = await target.collection("management_relations").find({ revokedAt: null, validFrom: { $lte: now },
    $or: [{ validUntil: null }, { validUntil: { $gt: now } }] },
  { projection: { managerEmployeeId: 1, employeeId: 1, storeId: 1 } }).toArray();
  const selfReferences = activeRelations.filter((row) => textId(row.managerEmployeeId) === textId(row.employeeId)).length;
  const hasCycle = containsManagementCycle(activeRelations);
  addCheck(checks, "ACTIVE_MANAGEMENT_RELATIONS", selfReferences || hasCycle ? STATUS.FAIL : STATUS.PASS,
    selfReferences || hasCycle ? `Active management relations contain ${selfReferences} self-reference(s)${hasCycle ? " or a cycle" : ""}.` : "Active management relations contain no self-reference or cycle.",
    { selfReferences, hasCycle });

  const policies = target.collection("policies");
  const [policyCount, approvedPolicyCount] = await Promise.all([
    policies.estimatedDocumentCount(), policies.countDocuments({ "acl.reviewStatus": "APPROVED", "acl.revokedAt": { $exists: true, $eq: null } }),
  ]);
  addCheck(checks, "POLICY_ACL_APPROVED", policyCount > 0 && approvedPolicyCount !== policyCount ? STATUS.FAIL : STATUS.PASS,
    `Policies: ${approvedPolicyCount}/${policyCount} have approved, non-revoked ACLs.`, { total: policyCount, approvedAndNotRevoked: approvedPolicyCount });

  const embeddingDimensions = await policies.aggregate([
    { $unwind: "$chunks" },
    { $project: { dimension: { $cond: [{ $isArray: "$chunks.embedding" }, { $size: "$chunks.embedding" }, null] } } },
    { $group: { _id: "$dimension", count: { $sum: 1 } } },
  ]).toArray();
  const chunkCount = embeddingDimensions.reduce((total, row) => total + row.count, 0);
  const invalidDimensions = embeddingDimensions.filter((row) => row._id !== 3072 && row._id !== null).reduce((total, row) => total + row.count, 0);
  const missingEmbeddings = embeddingDimensions.find((row) => row._id === null)?.count ?? 0;
  const dimensionsFound = Object.fromEntries(embeddingDimensions.map((row) => [row._id === null ? "missing" : String(row._id), row.count]));
  addCheck(checks, "POLICY_EMBEDDING_DIMENSION", invalidDimensions ? STATUS.FAIL : missingEmbeddings ? STATUS.WARN : STATUS.PASS,
    invalidDimensions ? `${invalidDimensions} policy chunk vector(s) are not 3072-dimensional.` : missingEmbeddings ? `${missingEmbeddings} chunk(s) have no embedding; lexical fallback remains available.` : `All ${chunkCount} policy chunk vector(s) are 3072-dimensional.`,
    { chunks: chunkCount, dimensionsFound, invalidDimensions, missingEmbeddings, expectedDimensions: 3072, model: "gemini-embedding-001" });

  const vectorIndex = options.vectorIndex ?? options.vectorIndexName ?? process.env.AI_VECTOR_INDEX_NAME;
  if (!hasText(vectorIndex)) {
    addCheck(checks, "ATLAS_VECTOR_SEARCH_INDEX", STATUS.INFO, "No Atlas Vector Search index name supplied; index check was skipped.");
  } else {
    try {
      const indexes = await policies.listSearchIndexes().toArray();
      const found = indexes.find((index) => index.name === vectorIndex);
      if (!found) addCheck(checks, "ATLAS_VECTOR_SEARCH_INDEX", STATUS.FAIL, "Configured Atlas Vector Search index was not found.");
      else {
        const fields = found.latestDefinition?.fields ?? found.definition?.fields ?? [];
        const vectorField = fields.find((field) => field.type === "vector" && field.path === "chunks.embedding");
        const validDimensions = vectorField?.numDimensions === 3072;
        const ready = found.status === "READY" && found.queryable === true;
        addCheck(checks, "ATLAS_VECTOR_SEARCH_INDEX", !validDimensions ? STATUS.FAIL : ready ? STATUS.PASS : STATUS.WARN,
          !validDimensions ? "Atlas Vector Search index does not define chunks.embedding with 3072 dimensions." : ready ? "Atlas Vector Search index is ready and queryable with 3072 dimensions." : "Atlas Vector Search index exists but is not READY and queryable.",
          { ready, dimensions: vectorField?.numDimensions ?? null, path: vectorField?.path ?? null });
      }
    } catch {
      addCheck(checks, "ATLAS_VECTOR_SEARCH_INDEX", STATUS.WARN, "Vector Search index could not be inspected on this MongoDB deployment.");
    }
  }

  const settings = await target.collection("settings").findOne({ _id: "llm" }, { projection: { providers: 1 } });
  const encryptedProviders = (Array.isArray(settings?.providers) ? settings.providers : []).filter((provider) => hasText(provider?.keyCipher));
  if (!encryptedProviders.length) {
    addCheck(checks, "SETTINGS_ENCRYPTION_KEY", STATUS.INFO, "No encrypted LLM provider keys were found in settings.");
  } else if (!hasText(process.env.SETTINGS_ENCRYPTION_KEY)) {
    addCheck(checks, "SETTINGS_ENCRYPTION_KEY", STATUS.FAIL, "Encrypted provider keys exist but SETTINGS_ENCRYPTION_KEY is absent from this process.", { encryptedProviders: encryptedProviders.length });
  } else {
    try {
      const { decryptApiKey } = await import("../dist/services/crypto.service.js");
      let failed = 0;
      for (const provider of encryptedProviders) {
        try { decryptApiKey(provider.keyCipher); } catch { failed += 1; }
      }
      addCheck(checks, "SETTINGS_ENCRYPTION_KEY", failed ? STATUS.FAIL : STATUS.PASS,
        failed ? `${failed} encrypted provider key(s) could not be decrypted with SETTINGS_ENCRYPTION_KEY.` : "All encrypted provider keys decrypt with SETTINGS_ENCRYPTION_KEY.",
        { encryptedProviders: encryptedProviders.length, failed });
    } catch {
      addCheck(checks, "SETTINGS_ENCRYPTION_KEY", STATUS.FAIL, "API crypto service could not verify encrypted provider keys.", { encryptedProviders: encryptedProviders.length });
    }
  }

  return { ok: !checks.some((entry) => entry.status === STATUS.FAIL), targetDb, baselineDb, checks, comparison };
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json" || argument === "--stdin") options[argument.slice(2)] = true;
    else if (["--target-db", "--baseline-db", "--vector-index"].includes(argument)) {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`Missing value for ${argument}`);
      options[{ "--target-db": "targetDb", "--baseline-db": "baselineDb", "--vector-index": "vectorIndex" }[argument]] = value;
      index += 1;
    } else throw new Error(`Unknown argument ${argument}`);
  }
  return options;
}

async function readStdin() {
  let input = "";
  for await (const chunk of process.stdin) input += chunk;
  const config = JSON.parse(input);
  if (!config || typeof config !== "object" || Array.isArray(config) || (config.uri != null && !hasText(config.uri)) ||
    (config.targetDb != null && !hasText(config.targetDb)) || (config.targetDatabase != null && !hasText(config.targetDatabase)) ||
    (config.baselineDb != null && !hasText(config.baselineDb)) || (config.vectorIndex != null && !hasText(config.vectorIndex))) {
    throw new Error("stdin must contain a JSON object with string connection and database options");
  }
  return config;
}

async function main(argv) {
  let connection;
  try {
    const options = parseArguments(argv);
    const stdinConfig = options.stdin ? await readStdin() : {};
    const uri = stdinConfig.uri ?? process.env.MONGODB_URI ?? process.env.ATLAS_URI;
    if (!hasText(uri)) throw new Error("MongoDB connection configuration is missing");
    const targetDb = options.targetDb ?? stdinConfig.targetDb ?? stdinConfig.targetDatabase;
    const baselineDb = options.baselineDb ?? stdinConfig.baselineDb;
    const vectorIndex = options.vectorIndex ?? stdinConfig.vectorIndex ?? process.env.AI_VECTOR_INDEX_NAME;
    const uriDatabase = decodeURIComponent(new URL(uri).pathname.replace(/^\//, ""));
    const databaseName = targetDb ?? uriDatabase;
    if (!hasText(databaseName)) throw new Error("Target database name is missing; specify --target-db or use a URI with a database name");
    connection = mongoose.createConnection(uri, { dbName: databaseName, autoIndex: false, autoCreate: false, maxPoolSize: 2, serverSelectionTimeoutMS: 8000 });
    await connection.asPromise();
    const result = await auditDatabaseReadiness(connection, { targetDb: databaseName, baselineDb, vectorIndex });
    if (options.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(`Database cutover readiness: ${result.ok ? "PASS" : "FAIL"}`);
      console.log(`Target: ${result.targetDb}; baseline: ${result.baselineDb ?? "not supplied"}`);
      for (const entry of result.checks) console.log(`${entry.status} ${entry.code}: ${entry.message}`);
      for (const row of result.comparison) if (row.status !== STATUS.PASS) console.log(`FAIL COLLECTION_COUNT ${row.collection}: target=${row.targetCount} baseline=${row.baselineCount}`);
    }
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    const category = error?.name === "SyntaxError" ? "invalid JSON input" : error?.code ? `database operation failed (${String(error.code).replace(/[^A-Z0-9_]/gi, "")})` : "invalid arguments or database operation failed";
    console.error(`Database cutover verifier stopped: ${category}`);
    process.exitCode = 1;
  } finally {
    if (connection) await connection.close().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main(process.argv.slice(2));

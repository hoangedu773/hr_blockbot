// Adds F5 KPI capabilities to existing authorization grants without touching
// system_admin. Dry-run by default; pass --apply to write.
import { MongoClient } from "file:///D:/HRBlockbot-private/releases/main-363-20261102T113026/source/node_modules/.pnpm/mongodb@6.20.0/node_modules/mongodb/lib/index.js";
import fs from "node:fs";

const apply = process.argv.includes("--apply");
const uri = process.env.MONGODB_URI;
const dbName = process.env.MONGODB_DB_NAME || "hr_bot_test_363";
if (!uri) { console.error("MONGODB_URI is required"); process.exit(2); }
const SELF = "kpi.read_self";
const MANAGER = ["kpi.read_department", "kpi.manage", "kpi.publish", "kpi.override"];
const MANAGER_PROFILES = new Set(["hr", "om", "sam", "am", "sm", "aom"]);
const client = new MongoClient(uri, { serverSelectionTimeoutMS: 60000, connectTimeoutMS: 20000 });
try {
  await client.connect();
  const users = client.db(dbName).collection("users");
  const rows = await users.find({ "authorization.grants.0": { $exists: true } },
    { projection: { _id: 1, status: 1, "authorization.profile": 1, "authorization.grants": 1 } }).toArray();
  const log = { at: new Date().toISOString(), database: dbName, apply, scanned: rows.length,
    usersTouched: 0, selfAdded: 0, managerAdded: 0, skippedSystemAdmin: 0, skippedRevoked: 0, skippedFull: 0, byProfile: {} };
  const operations = [];
  for (const user of rows) {
    const profile = user.authorization?.profile;
    log.byProfile[profile] ??= { users: 0, touched: 0 };
    log.byProfile[profile].users += 1;
    if (profile === "system_admin") { log.skippedSystemAdmin += 1; continue; }
    let changed = false;
    const grants = (user.authorization?.grants ?? []).map((grant) => {
      if (grant.revokedAt) { log.skippedRevoked += 1; return grant; }
      const wanted = [
        ...(grant.scope?.kind === "self" ? [SELF] : []),
        ...(grant.scope?.kind === "organization" && MANAGER_PROFILES.has(profile) ? MANAGER : []),
      ].filter((capability) => !(grant.capabilities ?? []).includes(capability));
      if (!wanted.length) return grant;
      if ((grant.capabilities?.length ?? 0) + wanted.length > 50) { log.skippedFull += 1; return grant; }
      changed = true;
      for (const capability of wanted) { if (capability === SELF) log.selfAdded += 1; else log.managerAdded += 1; }
      return { ...grant, capabilities: [...(grant.capabilities ?? []), ...wanted] };
    });
    if (changed) {
      log.usersTouched += 1; log.byProfile[profile].touched += 1;
      operations.push({ updateOne: { filter: { _id: user._id }, update: { $set: { "authorization.grants": grants } } } });
    }
  }
  if (apply) for (let index = 0; index < operations.length; index += 200) await users.bulkWrite(operations.slice(index, index + 200), { ordered: false });
  const out = `D:/HRBlockbot-private/atlas-copy-20261101T1450/restore-20261103/kpi-capability-${apply ? "apply" : "dryrun"}-log.json`;
  fs.writeFileSync(out, JSON.stringify(log, null, 2));
  console.log(JSON.stringify(log, null, 2));
} finally { await client.close().catch(() => {}); }

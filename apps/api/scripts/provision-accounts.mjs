/**
 * Cấp phát tài khoản (plan plans/261029-1000-account-provisioning).
 *
 * Mọi bước đều idempotent và **ghi rõ ràng**: không có bước nào tự chạy khi thiếu
 * `--apply`. Chạy từ repo root hoặc từ apps/api (script tự tìm `.env` ở repo root).
 *
 *   node scripts/provision-accounts.mjs backup
 *   node scripts/provision-accounts.mjs admins --apply
 *   node scripts/provision-accounts.mjs delete-legacy --backup <file> --apply
 *   node scripts/provision-accounts.mjs indexes --apply
 *   node scripts/provision-accounts.mjs employees --apply [--limit N]
 *   node scripts/provision-accounts.mjs report
 *
 * Yêu cầu: `npm run build` trong apps/api trước (script đọc model từ dist/).
 * Mật khẩu tạm in ra file CSV trong `data/accounts/` (đã gitignore) — không in ra stdout
 * và không ghi vào log.
 */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import mongoose from "mongoose";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const API_DIR = path.resolve(HERE, "..");
const REPO_ROOT = path.resolve(API_DIR, "../..");

dotenv.config({ path: path.join(REPO_ROOT, ".env") });
dotenv.config({ path: path.join(API_DIR, ".env") });

const { hashPassword } = await import("../dist/services/auth.service.js");
const { derivePassword, describeRule } = await import("./lib/account-rule.mjs");
const { UserModel } = await import("../dist/models/User.js");
const { EmployeeModel } = await import("../dist/models/Employee.js");
const { RefreshSessionModel } = await import("../dist/models/RefreshSession.js");

const ADMIN_USERNAMES = ["hoang", "phi", "hoa"];
const LEGACY_EMAIL_SUFFIX = "@guta.vn";
const BATCH_SIZE = 500;
// Bỏ các ký tự dễ nhìn nhầm khi đọc phiếu mật khẩu in tay (0/O, 1/l/I).
const PASSWORD_ALPHABET = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function timestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function generatePassword(length = 12) {
  let out = "";
  for (let i = 0; i < length; i += 1) {
    out += PASSWORD_ALPHABET[crypto.randomInt(PASSWORD_ALPHABET.length)];
  }
  return out;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeCsv(filePath, header, rows) {
  ensureDir(path.dirname(filePath));
  const escape = (value) => {
    const text = value === null || value === undefined ? "" : String(value);
    return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  };
  const lines = [header.join(","), ...rows.map((row) => row.map(escape).join(","))];
  // BOM để Excel mở đúng tiếng Việt.
  fs.writeFileSync(filePath, "\uFEFF" + lines.join("\r\n") + "\r\n", "utf8");
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = { _: [] };
  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const next = rest[i + 1];
      if (next === undefined || next.startsWith("--")) {
        flags[key] = true;
      } else {
        flags[key] = next;
        i += 1;
      }
    } else {
      flags._.push(token);
    }
  }
  return { command, flags };
}

function getMongoUri() {
  const uri = process.env.MONGODB_URI || process.env.ATLAS_URI;
  if (!uri || uri.trim() === "") {
    throw new Error("MONGODB_URI/ATLAS_URI chưa được cấu hình trong .env");
  }
  return uri.trim();
}

async function connect() {
  // autoIndex=false: index do lệnh `indexes` quản lý tường minh, tránh việc mongoose
  // cố tạo index unique trên dữ liệu chưa dọn xong và làm script chết giữa chừng.
  await mongoose.connect(getMongoUri(), {
    dbName: process.env.MONGODB_DB_NAME || "hr_bot",
    autoIndex: false,
  });
  return mongoose.connection.db;
}

// --- backup ---------------------------------------------------------------------

async function commandBackup(db) {
  const stamp = timestamp();
  const dir = path.join(REPO_ROOT, "data", "backups");
  ensureDir(dir);

  const users = await db.collection("users").find({}).toArray();
  const sessions = await db.collection("refresh_sessions").find({}).toArray();

  const usersFile = path.join(dir, `users-${stamp}.json`);
  const sessionsFile = path.join(dir, `refresh_sessions-${stamp}.json`);
  fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), "utf8");
  fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2), "utf8");

  console.log(`[backup] users=${users.length} -> ${path.relative(REPO_ROOT, usersFile)}`);
  console.log(`[backup] refresh_sessions=${sessions.length} -> ${path.relative(REPO_ROOT, sessionsFile)}`);
  console.log(`[backup] tài khoản: ${users.map((u) => u.email || u.username).join(", ")}`);
  return { usersFile, sessionsFile };
}

// --- admins ---------------------------------------------------------------------

async function commandAdmins(db, flags) {
  const apply = flags.apply === true;
  const rotate = flags.rotate === true;
  const existing = await UserModel.find({ username: { $in: ADMIN_USERNAMES } }).lean();
  const existingByName = new Map(existing.map((u) => [u.username, u]));

  const plan = [];
  for (const username of ADMIN_USERNAMES) {
    const found = existingByName.get(username);
    if (found && !rotate) {
      plan.push({ username, action: "skip (đã tồn tại)", password: null });
      continue;
    }
    plan.push({ username, action: found ? "rotate mật khẩu" : "tạo mới", password: generatePassword(14) });
  }

  for (const row of plan) console.log(`[admins] ${row.username}: ${row.action}`);

  if (!apply) {
    console.log("[admins] DRY RUN — thêm --apply để ghi.");
    return;
  }

  const rows = [];
  for (const row of plan) {
    if (row.password === null) continue;
    const passwordHash = await hashPassword(row.password);
    await UserModel.updateOne(
      { username: row.username },
      {
        $set: {
          username: row.username,
          passwordHash,
          role: "Admin",
          businessRole: "admin",
          employeeId: null,
          isGlobalAdmin: true,
          mustChangePassword: true,
          passwordChangedAt: null,
        },
        // Sparse unique index chỉ bỏ qua field KHI VẮNG MẶT; `email: null` vẫn bị
        // đánh index và làm tài khoản admin thứ hai vướng E11000.
        $unset: { email: "" },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );
    rows.push([row.username, row.password, "Admin", "admin", "bắt buộc đổi ở lần đăng nhập đầu"]);
  }

  if (rows.length > 0) {
    const file = path.join(REPO_ROOT, "data", "accounts", `admins-${timestamp()}.csv`);
    writeCsv(file, ["username", "temp_password", "role", "business_role", "note"], rows);
    console.log(`[admins] mật khẩu tạm -> ${path.relative(REPO_ROOT, file)}`);
  }
  console.log(`[admins] đã ghi ${rows.length} tài khoản.`);
}

// --- legacy cleanup -------------------------------------------------------------

async function commandDeleteLegacy(db, flags) {
  const apply = flags.apply === true;
  const backupPath = typeof flags.backup === "string" ? path.resolve(process.cwd(), flags.backup) : null;
  if (!backupPath || !fs.existsSync(backupPath)) {
    throw new Error("--backup <file> là bắt buộc: chỉ xoá tài khoản đã có bản backup.");
  }

  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  const legacy = backup.filter(
    (u) => typeof u.email === "string" && u.email.endsWith(LEGACY_EMAIL_SUFFIX) && !u.username
  );
  if (legacy.length === 0) {
    console.log("[delete-legacy] không có tài khoản cũ nào trong backup.");
    return;
  }

  const clash = legacy.filter((u) => ADMIN_USERNAMES.includes(String(u.username || "").toLowerCase()));
  if (clash.length > 0) {
    throw new Error("Backup chứa username admin mới — dừng để tránh xoá nhầm.");
  }

  const ids = legacy.map((u) => u._id).map((id) => (typeof id === "string" ? new mongoose.Types.ObjectId(id) : id));
  console.log(`[delete-legacy] sẽ xoá ${legacy.length} tài khoản:`);
  for (const u of legacy) console.log(`  - ${u.email} (${u.role})`);

  const sessionCount = await RefreshSessionModel.countDocuments({ userId: { $in: ids } });
  console.log(`[delete-legacy] refresh_sessions liên quan: ${sessionCount}`);

  if (!apply) {
    console.log("[delete-legacy] DRY RUN — thêm --apply để xoá.");
    return;
  }

  const sessions = await RefreshSessionModel.deleteMany({ userId: { $in: ids } });
  const users = await UserModel.deleteMany({ _id: { $in: ids } });
  console.log(`[delete-legacy] đã xoá users=${users.deletedCount} refresh_sessions=${sessions.deletedCount}`);
}

// --- indexes --------------------------------------------------------------------

async function commandIndexes(db, flags) {
  const apply = flags.apply === true;
  const users = db.collection("users");
  const list = await users.indexes();
  const current = Object.fromEntries(list.map((spec) => [spec.name, spec]));

  for (const [name, spec] of Object.entries(current)) {
    console.log(`[indexes] hiện có: ${name} ${JSON.stringify(spec.key)} ${spec.unique ? "unique" : ""} ${spec.sparse ? "sparse" : ""}`);
  }

  // email_1 cũ là unique KHÔNG sparse: chỉ chứa được một document có email null, nên
  // tài khoản admin thứ hai (email: null) bị 11000. Phải dựng lại thành sparse trước.
  const emailIndex = current["email_1"];
  const needsEmailRebuild = Boolean(emailIndex && emailIndex.unique && !emailIndex.sparse);
  const missingUsername = await users.countDocuments({ username: { $in: [null, ""] } });

  console.log(`[indexes] email_1 cần dựng lại (unique không sparse): ${needsEmailRebuild}`);
  console.log(`[indexes] user chưa có username: ${missingUsername}`);

  if (!apply) {
    console.log("[indexes] DRY RUN — thêm --apply để tạo index.");
    return;
  }

  if (needsEmailRebuild) {
    await users.dropIndex("email_1");
    await users.createIndex({ email: 1 }, { unique: true, sparse: true, name: "email_1" });
    console.log("[indexes] đã dựng lại email_1 thành unique + sparse.");
  }

  if (missingUsername > 0) {
    console.log("[indexes] BỎ QUA username_1: còn tài khoản không có username.");
    console.log("[indexes] Chạy delete-legacy trước rồi chạy lại lệnh này.");
    process.exitCode = 1;
    return;
  }

  await users.createIndex({ username: 1 }, { unique: true, name: "username_1" });
  console.log("[indexes] ok: username_1");

  const hasEmployeeUnique = Object.values(current).some(
    (spec) =>
      spec.unique === true &&
      Object.keys(spec.key).length === 1 &&
      spec.key.employeeId === 1 &&
      spec.partialFilterExpression?.employeeId?.$type === "objectId"
  );
  if (hasEmployeeUnique) {
    console.log("[indexes] ok: employeeId đã có unique partial index (bỏ qua employeeId null).");
    return;
  }
  await users.createIndex(
    { employeeId: 1 },
    {
      unique: true,
      name: "employeeId_1_unique",
      partialFilterExpression: { employeeId: { $type: "objectId" } },
    }
  );
  console.log("[indexes] ok: employeeId_1_unique (partial, bỏ qua employeeId null)");
}

// --- employees ------------------------------------------------------------------

async function commandEmployees(db, flags) {
  const apply = flags.apply === true;
  const limit = flags.limit ? Number(flags.limit) : null;

  const employees = await EmployeeModel.find(
    {},
    {
      employee_code: 1,
      employeeCode: 1,
      full_name: 1,
      fullName: 1,
      job_title: 1,
      store_raw: 1,
      status: 1,
      businessRole: 1,
      userId: 1,
    }
  )
    .lean()
    .exec();

  const missingRole = employees.filter((e) => !e.businessRole);
  if (missingRole.length > 0) {
    throw new Error(
      `${missingRole.length}/${employees.length} nhân viên chưa có businessRole. ` +
        "Chạy scripts/seed/10-backfill-business-role.py --apply trước."
    );
  }

  const existingUsers = await UserModel.find({}, { username: 1, employeeId: 1 }).lean();
  const takenUsernames = new Set(existingUsers.map((u) => String(u.username)));
  const takenEmployeeIds = new Set(
    existingUsers.filter((u) => u.employeeId).map((u) => String(u.employeeId))
  );

  const pending = [];
  const skipped = { hasUser: 0, usernameTaken: 0, noCode: 0 };
  const seenCodes = new Set();

  for (const employee of employees) {
    const code = String(employee.employee_code || employee.employeeCode || "").trim();
    if (!code) {
      skipped.noCode += 1;
      continue;
    }
    const username = code.toLowerCase();
    if (takenEmployeeIds.has(String(employee._id)) || takenUsernames.has(username)) {
      skipped.hasUser += 1;
      continue;
    }
    if (seenCodes.has(username)) {
      skipped.usernameTaken += 1;
      continue;
    }
    seenCodes.add(username);
    pending.push({
      username,
      employeeId: employee._id,
      businessRole: employee.businessRole,
      fullName: employee.full_name || employee.fullName || "",
      store: employee.store_raw || "",
      jobTitle: employee.job_title || "",
      status: employee.status || "active",
    });
  }

  const selected = limit ? pending.slice(0, limit) : pending;
  console.log(`[employees] tổng hồ sơ: ${employees.length}`);
  console.log(`[employees] đã có tài khoản (bỏ qua): ${skipped.hasUser}`);
  console.log(`[employees] trùng mã / thiếu mã: ${skipped.usernameTaken} / ${skipped.noCode}`);
  console.log(`[employees] sẽ tạo: ${selected.length}`);
  const byRole = selected.reduce((acc, row) => {
    acc[row.businessRole] = (acc[row.businessRole] || 0) + 1;
    return acc;
  }, {});
  console.log(`[employees] phân bố businessRole: ${JSON.stringify(byRole)}`);
  const inactive = selected.filter((row) => row.status === "inactive").length;
  console.log(`[employees] trong đó hồ sơ đã nghỉ (status=inactive): ${inactive}`);

  if (!apply) {
    console.log("[employees] DRY RUN — thêm --apply để tạo tài khoản.");
    return;
  }

  const credentials = [];
  let created = 0;

  for (let start = 0; start < selected.length; start += BATCH_SIZE) {
    const batch = selected.slice(start, start + BATCH_SIZE);
    const operations = [];
    for (const row of batch) {
      const password = generatePassword(12);
      const passwordHash = await hashPassword(password);
      credentials.push([
        row.username,
        password,
        row.fullName,
        row.store,
        row.jobTitle,
        row.businessRole,
        row.status,
      ]);
      operations.push({
        insertOne: {
          document: {
            username: row.username,
            passwordHash,
            role: "Employee",
            businessRole: row.businessRole,
            employeeId: row.employeeId,
            isGlobalAdmin: false,
            mustChangePassword: true,
            passwordChangedAt: null,
            createdAt: new Date(),
          },
        },
      });
    }
    // ordered:false -> một mã trùng không chặn cả lô; lỗi được đếm lại bên dưới.
    try {
      const result = await db.collection("users").bulkWrite(operations, { ordered: false });
      created += result.insertedCount;
    } catch (err) {
      created += err?.result?.insertedCount ?? 0;
      console.error(`[employees] lô ${start / BATCH_SIZE + 1} có lỗi:`, err?.message || err);
    }
    console.log(`[employees] tiến độ: ${Math.min(start + BATCH_SIZE, selected.length)}/${selected.length}`);
  }

  const file = path.join(REPO_ROOT, "data", "accounts", `employees-${timestamp()}.csv`);
  writeCsv(
    file,
    ["username", "temp_password", "full_name", "store", "job_title", "business_role", "status"],
    credentials
  );
  console.log(`[employees] đã tạo ${created} tài khoản.`);
  console.log(`[employees] danh sách mật khẩu tạm -> ${path.relative(REPO_ROOT, file)}`);
  console.log("[employees] Phát tay từng phiếu; KHÔNG gửi file này qua chat/email nhóm.");
}


// --- passwords (quy luật tất định) ----------------------------------------------

async function commandPasswords(db, flags) {
  const apply = flags.apply === true;
  const secret = process.env.ACCOUNT_PASSWORD_SECRET;
  const batchSize = flags.batch ? Number(flags.batch) : BATCH_SIZE;

  console.log("[passwords] quy luật:");
  for (const line of describeRule().split("\n")) console.log(`  ${line}`);

  // Gọi trước khi in kế hoạch để thiếu secret là dừng ngay, không đụng dữ liệu.
  const sample = derivePassword("gt-sample", secret);
  console.log(`[passwords] mẫu cho username 'gt-sample': ${sample}`);

  const includeAdmins = flags["include-admins"] === true;
  const filter = includeAdmins ? {} : { role: "Employee" };
  const users = await db
    .collection("users")
    .find(filter, { projection: { username: 1, employeeId: 1, role: 1 } })
    .sort({ username: 1 })
    .toArray();
  const adminCount = users.filter((user) => user.role === "Admin").length;
  console.log(
    `[passwords] tài khoản sẽ đặt lại: ${users.length}` +
      (includeAdmins ? ` (gồm ${adminCount} admin)` : " (chỉ Employee)")
  );

  if (!apply) {
    console.log("[passwords] DRY RUN — thêm --apply để ghi đè mật khẩu toàn bộ.");
    return;
  }

  const employees = await db
    .collection("employees")
    .find({}, { projection: { employee_code: 1, full_name: 1, store_raw: 1, businessRole: 1, status: 1 } })
    .toArray();
  const employeeByCode = new Map(
    employees.map((employee) => [String(employee.employee_code ?? "").toLowerCase(), employee])
  );

  const slips = [];
  let updated = 0;
  const startedAt = Date.now();

  for (let start = 0; start < users.length; start += batchSize) {
    const batch = users.slice(start, start + batchSize);
    const operations = [];
    for (const user of batch) {
      const password = derivePassword(user.username, secret);
      const passwordHash = await hashPassword(password);
      operations.push({
        updateOne: {
          filter: { _id: user._id },
          update: {
            $set: {
              passwordHash,
              mustChangePassword: true,
              passwordChangedAt: null,
              updatedAt: new Date(),
            },
          },
        },
      });
      const employee = employeeByCode.get(String(user.username));
      slips.push([
        user.username,
        password,
        employee?.full_name ?? "",
        employee?.store_raw ?? "",
        employee?.businessRole ?? "",
        employee?.status ?? "",
      ]);
    }
    const result = await db.collection("users").bulkWrite(operations, { ordered: false });
    updated += result.modifiedCount;
    console.log(`[passwords] tiến độ: ${Math.min(start + batchSize, users.length)}/${users.length}`);
  }

  const userIds = users.map((user) => user._id);
  const revoked = await db.collection("refresh_sessions").updateMany(
    { userId: { $in: userIds }, revokedAt: null },
    { $set: { revokedAt: new Date() } }
  );

  const file = path.join(REPO_ROOT, "data", "accounts", `employee-passwords-${timestamp()}.csv`);
  writeCsv(
    file,
    ["username", "temp_password", "full_name", "store", "business_role", "status"],
    slips
  );

  console.log(`[passwords] đã cập nhật ${updated} tài khoản trong ${Math.round((Date.now() - startedAt) / 1000)}s`);
  console.log(`[passwords] thu hồi ${revoked.modifiedCount} phiên đăng nhập`);
  console.log(`[passwords] phiếu mật khẩu -> ${path.relative(REPO_ROOT, file)}`);
  console.log("[passwords] Phát tay từng phiếu; KHÔNG gửi file này qua chat/email nhóm.");
}

// --- report ---------------------------------------------------------------------

async function commandReport(db) {
  const users = db.collection("users");
  const total = await users.countDocuments({});
  const byRole = await users
    .aggregate([{ $group: { _id: { role: "$role", businessRole: "$businessRole" }, n: { $sum: 1 } } }])
    .toArray();
  const legacy = await users.countDocuments({ email: { $regex: `${LEGACY_EMAIL_SUFFIX}$` } });
  const noUsername = await users.countDocuments({ username: { $in: [null, ""] } });
  const pendingChange = await users.countDocuments({ mustChangePassword: true });
  const sessions = await db.collection("refresh_sessions").countDocuments({});

  console.log(`[report] users=${total} refresh_sessions=${sessions}`);
  console.log(`[report] còn tài khoản email cũ ${LEGACY_EMAIL_SUFFIX}: ${legacy}`);
  console.log(`[report] thiếu username: ${noUsername}`);
  console.log(`[report] mustChangePassword=true: ${pendingChange}`);
  for (const row of byRole) {
    console.log(`[report] role=${row._id.role} businessRole=${row._id.businessRole} -> ${row.n}`);
  }
  const sample = await users.find({ username: { $in: ADMIN_USERNAMES } }).project({ username: 1, role: 1, businessRole: 1, isGlobalAdmin: 1, employeeId: 1 }).toArray();
  console.log(`[report] admin: ${JSON.stringify(sample)}`);
}

// --- main -----------------------------------------------------------------------

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));
  if (!command) {
    console.error("Thiếu lệnh: backup | admins | delete-legacy | indexes | employees | passwords | report");
    process.exit(1);
  }

  const db = await connect();
  try {
    switch (command) {
      case "backup":
        await commandBackup(db);
        break;
      case "admins":
        await commandAdmins(db, flags);
        break;
      case "delete-legacy":
        await commandDeleteLegacy(db, flags);
        break;
      case "indexes":
        await commandIndexes(db, flags);
        break;
      case "passwords":
        await commandPasswords(db, flags);
        break;
      case "employees":
        await commandEmployees(db, flags);
        break;
      case "report":
        await commandReport(db);
        break;
      default:
        console.error(`Lệnh không hợp lệ: ${command}`);
        process.exitCode = 1;
    }
  } finally {
    await mongoose.disconnect();
  }
}

await main().catch((err) => {
  console.error(`[provision] LỖI: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});

/**
 * Xác minh tài khoản cấp phát qua HTTP thật (không in mật khẩu ra stdout).
 *   node scripts/verify-accounts.mjs --base http://127.0.0.1:3101 --admins data/accounts/admins-<ts>.csv
 *   node scripts/verify-accounts.mjs --base ... --employee <username> --password <pw>
 */
import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (!argv[i].startsWith("--")) continue;
    const key = argv[i].slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) flags[key] = true;
    else {
      flags[key] = next;
      i += 1;
    }
  }
  return flags;
}

function parseCsv(file) {
  const text = fs.readFileSync(file, "utf8").replace(/^\uFEFF/, "");
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const header = lines[0].split(",");
  return lines.slice(1).map((line) => {
    const cells = line.match(/("([^"]|"")*"|[^,]*)(,|$)/g)?.map((cell) => cell.replace(/,$/, "")) ?? [];
    const row = {};
    header.forEach((key, index) => {
      const raw = cells[index] ?? "";
      row[key] = raw.startsWith('"') ? raw.slice(1, -1).replace(/""/g, '"') : raw;
    });
    return row;
  });
}

const flags = parseArgs(process.argv.slice(2));
const base = String(flags.base || "http://127.0.0.1:3101");

async function login(username, password) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function get(pathname, token) {
  const res = await fetch(`${base}${pathname}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

function report(label, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) process.exitCode = 1;
}

const rows = flags.admins ? parseCsv(path.resolve(String(flags.admins))) : [];
if (flags.employees) {
  // Lấy 1 phiếu mẫu cho mỗi businessRole để kiểm tra role đi kèm tài khoản.
  const seen = new Set();
  for (const row of parseCsv(path.resolve(String(flags.employees)))) {
    const role = row.business_role;
    if (seen.has(role)) continue;
    seen.add(role);
    rows.push({ ...row, role: "Employee" });
  }
}
if (flags.employee) {
  rows.push({ username: String(flags.employee), temp_password: String(flags.password), role: "Employee" });
}

for (const row of rows) {
  const isAdmin = String(row.role) === "Admin";
  const auth = await login(row.username, row.temp_password);
  report(`${row.username}: login`, auth.status === 200, `HTTP ${auth.status}`);
  if (auth.status !== 200) continue;

  const token = auth.body.accessToken;
  report(
    `${row.username}: role trong login response`,
    auth.body.user?.role === (isAdmin ? "Admin" : "Employee"),
    `role=${auth.body.user?.role} mustChangePassword=${auth.body.user?.mustChangePassword}`
  );

  const me = await get("/api/auth/me", token);
  report(
    `${row.username}: GET /auth/me`,
    me.status === 200 && me.body.role === (isAdmin ? "Admin" : "Employee"),
    `HTTP ${me.status} role=${me.body.role} username=${me.body.username}`
  );

  const queue = await get("/api/change-requests?status=PENDING", token);
  if (isAdmin) {
    report(`${row.username}: hàng đợi duyệt (Admin)`, queue.status === 200, `HTTP ${queue.status} items=${Array.isArray(queue.body.items) ? queue.body.items.length : "n/a"}`);
  } else {
    report(`${row.username}: hàng đợi duyệt bị chặn (Employee)`, queue.status === 403, `HTTP ${queue.status}`);
  }

  const providers = await get("/api/admin/llm-providers", token);
  if (isAdmin) {
    report(`${row.username}: cài đặt LLM (Admin)`, providers.status === 200, `HTTP ${providers.status}`);
  } else {
    report(`${row.username}: cài đặt LLM bị chặn (Employee)`, providers.status === 403, `HTTP ${providers.status}`);
  }

  const employees = await get("/api/employees?limit=3", token);
  if (isAdmin) {
    report(`${row.username}: danh sách nhân sự (Admin)`, employees.status === 200, `HTTP ${employees.status} total=${employees.body.paging?.totalItems ?? "n/a"}`);
  } else {
    report(`${row.username}: danh sách nhân sự bị chặn (Employee)`, employees.status === 403, `HTTP ${employees.status}`);
  }
}

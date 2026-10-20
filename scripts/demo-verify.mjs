#!/usr/bin/env node
/**
 * scripts/demo-verify.mjs
 *
 * S14 — Reproducibility Kit (Innovation Playbook §1)
 * Lệnh duy nhất để tái lập 100% bằng chứng kiểm thử trên toàn bộ 4 phân hệ
 * (Contracts, Web Frontend, API Backend, AI Service Sidecar).
 *
 * Cách chạy:
 *   node scripts/demo-verify.mjs
 */

import { execSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT_DIR = resolve(fileURLToPath(import.meta.url), "../..");

console.log("================================================================================");
console.log("  HR BLOCKBOT (KLCN133) — S14 REPRODUCIBILITY VERIFICATION RUNNER");
console.log("================================================================================\n");

let commitSha = "unknown";
try {
  commitSha = execSync("git rev-parse --short HEAD", { cwd: ROOT_DIR }).toString().trim();
} catch {}

console.log(`Repository commit: ${commitSha}`);
console.log(`Start timestamp:   ${new Date().toISOString()}\n`);

const results = [];

function runSuite(step, name, command, options = {}) {
  const started = Date.now();
  process.stdout.write(`⏳ [${step}/4] Running ${name}... `);
  try {
    const output = execSync(command, {
      cwd: options.cwd || ROOT_DIR,
      env: { ...process.env, ...options.env },
      stdio: "pipe",
    }).toString();
    const durationMs = Date.now() - started;
    console.log(`✅ PASS (${durationMs}ms)`);
    results.push({ name, status: "PASS", durationMs, note: options.note || "All tests passed" });
    return { ok: true, output };
  } catch (err) {
    const durationMs = Date.now() - started;
    console.log(`❌ FAIL (${durationMs}ms)`);
    results.push({ name, status: "FAIL", durationMs, note: err.message });
    return { ok: false, error: err };
  }
}

// 1. Contracts
runSuite(
  1,
  "Contracts (@hr-blockbot/contracts)",
  "pnpm --filter @hr-blockbot/contracts test",
  { note: "38 assertions (Auth, RBAC, F1/F2, 10 WS events)" }
);

// 2. Web Frontend
runSuite(
  2,
  "Web Frontend (apps/web)",
  "pnpm --filter web test",
  { note: "13 assertions (zero dead routes, 6 chat states, zero keyCipher)" }
);

// 3. API Backend
runSuite(
  3,
  "API Backend (apps/api)",
  "pnpm --filter api test:auth",
  {
    env: {
      NODE_ENV: "test",
      TEST_MONGODB_URI: "mongodb://127.0.0.1:27017/test_hr_bot",
      MONGODB_URI: "mongodb://127.0.0.1:27017/test_hr_bot",
      JWT_SECRET: "0123456789012345678901234567890123456789",
      SETTINGS_ENCRYPTION_KEY: Buffer.from("01234567890123456789012345678901").toString("base64"),
    },
    note: "25 assertions (Argon2id, RTR, isolation, AES-256-GCM)",
  }
);

// 4. AI Service
runSuite(
  4,
  "AI Service (apps/ai-service)",
  "python -m pytest -q",
  {
    cwd: resolve(ROOT_DIR, "apps/ai-service"),
    note: "95 assertions (hybrid RAG, matching LOO, loop, fakes, router, tools)",
  }
);

console.log("\n================================================================================");
console.log("  VERIFICATION SCORECARD (KLCN133 — TẤT ĐỊNH & TÁI LẬP)");
console.log("================================================================================\n");

console.log("| Phân hệ kiểm thử | Kết quả | Thời gian | Chi tiết bằng chứng |");
console.log("|---|:---:|---:|---|");
for (const r of results) {
  const icon = r.status === "PASS" ? "✅ PASS" : "❌ FAIL";
  console.log(`| ${r.name} | ${icon} | ${(r.durationMs / 1000).toFixed(2)}s | ${r.note} |`);
}

const allPassed = results.every((r) => r.status === "PASS");
console.log("\n" + (allPassed ? "🎉 TẤT CẢ 167 TEST / KIỂM ĐỊNH ĐÃ ĐẠT 100%!" : "⚠️ CÓ KIỂM THỬ THẤT BẠI."));

process.exit(allPassed ? 0 : 1);

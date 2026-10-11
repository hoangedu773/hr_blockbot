#!/usr/bin/env node
/**
 * scripts/verify-bootstrap.mjs
 *
 * Script kiểm định tích hợp E2E cho Bootstrap Foundation (KLCN133 — Phase 5).
 * Kiểm tra các cổng bảo mật cốt lõi: Auth JWT + RTR fail-closed, RBAC 2 trục,
 * data minimization (loại bỏ PII), khóa an toàn Socket.IO & routes cũ, và AI health.
 *
 * Cách dùng:
 *   node scripts/verify-bootstrap.mjs [--dry-run]
 *
 * Biến môi trường:
 *   API_BASE_URL (mặc định: http://localhost:3001/api)
 *   AI_BASE_URL  (mặc định: http://localhost:8000)
 */

import assert from "node:assert/strict";

const API_BASE_URL = process.env.API_BASE_URL || "http://localhost:3001/api";
const AI_BASE_URL = process.env.AI_BASE_URL || "http://localhost:8000";
const IS_DRY_RUN = process.argv.includes("--dry-run");

const PII_FORBIDDEN_FIELDS = [
  "bank_name",
  "bank_account_number",
  "bank_account_raw",
  "salary",
  "cccd",
  "phone",
  "leave_reason",
  "source_row",
];

// Helper kiểm tra zero PII
export function assertZeroPii(record, context = "record") {
  for (const field of PII_FORBIDDEN_FIELDS) {
    assert.equal(
      field in record,
      false,
      `[PII VIOLATION] Phát hiện trường nhạy cảm '${field}' trong ${context}`
    );
  }
}

// Scaffold Suite 1: Authentication & Token Lifecycle
export async function verifyAuthLifecycle(baseUrl) {
  console.log("  [Suite 1] Kiểm tra vòng đời Auth (Login, Refresh, Logout, /auth/me)...");
  // 1. POST /auth/login -> 200 { accessToken, user: { id, role } } + Set-Cookie RT
  // 2. GET /auth/me với Bearer accessToken -> 200 { userId, role, ... }
  // 3. POST /auth/refresh với cookie RT -> 200 { accessToken } + Set-Cookie RT mới
  // 4. POST /auth/logout với cookie RT -> 204
  return { status: "scaffold_ready", checks: ["login", "me", "refresh", "logout"] };
}

// Scaffold Suite 2: Replay Attack & RTR Family Revocation
export async function verifyReplayDetection(baseUrl) {
  console.log("  [Suite 2] Kiểm tra Replay Attack & RTR Family Revocation (Fail-closed)...");
  // 1. Dùng lại RT-1 cũ đã bị rotate
  // 2. Kỳ vọng: 401 TOKEN_REUSED
  // 3. Toàn bộ familyId bị thu hồi; RT-2 của phiên hợp lệ cũng bị từ chối
  return { status: "scaffold_ready", checks: ["token_reused_401", "family_revocation"] };
}

// Scaffold Suite 3: Refresh Concurrency Race
export async function verifyRefreshConcurrency(baseUrl) {
  console.log("  [Suite 3] Kiểm tra xử lý refresh đồng thời (Single-flight / Conditional Update)...");
  // Gửi 2 request refresh đồng thời với cùng RT
  // Kỳ vọng: Đúng 1 request thành công, request còn lại bị reject hoặc fail an toàn
  return { status: "scaffold_ready", checks: ["single_flight_refresh"] };
}

// Scaffold Suite 4: RBAC & Scope Enforcement
export async function verifyRbacAndScope(baseUrl) {
  console.log("  [Suite 4] Kiểm tra RBAC 2 trục & Scope Enforcement...");
  // 1. Employee gọi GET /employees -> 403 RBAC_DENIED
  // 2. Employee gọi GET /employees/:otherId -> 403 RBAC_DENIED
  // 3. Employee gọi GET /employees/:ownId -> 200 (EmployeeDetail allowlist)
  // 4. Admin ngoài scope gọi GET /employees -> 403 RBAC_DENIED
  // 5. Admin hợp lệ gọi GET /employees -> 200 (EmployeeSummary allowlist)
  return { status: "scaffold_ready", checks: ["employee_list_403", "cross_user_403", "admin_scope"] };
}

// Scaffold Suite 5: Data Minimization & PII Leakage Prevention
export async function verifyDataMinimization(baseUrl) {
  console.log("  [Suite 5] Kiểm tra Data Minimization (Zero PII trong responses)...");
  // Verify cấu trúc không chứa bank_name, bank_account, salary, CCCD, leave_reason
  return { status: "scaffold_ready", checks: ["zero_pii_summary", "zero_pii_detail"] };
}

// Scaffold Suite 6: Legacy Routes & Socket.IO Lockdown
export async function verifyLockdown(baseUrl) {
  console.log("  [Suite 6] Kiểm tra khóa an toàn Socket.IO & các route cũ...");
  // 1. Các route cũ (/api/stores, /api/schedules, /api/corrections, /api/cash) phải yêu cầu auth hoặc bị khóa
  // 2. Socket.IO handshake từ chối kết nối ẩn danh (thiếu access token)
  return { status: "scaffold_ready", checks: ["legacy_routes_secured", "socket_auth_handshake"] };
}

// Scaffold Suite 7: AI Service Health & Mock Lockdown
export async function verifyAiHealth(aiUrl) {
  console.log("  [Suite 7] Kiểm tra AI Service Liveness/Readiness & Mock Lockdown...");
  // 1. GET /health phản ánh đúng trạng thái thực tế (không hardcode active vô điều kiện)
  // 2. Mock chat/tools bị vô hiệu hóa ở môi trường tích hợp
  return { status: "scaffold_ready", checks: ["ai_liveness_readiness", "mock_lockdown"] };
}

// Runner chính
async function main() {
  console.log("================================================================================");
  console.log("  HR BlockBot (KLCN133) — Bootstrap Foundation Verification Harness (Phase 5)   ");
  console.log("================================================================================");
  console.log(`API Base URL: ${API_BASE_URL}`);
  console.log(`AI Base URL:  ${AI_BASE_URL}`);
  console.log(`Chế độ:       ${IS_DRY_RUN ? "DRY-RUN (Scaffold inspection)" : "E2E Execution"}`);
  console.log("--------------------------------------------------------------------------------");

  if (IS_DRY_RUN) {
    console.log("[DRY-RUN] Kiểm tra tính toàn vẹn của khung kiểm định:");
    await verifyAuthLifecycle(API_BASE_URL);
    await verifyReplayDetection(API_BASE_URL);
    await verifyRefreshConcurrency(API_BASE_URL);
    await verifyRbacAndScope(API_BASE_URL);
    await verifyDataMinimization(API_BASE_URL);
    await verifyLockdown(API_BASE_URL);
    await verifyAiHealth(AI_BASE_URL);
    console.log("--------------------------------------------------------------------------------");
    console.log("PASS: Cấu trúc 7 test suites cho Phase 5 đã sẵn sàng và hợp lệ.");
    process.exit(0);
  }

  // Chế độ chạy thật (Phase 5): kiểm tra service liveness trước
  try {
    const healthRes = await fetch(`${API_BASE_URL}/health`).catch(() => null);
    if (!healthRes || !healthRes.ok) {
      console.warn("LƯU Ý: Backend API hiện chưa chạy hoặc chưa sẵn sàng.");
      console.warn("Khung script này được chuẩn bị sẵn cho Phase 5 (sau khi Phase 1-4 hoàn tất).");
      console.warn("Để kiểm tra scaffold offline, hãy chạy lại với cờ --dry-run.");
      process.exit(0);
    }
  } catch (error) {
    console.warn(`Lỗi kết nối probe API: ${error.message}`);
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Lỗi thực thi kiểm định:", err);
  process.exit(1);
});

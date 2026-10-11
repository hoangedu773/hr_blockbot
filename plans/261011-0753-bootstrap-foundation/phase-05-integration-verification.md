---
title: "Phase 5: Kiểm định tích hợp E2E"
status: pending
---

# Phase 5 — QA / integration verification

## Outcome, ownership và prerequisites

Owner: QA Lead / PM trên `feat/pm-agentkit`, CWD `C:/work-space/hr-blockbot-pm`.
Được sửa: `scripts/verify-bootstrap.mjs` (script kiểm định root do PM tạo), `plans/reports/**`, `plans/**`. Đọc READ-ONLY `apps/**`, `packages/**`, `docs/**`. **Không** sửa code app để fix lỗi test.
Prerequisites: phase 1–4 báo DONE; các nhánh đã được **tích hợp có phê duyệt** vào môi trường test chung; tài khoản test Admin/Employee trên môi trường test biệt lập; human cho phép chạy E2E.

## Thực hiện

1. Kiểm định auth E2E ở **HTTP level** (Node script + cookie jar): login nhận access token và cookie RT `HttpOnly`; gọi `/api/auth/me` với `Bearer`. Không cần browser runner — nếu thiếu Playwright/Puppeteer, ghi rõ UI memory không kiểm trực tiếp.
2. Replay attack: phát lại RT cũ → xác nhận 401 `TOKEN_REUSED`, toàn bộ family bị revoke, phiên hợp lệ khác cũng bị đăng xuất.
3. Concurrency: hai refresh đồng thời → chỉ một thành công, không session rác; kiểm cả race successor/revocation.
4. RBAC & scope: Employee đọc list → 403; Employee cross-user → 403 (không summary); Admin ngoài scope/unmapped → 403; Admin hợp lệ đọc summary trong scope.
5. Data minimization: response list/detail không có bank, phone, CCCD, salary, leave_reason.
6. Sanity: routes cũ (`stores`, `schedules`, `corrections`, `cash`) và **Socket.IO** đều bị đóng hoặc yêu cầu xác thực; AI `/health` báo degraded khi ngắt DB; mock chat bị khóa.
7. Tổng hợp báo cáo vào `plans/reports/qa-261011-bootstrap-verification.md`, đối chiếu `pm-261011-bootstrap-evidence.md`.

## Acceptance và checks

Lệnh: `node scripts/verify-bootstrap.mjs` (hoặc `pnpm test:e2e` do PM thêm). Assert: auth flow, replay/family revocation, concurrency, RBAC/scope, data minimization, socket/legacy lockdown, AI health degradation.
- [ ] Auth + auto-refresh + logout pass.
- [ ] Replay/family revocation pass; concurrency pass.
- [ ] RBAC/scope pass (Employee cross-user 403, Admin out-of-scope 403).
- [ ] Zero PII trong summary/detail.
- [ ] Socket.IO và legacy routes bị đóng/xác thực; AI health trung thực.
- [ ] Báo cáo QA lưu; phần chưa kiểm chứng ghi rõ.

## Dừng, rollback và báo cáo

Phát hiện lỗi nghiêm trọng: yêu cầu agent sở hữu app sửa trên nhánh của họ, **không** merge nhánh chính, không QA tự sửa code. Rò rỉ PII, replay không bị phát hiện, hoặc API sập khi gọi đồng thời là điều kiện dừng khẩn. Báo trong chat + report. Không commit/push/merge/deploy khi chưa được phép riêng.

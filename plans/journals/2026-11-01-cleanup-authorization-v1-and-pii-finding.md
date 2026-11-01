---
title: Cleanup sau Authorization V1 va phat hien PII
date: 2026-11-01
summary: "Plan A xong 4/5 phase; phat hien 2 file preview chua PII that trong repo public, cho quyet dinh chu du an."
---

# Cleanup sau Authorization V1 va phat hien PII

## Bối cảnh

Đầu phiên, working tree ở `8471b98`. Nhánh dev kia đẩy `4a6774b` (Authorization V1, 204 file, +17.473/−5.801) lên `baseline/hr-blockbot-v1-20261101`; Render vẫn chạy `8471b98` cho web/api và `7d04b49` cho AI. Fast-forward merge `4a6774b` vào `integration/full-delivery` local: sạch, 0 conflict, 0 untracked collision.

## Việc đã làm

- Merge + `pnpm install --frozen-lockfile`; tạo `apps/ai-service/.venv-authz-v1` (thiếu venv là nguyên nhân duy nhất của fail `jev-shadow-v1.integration.mjs`; không phải lỗi code).
- **Phase 02**: tách `workflowEndpoint` khỏi `routes/projects.ts` sang `lib/endpoint.ts`; migrate 13 route importer; thêm `endpoint-envelope.test.mjs` (5 case). Bỏ migrate `stores.ts` vì nó dùng `respond()` gửi response hoãn sau khi nhả lease và có message 500 riêng từng route — đổi sẽ là behavior change.
- **Phase 03**: tách type chat sang `types/chat.ts`; xóa `ChatDrawer.tsx` (918 dòng, không mount) + 10 component không consumer (1.680 dòng); viết `chat-page.test.mjs` thay harness cũ, có case chứng minh `safeUrl` drop `javascript:`.
- **Phase 04**: `pytest.ini` lane `v1`/`legacy`/`eval`, marker gán trong `conftest.py`, guard `test_v1_runtime_boundary.py` fail nếu gateway kéo legacy module. Bỏ việc di chuyển thư mục legacy: 24 điểm import trực tiếp, `qa_*.py` chạy bằng `sys.path` thư mục script.
- **Phase 05**: untrack `apps/web/dist-verify/` (44 file build output) + `.gitignore`; xóa 2 temp harness tracked.

## Kết quả gate

contracts 52/52 · api PASS · web 62/62 · e2e 17/17 · pytest V1 209 · pytest legacy 148 · typecheck + build PASS.

## Phát hiện chặn cuối phiên

`previews/db-data.json` và `previews/db-preview.html` (commit `d2d074a`, 11/10) chứa 39.380 dòng dữ liệu nhân sự thật, gồm 2.456 nhân viên và 1.976 số tài khoản ngân hàng. GitHub API trả `"private": false`; raw URL trả 200 không cần auth. Không tự purge: cần chủ dự án quyết định trước khi rewrite history và rotate.

## Bài học

Hai lần script tự động chèn marker vào đầu file đã đặt `pytestmark` trước `from __future__`, gây SyntaxError. Sửa bằng cách bỏ hướng sửa 13 file, dùng một hook duy nhất trong `conftest.py` — ít điểm chạm hơn và không thể lệch vị trí.

> Historical work record — not durable authority. Prefer docs/specs/ADRs for current decisions.

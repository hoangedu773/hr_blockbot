---
title: "Phase 3: Web tích hợp API thật"
status: pending
---

# Phase 3 — Web

## Outcome, ownership và prerequisites

CWD `C:/work-space/hr-blockbot-web`, branch `feat/frontend-web`. Chỉ sửa `apps/web/**` gồm `apps/web/previews/**`. Đọc READ-ONLY `packages/contracts/**`, `docs/**`, `plans/**`. Không sửa `apps/api/**`, `apps/ai-service/**`, contracts, root lockfile.
Đọc `docs/06-api-spec.md`, `docs/07-auth-rbac.md`, `docs/10-ui-ux-spec.md`, `apps/web/src/services/api.ts`, `apps/web/src/App.tsx`, `apps/web/src/components/AiCopilotModal.tsx`.

Chờ baseline contracts build xong và API phase 2 chạy ở `http://localhost:3001/api`. Nếu contracts chưa link vào `apps/web`, gửi dependency delta (`@hr-blockbot/contracts: workspace:*`) cho PM đưa vào baseline lockfile; không tự sửa root. Bootstrap dùng trực tiếp type export từ contracts; **hoãn** pipeline Orval (chưa cấu hình trong repo) — ghi rõ khi nào bật.

## Thực hiện

1. Auth client trong `apps/web/src/services/`: access token chỉ trong biến memory, tuyệt đối không `localStorage`/`sessionStorage`. Gửi `credentials: 'include'` và header `Authorization: Bearer` khi có token.
2. Interceptor 401 `UNAUTHENTICATED`: gọi `POST /api/auth/refresh` **một lần duy nhất** (single-flight: request đồng thời dùng chung promise refresh, không phát nhiều refresh). Refresh thành công thì retry request gốc một lần; thất bại thì xóa state và về màn đăng nhập. Không retry vô hạn.
3. Xóa toàn bộ `SEED_*` và mọi `catch { return SEED_* }` / `catch { return true }` trong `services/api.ts`. Lỗi API phải nổi lên UI dưới dạng empty/error state, không che bằng dữ liệu mẫu.
4. Thêm `fetchEmployees()` cho Admin (list allowlist) và `fetchMyProfile()` cho Employee; dùng type từ contracts, không tự khai type trùng.
5. `App.tsx`: bỏ optimistic success giả — `handleReject` và `handleNewShift` không còn toast thành công khi backend không xác nhận; metric fallbacks (số mặc định 45/12/1745000) không hiển thị số giả. Ẩn hoặc ghi "chưa khả dụng" cho control ngoài bootstrap (tiền két, đổi ca, chatbot realtime). Không thêm API giả ở backend để lấp frontend.
6. Preview gate: dựng thay đổi tại `apps/web/previews/index.html`, giữ Dark Command Center (`apps/web/src/index.css`), theo `super-ui-ux-master`, có keyboard/focus/contrast/reduced-motion. Chờ Lead duyệt preview trước khi vào dashboard chính. Nêu trạng thái đủ/empty/loading/error.

## Acceptance và checks

Lệnh hiện có: `pnpm --filter web build`.
Lệnh cần tạo: `pnpm --filter web test` (nếu có runner; nếu không, ghi rõ kiểm thử thủ công + giới hạn).
- [ ] Build pass; không còn `SEED_*` hoặc fallback nuốt lỗi trong `services/api.ts`.
- [ ] Đăng nhập Admin thấy dữ liệu thật; Employee chỉ thấy own.
- [ ] Hết hạn access token → auto-refresh một lần rồi retry; refresh fail → về login.
- [ ] Logout xóa token memory + cookie; không còn toast thành công giả.
- [ ] Preview được duyệt; báo rõ phần UI chưa kiểm chứng bằng browser nếu thiếu runner.

## Dừng, rollback và báo cáo

Contracts chưa có hoặc API chưa chạy: làm phần offline (auth client, bỏ mock), phần integration BLOCKED. Không tự sửa contract/root. Rollback bằng đảo patch của mình sau xem diff; không reset/checkout phá hủy. Báo trong chat cho PM, PM lưu report. Không commit/push/merge khi chưa được phép riêng.

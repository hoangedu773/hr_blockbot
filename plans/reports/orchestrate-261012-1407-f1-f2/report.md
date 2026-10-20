# Báo Cáo Điều Phối — Next Delivery Phase 1 Preflight

- **Thời gian:** 2026-10-12, Asia/Bangkok
- **Kế hoạch:** `plans/261011-1515-next-delivery` (Phase 1)
- **Worktree:** `C:/work-space/hr-blockbot-pm` (`feat/pm-agentkit`)
- **Điều phối:** Harness background Claude CLI trên Windows (theo thỏa thuận người dùng; supervisor `ak orchestrate` yêu cầu Darwin).
- **Model yêu cầu:** `ag/gemini-3.8-flash-high` / `cx/gpt-6-luna` (được ghi nhận trong metadata chạy).

---

## 1. Trạng Thái Các Jobs

| Job ID | Task | Model | Trạng thái | Sản phẩm đầu ra | Ghi chú |
|---|---|---|---|---|---|
| `contracts-offline-gate` | `test` | In-session | **PASS** | 10/10 tests pass, `tsc --noEmit` & `tsc` pass | Chạy offline, không đụng DB/network |
| `approval-design` | `architecture` | `cx/gpt-6-luna` (CLI) | **DONE_WITH_CONCERNS** | `approval-design-result.md` | Đề xuất embed FR-003/004; chưa được duyệt |
| `db-safety` | `security` | `cx/gpt-6-luna` (CLI) | **DONE** | `db-safety-result.md` | Preload guard trước imports + scoped cleanup |

---

## 2. Kết Quả Trọng Yếu

### A. Contracts Baseline (PM Worktree)
- `pnpm --filter @hr-blockbot/contracts typecheck` (Pass, exit 0).
- `pnpm --filter @hr-blockbot/contracts build` (Pass, exit 0, sinh `dist/index.js` và `dist/index.d.ts`).
- `pnpm --filter @hr-blockbot/contracts test` (Pass, 10/10 assertions đạt 100%).

### B. Thiết Kế Lưu Trữ FR-003/004 (Đề xuất — Chờ duyệt)
- Nhúng `profileChangeRequests[]` vào `employees` để bảo vệ baseline 11 collection của đề cương.
- Chỉ cho phép các trường allowlist; cấm lương/CCCD.
- Chặn tự duyệt (`SELF_APPROVAL`); resubmit giữ nguyên lịch sử cũ kèm lý do từ chối.
- Giới hạn cứng số request; từ chối request mới khi đầy, không xóa lịch sử cũ.
- Notification lưu trước khi phát Socket.IO; lỗi WS không làm mất bản ghi.

### C. Đề Xuất Bảo Vệ Database Test (Backend API)
- Dùng preload `test/require-isolated-db.mjs` chạy trước khi import `app` và DB.
- Chỉ chấp nhận loopback URI (`localhost`, `127.0.0.1`) và DB có tiền tố test; từ chối Atlas.
- Thay `RefreshSessionModel.deleteMany({})` bằng cleanup có phạm vi hẹp theo `userId` của fixture user được tạo trong suite.

---

## 3. Arbiter Verification

- [x] Mọi job bắt buộc đều tạo đúng artifact tương ứng.
- [x] Không có job nào chạy lệnh ghi đè code, không đụng DB thật, không lộ secrets.
- [x] Không có mâu thuẫn giữa các kết quả đầu ra.
- [x] Mọi kết luận đều dẫn chiếu trực tiếp tới file, dòng hoặc kết quả lệnh thực tế.
- [x] Giữ nguyên ranh giới: Chưa áp dụng code vào `apps/api/**` hay `packages/contracts/**`.

---

## 4. Câu Hỏi & Cổng Phê Duyệt Chưa Giải Quyết

1. **Phê duyệt phương án lưu trữ FR-003/004:** Xác nhận chọn embedded trong `employees`, từ chối request mới khi đầy lịch sử (không xóa cũ), chốt allowlist (`level`, `hiredAt`, `jobTitle`).
2. **Phê duyệt triển khai guard DB:** Cho phép áp dụng preload guard và scoped cleanup vào `apps/api/test/auth.test.mjs` trong worktree của API owner.
3. **Cổng hợp nhất nhánh:** Cần quyền mở nhánh tích hợp riêng để gộp code bootstrap từ ba nhánh dịch vụ về trước khi bắt đầu Phase 2.

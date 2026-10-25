# Kế Hoạch: Khắc Phục Lỗi Viền Tiêu Đề (Image #3) & Đồng Bộ Tên HR-BlockBot

- **Mục tiêu:**
  1. Xóa triệt để viền focus/outline hình chữ nhật đóng khung quanh tiêu đề H1 trong khung Chat Copilot (`apps/web/src/components/chat/ChatPageView.tsx`) như phản ánh trong Image #3. Đã thêm CSS `.guta-chat h1, .guta-chat h1:focus, .guta-chat h1:focus-visible { outline: none !important; border: none !important; box-shadow: none !important; }`.
  2. Đồng bộ tên hiển thị từ "Guta AI Copilot" sang "HR-BlockBot AI Copilot" và sidebar "HR-BlockBot Workspace".
  3. Cập nhật `apps/web/test/e2e-revamp-flow.test.mjs` đảm bảo 16/16 tests PASS 100%.
- **Trạng thái:** HOÀN THÀNH - NGHIỆM THU PASS 100% (QA Sign-off 25/10/2026).

---

## 1. File Ownership (Đã sửa)
- [x] `apps/web/src/components/chat/ChatPageView.tsx`
- [x] `apps/web/test/e2e-revamp-flow.test.mjs`

---

## 2. Tiêu Chí Nghiệm Thu (Acceptance Criteria)
- [x] Tiêu đề H1 không còn bất kỳ đường viền focus/outline/border nào khi trang chat vừa mở ra.
- [x] Tên hiển thị trên chat header và hero chuyển sang HR-BlockBot.
- [x] `pnpm -r run build` PASS.
- [x] `node apps/web/test/e2e-revamp-flow.test.mjs` PASS 16/16.

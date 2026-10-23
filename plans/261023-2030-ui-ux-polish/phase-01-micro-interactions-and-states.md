---
title: "Phase 1: Implementation of Micro-Interactions, Keyboard Shortcuts and Feedback States"
phase: 1
status: planned
depends_on: []
files_to_modify:
  - apps/web/src/components/CrmDashboardView.tsx
  - apps/web/src/components/FolioLandingView.tsx
  - apps/web/test/e2e-revamp-flow.test.mjs
---

# Phase 1: Triển Khai Vi Tương Tác, Phím Tắt Toàn Cục & Trạng Thái Phản Hồi

## 1. Mục Tiêu Kỹ Thuật
Khắc phục 10 khuyết tật vi tương tác đã kiểm toán mà không làm thay đổi hay phá vỡ cấu trúc CSS gốc của Folio và 21st CRM.

## 2. Chi Tiết Thay Đổi Mã Nguồn

### 2.1. File `apps/web/src/components/CrmDashboardView.tsx`
- **Sự kiện bàn phím toàn cục (`keydown`):**
  - Khi phím là `Escape` (và drawer đang mở): gọi `closeDrawer()`.
  - Khi tổ hợp phím là `(e.metaKey || e.ctrlKey) && e.key === 'k'`: `e.preventDefault()`, tìm `input[type="text"]` hoặc `input[type="search"]` và kích hoạt `.focus()`.
- **Trạng thái Loading & Debounce nút Telegram Alert:**
  - Khi click nút Telegram: thêm class animate-pulse, đổi nội dung sang `"Đang gửi..."`, vô hiệu hóa nút (`disabled = true`) trong 1.000ms trước khi phục hồi.
- **Empty State cho Bảng Chi Nhánh:**
  - Khi bộ lọc search không khớp dòng nào: hiển thị một hàng tr rỗng với colspan="8" có nội dung `Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.`
- **Bộ lọc Ca trực:**
  - Bắt sự kiện click trên các nút/pill ca trực (`Ca 1`, `Ca 2`, `Ca 3`, `Tất cả`) để lọc các hàng có chứa text ca tương ứng.

### 2.2. File `apps/web/src/components/FolioLandingView.tsx`
- **Tự động đóng Mobile Menu khi click Navigation Links:**
  - Bắt sự kiện click trên các thẻ `nav a[href^="#"]`: đóng menu mobile bằng cách gán `data-state="false"` và `aria-expanded="false"`.
- **Sự kiện `Escape` đóng Auth Modal:**
  - Lắng nghe sự kiện bàn phím `Escape` khi `isAuthOpen === true` để gọi `setIsAuthOpen(false)`.
- **Hiệu ứng mũi tên Accordion FAQ:**
  - Bổ sung class xoay `transform rotate-180 transition-transform duration-200` cho icon chevron khi trigger có `aria-expanded="true"`.

### 2.3. Cập Nhật Test Suite E2E `apps/web/test/e2e-revamp-flow.test.mjs`
- Thêm bước kiểm thử:
  * Nhấn phím `Escape` sau khi mở Drawer -> xác nhận Drawer đóng lại.
  * Nhấn `Ctrl+K` -> xác nhận ô input được focus.
  * Nhập từ khóa không tồn tại -> xác nhận empty state xuất hiện.

## 3. Lệnh Kiểm Thử & Nghiệm Thu
```powershell
pnpm --filter web build
node apps/web/test/e2e-revamp-flow.test.mjs
```

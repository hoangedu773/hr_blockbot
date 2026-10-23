---
title: "Plan: UI/UX Micro-Interactions, States Polish & Zero-Jank Hardening"
status: planned
date: "2026-10-23"
owner: feat/frontend-web
skills_applied:
  - super-ui-ux-master
  - ak-frontend-design
  - ak-frontend-development
  - ak-plan
---

# Kế Hoạch Chuẩn Hóa Vi Tương Tác & Khắc Phục Lỗi UI/UX Vụn Vặt (UI/UX Polish Plan)

## 1. Bối Cảnh & Vấn Đề
Giao diện chính gồm **Folio Landing Page** và **21st CRM Dashboard** đã được đồng bộ chuẩn với bản thiết kế preview và deploy live thành công trên Render. Tuy nhiên, qua rà soát chi tiết theo chuẩn **Anti-Slop 15 Gates** và **8 Interactive States** của `super-ui-ux-master`, hệ thống vẫn còn tồn tại nhiều khuyết tật vi tương tác (micro-interactions) vụn vặt gây giảm trải nghiệm người dùng thực tế.

## 2. Danh Mục Các Lỗi UI/UX Vụn Vặt Cần Khắc Phục (Defect Ledger)

### A. Tại CRM Dashboard (`apps/web/src/components/CrmDashboardView.tsx`)
1. **[DEF-01] Phím tắt `Escape` không đóng Slide-Over Drawer:** Khi mở chi tiết chi nhánh, bấm `Esc` không đóng, bắt buộc phải click chuột.
2. **[DEF-02] Thiếu Debounce/Loading State nút Telegram Alert:** Nhấp liên tục nút "Gửi Cảnh Báo Telegram" kích hoạt liên tiếp nhiều toast; thiếu spinner 800ms và trạng thái disabled tạm thời.
3. **[DEF-03] Phím tắt tìm kiếm `⌘K` / `Ctrl+K` chưa hoạt động:** Ô tìm kiếm hiển thị huy hiệu `⌘K` nhưng không lắng nghe sự kiện bàn phím toàn cục để `focus()`.
4. **[DEF-04] Tab lọc ca trực chưa lọc dữ liệu bảng:** Các badge bộ lọc "Tất cả / Ca 1 / Ca 2 / Ca 3" chưa được gắn sự kiện lọc hàng theo ca.
5. **[DEF-05] Thiếu Empty State khi tìm kiếm không có kết quả:** Khi gõ từ khóa không khớp cửa hàng nào, bảng bị trống trơn mà không có thông báo "Không tìm thấy chi nhánh phù hợp".
6. **[DEF-06] Đăng xuất thiếu tooltip/xác nhận nhẹ:** Nhấp nút đăng xuất lập tức hủy phiên không có độ trễ chuyển cảnh.

### B. Tại Folio Landing Page (`apps/web/src/components/FolioLandingView.tsx`)
7. **[DEF-07] Mobile Menu không tự đóng khi bấm anchor link:** Nhấp link nhảy tới `#features`, `#solution` trên điện thoại không tự ẩn menu backdrop.
8. **[DEF-08] Accordion FAQ thiếu hiệu ứng xoay icon:** Icon mũi tên không xoay 180° mượt mà khi bung mở câu trả lời.
9. **[DEF-09] Phím tắt `Escape` không đóng Auth Modal:** Khi modal 1-click login mở, phím `Esc` không kích hoạt đóng modal.
10. **[DEF-10] Focus-visible rings thiếu đồng bộ:** Các nút CTA chưa có viền focus Electric Sapphire nổi bật cho người dùng điều hướng bằng phím Tab.

## 3. Lộ Trình Triển Khai (Execution Phases)
- **Phase 1:** Khắc phục triệt để các lỗi tương tác bàn phím (`Esc`, `⌘K`) và state loading/empty trên CRM Dashboard.
- **Phase 2:** Khắc phục trải nghiệm Mobile Menu, Accordion Motion và Focus-visible trên Folio Landing Page.
- **Phase 3:** Mở rộng bộ kiểm thử tự động Playwright E2E để xác nhận 100% các vi tương tác này.

## 4. Tiêu Chí Nghiệm Thu (Acceptance Criteria)
- 10/10 lỗi trong danh mục Defect Ledger được khắc phục triệt để bằng mã nguồn vi phẫu (Surgical Edits).
- Toàn bộ test E2E Playwright mới và cũ đều đạt kết quả PASS.
- Build production tĩnh `pnpm --filter web build` không phát sinh cảnh báo TypeScript hoặc bundle regression.

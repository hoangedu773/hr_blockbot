# Phase 2: Đại Tu Bố Cục Guta CRM Dashboard & Thay Thế 100% Emoji Bằng SVG Vector

> **Mục tiêu:** Nâng cấp toàn diện giao diện `CrmDashboardView.tsx`: dọn sạch toàn bộ icon emoji (`☕`, `✨`, `↻`), chuẩn hóa bố cục Dashboard, nâng cấp Slide-over Drawer sang chuẩn thiết kế Electric Sapphire `#2563eb` và Slate/Zinc dark theme.

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật

- **Tệp sửa đổi:** `apps/web/src/components/CrmDashboardView.tsx`
- **Hiện tượng:**
  1. Emoji Unicode `☕` xuất hiện lặp lại ở 10 dòng chi nhánh trông thô và thiếu chuyên nghiệp.
  2. Bố cục bảng 9 cột và sidebar bị cứng, khoảng cách padding không cân đối khi hiển thị trên các màn hình có độ phân giải khác nhau.
  3. Thiếu khối thẻ chỉ số KPI tổng quan (Metric Cards) cho 45 chi nhánh.
  4. Slide-over Drawer có icon `✨` và font chữ chưa phân cấp tốt.

---

## 2. Các Bước Thực Hiện Chi Tiết

1. **Bộ Icon SVG Vector Chuẩn Enterprise (Lucide / Heroicons style):**
   - **Coffee Store Icon:** Thay thế `☕` bằng SVG vector Ly Cà phê / Cửa hàng Guta chuẩn:
     ```html
     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/>
     </svg>
     ```
   - **Copilot Sparkle Icon:** Thay thế `✨` bằng SVG Sparkles vector:
     ```html
     <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
       <path d="m12 3-1.9 5.8a2 2 0 0 1-1.3 1.3L3 12l5.8 1.9a2 2 0 0 1 1.3 1.3L12 21l1.9-5.8a2 2 0 0 1 1.3-1.3L21 12l-5.8-1.9a2 2 0 0 1-1.3-1.3Z"/>
     </svg>
     ```
   - **Loading Spinner Icon:** Thay thế `↻` bằng SVG Spinner vector xoay mượt mà:
     ```html
     <svg class="animate-spin size-3.5 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
       <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
       <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
     </svg>
     ```

2. **Bố Cục Header & KPI Summary Ribbon:**
   - Thêm khối 4 thẻ KPI tóm tắt tình hình vận hành chuỗi ở đầu trang:
     * **Chi nhánh mở ca:** `45/45` (100% active, pulsing emerald).
     * **Barista đang trực:** `135` nhân sự trong ca.
     * **Doanh thu két sáng:** `184.250.000 ₫` (font tabular mono).
     * **Đúng giờ ZKTeco:** `98.6%` (chuẩn thời gian thực).
   - Tối ưu thanh tìm kiếm `input` với phím tắt `⌘K`, bộ lọc Quận và nút Tạo Ca Đột Xuất.

3. **Thiết Kế Lại Bảng Dữ Liệu Chi Nhánh (Data Table):**
   - Khoảng cách các cột `Mã CH`, `Tên Chi Nhánh`, `Cửa Hàng Trưởng`, `Quận`, `Số Barista`, `Ca Hiện Tại`, `Doanh Thu Két`, `Đúng Giờ`, `Trạng Thái` được định dạng `truncate` và `min-width` chống co kéo méo layout.
   - Hover effect mượt mà với viền highlight nhẹ chuẩn F&B.

4. **Nâng Cấp Slide-Over Detail Drawer:**
   - Trình bày thông tin Barista trong ca với avatar chữ lồng sắc nét, badge "Đúng ca" màu ngọc bích.
   - Khối khuyến nghị AI Copilot trình bày dạng callout cao cấp, không còn emoji.
   - Hai nút footer "Gửi Cảnh Báo Telegram" và "Đóng" rõ ràng, có trạng thái loading.

5. **Bảo Toàn 100% Selector Kiểm Thử Playwright:**
   - Giữ nguyên toàn bộ ID, class và text mà `apps/web/test/e2e-revamp-flow.test.mjs` kiểm tra (`table`, `tbody tr`, `#detail-drawer`, `#d-id`, `#d-name`, `#d-rev`, `button: has-text("Gửi Cảnh Báo Telegram")`, v.v.).

---

## 3. Tiêu Chí Nghiệm Thu Phase 2

- [x] Toàn bộ Dashboard sạch 100% icon emoji Unicode.
- [x] Bố cục bảng và thẻ KPI cân đối, hiển thị hoàn hảo ở mọi kích thước màn hình desktop.
- [x] Drawer mở êm, hiển thị đầy đủ thông tin chi nhánh và nhân sự trong ca.

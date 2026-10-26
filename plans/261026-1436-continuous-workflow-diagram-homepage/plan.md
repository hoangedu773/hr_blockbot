# Kế Hoạch Triển Khai: Nhúng Sơ Đồ Luồng Hoạt Động Liên Tục Vào Trang Chủ (Continuous Workflow Diagram on Homepage)

- **Mục tiêu:**
  1. **Đưa sơ đồ luồng vào Trang chủ (`FolioLandingView`)**:
     - Nhúng sơ đồ luồng kiến trúc Agentic Chatbot (`docs/diagrams/chatbot-architecture.html` / `chatbot-architecture.svg`) trực tiếp vào phần `#solution` ("Luồng làm việc") trên trang chủ.
     - Đồng bộ anchor link `a[href="#solution"]` trên Header và Hero CTA ("Xem luồng làm việc") cuộn thẳng đến khu vực này.
  2. **Chạy liên tục tự động như khi bấm Start (Continuous Live Flow Loop)**:
     - Kích hoạt chế độ luồng tín hiệu chuyển động liên tục (`ak-edge-flow` lặp vô hạn `infinite`), mô phỏng dòng dữ liệu realtime từ Omni Gateway qua Fast Rule Gate, Jev AI, Agent Loop đến Gemini 3.8 Flash và 2-Step Confirmation.
     - Các node card phát xung nhịp glow nhấp nháy tuần tự theo chu kỳ pipeline, tạo cảm giác hệ thống đang hoạt động trực tiếp.
     - Bổ sung nút Pause / Resume để người dùng có thể tạm dừng luồng khi cần đọc kỹ từng node.
  3. **Tối ưu UI/UX Dark Theme & Responsive 320px**:
     - Tích hợp liền mạch với phong cách Folio Editorial (Dark Emerald/Teal, viền mờ `border-border/40`, backdrop blur).
     - Không vỡ layout trên mobile 320px, có thanh công cụ thu phóng (Fit, Zoom +, Zoom -).
     - Tôn trọng `prefers-reduced-motion` (dừng chuyển động vô hạn nếu người dùng yêu cầu giảm chuyển động).
- **Trạng thái:** HOÀN THÀNH - NGHIỆM THU PASS 100% (26/10/2026).

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

### Phase 1: Chuẩn bị Asset & Component Luồng
- [x] `apps/web/public/diagrams/chatbot-architecture.html` (Bản diagram tối ưu standalone hỗ trợ continuous auto-loop)
- [x] `apps/web/src/components/landing/WorkflowSection.tsx` (Component React bọc iframe/inline SVG với controls Pause/Resume, Fit, Fullscreen)

### Phase 2: Tích hợp vào Trang Chủ Folio
- [x] `apps/web/src/components/FolioLandingView.tsx` (Cập nhật section `#solution` tích hợp `WorkflowSection`)
- [x] `apps/web/src/index.css` (Styles, keyframes cho continuous pulse và glowing edges)

### Phase 3: Kiểm thử Tự động & Nghiệm thu
- [x] `apps/web/test/landing-workflow.test.mjs` (Script test Playwright kiểm chứng section `#solution` render, iframe/svg hiện diện, animation active)
- [x] `plans/reports/qa-final-261026-1536-landing-workflow-reverification.md` (Báo cáo QA độc lập)

---

## 2. Tiêu Chí Nghiệm Thu (Acceptance Criteria)

- [x] Section `#solution` hiển thị rõ ràng trên trang chủ với tiêu đề "Luồng Vận Hành Tự Động 24/7" (KIẾN TRÚC & LUỒNG XỬ LÝ AGENTIC).
- [x] Animation luồng dữ liệu (`ak-edge-flow`) tự động chạy liên tục không dừng ngay khi tải trang (`animation-iteration-count: infinite`).
- [x] Có nút điều khiển "Tạm dừng / Tiếp tục" (Pause / Play) và "Khớp khung hình" (Fit View) đồng bộ qua postMessage 2 chiều.
- [x] Hover vào từng Node hiển thị tooltip mô tả chức năng chi tiết; hỗ trợ thu phóng và di chuyển canvas.
- [x] Cuộn mượt mà từ nút "Xem luồng làm việc" trên Navbar và Hero xuống section `#solution`.
- [x] 0 pixel màu vàng/amber cấm (`#b45309`, `#fdd663`), 0 console error.
- [x] postMessage listener có đầy đủ source validation (`event.source === iframe.contentWindow`) và type-guard.
- [x] Fullscreen API có feature-detection an toàn cho iOS Safari.
- [x] Tránh scroll-jacking: chỉ zoom canvas khi giữ phím `Ctrl`/`Cmd`.
- [x] `pnpm --filter web build` PASS 100% không lỗi TypeScript.
- [x] Test suite `landing-workflow.test.mjs` PASS 4/4 assertions.

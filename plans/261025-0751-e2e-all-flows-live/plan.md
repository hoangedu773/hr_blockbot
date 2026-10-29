# Kế Hoạch: Vận Hành Toàn Diện Mọi Flow UI & Chatbot Guta Workspace (End-to-End Operational)

- **Mục tiêu:** Đảm bảo toàn bộ các flow người dùng trên giao diện Web (Landing Page, 1-Click Auth, CRM Command Center, Barista Slide-over Drawer, Cảnh báo Telegram, Ca Đột Xuất, và Chatbot Copilot) hoạt động trơn tru, đáng tin cậy, không lỗi console, không dead link, và vượt qua 100% bộ kiểm thử tự động E2E trong hôm nay.
- **Quy chuẩn:** Zero-Yellow, Zero Dead Links (`href="#"`), Chuẩn Token Neutral Slate/Frosted Gray cho Chatbot, Safe Demo Fallback khi AI backend offline.
- **Trạng thái:** HOÀN THÀNH - NGHIỆM THU PASS 100% (QA Sign-off 25/10/2026).

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

Subagent `fullstack-developer` đã chỉnh sửa chính xác các file:
1. `apps/web/src/components/chat/ChatPageView.tsx` (Hoàn thiện logic composer capsule pill, focus-visible outline, text contrast ratios, message loop, transition:none nút gửi)
2. `apps/web/src/components/CrmDashboardView.tsx` (Sửa logic so sánh tuyệt đối `===` cho bộ lọc Quận, phân định rõ ràng giữa Quận 1 và Quận 10)
3. `apps/web/test/e2e-revamp-flow.test.mjs` (Bổ sung khối `t.after` dọn dẹp điều hướng, đo contrast thực tế DOM, bổ sung kiểm tra phiên đăng nhập/đăng xuất cho 3 vai trò)

---

## 2. Danh Mục Các Flow Cần Hoạt Động Hoàn Hảo (Acceptance Criteria)

### Flow 1: Landing Page & Auth Flow
- [x] Tiêu đề chuẩn "Quản Trị Nhân Sự & Phân Ca Tự Động", logo marquee các đối tác hiển thị đầy đủ.
- [x] Không có bất kỳ pixel màu vàng cấm (`#ffd100`, `#eab308`, `#f59e0b`).
- [x] Không có liên kết chết `href="#"`. Mọi click đều mở modal, cuộn mượt hoặc hiển thị toast thông báo.
- [x] Nút "Get Started" / "Đăng Nhập" mở Auth Modal 1-Click Login.
- [x] Bấm chọn role (SM, AOM, Admin) lưu phiên vào `sessionStorage` và chuyển tức thì vào CRM Dashboard với đúng thông tin người dùng.
- [x] Bấm "Đăng xuất" dọn sạch session và quay về Landing Page an toàn.

### Flow 2: CRM Operations & Branch Management Flow
- [x] Hiển thị đầy đủ bảng chi nhánh đại diện với mã chi nhánh, địa chỉ, quận, trạng thái ca trực.
- [x] Tìm kiếm chi nhánh theo từ khóa (tên đường, quận, mã `GT-CH-xx`) hoạt động theo thời gian thực + phím tắt `Ctrl+K`.
- [x] Bộ lọc quận (Quận 1, Quận 3, Quận 10, v.v.) lọc chính xác danh sách chi nhánh (đã fix lỗi `includes` nhầm Quận 10).
- [x] Empty state minh họa khi không tìm thấy kết quả kèm nút CTA "Đặt lại bộ lọc" khôi phục danh sách ngay lập tức.
- [x] Nút "Tạo Ca Đột Xuất": Hiển thị loading spinner "Đang khởi tạo..." và disable nút khi đang xử lý, sau đó khôi phục.
- [x] Mọi link phụ trong CRM chặn `href="#"` và hiển thị toast thông báo tính năng mở rộng (ZKTeco...).

### Flow 3: Barista Shift Detail Slide-Over Drawer
- [x] Click vào bất kỳ dòng cửa hàng (ví dụ: `581 Sư Vạn Hạnh`) mở Slide-Over Drawer từ cạnh phải màn hình.
- [x] Hiển thị đúng thông tin nhân sự trong ca: Head Barista (Trương Quốc Thái), Cashier (Lê Thị Kim Ngân), tags trạng thái ca.
- [x] Nút "Gửi Cảnh Báo Telegram": Bấm vào gửi cảnh báo khẩn cấp và hiển thị toast thành công.
- [x] Đóng Drawer bằng nút "Đóng", bấm vào Backdrop mờ, hoặc bấm phím `Escape`.
- [x] Khả năng chịu tải: Bấm đóng/mở liên tục, double click không gây crash hoặc kẹt trạng thái DOM.

### Flow 4: Chatbot Copilot Flow (Full Page & In-CRM)
- [x] Chuyển tab mượt mà giữa CRM Dashboard và Chatbot (`Copilot`) qua thanh điều hướng / sidebar hoặc phím `Escape`.
- [x] Giao diện Chatbot: Capsule Pill composer (`rounded-full`), nền xám mờ `rgba(255, 255, 255, 0.05)`, không viền lồng, nút đính kèm tròn, nút gửi tròn trắng/đen (Zero-Blue).
- [x] Hỗ trợ phím tắt: `Enter` để gửi, `Shift+Enter` để xuống dòng tự động giãn chiều cao (tối đa 192px).
- [x] Empty state: Hiển thị 3 gợi ý Prompt Chips ("Chi nhánh nào đang thiếu người...", "Quy định trừ lương...", "Doanh thu két...").
- [x] Vòng lặp tin nhắn:
  - Bấm gửi -> hiển thị tin nhắn user và trạng thái typing bot ("Đang phân tích dữ liệu ca trực...").
  - Phản hồi chứa trích dẫn quy định (`citations`) và đề xuất hành động (`proposedAction` như điều động Barista).
  - Nút "Xác Nhận (Confirm)" cập nhật trạng thái "Đã xác nhận đề xuất. Chưa thực thi." mà không giả mạo ghi dữ liệu ngầm.
  - Nút "+ New Chat" dọn sạch tin nhắn và reset phiên an toàn.
  - Demo Fallback an toàn: Khi backend `/api/chat` chưa kết nối hoặc lỗi mạng, trả về phản hồi mẫu có cảnh báo demo rõ ràng, không để crash app.
- [x] Độ tương phản màu chữ đạt chuẩn WCAG (Contrast ratio: 16.44, 8.65, 7.62, 21.00 đều >= 4.5:1).
- [x] Hỗ trợ đầy đủ responsive: Mobile 320px, 375px, Landscape, Reduced Motion.
- [x] An toàn unmount: Nếu user đăng xuất hoặc chuyển trang khi bot đang gõ, tự động hủy timer và abort controller, 0 lỗi console.

---

## 3. Kết Quả Nghiệm Thu Thực Tế (QA Gatekeeper Verdict)

- `pnpm -r run build`: **PASS 100%** (Contracts, API, Web).
- `node apps/web/test/e2e-revamp-flow.test.mjs`: **PASS 16/16 (100%)**, 0 errors, 0 fails.
- `pnpm --filter @hr-blockbot/contracts test`: **PASS 38/38 (100%)**.
- **Kết luận:** Hệ thống đạt chuẩn giao diện, kiến trúc, an toàn bộ nhớ và sẵn sàng vận hành demo.

---
title: "Phase 4: Auth Routing, AI Copilot Integration & E2E Verification (Zero Yellow)"
status: pending
phase: 4
owner: feat/frontend-web
depends_on: ["Phase 3"]
---

# Phase 4: Điều Hướng Xác Thực (Auth Routing), Tích Hợp AI Copilot & Kiểm Thử E2E

## 1. Mục Tiêu

1. **Điều Hướng & Đồng Bộ Trạng Thái (`apps/web/src/App.tsx` & `AuthContext.tsx`):**
   - Khi chưa đăng nhập: Hiển thị Landing Page Folio AI (`/`).
   - Bấm nút "Get Started" hoặc "Đăng nhập" trên Landing Page: Mở Auth Modal.
   - Chọn tài khoản (SM / AOM / Admin) trong Auth Modal: Đăng nhập thành công, lưu thông tin vào `localStorage`, chuyển giao diện sang CRM Dashboard (`/app`).
   - Bấm nút "Đăng xuất" ở góc dưới Sidebar: Xóa phiên làm việc, quay trở lại Landing Page.
2. **Tích Hợp Guta AI Copilot Drawer (`apps/web/src/components/chat/ChatDrawer.tsx`):**
   - Khi người dùng bấm vào mục ✨ "Guta AI Copilot" trên Sidebar: Mở Chat Drawer từ lề phải.
   - Tích hợp WebSocket kết nối tới backend (`apps/api` hoặc mock WebSocket) để gửi câu hỏi và nhận câu trả lời dạng streaming.
   - Cung cấp các chip câu hỏi mẫu: *"Chi nhánh nào đang thiếu người ca trưa nay?"*, *"Kiểm tra quy định trừ lương đi trễ quá 15 phút"*, *"Tổng hợp doanh thu két sáng toàn chuỗi"*.
3. **Kịch Bản Kiểm Thử Tự Động Toàn Luồng (Playwright E2E Test Suite):**
   - Tạo file test `apps/web/test/e2e-revamp-flow.test.mjs` kiểm tra trọn vẹn:
     * Bước 1: Render Landing Page, kiểm tra các tiêu đề, logo marquee và 0 pixel màu vàng.
     * Bước 2: Bấm nút "Get Started", kiểm tra Auth Modal mở ra.
     * Bước 3: Bấm chọn tài khoản "Nguyễn Thị Phương Anh (SM)", kiểm tra chuyển hướng vào CRM Dashboard.
     * Bước 4: Kiểm tra bảng cửa hàng render đủ dữ liệu, tìm kiếm chi nhánh "Sư Vạn Hạnh".
     * Bước 5: Click vào dòng cửa hàng, kiểm tra Slide-Over Drawer mở ra với thông tin Barista.
     * Bước 6: Bấm nút "Gửi Cảnh Báo Telegram", kiểm tra toast xuất hiện.
     * Bước 7: Bấm nút "Đăng xuất", kiểm tra quay lại Landing Page an toàn.

## 2. Tiêu Chí Nghiệm Thu (Verification Gates)

1. `pnpm --filter web build` biên dịch sạch sẽ không warning, không error.
2. Kiểm tra mã nguồn bằng script: `grep -rn "ffd100" apps/web/src/` và `grep -rn "eab308" apps/web/src/` cho kết quả rỗng 100%.
3. Chạy Playwright E2E test `node apps/web/test/e2e-revamp-flow.test.mjs` pass 100% tất cả các assertions.
4. Chụp ảnh màn hình các trạng thái để chứng minh chất lượng hoàn thiện.

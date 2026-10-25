

### 4.4. Hệ Thống Motion Tokens & Trải Nghiệm Tương Tác Hiện Đại (Chuẩn Emil Kowalski & Apple Motion)
- **Triết lý chuyển động:** Motion có mục đích rõ ràng (state feedback, spatial consistency, spatial continuity), mượt mà, tức thời và có thể bị ngắt (interruptible). Tuyệt đối không lạm dụng chuyển động giật cục hoặc animation trang trí gây chậm trễ thao tác.
- **Motion Tokens chuẩn (`apps/web/src/index.css`):**
  - Curve gia tốc chuẩn Apple / Emil Kowalski: `--motion-ease-standard: cubic-bezier(0.23, 1, 0.32, 1);`
  - Thời lượng chuyển động tức thì (Hover / Press / Focus): `--motion-fast: 140ms;`
  - Thời lượng chuyển cảnh nội dung / Cross-fade / Card Entry: `--motion-base: 220ms;`
  - Thời lượng trượt Panel / Slide-over Drawer / Modal: `--motion-panel: 280ms;`
- **Micro-interactions:**
  - **Button / Interactive click:** Bổ sung phản hồi xúc giác nhẹ nhàng `transform: scale(0.98)` tức thì trong 80ms khi nhấn chuột (:active), nhả ra tự nhiên.
  - **Card Hover:** Card KPI và thẻ chi nhánh nâng nhẹ 2px `transform: translateY(-2px)` kèm viền phát sáng mờ khi di chuột trên thiết bị trỏ chuột chính xác (`@media (hover: hover) and (pointer: fine)`).
- **Trải nghiệm thông minh (Smart Flows):**
  1. **Smart Auto-login & Branded Splash Loader:**
     - Ứng dụng tự động kiểm tra phiên làm việc lưu trong `sessionStorage` và `localStorage`. Nếu đã đăng nhập trước đó, web tự động vào thẳng giao diện Dashboard.
     - Hiệu ứng Splash Loader: Biểu tượng logo Guta (`guta-mark-pure.svg`) với animation nhịp thở (`guta-splash-pulse`) mờ dần trong <370ms trước khi đưa người dùng vào giao diện làm việc.
  2. **Landing Page Sticky Shrink Header:**
     - Navbar trang chủ cố định ở đầu trang (`fixed`). Khi người dùng cuộn trang `window.scrollY > 20px`, navbar tự động co gọn padding, bo tròn viền capsule (`rounded-full`), chuyển sang bề mặt kính mờ frosted glass (`backdrop-filter: blur(20px)`), viền mờ `rgba(255, 255, 255, 0.1)` chống nhảy layout (Zero-CLS).
  3. **Trợ Lý AI Trung Tâm (Chat Copilot First View):**
     - Đặt Trợ lý AI Copilot làm trung tâm hành động (Action Center). Người dùng có thể dễ dàng chuyển đổi nhanh giữa khung chat AI và bảng quản trị chi nhánh CRM thông qua thanh điều hướng và phím tắt `Escape`.
- **Hỗ trợ khả năng tiếp cận (Accessibility & Reduced Motion):**
  - Mọi hiệu ứng chuyển động đều được bọc và tôn trọng thuộc tính `@media (prefers-reduced-motion: reduce)`. Khi người dùng kích hoạt giảm chuyển động, toàn bộ scale, translate và pulse đều được vô hiệu hóa, chuyển sang hiển thị tức thời hoặc mờ đục nhẹ nhàng.

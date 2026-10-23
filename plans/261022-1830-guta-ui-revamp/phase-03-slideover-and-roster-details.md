---
title: "Phase 3: Slide-Over Drawer & Live Roster Details (Zero Yellow)"
status: pending
phase: 3
owner: feat/frontend-web
depends_on: ["Phase 2"]
---

# Phase 3: Slide-Over Sheet & Chi Tiết Ca Làm Việc (Live Roster Details)

## 1. Mục Tiêu

1. **Xây dựng component `SlideOverDrawer.tsx` (`apps/web/src/components/dashboard/`):**
   - Panel trượt từ mép phải màn hình với chiều rộng cố định 440px (hoặc tối đa 90vw trên mobile/tablet).
   - Backdrop tối mờ (`backdrop-blur-sm`, `bg-black/40`) bao phủ toàn màn hình.
   - Cơ chế đóng mở chuẩn CSS:
     * Đóng: `transform: translateX(100%); pointer-events: none; visibility: hidden;`
     * Mở: `transform: translateX(0); pointer-events: auto; visibility: visible;`
     * Đảm bảo khi đóng tuyệt đối không chặn sự kiện click chuột trên bảng dữ liệu bên dưới.
2. **Nội dung chi tiết trong Drawer:**
   - **Header:** Mã chi nhánh (Badge xám `GT-CH-01`), Tên chi nhánh, Quận, Tên Cửa Hàng Trưởng. Nút "X" đóng drawer góc trên phải.
   - **Thẻ Chỉ Số KPI Ca Trực:**
     * Doanh thu két hiện tại (so sánh với hôm qua).
     * Tổng số nhân sự & Tỷ lệ đúng giờ ca.
   - **Live Roster (Danh Sách Barista Đang Trực Ca):**
     * Trương Quốc Thái (Pha chế chính • Check-in: 05:55 • Đúng giờ).
     * Lê Thị Kim Ngân (Thu ngân / Order • Check-in: 06:01 • Đúng giờ).
     * Nguyễn Văn Đạt (Phụ bar / Sơ chế • Check-in: 06:00 • Đúng giờ).
     * Mỗi Barista có avatar chữ cái đầu, badge chức vụ, thời gian check-in từ máy chấm công vân tay.
   - **Guta AI Copilot Recommendation Box:**
     * Hộp cảnh báo bo góc có viền xanh sapphire nhẹ:
     * *"Dự báo lượng khách giờ trưa (11:30 - 13:00) tại chi nhánh này tăng 35% do khu vực văn phòng. Khuyến nghị điều chuyển thêm 1 Barista Part-time hỗ trợ order máy cà phê."*
   - **Hành Động Khẩn Cấp (Footer Actions):**
     * Nút **"Gửi Cảnh Báo Telegram"** (Nút chính: Nền đen Titanium trong Light mode hoặc trắng trong Dark mode, hover đổi sắc nhẹ). Bấm gửi alert tới Bot Telegram của Quản lý chi nhánh.
     * Nút **"Đóng"** (Viền mỏng, đóng drawer).

## 2. Chi Tiết Kỹ Thuật

### 2.1. Props Interface
```typescript
import { StoreRecord } from './StoreTable';

export interface SlideOverDrawerProps {
  store: StoreRecord | null;
  isOpen: boolean;
  onClose: () => void;
  onSendTelegramAlert: (storeId: string) => void;
}
```

### 2.2. Keyboard & Accessibility (a11y)
- Bấm phím `Escape` tự động đóng Drawer.
- Focus trap nhẹ nhàng trong Drawer khi mở, trả lại focus cho hàng đã chọn khi đóng.
- Hỗ trợ `prefers-reduced-motion`: nếu bật reduced motion, transition giảm về 0ms (xuất hiện tức thì thay vì trượt dài).

## 3. Tiêu Chí Nghiệm Thu (Verification Gates)

1. `pnpm --filter web build` pass 100%.
2. Bấm vào bất kỳ dòng nào trong Data Table -> Drawer mở ra mượt mà trong vòng 250ms với hiệu ứng trượt từ bên phải.
3. Khi Drawer đóng: bảng phía sau bấm click bình thường, không bị chặn bởi invisible overlay.
4. Bấm nút "Gửi Cảnh Báo Telegram" gọi hàm callback hiển thị Toast thông báo thành công.

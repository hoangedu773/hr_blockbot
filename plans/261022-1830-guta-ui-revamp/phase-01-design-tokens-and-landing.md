---
title: "Phase 1: Design Tokens & Landing Page (Folio Template - Zero Yellow)"
status: pending
phase: 1
owner: feat/frontend-web
depends_on: []
---

# Phase 1: Chuẩn Hóa Design Tokens (Loại Bỏ Màu Vàng) & Xây Dựng Trang Landing Page Folio

## 1. Mục Tiêu

1. **Cập nhật `apps/web/src/index.css`:**
   - Triệt tiêu 100% các biến màu vàng cũ (`--guta-yellow: #eab308;`, `#ffd100`, v.v.).
   - Khai báo hệ thống biến CSS tokens OKLCH: `--bg-app`, `--bg-card`, `--border-subtle`, `--text-primary`, `--accent-primary` (Electric Sapphire `#2563eb`).
   - Cấu hình custom scrollbar siêu mỏng 4px và keyframes: `@keyframes auto-scroll-ribbon`, `@keyframes pulse-subtle`.
2. **Xây dựng module Landing Page hoàn chỉnh tại `apps/web/src/components/landing/`:**
   - `LandingNavbar.tsx`: Thanh điều hướng với Brand Guta Workspace (Chữ trắng/đen Titanium, badge Sapphire), menu anchor, nút Theme Dark/Light và nút CTA "Get Started" kích hoạt Auth Modal.
   - `LandingHero.tsx`: Tiêu đề "Quản Trị Nhân Sự & Phân Ca Tự Động", nút điều hướng, và khung Mockup Dashboard thu nhỏ hiển thị các số liệu vận hành thời gian thực.
   - `LogoMarquee.tsx`: Băng chuyền 13 logo đối tác chạy liên tục vô tận với mask viền mờ 2 bên (`mask-image: linear-gradient(...)`).
   - `BentoFeatures.tsx`: Khối Bento Grid 4 thẻ tính năng (Dữ liệu ca, Chat trợ lý, Lịch trình 24h, Thẻ nhân sự xếp tầng cascade 3D).
   - `InteractiveTabs.tsx`: 4 tab tính năng (Tổng quan, Chấm công, Phân ca AI, Báo cáo) tự động chuyển tab mỗi 6.000ms với thanh progress bar cập nhật liên tục 50ms, dừng khi di chuột vào.
   - `FaqSection.tsx`: Accordion 6 câu hỏi thường gặp với transition mượt mà.
   - `AuthModal.tsx`: Hộp thoại modal đăng nhập nhanh 1-Click theo vai trò thực tế:
     * Cửa hàng trưởng (SM): Nguyễn Thị Phương Anh (Chi nhánh Tân Bình)
     * Quản lý khu vực (AOM): Nguyễn Cao Thanh Trầm (Khu vực Q1/Q3/Q10)
     * Quản trị viên (Admin): Ban Điều Hành Guta

## 2. Chi Tiết Kỹ Thuật & Cấu Trúc File

### 2.1. File `apps/web/src/components/landing/LandingNavbar.tsx`
- **Props Interface:**
  ```typescript
  export interface LandingNavbarProps {
    onOpenAuthModal: () => void;
  }
  ```
- **Hành vi:**
  - Nhấp "Đăng nhập" hoặc "Get Started" gọi `onOpenAuthModal()`.
  - Nút chuyển theme Dark/Light thay đổi class `dark` trên `document.documentElement` và lưu vào `localStorage.getItem('theme')`.

### 2.2. File `apps/web/src/components/landing/InteractiveTabs.tsx`
- **Logic vòng lặp:**
  ```typescript
  const [activeTab, setActiveTab] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  // Interval 50ms cộng thêm progress (50 / 6000 * 100); khi đạt 100% chuyển activeTab = (activeTab + 1) % 4
  ```
- **States:** Hover vào card -> `setIsPaused(true)`; rời chuột -> `setIsPaused(false)`.

### 2.3. File `apps/web/src/components/landing/AuthModal.tsx`
- **Props Interface:**
  ```typescript
  export interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectRole: (role: 'SM' | 'AOM' | 'Admin') => void;
  }
  ```
- **Nội dung:** 3 thẻ tài khoản mẫu 1-Click với avatar, họ tên, vai trò và chi nhánh quản lý. Bấm vào tài khoản nào sẽ đăng nhập ngay tài khoản đó và chuyển vào Dashboard.

## 3. Tiêu Chí Nghiệm Thu (Verification Gates)

1. `pnpm --filter web build` biên dịch thành công, không có lỗi TypeScript hay cú pháp CSS.
2. Kiểm tra mã màu: grep toàn bộ `apps/web/src/` đảm bảo không còn chuỗi `#ffd100`, `#eab308`, `yellow`.
3. Kiểm tra hiển thị route `/`: Landing page render đủ 6 sections, logo marquee chạy mượt, Interactive Tabs tự nhảy sau 6s.
4. Bấm "Get Started" mở Auth Modal với animation fade-in và scale-in.

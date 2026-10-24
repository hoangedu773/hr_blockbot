# Phase 1: Sửa Triệt Để Luồng Session, Trang Chủ & Đăng Xuất

> **Mục tiêu:** Đảm bảo khi mở ứng dụng luôn vào Trang Chủ (Landing Page) trước; khắc phục triệt để lỗi Đăng Xuất (Logout loop / snapback).

---

## 1. Bối Cảnh & Vấn Đề Kỹ Thuật

- **Tệp sửa đổi:** `apps/web/src/App.tsx`
- **Hiện tượng:**
  1. Khi vào web lần đầu hoặc mở tab mới, `localUser` đọc từ `localStorage.getItem('guta_user')`, dẫn tới việc người dùng bị đưa thẳng vào Dashboard thay vì xem Trang Chủ (`FolioLandingView`).
  2. Khi bấm "Đăng Xuất", hàm `handleLogout` xóa `localStorage` nhưng `useEffect` đồng bộ auth context (`authUser && !localUser`) lập tức phát hiện và khởi tạo lại session, khiến người dùng không thể thoát ra Trang Chủ.

---

## 2. Các Bước Thực Hiện Chi Tiết

1. **Điều Chỉnh Khởi Tạo `localUser`:**
   - Đổi `localStorage` sang `sessionStorage` để phiên làm việc không bị lưu đè vĩnh viễn qua các tab khác nhau.
   - Thêm trạng thái `currentView: 'landing' | 'dashboard'` để quản lý trang hiển thị độc lập.
   - Khi vào trang mà chưa đăng nhập chủ động: hiển thị `FolioLandingView`.

2. **Sửa Hàm `handleLogout`:**
   - Đặt cờ `isLoggingOut = true` để vô hiệu hóa tạm thời `useEffect` đồng bộ auth context.
   - Dọn dẹp cả `sessionStorage` và `localStorage` cho key `guta_user`.
   - Đặt `setLocalUser(null)` và đóng ChatDrawer.
   - Gọi `await authLogout()`.
   - Chuyển `currentView` về `'landing'`.
   - Hiển thị thông báo toast: "Đã đăng xuất phiên làm việc an toàn."

3. **Bảo Toàn Selector Cho Playwright E2E Test:**
   - Nút đăng xuất phải giữ nguyên `role="button"` và `aria-label="Đăng Xuất Phiên"`.
   - Sau khi đăng xuất, DOM phải hiển thị `h1` của Landing Page chứa text `/Quản Trị Nhân Sự/i`.

---

## 3. Tiêu Chí Nghiệm Thu Phase 1

- [x] Mở ứng dụng trong tab mới luôn hiển thị Trang Chủ `FolioLandingView`.
- [x] Bấm nút "Get Started" hoặc "Đăng nhập" mở `AuthModal`, chọn vai trò ➔ vào Dashboard thành công.
- [x] Bấm nút Đăng Xuất ở Sidebar ➔ quay về Trang Chủ ngay lập tức, không bị văng ngược lại Dashboard.

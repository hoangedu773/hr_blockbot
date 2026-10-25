# Kế Hoạch: Thanh Trừng Màu Xám Xanh (Purge Navy/Slate-900) & Thiết Kế Lại Sticky Header Chuẩn Vercel/Linear

- **Mục tiêu:**
  1. **Khắc phục triệt để lỗi visual navbar bị co bo góc kì dị (Image #1)**:
     - Đã bỏ toàn bộ `border-radius: 9999px` trên navbar/inner-div của header.
     - Thiết kế lại navbar theo chuẩn Full-width Seamless Frosted Topbar (Apple, Vercel, Linear, Stripe):
       - Cố định toàn màn hình: `position: fixed; top: 0; left: 0; right: 0; width: 100%; z-index: 50;`.
       - Mặc định ở đỉnh: nền trong suốt `background: transparent; border-bottom: 1px solid transparent;`.
       - Khi cuộn trang `window.scrollY > 20px` (`.nav-scrolled`): Co padding dọc từ 16px xuống 10px (shrink effect), nền chuyển sang kính mờ Obsidian `rgba(10, 10, 12, 0.85) !important` + `backdrop-filter: blur(24px) !important`, viền đáy tinh tế `border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important`.
       - Tuyệt đối không để xảy ra hiện tượng mép bo tròn lơ lửng cắt xéo màn hình như ảnh lỗi.
  2. **Thanh trừng 100% màu "xám xanh" (`rgba(15, 23, 42, ...)`, `#0f172a`, `slate-900`, `slate-800`)**:
     - Thay thế toàn bộ bằng dải màu Neutral Dark Obsidian / Pure Charcoal (`#09090b`, `#121214`, `#18181b`, `rgba(18, 18, 20, ...)`, `rgba(10, 10, 12, ...)`).
     - Không để sót bất kỳ sắc thái xanh xao (blue-gray / navy) nào trên navbar, drawer, sidebar, modal, header.
  3. **QA & Kiểm thử với hình ảnh thực tế (Vision & Screenshot)**:
     - Đã chụp ảnh màn hình thực tế `previews/verified-header-scrolled.png` xác thực trực quan 100% header phẳng tràn viền sang trọng, không lỗi bo góc, màu neutral obsidian chuẩn.
     - Đảm bảo toàn bộ 16/16 test E2E PASS 100%.
- **Trạng thái:** HOÀN THÀNH - NGHIỆM THU PASS 100% (25/10/2026).

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

1. [x] `apps/web/public/assets/folio/folio-layout.css` (Xóa bỏ `border-radius: 9999px` và `rgba(15, 23, 42, 0.85)`, thay bằng full-width frosted topbar)
2. [x] `apps/web/src/index.css` (Thanh trừng toàn bộ `rgba(15, 23, 42, ...)` và `#0f172a`, thay bằng neutral obsidian)
3. [x] `apps/web/src/components/FolioLandingView.tsx` (Xóa bỏ các class `slate-900`, chuẩn hóa navbar shrink)
4. [x] `apps/web/src/components/CrmDashboardView.tsx` (Xóa bỏ các class `slate-900`, đổi sang neutral dark)
5. [x] `apps/web/src/components/chat/ChatDrawer.tsx` (Xóa bỏ `rgba(15, 23, 42, ...)`)
6. [x] `apps/web/src/components/landing/AuthModal.tsx` (Xóa bỏ `rgba(15, 23, 42, ...)`)
7. [x] `apps/web/test/e2e-revamp-flow.test.mjs` (Cập nhật assertions kiểm tra header mới và màu neutral)
8. [x] `docs/DESIGN.md` (Cập nhật quy định cấm màu xám xanh slate-900)

---

## 2. Tiêu Chí Nghiệm Thu (Acceptance Criteria)

- [x] Navbar trên Landing Page khi cuộn trang hiển thị toàn chiều ngang (full-width), co nhỏ padding mượt mà, nền kính mờ neutral obsidian `rgba(10, 10, 12, 0.85)` + viền đáy mỏng, **0 lỗi bo góc dị dạng**.
- [x] Không còn bất kỳ token màu `15, 23, 42` hay `slate-900` xám xanh nào trong các component chính.
- [x] Ảnh chụp Playwright screenshot chứng minh navbar phẳng, mượt, cao cấp.
- [x] `pnpm -r run build` PASS.
- [x] `node apps/web/test/e2e-revamp-flow.test.mjs` PASS 16/16.

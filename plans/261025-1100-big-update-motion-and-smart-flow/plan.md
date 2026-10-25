# Kế Hoạch: Đại Tu Toàn Diện UI/UX Motion & Flow Dashboard Thông Minh (Big Update Motion & Smart Flow)

- **Mục tiêu:**
  1. **Smart Auto-login & Branded Splash Loader**: Mở app tự động nhận diện tài khoản đã đăng nhập (cả trong `localStorage`/`sessionStorage` và cookie auth), kèm Splash Loader logo Guta (`/assets/logos/guta-mark-pure.svg`) hiệu ứng scale-pulse mượt mà chuyển cảnh sang Dashboard.
  2. **First View: Chat Copilot Trung Tâm (Action Center)**: Mở Dashboard là vào ngay giao diện Chat Copilot thông minh thay vì đập ngay vào mắt là bảng Table số liệu khô cứng. Bổ sung nút chuyển đổi nhanh (Quick-Switch CTA / Tab) sang bảng 45 chi nhánh.
  3. **Landing Page Sticky Shrink Header**: Cố định navbar trang chủ (`position: fixed` / `sticky`), khi cuộn trang `scrollY > 20px` tự động co nhỏ padding (shrink), bo góc pill, chuyển sang frosted glass `backdrop-filter: blur(16px)` với viền mờ tinh tế.
  4. **Hệ Thống Motion Chuẩn Emil Kowalski & Apple macOS**: Đồng bộ token motion trong `apps/web/src/index.css` với curve `cubic-bezier(0.23, 1, 0.32, 1)`, button press scale `0.98`, card float hover, tab cross-fade mượt mà, hỗ trợ chuẩn `prefers-reduced-motion`.
  5. **Cập nhật & Dọn dẹp Docs**: Cập nhật `docs/10-ui-ux-spec.md` và `docs/DESIGN.md` đồng bộ kiến trúc mới, xóa bỏ file nhị phân rác `docs/DevinUserSetup-x64-3.10.23.exe` (258MB).
  6. **Đảm bảo 100% kiểm thử E2E PASS**: Cập nhật assertions trong `apps/web/test/e2e-revamp-flow.test.mjs` bảo đảm 16/16 tests PASS.
- **Trạng thái:** HOÀN THÀNH - NGHIỆM THU PASS 100% (25/10/2026).

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

### Phase 1: Frontend Code & Test
- [x] `apps/web/src/App.tsx` (Auto-login session bootstrap, Splash Screen loader, sync localStorage & sessionStorage)
- [x] `apps/web/src/components/FolioLandingView.tsx` (Scroll listener cho sticky shrink navbar, pill shape frosted header)
- [x] `apps/web/src/components/chat/ChatPageView.tsx` (Quick-switch sang CRM view, animation mượt mà khi vào)
- [x] `apps/web/src/components/CrmDashboardView.tsx` (Animation entry cho KPI cards, drawer easing chuẩn)
- [x] `apps/web/src/index.css` (Hệ thống Motion Tokens, keyframes splash, sticky header styles, reduced-motion)
- [x] `apps/web/test/e2e-revamp-flow.test.mjs` (Cập nhật E2E test cho auto-login, splash loader, sticky nav, chat-first)

### Phase 2: Documentation & Cleanup
- [x] `docs/10-ui-ux-spec.md` (Cập nhật spec motion tokens, splash loader, sticky shrink header)
- [x] `docs/DESIGN.md` (Cập nhật design tokens motion & interaction flow)
- [x] `docs/README.md` (Đồng bộ tài liệu điều hướng)
- [x] Dọn dẹp file nhị phân rác `docs/DevinUserSetup-x64-3.10.23.exe` (258MB).

---

## 2. Tiêu Chí Nghiệm Thu (Acceptance Criteria)

- [x] **Splash Loader**: Logo Guta xuất hiện mượt mà khi app tải/bootstrap session (<370ms) rồi tan biến tự nhiên (fade out).
- [x] **Smart Auto-login**: Nếu người dùng đã đăng nhập trước đó, tải lại trang tự động chuyển thẳng vào Dashboard, không bị nháy lại Landing Page.
- [x] **First View Chat**: Sau khi vào Dashboard, có thể chuyển đổi tức thì giữa Chat Copilot (`ChatPageView`) và "Vận Hành (CRM)".
- [x] **Landing Header Shrink**: Cuộn trang `scrollY > 20px`, header co padding, nền frosted glass mờ, viền xám tinh tế.
- [x] **Motion & Polish**: Các hiệu ứng hover, active, drawer, tab transition vận hành mượt mà với `cubic-bezier(0.23, 1, 0.32, 1)`.
- [x] **Zero-Yellow & Clean Tokens**: Duy trì 0 pixel màu vàng cấm, không lỗi console/pageerror.
- [x] **Build & Test**: `pnpm -r run build` PASS, `node apps/web/test/e2e-revamp-flow.test.mjs` PASS 16/16.
- [x] **Docs**: Cập nhật đầy đủ docs, gỡ bỏ file exe rác ~258MB.

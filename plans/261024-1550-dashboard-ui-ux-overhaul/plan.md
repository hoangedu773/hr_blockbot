# Kế Hoạch Toàn Diện: Nâng Cấp UI/UX Guta CRM Dashboard, Sửa Lỗi Đăng Xuất & Điều Hướng Trang Chủ

> **Mã kế hoạch:** `plans/261024-1550-dashboard-ui-ux-overhaul/plan.md`  
> **Mục tiêu cốt lõi:**  
> 1. Sửa dứt điểm lỗi Đăng xuất (Logout loop) và đảm bảo mở ứng dụng luôn vào **Trang Chủ (Landing Page)** trước.  
> 2. Đại tu toàn diện UI/UX **Guta CRM Dashboard**: loại bỏ 100% icon emoji (☕, ✨, v.v.), thay bằng bộ SVG vector chuẩn enterprise; tái cấu trúc layout chống vỡ khung, cải thiện bảng điều khiển, KPI cards và Slide-over Drawer sang giao diện chuẩn cao cấp F&B Electric Sapphire `#2563eb`.  
> 3. Bảo toàn 100% chất lượng kiểm thử (12/12 bài test Playwright E2E pass 0 console error, monorepo build xanh 100%).

---

## 1. Phân Tích Nguyên Nhân Gốc Rễ (Root Cause Analysis)

### 1.1. Lỗi Đăng Xuất (Logout Snapback Loop) & Không Mở Ra Trang Chủ Trước
- **Hiện tượng:** Người dùng bấm Đăng Xuất nhưng bị tự động đăng nhập lại ngay lập tức; khi mở trình duyệt mới hoặc F5 lại bị văng thẳng vào Dashboard thay vì Trang Chủ.
- **Nguyên nhân kỹ thuật (`apps/web/src/App.tsx`):**
  1. `App.tsx` lưu `guta_user` vĩnh viễn vào `localStorage`. Khi khởi động app, `useState(() => localStorage.getItem('guta_user'))` đọc dữ liệu cũ và trực tiếp render `CrmDashboardView` thay vì `FolioLandingView`.
  2. Trong `App.tsx` có `useEffect` đồng bộ:
     ```typescript
     useEffect(() => {
       if (authUser && !localUser) {
         const profile = ROLE_PROFILES[authUser.role === 'Admin' ? 'Admin' : 'SM'];
         setLocalUser(profile);
         localStorage.setItem('guta_user', JSON.stringify(profile));
       }
     }, [authUser, localUser]);
     ```
     Khi `handleLogout()` gọi `setLocalUser(null)`, nếu `authUser` trong `AuthContext` chưa kịp dọn hoặc trả về đối tượng cũ, `useEffect` này bắt được `authUser && !localUser` và **ngay lập tức hồi sinh session**, ghi đè lại vào `localStorage`!
  3. Hai nút logout trong HTML string: nút trên header `<a href="#logout" title="Trở về Trang Chủ">` và nút ở profile card `<a href="#logout" aria-label="Đăng Xuất Phiên">` bị gắn listener chồng chéo với bộ chặn dead link `deadLinks`.

### 1.2. Bố Cục Dashboard "Vỡ Khung" & Lạm Dụng Icon Emoji
- **Hiện tượng:** Giao diện Dashboard bố cục méo mó, bảng 9 cột bị chèn ép; xuất hiện icon emoji `☕` trong mọi dòng cửa hàng, `✨` trong Copilot và Drawer, font chữ và viền border không đồng nhất.
- **Nguyên nhân kỹ thuật (`apps/web/src/components/CrmDashboardView.tsx`):**
  1. Component đang render qua một chuỗi HTML thô khổng lồ (`dangerouslySetInnerHTML={{ __html: CRM_HTML }}`) với các class phụ thuộc vào file CSS ngoại vi `/assets/crm/2voh1gse7971r.css`. Khi nạp đè lên `folio.css`, các biến CSS `--sidebar-width` và class flexbox bị xung đột độ cao (`h-svh` vs `min-h-screen`), gây hiện tượng giật layout và tràn ngang.
  2. Hardcode emoji Unicode:
     - `☕` trong từng row: `<div class="... font-bold text-[10px]">☕</div>` (10 rows).
     - `✨` trong menu sidebar: `<div>✨</div>`.
     - `✨` trong Drawer: `<span>✨ Trợ lý ca Guta AI</span>`.
     - `↻` trong spinner button: `<span class="animate-spin inline-block mr-1">↻</span>`.
  3. Thiếu khối thống kê KPI tổng quan (Metric Cards) ở đầu trang Dashboard để quản lý nắm nhanh số liệu 45 cửa hàng.

---

## 2. Kế Hoạch Thực Hiện 5 Pha (Phased Roadmap)

### Phase 1: Sửa Triệt Để Luồng Session, Trang Chủ & Đăng Xuất (`apps/web/src/App.tsx`)
- **Mục tiêu:** Mở app luôn hiển thị **Trang Chủ (FolioLandingView)**. Đăng xuất xóa sạch session và đưa về Trang Chủ ngay lập tức.
- **Giải pháp kỹ thuật:**
  1. Chuyển cơ chế lưu `guta_user` từ `localStorage` sang `sessionStorage` (hoặc cờ session phiên làm việc). Khi mở tab mới, mặc định `localUser = null` ➔ Render Trang Chủ `FolioLandingView`.
  2. Bổ sung cờ điều hướng view rõ ràng `currentView: 'landing' | 'dashboard'`. Mặc định khởi tạo luôn là `'landing'`.
  3. Trong `handleLogout()`:
     - Xóa triệt để cả `sessionStorage` và `localStorage`.
     - Gọi `authLogout()` đồng thời cưỡng chế reset `authUser = null` trong context.
     - Đặt cờ ngăn `useEffect` đồng bộ hồi sinh session cũ.
     - Chuyển `currentView = 'landing'` và `localUser = null`.

### Phase 2: Đại Tu Bố Cục Guta CRM Dashboard (`apps/web/src/components/CrmDashboardView.tsx`)
- **Mục tiêu:** Bố cục layout chuẩn SaaS chuyên nghiệp, chia khối rõ ràng, không giật lag, hỗ trợ hiển thị sắc nét trên cả desktop 1440px và laptop 1280px.
- **Giải pháp kỹ thuật:**
  1. **Sidebar cố định tinh gọn (Width 260px):**
     - Logo Guta thương hiệu chính thức (`/assets/logos/guta-mark-pure.svg`), nhãn `GUTA WORKSPACE` với Electric Sapphire accent.
     - Search input tích hợp phím tắt `⌘K` đồng bộ.
     - Menu phân nhóm khoa học:
       * *Vận hành ca trực:* Cửa hàng (Active 45), Đội ngũ Barista (Coming Soon), Lịch Phân Ca 24H (Coming Soon), Chấm công & Đi trễ (Coming Soon), Két ca (Coming Soon).
       * *Trí tuệ nhân tạo:* Guta Copilot AI (Gắn badge Live).
     - Card hồ sơ người dùng (User Card) ở chân sidebar với avatar chữ lồng (initials), role tag rõ ràng, và **nút Đăng Xuất trực quan dạng icon box có tooltip và click handler chuyên biệt**.
  2. **Top Header & KPI Summary Ribbon:**
     - Breadcrumb chuẩn hóa: `Guta Workspace / Điều Hành Ca Trực & 45 Chi Nhánh`.
     - Live Badge: `● 45/45 Chi nhánh mở ca sáng` với hiệu ứng pulsing emerald.
     - Thêm 4 thẻ KPI Header Ribbon tinh tế:
       * *Tổng Cửa Hàng:* 45 chi nhánh (100% active ca 1).
       * *Nhân Sự Trực Ca:* 135 Barista & SM đang đứng máy.
       * *Doanh Thu Két Sáng:* 184.250.000 ₫ (Khớp 99.94% POS).
       * *Tỷ Lệ Đúng Giờ:* 98.6% (Đồng bộ máy ZKTeco).
  3. **Bảng Dữ Liệu Chi Nhánh (Stores Data Table):**
     - Thiết kế lại table header và row cells với khoảng cách cân đối, typography phân cấp rõ ràng (font tabular mono cho mã CH, doanh thu két, tỷ lệ đúng giờ).
     - Trạng thái ca trực dạng status pill chuẩn thiết kế F&B: `Đang mở ca` (emerald), `Sắp giao ca` (amber).

### Phase 3: Thay Thế 100% Icon Emoji Bằng SVG Vector Chuyên Nghiệp
- **Mục tiêu:** Loại bỏ hoàn toàn cảm giác "chán", "rẻ tiền" của emoji Unicode; nâng cấp toàn bộ sang SVG vectors sắc nét (Lucide/Heroicons SVG paths).
- **Danh sách chuyển đổi chi tiết:**
  | Vị trí xuất hiện | Emoji cũ | SVG Vector Mới | Màu sắc & Style |
  |---|---|---|---|
  | Biểu tượng từng chi nhánh trong Table | `☕` | SVG Coffee Cup / Store Front Vector | Nền Sapphire nhạt `rgba(37,99,235,0.1)`, nét xanh `#2563eb` |
  | Menu Guta Copilot AI | `✨` | SVG Sparkle / AI Bot Vector | Gradient sapphire-indigo `#2563eb` ➔ `#4f46e5` |
  | Khối AI Recommendation trong Drawer | `✨` | SVG Brain Circuit / AI Sparkle Vector | Nét xanh tím indigo `#6366f1` |
  | Nút spinner Telegram & Tạo ca | `↻` | SVG Smooth Animated Ring Spinner | Nét trắng `#ffffff`, CSS spin 360 |
  | Header Brand Icon | Chữ G thô | SVG Guta Mark Pure Logo | Logo vector chuẩn của Guta |
  | Status indicators | Dấu chấm thô | SVG CheckCircle2 & Clock Vector | Emerald `#10b981` & Amber `#f59e0b` |

### Phase 4: Nâng Cấp Slide-Over Detail Drawer & Nút Bấm Tương Tác
- **Mục tiêu:** Drawer trượt êm mượt, hiển thị thông tin ca trực của Barista đầy đủ, trực quan, có thẻ tóm tắt doanh thu két, danh sách Barista trong ca với badge chức danh chuẩn F&B.
- **Chi tiết giao diện Drawer:**
  - Header Drawer: Mã chi nhánh mono badge, tên CH in đậm, tên Cửa hàng trưởng (SM).
  - Metrics Grid: Doanh thu két hiện tại (Electric Sapphire font mono lớn), Tổng nhân sự Barista, Tỷ lệ đúng giờ ZKTeco.
  - Danh sách Barista đang làm ca: Avatar tròn với 2 chữ cái đầu, họ tên, vai trò (Pha chế chính, Thu ngân/Order, Phụ ca), giờ check-in từ máy ZKTeco và badge "Đúng ca".
  - Khối khuyến nghị AI Copilot: Viền xanh tinh tế, khuyến nghị điều chuyển nhân sự giải quyết tình trạng thiếu người giờ cao điểm.
  - Footer Action: Nút "Gửi Cảnh Báo Telegram" có spinner phản hồi, nút "Đóng" rõ ràng.

### Phase 5: Kiểm Thử Toàn Diện & Chống Hồi Quy (Verification Gate)
- **Kiểm thử hồi quy tự động:**
  - Chạy `pnpm -r run build` đảm bảo sạch lỗi TypeScript toàn bộ monorepo.
  - Chạy `node apps/web/test/e2e-revamp-flow.test.mjs` đảm bảo 12/12 bài test Playwright E2E PASS 100%, 0 console error.
  - Xác nhận các selector load-bearing của bài test không bị gãy:
    * `table`, `tbody tr`
    * `#detail-drawer`, `#drawer-backdrop`, `drawer-open`, `#d-id`
    * `button: has-text("Gửi Cảnh Báo Telegram")`
    * `button: has-text("Tạo Ca Đột Xuất")`
    * `button: has-text("Bộ lọc Quận")`
    * `input[placeholder*="Lọc theo tên, quận, mã..."]`
    * `a[aria-label="Đăng Xuất Phiên"]`
    * `nav a: has-text("Copilot")`
- **Kiểm tra luồng thực tế (Live Verification):**
  - Mở app ➔ Kiểm tra hiển thị Trang Chủ `FolioLandingView`.
  - Bấm Đăng nhập ➔ Chọn vai trò ➔ Chuyển vào Dashboard mượt mà.
  - Kiểm tra giao diện Dashboard: không còn bất kỳ emoji nào, bố cục cân đối, gọn gàng.
  - Bấm Đăng xuất ➔ Quay về Trang Chủ ngay lập tức, F5 không bị login lại.

---

## 3. Ranh Giới File Tác Động (Surgical Boundary)

- **`apps/web/src/App.tsx`**: Điều chỉnh quản lý trạng thái phiên `localUser`, sửa hàm `handleLogout` và logic đồng bộ session.
- **`apps/web/src/components/CrmDashboardView.tsx`**: Tái cấu trúc layout, thay thế toàn bộ emoji thành SVG vector chuẩn, thiết kế lại KPI cards và bảng dữ liệu.
- **`apps/web/src/components/FolioLandingView.tsx`**: Kiểm tra các điểm kích hoạt AuthModal và nút xem Dashboard đảm bảo chuyển hướng nhất quán.
- **`apps/web/src/components/chat/ChatDrawer.tsx`**: Đồng bộ biểu tượng SVG cho khối trích dẫn và action card (loại bỏ emoji nếu còn).

---

## 4. Tiêu Chí Nghiệm Thu (Acceptance Criteria)

1. **Flow Khởi Động:** Mở trình duyệt truy cập ứng dụng luôn hiển thị Trang Chủ (Landing Page) đầu tiên.
2. **Flow Đăng Xuất:** Bấm nút Đăng Xuất tại Sidebar sẽ hủy phiên làm việc ngay lập tức, chuyển về Trang Chủ, không bị giật lag hay tự động đăng nhập lại khi F5.
3. **Chất Lượng UI/UX Dashboard:**
   - 0 icon emoji trên toàn bộ Dashboard (không còn `☕`, `✨`, `↻`).
   - 100% icon chuyển sang SVG vector tinh tế, sắc nét.
   - Bố cục Sidebar + Top Header + KPI Ribbon + Data Table + Slide-over Drawer đồng bộ màu sắc Electric Sapphire `#2563eb` và theme tối Slate/Zinc.
4. **Kiểm Thử:**
   - `pnpm -r run build` PASS 100%.
   - `node apps/web/test/e2e-revamp-flow.test.mjs` PASS 12/12 test, 0 lỗi console.

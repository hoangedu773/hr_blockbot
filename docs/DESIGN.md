# 🎨 DESIGN.md — Thư Viện Nguồn Cảm Hứng & Hệ Thống Thiết Kế UI/UX

> **Mục tiêu:** Cung cấp danh sách các trang web thư viện component UI đẹp nhất hiện nay (xem trực quan, có code copy-paste ngay) để bạn tự do lựa chọn giao diện Dashboard/Command Center ưng ý nhất. Sau khi bạn chọn được mẫu/link yêu thích, hệ thống sẽ điều phối cập nhật toàn bộ vào codebase.

---

## 1. 🌐 Top 6 Trang Web Thư Viện UI Trực Quan Đẹp Nhất (Copy-Paste Code)

Dưới đây là các kho giao diện Dark Mode xịn xò nhất dành cho React, Tailwind CSS và Dashboard chuyên nghiệp:

### 1. [21st.dev — The NPM for Design Engineers](https://21st.dev) ⭐ (Khuyên dùng số 1)
- **Điểm mạnh:** Thư viện mở lớn nhất tập hợp hàng nghìn components cực đẹp từ cộng đồng design engineers (tương tự Product Hunt cho UI).
- **Trực quan:** Có bản demo live chạy trực tiếp trên web, xem được cả Dark Mode, hiệu ứng hover, click.
- **Copy code:** Bấm 1 nút là copy thẳng code React (Tailwind / Framer Motion / Lucide icons).
- **Mục nên xem:** Tìm kiếm từ khóa `dashboard`, `stat card`, `data table`, `timeline`, `chat`.

### 2. [Shadcn UI Blocks & Examples](https://ui.shadcn.com/blocks)
- **Điểm mạnh:** Thư viện chuẩn mực số 1 của hệ sinh thái React hiện nay (chuẩn mực kiến trúc ADR-015 của dự án).
- **Các mẫu Dashboard dựng sẵn:**
  - [Dashboard 01 - Executive Overview](https://ui.shadcn.com/blocks#dashboard-01) (Cards KPI + Bảng giao dịch gần đây).
  - [Dashboard 05 - Orders & Analytics](https://ui.shadcn.com/blocks#dashboard-05) (Thanh tiến độ tuần, bảng phân trang, tab lọc).
  - [Dashboard 06 - Products & Inventory](https://ui.shadcn.com/blocks#dashboard-06) (Bảng dữ liệu chuẩn Enterprise, bộ lọc trạng thái).
- **Xem thêm tại:** [Shadcn.io Examples](https://www.shadcn.io/examples) (Hơn 1.100 ví dụ trực quan về Cards, Charts, Tables).

### 3. [Tremor — Dashboard & Analytics Components](https://tremor.so) ⭐ (Chuyên trị số liệu & KPI)
- **Điểm mạnh:** Thiết kế chuyên dụng 100% cho Dashboard quản trị, biểu đồ số liệu, thẻ KPI doanh nghiệp.
- **Phong cách:** Cực kỳ tối giản, thanh lịch, tone xám đen cao cấp (tương tự Stripe Dashboard).
- **Các khối có sẵn:** Metric Cards kèm Sparklines (biểu đồ mini góc thẻ), thanh đo % tiến độ, bảng phân công nhiệm vụ, bộ lọc đa chiều.

### 4. [Aceternity UI](https://ui.aceternity.com)
- **Điểm mạnh:** Các components có hiệu ứng thị giác đỉnh cao (Borders phát sáng nhẹ, Card 3D tilt, Spotlight hover).
- **Ứng dụng:** Rất hợp nếu bạn muốn thanh AI Copilot, Khung Chat hoặc Thẻ đề tài có hiệu ứng hiện đại, cao cấp kiểu Linear.app.

### 5. [Magic UI](https://magicui.design)
- **Điểm mạnh:** Tinh gọn hơn Aceternity, chuyên các vi tương tác (micro-interactions): số đếm nhảy mượt mà (Number Ticker), thanh trạng thái phát sáng (Shimmer Button), dây nối tiến trình (Animated Beam).

### 6. [Untitled UI — Dashboard Inspiration](https://www.untitledui.com/components/dashboards)
- **Điểm mạnh:** Kho dashboard SaaS mẫu đẹp nhất thế giới trên Figma & Tailwind. Dù bản Figma đầy đủ có phí nhưng thư viện showcase của họ là nguồn tham khảo layout bố cục chuẩn xác nhất về tỷ lệ vàng dashboard.

---

## 2. 🚫 Quy Tắc Bất Biến Về Select Menu & Scrollbar (Theo project-design-rules.md)

- **Cấm hoàn toàn thẻ `<select>` mặc định của OS**: Không để bung popup xám trắng của Windows/macOS. 100% dùng Custom Popover/Select component (Radix Select / Custom div dropdown) có nền tối, viền mỏng, item hover mượt mà.
- **Custom Scrollbar đồng bộ**: Toàn bộ thanh cuộn danh sách menu và bảng phải dùng custom CSS scrollbar siêu mảnh (4px - 6px), thumb bo góc mờ, hover đổi màu nhẹ, cấm thanh kéo trắng xám to bản mặc định.

---

## 3. 🎯 Các Bước Bạn Chọn & Tôi Điều Phối Tiếp Theo

1. Bạn chỉ cần click vào các đường link trên (đặc biệt là **[21st.dev](https://21st.dev)**, **[ui.shadcn.com/blocks](https://ui.shadcn.com/blocks)** hoặc **[tremor.so](https://tremor.so)**).
2. Khi lướt thấy **component hoặc dashboard nào bạn ưng ý nhất** (về tông màu, kiểu thẻ card, bảng hay thanh điều hướng):
   - Bạn chỉ cần **quăng link hoặc copy đoạn code/mô tả đó vào đây**.
3. Tôi sẽ điều phối:
   - Thay thế toàn bộ CSS tokens / Palette màu theo đúng phong cách đó.
   - Viết lại các View (`ProjectListView`, `DetailView`, `ApprovalQueue`) và dựng trang Preview chuẩn chỉ cho bạn nghiệm thu!

---

## 4. 🏆 Quyết Định Kiến Trúc Giao Diện Mới (Official Design Decision - 2026)

Đã chốt phương án phối hợp 2 giao diện cao cấp:

### 4.1. Cấu Trúc Trải Nghiệm (User Experience Flow)
```text
[Landing Page (Folio)] ---> Nút "Get Started" / "Đăng nhập" ---> [Auth Modal] ---> [Trợ Lý AI Copilot (Chat-First)]
(Editorial serif Newsreader,                                                       (OpenAI Capsule Pill,
 Sticky shrink header, 0 pixel màu vàng)                                           Quick switch sang CRM 45 chi nhánh)
```

1. **Trang Giới Thiệu (Landing Page):** Bóc tách chính xác từ bản chuẩn **[`apps/web/previews/folio-layout.html`](../apps/web/previews/folio-layout.html)**:
   - URL Local Preview: `http://127.0.0.1:5173/previews/folio-layout.html`.
   - Component sản phẩm: `apps/web/src/components/FolioLandingView.tsx`.
   - Stylesheets: `/assets/folio/folio.css` + `/assets/folio/folio-layout.css`.
   - Typography: Font Editorial Serif **Newsreader** (Google Fonts) kết hợp Geist Sans, bảo đảm 100% hiển thị mượt mà dấu thanh tiếng Việt không bị nhảy font (Georgia fallback bug).
   - Nội dung: Hero với Headline chuẩn "Quản Trị Nhân Sự & Phân Ca Tự Động Chuỗi F&B", mockup 5 cột Kanban theo vòng đời đề tài (Khởi tạo, Đã giao, Đang thực hiện, Chờ duyệt, Hoàn thành), thẻ gợi ý phân công AI PhoBERT, khối tính năng đối chiếu và dải đối tác cung ứng F&B (Vinamilk, La Marzocco, Dalatmilk, Monin,...).
   - **Sticky Shrink Header:** Cuộn trang `scrollY > 20px` tự động co nhỏ padding thành dạng capsule pill với hiệu ứng frosted glass `backdrop-filter: blur(20px)` và viền mờ tinh tế.

2. **Cổng Đăng Nhập (Auth Modal):** 
   - Modal bật lên từ nút "Get Started" / "Đăng nhập" / "Xem dashboard".
   - Hỗ trợ đăng nhập nhanh 1-Click theo 3 vai trò thực tế:
     * Cửa hàng trưởng (SM): Nguyễn Thị Phương Anh (Chi nhánh Tân Bình).
     * Quản lý khu vực (AOM): Nguyễn Cao Thanh Trầm (Khu vực Q1/Q3/Q10).
     * Quản trị viên (Admin): Ban Điều Hành Guta (Toàn quyền chuỗi).

3. **Bảng Điều Khiển Quản Trị (CRM Dashboard):** Bóc tách chính xác từ bản chuẩn **[`previews/preview-21st-crm.html`](../previews/preview-21st-crm.html)**:
   - File tham chiếu: `C:\work-space\hr-blockbot\previews\preview-21st-crm.html`.
   - Component sản phẩm: `apps/web/src/components/CrmDashboardView.tsx`.
   - Stylesheets: `/assets/crm/2voh1gse7971r.css` + `/assets/crm/2e445toz63gzv.css`.
   - Bảng dữ liệu thực tế 45 chi nhánh Guta Coffee (Sư Vạn Hạnh, Nguyễn Cửu Vân, Đặng Văn Sâm, Nguyễn Thị Minh Khai,...).
   - **Slide-Over Sheet:** Bấm vào bất kỳ dòng cửa hàng nào -> Drawer trượt từ bên phải ra hiển thị danh sách Barista trong ca, doanh thu két tiền mặt, và nút gửi cảnh báo qua Bot Telegram.

### 4.2. Hệ Màu Nhận Diện & Tokens Chuẩn (Zero-Yellow Token System)
- **Màu sắc & Logo HR-BlockBot:** Triệt tiêu hoàn toàn màu vàng chói cũ (`#ffd100`, `#eab308`), thay bằng **Titanium Slate + Electric Sapphire** (`#2563eb` / `oklch(0.55 0.22 260)`):
  - Biểu tượng nhận diện: **Logo chính thức của nền tảng HR-BlockBot** (`hr-blockbot-logo.svg` / `guta-mark-pure.svg`).
  - Chữ `GUTA`: `font-black text-foreground tracking-wider` (Trắng sáng trong Dark Mode, Đen Slate trong Light Mode)
  - Chữ `WORKSPACE`: `font-semibold text-muted-foreground tracking-tight`
  - Accent chính: Electric Sapphire (`#2563eb` / `#3b82f6`) dùng cho nút bấm chính, viền focus, icon khối đa giác.
  - Trạng thái ca: Xanh ngọc lục bảo Emerald (`#10b981`) cho trạng thái mở ca / đúng giờ, Tuyệt đối không dùng màu vàng.
  - Nền: Dark Mode (`#090d16` / `#0f172a`), Light Mode (`#ffffff` / `#f8fafc`).
- **Thư viện Preview Tổng Hợp:** Xem trực tiếp tại `previews/index.html` (Tab *Mẫu D: Guta AI Landing* và *Mẫu E: Guta Workspace Dashboard*).

### 4.3. Quyết Định Logo Vector Chuẩn (Official HR-BlockBot Vector Logo Mark — Chốt 10/2026)
- **Asset vector chính thức:** [`docs/assets/guta-mark-pure.svg`](assets/guta-mark-pure.svg) (bản sao phục vụ web runtime đặt tại `apps/web/public/assets/logos/guta-mark-pure.svg`). Đây là **Biểu tượng Logo chính thức của nền tảng HR-BlockBot**.
- **Nguồn gốc & Tinh giản:**
  - Vector hóa từ master artwork (1024×1024).
  - Khử toàn bộ răng cưa bitmap bằng thuật toán đường cong B-spline / Cubic Bézier tuần hoàn khép kín (`trace_smooth.py`).
- **Thông số kỹ thuật:**
  - **Định dạng:** Single-path SVG (thuần một thẻ `<path>`), fill-rule `evenodd`.
  - **Màu sắc:** `fill="currentColor"` — **không** cố định màu nội bộ, **không** mang khung nền cố định. Biểu tượng tự động thừa hưởng màu chữ, màu thẻ hoặc màu accent của phần tử bao bọc cha.
  - **Khung tọa độ:** `viewBox="0 0 1024 1024"`. Co giãn mượt mà không vỡ từ kích thước siêu nhỏ (16px favicon, 24px navbar, 32px sidebar) tới kích thước lớn (64px, 128px+ auth banner).
- **Mẫu nhúng chuẩn (Code Snippet):**
  ```tsx
  // Nhúng trực tiếp SVG currentColor linh hoạt màu sắc và kích thước
  export function HRBlockBotLogoMark({ size = 24, className = "" }: { size?: number; className?: string }) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 1024 1024"
        width={size}
        height={size}
        fill="currentColor"
        className={className}
        aria-label="HR-BlockBot Logo"
      >
        <path
          fillRule="evenodd"
          d="M510.07 61.76c14.82-.26 31.26 12.85 44.93 21.98...Z"
        />
      </svg>
    );
  }
  ```

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
     - Hiệu ứng Splash Loader: Biểu tượng Logo HR-BlockBot (`guta-mark-pure.svg`) với animation nhịp thở (`guta-splash-pulse`) mờ dần trong <370ms trước khi đưa người dùng vào giao diện làm việc.
  2. **Landing Page Sticky Shrink Header:**
     - Navbar trang chủ cố định ở đầu trang (`fixed`). Khi người dùng cuộn trang `window.scrollY > 20px`, navbar tự động co gọn padding, bo tròn viền capsule (`rounded-full`), chuyển sang bề mặt kính mờ frosted glass (`backdrop-filter: blur(20px)`), viền mờ `rgba(255, 255, 255, 0.1)` chống nhảy layout (Zero-CLS).
  3. **Trợ Lý AI Trung Tâm (Chat Copilot First View):**
     - Đặt Trợ lý AI Copilot làm trung tâm hành động (Action Center). Người dùng khi vào Dashboard sẽ tương tác ngay với AI Copilot thông minh, dễ dàng chuyển đổi sang bảng quản trị chi nhánh CRM thông qua nút chuyển nhanh hoặc thanh điều hướng.
- **Hỗ trợ khả năng tiếp cận (Accessibility & Reduced Motion):**
  - Mọi hiệu ứng chuyển động đều được bọc và tôn trọng thuộc tính `@media (prefers-reduced-motion: reduce)`. Khi người dùng kích hoạt giảm chuyển động, toàn bộ scale, translate và pulse đều được vô hiệu hóa, chuyển sang hiển thị tức thời hoặc mờ đục thuần túy (`opacity`).

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

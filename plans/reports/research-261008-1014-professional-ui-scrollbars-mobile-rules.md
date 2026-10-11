# Nghiên Cứu & Bộ Quy Tắc Thiết Kế: Xử Lý Scrollbar, Tràn Màn Hình & Chuyển Đổi Mobile Chuẩn Native

- **Mã báo cáo:** `research-261008-1014-professional-ui-scrollbars-mobile-rules`
- **Ngày lập:** 08/10/2026 (Múi giờ Asia/Bangkok)
- **Áp dụng cho:** Toàn bộ hệ thống UI của HR BlockBot (`previews/`, Web Dashboard, Mobile Web)
- **Vấn đề giải quyết:** 
  1. Loại bỏ thanh cuộn mặc định màu xám trắng thô kệch của hệ điều hành trên nền tối (Native OS Scrollbar).
  2. Triệt tiêu lỗi tràn màn hình, cuộn ngang vô ý và bẫy cuộn lồng nhau (Double Scrollbars / Scroll Trap).
  3. Xóa bỏ hoàn toàn tình trạng "Giao diện mobile như laptop thu nhỏ" (Desktop Shrink Syndrome) — thay bằng kiến trúc thích ứng (Adaptive Mobile Pattern): Bảng chuyển thành Card, Sidebar chuyển thành Bottom Navigation Bar.

---

## Mục Lục

1. [Phân Tích Chi Tiết 3 Lỗi Thiết Kế Bị Người Dùng Phản Ánh](#1-phân-tích-chi-tiết-3-lỗi-thiết-kế-bị-người-dùng-phản-ánh)
2. [Giải Pháp Kỹ Thuật: Custom Scrollbar Chuẩn Hiện Đại (CSS 2026)](#2-giải-pháp-kỹ-thuật-custom-scrollbar-chuẩn-hiện-đại-css-2026)
3. [Giải Pháp Kỹ Thuật: Kiểm Soát Khung Nhìn & Chống Tràn (Zero Overflow)](#3-giải-pháp-kỹ-thuật-kiểm-soát-khung-nhìn--chống-tràn-zero-overflow)
4. [Kiến Trúc Chuyển Đổi Mobile Thật Sự (Adaptive vs Shrink)](#4-kiến-trúc-chuyển-đổi-mobile-thật-sự-adaptive-vs-shrink)
   - 4.1 Bảng dữ liệu (Table) $\to$ Thẻ danh sách độc lập (Stacked Cards)
   - 4.2 Sidebar máy tính $\to$ Thanh điều hướng đáy (Bottom App Bar)
   - 4.3 Khung Chatbot $\to$ Bottom Sheet / Full-screen View
5. [Quy Chuẩn Đo Lường Mobile-First & Touch Accessibility](#5-quy-chuẩn-đo-lường-mobile-first--touch-accessibility)
6. [Kế Hoạch Áp Dụng Ngay Vào Bộ Previews](#6-kế-hoạch-áp-dụng-ngay-vào-bộ-previews)

---

## 1. Phân Tích Chi Tiết 3 Lỗi Thiết Kế Bị Người Dùng Phản Ánh

### Lỗi 1: Thanh cuộn mặc định của hệ điều hành (Native Desktop Scrollbar)
- **Nguyên nhân:** Khi lập trình viên hoặc AI viết CSS cho giao diện nền tối (`#0b0f19`) nhưng không khai báo thuộc tính `color-scheme: dark` trên thẻ `html/:root`, và không tùy biến `scrollbar-width` / `scrollbar-color`.
- **Hậu quả:** Trình duyệt Windows/Chromium tự động vẽ thanh cuộn màu xám trắng dày 17px nguyên bản từ thập niên 90. Thanh xám này cắt ngang nền đen, phá hủy hoàn toàn mỹ cảm của chế độ nền tối (Dark mode).

### Lỗi 2: Tràn màn hình & Cuộn lồng nhau (Double Scrollbars / Scroll Trap)
- **Nguyên nhân:** 
  - `html`, `body` có thanh cuộn riêng, trong khi thẻ con (`iframe` hoặc `main`) lại có thêm một thanh cuộn riêng nữa.
  - Sử dụng chiều cao cố định `100vh` thay vì `100dvh` (Dynamic Viewport Height) khiến trên trình duyệt di động, thanh địa chỉ (URL bar) của Safari/Chrome đẩy chiều cao trang vượt quá màn hình, sinh ra thanh cuộn dọc thừa thãi.
  - Các phần tử Flex/Grid không có `min-width: 0` dẫn đến việc nội dung con bị ép đẩy tràn chiều ngang (horizontal overflow).

### Lỗi 3: Giao diện Mobile "như laptop thu nhỏ" (Desktop Squished into Mobile)
- **Hội chứng AI điển hình:** Khi thu nhỏ màn hình xuống 375px (iPhone), hệ thống chỉ co ép bảng 6 cột từ 1200px xuống 375px, hoặc ép sidebar bên trái còn một dải mỏng dính. Chữ bị gãy vụn, nút bấm bé bằng đầu kim (`< 20px`), người dùng buộc phải zoom hai ngón tay để đọc.
- **Thực tế:** Nhân viên cửa hàng F&B đứng quầy chỉ dùng 1 tay (ngón cái) trên điện thoại. Họ cần **thẻ ca làm việc to rõ**, **thao tác 1 chạm**, và **thanh điều hướng đáy (Bottom Nav)**.

---

## 2. Giải Pháp Kỹ Thuật: Custom Scrollbar Chuẩn Hiện Đại (CSS 2026)

Để scrollbar tinh tế, mỏng, tự động tàng hình hoặc hòa vào nền tối mà không bao giờ lộ vạch trắng của hệ điều hành:

### 2.1 Khai báo bắt buộc trên `:root`
```css
:root {
  /* BẮT BUỘC: Báo cho OS và Browser biết toàn bộ trang là Dark Mode */
  color-scheme: dark;
  
  /* Chuẩn W3C hiện đại (Chrome 121+, Firefox, Safari 17+) */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.15) transparent;
}
```

### 2.2 Quy tắc CSS toàn diện cho mọi phần tử cuộn
```css
/* Tùy biến thanh cuộn mỏng 6px, bo tròn và chỉ hiện rõ khi hover */
*::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

*::-webkit-scrollbar-track {
  background: transparent;
}

*::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 999px;
  transition: background 150ms ease;
}

*:hover::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.25);
}

/* Ẩn hoàn toàn scrollbar trên các thanh điều hướng ngang (Tab list) nhưng vẫn cuộn được */
.no-scrollbar {
  scrollbar-width: none;
  -ms-overflow-style: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
```

---

## 3. Giải Pháp Kỹ Thuật: Kiểm Soát Khung Nhìn & Chống Tràn (Zero Overflow)

Để đảm bảo không bao giờ có 2 thanh cuộn lồng nhau hoặc bị tràn chiều ngang:

```css
html, body {
  width: 100%;
  height: 100dvh; /* Dùng dvh thay cho vh để không bị thanh URL mobile đẩy lệch */
  margin: 0;
  padding: 0;
  overflow: hidden; /* CẤM TUYỆT ĐỐI body cuộn tự do */
}

/* Chỉ cho phép duy nhất một vùng nội dung được cuộn */
.scroll-container {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden; /* Triệt tiêu hoàn toàn cuộn ngang ngoài ý muốn */
  overscroll-behavior-y: contain; /* Ngăn chặn cuộn giật lùi màn hình ngoài (Scroll chaining) */
}
```

---

## 4. Kiến Trúc Chuyển Đổi Mobile Thật Sự (Adaptive vs Shrink)

Thay vì co cụm giao diện desktop, hệ thống áp dụng kỹ thuật **Chuyển Đổi Hình Thái (Morphing Transformation)** khi chiều rộng màn hình $< 768px$:

### 4.1 Bảng dữ liệu (Table) $\to$ Thẻ danh sách độc lập (Stacked Cards)
- **Desktop ($\ge 768px$):** Hiển thị dạng bảng (Table) với 6 cột để Cửa hàng trưởng đối soát nhanh.
- **Mobile ($< 768px$):** Ẩn hoàn toàn thẻ `<table>`. Tự động kích hoạt hiển thị khối `Mobile Card View`:
  - Mỗi ca làm là một **Thẻ độc lập (Card)**.
  - Hiển thị rõ: Họ tên nhân viên, Mã nhân viên (font monospace), Chức danh (Badge màu), Khung giờ ca (Ví dụ: `Ca A (06:00 - 14:00)`), và Nút bấm duyệt/đổi ca to rõ $\ge 44px$.

```html
<!-- Cấu trúc Dual-View chuẩn B2B SaaS -->
<div class="desktop-only-table">
  <table>... 6 cột dữ liệu ...</table>
</div>

<div class="mobile-only-cards">
  <!-- Thẻ ca làm việc tối ưu cho màn hình cảm ứng -->
  <div class="shift-mobile-card">
    <div class="card-header">
      <span class="emp-name">BÙI VIỆT HÙNG</span>
      <span class="shift-badge">Ca A (6h-14h)</span>
    </div>
    <div class="card-meta">GT-CH25036607 • BẾP - Bếp nấu</div>
    <div class="card-action">
      <button class="btn-touch">Chấm Công Ca Này</button>
    </div>
  </div>
</div>
```

### 4.2 Sidebar máy tính $\to$ Thanh điều hướng đáy (Bottom App Bar)
- Trên Mobile, nhân viên thao tác bằng ngón tay cái ở nửa dưới màn hình.
- **Xóa bỏ Sidebar chiếm chỗ trên mobile.**
- Thay bằng **Bottom Navigation Bar** cố định ở đáy màn hình gồm 4 nút chức năng:
  1. `Lịch ca` (Icon Calendar)
  2. `Duyệt công` (Icon Clipboard-Check)
  3. `Kiểm két` (Icon Wallet/Cash)
  4. `AI Bot` (Icon Sparkles/Chat)

```css
@media (max-width: 768px) {
  aside.sidebar { display: none; } /* Ẩn sidebar desktop */
  
  .bottom-nav {
    display: flex;
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    height: 60px;
    background: #111318;
    border-top: 1px solid #242833;
    padding-bottom: env(safe-area-inset-bottom); /* Hỗ trợ thanh gạt Home của iPhone */
    z-index: 100;
  }
}
```

### 4.3 Khung Chatbot $\to$ Bottom Sheet Trượt Cảm Ứng
- Trên Mobile, không để khung chat nổi chiếm 80% màn hình che mất dữ liệu.
- Khi người dùng bấm tab `AI Bot` ở thanh đáy, giao diện mở ra một **Bottom Sheet** toàn màn hình (hoặc 75% chiều cao màn hình) vuốt xuống để đóng lại, tạo trải nghiệm mượt mà hệt như ứng dụng Native iOS/Android.

---

## 5. Quy Chuẩn Đo Lường Mobile-First & Touch Accessibility

| Tiêu chuẩn | Chỉ số bắt buộc | Lý do thực tế |
|---|---|---|
| **Vùng chạm (Touch Target)** | Tối thiểu **$44 \times 44$ CSS px** | Ngón tay nhân viên quầy bar thường bị ướt hoặc thao tác vội, không thể chạm vào các nút nhỏ $24px$. |
| **Vùng an toàn màn hình (Safe Area)** | `padding-bottom: env(safe-area-inset-bottom)` | Đảm bảo nút bấm và thanh đáy không bị thanh Home bar của iPhone che khuất. |
| **Cuộn ngang (Horizontal Scroll)** | **$0$ px** trên toàn bộ trang | Cấm tuyệt đối trang web bị lắc lư ngang khi vuốt ngón tay lên xuống. |
| **Cỡ chữ tối thiểu cho Input** | Tối thiểu **$16$px** trên Mobile | Ngăn chặn trình duyệt iOS Safari tự động phóng to (auto-zoom) màn hình khi bấm vào ô gõ tin nhắn. |

---

## 6. Kế Hoạch Áp Dụng Ngay Vào Bộ Previews

1. **Cập nhật `previews/index.html`:**
   - Thêm bộ lọc kích thước trực tiếp (Viewport Switcher: `Desktop 100%`, `Tablet 768px`, `Mobile 390px iPhone`).
   - Xóa bỏ tình trạng iframe bị double scrollbar.
2. **Cập nhật `preview-01-hermes-cyber.html`, `preview-02-swiss-linear.html`, `preview-03-guta-amber.html`:**
   - Cài đặt `color-scheme: dark` và CSS scrollbar siêu mảnh `6px` tàng hình.
   - Thêm CSS Responsive chuyển đổi hoàn toàn `<table>` sang danh sách `Stacked Cards` khi màn hình $< 768px$.
   - Bổ sung Bottom Navigation Bar chuẩn điện thoại khi ở màn hình mobile.

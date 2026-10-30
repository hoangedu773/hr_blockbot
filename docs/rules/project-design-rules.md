# 🏛️ PROJECT DESIGN RULES — THE UNIFIED ENTERPRISE DESIGN SYSTEM

> **Tài liệu quy chuẩn bất biến cho UI/UX & AI Agents trong dự án KLCN133 — HR BlockBot.**  
> **Nguồn gốc:** Được hợp nhất sau phiên tranh luận đa chiều giữa **Senior Design Architect (`cx/gpt-6-luna`)** và **Product & Creative Director (`ag/gemini-3.8-flash-high`)**, loại bỏ triệt để các dấu hiệu nhận diện "AI Slop / Giao diện công nghiệp rập khuôn".

---

## 1. 🌟 Khung Thẩm Mỹ Hợp Nhất (The Unified Aesthetic Framework)

Hệ thống giao diện của HR BlockBot Command Center được kết tinh từ 3 trường phái thiết kế đẳng cấp thế giới:

1. **Khung vỏ & Tương tác từ Linear (Linear Minimalist):**
   - Viền phân cách siêu mảnh `1px solid rgba(255, 255, 255, 0.08)`.
   - Phím tắt điều hướng nhanh (`⌘K` / `Ctrl+K`).
   - Phản hồi tương tác vi mô đầm chắc, tức thời.
2. **Mật độ Thông tin từ Tremor (Tremor Analytics Data-Dense):**
   - Dành riêng cho màn hình Quản trị (Admin): Thẻ số liệu KPI tinh gọn, thanh tiến độ đề tài % rõ ràng, bảng nhân sự và đối soát ca trực có mật độ thông tin cao (`table row height: 36px - 40px`).
3. **Màu sắc & Lưới trật tự từ Swiss International / Vercel (Geist Style):**
   - Nền than chì sâu thẳm tự nhiên `#090A0F` đến `#121212` (loại bỏ màu nền đen tuyền `#000` hoặc xanh tím neon `#090D16`).
   - Tối giản tối đa: 90% diện tích là gam màu trung tính, chữ sắc nét có độ tương phản đạt chuẩn WCAG AAA; chỉ dành 10% cho màu chức năng và 1 điểm nhấn hành động **Electric Sapphire (`#2563EB` / `#3B82F6`)**, triệt tiêu hoàn toàn màu vàng chói (Zero-Yellow Invariant).

---

## 2. 🚫 10 Quy Tắc Bất Biến Chống "AI-Slop" (Anti-AI Design Invariants)

Bất kỳ AI Agent hoặc lập trình viên nào khi tạo mới hoặc sửa đổi giao diện (`apps/web/**`, HTML previews) **bắt buộc phải tuân thủ nghiêm ngặt 10 quy tắc sau**:

### Quy Tắc 1: CẤM TUYỆT ĐỐI EMOJI HỆ ĐIỀU HÀNH (Zero OS Emoji)
- **Cấm:** Không dùng các biểu tượng emoji (`📅`, `💰`, `👥`, `☕`, `⚡`, `✦`, `🤖`) làm icon trên nút bấm, tiêu đề hoặc card.
- **Bắt buộc:** 100% sử dụng icon vector SVG đơn sắc (Lucide Icons / Radix Icons), stroke-width chuẩn `1.5px` hoặc `1.75px`, kích thước cố định `16x16px` hoặc `18x18px`. Icon thừa hưởng màu chữ hoặc xám trung tính `#94A3B8`.

### Quy Tắc 2: NỀN THAN CHÌ SÂU (Obsidian Charcoal Foundation)
- Canvas nền tối sâu `#090A0F` đến `#121212`.
- Bề mặt card / bảng: `#141721` hoặc `#18181B`.
- Cấm tuyệt đối nền đen tuyền `#000000` (gây tương phản gắt làm mỏi mắt) và cấm nền tím cyber `#090D16`.

### Quy Tắc 3: NGUYÊN TẮC PHÂN BỔ MÀU 90/10 & SINGLE ACCENT
- 90% diện tích giao diện là thang xám than chì trung tính.
- Tối đa 10% diện tích dùng màu nhấn (nút CTA chính, cảnh báo, trạng thái).
   - Màu nhấn hành động độc bản duy nhất là **Electric Sapphire (`#2563EB` / `#3B82F6`)**. Triệt tiêu 100% màu vàng (`#FFD100`, `#EAB308`, `#F59E0B`, `#FDD663`) để bảo đảm độ tương phản và loại bỏ cảm giác chói mắt. Trạng thái vận hành dùng Emerald (`#10B981`) cho ca đúng giờ/online, Rose (`#F43F5E`) cho trễ ca/cảnh báo, và Slate (`#64748B`) cho chờ duyệt.

### Quy Tắc 4: CẤM NEON GLOW & GRADIENT RỰC RỠ
- Cấm triệt để hiệu ứng đổ bóng phát sáng neon (`box-shadow: 0 0 20px ...`).
- Cấm gradient nền sặc sỡ kiểu landing page crypto. Toàn bộ card dùng màu phẳng (flat surface) với viền mỏng 1px mờ.

### Quy Tắc 5: KỶ LUẬT BO GÓC (Border-Radius Discipline)
- Tối đa `4px - 6px` cho button, input, badge.
- Tối đa `8px` cho modal, card, panel.
- Cấm tuyệt đối bo góc bong bóng tròn `16px - 24px` trên các công cụ làm việc chuyên nghiệp.

### Quy Tắc 6: MẬT ĐỘ THÔNG TIN CAO (High-Density Workstation Grid)
- Chiều cao dòng bảng dữ liệu (table row height): từ `36px` đến `40px` trên desktop.
- Không để khoảng trắng dư thừa đẩy nội dung quan trọng ra khỏi màn hình đầu tiên (above-the-fold).

### Quy Tắc 7: BẮT BUỘC SỐ TABULAR (Tabular-Nums Invariant)
- Toàn bộ cột số tiền, giờ làm việc, ngày tháng, mã đề tài (`PRJ-01`), mã nhân viên (`GT-001`) bắt buộc khai báo `font-variant-numeric: tabular-nums` và `font-family: ui-monospace, ...` để đảm bảo các con số căn thẳng hàng dọc khi đối soát.

### Quy Tắc 8: CHỈ BÁO TRẠNG THÁI VI MÔ (Micro-Status Indicators)
- Trạng thái ca làm việc, duyệt hồ sơ F1 và đề tài F2 phải dùng **Status Dot** đường kính `5px - 6px` kết hợp micro-badge cao `20px`.
- Cấm các khối badge to tướng, bão hòa màu che khuất nội dung chính.

### Quy Tắc 9: CHATBOT LÀ OPERATIONAL COPILOT
- Chatbot không phải là popup hình tròn nổi lơ lửng che khuất màn hình góc dưới.
- Chatbot là **Command Bar (Thanh lệnh cố định)** hoặc Side Drawer trượt thanh lịch với phím tắt `⌘K`. Phản hồi của Bot là các **Structured Action Cards** có nút bấm tương tác trực tiếp.

### Quy Tắc 10: ĐỘNG HỌC TỨC THỜI & THỰC DỤNG (Zero Slop Motion)
- Thời gian chuyển động UI dưới `150ms`. Tương tác click phản hồi tức thì (`transform: scale(0.98)`).
- Tôn trọng `prefers-reduced-motion` của hệ điều hành. Cấm các hiệu ứng zoom, bay lượn màu mè làm chậm thao tác người dùng.

### Quy Tắc 11: CẤM DROPDOWN / SELECT NATIVE MẶC ĐỊNH CỦA HỆ ĐIỀU HÀNH (Custom Select & Scrollbar Invariant)
- **Cấm:** Không dùng thẻ `<select>` mặc định của trình duyệt để xổ ra popup màu xám/trắng của Windows/macOS. Cấm thanh cuộn (scrollbar) màu trắng xám bản to mặc định làm gãy giao diện tối.
- **Bắt buộc:** 
  - Toàn bộ dropdown/menu lựa chọn phải được custom đồng bộ theme (dùng Radix Select / Popover / Command Menu hoặc custom dropdown HTML/CSS có animation mượt).
  - Menu xổ xuống phải có nền tối đồng bộ (`--bg-surface` / `--bg-card`), viền mỏng `1px solid var(--border)`, bo góc đồng bộ, bóng đổ `0 10px 30px rgba(0,0,0,0.5)`.
  - Item trong menu phải có chiều cao tối thiểu `36px`, padding chuẩn, hover đổi màu nền êm ái.
  - Thanh cuộn (scrollbar) phải được custom thành dạng siêu mảnh (`width: 4px - 6px`), thumb trong suốt có bo góc mềm, đổi màu khi hover, tuyệt đối không dùng scrollbar trắng xám mặc định của trình duyệt.

---

## 3. 🎯 Bảng Mã Màu CSS Variables Chuẩn (Production Ready)

```css
:root {
  /* Surfaces */
  --bg-canvas: #090a0f;
  --bg-surface: #0f1117;
  --bg-card: #141721;
  --bg-card-hover: #1c202d;
  
  /* Borders */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-focus: rgba(217, 119, 6, 0.4);

  /* Typography */
  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  /* Semantics */
  --accent-amber: #d97706;   /* Guta Brand Accent */
  --status-cyan: #06b6d4;     /* In-progress */
  --status-emerald: #10b981;  /* Approved / Completed */
  --status-orange: #f97316;   /* Pending review */
  --status-rose: #f43f5e;     /* Rejected / Error */

  /* Radii */
  --radius-sm: 4px;
  --radius-md: 6px;
  --radius-lg: 8px;
}
```

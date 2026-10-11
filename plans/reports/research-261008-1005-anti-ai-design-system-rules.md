# Quy Tắc Thiết Kế Chống "AI Slop" — Định Chuẩn Giao Diện Thực Tế Cho HR BlockBot

- **Mã tài liệu:** `research-261008-1005-anti-ai-design-system-rules`
- **Ngày lập:** 08/10/2026 (Múi giờ Asia/Bangkok)
- **Áp dụng cho:** Toàn bộ giao diện Web Dashboard, Mobile Web & Khung Chat của HR BlockBot
- **Mục tiêu:** Loại bỏ triệt để các dấu hiệu nhận diện "giao diện do AI sinh tự động" (AI tropes / AI slop), xây dựng bộ quy tắc thiết kế mang đậm tính nghiệp vụ thực chiến (chuyên nghiệp như Linear, Toast POS, iPOS, Odoo).

---

## 1. Bản Chất Của Lỗi "Nhìn Quá Công Nghiệp / Quá AI"

Giao diện do AI tự động sinh thường mắc 5 lỗi rập khuôn khiến người dùng nhận ra ngay:
1. **Dùng Emoji hệ điều hành làm Icon:** Dùng các biểu tượng `📅`, `💰`, `👥`, `☕`, `✦` màu mè sặc sỡ, không đồng bộ nét vẽ, tạo cảm giác đồ án sơ sài của sinh viên hoặc template AI sinh vội.
2. **Hội chứng "Purple Neon Glow":** Lạm dụng dải màu tím `#6366f1`, xanh neon phát sáng (`box-shadow: 0 0 20px ...`), gradient nền lòe loẹt kiểu landing page crypto/AI wrapper.
3. **Layout rập khuôn 3 thẻ card + 1 bảng lớn:** Cố định mẫu 3-4 cards to tướng bên trên và 1 table ở dưới mà không xuất phát từ thao tác thật của người vận hành.
4. **Khoảng cách và bo góc quá đà:** Bo góc `16px - 24px` kiểu bong bóng di động lên một bảng tính quản trị cần độ tập trung thông tin cao (high information density).
5. **Thiếu cảm giác công cụ làm việc thật (Work-tool feel):** Quá chú trọng trang trí, thiếu các chi tiết của phần mềm chuyên dụng như: phím tắt, phân tách cột tabular-nums, trạng thái tương tác click/hover đầm chắc, thanh công cụ lọc nhanh.

---

## 2. Bộ 7 Quy Tắc Thiết Kế "Anti-AI" (Human-Crafted Rules)

### Quy Tắc 1: CẤM TUYỆT ĐỐI EMOJI — 100% Dùng SVG Icons Tinh Gọn (Monochrome Vector)
- **Cấm:** `📅`, `📝`, `💰`, `👥`, `☕`, `⚡`, `✦ Sparkle`.
- **Bắt buộc:** Dùng icon SVG nét mảnh (stroke width: `1.5px` hoặc `1.75px`), đồng bộ kích thước `16x16px` hoặc `18x18px`.
- **Màu sắc icon:** Icon thừa hưởng màu chữ hoặc màu xám trung tính (`#71717a` / `#94a3b8`), chỉ đổi màu khi ở trạng thái Active hoặc hover.

### Quy Tắc 2: Bảng Màu Thực Nghiệp (Authentic Industrial Palette)
Không dùng màu tím Cyber hay gradient phát sáng. Thay bằng bảng màu đầm, chuẩn phần mềm quản lý kho bãi & vận hành chuỗi:
- **Nền chính (Background):** Than chì tối sâu tự nhiên `#121316` hoặc `#0f1115` (không dùng nền đen tuyền `#000` hay xanh tím `#090d16`).
- **Bề mặt bảng/thẻ (Surface Card):** Xám than `#18191d` hoặc `#1a1c23`, viền phân tách mỏng sắc sảo `1px solid rgba(255, 255, 255, 0.08)`.
- **Màu điểm nhấn (Accent):**
  - *Phương án F&B Thực tế:* Màu Cam Gạch / Hổ phách cháy (`#d97706` / `#b45309`) — màu chuẩn ngành cà phê/ẩm thực, ấm áp nhưng nghiêm túc.
  - *Phương án Quản trị SaaS:* Màu Xanh Navy Kỹ thuật (`#2563eb` / `#1d4ed8`) — màu chuẩn công vụ/doanh nghiệp.
- **Quy tắc 90-10:** 90% giao diện là thang xám than chì trung tính; chỉ 10% diện tích dùng màu nhấn (nút bấm chính, cảnh báo lệch két, badge trạng thái).

### Quy Tắc 3: Mật Độ Thông Tin Cao (High-Density Workstation)
- Cửa hàng trưởng và kế toán cần xem nhiều dòng dữ liệu cùng lúc, không cần card to chiếm chỗ.
- Chiều cao dòng bảng (Row height): `36px - 40px` (thay vì 56px quá to).
- Bo góc (Border-radius): Tối đa `6px` cho button/input, `8px` cho panel/table. Không dùng bo góc tròn 16px.
- Cột số tiền và giờ: Bắt buộc dùng thuộc tính `font-variant-numeric: tabular-nums; font-family: ui-monospace, ...` để số thẳng hàng dọc khi đối soát.

### Quy Tắc 4: Xử Lý Trạng Thái Bằng Tín Hiệu Nhỏ (Micro-Indicators)
- Tránh các khối badge to đùng che mất chữ.
- Dùng **Status Dot** đường kính `6px` kết hợp chữ nhỏ tinh tế:
  - Đi làm / Khớp két: Chấm xanh lá `#22c55e` kèm chữ `Đã vào ca`.
  - Chờ duyệt / Lệch nhẹ: Chấm vàng hổ phách `#f59e0b` kèm chữ `Chờ SM ký`.
  - Thiếu công / Lỗi: Chấm đỏ đất `#ef4444` kèm chữ `Thiếu ca`.

### Quy Tắc 5: Khung Chatbot Biến Thành "Công Cụ Vận Hành" (Operational Copilot)
- Không làm khung chat nổi kiểu popup hỗ trợ khách hàng rẻ tiền ở góc màn hình với icon robot tròn xoe.
- **Thiết kế chuẩn:**
  - Chatbot là **Command Bar (Thanh lệnh)** nằm cố định hoặc Panel chia đôi màn hình (Split Panel).
  - Tích hợp phím tắt nhanh (`⌘K` hoặc `Ctrl+K`) để mở tìm kiếm và ra lệnh.
  - Phản hồi của Chatbot là các **Thẻ dữ liệu cấu trúc (Structured Cards)** có nút bấm duyệt ngay, không chỉ là các đoạn văn bản dài dòng.

### Quy Tắc 6: Động Học Tức Thời (Subtle & Instant Feedback)
- Không dùng animation bay lượn màu mè, hiệu ứng zoom giật cục.
- Phản hồi tức thì khi click: `transform: scale(0.98)` trong `100ms`.
- Transition hover: `120ms - 150ms`, chỉ đổi màu nền nhẹ nhàng (`rgba(255,255,255,0.04)`).

### Quy Tắc 7: Dữ Liệu Thực Tế Nghiêm Túc 100%
- Không dùng tên giả định kiểu "Nguyễn Văn A", "Ca 1", "Dự án X".
- Toàn bộ dữ liệu hiển thị đúng chuẩn vận hành chuỗi:
  - Mã nhân viên: `GT-CH18030009` (Thực tế từ MongoDB).
  - Cửa hàng: `GUTA CAFE - Quận 1 - 120 Hai Bà Trưng`.
  - Ca làm: `Ca A1.749 (06:00 - 14:00)`.
  - Giải trình: *"IT chưa thêm mã ca"*, *"Nhân viên mới chưa nhận vân tay"*.
  - Tiền két: Bảng kê chi tiết mệnh giá 500k, 200k, 100k, 50k đối soát tiền lẻ.

---

## 3. Bản Mẫu Trước & Sau Khi Loại Bỏ "AI Slop"

| Yếu tố | Kiểu Cũ (Bị chê quá AI / Quá công nghiệp) | Kiểu Mới (Chuẩn Thiết Kế Phần Mềm Thực Chiến) |
|---|---|---|
| **Biểu tượng** | 📅 Lịch ca, 💰 Quỹ tiền, 👥 Nhân viên, ✦ Bot | SVG Vector nét 1.5px đơn sắc (Calendar, Banknote, Users, Command) |
| **Nền & Viền** | Nền tím `#090d16`, viền xanh tím, bóng phát sáng glow | Nền than chì `#121316`, viền xám mờ `rgba(255,255,255,0.08)`, không glow |
| **Màu nhấn** | Tím Neon `#6366f1` phối Xanh Ngọc chói lọi | Cam đất ấm Guta `#d97706` hoặc Xanh Navy công nghiệp `#2563eb` |
| **Bố cục** | Card bong bóng tròn bo 16px, nhiều khoảng trắng thừa | High-density grid, bo góc 6px, thanh mảnh, tối ưu diện tích hiển thị |
| **Chatbot** | Khung chat tròn nổi lơ lửng che mất nội dung bảng | Command Palette / Side Drawer trượt thanh lịch, có phím tắt `⌘K` |

## Tranh luận thiết kế — Senior Design Architect

**Bối cảnh:** Dashboard nền tối, khung chat cùng hệ thống; `shadcn/ui` và `Recharts` đã được chốt trong ADR-015. Thiết kế cần phục vụ dữ liệu nhân sự, đề tài, KPI và phê duyệt; không chỉ tạo vẻ “SaaS hiện đại”. Hai phương án dưới đây là hướng đề xuất, không phải bằng chứng đã đạt WCAG AA hay Core Web Vitals.

### Phương án 1 — Linear Dark Minimalist

**Định vị:** Công cụ làm việc chuyên nghiệp, yên tĩnh, ưu tiên thao tác rõ ràng hơn trang trí. Dùng nền than trung tính, đường phân cách mảnh, icon SVG đơn sắc nét 1.5–1.75 px; không emoji, glow hay gradient.

**Palette đề xuất:** nền `#121316`; bề mặt `#18191D`; bề mặt phụ `#1F2127`; chữ chính `#E7E8EA`; chữ phụ `#A1A4AA`; viền `#34363D`; accent xanh `#2563EB`; lỗi `#EF4444`. Đây là giá trị thiết kế ban đầu; cần đo tương phản từng cặp trước khi tuyên bố đạt AA. Đặc biệt, màu viền và trạng thái không được là tín hiệu duy nhất.

**Typography:** font chính dùng system stack theo spec; font mono dùng `ui-monospace` cho mã, thời gian, điểm số. Áp dụng `tabular-nums` cho dữ liệu so sánh. Không thêm webfont khi chưa có lý do và ngân sách tải được đo.

**Hình khối:** radius 4 px cho nút/input, 6 px cho panel; viền 1 px. Bảng có hàng 36–40 px trên desktop, nhưng không thu nhỏ vùng bấm dưới mức dễ thao tác hoặc yêu cầu touch target 44 × 44 px trên mobile. Phân cấp bằng typography, khoảng cách và viền; không dựng mọi dữ liệu thành card.

**Bố cục:** sidebar cố định; top bar gồm breadcrumb, tìm kiếm có chức năng thật, trạng thái kết nối và tài khoản. Khu nội dung dùng lưới 12 cột: KPI strip gọn, tiếp đến bảng hoặc biểu đồ tùy tác vụ. Trang nhân sự ưu tiên bảng lọc/sắp xếp; trang duyệt ưu tiên hàng đợi và lý do; khung chat là route riêng, có rich card bên cạnh khi đủ chỗ. Không đưa command palette vào baseline: spec ghi S11 chưa được duyệt.

**Motion:** thao tác thường dùng đổi màu trong 120–150 ms; nhấn nút có phản hồi tức thời, tránh transform nếu làm giảm khả năng đọc trạng thái. Panel mở rộng có thể thử spring `stiffness: 320`, `damping: 30`, tối đa 220 ms; nếu không có thư viện motion thì dùng CSS transition 160 ms thay vì thêm dependency. Giữ chiều cao ổn định, tắt chuyển động không thiết yếu khi `prefers-reduced-motion`.

**Phản biện:** hướng này dễ thành lạnh lẽo hoặc quá tối giản, khiến trạng thái và hành động quan trọng thiếu trọng lượng. Cần dùng chữ trạng thái, nhãn và CTA có chủ đích; không biến “ít màu” thành “khó phân biệt”.

### Phương án 2 — Tremor Analytics Data-Dense

**Định vị:** Tập trung người quản trị cần đối chiếu nhiều chỉ số, lọc danh sách và nhận biết điểm bất thường. “Tremor” ở đây là tham chiếu về mật độ thông tin, không đề xuất thêm thư viện; ADR-015 chỉ định `Recharts`, không ECharts hay engine chart thứ hai.

**Palette đề xuất:** nền `#0F1115`; bề mặt `#18191D`; bề mặt phụ `#202229`; chữ chính `#E6E8EB`; chữ phụ `#A1A4AA`; viền `#34363D`; accent xanh `#2563EB`; trạng thái thành công `#22C55E`, chờ `#F59E0B`, lỗi `#EF4444`. Các màu chart phải gán qua `chart-1..5` semantic tokens, không hard-code trong component; kiểm tra tương phản và khả năng phân biệt trước khi dùng.

**Typography:** giữ system stack; dùng `ui-monospace` và `tabular-nums` cho điểm, phần trăm, mã và số liệu căn cột. Tránh đổi toàn bộ giao diện sang mono: số cần thẳng hàng, nội dung vẫn cần dễ đọc.

**Hình khối:** radius 4 px cho control, 6–8 px cho panel; viền 1 px. KPI cards nhỏ, ngang hàng, chỉ hiển thị chỉ số có nguồn và kỳ đo rõ ràng. Sparkline chỉ nên xuất hiện khi có chuỗi dữ liệu thật và bổ sung giá trị dạng số/bảng; không dùng biểu đồ trang trí.

**Bố cục:** dashboard mở đầu bằng KPI strip, dưới là tối đa hai biểu đồ có mục đích, tiếp theo là bảng chi tiết với lọc nhanh và số cột phù hợp. Màn hình quản lý cần ưu tiên hàng đợi duyệt, kỳ KPI, phân trang và trạng thái; không mặc định mọi route đều có ba card và một chart. Bản mobile chuyển bảng thành danh sách thẻ và chart thành giá trị theo kỳ như spec yêu cầu, không chỉ ẩn cột.

**Motion:** cập nhật trạng thái dùng 120 ms, chuyển panel tối đa 180 ms. Có thể thử spring `stiffness: 360`, `damping: 34`, tối đa 200 ms cho mở/đóng chi tiết; giữ nguyên bố cục cuối cùng, không animate từng dòng bảng hay mỗi điểm chart. Tôn trọng reduced motion.

**Phản biện:** mật độ cao dễ làm nghẹt màn hình, đặc biệt với người dùng Employee hoặc mobile. KPI cards và sparklines không tự tạo giá trị nghiệp vụ; dữ liệu thiếu phải hiển thị `—`, không giả lập số để lấp chỗ.

### Vì sao giao diện cũ bị chê “công nghiệp / AI slop”?

Báo cáo anti-AI nêu đúng các dấu hiệu dễ tạo cảm giác template: emoji nhiều màu thay icon nhất quán; tím và vàng neon, glow làm điểm nhấn lấn át nội dung; card lớn, radius 16–24 px và bố cục lặp lại làm giảm mật độ dữ liệu; thiếu bảng, lọc nhanh, số căn cột và trạng thái thao tác có ý nghĩa. Đây là nhận định từ báo cáo, không phải kết quả kiểm thử người dùng được xác nhận ở đây.

### Kết luận — dung hòa có chủ đích

Chọn **Linear làm khung nền**, thêm **mật độ kiểu Tremor ở các màn hình quản trị dữ liệu**: bảng gọn, KPI có căn cứ, tối đa vài biểu đồ, trạng thái micro-indicator kèm chữ. Giữ token `shadcn/ui`, `Recharts`, system fonts và tiêu chí responsive/accessibility của spec; không nhập thêm thư viện hoặc biến mọi trang thành analytics dashboard. Đo tương phản trước nghiệm thu, kiểm tra touch targets trên mobile; chỉ giữ motion nếu không gây layout shift.

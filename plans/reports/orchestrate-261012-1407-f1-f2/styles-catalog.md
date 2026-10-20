Không thể lưu file: session chỉ cung cấp công cụ đọc/tìm kiếm, không có công cụ ghi. Dưới đây là catalog hoàn chỉnh, có thể lưu thành `docs/design/20-visual-styles.md`. Tên benchmark là nguồn cảm hứng, không khẳng định sao chép thiết kế. Palette chưa được đo tương phản WCAG.

# Catalog 20 Visual Styles — Dashboard & Command Center

## Quy ước

- Token màu theo thứ tự: `bg-canvas`, `bg-surface`, `bg-card`, `border`, `text-primary`, `text-muted`, `accent`, `status-success`, `status-warning`, `status-danger`.
- Typography ghi: heading / data-mono; line-height; tracking.
- Thư viện là đề xuất phối hợp, không phải yêu cầu cài thêm dependency. Ưu tiên Shadcn UI, Radix, Tailwind và Recharts sẵn có.
- Motion phải tôn trọng `prefers-reduced-motion`; không dùng màu đơn lẻ để biểu đạt trạng thái.

## Nhóm 1 — High-Tech & Developer Tools

### 01. Linear Minimal
- **Tham chiếu:** Linear — giao diện issue-tracking, điều hướng nhanh, bề mặt tối giản.
- **Tinh thần / cảm xúc:** Tập trung, nhanh, tinh gọn; giảm nhiễu khi xử lý hàng đợi.
- **Tokens:** `#0B0C0E`, `#111214`, `#17181B`, `#2A2B30`, `#F0F0F2`, `#92949B`, `#8B7CFF`, `#4CC38A`, `#E5B454`, `#E56B75`.
- **Typography:** Inter / Geist Mono; `1.45`; `-0.02em` heading, `0` data.
- **Radius / shapes:** 4px controls, 6px cards, 8px dialogs; divider 1px.
- **Motion:** 120ms, `cubic-bezier(.2,.8,.2,1)`; hover đổi surface, không dịch chuyển layout.
- **Components:** Shadcn + Radix; command menu theo `⌘K` chỉ khi được duyệt; Recharts.
- **Bất biến:** Mọi tương tác chính có keyboard path; không dùng glow hoặc gradient để tạo phân cấp.

### 02. Raycast Command
- **Tham chiếu:** Raycast — command launcher, shortcut-first, menu có cấu trúc.
- **Tinh thần / cảm xúc:** Chủ động, phản hồi nhanh, thiên về thao tác bằng bàn phím.
- **Tokens:** `#101114`, `#17181C`, `#1E2025`, `#34363D`, `#F5F5F6`, `#A1A2A8`, `#FF6363`, `#55C99A`, `#F1C75B`, `#FF6363`.
- **Typography:** Geist Sans / Geist Mono; `1.4`; `-0.015em`, `0`.
- **Radius / shapes:** 6px input, 8px menu, 10px modal; menu item cao tối thiểu 36px.
- **Motion:** 140ms, `ease-out`; menu fade/translate tối đa 2px.
- **Components:** Radix Command/Dialog/Popover, Shadcn, Lucide.
- **Bất biến:** Shortcut luôn có nhãn hiển thị; không biến command palette thành nơi duy nhất truy cập chức năng.

### 03. Vercel Geist
- **Tham chiếu:** Vercel Geist — tương phản rõ, lưới chính xác, typography trung tính.
- **Tinh thần / cảm xúc:** Kỹ thuật, mạch lạc, tin cậy.
- **Tokens:** `#09090B`, `#111113`, `#18181B`, `#2E2E32`, `#FAFAFA`, `#A1A1AA`, `#EDEDED`, `#4CC38A`, `#F5A623`, `#E5484D`.
- **Typography:** Geist Sans / Geist Mono; `1.45`; `-0.02em`, `0`.
- **Radius / shapes:** 4px controls, 6px cards, 8px dialogs; đường kẻ thẳng, ít lớp nổi.
- **Motion:** 120ms, `cubic-bezier(.16,1,.3,1)`; thay đổi opacity hoặc border.
- **Components:** Shadcn, Radix, Tailwind, Recharts.
- **Bất biến:** Màu trung tính chiếm ưu thế; không thêm accent phụ để trang trí.

### 04. Supabase Studio
- **Tham chiếu:** Supabase Studio — công cụ quản trị dữ liệu, xanh thương hiệu trên nền tối.
- **Tinh thần / cảm xúc:** Thực dụng, thân thiện với kỹ sư, phân biệt rõ dữ liệu và thao tác.
- **Tokens:** `#0C0F0D`, `#111713`, `#18211B`, `#2B3930`, `#E8F0EA`, `#93A49A`, `#3ECF8E`, `#3ECF8E`, `#E5B454`, `#F16D6D`.
- **Typography:** Inter / Geist Mono; `1.5`; `-0.01em`, `0`.
- **Radius / shapes:** 4px input, 6px card, 8px dialog; bảng dạng lưới.
- **Motion:** 140ms, `ease-out`; hover highlight hàng, không animate từng ô.
- **Components:** Shadcn, Radix, TanStack Table nếu đã có; Recharts.
- **Bất biến:** Xanh chỉ dành cho accent và trạng thái; dữ liệu bảng không được dùng màu thương hiệu làm nền mặc định.

### 05. GitHub Dark
- **Tham chiếu:** GitHub Dark — bảng điều khiển, trạng thái và hoạt động theo dòng thời gian.
- **Tinh thần / cảm xúc:** Quen thuộc, minh bạch, hướng cộng tác.
- **Tokens:** `#0D1117`, `#010409`, `#161B22`, `#30363D`, `#E6EDF3`, `#8B949E`, `#2F81F7`, `#3FB950`, `#D29922`, `#F85149`.
- **Typography:** system sans / ui-monospace; `1.5`; `-0.01em`, `0`.
- **Radius / shapes:** 4px controls, 6px cards, 8px dialog; viền phân tách rõ.
- **Motion:** 120ms, `ease`; trạng thái cập nhật tức thời, không có hiệu ứng trang trí.
- **Components:** Shadcn, Radix, Lucide; Recharts với palette giới hạn.
- **Bất biến:** Trạng thái phải có chữ hoặc biểu tượng đi kèm màu; không mã hóa ý nghĩa bằng màu đỏ/xanh đơn thuần.

## Nhóm 2 — Data-Dense & Enterprise FinOps

### 06. Tremor Analytics
- **Tham chiếu:** Tremor — KPI, biểu đồ và bảng phân tích doanh nghiệp.
- **Tinh thần / cảm xúc:** Dễ quét số liệu, cân bằng mật độ và khoảng thở.
- **Tokens:** `#0B0F14`, `#111820`, `#17212B`, `#2B3742`, `#E6EDF3`, `#9AA8B5`, `#4C8DFF`, `#3ECF8E`, `#F5B451`, `#F2555A`.
- **Typography:** Inter / IBM Plex Mono; `1.45`; `-0.015em`, `0`.
- **Radius / shapes:** 6px controls, 8px cards, 10px panels; KPI card gọn.
- **Motion:** 160ms, `ease-out`; chart cập nhật không làm đổi kích thước khung.
- **Components:** Recharts, Shadcn, Radix; Tremor chỉ dùng nếu đã được chấp thuận trong stack.
- **Bất biến:** Mỗi chart có đơn vị, thời gian và trạng thái dữ liệu; không dựng chart chỉ để lấp khoảng trống.

### 07. Stripe Dashboard
- **Tham chiếu:** Stripe Dashboard — quản trị tài chính với bảng sạch và hierarchy rõ.
- **Tinh thần / cảm xúc:** Chính xác, bình tĩnh, đáng tin.
- **Tokens:** `#0A1020`, `#101A2C`, `#17243A`, `#2A3A55`, `#F6F8FC`, `#A5B3C8`, `#7C5CFC`, `#35B779`, `#E3A72F`, `#E25950`.
- **Typography:** Inter / ui-monospace; `1.5`; `-0.015em`, `0`.
- **Radius / shapes:** 6px controls, 8px cards, 10px dialogs; bảng dùng căn lề ổn định.
- **Motion:** 150ms, `cubic-bezier(.2,.8,.2,1)`; chỉ phản hồi thao tác và chuyển trạng thái.
- **Components:** Shadcn, Radix, Recharts; bảng có lọc và phân trang.
- **Bất biến:** Số liệu tiền tệ dùng tabular numerals, đơn vị rõ; không dùng màu accent cho mọi con số.

### 08. Bloomberg Terminal
- **Tham chiếu:** Bloomberg Terminal — màn hình dữ liệu dày, ưu tiên tốc độ tra cứu.
- **Tinh thần / cảm xúc:** Mật độ cao, vận hành liên tục, dành cho người dùng chuyên môn.
- **Tokens:** `#080A0C`, `#101316`, `#171B1F`, `#343A40`, `#E8ECEF`, `#9BA4AA`, `#F0A51B`, `#49C16D`, `#F0A51B`, `#F05A47`.
- **Typography:** Arial / IBM Plex Mono; `1.35`; `0`, `0`.
- **Radius / shapes:** 0px panels, 2px controls, 4px dialogs; đường lưới có chủ đích.
- **Motion:** 100ms, `linear`; không chuyển động dữ liệu giả lập.
- **Components:** TanStack Table nếu có; Radix primitives; Recharts tối giản.
- **Bất biến:** Mật độ cao không được hy sinh khả năng đọc; giới hạn số cột hiển thị, hỗ trợ responsive và zoom.

### 09. Retool / Palantir Operations
- **Tham chiếu:** Retool và Palantir — bảng điều khiển nghiệp vụ, công cụ vận hành có phân quyền.
- **Tinh thần / cảm xúc:** Kiểm soát, có truy vết, thao tác có hậu quả rõ ràng.
- **Tokens:** `#0B0E11`, `#12171C`, `#192127`, `#303B43`, `#E7ECEF`, `#98A6AE`, `#58A6C8`, `#4FB286`, `#D9A441`, `#D86666`.
- **Typography:** Inter / IBM Plex Mono; `1.45`; `-0.01em`, `0`.
- **Radius / shapes:** 4px controls, 6px cards, 8px dialogs; panel phân cấp bằng viền.
- **Motion:** 120ms, `ease-out`; hành động ghi dữ liệu yêu cầu xác nhận.
- **Components:** Radix, Shadcn, form validation hiện có; Recharts.
- **Bất biến:** Mọi thao tác ghi nêu rõ đối tượng, phạm vi và kết quả trước xác nhận; không dùng màu sắc để che trạng thái pending.

### 10. AWS CloudWatch Minimal
- **Tham chiếu:** AWS CloudWatch — giám sát tài nguyên, cảnh báo và chuỗi thời gian.
- **Tinh thần / cảm xúc:** Trực quan, ổn định, hướng phát hiện vấn đề.
- **Tokens:** `#0F141A`, `#151C23`, `#1C252E`, `#34414D`, `#F1F5F9`, `#A1ADB8`, `#5AA7FF`, `#42B883`, `#E4AE4C`, `#F06464`.
- **Typography:** system sans / ui-monospace; `1.45`; `-0.01em`, `0`.
- **Radius / shapes:** 4px controls, 6px cards, 8px dialogs; chart grid nhẹ.
- **Motion:** 150ms, `ease-out`; cập nhật trạng thái có nhãn “đang tải” hoặc thời điểm cập nhật.
- **Components:** Recharts, Shadcn, Radix; chart tooltip có thể thao tác bằng bàn phím.
- **Bất biến:** Cảnh báo luôn nêu mức độ và hành động tiếp theo; không dùng nhấp nháy để báo động.

## Nhóm 3 — Premium Luxury & Modern Dark

### 11. Apple Pro Dark
- **Tham chiếu:** Apple Pro — bề mặt tối, chữ rõ, tập trung vào nội dung.
- **Tinh thần / cảm xúc:** Tĩnh, tinh tế, ít ma sát.
- **Tokens:** `#101012`, `#18181A`, `#202023`, `#38383D`, `#F5F5F7`, `#A1A1A6`, `#0A84FF`, `#30D158`, `#FFD60A`, `#FF453A`.
- **Typography:** system sans / SF Mono fallback; `1.5`; `-0.02em`, `0`.
- **Radius / shapes:** 8px controls, 12px cards, 14px modal; bo góc vừa phải.
- **Motion:** 180ms, `cubic-bezier(.2,.8,.2,1)`; giảm hoặc tắt theo cài đặt hệ thống.
- **Components:** Shadcn, Radix; Recharts với tooltip và legend rõ.
- **Bất biến:** Không giả lập giao diện hệ điều hành; mọi animation giữ nguyên hình học layout.

### 12. Braun / Teenage Engineering
- **Tham chiếu:** Braun và Teenage Engineering — điều khiển vật lý tối giản, nhãn rõ, tín hiệu trực quan.
- **Tinh thần / cảm xúc:** Công cụ, chính xác, có tính vật chất nhưng không hoài cổ giả.
- **Tokens:** `#121311`, `#1A1B18`, `#22231F`, `#42443D`, `#F0F0E8`, `#A5A69A`, `#E4A62B`, `#76B779`, `#E4A62B`, `#D95D4F`.
- **Typography:** Inter / IBM Plex Mono; `1.4`; `-0.015em`, `0`.
- **Radius / shapes:** 2px controls, 4px cards, 6px dialogs; hình học vuông vức.
- **Motion:** 100ms, `linear`; nút phản hồi bằng trạng thái bấm, không nảy.
- **Components:** Radix primitives, Shadcn ít tuỳ biến, Lucide.
- **Bất biến:** Mỗi control có nhãn hoặc affordance rõ; không thêm texture, núm vặn hay giả vật liệu nếu không có chức năng.

### 13. Porsche Design Precision
- **Tham chiếu:** Porsche Design — tương phản cao, đường nét chính xác, điểm nhấn tiết chế.
- **Tinh thần / cảm xúc:** Hiệu suất, độ chính xác, cao cấp.
- **Tokens:** `#0D0F10`, `#151819`, `#1D2224`, `#353C3E`, `#F4F5F5`, `#9CA5A7`, `#D6A85F`, `#59B58A`, `#D6A85F`, `#DF625D`.
- **Typography:** Inter / Geist Mono; `1.4`; `-0.025em`, `0`.
- **Radius / shapes:** 2px controls, 4px cards, 6px dialogs; bố cục thẳng hàng.
- **Motion:** 130ms, `cubic-bezier(.2,.7,.2,1)`; chuyển trạng thái ngắn, không phóng đại.
- **Components:** Shadcn, Radix, Recharts; bảng số liệu tabular.
- **Bất biến:** Không dùng hình ảnh xe, huy hiệu hoặc chi tiết thương hiệu như trang trí; chỉ giữ ngôn ngữ hình học và độ chính xác.

### 14. Cyberpunk Clean / Arc
- **Tham chiếu:** Arc — sắc thái hiện đại, accent mạnh có kiểm soát; cyberpunk chỉ là nguồn màu, không phải hiệu ứng.
- **Tinh thần / cảm xúc:** Năng lượng, đương đại, dễ phân luồng.
- **Tokens:** `#0E1014`, `#151820`, `#1D212B`, `#343A49`, `#F2F4F8`, `#A3AABC`, `#A78BFA`, `#4CC9A0`, `#F4BC58`, `#F16F78`.
- **Typography:** Inter / Geist Mono; `1.45`; `-0.02em`, `0`.
- **Radius / shapes:** 8px controls, 10px cards, 12px dialogs; hình khối đơn giản.
- **Motion:** 160ms, `ease-out`; hover đổi border hoặc surface, không glow.
- **Components:** Shadcn, Radix; Lucide; Recharts.
- **Bất biến:** Không neon glow, nền gradient, scanlines hoặc màu tím làm nền toàn trang.

### 15. Obsidian Note Craft
- **Tham chiếu:** Obsidian — ghi chú liên kết, typography đọc lâu, cấu trúc nội dung rõ.
- **Tinh thần / cảm xúc:** Tập trung, có chiều sâu, ưu tiên đọc và tra cứu.
- **Tokens:** `#171717`, `#1E1E1E`, `#262626`, `#3B3B3B`, `#E8E6E3`, `#A7A29C`, `#A88BFA`, `#69B578`, `#D6A851`, `#D96A6A`.
- **Typography:** system sans / ui-monospace; `1.6`; `-0.01em`, `0`.
- **Radius / shapes:** 4px controls, 6px cards, 8px dialogs; panel ít nổi.
- **Motion:** 140ms, `ease-out`; nội dung mở rộng không gây layout shift đáng kể.
- **Components:** Shadcn, Radix, Markdown renderer an toàn; Recharts chỉ khi cần.
- **Bất biến:** Đồ thị liên kết không thay thế breadcrumb, tiêu đề hoặc thông tin nguồn; không đưa hiệu ứng mạng lưới vào dashboard vận hành.

## Nhóm 4 — Editorial, Warm & Industry Specific

### 16. Guta Amber Heritage
- **Tham chiếu:** Guta Cafe — bản sắc ấm, amber thương hiệu và bối cảnh vận hành F&B.
- **Tinh thần / cảm xúc:** Gần gũi, đáng tin, phù hợp chuỗi cửa hàng và quản trị nhân sự.
- **Tokens:** `#11100E`, `#191714`, `#211E19`, `#3D372D`, `#F4EFE7`, `#A9A093`, `#D97706`, `#4CAF78`, `#E3AC45`, `#D85C52`.
- **Typography:** Inter / IBM Plex Mono; `1.5`; `-0.015em`, `0`.
- **Radius / shapes:** 4px controls, 6px cards, 8px dialogs; accent dùng tiết chế.
- **Motion:** 140ms, `ease-out`; phản hồi tức thì, không hoạt ảnh trang trí.
- **Components:** Shadcn, Radix, Recharts; icon SVG Lucide.
- **Bất biến:** Amber là accent thương hiệu duy nhất; trạng thái success/warning/danger vẫn có mã màu riêng, không chuyển thành nhiều accent thương hiệu.

### 17. Monocle Editorial
- **Tham chiếu:** Monocle — bố cục biên tập, typography có hierarchy, khoảng trắng có chủ đích.
- **Tinh thần / cảm xúc:** Điềm tĩnh, giàu ngữ cảnh, thiên về báo cáo điều hành.
- **Tokens:** `#F4F1EA`, `#E9E5DC`, `#FFFFFF`, `#D4D0C7`, `#20201E`, `#77746D`, `#B45532`, `#3E805A`, `#B07828`, `#B9433E`.
- **Typography:** Georgia / ui-monospace; `1.6`; `-0.02em`, `0`.
- **Radius / shapes:** 0px controls, 2px cards, 4px dialogs; viền và đường chia cột.
- **Motion:** 120ms, `ease`; không hiệu ứng chuyển cảnh giữa các khối nội dung.
- **Components:** Shadcn, Radix, Recharts; bảng có tương phản và header rõ.
- **Bất biến:** Editorial không được làm giảm mật độ vận hành; KPI, cảnh báo và tác vụ phải nằm trên vùng đọc đầu tiên.

### 18. Swiss International Grid
- **Tham chiếu:** Swiss International Style — lưới, căn chỉnh, sans-serif trung tính.
- **Tinh thần / cảm xúc:** Rõ ràng, có trật tự, dễ so sánh.
- **Tokens:** `#F5F5F2`, `#ECECE8`, `#FFFFFF`, `#D1D1CC`, `#161616`, `#6D6D68`, `#D33A32`, `#31835A`, `#B98222`, `#C83F3A`.
- **Typography:** Helvetica Neue / IBM Plex Mono; `1.45`; `-0.02em`, `0`.
- **Radius / shapes:** 0px panels, 2px controls, 4px dialogs; lưới 12 cột.
- **Motion:** 100ms, `linear`; chỉ thay đổi trạng thái tương tác.
- **Components:** Shadcn, Radix, CSS Grid, Recharts.
- **Bất biến:** Mọi alignment theo lưới; không tạo card lồng card hoặc trang trí phá vỡ nhịp cột.

### 19. Nordic Minimalist Slate
- **Tham chiếu:** Nordic minimalism — nền sáng dịu, màu slate và nhấn tự nhiên.
- **Tinh thần / cảm xúc:** Bình tĩnh, dễ đọc lâu, không lạnh lẽo.
- **Tokens:** `#F2F4F3`, `#E8ECEA`, `#FFFFFF`, `#D2D9D5`, `#202725`, `#737E79`, `#537F75`, `#3F8A62`, `#BD8A3A`, `#C75550`.
- **Typography:** Inter / ui-monospace; `1.55`; `-0.015em`, `0`.
- **Radius / shapes:** 6px controls, 8px cards, 10px dialogs; bóng đổ rất nhẹ hoặc không dùng.
- **Motion:** 160ms, `ease-out`; fade nhẹ, không translate xa.
- **Components:** Shadcn, Radix, Recharts.
- **Bất biến:** Không dùng beige làm nền tất cả mọi cấp; giữ phân biệt surface, border và focus rõ ràng.

### 20. Industrial POS / Toast
- **Tham chiếu:** Toast POS — nghiệp vụ nhà hàng, thao tác nhanh, trạng thái ca và giao dịch.
- **Tinh thần / cảm xúc:** Thực dụng, dễ thao tác, phù hợp môi trường bận rộn.
- **Tokens:** `#111412`, `#191D1A`, `#222823`, `#39433C`, `#F0F3F0`, `#A2ADA4`, `#F28C28`, `#54B77A`, `#E7B04A`, `#E45F55`.
- **Typography:** Inter / IBM Plex Mono; `1.4`; `-0.01em`, `0`.
- **Radius / shapes:** 4px controls, 6px cards, 8px dialogs; touch target tối thiểu 44×44px.
- **Motion:** 120ms, `ease-out`; pointer-down phản hồi ngay; không animate danh sách dài.
- **Components:** Radix, Shadcn, Lucide; Recharts; controls phù hợp cảm ứng.
- **Bất biến:** Nút thao tác thường dùng có nhãn dễ hiểu và vùng chạm lớn; hành động nguy hiểm không nằm cạnh CTA chính.

## Cấu trúc dữ liệu cho controller

Mỗi bản ghi nên dùng các trường sau để sinh preview. `tokens` giữ đủ 10 màu theo định nghĩa đầu tài liệu.

```json
{
  "id": "01-linear-minimal",
  "group": "high-tech-developer-tools",
  "name": "Linear Minimal",
  "reference": "Linear",
  "mood": ["focused", "fast", "minimal"],
  "tokens": {
    "bgCanvas": "#0B0C0E",
    "bgSurface": "#111214",
    "bgCard": "#17181B",
    "border": "#2A2B30",
    "textPrimary": "#F0F0F2",
    "textMuted": "#92949B",
    "accent": "#8B7CFF",
    "statusSuccess": "#4CC38A",
    "statusWarning": "#E5B454",
    "statusDanger": "#E56B75"
  },
  "typography": {
    "heading": "Inter",
    "dataMono": "Geist Mono",
    "lineHeight": 1.45,
    "headingTracking": "-0.02em",
    "dataTracking": "0"
  },
  "shape": {
    "controlRadiusPx": 4,
    "cardRadiusPx": 6,
    "dialogRadiusPx": 8
  },
  "motion": {
    "durationMs": 120,
    "easing": "cubic-bezier(.2,.8,.2,1)",
    "hoverTransform": "none",
    "reducedMotion": "disable-transform-and-transition"
  },
  "components": ["shadcn", "radix", "recharts"],
  "antiSlopInvariant": "Mọi tương tác chính có keyboard path; không dùng glow hoặc gradient để tạo phân cấp."
}
```

**Acceptance khi dựng preview:** cùng một nội dung và trạng thái nghiệp vụ giữa 20 biến thể; mỗi style chỉ đổi tokens, typography, shapes và motion; hiển thị contrast/focus rõ; dùng dữ liệu minh họa có nhãn; kiểm thử palette WCAG trước khi tuyên bố đạt AA.

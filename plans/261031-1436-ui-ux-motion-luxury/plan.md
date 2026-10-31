---
title: UI/UX + motion nâng cấp — logo, nav, diagram, CRM token, chat
status: completed
created: 2026-10-31
completed: 2026-10-31
branch: integration/full-delivery
scope: apps/web
---

# Plan — Sửa 6 lỗi UI/UX + nâng cấp motion

## Bối cảnh đo được

| # | Vấn đề | Bằng chứng trong source |
|---|---|---|
| 1 | Logo tàng hình ở dark mode, splash/loading dùng filter invert | `guta-mark-pure.svg` chỉ có `fill="currentColor"` → trong `<img>` resolve thành đen. `product.css` bù bằng `filter: brightness(0) invert(1)` ở 2 nơi; chat hero, ChatDrawer, landing nav không có filter → mất logo. |
| 2 | Nav header co lại làm vỡ bố cục, đè lên nút theme | `.folio-nav` có 2 khối khai báo trùng; khối sau đặt `flex-wrap: wrap` + `padding-block: 12px`, phá pill. Link nav dùng `position: absolute` nên khi bar co còn 920px chúng chạy dưới cụm action. |
| 3 | Diagram 24/7: màu cũ (emerald `#021a16`), 12 nút toolbar nội bộ, chữ mờ | `public/diagrams/chatbot-architecture.html`. |
| 4 | Sau đăng nhập vào chat, phải vào CRM trước | `App.tsx` khởi tạo `useState<'crm' \| 'chat'>('chat')`; login/logout reset về `'chat'`. |
| 5 | Token CRM/dashboard "chán", thiếu hiệu ứng | `[data-register="product"]` phẳng `#0a0a0a`/`#171717`; gần như không có motion cho shell. |
| 6 | Nhãn "Trợ lý HR BlockBot" thay vì "Chat"; logo trắng ở trang chat | `ChatPageView` header + `aria-label`, sidebar `HR-BlockBot Workspace`. |

## Nguyên tắc

- Giữ hành vi, dữ liệu, a11y name có test phụ thuộc; chỉ đổi nhãn hiển thị khi test cho phép.
- Không thêm dependency. Motion dùng token sẵn có trong `tokens.css`.
- Mọi thay đổi màu phải đo contrast, không suy từ hex.

## Kết quả

### Phase 1 — Logo hệ thống ✅
- Sinh `guta-mark-white.svg`, `guta-mark-ink.svg` từ glyph gốc.
- `BrandMark` chọn variant theo `<html class>`; landing nav dùng `mask-image` + `currentColor` nên theo theme toggle mà không cần JS.
- Xoá cả hai filter invert. Splash pin `tone="dark"` vì nền luôn tối.
- Favicon có 2 biến thể theo `prefers-color-scheme`.

### Phase 2 — Nav header không co layout ✅
- Gộp khối `.folio-nav` trùng, bỏ `flex-wrap` ở desktop (chỉ wrap khi mở menu mobile).
- Link nav chuyển từ `position:absolute` sang flex `margin-inline:auto`, gap `clamp(18px, 2vw, 28px)`.
- Pill co 1152 → 1040px thay vì 920px để còn chỗ cho 4 link + cụm action.
- Đo được: 1440/1280/1024 không chồng lấn, không overflow ngang.

### Phase 3 — Diagram 24/7 ✅
- Token mới: nền obsidian ấm, ink platinum, accent sapphire; mỗi họ node một hue desaturate. Không dùng vàng (giữ Zero-Yellow invariant).
- Bỏ toàn bộ toolbar nội bộ 12 nút + emoji; sơ đồ tự chạy, chỉ nhận lệnh `postMessage`.
- Sinh bằng `scripts/build-diagram.py`: audit tự động cấm node chồng nhau, cấm cạnh cắt qua node, đặt nhãn theo va chạm.
- Dưới 900px chuyển sang danh sách dọc đọc được thay vì thu nhỏ chữ.

### Phase 4 — Route mặc định CRM ✅
- `activeTab` mặc định `'crm'`; login/logout reset về `'crm'`.

### Phase 5 — Token CRM/dashboard + motion ✅
- Tier 2 product mới: graphite ấm, 3 bậc chữ đo contrast (17.95 / 8.89 / 5.71).
- KPI stagger entrance, nav indicator scaleY, row hover tint — tất cả transform/opacity, có reduced-motion.
- Sửa 2 lỗi bố cục phát hiện khi đo: filter bar 3 select chiếm 3 hàng (`w-auto` bị unlayered CSS đè), và sidebar CRM biến mất hoàn toàn ở ≤768px.

### Phase 6 — Chat ✅
- Nhãn "Chat" ở header và CRM nav; sidebar đọc "Guta Workspace".
- Logo dùng asset trắng.

### Phase 7 — Kiểm chứng ✅
- `pnpm --filter web typecheck` pass.
- `pnpm --filter web build` pass.
- e2e 17/17, auth 10/10, select 11/11, source-shape 13/13, chat-drawer 1/1, web-e2e 6/6, landing-workflow 4/4.
- `scripts/verify-ui.mjs` 13/13 check hình học/màu/asset.

## Ghi chú phát hiện thêm

Test e2e có sẵn 3 selector đã lỗi thời từ commit `199002b` (component đổi sang "Hội thoại mới" / "Câu hỏi nhanh", test vẫn tìm "+ New Chat" / "Chủ đề mẫu"). Đã sửa cùng lượt vì chúng chặn việc xác nhận hành vi mới.

## Bổ sung — Sơ đồ cơ cấu tổ chức (section `#org`)

Ảnh tham chiếu là bitmap chất lượng thấp của một sơ đồ tổ chức thật. Dựng lại thành SVG để sắc nét ở mọi kích thước và theo được token theme.

**Hai chỗ cố ý khác ảnh gốc:**
- Chỉ hiện chức danh, không hiện tên cá nhân. Bitmap có tên nhân sự thật; trang marketing công khai không phải chỗ để đưa tên lên.
- Năm bậc quyền hạn mã hoá bằng một hue với năm độ đậm, không dùng năm màu rời, để thang bậc đọc ra thứ tự chứ không phải trang trí.

**Sinh tự động:** `scripts/build-org-chart.py` → `src/components/landing/org-chart-svg.ts`. Script tự assert không card nào chồng nhau, không dòng chữ nào tràn card, card nằm trong frame, legend không tràn canvas. Ba lần chạy đầu đều fail ở các assert này và phải sửa bố cục — đó là mục đích của chúng.

**Motion:** một lần hiện khi cuộn tới, so le theo cấp bậc (`--t`), không lặp. Sơ đồ không lặp vì đường báo cáo sẽ khó lần theo nếu cứ động. Reduced-motion: hiện đủ ngay.

**Responsive:** ≥1280px figure nới ra 1600px để chữ đạt ~10.8px; 768–1024px hiển thị trọn sơ đồ; <768px vùng cuộn ngang có `tabindex` + `aria-label` để bàn phím dùng được như chuột.

---
phase: 01
plan: landing-hero-header-luxury-chat
title: Hero — tấm ảnh phong cảnh sau mockup, grade tối
owner: fullstack-developer
status: done
priority: P1
effort: 6h
depends_on: [00]
blocks: [02, 03]
---

# Phase 01 — Ảnh phong cảnh sau mockup

## Mục tiêu

Đưa `dashboard-bg.jpg` trở lại **phía sau** mockup CRM trong hero, grade xuống mức đọc được trên
canvas tối, và làm cho mockup vẫn là vật thể sáng nhất khối hero.

## Sự thật nguồn (không phải giả định)

Bản tham chiếu `apps/web/previews/folio-layout.html` có đúng cấu trúc này — trích nguyên văn:

```html
<div class="relative pt-12 lg:pt-20">
  <div class="relative mx-auto max-w-7xl px-1 md:px-0 lg:px-6">
    <div class="-inset-20 sm:-inset-28 lg:-inset-40 pointer-events-none absolute opacity-60"
         style="mask-image:linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%),
                           linear-gradient(to bottom, transparent 0%, black 30%, black 100%);
                -webkit-mask-image: … ; mask-composite:intersect;">
      <img alt="" aria-hidden="true" fetchpriority="high" width="2000" height="1333"
           class="size-full object-cover" src="/assets/folio/images/dashboard-bg.jpg">
    </div>
    <div class="relative z-10" style="mask-image:linear-gradient(to bottom, black 0%, black 92%, transparent 100%)">
      <div class="guta-demo-scroll" …>
```

Ba đặc điểm phải bảo toàn: **inset âm** (ảnh tràn ra ngoài khung mockup), **opacity 0.6**,
**mask hai lớp giao nhau** (dọc: trong suốt 0–25%, đặc 25–75%, trong suốt 75–100%; ngang: trong suốt
0%, đặc từ 30% xuống). Ảnh không có khung, không có viền — nó là ánh sáng trong phòng.

Production hiện tại (`FolioLandingView.tsx:78-80`) chỉ còn:

```html
<div class="hero-stage">
  <div class="hero-stage-frame" data-open>
    <div class="hero-stage-crop">
```

`.hero-stage-glow` khai báo trong CSS (`folio-layout.css:592`) nhưng `display: none` và **không có
trong markup**. Ảnh đã bị bỏ hẳn.

## Đo ảnh gốc

| Vùng | Mean L (0–255) | Max L | Mean S |
|---|---|---|---|
| Toàn ảnh | 112.5 | 253 | 118.5 |
| Trời (35% trên) | 169.9 | 253 | 46.8 |
| Trung tâm | 94.3 | 252 | 153.2 |
| Tiền cảnh (40% dưới) | 59.1 | 248 | 186.7 |

Ảnh sáng gấp ~18 lần canvas `#0f0e0d` (L 0.0044). Đặt nguyên bản thì nó thành vật thể sáng nhất
trang và giết mockup.

## Grade đã thử

Ba bản đã render trong `assets/` của plan:

| Bản | Brightness | Saturation | Warm (R,G,B) | Mean L | Mean S |
|---|---|---|---|---|---|
| `photo-grade-A_b40_s55.jpg` | 0.40 | 0.55 | 1.0 / 0.985 / 0.95 | 43.2 | 77.2 |
| `photo-grade-B_b34_s48.jpg` | 0.34 | 0.48 | 1.0 / 0.98 / 0.94 | 36.2 | 69.3 |
| `photo-grade-C_b28_s42.jpg` | 0.28 | 0.42 | 1.0 / 0.98 / 0.94 | 29.7 | 65.1 |

**Chọn B** làm điểm khởi đầu. Ở B, hoàng hôn còn đọc ra màu hổ phách nhưng không còn là "cam chói";
bầu trời xuống mức xám ấm. Vẫn còn ảnh, không thành texture xám.

## Hai cách hiện thực — chọn một

| Cách | Ưu | Nhược |
|---|---|---|
| **A. Bake grade vào JPEG mới** (`dashboard-bg-hero.jpg`, ~120KB) | Không tốn GPU mỗi frame; ảnh nhỏ hơn 4×; scrim CSS chỉ còn 1 lớp mỏng | Mất file gốc khỏi pipeline nếu sau này cần crop khác; phải giữ bản gốc trong repo |
| **B. Giữ JPEG gốc + CSS filter** (`filter: brightness(.34) saturate(.48)`) | Không thêm asset; chỉnh được bằng CSS | Filter trên ảnh 2000px là việc paint mỗi lần composite; 482KB tải về |

**Khuyến nghị A.** Lý do: ảnh nằm ngay trên màn hình đầu, filter trên ảnh lớn dễ rơi frame trên máy
yếu, và 482KB cho một tấm ảnh trang trí là quá đắt. Giữ `dashboard-bg.jpg` nguyên trong
`public/assets/folio/images/` làm nguồn, thêm file đã grade.

## Markup mới

Thay `FolioLandingView.tsx:78-81` (giữ nguyên `.hero-stage-frame[data-open]` để motion hiện tại
vẫn chạy):

```html
<div class="hero-stage">
  <div class="hero-plate" aria-hidden="true">
    <img src="/assets/folio/images/dashboard-bg-hero.jpg" alt="" width="2000" height="1333"
         decoding="async" fetchpriority="high" class="hero-plate-img" />
  </div>
  <div class="hero-stage-frame" data-open>
    <div class="hero-stage-crop">
      …
```

Bọc trong `.hero-stage` (đã `position: relative`) để `inset` âm bám đúng khối.

## CSS

Xoá `.hero-stage-glow` (`folio-layout.css:592-600`, hiện `display: none` và không dùng) và thay bằng:

```css
.hero-plate {
  position: absolute;
  inset: -72px -40px -24px;
  pointer-events: none;
  opacity: 0.62;
  mask-image:
    linear-gradient(to right, transparent 0%, #000 26%, #000 74%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 32%, #000 100%);
  -webkit-mask-image:
    linear-gradient(to right, transparent 0%, #000 26%, #000 74%, transparent 100%),
    linear-gradient(to bottom, transparent 0%, #000 32%, #000 100%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}

.hero-plate-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: 50% 42%;
  display: block;
}

/* Lớp scrim thứ hai: chỉ phủ nửa dưới nơi mockup đè lên, để mép dưới ảnh
   không cắt thành đường. Đây là scrim trung tính duy nhất được phép. */
.hero-stage::after {
  content: "";
  position: absolute;
  inset: auto 0 0;
  height: 46%;
  pointer-events: none;
  background: linear-gradient(to bottom, transparent, var(--folio-canvas) 82%);
  z-index: 0;
}

.hero-stage-frame { position: relative; z-index: 1; }
```

Ở 768px: `inset: -56px -24px -16px`, `opacity: 0.55`.
Ở 390px: `inset: -40px -16px -12px`, `opacity: 0.5`.

Reduced motion: ảnh hiện ngay, không có `data-open` clip-path riêng cho ảnh — ảnh thuộc về khung,
không phải signature moment.

## Một điểm phải quyết trong lúc làm

`.hero-stage-frame` có `mask-image: linear-gradient(to bottom, #000 0%, #000 82%, transparent 100%)`
(`folio-layout.css:601-602`). Khi có ảnh phía sau, mask này làm mockup mờ dần vào ảnh — tốt. Nhưng nếu
ảnh grade quá sáng ở 82–100%, đường mờ sẽ lộ. Kiểm bằng screenshot: nếu lộ, hạ `--folio-canvas` pha
trong `.hero-stage::after` lên 90%.

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/components/FolioLandingView.tsx` (chỉ 3 dòng markup hero) |
| Sửa | `apps/web/src/styles/folio-layout.css` (§4 hero-stage) |
| Tạo | `apps/web/public/assets/folio/images/dashboard-bg-hero.jpg` |
| Giữ | `apps/web/public/assets/folio/images/dashboard-bg.jpg` (nguồn, không xoá) |

**Không chạm:** phần còn lại của `FOLIO_HTML`, `product.css`, test.

## Kiểm chứng

```bash
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/inspect.mjs" http://localhost:5173 --out .taste-skill/inspect/hero --widths 1440,768,390
pnpm --filter web test
```

Đạt khi, trên ảnh chụp thật ở cả 3 width:

1. Ảnh đọc ra là **phong cảnh**, không phải mảng nâu.
2. Không có vùng nào trong hero sáng hơn mockup CRM (so mắt trên ảnh, ghi kết luận vào report).
3. Mép ảnh không cắt thành đường thẳng ở 4 cạnh (mask + scrim đúng).
4. `h1` vẫn nằm trên fold ở 1440 và 390.
5. `test/e2e-revamp-flow.test.mjs` Bước 1 vẫn pass (zero-yellow, headline).
6. Không có `overflow-x` ở 390.

**Chưa được test tự động bảo vệ:** "không cam chói". Test zero-yellow chỉ quét
`color`/`backgroundColor`/`borderColor` computed, không đọc pixel ảnh. Đây là kiểm tra bằng mắt, ghi
rõ trong report là **chưa verify tự động**.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Ảnh cam đọc thành "vàng Guta" — trái Zero-Yellow về mặt cảm nhận | Grade B là điểm khởi đầu; nếu screenshot còn chói, hạ saturation thêm 0.06 mỗi vòng, tối đa 2 vòng, ghi lại bản chọn |
| `mask-composite` khác nhau giữa Chrome/Safari | Đã khai cả `mask-composite: intersect` và `-webkit-mask-composite: source-in`; kiểm ảnh chụp trên Chromium (browser duy nhất có trong môi trường), ghi rõ Safari chưa kiểm |
| Ảnh làm LCP tụt | Ảnh nằm dưới `h1`, không phải LCP; `fetchpriority="high"` chỉ vì nó ở nửa dưới màn hình đầu |
| Ảnh 2000px trên mobile tải nặng | Chấp nhận ở phase này; nếu cần, thêm `srcset` 1200w ở phase 06 — ghi vào backlog, không tự mở rộng |

---
phase: 00
plan: landing-hero-header-luxury-chat
title: Nền tảng — ink ấm, thang surface, motion token, preview duyệt
owner: fullstack-developer
status: todo
priority: P1
effort: 3h
depends_on: []
blocks: [01, 02, 03]
---

# Phase 00 — Nền tảng token + preview duyệt

## Mục tiêu

Chốt bộ token brand register (ấm, ba bậc surface, một accent đạt AA) và dựng preview tĩnh
`previews/261030-hero-header-luxury.html` để duyệt **trước** khi chạm production. Không phase nào
sau được bắt đầu khi preview chưa được duyệt.

## Vấn đề đo được

`apps/web/src/styles/folio-layout.css:16-66` khai báo brand register chỉ với hai cực:

| Token | Hiện tại | Đo |
|---|---|---|
| `--folio-canvas` | `#121212` | L\* 0.0056 |
| `--folio-surface` | `#181818` | L\* 0.0086 |
| `--folio-surface-raised` | `#242424` | L\* 0.0171 |
| `--folio-ink` | `#fafafa` | 17.3:1 trên canvas |
| `--folio-muted` | `#9b9b9b` | 6.74:1 trên canvas |
| `--folio-accent` | `#266df0` | **4.03:1** trên canvas — dưới AA cho chữ 12px |

Ba bậc surface đã tồn tại nhưng **không được dùng** cho card (`.bento-card`, `.guta-card` đều
`background: var(--folio-card-bg)` = cùng màu canvas ở dark). Vì vậy mọi card chỉ đọc được nhờ viền
1px — đúng cái "một màu" người dùng mô tả.

## Token mới (đã tính contrast, không suy đoán)

Ghi vào `folio-layout.css` §1, block `:root` (light) và `html.dark` (dark).

### Dark

```css
html.dark {
  --folio-canvas: #0f0e0d;          /* brown-black, không phải neutral */
  --folio-surface: #171512;
  --folio-surface-raised: #221f1b;
  --folio-surface-overlay: #2c2823;
  --folio-ink: #f1efec;             /* trắng ngà, saturation 0.15 (dưới ngưỡng "cream") */
  --folio-body-ink: #ddd7cc;        /* bậc chữ thứ hai cho đoạn văn dài */
  --folio-muted: #b5ada3;           /* caption/meta, 8.70:1 */
  --folio-border: #2b2722;
  --folio-accent: #3b82f6;          /* 5.24:1 trên canvas — đạt AA */
  --folio-accent-solid: #266df0;    /* fill có chữ trắng */
}
```

Đo bằng script trên giá trị computed trong preview (không suy từ mã màu). Bảng dưới là kết quả
thật ở cả hai theme, in ra từ chính preview:

| Cặp | Dark | Light | Ngưỡng |
|---|---|---|---|
| `ink` trên `canvas` | 16.80:1 | 15.97:1 | 4.5 |
| `ink` trên `surface` | 15.88:1 | 17.39:1 | 4.5 |
| `body-ink` trên `surface` | 12.73:1 | 12.05:1 | 4.5 |
| `body-ink` trên `raised` | 11.46:1 | 10.18:1 | 4.5 |
| `muted` trên `canvas` | 8.70:1 | 7.06:1 | 4.5 |
| `muted` trên `raised` | 7.40:1 | 6.50:1 | 4.5 |
| `accent` trên `canvas` | 5.24:1 | 6.10:1 | 3 |
| `#ffffff` trên `accent-solid` | 4.64:1 | 6.70:1 | 4.5 |

**Đã sửa trong lần chạy đầu:** `.crm-avatar-sm` (`folio-layout.css:1128`) đặt chữ trắng **11px** trên nền
`var(--folio-accent)`. Với `#266df0` cũ là 4.64:1 (vừa đủ AA cho chữ nhỏ); với `#3b82f6` chỉ còn
3.68:1 — **trượt AA**. (`.crm-brand-icon` ở `:659` dùng `--crm-accent`, không bị ảnh hưởng.)

Giữ `#266df0` **riêng cho fill nền có chữ trắng**, đổi `--folio-accent` sang `#3b82f6` chỉ cho
outline/rule/scan. Hai biến, không một:

```css
--folio-accent: #3b82f6;        /* rule, outline, focus, scan — trên nền tối */
--folio-accent-solid: #266df0;  /* fill có chữ trắng bên trong */
```

### Light

Bản đầu dùng `#f7f4ef` (giấy ấm). Inspector phân loại nó là `palette-cream` — hue 40°, saturation
0.31, lightness 0.94 rơi đúng vào dải cream của bộ phân loại. Đổi sang stone trung tính, hue 30°,
saturation thấp:

```css
:root {
  --folio-canvas: #f6f4f1;
  --folio-surface: #fffefc;
  --folio-surface-raised: #ecebe6;
  --folio-surface-overlay: #e3e1da;
  --folio-ink: #1b1917;
  --folio-body-ink: #3a352e;
  --folio-muted: #575249;
  --folio-border: #dedbd4;
  --folio-accent: #1d4ed8;
  --folio-accent-solid: #1d4ed8;
}
```

## Token chuyển động

Thêm vào `tokens.css` (Tier 1, dùng chung hai register):

```css
--t-pill: 280ms;      /* header collapse — chậm hơn --t-ui vì là chuyển hình dạng */
--t-plate: 900ms;     /* ảnh hero vào, chỉ một lần */
```

`--t-pill` nằm ngoài ngân sách 300ms của motion-craft? Không: 280ms < 300ms, và đây là chuyển
hình dạng một lần theo scroll, không phải feedback lặp. Ghi lý do vào comment cạnh token.

## Preview

Tạo `previews/261030-hero-header-luxury.html`:

- Self-contained, không import từ `apps/web` (để mở bằng `file://` và bằng `inspect.mjs`).
- Ba khối: **A** hero + ảnh grade (dùng `photo-grade-B_b34_s48.jpg` trong `assets/` của plan này),
  **B** header ở hai trạng thái (đầu trang / đã cuộn, cưỡng bức bằng `data-scrolled="true"`),
  **C** một section bento + một section card để thấy ba bậc surface.
- Có nút chuyển dark/light, có `prefers-reduced-motion` xử lý đúng.
- Chèn ảnh bằng `<img>` thật, không `background-image`, để đo được LCP và `object-fit`.
- Ghi chú dưới mỗi khối: token nào đang được chứng minh.

Đăng ký trong `previews/index.html`: thêm entry vào object `themes` (dòng 262-269) và một
`<button class="tab-btn" id="btn-luxury">` trong `.theme-group` (dòng 203-224). Giữ nguyên 5 mục cũ.

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/styles/folio-layout.css` (§1 token) |
| Sửa | `apps/web/src/styles/tokens.css` (2 motion token) |
| Tạo | `previews/261030-hero-header-luxury.html` |
| Sửa | `previews/index.html` (1 tab + 1 entry) |
| Tạo | `plans/261030-1229-landing-hero-header-luxury-chat/assets/photo-grade-*.jpg` (đã có 3 bản) |

**Không chạm:** mọi component `.tsx`, `product.css`, test.

## Bước thực hiện

1. Sửa block `:root` và `html.dark` trong `folio-layout.css:16-90` theo bảng trên.
2. Thêm `--t-pill`, `--t-plate` vào `tokens.css`.
3. Thêm `--folio-surface-overlay` và `--folio-accent-solid`; rà 8 chỗ dùng `var(--folio-accent)`
   (dòng 458, 507, 875, 924, 1128, 1360, 1806) — chỗ nào là **fill có chữ trắng** thì đổi sang
   `--folio-accent-solid`, còn lại giữ `--folio-accent`.
4. Dựng preview, chạy `node <skill>/scripts/lint.mjs previews/261030-hero-header-luxury.html`.
5. Mở preview bằng `inspect.mjs` ở 1440/768/390, đọc `report.json` + ảnh fold.
6. Chờ duyệt. Ghi quyết định duyệt (ngày, ai, thay đổi gì so với bản đề xuất) vào mục
   `## Duyệt preview` cuối file này.

## Kiểm chứng

```bash
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/lint.mjs" previews/261030-hero-header-luxury.html
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/inspect.mjs" previews/261030-hero-header-luxury.html --out .taste-skill/inspect/luxury-preview
pnpm --filter web typecheck
```

Đạt khi: preview mở được bằng `file://`; inspector không FAIL ở 3 width; mọi cặp chữ/nền trong
bảng trên đo lại bằng script khớp ±0.05; ba bậc surface phân biệt được **trên ảnh chụp**, không chỉ
trong CSS.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Ấm quá tay thành nâu "cà phê" sến | Canvas chỉ lệch hue ~18°, không dùng nâu bão hoà; so screenshot với `#121212` cũ cạnh nhau |
| `--folio-accent` đổi sang `#3b82f6` làm avatar mất tương phản | Đã tách `--folio-accent-solid`; kiểm bằng script, không bằng mắt |
| Preview lệch production vì copy tay | Preview chỉ chứng minh token + hình dạng, không chứng minh markup; ghi rõ trong file |

## Duyệt preview

_(chờ điền)_

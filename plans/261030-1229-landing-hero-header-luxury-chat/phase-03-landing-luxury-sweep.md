---
phase: 03
plan: landing-hero-header-luxury-chat
title: Luxury sweep — nhịp section, surface bậc, card
owner: fullstack-developer
status: completed
priority: P1
effort: 6h
depends_on: [01, 02]
blocks: [06]
---

# Phase 03 — Quét luxury toàn landing

## Mục tiêu

Bỏ cảm giác "một màu": mọi card đọc được bằng **bậc sáng**, không bằng viền; nhịp section thở hơn;
không thêm màu, không thêm gradient.

## Chẩn đoán

| Triệu chứng | Nguyên nhân trong code |
|---|---|
| Card "một màu" với nền | `.bento-card` (`:1255`), `.guta-card` (`:1301`) dùng `--folio-card-bg` = `#181818` trên canvas `#121212` — chỉ **1 bậc** (L\* 0.0086 vs 0.0056) **cộng thêm** viền 1px. Đúng chỗ `colour.md` §4 nói "one step is enough" bị vi phạm theo hướng ngược: hai tín hiệu yếu cộng lại vẫn không đọc ra khối, chỉ đọc ra đường kẻ |
| Toàn bộ thang xám là neutral lạnh | `#121212` / `#181818` / `#242424` cùng hue 0°, saturation 0%. Không có nhiệt độ, nên mắt không có gì để phân biệt ngoài độ sáng |
| Mọi section cùng một nhịp | `.folio-section { padding-block: 72px }` → `96px` @768 (`:1175-1181`); 5 section liền nhau không có section nào khác nhịp |
| Chữ dày, không "sang" | `--folio-ink: #fafafa` là trắng lạnh; display 600 weight trên nền gần đen gây halo |
| `--folio-surface-raised` đã dùng nhưng không cho card | 4 chỗ: `.folio-btn-quiet:hover` (`:333`), theme toggle (`:405`), workflow button hover (`:1431`), `.workflow-dot` (`:1664`). Toàn bộ là control, không chỗ nào là card — nên bậc thứ ba chưa từng xuất hiện trong bố cục nội dung |

## Thay đổi

### 1. Card theo bậc, không theo viền

```css
.bento-card {
  background: var(--folio-surface);          /* +1 bậc so với canvas */
  border: 1px solid transparent;             /* viền biến mất ở rest */
}

.guta-card {
  background: var(--folio-surface);
  border: 1px solid transparent;
}

/* Card "nổi" (highlight) là bậc thứ ba — chỉ dùng cho đúng một card/section */
.bento-card--raised,
.guta-card--raised {
  background: var(--folio-surface-raised);
}
```

Nhưng: bỏ viền hoàn toàn làm card mất ranh giới khi `--folio-surface` chỉ lệch 0.005 L\*. Kiểm bằng
ảnh chụp. Nếu không đọc được, **giữ viền nhưng đổi sang `--folio-border` ấm** — không thêm cả viền
và bóng (vi phạm §4 colour.md: "a panel does not read → increase padding or space before a second
tone").

Ưu tiên thứ tự: tăng padding 20→28px → nếu vẫn không đọc, mới dùng viền ấm.

### 2. Nhịp section: ba nhịp, không một

```css
.folio-section { padding-block: 80px; }          /* nhịp chuẩn */

@media (min-width: 768px) {
  .folio-section { padding-block: 112px; }
}

/* Section mở đầu sau hero thở rộng hơn — nó là chỗ mắt nghỉ sau ảnh */
#features { padding-block-start: 128px; }

/* Section FAQ siết lại: nội dung là list, không cần không gian như grid */
#questions { padding-block: 96px; }
```

Chỉ ba nhịp (80 / 112 / 128-96), không phải mỗi section một số tuỳ hứng.

### 3. Type: bớt nặng ở display

`--folio-heading` 60px @1024 (`:117`). Trên nền ấm, weight 600 của Newsreader hơi nặng. Đổi
`.folio-display { font-weight: 500 }` và `letter-spacing: -0.02em` (từ -0.025em). Đo lại: chiều cao
dòng không đổi vì `line-height: 1.16` giữ nguyên.

Section heading `h2` 36px → giữ nguyên size, đổi weight 600 → 500 cho khớp.

### 4. Accent: thu về 2 chỗ

Hiện `var(--folio-accent)` xuất hiện 8 chỗ, trong đó `crm-progress-fill` (thanh tiến độ trong mockup),
`crm-card-highlight` (viền card), `cash-scan` (viền quét), `crm-avatar-sm` (nền avatar),
`hero-badge-dot` (chấm 6px). Trong mockup là hợp lý (đó là UI sản phẩm, có ngữ nghĩa). Trên
**landing chrome** chỉ nên còn:

- `hero-badge-dot` (6px, điểm nhấn duy nhất trên hero text) — giữ.
- `:focus-visible` outline — giữ (a11y).

`cash-scan` và `crm-avatar-sm` nằm trong mockup/bento, giữ. Không thêm chỗ mới.

### 5. Tagline section — bậc sáng thay vì khoảng trắng

`TaglineReveal` render vào `[data-tagline-slot]` giữa `#features` và `#solution`. Hiện nó không có
nền riêng nên trôi. Cho nó bậc surface:

```css
.tagline-section {
  background: var(--folio-surface);
  border-block: 1px solid var(--folio-border);
  padding-block: 96px;
}
```

Kiểm: `.tagline-copy` có `opacity .3 → 1` theo từ (đã có). Trên nền `--folio-surface`, từ chưa reveal
ở 0.3 opacity phải vẫn ≥ 2.6:1 (ngưỡng inspector) — `#f5f2ec` @30% trên `#171512` ≈ 4.6:1. Đạt.

## Không làm

- Không thêm section mới, không đổi copy.
- Không dùng `--folio-surface-overlay` cho card (bậc 4 quá sáng, phá "dark room").
- Không thêm border + shadow cùng lúc cho card.
- Không đổi `.crm-*` (đó là mockup sản phẩm, có ngữ nghĩa riêng).

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/styles/folio-layout.css` (§2 type, §4 hero, §6 sections, card, tagline) |

**Không chạm:** `.tsx`, `product.css`, `brand.css`, test.

## Kiểm chứng

```bash
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/inspect.mjs" http://localhost:5173 --out .taste-skill/inspect/luxury --widths 1440,768,390
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/lint.mjs" apps/web/src/styles/folio-layout.css
pnpm --filter web test
```

Đạt khi:

1. Trên ảnh chụp 1440, **đếm được** ba bậc sáng khác nhau giữa canvas / card / tagline band.
2. Không card nào có cả viền và bóng.
3. `#features` bắt đầu thấp hơn `#product` (nhịp khác nhau đọc được bằng mắt).
4. `h1` weight 500, `h2` weight 500; không có heading nào vẫn 600/700 ngoài `.crm-*`.
5. `--folio-accent` không xuất hiện ở chỗ mới ngoài danh sách trên (grep lại).
6. Test `landing-workflow` pass (không đổi chuỗi).
7. Inspector 0 FAIL; nếu `hairline` FAIL tăng do bỏ viền — đó là dấu hiệu tốt, ghi lại số.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| Bỏ viền làm card "tan" vào nền | Kiểm ảnh chụp trước, chỉ bỏ viền khi bậc sáng đủ; nếu không, giữ viền ấm |
| `#features`/`#questions` selector trúng section khác | Chỉ có một `#features` và một `#questions` trong `FOLIO_HTML`; grep xác nhận trước khi sửa |
| Đổi weight display làm headline mất "signature" | So ảnh trước/sau; nếu mất lực, trả 600 cho `h1` riêng, giữ 500 cho `h2` |

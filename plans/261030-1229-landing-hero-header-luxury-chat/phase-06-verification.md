---
phase: 06
plan: landing-hero-header-luxury-chat
title: Verification — build, test, inspect, lint, critique
owner: tester
status: completed
priority: P1
effort: 4h
depends_on: [03, 05]
blocks: []
---

# Phase 06 — Kiểm chứng

## Mục tiêu

Chứng minh bằng thiết bị đo, không bằng cảm nhận: build sạch, test xanh, inspector 0 FAIL, và một
critique có bằng chứng ảnh cho từng yêu cầu gốc.

## Cổng kỹ thuật (bắt buộc pass)

```bash
cd apps/web && pnpm typecheck
cd apps/web && pnpm build
cd apps/web && pnpm test
```

| Cổng | Ngưỡng | Ghi chú |
|---|---|---|
| `tsc --noEmit` | 0 error | |
| `vite build` | 0 error, 0 warning mới | ghi lại bundle size trước/sau |
| `node --test test/**/*.test.mjs` | toàn bộ pass | gồm e2e Playwright nếu môi trường có fixture API |

Nếu e2e cần API thật và môi trường không có, ghi rõ **chưa chạy** — không đánh dấu pass.

## Cổng giao diện

```bash
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/lint.mjs" apps/web/src/components/FolioLandingView.tsx apps/web/src/styles/folio-layout.css
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/inspect.mjs" http://localhost:5173 --out .taste-skill/inspect/final-landing --widths 1440,768,390
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/inspect.mjs" http://localhost:5173 --app --out .taste-skill/inspect/final-app
```

Phân loại từng FAIL/WARN theo `ak-design-taste` §Classify:

| Loại | Xử lý |
|---|---|
| Defect thật (clipping, contrast, overflow, focus mất) | **Phải sửa**, không waive |
| Lựa chọn brand có chủ đích (hairline trên bảng, mono cho số) | Waive có ghi lý do + đường dẫn dòng |
| Chưa kiểm chứng được (Safari, screen reader thật) | Ghi vào mục "Chưa kiểm" |

Lưu ý trước khi chạy: `lint.mjs` quét cả `apps/web/dist-verify/` (bundle build cũ) và báo hàng trăm
FAIL `hairline`/`shadow`/`mono`. Đó là **output build**, không phải source. Chỉ chấm các file trong
`src/`; ghi rõ trong report rằng lint chạy trên 223 file và số FAIL đến từ `dist-verify`.

## Ma trận kiểm bằng chứng

Mỗi dòng phải có ảnh chụp hoặc số đo. Không dòng nào được để trống.

| # | Yêu cầu | Cách đo | Ngưỡng |
|---|---|---|---|
| 1 | Ảnh phong cảnh hiện sau mockup | ảnh `fold-1440.png`, `fold-768.png`, `fold-390.png` | ảnh đọc ra phong cảnh, không phải mảng nâu |
| 2 | Ảnh không sáng hơn mockup | so mắt trên ảnh fold | mockup là vùng sáng nhất khối hero |
| 3 | Mép ảnh không cắt thành đường | ảnh fold | không có cạnh thẳng ở 4 phía |
| 4 | Header pill khi cuộn | chụp `scrollY=200` ở 3 width | `maxWidth ≤ 960`, `borderRadius 9999px`, `backdropFilter` khác `none` |
| 5 | Header trả full-bleed khi về đầu | chụp `scrollY=0` | `maxWidth = viewport width`, `borderRadius 0px` |
| 6 | Không nhấp nháy quanh ngưỡng | script Playwright set `scrollY` 10/18/22/30 xen kẽ | class `nav-scrolled` không đổi giữa 10↔22 |
| 7 | Reduced motion | `page.emulateMedia({ reducedMotion: 'reduce' })` | nav `transitionDuration 0s`, ảnh hiện đủ, mockup không clip |
| 8 | Ba bậc surface đọc được | ảnh chụp section bento + tagline | đếm được 3 mức sáng |
| 9 | Contrast text/nền | script đo `getComputedStyle` + công thức WCAG trên cặp thật | ≥ 4.5:1 cho body, ≥ 3:1 cho display |
| 10 | Không còn "Copilot" | `grep -ri copilot apps/web/src apps/web/test` | 0 |
| 11 | Select đủ bàn phím | test `select-component.test.mjs` | 7/7 case pass |
| 12 | Select không bị clip trong modal | ảnh chụp modal + menu mở | menu hiện đủ, trên modal |
| 13 | Anchor không bị nav che | click `#features`, đo `top` của heading | ≥ 76px |
| 14 | 390px không overflow ngang | `document.documentElement.scrollWidth <= clientWidth` | true |
| 15 | Touch target ≥ 44px | đo mọi `button`, `a[role=button]`, trigger select ở 390 | tất cả ≥ 44×44 |

Script đo (đặt tại `plans/261030-1229-landing-hero-header-luxury-chat/assets/verify-surfaces.mjs`,
tái dùng pattern `plans/261030-1153-design-system-big-update/assets/capture-viewports.mjs`):

```js
// Đo contrast trên cặp thật, không suy từ mã màu: đọc backgroundColor đã
// composite của tổ tiên gần nhất có nền không trong suốt.
const pairs = await page.evaluate(() => {
  const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number);
  const lum = ([r, g, b]) => {
    const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };
  const bgOf = (el) => {
    let node = el;
    while (node && node !== document.documentElement) {
      const c = parse(getComputedStyle(node).backgroundColor);
      if (c.length >= 3 && (c[3] === undefined || c[3] > 0.85)) return c.slice(0, 3);
      node = node.parentElement;
    }
    return [15, 14, 13];
  };
  const targets = [
    ['.folio-display', 3], ['.hero-sub', 4.5], ['.hero-meta', 4.5],
    ['.bento-card h3', 3], ['.bento-card > header p', 4.5],
    ['.guta-card > p', 4.5], ['.partners-row', 4.5], ['.guta-label', 4.5],
  ];
  return targets.map(([sel, min]) => {
    const el = document.querySelector(sel);
    if (!el) return { sel, missing: true };
    const fg = parse(getComputedStyle(el).color).slice(0, 3);
    return { sel, min, ratio: +ratio(fg, bgOf(el)).toFixed(2) };
  });
});
```

Ngưỡng: mọi `ratio >= min`, không có `missing: true` (nếu missing, selector sai — sửa selector, không
bỏ dòng).

## Critique (một vòng, ghi findings)

Đọc `ak-design-taste/references/critique.md` rồi chấm 6 trục trên ảnh fold + ảnh scroll:

| Trục | Câu hỏi | Ngưỡng |
|---|---|---|
| Composition | Hero có một điểm dừng mắt, hay ba thứ tranh nhau? | 1 điểm |
| Type | Có phân cấp đọc được không cần màu? | ≥3 bậc |
| Colour | Ảnh + ink + accent có ăn nhập, hay ảnh là khách lạ? | ảnh thuộc về trang |
| Rhythm | Section có nhịp khác nhau? | ≥2 nhịp |
| Detail | Có chỗ nào "gần đúng" (spacing lệch 2px, mép không thẳng)? | 0 |
| Motion | Có chuyển động nào không giải thích được điều gì? | 0 |

Điểm < 7.5 ở trục nào → sửa trong scope phase tương ứng (01/02/03), không mở phase mới.

## Report

Ghi vào `plans/reports/tester-261030-{hhmm}-landing-hero-header-luxury-verify.md`:

1. Bảng 15 dòng ma trận trên, mỗi dòng `PASS` / `FAIL` / `NOT RUN` + bằng chứng (đường dẫn ảnh, số đo).
2. Danh sách FAIL còn lại, kèm file:line và mức độ (P0/P1/P2).
3. Danh sách waive có lý do.
4. Mục **Chưa kiểm**: Safari/Firefox, screen reader thật (NVDA/VoiceOver), iOS Safari bàn phím ảo,
   LCP thật trên 3G.
5. Bundle size trước/sau.

## Điều kiện dừng

Không đánh dấu phase này complete khi còn:

- Bất kỳ P0/P1 nào: contrast dưới ngưỡng, control mất bàn phím, clip nội dung, overflow ngang ở 390,
  ảnh không hiện, header không thu, "Copilot" còn trong source.
- Một dòng ma trận ở trạng thái `NOT RUN` mà không có lý do môi trường cụ thể.

P2 (mỹ thuật, không chặn) được phép còn, phải liệt kê.

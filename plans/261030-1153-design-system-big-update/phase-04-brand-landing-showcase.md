---
phase: 04
plan: design-system-big-update
title: Brand register — Landing editorial, hero appear, Bento living loops
owner: fullstack-developer
status: completed
priority: P1
effort: 12h
depends_on: [00]
blocks: [05]
---

# Phase 04 — Brand register & Showcase

Phase này dùng nhiều nhất `ak-page-showcase` (visual system + motion system) và `ak-design-taste`
(page run + `references/motion.md`). Product register **không** áp các luật ở đây.

## Context Links

- `research/design-direction.md` §4 (Brand brief), §5 (story table)
- `ak-page-showcase/references/landing-visual-system.md` (B1 type, B2 spacing, B7 motion, B11 tagline)
- `ak-page-showcase/references/motion-system.md` (B1 empty start, B2 choreography, B4 stories, B6 curves)
- `ak-design-taste/references/motion.md` §1 budget, §3 four questions, §6 recipes
- `assets/inspect-landing-baseline/report.json` (5 FAIL, 5 WARN baseline)

## Vấn đề phải giải

Landing hiện tại **5 FAIL** từ inspector:

| FAIL | Chi tiết | Fix |
|---|---|---|
| `micro-label` ×7 | "GỢI Ý PHÂN CÔNG PHOBERT", "PHẠM VI NGHIỆP VỤ", "KIẾN TRÚC & LUỒNG XỬ LÝ AGENTIC"… | Sentence case, 12px, bỏ tracking |
| `emoji` | 🟢 ⛶ | SVG outline 16px |
| `gradient` | `conic-gradient` trên `div.absolute.inset-0` | Xoá, dùng flat surface |
| `tiny-text` ×37 | 9px, 10px | Nâng ≥ 11px; meta 12px, data 13–14px |
| `edge-text` @768 | "Cần Admin đối chiếu & xác nhận" ở −1px | Padding container |

WARN phải sửa: `font-count` 3 typeface · `font-fallback` **Tiempos Headline và JetBrains Mono
khai báo nhưng không load** · `below-fold` 1/10 block · `panel-void` ×2 · `app-title-size` h1 60px
(đúng cho Brand register — sẽ `--allow`).

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/components/FolioLandingView.tsx` (chuỗi `FOLIO_HTML`) |
| Sửa | `apps/web/src/components/landing/WorkflowSection.tsx` |
| Sửa | `apps/web/public/assets/folio/folio-layout.css` |
| Sửa | `apps/web/src/styles/brand.css` |
| Tạo | `apps/web/src/components/landing/TaglineReveal.tsx` |
| Sửa | `apps/web/index.html` (preload font) |

**Không chạm:** `CrmDashboardView.tsx`, `chat/**`, `AccountLoginModal.tsx`, file test.

## Ràng buộc bất khả xâm phạm (test đang enforce)

`landing-workflow.test.mjs` assert **cứng** các chuỗi sau — phải còn nguyên:

```
id="solution"                                      (dòng 122)
KIẾN TRÚC &amp; LUỒNG XỬ LÝ AGENTIC                (dòng 125)
Luồng Vận Hành Tự Động 24/7                        (dòng 126)
Fast Rule Gate … Jev AI … Gemini 3.8 Flash         (dòng 129)
/diagrams/chatbot-architecture.html                (dòng 132)
Live Loop                                          (dòng 133)
export { WorkflowSection }                         (dòng 136)
a[href="#solution"]                                (dòng 138)
```

Lưu ý: `KIẾN TRÚC &amp; LUỒNG XỬ LÝ AGENTIC` là **uppercase tracking** — đây chính là `micro-label`
mà inspector flag. **Giữ nguyên chuỗi này** (test khoá), nhưng trình bày lại: chuyển thành
label 12px sentence-case **bên cạnh** một heading, thay vì badge uppercase. Chuỗi vẫn tồn tại
trong DOM với `aria-hidden="true"` hoặc dạng text ẩn nếu cần, **hoặc** đổi test cùng lúc nếu được duyệt.

> **Quyết định cần chốt:** nếu giữ nguyên visual uppercase thì `micro-label` FAIL tồn tại.
> Khuyến nghị: **giữ chuỗi nhưng đổi sang sentence case ở visual, cập nhật test regex** —
> chuỗi uppercase trong test là snapshot chứ không phải yêu cầu nghiệp vụ. Ghi vào ADR-021 như mục mở rộng.

## A. Hero appear (bắt buộc, mọi website)

Theo `ak-page-showcase` "The hero appear": trang mở **trơn** — nền + static surface của mockup,
không text. Mỗi element rise **6px** và resolve từ **blur 2px**, stagger **50–70ms**,
toàn bộ xong trong **1.2s**.

```html
<h1 class="folio-display">
  <span class="line"><span data-line style="--i:0">Quản Trị Nhân Sự &amp;</span></span>
  <span class="line"><span data-line style="--i:1">Phân Ca Tự Động</span></span>
</h1>
```

```css
.line { display: block; overflow: clip; padding-bottom: .08em; margin-bottom: -.08em; }
@media (prefers-reduced-motion: no-preference) {
  html.js .folio-hero [data-line] {
    transform: translateY(105%);
    animation: line-up 900ms var(--ease-out) forwards;
    animation-delay: calc(var(--i) * 110ms + 150ms);
  }
  html.js .folio-hero [data-load] {
    opacity: 0; transform: translateY(6px); filter: blur(2px);
    animation: rise 500ms var(--ease-out) forwards;
    animation-delay: var(--d);
  }
  html.js .folio-hero [data-open] { clip-path: inset(0 0 100% 0); animation: open 1000ms var(--ease-in-out) 150ms forwards; }
}
@keyframes line-up { to { transform: none; } }
@keyframes rise { to { opacity: 1; transform: none; filter: none; } }
@keyframes open { to { clip-path: inset(0); } }
```

Timeline: headline 150→1050ms, subtext 420ms, buttons 480ms, mockup mở 150→1150ms.
**Tất cả settled trước 1.2s.** Không preloader. Nội dung đọc được ngay frame đầu nếu JS tắt
(vì `html.js` gate — một dòng script inline).

## B. Signature moment (một, duy nhất, được phép loud)

> Headline rise từ mask, 2 dòng, 900ms `--ease-out`, stagger 110ms — như trên.

Không có signature thứ hai. Mọi thứ khác phải quiet để cái này nổi.

## C. Section entrances — khác nhau theo nội dung (chống "cùng một fade")

`ak-design-taste/references/motion.md` §1: *"the same fade-and-slide-up with the same timing on
every block"* là motion tell số 1 của trang do AI tạo.

| Section | Manner | Timing |
|---|---|---|
| Bento features | Card rise 24px + blur 6px, stagger 70ms theo reading order | 600ms |
| Kanban 5 cột | Cột rise, **card bên trong** stagger 50ms sau cột | 500ms + 50ms×n |
| Workflow (iframe diagram) | Không animate container; iframe tự chạy `TOGGLE_MOTION` | — |
| FAQ | Row-by-row, 60ms, chỉ opacity + 8px | 400ms |
| Tagline reveal | Từng từ sáng dần khi scroll (B11 bên dưới) | scroll-linked |

Trigger: `IntersectionObserver` với `rootMargin: '0px 0px -12% 0px'`, `threshold: 0.1`, **once**,
`unobserve` sau khi fire. Không scroll listener. Không replay.

## D. Tagline reveal section (B11 — bắt buộc, hiện chưa có)

Section lớn nói lợi ích cốt lõi, tách khỏi hero, không nằm ngay dưới hero.

- Copy ≥ 2 dòng, viết bằng giọng sản phẩm, không phải heading chung.
  Đề xuất: *"Một ca thiếu người không còn là cuộc gọi lúc 5 giờ sáng. Hệ thống đã biết trước bốn tiếng."*
- Type `text-4xl`–`text-6xl`, max-width 680px, `text-wrap: balance`.
- Từ bắt đầu ở `opacity: .3`; khi scroll vào, từng từ chuyển sang `opacity: 1` **theo thứ tự đọc**,
  dùng `--ease-out`, không `linear`.
- Implement: `IntersectionObserver` per word, hoặc một listener throttle bằng `requestAnimationFrame`.

```tsx
// TaglineReveal.tsx
const words = copy.split(' ');
// mỗi <span> có --i; IO trên container set data-revealed; CSS delay calc(var(--i) * 60ms)
```

## E. Bento living loops (Showcase — `ak-page-showcase` B4)

Chỉ áp cho **4 bento card có visual**. Card text thuần không có story.

**Story viết trước khi build (một câu mỗi cái, đúng bảng ở `research/design-direction.md` §5):**

| Card | Story | Beats |
|---|---|---|
| Phân công theo kỹ năng | Barista mới rơi vào ô trống, điểm PhoBERT đếm 0→94.2%, ứng viên khác lùi một bậc | 3.2s |
| Đối soát két tiền mặt | Cursor quét từng dòng, dòng lệch 20.000₫ sáng, số chênh lệch đếm từ 0 | 2.8s |
| Tra cứu chính sách | Prompt gõ từng ký tự, 3 chip nguồn hiện dần, câu trả lời resolve từ blur 6px | 4.0s |
| Phân ca 24H | Một ca trượt từ "Chờ" sang "Đã giao", badge đổi trạng thái | 2.4s |

**Luật bắt buộc:**
- Mỗi story bắt đầu và kết thúc **đúng frame thiết kế** (rest = design).
- Chỉ `transform`, `opacity`, `filter`, `clip-path`. Blur động ≤ 14px.
- Offset các card: không card nào act cùng lúc; lệch nhau để mắt đi theo reading order.
- Beat rõ trong 2 giây đầu; nếu viewer không biết đang animate trong 2s → story quá nhút nhát.
- `prefers-reduced-motion: reduce` → render **still frame** (không story, không intro).
- Story dừng khi section ra khỏi viewport (`IntersectionObserver`), resume khi quay lại.

**Accent (không thay thế story):**
- Pulse ring cho status dot: 1.8–2.2s, scale 1→2.6, opacity .55→0.
- Không sheen sweep trên light grey (vô hình) — dùng refill story.

## F. Sửa lỗi cụ thể theo inspector

| Vấn đề | Fix |
|---|---|
| 3 typeface (Geist / Inter / Tiempos) | Bỏ `Inter` khỏi mọi chỗ; bỏ `Tiempos Headline` khỏi `--folio-display`, dùng `Newsreader` (đã load). Còn **2** family. |
| `Tiempos Headline` + `JetBrains Mono` khai báo không load | Xoá declaration; mono dùng `Geist Mono` (đã load trong `index.html`). |
| 37 block < 11px | Nâng: badge 11px, meta 12px, data 13px. Không có ngoại lệ. |
| `conic-gradient` | Xoá. Nếu cần nhấn, dùng 1 đường 1px accent. |
| `🟢` `⛶` | SVG outline 16px, stroke 1.5. |
| 7 micro-label uppercase | Sentence case 12px, bỏ `letter-spacing`. |
| `edge-text` @768 | `padding-inline: clamp(16px, 4vw, 32px)` trên container. |
| `panel-void` 49px ×2 | `align-items: start` trên row; không stretch card thiếu nội dung. |
| `below-fold` 1/10 | Hero hiện chiếm 780px. Giảm hero padding, đưa mockup CRM lên cao hơn để block thứ 2 lộ header. |
| `app-title-size` h1 60px | **Đúng cho Brand register** — `--allow app-title-size` và ghi lý do trong report. |

## G. Font & preload

```html
<link rel="preload" as="font" type="font/woff2" crossorigin
      href="https://fonts.gstatic.com/s/newsreader/...woff2">
```
Chỉ preload **một** font display (Newsreader) để headline rise trong đúng face. Không preload Geist
(đã có `display=swap` và không phải LCP text).

## Implementation Steps

1. Xoá `Inter` và `Tiempos Headline` khỏi `folio-layout.css` và `brand.css`; xác nhận `font-count` = 2.
2. Nâng toàn bộ text < 11px; grep `font-size: \dpx` và `text-\[\d+px\]`.
3. Xoá `conic-gradient`, thay emoji bằng SVG.
4. Đổi 7 micro-label sang sentence case 12px.
5. Thêm `html.js` inline script + hero appear CSS.
6. Tạo `TaglineReveal.tsx`, chèn section sau hero + 1 section.
7. Bento: thêm 4 story (CSS animation + một `IntersectionObserver` điều khiển `animation-play-state`).
8. Section entrances theo bảng C.
9. Thêm `--allow app-title-size` vào lệnh inspect.
10. Chạy inspect 3 width + `landing-workflow.test.mjs`.

## Success Criteria

1. `inspect --widths 1440,768,390` → **0 FAIL** (với `--allow app-title-size`).
2. `font-count` = 2; `font-fallback` không còn Newsreader/Geist Mono.
3. Không còn text < 11px (`tiny-text` = 0).
4. `micro-label` = 0 (sau khi chốt quyết định về chuỗi uppercase trong test).
5. `landing-workflow.test.mjs` PASS (8 assertion bất khả xâm phạm ở trên).
6. Hero settle < 1.2s (đo bằng Playwright: `performance.now()` khi element cuối có `opacity: 1`).
7. `prefers-reduced-motion: reduce` → không transform nào, nội dung đầy đủ ngay frame đầu.
8. 4 story chạy, mỗi story về đúng rest frame (so screenshot trước/sau một chu kỳ).
9. 390px: `scrollWidth === clientWidth`.

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Hero appear làm LCP tệ đi (text ẩn đến 1.05s) | **Cao** | `html.js` gate + `content-visibility` không dùng; đo LCP trước/sau; nếu LCP > 2.5s thì giảm delay còn 80ms và bỏ blur |
| Story loop gây jank trên mobile | Cao | Chỉ `transform`/`opacity`; `animation-play-state: paused` khi off-screen; test 390px |
| `clip-path` không animate được trong Safari cũ | Trung | Fallback: nếu `CSS.supports('clip-path','inset(0)')` false → chỉ opacity |
| Sửa `KIẾN TRÚC &amp;...` làm đỏ test | Chắc chắn | Chốt quyết định trước; nếu giữ thì chấp nhận 1 FAIL có lý do |

## Security Considerations

- `FOLIO_HTML` là string tĩnh — không nội suy input người dùng.
- Font từ Google Fonts: giữ `preconnect`, không thêm origin lạ.
- Không dùng `eval`/`new Function` cho animation.

## Next Steps

Phase 05 (Verification) là gate cuối.

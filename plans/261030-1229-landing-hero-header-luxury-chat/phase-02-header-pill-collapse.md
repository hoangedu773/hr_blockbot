---
phase: 02
plan: landing-hero-header-luxury-chat
title: Header — thu thành viên thuốc khi cuộn
owner: fullstack-developer
status: completed
priority: P1
effort: 3h
depends_on: [00]
blocks: [03]
---

# Phase 02 — Header thu thành viên thuốc

## Mục tiêu

Khi cuộn, thanh nav co từ full-bleed thành một viên thuốc lơ lửng có nền mờ và hairline; cuộn về đầu
trang thì trả lại full-bleed. Một element duy nhất, không nhân đôi DOM.

## Hiện trạng

`folio-layout.css:138-159`:

```css
.folio-preview > header nav {
  position: fixed !important;
  inset: 0 0 auto 0 !important;
  width: 100% !important;
  …
  background: transparent !important;
  transition: background-color 0.25s var(--ease-out), border-color 0.25s var(--ease-out);
}

.folio-preview > header nav.nav-scrolled {
  background: rgba(18, 18, 18, 0.86) !important;
  backdrop-filter: blur(20px) !important;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08) !important;
}
```

`FolioLandingView.tsx:511`:

```ts
const syncScrolledNav = () => nav?.classList.toggle('nav-scrolled', window.scrollY > 20);
```

Vấn đề: `nav` cao 100% viewport, nền chỉ đổi màu — hình dạng không đổi, nên suốt trang vẫn là một
dải ngang đục. Thêm nữa `rgba(18,18,18,…)` hard-code, không theo token ấm mới.

## Thiết kế

Hai trạng thái của **cùng một** `<nav>`:

| | Đầu trang | Đã cuộn |
|---|---|---|
| `max-width` | `none` (100%) | `960px` |
| `margin-inline` | `0` | `auto` |
| `margin-top` | `0` | `12px` |
| `border-radius` | `0` | `9999px` |
| `background` | `transparent` | `color-mix(in oklab, var(--folio-canvas) 78%, transparent)` |
| `backdrop-filter` | `none` | `blur(20px) saturate(140%)` |
| `border` | `1px solid transparent` | `1px solid var(--folio-border)` |
| `box-shadow` | `none` | `0 10px 30px rgba(0,0,0,.35)` |
| `padding-inline` | `clamp(16px,4vw,32px)` | `clamp(10px,2vw,18px)` |

`box-shadow` ở đây là overlay thật (thanh nổi trên nội dung), không phải decoration ở rest — hợp lệ
theo `ak-design-taste` §shadow. Ghi comment lý do.

## CSS

Thay block `folio-layout.css:138-159`:

```css
/* 3. Header — một nav, hai hình dạng. Full-bleed ở đầu trang, thu thành viên
 * thuốc khi cuộn. `max-width` + `border-radius` animate được; không nhân đôi
 * DOM nên focus order và aria-expanded giữ nguyên một nguồn. */
.folio-preview > header nav {
  position: fixed;
  inset: 0 0 auto 0;
  width: 100%;
  z-index: 50;
  max-width: 100%;
  margin-inline: 0;
  padding-inline: clamp(16px, 4vw, 32px);
  background: transparent;
  border: 1px solid transparent;
  border-radius: 0;
  box-shadow: none;
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
  transition:
    max-width var(--t-pill) var(--ease-out),
    margin var(--t-pill) var(--ease-out),
    padding var(--t-pill) var(--ease-out),
    border-radius var(--t-pill) var(--ease-out),
    background-color var(--t-pill) var(--ease-out),
    border-color var(--t-pill) var(--ease-out),
    box-shadow var(--t-pill) var(--ease-out);
}

.folio-preview > header nav.nav-scrolled {
  max-width: min(960px, calc(100% - 32px));
  margin-inline: auto;
  margin-top: 12px;
  padding-inline: clamp(10px, 2vw, 18px);
  border-radius: var(--folio-pill);
  background: color-mix(in oklab, var(--folio-canvas) 78%, transparent);
  border-color: var(--folio-border);
  /* Overlay thật: thanh nổi trên nội dung đang cuộn bên dưới. */
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.35);
  backdrop-filter: blur(20px) saturate(140%);
  -webkit-backdrop-filter: blur(20px) saturate(140%);
}

@media (prefers-reduced-motion: reduce) {
  .folio-preview > header nav { transition: none; }
}

@media (max-width: 1023px) {
  .folio-preview > header nav.nav-scrolled {
    max-width: calc(100% - 24px);
    margin-top: 8px;
  }
}
```

Giữ `.folio-preview > header nav > div` nhưng **bỏ `padding-inline`** của nó (đã chuyển lên `nav`);
chỉ còn phần bó nội dung:

```css
.folio-preview > header nav > div {
  max-width: var(--folio-width);
  margin: 0 auto;
}
```

Khi nav thành pill, `max-width: 960px` trên `nav` đã bó nội dung nên `max-width: 1270px` của `div`
không còn tác dụng — không cần rule riêng cho trạng thái chưa cuộn.

Menu mobile mở (`nav[data-state="active"]`) phải **tắt pill** — pill có `border-radius: 9999px` sẽ
cắt mất menu xổ xuống:

```css
.folio-preview nav[data-state="active"] {
  max-width: 100%;
  margin-top: 0;
  border-radius: 0;
}
```

## JS

`FolioLandingView.tsx:511` — thay bằng logic có hysteresis, tránh nhấp nháy khi người dùng dao động
quanh ngưỡng:

```ts
// Hysteresis: enter at 24, leave at 8. A single threshold flickers when the
// user rests the scroll position on it (trackpad inertia, iOS rubber-band).
const ENTER_AT = 24;
const LEAVE_AT = 8;
let navScrolled = false;
const syncScrolledNav = () => {
  const y = window.scrollY;
  const next = navScrolled ? y > LEAVE_AT : y > ENTER_AT;
  if (next === navScrolled) return;
  navScrolled = next;
  nav?.classList.toggle('nav-scrolled', next);
};
```

`navScrolled` khai báo trong closure của `useEffect`, không phải `useState` — không cần re-render
React cho một class.

Vẫn dùng listener `passive` hiện có; không đổi sang `IntersectionObserver` vì cần đọc `scrollY` thật
và listener đã `passive: true`.

## Điểm phải xử lý: anchor link dưới header

Khi header thành pill ở `margin-top: 12px`, chiều cao khả dụng cho anchor giảm. Hiện **không có**
`scroll-margin-top` nào trong repo (đã grep `scroll-margin|scroll-padding` → 0 kết quả). Thêm:

```css
.folio-preview :is(section[id], div[id="dashboard-preview"]) {
  scroll-margin-top: 96px;
}

@media (max-width: 1023px) {
  .folio-preview :is(section[id], div[id="dashboard-preview"]) {
    scroll-margin-top: 76px;
  }
}
```

## File Ownership

| Hành động | File |
|---|---|
| Sửa | `apps/web/src/styles/folio-layout.css` (§3 Header, thêm scroll-margin) |
| Sửa | `apps/web/src/components/FolioLandingView.tsx` (`syncScrolledNav` trong `useEffect`) |

**Không chạm:** markup nav, test.

## Kiểm chứng

```bash
node "C:/Users/hoang/.omp/agent/skills/ak-design-taste/scripts/inspect.mjs" http://localhost:5173 --out .taste-skill/inspect/header --widths 1440,768,390
pnpm --filter web test
```

Đạt khi:

1. Ở `scrollY = 0`: nav full-bleed, không nền, không viền.
2. Ở `scrollY = 200`: nav là pill rộng ≤960px, bo tròn, nền mờ đọc được chữ nav phía trên ảnh hero.
3. Dao động `scrollY` giữa 10 và 22 px **không** đổi class (kiểm bằng cách set `window.scrollTo` xen
   kẽ trong Playwright `evaluate`).
4. Mở menu mobile khi đã cuộn: menu xổ xuống **không** bị `border-radius` cắt; `aria-expanded`
   đúng.
5. `prefers-reduced-motion: reduce`: đổi trạng thái tức thời (kiểm `getComputedStyle(nav).transitionDuration === '0s'`).
6. Bấm `#features` khi đang cuộn: tiêu đề section không bị nav che (đo `getBoundingClientRect().top >= 76`).
7. Contrast: chữ nav trên nền pill khi đè ảnh hero ≥ 4.5:1 — đo bằng script trên ảnh chụp vùng nav,
   không suy từ `color-mix`.

## Rủi ro

| Rủi ro | Xử lý |
|---|---|
| `transition: max-width` gây layout mỗi frame trong 280ms | Chỉ chạy một lần mỗi lần vượt ngưỡng; hysteresis chặn dao động; 280ms là một lần duy nhất, không lặp |
| `backdrop-filter` + ảnh hero = chi phí composite | Đo bằng DevTools Performance một lần; nếu > 16ms/frame thì bỏ `saturate()` trước, giữ `blur` |
| Pill hẹp làm nav links 4 mục + 2 CTA tràn ở 1024–1100px | Ngưỡng pill chỉ bật ở ≥1024px; ở 1024–1100 kiểm ảnh chụp, nếu tràn thì nâng `max-width` lên 1040px thay vì bỏ pill |
| `!important` bị xoá làm rule cũ trong `brand.css`/utility layer thắng | Kiểm computed style sau khi xoá; nếu bị utility đè, thêm `@layer` phù hợp chứ không quay lại `!important` |

# Baseline Evidence — Design System Big Update

Đo ngày 2026-10-30 trên `apps/web` build production (`pnpm --filter web build`) và source `main`.
Mọi con số dưới đây lấy từ lệnh chạy thật, không phải ước lượng.

## 1. Kiến trúc render thực tế (khác với tài liệu cũ)

| Bề mặt | File render thật | Cơ chế | Kích thước |
|---|---|---|---|
| Landing | `apps/web/src/components/FolioLandingView.tsx` | Chuỗi HTML 35.822 ký tự trong biến `FOLIO_HTML` (dòng 14) + `dangerouslySetInnerHTML` | 224 dòng |
| CRM | `apps/web/src/components/CrmDashboardView.tsx` | Chuỗi HTML `CRM_HTML` (dòng 23–566) + `dangerouslySetInnerHTML` (dòng 976) + 350 dòng DOM wiring bằng `querySelector` (dòng 606–955) | 997 dòng |
| Chat | `apps/web/src/components/chat/ChatDrawer.tsx` | JSX + `<style>` inline 1166 dòng | 1166 dòng |
| Auth modal | `apps/web/src/components/AccountLoginModal.tsx` | JSX | — |

**Hệ quả:** `apps/web/src/components/landing/{BentoFeatures,LandingHero,LandingNavbar,AuthModal,FaqSection,InteractiveTabs,LogoMarquee}.tsx`
là **dead code** — chỉ `WorkflowSection` được re-export và dùng (test `landing-workflow.test.mjs:136` assert đúng điều này).
Bất kỳ phase nào sửa các file đó đều sửa code chết.

## 2. Design system không tái sinh được (blocking architectural defect)

- `apps/web/package.json` **không có** `tailwindcss`. Không có `tailwind.config.*`.
- CSS thật là 2 bundle tĩnh đã build sẵn trong `public/assets`:
  - `folio/folio.css` — 142.144 bytes, 1 dòng, header `tailwindcss v4.0.15`, JIT đã purge.
  - `crm/2voh1gse7971r.css` — 113.697 bytes, 1 dòng.
- `index.css` (1.204 dòng) là lớp override thủ công, **106 lần `!important`**.

**Đo class coverage** (`assets/audit-class-coverage.mjs`): `CRM_HTML` dùng **211 class**;
**73 class không tồn tại trong bất kỳ bundle CSS nào đang load**; `index.css` chỉ bù được 12 → **61 class render ra không có style**.

Ví dụ class chết: `bg-white/[0.04]`, `border-white/[0.08]`, `backdrop-blur-xl`, `text-zinc-400`,
`bg-gradient-to-r`, `min-w-[960px]`, `p-3.5`, `divide-border/60`, `shadow-2xs`.

Đây là lý do giao diện "gần đúng nhưng nhìn lệch": không phải gu xấu, mà là CSS không tồn tại.

## 3. Inspector (`scripts/inspect.mjs`) — landing production, 1440/768/390

`RESULT: 5 FAIL, 5 WARN`

FAIL: `micro-label` ×7 (uppercase tracking label) · `emoji` · `gradient` (conic) · `tiny-text` ×37 (<11px) · `edge-text` @768.
WARN: `font-count` 3 typeface (Geist 64% / Inter 33% / Tiempos 3%) · `font-fallback` **Tiempos Headline và JetBrains Mono khai báo nhưng không load** · `below-fold` 1/10 block · `panel-void` ×2 (49px) · `app-title-size` h1 60px.

## 4. Taste lint (`scripts/lint.mjs --app`) — chỉ file bề mặt sống

`RESULT: 38 FAIL, 153 WARN`

| Rule | Số | Ghi chú |
|---|---|---|
| `gradient` | 21 | `linear-gradient` trong CRM_HTML và ChatDrawer |
| `emoji` | 13 | `✕`, `⏸`, `🤖` trong UI |
| `purple` | 2 | `bg-purple-500`, `#a855f7` |
| `micro-label` | 2 | `uppercase tracking-wider` |
| `framework-colour` (WARN) | 55 | `#10b981`, `#60a5fa` hardcode ngoài token |
| `mono` (WARN) | 54 | `font-mono` cho số — hợp lệ theo house rule "every figure in mono" nhưng phải khai báo là quyết định |
| `glass` (WARN) | 19 | `backdrop-filter` |
| `shadow` (WARN) | 19 | shadow trên element tĩnh |
| `bounce` (WARN) | 3 | pulse loop |
| `transition-all` (WARN) | 3 | gồm `index.css:437` |

## 5. Motion audit (theo chuẩn Emil Kowalski)

Đo trên `apps/web/src`:

| Tiêu chí | Kết quả | Đánh giá |
|---|---|---|
| `scale(0)` entrance | 0 | Đạt |
| `transition: all` | 1 (`index.css:437` `.shift-pill-block`) | **Vi phạm** |
| `ease-in` cho entrance | 0 (4 `ease-in-out` đều là loop vô hạn: skeleton, typing, sparkle) | Chấp nhận được — loop không phải entrance |
| `prefers-reduced-motion` | 3 block trong `index.css`, 1 trong ChatDrawer, 1 trong ChatPageView, 1 trong App.tsx | Có, nhưng rời rạc |
| Hover gating `@media (hover: hover)` | 8 occurrence trong `index.css`; **15 rule `:hover` khai báo ngoài gate** | **Vi phạm** — sticky hover trên mobile |
| `:active` feedback | 8 rule; toàn cục `button:active { scale(0.98) }` tại `index.css:1165` | Đạt một phần |
| `focus-visible` | 8 rule / 1.204 dòng | Thiếu trên phần lớn control |
| `transform-origin` cho popover | 0 | Thiếu |
| `@starting-style` | 0 | Không dùng |
| Stagger | 0 | Không có choreography |

Drawer: `translateX(100%) → 0`, 250ms `cubic-bezier(0.16,1,0.3,1)` (`ChatDrawer.tsx:518`) — đúng curve, sai ngân sách (nên 240ms vào / 180ms ra, bất đối xứng).

## 6. Xung đột test ↔ quy chuẩn thẩm mỹ (phải quyết định)

`apps/web/test/e2e-revamp-flow.test.mjs:193-227` **assert cứng** các giá trị mà taste skill coi là anti-pattern:

| Assertion | Dòng | Xung đột |
|---|---|---|
| `glass.sidebar === 'blur(24px)'`, `kpi === 'blur(16px)'`, `thead === 'blur(12px)'` | 216-220 | `ak-design-taste` xếp `glass` vào WARN |
| `assert.match(glass.gradient, /linear-gradient/)` trên `.crm-kpi-card` | 219 | taste cấm gradient trên card |
| `iconBackground === 'rgba(255,255,255,0.05)'` | 226 | icon trong khối nền tinted — taste cấm "icon in tinted square on every KPI" |
| KPI hover `matrix(1,0,0,1,0,-2)` | 222 | hover dịch chuyển 2px — chấp nhận được nhưng phải gate `(hover: hover)` |

Đây là **style snapshot**, không phải behavioral assertion. Cần ADR để quyết định cập nhật hay giữ.

## 7. Ràng buộc phải bảo toàn (không được phá)

- `landing-workflow.test.mjs`: `FolioLandingView` phải còn `export { WorkflowSection }` (dòng 136),
  còn `id="solution"`, còn `chatbot-architecture.html` iframe, còn chuỗi `KIẾN TRÚC &amp; LUỒNG XỬ LÝ AGENTIC`,
  `Luồng Vận Hành Tự Động 24/7`, `Fast Rule Gate…Jev AI…Gemini 3.8 Flash`, `Live Loop`, `a[href="#solution"]`.
- `e2e-revamp-flow.test.mjs`: 45 dòng `tr[data-id]`, tìm kiếm "Sư Vạn Hạnh", empty state
  "Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.", drawer `#detail-drawer`, toast Telegram,
  Ctrl+K focus search, `yellowCount === 0`.
- `web-integration.source-shape.test.mjs`: `auth.ts` không dùng `localStorage`; `App.tsx` không còn metric fallback.
- `pnpm --filter web test`: **50/50 PASS** tại thời điểm lập plan (baseline xanh).

## 8. Màu thương hiệu đã chốt

`docs/DESIGN.md` v3.0 + `docs/rules/project-design-rules.md` (đã sửa): **Zero-Yellow**,
Obsidian `#090A0F`–`#121214`, accent hành động Electric Sapphire `#2563EB`,
status Emerald `#10B981` / Rose `#F43F5E` / Slate `#64748B`.
Test đã enforce: `#ffd100`, `#eab308`, `#f59e0b`, `#fdd663`, `#b45309`, `#fbbf24`, `rgba(217,119,6` → cấm.

## 9. Artifact tái sử dụng

| File | Nội dung |
|---|---|
| `assets/lint-baseline.txt` | Output lint đầy đủ |
| `assets/inspect-landing-baseline/` | Screenshot + `report.json` 3 width |
| `assets/audit-class-coverage.mjs` | Script đo class chết (chạy lại được) |
| `assets/capture-surfaces.mjs` | Script chụp landing → auth → CRM → drawer |
| `assets/probe-buttons.mjs` | Probe DOM sau build |

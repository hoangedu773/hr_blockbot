# Folio layout repair — preview pending approval

- Type: directed redesign of existing public landing, not CRM.
- User/moment: Guta staff arriving before login.
- Job: restore readable hierarchy and responsive composition from the supplied Folio DESIGN.md.
- Scope: previews only until approval; preserve current product code and user changes.
- Acceptance: 48/60/72px heading, shared 1270px container, primary pill CTA, no document overflow at 320/390/768/1440, functioning narrow navigation.

## Evidence and ownership

Reference: ../../../design-check/folio-topaz-delta.vercel.app-DESIGN.md, all 876 lines read. Style reference only; not proof of product metrics or testimonials.
Current app: ../src/App.tsx mounts FolioLandingView, which embeds HTML; components/landing are not mounted. CSS: ../public/assets/folio/folio.css. No component-library dependency. Existing copy and data flow unchanged.
AgentKit owners: custom-design for reference-led layout; super-ui-ux-master for accessibility and interaction checks.

## Repair

Reuse captured current DOM and existing Folio stylesheet. Add scoped preview-only CSS. Desktop: header / centered editorial hero / wide demo / existing sections. Mobile: disclosure header / 48px hero / stacked equal-width CTAs / horizontally scrollable demo. Demo remains recognizable, not scaled into unreadable miniature. Primary action remains before demo.
Files: folio-layout.html, folio-layout.css, folio-preview-build.cjs, folio-layout-*.png; index.html adds preview link. folio-inspect.cjs and folio-current.html are local inspection evidence, not product imports.

## Source conflicts

Choose prose max-width1270 over contradictory breakpoint table1430. Choose primary pill and dark-first from Do section over extracted button6px. Keep two-theme implementation unchanged in product; preview dark-only, derived light not verified. Font files are absent: Tiempos font-face has invalid src; use explicit documented Georgia fallback. Geist unavailable, system sans fallback; exact font fidelity NOT verified. No downloading third-party fonts without known rights.

## Checks observed

node apps/web/previews/folio-preview-build.cjs: PASS320/390/768/1440 heading sizes, no page overflow, narrow menu disclosure. Browser: installed Edge via Playwright.
Before capture: shoot.mjs, three viewports; reports29 issues,3 warnings including dead menu, overlapping demo, labels, tiny text. Backend localhost3001 unavailable.
Screenshots captured but image inspection blocked: current model does not support image input. Do not claim visual acceptance or final gate PASS.
Remaining: inspect screenshots with user/vision-capable reviewer; audit remaining inherited illustration text/contrast, labels, tab interactions; user approve preview; apply minimal approved patch; build and regression test.
Screen loading/error/empty states N/A for static preview; existing demo content is not live API data. Auth opens an explicit preview notice, never fakes login.
## 21st-CRM Dashboard & Dual Theme Revision

User feedback:
1. Heading text clipping/broken typography ("vỡ chữ") on `<h2>` ("Từ giao việc đến nghiệm thu.", "Không cần tin một cách mù quáng.", "Những điều cần rõ.").
   - Root cause diagnosed via Chrome DevTools Protocol (`CSS.getPlatformFontsForNode`): The preview was referencing `"Tiempos Headline", Georgia, "Times New Roman", serif`. Tiempos was not installed; Windows Georgia lacks full precomposed Vietnamese diacritical coverage for tone marks (ừ, ệ, ầ, õ, ù, á). The browser engine split words mid-sentence, rendering unaccented characters in Georgia (wide serif) and accented vowels in Times New Roman (condensed sharp serif) with mismatched baselines and weights.
   - Fix: Linked Google Font `Inter` in `<head>` and updated `--folio-display` to `"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif` with `font-weight: 700`, `line-height: 1.25`, and proportional tracking `-0.02em`.
   - Verified via CDP: 100% of glyphs in all `<h2>` nodes render natively in `Inter-Bold` with 0 fallback splits.
2. Dashboard design restyled strictly following `design-check/dashboard-DESIGN.md` (21st-CRM system):
   - CRM Topbar: brand badge, workspace breadcrumb, search input with `⌘K`, role indicator, action buttons (`rounded.xs: 4px`).
   - Metric Ribbon: 4 metric cards (`rounded.sm: 10px`, delicate 1px border, single-tier shadow `0 1px 2px rgba(0,0,0,0.05)`).
   - 5 Kanban Workflow Columns matching KLCN133 lifecycle: 1. Khởi tạo, 2. Đã giao, 3. Đang thực hiện, 4. Chờ duyệt, 5. Hoàn thành. Opportunity cards with assignee avatar, deadline, stage pill, and PhoBERT similarity match tags.
   - AI Copilot side card: Vietnamese policy search, confirmation protocol rule, and semantic PhoBERT assignment recommendation.
4. Navbar Button Count & Center Navigation Collision Fix:
   - Root cause identified: The original Folio template only contains 2 action buttons on the right (`Login` + `Get Started`). Our preview previously injected 3 buttons (`Đăng nhập`, `Trải nghiệm`, `Xem dashboard`) alongside `[data-theme-toggle]`. This bloated the right cluster to 427px width, causing the absolute-centered navigation menu (`Nghiệp vụ`, `Luồng làm việc`, `Trợ lý AI`, `Nguyên tắc`) to collide with and overlap the right buttons by ~150px at 1024px and ~14px even at 1440px.
   - Fixes applied:
     1. Removed redundant 3rd button (`Trải nghiệm` / `Sign Up`), retaining strictly 2 buttons (`Đăng nhập` and `Xem dashboard`) matching the original Folio design structure.
     2. Refactored center navigation menu container from `position: absolute; inset: 0; margin: auto;` to standard responsive flex child `flex: 1 1 auto; justify-content: center; position: static;` with balanced gap (`1rem` on `lg:`, `2rem` on `xl:`).
     3. Automated verification in Playwright at 1024px, 1100px, 1200px, 1280px, 1440px confirms zero overlap (`hasOverlap: false`) with balanced clearance: `gapLeft >= 52px` and `gapRight >= 53px` at 1024px.

5. Hero H1 & Description Alignment with Legacy Design:
   - Updated H1 text: `Quản Trị Nhân Sự & Phân Ca Tự Động`.
   - Updated Hero description text: `Guta Workspace tự động hóa xếp ca 24H, đối soát chấm công và trợ lý AI điều phối nhân sự cho chuỗi cà phê — nhanh chóng, không sai sót ca làm.`.
   - Restored typography scale matching `preview-folio-intelligence.html`:
     - Font size: `36px` (mobile), `48px` (tablet), `60px` (desktop) with `font-weight: 600` (`font-semibold`).
     - Line-height: `1.25` (no diacritic clipping).
     - Subtext: `max-w-2xl` (`672px`), `font-size: 18px` (`20px` on desktop), `line-height: 1.6`.
   - Audit with `render-check`: 0 warnings, 0 clipping, 0 page overflow across 375px, 768px, 1440px.

6. Exact Typography Compliance with `folio-topaz-delta.vercel.app-DESIGN.md`:
   - Primary (UI / Body / Navigation / Buttons): `Geist` (Google Fonts weights 300-800).
   - Monospace (Code / Tokens): `Geist Mono` (Google Fonts weights 400-500).
   - Display Headings (h1, h2): `"Tiempos Headline", "Newsreader", Georgia, "Times New Roman", serif`. Loaded `Newsreader` (Google Fonts optical size 6..72, weights 400-700) as the Vietnamese-complete editorial serif font.
   - CDP Verification (`CSS.getPlatformFontsForNode`):
     - `h1` and all `h2`: 100% rendered with `Newsreader` (editorial serif) or `Tiempos Headline` with 0% fallback to Times New Roman.
     - Body paragraph: 100% rendered with `Geist`.
     - Zero character splitting, zero diacritic clipping.
   - Restored and functional `[data-theme-toggle]` in the header navigation.
   - Fixed layout defects on `[data-theme-toggle]`:
     1. Removed `min-height: 44px; min-width: 44px;` that bloated the toggle to 96px × 50px. Fixed to standard pill proportions: container 60px × 32px, buttons 26px × 26px.
     2. Fixed double-ring artifact caused by Tailwind `ring-1 ring-border` clashing with CSS `border: 1px solid var(--folio-border)` (`--tw-ring-shadow: 0 0 #0000; box-shadow: none`).
     3. Fixed distorted SVG fill (`fill="currentColor" stroke="currentColor"` blotting out the sun rays) to clean outline `fill="none" stroke="currentColor" stroke-width="2"`.
     4. Aligned vertical baseline on desktop navbar: leveled container and all navbar action buttons to exact height 32px (`y: 22px`).
   - Light mode: Canvas `#FAFAFA`, text `#12161C`, border `#E4E7EC`, 21st-CRM surface `#F7F7F7` and card bg `#FFFFFF` per `dashboard-DESIGN.md`.
   - Dark mode: Canvas `#121212`, text `#FAFAFA`, border `#2E2E2E`, 21st-CRM surface `#1D1D1E` and card bg `#0F0F10`.
   - Verification: Playwright automated test toggles between light and dark, asserts background colors `#fafafa` (light) and `#121212` (dark) after transition.
   - All 5 viewports (320px, 375px, 390px, 768px, 1440px) pass assertion checks with 0 horizontal overflow.

User accepted layout/UI, requested replacing the Folio stock-analysis illustration and unrelated section content with project-grounded content. Outcome: same landing direction, HR BlockBot product illustration plus Vietnamese narrative. Constraints: no PII, no invented production metrics/partners/testimonials, React18/Vite unchanged. Non-goals: implementing backend/AI, changing authenticated CRM, adding shift/payroll features. Acceptance: no unrelated Folio copy, labeled sample dashboard, five project lifecycle states, usable FAQ/menu, no page overflow at five widths.

Register: Brand with Product illustration. Scene: Vietnamese HR manager and employee reviewing the project before login. Direction: accepted Folio dark/editorial system. Color: restrained charcoal/near-white/blue focus, existing tokens. Type: serif display/system sans fallback, exact Tiempos/Geist unavailable. Signature: task table beside a contextual assistant and traceable decisions. Dials: variance4/motion1/density6.

Compared: screenshot of current CRM (lowest code, but current CRM content cannot substantiate F1–F7); labeled HTML illustration (chosen, readable and directly mapped to docs, requires explicit sample status). Better approaches: none — requested product illustration is appropriate; sources docs/00-vision-scope.md F1–F7, docs/10-ui-ux-spec.md sections3–6, docs/20-project-map-and-direction.md section2. Docs are design intent, not evidence functions already work.

Removed stock analysis, third-party integration claims, partner logos, fabricated testimonials, pricing links. Replaced with project lifecycle, HR records, assignments, KPI reasoning, policy chat, confirmation and role boundaries. No live API in preview.

Observed checks: folio-preview-build.cjs PASS320/375/390/768/1440 heading/no-overflow/menu, five sample task rows, FAQ disclosure, unrelated-copy assertions. pnpm --filter web build PASS (37 modules); existing bundle-size warning711.82kB. Screenshots generated, visual review still unverified because model image input unavailable. User layout acceptance recorded; new content awaits review. Product source untouched.

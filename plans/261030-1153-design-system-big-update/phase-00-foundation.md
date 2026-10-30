---
phase: 00
plan: design-system-big-update
title: Nền tảng — Tailwind v4 build thật, token 3 tầng, xoá dead code
owner: fullstack-developer
status: pending
priority: P0
effort: 6h
depends_on: []
blocks: [01, 04]
---

# Phase 00 — Nền tảng

## Context Links

- `research/baseline-evidence.md` §2 (61 class chết), §7 (ràng buộc test)
- `decisions/ADR-020-tailwind-v4-real-build.md`
- `research/design-direction.md` §2 (Design Brief), §6 (D1/D3)

## Vấn đề phải giải

Không có Tailwind trong `apps/web/package.json`; CSS là 2 bundle tĩnh 256KB đã purge tại thời điểm copy.
**73/211 class trong `CRM_HTML` không tồn tại trong bundle**, `index.css` chỉ bù 12 → **61 class render
ra không có style nào**. `index.css` dài 1.204 dòng với **106 `!important`** để chống lại bundle tĩnh.

Đây là lý do giao diện "lệch" chứ không phải gu xấu. Mọi phase sau đều vô nghĩa nếu không sửa gốc.

## File Ownership (chỉ được chạm)

| Hành động | File |
|---|---|
| Sửa | `apps/web/package.json` |
| Sửa | `apps/web/vite.config.ts` |
| Sửa | `apps/web/index.html` |
| Sửa | `apps/web/src/main.tsx` |
| Sửa | `apps/web/src/App.tsx` (chỉ block đổi stylesheet `:70-82`) |
| Tạo | `apps/web/src/styles/index.css` |
| Tạo | `apps/web/src/styles/tokens.css` |
| Tạo | `apps/web/src/styles/base.css` |
| Tạo | `apps/web/src/styles/product.css` |
| Tạo | `apps/web/src/styles/brand.css` |
| Xoá | `apps/web/src/index.css` |
| Xoá | `apps/web/public/assets/folio/folio.css` |
| Xoá | `apps/web/public/assets/crm/2voh1gse7971r.css` |
| Xoá | `apps/web/public/assets/crm/2e445toz63gzv.css` |
| Xoá | `apps/web/src/components/landing/{BentoFeatures,LandingHero,LandingNavbar,AuthModal,FaqSection,InteractiveTabs,LogoMarquee}.tsx` |

**Không chạm:** `CrmDashboardView.tsx`, `FolioLandingView.tsx`, `ChatDrawer.tsx`, mọi file test,
`public/assets/folio/folio-layout.css` (giữ — đây là CSS viết tay cho landing, xử lý ở Phase 04).

## Kiến trúc token 3 tầng

```css
/* tokens.css — Tier 1 primitives */
:root {
  --obsidian-950: #090a0f;  --obsidian-900: #121214;  --obsidian-850: #18181b;
  --obsidian-800: #222226;  --obsidian-700: #2e2e2e;  --obsidian-500: #64748b;
  --obsidian-400: #94a3b8;  --obsidian-100: #f1f5f9;  --obsidian-50:  #f8fafc;
  --sapphire-600: #1d4ed8;  --sapphire-500: #2563eb;  --sapphire-400: #3b82f6;
  --emerald-500: #10b981;   --rose-500: #f43f5e;

  --font-sans: "Geist", system-ui, -apple-system, sans-serif;
  --font-serif: "Newsreader", Georgia, serif;
  --font-mono: "Geist Mono", ui-monospace, "SF Mono", Menlo, monospace;

  --radius-sm: 4px; --radius-md: 6px; --radius-lg: 8px; --radius-pill: 9999px;

  /* Motion — mọi giá trị lấy từ ak-motion-craft/references/animation-rules.md */
  --ease-snappy: cubic-bezier(0.2, 0.8, 0.2, 1);   /* dropdown, popover, tooltip */
  --ease-out:    cubic-bezier(0.23, 1, 0.32, 1);   /* entrance, UI <600ms */
  --ease-in-out: cubic-bezier(0.77, 0, 0.175, 1);  /* vật thể di chuyển trên màn hình */
  --ease-exit:   cubic-bezier(0.55, 0.055, 0.675, 0.19); /* thứ rời đi vĩnh viễn */
  --ease-drawer: cubic-bezier(0.32, 0.72, 0, 1);   /* iOS-like sheet */
  --t-press: 140ms; --t-hover: 180ms; --t-ui: 240ms; --t-sheet: 240ms;
  --t-reveal: 800ms; --t-open: 1200ms;             /* brand register only */
  --stagger-item: 70ms; --stagger-line: 90ms;
}
```

```css
/* product.css — Tier 2 semantic, scoped bằng data-register */
[data-register="product"] {
  --bg-canvas: var(--obsidian-950);
  --bg-surface: var(--obsidian-900);
  --bg-raised: var(--obsidian-850);
  --border-subtle: rgba(255,255,255,0.08);
  --border-control: var(--obsidian-700);
  --text-primary: var(--obsidian-50);
  --text-secondary: var(--obsidian-400);
  --text-muted: var(--obsidian-500);
  --accent-action: var(--sapphire-500);
  --status-ok: var(--emerald-500);
  --status-bad: var(--rose-500);
  --row-height: 42px; --control-height: 34px; --sidebar-width: 224px; --topbar-height: 64px;
}
```

**Tier 3 component token** đặt trong `product.css` theo block `.crm-*`, `.chat-*`, `.sheet-*`.

## Implementation Steps

1. `pnpm --filter web add -D tailwindcss@^4 @tailwindcss/vite@^4`
2. `vite.config.ts`: thêm `tailwindcss()` vào `plugins`.
3. Tạo `src/styles/index.css`:
   ```css
   @import "tailwindcss";
   @import "./tokens.css";
   @import "./base.css";
   @import "./product.css";
   @import "./brand.css";
   ```
4. `main.tsx`: `import './styles/index.css'` thay `import './index.css'`.
5. `base.css`: reset tối thiểu + baseline mobile (`-webkit-tap-highlight-color: transparent`,
   `overscroll-behavior: none` trên `html,body`, `input,textarea,select { font-size: 16px }` khi
   `(pointer: coarse)`, `touch-action: manipulation` trên control, `@media (hover: hover) and (pointer: fine)`
   cho toàn bộ hover, `@media (prefers-reduced-motion: reduce)` toàn cục).
6. `index.html`: xoá 3 `<link>` CSS; thêm `<meta name="viewport" content="..., viewport-fit=cover">`,
   `<meta name="theme-color">` cho cả 2 scheme, preload font Geist + Newsreader.
7. `App.tsx`: xoá effect đổi stylesheet; thay bằng set `document.documentElement.dataset.register`
   theo `hasSession`.
8. **Migrate class**: chạy `node assets/audit-class-coverage.mjs` sau build; với mỗi class còn thiếu,
   hoặc thêm utility (giờ Tailwind sinh được), hoặc chuyển sang class component trong `product.css`.
   Mục tiêu: **0 missing**.
9. Xoá `index.css` và 3 bundle tĩnh. Xoá 7 component landing chết (đã xác minh không import —
   `research/baseline-evidence.md` §1).
10. `pnpm --filter web typecheck && pnpm --filter web build`.

## Todo

- [ ] Cài Tailwind v4 + plugin Vite
- [ ] Tạo 5 file styles, wire vào `main.tsx`
- [ ] Xoá 3 `<link>` CSS + logic đổi stylesheet trong `App.tsx`
- [ ] Migrate 61 class chết → 0 missing
- [ ] Xoá `index.css`, 3 bundle tĩnh, 7 component chết
- [ ] Baseline mobile trong `base.css` (tap highlight, dvh, 16px input, hover gate, reduced motion)
- [ ] Typecheck + build xanh

## Success Criteria

Chạy đúng thứ tự này (mỗi gate tiêu thụ output của gate trước):

```bash
pnpm --filter web build
node plans/261030-1153-design-system-big-update/assets/qa-class-coverage.mjs          # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-class-coverage-control.mjs  # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-token-resolution.mjs        # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-dark-variant.mjs            # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-test-build-coupling.mjs     # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-dist-inventory.mjs          # exit 0
pnpm --filter web test                                                                # 50/50
```

| # | Tiêu chí | Đo bằng |
|---|---|---|
| 1 | Mọi class render có định nghĩa CSS (7 marker được allowlist có lý do) | `qa-class-coverage.mjs` |
| 2 | Matcher thực sự phân biệt được (negative control pass) | `qa-class-coverage-control.mjs` |
| 3 | 0 token guaranteed-invalid | `qa-token-resolution.mjs` |
| 4 | `dark:` là class-based, không media-based | `qa-dark-variant.mjs` |
| 5 | Suite chạy được từ clean clone (có `pretest`) | `qa-test-build-coupling.mjs` |
| 6 | CSS gzip < 60KB **và** không class chết từ `previews/` | `qa-dist-inventory.mjs` |
| 7 | `grep -c "!important" apps/web/src/styles/*.css` = 0 trên 5 file | grep |
| 8 | `pnpm --filter web test` 50/50 PASS, 0 skip | node --test |
| 9 | `apps/web/src/index.css` không còn tồn tại | `test -f` |
| 10 | `<link rel="preload">` cho Newsreader + Geist | grep `index.html` |

**Lưu ý thu thập exit code:** không pipe qua `tail`/`head` — shell trả exit của lệnh cuối pipeline.
Dùng `cmd > /tmp/x 2>&1; echo $?`.

> Script `assets/audit-class-coverage.mjs` đọc 3 bundle tĩnh đã bị xoá ở phase này → **retired**,
> không dùng làm bằng chứng. Nó được giữ lại chỉ như bản ghi lịch sử của baseline trước Phase 00.

## Risk Assessment

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Bundle tĩnh chứa utility mà source không dùng → xoá làm vỡ layout | **Cao** | Diff screenshot từng bề mặt; giữ nhánh `phase-00-before` để so |
| Tailwind v4 purge sai class trong chuỗi `CRM_HTML` (string literal, không phải JSX) | **Cao** | Tailwind quét file `.ts` theo text, class trong template string vẫn được detect; xác minh bằng audit script |
| `folio-layout.css` (viết tay) phụ thuộc token trong `folio.css` | Trung | Grep biến `--folio-*`; khai báo lại trong `brand.css` |
| Mất `blur()` làm test Phase 04 đỏ trước khi sửa test | Trung | ADR-021 chốt trước khi chạy Phase 04; Phase 00 không chạm test |

## Security Considerations

- Không thêm CDN mới. Font đã dùng Google Fonts — giữ nguyên, không thêm origin vào CSP.
- Xoá bundle tĩnh giảm bề mặt tấn công supply-chain (không còn CSS không rõ nguồn gốc trong repo).
- Không đổi `dangerouslySetInnerHTML` ở phase này (xử lý ở Phase 01).

## Next Steps

Phase 01 (Product shell) và Phase 04 (Brand landing) chạy **song song** sau khi Phase 00 xanh —
ranh giới file không giao nhau.

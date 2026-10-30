# ADR-024: Phase 00 QA REJECT — quyết định sửa và 3 câu hỏi mở

- **Ngày:** 2026-10-30
- **Trạng thái:** Accepted
- **Bối cảnh:** QA verdict REJECT với 3 blocker (F1, F2, F3) + 3 hygiene (F4, F5, F6).

## F1 — `dark:` variant: class-based, KHÔNG theo OS

**Quyết định: khôi phục class-based.**

Lý do: app là dark-only. `index.html` hardcode `<html class="dark">`. Không có theme toggle.
`prefers-color-scheme` khiến user có OS light nhận *fallback màu light* trên canvas gần đen —
contrast đo được 13.39:1 → **1.89:1** trên cột doanh thu.

Phase 04 làm brand landing với light/dark, nhưng cũng dùng class toggle (giống mọi design system
khác), không dùng OS preference. Hai hướng loại trừ nhau; chọn class.

**Sửa:** `@custom-variant dark (&:where(.dark, .dark *));` trong `tokens.css`.

## F2 — `--surface-card` self-reference

**Quyết định: xoá self-reference, alias về primitive.**

5 token guaranteed-invalid (`--bg-card`, `--surface`, `--surface-card`, `--bg-elevated`,
`--color-card`) làm search input + nút "Làm Mới" trong view Nhân sự render trong suốt.
Đây là regression so với `index.css` cũ (`--surface: #121214`).

**Sửa:** trong block legacy-alias của `product.css`, mọi alias phải trỏ về Tier 2 semantic đã
resolve (không trỏ về chính nó, không trỏ về alias khác chưa resolve).

## F3 — test suite không self-contained

**Quyết định: thêm `pretest`.**

`chat-drawer.test.mjs` đọc `dist/assets/*.css` ở module scope; `dist/` gitignored. Clean clone →
ENOENT trước khi test nào đăng ký → không phải "1 test fail" mà là "file abort".

**Sửa:** `apps/web/package.json` → `"pretest": "pnpm build"`.

Chấp nhận chậm hơn ~12s mỗi lần chạy test. Một test bị skip còn tệ hơn một test chậm.

## F4 — `@source` scoping

**Quyết định: scope về `src/` + `index.html`.**

916 class chỉ tồn tại trong `previews/` đang vào production CSS. `previews/` là mock page tracked,
sẽ drift. Không phải surface sản phẩm.

**Sửa:** thêm `@source` tường minh vào `index.css`:
```css
@import "tailwindcss" source(none);
@source "../**/*.{ts,tsx}";
@source "../../index.html";
```
Loại `previews/` và `dist-verify/`. Nếu có class nào trong `previews/` thực sự cần, khai báo
`@source inline("...")` tường minh.

## F5 — `folio-layout.css` ship 2 lần

**Quyết định: chuyển khỏi `public/`.**

Hiện vừa `@import` trong `brand.css` vừa bị Vite copy verbatim → 4.91KB gzip lãng phí.
Chuyển sang `apps/web/src/styles/folio-layout.css` và `@import` — một nguồn duy nhất.

**Ràng buộc:** Phase 04 sẽ thay file này. Giữ nguyên nội dung, chỉ đổi vị trí.

## F6 — 3 CSS parse warning

**Chấp nhận, không sửa ở Phase 00.**

`folio-layout.css:266` có selector viết tay chứa Tailwind variant chưa escape
(`.sm:flex-row.sm:items-center.lg:w-auto`). Rule này **chưa từng apply** kể từ trước Phase 00.
Phase 04 thay file. Ghi lại để không mất dấu.

## F7 — thiếu `<link rel="preload">` font

**Sửa luôn trong vòng này.** Phase 00 step 6 yêu cầu, dev bỏ sót. Thêm preload cho
Newsreader (display, ảnh hưởng LCP của Phase 04) và Geist (body).

Không preload Geist Mono — không phải LCP text.

## Câu hỏi mở — đã trả lời

| # | Câu hỏi QA nêu | Trả lời |
|---|---|---|
| 1 | `dark:` theo OS hay app? | **App** (class-based). Xem F1. |
| 2 | `previews/` giữ trong repo? | **Giữ file, loại khỏi Tailwind scan.** Xem F4. |
| 3 | Budget 60KB còn ý nghĩa? | **Giữ 60KB + thêm gate "unused rules < 5%"** trong Phase 05. |

## Gate bổ sung cho Phase 05

Thêm vào `phase-05-verification.md` Gate 1:

```bash
node plans/261030-1153-design-system-big-update/assets/qa-class-coverage.mjs      # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-token-resolution.mjs    # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-dark-variant.mjs        # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-test-build-coupling.mjs # exit 0
node plans/261030-1153-design-system-big-update/assets/qa-class-coverage-control.mjs # exit 0
```

Script `audit-class-coverage.mjs` (cũ, đọc bundle đã xoá) → **retire**, đổi tên thành
`_retired-audit-class-coverage.mjs` hoặc xoá. Success criterion của Phase 00 cập nhật trỏ
`qa-class-coverage.mjs`.

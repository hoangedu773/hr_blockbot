# ADR-022: Chốt 3 quyết định mở trước khi thực thi

- **Ngày:** 2026-10-30
- **Trạng thái:** Accepted (Lead, Mode A interactive — người dùng đã duyệt "ok điều phối cook chuẩn")
- **Liên quan:** ADR-020, ADR-021, `phase-04-brand-landing-showcase.md` §Ràng buộc

## D1 — Tailwind v4 build thật

**Chốt:** Duyệt. Xem ADR-020. Điều kiện tiên quyết cho mọi phase.

## D2 — Test style snapshot → behavioral

**Chốt:** Duyệt. Xem ADR-021. `yellowCount === 0` giữ nguyên.

## D3 — `index.css` → `src/styles/*`

**Chốt:** Duyệt. Xoá `apps/web/src/index.css` (1.204 dòng, 106 `!important`).

## D4 — Chuỗi `KIẾN TRÚC &amp; LUỒNG XỬ LÝ AGENTIC`

**Bối cảnh:** `landing-workflow.test.mjs:125` assert chính xác chuỗi uppercase này. Inspector flag
nó là `micro-label` (tiny uppercase letter-spaced label) — một trong 4 FAIL phải về 0.

**Quyết định:** Đổi **visual** sang sentence case 12px không tracking; đổi **test** sang
case-insensitive regex để vẫn bảo vệ nội dung mà không khoá cách trình bày.

```js
// Trước
assert.match(landingCode, /KIẾN TRÚC &amp; LUỒNG XỬ LÝ AGENTIC/);
// Sau
assert.match(landingCode, /kiến trúc\s*&(?:amp;)?\s*luồng xử lý agentic/i);
```

**Lý do:** Chuỗi uppercase trong test là snapshot trình bày, không phải yêu cầu nghiệp vụ. Bảo vệ
*nội dung* (badge nói về kiến trúc agentic) là mục tiêu thật; khoá *case* là tai nạn lịch sử.

**Áp dụng cho:** tất cả assert chuỗi tiếng Việt trong `landing-workflow.test.mjs` — thêm flag `i`.

## D5 — `.taste-skill/`

**Chốt:** Thêm vào `.gitignore`. Đây là thư mục làm việc của `ak-design-taste` scripts
(`.taste-skill/direction.json`), không phải artifact dự án.

## Ghi chú cho executor

Không quyết định nào ở đây mở rộng quyền, phạm vi, hay audience. Tất cả là routine maintenance
theo `ak-docs/references/doc-content-rules.md` §Write Authority.

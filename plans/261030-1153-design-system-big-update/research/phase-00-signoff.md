# Phase 00 — Sign-off

**Ngày:** 2026-10-30 · **Verdict:** PASS sau 2 vòng QA

## Bằng chứng độc lập (Lead tự chạy, không tin dev self-report)

```
typecheck exit=0
pnpm --filter web test → 50 tests / 50 pass / 0 fail / 0 skipped

qa-class-coverage                exit=0
qa-class-coverage-control        exit=0
qa-token-resolution              exit=0
qa-dark-variant                  exit=0
qa-test-build-coupling           exit=0
qa-dist-inventory                exit=0
```

## Vòng QA

| Vòng | Verdict | Finding |
|---|---|---|
| 1 | **REJECT** | F1 `dark:` media-based (contrast 13.39→1.89:1) · F2 `--surface-card` self-ref (5 token invalid, search box trong suốt) · F3 test không self-contained |
| 2 | **PASS** | 6/6 finding đã sửa; 2 gate có bug logic trong chính script đã được sửa đúng (không nới ngưỡng) |

## Thay đổi thực tế

| Hạng mục | Trước | Sau |
|---|---|---|
| Tailwind | không có trong `package.json` | `tailwindcss@4.3.3` + `@tailwindcss/vite@4.3.3` |
| CSS nguồn | 3 bundle tĩnh 256KB + `index.css` 1.204 dòng | `src/styles/{index,tokens,base,product,brand,folio-layout}.css` |
| `!important` | 106 | 0 |
| CSS gzip | ~? (không đo được, bundle tĩnh) | **16.66 KB** |
| Class không có style | 61/211 | 0 (7 marker allowlist có lý do) |
| `dark:` strategy | media-based (bug) | class-based (`@custom-variant dark`) |
| Token invalid | 5 | 0 |
| Test self-contained | không (đọc `dist/` không có `pretest`) | có (`"pretest": "pnpm build"`) |
| Tailwind scan | toàn `apps/web` (916 class chết từ `previews/`) | `src/**/*.{ts,tsx}` + `index.html` |
| `folio-layout.css` | ship 2 lần | 1 lần |
| Font preload | 0 | 2 (Geist + Newsreader, subset `vietnamese`) |

## Quyết định ghi lại

- ADR-020: Tailwind v4 build thật
- ADR-021: test style snapshot → behavioral (áp dụng Phase 01)
- ADR-022: D4 regex case-insensitive, D5 `.gitignore`
- ADR-023: 2 điểm chặn Phase 00
- ADR-024: 6 finding QA + câu trả lời 3 câu hỏi mở

## Nợ chuyển tiếp

| Item | Chuyển cho |
|---|---|
| CRM lệch 21.5% pixel (font Times→Geist, `min-w-[960px]` active) | Phase 01 — AC bổ sung: 10 cột không cuộn ngang ở 1440px |
| 15 `guta-chat-*` style qua `<style>` inline | Phase 02 |
| 3 CSS parse warning `folio-layout.css:266` | Phase 04 (thay file) |
| 14 class marker trơ (`lucide`, `group/sidebar-wrapper`…) | Không phải nợ — chấp nhận |

## Unresolved

Không có. Phase 00 đóng.

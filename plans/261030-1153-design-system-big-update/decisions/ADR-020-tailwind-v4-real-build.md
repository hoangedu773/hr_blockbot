# ADR-020: Tailwind v4 build thật thay cho CSS bundle tĩnh

- **Ngày:** 2026-10-30
- **Trạng thái:** Proposed (cần chốt trước Phase 01)
- **Liên quan:** `apps/web/package.json`, `apps/web/index.html`, `apps/web/public/assets/{folio,crm}/*.css`

## Bối cảnh

`apps/web` render giao diện bằng hai chuỗi HTML lớn (`FOLIO_HTML` 35.822 ký tự,
`CRM_HTML` ~544 dòng) nhúng qua `dangerouslySetInnerHTML`, dùng **211 utility class** kiểu Tailwind.
Nhưng `apps/web/package.json` không khai báo `tailwindcss`, không có `tailwind.config.*`, và không có
bước build CSS nào. CSS thực tế là hai file tĩnh đã build sẵn, commit vào `public/assets`:

| File | Bytes | Nguồn |
|---|---|---|
| `public/assets/folio/folio.css` | 142.144 | tailwindcss v4.0.15, JIT đã purge tại thời điểm copy |
| `public/assets/crm/2voh1gse7971r.css` | 113.697 | bundle khác, cùng bản chất |
| `public/assets/crm/2e445toz63gzv.css` | 2.111 | lớp bổ sung |

Đo bằng `plans/261030-1153-design-system-big-update/assets/audit-class-coverage.mjs`:
**73/211 class không tồn tại trong bất kỳ bundle nào đang load**; `index.css` chỉ bù được 12;
**61 class render ra hoàn toàn không có style** — gồm `bg-white/[0.04]`, `border-white/[0.08]`,
`backdrop-blur-xl`, `text-zinc-400`, `bg-gradient-to-r`, `min-w-[960px]`, `p-3.5`.

`index.css` (1.204 dòng, **106 `!important`**) là lớp chiến tranh override chống lại bundle tĩnh.

## Quyết định

Cài Tailwind v4 thật và sinh CSS từ source.

1. Thêm devDependency `tailwindcss@^4`, `@tailwindcss/vite@^4` vào `apps/web`.
2. `vite.config.ts` thêm plugin `tailwindcss()`.
3. Tạo `apps/web/src/styles/` với `tokens.css` (3 tầng), `base.css`, `product.css`, `brand.css`;
   `main.tsx` import một entry `src/styles/index.css` chứa `@import "tailwindcss";` + các file trên.
4. Xoá 3 file CSS tĩnh khỏi `public/assets/{folio,crm}/` và bỏ 3 thẻ `<link>` trong `index.html`.
5. Xoá logic đổi stylesheet theo session trong `App.tsx:70-82` (`theme-css`, `folio-layout-css`,
   `crm-layout-css`). Register chọn bằng `data-register="product|brand"` trên `<html>`, CSS lo phần còn lại.
6. Chuyển các class "động" trong `CRM_HTML` sang safelist tường minh hoặc sang CSS component thật.

## Hệ quả

**Tích cực**
- 61 class chết có style; giao diện khớp với ý định thiết kế thay vì "gần đúng".
- Xoá được 1.204 dòng `index.css` + 106 `!important`.
- Token 3 tầng có một nguồn duy nhất; `docs/DESIGN.md` §2 trở thành sự thật kiểm chứng được.
- Không còn 2 bundle 256KB không rõ nguồn gốc trong repo.

**Tiêu cực / rủi ro**
- Bundle CSS sẽ **tăng** so với hiện tại vì JIT cũ đã purge theo đúng 211 class đang dùng; bản mới
  purge theo toàn bộ source (nhiều component chết). Cần `content` detection đúng và xoá dead component trước.
- Rủi ro hồi quy thị giác cao nhất trong toàn bộ plan: mọi màn hình đổi cùng lúc. Bắt buộc chụp
  before/after ở 1440/768/390 và so sánh từng bề mặt.
- `@tailwindcss/vite` cần Vite ≥5 — hiện tại `vite@^5.4.1`, thoả.

## Phương án bị loại

| Phương án | Vì sao loại |
|---|---|
| Viết tay 61 class còn thiếu vào `index.css` | Chữa triệu chứng; bundle tĩnh vẫn là nguồn sự thật không tái sinh được; `!important` tăng tiếp |
| Đổi toàn bộ 211 class sang CSS module / inline style | Diff khổng lồ trên 2 chuỗi HTML, không cải thiện khả năng bảo trì |
| Giữ bundle tĩnh, chỉ sửa component | Không thể implement dealt sheet (cần token mới); mọi phase sau là trang trí trên nền gãy |

## Cách xác minh

```bash
pnpm --filter web build
node plans/261030-1153-design-system-big-update/assets/audit-class-coverage.mjs   # phải ra 0 missing
node scripts/inspect.mjs <dist-url> --widths 1440,768,390 --app                    # 0 FAIL
pnpm --filter web test                                                             # 50/50
```

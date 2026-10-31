---
title: QA — UI/UX + motion nâng cấp (logo, nav, diagram, CRM, chat)
date: 2026-10-31
branch: integration/full-delivery
scope: apps/web
verdict: PASS (web) · PRE-EXISTING FAIL (api, thiếu fixture)
---

# QA report — 2026-10-31

## Kết luận

Toàn bộ cổng kiểm của `apps/web` xanh. `apps/api` có 3 test đỏ **không liên quan thay đổi này**: chúng đọc tệp từ `data/`, thư mục bị gitignore và không tồn tại trong workspace.

## Kết quả

| Suite | Kết quả |
|---|---|
| `pnpm -r typecheck` | pass (contracts, api, web) |
| `pnpm -r run build` | pass; 0 cảnh báo parse CSS |
| `packages/contracts test` | 40/40 |
| `apps/web/test/e2e-revamp-flow` | 17/17 |
| `apps/web/test/auth-login-flow` | 10/10 |
| `apps/web/test/select-component` | 11/11 |
| `apps/web/test/web-integration.source-shape` | 13/13 |
| `apps/web/test/chat-drawer` | 1/1 |
| `apps/web/test/web-e2e-playwright` | 6/6 |
| `apps/web/test/landing-workflow` | 4/4 |
| `apps/web/scripts/verify-ui.mjs` | 13/13 |

## Lỗi sửa trong lượt này

**Cảnh báo parse CSS ở mỗi lần build.** `folio-layout.css` còn sót selector từ markup Tailwind cũ, gồm `.sm:flex-row.sm:items-center.lg:w-auto` — dấu `:` trong tên class không phải pseudo-class hợp lệ nên bộ parse báo lỗi. Markup tương ứng (`.absolute.inset-0`, `.relative.flex.flex-wrap`, `.nav-wordmark-sub`) không còn tồn tại, nên đây là CSS chết. Đã xoá 972 byte; build sạch cảnh báo.

## Lỗi sẵn có, không do thay đổi này

`apps/api/test/attachments-security.test.mjs` — 3 test "Static File Integrity" trả 404 thay vì 200.

Nguyên nhân đã xác minh: `resolveDataRoot()` trong `apps/api/src/routes/attachments.ts` dò ngược lên tìm thư mục `data/`. Workspace này không có `data/` ở bất kỳ cấp nào, và `.gitignore:72` loại nó khỏi git. Route trả `FILE_NOT_FOUND` đúng như thiết kế.

Bằng chứng độc lập: `apps/api` có 0 file thay đổi trong working tree, và chạy lại suite khi đã `git stash` toàn bộ thay đổi `apps/web` vẫn cho cùng kết quả đỏ.

Để xanh cần bổ sung `data/guta_mau_bien_ban_cho_agent/` và `data/guta_bo_du_lieu_chatbot/anh_tham_chieu/` (2 PDF + 1 PNG theo tên trong test). Đây là dữ liệu nghiệp vụ, không phải mã nguồn — tôi không tự tạo tệp giả vì sẽ làm test pass mà không chứng minh gì.

## Kiểm chứng UI đã chạy

`scripts/verify-ui.mjs` đo trực tiếp trong Chromium thay vì dựa vào ảnh chụp:

- Nav 1440/1280/1024: link không chồng lên cụm action, không overflow ngang.
- Landing mark dùng `mask-image` (đổi màu theo theme); CRM mark là `guta-mark-white.svg` với `filter: none`.
- CRM 1440/768/390: filter bar một hàng, sidebar và nút Chat đều hiện.
- Chat: tiêu đề "Chat", brand "Guta Workspace", 2 mark đều là asset trắng.
- Diagram 1440/1024/768/390: `data-motion="play"`, không toolbar nội bộ, không overflow; ≤900px dùng bản xếp tầng.

## Chưa kiểm

- Keyboard traversal toàn trang và screen-reader announcement: chưa chạy axe/AT.
- Safari/Firefox: chỉ Chromium.
- `data/` fixtures: xem mục trên.

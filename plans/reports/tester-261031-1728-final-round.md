---
title: QA vòng cuối — UI/UX + motion + sơ đồ tổ chức
date: 2026-10-31
branch: integration/full-delivery
scope: apps/web
verdict: PASS (web) · PRE-EXISTING FAIL (api, thiếu fixture data/)
---

# QA vòng cuối — 2026-10-31

## Kết luận

Toàn bộ cổng kiểm `apps/web` xanh, kể cả phần mới (sơ đồ tổ chức). `apps/api` còn 3 test đỏ, giữ nguyên nguyên nhân đã xác định ở vòng trước: thư mục `data/` bị gitignore và không tồn tại trong workspace.

## Kết quả

| Hạng mục | Kết quả |
|---|---|
| `pnpm -r typecheck` | pass (contracts, api, web) |
| `pnpm -r run build` | pass; **0** cảnh báo parse CSS |
| contracts | 40/40 |
| e2e-revamp-flow | 17/17 |
| auth-login-flow | 10/10 |
| select-component | 11/11 |
| web-integration.source-shape | 13/13 |
| chat-drawer | 1/1 |
| web-e2e-playwright | 6/6 |
| landing-workflow | 4/4 |
| verify-ui (hình học, màu, asset, org chart) | **20/20** |
| api | 157/160 — 3 đỏ sẵn có |

## Bổ sung vòng này

**Check biên cho sơ đồ tổ chức**, đã gộp vào `scripts/verify-ui.mjs` để chạy lại được:

1. **Theme sáng**: nhãn cấp 0 đổi sang `rgb(246,244,241)` và link vẽ lại bằng token — không còn màu chỉ đúng ở dark.
2. **Bàn phím**: vùng cuộn ngang `.org-scroll` focus được, `tabindex=0`, `role=region`, có `aria-label`, `scrollLeft` chuyển 240px khi thao tác.
3. **Ổn định bố cục**: chiều cao chart giữ nguyên `543px` qua 10 lần cuộn toàn trang, 0 console error.

Cộng với 4 check breakpoint đã có (1440/1024/768/390), sơ đồ tổ chức hiện có 7 điểm kiểm tự động.

## 3 test API đỏ — giữ nguyên kết luận

`attachments-security.test.mjs` → 404 thay vì 200. Nguyên nhân: `resolveDataRoot()` dò ngược tìm `data/`; workspace này không có thư mục đó ở cấp nào (`data/` ở root: không có; `apps/api/data/`: không có) và `.gitignore:72` loại nó khỏi git.

Bằng chứng độc lập: `git status` cho `apps/api` + `packages/contracts` = **0 file thay đổi**.

Không tạo fixture giả để làm xanh — sẽ khiến test pass mà không chứng minh gì.

## Chi phí đo được

| Bước | Thời gian |
|---|---|
| typecheck toàn monorepo | 7.6s |
| build toàn monorepo | 22.1s |
| e2e-revamp-flow | 50.4s |
| 6 suite web còn lại | 40.0s |
| verify-ui (20 check) | 33.9s |
| api suite | 69.1s |

## Chưa kiểm

- axe / screen-reader cho sơ đồ tổ chức và landing.
- Safari, Firefox — chỉ chạy Chromium.
- Touch thật trên thiết bị: các claim mobile là viewport + emulated input, không phải thiết bị thật.
- `data/` fixture của api.

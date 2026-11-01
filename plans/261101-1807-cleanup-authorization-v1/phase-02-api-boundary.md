# Phase 02 — Chuẩn hóa API boundary và error wrapper

## Mục tiêu

Tách `workflowEndpoint` khỏi `apps/api/src/routes/projects.ts`; mọi route dùng một helper chung mà không đổi envelope/status.

## Evidence

13 route files đang import `workflowEndpoint` từ `./projects.js`. `stores.ts` dài 821 dòng và tự có 8 `try/catch`, tạo nguy cơ drift với routes còn lại.

## Việc cần làm

1. Tạo `apps/api/src/lib/endpoint.ts` chứa implementation hiện tại của `workflowEndpoint`.
2. Migrate 13 route files sang import từ `../lib/endpoint.js`.
3. Xóa export helper khỏi `routes/projects.ts` sau khi grep xác nhận không còn importer.
4. ~~Migrate `stores.ts` sang wrapper~~ — **Bỏ, ghi deviation.** `stores.ts` dùng pattern `respond()` gửi response hoãn trong PATCH (sau khi nhả lease) và mỗi route trả message 500 riêng (`"Failed to fetch stores"`, `"Failed to create store"`, …). Đưa qua wrapper chung sẽ (a) đổi thời điểm gửi response, (b) đổi message 500 thành `"Unexpected server error"` của global handler. Cả hai là behavior change, trái invariant của Plan A. Phase này chỉ tách coupling `route → route`; `stores.ts` giữ nguyên và được ghi vào backlog riêng nếu sau này cần chuẩn hóa.
5. Không sửa business logic, query scope, capability hoặc Mongoose model.
6. Thêm test envelope cho một success, một Zod error, một `WorkflowError`, một infrastructure error.

## Acceptance

```powershell
git grep 'from "./projects.js"' apps/api/src/routes
# không có output
pnpm --filter api typecheck
pnpm --filter api test
```

- `projects.ts` chỉ giữ project route logic.
- `lib/endpoint.ts` không import route/model.
- Response JSON trước/sau khớp test matrix; không snapshot incidental timestamps.
- `stores.ts` không còn tự xử lý envelope ngoài trường hợp cần cleanup local resource.

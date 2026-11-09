# Phase 2 — B2: Citation có `article` + `score` thật

## Mục tiêu

Citation mà chatbot trả chỉ đúng điều khoản (article) và điểm thực tế (score), không còn `score: 1` hardcode và trống `article`.

## Files

| File | Sửa gì |
|---|---|
| `apps/api/src/services/document-authorization.service.ts` | `bestChunks` (`:111-124`) trả kèm `{article, score}` của chunk tốt nhất; `approvedDocuments` (`:126-148`) đưa hai field vào result |
| `apps/api/src/services/chat-authorization.service.ts` | `documentReceipt` (dùng `DocumentReceipt` type) thêm hai field optional; `revalidateChatAuthorization:1082` dùng `receipt.article` / `receipt.score` |

## Hiện trạng

- `bestChunks` (`:111-124`) chọn top-2 chunk theo `scoreText` nhưng chỉ trả về text nối lại, **mất thông tin `article` và `score`**.
- `approvedDocuments` trả `text: text.slice(0, 5000)` (`:968`) — model không biết ranh giới chunk.
- `revalidateChatAuthorization:1082`: `citations.push({ document: title, version, score: 1 })` — hardcode.
- `citationSchema` (`ai-client.service.ts:141-146`) đã có `article` và `score` optional — không cần đổi schema.
- UI render `citation.article ? ' · article' : ''` (`ChatPageView.tsx:507`) — sẵn sàng nhận.

## Thiết kế

### document-authorization.service.ts

1. `bestChunks` đổi return: `{ text, chunks: [{article, score}] }` thay vì string. Giữ logic ranking, thêm field identity.
2. `approvedDocuments` row: `{ document, text, score, topArticle }` — `topArticle` lấy từ chunk có điểm cao nhất.
3. `documentReceipt` thêm `article: topArticle, score: documentScore` (đã nằm trong digest nên tự động bị revalidate phát hiện thay đổi).

### chat-authorization.service.ts

1. `DocumentReceipt` type thêm `article?: string; score?: number`.
2. `:1082` đổi thành:

```ts
citations.push({
  document: String(document.title),
  version: String(document.version ?? ""),
  article: receipt.article ?? undefined,
  score: receipt.score ?? 1,
});
```

## Acceptance

- Test: chat fixture có 2 policy documents với chunks khác article → `citations[0].article` khớp article của chunk top-1; `score` ∈ (0, 1] và ≠ 1 khi có nhiều document.
- `pnpm --filter api test` xanh toàn bộ.

## Verify commands

```bash
pnpm --filter api build
node apps/api/test/with-memory-mongo.mjs apps/api/test/policy-acl.test.mjs apps/api/test/authorization-chat-v1.test.mjs
```

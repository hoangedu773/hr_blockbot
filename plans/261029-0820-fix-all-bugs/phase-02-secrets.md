# Phase 02 — Secrets & service auth (P0)

**Mục tiêu:** không còn secret hardcode, không còn fail-open, không còn CORS mở toang.

## File sở hữu (exclusive)

```
apps/api/src/services/auth.service.ts        P0-2
apps/ai-service/app/main.py                  P1-13, P2-5   (P0-3 đã fix — chỉ verify)
```

## Việc

1. **P0-2 — bỏ `DEFAULT_JWT_SECRET`** (`auth.service.ts:15`, dùng ở `:42`).
   - Đọc `process.env.JWT_SECRET` **lazy** trong hàm ký/verify (không đọc ở top-level như hiện tại, vì
     `dotenv.config()` chạy sau).
   - Thiếu hoặc `< 32` ký tự ⇒ **throw** lỗi rõ ràng (`JWT_SECRET_NOT_CONFIGURED`), không rơi về hằng số.
   - Test: `apps/api/test/*` phải set `JWT_SECRET` trong env của script test (đây là thay đổi ở
     `apps/api/package.json` — **file của phase 01**, nên nếu cần thì mở phase 01 làm trước, không tự sửa).
2. **P1-13 — CORS** (`main.py:49`): bỏ `allow_origins=["*"]` khi `allow_credentials=True`.
   - Đọc `CORS_ALLOW_ORIGINS` (comma-separated), mặc định `http://localhost:5173,http://localhost:3001`.
   - Nếu env là `*` mà credentials bật ⇒ **log warning + từ chối khởi động** (fail-closed), không âm thầm chạy.
3. **P2-5 — fallback hashing embedder** (`main.py`, quanh dòng 144): hiện lặng lẽ dùng embedder giả khi thiếu
   provider, sinh vector sai chiều so với vector đã lưu ⇒ kết quả RAG vô nghĩa mà không báo.
   - Sửa: so `len(vector)` với `settings.embedding_dim`; lệch ⇒ raise `EMBEDDING_DIM_MISMATCH`, không trả kết quả rác.

## Acceptance

```bash
grep -rn "DEFAULT_JWT_SECRET" apps/api/src          # 0 kết quả
cd apps/api && npm test                            # pass (JWT_SECRET set qua script test)
cd apps/ai-service && python -m unittest discover -s tests -p "test_api.py"
curl -i -X OPTIONS http://localhost:8000/api/v1/chat -H "Origin: https://evil.example"   # không có ACAO: *
```

- Khởi động `apps/api` **không** có `JWT_SECRET` ⇒ lỗi rõ ràng, không phục vụ request nào.
- Không in giá trị secret ra log trong bất kỳ nhánh nào.

## Rollback

Revert commit phase 02; độc lập với 03–08.

---
phase: 1
name: secrets-jwt
owner: backend-security
claims: [P0-1, P0-2]
depends_on: []
---

# Phase 01 — Secret & bootstrap JWT

## P0-1 · Key LLM hardcode trong file được git track

**File**: `apps/ai-service/tests/test_live_db_chat.py` (dòng 41 và 88)

Hiện trạng: `api_key=os.getenv("AI_LLM_API_KEY", "sk-<REDACTED>")` — fallback là key thật, kèm `base_url` tunnel riêng.

**Yêu cầu**
1. Bỏ hoàn toàn giá trị fallback ở cả 2 chỗ. Dùng `os.environ.get("AI_LLM_API_KEY")`; nếu rỗng → `pytest.skip("AI_LLM_API_KEY chưa được set")`.
2. Tương tự với `AI_LLM_BASE_URL`: không hardcode tunnel URL; thiếu thì skip.
3. Thêm vào đầu file một chú thích ngắn: key phải đến từ env, không bao giờ commit.
4. **Không** in giá trị key ra log/print.

**Không được**: sửa các file khác trong `tests/`; đổi hành vi test khác.

**Acceptance**
- `grep -rn "sk-" apps/ai-service/tests/` → 0 kết quả.
- `grep -rn "abc-tunnel" apps/ai-service/` → 0 kết quả.
- `python -c "import ast,sys; ast.parse(open(r'apps/ai-service/tests/test_live_db_chat.py',encoding='utf-8').read())"` exit 0.

**Ngoài phạm vi (người dùng phải làm)**: rotate key tại nhà cung cấp + purge git history. Ghi rõ trong report, không tự chạy.

## P0-2 · `JWT_SECRET` hardcode + đọc ở module scope

**File**: `apps/api/src/services/auth.service.ts:15-18`, `:54`, `:61` · `apps/api/src/index.ts` · `apps/api/src/app.ts:16-17`

Hiện trạng: `JWT_SECRET` là const top-level, `dotenv.config()` chạy sau khi module đã evaluate ⇒ giá trị dùng thật luôn là hằng hardcode.

**Yêu cầu**
1. Thay const bằng hàm `getJwtSecret(): Uint8Array` đọc `process.env.JWT_SECRET` **tại thời điểm gọi**.
2. Nếu thiếu:
   - `NODE_ENV === "production"` → `throw new Error("JWT_SECRET is required in production")` (fail-closed).
   - còn lại → dùng `DEFAULT_JWT_SECRET` nhưng `console.warn` **một lần** (dùng cờ module-level) nói rõ đang chạy dev với secret mặc định.
3. Thay cả 2 call site (`sign`, `jwtVerify`) sang `getJwtSecret()`.
4. Nạp env **trước** mọi import nghiệp vụ: trong `apps/api/src/index.ts`, đưa `dotenv.config()` lên trước `import { app }`. Vì ESM hoist import, phải dùng `import "dotenv/config"` ở **dòng đầu tiên** của entrypoint (side-effect import) thay vì gọi hàm — kiểm tra `package.json` có `dotenv` (có). Bỏ `dotenv.config()` trùng lặp trong `app.ts` **chỉ khi** đã chắc entrypoint nạp trước; nếu không chắc, giữ nguyên `app.ts` và chỉ thêm side-effect import.
5. Không đổi `ACCESS_TOKEN_TTL` / `REFRESH_TOKEN_TTL_MS`.

**Acceptance**
- `grep -n "JWT_SECRET" apps/api/src/services/auth.service.ts` → không còn dòng `const JWT_SECRET =`.
- `JWT_SECRET` không xuất hiện ở top-level module nữa (chỉ trong thân hàm).
- `cd apps/api && npx tsc --noEmit` exit 0.
- Chạy `node -e` giả lập: set `JWT_SECRET=x` sau khi import module, gọi `getJwtSecret()` → trả secret mới (chứng minh lazy). Ghi log lệnh + output vào report phase.

**Rủi ro cần báo lại**: nếu `socket.ts:7` import `verifyAccessToken` và có chỗ cache token giữa chừng, việc đổi secret runtime có thể làm token cũ invalid — nêu rõ trong report, không tự thêm cơ chế rotate.

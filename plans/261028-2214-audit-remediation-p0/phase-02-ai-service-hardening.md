---
phase: 2
name: ai-service-hardening
owner: backend-security
claims: [P0-3, P0-4, P1-12]
depends_on: [1]
---

# Phase 02 — Hardening ai-service

## P0-3 · Xác thực api→ai-service fail-open

**File**: `apps/ai-service/app/main.py:78-87` · `apps/ai-service/.env.example` · `apps/api/src/services/ai-client.service.ts:266-270`

Hiện trạng: `if not expected: return` → không có key thì cho qua mọi request. `userContext` lấy thẳng từ body (`main.py:253`).

**Yêu cầu**
1. `_verify_service_key`: bỏ nhánh `return` khi `expected` rỗng. Thay bằng:
   - `expected` rỗng → `HTTPException(503, {"code": "SERVICE_KEY_NOT_CONFIGURED", "message": ...})` (fail-closed).
   - có `expected` nhưng header sai/thiếu → giữ 401 `UNAUTHORIZED` như hiện tại.
2. `.env.example`: `AI_SERVICE_API_KEY=` → thêm comment bắt buộc, và một dòng `# Bắt buộc. Rỗng ⇒ service trả 503 (fail-closed).`
3. `ai-client.service.ts`: nếu `process.env.AI_SERVICE_API_KEY` rỗng thì `console.warn` **một lần** ("AI_SERVICE_API_KEY chưa set; ai-service sẽ từ chối request"). **Không** tự bịa key, không nuốt lỗi.
4. Ghi rõ trong report: `userContext` vẫn do caller khai (trust nội bộ theo service key) — đây là giảm thiểu, **không** phải fix triệt để; P1-7/P1-14 để phase 07.

**Acceptance**
- Test thủ công bằng `TestClient` hoặc `httpx` (không cần server thật): gọi `/api/v1/chat` khi `settings.ai_service_api_key == ""` → **503** `SERVICE_KEY_NOT_CONFIGURED`; khi set key mà header sai → **401**. Dán output vào report.
- `grep -n "if not expected" apps/ai-service/app/main.py` → 0 kết quả.

## P0-4 · Cache provider key theo `configVersion`

**File**: `apps/ai-service/app/llm/chain.py:79-83` (`payload_version`)

**Yêu cầu**
1. Bỏ nhánh trả `v{configVersion}`. **Luôn** hash toàn bộ payload (`sha1` trên `json.dumps(payload, sort_keys=True)`), giữ tiền tố `h`.
2. Nếu muốn giữ version để đọc log: trả `f"v{ver}-h{digest[:16]}"` khi có `configVersion`, nhưng digest **bắt buộc** tính trên toàn payload. Không được để hai payload khác nhau trùng key.
3. Không đổi TTL cache (60s) hay API của `provider_cache.get`.

**Acceptance**
- Unit test mới hoặc script kiểm chứng: hai payload cùng `configVersion` nhưng khác `providers[0].baseUrl` → `payload_version()` **khác nhau**. Dán output.
- Hai payload giống hệt → cùng key (idempotent).

## P1-12 · SSRF: `baseUrl` lấy thẳng từ request

**File**: `apps/ai-service/app/llm/openai_compatible.py:35-41` · `apps/ai-service/app/llm/base.py:86-97`

**Yêu cầu**
1. Thêm hàm validate host trong `openai_compatible.py` (hoặc module helper cùng thư mục): chỉ chấp nhận `http`/`https`; **từ chối** host là `localhost`, `*.localhost`, và IP literal thuộc loopback / private / link-local / metadata (`127.0.0.0/8`, `10/8`, `172.16/12`, `192.168/16`, `169.254/16`, `::1`, `fc00::/7`, `fe80::/10`).
2. Áp dụng ở constructor `OpenAICompatibleProvider` **và** ở `ProviderConfig.from_payload` nếu cần để lỗi trả về sớm dưới dạng `INVALID_PROVIDER_CONFIG` (đi theo đường `build_errors` sẵn có, không raise ra ngoài làm sập chain).
3. Dùng `urllib.parse.urlsplit` + `ipaddress` của stdlib. **Không** thêm dependency mới.
4. Không tự resolve DNS (ghi chú trong report: DNS rebinding vẫn ngoài phạm vi).

**Acceptance**
- Script kiểm chứng: `baseUrl` = `http://169.254.169.254/v1`, `http://127.0.0.1/v1`, `http://localhost:8080`, `file:///etc/passwd` → **bị từ chối**; `https://generativelanguage.googleapis.com/v1beta` → **được chấp nhận**. Dán output.
- `python -c "import ast;ast.parse(open(...).read())"` cho mọi file đã sửa → exit 0.

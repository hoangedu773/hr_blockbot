# Phase 05 — LLM transport + 5 bug Jev

**Mục tiêu:** chặn SSRF, bỏ monkey-patch, và làm cổng quyết định không còn tự bắn vào chân (J-1..J-6).

## File sở hữu (exclusive)

```
apps/ai-service/app/llm/openai_compatible.py     P1-12
apps/ai-service/app/llm/fake.py                  P1-15
apps/ai-service/app/llm/chain.py                 P0-4 (đã fix — chỉ verify)
apps/ai-service/app/config.py                    J-1, J-2, J-4
apps/ai-service/app/agent/jev_gateway.py         J-6
apps/api/src/services/ai-client.service.ts       J-1, J-5
```

## Việc

1. **P1-12 — SSRF qua `baseUrl`** (`openai_compatible.py`): `baseUrl` lấy từ request provider (Admin nhập)
   ⇒ gọi được `http://169.254.169.254/...` hoặc mạng nội bộ.
   - Allowlist scheme (`https` only) + chặn IP private/link-local/loopback sau khi resolve DNS
     (dùng `ipaddress`, không chỉ regex hostname).
   - Có sẵn `app/llm/url_guard.py` trong repo — **đọc trước**, dùng lại nếu đã đủ.

2. **P1-15 — monkey-patch trong `fake.py:191`**: module fake patch `AgentLoop.run` ngay lúc import và bọc
   `except: pass`. Hệ quả: import module test làm thay đổi hành vi production, và lỗi bị nuốt.
   - Chuyển sang dependency injection (truyền `FakeProvider`/planner qua constructor) hoặc `unittest.mock.patch`
     trong test. Không patch class ở import time.

3. **J-1 — hai budget 15s nối tiếp**: `apps/api` abort call ai-service ở 15s (`ai-client.service.ts:212`),
   trong khi riêng `decide()` đường pool đã có 15s (`config.py:80,116`).
   - Hạ `JEV_USEJEVAI_TIMEOUT_MS` mặc định xuống **6000**.
   - Đo lại: `python scripts/jev_gateway_live_check.py` — p95 phải < 5000ms, nếu không thì nêu rõ là chấp nhận.

4. **J-2 — `AI_DECISION_TIMEOUT_MS` là config chết** với đường pool: validate trong `load_settings()`
   rằng `jev_usejevai_timeout_ms <= decision_timeout_ms` (hoặc bỏ hẳn biến thứ hai, chọn **một**).

5. **J-4 — `.env` chỉ được `start.py` nạp**, nhưng deploy chạy `uvicorn app.main:app` (`render.yaml:106`).
   - Nạp dotenv trong `app/config.py` (trước `load_settings()`), `start.py` giữ nguyên hoặc bỏ phần trùng.
   - Kiểm: `cd apps/ai-service && uvicorn app.main:app --port 8011` → `settings.jev_usejevai_keys` phải khác rỗng.

6. **J-5 — hardcode tunnel** (`ai-client.service.ts:4-14`, fallback ở `:231-232`): `DEFAULT_GEMINI_PROVIDER`
   trỏ `https://rbnvqls.abc-tunnel.us/v1`.
   - Bỏ URL khỏi source; đọc `AI_LLM_BASE_URL`; thiếu ⇒ fail-closed với lỗi rõ ràng (không trỏ tunnel lạ).

7. **J-6 — `_POOLS` không evict** (`jev_gateway.py:71-87`): giữ tối đa 1 pool theo key hiện tại; thêm test cho
   nhánh poll trả `401`.

## Acceptance

```bash
grep -rn "abc-tunnel" apps/api/src                      # 0 kết quả
grep -rn "monkey\|AgentLoop.run =" apps/ai-service/app/llm/fake.py   # 0 kết quả
cd apps/ai-service && python -m unittest discover -s tests -p "test_jev*.py"   # 21+ pass
cd apps/ai-service && uvicorn app.main:app --port 8011 &   # keys phải nạp từ .env
python scripts/jev_gateway_live_check.py                    # 4/4 đúng, latency < 5s
cd apps/api && npx tsc --noEmit
```

- Thêm test cho `url_guard`: `http://169.254.169.254`, `http://127.0.0.1`, `https://10.0.0.5` đều bị chặn.

## Rollback

Revert commit phase 05; J-1/J-2 là config nên có thể chỉnh riêng nếu latency không đạt.

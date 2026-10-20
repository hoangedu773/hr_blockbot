# ADR-017 — LLM provider cấu hình lúc chạy (settings), không hard-code env

- **Status:** Accepted (2026-10-20)
- **Ảnh hưởng:** `02-architecture.md` §4 (biên ai-service → LLM), ADR-012, `05-data-model.md` (thêm collection), `07-auth-rbac.md` (quyền Admin)

---

## Context

`ADR-012` đã chốt có tầng `LLMProvider` abstraction nhưng chưa nói **cấu hình được ở đâu**. Trước phiên này, repo chỉ có `ATLAS_URI` trong `.env`, không có key nào, nên toàn bộ F3 bị khoá ở `403`.

Yêu cầu mới của nhóm: **Admin thêm/sửa provider ngay trên giao diện** — đổi endpoint, key, model, thứ tự fallback — không cần deploy lại.

Ba cách lưu:

| Cách | Ưu | Nhược |
|---|---|---|
| Env only | 0 collection, không secret trong DB | không có UI; đổi provider = redeploy |
| **1 collection `settings`** | có UI; đổi runtime; demo được | phải mã hoá key; thêm 1 collection |
| Collection riêng `llm_providers` | mô hình rõ cho nhiều provider | thêm collection thứ ba; vượt nhu cầu thực tế |

## Decision

Chọn **1 collection `settings`**, document `_id: "llm"`:

```text
settings
  _id           : "llm"
  configVersion : number            # tăng mỗi lần sửa, dùng làm cache key
  providers[]   : {
      id, name, type: "openai_compatible" | "gemini" | "anthropic",
      baseUrl, model, maxTokens, timeoutMs,
      priority,                     # 1 = chính
      enabled,
      keyCipher,                    # AES-256-GCM, KHÔNG BAO GIỜ trả về client
      keyHint,                      # 4 ký tự cuối để Admin nhận diện
      lastTestAt, lastTestOk, lastTestError
  }
  updatedBy, updatedAt
```

Bất biến:

1. **Key mã hoá AES-256-GCM** bằng `SETTINGS_ENCRYPTION_KEY` (32 byte base64, chỉ ở env). Mất key này thì không giải mã được — chấp nhận, vì đó là chủ đích.
2. **API không trả `keyCipher`** trong bất kỳ response nào; chỉ `keyHint`.
3. Chỉ `Admin` được đọc/ghi; mọi thay đổi ghi audit `{actor, at, changedFields, configVersion}`.
4. `ai-service` **không đọc DB**: `apps/api` giải mã rồi truyền config theo request, kèm header `x-ai-service-key`. Giữ ranh giới một chiều của `02 §5`.
5. Fallback theo `priority`; hết provider → trả `503 LLM_UNAVAILABLE`, rơi `degraded-structured` (`08 §6`).

## Consequences

- Thêm 1 collection → phải bỏ giới hạn "11 collection" (xem ADR-018).
- Có thêm endpoint Admin: `GET/PUT /api/admin/llm-providers`, `POST /api/admin/llm-providers/:id/test`.
- Test connection gửi 1 completion `max_tokens=1`; kết quả ghi `lastTestAt/lastTestOk/lastTestError`, **không** log key.
- Nếu mất `SETTINGS_ENCRYPTION_KEY`, Admin phải nhập lại key từng provider — ghi rõ trong runbook.

## Alternatives rejected

- **Env only:** trái yêu cầu UI, đổi provider phải redeploy.
- **`llm_providers` riêng:** thêm collection thứ ba cho cùng một nhu cầu; `settings` đã đủ và còn chỗ cho feature flag sau này.

---
title: "Phase 2 — API: settings, conversations, F1/F2"
status: pending
priority: P1
effort: 36h
owner: API
created: 2026-10-20
depends_on: phase-01
---

# Phase 2 — API

## Goal

Backend là nơi duy nhất được ghi DB. Phase này làm 3 khối: (a) cấu hình LLM provider có mã hoá, (b) lưu hội thoại, (c) hoàn thiện F1/F2 để dashboard không còn gọi endpoint 503.

## Preconditions

- Phase 1 xong: contracts có `LLMProviderSchema`, `ConversationSchema`, `PolicySchema`.
- Worktree: `feat/api-backend`. Không sửa `packages/contracts/**`.

## Tasks

### 1. Settings — LLM provider runtime (ADR-017)

- [ ] Model `SettingsModel` (`_id: "llm"`, `configVersion`, `providers[]`), index `_id`.
- [ ] `crypto.service.ts`: AES-256-GCM encrypt/decrypt bằng `SETTINGS_ENCRYPTION_KEY` (32 byte base64). Fail-closed nếu thiếu biến.
- [ ] `GET /api/admin/llm-providers` → trả provider **đã mask** (`keyHint`, không `keyCipher`).
- [ ] `PUT /api/admin/llm-providers` → upsert mảng, mã hoá `apiKey` mới, giữ key cũ nếu client không gửi, tăng `configVersion`, ghi audit.
- [ ] `POST /api/admin/llm-providers/:id/test` → gọi 1 completion `max_tokens=1`, trả `{ok, latencyMs, model, error}`; cập nhật `lastTestAt/lastTestOk`.
- [ ] `getActiveProviderConfig()` dùng nội bộ: giải mã, sort theo `priority`, trả mảng cho ai-service.
- [ ] Test: không log key; response không chứa `keyCipher`; sai key → 500 không lộ chuỗi.

### 2. Conversations (design/conversations-storage.md)

- [ ] Model `ConversationModel`: `userId`, `status`, `messages[]`, `messageCount`, `contextSummary`, `startedAt`, `lastMessageAt`.
- [ ] `POST /api/conversations` tạo phiên (own).
- [ ] `GET /api/conversations` (own, phân trang) + `GET /api/conversations/:id` (own-only; Admin theo scope).
- [ ] `POST /api/conversations/:id/close`.
- [ ] `appendMessage()` atomic: `findOneAndUpdate({_id, messageCount: {$lt: 50}}, {$push, $inc})`; chạm trần → 409 `CONVERSATION_FULL`, client tạo phiên mới.
- [ ] Idempotency: nếu `clientMessageId` đã có trong messages → trả message cũ, không append, không gọi AI.
- [ ] Test: trần 50, trùng id, own-only, TTL index nếu bật.

### 3. F1 — hồ sơ & duyệt field nhạy cảm

- [ ] `GET /api/employees` đã có → bổ sung filter `departmentId`, `level`, `status`, `q` theo index mới.
- [ ] `GET /api/employees/:id` own (đủ field) vs khác (allowlist) — bảo đảm không lộ phone người khác.
- [ ] `PATCH /api/employees/:id` cho field thường (`phone`, `skills`).
- [ ] `POST /api/employees/:id/change-requests` (level/hiredAt/jobTitle) → `profileChangeRequests` PENDING.
- [ ] `POST /api/employees/:id/change-requests/:reqId/review` (Admin) — chặn tự duyệt `SELF_APPROVAL`, reject bắt buộc `reason`, atomic theo design.
- [ ] Test: self-approval 403, reject thiếu reason 422, resubmit giữ `previousRequestId`, trần 20.

### 4. F2 — vòng đời đề tài

- [ ] `POST /api/projects` (DRAFT), `POST /:id/assign`, `POST /:id/transition`, `POST /:id/progress`.
- [ ] Atomic `findOneAndUpdate({_id, status, version})`; conflict → 409 `PROJECT_VERSION_CONFLICT`.
- [ ] Ghi `project_events` **sau** commit; idempotency `clientMessageId`.
- [ ] `GET /api/projects` filter `status`, `assigneeId`, `overdue` (dẫn xuất `dueDate<now AND status!=COMPLETED`).
- [ ] `POST /api/projects/:id/reports` + `POST /api/reports/:id/review` (reason bắt buộc khi REJECT).
- [ ] Socket.IO: handshake JWT, room `user:<id>` / `department:<id>`, emit sau khi lưu notification.
- [ ] Test concurrency: 2 request cùng version → đúng 1 thành công.

### 5. Dọn dẹp

- [ ] Gỡ route legacy 503 nếu không còn UI gọi (`stores`, `schedules`, `corrections`, `cash`) — hoặc giữ 503 + ghi chú.
- [ ] Chuẩn hoá `test` script để root `pnpm test` không nuốt lỗi.

## File ownership

| Ok | File |
|---|---|
| ✅ | `apps/api/**`, `apps/ai-service/app/agent/tools.py` **không** (thuộc AI) |
| ❌ | `apps/web/**`, `packages/contracts/**`, `docs/**`, `plans/**` |

## Verification

```bash
pnpm --filter @hr-blockbot/contracts build
pnpm --filter api test                 # unit + integration (isolated DB)
pnpm --filter api test:auth            # 22 test cũ phải còn pass
NODE_ENV=production pnpm --filter api test:auth   # phải fail-closed
curl -s localhost:3001/api/admin/llm-providers -H "Authorization: Bearer $ADMIN_TOKEN" | grep -c keyCipher   # = 0
```

## Acceptance

1. Admin CRUD provider chạy qua HTTP thật; response **không** chứa chuỗi key (kiểm bằng grep response).
2. Conversation chạm 50 message trả 409; gửi trùng `clientMessageId` không tạo bản ghi thứ hai.
3. F1: Employee xem hồ sơ người khác không thấy `phone`; Admin tự duyệt bị 403.
4. F2: 2 request đồng thời → 1 thắng/1 nhận 409; `project_events` không có bản ghi trùng.
5. Tất cả test cũ vẫn pass.

## Rollback

- Xoá collection `settings`/`conversations` nếu phải revert (không có dữ liệu người dùng thật trước freeze).
- Code: revert commit theo từng khối (settings / conversations / F1 / F2 tách commit).

## Không được làm

- Không gọi trực tiếp provider từ `apps/api` (chỉ test connection mới gọi 1 lần, có timeout).
- Không trả `profileChangeRequests` của người khác.
- Không bật lại route legacy nếu chưa có test.

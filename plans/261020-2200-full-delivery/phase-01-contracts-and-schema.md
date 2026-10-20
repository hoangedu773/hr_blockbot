---
title: "Phase 1 — Contracts & schema"
status: pending
priority: P1
effort: 16h
owner: PM
created: 2026-10-20
---

# Phase 1 — Contracts & schema

## Goal

Đóng băng hợp đồng cho 2 collection mới + `policies`, sửa 3 chỗ lệch tài liệu, và chuẩn bị dữ liệu vào để Phase 2–4 chạy song song mà không phải sửa contract giữa đường.

## Preconditions

- `ADR-017`, `ADR-018`, `design/conversations-storage.md`, `design/data-derivation.md` đã có trong repo.
- Không session nào được sửa `packages/contracts/**` ngoài session này.

## Tasks

### 1. Contracts (`packages/contracts/src/index.ts`)

- [ ] **Sửa lệch role**: `RagQueryRequestSchema.user_role` đang là `employee|store_manager|admin` (3 vai, trái `ADR-009`). Đổi thành `Admin|Employee`.
- [ ] Thêm `LLMProviderTypeSchema` = `openai_compatible | gemini | anthropic`.
- [ ] Thêm `LLMProviderSchema` (id, name, type, baseUrl, model, maxTokens, timeoutMs, priority, enabled, keyHint — **không có keyCipher**).
- [ ] Thêm `UpdateLLMProvidersRequestSchema` (mảng provider + `apiKey?` chỉ ghi, không đọc).
- [ ] Thêm `ProviderTestResultSchema` (`ok`, `latencyMs`, `model`, `error?`).
- [ ] Thêm `ConversationSchema` + `ConversationMessageSchema` theo `design/conversations-storage.md §1`.
- [ ] Thêm `PolicySchema` + `PolicyChunkMetaSchema` (`document`, `version`, `article`, `source`, `effectiveFrom`).
- [ ] Thêm `CitationSchema` dùng chung (hiện `RagAnswerResponse.citations` khai báo inline).
- [ ] Export type tương ứng; build ra `dist/`.

### 2. Docs đồng bộ (không để mâu thuẫn)

- [ ] `docs/06-api-spec.md`: chốt hợp đồng WS `chat:send/accepted/chunk/confirm/done/error` (hiện chỉ nằm trong `docs/21`), kèm payload tối thiểu — Phase 2 và 3 phải cùng đọc một nguồn.
- [ ] `docs/06-api-spec.md`: bảng **error code** dùng chung (`VALIDATION_FAILED`, `RBAC_DENIED`, `SELF_APPROVAL`, `CONVERSATION_FULL`, `PROJECT_VERSION_CONFLICT`, `LLM_UNAVAILABLE`, `MAX_STEPS`, `TOOL_TIMEOUT`) — tránh mỗi app tự bịa mã.
- [ ] `docs/05-data-model.md` §1.1: bỏ câu "không được thêm collection thứ 12", trỏ `ADR-018`.
- [ ] `docs/05-data-model.md` §2: thêm dòng trỏ `docs/22-erd-overall.md` (ERD mới là nguồn).
- [ ] `docs/01-requirements.md` §8 #13, #14: đổi "chờ GVHD" → "giải quyết: ADR-017/018".
- [ ] `README.md`: sửa `F2 = ca kíp` → `F2 = vòng đời đề tài` (mâu thuẫn với `00-vision-scope.md`).
- [ ] `README.md`: sửa bảng "trạng thái" — không claim dashboard chạy thật khi API đã 503.

### 3. Dữ liệu vào

- [ ] `scripts/seed/03-users.py`: 5 tài khoản demo (2 Admin, 3 Employee), Argon2id, idempotent, `--revert`. Link `employees.userId` cho đúng 5 người.
- [ ] `scripts/seed/04-provenance.py`: ghi `data_provenance` (runId, rules, codeHash sha256 của 01/02, phân bố) + `provenance-report.json`.
- [ ] `scripts/seed/05-policies.py`: ingest theo danh mục đã chốt (luật thật + quy chế tự soạn), mỗi document có `title/version/source/effectiveFrom/chunks[]`; **chưa embed** — embedding do Phase 4 làm.
- [ ] `scripts/seed/06-refresh-materialized.py`: KHÔNG làm — ghi rõ lý do vào plan evidence nếu thấy cần.

## File ownership

| Ok | File |
|---|---|
| ✅ | `packages/contracts/**`, `docs/**`, `plans/**`, `scripts/seed/**`, root `package.json` |
| ❌ | `apps/api/**`, `apps/web/**`, `apps/ai-service/**` |

## Verification

```bash
pnpm --filter @hr-blockbot/contracts typecheck
pnpm --filter @hr-blockbot/contracts build
pnpm --filter @hr-blockbot/contracts test        # phải pass toàn bộ + test mới
grep -rn "store_manager" packages/contracts/src/ || echo "OK: không còn store_manager"
grep -rn "không được thêm collection" docs/ || echo "OK: đã gỡ ràng buộc cũ"
python scripts/seed/03-users.py --dry-run
python scripts/seed/04-provenance.py
python scripts/seed/05-policies.py --dry-run
```

## Acceptance

1. `dist/` export đủ 8 schema mới; test contracts pass (số test tăng so với 17 hiện tại).
2. `grep store_manager` = 0 trong contracts.
3. `users` có 5 document, `employeeId` trỏ đúng 5 nhân sự thật, hash Argon2id verify được bằng `argon2.verify`.
4. `data_provenance` có ≥1 document với `codeHash` khớp file seed.
5. `policies` có ≥5 document, mỗi document ≥5 chunk, 100% có `source` + `version`.

## Rollback

- Contract: revert commit.
- Seed: `python scripts/seed/03-users.py --revert`; `policies` chỉ thêm mới → xoá theo `seededBy: seed-05`.

## Không được làm trong phase này

- Không sửa code API/Web/AI.
- Không tạo Atlas Vector index (Phase 4).
- Không đổi `employees` ngoài 5 field đã suy diễn.

# Phase 3 — D1: Bật PDF đính kèm cho chatbot

## Mục tiêu

Chatbot trả `attachments[0].url` trỏ tới file PDF thật; bấm tải được. 53 file PDF đã sẵn sàng trong `data/guta_rescued_pdf/` (30.3 MB, `_manifest.json` ghi đủ `fid → file → pages → bytes`).

## Hiện trạng lỗi

Chuỗi 3 điểm gãy:

1. `policies.attachments`: **0/223 document** có field này (cả hai DB).
2. `chat-authorization.service.ts:1251, 1417` hardcode `attachments: []`.
3. Route `/api/attachments/:category/:filename` chỉ serve `guta_mau_bien_ban_cho_agent` (pdf) và `guta_bo_du_lieu_chatbot/anh_tham_chieu` (images) — không serve `guta_rescued_pdf`.

UI đã sẵn sàng render (`ChatPageView.tsx:509-520`, `safeAttachmentUrl:102`).

## Files

| File | Sửa gì |
|---|---|
| `scripts/seed/13-policy-attachments.py` | **Mới** — ghi `attachments` vào `policies` từ manifest |
| `apps/api/src/routes/attachments.ts` | Thêm category `rescued_pdf` trỏ tới `data/guta_rescued_pdf` |
| `apps/api/src/services/chat-authorization.service.ts` | Thay `attachments: []` bằng attachments của document đã citation |

## Thiết kế

### 13-policy-attachments.py

1. Đọc `data/guta_rescued_pdf/_manifest.json`.
2. Match `title` trong manifest với document trong `policies` (exact match; không match → báo `UNMATCHED`, không ghi).
3. `$push attachments: [{category: "pdf", filename: "<tên file>"}]` — format khớp `authorizeAttachment` (`attachments.$elemMatch`).
4. Dry-run mặc định, `--apply`, `--revert` theo `approvalRef`.
5. Preimage backup: lưu `{id, attachments_before}` vào `data/backups/attachments-preimage-<ngày>.json` trước khi ghi.

### attachments.ts route

Thêm vào `CATEGORY_DIRS`:

```ts
rescued_pdf: path.resolve(DATA_ROOT, "guta_rescued_pdf"),
```

Thêm `rescued_pdf` vào `ALLOWED_CATEGORIES` và `ALLOWED_EXTENSIONS` (pdf). `authorizeAttachment` không cần đổi — đã check theo `category`/`filename` trong document.

### chat-authorization.service.ts

`revalidateChatAuthorization` đã verify document + ACL. Thêm: sau vòng lặp documents, lấy `document.attachments ?? []` và push vào mảng `attachments` riêng để trả về response. Cả hai đường REST (`:1251`) và streaming (`:1417`).

## Ràng buộc

- Chỉ 53 file rescued + 2 biểu mẫu cũ được deploy. Không file > 20 MB.
- `data/` gitignored → Render cần copy file vào image. Ghi trong `docs/24-deploy-runbook.md` (một dòng) hoặc thêm bước build.
- 39 cặp trùng tiêu đề: 2 bản cùng title có thể match cùng file — chấp nhận, không gây lỗi (attachments push theo document id).

## Acceptance

- Test: policy fixture có `attachments` + user có `attachments.read` → `GET /api/attachments/rescued_pdf/<file>` 200; user không có → 404/403.
- Chat test → response có `attachments[0].url` trỏ file tồn tại, `safeAttachmentUrl` chấp nhận (bắt đầu `/api/attachments/`).
- `pnpm --filter api test` xanh; `pnpm --filter web test` xanh (UI không đổi logic).

## Verify commands

```bash
pnpm --filter api build
node apps/api/test/with-memory-mongo.mjs apps/api/test/attachments-security.test.mjs apps/api/test/policy-acl.test.mjs
python scripts/seed/13-policy-attachments.py --self-check
```

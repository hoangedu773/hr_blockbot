# Chatbot service — Plan thực thi còn lại

Ngày: 2026-11-09 · Nhánh: `fix/integrate-kpi-notifications-261109` (HEAD `cb5be92` — gồm Phase A0 + A + D1-script đã commit và push)
Worktree: `C:/work-space/worktrees/hr-blockbot-f4-kpi-notifications`
Chế độ: **thực thi trực tiếp bởi agent chính, không giao subagent**

Plan cha: `plans/261109-1653-chatbot-acl-p5-wiring/plan.md` (Contract, ranh giới file, quyết định đã chốt) — plan này là bản thực thi các việc còn lại, đã chốt hết quyết định, không hỏi lại.

## Contract

**Outcome.** Chatbot gửi được PDF thật cho người dùng, citation chỉ đúng điều khoản, luồng yêu cầu điều chỉnh KPI hoàn tất được từ chat, và gợi ý câu hỏi hiển thị theo role.

**Constraints.**
- Không sửa file domain của dev song song (`revenue-kpi*.service.ts`, `performance-kpi-{scoring,evaluation,...}*.service.ts`, `task-*.service.ts`).
- Ghi dữ liệu vẫn qua `preview → confirm → execute`.
- Thay đổi DB chỉ qua script đã có `--revert`; backup preimage trước khi chạy.
- File chính thuộc quyền: `chat-authorization.service.ts`, `routes/chat.ts`, `document-authorization.service.ts` (chỉ phần citation/attachments), `KpiActionCard.tsx`, `ChatPageView.tsx`, `authorization_gateway.py`, `packages/contracts/src/*.ts` (thêm schema mới).

**Non-goals.** Bật hybrid retrieval; sửa 39 cặp trùng tiêu đề (chờ dev song song); deploy Render; P5 wiring (chờ hàm domain).

**Acceptance.** `pnpm -r typecheck`, `pnpm --filter api test` (gồm test mới), `cd apps/ai-service && python -m pytest -q` — cả ba xanh. Chat test fixture trả `attachments[0].url` trỏ file tồn tại; `citations[0].article` khác rỗng.

## State đã có trước khi bắt đầu

| Đã xong | Bằng chứng |
|---|---|
| AI service đọc đúng DB qua `MONGODB_DB_NAME` | commit `cb5be92`, `db.py::db_name()` |
| 2 văn bản pháp luật đã hạ về T1 | `hr_bot_test_363` — `Bộ luật Lao động 2019` + `Nghị định 145/2020` = T1, 9 profile |
| 53 PDF Drive đã cứu về máy | `data/guta_rescued_pdf/` — 30.3 MB + `_manifest.json` |
| Test ACL envelope | `apps/api/test/policy-acl.test.mjs` — 11 pass |
| Preimage backup | `data/backups/acl-preimage-20261109.json` (12 document) |
| Docs | `docs/27-chatbot-policy-corpus-and-pdf.md` |

## Phase 1 — B1: Ô lý do điều chỉnh KPI (lỗi thật, làm trước)

**Mục tiêu.** User yêu cầu điều chỉnh KPI qua chat → card hiện → nhập lý do → confirm → `ADJUSTMENT_REQUESTED` với `adjustment.reason` đúng.

**Files.** `apps/web/src/components/kpi-action-card.tsx`, `apps/api/src/routes/chat.ts`, `packages/contracts/src/revenue-kpi.ts`.

**Bước.**
1. Thêm textarea vào `KpiActionCard` cho `revenue_kpi.mutate_assignment` khi `args.action === 'adjustment-request'` (+ `evidenceRef`).
2. `buildDecisionBody` gửi thêm hai field.
3. Route `/chat/actions/:id/decision` merge vào args.
4. Preview trả `missingFields` để card biết hỏi.

**Verify.** Test mới: preview → confirm có reason → `ADJUSTMENT_REQUESTED`; thiếu → 400, không đổi trạng thái.

## Phase 2 — B2: Citation có `article` + `score` thật

**Mục tiêu.** Citation cho người dùng biết nội dung đến từ điều nào, không chỉ tên tài liệu.

**Files.** `apps/api/src/services/document-authorization.service.ts` (63-66, 96-147), `chat-authorization.service.ts` (1066-1082).

**Bước.**
1. `bestChunks` trả thêm `{article, score}` của chunk tốt nhất.
2. `approvedDocuments` trả kèm hai field trong result.
3. `documentReceipt` ghi vào receipt.
4. `revalidateChatAuthorization:1082` dùng `receipt.article` / `receipt.score` thay `score: 1`.
5. `ChatHistoryTurnSchema.citations` không đổi — article/score đã optional.

**Verify.** Test: chat fixture → `citations[0].article` khớp chunk top-1; `score` ∈ (0,1] và ≠ 1 khi có nhiều doc.

## Phase 3 — D1 việc 2-4: Bật PDF đính kèm

**Mục tiêu.** Chatbot trả `attachments[0].url` trỏ tới PDF thật; bấm tải được.

**Files.** `scripts/seed/13-policy-attachments.py` (mới), `apps/api/src/routes/attachments.ts`, `chat-authorization.service.ts`, `data/guta_rescued_pdf/` (đã có).

**Bước.**
1. Script `13-policy-attachments.py`: đọc `_manifest.json` → match `title` với document trong DB → `$push attachments: [{category:"pdf", filename:"<tên file>"}]`. Dry-run mặc định, `--apply`, `--revert` (theo `approvalRef`).
2. Route: thêm category dir cho thư mục rescued, hoặc copy 53 file vào `guta_mau_bien_ban_cho_agent` lúc build. Chọn: **thêm `CATEGORY_DIRS.rescued_pdf = data/guta_rescued_pdf`** (không copy, giữ nguyên nguồn).
3. `chat-authorization.service.ts:1251,1417` — thay `attachments: []` bằng `attachments` lấy từ `row.documents` (mỗi receipt có document có `attachments`).
4. Chặn file > 20 MB khỏi deploy.

**Verify.** Test: policy fixture có `attachments` + user có `attachments.read` → `GET /api/attachments/pdf/<file>` 200; chat → response có `attachments[0].url`.

## Phase 4 — D2: Gợi ý câu hỏi theo role

**Mục tiêu.** Bấm nút gợi ý nhận câu trả lời có dữ liệu thật, không "chưa có dữ liệu".

**Files.** `apps/web/src/components/chat/ChatPageView.tsx:94-98,134`.

**Bước.**
1. Thay `TOPICS` + `quickReplies` bằng bảng theo `user.authorization.profile` (4 role nhóm: staff/ptch, sm/am, hr, system_admin).
2. Mỗi câu map intent có sẵn — không câu nào cần logic mới (đã kiểm trong plan D2).

**Verify.** Test source-shape: không còn string hardcode; các prompt nằm trong map theo profile.

## Thứ tự thực thi

1 → 2 → 3 → 4 (tuần tự, cùng agent). Phase 1 và 2 độc lập về file nhưng làm tuần tự để review dễ.

## Rủi ro

- Phase 3 đổi route attachments — cần test regression cho 2 biên bản cũ.
- Phase 1 đổi contract decision body — backward compatible (field optional).
- Phase 4 chỉ client-side, không đụng API.

## Câu hỏi chưa chốt

Không còn — mọi quyết định đã chốt trong plan cha.

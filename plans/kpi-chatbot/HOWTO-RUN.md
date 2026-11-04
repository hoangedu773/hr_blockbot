# HOWTO — Chạy các plan KPI chatbot đúng thứ tự

## Bối cảnh

Worktree này (`D:/HRBlockbot-private/releases/revenue-chat-preview-20261104/source`, branch `feat/revenue-kpi-chat-preview`) chứa code **P0 + P1 đã hoàn thiện** cùng các plan cho P2–P6. Mỗi plan là một spec cho AI khác (hoặc phiên mới) triển khai; sau khi AI trả diff, người review đối chiếu test list và checklist.

## Điều kiện trước khi chạy bất kỳ plan nào

1. **Checkout đúng worktree** — `D:/HRBlockbot-private/releases/revenue-chat-preview-20261104/source`. Không sửa ở `C:` (stale) và không sửa `D:` release khác.
2. **Checkout từ branch này** — mỗi plan cắt branch con từ `feat/revenue-kpi-chat-preview`, không từ `main` hay `deploy`.
3. **Đọc 3 file này trước:**
   - `plans/kpi-chatbot/00-MASTER-ROADMAP.md` — quy tắc chung
   - `plans/kpi-chatbot/P0-P1-done/` — code mẫu để tham chiếu
   - File plan cụ thể sắp làm
4. **Không deploy, không seed, không merge, không commit** cho đến khi chủ dự án nói rõ.

## Thứ tự bắt buộc

```
P0 ✅ (xong) ──▶ P1 ✅ (xong) ──▶ P2 ──▶ P3 ──▶ P4 ──▶ P5 ──▶ P6
```

### Bước 1 — Giao P2 (đọc + pending)

Đọc `P2-revenue-read-pending.md`. Branch đề xuất: `feat/revenue-kpi-chat-read`.

- AI làm: thêm `get_my_revenue_kpi`, `get_revenue_kpi_detail`, `list_my_pending_actions`, `get_my_tasks` tool read + schema + service + routes + test.
- AI **không** thêm action tool.
- Review checklist:
  - Pending derive từ entity state, không từ `readAt`.
  - Severity đúng: `URGENT` cho quá hạn, `ACTION_REQUIRED` cho việc cần làm, `INFO` cho thông báo.
  - RBAC: SM thấy của mình, AM thấy verify, HR thấy decide/close.
  - Test đếm DB = 0 sau preview.
- Test phải qua: `npm run test:revenue-kpi` (các file liên quan) + contract tests.

### Bước 2 — Giao P3 (assignment actions)

Đọc `P3-revenue-assignment-actions.md`. Branch đề xuất: `feat/revenue-kpi-chat-assignment`.

- Đổi tên collection `revenue_kpi_open_actions` → `chat_action_proposals` nếu chưa có migration (hoặc dùng type field để phân biệt).
- AI làm: `previewRevenueAssignmentAction`, `decideChatAction` (tổng quát hoá `decideRevenueKpiOpenAction`), tool `preview_revenue_assignment_action`, routes, contract.
- Map đúng capability 1:1 với `mutateRevenueKpiAssignment`.
- Review checklist:
  - Owner/security/authority/expiry re-check.
  - `expectedVersion` + `planDigest` kèm assignment.
  - AREA derive check trên publish/ADJUST/APPROVE.
  - Repeat confirm → stored result.
- Test phải qua: mọi `revenue-kpi*` test + authorization-chat.

### Bước 3 — Giao P4 (compute + result + close)

Đọc `P4-revenue-result-lifecycle.md`. Branch đề xuất: `feat/revenue-kpi-chat-results`.

- AI làm: preview/execute cho compute, miss-reason, review-reason, confirm, correct, close.
- Review checklist:
  - Compute preview chạy `calculateRevenueKpi` nhưng không `appendResult`.
  - `confirm` chặn `PERIOD_NOT_READY`, thiếu reason review, thiếu `actualRevenueVnd`.
  - `correct` chỉ sau `CLOSED` và `CONFIRMED`.
  - `close` chặn khi còn result chưa confirm.
- Test phải qua: mọi revenue test + lifecycle.

### Bước 4 — Giao P5 (HR assign + Performance actions)

Đọc `P5-hr-assign-performance-actions.md`. Branch đề xuất: `feat/kpi-chat-performance` (có thể tách 5a/5b).

- AI làm: HR assign single/bulk preview+confirm; Performance open_period + task + score + reconsideration + appeal proposals.
- Review checklist:
  - Bulk assign **luôn** preview trước, không ghi ngay.
  - `task.assign`/`task.evaluate` không cho model chọn điểm.
  - Performance state machine đúng (`PROVISIONAL` → `PENDING_DISPUTE` → `FINAL`).
  - Mọi score qua service hiện có, không bypass.
- Test phải qua: `performance-kpi-*` suites + revenue (không regression).

### Bước 5 — Giao P6 (notifications + suitability)

Đọc `P6-notifications-suitability.md`. Branch đề xuất: `feat/kpi-chat-notifications`.

- AI làm: sửa `flushRevenueKpiNotices` thêm AM recipient cho adjustment-request; thêm `severity` và `actionRef` vào notification; `suggest_suitable_candidates` deterministic.
- Review checklist:
  - AM nhận `ACTION_REQUIRED` khi SM gửi adjustment-request.
  - Pending list severity khớp notification severity.
  - Suitability: deterministic, có reasons, không sensitive attrs, không auto-assign, không phạt KPI thấp.
- Test phải qua: revenue + performance + notification tests.

## Checklist chung mọi plan

- [ ] Preview zero Mongo write (assert document count).
- [ ] Confirm re-check owner, capability, securityVersion, authorityHash, expiry, entity version, planDigest.
- [ ] Terminal outcome idempotent by actionId.
- [ ] Crash recovery qua leaseUntil.
- [ ] Partial success trả per-item result.
- [ ] Retry không tạo trùng (deterministic id + unique index + replay).
- [ ] AREA = Σ STORE.
- [ ] RBAC 1:1 với service hiện có, không bypass.
- [ ] `list_my_pending_actions` derive từ entity.
- [ ] REST + Socket cùng executor.
- [ ] Model không được nói "đã tạo" trước `EXECUTED`.
- [ ] Lịch sử chat re-hydrate action sau reload.
- [ ] Build contracts/api/web pass, test pass.
- [ ] Không commit/deploy/merge/seed.

## Lệnh build/test thường dùng

```bash
# Contracts
cd packages/contracts && npm test

# API revenue suite
cd apps/api && npm run test:revenue-kpi

# API performance suite
cd apps/api && npm run test:performance-kpi

# API auth/chat gateway
cd apps/api && npm run test:authorization-v1

# Web typecheck + build
cd apps/web && npm run typecheck && npm run build

# AI service
cd apps/ai-service && python -m pytest -q
```

## Khi có lỗi trong phase trước

- Nếu P1 có bug phát hiện khi làm P2: **sửa trong branch con của plan đó** (không sửa trực tiếp lên `feat/revenue-kpi-chat-preview` nếu branch này đang được dùng làm base). Báo lại để review.
- Nếu một phase cần thay đổi P0 (proposal model): trao đổi trước khi sửa, vì P0 là nền chung.

## Giao AI khác

Gửi **toàn bộ thư mục `plans/kpi-chatbot/`** + branch này. Bảo AI đọc `00-MASTER-ROADMAP.md` trước, rồi file plan cụ thể. Sau khi AI trả diff + test output, gửi lại đây để review theo checklist.

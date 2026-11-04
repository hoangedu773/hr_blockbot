# KPI Chatbot — Master Roadmap

## Mục tiêu cuối cùng

Chatbot (cả REST và Socket) làm được **mọi thao tác KPI mà Web UI làm được**, cho cả hai module:

- **Revenue KPI** — giao/điều chỉnh/chấp nhận KPI doanh thu cấp cửa hàng và khu vực.
- **Performance KPI** — KPI cá nhân theo khung đánh giá (task, evidence, score, dispute, appeal).

Mọi thao tác ghi dữ liệu đều theo một chuẩn duy nhất:

```
read → preview/proposal → user xác nhận → server execute → audit + notify
```

Model AI **không bao giờ** ghi trực tiếp. Model chỉ: đọc context, lập/cầu preview, giải thích. Server là nơi duy nhất được khẳng định "đã tạo/đã ghi".

## Trạng thái hiện tại (đã làm xong)

| Phase | Trạng thái | Ghi chú |
|---|---|---|
| **P0** — Nền tảng confirm | ✅ Xong (trong branch này) | `revenue_kpi_open_actions` server-side: owner, securityVersion, authorityHash, expiresAt (10'), leaseUntil (60s), purgeAt (TTL 7 ngày). REST + Socket dùng chung `decideRevenueKpiOpenAction`. Terminal outcomes idempotent theo actionId. Crash recovery qua lease. |
| **P1** — Revenue open preview→confirm | ✅ Xong (trong branch này) | `open-preview` (read-only) + `open-proposal` + `/chat/actions/:id/decision`. Option A: mở kỳ + tạo draft hợp lệ, báo created/skipped/blocked/failed từng mục, retry không trùng. Legacy `/open` = 410 trừ khi `REVENUE_KPI_LEGACY_OPEN=true`. |
| **P2** — Revenue read + pending actions | ⬜ Chưa làm | `get_my_revenue_kpi`, `list_my_pending_actions`, `get_my_tasks`. Pending suy từ entity state, không từ `readAt`. Phân loại INFO/ACTION_REQUIRED/URGENT. |
| **P3** — Revenue assignment actions | ⬜ Chưa làm | publish, accept, refuse, hr-decision, adjustment-request, adjustment-verify, adjustment-decision, responsibility. |
| **P4** — Revenue result lifecycle | ⬜ Chưa làm | compute, miss-reason, review-reason, confirm, correct, close. |
| **P5** — HR assign + Performance actions | ⬜ Chưa làm | HR assign đơn lẻ/bulk/AI-suggestion (bulk preview+confirm). Performance task assign/accept/submit/evaluate, reconsideration, appeal. |
| **P6** — Notifications + task suitability | ⬜ Chưa làm | Sửa gap AM không nhận adjustment notice. "Ai phù hợp task" deterministic, explainable, advisory-only. |

## Kiến trúc nền tảng đã chốt (dùng chung cho mọi phase)

### Server-owned proposal (P0)

- Collection `revenue_kpi_open_actions` (đổi tên tổng quát `chat_action_proposals` khi mở rộng sang action khác — xem P3):
  - `_id`: opaque UUID (actionId).
  - `ownerId`, `securityVersion`, `authorityHash` — bind action với user + quyền tại thời điểm tạo.
  - `type` — loại action (`revenue_kpi.open_period`, `revenue_kpi.mutate_assignment`, `performance_kpi.mutate`, …).
  - `preview` / `args` — dữ liệu đã validate sẵn (read-only planner).
  - `status`: `PENDING | CONFIRMED | CANCELLED | EXECUTED | EXPIRED | FAILED`.
  - `expiresAt` (10'), `leaseUntil` (60s), `purgeAt` (TTL 7 ngày cho action chưa quyết).
  - `decisionHash`, `result` — idempotent replay.

- Executor chung (một hàm duy nhất, dùng cho cả REST và Socket):
  - Re-check owner + securityVersion + authorityHash.
  - Re-check entity version + planDigest → 409 kèm preview mới nếu đổi.
  - Chạy service domain hiện có (không bypass).
  - Trả kết quả đã lưu cho duplicate confirm.

### Chatbot V1 path (không dùng legacy `app/agent/tools.py` Mongo runtime)

```
web REST /chat ──▶ api authorizedChat ──▶ ai-service authorization_gateway
web Socket chat:send/confirm ──▶ api socket.ts ──▶ cùng executor
```

- AI service gọi tool qua `/internal/authorization/tools` (scoped, delegationToken 90s).
- Tool chỉ READ hoặc READ-then-PROPOSE. Không có tool write trực tiếp.
- Preview tool tạo server proposal (`executed:false`); decision đi qua user action, không phải tool của model.

## Quy tắc chung bắt buộc

1. **Preview không ghi DB** — assert bằng document count trong test.
2. **Confirm re-check đầy đủ** — owner, capability, security version, authority hash, entity version, planDigest, expiry.
3. **Partial success được phép** — trả kết quả từng mục; không nuốt lỗi; không rollback toàn bộ cho lỗi cục bộ.
4. **Retry an toàn** — deterministic id + unique index + request replay + duplicate-key map sang skipped.
5. **AREA = Σ STORE** — bất biến, không được lệch.
6. **Pending list derive từ entity state** — không dùng `readAt` của notification làm trạng thái công việc.
7. **Không deploy/seed/merge/commit** khi chưa được chủ dự án yêu cầu.
8. **Không đụng** F5 `evaluations` legacy, payroll, Main deploy.
9. Test chỉ với **in-memory Mongo** do test sở hữu (`test/with-memory-mongo.mjs`).

## Thứ tự triển khai bắt buộc

```
P0 ✅ ──▶ P1 ✅ ──▶ P2 ──▶ P3 ──▶ P4 ──▶ P5 ──▶ P6
```

- P2 trước P3: read tools là nền cho mọi action sau.
- P3 trước P4: assignment lifecycle trước result lifecycle.
- P5 sau P3+P4: cùng pattern, áp dụng cho Performance và HR assign.
- P6 cuối: notification gap + advisory suy ra từ dữ liệu đã ổn.

Chi tiết xem `HOWTO-RUN.md`.

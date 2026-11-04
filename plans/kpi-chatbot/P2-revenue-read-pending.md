# P2 — Revenue KPI: đọc + danh sách chờ xử lý

## Mục tiêu

Cho phép chatbot và Web đọc KPI doanh thu của chính mình và nhận danh sách việc cần xử lý, **derive từ entity state** — không dùng `readAt` của notification.

## Phạm vi file

- `packages/contracts/src/revenue-kpi.ts` — thêm schema read/pending.
- `apps/api/src/services/revenue-kpi.service.ts` — `getMyRevenueKpi`, `getRevenueKpiDetail`, `listMyPendingActions`.
- `apps/api/src/services/chat-authorization.service.ts` — allowlist tool mới.
- `apps/api/src/routes/revenue-kpi.ts` — endpoint read.
- `apps/ai-service/app/authorization_gateway.py` — gọi tool đọc mới.
- `apps/web/src/...` — card pending actions trong chat/Web.
- Test mới trong `apps/api/test/`.

## Tools mới (V1 gateway, read-only)

| Tool | Role | Trả về |
|---|---|---|
| `get_my_revenue_kpi` | SM, AM, HR | KPI đang giao cho mình trong kỳ: status, target, deadline, result mới nhất |
| `get_revenue_kpi_detail` | theo scope | Chi tiết một assignment + result + history công khai trong scope |
| `list_my_pending_actions` | SM, AM, HR | Danh sách `ACTION_REQUIRED`/`URGENT`/`INFO` derive từ entity |
| `get_my_tasks` | mọi role | Task đang giao (Performance) — tách từ pending KPI |

### `list_my_pending_actions` — nguồn dữ liệu (không dùng `readAt`)

| Entity | Trạng thái | Loại | Ai cần xử lý |
|---|---|---|---|
| `RevenueKpiAssignment` | `PENDING_ACCEPTANCE` và `assigneeEmployeeId === me` | `ACTION_REQUIRED` | SM/AM |
| `RevenueKpiAssignment` | `PENDING_ACCEPTANCE` và `deadlineAt < now` | `URGENT` | SM/AM |
| `RevenueKpiAssignment` | `ADJUSTMENT_REQUESTED` và `adjustment.status === 'PENDING'` và `unitType === 'STORE'` | `ACTION_REQUIRED` | AM (verify) |
| `RevenueKpiAssignment` | `ADJUSTMENT_REQUESTED` và `adjustment.status === 'VERIFIED'` hoặc `unitType === 'AREA'` | `ACTION_REQUIRED` | HR (decide) |
| `RevenueKpiResult` | `AWAITING_REASON` và `achieved === false` | `ACTION_REQUIRED` | SM |
| `RevenueKpiResult` | `COMPUTED` và `missReason.reviewDecision === null` | `ACTION_REQUIRED` | HR |
| `RevenueKpiResult` | `COMPUTED`/`AWAITING_REASON` sau `period.end` | `ACTION_REQUIRED` | HR (confirm) |
| `RevenueKpiPeriod` | `OPEN` quá hạn đóng | `URGENT` | HR |
| `Notification` | `readAt === null` | `INFO` | mọi user |

Schema output:

```ts
RevenueKpiPendingActionSchema = z.object({
  kind: z.enum(['acceptance', 'adjustment_verify', 'adjustment_decision',
                'miss_reason', 'reason_review', 'result_confirm',
                'period_close', 'info']),
  severity: z.enum(['INFO', 'ACTION_REQUIRED', 'URGENT']),
  entityKind: z.enum(['period', 'assignment', 'result', 'notification']),
  entityId: z.string(),
  period: RevenueKpiMonthSchema.optional(),
  label: z.string(),          // "KPI cửa hàng Guta 12 · Chờ xác nhận"
  message: z.string().nullable(),
  deadlineAt: z.string().datetime().nullable(),
  proposedActionId: z.string().nullable(), // điền bởi P3 khi action tool có sẵn
  deeplink: z.string().nullable(),         // UI path để mở trang đúng
})
```

- Danh sách sắp xếp: `URGENT` → `ACTION_REQUIRED` → `INFO`; cùng severity thì `deadlineAt` tăng dần.
- Giới hạn mặc định 50, có thể phân trang.
- **Không đọc `Notification.readAt` để quyết định** có còn việc không; chỉ dùng `readAt` để style badge.

## Endpoint REST (Web dùng chung)

```
GET /api/revenue-kpi/me/pending
GET /api/revenue-kpi/me/assignments?period=2026-11
GET /api/revenue-kpi/assignments/:id   // read detail, giữ canRead cũ
```

Không tạo endpoint mới cho tool — chatbot tool cũng gọi chung service.

## Chatbot prompt rule

- Khi `list_my_pending_actions` trả rỗng → "Bạn không còn việc nào cần xử lý."
- Khi có `ACTION_REQUIRED` → liệt kê tối đa 5 + nói có thể hỏi "làm gì với KPI đó".
- Không gọi action tool ở P2 — action tool xuất hiện ở P3.

## Test bắt buộc

- `list_my_pending_actions` trả đúng loại/severity theo trạng thái entity.
- `readAt` của notification không ảnh hưởng danh sách.
- SM chỉ thấy assignment của mình; AM thấy verify; HR thấy decide/close.
- `get_my_revenue_kpi` của user không có KPI trả `available:false`, không 500.
- `list_projects`/pending từ P1 vẫn giữ.

## Không làm trong P2

- Không thêm action tool (thuộc P3+).
- Không sửa `flushRevenueKpiNotices` (thuộc P6).
- Không đụng Performance KPI actions (thuộc P5).

# P3 — Revenue KPI: assignment actions qua chat

## Mục tiêu

Cho phép chatbot/Web thực thi mọi transition assignment hiện có qua cùng một proposal → confirm → execute, đúng RBAC.

## Phạm vi action

Map 1:1 với `mutateRevenueKpiAssignment` (không bypass):

| Action | Actor | Capability |
|---|---|---|
| `publish` | HR | `revenue_kpi.assign` |
| `accept` | SM/AM (assignee) | `revenue_kpi.respond` (self) |
| `refuse` | SM/AM | `revenue_kpi.respond` |
| `hr-decision` KEEP/ADJUST/CANCEL | HR | `revenue_kpi.approve` / `assign` |
| `adjustment-request` | SM | `revenue_kpi.request_adjustment` |
| `adjustment-verify` | AM | `revenue_kpi.verify_adjustment` |
| `adjustment-decision` APPROVE/REJECT | HR | `revenue_kpi.approve` |
| `responsibility` | HR | `revenue_kpi.assign` |

Mỗi action được bọc thành một **server proposal** (mở rộng collection `revenue_kpi_open_actions` → rename ý nghĩa `chat_action_proposals`):

```
type = 'revenue_kpi.mutate_assignment'
args = { assignmentId, action, expectedVersion, planDigest, reason?, evidenceRef?, newTarget?, force? }
preview = { summary: 'Phát hành KPI của Guta 12 → SM chờ xác nhận trong 3 ngày làm việc', impact: {...} }
```

## Preview cho từng action (read-only)

`previewRevenueAssignmentAction(user, assignmentId, action, args)`:

- Load assignment + period, check `canRead`/`requireCapability` như mutate.
- Không ghi.
- Trả `expectedVersion`, `planDigest` (digest của assignment + input + relevant catalog/derived state), summary text an toàn để hiển thị, danh sách tác động (status sẽ đổi, deadline sẽ set, target mới, parent AREA cần re-derive).
- Với `publish` hoặc `hr-decision`/`adjustment-decision` trên AREA: gọi `assertAreaTargetDerived` trong preview để hiển thị cảnh báo trước khi confirm.
- Với `adjustment-request`: báo AM sẽ nhận thông báo (sau khi P6 fix notification gap).

## Confirm/execute

- `decideChatAction(user, actionId, { approve, clientRequestId, expectedVersion, planDigest })` — tổng quát hoá từ `decideRevenueKpiOpenAction`.
- Re-check owner/security/authority, status, expiry, version + planDigest.
- Gọi `mutateRevenueKpiAssignment` đúng schema (không bypass).
- Trả action với `result.assignment` cập nhật.

## Tool surface cho AI service

| Tool | Kind | Hành vi |
|---|---|---|
| `preview_revenue_assignment_action` | read + propose | Trả `{ actionId, type, preview, requiresConfirmation: true, executed: false }` |
| `decide_chat_action` (user action, không phải tool model) | write | Qua `/chat/actions/:id/decision` |

AI service không bao giờ được gọi `decide` trực tiếp; decision đi qua user click/REST/Socket.

## Chat prompt

- "Bạn muốn chấp nhận KPI này không?" → tool preview `accept`, card Confirm.
- Sau confirm → card kết quả với status mới + next action gợi ý từ `list_my_pending_actions`.
- Model không được phép trả lời "đã chấp nhận" nếu chưa `EXECUTED`.

## Test bắt buộc

- Preview accept/refuse không đổi DB.
- Confirm accept đúng assignee (SM) và đúng capability.
- Confirm refuse từ HR bị chặn (`own()`).
- Confirm hr-decision ADJUST trên AREA bị `assertAreaTargetDerived` chặn nếu mục tiêu lệch.
- Confirm adjustment-request của SM → status `ADJUSTMENT_REQUESTED`, `adjustment.status === 'PENDING'`.
- Confirm adjustment-verify của AM → `VERIFIED`.
- Confirm adjustment-decision APPROVE của HR → PENDING_ACCEPTANCE + retarget.
- Confirm responsibility chuyển đúng người.
- Repeat confirm trả stored result, không ghi thêm.
- Stale assignment version → `PLAN_CHANGED`.
- Action của user A không confirm bởi user B (404 owner).
- Lịch sử chat re-hydrate action sau reload.

## Không làm

- Compute/close/result actions (P4).
- HR assign/create assignment (P5).
- AM notification fix (P6).

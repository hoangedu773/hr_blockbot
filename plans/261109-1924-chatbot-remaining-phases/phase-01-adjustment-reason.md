# Phase 1 — B1: Ô lý do điều chỉnh KPI

## Mục tiêu

User yêu cầu điều chỉnh KPI doanh thu qua chat → card hiện → nhập lý do → confirm → assignment chuyển `ADJUSTMENT_REQUESTED` với `adjustment.reason` đúng.

## Files

| File | Sửa gì |
|---|---|
| `apps/web/src/components/kpi-action-card.tsx` | Thêm textarea cho `reason` + input cho `evidenceRef` khi `args.action === 'adjustment-request'` |
| `apps/api/src/routes/chat.ts` | Route `/chat/actions/:id/decision` merge `reason`/`evidenceRef` từ body vào args trước khi gọi executor |
| `packages/contracts/src/revenue-kpi.ts` | (nếu cần) mở rộng schema decision body với field optional |

## Hiện trạng lỗi

`preview_revenue_assignment_action` được gateway gọi chỉ với `{assignmentId, action}` (`authorization_gateway.py:353-358`). Preview chấp nhận vì `RevenueKpiAssignmentActionArgsSchema` để `reason`/`evidenceRef` optional (`revenue-kpi.ts:226-227`). Execute parse bằng `RevenueKpiAdjustmentRequestSchema` bắt buộc cả hai (`revenue-kpi.ts:58-60`, `revenue-kpi.service.ts:1039`) → `VALIDATION_FAILED`. `KpiActionCard` không có input nào để bổ sung (`buildDecisionBody` chỉ gửi `approve/clientRequestId/expectedVersion/planDigest`, `:49-95`).

## Thiết kế

### KpiActionCard.tsx

Thêm state `reason` (string), `evidenceRef` (string). Khi `action.type === 'revenue_kpi.mutate_assignment' && action.args.action === 'adjustment-request'`:

- Textarea `reason` (min 5 ký tự, max 2000) với label "Lý do yêu cầu điều chỉnh".
- Input `evidenceRef` (min 5 ký tự) với label "Bằng chứng (link hoặc mã tài liệu)".
- Nút Xác nhận disabled khi thiếu một trong hai.
- Truyền vào `buildDecisionBody(action, approve, clientRequestId, { reason, evidenceRef })`.

### buildDecisionBody

Thêm tham số `extra: Record<string, unknown>`, spread vào return:

```ts
return { approve: true, clientRequestId, expectedVersion, planDigest, ...extra };
```

### routes/chat.ts `/chat/actions/:id/decision`

Body đã parse qua `ChatActionDecisionSchema` (kiểm tên schema thật trong file). Merge `reason`/`evidenceRef` vào args trước khi gọi `decideChatAction` — executor sẽ forward vào `mutateRevenueKpiAssignment` qua dòng `...(args.reason !== undefined ? { reason: args.reason } : {})` (`revenue-kpi.service.ts:975-976`).

## Acceptance

- Test API mới: preview `adjustment-request` → confirm kèm `reason` + `evidenceRef` → assignment `ADJUSTMENT_REQUESTED`, `adjustment.reason` đúng.
- Confirm thiếu `reason` → 400 `VALIDATION_FAILED`, trạng thái không đổi.
- UI: nút Xác nhận disabled khi `reason` rỗng hoặc < 5 ký tự.

## Verify commands

```bash
pnpm --filter api test -- test/policy-acl.test.mjs test/authorization-chat-v1.test.mjs
pnpm --filter web test -- test/web-integration.source-shape.test.mjs
```

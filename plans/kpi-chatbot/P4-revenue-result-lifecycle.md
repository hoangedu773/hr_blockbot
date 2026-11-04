# P4 — Revenue KPI: compute + result + close qua chat

## Mục tiêu

Cho phép chatbot/Web thực thi vòng đời kết quả: compute kỳ, miss-reason, review, confirm, correct, close — theo đúng proposal→confirm.

## Phạm vi action

| Action | Actor | Endpoint hiện tại |
|---|---|---|
| `compute` | HR | `POST /periods/:period/compute` |
| `miss-reason` | SM (assignee) | `POST /results/:id/miss-reason` |
| `review-reason` | HR | `POST /results/:id/review-reason` |
| `confirm` (result) | HR | `POST /results/:id/confirm` |
| `correct` (post-close) | HR | `POST /results/:id/correct` |
| `close` (period) | HR | `POST /periods/:period/close` |

## Read tool trước

- `get_revenue_kpi_result` — xem result của một assignment + history.

## Preview per action

`previewRevenueKpiAction(user, kind, targetId, args)`:

- `compute`: chạy `calculateRevenueKpi` trên từng ACTIVE assignment trong kỳ, **không ghi**; trả danh sách kết quả dự kiến từng assignment (`actualVnd`, `achieved`, `pendingReasons`, `status` sẽ gán), `planDigest` gồm period version + ordered digest của từng result-to-be.
- `miss-reason`: trả nội dung sẽ lưu + assignment info; không cần plan phức tạp.
- `review-reason`: trả decision + note + result version hiện tại.
- `confirm`: trả điều kiện đủ/thiếu (`actualRevenueVnd !== null`, `missReason.reviewDecision`, `waiveReason` có hay không) + sẽ thành `CONFIRMED` hay không.
- `correct`: chạy lại `calculateRevenueKpi` và báo sẽ tạo bản `CORRECTED` với số mới.
- `close`: trả điều kiện đủ/thiếu (mọi assignment ACTIVE + result CONFIRMED + assignmentVersion khớp) + danh sách còn thiếu; không ghi.

## Execute

- `compute`: giữ hành vi hiện tại — tạo bản result mới từng assignment, partial, trả `created/skipped/failed` từng một; `planDigest` kiểm trước.
- `miss-reason`/`review-reason`/`confirm`/`correct`: gọi `mutateRevenueKpiResult` sau re-check `expectedVersion`.
- `close`: giữ hành vi hiện tại; trả `{ closed: [...], blocked: [...] }`.

## Test bắt buộc

- Compute preview không ghi result.
- Compute execute tạo result đúng `dataKind`, không duplicate khi retry.
- Miss-reason chỉ khi `achieved === false` và status phù hợp.
- Review-reason yêu cầu `missReason` hiện có và `COMPUTED`.
- Confirm block nếu chưa hết tháng (`PERIOD_NOT_READY`), thiếu `actualRevenueVnd`, hoặc chưa review và không `waiveReason`.
- Correct chỉ sau `CLOSED` và từ `CONFIRMED`.
- Close block khi còn result chưa confirm.
- Stale period/assignment version → `PLAN_CHANGED`.
- Chat: `confirm` result cho assignment không phải của mình → RBAC deny.

## Không làm

- HR assign/create assignment (P5).
- Performance lifecycle (P5).
- Notification (P6).

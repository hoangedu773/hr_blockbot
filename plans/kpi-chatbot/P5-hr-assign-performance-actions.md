# P5 — HR assign KPI + Performance KPI actions qua chat

## P5a — HR assign (Revenue)

Mở rộng proposal pattern cho `saveRevenueKpiAssignment` (draft tạo/sửa) và `createRevenueKpiPeriod`.

### Actions

| Action | Ghi chú |
|---|---|
| `create_period` | Tạo kỳ DRAFT với policy; cần preview vì bulk sau này |
| `save_assignment` (single) | Tạo/sửa draft STORE/AREA |
| `save_assignment` (bulk) | Gán cùng targetMode/growth cho nhiều cửa hàng — **bulk phải preview** |
| `ai_suggest_target` | Chỉ generate `aiProposal` metadata trên draft (đã có); chat chỉ hiển thị |

### Preview

- `create_period`: hiển thị policy cuối cùng sẽ lưu, không ghi.
- `save_assignment` single: gọi `buildDraft` trên input, hiển thị assignee, target, basePeriod; không ghi.
- `save_assignment` bulk: chạy `buildDraft` trên **từng** cửa hàng trong scope; trả `willCreate`, `willSkip` (đã có draft), `blocked` (lý do), `planDigest` trên toàn bộ danh sách; **không bao giờ ghi 37 draft ngay**.

### Execute bulk

Mỗi item độc lập: `created` / `skipped` / `blocked` / `failed`. Retry chỉ các item thất bại. Duplicate 11000 → `skipped`.

## P5b — Performance KPI actions

Module Performance (`performance-kpi-*.service.ts`) có vòng đời phức tạp hơn; mở rộng cùng pattern.

### Actions map

| Domain action | Service hiện tại |
|---|---|
| `open_period` | `openPerformancePeriod` |
| `task.assign` | task service assign |
| `task.accept` | assignee accept |
| `task.submit` | assignee submit evidence |
| `task.evaluate` | evaluator score task |
| `evaluation.score` | manager score criteria |
| `reconsideration.request` | employee dispute |
| `reconsideration.response` | manager decide |
| `appeal.request` | employee appeal |
| `appeal.decision` | HR/AM decide |

### Preview

- `open_period`: như Revenue — preview employees sẽ tạo evaluation, blocked khi thiếu policy/framework.
- `task.assign`: preview task title, weight, assignee, dueAt, rubric; kiểm `allowTaskRefusal` và employee active.
- `task.evaluate`/`evaluation.score`: preview score, weight redistribution, evidence refs; kiểm evaluator capability.
- `reconsideration`/`appeal`: hiển thị criterion/task bị tranh chấp, deadline, sẽ chuyển trạng thái gì.

### Quy tắc nghiêm ngặt

- Không để model chọn điểm số; model chỉ diễn giải preview.
- Mọi score/evaluate đều qua service hiện có (có history + version).
- Bulk `open_period` và bulk `task.assign` đều preview + confirm.

## Contracts mở rộng

Thêm `PerformanceKpiActionPreviewSchema` và `PerformanceKpiActionResultSchema` tương tự Revenue, hoặc tổng quát hoá `ChatActionPreview`/`ChatActionResult` chung cho cả hai module (khuyên: union `type`).

## Test bắt buộc

- Preview `open_period` không tạo evaluation.
- Bulk assign preview trả `willCreate`/`blocked` đúng.
- Task assign → accept → submit → evaluate luồng đầy đủ qua proposal.
- Reconsideration chỉ khi `PROVISIONAL`; appeal chỉ sau reconsideration.
- Score vượt trọng số / sai role bị chặn.
- `get_my_kpi` v2 (đã có) vẫn hoạt động.

## Không làm

- AI "ai phù hợp task" (P6).
- Notification gap AM (P6).

# P6 — Notifications phân loại + "ai phù hợp task"

## P6a — Sửa gap notification AM

### Hiện tại

`flushRevenueKpiNotices` (notification.service.ts) chỉ notify owner (assignee) + HR. Khi SM gửi `adjustment-request`, **AM — người phải verify — không nhận thông báo**.

### Chuỗi đúng

```
SM ──adjustment-request──▶ AM verify ──▶ HR decide ──▶ SM re-accept
        (AREA: AM ──▶ HR trực tiếp)
        (refuse: SM ──▶ HR trực tiếp)
```

### Việc cần làm

- `flushRevenueKpiNotices(assignmentId)` trên `adjustment-request` phải thêm recipient là **AM có scope đọc cửa hàng đó** (resolve qua `capStores`/`allowedStoreIds` trên `revenue_kpi.verify_adjustment` hoặc `read_scope`).
- Kèm `revenueType` phân loại:
  - `revenue_kpi_adjustment_requested` → AM + HR, severity `ACTION_REQUIRED`.
  - `revenue_kpi_adjustment_verified` → HR, `ACTION_REQUIRED`.
  - `revenue_kpi_adjustment_decided` → SM (requester) + AM, `INFO`.
  - `revenue_kpi_acceptance_overdue` → SM/AM, `URGENT`.
  - `revenue_kpi_period_closing` → HR, `URGENT`.
- Notification schema: thêm `severity` (INFO/ACTION_REQUIRED/URGENT) và `actionRef` (id để deep-link vào pending action).

### Pending list (liên quan P2)

`list_my_pending_actions` đã derive từ entity. Notification chỉ là mirror cho đọc; `readAt` không ảnh hưởng pending.

## P6b — "Ai phù hợp task này" (advisory)

### Yêu cầu đã chốt

- Deterministic (cùng input → cùng output), không dùng LLM suy đoán.
- Giải thích được: trả lý do từng ứng viên.
- Advisory only — HR vẫn chọn; không auto-assign.
- Không dùng sensitive attributes (giới tính, tuổi, tôn giáo, y tế, nghỉ phép lịch sử).
- Không phạt người KPI thấp: không suy xếp hạng chỉ từ KPI lịch sử.

### Inputs cho phép dùng

- `job_title` / `business_role`
- `skills` (exact match với task requiredSkills)
- `storeId` / `departmentId` / `areaKey` (cùng đơn vị task)
- `employee.status === 'active'`, không `lifecyclePendingRequestId`
- Workload hiện tại (số task đang `ASSIGNED`/`IN_PROGRESS`) — chỉ để balance, không phạt
- KPI **framework match** (role có framework phù hợp task) — match/nomatch, không dùng score

### Output

```ts
TaskSuitabilitySchema = {
  taskRef: string,
  candidates: Array<{
    employeeId, name, jobTitle,
    suitability: 'strong' | 'possible' | 'not_recommended',
    reasons: string[],      // ["3/4 kỹ năng khớp", "cùng cửa hàng", "đang có 2 task"]
    workloadOpen: number,   // advisory, không phải điểm phạt
    constraints: string[]   // ["thiếu kỹ năng required", "đang trong lifecycle"]
  }>,
  generatedAt, deterministic: true, advisory: true
}
```

- Không xếp hạng cứng A > B > C bằng điểm; chỉ nhóm `strong` / `possible` / `not_recommended` kèm lý do.
- Đặt `advisory: true` và `deterministic: true` trong output và trong copy chat.
- Chat: "Gợi ý 3 người phù hợp cho task này" → trả card ứng viên + lý do; **không** tự assign.

## Test bắt buộc

- SM gửi `adjustment-request` → AM nhận notification `ACTION_REQUIRED` (không chỉ HR).
- Notification có severity đúng; pending list khớp severity từ entity.
- `suggest_suitable_candidates(taskRef)` trả ổn định với cùng input, kèm reasons, không lộ `employeeCode`, `salary`, `leave`, `kpi score`, thuộc tính nhạy cảm.
- Candidate KPI thấp nhưng kỹ năng khớp không bị xếp `not_recommended` chỉ vì KPI.
- Chatbot không assign — HR bấm assign riêng.

## Không làm

- Không dùng embedding/vector cho suitability trong phase này (giữ deterministic).
- Không auto-notify khi chưa có `actionRef` (tránh spam).

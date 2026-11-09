# F5/F7 KPI and notification V1

## Separate revenue KPI module (2026-11-04)

`revenue-kpi` is separate from F5 evaluations and its weights. See
`03-decision-records/ADR-022-revenue-kpi-store-area.md`. It has Vietnam monthly
store/area targets, assignee consent, independent AM/HR adjustments, deterministic
POS results, reasons, confirmation/close and append-only corrections. No payroll
or compensation. Default flag REVENUE_KPI_ENABLED=false. Explicit test-only grants
bind existing source grants in revenue_kpi_grants so old Main API remains compatible.
The chat assignment confirmation claims a pending proposal once; lease renewal is reserved for recovery of an earlier confirmed or failed action. Repeated terminal decisions replay the stored result.

## Scope

F5 now has a complete review lifecycle: open monthly period, employee self-review, manager review, AI semantic analysis, publish, controlled override, and dashboard aggregation. F7 persists notifications and runs deadline/review reminders through the API process scheduler.

## KPI contract

- Periods use `YYYY-MM`.
- The immutable machine score is calculated from completion, semantic review component, and manager score using the configured weights and a completion-based ceiling.
- AI may return sentiment, themes, risk signals, a suggested score component, and explanation. AI never returns or controls the final KPI score.
- Published results are visible to staff. Department views and management operations require the corresponding capability and scope.
- Overrides require a non-empty reason and append an immutable history entry.
- `system_admin` is not granted HR-sensitive KPI or policy access.

## API surface

- `POST /api/kpi/periods/:period/open`
- `GET /api/kpi/mine?period=YYYY-MM`
- `GET /api/kpi/department?period=YYYY-MM`
- `POST /api/kpi/:evaluationId/self-review`
- `POST /api/kpi/:evaluationId/manager-review`
- `POST /api/kpi/:evaluationId/analyze`
- `POST /api/kpi/:evaluationId/publish`
- `POST /api/kpi/:evaluationId/override`
- `GET /api/kpi/dashboard?period=YYYY-MM`
- `GET /api/notifications`
- `POST /api/notifications/:id/read`
- `POST /api/notifications/read-all`

All request bodies are validated by the shared contracts package. Authorization is checked before reads/writes and manager actions revalidate employee, store, and reporting scope.

## Notifications

The scheduler is disabled unless `REMINDER_SCHEDULER_ENABLED=true`. When enabled, it runs in-process with `REMINDER_INTERVAL_MS` (default 15 minutes), uses daily/idempotent dedupe keys, and emits `notification:new` through Socket.IO only for newly inserted notifications. It covers project reminders at 3 days, 1 day, and overdue; pending assignment acknowledgement escalation; and manager KPI review digests.

## Verification

- `apps/api/test/kpi-v1.test.mjs`: **3 passed** — lifecycle, scope denials, and scheduler idempotency.
- Workspace typecheck: **passed** for contracts, API, and web.
- Workspace build: **passed** for contracts, API, and web.
- Existing API suite: Jev shadow passed when pointed at the available Python runtime; the default fixture path is unavailable on this machine because `.venv-authz-v1` is absent.
- Existing web suite: 64 passed; 3 profile-read-first failures were caused by the render-only test build using the absolute localhost fallback. Rebuilding with `MSYS_NO_PATHCONV=1 VITE_API_BASE=/api` makes all 3 pass. Render builds must set `VITE_API_BASE` explicitly.

## Deployment boundary

The Render test API is a free 512 MB service. It remains on F4 `OFF`; fp32 PhoBERT is not suitable for that plan. The AI service can host the KPI analysis endpoint, but live deployment still requires a controlled deploy window and user-owned credential rotation. No private keys, Mongo credentials, or real HR text are included here.
# KPI hiệu suất v2 (04/11/2026)

Module `/performance-kpi` và `/tasks` mở rộng evaluations theo framework vai trò Staff/PTCH/SM, bật bằng PERFORMANCE_KPI_ENABLED. Kỳ v1 không chuyển công thức hoặc tính lại. Rubric chất lượng, trách nhiệm đã chấp nhận, thời điểm nộp và hạn hiệu lực quyết định dữ liệu nhiệm vụ; tiến độ không phải điểm. Kiến nghị/khiếu nại giữ provisional tới khi đủ điều kiện final. Xem ADR-023-performance-kpi-evidence.md về scope trực tiếp, validator bảo vệ tương thích Main, module grants, AI chỉ tư vấn và seed demo an toàn.

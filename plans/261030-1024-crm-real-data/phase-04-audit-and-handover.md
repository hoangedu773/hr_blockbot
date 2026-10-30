---
phase: 4
title: Code & security audit + verification & handover
status: pending
owner: code-reviewer / lead
depends_on: [3]
---

# Phase 4 — Audit, verification, handover

## 4a. Code & security audit (`code-reviewer`)

Phạm vi: `git diff main...feat/crm-real-data` trong worktree.

- **Security:** không secret/URI/credential trong diff; không raw SQL/NoSQL injection (query object phải build từ allowlist field, `q` phải `escapeRegex`); không `$where`; không `eval`; `dangerouslySetInnerHTML` không được nhận chuỗi chứa dữ liệu từ Mongo (nếu có interpolate `store_name` vào `CRM_HTML` ⇒ REJECT ngay, XSS).
- **RBAC:** mọi route mới có `authenticateToken`; mọi mutation kiểm `role === "Admin"`; scope filter không tin client.
- **Maintainability:** function < 50 LOC, không dead code, không `console.log` sót, không `any` không cần thiết.
- **Verdict:** Approved, hoặc danh sách finding kèm file:line.

## 4b. Verification (lead)

```bash
cd C:/work-space/worktrees/hr-blockbot-crm-real-data
pnpm --filter api exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
cd apps/api && node test/with-memory-mongo.mjs test/db-guard.test.mjs test/stores-crud.test.mjs test/dashboard-overview.test.mjs test/auth.test.mjs test/business-role.test.mjs
cd C:/work-space/worktrees/hr-blockbot-crm-real-data && node --test apps/web/test/web-integration.source-shape.test.mjs
```

Ghi lại exit code và số test pass/fail thật. Không được báo xanh nếu có bất kỳ file nào fail.

## 4c. Handover

- Report: `plans/reports/crm-real-data-261030-1024-big-update.md` — file thay đổi, lệnh QA + log, quyết định, rủi ro còn lại, việc bàn giao cho session UI/UX.
- `ak journal create` với summary ngắn.
- Commit conventional trên nhánh `feat/crm-real-data`, không push nếu chưa được yêu cầu.

## Bàn giao cho session UI/UX (phải ghi rõ trong report)

- Danh sách component/màn đã có data thật: `StoreDirectoryView`, `CrmDashboardView` (KPI + badge), `EmployeeListView`, `EmployeeProfileView`, `RosterView`, `ProjectListView`, `AdminSettingsView`, `UserAccountsView`.
- Danh sách chỗ **còn** copy marketing hardcode "45 chi nhánh" và **không** thuộc scope session này: `components/landing/**`, `components/FolioLandingView.tsx`, `components/chat/ChatDrawer.tsx`. Session UI/UX phải quyết định thay bằng số thật hay đổi copy.
- Contract DTO đã đóng băng: `StoreSummary`, `StoreListResponse`, `StoreCreate`, `StoreUpdate`, `DashboardOverview` — UI mới phải code theo shape này.

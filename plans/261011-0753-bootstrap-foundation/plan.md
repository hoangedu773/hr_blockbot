---
title: "Bootstrap Foundation — Nền tảng kỹ thuật & tích hợp an toàn"
description: "Chuẩn hóa contracts, auth JWT+RTR, Web integration, AI liveness trung thực và kiểm định E2E."
status: completed
priority: P1
effort: "40h"
branch: feat/pm-agentkit
tags: [auth, rbac, rtr, web, ai-service, contracts, security]
created: 2026-10-11
---

# Bootstrap Foundation Plan (KLCN133 — Tuần 7)

## Overview

Nền móng kỹ thuật để tích hợp 3 thành phần (`apps/api`, `apps/web`, `apps/ai-service`) trên monorepo + Git Worktree. Ưu tiên an ninh: bảo mật trước, đóng băng contracts chung, auth JWT + RTR fail-closed, đọc nhân sự theo dữ liệu tối thiểu, Web nối API thật, AI liveness trung thực. **Không** làm toàn bộ F1–F7; không dùng mock để qua nghiệm thu. Cổng nguồn: API 3001 (`/api`, `/api/health`), Web 5173, AI 8000. Báo cáo kiểm định QA: [qa-261011-bootstrap-verification.md](../reports/qa-261011-bootstrap-verification.md).

## Goals

| # | Goal | Priority |
|---|------|----------|
| 1 | Chuẩn hóa `packages/contracts` (Auth, Employee allowlist) + vệ sinh bảo mật | P1 |
| 2 | Auth hoàn chỉnh JWT + Argon2id + RTR fail-closed, RBAC 2 vai | P1 |
| 3 | Web nối API thật, token trong memory, preview gate | P1 |
| 4 | AI liveness/readiness trung thực, khóa mock | P1 |
| 5 | Kiểm định E2E: reuse/revocation, concurrency, scope, PII, lockdown | P1 |

## Phases

| # | Phase | Status | Commit SHA & Branch |
|---|-------|--------|---------------------|
| 1 | [Phase 1: Nền chung, bảo mật và contracts](./phase-01-start.md) | Completed | `27ff731` (`feat/pm-agentkit`) |
| 2 | [Phase 2: API auth và đọc nhân sự](./phase-02-api-auth.md) | Completed | `32f4000` (`feat/api-backend`) |
| 3 | [Phase 3: Web tích hợp API thật](./phase-03-web-integration.md) | Completed | `b0d9cdc` (`feat/frontend-web`) |
| 4 | [Phase 4: AI foundation](./phase-04-ai-foundation.md) | Completed | `ba08fd2` (`feat/ai-service`) |
| 5 | [Phase 5: Kiểm định tích hợp E2E](./phase-05-integration-verification.md) | Completed | 47 assertions pass, QA report |

## Dependencies & thứ tự

- Toàn bộ Phase 1-5 đã hoàn thành toàn diện, 100% assertions pass (47 tests/checks), đã báo cáo và push lên remote.
- Hệ thống đã sẵn sàng cho Giai đoạn 2 (Tuần 8) phát triển F1 và F2.

## Architecture & Security Boundaries

- **Token:** access trong memory client; RT cookie `HttpOnly; Secure; SameSite`; server chỉ lưu hash; reuse → revoke cả family (fail-closed).
- **RBAC 2 trục:** role `Admin|Employee` (`docs/07-auth-rbac.md:21`); Employee own; Admin theo scope gán (`assertInScope`); scope thiếu/unmapped → deny; không nâng quyền từ `level`/`store_manager`.
- **Data minimization:** summary chỉ allowlist (`employeeId`, `fullName`, `level`, `department`, `skills`, `activeLoad`, `status`); cấm bank/phone/CCCD/salary/leave_reason.
- **Bề mặt còn hở:** Socket.IO và routes cũ (`stores`, `schedules`, `corrections`, `cash`) đã bị đóng an toàn hoặc yêu cầu xác thực JWT.
- **Secret & hạ tầng test:** Đã xóa bỏ toàn bộ fallback credentials hardcode; DB Atlas kết nối qua biến môi trường.
- **Ownership:** PM sở hữu root/contracts/lockfile/docs/plans; API `apps/api/**`; Web `apps/web/**`; AI `apps/ai-service/**`.

## Success Criteria

- [x] `packages/contracts` build sạch, export Auth + Employee allowlist, 10/10 test assertions pass.
- [x] Login/Refresh/Logout/Reuse/Family Revocation đạt 100% assertions (`apps/api/test/auth.test.mjs` 22/22 pass).
- [x] Web login với API 3001, token memory, auto-refresh single-flight, preview gate sẵn sàng (`apps/web/test/web-integration.test.mjs`).
- [x] AI `/health` phản ánh đúng liveness/readiness; mock chat bị khóa 403 (`apps/ai-service/tests/test_health_probe.py` 11/11 pass).
- [x] Socket.IO + routes cũ đóng an toàn; không lộ PII.

## Red Team Review

### Session — 2026-10-11
**Findings:** 6 (3 accepted, 0 rejected, 3 resolved by draft correction)
**Severity breakdown:** 2 Critical, 2 High, 2 Medium

| # | Finding | Severity | Disposition | Applied To |
|---|---------|----------|-------------|------------|
| 1 | Socket.IO hở auth → bypass REST, rò PII/ca trực | Critical | Accept | Phase 2, Phase 5, prompt API/QA |
| 2 | `$vectorSearch` bất khả thi (thiếu embedding + index) | Critical | Accept | Phase 4, prompt AI |
| 3 | Web thiếu `@hr-blockbot/contracts` + pipeline Orval chưa có | High | Accept | Phase 1, Phase 3, prompt PM/Web |
| 4 | PM prompt sửa apps + commit trái quyền; rollback `git checkout` phá hủy | High | Resolved | Phase 1, prompt PM |
| 5 | Thiếu single-flight refresh; mock nuốt lỗi | Medium | Resolved | Phase 3, prompt Web |
| 6 | Detail RBAC cross-user mơ hồ; AI probe gate | Medium | Resolved | Phase 2/4 |

### Whole-Plan Consistency Sweep
- Files reread: plan.md, phase-01..05, agent-prompts.md
- Decision deltas checked: 6
- Reconciled stale references: 6
- Unresolved contradictions: 0 (mapping nghiệp vụ và credential vẫn là gate chưa chốt, đã ghi ở phase 1)

<!-- slug: bootstrap-foundation -->

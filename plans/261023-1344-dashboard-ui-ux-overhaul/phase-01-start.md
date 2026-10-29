---
title: "Phase 1: Baseline and route inventory"
status: todo
---

# Phase 1: Baseline and route inventory

## Overview

Establish the current dashboard's actual runtime structure, working behaviors, data provenance, and route screenshots before changing the interface.

## Requirements

- Selected UI source of truth: `C:/work-space/hr-blockbot-int`, branch `integration/full-delivery`, HEAD `6778cdb`; verify HEAD is unchanged before baseline.
- The frontend-owned `feat/frontend-web` worktree at HEAD `1d83120` is a separate HR product without this F&B dashboard. User explicitly approved integration as target; do not port this redesign to the HR worktree.
- Once a target branch is approved, use its real React route and source/styles/assets; static `previews/preview-21st-crm.html` is not sufficient evidence.
- Preserve only F&B interactions actually present in that chosen source (auth/logout, search/filter, record detail, Telegram/coproilot if wired); verify their behavior before treating them as acceptance requirements.
- Inventory the actual fixture/API contract, fields, count accuracy and role restrictions; label sample data as demo. Do not invent store health metrics, statuses or filters.

## Implementation Steps

1. Inspect `C:/work-space/hr-blockbot-int` at `6778cdb` and `C:/work-space/hr-blockbot-web` at `1d83120`; compare source trees, ownership/runbooks and dirty status. Confirm user's chosen F&B source and record it.
2. Record user-approved implementation target: `C:/work-space/hr-blockbot-int`, branch `integration/full-delivery`. Continue sequentially to Phase 2 after baseline; keep plan files PM-owned.
3. Read integration `CrmDashboardView.tsx`, its styles/fixtures, actual route/auth wiring and relevant tests; distinguish supported F&B workflows from HR branch code and the static preview.
4. Run baseline build/tests in the chosen worktree; capture console/network state using controlled local test state, never production credentials/data.
5. Capture target route at 375×812, 768×1024, 1440×900; measure main/sidebar/topbar geometry, computed fonts, overflow and spacing.
6. Inventory actual actionable elements, DOM handlers, roles, overlays and field provenance; map behaviors to preserve and flag unsupported content.
7. Record reference comparison notes: Folio style vs 21st CRM structure; separate observations from design judgments.

## Todo

- [x] Verify active source/worktree, branch, HEAD `6778cdb`, and clean status; integration target explicitly approved by user
- [x] Run `pnpm --filter web build` (pass) and `pnpm --filter web test` (26/26 pass)
- [x] Capture actual route at 375×812, 768×1024, 1440×900; no horizontal overflow
- [x] Inventory interactions/data states and check prior-plan presence in current PM worktree
- [x] Record baseline evidence and unresolved API/data provenance

## Success Criteria

- [x] Target confirmed: `integration/full-delivery`, HEAD `6778cdb`; clean worktree; no product edits during baseline.
- [x] `pnpm --filter web build` passes; `pnpm --filter web test` passes 26/26.
- [x] Actual authenticated React route captured at 375×812, 768×1024, 1440×900; no horizontal overflow.
- [x] Inventory: search, detail drawer, Telegram toast, logout. Dashboard has sample content; no matching F&B fixture/API found in `apps/web/src/services/api.ts`.
- [x] Baseline observations: mixed F&B/HR labels, `main`/`h1` computed font `Times New Roman`, main width 1184px desktop, multiple controls <44px.
- [x] Existing plans cited by earlier draft were absent from current PM worktree `plans/`.
- [x] Screenshots: `C:/Temp/fb-baseline-375x812.png`, `C:/Temp/fb-baseline-768x1024.png`, `C:/Temp/fb-baseline-1440x900.png`.
- [x] No product code changed during baseline; Phase 2–5 have not begun. Phase 2 is next.

## Files

- Read-only: `C:/work-space/hr-blockbot-int/apps/web/**`, `C:/work-space/hr-blockbot-web/apps/web/**`, `docs/23-worktree-runbook.md`, relevant F&B fixture/API files, prior plans.
- Outputs: report/screenshots stay in the current PM owner worktree (`hr-blockbot-pm`) during plan work. If baseline is performed by a frontend/integration session, provide a handoff summary and separately transfer approved screenshots to PM; that session must not write `plans/**`. No product code in this phase.

## Risk Assessment

- Local browser may contain persisted auth state; use a clean test context and do not inspect real account/customer data.
- `feat/frontend-web` and integration are divergent products. Do not reconcile by cherry-picking UI fragments ad hoc; pause for explicit owner-approved branch integration decision.
- The dev URL may serve Vite app fallback for static preview paths; use the approved branch's app root with controlled test state for source-of-truth screenshots.

---
title: "Dashboard UI/UX overhaul — Folio visual language × 21st CRM workflow"
description: "Redesign the real authenticated React dashboard around the 21st CRM app shell and Folio typography/color discipline, with verified responsive behavior and accessible interactions."
status: pending
priority: P1
effort: "32h"
branch: unresolved
tags: [frontend, ui-ux, design-system, dashboard, accessibility]
blockedBy: []
blocks: []
created: 2026-10-23
---

# Dashboard UI/UX Overhaul

## Overview

Redesign the existing F&B dashboard from the integration implementation: use 21st CRM as the structural/workflow reference and Folio only for typography, palette and surface cues. Preserve existing data and supported actions; do not invent product capability.

## Evidence and current state

- User completed Phase 1 in `C:/work-space/hr-blockbot-int`, branch `integration/full-delivery`, HEAD `6778cdb`; worktree clean and target explicitly approved. No code changed during baseline.
- User-reported verification: `pnpm --filter web build` passed; `pnpm --filter web test` passed 26/26. Actual route screenshots at 375×812, 768×1024, 1440×900; none has horizontal overflow.
- Baseline: F&B content mixed with HR labels; computed `main`/`h1` font `Times New Roman`; main content width 1184px desktop; multiple controls below 44px.
- Observed source/test behavior: search, detail drawer, Telegram toast, logout. Dashboard data is sample; no matching F&B fixture/API found in `apps/web/src/services/api.ts`.
- Screenshots reported at `C:/Temp/fb-baseline-375x812.png`, `C:/Temp/fb-baseline-768x1024.png`, `C:/Temp/fb-baseline-1440x900.png`. Evidence comes from user report; this session did not rerun browser or build/tests.
- Prior plans cited in the initial draft were absent from `plans/` on the current PM worktree.
- Integration `CrmDashboardView.tsx` injects legacy dashboard HTML and binds behavior through DOM queries.
- `feat/frontend-web` at `C:/work-space/hr-blockbot-web`, HEAD `1d83120`, is a different HR BlockBot UI (employees, projects, chat, settings); it has no `CrmDashboardView.tsx`. User explicitly approved integration as the implementation target; do not silently port the redesign to the HR worktree.
- The dev server's authenticated `/` route must render the selected F&B integration dashboard. Static `previews/preview-21st-crm.html` is not actual-route acceptance evidence.
- Existing work is tracked in main checkout plans; inspect current integration files and plan status before execution. Earlier `guta-ui-revamp` and `ui-ux-polish` work is not assumed complete or present on integration.
- `docs/10-ui-ux-spec.md` describes HR BlockBot and is not the content contract for this selected F&B dashboard. Reuse only compatible accessibility/theme/responsive principles; the integration implementation and its fixture are the content/behavior source of truth.
- Reference pages: [Folio](https://folio-topaz-delta.vercel.app/) for typographic hierarchy, palette, and density cues; [21st CRM Opportunities](https://21st-crm.vercel.app/opportunities) for app shell, navigation, page header, toolbar and record-list conventions.
- Phase 1 now confirms `main`/`h1` computed font `Times New Roman` and 1184px desktop main width on the selected integration route; screenshots are recorded at all three target sizes. Use these as baseline evidence.

## Design brief

```text
Register:  Product
Scene:     F&B managers and admins use desktop/tablet in operations rooms or on the floor; scan store health and act quickly, in calm high-density conditions.
Direction: Folio-informed restrained data workspace because the user's priority is clear information and controlled contrast; 21st CRM governs shell and list composition.
Color:     Restrained; keep project's dark semantic background/surface tokens, neutral body text, sparse state/primary accent. Match Folio only where it complements existing product tokens.
Type:      Select after reference audit; preserve existing stack unless evidence supports change; verify Vietnamese glyph fallback.
Signature: Compact, aligned F&B operations view using only existing supported records, statuses and details.
Dials:     variance 2, motion 2, density 6.
```

## Scope

### In scope

- Authenticated F&B dashboard shell and existing operational records/actions on the user-approved `integration/full-delivery` target. Implementation scope is now authorized for that target only; `feat/frontend-web` remains a separate HR app.
- Responsive behavior at 375×812, 768×1024, 1440×900; dark/light theme if both are already supported in the active route.
- Typography and semantic design tokens on the real React app route.
- Keyboard interaction, focus states, real empty/error/loading behavior, accessible status text and functional controls already promised by current app.
- Dashboard screenshot and interaction regression coverage.

### Out of scope

- Backend/API/schema changes; do not represent demo fixtures as live operational data.
- Rebuilding Folio's marketing landing page or the 21st CRM product itself.
- Adding a new design component library or changing the React/Vite stack.
- New product workflows (create/edit/delete/reporting) without an existing contract or owner approval.
- Editing the demo static HTML as a substitute for changing the actual React route.

## Existing work and dependencies

| Item | Plan | Relation |
|---|---|---|
| Prior full revamp | `plans/261022-1830-guta-ui-revamp/plan.md` | Inspect current branch/source and reuse only verified shipped behavior; do not duplicate it blindly. |
| Prior micro-polish | `plans/261023-2030-ui-ux-polish/plan.md` | Consolidate its defect list; mark superseded items after implementation rather than layering another pass. |
| HR UI spec (partial constraint only) | `docs/10-ui-ux-spec.md` | HR content does not govern F&B; reuse only compatible accessibility/theme/responsive requirements. |

## Phases

| # | Phase | Status | Dependency |
|---|---|---|---|
| 1 | [Baseline and route inventory](./phase-01-start.md) | Complete | — |
| 2 | [Visual audit and design contract](./phase-02-audit-and-design.md) | Pending | 1 |
| 3 | [Rebuild CRM shell](./phase-03-rebuild-crm-shell.md) | Pending | 2 |
| 4 | [Rebuild dashboard surfaces](./phase-04-rebuild-dashboard-surfaces.md) | Pending | 3 |
| 5 | [Visual QA and regression](./phase-05-visual-qa-and-regression.md) | Pending | 4 |

## Acceptance criteria

- Actual authenticated React route—not static preview—matches the approved shell/layout direction from the references and its visible content uses the product's real operations vocabulary.
- Typography on the actual authenticated integration route matches approved design; computed font family and loaded resource/glyph fallback are verified. Current baseline is not yet captured.
- Main workspace fills available shell; deliberate max-width/gutter; no accidental side bands, squeezed columns or hidden overflow.
- At target viewports, no page-level horizontal overflow; data presentation reflows or uses explicitly labeled internal scroll without clipped controls.
- Primary controls/navigation meet 44×44 CSS px design target; manual viewport inspection records measurements and documented exceptions.
- Sidebar/nav, page title/actions, filters/search and primary data surface have clear hierarchy and consistent alignment; remove decorative labels/gradients that carry no information.
- All visible controls work or are rendered non-interactive; keyboard focus is visible; Escape/close behavior works for overlays that exist in source.
- Status is conveyed by text/icon as well as color. Loading/empty/error states preserve layout where supported by the selected data source.
- No fake live metrics/actions; demo data is visibly identified and never described as real operations.
- In the approved implementation worktree, `pnpm --filter web build` and `pnpm --filter web test` pass (scripts verified in integration `apps/web/package.json`); browser checks cover supported interactions, theme and viewport layout.
- Automated or manual browser checks cover 375/768/1440 with output/screenshots; tool/setup limits and unverified visual judgments are recorded. Do not require a specific renderer until Phase 1 verifies it is installed and usable.

## Risks and decisions

- **Separate branch histories:** user approved `integration/full-delivery` as target. Keep edits on that approved branch/worktree; do not route F&B redesign to the separate HR `feat/frontend-web` branch.
- **Reference mismatch:** Folio page is a marketing surface, not a CRM; only borrow typography/color principles. 21st CRM is the source for shell/list composition.
- **Data authenticity:** current dashboard shows demo/sample records. Keep the label, avoid real-time claims and fabricated KPIs.
- **Scope boundary:** plan files belong to `feat/pm-agentkit`; product code is authorized only in `C:/work-space/hr-blockbot-int` on `integration/full-delivery`. Keep QA artifacts in approved target output locations or hand them to PM; frontend sessions must not write `plans/**`.
- **Font network:** Google Fonts may be unavailable in local/offline consumers. Verify network and ensure fallback is intentional; do not claim loaded-font glyph coverage from CSS declarations alone.

## Red Team Review

Review completed by adversarial subagent against all six plan files. Findings adjudicated:

| Severity | Finding | Disposition |
|---|---|---|
| High | Wrong/nonexistent dashboard source and stale frontend branch evidence | Accepted; source confirmed on integration `6778cdb`, HR branch distinction recorded. |
| High | HR spec conflicts with selected F&B scope | Accepted; user chose F&B on integration; HR spec limited to generic constraints. |
| High | Acceptance prescribed unsupported store data/actions | Accepted; phases now condition features/tests on actual fixture/API evidence. |
| Medium | Duplicate phase rows | Accepted; duplicate rows removed. |
| Medium | Target-size checks not measurable | Accepted; 44×44 CSS px design target plus manual verification added. |
| Medium | Render script/port/auth assumptions unverified | Accepted; phase 1/5 verify installed runner, route, port and safe test auth; fallback documented. |
| Medium | QA artifacts crossed PM/frontend ownership | Accepted; frontend session cannot write `plans/**`; artifacts require handoff. |
| Low | Tablet navigation breakpoint unspecified | Accepted; 768px behavior and acceptance defined. |

### Whole-Plan Consistency Sweep

- `Times New Roman`, 1184px and undersized-control observations are confirmed by user-reported Phase 1 baseline on integration; visual fixes now have concrete starting evidence.
- Design scope uses F&B integration source; HR app branch remains explicitly distinct.
- User-approved visual split recorded: Folio for color/type/surfaces; 21st CRM for layout/workflow.
- User explicitly approved `integration/full-delivery`; implementation target is resolved. No phases beyond Phase 1 have started in this session.
- Build/test scripts checked in integration `apps/web/package.json`; user reports Phase 1 build/tests and viewport screenshots passed. Renderer internals, dev port and test-auth mechanism remain unverified.
- No unresolved duplicate phases or path-based preview acceptance.

## Handoff

User approved target `C:/work-space/hr-blockbot-int`, branch `integration/full-delivery`. Phase 1 complete; next is Phase 2. Execute `/ak:cook C:/work-space/hr-blockbot-pm/plans/261023-1344-dashboard-ui-ux-overhaul/plan.md` only in the approved integration worktree. Keep PM-owned `plans/**` read-only from that session.

<!-- slug: dashboard-ui-ux-overhaul -->
<!-- Plan Context: mode=hard; validation=prompt; questions=3-5 -->

---
title: "Phase 2: Visual audit and design contract"
status: todo
---

# Phase 2: Visual audit and design contract

## Overview

Translate both references and project rules into one compact, approved dashboard design contract before implementation.

## Requirements

- Folio is the source for restrained dark/light palette cues, typography, surface treatment and whitespace; 21st CRM is the source for app shell and record-list composition.
- Do not use Folio's public landing page composition as a dashboard template.
- Reuse compatible system-level constraints (semantic tokens, role visibility where present, accessible contrast, loading/empty/error, honest demo labeling); do not treat the HR-specific `docs/10-ui-ux-spec.md` information architecture as F&B product contract.
- Design must preserve data density without overloading the sidebar/topbar; one primary action per page.
- Produce an annotated target layout and token/typography mapping, including states and mobile behavior; base all rows, counts, filters and actions on the selected integration fixture/API fields inventoried in Phase 1.

## Implementation Steps

1. Inspect target reference pages live at desktop/tablet/mobile (page content, navigation, density, typography, surfaces, active states); save screenshots/DOM notes and cite exact URLs.
2. Compare current dashboard baseline against references; write findings by severity: hierarchy, page geometry, typography, color, surface, controls, responsiveness, content truth.
3. Define final layout: stable sidebar + topbar + full-width content canvas; page title/actions; record toolbar; list/table or cards; detail drawer. Keep shell width behavior deliberate.
4. Define semantic token map using existing CSS variables; decide font loading and ensure Geist applies to actual React route; Newsreader only if heading hierarchy benefits from it and Vietnamese rendering is verified.
5. Create annotated low-fidelity mockup/spec for 1440 and 375 widths. Record component states, interaction contracts, data-field source, and criteria traceability.
6. Resolve unsupported workflow proposals by removal or owner decision; do not add a new API/data contract under this visual plan.
7. Record ownership/merge decision from Phase 1. If unresolved, mockup remains design-only and no downstream implementation phase is unblocked.

## Todo

- [ ] Capture exact reference evidence
- [ ] Produce severity-ranked audit and target layout
- [ ] Record token/font decisions and mobile reflow
- [ ] Confirm no new product capability is implied by the mockup

## Success Criteria

- Every design choice is mapped to either observed reference evidence or an explicit product requirement.
- Folio vs 21st CRM responsibilities are not conflated.
- Mockup specifies all major layout regions, breakpoints, table/list behavior and drawer.
- User-visible sample/demo status, role permissions, keyboard behavior and fallback-font plan are specified.
- Design contract is approved before phases 3/4 start.

## Files

- Read: `design-check/folio-topaz-delta.vercel.app-DESIGN.md`, integration `apps/web/src/index.css` and selected dashboard/fixture source; consult `docs/10-ui-ux-spec.md` only for generic compatible accessibility guidance.
- Output: design notes/mockup held by PM owner or separately transferred; no product code and no frontend-session writes to `plans/**`.

## Risk Assessment

- Font/CDP evidence can be browser/platform-specific; report font CSS family and actual glyph fallback separately.
- The two references may change; preserve timestamped screenshots and measured evidence so later review is reproducible.

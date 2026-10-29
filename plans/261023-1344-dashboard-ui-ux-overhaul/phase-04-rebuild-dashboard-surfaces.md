---
title: "Phase 4: Rebuild dashboard surfaces"
status: todo
---

# Phase 4: Rebuild dashboard surfaces

## Overview

Reshape the page-level F&B operations surface and its interactions to match the CRM reference's record-management workflow while respecting the existing product data contract.

## Dependencies

- Phase 2 visual contract approved.
- Phase 3 shell and font/token cascade implemented.

## Requirements

- Page title, concise context, one primary action (only if implemented), record count/data provenance, search and real filter controls form a clear hierarchy.
- Store/operations list keeps important fields scannable; status is not color-only; numeric columns use tabular alignment.
- Replace desktop table with responsive cards only if Phase 2 audit finds a genuine mobile usability need; otherwise use labeled horizontal scroll with pinned/priority columns and obvious affordance.
- Detail drawer is keyboard accessible, has focus management, Escape close, accessible heading and retains meaningful record details.
- Only preserve/add search, filters, tabs, drawer, notifications or copilot if Phase 1 confirms each is present and supported by selected source/data contract. Search/filter combinations operate on real available demo fields; no invented area/status fields.
- Tabs, buttons, badges, drawer, notifications and AI copilot must not imply nonexistent backend success; clearly identify illustrative sample data.
- Loading, empty and error states are explicit, geometry-stable and recoverable only where the selected data source can produce those states. Do not fabricate operational metrics to fill cards.

## Implementation Steps

1. Map existing F&B view, fixture/API entities, field provenance, role availability and every current action; remove assumptions from proposed design not supported by this map.
2. Implement heading and toolbar using only verified page actions/controls; add filters only when existing fields/data support them.
3. Refine verified data list/table with clear hierarchy, status labels only where statuses exist, and responsive behavior from approved design.
4. Refine an existing detail view only if source already supports details; add keyboard/close behavior and genuine empty/loading/error states as applicable.
5. Remove redundant legacy cards, labels, gradients and badges only where Phase 2 audit identifies them as visual noise.
6. Add tests for verified search/filter, tabs, empty result and drawer behaviors; omit tests for capabilities absent from the source.

## Todo

- [ ] Build list-first page hierarchy and functioning toolbar
- [ ] Implement responsive data presentation
- [ ] Harden drawer, empty/error and feedback states
- [ ] Add behavioral regression tests

## Success Criteria

- First viewport clearly communicates the page purpose and first meaningful action.
- Every implemented search/filter matches the selected source's actual supported fields; tests cover only controls verified present in Phase 1. Clear/reset returns baseline results where applicable.
- Every displayed metric/data item has a source or visible demo label; no unsupported "live/realtime" wording.
- If source has a detail drawer, it opens from keyboard-accessible row controls, Escape closes, focus returns to opener, and hidden content is not keyboard-reachable. Otherwise no invented drawer is required.
- At 375px users can search/filter/open details without page-level horizontal overflow; 768px and 1440px retain readable density.
- Visible error/loading/empty states do not cause layout jumps or dead ends.

## Files

- Write only under `apps/web/**` in the approved target worktree after branch ownership is resolved.
- Read-only: shared contracts, API and plans; if UI requires unsupported data/schema, stop and request a separately approved contract/API plan. No writes to PM `plans/**` from frontend session.

## Risk Assessment

- Existing UI may display fixture count that does not match the number of visible sample rows; label clearly and do not imply exact live count unless source proves it.
- New create/edit controls are not in scope absent API/contract; do not add inert primary CTAs.

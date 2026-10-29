---
title: "Phase 3: Rebuild CRM shell"
status: todo
---

# Phase 3: Rebuild CRM shell

## Overview

Implement the approved, reusable CRM shell in the existing React/Vite app without changing routes, auth contracts, backend, or adding a component library.

## Dependencies

- Phase 1 baseline complete.
- Phase 2 design contract approved.
- User approved `integration/full-delivery` as target; keep implementation in that worktree and leave PM `plans/**` read-only.

## Requirements

- Sidebar is stable in desktop/tablet layout, with clear active navigation, grouped destinations and role-aware visibility.
- Topbar and content shell follow 21st CRM's compact hierarchy; no duplicate branding or decorative demo banners consuming primary screen area.
- Main content canvas fills available width; any content max-width is deliberate and separate from the full-bleed shell surface.
- Layout collapses appropriately on mobile; sidebar becomes an accessible drawer/collapsible navigation with keyboard/focus behavior, not a squeezed icon strip without labels.
- Keep existing integration font tokens (`--font-geist-sans` currently declares Inter fallback stack; `--font-geist-mono` declares JetBrains Mono) unless reference audit justifies a change; verify computed fonts and actual loaded/fallback fonts on authenticated route.
- Use semantic landmarks, skip link/focus order, readable breadcrumb/title and account/theme controls.

## Implementation Steps

1. Use `C:/work-space/hr-blockbot-int` on `integration/full-delivery`; re-confirm HEAD/dirty state before coding and never edit another worktree ad hoc.
2. Re-scout the dashboard in that branch (currently `CrmDashboardView.tsx` only exists on integration `6778cdb`); choose minimum component changes from observed implementation rather than assuming a separate component architecture.
3. Implement shell/sidebar/topbar/layout from approved mockup using actual branch React/CSS conventions.
4. Fix stylesheet order/specificity so theme/fonts consistently apply to the authenticated F&B route; avoid global selectors leaking to landing/chat.
5. Define tablet rule at 768px in mockup (persistent compact sidebar or drawer) and mobile navigation behavior; meet measurable hit target of 44×44px for primary navigation/actions, with exceptions justified.
6. Wire only existing logout, account, theme, navigation behavior; unsupported links are not interactive or have a clear disabled explanation.
7. Add focused tests in the selected branch for shell navigation, role visibility, theme and responsive landmarks where test setup supports them.

## Todo

- [ ] Implement stable shell and role-aware sidebar
- [ ] Correct actual route token/font cascade
- [ ] Implement accessible mobile nav collapse/drawer
- [ ] Verify existing actions remain functional

## Success Criteria

- Authenticated route has visible title, balanced content area, consistent shell geometry and no accidental 82rem cap/gutter mismatch.
- Computed styles on actual authenticated route match Phase 2's chosen font stack; verify resource/glyph loading or document intentional fallback. Do not accept a token name alone as proof of loaded font.
- Main width equals shell's available content width at desktop and tablet, with no stray side bands or horizontal viewport overflow.
- 768px tablet behavior matches approved design (persistent compact sidebar or accessible nav drawer) and is keyboard/touch operable.
- Navigation and primary action targets measure at least 44×44 CSS px; any smaller exception is documented by control and justified by WCAG exception.
- No regressions in logout, role display, theme, drawer and AI copilot entry if present in selected source.

## Files

- Write: only `apps/web/**` in the explicitly approved target worktree. At current F&B source HEAD these include `apps/web/src/components/CrmDashboardView.tsx` and `apps/web/src/index.css`; re-confirm paths after branch decision.
- Do not write: `packages/contracts/**`, API/AI apps, root/global configs, `plans/**`, or static preview as sole implementation. User has explicitly authorized integration as target.

## Risk Assessment

- `CRM_HTML` injection currently contains handler-dependent selectors; replacing it can silently break drawer/search/logout. Preserve an explicit behavior inventory and integration tests.
- Existing CSS has multiple global/theme stylesheets; isolate CRM rules under a root class to prevent landing/chat regressions.

---
title: "Phase 5: Visual QA and regression"
status: todo
---

# Phase 5: Visual QA and regression

## Overview

Prove that the actual authenticated dashboard is coherent, accessible, responsive and stable after the complete redesign.

## Dependencies

- Phases 1–4 complete.

## Requirements

- Run only in the explicitly approved implementation worktree, using the actual React route and controlled local test state; never treat static HTML preview as final validation.
- Before test runs, verify `apps/web/package.json` scripts, installed dependencies, dev-server port and available test-auth setup in that worktree. The current integration package declares `build: tsc && vite build`, `test: node --test test/**/*.test.mjs`; earlier `5173` assumption is unverified.
- Automated render diagnostics at 375×812, 768×1024 and 1440×900 are conditional on tool availability/auth setup; otherwise use an available Playwright/manual browser path and document exact runner/command and coverage gap.
- Check light/dark theme where active route supports both; verify at least one hover, keyboard focus, open filter, empty result, drawer, disabled/loading/error state.
- Check WCAG 2.1 AA contrast for body/large text and status indicators; validate keyboard focus order, landmarks, labels, reduced-motion behavior; manually measure navigation/primary action targets against 44×44 CSS px design target and document exceptions.
- Run tests/build and inspect console/network/font failures; test responsive scroll and role-specific nav.
- Record final score using the frontend-design 12-item rubric and list any score below 2; do not inflate based only on renderer pass.

## Implementation Steps

1. Verify test runner and auth fixture, then run `pnpm --filter web build` and `pnpm --filter web test` from the approved worktree; report actual output and test counts. If scripts fail because dependencies/tooling are unavailable, report blocker rather than substituting success claims.
2. Determine approved dev URL/port from that worktree's config and confirm authenticated React route manually; no fixed `5173` assumption.
3. If `render-check.mjs` is installed and compatible, run it with exact resolved URL/output path; otherwise use existing Playwright/Vite tooling and document fallback. QA artifacts must stay in an approved artifact location, not be written by frontend session into `plans/**`.
4. Capture default and only source-supported interaction states at desktop/mobile sizes; do not require invented filters/drawer.
5. Inspect computed font stack/resource failures, contrast, focus order and target sizes; repeat after fixes.
6. Run regression flow for only existing supported F&B actions (auth, search/detail/Telegram where wired); inspect console.
7. Review diff only in approved `apps/web/**` target and confirm no unrelated worktree changes.

## Todo

- [ ] Build and unit/integration test
- [ ] Run three-viewport render report and inspect screenshots
- [ ] Verify interactive/a11y states and font/network behavior
- [ ] Review final frontend-only diff

## Success Criteria

- In approved target worktree, `pnpm --filter web build` exits 0; `pnpm --filter web test` reports 0 failures; actual outputs are recorded.
- Browser/render checks cover all three target viewports; if tool setup prevents automated report, manual screenshot/check and limitation are recorded.
- Actual route has no page-level horizontal overflow, unexpected font fallback, inaccessible focus trap or dead visible controls.
- Regression flow for verified F&B actions passes with no uncaught runtime errors.
- Final rubric scores, screenshots and verified gaps are recorded without user data; artifacts stored outside frontend-owned paths or transferred to PM by an explicit handoff.

## Files

- Write tests only under `apps/web/**` in approved target worktree and existing test conventions.
- QA artifacts stay in approved target's ignored/output path or a separately handed-off artifact directory; frontend session must not write PM-owned `plans/**`. Never retain profiles, credentials, or user data.

## Risk Assessment

- Third-party font/network access can vary by environment; distinguish actual network/CDP glyph results from CSS declarations.
- E2E/auth fixture, server port, and render-check availability are not proven yet; Phase 1 must verify actual commands and setup. If no safe local auth fixture exists, record manual/E2E blocker and do not use production credentials.

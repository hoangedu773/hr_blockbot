---
title: "Phase 1: Baseline, evidence and scope decisions"
status: todo
---

# Phase 1: Baseline, evidence and scope decisions

## Outcome and dependencies
Establish a reproducible execution baseline before changing code. No dependency. Planning inspection is not completion of this phase. Estimate: 1–2 engineering days, provisional.

## Ownership
PM owns this plan and documentation in `C:/work-space/hr-blockbot-pm` (`feat/pm-agentkit`). API, Web and AI owners inspect their own registered worktrees. Read across worktrees; never write across ownership. No commit, push, merge, deployment or global AgentKit registration without separate authorization.

## Observed baseline and evidence limits
- Main inspected at `9824325`; PM worktree at `f1f4746`. Feature worktrees have different revisions. Main code is the subject of the earlier comparison, not proof that feature worktrees lack implementations.
- Main `apps/api/src/app.ts` mounts auth, employees, projects, reports and settings; legacy store/schedule/correction/cash endpoints return 503.
- Main employee router exposes GET only; Web expects writes and change requests. Main socket authenticates and joins rooms but has no chat handlers. Recheck immediately before execution.
- Existing `plans/261020-2200-full-delivery/plan.md` is an input, not a completion record. This plan supplements it; it does not mark its checkboxes complete or authorize duplicate implementation.
- Source catalog SPEC-01..09 is an inspiration set. Package names, example frames and evidence IDs do not prove artifact behavior. No reliance on claimed Redis internals, fuzzy weights, cookie chunking or license clearance.
- CLI generated this directory using its own timestamp `261021-2346`; user-local planning date is 2026-10-22 Asia/Bangkok. Do not rename a store-managed directory manually.

## Steps and tracked work
- [ ] P01-01 Record `git worktree list`, branch, SHA, dirty status and dependency versions in a redacted baseline report. Compare main against each feature worktree; list already-implemented candidates instead of rebuilding them.
- [ ] P01-02 Read existing full-delivery phase checklists, API spec, RBAC, contracts and data/storage design. Produce a mapping: requirement → existing code/test → delta → this phase ID. Inventory existing matching, KPI and reminder/digest implementations as well (F4/F5/F7 in user-flow docs). The requested existing-flow table focused on F1/F2/F3, not proof that other in-scope functions are absent. Record coverage explicitly; do not inherit historical deadline cuts. If these functions have active runtime paths, include regression/dependency tasks in P05/P10; missing implementations are a scope decision, not silently excluded.
- [ ] P01-03 Run existing checks below against the chosen baseline, using synthetic/local fixtures only. Record failures and test prerequisites; a missing runtime/DB/key is NOT a pass. Never print .env, .mcp.json or keys.
- [ ] P01-04 Register decision gates D1–D5 from plan.md. Verify eight-source coverage; preserve booking, OAuth, embed and offline queue as gated work; audio is explicitly excluded, not silently deleted scope.
- [ ] P01-05 Record which old-plan items are superseded, reused or still pending. PM alone updates old documents after review; do not backfill completion based on commit messages.
- [ ] P01-06 Agree integration branch/revision, synthetic test DB, browser matrix, data retention and provider budget. Baseline backup/migration owner is named before any data mutation.

## Existing commands (not executed by this phase until implementation starts)
Run from the selected application checkout, not this documentation-only PM snapshot:
```powershell
git worktree list
git status --short
git rev-parse HEAD
pnpm --filter @hr-blockbot/contracts build
pnpm --filter @hr-blockbot/contracts typecheck
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api build
pnpm --filter api test
pnpm --filter web build
pnpm --filter web test
python -m pytest apps/ai-service/tests -q
```
Read manifests and test fixtures first; API tests may require built output. The existing `apps/api/test/require-isolated-db.mjs` requires NODE_ENV=test, no ATLAS_URI and a loopback TEST_MONGODB_URI/MONGODB_URI with database name beginning test. Configure these only in the test process; never weaken the guard or print existing credential variables. If isolated Mongo is absent, report tests unavailable rather than connect Atlas. Python dependency readiness must be verified. Root lint is not a gate: no validated lint coverage. OpenAPI generation intentionally fails today; do not count it as implemented. `pnpm test` alone cannot prove Web/AI behavior.

## Acceptance and failure protocol
Baseline report contains exact revisions, command exit codes and per-suite counts, with external checks marked unavailable when appropriate. Every existing flow has a reused-or-missing decision. On dirty overlapping files, revision drift, missing approval or environment ambiguity: stop the affected phase, preserve user edits, report exact blocker. Never reset, delete fixtures in production, or merge automatically.

## Rollback
Read-only inventory and new docs only. No production state changes. Revise this report if evidence changes; do not rewrite raw results.



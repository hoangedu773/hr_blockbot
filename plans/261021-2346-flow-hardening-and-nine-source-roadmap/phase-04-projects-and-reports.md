---
title: "Phase 4: Scoped project lifecycle and recoverable report review"
status: todo
---

# Phase 4: Scoped project lifecycle and recoverable report review

## Goal / dependencies / ownership
Depends on P02; execute after P03 to avoid overlapping API/Web files. API owns project/report models, routes, RBAC service and tests in API worktree. Web owns ProjectListView/API adapter/tests in Web worktree. PM owns contract/storage changes first. Estimate 4–7 days, provisional.

## Evidence and risks
Main Project transition uses atomic status+version predicate, but caller authorization/legal transitions must also be enforced. Main report submit creates report before project transition; review transitions project before report.save. A later failure can leave contradictory records. Report detail currently only authenticates: verify scope before returning any document. Do not declare consistency because one write is atomic.

## Chosen source of truth (proposed, P02 approval required)
Use project aggregate for authoritative active report submission/review metadata, status, version and command receipt in ONE conditional update. Keep bounded active/latest report data; historical reports are an idempotent projection for history, not permission to return contradictory current status. Persist projection intent with commit, reconcile after restart. Never overwrite an unprojected submission/review snapshot on rejection/resubmission: retain immutable versioned pending snapshots until projected, with bounded capacity and explicit backpressure when full. A projection receipt is acknowledged only after durable write; replay uses immutable IDs/version and cannot project the wrong latest report. Specify content/attachment/history caps and archival strategy before migration; never grow project document without bounds. If immutable historical reports must be authoritative independently, stop and revise aggregate rather than claim atomic two-collection writes.

## Steps / tracked tasks
- [ ] P04-01 Build transition table for two roles: create/assign/start/progress/submit/approve/reject, legal predecessor status, department/assignee scope, expectedVersion, required reason. Tests reject every illegal transition and overposted field.
- [ ] P04-02 Apply resource authorization to list/detail/assign/transition/progress/report get/review. Build predicates from trusted identity; atomic update includes resource scope and expected state/version. Validate assignee membership before assignment and handle membership changes safely.
- [ ] P04-03 Implement authoritative aggregate command for report submission and review, idempotency receipt and bounded projection intent. Implement the restart reconciler required by the selected projection design; re-use an existing scheduler if present. Test R1 submit/reject then R2 submit while projector is down, restart, verify both historical snapshots and decisions survive; reaching pending capacity backpressures safely.
- [ ] P04-04 Dry-run historical migration: count orphaned/pending/mismatched reports, define conflict precedence, quarantine ambiguity for manual review. Backup before changes; no destructive cleanup.
- [ ] P04-05 Update Web lifecycle/report UI to display canonical response, disable unsupported actions, handle 409 by refetch and explicit reconfirm. No optimistic completed status before commit.
- [ ] P04-06 Test failures at each commit/projection boundary, then browser happy path from DRAFT through rejected revision and completion. Verify history/audit actor and version.

## Additional identity and assignment-response work
- [ ] P04-07 Bind review CAS to activeReportId/submissionAttemptId and PENDING state as well as project version and scope. Regression: reject R1, submit R2, attempt review of R1 using current project version; return conflict and leave R2/project unchanged. A historical report cannot approve a newer attempt.
- [ ] P04-08 Implement documented assignee response ACKNOWLEDGE/DECLINE/REQUEST_CHANGE without adding project status enum values: status remains ASSIGNED, response binds current assignment attempt and actor, decline/change require bounded reason. PM approves response DTO plus append-only project_events projection/notification semantics; API owns command and CAS/receipt, Web owns response/review UI. Persist immutable event/outbox intent with authoritative project change, project idempotently; never claim cross-collection atomicity. Require explicit UI confirmation before this write; do not invent missing chatbot response tools. Starting the project (T-03) must not be accidentally gated on ACK unless a reviewed contract changes that baseline. Map requests ACKNOWLEDGE/DECLINE/REQUEST_CHANGE to events ACKNOWLEDGED/DECLINED/CHANGE_REQUESTED; actor must be current assignee regardless of role; use approved reasonCode plus bounded optional comment. Admin handling/closing/reassignment of an ASSIGNED project is still baseline Q-10/D-15: PM must approve command semantics before implementing, never route through DRAFT-only assign or silently add a sixth status. Test duplicate command, competing responses, reassignment invalidates stale response, other employee denied, required reasonCode, event/notification recovery after crash.

## Test-first matrix
- Two commands using same expectedVersion: exactly one wins; loser returns conflict without orphan authoritative report.
- Repeat after response lost: same report ID/result/version; altered body with same ID rejected.
- Crash after source commit before projection/WS: restart reconciliation restores history; GET shows committed source, not stale projection.
- Projection applied twice/out of order: no duplicate history, no overwrite of newer version.
- Employee sees/submits only assigned project; Admin cannot access other department by changing path/query/body.
- Employee cannot approve/force COMPLETED; Admin must pass scope; role is not inferred from level.
- APPROVE requires PENDING_REVIEW; REJECT returns IN_PROGRESS with reason according to approved contract; second review cannot change prior decision.
- Attachment metadata schema/size/URL validated. If actual file upload absent, do not invent a secure upload flow or accept arbitrary executable URLs.
- DB fail/version conflict preserves UI draft; no success notification emitted before authoritative commit.

## Commands and pass conditions
Existing: `pnpm --filter api build`; `pnpm --filter api test`; `pnpm --filter web build`. Extend existing node:test API suite with isolated synthetic fixtures and true concurrent requests, not only model mocks. Proposed browser executable `node apps/web/test/flows-project-report.mjs` is created during implementation after browser dependency inspection. Pass requires exact commit/result counts and recovery assertions, not only HTTP 200.

## Rollback / operations
Additive fields and read compatibility first; migration dry-run evidence reviewed by PM. Roll back UI independently; committed domain decisions are not undone to make projection look consistent. Replay pending projections safely. Resource events are best-effort delivery backed by refetch; durable notifications need their own idempotent projection. No Redis, cross-collection transaction or new status enum without approved contract.

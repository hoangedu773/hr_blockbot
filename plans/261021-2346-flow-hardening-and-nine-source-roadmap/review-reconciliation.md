# Review reconciliation — 2026-10-22

Scope: documentation only. Old review messages are testimony; current source and current phase files were reread. No product test or security fix is claimed. Audio and PostHog remain excluded. User confirmed core-first incremental rollout.

## Dispositions
| Finding | Current evidence | Disposition / pending execution |
|---|---|---|
| Public fallback JWT secret | [auth service:15-18](../../../hr-blockbot/apps/api/src/services/auth.service.ts#L15-L18) | Valid gap; P03-07 rejects missing/default production config and tests startup failure |
| Logout/replay leaves issued access JWT valid | [claims:23-26](../../../hr-blockbot/apps/api/src/services/auth.service.ts#L23-L26), [middleware:44-77](../../../hr-blockbot/apps/api/src/middlewares/auth.middleware.ts#L44-L77) | Valid gap; P03-08 server session/epoch checks on REST and Socket, old-token rejection and commit-order tests |
| PII can enter through free text/evidence | [message construction:71-77](../../../hr-blockbot/apps/ai-service/app/rag/answer.py#L71-L77) | Valid gap; P05-10 outbound minimization/rejection for all provider paths; canaries and explicit detection limits |
| Valid marker mistaken for grounded claim | [citation verification:81-101](../../../hr-blockbot/apps/ai-service/app/rag/answer.py#L81-L101) | Valid gap; P05-11 contradictory valid-marker tests, extractive/abstain when unsupported |
| Empty production corpus answers from demo seed | [policy engine:35](../../../hr-blockbot/apps/ai-service/app/rag/policy_engine.py#L35), [75-85](../../../hr-blockbot/apps/ai-service/app/rag/policy_engine.py#L75-L85) | Valid gap; P05-09 corpus approval/ingest/version/seed-disable and empty DB integration gate |
| Real streaming made optional | [existing user flow:565-570](../../../hr-blockbot/docs/18-user-flows.md#L565-L570) | Accepted; P05 now requires generated chunk before provider completion; completed-string slicing does not pass |
| Historical report can approve current attempt | [review:109-132](../../../hr-blockbot/apps/api/src/routes/reports.ts#L109-L132) | Valid gap; P04-07 active report/attempt identity CAS and R1/R2 regression |
| Missing assignment response loop | [baseline:269-271](../../../hr-blockbot/docs/18-user-flows.md#L269-L271) | Valid gap; P04-08 request/event mapping, reasonCode, current assignee, status unchanged, projection recovery and Admin handling gate |
| F4/F5/F7 silently cut | [scope inventory:85-91](../../../hr-blockbot/docs/18-user-flows.md#L85-L91) | Partially valid old draft; P10-07..10 now gives classification, concrete regression/delta tasks and explicit release gate. Do not call all documented requirements operating code or inherit historical cuts |
| OAuth/embed/attribute behaviors only named, no tasks | Current P03-09, P05-12 and P06-06 | Accepted detail gap; owned implementation/test subflows retained but business gates unresolved. No provider enrollment or scope approval inferred |
| P06-P10 are templates | Current detailed phase files P06/P07/P08/P10; removed-scope P09 | Stale snapshot rejected. P09 intentionally has no implementation tasks after explicit audio removal |
| Unsafe replay-evidence eviction | Current P03 step 5 | Already addressed in draft: no live evidence eviction, absolute family/cap policy and fail-safe re-login |
| Projection can overwrite unprojected history | Current P04 aggregate/P04-03 | Already addressed: immutable pending snapshots, bounded backpressure and required reconciler |
| Accepted chat never executes after crash | Current P05 execution-state design | Already addressed: durable accepted/running/terminal state, recoverable lease/dispatch and stable command IDs |
| Cancel/old attempts can publish stale chunks | Current P05 terminal/cancel design | Already addressed: epoch/final cursor, terminal CAS, late output rejection and cancel/commit precedence |
| Main AI/API assignee shape mismatch | [AI tool implementation](../../../hr-blockbot/apps/ai-service/app/agent/tools.py), [Project model](../../../hr-blockbot/apps/api/src/models/Project.ts) | P05-13 adds canonical-shaped fixture, missing-scope denial and internal identity boundary |
| Relative sibling links broken | Plan directory resolves ../../../hr-blockbot to source sibling | Rejected; existing targets resolve. Recheck links mechanically, not by visual path intuition |

## Remaining decisions
- P01 chosen baseline/integration revision, migration authority and isolated fixtures.
- D2 browser support, refresh ambiguity/re-login, OAuth identity/account linking.
- D3 external embed host/origins, approved contextual attributes, retention and offline operation allowlist.
- D4 HR support staffing, booking business case/calendar semantics, assignment-response Admin resolution.
- F4/F5/F7 missing implementation scope/estimates require explicit disposition; no approval to invent KPI formulas or deploy scheduler.

## Verification boundaries
Changes above are pending plan tasks, not application patches. CLI format validation and local Markdown link/checklist checks do not establish runtime security, provider availability, semantic grounding or operational readiness. Product acceptance requires the tests and evidence defined in each phase.

# CRM technical review and specified-gap closure — 2026-10-31

## Constraints and evidence

Review the complete tracked diff and untracked source from `71bd202` on dirty `main`; preserve all existing work. No reset, checkout, production data, real accounts, push or deployment. Do not change Python/AI models. Requirements precedence: owner's nine-point consent policy / ADR-021, then FR tables, then historical plans. Passing tests alone is not completion.

## Priority sequence

1. **P0 review / integrity:** inspect every changed source/config/test/document, legacy entry points, cross-unit scope, concurrent confirmation/cancellation, Mongo legacy shapes, audit/state invariants, BSON size and public-vs-local proof. Reproduce findings before or alongside fixes.
2. **P1 correct defects:** close canonical-department fallback leaks; make legacy version handling explicit and compare-and-swap safe; guard legacy helper from bypassing consent/audit; check assignment/responsibility consistency and actual BSON storage bounds. Preserve manual recovery for stalled handovers (incoming decline / scoped-manager cancel); do not invent automatic expiry/escalation.
3. **P1 complete specified F1 flows:** reuse existing profile screens/contracts/embedded requests; implement missing non-sensitive edit and approve/reject APIs, atomic concurrency, self-approval/scope protection, bounded history, reject/resubmit linkage and durable employee-visible decision history. No new HR privilege based on job title.
4. **P2 requirements traceability:** inventory F1–F7, operational CRM, ownership from `docs/16-project-plan.md`, and remaining gates. Employee/department canonical mapping/migration, KPI formula, escalation timeout and public-chain network decisions remain explicit TBDs, not new invented policies.
5. **P2 verify:** isolated API/database regression, contracts, complete web suite and required E2E, real browser→API→Mongo flows, typecheck, build, diff-check. Record actual failures/retries/warnings and precise scope of evidence.

## Ownership / excluded promises

RACI source: Phi = CRM web/HR/projects/notification UI; Hoàng = auth/realtime/scheduler/deployment (shared integration); Hòa = AI/chatbot/PhoBERT/KPI model/evaluation. This review can harden CRM boundaries but does not silently take over models or claim scheduler/chat execution/public-chain deployment complete. Full F1 administration remains a tracked gap until canonical unit mapping and migration policy are agreed; no production backfill.

## Deliverables

Final review report: function-by-function progress, findings/severity/reproduction/remediation, all changed-file inventory vs baseline plus this round, test results and evidence, prioritized acceptance checklist and TBD/owner list. No numerical completion percentage.

## Status

- [x] Read repo instructions, baseline/dirty inventory, requirements and previous plans.
- [x] Finish source review and reproduce defects; residual integration gaps retained in report.
- [x] Implement P0/P1 fixes and specified F1 edit/request/review/history/resubmit gaps. This does not complete FR-005 org/personnel administration.
- [x] Run all regression and browser/database gates: API 205, contracts 44, web 62, real browser/DB 7 groups; typecheck/build/diff-check PASS.
- [x] Publish final report and update backlog references.

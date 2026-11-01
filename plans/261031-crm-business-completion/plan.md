# CRM business completion — main, 2026-10-31

> Current status after technical review: see `../261031-crm-technical-review/review-report.md`. F1 non-sensitive edit and sensitive request/reject/resubmit/approve now work end-to-end; full personnel/department CRUD below is still unfinished. Due date is now mandatory for new work. P7/P9/P10 are not completed by this update.

## Baseline and ownership

- Starting commit: `71bd202` on `main`; working tree was clean before the fast-forward.
- This is the existing HR / multi-outlet operations CRM, NOT a sales-leads CRM.
- Preserve the team's landing, chat/AI provider work, provisioned accounts, real store CRUD and profile approval workflow.
- No production data mutation, account provisioning, password reset, migration, force-push or deployment is part of verification. Use isolated MongoDB fixtures.
- Business roles (`sm`, `aom`, etc.) describe jobs; only verified system roles and explicit `isGlobalAdmin` determine authority. Do not infer new permissions from a job title.

## Research and evidence

Internal sources: `docs/00-vision-scope.md` (F1–F7), `docs/18-user-flows.md` (UF-01/04/05/06/09), `docs/10-ui-ux-spec.md`, `docs/DESIGN.md`, ADR-020 and existing API/browser tests.

External primary sources consulted:

- OWASP API1:2023, object authorization at every object read/write: https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/
- MongoDB single-document atomicity and expected-value filters: https://www.mongodb.com/docs/manual/core/write-operations-atomicity/
- W3C modal focus, Escape, inert background and focus restoration: https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/
- Microsoft Dynamics 365 HR manager self-service separates own/team information and limits access by reporting scope: https://learn.microsoft.com/en-us/dynamics365/human-resources/mss-overview
- Zoho People employee tasks describes assigned work, personal task lists, comments and reminders: https://help.zoho.com/portal/en/kb/people/zoho-people-4-0/employee-handbook-zoho-people-4-0/employee-tasks/articles/zoho-people-employee-tasks
- Odoo official task/visibility pages were searched; indexed official summaries were available, but direct retrieval timed out. No implementation claim relies on unavailable page contents.

Application of vendor research is an engineering inference, not a claim that HR BlockBot implements those products: retain employee self-service vs manager scope, expose actionable assigned work and review queues, preserve history, and keep reminders visible in the remaining requirements. Do not import payroll/leave/sales modules outside the team's approved scope.

## User addendum — UI and complete CRM ownership

The user permits Antigravity (Anti) to design the UI, requires modern/professional HR styling, and explicitly keeps frontend, backend, database, API, authorization, business logic and testing in scope. Do not silently remove a module or redo correct team work. Plugin discovery returned no Antigravity integration and there is no local Anti command; do not claim a handoff occurred. Continue the implementation using the team's product design system; a later connected Anti can work on UI without owning or removing business logic.

Coverage inventory (each must be checked, not silently omitted): store directory/CRUD/detail; employee directory/filter/pagination; own profile/update/approval queue; account administration and global-only guards; provider settings and role guards; work assignment/progress/reports/review/history; scope-correct dashboard; responsive, keyboard, loading/error/empty and network conflicts. Existing scheduling/cash/attendance endpoints are explicitly disabled in the baseline and have no complete authorized operational source; retain their honest unavailable state instead of inventing records. F4/F5 model implementation is not to be mislabeled as CRM completion.

Confirmed gaps at baseline:

1. Project creation writes history `from: null` while the model requires a non-null value.
2. Project create/assign/progress/transition do not consistently enforce department/ownership scope; unlinked employees can fall through list scope.
3. Overdue filtering overwrites the chosen status; no text search or department directory for a global administrator creating work.
4. Project UI approves through generic transition, not an actual report review; pending report content/history is not shown and there is no report-list endpoint.
5. Separate project/report mutations can disagree after a failure; optimistic locking is absent for progress.
6. CRM overview aggregates global data even for scoped callers.
7. Native selects, stale response races, assignee truncation and inaccessible project modals remain in the work module.

## Stakeholders and acceptance matrix

| Actor | Read | Write |
|---|---|---|
| Global Admin | All projects and reports, scoped directories | Choose department, create/assign/edit work and review others' reports |
| Department Admin | Department work/reports and directory | Same operations, strictly within department; no self-approval |
| Employee | Assigned and same-department projects/reports as existing policy permits | Only assigned work: start, update progress, submit report |
| Unmapped account | No broad fallback | Fail closed; show actionable scope/link error |

Completion path: create draft → assign active in-department employee → employee starts → progress → submit report → manager reads actual report → reject with reason / resubmit → different manager approves → completed work is read-only. Old versions and duplicate concurrent actions return 409 without extra reports/history. Out-of-scope object IDs cannot disclose or mutate another unit's data.

## Plan (execute in order)

- [x] P0 — Fetch latest code, preserve clean `main`, inventory actors, scope, APIs, data and design rules; write this plan before implementation.
- [x] P1 — Shared project scope/DTO helpers; fix nullable initial history, create/assign validation, search/filters, safe edits and versioned progress. Add scoped read-only department directory. Preserve required skills and enrich only authorized work with assignee display names.
- [x] P2 — Close the report lifecycle: report listing/detail, self-approval guard, canonical single-project atomic submission/review and compatibility read projection for legacy reports. Generic transitions cannot bypass report submission/review.
- [x] P3 — CRM work UI: real department/assignee selection, own-task actions, searchable paginated work list, details/history/report contents, attachments as safe links, accessible forms, review through report API, conflict recovery and stale-response protection.
- [x] P4 — Scope overview metrics to the verified caller and retain honest unavailable KPI values; inspect staff/store/profile modules for integration regressions. No fabricated POS, attendance or Telegram success.
- [x] P5 — Isolated API lifecycle/security/concurrency tests, contract tests, browser workflow tests across Admin/Employee, responsive/keyboard checks, full mandatory build/typecheck/E2E gates. Final results: API 173/173, contracts 43/43, web 62/62 (includes mandatory E2E 17/17), real CRM integration five checkpoints, typecheck/build/diff-check pass. Three pre-existing landing CSS optimizer warnings remain. P6–P10 below remain unchecked; this does not mark the full CRM/thesis complete.

### Full-requirements follow-through — NOT removed from scope

The baseline closure above is not the entire thesis or a claim of a complete HR suite. The additional requirements audit found the following unfinished work, retained explicitly for the next implementation stages:

- [ ] P6 — FR-005 personnel/department administration **partly closed by the follow-through**: employee creation + scoped ordinary-profile editor + global department create + scoped metadata/manager edit are now implemented and tested locally (see `../261031-crm-technical-review/personnel-admin-report.md`). Full archive/reactivation/transfer/delete/merge/code rename and production mapping/import/uniqueness rollout remain unfinished; resolve policy before real personnel data changes. Store CRUD is not employee CRUD.
- [ ] P7 — Durable `project_events`, notification inbox/read acknowledgements, post-commit delivery and automatic deadline reminders (FR-014/038/041/042/044). Current append-only project history is not a substitute for claiming all these collections/jobs exist. Any scheduler must be restart-safe, deduplicated and match Render's actual process setup.
- [x] P8 — Superseded by the owner's explicit nine-point policy on 31/10/2026 and ADR-021: consent/decline/change/handover/scope/discussion/manual escalation implemented and separately tested in `../261031-assignment-consent/`. No sixth lifecycle status and no responsibility before consent. Reason taxonomy/automatic escalation threshold remain unconfigured optional policy, not silently guessed. AI model/public-chain deployment are explicitly tracked separately.
- [ ] P9 — Connect dashboard work/report services to confirmed chatbot write execution. The current Python `submit_report` tool returns a proposed action, not a MongoDB write; do not claim web submission proves chatbot submission works. Coordinate with existing confirm-before-write behavior and test both channels.
- [ ] P10 — KPI trend/evaluation integration, PhoBERT F4/F5 evidence and real deployment/UAT. Keep the AI team's model work intact; agree on the shared data/ownership and validation before claiming F4/F5/F6 complete. Telegram/POS/attendance require authorized configuration/source data, not fabricated responses.

P6–P10 are an explicit unresolved backlog, not a reduction or a checked completion. Details and verification evidence are in `implementation-report.md`.

## Storage decision

Keep single-document atomic writes (ADR-004). Report body and decision for new submissions belong to the owning Project's bounded embedded report history so project status + version + report decision commit together. Existing `reports` documents remain readable and can be projected for backward compatibility; projection failures must not make the canonical project decision disappear or pretend the request failed after it committed. No production backfill in this task.

## Definition of done and boundaries

- End-to-end CRM work/report lifecycle works against real API code and isolated MongoDB, not only mocked HTTP responses.
- Authorization and optimistic concurrency are tested on every mutation and on report reads.
- UI exposes only applicable actions; server remains authoritative; no green success without an acknowledged write.
- Tests: `pnpm -r typecheck`, `pnpm -r run build`, contracts test, API test, `node apps/web/test/e2e-revamp-flow.test.mjs`, plus new CRM browser tests.
- F4 PhoBERT and F5 AI/KPI formula/model are separate team work; do not invent scores or claim seven functions complete. Attendance/POS remain unavailable until a sufficient authorized source exists. External Telegram delivery remains unavailable without configuration.
- Update this plan/report with results, failures and any changes of approach. Do not label unchecked items complete.

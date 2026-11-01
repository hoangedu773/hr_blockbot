# Next CRM increment — specified personnel and department administration

Continue after technical review at the user's request. Preserve the 9-point policy and all dirty-main work. No push/deploy/Atlas/real users/AI-model edits.

## Scope executable without new HR policy

1. Add employee creation (FR-005) using existing shared schema and known department directory. Scoped Admin creates only in their exact existing scope; global Admin may select a known unit. Do not provision login accounts, change an existing employee's unit/status/code or invent archive/cascade policy.
2. Create departments for global Admin; scoped Admin may edit metadata of their existing department document. Code/ID remain immutable. Optional manager is directory metadata only, active in-unit employee; never grants auth privileges. Existing raw aliases remain readable, not silently converted into departments.
3. Preserve imported data. Reject ambiguous code/alias collisions for group review. Use partial unique technical creation keys for concurrent creates through these APIs, with preflight against both existing employee-code aliases / department codes; no legacy backfill or replacement of existing indexes. Concurrent external imports that bypass creation keys require the team's import/migration protocol.
4. Reuse employee directory/details/approval queue, department directory, Select/CrmDialog and shared typed API. Add create/edit forms and true success only after server acknowledgment. Preserve drafts on errors.
5. Test scope, validation, uniqueness/races, legacy records, no implicit accounts/role grants/KPI writes; real browser/database create/edit and complete regression gates.

## Explicitly not guessed

Cross-unit transfer with open work, employee archive/reactivation/deletion, department delete/merge/code rename and migration of imported aliases remain TBD. These are retained requirements/backlog, not implemented as unrestricted PATCH or destructive DELETE.

- [x] Model/contracts/API: employee create, explicit management DTO, ordinary profile edits, department create/detail/versioned edit; uniqueness readiness and no account/role/KPI writes.
- [x] UI integration: employee create/edit, department directory/create/edit/in-unit manager; existing Select/dialog/paging reused and duplicate/conflict drafts preserved.
- [x] Isolated tests + browser/database + regression: API 215/215, contracts 45/45, web 62/62, real browser/database 8 groups, typecheck/build PASS. Previous flaky mock timing corrected without modifying production chat/AI.
- [x] Update progress and remaining acceptance checklist; archive/transfer/migration and other integration work are still explicitly unfinished.

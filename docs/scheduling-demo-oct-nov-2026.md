# Owner-requested published demo calendars, October–November 2026

Decision on 2026-11-03: the owner requested all-store calendars for October and
November, allowed random generation for missing source data, then explicitly
requested direct creation/publication instead of drafts. This supersedes the
initial no-demo-seeding direction for this specific test-data operation.

LĐ means standing in front of the same shop to greet/attract customers. It does
not establish a separate mobile outlet or a new manager. The configured interval
is 06:00–10:00. A/A1/A2/B/B1/B2 use the already discussed catalog hours. Existing
catalog definitions are retained exactly; missing seven basic codes are added.

`apps/api/scripts/seed-published-schedule-demo.mjs` is a private operator workflow,
not an HTTP endpoint. It requires a currently authenticated system administrator
with accounts.manage and grants.configure, an explicit pinned owner approval,
and exactly hr_bot_test_363. Secrets arrive on stdin. Before images, plans and a
per-store journal stay outside source control. It never changes credentials,
grants, personnel status, canonical store mappings or the management graph.

Scope is all ACTIVE outlet records, excluding groups and archived invalid units.
Each outlet receives the ten Monday-start weeks intersecting 2026-10-01 through
2026-11-30; assignments never extend outside those dates. Stores without active
matched personnel retain empty published calendars, without invented employees.
Current active employees match by existing storeId or unique exact source store
name. This match is evidence for the demo only, not a canonical scope approval.
Unconfigured locations do not become visible to additional accounts by seeding.

Random generation is deterministic per employee/date, includes one unscheduled
day per complete week, uses four-hour shifts for sales and A/B for manager,
security and kitchen titles, and does not assign before a known hire date. These
are demo choices, not company scheduling or payroll rules. An empty cell remains
unscheduled, not an inferred OFF/leave/holiday category. No minimum coverage or
qualification compliance is asserted.

Source comparison is deliberately conservative: source employee code must be
unique; row must be an actual employee schedule; an explicit 1BNK or 749NK block
must corroborate the named store; shift must be a configured basic code; employee
must remain active and match that store. The block/address mapping is recorded
in the planner. Current employee home alone does not prove historical location.
Unresolved compound codes, anonymous support/shortage rows and registration rows
remain in the source/review report. Recognized employee/date source rows reserve
that day from random replacement. No old schedule row is changed or deleted.

Existing edited/published weeks are preserved in full. Only untouched empty
WEEK_CREATED records may be filled. Existing intervals, including a preceding
overnight publication, block overlap. Generated assignment IDs are deterministic.
The planner is revalidated under the shared writer/security lock; each store is
committed transactionally. Repeating a completed batch creates no duplicate data.

Publication is stamped at the actual import time, with the technical actor and
owner request in the hash-chained history. It does not impersonate a historical
SM approval. Per-assignment source.kind distinguishes DEMO_RANDOM from
LEGACY_MATCHED; personal/manager UI and chatbot projections preserve that label.
Source-matched hours come from the configured catalog, not verified clock-in
records. No attendance, KPI, payroll or notification batch is generated.

Validation: isolated single-node replica-set tests cover deterministic planning,
hire/date/week bounds, reserved source days, custom catalogs, ambiguous matches,
previous-day overnight conflicts, authenticated atomic writes, integrity and
idempotence. A real-browser integration checks the published manager grid,
personal source labels and mobile layout with exclusively synthetic actors.

# Configurable scheduling V1 — owner decision 2026-11-03

The owner selected a Shift Catalog screen to enter actual store hours. No company
hours, minimum staffing, payroll, leave entitlement or legal compliance rule is
inferred from legacy codes or configured by this release.

## User workflow

- Store-scoped managers configure named shift codes with one to four explicit
  working intervals. Overnight and split shifts use offsets relative to the
  assigned date, in Asia/Ho_Chi_Minh time. Catalog edits keep existing snapshots.
- A Monday-start store week has a private draft and a separately published
  assignment snapshot. Managers can stage multiple days/cells, save with a
  reason, then publish. A full-store grant is required for the full weekly board.
- Employees see only their own published assignments and change requests in
  which they participate. Same-store directory data is used for receiver choice.
- Cover: requester selects their own future shift, receiver agrees, independent
  manager approves. Swap: receiver chooses an own shift in the same store/week,
  requester confirms the offered shift, then an independent manager approves.
  Neither a participant nor their replacement account may self-review.
- Approval atomically updates both sides and matching draft under the common
  CRM writer and version CAS. No reassignment occurs at request/consent time.
  A manager must resolve an outstanding draft before approving a change.
- Republishing cancels pending consent requests with an explicit retained reason.
  Started shifts cannot be changed or removed through this scheduling workflow.
- Draft/save/publish/approval check actual interval overlaps, including adjacent
  weeks, overnight segments and reservations in other store drafts/publications.
  Active personnel and canonical store/reporting scope are rechecked. Future
  published commitments block exit/transfer until the shifts are reassigned.
- Publication and changes persist generic in-app notification events with the
  business update. Delivery has dedupe keys and visible manager retry. No SMS,
  Telegram or email delivery is introduced by this module.

## Data and access

New authoritative collections: operational_shift_definitions and
operational_schedule_weeks. Deterministic per-store code/week IDs use MongoDB's
built-in unique _id. Business snapshots and notification recipient events have
bounded hash-chained histories; tampered rows fail closed without normalization.

Legacy schedule_entries/weeks/blocks and attendance_corrections remain intact.
An employee may trace their own old entries by exact canonical employee code,
with explicit unverified store/hours labels. These are not published operational
assignments and never feed overlap checks, change approvals or chatbot answers.
Full legacy import needs explicit verified store/block and shift-hour mapping.

Eight explicit scheduling capabilities are independent from titles/job grades.
The operator rollout adds new grants inside existing active self/read/assignment
grant scopes. It preserves the original raw grants, profiles, dates and HR graph,
records signed account audit, increments securityVersion and revokes old sessions.
Technical administration receives no operational scheduling authority.

All THREE shared-database Node APIs must run compatible contracts before new
grants are written. The operator helper checks their scheduling access boundary
before enabling the onboarding module marker or changing accounts. New staff
receive scheduling self-service grants only after this marker is enabled.
No default hours or published schedule should be seeded into the live store.

Chat uses a date-bounded self schedule tool with no caller-selected identity or
store. The provider sees only published shift/location/local-time data, not
employee identifiers or legacy shift guesses. A receipt rechecks the whole own
published range, including an initially empty range, before returning an answer.

Validation: dedicated scheduling contracts/API tests, related authorization,
chat and lifecycle regressions, Python gateway tests, and the real-browser
scheduling.integration.mjs with isolated MongoDB and synthetic shift hours.

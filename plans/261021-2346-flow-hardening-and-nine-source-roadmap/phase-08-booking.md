---
title: "Phase 08: Native booking with conditional Mongo leases"
status: todo
---

# Phase 08 — Native booking

## Outcome and dependencies

Cal-inspired date/slot/timezone/select/review/confirmation UX, implemented natively in React18/Vite, ExpressTS and MongoDB. SPEC-03 is a behavior reference only: its Redis/locking/recurrence descriptions are **not vendor implementation claims or architecture requirements**. No Redis, multi-document transactions, embedded Cal runtime, payment, external calendar sync, recurrence or generic scheduling platform.

Depends on phases02/03/04 for auth, permissions, server time, version/idempotency/error contracts and approved business data. Booking is a **business-schema gate**, not an existing F1–F7 collection: PM must approve purpose (e.g. HR appointment), host identity, attendee permissions, availability owner, slot length, timezone, holidays, buffers, notice/horizon, cancellation/reschedule, capacity and retention. No assumed onboarding flow or expansion of parked UF-03. If these decisions are absent, this phase stays disabled/todo. Source `C:/work-space/hr-blockbot` at `9824325` remains read-only.

## Ownership and serialization

All paths below are proposed future ownership; this task only writes this phase. PM freezes contracts/docs before API; Web consumes API fixtures next; AI has no booking writer. No cross-worktree writes.

| Order / worktree | Owned paths | Handoff |
|---|---|---|
| PM `hr-blockbot-pm` | `packages/contracts/src/index.ts`, `packages/contracts/test/*.test.mjs`, `docs/04-domain-model.md`, `docs/05-data-model.md`, `docs/06-api-spec.md`, `docs/18-user-flows.md`, this phase | Signed schema/invariants/time policy, migration/index and error fixtures |
| API `hr-blockbot-api` | `apps/api/src/routes/booking.ts`, `apps/api/src/models/BookingSlot.ts`, `apps/api/test/*.test.mjs` | Atomic-update proof, contention/expiry/retry evidence, DTO fixtures |
| Web `hr-blockbot-web` | `apps/web/src/components/Booking.tsx`, `apps/web/src/services/api.ts`, `apps/web/src/App.tsx`, `apps/web/src/index.css`, `apps/web/test/*.test.mjs` | Explicit timezone, accessible slots, conflict/retry evidence |
| AI `hr-blockbot-ai` | No writes required; optional approved read-only link in `apps/ai-service/app/**` after Web handoff | No auto-booking, tools or new socket events |

Candidate filenames must be reconciled with module inventory. Shared entrypoints/contracts/styles are serialized across phases under their sole owner.

## Proposed schema and contracts — UNAPPROVED

### Minimal authoritative aggregate

Use a **pre-created, canonical, non-overlapping slot document**, not separate lease/booking documents requiring a transaction:

```typescript
// Proposal, not code to implement without PM sign-off.
BookingSlot = {
  _id, hostId, scheduleVersion, startUtc, endUtc, organizerTimeZone,
  state: 'available' | 'held' | 'booked', version,
  lease?: { ownerId, tokenHash, expiresAt, mutationId, bodyHash },
  booking?: { id, attendeeId, attendeeTimeZone, confirmedAt },
  receipts: [{ ownerId, mutationId, bodyHash, operation, result, createdAt }]
}
```

`receipts` is bounded by an explicitly approved retry horizon/cap; never evict a receipt while a valid retry may occur. When full, reject new mutations safely until retention permits cleanup, never discard dedupe history silently. Booked state itself retains confirm key/result for its lifetime. PM must approve retention, capacity and cancellation history before launch. If this bound is unacceptable, revisit aggregate design; do not secretly add distributed locks or transactions.

- Unique `(hostId,startUtc,endUtc)` prevents identical canonical slots only. It does **not** prevent arbitrary overlapping intervals: MVP must approve fixed disjoint slots, one capacity, immutable schedule/time range once exposed. API alone provisions slots with deterministic IDs; clients cannot create arbitrary ranges. Variable duration, overlapping schedule versions, cross-slot booking or resource pools are blocked pending a different approved invariant.
- Atomic acquire: `findOneAndUpdate` existing `_id` with `state:'available'` **or** `state:'held' AND lease.expiresAt <= serverNow`, plus expected version/scheduleVersion and allowlisted attendee. In that single update set new hashed random lease token, owner, finite expiry, increment version, append operation receipt. No upsert on acquire, no read-then-write lock. Same key/body retry returns stored result if still valid; expired lease gives explicit expiry and requires a **new** user attempt/key, never silently resurrects it.
- Atomic confirm: match `_id`, `state:'held'`, session owner, token hash, `expiresAt > serverNow`, expected version; same single update sets booked record/id and durable confirm receipt, unsets lease, increments version. Retry after response loss returns canonical confirmed booking for same owner/key/body. A stale holder cannot confirm, release or cancel a successor's lease. Same key with changed body gives `409`.
- TTL is not correctness: do **not** TTL-delete slot documents. Expiry is evaluated in the mutation predicate; delayed cleanup does not keep a hold alive. Lease release matches owner/token/version. Booked slots cannot be reclaimed by lease expiry.
- The slot aggregate is authoritative. Notifications/audit projections are separately reconciled with stable booking IDs; no atomic guarantee across documents. Receipt scope is `(authenticatedOwner,slotId,operation,mutationId)`; a key cannot authorize another slot or another owner. This narrow scope is explicit, not global exactly-once.

### Candidate HTTP and timezone behavior

- `GET /api/booking/slots?from=...&to=...&timeZone=<IANA>`: authenticated, bounded date range; returns `{slotId,startUtc,endUtc,displayTimeZone,scheduleVersion,version,state}` without other attendee identity.
- `POST /api/booking/slots/:id/hold`: `{clientMutationId,expectedVersion,scheduleVersion}`; response `{slotId,leaseToken,expiresAt,version}`. Token is an opaque capability still bound to user, kept in memory, never logs/URL/local storage.
- `POST .../:id/confirm`: `{clientMutationId,expectedVersion,leaseToken,attendeeTimeZone}`; response canonical booking `{bookingId,slotId,startUtc,endUtc,attendeeTimeZone,status:'booked',version}`. `POST .../:id/release` uses matching version/token; cancellation endpoint requires approved policy and explicit review. **Reschedule out of MVP**: no claim of atomic move across two documents; do not release old booking before a new one succeeds.
- `400` invalid payload/zone/range, `401/403` session/scope, `409` occupied/stale/key mismatch, approved expired-lease error, `429` rate bound, `503` uncertain backend. After timeout refetch/retry the same key; never show success from local UI or iframe callbacks alone.
- Store UTC instants plus IANA organizer/attendee zones; do not convert recurring local hours to permanent fixed UTC rules. MVP uses finite precomputed slots approved by host. Validate zone via supported runtime timezone database. Display zone selector and UTC offset on review; browser detection is a suggestion, user can override. PM selects supported date horizon and timezone database update policy.
- DST gaps are not generated as valid wall times; ambiguous folds require offset/instant disambiguation. Date navigation follows selected zone, including day/year boundaries. API accepts canonical slotId, never client wall time as booking authority.
- Socket conflict gate remains: docs18 nine events versus docs06 `chat:confirm` addition; PM reconciles before any socket changes. Booking uses REST/refetch; no vendor booking-success event or global registration.

## Test-first concrete steps

- [ ] **P08-01** PM/business signs appointment purpose/schema, one-host/disjoint-slot constraint, operating hours, zones/DST, lease/retry horizons, cancellation/retention and notification policy. Reject launch if any invariant undecided.
- [ ] **P08-02** PM adds failing schema/error/index fixtures; API adds real-Mongo single-document contention tests before code. Prove unique canonical slot and inability to create overlapping schedule versions through approved provisioning.
- [ ] **P08-03** API implements minimal slot reads and conditional acquire/confirm/release; each trust boundary validates session, scope, IDs, version, bounds and token hash. Add retry lookup/uncertain-result recovery, safe receipt cap and projection reconciliation.
- [ ] **P08-04** Web writes slot/timezone/state tests, then calendar/date/list selection, hold expiry countdown (advisory only), explicit review, submitting/confirmed/conflict/expired/unknown states. Server is expiry authority. Keyboard and text-list alternative required.
- [ ] **P08-05** Verify under contention, failover/timeouts and DST fixtures; business accepts timezone/cancellation copy. Enable only by approved release process. No payment/calendar/recurrence/reschedule expansion.

## Negative/concurrency matrix — proposed tests

| Case | Required assertion |
|---|---|
| Many simultaneous holds on one available slot | Exactly one current lease, all losers conflict; no double booking |
| Expired old holder versus new holder and late confirm/release | Only current token/version wins; booked slot never expires |
| Two confirms with same key after response loss | One booking ID/result; no duplicate side effect |
| Same key different payload, different owner or operation | Reject mismatch; no cross-user/token disclosure |
| Database write succeeds then connection drops | Same-key retry/refetch resolves uncertainty; no optimistic success |
| Cleanup delayed, app restarts, stale client clock | Server predicate still enforces expiry; no TTL correctness dependence |
| Arbitrary interval, second schedule overlapping existing slot | Reject provisioning/contract; unique equal-range index alone not accepted |
| DST spring gap/fall fold; half-hour zone; midnight/year boundary | Correct UTC instant and displayed zone/offset; no duplicate ambiguous slot |
| Invalid IANA zone, huge range, malicious attendee ID, token in URL | Validation/rate/scope denial, no secret logs |
| Receipt cap/horizon reached, cancellation races confirm | Fail closed/conditional conflict; no lost idempotency record |
| Keyboard/mobile, logout/hold abandonment, unavailable service | Accessible text fallback, no auto-confirm, safe expiry and retry explanation |

## Commands and evidence boundaries

Existing commands inspected in root/contracts/API/Web manifests; execute later in their respective implementation worktrees:

```powershell
pnpm --filter @hr-blockbot/contracts typecheck
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api test
pnpm --filter api build
pnpm --filter web test
pnpm --filter web build
```

New booking scenarios are **proposed** `node:test` additions, not existing passing tests. Contention requires isolated disposable MongoDB and explicit test URI; do not point at production. Browser/DST checks require new harness or recorded manual steps; no invented booking/Playwright script. No tests were run in planning.

## Security, rollback and business acceptance

Authorize every slot/lease/booking operation; opaque high-entropy token stored hashed server-side, bounded attempts/holds per user, no host private calendar/contact details exposed. Persist only approved attendee data; no public booking URL by default. Do not accept attendee identity from request. Audit state transitions using approved phase02 durability strategy.

Rollback: disable new holds/confirm UI and server acceptance under an approved controlled change; allow safe read/release and required human cancellation support. Preserve existing confirmed bookings and receipts. Let holds expire conditionally; never drop slot collection or restore stale data. Reconcile confirmation notifications by booking ID; do not recreate bookings. Business signs availability correctness, one-capacity constraints, DST review, uncertainty/cancellation support and privacy before enablement.

No automatic code implementation, commit, push, deploy or global registration.

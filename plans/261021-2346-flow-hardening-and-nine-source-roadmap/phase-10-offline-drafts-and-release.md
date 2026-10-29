---
title: "Phase 10: Safe offline drafts and all-phase release gates"
status: todo
---

# Phase 10 — Safe offline drafts and release

## Outcome and dependencies

Linear-inspired local draft/progress queue with explicit server idempotency and version guards; comprehensive release verification of **phases01–10 and all eight active sources**. Native React18/Vite, ExpressTS, FastAPI and Mongo, no Redis/multi-document transactions. SPEC-07 is a behavior reference, not a claim that this app implements Linear sync/CRDT/OT or its backend. Browser IndexedDB transactions may protect local records; they are not Mongo multi-document transactions.

Depends on P08 and the active P01-P08 contract/business gates; P09 was removed and is not a dependency. Offline replay is **blocked** until PM/API approve precise allowlisted mutation schemas, retry horizon, version preconditions and a single-aggregate idempotent mutation invariant. Without that proof ship local drafts only; do not make unguarded writes replayable. Source `C:/work-space/hr-blockbot` at `9824325` stays read-only.

## Ownership, serialization and release authority

Proposed implementation ownership only. PM contracts/docs first; API then Web then AI, no cross-writes. Shared files are edited serially by their sole owner. Integration receives frozen, reviewed outputs only with explicit human permission; plans never authorize automatic commits/push/deploy/global registration.

| Order / worktree | Owned files | Handoff |
|---|---|---|
| PM `hr-blockbot-pm` | `packages/contracts/src/index.ts`, `packages/contracts/test/*.test.mjs`, `docs/05-data-model.md`, `docs/06-api-spec.md`, `docs/11-quality-testing.md`, `docs/13-security.md`, `docs/18-user-flows.md`, release/runbook docs and this phase | Queue allowlist, retry/receipt/version contract, consolidated signed release matrix |
| API `hr-blockbot-api` | Existing approved progress route/model selected after inventory, `apps/api/test/*.test.mjs` | Atomic domain update + receipt proof, conflict/retry fixtures |
| Web `hr-blockbot-web` | `apps/web/src/services/{offlineDrafts,mutationQueue}.ts`, `apps/web/src/components/SyncStatus.tsx`, `apps/web/src/services/api.ts`, `apps/web/src/App.tsx`, `apps/web/src/index.css`, `apps/web/test/*.test.mjs` | Recovery/user isolation/conflict/accessibility evidence |
| AI `hr-blockbot-ai` | `apps/ai-service/app/**`, `apps/ai-service/tests/**` only if approved revalidation integration needed | No queued AI/tool writes; regression evidence |
| Integration `hr-blockbot-int` | Reviewed composition only after ownership handoffs; no unapproved contract edits | Actual full-suite result, rollback rehearsal and human go/no-go |

This author changes only phase06–10; lead owns plan index and phase01–05. New paths above are proposals, not existence claims.

## Proposed offline contracts — UNAPPROVED

### Small safe scope

- Local drafts: allowlisted non-sensitive report/progress text with owner namespace, schema version and expiry. **Do not** persist access/refresh/provider/lease tokens, sensitive profile fields, HR private data, raw chat history or excluded audio data. PM must classify allowed content/retention and shared-device policy; IndexedDB is not a secret vault or XSS defense.
- Queue allowlist candidate: `progress.patchDraft` or existing phase04 safe progress update only after business chooses exact operation. A report draft can remain local; final submit changes business state and is **not** automatically replayed. Never queue approvals/rejections, assignments, KPI overrides, profile sensitive requests, report final submit, project status transition, booking hold/confirm/cancel, chat sends or **any chat confirmation**. No general `/api/sync` engine or arbitrary HTTP request persistence.
- Candidate record `{id:UUID,ownerId,schemaVersion,entityId,operation:'progress.patchDraft',baseVersion,payload:{text,percent?},createdAt,expiresAt,clientSequence,status:'pending'|'sending'|'conflict'|'failed'|'synced',attempts}`. Exact fields/limits follow phase04; this shape is not approval to introduce a new progress entity. Server derives owner from session; persisted `ownerId` only partitions local storage. No serialized credentials/authorization headers/functions.
- Local IndexedDB transaction persists draft + queued record before displaying "saved on this device"; remote success is distinct "synced". If local quota/error occurs, keep editor memory, warn and offer user-initiated copy/export after privacy review; never falsely report durable save. Queue is bounded by count/bytes/age with visible recovery, never silently drops unsent work.
- Replay uses the **existing approved mutation endpoint** with `{clientMutationId:id,expectedVersion:baseVersion,...payload}`. API single-document conditional write must atomically update domain fields/version **and embedded mutation receipt** `{id,ownerId,bodyHash,result,resultVersion,createdAt}`. Separate dedupe collection then domain update is not atomic and not acceptable without an approved repair protocol. If domain aggregate cannot carry receipt, stop replay; draft-only fallback remains.
- Server checks existing receipt **before** stale-version rejection: same owner/key/body returns original result after lost response even if current version advanced; changed body `409`. Fresh key with stale baseVersion `409` and current safe state/version; UI shows compare/review, never automatic last-write-wins or merge. Receipt retention must cover maximum offline/retry horizon plus clock margin; expired queued item requires manual review/new action, never silent resubmission under a new key. Bound receipt cap without evicting still-retryable keys; reject new mutations if necessary.
- Acknowledgement loss after server commit: retain record, retry same ID; delete/mark synced only after canonical success. Crash after acknowledgement but before local deletion is safe by server receipt. Sequential drain per entity; new mutations must obtain canonical next baseVersion. Initial MVP permits one outstanding queued mutation per entity or explicit user-reviewed replacement before send; do not automatically rewrite keys/versions of already attempted operations.
- `navigator.onLine` is advisory; retry only actual transient network/approved `429/5xx` with bounded backoff and jitter/Retry-After. `400/403/404` stops that item; `401` pauses entire owner queue and requests login, never loops refresh; `409` pauses entity for manual review. No automatic user-account switch replay. Purge/lock owner drafts on logout per approved policy; auth expiry must not destroy unsynced data silently. Shared-device policy may require explicit discard/export before logout.
- Cross-tab drain: use native Web Locks where available; fallback is safe by server dedupe/version, not a fake localStorage mutex guarantee. Test unsupported Web Locks and concurrent tabs; do not store/broadcast bearer credentials. SPEC-09 refresh coordination remains separate: refresh tokens HttpOnly, access token memory-only, no adoption of source localStorage token examples.
- No service worker/background sync/install prompt requirement. Foreground explicit online recovery is enough; queue can be paused, inspected and discarded with confirmation. App upgrades validate schema; unsupported queue version becomes read-only/manual recovery, never destructive migration.
- **Socket gate:** docs18 allows nine events while docs06 adds `chat:confirm`; PM resolves docs/contracts before any change. Queue never replays confirmations, regardless of final event choice. REST retries do not expand socket names.

## Test-first steps

- [ ] **P10-01** PM freezes allowlisted operation/field classification, aggregate/receipt schema, version semantics, retry horizon, local retention/logout policy and error handling; business accepts draft-only fallback if replay prerequisites fail.
- [ ] **P10-02** API writes failing same-key/lost-ack/stale-version/body-mismatch/authorization tests, proves atomic domain+receipt update on actual Mongo; implements only approved safe operation.
- [ ] **P10-03** Web writes queue/storage/reducer tests first, then minimum IndexedDB store, explicit saved-local versus synced status, foreground serialized drain, conflict compare/manual retry and discard confirmation. Never persist generic network requests.
- [ ] **P10-04** Test tabs, logout/account change, crash/upgrade, disk quota, browser unsupported paths and long offline age. Verify prohibited operations cannot enter queue through UI, schema or forged storage record.
- [ ] **P10-05** Integration inventories actual manifests/tests at its revision; runs complete checks below against disposable infrastructure. Store actual exit codes/logs and limitations in PM-owned release evidence, not hardcoded assertion counts.
- [ ] **P10-06** PM/QA/security/business review every row of all-phase/eight-source matrix, reconcile socket contract, rehearse rollback/restore and approve go/no-go. Deploy/commit/push require separate direct authorization; feature remains off otherwise.

## Negative/concurrency matrix — proposed checks

| Scenario | Required assertion |
|---|---|
| Offline edit then reconnect, same operation sent twice | One canonical mutation and receipt; UI distinguishes local/synced |
| Commit succeeds, response lost; crash before local dequeue | Retry same key returns original result; no duplicate progress/audit |
| Two tabs replay same key; Web Locks unavailable | Server dedupe safe; one result; no duplicate writes |
| Different keys share same baseVersion | One winner, other conflict; preserved local text, no automatic merge |
| Queue forged as approval/chat confirm/booking/final submit | Reject allowlist before network; server independently rejects schema/permission |
| Same key altered body/entity/owner, foreign local queue | Reject without data leak; never replay after user switch |
| Expired session/consent, revoked role, entity deleted | Pause/login or terminal action; no refresh/retry loop or stale privileged write |
| Receipt/queue horizon exceeded or cap reached | Stop and explain manual review; no key regeneration or unsafe history eviction |
| Storage denied/quota, interrupted transaction, schema upgrade | No false saved state; recover editor data; unsupported schema retained safely |
| Long outage, 429, 5xx, navigator online but disconnected | Bounded retry, Retry-After, no request storm |
| New online edit while offline pending record exists | One-per-entity guard/manual reconciliation, no version rewriting after send |
| Logout/shared device/XSS payload in draft, keyboard/screen reader | Approved purge/isolation, escaped content, accessible conflict and sync announcements |

## Comprehensive release matrix: phases01–10

Every row is a **future acceptance gate**, not a passed result. Record owner, tested revision, environment, actual command/manual procedure, output, evidence location and approver. Do not mark complete with mocks alone when real concurrency/provider behavior is required.

| Phase | Required release evidence |
|---|---|
| 01 Baseline | Reproducible worktree/revision/env inventory; source read-only; real scripts versus missing/proposed checks distinguished |
| 02 Contracts/security | Frozen errors/schemas, auth/RBAC/ownership negatives, CORS/CSRF/cookie/secret/redaction review, socket nine-versus-ten decision, single-document invariants |
| 03 Auth/profile | Login/logout/refresh replay and multi-tab race, memory/HttpOnly tokens, Employee self-scope, sensitive-change approval/reject/resubmit, exactly two roles |
| 04 Projects/reports | Approved project/report lifecycle, version races, progress/report ownership, Admin review, KPI/matching/explanations where in approved scope, no partial/duplicate mutation |
| 05 Chat/RAG/providers | Streaming reconnect/order/terminal/error, clientMessageId dedupe, fresh confirm/reject/expiry, prompt injection, safe citations/source authorization, provider timeout/routing/settings, no secret or cross-user leakage |
| 06 Forms/feedback/palette | Branch/reset/review and sensitive-field route, per-response helpfulness not pulse survey, vote dedupe/privacy, CmdK keyboard/context/role accessibility |
| 07 Handover/traces | Single Admin claim, fenced late bot output, no-staff/reconnect/resolve, redacted ordered timeline, no third role/full canvas |
| 08 Booking | Signed business schema, disjoint canonical slots, conditional hold/confirm race, expiry/retry receipts, UTC/IANA/DST, uncertain outcome recovery, no Redis/transaction assumption |
| 09 Removed | Audio excluded by explicit user decision; no implementation or release gate |
| 10 Offline/release | Atomic domain+receipt invariant, lost-ack/tab/account/version/upgrade recovery, prohibited operations never replayed, backup/restore and rollback rehearsal, human go/no-go |

### Eight-source behavior coverage (no PostHog)

| Source | Feature destination and acceptance boundary |
|---|---|
| SPEC-01 Chatbase | Phase05 widget open/close/mobile focus/scroll restoration, safe streaming/citations, authenticated tool proposal + explicit confirmation; phase06 fixed form UI, no arbitrary host tools/postMessage trust |
| SPEC-03 Cal | Phase08 native date/slot/timezone/review/confirmed UX; Mongo lease not copied Redis, no iframe/payment/calendar/recurrence requirements |
| SPEC-04 Typebot | Phase06 guided profile/report steps, branching, back/edit/review/validation; bounded fixed definitions, no generic graph/code runner |
| SPEC-05 Formbricks | Phase06 response helpfulness, contextual eligible-response trigger, dismiss/cooldown and optional reason; no parked pulse survey/segment engine |
| SPEC-06 Dify | Phase07 ordered execution status/duration/token/error timeline and safe streaming rendering; not full workflow canvas/raw snapshots/chain-of-thought |
| SPEC-07 Linear | Phase06 CmdK accessible contextual navigation; phase10 safe local drafts/progress queue with receipts/version conflicts, no CRDT/OT claim |
| SPEC-08 Tidio | Phase07 bot/human request/queue/claim/resolve/reconnect with Admin and honest no-staff state; no copied event names/third role/unsafe replay queue |
| SPEC-09 Supabase | Phase03 and phase10 multi-tab refresh coordination, rotation replay protection, access memory/refresh HttpOnly; PKCE only if OAuth separately approved, no localStorage tokens/cookie chunking copied |

SPEC-02/Vapi audio and SPEC-10/PostHog are deliberately excluded: no analytics toolbar, recording, autocapture or product analytics expansion. References constrain user-visible behavior; no claims about proprietary vendor backend algorithms or wholesale SDK parity. Business-unapproved features remain gated, not silently removed or represented as shipped.

## Existing-flow coverage beyond F1/F2/F3
- [ ] P10-07 PM resolves baseline F4/F5/F7 coverage using P01 inventory. They remain documented in-scope requirements, not implicitly cut by an older deadline. Classify each as running, partial or unimplemented; record an explicit maintainer decision before claiming full-project completion. Core F1/F2/F3 acceptance is not full F1-F7 acceptance.
- [ ] P10-08 For existing matching/ranking paths, AI owner tests same-department candidate filtering, stable scoring, no invented explanation contributions, low-confidence abstention, workload/candidate-data provenance and ranking evaluation on approved fixtures. API/Web owners wire only approved candidate-selection/review controls, reuse P04 assignment command with confirm, and prohibit automatic assignment. Missing ranking UI/endpoints/model capabilities are an implementation delta requiring a dedicated estimate/contract, not a dead dashboard link.
- [ ] P10-09 For existing KPI paths, AI/API owners test Employee self-only and Admin department-only reads, period boundaries, missing-data behavior, reproducible formula/data provenance and prohibited PII egress. A dashboard link must resolve to an authorized screen or honest unavailable state. New scoring/override/self-review workflows absent from the selected revision require explicit PM contract/business approval; do not invent KPI values or treat level as role.
- [ ] P10-10 For reminder/digest/dashboard paths, API owner specifies durable notification identity, recipient scope, delivery/read semantics and idempotent scheduled-job claim; Web owns authorized unread/read/error/empty states. Test restart, duplicate execution, timezone/day boundary, reassignment/revocation suppresses stale recipients, and disconnect/refetch convergence. No push-only durable claim or automatic new scheduler dependency. Missing scheduler/notification API is reported as a scoped delta, not a completed flow. Full-project release remains blocked until the accepted F4/F5/F7 disposition is implemented and verified or explicitly deferred by maintainer.

## Real commands versus proposed tests

Commands below exist in inspected baseline manifests or `scripts/demo-verify.mjs`; rerun only later from **implementation/integration** worktrees after dependency/environment checks:

```powershell
pnpm --filter @hr-blockbot/contracts typecheck
pnpm --filter @hr-blockbot/contracts test
pnpm --filter @hr-blockbot/contracts build
pnpm --filter api test
pnpm --filter api test:auth
pnpm --filter api build
pnpm --filter web test
pnpm --filter web build
pnpm build
# From apps/ai-service with its approved Python environment:
python -m pytest -q
# From integration root; inspect updated runner before running:
pnpm demo:verify
```

`api test` and `api test:auth` currently invoke the same `node --test test/**/*.test.mjs`; do not count them as different coverage. Web/contracts use node:test too. `demo:verify` invokes contracts/Web/API/Python suites, sets a local Mongo test URI and hardcodes descriptive assertion totals; those totals are not evidence. Test DB must be disposable and explicitly checked. Root `lint` exists but child lint scripts were not found in inspected API/Web/contracts manifests; do not claim a lint pass. `generate:openapi` deliberately exits 1 (tooling deferred), not a release success command. New offline/booking/handover/browser/accessibility/load/restore checks above are **proposed scenarios**, not existing commands or executed tests. No implementation tests run during this documentation task.

## Security, rollback and business go/no-go

Security review includes token/PII absence from browser storage/logs, owner-scoped draft access, escaped rendering, refresh/cross-tab races, CSRF/CORS, service callback trust, quotas/rate limits, redacted traces/citations and explicit write confirmation. Offline usability must never weaken server authorization or mutation preconditions. No service-worker cache of authenticated API responses without separate approval.

Rollback sequence: (1) pause queue draining and new gated capabilities via approved release control/revert; (2) preserve/export unsynced drafts only under approved privacy flow, never automatically delete; (3) retain API receipt/version compatibility through the retry horizon, keep existing domain reads/text chat usable; (4) drain/resolve active human/booking obligations with owners, not blind replay; (5) verify backup restore and reconcile notifications/audits by stable IDs without repeating domain writes. No destructive migration/collection drop or restoring older domain values over newer updates. Local queue format rollback must remain readable or have manual recovery.

Business go/no-go requires all prior schema/retention/staffing/timezone/consent/spend gates signed, all required actual checks recorded, failure/unknown rows explained, accessibility/text fallback accepted and rollback owner available. Documentation completion is not implementation/release completion. No automatic code implementation, commits, push, deploy or global registration.



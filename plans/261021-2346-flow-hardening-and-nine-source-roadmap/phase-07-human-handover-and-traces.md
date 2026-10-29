---
title: "Phase 07: Human handover and execution traces"
status: todo
---

# Phase 07 — Human handover and execution traces

## Outcome, references and dependencies

Tidio-inspired bot-to-human handover, using **existing Admin**, never a third operator role. Dify-inspired execution **timeline**, not workflow builder/canvas. SPEC-08 and SPEC-06 inform user-visible behavior only; their vendor events, routing algorithms and persistence are not implementation facts. Native React18/Vite + ExpressTS + FastAPI + Mongo, one Socket.IO instance, no Redis or multi-document transactions.

Depends on phases02/03/05: ownership, durable conversations, message idempotency, tool confirmation guards, provider failure semantics and redacted run metadata. Phase06 feedback may offer a handover link but cannot initiate a privileged write. Baseline source `C:/work-space/hr-blockbot` at `9824325` is read-only. All schemas below are proposed, unapproved; this phase remains todo.

## Ownership: PM first, then API, Web, AI; no cross-writes

| Serial owner / worktree | Proposed owned files | Required handoff |
|---|---|---|
| PM `hr-blockbot-pm` | `packages/contracts/src/index.ts`, `packages/contracts/test/*.test.mjs`, `docs/06-api-spec.md`, `docs/18-user-flows.md`, `docs/13-security.md`, this phase | Approved handover transitions, event decision, trace allowlist/retention |
| API `hr-blockbot-api` | `apps/api/src/routes/{chat,handover,traces}.ts`, `apps/api/src/models/{Conversation,ExecutionTrace}.ts`, `apps/api/src/socket.ts`, `apps/api/test/*.test.mjs` | Durable state/claim fixtures, paging and AI ingest contract |
| Web `hr-blockbot-web` | `apps/web/src/components/{Chat,HandoverPanel,ExecutionTimeline}.tsx`, `apps/web/src/services/api.ts`, `apps/web/src/App.tsx`, `apps/web/src/index.css`, `apps/web/test/*.test.mjs` | Queue/offline/claim conflict/timeline evidence |
| AI `hr-blockbot-ai` | `apps/ai-service/app/**`, `apps/ai-service/tests/**` (exact files selected after module inventory) | Redacted sequenced execution facts, cancellation/fencing tests |

New filenames are candidates; reconcile existing module names before execution. Shared contracts/styles/entrypoints remain exclusive to their owner and serialized across phases. API accepts mocked AI fixtures first; AI implements the frozen contract last. Integration never resolves contracts by having API/Web/AI edit PM files.

## Proposed contracts — UNAPPROVED

- Conversation-owned handover subdocument: `{state:'bot'|'queued'|'human'|'resolved', requestedAt?, reasonCode?, assignedAdminId?, claimedAt?, version, botGeneration}`. Retention, queue visibility, hours and SLA require business approval; do not invent queue position/estimated wait without authoritative data. Proposed fixed reason codes avoid free-text HR leakage.
- Candidate REST: `POST /api/conversations/:id/handover/request`, `POST .../claim`, `POST .../resolve`, `GET /api/handover/queue`; mutation `{clientMutationId,expectedVersion}` plus reason where approved. Request owner only; claim/resolve authorized Admin only. Claim uses one atomic conditional update on conversation `{state:'queued',version:expected}`; two Admins cannot both own it. Same request key/body returns canonical result, different body conflicts. No additional `Operator` role or permissions inferred from employee `level`.
- Queued mode: block new bot generation until explicit approved return-to-bot transition. In-flight bot output checks `botGeneration` before saving/display; request/claim increments fence in same conversation update. Cancellation best effort never permits late bot output to masquerade as human response. Human replies use existing message persistence/clientMessageId and author attribution; not tool write authority. Resolution cannot approve a pending domain mutation. New bot session requires a fresh user action; old confirmation challenges expire.
- One conversation is the authority for handover; notifications and trace projections are best-effort/reconciled separately. No claim of atomic conversation+message+notification+audit writes. API approval gate must settle durable-message/fence race: acceptance condition is no post-fence bot message presented as authoritative; separate message inserts need recheck/filter and reconciliation.
- Trace candidate read DTO: `{runId,conversationId,status,startedAt,endedAt?,steps:[{stepId,sequence,kind:'retrieval'|'model'|'tool'|'guard',label,status:'running'|'succeeded'|'failed'|'cancelled',durationMs?,tokenCount?,safeErrorCode?}],nextCursor?}`. Tool arguments, prompts, chain-of-thought, provider secrets, raw policy snippets, HR records and stack traces excluded. Counts/durations may be unavailable, never fabricated.
- Candidate `GET /api/conversations/:id/runs/:runId?cursor=...`; conversation owner gets approved safe projection; Admin access constrained by business scope, not unrestricted HR trace access. Internal AI ingest uses service authentication, bounded records, unique `(runId,sequence)` and approved retention; duplicate same payload no-op, conflicting sequence rejected. Terminal runs cannot revert to running. No durable resume/checkpoint promise.
- **PM socket gate:** docs18 permits nine names, docs06 adds `chat:confirm`. Resolve docs/contracts before using ten or adding any. Prefer REST polling/refetch and existing approved chat/notification envelopes; no copied `operator_assigned`, `node_started` or vendor SSE registrations. Proposed trace transport does not silently expand socket enum.

## Test-first steps

- [ ] **P07-01** PM/business approves human staffing, absence/offline path, scope/retention, transitions, trace redaction and socket reconciliation. Freeze API/AI fixture revision before implementation.
- [ ] **P07-02** API authors failing owner/Admin/state/version/idempotency tests, concurrent claim and bot-fence tests. Implement conditional single-document transitions and permission-scoped queue; no automatic business writes from Admin conversation messages.
- [ ] **P07-03** Web tests handover reducer first; adds request, queued/no-staff explanation, assigned Admin, reconnect/refetch, resolve and explicit resume. Always preserve transcript and text fallback; no fake online status or wait time.
- [ ] **P07-04** Web tests timeline projection/order/terminal states first; renders accessible chronological list, duration/status and safe failure. Plain escaped text or existing safe Markdown only; no React Flow/canvas dependency.
- [ ] **P07-05** AI writes failing trace redaction/sequence/cancellation tests then emits safe metadata only. API validates trust boundary and enforces generation fence; tool guard still owns permissions and fresh confirmation.
- [ ] **P07-06** Capture executed checks and business acceptance, verify disabled-feature fallback; no implementation/test-pass claim from this plan.

## Negative/concurrency matrix — proposed tests

| Scenario | Required result |
|---|---|
| Employee claims queue, foreign conversation read, forged Admin ID | Denied, no metadata disclosure; role derived server-side |
| Two Admins claim same version | Exactly one success, other conflict; refetch assignee |
| Duplicate request/resolve after lost response | Same canonical result; no duplicate transitions/notifications |
| Request during token stream; late AI chunk/save | Generation fence prevents authoritative late bot reply; human attribution intact |
| Resolve races human send or second claim | Version conflict handled; no reopened stale assignment |
| Admin logs out/unavailable; network reconnect | Honest unavailable state, durable refetch, no auto-claim or replayed confirm |
| Out-of-order/duplicate trace steps, terminal then running | Stable ordering/dedupe; terminal state preserved; conflicting event rejected |
| Malicious tool argument, secret in exception, oversized trace | API drops/rejects unsafe payload, bounded storage; no raw prompt/secret UI/log |
| Missing duration/token count, trace collection failure | Mark unavailable; chat still usable; no fabricated metrics |
| Screen reader, keyboard, mobile, long list | Ordered semantic list, paging, polite live updates, restored focus |

## Commands: existing versus proposed

Existing manifests and `scripts/demo-verify.mjs` were inspected in read-only source. Run later in the respective implementation worktree:

```powershell
pnpm --filter @hr-blockbot/contracts test
pnpm --filter @hr-blockbot/contracts typecheck
pnpm --filter api test
pnpm --filter api build
pnpm --filter web test
pnpm --filter web build
# From apps/ai-service with its approved Python environment:
python -m pytest -q
```

The Python command exists in the inspected demo runner; environment/dependencies must be checked before execution. New matrix cases must be authored first; no existing coverage claimed. No tests executed here. Do not rely on hardcoded runner assertion totals.

## Security, rollback and business release gate

Service-to-service auth, request size/rate bounds, server-owned author IDs and permission checks on every read/write. Human support consent explains visibility and retention. Trace is operational metadata, never chain-of-thought disclosure. No new public service endpoints or third-party scripts without approval.

Rollback: stop new handover requests and trace ingestion via approved release control/revert; retain assigned conversations for Admin resolution or provide explicit unavailable contact path. Do not silently return active human conversations to bot. Read-only transcript remains; pending confirms stay invalid. Preserve records under retention; reconcile notifications/projections without replaying domain actions. Business signs staffing/no-staff copy, access scope, retention and no bot/human double response before enabling.

No automatic code implementation, commits, push, deploy or global registration authorized.

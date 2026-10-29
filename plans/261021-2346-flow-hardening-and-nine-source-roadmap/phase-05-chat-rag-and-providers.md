---
title: "Phase 5: End-to-end policy chat, citations and provider safety"
status: todo
---

# Phase 5: End-to-end policy chat, citations and provider safety

## Outcome / dependencies / owners
Depends on P03–P04 and approved P02 event/storage contracts. Chatbase-inspired UX, existing Socket.IO transport, FastAPI RAG; no duplicate SSE gateway. Estimate 6–10 days, reduced only after verified reuse.
PM: schemas/docs first. API: app routes, socket gateway, conversation/message persistence, settings/provider outbound validation, tests. AI: agent/RAG/provider implementations and tests only in AI worktree. Web: ChatPanel/chatSocket/AdminSettings/API adapters and tests only in Web worktree. API and AI may work against frozen contracts independently; one writer per app; Web integration after adapters exist.

## Design decisions
- Main chat client emits messages but server currently has authentication/room join only. Implement/reuse conversation REST endpoints and validated handlers; verify conversation membership for every message/confirm, not only handshake.
- Persist accepted command before ACK; durable dedupe keyed by actor/conversation/clientMessageId and payload identity. Define bounded transcript and dedupe retention consistent with retry window; do not store infinite messages in one document. Accepted does not mean completed or read. Persist accepted/running/terminal execution state, attempt generation and bounded lease/recovery eligibility. Recovery must restart or safely fail an accepted-but-never-started job; dedupe alone is not execution recovery. AI retries cannot replay domain writes outside command dedupe. Worker claim/finish uses CAS and attempt fencing; expired attempts cannot publish a second final result.
- Reconnect fetches durable final state/cursor. Track seq per message, drop duplicate chunks, detect gaps and recover final text; never append duplicated/out-of-order text silently. ACK timeout and retry bounded; intentional disconnect stops retry. Raw Socket.IO buffering plus custom replay must not double execute. P02 must add stable message/attempt identity and final sequence or equivalent scoped final-state GET contract; current done payload is insufficient for gap recovery. Client ignores chunks after terminal/cancel and from superseded attempts. Persist cancellation/terminal fencing server-side so late provider output cannot revive a cancelled or human-owned turn. Define cancel-vs-confirm commit ordering: cancellation winning before domain commit blocks it; cancellation after commit returns committed truth, never claims undo. Inject crashes before AI dispatch and after AI return before final persistence; test late old-attempt chunks/done after cancel and after recovery.
- Enforce session validity on long-lived sockets, disconnect/re-auth on expiry/revocation and reject stale room use. Room identity comes only from claims and scoped server data.
- API injects verified scope and runtime provider config into authenticated internal request; browser cannot choose userContext or arbitrary tool. AI service fails closed when internal service secret absent in non-local deployments. AI reads only; all confirmed writes execute through shared API domain commands.
- True generation streaming remains an existing contract requirement, not an optional enhancement. Current AI endpoint returns JSON: implement a bounded API↔AI streaming protocol under P02 review, propagate cancellation/backpressure and preserve existing Socket.IO client transport. Test first generated text chunk arrives before provider completion, fragmented/malformed frames, timeout and disconnect. Do not count slicing a completed string as streaming compliance; buffered fallback must be labelled and cannot replace the acceptance gate without explicit approved contract change.
- Policy answer requires allowed, versioned evidence; missing evidence abstains. Reuse measured eval corpus, no invented production policies. Sanitize links/Markdown; render text safely. No raw prompts, bank/salary/identity fields or provider secrets in traces/egress.
- Settings update/test remains Admin-scoped. Validate provider type/base URL/model/timeout; SSRF defenses for configurable outbound URLs (HTTPS/allowlist, DNS/private IP and redirect policy), bounded network response and secrets masking. Account for approved local fixture endpoints separately from production.

## Tracked work
- [ ] P05-01 Reuse verified implementations; add failing conversation-membership, dedupe, scope and provider safety tests.
- [ ] P05-02 Implement durable conversation REST lifecycle, bounded retention, authenticated chat/confirm gateway, ACK and final-state recovery.
- [ ] P05-03 Connect gateway to internal AI with cancellation/time budgets, provider-config redaction and service authentication; distinguish actual streaming capability.
- [ ] P05-04 Bind proposals to exact actor/conversation/action/args/version/expiry; one-use confirm invokes the existing domain command, replay-safe. Rejection/cancel never writes.
- [ ] P05-05 Complete citations, abstain/degraded/error UI, history resume, mobile scrolling and keyboard focus behavior. Persist identity server-side, not anonymous widget cookie.
- [ ] P05-06 Validate provider configuration/testing, SSRF protections, quota/timeout fallback and key leakage tests. Keep AES-GCM secrets server-side; display only keyHint.
- [ ] P05-08 Cover existing matching/KPI/deadline tool paths and dashboard fallbacks discovered in P01. Scope-check get_my_kpi/get_department_kpi, verify no invented tools for router entries with tool=None, avoid dead navigation to absent /kpi or /admin/matching pages, preserve honest unavailable UX. Scheduler/reminder paths, if present in selected revision, require idempotency/recipient-scope regression; their absence is recorded as an explicit business scope question, not fake delivery.
- [ ] P05-07 Run RAG scoped retrieval/abstention eval and full Web→API→AI tests. Record corpus/version/provider and actual metrics, never quote SPEC example accuracy/cost.

## Additional corpus, egress and evidence work
- [ ] P05-09 PM/business names authoritative policy owner and approves versioned corpus, effective dates, scope, source rights and retirement rules. AI owner implements ingest/chunk/index validation and disables seed/demo fallback in non-test runtime; an empty or unavailable approved corpus abstains or reports unavailability, never answers from demo GUTA chunks. Test empty DB, removed corpus, expired/forbidden documents and ingestion rollback. Keep offline fixtures explicitly test-only; record corpus/model/index versions and actual calibration results.
- [ ] P05-10 Enforce deterministic outbound data minimization/rejection at the shared provider boundary, covering free-text questions, evidence, tools, embeddings, retries and every fallback provider. Server DTO allowlists alone do not stop users pasting bank/salary/identity data. PM defines data classes and residual detection limits; never claim regex guarantees no PII. High-risk/uncertain input fails closed or uses approved local/extractive mode. Provider spies with sensitive canaries assert prohibited content never reaches any outbound call; redact logs/errors too.
- [ ] P05-11 Verify supported claims, not merely valid citation indices. Add answers contradicting evidence with valid [1], unsupported benefit claims, malicious instructions embedded in documents and mixed supported/unsupported sentences. Prefer approved extractive output or abstain when claim support cannot be established; a second LLM assertion alone is not proof. Report grounding accuracy/failure examples separately from marker validity.
- [ ] P05-12 Retain external embedding as a blocked D3 subflow with PM-approved host/origin/auth contract. API owns scoped session issuance; Web owns a minimal iframe host/child bridge only after actual host requirements are known. Validate both message origin and source, version/type/payload size, exact targetOrigin, authorization and teardown. Test spoofed origin/source, duplicate init, unknown action, resize/mobile scroll/focus cleanup and expired session. Do not accept host-issued arbitrary tools or use anonymous widget identity as employee authorization. No external host deployment is authorized.
- [ ] P05-13 Fix canonical assigneeId scalar versus AI assigneeIds array drift using shared contracts/approved adapters; test an actual API-shaped project in AI reads/proposals, missing Admin department fails closed and userContext/providerConfig cannot be supplied by browser. Add project initial-history null validation regression and fail-closed missing resource department mapping to P04/P02 fixture sets.

## Required negative/recovery cases
| Case | Pass condition |
|---|---|
| Same message replay, multi-tab reconnect | One accepted logical message/tool command; stable final result |
| Same ID altered text / forged conversation | Conflict / 403 without leaked history |
| Commit then process crash before ACK | Retry recovers durable result; no second domain write |
| Missing/duplicate/out-of-order chunks | Detect/recover correct final text or show explicit incomplete state |
| Token expires/revoked while connected | Message/confirm denied, room no longer leaks updates |
| Empty corpus / forbidden source / provider unavailable | Abstain or degraded error, no fabricated citations |
| Prompt asks to bypass role / mutate directly | Tool allowlist, scope and confirm remain authoritative |
| Confirm twice / stale version / different user | No duplicate write; stale/unauthorized rejected |
| XSS Markdown / javascript citation / secret trace | Safe rendering/redaction, no execution or leak |
| Provider URL loopback/private redirect/DNS change | Denied by production policy; bounded error, no secret exposure |
| User cancels / network drops | Work cancelled where supported, no false success; final committed state recoverable |

## Verification commands
Existing: `pnpm --filter @hr-blockbot/contracts test`, `pnpm --filter api build`, `pnpm --filter api test`, `pnpm --filter web build`, `python -m pytest apps/ai-service/tests -q`. Extend existing suites first; inspect pytest configuration and fixtures before invocation. Proposed browser executable `node apps/web/test/flows-chat-provider.mjs` is not an existing command until implemented. Real provider checks require explicit budget/key approval; fixture tests do not prove external availability. Existing eval scripts discovered in P01 are reused; do not fabricate an eval command.

## Rollback and release gate
Separate read-only chat from tool writes. Disable confirmed mutations on any uncertain idempotency/permission result, preserving durable evidence. Provider config rollback bumps version and invalidates cached chains without exposing keys. Retain existing stored data; rollback compatibility must read prior DTOs. Core release requires F1/F2/F3 multi-role smoke before gated booking launch.



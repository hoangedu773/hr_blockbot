---
title: "Flow hardening and eight-source roadmap"
description: "Evidence-gated completion of existing HR flows, followed by eight scoped product adaptations. Planning only; implementation not authorized."
status: pending
priority: P1
effort: "Core 17–30 engineering days; extensions re-estimated after gates"
branch: feat/pm-agentkit
tags: [auth, hr, project, chatbot, ai, reliability, roadmap]
created: 2026-10-22
---

# Flow hardening and eight-source roadmap

## Outcome contract
**Outcome:** existing authentication, personnel/profile approval, project/report, policy chat/RAG and provider configuration flows work end-to-end with authoritative permission checks and recovery. Add a detailed, gated implementation path for Chatbase, Cal.com, Typebot, Formbricks, Dify, Linear, Tidio and Supabase-inspired behavior.
**Constraints:** React 18/Vite SPA, Express/TypeScript, FastAPI sidecar, MongoDB single-document atomic updates, shared Zod contracts; two roles only; app writes in their own worktrees, docs/contracts/plans in PM worktree. Keep access token in memory and refresh cookie HttpOnly. No automatic commit/push/deploy or global AgentKit registration.
**Non-goals:** product implementation during this session; stack replacement; generic visual workflow engine; speculative Redis/CRDT infrastructure; reviving disabled legacy cash/attendance/scheduling; reopening parked leave/onboarding/OKR/pulse scope. Audio/voice and PostHog (including any replacement DOM inspector/session replay) are explicitly excluded.
**Acceptance for this planning delivery:** nine executable phase contracts plus one historical removed-scope record with ownership, dependencies, checklist IDs, failure/permission tests, rollback and decision gates; all eight active sources mapped; source claims calibrated; independent critique and CLI format checks recorded. A plan being written is not any product task being completed.

## Baseline / relationship to existing plans
Inspected main revision `9824325`; PM worktree `f1f4746`. Other feature revisions differ. Source links below point to main checkout for audit; implementation must rebaseline P01 and reuse existing feature work instead of duplicating it.
Existing [full-delivery plan](../../../hr-blockbot/plans/261020-2200-full-delivery/plan.md) remains an input; do not silently overwrite its progress. This plan supplies reliability/authorization deltas and an extension roadmap. Existing freeze/deployment dates are historical plan assumptions, not a newly promised deadline.

| Observed main condition | Evidence | Owning phase |
|---|---|---|
| F1 Web expects writes but main router is read-only | [client](../../../hr-blockbot/apps/web/src/services/api.ts), [router](../../../hr-blockbot/apps/api/src/routes/employees.ts) | P03 |
| Session rotation revokes then creates successor in separate steps | [auth service](../../../hr-blockbot/apps/api/src/services/auth.service.ts) | P03 |
| Project transition is CAS; report writes are separate | [Project](../../../hr-blockbot/apps/api/src/models/Project.ts), [reports](../../../hr-blockbot/apps/api/src/routes/reports.ts) | P04 |
| Chat frontend exists; main gateway has no chat handlers | [client](../../../hr-blockbot/apps/web/src/services/chatSocket.ts), [socket](../../../hr-blockbot/apps/api/src/socket.ts) | P05 |
| AI endpoint/provider chain exists, integration not established by source alone | [AI entry](../../../hr-blockbot/apps/ai-service/app/main.py) | P05 |
| Legacy store/schedule/correction/cash deliberately 503 | [app](../../../hr-blockbot/apps/api/src/app.ts) | P01 preserve lockdown |

## Approach and trade-offs
| Approach | Load-bearing assumption | Fails first when | Decision |
|---|---|---|---|
| Adapt behavior natively, reuse domain commands | Current stack can express bounded states | Calendar integrations need capabilities absent locally | Recommended; isolate those adapters behind explicit gates |
| Install/integrate every vendor platform | Vendor cost/privacy/contracts acceptable | Data egress, auth mismatch, subscription or lock-in constraints | Not selected; no evidence justifies eight integrations |
Better approaches: native behavior adaptation is smaller than importing entire products; existing Socket.IO, forms and CAS are present. Cost: still implement and verify domain-specific recovery, no vendor-ready shortcut.

## Phase index and dependencies
The CLI-created starter is retained as P01. Phases remain pending/todo until execution evidence exists. Detailed links are maintained in this hand-authored navigation; CLI owns progress counts from phase files, not this explanatory table.

| Phase | Deliverable | Depends on | Indicative effort |
|---|---|---|---|
| [P01](phase-01-start.md) | Revision/test inventory, reuse map and business gates | — | 1–2 days |
| [P02](phase-02-contracts-and-security.md) | Contracts, scope matrix, idempotency/recovery design | P01 | 2–4 days |
| [P03](phase-03-auth-and-profile.md) | Cross-tab auth, complete F1 approvals | P02, D2 | 4–7 days |
| [P04](phase-04-projects-and-reports.md) | F2 scope, report aggregate and recovery | P03 | 4–7 days |
| [P05](phase-05-chat-rag-and-providers.md) | F3 gateway, RAG/citations, confirmation/provider safety | P04 | 6–10 days |
| [P06](phase-06-guided-forms-feedback-and-palette.md) | Guided forms, answer feedback, Cmd+K | P05 | Re-estimate after baseline |
| [P07](phase-07-human-handover-and-traces.md) | Durable human handover, safe AI trace | P06, staffing gate | Re-estimate after baseline |
| [P08](phase-08-booking.md) | Booking pilot, timezone/conflict/cancellation | P07, D4 | Gate-dependent |
| P09 | Audio removed by explicit user request; historical slot only | — | No implementation |
| [P10](phase-10-offline-drafts-and-release.md) | Safe outbox, full regression/recovery/release checks | P08, offline gate | Gate-dependent |

Default execution is serial by phase to prevent same-file overlap. Within a phase: PM contracts first; one writer per API/Web/AI worktree; independent app tasks may run concurrently only against frozen contracts. Integrator verifies combined revision. No phase author can write shared contracts from a dev branch.
Core effort range is provisional, not a deadline or confidence score. Eight extensions are planned but not claimed delivery-ready until their gates close. Core milestone after P05 may be independently accepted; P10 is the complete extension release gate, not permission to skip unfinished gated features.

## Eight-source traceability / fit
| Source | Included behavior | Phase | Fit / limits |
|---|---|---|---|
| 01 Chatbase | chat lifecycle, citations, session recovery, mobile; embed only if external host required | P05; embedding gate | High for chat, low for iframe in SPA |
| 02 Vapi | Removed by user; no audio implementation | — | Excluded |
| 03 Cal.com | slot booking, timezone, stale/conflict, cancel/reschedule | P08 | Conditional on actual scheduling owner/use case |
| 04 Typebot | explicit guided profile/report forms, finite branching/review | P06 | High; no generic bot engine |
| 05 Formbricks | explicit answer-helpfulness feedback; targeting/survey needs separate approval | P06 | Medium; no parked pulse survey |
| 06 Dify | redacted step timeline, streaming display/error/usage when measured | P05/P07 | High for trace, low for node canvas |
| 07 Linear | accessible Cmd+K plus safe durable outbox | P06/P10 | High palette; offline mutations gated |
| 08 Tidio | accepted/retry/dedupe and Admin human handover | P05/P07 | High reliability, staffing-dependent live support |
| 09 Supabase | cross-tab refresh; OAuth PKCE only if identity provider selected | P03; OAuth gate | High concurrency; no provider replacement/chunked cookie copy |

Source catalog at [existing reports](../../../hr-blockbot/plans/reports/rea-cleanroom-catalog/README.md). Treat package/URL/ledger claims as unverified vendor implementation assertions unless reproducible artifact/version/hash/trace supplied. SPEC Redis TTL, fuzzy scoring weights, fallback lock and cross-tab server semantics are not implementation requirements. No clean-room or license guarantee is asserted. If borrowing code, provenance/license review is mandatory before incorporation.

## Decision gates — unresolved, not silently decided
- **D1 Baseline/integration:** reuse which feature revisions, authorized integration branch, synthetic DB and migration owner? P01 resolves from repository evidence plus maintainer approval.
- **D2 Auth/browser:** supported browsers/Web Locks fallback, lost-refresh-response recovery, session migration/re-login policy? Default proposal is fail-safe re-login, never replay grace silently. OAuth/PKCE is a separate subgate: choose provider, callback origins, account linking and CSRF/state before implementation; existing password login is unchanged.
- **D3 UX/data:** external embedding needed? Feedback identified/anonymous, raw-comment/trace/transcript visibility and retention? Exact offline allowlist/caps/retention? No sensitive browser persistence by default.
- **D4 Handover/booking:** named Admin support owner/hours/offline behavior; booking use case, organizer availability, durations/resources, cancellation and calendar sync? No invented SLA, hold duration or staffing.
- **D5 removed:** audio/voice explicitly excluded by user on 2026-10-22; no Vapi, Gemini Live, microphone, STT/TTS or audio data egress.
Phase detail must state what is blocked by each missing answer. Writing this roadmap does not approve business scope or data egress. Gates may be answered during plan validation; otherwise affected phase remains pending, not completed.

## Quality and stop rules
Every phase adds failing behavior tests before implementation. Node built-in test runner/existing Python tools preferred; no new test framework by default. Build is not a behavior proof. Existing commands must be checked at P01; proposed test executables are explicitly marked not yet present. No fake E2E pass from test mocks, no tests on production data.
Security gate: server-side scope for every REST/Socket/tool/citation/trace; durable command dedupe; no auth resurrection; no raw provider secrets/PII egress; outbound URL SSRF protections; safe Markdown/links; keyboard/screenreader/text alternatives.
Reliability gate: fail at every commit/projection/ACK boundary; recover from durable truth; exact-one logical write under duplicate/concurrent requests; bounded queues/documents/retries. Never claim exactly-once transport delivery.
Pause affected work on revision drift, missing contract approval, unexpected data migration, privacy/cost gate or failed critical check. Preserve user changes; record failure, revised hypothesis and smallest discriminating check. No auto-reset or insecure fallback.

## Completion checklist
- [ ] PLAN-01 P01–P05 core accepted with actual multi-role/multi-tab Web→API→AI results.
- [ ] PLAN-02 P06–P08 all selected features pass business gates and their acceptance matrices.
- [ ] PLAN-03 P10 outbox/recovery/privacy/accessibility regression accepted; migration rollback rehearsed.
- [ ] PLAN-04 PM reconciles every phase checkbox and old-plan mappings; docs/contracts match delivered behavior.

## Red Team Review
Reconciled on 2026-10-22 against current files, not stale reviewer snapshots. Details and source citations: [reconciliation](review-reconciliation.md).
- Accepted technical gaps: default JWT secret, access-token revocation, pre-provider minimization, claim grounding, production corpus, true streaming, active-report identity, assignee response loop and explicit embed/OAuth/contextual-trigger work. Added pending acceptance tasks; no application fix claimed.
- Already addressed: refresh evidence retention, projection backpressure, durable chat execution recovery and terminal/attempt fencing.
- Stale: P06-P10 placeholder claim; they now contain detailed contracts/tests. P09 is deliberately removed audio scope, not missing implementation.
- Scope distinction: F4/F5/F7 documented requirements are not all operating flows. P10-07..10 adds coverage and explicit disposition gates; core acceptance cannot be labelled full-project completion.
- Maintainer decision confirmed: core flows first, extensions in later increments. Audio and PostHog excluded. Provider/browser/privacy, staffing/booking and missing F4/F5/F7 expansion remain unapproved.
### Whole-plan consistency sweep
P09 has no tasks or release dependency; P10 depends on P08. Eight active sources remain. Structural validation is not runtime/security acceptance.

## Validation Log
Detailed provenance, task mapping and limits: [evidence record](evidence-and-validation.md). Runnable document check: [verify-plan.ps1](verify-plan.ps1).
Final document checks on 2026-10-22: verify-plan.ps1 PASS, 69 unique pending task IDs, all Markdown targets resolve, no starter placeholders; AgentKit validate valid=true. AgentKit status: 0/69 done, pending (10 historical phase files, P09 non-executable). A case-insensitive placeholder check initially matched ordinary prose; checker was narrowed and rerun successfully. Product tests have NOT been run in this reconciliation. Independent read-only audit completed; business/runtime gates remain. CLI directory timestamp uses a different zone; created metadata uses user-local 2026-10-22.

## Handoff
Plan only. Next owner: `ak-cook` after maintainer approval and P01 baseline; no `--auto` inferred. PM worktree may not contain app code; executors use the registered app worktrees and approved integration revision. Keep runtime tasks mapped to phase checklist IDs; completion sync-back reads every phase, not just current one.

<!-- slug: flow-hardening-and-nine-source-roadmap -->



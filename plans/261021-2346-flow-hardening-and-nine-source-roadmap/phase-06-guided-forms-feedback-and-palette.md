---
title: "Phase 06: Guided forms, response feedback, command palette"
status: todo
---

# Phase 06 — Guided forms, response feedback, command palette

## Outcome and dependencies

Typebot-inspired guided profile/report forms; Formbricks-inspired **assistant-response helpfulness feedback**, not UF-08 pulse survey; Linear-inspired Cmd/Ctrl+K navigation. Native React 18/Vite, Express TypeScript/Zod, MongoDB; no vendor SDK requirement. SPEC-04/05/07 are behavior references, not proof of vendor backend implementation. Keep parked leave/onboarding/OKR/pulse flows parked.

Depends on phases 01–05: approved role/ownership matrix, profile sensitive-field request/review, report/progress state/version contracts, authenticated chat message IDs and response completion. Read source baseline `C:/work-space/hr-blockbot` at `9824325` only. Current task authors documentation only; implementation remains unapproved.

## Ownership and serialized handoff

Paths below are **proposed implementation ownership**, not authorization to edit now. Worktrees never cross-write. PM publishes reviewed contracts/docs first; API implements against that revision; Web follows API fixtures; AI follows only if form metadata is needed; integration consumes reviewed commits after explicit human authorization.

| Order / worktree | Sole owned paths | Handoff |
|---|---|---|
| PM `hr-blockbot-pm` | `packages/contracts/src/index.ts`, `packages/contracts/test/*.test.mjs`, `docs/06-api-spec.md`, `docs/18-user-flows.md`, this phase | Approved schemas, rejection fixtures, field allowlists, event decision |
| API `hr-blockbot-api` | `apps/api/src/routes/{employees,reports,feedback}.ts`, `apps/api/src/models/{Employee,Report,Feedback}.ts`, `apps/api/test/*.test.mjs` (new names proposed; reconcile actual module map first) | Exact request/response fixtures; ownership/version/idempotency behavior |
| Web `hr-blockbot-web` | `apps/web/src/components/{GuidedForm,ResponseFeedback,CommandPalette}.tsx`, `apps/web/src/services/api.ts`, `apps/web/src/App.tsx`, `apps/web/src/index.css`, `apps/web/test/*.test.mjs` | Keyboard/mobile/error/offline evidence |
| AI `hr-blockbot-ai` | `apps/ai-service/app/**` only if approved read-only form hint needed | No write tools or dynamic code execution |

Shared contracts, entrypoints and styles are serialized within their owner; other phases cannot concurrently edit them. Missing existing paths are proposals, not claims that modules already exist.

## Proposed contracts — UNAPPROVED, PM gate required

- Guided form is a fixed application definition, not a generic Typebot graph engine: `{formKind:'profile'|'report', definitionVersion, stepId, answers, baseVersion}`; allowlisted text/choice/number/date fields, deterministic conditional required fields, bounded steps. No eval, arbitrary regex, webhook blocks, vendor sessions or client-provided permission rules.
- Reuse phase03 profile and phase04 report endpoints after PM alignment; do not invent a parallel mutation route. UI states `editing -> reviewing -> submitting -> saved|pendingApproval|conflict|error`. Back/edit recalculates branches and drops hidden answers. Review screen requires explicit submit. Sensitive profile fields produce existing approval request, never direct employee writes; report submits preserve project state guards.
- Helpfulness candidate: `POST /api/feedback/responses` body `{clientMutationId:UUID, messageId, helpful:boolean, reason?:'incorrect'|'missing_source'|'unclear'|'other', comment?:string(max500)}`; identity derived from session. Only owner of a completed assistant response may submit. Proposed unique `(userId,messageId)`; same key/body returns canonical result, key reuse with different body `409`; PM decides replace-vote versus immutable vote before implementation. Use existing `feedback_events` only after inspecting and approving its matching-feedback semantics; no silent schema conflation. Response `{id,messageId,helpful,createdAt}` excludes other users and raw prompts.
- Feedback trigger: completed eligible response, dismissible, no repeated modal, PM-approved cooldown. Failure cannot block chat. No surveys, demographic segmentation or sentiment inference.
- Palette candidate: compile-time allowlist `{id,label,keywords,route?,requiredRole?,context?}`. Prefix/substring matching first; nested groups only where useful. No command registry service, arbitrary URL execution or automatic mutations. Write actions open existing review UI. Permission hiding is usability only; API rechecks role and ownership. Navigation is available offline; mutation commands explain online requirements.
- API rejects unknown fields, malformed IDs, overlength values, unauthorized targets; standard error `{code,message,retryable,requestId}` with PM-approved status map `400/401/403/404/409/429/503`.
- **Socket contract gate:** docs18 lines67–70 allow nine names; docs06 lines265–282 adds `chat:confirm` (ten). PM must reconcile both and contracts before any socket change. Do not copy source vendor event names or register new application events. Forms/feedback use REST; UI refetches authoritative state.

## Test-first implementation checklist

- [ ] **P06-01** PM approves field schemas, sensitive-field routing, feedback retention/edit policy/cooldown, command allowlist and socket reconciliation; freeze contract revision and failing fixtures before API work.
- [ ] **P06-02** API writes failing authorization/validation/idempotency/version tests below; then minimally implements feedback and reuses existing profile/report mutations. Single-document conditional updates only; audit durability follows phase02, never assume multi-document atomicity.
- [ ] **P06-03** Web writes reducer/form/keyboard tests; implements fixed steps, branch reset, error summary, review and retry preserving unsaved values. Pending request disables duplicate submit but server remains authoritative.
- [ ] **P06-04** Web adds per-response helpful/not-helpful controls, optional reason/comment, submitted/dismissed/failure states; no prompt/answer replication into telemetry. Add Cmd/Ctrl+K, visible launch control, arrow/Enter/Escape, focus trap/restore, IME-safe input and role-aware routes. Respect editable-field shortcuts and nested modal precedence.
- [ ] **P06-05** Run existing commands plus approved new scenarios; capture actual exit codes. PM/QA approve scope, accessibility and privacy; leave status todo until execution evidence exists.

## Retained contextual-trigger/attribute subflow
- [ ] P06-06 PM approves a bounded first-party eligibility rule set for response-feedback popovers using allowlisted role, route, completed-response state and already authorized non-sensitive attributes; API supplies only permitted attributes, Web evaluates deterministic equality/membership rules. No arbitrary evaluator/code, demographic inference or server permission decisions in browser. Explicitly specify cooldown, dismissal and no-repeat semantics; fail closed for missing/unknown attributes. Test true/false/missing values, route/user change, duplicate trigger, cooldown/reset, dismissal without upload, CSP nonce propagation if inline injection is actually needed. This retains Formbricks-inspired trigger/filter behavior without reopening parked pulse surveys. Additional survey types remain blocked on scope approval.

## Negative and concurrency matrix (proposed tests, not existing coverage)

| Scenario | Required assertion |
|---|---|
| Unknown/hidden/tampered branch fields; stale definition | Server rejects unauthorized fields; no partial mutation; ask reload/review |
| Employee edits another profile/report or sensitive field directly | No write; same privacy-safe authorization response as phase02 |
| Two tabs submit different changes against same baseVersion | Exactly one wins; loser `409`, retains local values; no silent merge |
| Timeout after successful form submit, retry same key | Same canonical result; one mutation/approval request/audit outcome |
| Feedback on user message, incomplete response, foreign/deleted message | Reject; no disclosure or feedback row |
| Concurrent vote/retry; same key different body | One canonical outcome under approved uniqueness policy; conflict explicit |
| XSS in form labels/comment/result, oversized content, spam | Escaped text; length/rate limits; no HTML execution |
| Palette unauthorized route, stale context, double Enter | No privileged write; only one navigation; API still checks permissions |
| Keyboard-only, screen reader, 320px, IME, reduced motion | Labels, focus/error announcements, no keyboard trap or lost input |
| Logout/user switch during submit | No subsequent user sees draft or response feedback state |

## Verification commands and evidence

**Existing scripts inspected at source baseline; run later from the relevant implementation worktree, not the read-only source:**

```powershell
pnpm --filter @hr-blockbot/contracts typecheck
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api test
pnpm --filter web test
pnpm --filter api build
pnpm --filter web build
```

API/Web tests currently use `node --test test/**/*.test.mjs`; add named scenarios there before running. Browser form/palette accessibility scenarios above are **proposed** manual or newly authored browser checks, not an existing Playwright command. No test ran during this planning task. Do not use `generate:openapi` as a success gate: its current script intentionally exits 1.

## Security, rollback and business gates

PM/business approves editable fields, report completion semantics, feedback purpose/retention/moderation, no survey expansion, accessible copy and command exposure. Unknown policy means feature remains unavailable, not guessed defaults. API performs auth/ownership/version checks on each mutation; no role from request bodies, token in storage, third-party scripts or raw HR data in logs.

Rollback: disable the new UI entry points using the existing release mechanism (or revert reviewed feature changes if no flag mechanism exists); preserve normal profile/report forms and chat. Stop accepting new feedback if persistence is unsafe, retain already stored records under approved retention. Never roll back domain data by overwriting newer versions. Recovery verifies existing profile approval/report flows and absence of unauthorized data exposure.

Done requires approved contracts, passing newly authored negative/concurrency evidence, keyboard/mobile review and business acceptance. This document grants no code implementation, commit, push, deploy or global registration permission.

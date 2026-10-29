---
title: "Phase 2: Contracts, authorization and recovery invariants"
status: todo
---

# Phase 2: Contracts, authorization and recovery invariants

## Outcome / prerequisites
Depends on P01 baseline and D1 integration decision. PM owns `packages/contracts/**`, `docs/06-api-spec.md`, `docs/07-auth-rbac.md`, `docs/18-user-flows.md`, relevant ADR/storage design and this plan in PM worktree only. Application code remains read-only here. Estimate 2–4 days, subject to baseline diff.

## Decisions and design
1. Reconcile current contracts, not define duplicate local types. Web currently has local queue/socket shapes. Promote agreed shapes to contracts; API runtime validation and Web imports follow in their own phases.
2. Resolve nine-event inventory in user-flows versus `chat:confirm` and newer API spec. Select one canonical event inventory through PM review; no vendor event names copied blindly. Trace/handover may use typed metadata and scoped REST endpoints without adding names. Version incompatible payloads explicitly.
3. Every write has server identity/scope, exact allowlist, expected version where stateful, bounded request ID and durable command receipt. Same key/same canonical payload returns prior result; same key/different payload is conflict. Receipt binds actor, tenant/department scope and resource, not only request text.
4. Use single-document CAS as commit boundary. Do not claim atomicity across report, project, session successor or notification writes. Derived read models/outbox projections must retry idempotently and reconcile after process death. Bound document arrays and receipt lifetime relative to supported retry window; choose actual caps before migration.
5. No third role. `level` never grants authority. Admin department scope applies to list/detail/assign/transition/report/review/conversation/trace/feedback. Employee self/assignee scope is checked server-side on every path and Socket event.
6. Only API mutates domain state. AI proposals are untrusted data: typed tool allowlist, immutable actor/resource/payload binding, expiry, one-use confirm, permission/version recheck immediately before commit. Reject cross-user, expired or modified action IDs.

## Tracked work
- [ ] P02-01 Inventory schema drift; propose exact DTO/error/event changes with compatibility and migration notes. Resolve canonical inventory and F1 approval field allowlist before API work.
- [ ] P02-02 Define common command/idempotency/version semantics and test vectors; define proposal lifecycle and confirmation rejection behavior.
- [ ] P02-03 Specify authoritative report aggregate and projections (P04), authoritative refresh family aggregate (P03), bounded conversation/message storage (P05), including recovery after each write boundary.
- [ ] P02-04 Specify resource-scope matrix and secure internal API→AI identity envelope; reject untrusted userContext from browser, enforce service auth and no public AI write surface.
- [ ] P02-05 Define request size/rate/time bounds, safe error fields, citation link policy, retention/deletion ownership and redacted audit fields. Do not choose user consent/SLA/retention arbitrarily: record unresolved D3–D5.
- [ ] P02-06 Add contract rejection tests first for unknown fields, invalid IDs/enum/version, oversized input, malformed socket chunks and idempotency mismatch; export schemas and update docs together.

## Test matrix / commands
Existing checks from chosen baseline:
```powershell
pnpm --filter @hr-blockbot/contracts build
pnpm --filter @hr-blockbot/contracts typecheck
pnpm --filter @hr-blockbot/contracts test
```
Proposed tests are added to existing `packages/contracts/test/**/*.test.mjs` by PM; do not invent `test:flows` script. Require meaningful test counts and deliberately invalid samples rejected. OpenAPI command remains intentionally unimplemented unless separately scoped.

## Acceptance
Published local contract diff, source-of-truth and recovery matrix, complete ownership map, approved event inventory. All API/AI/Web phase payloads reference these schemas. No product execution may assume a draft DTO is approved. Unresolved contract/storage decisions block dependent phase, not unrelated inventory.

## Rollback / risks
Keep prior DTO decoding for a documented compatibility window if existing clients require it; additive migrations first. No production backfill before backup/dry-run counts. Reject unknown secrets/PII in logs; never send bank, salary, identity documents or raw profile data to model providers. Browser targeting and UI-hidden commands never substitute for backend authorization.

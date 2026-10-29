---
title: "Phase 3: Reliable auth and complete profile approvals"
status: todo
---

# Phase 3: Reliable auth and complete profile approvals

## Outcome / dependencies / effort
Depends on P01–P02 and browser/session gate D2. Complete existing login/profile/approval flows, adapting the cross-tab principle from SPEC-09 without replacing auth. Estimate 4–7 days before baseline reuse credit.

## Ownership and order
API owner: `apps/api/src/routes/auth.ts`, `routes/employees.ts`, auth/RBAC services, refresh/employee models and API tests in API worktree. Web owner: `apps/web/src/services/auth.ts`, `services/api.ts`, AuthContext, LoginModal, RosterView and EmployeeProfileView plus Web tests in Web worktree. PM exports contracts first. API then Web adapter; run integration after both. No parallel tasks touching the same app files. Inspect newer feature revisions before edits.

## Implementation
1. Add failing tests before changes: self/department boundary, overposting, sensitive approval, refresh concurrency and crash recovery.
2. Keep access tokens in RAM and refresh tokens HttpOnly/Secure with deployment-correct SameSite/origin/CSRF policy. Audit login claim population, account disabled checks, cookie clearing and rate limits. API auth error codes are canonical.
3. Extend same-tab single-flight with Web Locks around refresh fetch AND body processing. Shared cookie advances before next tab enters; each tab obtains its own RAM token. Namespace lock by origin/session context without including secret. BroadcastChannel carries logout/invalidation only, not tokens. Lock wait is bounded with user-visible recovery; unsupported browsers are gated, never use the SPEC no-op fallback.
4. Use a client auth generation counter so refresh finishing after logout/user-switch cannot restore prior auth. Serialize logout against refresh; server invalidation remains authoritative. Resolve server login/logout/refresh races, not only UI state.
5. Main refresh currently revokes old session then creates successor separately. Select P02 family-document CAS design: one authoritative family state + hashed current token + bounded consumed-token evidence. Rotation and replay invalidation occur in that aggregate; define tombstone/replay lifetime explicitly. Migration must preserve valid sessions or deliberately require re-login with approval. Do not introduce a replay grace window silently. Never evict consumed hashes while their tokens could still be valid under the session policy: define absolute family expiry and maximum rotation rate/cap first. At capacity, safely expire/re-authenticate the family rather than forgetting replay evidence. Cover boundary retention and old-token replay after many rotations in tests.
6. Implement/reuse missing F1 PATCH and change-request create/list/review endpoints matching approved contracts. Store sensitive request and decision in employee aggregate where feasible; CAS verifies pending status/version and applies approved fields with receipt/audit atomically. Rejected request never changes profile. Allowlist fields; no direct update of role, department, salary or identity data through ordinary patch.
7. UI shows truthful saving/pending/rejected/error/conflict states. Refresh detail/queue from authoritative result; preserve unsaved input after recoverable errors. Search/filter paging must match API support, not silently ignore unsupported filters.

## Tracked tasks
- [ ] P03-01 Verify/reuse existing auth and F1 implementations across worktrees; add failing isolation/refresh tests.
- [ ] P03-02 Implement family aggregate rotation, replay invalidation, bounded receipts and migration rehearsal; resolve lost-response policy.
- [ ] P03-03 Implement Web Locks, logout-generation guard and supported-browser UX; no token persistence.
- [ ] P03-04 Complete profile PATCH/create/list/review atomic state, audit and durable idempotency.
- [ ] P03-05 Wire UI, contract imports, query filters, error/conflict handling and keyboard accessibility.
- [ ] P03-06 Run API and browser tests with synthetic Admin A/B departments and Employee A/B. Attach actual results.

## Additional security work after source reconciliation
- [ ] P03-07 Reject missing, known-default or invalid production JWT secrets at startup. Explicit test-only fixture configuration must never become an implicit deployed fallback. Test missing/default configuration fails before listening; valid secret signs/verifies and wrong secret fails.
- [ ] P03-08 Bind access tokens to a server-authoritative session/family identifier or auth epoch approved in P02. Check revocation for every protected REST request and Socket handshake/message/confirm, not only refresh. Logout/replay revocation invalidates previously issued access tokens; unavailable revocation storage fails closed. Test old access token after logout/replay, open socket after revocation and logout-versus-write races. Specify revocation linearization and in-flight commit ordering; do not promise undo of already committed writes.
- [ ] P03-09 OAuth PKCE is a retained, blocked extension, not silently removed. After D2 selects identity provider/callback origins/account-linking policy, PM approves contracts; API owns callback/code exchange and session issuance; Web owns initiation/callback/error states. Use S256, one-use state/verifier binding, exact redirect allowlist, bounded expiry and no browser long-lived secrets. Test state mismatch/replay, wrong verifier/redirect, provider denial, linking collision and no accidental privilege escalation. No provider enrollment or rollout before approval; keep existing password login.

## Acceptance matrix
| Scenario | Required result |
|---|---|
| 2 tabs, simultaneous 401 | No false replay revocation; both either refresh correctly or explicit controlled re-login |
| Consumed token genuinely replayed | Family invalidated; all subsequent refreshes denied |
| Crash/lost response after server rotation | No silent corruption; approved recovery/re-login UX; no replay weakening |
| Logout while refresh pending | No auth resurrection, including reload/another tab |
| Lock-holder crash/unsupported browser | Released lock or bounded safe failure, no unguarded fallback |
| Employee patches other profile / Admin outside scope | 403; unchanged data, no PII leakage |
| Sensitive field in ordinary patch / hidden unknown field | Validation rejection; no mutation |
| Two reviews of one pending request | Exactly one decision commit; repeat identical command returns same result |
| Same ID with altered payload | Conflict; no second mutation |
| DB failure / stale version | No success toast; draft retained and explicit refetch/review |

## Verification
Existing: `pnpm --filter api build`, `pnpm --filter api test`, `pnpm --filter web build`. Add API cases to existing node:test suite, no new framework. Proposed browser check: `node apps/web/test/flows-auth-profile.mjs` after that executable file is implemented and browser tooling verified in P01; must cover real two-tab cookie behavior, not mocks only. Do not claim build proves multi-tab correctness.

## Rollback
Ship auth and F1 changes independently. Disable new UI entry points on incompatible API; do not re-enable insecure writes. Backup/dry-run session migration; rollback requires a compatible family model or explicit session revocation/re-login. No raw refresh token in logs, fixtures or migration reports.

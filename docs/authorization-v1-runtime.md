# Authorization V1 — local runtime integration

This is software architecture documentation, not an internal company authorization
document or a statement that the local changes have been deployed. The detailed
business-source review, approval matrix and acceptance report are kept outside the
repository. The current summary reports `MIGRATING`, not final acceptance.

## One login, explicit authority

Software profiles: `system_admin`, `hr`, `om`, `aom`, `sam`, `am`, `sm`, `ptch`,
`staff`. A profile is eligibility, not a permission grant. No super-admin or
all-powerful profile is introduced. Legacy `role: Admin|Employee` is retained only
for authentication/wire compatibility, not business authority.

Every request resolves the current database principal, account/employee state,
security version and canonical employee link. An action additionally needs an
APPROVED server policy, an explicit unexpired/unrevoked capability grant, canonical
store/region scope, verified reporting relations where applicable, workflow state
and separation of duties. Location and reporting restrictions intersect.

The source of truth is `packages/contracts/src/authorization.ts` and
`apps/api/src/services/authorization-policy.service.ts`. Missing capabilities on an
older grant mean no capability, not all permissions of its profile. The retired
`assertInScope` and title-based scope resolver fail closed.

## Runtime boundaries

| Surface | Enforcement |
|---|---|
| Login, refresh, password and socket packets | Current principal and security version; one shared authentication system; pending/disabled/inactive principals cannot access business data |
| Employees, directory and HR queue | Scoped query/count/detail projections; minimal store directory separate from HR allowlist; ordinary edit CAS and independent review |
| Projects, reports and assignment | Canonical project store and actual management edges; self execution/consent; independent report review; two-party handover; audit/version invariants retained |
| Stores and dashboard | Canonical outlet IDs for authorization and enrichment; no department/name authority; unavailable metrics stay null |
| Onboarding | Scoped proposal/draft, independent explicit HR approval, resumable exactly-one employee/user provisioning, one-time password setup, no plaintext password response |
| Employee lifecycle | HR request and independent HR review; both store managers confirm a transfer; effective date and CRM obligations gate application; reactivation requires secure password setup |
| Accounts and grants | Separate technical capabilities; no self elevation; bounded versioned security audit; canonical store/region/reporting pickers; root revocation invalidates delegated rights |
| Delegation | Three allowlisted actions, at most14days, independent verified approver, no chaining; root rights/relations/expiry revalidated on use |
| REST/socket chatbot | Scoped, short-lived audience/request/version-bound tool gateway; proposals only; current authority checked again before output |
| Documents and attachments | Approved classification/ACL checked before content retrieval and file access; unclassified content denied; no public caching or model-invented links/citations |

Technical administration does not imply HR or operational approval. A manager may
review work they assigned, but never work they performed/submitted. Missing mapping,
independent approval or required handover leaves the operation denied/pending.

Store/department configuration, promotion approval, sensitive HR fields and
KPI/payroll remain denied or pending policy. Dormant schedule/cash/correction APIs
stay disabled. Technical password recovery is implemented but returns503 unless
an explicitly configured secure delivery adapter is installed. No production
sender is installed by default. It never returns a generated password or token.

## Recovery and history follow-up

- Technical `POST /admin/users/:id/reset-password` requires `accounts.manage`, a
  reason and `expectedVersion`; no self reset, activation or employment override.
  A32-byte random token is held only by the delivery adapter; its SHA-256 hash is
  stored on the target account. Pending/failed delivery tokens cannot be used.
- Public `POST /auth/recover-password` shares the strict one-time activation
  payload, not another login system. It checks delivery,24-hour expiry, bound
  target/issuer versions, current issuer capability and account availability.
  Password replacement, token consumption, version increment and chained audit
  are one conditional user-document update. Old sessions become invalid.
- Delivery failure or interruption is recovered by a fresh technical request
  using the current version, replacing the previous token and retaining audit.
  A response lost after consumption is not replayable: sign in with the new
  password or request a fresh reviewed technical delivery. No real mail/SMS has
  been sent or configured by this implementation.
- `GET /onboarding`, `/employee-lifecycle`, `/delegations` accept `page` and
  `limit` (maximum100), return `items` plus `paging`, and authorize before
  pagination/count. Lists omit large histories (`historyIncluded:false`).
  Equally scoped `GET /<workflow>/:id` retrieves full history independently of
  how old the record is. Detail reports local integrity vs unverified/invalid
  history; no read-time rewriting or backfilled approval is performed.
- Delegation participants with explicit self-inspection can read their own
  expired/revoked history, never regain delegated operational authority. Review
  history still requires current store/region and actual source-management scope.
- `POST /onboarding/:id/resubmit` permits only the original currently scoped
  requester to amend ordinary proposal fields on a REJECTED request with CAS.
  Identity/store/reserved user/employee IDs and original events are immutable.
  Before/after proposal snapshots are hashed into a new event; a fresh independent
  HR review is mandatory. No delete-and-recreate path is introduced.

The account-security maintenance lock does not expire automatically. A killed
owner requires an operator to verify that every old writer has stopped and to
reconcile durable versions/audit before any separately authorized unlock. Do not
run a TTL/unconditional unlock or automatically roll back partially completed
employment/provisioning sagas.

## AI transport boundary

The V1 Python entrypoint is `app.authorization_gateway:app`. It reuses the existing
provider chain but does not import the legacy operational Mongo/tool runtime or
raw policy corpus. `/api/v1/chat` and `/api/v1/rag/query` are retired in this
entrypoint. The configured service key alone is never end-user authority.

`AUTHORIZATION_API_ORIGIN` is operator-configured, not a model/client parameter.
Readiness checks the service-authenticated API/database dependency; it does not
assert that an external model or production deployment is working. Existing AI
algorithms/PhoBERT are not changed. The legacy entrypoint remains for offline
regression, not as an authorization fallback.

## Migration and evidence limits

- `apps/api/scripts/authorization-dry-run.mjs` inspects a local JSON snapshot only.
- `authorization-migration-rehearsal.mjs` accepts an explicitly reviewed manifest
  and preimages, creates its **own** throwaway Mongo server, applies CAS changes,
  verifies raw-field/audit-prefix preservation and compensating rollback. It has
  no production apply mode and accepts no external database target.
- Missing store/region/reporting/user mappings must be reviewed; do not infer
  authority from titles, department labels or imported names.
- Hash-chain integrity checks and local EVM receipt tests are not evidence of
  public blockchain anchoring. Imported unhashed audit prefixes are identified,
  not represented as cryptographically authenticated history.

## Reproducible local gates

```powershell
pnpm -r typecheck
pnpm -r run build
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api test
pnpm --filter web test
node apps/web/test/e2e-revamp-flow.test.mjs
node apps/web/test/authorization.integration.mjs
node apps/web/test/crm-workflow.integration.mjs
pnpm --filter api test:authorization-python
```

The last gate additionally requires the isolated AI Python requirements; see the
AI service README. Run its full hermetic pytest suite after adapter changes.
Browser/database fixtures are synthetic, use exclusively owned loopback Mongo,
and never authorize writing to an existing developer database or Atlas.

Logs/screenshots are local test artifacts. A passing gate does not prove actual
company mapping, production delivery configuration, public anchoring, database-role
hardening on Atlas or authorization to push/deploy.

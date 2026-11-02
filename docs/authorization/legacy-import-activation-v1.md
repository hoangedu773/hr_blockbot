# Legacy import activation — controlled local implementation

This flow preserves an imported user's IDs. It is not onboarding, password
recovery, employee reactivation, role inference, or permission approval.

## Gates

- `createApp().legacyImport` defaults OFF; no public request/environment flag
  enables the flow. No production sender or approval-import endpoint is installed.
- An independently registered, current `legacy_import_approvals` record must bind
  the exact database, batch, user, employee, profile, authorization hash, store
  scope, validity window and four separate approval references: ACCOUNT_STATE,
  PROFILE_ASSIGNMENT, MANAGEMENT_RELATION and EXPLICIT_GRANT.
- `TEST_ONLY` manifests additionally require a server option and a test database.
  They never approve source identities or a production rollout. Offline test
  bootstrap is confined to a freshly owned, allowlisted local clone.
- The issuer needs current system_admin + explicit accounts.manage. No self-issue,
  legacy Admin fallback, implicit title rights, or public bootstrap endpoint.
- Identity mapping must be unique in both directions, employee active with no
  lifecycle fence, approved canonical scope, explicit policy-compatible grants.
  Inactive/disabled/onboarding accounts cannot be imported through this endpoint.

## Endpoints

- POST `/api/admin/users/:id/legacy-import-invitation` with approvalId,
  expectedVersion and reason. Only redacted invitation metadata is returned.
- POST `/api/auth/activate-legacy` with the one-use token and recipient's new
  password. No login session is automatically minted.
- POST `/api/admin/legacy-import-approvals/:id/revoke` with expected approval
  version and reason. This is compensating revocation, not snapshot restoration.
- Recipient UI accepts `#legacy-import=<token>`; clears the fragment and does not
  persist it in browser storage. Tokens are delivered only through an injected
  secure adapter; no configured adapter means no target writes.

## Consistency and recovery

Only a SHA-256 token hash is stored. Expiry is at most 24 hours and no later than
the approval expiry. Purpose/batch/approval-ID/version/terms hash and snapshots
of employee/authorization are bound to the invitation. Password hashing precedes
final issuer + target revalidation inside the existing security/CRM writer locks.
The user document changes password, consumption, status, audit and securityVersion
atomically. Old refresh/access sessions remain invalidated by version fencing.

After interrupted issuance/delivery, PENDING/FAILED tokens cannot activate. An
authorized issuer may reissue against the new version after verification. A
consumed token cannot be replayed; after a lost successful response, try logging
in with the newly set password rather than creating another identity.

Approval revocation is recorded before account disable. Current principal
resolution requires the intact APPROVED manifest and CONSUMED invitation, so a
crash between those writes remains fail-closed. After reconciliation of a stopped
writer, retry revocation using the current approval version to complete disabling;
already disabled/REVOKED targets are idempotent and do not add duplicate audit.
Rollback never restores old
passwords, token/session documents, grants or decreasing security versions.

Existing writer locks deliberately have no automatic lease expiry. An actual
process kill may leave a maintenance fence: stop/verify the old writer, reconcile
audit/state and obtain operator recovery approval before releasing that fence.
Exception failpoint tests do not claim to test OS-kill/operator recovery.

Audit hashes detect inconsistent changes through the application; they are local
database evidence, not a public blockchain anchor or a signature proving that
an external business owner really approved a manifest. Production manifest
ingestion, trusted operator controls and delivery require separate rollout review.

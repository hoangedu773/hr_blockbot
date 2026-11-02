# HRM runtime release safety

This release combines the Authorization V1 runtime-boundary cleanup with the
reviewed legacy activation, direct-superior approval, onboarding UX and progress
retry fixes. It does not migrate production data or grant permissions on deploy.

## Important deployment prerequisite

Do not deploy the account-state change independently onto an unreviewed legacy
database. `loadAccount` validates the persisted account status before Mongoose
hydration. Missing status is unreviewed, not implicitly active. A valid legacy
role or employee-active flag does not grant Authorization V1 capabilities.

The application requires independently approved account state, profile, explicit
grants, canonical scope and any necessary current management relationships.
Legacy-import approvals bind the exact database and identity. Restoring an archive
under another database name is not an authorization migration.

- Do not bulk-set missing account status to active.
- Do not infer rights from job title, grade, legacy Admin/Employee or address.
- Keep pending capabilities denied and do not use password recovery to activate.
- Keep the legacy sender disabled without an approved server-side adapter.
- Use isolated JWT secrets, credentials and sessions for each test environment.
- Do not put database archives, manifests containing personnel data, credentials,
  activation tokens or private test evidence in Git.
- Never put an Atlas administrative credential in a public test API runtime.

## Integration notes

- The two operational branches can use an explicitly authorized independent
  direct superior for SM-to-PTCH review. A same-profile supervisor is not
  automatically an approver. Current direct edges and scoped grants are required.
- The receiving onboarding store is selected explicitly when multiple stores
  are available. Recruiting an employee does not itself establish reporting.
- Activation/recovery fragments are consumed safely across development remounts.
- Progress retries are keyed to actor, original version and payload. Reusing a
  key for another payload conflicts; retries still require current authorization,
  assignee/consent, execution state and audit integrity.
- The legacy-import routes use the shared `lib/endpoint` adapter, preserving the
  V1 boundary cleanup rather than restoring route-to-route coupling.

## Verification and rollout

Build contracts before API/Web typecheck or build, because consumers resolve
the generated contracts declarations. Install using the frozen workspace lock.
The API test runner owns fresh loopback MongoDB instances; never aim it at Atlas.
Provider/AI integration fixtures are mocks, not evidence of live inference.

A Git push and a Render deployment are different actions. Check each service's
configured branch and live commit; a push to `main` does not update a service
tracking another branch. Keep test DB/service configuration independent from
existing production services until the target migration and tests are verified.

Roll back code and compensate data separately. Revoke new approvals/grants and
sessions with audit/version fencing; do not resurrect credentials, revoked tokens
or prior security versions by restoring an old runtime database over a live one.

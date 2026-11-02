# Local software-policy amendment: independent direct-superior delegation review

Approved by the project owner in the local HRM implementation conversation,
2026-11-02 (Asia/Bangkok). This is a software simulation policy, not an assertion
about independently verified current GUTA appointments. No production rollout.

## Delta

- Keep all nine Authorization V1 profiles and the single authentication system.
- `delegations.review` may be explicitly granted to an operational manager
  profile (`om`, `sam`, `am`, `sm`). Profile eligibility alone grants nothing.
- For SM -> PTCH delegation, the reviewer need not have profile `am`.
  The approved direct superior may have profile `sm` (for the simulated SM3
  position), or another eligible operational profile on the approved graph.
- Existing `delegation.service.ts::verified` checks remain mandatory for every
  selected store: canonical scope, active direct edge from reviewer to delegator,
  independent current principal and explicit `delegations.review` grant.
- Directness is not transitive ancestry. Job title, `gutaGrade`, legacy role and
  a globally higher rank are not evidence of review authority.

This permits SAM -> AM -> SM on A/B and SAM -> SM-position supervisor -> SM
on C/D without adding a role or inventing grade SM1/2/3 data.

## Unchanged controls

Only existing direct source grants may be delegated; recipients must be managed
throughout the selected scope; SM may delegate only to PTCH, OM only to AOM.
Only approved delegable capabilities (`projects.create`, `projects.assign`,
`reports.review`), a bounded period <=14 days, scope intersection, no chaining,
independent approval, CAS and audit apply. Source/reviewer/recipient state,
grants, direct relation and expiry are revalidated when effective permissions
are resolved. Revoking any prerequisite does not rewrite past audit history.

OM -> AOM remains denied without an actual independent direct approver. No
promotion, payroll, KPI, sensitive HR, chatbot WRITE, profile reassignment or
store/department administrative policy is enabled by this amendment.

## Initial reporting and onboarding

`onboarding.reporting_review` was already an approved operational capability.
Its actual grant is separate from this policy delta and is configured only on
the isolated local test copy, through the existing account-management workflow.
Suggested local scopes: AM=A/B; SM-position supervisor=C/D; SAM=C/D for proposals
submitted by that supervisor. The current direct edge and independence from
requester, subject and proposed manager remain required.

Onboarding explicitly selects the receiving store, defaulting only when there
is one authorized option. HR approval/recipient activation establishes the home
store, not an automatic manager link to the recruiter. Initial reporting is a
separate reviewed workflow. Grades remain unverified where source lacks them.

## Verification and rollout boundary

Regression covers existing AM approval, same-profile direct-superior approval
only after an explicit grant, peer/transitive/cross-store/self denial, concurrent
review, source/reviewer/relationship revocation, expiry and no redelegation.
Copied-database browser tests additionally cover scoped grant configuration,
onboarding -> independent reporting -> consent -> report approval and persisted
MongoDB audit. Full evidence and historical failures are outside Git in the
private local handoff. No new grants are silently added to the original demo.

Code and data rollout are separate. Existing accounts do not acquire this
capability unless explicitly granted. Do not apply local simulation approvals
to Atlas. A rollback must remove/revoke newly introduced review grants with
audited version changes before reverting policy; do not restore old session
versions, passwords or previously revoked grants.

# ADR-022 — Monthly store and area revenue KPI

Status: implemented per owner plan dated 2026-11-04. Scope is HR, AM and SM only.
This module does not implement remuneration, payroll, staff task KPI or scheduling.

Separate period/assignment/append-only result stores preserve F5 evaluations.
Vietnam calendar months use half-open intervals. Store revenue selects live over
demo per store; an area with missing/invalid data or mixed sources stays pending.
Area attainment is sum(actual)/sum(target), AND the rounded underperforming-store
rate must be within the period threshold (default30%). Defaults are project-owner
assumptions, not independently verified GUTA policy.

HR approves drafts. The assignee accepts/refuses; adjustments require evidence
text/reference, scoped independent AM verification for a store, then independent
HR approval and renewed consent. Keep is explicit HR decision with audit, not
automatic acceptance. Weekdays are Monday–Friday, no holiday calendar. Final
confirmation/close waits for month end. Every result action appends a new version;
correction recomputes the ledger after close and never accepts client actuals.

The existing non-expiring CRM writer fence serializes mutations with account,
lifecycle and other CRM writes. CAS, request UUID and payload fingerprint reject
stale writes/different-body replay. Failure after part of open/compute/close can
be resumed; records are deterministic and old versions are preserved.
Recovery of a claimed-but-crashed open action replays the approved preview
instead of re-deriving the plan: period transition and AUTO_DRAFT writes are
attributed through the stored decision hash, already-written rows are kept
untouched and reported skipped, targets stay pinned to what the approver saw,
and any drift that cannot be proven against the approved preview fails closed
with a fresh conflict preview — expiry only gates the first claim, never the
completion of an approved action. Implementation and regression coverage:
apps/api/src/services/revenue-kpi.service.ts (replayOpenPlan) and
apps/api/test/revenue-kpi-open.test.mjs. Notifications
derive from retained history and unique dedupe keys, retry independently, and
revalidate recipients. The separate module reminder starts only with the flag.

## Compatibility adjustment to the original plan

Main API and Test API share MongoDB but old Main API contracts reject unknown
capabilities anywhere in users.authorization. The owner prohibited deploying Main.
Therefore new module grants are persisted in **revenue_kpi_grants**, not in users.
They bind an existing comparable source grant's ID, scope, window and digest;
runtime merges only approved revenue capabilities when REVENUE_KPI_ENABLED=true.
Revocation, changed scope/window/profile, inactive principal or module flag OFF
fails closed. This is an explicit owner-approved module grant, not permissions
inferred from title/profile alone. Deployment maintenance is dry-run/hash-reviewed,
append-only/idempotent, uses the technical security lock and preserves users byte
for byte. No new Atlas role/user or original DB write is needed. Four module
collections are provisioned explicitly; global autoCreate/autoIndex stay OFF.

Notifications also share storage with Main. Persist revenue notifications with
the compatible `type=system` plus a `revenueType` subtype. Only the new API
projects the revenue enum; Main continues to parse/display a generic system
notification without knowing new enum values. Titles/messages contain no revenue,
target, names or private reasons. Entity type is an existing free-text field.

## AI and data extension

AI receives three completed-month aggregate revenues/counts, baseline and bounds;
no store/person identifiers or personal fields. Proposal is clamped to a bounded
trend range; timeout/invalid/provider absence uses deterministic degraded fallback.
Proposal metadata does not modify a target or release it. HR applies a draft and
publishes as separate steps. Insufficient/mixed history makes no vendor request.

POS extension keeps all existing deterministic IDs, six orders/day/store, seed
and batch ID, adding July–September and missing past November slots only. The
plan's estimate of two/three orders/day did not match existing implementation;
preserving the generator is necessary for exact replay. It is demo data and is
never portrayed as actual business revenue. No future transaction is generated.

Technical acceptance must distinguish isolated tests, cloud read/form smoke,
authorized demo seed and historical/full model-quality evaluation. Old audit,
session revocation and result versions must not be restored backward on rollback.

# POS demo and scoped revenue dashboard

Owner requested completion of the interrupted Claude POS work on 2026-11-03.
The existing Claude draft provided the order model, basic aggregation and sample
products. This release integrates those into the current deployment checkout;
it does not replace the release with the old dirty main checkout on C:.

`pos_orders` is an independent ledger, with canonical storeId, orderedAt, items,
sales channel, payment method, status, integer VND amounts, source and ledgerVersion.
It contains no employee/customer identity. Model validation checks line quantity
times price, subtotal, discounts, refunds and net. Cancelled orders contribute
zero; completed orders deduct discount and refund; fully refunded orders net zero.
Example product names/prices are synthetic fixture choices, not a company menu.

Dashboard revenue is Vietnam month-to-date, from local first-of-month midnight to
the observation timestamp. `asOf` is actual observation time, not a future month
end. Missing POS returns unavailable, not an invented zero. A recorded all-cancelled
or refunded dataset can legitimately total zero. Invalid numeric state withholds
the amount for reconciliation. No cash_counts/cash_summary data are reused.

Authorization uses existing dashboard.read grants and canonical resource checks.
SM gets only their granted store; AM aggregates only explicitly allowed stores.
Reporting-person-only grants do not authorize a whole-store revenue total. Staff,
unconfigured users and technical administrators have no special revenue bypass.
GET /api/dashboard/revenue?storeId=... has strict identity validation and rechecks
the resource; GET /api/dashboard/overview returns the scoped total. There are no
public POS write endpoints or new grants/capabilities in this change.

Live `pos_api`/`pos_export` ledgerVersion=1 data take precedence over demo data
within the requested scope. The two sources are never added together. With a
partial real rollout the live-scoped total reflects only received real records;
it must not be presented as complete data coverage of unconnected stores.
Legacy/unversioned POS records require explicit validation/import before use.

The ribbon shows Doanh thu tháng này, range and order count. Each store drawer
loads that store's independent metric with stale-response protection. Source and
demo/live metadata remain in the API/ledger for traceability and future replacement.
The feature is a reporting/demo ledger, not a checkout, payment or accounting app.

`scripts/seed-pos-demo.mjs` requires an authenticated technical operator, owner
approval OWNER_POS_DEMO_20261103 and the pinned hr_bot_test_363 database. Credentials
arrive on stdin. Dry-run hashes, before images and journals are stored privately
outside Git. It creates six deterministic demo orders per elapsed local day and
active outlet from October 1 through the frozen observation day/time in October/
November 2026. It never creates future orders, deletes a collection or resets
existing demo orders. IDs/orderIds are stable; replay inserts zero. Conflicting
existing rows are retained and stop the operation. It creates only POS indexes
and rows, preserving all HR/scheduling/cash/auth/business records and grants.

Tests cover Vietnam month boundaries, missing sources, model consistency, net
calculation, cancellation/refund, future cutoff, cross-store/forged selectors,
revoked/reporting-only grants, staff/admin denial, live precedence, idempotent
non-destructive seeding and per-store versus aggregate browser views. Browser/API
integration uses exclusively owned MongoDB with synthetic data and no providers.

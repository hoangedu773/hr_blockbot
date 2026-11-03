# Scoped sales report

The CRM Sales report page uses `GET /api/dashboard/sales` and existing
`dashboard.read` grants. It introduces no roles, permissions, POS writes or
automatic seed. SM can report their allowed stores; AM can select a store or
aggregate their scope. Reporting-employee-only grants do not permit full-store
sales. Store labels and order details are projected from authorized records.

Query: strict `from`/`to` Vietnam calendar dates, optional `preset` (today,
yesterday, week, month, custom), canonical `storeId`, channel, paymentMethod,
status and page (20 records). Maximum 93 days, no future date. The server cuts
today at observation time. Weekly comparison uses the same elapsed portion of
the previous week; monthly comparison the corresponding previous-month dates,
clamping a shorter month. Other ranges compare the adjacent equal interval.
Percentages are unavailable when previous data is missing/invalid or its
denominator is zero. No fabricated 100% growth is displayed.

Source precedence is fixed across the current/comparison range and selected
store scope before channel/payment/status filters: valid-version live sources
(`pos_api`, `pos_export`) take precedence; demo and live are never added or
compared with one another. All summaries, hourly series, distribution charts
and paginated orders apply the same filters. Responses use no-store.

Total and external-channel counts include all three supported statuses.
Cancelled orders contribute zero revenue and are excluded from sales-order,
item-average, channel and payment denominators. Completed and refunded orders
are included in those denominators; a full refund contributes zero revenue.
Net revenue is subtotal minus discount and refund. The payment chart counts
orders by their recorded method, not settled payment amounts. Raw imported
ledger inconsistencies withhold results; absent data is unknown, not a fake
zero. Report queries are read-only and bounded by database query timeouts.

The UI contains Vietnam date presets/range, scoped store selector, four KPI
cards, hourly revenue/orders and hourly order/item averages, interactive
channel/payment legends, an accessible hourly data table and a paged order
table with native modal detail. Light/dark and mobile use existing theme tokens.
No ratings, loyalty, commissions or provider-branded payments without matching
data are invented. Existing POS data is demo data; this page does not claim an
actual POS integration. No extra user-facing technical/demo banner was added.

Validation: `apps/api/test/sales-report.test.mjs` covers real isolated Mongo
aggregation, VN boundaries/comparison, scope/denials/revocation, source priority,
corrupt ledger, consistent filters and stable pagination. Existing POS/dashboard
tests remain applicable. `apps/web/test/sales-report.integration.mjs` runs built
Web -> real API -> owned Mongo, with actual store filters, date presets, order
detail, staff hiding, empty states, and desktop/mobile/light/dark screenshots.
Its authentication fixtures are synthetic and no external provider is called.

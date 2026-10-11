# Database Extraction — GUTA Operations Google Sheet

First extraction 2026-10-04; re-extracted 2026-10-07 from the shared workbook (read-only; the source sheet was never modified):

https://docs.google.com/spreadsheets/d/1yZBCnCwWZG3iXcigWx9XCll0keM2AzjrMV285Tohc0Y/edit

## How to re-run

```bash
# re-download the workbook (public share, works without login)
curl -sL -o hr_sheet.xlsx \
  "https://docs.google.com/spreadsheets/d/1yZBCnCwWZG3iXcigWx9XCll0keM2AzjrMV285Tohc0Y/export?format=xlsx"

python scripts/extract_sheet_to_db.py hr_sheet.xlsx   # rebuilds db/hr_bot.db + data/*.csv
python scripts/apply_store_aliases.py                 # rebuild the store_aliases bridge (derived data only)
python scripts/export_for_mongo.py                    # refresh data/mongo/*.ndjson (12 collections)
```

Outputs: `db/hr_bot.db` (SQLite, rebuilt from scratch each run) and `data/*.csv` (UTF-8 with BOM, Excel-friendly mirrors of every table). `store_aliases` is the one derived bridge table — rebuilt by its own script, never touching source rows.

## Source inventory

34 sheets total:

| Sheet | Role | Extracted rows |
|---|---|---|
| `DATA` | Employee master roster | 2,456 employees |
| ~29 weekly sheets (e.g. `510-1110` = 5–11 Oct) | Work schedule per store block ("lô") + registered schedule | 105 blocks, 3,283 shift entries |
| `CHẤM THỦ CÔNG` | Manual attendance corrections per payroll period | 115 |
| `LỊCH HỌC 3G` | Training session attendance | 8 |
| `BẢNG KÊ` | Single-day cash count per store + denomination bundle | 9 stores, 9 denominations |
| `Trang tính68` | Near-empty junk | skipped |

Schedule coverage: 2026-03-23 → 2026-10-11.

## Schema (`db/hr_bot.db`)

- `employees` — one row per employee code (PK `employee_code`). `store_raw`/`job_title` kept verbatim; bank account string split into `bank_account_number` + `bank_name` (e.g. `260839999 - ACB - NAME`). Hire/leave dates normalized to ISO, mixed string/dd-mm-yyyy/datetime sources handled. `source_row` pins the original `DATA` row.
- `stores` — 144 distinct `CỬA HÀNG` strings with employee counts. Note: the source column mixes real stores, kitchen units and management groups (`Group AOM Trầm`, `Phụ trách dự án mới`) — cleaning that is a downstream decision, not done here.
- `schedule_weeks` / `schedule_blocks` / `schedule_entries` — weekly schedule, normalized: one row per (sheet, block, person, day) with `schedule_type` = `actual` (LỊCH LÀM) or `registered` (LỊCH ĐĂNG KÍ). `row_kind` distinguishes `employee` / `support` (HỖ TRỢ) / `shortage` (THIẾU). Shift codes kept verbatim (`A1`, `B2`, `AB1-B219`, `LĐ.749`, …). Block codes (`1BNK`, `749NK`, …) are NOT yet mapped to `stores` names — that mapping is not derivable from the sheet alone.
- `attendance_corrections` — manual punches: code, shift, store, date, note, plus the payroll-period banner (e.g. `CHẤM THEO KỲ LƯƠNG 6/5-5/6/2026`).
- `training_attendance` — attendee, location, session date, time slot.
- `cash_counts` — per-store grand/cash/walk-in totals for the single day captured in `BẢNG KÊ` (no date anywhere on that sheet).
- `cash_denominations` — the denomination tally (500k → 1k with note counts) is **one sheet-level bundle for the whole cash bag**, not per store; its subtotal sums to the sheet's cash total.
- `cash_summary` — the sheet's own `TỔNG` row, stored verbatim (not recomputed).
- `raw_cells` — **full-fidelity snapshot**: every non-empty cell of all 34 sheets (33,198 cells on 2026-10-07), value verbatim. The normalized tables are interpretations; this table is the in-DB source of truth backing the "load everything, change nothing" rule. Independently verified: cell count and per-sheet counts match a direct openpyxl scan, plus random spot-checks.
- `store_aliases` — **derived bridge, not present in the source sheet**: links verbatim store-name variants (event tables) and weekly-sheet block codes to canonical `stores` rows. 23 rows on 2026-10-07 (7 attendance + 9 cash + 1 training + 6 block codes), built by `scripts/apply_store_aliases.py` with a uniqueness rule (one alias must match exactly one of the 144 stores) and an independent cross-check (every block link confirmed by the majority home store of its scheduled employees). Rebuilt after every extraction; `AB1-B219` remains unmapped pending human confirmation.

## Cloud preparation (MongoDB Atlas)

`scripts/export_for_mongo.py` dumps every table to `data/mongo/<table>.ndjson` — one JSON document per line, values verbatim (ISO date strings, integer VND), collections mirroring the tables 1:1. Verified: line counts equal table row counts for all 12 collections (11 source tables + `store_aliases`).

When an Atlas cluster exists, import with:

```bash
mongoimport --uri "$ATLAS_URI" --collection employees --file data/mongo/employees.ndjson
# repeat per collection; skip raw_cells if the bulk layer is not wanted in Mongo
```

Reshaping into the platform's domain model (docs/05-data-model.md) is deliberately NOT done here — the requirement was to load data unchanged.

## Atlas import

All 11 collections were imported into the project's MongoDB Atlas cluster (M0), database **`hr_bot`**, via `scripts/import_to_atlas.py` (reads `ATLAS_URI` from the gitignored `.env`) on 2026-10-04. Verified both ways:

- Script-side: Atlas doc count == local SQLite row count for all 11 collections (ALL OK).
- Read-back: independent `find_one` on `employees` and per-sheet `raw_cells` count query returned expected data.

**2026-10-07 re-import PENDING:** after re-extraction the import script now covers 12 collections (adds `store_aliases`), but the Atlas cluster refused all connections (`SSL handshake failed ... TLSV1_ALERT_INTERNAL_ERROR` on all 3 shards, retried twice — a network/machine-level issue, not data). The cloud still holds the 2026-10-04 snapshot; the local SQLite DB and NDJSON files are current and verified. Re-run `python scripts/import_to_atlas.py` when connectivity returns.

Credentials live only in `.env` / `.mcp.json` (both gitignored). A MongoDB MCP server (official `mongodb-mcp-server@3.0.5`, pinned, installed globally) is configured in `.mcp.json` for direct in-chat querying in future sessions.

## Verification (all pass)

- Cash: parsed per-store grand total 16,275,000 = sheet `TỔNG` row; denomination subtotal 14,905,000 = sheet cash total.
- Employees: 2,456 rows with a valid code, all unique (prefixes covered: `GT-CH…`, `GT-VP…`, `GT-NQ…`, `HTT-…`).
- Schedule: 2,613 / 3,283 entries carry an employee code; 100% join to the roster. Registered-schedule column layout sanity check (shift-like strings appearing as names): 0.
- All 29 weekly sheets parsed; 0 sheets with layout issues.

## Known caveats

1. `BẢNG KÊ` carries no date; treat `cash_counts` as a one-day snapshot.
2. Registered-schedule blocks without a `lô` label get `block_code = NULL` (matches the source; e.g. third block of `510-1110`).
3. Weekly-sheet blocks are keyed by block code, not by store name — resolved 2026-10-07 by the derived `store_aliases` bridge (`scripts/apply_store_aliases.py`, 6/7 codes auto-mapped and cross-verified); only `AB1-B219` still needs human confirmation.
4. `Trang tính68` contains only a stray `LÔ` cell and was skipped.

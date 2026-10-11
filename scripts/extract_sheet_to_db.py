"""Extract the GUTA operations Google Sheet workbook into a normalized SQLite database.

Source workbook (read-only, never modified):
  https://docs.google.com/spreadsheets/d/1yZBCnCwWZG3iXcigWx9XCll0keM2AzjrMV285Tohc0Y/edit

Usage:
  python scripts/extract_sheet_to_db.py <path-to-xlsx> [--out-dir data]

Outputs:
  db/hr_bot.db        normalized SQLite database
  data/*.csv          cleaned flat tables (UTF-8 with BOM, Excel-friendly)
  docs/database-extraction.md is produced separately from the printed report.
"""

from __future__ import annotations

import argparse
import csv
import datetime as dt
import re
import sqlite3
import sys
from pathlib import Path

import openpyxl
import warnings

warnings.filterwarnings("ignore")

SPECIAL_SHEETS = {"DATA", "CHẤM THỦ CÔNG", "LỊCH HỌC 3G", "BẢNG KÊ"}
SKIP_SHEETS = {"Trang tính68"}

# Real roster uses several prefixes: GT-CH…, GT-VP…, GT-NQ…, HTT-2026xx.
# Keep anything uppercase-alnum with dashes and at least one digit; names never match this.
EMPLOYEE_CODE_RE = re.compile(r"^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)+$", re.IGNORECASE)


# ---------------------------------------------------------------- helpers
def as_text(v) -> str | None:
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def as_money(v) -> int | None:
    """Normalize VND amounts: numeric cells directly, strings with '.'/',' separators."""
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(v)
    s = re.sub(r"[^\d-]", "", str(v))
    return int(s) if s else None


def as_date(v) -> dt.date | None:
    if isinstance(v, dt.datetime):
        return v.date()
    if isinstance(v, dt.date):
        return v
    s = as_text(v)
    if not s:
        return None
    for fmt in ("%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d", "%m/%d/%Y"):
        try:
            return dt.datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    return None


def parse_bank_account(v) -> tuple[str | None, str | None]:
    """'260839999 - ACB - NAME' -> ('260839999', 'ACB'); bare number -> (number, None)."""
    s = as_text(v)
    if not s:
        return None, None
    parts = [p.strip() for p in s.split(" - ")]
    if len(parts) >= 2:
        return parts[0] or None, parts[1] or None
    return s, None


def csv_path(out_dir: Path, name: str) -> Path:
    return out_dir / f"{name}.csv"


def write_csv(path: Path, columns: list[str], rows: list[dict]) -> None:
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=columns, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)


# ---------------------------------------------------------------- extractors
def extract_employees(wb) -> tuple[list[dict], dict]:
    """Master employee list from the DATA sheet (header row contains 'Mã')."""
    ws = wb["DATA"]
    header_row = None
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=True), 1):
        vals = [as_text(c) for c in row]
        if "Mã" in vals:
            header_row = i
            break
    if header_row is None:
        raise RuntimeError("DATA sheet: header row with 'Mã' not found")

    rows_with_code = 0
    employees: dict[str, dict] = {}
    for r_idx, row in enumerate(ws.iter_rows(min_row=header_row + 1, max_col=11, values_only=True), header_row + 1):
        code = as_text(row[1])
        if not code or not EMPLOYEE_CODE_RE.match(code):
            continue
        rows_with_code += 1
        bank_number, bank_name = parse_bank_account(row[5])
        rec = {
            "employee_code": code,
            "source_row": r_idx,
            "full_name": as_text(row[2]),
            "store_raw": as_text(row[3]),
            "job_title": as_text(row[4]),
            "bank_account_raw": as_text(row[5]),
            "bank_account_number": bank_number,
            "bank_name": bank_name,
            "profile_status": as_text(row[6]),
            "hire_date": as_date(row[7]),
            "leave_date": as_date(row[8]),
            "leave_reason": as_text(row[9]),
        }
        # last-code-wins: later rows are the freshest roster entries
        employees[code] = rec
    return list(employees.values()), {"rows_with_code": rows_with_code}


def extract_cash_count(wb) -> tuple[list[dict], list[dict], dict]:
    """Single-day cash count per store from 'BẢNG KÊ'.

    The denomination columns (MỆNH GIÁ / SỐ TỜ / THÀNH TIỀN) form ONE sheet-level
    bundle for the whole cash bag: they run parallel to the store rows but are
    not per store — their subtotal adds up to the sheet's TIỀN MẬT grand total.
    """
    ws = wb["BẢNG KÊ"]
    counts, denominations = [], []
    totals: dict = {}
    header_seen = False
    for r_idx, row in enumerate(ws.iter_rows(min_row=1, max_col=9, values_only=True), 1):
        row0 = as_text(row[0])
        store = as_text(row[1])
        if row0 == "STT" and store == "TÊN CH":
            header_seen = True
            continue
        if not header_seen:
            continue
        denom, notes, subtotal = as_money(row[6]), as_money(row[7]), as_money(row[8])
        if denom is not None and notes is not None and row0 != "TỔNG":
            denominations.append(
                {
                    "denomination_vnd": denom,
                    "note_count": notes,
                    "subtotal_vnd": subtotal,
                    "source_row": r_idx,
                }
            )
        if row0 == "TỔNG":
            totals = {
                "grand_total_vnd": as_money(row[2]),
                "cash_total_vnd": as_money(row[3]),
                "walkin_total_vnd": as_money(row[4]),
                "denom_total_vnd": as_money(row[8]),
                "source_row": r_idx,
            }
            continue
        grand, cash, walkin = as_money(row[2]), as_money(row[3]), as_money(row[4])
        if store and (grand is not None or cash is not None or walkin is not None):
            counts.append(
                {
                    "store_name": store,
                    "grand_total_vnd": grand,
                    "cash_total_vnd": cash,
                    "walkin_total_vnd": walkin,
                    "source_row": r_idx,
                }
            )
    return counts, denominations, totals


def extract_attendance_corrections(wb) -> list[dict]:
    """Manual attendance corrections from 'CHẤM THỦ CÔNG' (header contains 'MÃ NV')."""
    ws = wb["CHẤM THỦ CÔNG"]
    header_row = None
    for i, row in enumerate(ws.iter_rows(min_row=1, max_row=10, values_only=True), 1):
        vals = [as_text(c) for c in row]
        if "MÃ NV" in vals:
            header_row = i
            break
    if header_row is None:
        return []

    title = None  # payroll-period banner from row 1
    banner = as_text(ws.cell(1, 1).value)
    rows = []
    for r_idx, row in enumerate(ws.iter_rows(min_row=header_row + 1, max_col=6, values_only=True), header_row + 1):
        code = as_text(row[0])
        work_date = as_date(row[4])
        if not code and not work_date:
            continue
        rows.append(
            {
                "source_row": r_idx,
                "employee_code": code,
                "employee_name": as_text(row[1]),
                "shift_code": as_text(row[2]),
                "store_name": as_text(row[3]),
                "work_date": work_date,
                "note": as_text(row[5]),
                "period_banner": banner,
            }
        )
    return rows


def extract_training(wb) -> list[dict]:
    """Training-session attendance from 'LỊCH HỌC 3G'."""
    ws = wb["LỊCH HỌC 3G"]
    rows = []
    for r_idx, row in enumerate(ws.iter_rows(min_row=2, max_col=5, values_only=True), 2):
        code, name, location, date, slot = (as_text(row[0]), as_text(row[1]), as_text(row[2]), as_date(row[3]), as_text(row[4]))
        if not any([code, name, location]):
            continue
        rows.append(
            {
                "source_row": r_idx,
                "employee_code": code,
                "employee_name": name,
                "location": location,
                "session_date": date,
                "time_slot": slot,
            }
        )
    return rows


def extract_weekly_schedules(wb) -> tuple[list[dict], list[dict], list[dict], dict]:
    """Parse every weekly schedule sheet.

    Layout per store block (identified by 'MÃ NV' in column B):
      col A = block code (lô), cols 2-4 = employee code / hire date / name,
      cols 6-12 = actual shifts paired with a datetime row,
      col 14 + cols 15-21 = registered-schedule name, dates and shifts.
    Special rows 'HỖ TRỢ' (support) and 'THIẾU' (shortage) are kept with row_kind.
    """
    weeks = {}  # sheet_name -> set of all dates seen (actual + registered)
    blocks, entries = [], []
    sheets_parsed = []
    for name in wb.sheetnames:
        if name in SPECIAL_SHEETS or name in SKIP_SHEETS:
            continue
        ws = wb[name]
        grid = list(ws.iter_rows(min_row=1, max_col=21, values_only=True))
        block_starts = [i for i, row in enumerate(grid) if as_text(row[1]) == "MÃ NV"]
        if not block_starts:
            sheets_parsed.append({"sheet": name, "blocks": 0, "entries": 0, "issue": "no 'MÃ NV' row"})
            continue

        n_entries = 0
        for b_idx, start in enumerate(block_starts):
            end = block_starts[b_idx + 1] if b_idx + 1 < len(block_starts) else len(grid)
            lô = as_text(grid[start][0])

            # date rows: all datetimes found in the two day-column ranges
            actual_dates, registered_dates = {}, {}
            for row in grid[start + 1 : end]:
                # actual days: cols 6-12 (idx 5-11); registered days: cols 14-20 (idx 13-19)
                for col, target in [(range(5, 12), actual_dates), (range(13, 20), registered_dates)]:
                    for col_idx in col:
                        d = as_date(row[col_idx])
                        if d:
                            target[col_idx] = d

            if not actual_dates and not registered_dates:
                issue = {"sheet": name, "blocks": len(block_starts), "entries": 0, "issue": "block without dates"}
                sheets_parsed.append(issue)
                continue

            week_days = set(actual_dates.values()) | set(registered_dates.values())
            if week_days:
                weeks.setdefault(name, set()).update(week_days)
            blocks.append(
                {
                    "sheet_name": name,
                    "block_index": b_idx,
                    "block_code": lô,
                    "employee_rows": sum(
                        1
                        for row in grid[start + 1 : end]
                        if as_date(row[2]) or as_text(row[3]) or any(as_text(row[c]) for c in range(5, 12))
                    ),
                }
            )

            for g_idx, row in enumerate(grid[start + 1 : end], start + 2):
                code = as_text(row[1])
                name_raw = as_text(row[3])
                if not any([code, name_raw]):
                    continue
                base = {
                    "sheet_name": name,
                    "block_index": b_idx,
                    "block_code": lô,
                    "source_row": g_idx,
                    "employee_code": code if code and EMPLOYEE_CODE_RE.match(code) else None,
                    "employee_name": name_raw,
                    "row_kind": ("support" if name_raw == "HỖ TRỢ" else "shortage" if name_raw == "THIẾU" else "employee"),
                }
                for col_idx, day in actual_dates.items():
                    shift = as_text(row[col_idx])
                    if shift:
                        entries.append({**base, "schedule_type": "actual", "work_date": day, "shift_code": shift})
                        n_entries += 1
                reg_name = as_text(row[12])
                for col_idx, day in registered_dates.items():
                    shift = as_text(row[col_idx])
                    if shift:
                        entries.append(
                            {
                                **base,
                                "employee_name": reg_name or name_raw,
                                "schedule_type": "registered",
                                "work_date": day,
                                "shift_code": shift,
                            }
                        )
                        n_entries += 1
        sheets_parsed.append({"sheet": name, "blocks": len(block_starts), "entries": n_entries, "issue": None})

    weeks = [
        {"sheet_name": name, "week_start": min(days), "week_end": max(days)}
        for name, days in sorted(weeks.items())
    ]
    return weeks, blocks, entries, {"sheets": sheets_parsed}


# ---------------------------------------------------------------- raw layer
def extract_raw_cells(wb) -> list[dict]:
    """Full-fidelity snapshot: every non-empty cell of every sheet, value verbatim.

    The normalized tables are interpretations of the sheet; raw_cells is the
    in-DB source of truth backing the 'load everything, change nothing' rule.
    """
    cells = []
    for name in wb.sheetnames:
        ws = wb[name]
        for r_idx, row in enumerate(ws.iter_rows(values_only=True), 1):
            for c_idx, v in enumerate(row, 1):
                if v is None or v == "":
                    continue
                if isinstance(v, (dt.datetime, dt.date)):
                    v = str(v)
                cells.append({"sheet_name": name, "row_idx": r_idx, "col_idx": c_idx, "value": v})
    return cells


# ---------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx", type=Path)
    ap.add_argument("--out-dir", type=Path, default=Path("data"))
    ap.add_argument("--db-path", type=Path, default=Path("db/hr_bot.db"))
    args = ap.parse_args()

    wb = openpyxl.load_workbook(args.xlsx, data_only=True)
    out_dir = args.out_dir
    out_dir.mkdir(parents=True, exist_ok=True)
    args.db_path.parent.mkdir(parents=True, exist_ok=True)
    if args.db_path.exists():
        args.db_path.unlink()  # idempotent full rebuild

    employees, emp_stats = extract_employees(wb)
    cash, denoms, cash_totals = extract_cash_count(wb)
    corrections = extract_attendance_corrections(wb)
    training = extract_training(wb)
    weeks, blocks, schedule_entries, diag = extract_weekly_schedules(wb)
    raw_cells = extract_raw_cells(wb)

    # stores dimension: distinct CỬA HÀNG values with reference counts
    store_counts: dict[str, int] = {}
    for e in employees:
        if e["store_raw"]:
            store_counts[e["store_raw"]] = store_counts.get(e["store_raw"], 0) + 1
    stores = [
        {"store_name": s, "employee_count": n}
        for s, n in sorted(store_counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]

    con = sqlite3.connect(args.db_path)
    con.execute("PRAGMA foreign_keys = ON")
    con.executescript(
        """
        CREATE TABLE stores (
            store_name TEXT PRIMARY KEY,
            employee_count INTEGER NOT NULL
        );

        CREATE TABLE employees (
            employee_code TEXT PRIMARY KEY,
            source_row INTEGER,
            full_name TEXT,
            store_raw TEXT,
            job_title TEXT,
            bank_account_raw TEXT,
            bank_account_number TEXT,
            bank_name TEXT,
            profile_status TEXT,
            hire_date TEXT,
            leave_date TEXT,
            leave_reason TEXT,
            FOREIGN KEY (store_raw) REFERENCES stores(store_name)
        );

        CREATE TABLE attendance_corrections (
            id INTEGER PRIMARY KEY,
            source_row INTEGER,
            employee_code TEXT,
            employee_name TEXT,
            shift_code TEXT,
            store_name TEXT,
            work_date TEXT,
            note TEXT,
            period_banner TEXT
        );

        CREATE TABLE training_attendance (
            id INTEGER PRIMARY KEY,
            source_row INTEGER,
            employee_code TEXT,
            employee_name TEXT,
            location TEXT,
            session_date TEXT,
            time_slot TEXT
        );

        CREATE TABLE cash_counts (
            id INTEGER PRIMARY KEY,
            store_name TEXT,
            grand_total_vnd INTEGER,
            cash_total_vnd INTEGER,
            walkin_total_vnd INTEGER,
            source_row INTEGER
        );

        CREATE TABLE cash_denominations (
            id INTEGER PRIMARY KEY,
            denomination_vnd INTEGER,
            note_count INTEGER,
            subtotal_vnd INTEGER,
            source_row INTEGER
        );

        CREATE TABLE cash_summary (
            id INTEGER PRIMARY KEY CHECK (id = 1),
            grand_total_vnd INTEGER,
            cash_total_vnd INTEGER,
            walkin_total_vnd INTEGER,
            denom_total_vnd INTEGER,
            source_row INTEGER
        );

        -- full-fidelity snapshot of every non-empty cell (see extract_raw_cells)
        CREATE TABLE raw_cells (
            id INTEGER PRIMARY KEY,
            sheet_name TEXT NOT NULL,
            row_idx INTEGER NOT NULL,
            col_idx INTEGER NOT NULL,
            value
        );
        CREATE INDEX idx_raw_cells_sheet ON raw_cells(sheet_name, row_idx);

        CREATE TABLE schedule_weeks (
            sheet_name TEXT PRIMARY KEY,
            week_start TEXT,
            week_end TEXT
        );

        CREATE TABLE schedule_blocks (
            sheet_name TEXT,
            block_index INTEGER,
            block_code TEXT,
            employee_rows INTEGER,
            PRIMARY KEY (sheet_name, block_index),
            FOREIGN KEY (sheet_name) REFERENCES schedule_weeks(sheet_name)
        );

        CREATE TABLE schedule_entries (
            id INTEGER PRIMARY KEY,
            sheet_name TEXT,
            block_index INTEGER,
            block_code TEXT,
            source_row INTEGER,
            employee_code TEXT,
            employee_name TEXT,
            row_kind TEXT,
            schedule_type TEXT,
            work_date TEXT,
            shift_code TEXT,
            FOREIGN KEY (sheet_name, block_index) REFERENCES schedule_blocks(sheet_name, block_index)
        );

        CREATE INDEX idx_schedule_emp ON schedule_entries(employee_code, work_date);
        CREATE INDEX idx_schedule_date ON schedule_entries(work_date);
        CREATE INDEX idx_schedule_block ON schedule_entries(sheet_name, block_index, employee_code, work_date, shift_code);
        CREATE INDEX idx_attcorrections_emp ON attendance_corrections(employee_code, work_date);
        CREATE INDEX idx_training_emp ON training_attendance(employee_code);
        CREATE INDEX idx_employees_store ON employees(store_raw);
        """
    )

    def insert(table: str, columns: list[str], rows: list[dict]) -> None:
        sql = f"INSERT INTO {table} ({', '.join(columns)}) VALUES ({', '.join('?' for _ in columns)})"
        con.executemany(sql, [tuple(r.get(c) for c in columns) for r in rows])

    insert("stores", ["store_name", "employee_count"], stores)
    insert("employees", list(employees[0].keys()) if employees else [], employees)
    insert("attendance_corrections", ["source_row", "employee_code", "employee_name", "shift_code", "store_name", "work_date", "note", "period_banner"], corrections)
    insert("training_attendance", ["source_row", "employee_code", "employee_name", "location", "session_date", "time_slot"], training)
    insert("cash_counts", ["store_name", "grand_total_vnd", "cash_total_vnd", "walkin_total_vnd", "source_row"], cash)
    insert("cash_denominations", ["denomination_vnd", "note_count", "subtotal_vnd", "source_row"], denoms)
    insert("cash_summary", ["grand_total_vnd", "cash_total_vnd", "walkin_total_vnd", "denom_total_vnd", "source_row"], [cash_totals] if cash_totals else [])
    insert("schedule_weeks", ["sheet_name", "week_start", "week_end"], weeks)
    insert("schedule_blocks", ["sheet_name", "block_index", "block_code", "employee_rows"], blocks)
    insert("schedule_entries", ["sheet_name", "block_index", "block_code", "source_row", "employee_code", "employee_name", "row_kind", "schedule_type", "work_date", "shift_code"], schedule_entries)
    insert("raw_cells", ["sheet_name", "row_idx", "col_idx", "value"], raw_cells)
    con.commit()
    # keep planner stats fresh and the file compact on every rebuild
    con.execute("ANALYZE")
    con.execute("VACUUM")

    # CSV mirrors
    write_csv(csv_path(out_dir, "employees"), list(employees[0].keys()) if employees else ["employee_code"], employees)
    write_csv(csv_path(out_dir, "stores"), ["store_name", "employee_count"], stores)
    write_csv(csv_path(out_dir, "attendance_corrections"), ["source_row", "employee_code", "employee_name", "shift_code", "store_name", "work_date", "note", "period_banner"], corrections)
    write_csv(csv_path(out_dir, "training_attendance"), ["source_row", "employee_code", "employee_name", "location", "session_date", "time_slot"], training)
    write_csv(csv_path(out_dir, "cash_counts"), ["store_name", "grand_total_vnd", "cash_total_vnd", "walkin_total_vnd", "source_row"], cash)
    write_csv(csv_path(out_dir, "cash_denominations"), ["denomination_vnd", "note_count", "subtotal_vnd", "source_row"], denoms)
    write_csv(csv_path(out_dir, "cash_summary"), ["grand_total_vnd", "cash_total_vnd", "walkin_total_vnd", "denom_total_vnd", "source_row"], [cash_totals] if cash_totals else [])
    write_csv(csv_path(out_dir, "schedule_weeks"), ["sheet_name", "week_start", "week_end"], weeks)
    write_csv(csv_path(out_dir, "schedule_blocks"), ["sheet_name", "block_index", "block_code", "employee_rows"], blocks)
    write_csv(csv_path(out_dir, "schedule_entries"), ["sheet_name", "block_index", "block_code", "source_row", "employee_code", "employee_name", "row_kind", "schedule_type", "work_date", "shift_code"], schedule_entries)
    write_csv(csv_path(out_dir, "raw_cells"), ["sheet_name", "row_idx", "col_idx", "value"], raw_cells)

    # ---------------- verification report
    print("== EXTRACTION REPORT ==")
    print(f"employees:                {len(employees)}")
    print(f"stores (distinct raw):    {len(stores)}")
    print(f"attendance_corrections:   {len(corrections)}")
    print(f"training_attendance:      {len(training)}")
    print(f"cash_counts:              {len(cash)}")
    print(f"cash_denominations:       {len(denoms)}")
    print(f"schedule_weeks:           {len(weeks)}")
    print(f"schedule_blocks:          {len(blocks)}")
    print(f"schedule_entries:         {len(schedule_entries)}")
    print(f"raw_cells (all sheets):   {len(raw_cells)}")

    print(
        f"\nemployee rows with GT-CH code: {emp_stats['rows_with_code']} -> unique employees kept: {len(employees)}"
    )

    if cash_totals:
        s = sum(c["grand_total_vnd"] or 0 for c in cash)
        print(f"cash grand total (sheet TỔNG row): {cash_totals['grand_total_vnd']:,} | parsed sum: {s:,} | match: {s == cash_totals['grand_total_vnd']}")
        dsum = sum(d["subtotal_vnd"] or 0 for d in denoms)
        print(f"denomination subtotal sum: {dsum:,} | sheet cash total: {cash_totals['cash_total_vnd']:,} | match: {dsum == cash_totals['cash_total_vnd']}")

    codes_known = {e["employee_code"] for e in employees}
    sched_with_code = [r for r in schedule_entries if r["employee_code"]]
    join_rate = sum(1 for r in sched_with_code if r["employee_code"] in codes_known) / max(len(sched_with_code), 1)
    print(f"schedule entries with code: {len(sched_with_code)}/{len(schedule_entries)}; join rate to employees: {join_rate:.1%}")

    shift_like = re.compile(r"^[AB]\d?[B\d.\-/]*$")
    suspicious = sum(
        1
        for r in schedule_entries
        if r["schedule_type"] == "registered" and r["employee_name"] and shift_like.match(r["employee_name"])
    )
    print(f"registered entries with shift-like name (column-layout sanity): {suspicious}")

    date_min = min((r["work_date"] for r in schedule_entries if r["work_date"]), default=None)
    date_max = max((r["work_date"] for r in schedule_entries if r["work_date"]), default=None)
    print(f"schedule date range: {date_min} .. {date_max}")

    problems = [s for s in diag["sheets"] if s["issue"] or s["blocks"] == 0]
    print(f"\nsheets with issues: {len(problems)}")
    for s in problems:
        print(f"  {s}")
    print(f"\nDB written to {args.db_path.resolve()}")
    print(f"CSVs written to {out_dir.resolve()}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

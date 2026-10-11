"""Export every table in db/hr_bot.db to NDJSON files ready for MongoDB Atlas import.

One JSON document per line (mongoimport's default format), values verbatim from
SQLite: ISO date strings, integer VND amounts, no renaming or reshaping. Field
names and collections mirror the relational tables 1:1 — restructuring into the
platform's domain model (docs/05-data-model.md) is a separate, explicit step.

Usage:
  python scripts/export_for_mongo.py            # db/hr_bot.db -> data/mongo/*.ndjson
  python scripts/export_for_mongo.py --exclude raw_cells   # skip the bulk raw layer

Import into Atlas later (one line per collection):
  mongoimport --uri "$ATLAS_URI" --collection employees --file data/mongo/employees.ndjson
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import sys
from pathlib import Path


def dump_table(name: str, cursor: sqlite3.Cursor, out_dir: Path, exclude: list[str]) -> bool:
    """Write one table to NDJSON; returns True on failure."""
    if name in exclude:
        print(f"{name:<24} skipped (--exclude)")
        return False
    out_path = out_dir / f"{name}.ndjson"
    written = 0
    with out_path.open("w", encoding="utf-8") as f:
        for row in cursor:
            f.write(json.dumps(dict(row), ensure_ascii=False, default=str) + "\n")
            written += 1
    ok = written == cursor.rowcount if cursor.rowcount >= 0 else True
    print(f"{name:<24} {written:>7} lines ({'OK' if ok else 'MISMATCH'}) -> {out_path}")
    return not ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-path", type=Path, default=Path("db/hr_bot.db"))
    ap.add_argument("--out-dir", type=Path, default=Path("data/mongo"))
    ap.add_argument("--exclude", nargs="*", default=[], help="table names to skip")
    args = ap.parse_args()
    args.out_dir.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(args.db_path)
    con.row_factory = sqlite3.Row

    # Every query below is a literal string on a fixed schema — no dynamic SQL.
    failures = 0
    failures += dump_table("attendance_corrections", con.execute("SELECT * FROM attendance_corrections"), args.out_dir, args.exclude)
    failures += dump_table("cash_counts", con.execute("SELECT * FROM cash_counts"), args.out_dir, args.exclude)
    failures += dump_table("cash_denominations", con.execute("SELECT * FROM cash_denominations"), args.out_dir, args.exclude)
    failures += dump_table("cash_summary", con.execute("SELECT * FROM cash_summary"), args.out_dir, args.exclude)
    failures += dump_table("employees", con.execute("SELECT * FROM employees"), args.out_dir, args.exclude)
    failures += dump_table("raw_cells", con.execute("SELECT * FROM raw_cells"), args.out_dir, args.exclude)
    failures += dump_table("schedule_blocks", con.execute("SELECT * FROM schedule_blocks"), args.out_dir, args.exclude)
    failures += dump_table("schedule_entries", con.execute("SELECT * FROM schedule_entries"), args.out_dir, args.exclude)
    failures += dump_table("schedule_weeks", con.execute("SELECT * FROM schedule_weeks"), args.out_dir, args.exclude)
    failures += dump_table("store_aliases", con.execute("SELECT * FROM store_aliases"), args.out_dir, args.exclude)
    failures += dump_table("stores", con.execute("SELECT * FROM stores"), args.out_dir, args.exclude)
    failures += dump_table("training_attendance", con.execute("SELECT * FROM training_attendance"), args.out_dir, args.exclude)

    print(f"\n{'ALL OK' if failures == 0 else f'{failures} TABLES WITH ISSUES'} — import each with:")
    print('  mongoimport --uri "$ATLAS_URI" --collection <name> --file data/mongo/<name>.ndjson')
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

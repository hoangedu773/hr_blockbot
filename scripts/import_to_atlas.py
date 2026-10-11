"""Import all extracted collections from db/hr_bot.db (SQLite) into MongoDB Atlas.

Reads ATLAS_URI from .env (never hardcoded — the URI carries credentials).
Idempotent: each target collection is dropped before inserting, so re-runs
always produce exact copies of the local database.

Usage:
  python scripts/import_to_atlas.py                # import every collection into db "hr_bot"
  python scripts/import_to_atlas.py --exclude raw_cells
"""

from __future__ import annotations

import argparse
import sqlite3
import sys
from pathlib import Path

from pymongo import MongoClient
from pymongo.errors import PyMongoError

INSERT_BATCH = 1000


def load_env(path: Path) -> dict[str, str]:
    env = {}
    if not path.exists():
        return env
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            key, _, value = line.partition("=")
            env[key.strip()] = value.strip()
    return env


def import_collection(name: str, rows: list[dict], mongo_db, exclude: list[str]) -> bool:
    """Drop + insert one collection; returns True on failure."""
    if name in exclude:
        print(f"{name:<24} skipped (--exclude)")
        return False
    try:
        collection = mongo_db[name]
        collection.drop()
        for i in range(0, len(rows), INSERT_BATCH):
            collection.insert_many(rows[i : i + INSERT_BATCH])
    except PyMongoError as exc:
        print(f"{name:<24} ERROR: {exc}")
        return True
    local_count = len(rows)
    atlas_count = collection.count_documents({})
    ok = atlas_count == local_count
    print(f"{name:<24} {atlas_count:>7} docs in Atlas ({'OK' if ok else 'MISMATCH'} vs {local_count} local)")
    return not ok


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--db-path", type=Path, default=Path("db/hr_bot.db"))
    ap.add_argument("--mongo-db", default="hr_bot", help="target MongoDB database name")
    ap.add_argument("--exclude", nargs="*", default=[], help="table names to skip")
    args = ap.parse_args()

    uri = load_env(Path(".env")).get("ATLAS_URI", "").strip()
    if not uri:
        print("ERROR: ATLAS_URI not found in .env — add the Atlas connection string first.")
        return 1
    if "<db_username>" in uri or "<db_password>" in uri:
        print("ERROR: ATLAS_URI still contains <db_username>/<db_password> placeholders — replace them in .env.")
        return 1

    con = sqlite3.connect(args.db_path)
    con.row_factory = sqlite3.Row

    try:
        client = MongoClient(uri, serverSelectionTimeoutMS=20000)
        client.admin.command("ping")
    except PyMongoError as exc:
        print(f"ERROR: cannot connect to Atlas: {exc}")
        return 1
    print("connected to Atlas OK")
    db = client[args.mongo_db]

    # Every query below is a literal string on a fixed schema — no dynamic SQL.
    failures = 0
    failures += import_collection("attendance_corrections", [dict(r) for r in con.execute("SELECT * FROM attendance_corrections")], db, args.exclude)
    failures += import_collection("cash_counts", [dict(r) for r in con.execute("SELECT * FROM cash_counts")], db, args.exclude)
    failures += import_collection("cash_denominations", [dict(r) for r in con.execute("SELECT * FROM cash_denominations")], db, args.exclude)
    failures += import_collection("cash_summary", [dict(r) for r in con.execute("SELECT * FROM cash_summary")], db, args.exclude)
    failures += import_collection("employees", [dict(r) for r in con.execute("SELECT * FROM employees")], db, args.exclude)
    failures += import_collection("raw_cells", [dict(r) for r in con.execute("SELECT * FROM raw_cells")], db, args.exclude)
    failures += import_collection("schedule_blocks", [dict(r) for r in con.execute("SELECT * FROM schedule_blocks")], db, args.exclude)
    failures += import_collection("schedule_entries", [dict(r) for r in con.execute("SELECT * FROM schedule_entries")], db, args.exclude)
    failures += import_collection("schedule_weeks", [dict(r) for r in con.execute("SELECT * FROM schedule_weeks")], db, args.exclude)
    failures += import_collection("store_aliases", [dict(r) for r in con.execute("SELECT * FROM store_aliases")], db, args.exclude)
    failures += import_collection("stores", [dict(r) for r in con.execute("SELECT * FROM stores")], db, args.exclude)
    failures += import_collection("training_attendance", [dict(r) for r in con.execute("SELECT * FROM training_attendance")], db, args.exclude)

    client.close()
    print(f"\n{'ALL OK' if failures == 0 else f'{failures} COLLECTIONS WITH ISSUES'}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())

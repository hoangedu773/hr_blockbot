"""Apply the store_aliases bridge table to db/hr_bot.db.

Links verbatim store-name variants found in the event tables
(attendance_corrections.store_name, cash_counts.store_name,
training_attendance.location) and the weekly-sheet block codes
(schedule_blocks.block_code) to their canonical rows in stores.

Derived data only: nothing in the source tables or raw_cells is ever
modified. Re-running extract_sheet_to_db.py rebuilds the base tables
from the sheet, so re-run this script afterwards to rebuild the bridge.

Run order: extract_sheet_to_db.py -> apply_store_aliases.py -> export_for_mongo.py

Matching rules (deterministic, uniqueness required across all 144 stores):
  1. name aliases: brand-prefixed forms match by tail-after-prefix,
     bare forms match by last address segment / suffix / token prefix
     (all normalized: lowercase, diacritics and punctuation stripped).
  2. block codes: house-number + street-initials pattern (1BNK -> "1B" + "Nguyen Kiem").
     Every block link is cross-checked against the home store of the
     employees actually scheduled in that block.
Aliases that match zero or more than one store are left out and reported
for human review - never guessed.
"""

import csv
import re
import sqlite3
import unicodedata
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "db" / "hr_bot.db"
CSV_PATH = Path(__file__).resolve().parent.parent / "data" / "store_aliases.csv"

KIND_ATT = "attendance_correction"
KIND_CASH = "cash_count"
KIND_TRAIN = "training_location"
KIND_BLOCK = "block_code"


def norm(s: str) -> str:
    s = s.replace("đ", "d").replace("Đ", "d").lower()
    s = unicodedata.normalize("NFD", s)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = re.sub(r"[^a-z0-9 ]+", " ", s)
    return re.sub(r"\s+", " ", s).strip()


def split_parts(name: str) -> list[str]:
    return [p for p in re.split(r"\s+-\s+", name.strip()) if p]


def initials(seg: str) -> str:
    return "".join(w[0] for w in norm(seg).split())


def match_name(alias: str, stores: list[str]) -> tuple[list[str], str | None]:
    """Return (candidate stores, method) via deterministic rules; candidates carry method order."""
    a = norm(alias)
    parts = split_parts(alias)
    brand = norm(parts[0]) if len(parts) > 1 else None
    tail = norm(" - ".join(parts[1:])) if len(parts) > 1 else None
    hits: list[tuple[str, str]] = []
    for st in stores:
        c = norm(st)
        cparts = split_parts(st)
        cbrand = norm(cparts[0])
        clast = norm(cparts[-1])
        if a == c:
            return [st], "exact_full"
        if brand is not None and brand != cbrand:
            continue
        if tail is not None:
            if tail == clast:
                hits.append((st, "prefix_tail"))
            elif (len(cparts) >= 3 and len(tail.split()) >= 2
                  and initials(cparts[-2]) == tail.split()[-1]
                  and clast.startswith(" ".join(tail.split()[:-1]) + " ")):
                hits.append((st, "district_initials_prefix"))
        else:
            if a == clast:
                hits.append((st, "last_segment"))
            elif c.endswith(" " + a):
                hits.append((st, "full_suffix"))
            elif clast.startswith(a + " ") or clast == a:
                hits.append((st, "token_prefix"))
    names = sorted({st for st, _ in hits})
    method = hits[0][1] if hits else None
    return names, method


def block_key(store: str) -> str | None:
    toks = norm(split_parts(store)[-1]).split()
    for i, t in enumerate(toks):
        if re.match(r"^[0-9]", t):
            rest = toks[i + 1:]
            if rest:
                return f"{t}|{''.join(w[0] for w in rest)}"
    return None


def main() -> None:
    con = sqlite3.connect(DB_PATH)
    con.execute("PRAGMA foreign_keys = ON")
    cur = con.cursor()

    stores = [r[0] for r in cur.execute("SELECT store_name FROM stores ORDER BY store_name")]
    block_keys: dict[str, list[str]] = {}
    for st in stores:
        k = block_key(st)
        if k:
            block_keys.setdefault(k, []).append(st)

    variants: list[tuple[str, str]] = []
    variants += [(KIND_ATT, r[0]) for r in cur.execute("SELECT DISTINCT store_name FROM attendance_corrections")]
    variants += [(KIND_CASH, r[0]) for r in cur.execute("SELECT DISTINCT store_name FROM cash_counts")]
    variants += [(KIND_TRAIN, r[0]) for r in cur.execute("SELECT DISTINCT location FROM training_attendance")]
    variants += [(KIND_BLOCK, r[0]) for r in cur.execute(
        "SELECT DISTINCT block_code FROM schedule_blocks WHERE block_code IS NOT NULL")]

    resolved: list[tuple[str, str, str, str, str | None]] = []  # alias, kind, store, method, verified_via
    unresolved: list[tuple[str, str, str]] = []  # alias, kind, reason

    for kind, alias in variants:
        if kind == KIND_BLOCK:
            code = norm(alias)
            m = re.match(r"^([0-9]+)", code)
            cands: list[str] = []
            if m:
                digits, rest = m.group(1), code[m.end():]
                # the first letter may belong to the house number (1BNK) or to the street
                # initials (111BĐ) - try both splits, require exactly one store overall
                keys = [f"{digits}|{rest}"]
                if rest and rest[0].isalpha():
                    keys.append(f"{digits}{rest[0]}|{rest[1:]}")
                for k in keys:
                    cands += [s for s in block_keys.get(k, []) if s not in cands]
            if len(cands) == 1:
                store = cands[0]
                majority = cur.execute(
                    """SELECT e.store_raw, COUNT(*) AS c
                       FROM schedule_entries se
                       JOIN schedule_blocks b
                         ON b.sheet_name = se.sheet_name AND b.block_index = se.block_index
                       JOIN employees e ON e.employee_code = se.employee_code
                       WHERE b.block_code = ? AND se.employee_code IS NOT NULL
                       GROUP BY e.store_raw ORDER BY c DESC LIMIT 1""",
                    (alias,),
                ).fetchone()
                verified = "employee_majority_ok" if majority and majority[0] == store \
                    else (f"employee_majority_differs:{majority[0]}" if majority else "no_employee_signal")
                resolved.append((alias, kind, store, "block_pattern", verified))
            else:
                unresolved.append((alias, kind, f"{len(cands)} pattern candidates"))
        else:
            cands, method = match_name(alias, stores)
            if len(cands) == 1:
                resolved.append((alias, kind, cands[0], method or "match", None))
            else:
                unresolved.append((alias, kind, f"{len(cands)} name candidates"))

    cur.execute("DROP TABLE IF EXISTS store_aliases")
    cur.execute(
        """CREATE TABLE store_aliases (
               alias        TEXT NOT NULL,
               alias_kind   TEXT NOT NULL,
               store_name   TEXT NOT NULL REFERENCES stores(store_name),
               match_method TEXT NOT NULL,
               verified_via TEXT,
               PRIMARY KEY (alias, alias_kind)
           )"""
    )
    cur.executemany("INSERT INTO store_aliases VALUES (?, ?, ?, ?, ?)", resolved)
    con.commit()

    print("== RESOLVED ==")
    for alias, kind, store, method, verified in resolved:
        extra = f"  [{verified}]" if verified else ""
        print(f"{alias!r:42} ({kind}) -> {store}  via {method}{extra}")
    print("\n== UNRESOLVED (left out, needs human) ==")
    for alias, kind, reason in unresolved:
        print(f"{alias!r:42} ({kind}) - {reason}")

    print("\n== VERIFICATION via store_aliases ==")
    checks = [
        ("attendance_corrections", KIND_ATT, "t.store_name = sa.alias"),
        ("cash_counts", KIND_CASH, "t.store_name = sa.alias"),
        ("training_attendance", KIND_TRAIN, "t.location = sa.alias"),
    ]
    for table, kind, on in checks:
        total, matched = cur.execute(
            f"""SELECT COUNT(*), SUM(CASE WHEN sa.store_name IS NOT NULL THEN 1 ELSE 0 END)
                FROM {table} t
                LEFT JOIN store_aliases sa ON sa.alias_kind = '{kind}' AND {on}"""
        ).fetchone()
        print(f"{table:24} {matched}/{total} rows linked to stores")
    total, linked = cur.execute(
        """SELECT COUNT(*), SUM(CASE WHEN sa.store_name IS NOT NULL THEN 1 ELSE 0 END)
           FROM schedule_entries se
           JOIN schedule_blocks b
             ON b.sheet_name = se.sheet_name AND b.block_index = se.block_index
           LEFT JOIN store_aliases sa ON sa.alias_kind = 'block_code' AND sa.alias = b.block_code"""
    ).fetchone()
    print(f"schedule_entries         {linked}/{total} rows linked via block_code")

    con.close()

    CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    with CSV_PATH.open("w", newline="", encoding="utf-8-sig") as f:
        w = csv.writer(f)
        w.writerow(["alias", "alias_kind", "store_name", "match_method", "verified_via"])
        w.writerows(resolved)
    print(f"\nCSV mirror written to {CSV_PATH}")


if __name__ == "__main__":
    main()

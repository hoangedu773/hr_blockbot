#!/usr/bin/env python3
"""Seed 01 — departments suy ra từ store_raw (R2).

Nguồn: employees.store_raw (144 giá trị phân biệt) + stores.store_name.
Luật: "<BRAND> - <KHU VỰC> - <ĐỊA CHỈ>" -> department = KHU VỰC.
      "Group <ROLE> <TÊN>" (quản lý vùng) -> department riêng, kind=group.
      còn lại -> kind=unmapped.
Idempotent: upsert theo code. Revert: xoá document có seededBy=seed-01.
"""
import os
import re
import sys
import argparse
import datetime
from collections import defaultdict

from pymongo import MongoClient, UpdateOne

SEED = "seed-01"
STORE_RE = re.compile(r"^(?P<brand>[^-]+) - (?P<region>[^-]+) - (?P<addr>.+)$")
GROUP_RE = re.compile(r"^Group\s+\S+", re.IGNORECASE)


def slug(text: str) -> str:
    mapping = {
        "à": "a", "á": "a", "ả": "a", "ã": "a", "ạ": "a", "ă": "a", "ằ": "a", "ắ": "a",
        "ẳ": "a", "ẵ": "a", "ặ": "a", "â": "a", "ầ": "a", "ấ": "a", "ẩ": "a", "ẫ": "a",
        "ậ": "a", "đ": "d", "è": "e", "é": "e", "ẻ": "e", "ẽ": "e", "ẹ": "e", "ê": "e",
        "ề": "e", "ế": "e", "ể": "e", "ễ": "e", "ệ": "e", "ì": "i", "í": "i", "ỉ": "i",
        "ĩ": "i", "ị": "i", "ò": "o", "ó": "o", "ỏ": "o", "õ": "o", "ọ": "o", "ô": "o",
        "ồ": "o", "ố": "o", "ổ": "o", "ỗ": "o", "ộ": "o", "ơ": "o", "ờ": "o", "ớ": "o",
        "ở": "o", "ỡ": "o", "ợ": "o", "ù": "u", "ú": "u", "ủ": "u", "ũ": "u", "ụ": "u",
        "ư": "u", "ừ": "u", "ứ": "u", "ử": "u", "ữ": "u", "ự": "u", "ỳ": "y", "ý": "y",
        "ỷ": "y", "ỹ": "y", "ỵ": "y",
    }
    s = "".join(mapping.get(ch, ch) for ch in text.lower())
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    return s[:40]


def classify(value: str):
    v = (value or "").strip()
    m = STORE_RE.match(v)
    if m:
        return "region", m.group("region").strip(), m.group("brand").strip()
    if GROUP_RE.match(v):
        return "group", v, None
    return "unmapped", v or "(trống)", None


def build(docs):
    regions = defaultdict(lambda: {"stores": set(), "employees": 0, "brands": set()})
    for d in docs:
        kind, key, brand = classify(d.get("store_raw"))
        row = regions[(kind, key)]
        row["employees"] += 1
        if d.get("store_raw"):
            row["stores"].add(d["store_raw"])
        if brand:
            row["brands"].add(brand)
    return regions


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--revert", action="store_true")
    args = ap.parse_args()

    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("FATAL: MONGODB_URI chưa đặt")
    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    db = client.get_default_database()
    assert db.name == "hr_bot", f"từ chối chạy trên DB {db.name}: chỉ cho phép hr_bot"

    if args.revert:
        n = db.departments.delete_many({"seededBy": SEED}).deleted_count
        print(f"revert: xoá {n} department (seededBy={SEED})")
        return

    docs = list(db.employees.find({}, {"store_raw": 1, "_id": 0}))
    regions = build(docs)
    now = datetime.datetime.now(datetime.timezone.utc)

    ops = []
    for (kind, key), row in sorted(regions.items()):
        code = slug(key)
        ops.append(UpdateOne(
            {"code": code},
            {"$set": {
                "code": code,
                "name": key,
                "kind": kind,
                "storeCount": len(row["stores"]),
                "employeeCount": row["employees"],
                "seededBy": SEED,
                "seededAt": now,
            }},
            upsert=True,
        ))

    print(f"departments: {len(ops)}")
    print(f"{'kind':<10}{'name':<24}{'stores':>7}{'employees':>11}")
    for (kind, key), row in sorted(regions.items(), key=lambda x: -x[1]["employees"]):
        print(f"{kind:<10}{key[:23]:<24}{len(row['stores']):>7}{row['employees']:>11}")

    if args.dry_run:
        print("\n[dry-run] không ghi DB")
        return
    res = db.departments.bulk_write(ops, ordered=False)
    print(f"\nupserted={len(res.upserted_ids)} modified={res.modified_count}")


if __name__ == "__main__":
    main()

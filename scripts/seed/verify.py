#!/usr/bin/env python3
"""Seed verify — assertion V1..V6 cho dữ liệu suy diễn. Exit 1 nếu lệch."""
import os
import sys
from collections import Counter

from pymongo import MongoClient

LEVELS = {"Intern", "Junior", "Middle", "Senior", "Lead"}


def main():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("FATAL: MONGODB_URI chưa đặt")
    db = MongoClient(uri, serverSelectionTimeoutMS=15000).get_default_database()
    assert db.name == "hr_bot"

    total = db.employees.estimated_document_count()
    dept_ids = {d["_id"] for d in db.departments.find({}, {"_id": 1})}
    fails = []

    levels = Counter()
    statuses = Counter()
    bad_level = bad_meta = bad_phone = 0
    orphan = 0
    status_mismatch = 0

    for e in db.employees.find({}, {"level": 1, "status": 1, "departmentId": 1,
                                    "derivedMeta": 1, "phone": 1, "leave_date": 1}):
        lv = e.get("level")
        levels[lv] += 1
        statuses[e.get("status")] += 1
        if lv not in LEVELS:
            bad_level += 1
        if e.get("phone") not in (None, ""):
            bad_phone += 1
        meta = e.get("derivedMeta") or {}
        if not {"level", "status", "departmentId", "skills", "activeLoad"} <= set(meta):
            bad_meta += 1
        did = e.get("departmentId")
        if did is not None and did not in dept_ids:
            orphan += 1
        expected = "inactive" if e.get("leave_date") not in (None, "", "None", "null") else "active"
        if e.get("status") != expected:
            status_mismatch += 1

    checks = [
        ("V1 level trong enum", bad_level == 0, f"sai={bad_level}"),
        ("V2 departmentId resolve", orphan == 0, f"orphan={orphan}"),
        ("V3 status khớp leave_date", status_mismatch == 0, f"lệch={status_mismatch}"),
        ("V4 tổng document", total == 2439, f"total={total}"),
        ("V5 không có phone", bad_phone == 0, f"có phone={bad_phone}"),
        ("V6 derivedMeta đủ 5 rule", bad_meta == 0, f"thiếu={bad_meta}"),
    ]
    print(f"{'check':<34}{'kết quả':<10}chi tiết")
    for name, ok, detail in checks:
        print(f"{name:<34}{'PASS' if ok else 'FAIL':<10}{detail}")
        if not ok:
            fails.append(name)

    print("\nlevel   :", dict(sorted(levels.items(), key=lambda x: -x[1])))
    print("status  :", dict(statuses))
    print("departments:", db.departments.count_documents({}),
          "| có nhân sự:", db.departments.count_documents({"employeeCount": {"$gt": 0}}))

    if fails:
        print("\nFAILED:", ", ".join(fails))
        sys.exit(1)
    print("\nALL CHECKS PASS")


if __name__ == "__main__":
    main()

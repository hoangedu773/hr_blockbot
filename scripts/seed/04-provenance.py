#!/usr/bin/env python3
"""Seed 04 — ghi `data_provenance` (1 document / lần chạy) + `provenance-report.json`.

Mục đích (`docs/design/data-derivation.md` §4.2): chứng minh mọi field suy diễn trên
`employees` là hàm tất định của dữ liệu thật, có `(ruleId, inputs, codeHash)` — để báo
cáo khớp đúng phiên bản luật seed 01/02.

Một document `data_provenance`:
  runId, at, codeHashes {seedFile: sha256}, rules [{ruleId, version, description, inputs,
  sourceSeed, codeHash, branchCount}], totals, outputs [{collection, field, distribution}]

`codeHash` = sha256 của file script → kiểm bằng lệnh:
  Get-FileHash scripts/seed/02-derive-hr.py -Algorithm SHA256

Idempotent: upsert theo `runId`, `at` chỉ ghi 1 lần ($setOnInsert); chạy lại `modified=0`
và report JSON giống hệt (trừ `at`). `--dry-run` in phân bố, không ghi.
`--revert` xoá document do script này tạo + file report.
"""
import os
import sys
import json
import argparse
import hashlib
import datetime
from collections import Counter

from pymongo import MongoClient

SEED = "seed-04"
RUN_ID = "seed-20261020-v1"
HERE = os.path.dirname(os.path.abspath(__file__))
REPORT_PATH = os.path.join(HERE, "provenance-report.json")
CODE_FILES = {
    "01-departments.py": "departments/R2",
    "02-derive-hr.py": "employees/R1-R5",
}
LEVELS = ["Intern", "Junior", "Middle", "Senior", "Lead"]
EXPECTED_EMPLOYEES = 2439

RULES = [
    {"ruleId": "R1-status-leave-v1", "version": 1, "inputs": ["leave_date"],
     "sourceSeed": "02-derive-hr.py",
     "description": "status=inactive nếu leave_date khác null, ngược lại active"},
    {"ruleId": "R2-region-from-store-v1", "version": 1, "inputs": ["store_raw"],
     "sourceSeed": "01-departments.py",
     "description": "departmentId <- tách store_raw thành 37 đơn vị (26 region + 8 group + 3 unmapped)"},
    {"ruleId": "R3a-title-v1", "version": 1, "inputs": ["job_title"],
     "sourceSeed": "02-derive-hr.py",
     "description": "level tầng quản lý theo job_title (OD/OM->Lead; AOM/AM/SM->Senior; Phụ trách/Bếp chính->Middle)"},
    {"ruleId": "R3b-tenure-lt3-v1", "version": 1, "inputs": ["hire_date"],
     "sourceSeed": "02-derive-hr.py",
     "description": "nhân viên <3 tháng thâm niên -> Intern"},
    {"ruleId": "R3b-tenure-3to24-v1", "version": 1, "inputs": ["hire_date"],
     "sourceSeed": "02-derive-hr.py",
     "description": "nhân viên 3-24 tháng thâm niên -> Junior"},
    {"ruleId": "R3b-tenure-ge24-v1", "version": 1, "inputs": ["hire_date"],
     "sourceSeed": "02-derive-hr.py",
     "description": "nhân viên >=24 tháng thâm niên -> Middle"},
    {"ruleId": "R3c-nohire-v1", "version": 1, "inputs": ["hire_date"],
     "sourceSeed": "02-derive-hr.py",
     "description": "thiếu hire_date hợp lệ -> Intern (fallback tất định)"},
    {"ruleId": "R4-title-skill-map-v1", "version": 1, "inputs": ["job_title"],
     "sourceSeed": "02-derive-hr.py",
     "description": "skills <- bảng ánh xạ title -> skill set cố định"},
    {"ruleId": "R5-projects-count-v1", "version": 1, "inputs": ["projects"],
     "sourceSeed": "02-derive-hr.py",
     "description": "activeLoad <- số projects đang mở; 0 lúc seed (F2 chưa có dữ liệu)"},
]

# derivedMeta.<field>.rule -> ruleId dùng để đếm branchCount
META_FIELD_TO_RULE = {
    "status": "R1-status-leave-v1",
    "departmentId": "R2-region-from-store-v1",
    "skills": "R4-title-skill-map-v1",
    "activeLoad": "R5-projects-count-v1",
}


def connect():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("FATAL: MONGODB_URI chưa đặt (không in giá trị URI ra log)")
    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    db = client.get_default_database(default="hr_bot")
    assert db.name == "hr_bot", f"từ chối chạy trên DB {db.name}: chỉ cho phép hr_bot"
    return db


def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(65536), b""):
            h.update(chunk)
    return h.hexdigest()


def is_blank(v) -> bool:
    return v in (None, "", "None", "null")


def collect(db):
    """Đọc + đếm từ DB thật; trả (report_without_at, assertions_failed)."""
    code_hashes = {name: sha256_file(os.path.join(HERE, name)) for name in CODE_FILES}

    dept_ids = {d["_id"] for d in db.departments.find({}, {"_id": 1})}
    total = db.employees.estimated_document_count()

    level_c, status_c, active_load_c = Counter(), Counter(), Counter()
    skill_sets_c = Counter()
    rule_branch = Counter()
    bad_level = orphan_dept = status_mismatch = has_phone = missing_meta = 0

    fields = {"level": 1, "status": 1, "departmentId": 1, "derivedMeta": 1,
              "skills": 1, "activeLoad": 1, "phone": 1, "leave_date": 1}
    for e in db.employees.find({}, fields):
        level_c[e.get("level")] += 1
        status_c[e.get("status")] += 1
        active_load_c[e.get("activeLoad")] += 1
        skill_sets_c[len(e.get("skills") or [])] += 1

        if e.get("level") not in LEVELS:
            bad_level += 1
        did = e.get("departmentId")
        if did is not None and did not in dept_ids:
            orphan_dept += 1
        expected_status = "inactive" if not is_blank(e.get("leave_date")) else "active"
        if e.get("status") != expected_status:
            status_mismatch += 1
        if not is_blank(e.get("phone")):
            has_phone += 1

        meta = e.get("derivedMeta") or {}
        if not {"level", "status", "departmentId", "skills", "activeLoad"} <= set(meta):
            missing_meta += 1
            continue
        for field, rule_id in META_FIELD_TO_RULE.items():
            if (meta.get(field) or {}).get("rule") == rule_id:
                rule_branch[rule_id] += 1
        level_rule = (meta.get("level") or {}).get("rule")
        if level_rule:
            rule_branch[level_rule] += 1

    rules = []
    for rule in RULES:
        rules.append({**rule, "codeHash": code_hashes[rule["sourceSeed"]],
                      "branchCount": rule_branch.get(rule["ruleId"], 0)})

    outputs = [
        {"collection": "employees", "field": "level",
         "distribution": {lv: level_c.get(lv, 0) for lv in LEVELS}},
        {"collection": "employees", "field": "status",
         "distribution": {k: status_c.get(k, 0) for k in ("active", "inactive")}},
        {"collection": "employees", "field": "skills",
         "distribution": {f"{n} skill": skill_sets_c.get(n, 0)
                          for n in sorted(skill_sets_c)}},
        {"collection": "employees", "field": "activeLoad",
         "distribution": {str(k): v for k, v in sorted(
             active_load_c.items(), key=lambda x: (x[0] is None, x[0]))}},
        {"collection": "departments", "field": "_id",
         "distribution": {"resolved": total - orphan_dept, "orphan": orphan_dept}},
    ]

    report = {
        "runId": RUN_ID,
        "codeHashes": code_hashes,
        "rules": rules,
        "totals": {
            "employees": total,
            "derivedFields": 5,
            "derivedDocuments": total - missing_meta,
            "rawFieldsUntouched": 12,
        },
        "outputs": outputs,
    }

    failures = []
    if bad_level:
        failures.append(f"V1 level ngoài enum: {bad_level}")
    if orphan_dept:
        failures.append(f"V2 departmentId orphan: {orphan_dept}")
    if status_mismatch:
        failures.append(f"V3 status lệch leave_date: {status_mismatch}")
    if has_phone:
        failures.append(f"V5 có phone: {has_phone}")
    if missing_meta:
        failures.append(f"V6 thiếu derivedMeta: {missing_meta}")
    if total != EXPECTED_EMPLOYEES:
        failures.append(f"V0 tổng document {total} != {EXPECTED_EMPLOYEES}")
    return report, failures


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--revert", action="store_true")
    args = ap.parse_args()

    db = connect()

    if args.revert:
        removed = db.data_provenance.delete_many({"seededBy": SEED}).deleted_count
        if os.path.exists(REPORT_PATH):
            os.remove(REPORT_PATH)
        print(f"revert: xoá {removed} document data_provenance (seededBy={SEED}) + report JSON")
        return

    report, failures = collect(db)
    payload = json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True)

    print(f"runId: {report['runId']} | employees: {report['totals']['employees']}")
    print("codeHash:")
    for name, digest in report["codeHashes"].items():
        print(f"  {name:<20}{digest}")
    print(f"{'ruleId':<28}{'branchCount':>12}  sourceSeed")
    for r in report["rules"]:
        print(f"{r['ruleId']:<28}{r['branchCount']:>12}  {r['sourceSeed']}")
    print("level :", report["outputs"][0]["distribution"])
    print("status:", report["outputs"][1]["distribution"])

    if failures:
        print("\nFAILED assertion:")
        for f in failures:
            print("  -", f)
        sys.exit(1)

    if args.dry_run:
        print("\n[dry-run] không ghi DB, không ghi report JSON")
        return

    now = datetime.datetime.now(datetime.timezone.utc)
    res = db.data_provenance.update_one(
        {"runId": RUN_ID},
        {
            "$set": {k: report[k] for k in ("runId", "codeHashes", "rules", "totals", "outputs")},
            "$setOnInsert": {"at": now, "seededBy": SEED, "seededAt": now},
        },
        upsert=True,
    )
    with open(REPORT_PATH, "w", encoding="utf-8", newline="\n") as f:
        f.write(payload + "\n")
    print(f"\nprovenance: upserted={1 if res.upserted_id else 0} modified={res.modified_count}"
          f" | report={os.path.relpath(REPORT_PATH, os.getcwd())}")
    print("lưu ý: chạy lại phải modified=0 và report byte-identical (trừ `at` trong DB)")


if __name__ == "__main__":
    main()

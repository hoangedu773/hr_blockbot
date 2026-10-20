#!/usr/bin/env python3
"""Seed 02 — suy diễn field hồ sơ nhân sự (R1, R3, R4, R5, R6).

Mọi giá trị suy diễn là hàm tất định của dữ liệu thật:
  R1 status       <- leave_date
  R2 departmentId <- store_raw (dùng code của departments do seed 01 tạo)
  R3 level        <- job_title (tầng quản lý) hoặc hire_date (thâm niên)
  R4 skills       <- bảng ánh xạ title -> skill (công bố trong docs/design/data-derivation.md)
  R5 activeLoad   <- 0 (chưa có projects), sẽ tính lại khi F2 có dữ liệu
  R6 phone        <- KHÔNG tạo (không có trong nguồn)

Idempotent: chỉ $set field suy diễn + derivedMeta. Revert: $unset.
"""
import os
import re
import sys
import argparse
import datetime
from collections import Counter

from pymongo import MongoClient, UpdateOne

SEED = "seed-02"
LEVELS = ("Intern", "Junior", "Middle", "Senior", "Lead")

TITLE_LEVEL = {
    "OD": "Lead", "OM": "Lead",
    "AOM": "Senior", "AM": "Senior", "SM": "Senior", "SM (Cửa hàng trưởng)": "Senior",
    "Phụ trách cửa hàng": "Middle", "BẾP - Bếp chính": "Middle",
}

SKILLS = {
    "CAFE - Nhân viên bán hàng": ["Pha chế", "Bán hàng"],
    "BÁNH MÌ 365 - Nhân viên bán hàng": ["Bán hàng", "Sơ chế"],
    "BẾP - Bếp nấu": ["Nấu ăn", "An toàn thực phẩm"],
    "BẾP - Phụ bếp": ["Sơ chế", "Vệ sinh"],
    "BẾP - Bếp phụ": ["Sơ chế", "Vệ sinh"],
    "BẾP - Bếp chính": ["Điều phối bếp", "Bếp trưởng"],
    "Bảo vệ": ["An ninh"],
    "Giao hàng": ["Giao hàng"],
    "SM": ["Quản lý vận hành", "Lập kế hoạch"],
    "SM (Cửa hàng trưởng)": ["Quản lý vận hành", "Lập kế hoạch"],
    "AM": ["Quản lý vận hành", "Phân tích kinh doanh"],
    "AOM": ["Quản lý đa cửa hàng", "Điều hành khu vực"],
    "OM": ["Chiến lược vận hành", "Quản trị vùng"],
    "OD": ["Chiến lược vận hành", "Quản trị hệ thống"],
}

STORE_RE = re.compile(r"^[^-]+ - (?P<region>[^-]+) - .+$")
GROUP_RE = re.compile(r"^Group\s+\S+", re.IGNORECASE)


def slug(text: str) -> str:
    mapping = {"à":"a","á":"a","ả":"a","ã":"a","ạ":"a","ă":"a","ằ":"a","ắ":"a","ẳ":"a","ẵ":"a","ặ":"a",
               "â":"a","ầ":"a","ấ":"a","ẩ":"a","ẫ":"a","ậ":"a","đ":"d","è":"e","é":"e","ẻ":"e","ẽ":"e",
               "ẹ":"e","ê":"e","ề":"e","ế":"e","ể":"e","ễ":"e","ệ":"e","ì":"i","í":"i","ỉ":"i","ĩ":"i",
               "ị":"i","ò":"o","ó":"o","ỏ":"o","õ":"o","ọ":"o","ô":"o","ồ":"o","ố":"o","ổ":"o","ỗ":"o",
               "ộ":"o","ơ":"o","ờ":"o","ớ":"o","ở":"o","ỡ":"o","ợ":"o","ù":"u","ú":"u","ủ":"u","ũ":"u",
               "ụ":"u","ư":"u","ừ":"u","ứ":"u","ử":"u","ữ":"u","ự":"u","ỳ":"y","ý":"y","ỷ":"y","ỹ":"y","ỵ":"y"}
    s = "".join(mapping.get(ch, ch) for ch in str(text).lower())
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:40]


def dept_code(store_raw: str) -> str:
    v = (store_raw or "").strip()
    m = STORE_RE.match(v)
    if m:
        return slug(m.group("region").strip())
    if GROUP_RE.match(v):
        return slug(v)
    return slug(v or "(trống)")


def has_leave(v) -> bool:
    return v not in (None, "", "None", "null")


def parse_date(v):
    if v in (None, "", "None", "null"):
        return None
    s = str(v)[:10]
    try:
        return datetime.date.fromisoformat(s)
    except ValueError:
        return None


def tenure_months(hire, today):
    if hire is None:
        return None
    return (today.year - hire.year) * 12 + (today.month - hire.month)


def level_for(title, tenure):
    t = (title or "").strip()
    if t in TITLE_LEVEL:
        return TITLE_LEVEL[t], "R3a-title"
    if tenure is None:
        return "Intern", "R3c-nohire"
    if tenure < 3:
        return "Intern", "R3b-tenure-lt3"
    if tenure < 24:
        return "Junior", "R3b-tenure-3to24"
    return "Middle", "R3b-tenure-ge24"


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
    assert db.name == "hr_bot", f"từ chối chạy trên DB {db.name}"

    DERIVED = ["level", "status", "departmentId", "skills", "activeLoad", "derivedMeta"]

    if args.revert:
        res = db.employees.update_many({}, {"$unset": {f: "" for f in DERIVED}})
        print(f"revert: {res.modified_count} document trả về 13 field gốc")
        return

    dept_ids = {d["code"]: d["_id"] for d in db.departments.find({"seededBy": "seed-01"}, {"code": 1})}
    print(f"departments khả dụng: {len(dept_ids)}")

    today = datetime.date(2026, 10, 20)
    now = datetime.datetime.now(datetime.timezone.utc)

    level_c = Counter()
    rule_c = Counter()
    status_c = Counter()
    dept_missing = Counter()
    ops = []
    total = 0

    for e in db.employees.find({}, {"employee_code": 1, "job_title": 1, "hire_date": 1,
                                    "leave_date": 1, "store_raw": 1}):
        total += 1
        tenure = tenure_months(parse_date(e.get("hire_date")), today)
        level, level_rule = level_for(e.get("job_title"), tenure)
        status = "inactive" if has_leave(e.get("leave_date")) else "active"
        code = dept_code(e.get("store_raw"))
        dept_id = dept_ids.get(code)
        if dept_id is None:
            dept_missing[code] += 1
        skills = SKILLS.get((e.get("job_title") or "").strip(), [])

        level_c[level] += 1
        rule_c[level_rule] += 1
        status_c[status] += 1

        ops.append(UpdateOne({"_id": e["_id"]}, {"$set": {
            "level": level,
            "status": status,
            "departmentId": dept_id,
            "skills": skills,
            "activeLoad": 0,
            # $set từng khoá con để không ghi đè derivedMeta.at của lần chạy đầu
            "derivedMeta.level": {"rule": f"{level_rule}-v1", "inputs": ["job_title", "hire_date"]},
            "derivedMeta.status": {"rule": "R1-status-leave-v1", "inputs": ["leave_date"]},
            "derivedMeta.departmentId": {"rule": "R2-region-from-store-v1", "inputs": ["store_raw"]},
            "derivedMeta.skills": {"rule": "R4-title-skill-map-v1", "inputs": ["job_title"]},
            "derivedMeta.activeLoad": {"rule": "R5-projects-count-v1", "inputs": ["projects"]},
            "derivedMeta.seed": SEED,
        }}))

    print(f"\ntổng nhân sự: {total}")
    print("level:", dict(sorted(level_c.items(), key=lambda x: -x[1])))
    print("rule :", dict(sorted(rule_c.items(), key=lambda x: -x[1])))
    print("status:", dict(status_c))
    if dept_missing:
        print("department không map được:", dict(dept_missing))
    assert sum(level_c.values()) == total, "level không phủ 100%"
    assert set(level_c) <= set(LEVELS), "level ngoài enum"

    if args.dry_run:
        print("\n[dry-run] không ghi DB")
        return
    res = db.employees.bulk_write(ops, ordered=False)
    # đóng dấu thời gian đúng một lần, để chạy lại không làm document thay đổi
    stamped = db.employees.update_many(
        {"derivedMeta.at": {"$exists": False}}, {"$set": {"derivedMeta.at": now}}
    )
    print(f"\nmodified={res.modified_count} matched={res.matched_count} stamped={stamped.modified_count}")


if __name__ == "__main__":
    main()

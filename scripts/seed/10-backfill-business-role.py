"""Backfill `employees.businessRole` from `job_title` (idempotent).

Same mapping as `apps/api/src/models/Employee.ts::deriveBusinessRole` — the TS
function is the authority for the running system; this script applies the same
table to existing documents so Mongo queries (e.g. "all SM in district X") work
without re-deriving. If the two drift, the TS test `business-role.test.mjs`
fails first.

Usage (from the repo root):
  python scripts/seed/10-backfill-business-role.py            # dry run, prints distribution
  python scripts/seed/10-backfill-business-role.py --apply
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE = REPO_ROOT / "apps" / "ai-service"

sys.path.insert(0, str(AI_SERVICE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(AI_SERVICE / ".env")
load_dotenv(REPO_ROOT / ".env")

from app.db import db_client  # noqa: E402


def derive_business_role(job_title: str | None, auth_role: str | None = None) -> str:
    if auth_role == "Admin":
        return "admin"
    title = (job_title or "").upper()
    if re.search(r"\bAOM\b", title):
        return "aom"
    if re.search(r"\bSM\b", title) or "CỬA HÀNG TRƯỞNG" in title:
        return "sm"
    if re.search(r"\bAM\b", title):
        return "am"
    if "PHỤ TRÁCH CỬA HÀNG" in title or re.search(r"\bPTCH\b", title):
        return "ptch"
    if re.search(r"\b(OD|OM)\b", title):
        return "admin"
    return "staff"


def main() -> int:
    parser = argparse.ArgumentParser(description="Backfill businessRole on employees.")
    parser.add_argument("--apply", action="store_true", help="write to MongoDB (default: dry run)")
    args = parser.parse_args()

    if not db_client.ping() or db_client.db is None:
        print("Không kết nối được MongoDB (ATLAS_URI).")
        return 2

    # auth role per employee (only ~5 users have accounts today)
    auth_roles = {
        str(u["employeeId"]): str(u.get("role") or "")
        for u in db_client.db.users.find({"employeeId": {"$ne": None}}, {"employeeId": 1, "role": 1})
    }

    distribution: dict[str, int] = {}
    changes: list[tuple] = []
    for emp in db_client.db.employees.find({}, {"job_title": 1}):
        emp_id = str(emp["_id"])
        role = derive_business_role(emp.get("job_title"), auth_roles.get(emp_id))
        distribution[role] = distribution.get(role, 0) + 1
        if emp.get("businessRole") != role:
            changes.append((emp_id, emp.get("job_title"), role))

    print("phân bố businessRole (dự kiến):")
    for role, count in sorted(distribution.items(), key=lambda kv: -kv[1]):
        print(f"  {role:6s} {count}")
    print(f"cần cập nhật: {len(changes)} / {db_client.db.employees.count_documents({})} nhân viên")

    if not args.apply:
        print("\nDRY RUN — chưa ghi. Thêm --apply để ghi.")
        return 0

    from pymongo import UpdateOne  # noqa: PLC0415

    ops = [UpdateOne({"_id": emp_id}, {"$set": {"businessRole": role}}) for emp_id, _, role in changes]
    if ops:
        db_client.db.employees.bulk_write(ops, ordered=False)
    print(f"\napplied: updated={len(ops)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

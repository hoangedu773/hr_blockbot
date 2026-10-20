#!/usr/bin/env python3
"""Seed 03 — 5 tài khoản demo (2 Admin, 3 Employee) + link `employees.userId` (R7).

Chỉ 5 người có tài khoản; 2.434 nhân sự còn lại KHÔNG được cấp tài khoản
(`docs/design/data-derivation.md` §2 R7, §6).

Ánh xạ tất định (không random):
  2 Admin   <- 2 nhân sự level=Lead, status=active, sort employee_code tăng dần
  3 Employee<- level Senior / Middle / Junior (mỗi bậc 1 người, active, sort employee_code)

Mật khẩu demo: lấy từ env `SEED_DEMO_PASSWORD`, mặc định "Demo@2026!" (tài khoản demo,
mật khẩu có chủ đích công khai — KHÔNG dùng cho dữ liệu thật). Trên môi trường deploy
công khai (NODE_ENV=production) script TỪ CHỐI chạy nếu thiếu `SEED_DEMO_PASSWORD`, để
không bao giờ tạo tài khoản Admin với mật khẩu đã công bố trên repo. Hash Argon2id theo
ADR-006: memory 19 MiB, iterations 2, parallelism 1. Salt là sha256(tiền tố + email)
để chạy lại cho cùng hash (idempotent byte-identical, phục vụ provenance tái lập);
với 5 tài khoản demo, mật khẩu đã công khai nên salt cố định không thêm rủi ro.

Idempotent: upsert theo `email`; chạy lần 2 không sửa document nào (trừ khi phát hiện
hash/role/employeeId lệch → sửa đúng chỗ đó). `--revert` xoá users do script này tạo và
gỡ `employees.userId` của đúng 5 người.

Không in PII: chỉ in email đăng nhập, role, level, employeeId (ObjectId).
"""
import os
import sys
import argparse
import hashlib
import datetime

import argon2
from pymongo import MongoClient

SEED = "seed-03"
DEMO_DOMAIN = "guta.vn"
DEFAULT_PASSWORD = "Demo@2026!"

# Bậc dùng để chọn 3 tài khoản Employee; 2 Admin lấy từ level=Lead.
DEMO_ROLES = ["Admin", "Admin", "Employee", "Employee", "Employee"]
DEMO_LEVELS = ["Lead", "Lead", "Senior", "Middle", "Junior"]
DEMO_EMAILS = ["admin1@guta.vn", "admin2@guta.vn",
               "employee1@guta.vn", "employee2@guta.vn", "employee3@guta.vn"]

HASH_PARAMS = dict(time_cost=2, memory_cost=19456, parallelism=1,
                   hash_len=32, salt_len=16, type=argon2.Type.ID)


def demo_password() -> str:
    configured = os.environ.get("SEED_DEMO_PASSWORD")
    if not configured and os.environ.get("NODE_ENV") == "production":
        sys.exit("FATAL: NODE_ENV=production nhưng thiếu SEED_DEMO_PASSWORD — "
                 "không tạo tài khoản demo với mật khẩu mặc định đã công bố trên repo")
    return configured or DEFAULT_PASSWORD


def demo_salt(email: str) -> bytes:
    return hashlib.sha256(f"hr-blockbot-demo-salt-v1:{email}".encode()).digest()[:16]


def hash_password(password: str, email: str) -> str:
    ph = argon2.PasswordHasher(**HASH_PARAMS)
    return ph.hash(password, salt=demo_salt(email))


def verify_password(password: str, stored_hash: str) -> bool:
    try:
        argon2.PasswordHasher().verify(stored_hash, password)
        return True
    except (argon2.exceptions.VerifyMismatchError,
            argon2.exceptions.VerificationError,
            argon2.exceptions.InvalidHash):
        return False


def connect():
    uri = os.environ.get("MONGODB_URI")
    if not uri:
        sys.exit("FATAL: MONGODB_URI chưa đặt (không in giá trị URI ra log)")
    client = MongoClient(uri, serverSelectionTimeoutMS=15000)
    db = client.get_default_database(default="hr_bot")
    assert db.name == "hr_bot", f"từ chối chạy trên DB {db.name}: chỉ cho phép hr_bot"
    return db


def pick_employees(db):
    """Chọn 5 nhân sự theo bậc, tất định theo employee_code tăng dần (bỏ người đã chọn)."""
    picked, used = [], set()
    for level in DEMO_LEVELS:
        found = None
        for doc in (db.employees
                    .find({"level": level, "status": "active",
                           "employee_code": {"$exists": True, "$ne": None}},
                          {"employee_code": 1, "_id": 1, "level": 1})
                    .sort("employee_code", 1)):
            if doc["employee_code"] in used:
                continue
            found = doc
            break
        if found is None:
            sys.exit(f"FATAL: không đủ nhân sự active level={level} để gán tài khoản demo")
        picked.append(found)
        used.add(found["employee_code"])
    codes = [p["employee_code"] for p in picked]
    if len(set(codes)) != 5:
        sys.exit(f"FATAL: 5 nhân sự demo không phân biệt: {codes}")
    return picked


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--revert", action="store_true")
    args = ap.parse_args()

    db = connect()

    if args.revert:
        ids = [u["_id"] for u in db.users.find({"seededBy": SEED}, {"_id": 1})]
        if ids:
            unset_count = db.employees.update_many(
                {"userId": {"$in": ids}}, {"$unset": {"userId": ""}}
            ).modified_count
            removed = db.users.delete_many({"_id": {"$in": ids}}).deleted_count
        else:
            unset_count, removed = 0, 0
        print(f"revert: xoá {removed} user (seededBy={SEED}); "
              f"gỡ userId khỏi {unset_count} employee")
        return

    password = demo_password()
    if not os.environ.get("SEED_DEMO_PASSWORD"):
        print("CẢNH BÁO: dùng mật khẩu demo mặc định đã công bố trong repo — chỉ dùng cho "
              "DB demo. Deploy công khai phải đặt SEED_DEMO_PASSWORD.")
    employees = pick_employees(db)
    now = datetime.datetime.now(datetime.timezone.utc)

    plan = []
    for email, role, level, emp in zip(DEMO_EMAILS, DEMO_ROLES, DEMO_LEVELS, employees):
        existing = db.users.find_one({"email": email})
        plan.append({"email": email, "role": role, "level": level,
                     "employeeId": emp["_id"], "employeeCode": emp["employee_code"],
                     "existing": existing})

    print(f"users demo: {len(plan)} | roles = {DEMO_ROLES}")
    print(f"{'email':<18}{'role':<10}{'level':<9}{'employeeCode':<16}{'action'}")
    total_insert = total_update = total_same = 0
    for item in plan:
        existing = item["existing"]
        if existing is None:
            action = "insert"
            total_insert += 1
        elif (existing.get("role") != item["role"]
              or existing.get("employeeId") != item["employeeId"]
              or not verify_password(password, existing.get("passwordHash", ""))):
            action = "update"
            total_update += 1
        else:
            action = "unchanged"
            total_same += 1
        print(f"{item['email']:<18}{item['role']:<10}{item['level']:<9}"
              f"{item['employeeCode']:<16}{action}")

    # Assert invariants (chạy cả trong dry-run, không cần DB write)
    assert len(set(DEMO_EMAILS)) == 5
    assert DEMO_ROLES.count("Admin") == 2 and DEMO_ROLES.count("Employee") == 3
    sample_hash = hash_password(password, DEMO_EMAILS[0])
    assert verify_password(password, sample_hash), "Argon2id tự verify thất bại"
    assert not verify_password("wrong-password", sample_hash), "sai mật khẩu vẫn verify được"
    assert verify_password(password, hash_password(password, DEMO_EMAILS[0])), \
        "hash không tất định (salt phải theo email)"

    if args.dry_run:
        print(f"\n[dry-run] không ghi DB | insert={total_insert} update={total_update} "
              f"unchanged={total_same}")
        return

    inserted = modified = 0
    for item in plan:
        passwordHash = hash_password(password, item["email"])
        if item["existing"] is None:
            user_id = db.users.insert_one({
                "email": item["email"],
                "passwordHash": passwordHash,
                "role": item["role"],
                "employeeId": item["employeeId"],
                "createdAt": now,
                "seededBy": SEED,
                "seededAt": now,
            }).inserted_id
            inserted += 1
        else:
            user_id = item["existing"]["_id"]
            res = db.users.update_one({"_id": user_id}, {"$set": {
                "passwordHash": passwordHash,
                "role": item["role"],
                "employeeId": item["employeeId"],
            }})
            modified += res.modified_count
        # R7: link một chiều employees.userId
        db.employees.update_one({"_id": item["employeeId"]}, {"$set": {"userId": user_id}})

    # Verify sau khi ghi: đúng 5 user, hash verify được, employeeId resolve về employees
    users = list(db.users.find({"seededBy": SEED}))
    assert len(users) == 5, f"phải có đúng 5 user demo, đang có {len(users)}"
    assert sorted(u["role"] for u in users) == sorted(DEMO_ROLES)
    emp_ids = [u["employeeId"] for u in users]
    assert len(set(emp_ids)) == 5, "employeeId phải phân biệt"
    assert db.employees.count_documents({"_id": {"$in": emp_ids}}) == 5, \
        "employeeId phải trỏ tới đúng 5 nhân sự thật"
    for u in users:
        assert verify_password(password, u["passwordHash"]), \
            f"Argon2id verify thất bại cho {u['email']}"
        assert db.employees.find_one({"_id": u["employeeId"], "userId": u["_id"]}), \
            f"employees.userId chưa link cho {u['email']}"

    print(f"\ninserted={inserted} modified={modified} verified=5/5 Argon2id + link employees")
    print("mật khẩu demo: env SEED_DEMO_PASSWORD (mặc định xem docstring script)")


if __name__ == "__main__":
    main()

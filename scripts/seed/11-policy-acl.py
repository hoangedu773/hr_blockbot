"""Gán ACL cho collection `policies` theo metadata thật của corpus.

Vì sao: `documentAllowed()` từ chối mọi document thiếu `acl` hợp lệ, nên
`approvedDocuments()` trả rỗng và tool `query_policy` không bao giờ trả tài liệu.
Đo trên Atlas ngày 2026-11-09: 223 document, **0 document có ACL**.

Phân loại dựa trên `provenance` + tiêu đề, KHÔNG dựa vào `contentType`: với document
crawl từ Drive, `contentType` là tên thư mục nguồn ("Thư mục Drive — tài liệu đào tạo")
chứ không phải loại nội dung.

    provenance "public-document"                -> T1_GENERAL   (luật, nghị định)
    provenance "authored"                       -> T1_GENERAL   (quy chế nội bộ soạn tay)
    provenance "authored-in-repo"               -> T1_GENERAL   (corpus seed 06)
    provenance.origin "scraped-knowledge"       -> T1_GENERAL   (tóm tắt trang tra cứu)
    provenance.origin "guta-portal-crawl":
        tiêu đề quyết định cá nhân              -> T3_HR_SENSITIVE  (chỉ hr)
        còn lại (chính sách, đào tạo, menu)     -> T1_GENERAL
    không khớp                                  -> UNCLASSIFIED (không ghi)

`T2_OPERATIONAL` không dùng: trên corpus này không có tài liệu nào "nghiệp vụ nhưng
không dành cho system_admin". `T3_TECHNICAL` cũng không dùng vì không có tài liệu kỹ thuật.

PII: bản dry-run đầu tiên quét SĐT/email và cho 73 false positive — toàn là hotline
công ty `028-6285...`, MST `0310716058`, email phòng ban `daotao@gutacafe.com`. Với
corpus này, rủi ro thật nằm ở **tên nhân viên trong tiêu đề quyết định bổ nhiệm**, thứ
regex SĐT không bắt được. Vì vậy script chỉ dùng PII check để phát hiện document cá
nhân (đưa vào T3) và cảnh báo số tiền lương, không dùng để hạ tier tài liệu công khai.

Usage (từ repo root):
  python scripts/seed/11-policy-acl.py                  # dry run, in bảng tier
  python scripts/seed/11-policy-acl.py --apply          # ghi acl
  python scripts/seed/11-policy-acl.py --revert         # gỡ acl do script này ghi
  python scripts/seed/11-policy-acl.py --self-check     # kiểm tra phân loại, không cần DB
"""

from __future__ import annotations

import argparse
import re
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE = REPO_ROOT / "apps" / "ai-service"
sys.path.insert(0, str(AI_SERVICE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")
load_dotenv(AI_SERVICE / ".env")

DEFAULT_APPROVAL_REF = "OWNER_POLICY_ACL_20261109"
ALL_PROFILES = ["system_admin", "hr", "om", "aom", "sam", "am", "sm", "ptch", "staff"]

# Quyết định nhân sự cá nhân: có tên người thật trong tiêu đề. Không được cho toàn bộ
# nhân viên đọc, nên vào T3_HR_SENSITIVE thay vì bị bỏ qua (chúng đã nằm trong corpus).
PERSONAL_DECISION = re.compile(r"(BỔ\s*NHIỆM|ĐIỀU\s*CHUYỂN|CHÀO\s*MỪNG|SINH\s*NHẬT)", re.IGNORECASE)

# Cảnh báo số tiền lương cụ thể (không tự hạ tier; chỉ để người duyệt xem).
SALARY_AMOUNT = re.compile(r"\d{1,3}(?:[.,]\d{3}){2,}\s*(?:đ|VNĐ|VND)", re.IGNORECASE)


def _origin(document: dict) -> str:
    """`provenance` là string ở seed 05, là object ở seed 06/08/crawl."""
    value = document.get("provenance")
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        return str(value.get("origin") or "").strip()
    return ""


def classify(document: dict) -> tuple[str | None, str]:
    """Trả (tier, tín hiệu). tier None nghĩa là UNCLASSIFIED."""
    origin = _origin(document)
    title = str(document.get("title") or document.get("document") or "")

    if origin in ("public-document", "authored", "authored-in-repo"):
        return "T1_GENERAL", f"provenance={origin}"

    if origin == "scraped-knowledge":
        return "T1_GENERAL", "provenance=scraped-knowledge"

    if origin == "guta-portal-crawl":
        if PERSONAL_DECISION.search(title):
            return "T3_HR_SENSITIVE", "portal + quyết định nhân sự cá nhân"
        return "T1_GENERAL", "portal + tài liệu công khai"

    if origin:
        return None, f"provenance={origin}"
    return None, "không có provenance"


def _document_text(document: dict) -> str:
    parts: list[str] = []
    for chunk in document.get("chunks") or []:
        if isinstance(chunk, dict):
            parts.append(str(chunk.get("text") or ""))
    for article in document.get("articles") or []:
        if isinstance(article, dict):
            parts.append(str(article.get("text") or ""))
    if not parts:
        parts.append(str(document.get("content") or ""))
    return "\n".join(parts)


def find_personal_names(document: dict) -> list[str]:
    """Tên người trong tiêu đề quyết định, dạng 'QUYẾT ĐỊNH ... - <TÊN> - <CHỨC DANH>'."""
    title = str(document.get("title") or document.get("document") or "")
    if not PERSONAL_DECISION.search(title):
        return []
    parts = [part.strip() for part in title.split(" - ")]
    return [part for part in parts[1:] if len(part) > 3][:1]


def decide(document: dict) -> dict:
    tier, signal = classify(document)
    title = str(document.get("title") or document.get("document") or "(không tên)")
    if tier is None:
        return {"title": title, "tier": None, "signal": signal, "profiles": [], "notes": []}

    notes: list[str] = []
    if tier == "T3_HR_SENSITIVE":
        profiles = ["hr"]
        names = find_personal_names(document)
        if names:
            notes.append(f"tên trong tiêu đề: {names[0][:40]}")
    else:
        profiles = ALL_PROFILES

    if SALARY_AMOUNT.search(_document_text(document)):
        notes.append("có số tiền lương cụ thể")

    return {"title": title, "tier": tier, "signal": signal, "profiles": profiles, "notes": notes}


def build_acl(tier: str, profiles: list[str], approval_ref: str, now: datetime) -> dict:
    return {
        "reviewStatus": "APPROVED",
        "approvalRef": approval_ref,
        "tier": tier,
        "classification": "operational",
        "allowedProfiles": profiles,
        "validFrom": now.isoformat().replace("+00:00", "Z"),
        "validUntil": None,
        "revokedAt": None,
        "scopeKind": "global",
        "storeIds": [],
    }


def _self_check() -> int:
    """Kiểm tra phân loại, không cần DB."""
    cases = [
        ({"title": "Bộ luật Lao động 2019", "provenance": "public-document"}, "T1_GENERAL"),
        ({"title": "Quy chế nội bộ GUTA", "provenance": "authored"}, "T1_GENERAL"),
        ({"title": "Quy Chế Chấm Công", "provenance": {"origin": "authored-in-repo"}}, "T1_GENERAL"),
        ({"title": "Tra cứu tài liệu đào tạo", "provenance": {"origin": "scraped-knowledge"}}, "T1_GENERAL"),
        ({"title": "MENU GUTA CAFE.pdf", "provenance": {"origin": "guta-portal-crawl"}}, "T1_GENERAL"),
        ({"title": "QUYẾT ĐỊNH BỔ NHIỆM - MAI ANH ĐÀO - AOM", "provenance": {"origin": "guta-portal-crawl"}}, "T3_HR_SENSITIVE"),
        ({"title": "QUYẾT ĐỊNH ĐIỀU CHUYỂN - TRẦN THỊ THU VÂN - NV", "provenance": {"origin": "guta-portal-crawl"}}, "T3_HR_SENSITIVE"),
        ({"title": "Không rõ nguồn"}, None),
        ({"title": "Nguồn lạ", "provenance": {"origin": "unknown-source"}}, None),
    ]
    failures = 0
    for document, expected in cases:
        tier, signal = classify(document)
        ok = tier == expected
        failures += 0 if ok else 1
        print(f"{'ok ' if ok else 'FAIL'} {document['title'][:40]:40s} -> {tier or 'UNCLASSIFIED':17s} ({signal})")
        if not ok:
            print(f"     expected {expected or 'UNCLASSIFIED'}")

    # Tên người chỉ bị nhận diện trong quyết định cá nhân, không trong tài liệu công khai.
    personal = decide({"title": "QUYẾT ĐỊNH BỔ NHIỆM - NGUYỄN CAO THANH TRẦM - QUẢN LÝ KHU VỰC",
                       "provenance": {"origin": "guta-portal-crawl"}})
    ok = personal["tier"] == "T3_HR_SENSITIVE" and personal["profiles"] == ["hr"] and personal["notes"]
    failures += 0 if ok else 1
    print(f"{'ok ' if ok else 'FAIL'} personal -> {personal['tier']} profiles={personal['profiles']} notes={personal['notes']}")

    public = decide({"title": "QUY ĐỊNH XỬ PHẠT NỘP TRỄ DOANH THU",
                     "provenance": {"origin": "guta-portal-crawl"}})
    ok = public["tier"] == "T1_GENERAL" and public["profiles"] == ALL_PROFILES
    failures += 0 if ok else 1
    print(f"{'ok ' if ok else 'FAIL'} public policy stays T1")

    # Hotline công ty không được coi là PII (đây là false positive của bản đầu).
    hotline = decide({"title": "Biên bản bàn giao", "provenance": {"origin": "guta-portal-crawl"},
                      "chunks": [{"text": "Điện thoại: 028 - 6285 1234 MST: 0310716058 email: daotao@gutacafe.com"}]})
    ok = hotline["tier"] == "T1_GENERAL"
    failures += 0 if ok else 1
    print(f"{'ok ' if ok else 'FAIL'} company hotline/email không hạ tier")

    t1 = build_acl("T1_GENERAL", ALL_PROFILES, "X", datetime.now(timezone.utc))
    t3 = build_acl("T3_HR_SENSITIVE", ["hr"], "X", datetime.now(timezone.utc))
    ok = len(t1["allowedProfiles"]) == 9 and t3["allowedProfiles"] == ["hr"] and t3["classification"] == "operational"
    failures += 0 if ok else 1
    print(f"{'ok ' if ok else 'FAIL'} ACL envelope invariants")

    total = len(cases) + 4
    print(f"\n{total - failures}/{total} checks passed")
    return 1 if failures else 0


def _retier_public_documents(collection, apply: bool) -> int:
    """Hạ các văn bản pháp luật công khai từ T3_HR_SENSITIVE về T1_GENERAL.

    Vì sao cần: `Bộ luật Lao động 2019` và `Nghị định 145/2020/NĐ-CP` là văn bản
    pháp luật công khai, nhưng ACL hiện xếp T3 (chỉ `hr` đọc). Nhân viên hỏi
    "làm thêm giờ tối đa bao nhiêu" sẽ nhận "chưa có tài liệu".

    Chỉ đụng document có `provenance = "public-document"` VÀ đang là T3_HR_SENSITIVE.
    Không sửa tier khác, không sửa nội dung, không đổi `approvalRef`.
    """
    targets = list(collection.find(
        {"provenance": "public-document", "acl.tier": "T3_HR_SENSITIVE"},
        {"title": 1, "acl": 1},
    ))
    if not targets:
        print("Không có văn bản pháp luật nào đang bị T3_HR_SENSITIVE.")
        return 0

    print(f"{len(targets)} văn bản pháp luật cần hạ tier T3_HR_SENSITIVE -> T1_GENERAL:")
    for document in targets:
        print(f"  {str(document.get('title'))[:64]:64s} approvalRef={(document.get('acl') or {}).get('approvalRef')}")

    if not apply:
        print("\nDRY RUN — không ghi gì. Thêm --apply để hạ tier.")
        return 0

    changed = 0
    for document in targets:
        result = collection.update_one(
            {"_id": document["_id"], "acl.tier": "T3_HR_SENSITIVE"},
            {"$set": {
                "acl.tier": "T1_GENERAL",
                "acl.classification": "operational",
                "acl.allowedProfiles": ALL_PROFILES,
                "acl.approvalRef": DEFAULT_APPROVAL_REF,
            }},
        )
        changed += result.modified_count
    print(f"\nĐã hạ tier {changed} document.")
    print("Khôi phục tier cũ (T3, chỉ hr): restore từ file backup preimage"
          " `data/backups/acl-preimage-<ngày>.json`, hoặc đặt lại tay"
          " `acl.tier = T3_HR_SENSITIVE`, `acl.allowedProfiles = [hr]` với approvalRef của đợt gán ban đầu.")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Gán ACL cho policies theo metadata.")
    parser.add_argument("--apply", action="store_true", help="ghi acl vào MongoDB (mặc định dry run)")
    parser.add_argument("--revert", action="store_true", help="gỡ acl do script này ghi")
    parser.add_argument("--approval-ref", default=DEFAULT_APPROVAL_REF, help=f"mặc định {DEFAULT_APPROVAL_REF}")
    parser.add_argument("--self-check", action="store_true", help="kiểm tra phân loại, không cần DB")
    parser.add_argument("--db", default=None, help="tên database (mặc định theo MONGODB_DB_NAME/URI)")
    parser.add_argument("--include-existing", action="store_true",
                        help="ghi đè cả document đã có acl (mặc định chỉ vá document thiếu)")
    parser.add_argument("--retier", action="store_true",
                        help="chỉ sửa tier của văn bản pháp luật công khai đang bị T3_HR_SENSITIVE")
    args = parser.parse_args()

    if args.self_check:
        return _self_check()

    from app.db import db_client  # noqa: E402 - sau load_dotenv

    if not db_client.ping() or db_client.client is None:
        print("Không kết nối được MongoDB (ATLAS_URI).")
        return 2

    db_name = args.db or db_client.db_name()
    database = db_client.client[db_name]
    collection = database.policies
    print(f"database={db_name} | approvalRef={args.approval_ref}")

    if args.revert:
        result = collection.update_many({"acl.approvalRef": args.approval_ref}, {"$unset": {"acl": ""}})
        print(f"reverted acl trên {result.modified_count} document trong {db_name}")
        return 0

    if args.retier:
        return _retier_public_documents(collection, args.apply)

    documents = list(collection.find({}, {"title": 1, "document": 1, "version": 1, "provenance": 1,
                                          "chunks": 1, "articles": 1, "content": 1, "acl": 1}))
    missing = [document for document in documents if not document.get("acl")]
    existing = len(documents) - len(missing)
    print(f"policies: {len(documents)} document | đã có acl: {existing} | thiếu acl: {len(missing)}")

    targets = documents if args.include_existing else missing
    decisions = [decide(document) | {"id": document["_id"], "version": str(document.get("version") or "")}
                 for document in targets]

    totals: dict[str, int] = {}
    for item in decisions:
        key = item["tier"] or "UNCLASSIFIED"
        totals[key] = totals.get(key, 0) + 1

    for tier in ("T1_GENERAL", "T2_OPERATIONAL", "T3_HR_SENSITIVE", "T3_TECHNICAL", "UNCLASSIFIED"):
        if tier not in totals:
            continue
        print(f"\n### {tier} — {totals[tier]} document")
        for item in decisions:
            if (item["tier"] or "UNCLASSIFIED") != tier:
                continue
            note = f"  [{'; '.join(item['notes'])}]" if item["notes"] else ""
            print(f"  {item['title'][:74]:74s}{note}")

    unclassified = [item for item in decisions if item["tier"] is None]
    if unclassified:
        print(f"\n### UNCLASSIFIED (bỏ qua) — {len(unclassified)}")
        for item in unclassified[:20]:
            print(f"  {item['title'][:60]:60s} ({item['signal']})")

    if not args.apply:
        print("\nDRY RUN — không ghi gì. Thêm --apply để ghi acl.")
        return 0

    now = datetime.now(timezone.utc)
    written = 0
    for item in decisions:
        if item["tier"] is None:
            continue
        collection.update_one({"_id": item["id"]},
                              {"$set": {"acl": build_acl(item["tier"], item["profiles"], args.approval_ref, now)}})
        written += 1
    print(f"\nĐã ghi acl cho {written} document. Chạy --revert để gỡ.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

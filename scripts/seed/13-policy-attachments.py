"""Ghi `attachments` vào `policies` từ manifest của `12-drive-pdf-rescue.py`.

Vì sao: `authorizeAttachment()` đòi document có `attachments[$elemMatch: {category,
filename}]` — trước script này, **0/223** document có field đó nên mọi GET
`/api/attachments/...` trả 404 dù file tồn tại trên đĩa.

Nguồn: `data/guta_rescued_pdf/_manifest.json` do `12-drive-pdf-rescue.py` sinh ra.
Mỗi item có `title` (đ khớp `policies.title`), `file` (tên file PDF đã cứu).

Usage (từ repo root):
  python scripts/seed/13-policy-attachments.py                  # dry run
  python scripts/seed/13-policy-attachments.py --apply          # ghi attachments
  python scripts/seed/13-policy-attachments.py --revert         # gỡ theo approvalRef
  python scripts/seed/13-policy-attachments.py --self-check     # kiểm không cần DB
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE = REPO_ROOT / "apps" / "ai-service"
MANIFEST = REPO_ROOT / "data" / "guta_rescued_pdf" / "_manifest.json"
DEFAULT_APPROVAL_REF = "OWNER_POLICY_ATTACHMENTS_20261109"


def build_entry(filename: str, approval_ref: str, now: datetime) -> dict:
    return {"category": "pdf", "filename": filename, "addedBy": approval_ref,
            "addedAt": now.isoformat().replace("+00:00", "Z")}


def _self_check() -> int:
    import tempfile
    sample = {"items": [{"fid": "abc123", "title": "QUYẾT ĐỊNH BỔ NHIỆM - MAI ANH ĐÀO - AOM",
                         "file": str(Path(tempfile.gettempdir()) / "QUYET_DINH_abc123.pdf"),
                         "pages": 1, "pdf_bytes": 229000, "status": "ok"}]}
    tmp = Path(tempfile.mkdtemp()) / "_manifest.json"
    tmp.write_text(json.dumps(sample, ensure_ascii=False), encoding="utf-8")
    failures = 0

    items = json.loads(tmp.read_text(encoding="utf-8"))["items"]
    entry = build_entry(Path(items[0]["file"]).name, DEFAULT_APPROVAL_REF,
                        datetime.now(timezone.utc))
    ok = entry["category"] == "pdf" and entry["filename"].endswith(".pdf") and entry["addedBy"]
    failures += 0 if ok else 1
    print(f"{'ok ' if ok else 'FAIL'} attachment entry: {entry}")

    unmatched = [i for i in items if not i.get("title")]
    ok = unmatched == []
    failures += 0 if ok else 1
    print(f"{'ok ' if ok else 'FAIL'} unmatched detection: {unmatched}")

    print(f"\n{3 - failures}/3 checks passed")
    return 1 if failures else 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Ghi attachments vào policies từ manifest.")
    parser.add_argument("--apply", action="store_true", help="ghi vào MongoDB (mặc định dry run)")
    parser.add_argument("--revert", action="store_true", help="gỡ attachments theo approvalRef")
    parser.add_argument("--approval-ref", default=DEFAULT_APPROVAL_REF)
    parser.add_argument("--db", default=None, help="tên database (mặc định theo env)")
    parser.add_argument("--manifest", default=str(MANIFEST))
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()

    if args.self_check:
        return _self_check()

    sys.path.insert(0, str(AI_SERVICE))
    from app.db import db_client  # noqa: E402 - sau load_dotenv

    if not db_client.ping() or db_client.client is None:
        print("Không kết nối được MongoDB (ATLAS_URI).")
        return 2

    db_name = args.db or db_client.db_name()
    database = db_client.client[db_name]
    collection = database.policies
    print(f"database={db_name} | approvalRef={args.approval_ref}")

    if args.revert:
        result = collection.update_many(
            {"attachments.addedBy": args.approval_ref},
            {"$pull": {"attachments": {"addedBy": args.approval_ref}}},
        )
        print(f"reverted attachments trên {result.modified_count} document")
        return 0

    manifest = Path(args.manifest)
    if not manifest.is_file():
        print(f"Không tìm thấy manifest: {manifest}")
        print("Chạy trước: python scripts/seed/12-drive-pdf-rescue.py --apply")
        return 2
    items = json.loads(manifest.read_text(encoding="utf-8"))["items"]

    now = datetime.now(timezone.utc)
    matched: list[dict] = []
    unmatched: list[str] = []
    for item in items:
        title = str(item.get("title") or "")
        document = collection.find_one({"title": title}, {"_id": 1, "attachments": 1})
        if not document:
            unmatched.append(title)
            continue
        filename = Path(item["file"]).name
        existing = (document.get("attachments") or [])
        if any(a.get("filename") == filename for a in existing):
            continue
        matched.append({"id": document["_id"], "title": title,
                        "entry": build_entry(filename, args.approval_ref, now)})

    print(f"manifest: {len(items)} item | match: {len(matched)} | không khớp title: {len(unmatched)}")
    for item in matched:
        print(f"  {item['title'][:64]:64s} -> {item['entry']['filename'][:40]}")
    for title in unmatched[:10]:
        print(f"  UNMATCHED: {title[:66]}")

    if not args.apply:
        print("\nDRY RUN — không ghi gì. Thêm --apply để ghi attachments.")
        return 0

    changed = 0
    for item in matched:
        result = collection.update_one({"_id": item["id"]},
                                       {"$push": {"attachments": item["entry"]}})
        changed += result.modified_count
    print(f"\nĐã ghi attachments cho {changed} document. Chạy --revert để gỡ.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

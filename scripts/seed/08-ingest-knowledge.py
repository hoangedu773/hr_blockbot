"""Ingest scraped knowledge JSONL files into Atlas `policies` (idempotent).

The loop for "cào thêm quy mô lớn": scraper produces knowledge JSONL → this script
pushes it to Atlas → `07-generate-embeddings.py --apply` gives the new chunks vectors.
Same contract everywhere, so nothing changes when the scraper adds more files.

Each JSONL record needs: `title`, `content` (or `text`), and optionally `question`
(becomes the article heading), `source_url`, `source_updated_at`, `knowledge_status`,
`content_type`, `text_sha256`. Records whose `knowledge_status` is not approved are
skipped and reported — scraped noise must not reach the answering path.

Usage (from the repo root):
  python scripts/seed/08-ingest-knowledge.py                     # dry run on the default file
  python scripts/seed/08-ingest-knowledge.py --apply
  python scripts/seed/08-ingest-knowledge.py --file data/other.jsonl --apply
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE = REPO_ROOT / "apps" / "ai-service"
SEEDED_BY = "scripts/seed/08-ingest-knowledge.py"
DEFAULT_FILE = REPO_ROOT / "data" / "guta_bo_du_lieu_chatbot" / "knowledge_da_doc.jsonl"
APPROVED_STATUSES = {
    "approved",
    "da_doc",
    "đã đọc",
    "active",
    # Status written by the scraper for the chatbot knowledge set: "dùng thử trong
    # phạm vi đã ghi" — the owner explicitly wants this corpus ingested.
    "dùng thử trong phạm vi đã ghi",
}

sys.path.insert(0, str(AI_SERVICE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")
load_dotenv(AI_SERVICE / ".env")

from app.db import db_client  # noqa: E402


def text_sha256(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_records(paths: list[Path]) -> tuple[list[dict], list[str]]:
    records: list[dict] = []
    skipped: list[str] = []
    for path in paths:
        if not path.is_file():
            skipped.append(f"không tìm thấy file: {path}")
            continue
        for line in path.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                records.append(json.loads(line))
            except json.JSONDecodeError:
                skipped.append(f"{path.name}: dòng JSON lỗi (bỏ qua)")
    return records, skipped


def _split_text(text: str, max_chars: int = 4000) -> list[str]:
    """Split long text into pieces <= max_chars, preferring line boundaries.

    gemini-embedding-001 caps its input (~2048 tokens) and silently truncates
    longer text, so a 63K-char document embedded as one chunk loses everything
    past the cap in its vector. Splitting at ingest keeps every part of the
    corpus reachable by retrieval.
    """
    if len(text) <= max_chars:
        return [text]
    pieces: list[str] = []
    current: list[str] = []
    size = 0
    for line in text.splitlines(keepends=True):
        while len(line) > max_chars:  # hard-split pathological single lines
            if current:
                pieces.append("".join(current))
                current, size = [], 0
            pieces.append(line[:max_chars])
            line = line[max_chars:]
        if current and size + len(line) > max_chars:
            pieces.append("".join(current))
            current, size = [], 0
        if line:
            current.append(line)
            size += len(line)
    if current:
        pieces.append("".join(current))
    return [piece for piece in pieces if piece.strip()]


def main() -> int:
    parser = argparse.ArgumentParser(description="Ingest knowledge JSONL into Atlas policies.")
    parser.add_argument("--file", action="append", default=[], help="knowledge JSONL (repeatable)")
    parser.add_argument("--apply", action="store_true", help="write to MongoDB (default: dry run)")
    parser.add_argument("--status", action="store_true", help="chỉ thống kê knowledge_status rồi thoát")
    parser.add_argument(
        "--crawl-schema",
        action="store_true",
        help=(
            "Input JSONL dùng schema của crawler GUTA portal (document/version/source/"
            "chunks[{order,article,text}]) thay vì schema knowledge chuẩn. Mỗi record "
            "được map sang document+articles; knowledge_status gán 'approved' tường minh "
            "(chỉ dùng sau khi người duyệt chấp nhận nội dung cào)."
        ),
    )
    args = parser.parse_args()

    paths = [Path(p) for p in args.file] or [DEFAULT_FILE]
    records, skipped = load_records(paths)
    for note in skipped:
        print(f"skip: {note}")

    statuses: dict[str, int] = {}
    ingested = 0
    documents: list[dict] = []
    for record in records:
        if args.crawl_schema:
            # Adapter for the GUTA-portal crawler JSONL: one record = one document
            # with a single chunk {order, article, text}. Approval is explicit —
            # this flag is only passed after a human has reviewed the corpus.
            title = str(record.get("document") or "").strip()
            chunk = (record.get("chunks") or [{}])[0] if isinstance(record.get("chunks"), list) else {}
            content = str(chunk.get("text") or chunk.get("article") or "").strip()
            if not title or not content:
                skipped.append(f"crawl thiếu document/chunks text: {str(record.get('post_id') or '?')[:40]}")
                continue
            statuses["approved"] = statuses.get("approved", 0) + 1
            if args.status:
                continue
            try:
                department_ids = json.loads(str(record.get("departmentIds") or "[]"))
            except json.JSONDecodeError:
                department_ids = []
            base_article = str(chunk.get("article") or "Nội dung tài liệu")[:100]
            pieces = _split_text(content)
            n = len(pieces)
            articles = [
                {
                    "article": base_article if n == 1 else f"{base_article} — phần {i + 1}/{n}",
                    "text": piece,
                }
                for i, piece in enumerate(pieces)
            ]
            # Layout-sensitive hash: re-ingesting the same text with a different
            # split layout must UPDATE the document (otherwise the dedupe check
            # would skip the resplit forever).
            documents.append(
                {
                    "document": title,
                    "title": title,
                    "version": str(record.get("version") or "v1.0"),
                    "source": str(record.get("attachment_url") or record.get("source") or "guta-portal-crawl"),
                    "articles": articles,
                    "contentSha256": text_sha256(json.dumps(articles, ensure_ascii=False)),
                    "contentType": str(record.get("category") or "portal-document"),
                    "departmentIds": department_ids if isinstance(department_ids, list) else [],
                    "provenance": {
                        "origin": "guta-portal-crawl",
                        "file": paths[0].name,
                        "local_path": str(record.get("local_path") or ""),
                        "approved_by": "user 2026-10-29",
                    },
                    "seededBy": SEEDED_BY,
                }
            )
            ingested += 1
            continue
        title = str(record.get("title") or "").strip()
        content = str(record.get("content") or record.get("text") or "").strip()
        if not title or not content:
            skipped.append(f"thiếu title/content: {str(record.get('chunk_id') or '?')[:40]}")
            continue
        status = str(record.get("knowledge_status") or "unknown").lower()
        statuses[status] = statuses.get(status, 0) + 1
        if args.status:
            continue
        if status not in APPROVED_STATUSES:
            skipped.append(f"status='{status}': {title[:50]}")
            continue

        sha = str(record.get("text_sha256") or text_sha256(content))
        question = str(record.get("question") or "").strip()
        documents.append(
            {
                "document": title,
                "title": title,
                "version": str(record.get("source_updated_at") or "v1.0"),
                "source": str(record.get("source_url") or "knowledge-jsonl"),
                "articles": [{"article": question or "Nội dung", "text": content}],
                "contentSha256": sha,
                "contentType": str(record.get("content_type") or ""),
                "provenance": {"origin": "scraped-knowledge", "file": paths[0].name},
                "seededBy": SEEDED_BY,
            }
        )
        ingested += 1

    if args.status:
        print("knowledge_status distribution:", statuses)
        return 0

    print(f"records: {len(records)} | sẽ nạp: {ingested} | bỏ qua: {len(skipped)}")
    for doc in documents[:8]:
        print(f"  · {doc['document'][:64]:64s} v={doc['version'][:12]:12s} {len(doc['articles'][0]['text'])} chars")
    if len(documents) > 8:
        print(f"  … và {len(documents) - 8} nữa")

    if not args.apply:
        print("\nDRY RUN — chưa ghi. Thêm --apply để nạp.")
        return 0

    if not db_client.ping() or db_client.db is None:
        print("Không kết nối được MongoDB (ATLAS_URI).")
        return 2

    collection = db_client.db.policies
    now = datetime.now(timezone.utc)
    created = updated = deduped = 0
    for doc in documents:
        existing = collection.find_one({"document": doc["document"], "version": doc["version"]})
        if existing and existing.get("contentSha256") == doc["contentSha256"]:
            deduped += 1
            continue
        collection.update_one(
            {"document": doc["document"], "version": doc["version"]},
            {"$set": {**doc, "updatedAt": now}, "$setOnInsert": {"seededAt": now}},
            upsert=True,
        )
        if existing:
            updated += 1
        else:
            created += 1

    print(f"\napplied: created={created} updated={updated} unchanged={deduped} total_now={collection.count_documents({})}")
    print("Bước tiếp theo: python scripts/seed/07-generate-embeddings.py --apply  (tạo vector cho các đoạn mới)")
    return 0


if __name__ == "__main__":
    sys.exit(main())

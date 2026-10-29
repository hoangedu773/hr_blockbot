"""Push the authored policy corpus from code into Atlas `policies` (idempotent).

Why: the running system reads `policies` from MongoDB, but only 5 documents were
seeded there while the repo carries 84 authored chunks across ~60 documents
(SEED_POLICIES + portal knowledge in `app/rag/corpus.py`). The eval set is labelled
against 4 of those documents, so every quality number came out 0 — not because
retrieval was bad, but because the source documents were absent.

This script is the automation: no `mongosh`/`mongocli` needed, it uses the same
connection the service uses (`ATLAS_URI`).

Usage (from the repo root):
  python scripts/seed/06-policies-to-atlas.py              # dry run, prints what would change
  python scripts/seed/06-policies-to-atlas.py --apply      # upsert into Atlas
  python scripts/seed/06-policies-to-atlas.py --delete     # remove only what this script wrote

Idempotent: upsert key is (document, version). Re-running changes nothing. Every
document it writes carries `seededBy` so `--delete` can remove exactly those.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE = REPO_ROOT / "apps" / "ai-service"
SEEDED_BY = "scripts/seed/06-policies-to-atlas.py"

sys.path.insert(0, str(AI_SERVICE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")
load_dotenv(AI_SERVICE / ".env")

from app.db import db_client  # noqa: E402
from app.rag.corpus import seed_chunks  # noqa: E402


def group_documents() -> list[dict]:
    """Group chunks into `policies` documents, preserving article order."""
    grouped: dict[tuple[str, str, str], list[dict]] = {}
    for chunk in seed_chunks():
        key = (chunk.document, chunk.version, chunk.source)
        grouped.setdefault(key, []).append(
            {"article": chunk.article, "text": chunk.text, "order": chunk.order}
        )

    documents = []
    for (document, version, source), articles in grouped.items():
        articles.sort(key=lambda item: item["order"])
        documents.append(
            {
                "document": document,
                "title": document,
                "version": version,
                "source": source,
                "articles": [{"article": a["article"], "text": a["text"]} for a in articles],
                "provenance": {"origin": "authored-in-repo", "file": "apps/ai-service/app/rag/corpus.py"},
                "seededBy": SEEDED_BY,
            }
        )
    return documents


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed the authored policy corpus into Atlas.")
    parser.add_argument("--apply", action="store_true", help="write to MongoDB (default: dry run)")
    parser.add_argument("--delete", action="store_true", help="delete documents written by this script")
    args = parser.parse_args()

    if not db_client.ping() or db_client.db is None:
        print("Không kết nối được MongoDB (ATLAS_URI).")
        return 2

    collection = db_client.db.policies

    if args.delete:
        result = collection.delete_many({"seededBy": SEEDED_BY})
        print(f"deleted {result.deleted_count} documents seeded by {SEEDED_BY}")
        return 0

    documents = group_documents()
    articles = sum(len(doc["articles"]) for doc in documents)
    print(f"documents to upsert: {len(documents)} | articles: {articles}")
    print(f"existing documents in policies: {collection.count_documents({})}")

    preview = documents[:5]
    for doc in preview:
        print(f"  · {doc['document'][:60]:60s} {doc['version']:12s} articles={len(doc['articles'])}")
    if len(documents) > len(preview):
        print(f"  … và {len(documents) - len(preview)} tài liệu nữa")

    if not args.apply:
        print("\nDRY RUN — không ghi gì. Thêm --apply để ghi thật.")
        return 0

    now = datetime.now(timezone.utc)
    created = updated = 0
    for doc in documents:
        result = collection.update_one(
            {"document": doc["document"], "version": doc["version"]},
            {"$set": {**doc, "updatedAt": now}, "$setOnInsert": {"seededAt": now}},
            upsert=True,
        )
        if result.upserted_id is not None:
            created += 1
        elif result.modified_count:
            updated += 1

    print(f"\napplied: created={created} updated={updated} total_now={collection.count_documents({})}")
    return 0


if __name__ == "__main__":
    sys.exit(main())

"""Generate real embeddings for the policy chunks stored in Atlas and write them back.

One-time job. Before it runs, `policies.*.chunks[].embedding` is empty, so the
dense/hybrid retriever falls back to lexical. After it runs, semantic search works
with zero ongoing cost: the backend compares vectors in memory (no Atlas Vector
Search tier required at this corpus size).

Prerequisite: keys in `apps/ai-service/.env`:
  AI_LLM_API_KEYS=...,...   (pool, rotated; a key that fails is skipped)
or a single `AI_LLM_API_KEY`. Keys are never echoed.

Usage (from the repo root):
  python scripts/seed/07-generate-embeddings.py            # embed chunks that have none
  python scripts/seed/07-generate-embeddings.py --force    # re-embed everything
  python scripts/seed/07-generate-embeddings.py --apply    # default is report-only
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
AI_SERVICE = REPO_ROOT / "apps" / "ai-service"
sys.path.insert(0, str(AI_SERVICE))

from dotenv import load_dotenv  # noqa: E402

load_dotenv(REPO_ROOT / ".env")
load_dotenv(AI_SERVICE / ".env")

import httpx  # noqa: E402

from app.db import db_client  # noqa: E402
from app.rag.corpus import load_db_chunks  # noqa: E402

DEFAULT_MODEL = "gemini-embedding-001"
BATCH = 16
# 429 post-mortem (2026-10-29, verified against the live API): the failure was a
# *per-minute* token bucket, not a daily quota — a fixed batch of 16 crawl
# chunks (single chunks up to 63K chars) makes a ~1MB request, and one run
# fires ~10 of those across 10 keys within seconds, draining the bucket for
# every key before the first sleep. Pack batches by character budget and pace
# requests instead.
MAX_CHARS_PER_BATCH = 32_000
REQUEST_GAP_SECONDS = 2.0
API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:batchEmbedContents"


def key_pool() -> list[str]:
    raw = os.getenv("AI_LLM_API_KEYS") or os.getenv("AI_LLM_API_KEY") or ""
    return [item.strip() for item in raw.split(",") if item.strip()]


def embed_batch(model: str, texts: list[str], keys: list[str]) -> list[list[float]]:
    """Embed one batch, rotating the key pool on auth/quota/rate failures."""
    url = API.format(model=model)
    body = {"requests": [{"model": f"models/{model}", "content": {"parts": [{"text": t}]}} for t in texts]}
    last_error = "no_attempt"
    for key in keys:
        try:
            response = httpx.post(
                url,
                json=body,
                headers={"Content-Type": "application/json", "x-goog-api-key": key},
                timeout=30,
            )
        except (httpx.TimeoutException, httpx.HTTPError) as exc:
            last_error = f"{type(exc).__name__}"
            continue
        if response.status_code == 200:
            return [item["values"] for item in response.json()["embeddings"]]
        last_error = f"HTTP {response.status_code}"
        if response.status_code == 429:
            # Rate limited: honour Google's retry-after hint (or a sane default)
            # before rotating — rotating instantly just burns every key on the
            # same drained bucket.
            wait = 15.0
            try:
                retry_after = float(response.headers.get("retry-after", ""))
                wait = max(wait, retry_after)
            except ValueError:
                pass
            print(f"    key {key[:6]}…{key[-4:]} rate limited — waiting {wait:.0f}s (last_error={last_error})")
            time.sleep(wait)
            continue
        if response.status_code in (401, 403):
            print(f"    key {key[:6]}…{key[-4:]} rejected ({last_error}) — trying next key")
            continue
        # 400: surface Google's field violations (generic validation text, no secrets)
        try:
            details = response.json().get("error", {}).get("details", [])
            violation = details[0].get("fieldViolations", [{}])[0] if details else {}
            raise RuntimeError(
                f"embedding failed: {last_error} "
                f"field={violation.get('field', '?')} desc={str(violation.get('description', ''))[:200]}"
            )
        except (ValueError, KeyError, IndexError):
            raise RuntimeError(f"embedding failed: {last_error}")
    raise RuntimeError(f"all keys exhausted; last error: {last_error}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generate embeddings for Atlas policy chunks.")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--force", action="store_true", help="re-embed chunks that already have a vector")
    parser.add_argument("--apply", action="store_true", help="write vectors back (default: report only)")
    args = parser.parse_args()

    keys = key_pool()
    print(f"keys available: {len(keys)} (masked)")
    if not keys:
        print("Thiếu AI_LLM_API_KEYS / AI_LLM_API_KEY trong apps/ai-service/.env.")
        return 2

    if not db_client.ping() or db_client.db is None:
        print("Không kết nối được MongoDB (ATLAS_URI).")
        return 2

    chunks = load_db_chunks(db_client.db.policies)
    if not chunks:
        print("Không có chunk nào trong policies.")
        return 2

    todo = [c for c in chunks if args.force or not c.embedding]
    done = len(chunks) - len(todo)
    print(f"chunks: {len(chunks)} | đã có vector: {done} | cần tạo: {len(todo)}")
    if not todo:
        print("Mọi chunk đều đã có vector. Dùng --force để tạo lại.")
        return 0

    vectors: dict[str, list[float]] = {}
    # Pack by character budget: 16 long crawl chunks can be ~1MB per request,
    # which alone trips the per-minute token bucket (see 429 post-mortem above).
    batch: list = []
    batch_chars = 0
    batches: list[list] = []
    for chunk in todo:
        text_len = len(chunk.text)
        if batch and (len(batch) >= BATCH or batch_chars + text_len > MAX_CHARS_PER_BATCH):
            batches.append(batch)
            batch, batch_chars = [], 0
        batch.append(chunk)
        batch_chars += text_len
    if batch:
        batches.append(batch)

    for index, current in enumerate(batches):
        result = embed_batch(args.model, [chunk.text for chunk in current], keys)
        for chunk, vector in zip(current, result):
            vectors[chunk.chunk_id] = vector
        print(f"  embedded {sum(len(b) for b in batches[: index + 1])}/{len(todo)} "
              f"(batch {index + 1}/{len(batches)}, {sum(len(c.text) for c in current)} chars)")
        if index + 1 < len(batches):
            time.sleep(REQUEST_GAP_SECONDS)

    dims = {len(v) for v in vectors.values()}
    if len(dims) != 1:
        print(f"LỖI: vector có nhiều chiều khác nhau {dims} — dừng, không ghi.")
        return 5
    print(f"dimension: {dims.pop()}")

    if not args.apply:
        print("\nDRY RUN — chưa ghi vào Atlas. Thêm --apply để ghi.")
        return 0

    collection = db_client.db.policies
    written = 0
    for doc in collection.find({}):
        doc_chunks = doc.get("chunks")
        articles = doc.get("articles") or []
        if articles:
            # The reader (chunks_from_documents) PREFERS `articles` over `chunks`,
            # so after a re-ingest with a different split layout the stale chunks
            # array no longer matches the live chunk ids. Always rebuild from
            # articles when present — the end state is chunks-only with vectors.
            doc_chunks = [
                {"article": a.get("article"), "text": a.get("text"), "order": index}
                for index, a in enumerate(articles)
            ]
        elif not doc_chunks:
            # Documents seeded via `articles` (06 script) carry no `chunks` array; the
            # reader prefers `articles`, so migrating to `chunks` is required or the
            # vectors would never be read back.
            continue
        changed = False
        for index, chunk in enumerate(doc_chunks):
            cid = f"{doc.get('title') or doc.get('document')}|{doc.get('version')}|{chunk.get('order', index)}"
            vector = vectors.get(cid)
            if vector is None:
                continue
            doc_chunks[index]["embedding"] = vector
            doc_chunks[index]["model"] = args.model
            changed = True
            written += 1
        if changed:
            update: dict = {"$set": {"chunks": doc_chunks}}
            if "articles" in doc:
                update["$unset"] = {"articles": ""}
            collection.update_one({"_id": doc["_id"]}, update)

    print(f"\nwritten: {written} chunks across {collection.count_documents({})} documents")
    return 0


if __name__ == "__main__":
    sys.exit(main())

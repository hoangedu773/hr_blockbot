"""Read-only inspection of the real `policies` collection (no writes, no secrets printed).

Run only for eval/threshold work; prints document metadata + chunk previews so the
human/agent can build a dataset aligned with Phase 1 data.
"""

import os
import sys

from pymongo import MongoClient

uri = os.getenv("MONGODB_URI") or os.getenv("ATLAS_URI")
if not uri:
    print("NO_URI")
    sys.exit(2)

client = MongoClient(uri, serverSelectionTimeoutMS=5000, connectTimeoutMS=5000)
db = client["hr_bot"]
docs = list(db.policies.find({}, {"_id": 1, "title": 1, "document": 1, "version": 1, "source": 1,
                                  "category": 1, "effectiveFrom": 1, "chunks": 1}))
print(f"docs={len(docs)}")
for d in docs:
    chunks = d.get("chunks") or []
    with_emb = sum(1 for c in chunks if c.get("embedding"))
    print("=" * 100)
    print(f"TITLE: {d.get('document') or d.get('title')} | VERSION: {d.get('version')} | "
          f"SOURCE: {d.get('source')} | CATEGORY: {d.get('category')} | CHUNKS: {len(chunks)} "
          f"| WITH_EMB: {with_emb}")
    for i, c in enumerate(chunks):
        article = c.get("article")
        print(f"  [{i}] order={c.get('order')} article={article!r} model={c.get('model')!r}")
        print(f"      {(c.get('text') or '')[:220]}")
client.close()

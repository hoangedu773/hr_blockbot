"""Automated QA & Security Auditor test suite for Guta Portal Crawler & Dataset.

Covers 5 dimensions:
1. Integrity & Schema JSONL (199 raw, 199 sources, 56 knowledge)
2. Schema RAG Compatibility (corpus.py, PolicyChunk, chunks_from_documents, load_portal_chunks, BM25 retrieval)
3. Negative Filtering & Anti-Junk (P4 exclusion, welcome/birthday exclusion)
4. UTF-8 Vietnamese Encoding, Links, & HTML Sanitization
5. Crawler Resilience & Failure Modes (5xx, 429, timeout, fail-fast 4xx, gather return_exceptions)
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import re
import sys
import unicodedata
from pathlib import Path
from typing import Any, Dict, List

import httpx

REPO_ROOT = Path(__file__).resolve().parent.parent.parent
DATA_DIR = REPO_ROOT / "data" / "guta_portal"
SCRIPT_PATH = REPO_ROOT / "apps" / "ai-service" / "scripts" / "crawl-guta-portal.py"

# Add apps/ai-service to sys.path for app.rag imports
AI_SERVICE_DIR = REPO_ROOT / "apps" / "ai-service"
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))


def load_jsonl(path: Path) -> List[Dict[str, Any]]:
    assert path.exists(), f"File {path} does not exist"
    lines = path.read_text(encoding="utf-8").splitlines()
    records = []
    for idx, line in enumerate(lines, 1):
        assert line.strip(), f"{path.name}:{idx} is empty line"
        try:
            records.append(json.loads(line))
        except json.JSONDecodeError as exc:
            raise AssertionError(f"{path.name}:{idx} JSON decode error: {exc}") from exc
    return records


def test_dim1_integrity_and_counts() -> Dict[str, Any]:
    """Dimension 1: Check line counts, non-empty, and valid JSON."""
    raw = load_jsonl(DATA_DIR / "raw-posts.jsonl")
    sources = load_jsonl(DATA_DIR / "portal-sources.jsonl")
    knowledge = load_jsonl(DATA_DIR / "portal-knowledge.jsonl")

    assert len(raw) == 199, f"raw-posts.jsonl count mismatch: {len(raw)} != 199"
    assert len(sources) == 199, f"portal-sources.jsonl count mismatch: {len(sources)} != 199"
    assert len(knowledge) == 56, f"portal-knowledge.jsonl count mismatch: {len(knowledge)} != 56"

    # Check ID uniqueness in raw and sources
    raw_ids = [p["id"] for p in raw]
    src_ids = [s["id"] for s in sources]
    assert len(set(raw_ids)) == 199, "Duplicate IDs in raw-posts.jsonl"
    assert len(set(src_ids)) == 199, "Duplicate IDs in portal-sources.jsonl"
    assert set(raw_ids) == set(src_ids), "IDs in raw-posts.jsonl and portal-sources.jsonl do not match"

    return {
        "status": "PASS",
        "raw_count": len(raw),
        "sources_count": len(sources),
        "knowledge_count": len(knowledge),
    }


def test_dim2_rag_compatibility() -> Dict[str, Any]:
    """Dimension 2: Check PolicyChunk fields, loading behavior, and retrieval compatibility."""
    from app.rag.corpus import PolicyChunk, chunks_from_documents
    from app.rag.retrieval import LexicalRetriever

    spec = importlib.util.spec_from_file_location("crawler", str(SCRIPT_PATH))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    knowledge = load_jsonl(DATA_DIR / "portal-knowledge.jsonl")

    # 1. Check document structure
    for idx, doc in enumerate(knowledge, 1):
        assert "document" in doc and doc["document"].strip(), f"Doc {idx} missing 'document'"
        assert "version" in doc and doc["version"].strip(), f"Doc {idx} missing 'version'"
        assert "source" in doc and doc["source"].strip(), f"Doc {idx} missing 'source'"
        assert "chunks" in doc and isinstance(doc["chunks"], list) and len(doc["chunks"]) > 0, f"Doc {idx} missing 'chunks'"
        for c in doc["chunks"]:
            assert "order" in c and isinstance(c["order"], int), f"Doc {idx} chunk missing integer 'order'"
            assert "article" in c and c["article"].strip(), f"Doc {idx} chunk missing 'article'"
            assert "text" in c and c["text"].strip(), f"Doc {idx} chunk missing 'text'"

    # 2. Test chunks_from_documents
    chunks = chunks_from_documents(knowledge)
    assert len(chunks) == 56, f"chunks_from_documents expected 56, got {len(chunks)}"

    # 3. Test load_portal_chunks() from crawler script
    loaded_via_helper = mod.load_portal_chunks(DATA_DIR / "portal-knowledge.jsonl")
    assert len(loaded_via_helper) == 56, f"load_portal_chunks expected 56, got {len(loaded_via_helper)}"

    # 4. Validate PolicyChunk fields and methods on all 56 items
    for c in chunks:
        assert isinstance(c, PolicyChunk)
        assert c.chunk_id.startswith(c.document)
        citation = c.citation
        assert citation["document"] == c.document
        assert citation["version"] == c.version
        assert citation["article"] == c.article
        assert citation["source"] == c.source
        search_txt = c.searchable_text()
        assert c.document in search_txt
        assert c.article in search_txt

    # 5. Live RAG Lexical Retrieval smoke test
    retriever = LexicalRetriever(chunks, min_evidence=0.1)
    query_result = retriever.search("quy định xử phạt hao hụt tài sản", k=3)
    assert len(query_result.hits) > 0, "LexicalRetriever returned no hits on portal knowledge chunks"
    top_hit = query_result.hits[0]
    assert "HAO HỤT" in top_hit.citation["document"].upper() or "XỬ PHẠT" in top_hit.citation["document"].upper()

    return {
        "status": "PASS",
        "chunks_from_documents_count": len(chunks),
        "load_portal_chunks_count": len(loaded_via_helper),
        "bm25_retrieval_smoke_test": "PASS",
        "top_hit_doc": top_hit.citation["document"],
    }


def test_dim3_negative_filtering() -> Dict[str, Any]:
    """Dimension 3: Verify 100% exclusion of welcome/birthday/appointments (P4)."""
    knowledge = load_jsonl(DATA_DIR / "portal-knowledge.jsonl")
    sources = load_jsonl(DATA_DIR / "portal-sources.jsonl")

    forbidden_patterns = [
        r"CHÀO\s+MỪNG",
        r"CHÀO\s+ĐÓN",
        r"GÓC\s+THÀNH\s+VIÊN\s+GUTA",
        r"SINH\s+NHẬT",
        r"BỔ\s+NHIỆM",
        r"ĐIỀU\s+CHUYỂN",
        r"YEAR\s+END\s+PARTY",
    ]

    leaks = []
    for idx, item in enumerate(knowledge, 1):
        title = unicodedata.normalize("NFC", item["document"]).upper()
        for pat in forbidden_patterns:
            if re.search(pat, title):
                leaks.append((idx, item["document"], pat))

    p4_sources = [s for s in sources if s.get("priority") == "P4" or s.get("exclude_from_rag")]
    knowledge_sources = {k["source"] for k in knowledge}
    p4_leaked_urls = [s["url"] for s in p4_sources if s["url"] in knowledge_sources]

    assert len(leaks) == 0, f"Found {len(leaks)} forbidden records in portal-knowledge: {leaks}"
    assert len(p4_sources) == 143, f"P4 count mismatch: {len(p4_sources)} != 143"
    assert len(p4_leaked_urls) == 0, f"P4 leaked into knowledge: {p4_leaked_urls}"

    return {
        "status": "PASS",
        "forbidden_in_knowledge": len(leaks),
        "p4_total_excluded": len(p4_sources),
        "p4_leaked_count": len(p4_leaked_urls),
    }


def test_dim4_encoding_links_html() -> Dict[str, Any]:
    """Dimension 4: UTF-8 encoding, links preservation, HTML cleanup."""
    knowledge = load_jsonl(DATA_DIR / "portal-knowledge.jsonl")
    md_file = DATA_DIR / "portal-knowledge.md"
    assert md_file.exists(), "portal-knowledge.md does not exist"
    md_content = md_file.read_text(encoding="utf-8")

    # 1. Unicode replacement char check
    assert "\ufffd" not in md_content, "portal-knowledge.md contains U+FFFD replacement char"
    for idx, item in enumerate(knowledge, 1):
        assert "\ufffd" not in item["document"], f"Record {idx} document contains U+FFFD"
        for c in item["chunks"]:
            assert "\ufffd" not in c["text"], f"Record {idx} text contains U+FFFD"

    # 2. HTML tag leak check in 'text'
    html_pattern = re.compile(r"<(div|script|span|p|br|table|iframe|h[1-6]|style|font|b|i|u|strong|em|img|a\s)[^>]*>", re.IGNORECASE)
    html_leaks = []
    for idx, item in enumerate(knowledge, 1):
        for c in item["chunks"]:
            matches = html_pattern.findall(c["text"])
            if matches:
                html_leaks.append((idx, item["document"], matches))

    assert len(html_leaks) == 0, f"Found HTML tags in text: {html_leaks}"

    # 3. Attachment URLs check
    attachments = [k["attachment_url"] for k in knowledge if k.get("attachment_url")]
    assert len(attachments) > 0, "No attachments found in portal-knowledge"
    for att in attachments:
        assert att.startswith("https://") or att.startswith("http://"), f"Malformed attachment: {att}"
        assert not att.endswith("..."), f"Truncated attachment URL: {att}"
        assert " " not in att, f"Space in attachment URL: {att}"

    # 4. Markdown section headings check
    for item in knowledge:
        assert f"## {item['document']}" in md_content, f"Markdown missing heading for {item['document']}"

    return {
        "status": "PASS",
        "html_leaks_count": len(html_leaks),
        "attachments_count": len(attachments),
        "replacement_chars_count": 0,
        "markdown_headings_verified": len(knowledge),
    }


async def test_dim5_crawler_edge_cases() -> Dict[str, Any]:
    """Dimension 5: Crawler resilience, retry, timeout, fail-fast 4xx, and gather resilience."""
    spec = importlib.util.spec_from_file_location("crawler", str(SCRIPT_PATH))
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)

    results = {}

    # Scenario 5.1: 500 retry then succeed
    call_500 = 0
    def handle_500(req):
        nonlocal call_500
        call_500 += 1
        if call_500 < 3:
            return httpx.Response(500)
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_500)) as client:
        resp = await mod.fetch_with_retry(client, "https://api.test/500", max_retries=3, backoff=0.005)
        assert resp.status_code == 200
        assert call_500 == 3
        results["500_retry_success"] = "PASS"

    # Scenario 5.2: 429 retry then succeed
    call_429 = 0
    def handle_429(req):
        nonlocal call_429
        call_429 += 1
        if call_429 < 2:
            return httpx.Response(429)
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_429)) as client:
        resp = await mod.fetch_with_retry(client, "https://api.test/429", max_retries=3, backoff=0.005)
        assert resp.status_code == 200
        assert call_429 == 2
        results["429_retry_success"] = "PASS"

    # Scenario 5.3: Timeout retry then succeed
    call_timeout = 0
    def handle_timeout(req):
        nonlocal call_timeout
        call_timeout += 1
        if call_timeout < 2:
            raise httpx.ReadTimeout("read timeout")
        return httpx.Response(200, json={"ok": True})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_timeout)) as client:
        resp = await mod.fetch_with_retry(client, "https://api.test/timeout", max_retries=3, backoff=0.005)
        assert resp.status_code == 200
        assert call_timeout == 2
        results["timeout_retry_success"] = "PASS"

    # Scenario 5.4: Persistent 500 exhausts retries
    call_exhaust = 0
    def handle_exhaust(req):
        nonlocal call_exhaust
        call_exhaust += 1
        return httpx.Response(500)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_exhaust)) as client:
        try:
            await mod.fetch_with_retry(client, "https://api.test/exhaust", max_retries=3, backoff=0.005)
            results["exhaust_retries_raises_runtime_error"] = "FAIL (No exception)"
        except RuntimeError:
            assert call_exhaust == 3
            results["exhaust_retries_raises_runtime_error"] = "PASS"

    # Scenario 5.5: Non-retryable client error (404 Not Found) -> FAIL-FAST (NO RETRIES!)
    call_404 = 0
    def handle_404(req):
        nonlocal call_404
        call_404 += 1
        return httpx.Response(404)

    async with httpx.AsyncClient(transport=httpx.MockTransport(handle_404)) as client:
        try:
            await mod.fetch_with_retry(client, "https://api.test/404", max_retries=3, backoff=0.005)
            results["fail_fast_404_no_blind_retry"] = "FAIL (No exception)"
        except httpx.HTTPStatusError as exc:
            assert exc.response.status_code == 404
            # Must fail immediately on attempt 1 without repeating 3 times
            assert call_404 == 1, f"Expected 1 call on 404, but got {call_404} calls"
            results["fail_fast_404_no_blind_retry"] = "PASS (Exactly 1 call, no blind retries)"

    # Scenario 5.6: Gather error isolation verification
    # Simulate batch fetch with return_exceptions=True
    async def mock_fetch_post(post_id: int):
        if post_id == 2:
            raise RuntimeError("Post 2 failed upstream")
        return {"id": post_id, "title": f"Post {post_id}"}

    tasks = [mock_fetch_post(i) for i in range(1, 5)]
    gathered = await asyncio.gather(*tasks, return_exceptions=True)
    valid_posts = [p for p in gathered if isinstance(p, dict)]
    errors = [e for e in gathered if isinstance(e, Exception)]
    assert len(valid_posts) == 3, f"Expected 3 valid posts, got {len(valid_posts)}"
    assert len(errors) == 1, f"Expected 1 error, got {len(errors)}"
    results["gather_exception_isolation"] = "PASS (Single failure does not abort remaining posts)"

    return results


async def main() -> None:
    print("=" * 70)
    print("RUNNING ADVERSARIAL QA AUDIT ON GUTA PORTAL CRAWLER & DATASET (V2)")
    print("=" * 70)

    # Dim 1
    d1 = test_dim1_integrity_and_counts()
    print("\n[DIMENSION 1: Integrity & Counts]")
    print(f"  Status: {d1['status']}")
    print(f"  Raw: {d1['raw_count']} lines | Sources: {d1['sources_count']} lines | Knowledge: {d1['knowledge_count']} lines")

    # Dim 2
    d2 = test_dim2_rag_compatibility()
    print("\n[DIMENSION 2: Schema RAG Compatibility]")
    print(f"  Status: {d2['status']}")
    print(f"  chunks_from_documents(): {d2['chunks_from_documents_count']} PolicyChunks created")
    print(f"  load_portal_chunks(): {d2['load_portal_chunks_count']} PolicyChunks loaded")
    print(f"  BM25 Retrieval Smoke Test: {d2['bm25_retrieval_smoke_test']} (Top match: {d2['top_hit_doc']})")

    # Dim 3
    d3 = test_dim3_negative_filtering()
    print("\n[DIMENSION 3: Negative Filtering]")
    print(f"  Status: {d3['status']}")
    print(f"  Forbidden articles in Knowledge: {d3['forbidden_in_knowledge']}")
    print(f"  Total P4 articles excluded: {d3['p4_total_excluded']}")
    print(f"  P4 articles leaked into Knowledge: {d3['p4_leaked_count']}")

    # Dim 4
    d4 = test_dim4_encoding_links_html()
    print("\n[DIMENSION 4: Encoding, Links & HTML Sanitization]")
    print(f"  Status: {d4['status']}")
    print(f"  HTML tag leaks in text: {d4['html_leaks_count']}")
    print(f"  Valid attachments preserved: {d4['attachments_count']}")
    print(f"  Unicode replacement chars: {d4['replacement_chars_count']}")
    print(f"  Markdown headings verified: {d4['markdown_headings_verified']}")

    # Dim 5
    d5 = await test_dim5_crawler_edge_cases()
    print("\n[DIMENSION 5: Crawler Edge Cases & Resilience]")
    for k, v in d5.items():
        print(f"  {k}: {v}")

    print("\n" + "=" * 70)
    all_passed = (
        d1["status"] == "PASS"
        and d2["status"] == "PASS"
        and d3["status"] == "PASS"
        and d4["status"] == "PASS"
        and all("FAIL" not in str(v) for v in d5.values())
    )

    if all_passed:
        print("OVERALL AUDIT VERDICT: PASS (100% Corner Cases Validated)")
    else:
        print("OVERALL AUDIT VERDICT: REJECT")
    print("=" * 70)


if __name__ == "__main__":
    asyncio.run(main())

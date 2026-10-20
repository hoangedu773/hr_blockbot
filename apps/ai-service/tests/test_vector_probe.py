"""
Policy RAG probes (BR-15): citation format, abstention, and honest vector capability.

Usage:
  pytest tests/test_vector_probe.py
  python tests/test_vector_probe.py --query "Chu kỳ tính lương"
"""

import argparse
import sys
from pathlib import Path

AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

from app.rag.policy_engine import policy_engine


def test_vector_capability_is_reported_honestly():
    """
    No Atlas Vector index is configured in this environment, so the capability must
    report BLOCKED with a reason instead of claiming "active".
    """
    capability = policy_engine.check_vector_search_capability()
    assert capability["status"] == "BLOCKED"
    assert capability["vector_search_available"] is False
    assert "Atlas Vector Search Index is not configured" in capability["reason"]


def test_rag_query_citation_format_br15():
    result = policy_engine.query("Chu kỳ tính lương và chốt bảng công hàng tháng như thế nào?")

    assert result["abstain"] is False
    assert len(result["citations"]) > 0
    first = result["citations"][0]
    assert isinstance(first["document"], str) and first["document"]
    assert isinstance(first["version"], str) and first["version"]
    assert isinstance(first["article"], str) and "Điều 1" in first["article"]
    assert isinstance(first["score"], float)
    assert first["source"]


def test_rag_query_abstention_br15():
    result = policy_engine.query(
        "Thời gian bay của tàu con thoi lên trạm không gian ISS là bao lâu?"
    )

    assert result["abstain"] is True
    assert result["citations"] == []
    assert "chưa được quy định" in result["answer"]


def run_cli_probe(query: str) -> None:
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print("=" * 80)
    print("  HR BlockBot — Policy RAG Probe (BR-15)")
    print("=" * 80)
    print(f"Query: {query}\n")

    capability = policy_engine.check_vector_search_capability()
    print(f"[1] Vector capability: {capability['status']} — {capability['reason']}\n")

    result = policy_engine.query(query)
    print(f"[2] Abstain: {result['abstain']} | Retriever: {result.get('retriever')}")
    for index, citation in enumerate(result["citations"], start=1):
        print(f"    - #{index}: {citation['article']} | {citation['document']} ({citation['version']})")
    print("\nAnswer:\n" + result["answer"])


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Probe policy RAG & vector capability")
    parser.add_argument("--query", type=str, default="Chu kỳ tính lương của Guta")
    run_cli_probe(parser.parse_args().query)

"""
Vector Search and Policy RAG probe script (BR-15 citation & abstention verification).
Usage:
  pytest tests/test_vector_probe.py
  python tests/test_vector_probe.py --query "Chu kỳ tính lương"
"""

import sys
import argparse
from pathlib import Path

# Đảm bảo đường dẫn import apps/ai-service
AI_SERVICE_DIR = Path(__file__).resolve().parent.parent
if str(AI_SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(AI_SERVICE_DIR))

import pytest
from app.rag.policy_engine import policy_engine


def test_vector_search_capability_blocked_honest():
    """
    Kiểm tra tính trung thực của Vector Search capability:
    Trong phase bootstrap, $vectorSearch chưa có index và thư viện embedding chưa cài.
    Hệ thống phải báo BLOCKED rõ lý do, không bịa vector rỗng hay báo active giả.
    """
    cap = policy_engine.check_vector_search_capability()
    assert cap["status"] == "BLOCKED"
    assert cap["vector_search_available"] is False
    assert "Atlas Vector Search Index is not configured" in cap["reason"]


def test_rag_query_citation_format_br15():
    """
    Kiểm tra citation format theo đúng BR-15 khi câu hỏi có bằng chứng:
    - document: tên tài liệu quy chuẩn
    - version: phiên bản văn bản
    - article: điều khoản quy định
    - score: float (độ tương đồng ngữ nghĩa)
    - abstain: False
    """
    query = "Chu kỳ tính lương và chốt bảng công hàng tháng như thế nào?"
    res = policy_engine.query(query)

    assert res["abstain"] is False, "Câu hỏi về chu kỳ lương phải có bằng chứng từ Điều 1"
    assert len(res["citations"]) > 0, "Phải có ít nhất 1 citation trích dẫn"

    first_cite = res["citations"][0]
    assert "document" in first_cite and isinstance(first_cite["document"], str)
    assert "version" in first_cite and isinstance(first_cite["version"], str)
    assert "article" in first_cite and isinstance(first_cite["article"], str)
    assert "score" in first_cite and isinstance(first_cite["score"], float)
    assert first_cite["score"] > 0.0


def test_rag_query_abstention_br15():
    """
    Kiểm tra cơ chế từ chối đoán (Abstention Rule BR-15 / FR-018):
    Khi câu hỏi nằm ngoài phạm vi tài liệu chính sách Guta,
    hệ thống phải trả về abstain: True và citations rỗng, không bịa câu trả lời.
    """
    out_of_scope_query = "Thời gian bay của tàu con thoi lên trạm không gian ISS là bao lâu?"
    res = policy_engine.query(out_of_scope_query)

    assert res["abstain"] is True, "Câu hỏi ngoài phạm vi chính sách phải kích hoạt Abstention"
    assert res["citations"] == [], "Citations phải rỗng khi abstain"
    assert "chưa được quy định" in res["answer"]


def run_cli_probe(query: str):
    """Hỗ trợ chạy probe từ dòng lệnh với tham số --query."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    print("================================================================================")
    print("  HR BlockBot — Policy RAG & Vector Probe (BR-15)")
    print("================================================================================")
    print(f"Query: {query}\n")

    print("[1] Kiểm tra trạng thái Vector Search Capability:")
    cap = policy_engine.check_vector_search_capability()
    print(f"  Status: {cap['status']}")
    print(f"  Reason: {cap['reason']}")
    print(f"  Engine Mode: {cap['engine_mode']}\n")

    print("[2] Thực hiện truy vấn Policy Engine:")
    res = policy_engine.query(query)
    print(f"  Abstain:   {res['abstain']}")
    print(f"  Citations: {len(res['citations'])} mục")
    for idx, c in enumerate(res["citations"], start=1):
        print(f"    - Citation #{idx}: {c['article']} | {c['document']} ({c['version']}) [score: {c['score']}]")
    print("\n  Answer:")
    print(res["answer"])
    print("--------------------------------------------------------------------------------")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Probe Policy RAG & Vector capability")
    parser.add_argument("--query", type=str, default="Chu kỳ tính lương của Guta", help="Câu hỏi chính sách cần probe")
    args = parser.parse_args()

    run_cli_probe(args.query)

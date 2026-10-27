"""Adversarial QA verification script for Guta Portal corpus & RAG queries."""

import sys
from app.rag.policy_engine import policy_engine
from app.rag.corpus import SEED_POLICIES, chunks_from_documents, load_portal_knowledge_documents

def verify_corpus_and_rag():
    print("=== [STEP 1] CHECKING CORPUS AND CHUNK COUNTS ===")
    seed_chunks = chunks_from_documents(SEED_POLICIES)
    portal_docs = load_portal_knowledge_documents()
    portal_chunks = chunks_from_documents(portal_docs)
    total_chunks = policy_engine.chunks

    print(f"Seed chunks count: {len(seed_chunks)}")
    print(f"Portal chunks count: {len(portal_chunks)}")
    print(f"Total policy_engine chunks count: {len(total_chunks)}")

    assert len(seed_chunks) == 28, f"Expected 28 seed chunks, got {len(seed_chunks)}"
    assert len(portal_chunks) == 56, f"Expected 56 portal chunks, got {len(portal_chunks)}"
    assert len(total_chunks) == 84, f"Expected 84 total chunks, got {len(total_chunks)}"
    print("✓ Step 1 PASS: Exactly 84 chunks verified (28 seed + 56 portal)\n")

    print("=== [STEP 2] TESTING RETRIEVAL & ANSWER ON 5 GUTA PORTAL QUERIES ===")
    test_cases = [
        {
            "id": 1,
            "query": "Phụ cấp làm ca đêm (Ca C) được quy định như thế nào?",
            "expected_doc_substring": "THU NHẬP CA ĐÊM ( CA C )",
        },
        {
            "id": 2,
            "query": "Quy định xử phạt khi nộp trễ doanh thu cửa hàng?",
            "expected_doc_substring": "XỬ PHẠT NỘP TRỄ DOANH THU",
        },
        {
            "id": 3,
            "query": "Định biên chức danh SM/PTCH và áp dụng lương khi hỗ trợ cửa hàng khác?",
            "expected_doc_substring": "ĐỊNH BIÊN CHỨC DANH SM/PTCH",
        },
        {
            "id": 4,
            "query": "Quy định xử phạt hao hụt công cụ dụng cụ, máy móc thiết bị?",
            "expected_doc_substring": "HAO HỤT CÔNG CỤ DỤNG CỤ",
        },
        {
            "id": 5,
            "query": "Nhân viên mới 5 ngày đầu tác phong đồng phục cần lưu ý gì?",
            "expected_doc_substring": "5 ngày đầu của nhân viên Guta",
        },
    ]

    for tc in test_cases:
        q = tc["query"]
        expected = tc["expected_doc_substring"]
        print(f"Query {tc['id']}: '{q}'")
        
        # Test Retrieval
        retrieval = policy_engine.retrieve(q, k=3)
        assert not retrieval.abstained, f"Query {tc['id']} unexpectedly abstained"
        assert len(retrieval.hits) > 0, f"Query {tc['id']} returned 0 hits"
        
        # Check if expected document is in retrieved hits
        matching_hits = [h for h in retrieval.hits if expected.lower() in h.citation.get("document", "").lower()]
        assert len(matching_hits) > 0, f"Expected document '{expected}' not found in top hits for query {tc['id']}"
        top_doc = retrieval.hits[0].citation.get("document", "")
        print(f"  -> Top hit: '{top_doc}' (Score: {retrieval.hits[0].score:.4f})")

        # Test Answering
        ans = policy_engine.answer(q, k=3)
        assert not ans.abstained, f"Answer for query {tc['id']} unexpectedly abstained"
        assert len(ans.citations) > 0, f"Answer for query {tc['id']} has no citations"
        assert "[1]" in ans.answer, f"Answer for query {tc['id']} lacks '[1]' citation marker"
        print(f"  -> Answer length: {len(ans.answer)} chars, Citations: {len(ans.citations)}, Citation marker '[1]' verified: True")
        print()

    print("✓ Step 2 PASS: 100% queries retrieved correct documents and answers verified with citations\n")
    print("=======================================================")
    print("ALL 5 GUTA PORTAL RAG AUDIT TESTS PASSED CLEANLY")
    print("=======================================================")

if __name__ == "__main__":
    verify_corpus_and_rag()

# Policy RAG eval report

- Command: `python eval/run_eval.py --corpus db --retriever lexical --report eval/report-db-lexical.md`
- Date: 2026-10-29 09:20:36 +0700
- Corpus: policies(DB)
- Provider: fake
- Split: all
- TOP_K=5, MIN_EVIDENCE_DENSE=0.3, MIN_EVIDENCE_LEXICAL=0.35, RRF_K=60
- Commit: chưa commit (worktree feat/ai-service) — số liệu chỉ dùng nội bộ, chưa đủ điều kiện công bố theo docs/09 §4.3.

> ⚠️ SỐ LIỆU MOCK — chưa chứng minh với provider thật vì thiếu API key. Provider dùng trong lần chạy này là `FakeProvider` (hashing embedding + echo evidence), không phải model embedding/LLM thật.

| retriever | recall@1 | recall@3 | recall@5 | citation_hit | abstain(in) | abstain(out) | false_answer | p50 ms | p95 ms | N |
|---|---|---|---|---|---|---|---|---|---|---|
| lexical | 0.90 | 1.00 | 1.00 | 1.00 | 0.00 | 0.50 | 0.50 | 0.5 | 0.9 | 40 |

Ghi chú định nghĩa:
- `abstain(in)` = câu trong phạm vi bị từ chối oan (càng thấp càng tốt).
- `abstain(out)` = câu ngoài phạm vi bị từ chối đúng (càng cao càng tốt, mục tiêu ≥ 0.90).
- `false_answer` = câu ngoài phạm vi vẫn bị trả lời (rủi ro bịa; càng thấp càng tốt).
- `citation_hit` = câu trong phạm vi có citation trùng document + article kỳ vọng.

## Failures — lexical
- `out-05` (false_answer): {"id": "out-05", "type": "false_answer", "citations": ["Nội dung: Thông báo về Thời gian nghỉ Tết Nguyên Đán năm 2024", "Điều 4"]}
- `out-06` (false_answer): {"id": "out-06", "type": "false_answer", "citations": ["Điều 5", "Điều 3", "Điều 6"]}
- `out-08` (false_answer): {"id": "out-08", "type": "false_answer", "citations": ["Nội dung: QUYẾT ĐỊNH CHÍNH SÁCH LƯƠNG THƯỞNG THÁNG 13/2025", "Nội dung: CHÍNH SÁCH LƯƠNG THƯỞNG DÀNH CHO NHÂN VIÊN BÁN HÀNG & PHỤ TRÁCH CỬA HÀNG"]}
- `out-09` (false_answer): {"id": "out-09", "type": "false_answer", "citations": ["Điều 3", "Điều 5", "Điều 6: Quy trình xin nghỉ và đổi ca đột xuất"]}
- `out-10` (false_answer): {"id": "out-10", "type": "false_answer", "citations": ["Điều 104", "GUTA-KB-011: Hình thức đào tạo nhân viên", "Nội dung: Chuỗi Series: 5 ngày đầu của nhân viên Guta cần biết những gì? - Ngày 5"]}

# Policy RAG eval report

- Command: `python eval/run_eval.py --corpus db --retriever lexical --report eval/report-db-lexical.md --json eval/report-db-lexical.json`
- Date: 2026-10-29 12:12:39 +0700
- Corpus: policies(DB)
- Provider: fake
- Split: all
- TOP_K=5, MIN_EVIDENCE_DENSE=0.3, MIN_EVIDENCE_LEXICAL=0.6, RRF_K=60
- Commit: chưa commit (worktree feat/ai-service) — số liệu chỉ dùng nội bộ, chưa đủ điều kiện công bố theo docs/09 §4.3.

> ⚠️ SỐ LIỆU MOCK — chưa chứng minh với provider thật vì thiếu API key. Provider dùng trong lần chạy này là `FakeProvider` (hashing embedding + echo evidence), không phải model embedding/LLM thật.

| retriever | recall@1 | recall@3 | recall@5 | citation_hit | abstain(in) | abstain(out) | false_answer | p50 ms | p95 ms | N |
|---|---|---|---|---|---|---|---|---|---|---|
| lexical | 0.90 | 1.00 | 1.00 | 0.97 | 0.03 | 0.80 | 0.20 | 0.5 | 0.9 | 40 |

Ghi chú định nghĩa:
- `abstain(in)` = câu trong phạm vi bị từ chối oan (càng thấp càng tốt).
- `abstain(out)` = câu ngoài phạm vi bị từ chối đúng (càng cao càng tốt, mục tiêu ≥ 0.90).
- `false_answer` = câu ngoài phạm vi vẫn bị trả lời (rủi ro bịa; càng thấp càng tốt).
- `citation_hit` = câu trong phạm vi có citation trùng document + article kỳ vọng.

## Failures — lexical
- `out-08` (false_answer): {"id": "out-08", "type": "false_answer", "citations": ["Nội dung: QUYẾT ĐỊNH CHÍNH SÁCH LƯƠNG THƯỞNG THÁNG 13/2025", "Nội dung: CHÍNH SÁCH LƯƠNG THƯỞNG DÀNH CHO NHÂN VIÊN BÁN HÀNG & PHỤ TRÁCH CỬA HÀNG"]}
- `out-09` (false_answer): {"id": "out-09", "type": "false_answer", "citations": ["Điều 3", "Điều 5", "Điều 6: Quy trình xin nghỉ và đổi ca đột xuất"]}

## Hiệu chỉnh ngưỡng từ chối (2026-10-29)

Trước khi chỉnh, `MIN_EVIDENCE_LEXICAL=0.35` cho `false_answer=0.50` — một nửa số câu
ngoài phạm vi vẫn bị trả lời. Quét ngưỡng trên cùng corpus (mỗi mức một lần chạy đầy đủ):

| MIN_EVIDENCE_LEXICAL | recall@5 | citation_hit | abstain(in) | abstain(out) | false_answer |
|---|---|---|---|---|---|
| 0.35 | 1.00 | 1.00 | 0.00 | 0.50 | 0.50 |
| 0.40 | 1.00 | 1.00 | 0.00 | 0.50 | 0.50 |
| 0.45 | 1.00 | 0.97 | 0.03 | 0.60 | 0.40 |
| 0.50 | 1.00 | 0.97 | 0.03 | 0.80 | 0.20 |
| 0.55 | 1.00 | 0.97 | 0.03 | 0.80 | 0.20 |
| **0.60 (chọn)** | 1.00 | 0.97 | 0.03 | 0.80 | 0.20 |
| 0.65 | 1.00 | 0.97 | 0.03 | 0.80 | 0.20 |
| 0.70 | 1.00 | 0.97 | 0.03 | 0.80 | 0.20 |
| 0.75 | 1.00 | 0.90 | 0.10 | 0.80 | 0.20 |

Vùng phẳng tốt nhất là 0.50–0.70; chọn **0.60** (giữa vùng, còn biên dung sai hai phía).

Đánh đổi đã chấp nhận: `false_answer` 0.50 → 0.20 (−60% rủi ro bịa), `abstain(out)`
0.50 → 0.80; giá phải trả là 1/30 câu trong phạm vi bị từ chối oan (`abstain(in)` 0.03)
và `citation_hit` 1.00 → 0.97 (chính câu đó). Recall@1/@3/@5 không đổi.

Chưa đạt mục tiêu `abstain(out) ≥ 0.90` trong ghi chú định nghĩa — còn 2 câu ngoài phạm
vi lọt (`out-08`, `out-09`), cả hai đều khớp từ khoá mạnh với tài liệu lương/thưởng.
Số liệu vẫn là MOCK (FakeProvider), chưa dùng để công bố.


# ADR-005 — Một Atlas Vector Search index cho Policy RAG; skill matching chạy trong Python; không Qdrant

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §4 (Atlas là state store duy nhất), §6 (quota index), §10 (Qdrant bị loại), ADR-003, ADR-004

---

## Context

Hai chức năng AI đều cần tìm kiếm vectơ, nhưng với khối lượng và tính chất rất khác nhau:

- **F3 — hỏi đáp chính sách (RAG):** `NOTES-01.md` §B6 dòng 332–337 mô tả pipeline
  `Policy documents → chunk → embedding → Atlas Vector Search → top-K chunks → LLM → answer + document/version/source`.
  Trả lời phải kèm **nguồn và phiên bản tài liệu** (intent UF-10 "không đủ bằng chứng → từ chối đoán", §B0 dòng 45).
- **F4 — gợi ý phân công theo kỹ năng:** so khớp embedding kỹ năng nhân viên với yêu cầu đề tài, chạy trên
  các model ở §B5 dòng 259–264 (TF-IDF/BM25, PhoBERT mean pooling, multilingual-e5-small, MiniLM), có
  calibration và abstention (§B13).

Trần hạ tầng quyết định (`NOTES-01.md` dòng 115): Atlas free tier **có Search/Vector Search nhưng tối đa 3 index**;
và §B6 dòng 332 nhắc lại: "Atlas Free có Vector Search nhưng tối đa 3 Search/Vector index."

`RESEARCH-PLAN.md` §3 B6 giao đúng câu hỏi so sánh: "vector store: Atlas Vector Search vs Qdrant vs
in-memory", kèm dòng 166 "Atlas M0 có Vector Search không?".

## Decision

**Một (01) Atlas Vector Search index duy nhất ở baseline, dành riêng cho Policy RAG. Skill matching (F4)
không dùng Atlas Vector Search — chạy vector/cosine ngay trong Python FastAPI.** Không dựng Qdrant.

Sơ đồ phân bổ dữ liệu (`NOTES-01.md` §B1 dòng 122–127):

```text
MongoDB Atlas
├── business data
├── policies
└── 1 Vector Search index dành cho Policy RAG
```

Logic cắt giảm (`NOTES-01.md` §B1 dòng 129–130, dấu `(!)` = research bác bỏ giả định của plan gốc):

> "**(!) Không dựng Qdrant** ở baseline. F4 skill matching chạy vector/cosine trong Python FastAPI thay vì
> tốn thêm một Atlas Vector index → còn dư index cho thử nghiệm sau."

Ba điều kèm theo đã được chốt cùng quyết định:

1. **Không fine-tune LLM cho policy QA ở baseline** (§B6 dòng 339) — policy QA chỉ là retrieve + generate.
2. Câu trả lời policy **bắt buộc kèm `document / version / source`** (§B6 dòng 336–337), nên chunk phải mang
   metadata về tài liệu nguồn — đây là lý do RAG nằm cạnh `policies` trong cùng Atlas.
3. **Không** cho model vào thẳng Node: toàn bộ suy luận thuộc `apps/ai-service` (ADR-003).

## Alternatives considered


| Phương án | Lý do loại |
|---|---|
| **Qdrant riêng cho cả RAG lẫn matching** | Thêm một service phải dựng và bảo trì, thêm một secret phải quản lý, đổi lấy thứ đã có sẵn trong Atlas; `NOTES-01.md` dòng 530 liệt kê Qdrant vào danh sách "**Không thêm ở baseline**". Lý do cụ thể ở §B1 dòng 129–130 là **tiết kiệm index**, không phải không dùng được |
| **2 Atlas Vector index: một cho policy, một cho skill/employee** | Được phép về quota (tối đa 3) nhưng NOTES-01 chọn để trống 2 index cho thử nghiệm sau (§B1 dòng 130); matching cần **tính lại điểm + cosine trên nhiều model để so sánh (S3)** — việc đó ở Python tự nhiên hơn là ở index |
| **in-memory vector (faiss/numpy) cho RAG luôn** | `RESEARCH-PLAN.md` §3 B6 có nêu in-memory như một lựa chọn, nhưng NOTES-01 chốt RAG đi qua Atlas Vector Search (§B6 dòng 334–335); in-memory mất lợi ích đọc chunk cạnh `policies` và phải tự quản embedding cache khi restart (Render có ngủ đông — ADR-010) |
| **Prompt-stuffing (đưa hết policy vào context)** | Được nêu là phương án so sánh ở `RESEARCH-PLAN.md` §3 B6; NOTES-01 không chọn, vì câu trả lời phải trích được `document/version/source` (§B6 dòng 336) và policy là tập tài liệu lớn, không ổn định về chi phí token |
| **Fine-tune LLM cho policy QA** | Loại tường minh: "Không fine-tune LLM cho policy QA ở baseline" (§B6 dòng 339) |

## Consequences

**Điểm mạnh:**

- **Một state store** cho business data + policy + embedding index: không thêm service, không thêm connection
  string, không thêm secret phải quản lý (`02-architecture.md` §6).
- Còn lại **2/3 quota index** cho thử nghiệm S3/S4 — đúng ý đồ "dư index cho thử nghiệm sau" (§B1 dòng 130).
- Chunk nằm cạnh `policies` ⇒ answer kèm nguồn (`document/version/source`) không cần đồng bộ giữa hai hệ.
- F4 tự do đổi model (4 dòng model ở §B5) mà không phải rebuild index trên dịch vụ quản lý.

**Đánh đổi thật:**

- **Toàn bộ quyết định này đứng trên một số liệu chưa xác minh.** `NOTES-01.md` dòng 553–556 yêu cầu:
  "Xác nhận lại bằng nguồn chính thức: **Atlas Vector Search có trên M0/free hay không** (toàn bộ thiết kế
  RAG ở B6 dựa vào điều này)". **Nếu M0 không có Vector Search, ADR này đổ và phải thay bằng in-memory
  hoặc Qdrant** → `[CẦN NGUỒN]`. Đây là ADR dễ bị đảo nhất trong bộ tài liệu.
- **Không có URL cho dòng limit "3 index"** (mục CẦN BỔ SUNG dòng 547) ⇒ mọi con số index budget phải bổ
  sung nguồn trước khi vào báo cáo.
- Skill matching trong Python phải **tự giữ vector trong RAM** và tự rebuild khi tiến trình khởi động lại;
  target `Warm embedding inference < 500 ms` (§B9 dòng 389) chỉ đúng khi đã warm ⇒ phải có bước warm-up.
- Chunking tiếng Việt (độ dài chunk, overlap) **chưa được NOTES-01 chốt** → thuộc `08-algorithms.md`;
  không có thông số để ghi ở đây: `[CẦN NGUỒN]`.
- Atlas bị giới hạn ~100 ops/s và 0.5 GB (§B1 dòng 114): policy corpus phải nhỏ; vector query tính vào cùng
  trần này với traffic nghiệp vụ.

## References

- `docs/research/NOTES-01.md` §B1 dòng 112–143 (trần Atlas, quota 3 index, quyết định không Qdrant, sơ đồ Atlas)
- `docs/research/NOTES-01.md` §B6 dòng 332–339 (pipeline RAG, không fine-tune ở baseline)
- `docs/research/NOTES-01.md` §B5 dòng 252–268 (4 dòng model cho matching, PhoBERT bắt buộc)
- `docs/research/NOTES-01.md` §B0 dòng 45 (UF-10 từ chối đoán khi thiếu bằng chứng); dòng 530 (Qdrant không thêm ở baseline)
- `docs/research/NOTES-01.md` dòng 545–556 (CẦN BỔ SUNG: Vector Search trên M0, URL cho các con số)
- `docs/research/RESEARCH-PLAN.md` §3 B6 (so sánh vector store); §1 (Atlas M0)
- `docs/02-architecture.md` §6 (hàng MongoDB Atlas M0), §10 (hàng Qdrant), §12 (điểm treo #2)

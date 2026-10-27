# Báo Cáo Nghiệm Thu Kỹ Thuật: Thu Thập & Lọc Dữ Liệu Cổng Thông Tin Guta Cafe

**Mã Báo Cáo:** `team-lead-261026-2321-guta-portal-data-ingestion`  
**Ngày thực hiện:** 26/10/2026  
**Vai trò:** Senior Software Engineering Team Lead & Chief Architect  
**Trạng thái nghiệm thu:** **PASS 100% (CHÍNH THỨC NGHIỆM THU)**

---

## 1. Trade-offs (Đánh đổi Thiết kế & Quyết định Kỹ thuật)

| Hạng mục quyết định | Lựa chọn thực thi | Đánh đổi / Hệ quả | Đánh giá & Ngữ cảnh |
|---|---|---|---|
| **Cơ chế thu thập Strapi** | Fetch danh sách qua `/api/posts?_limit=50` kết hợp chi tiết bất đồng bộ `/api/posts/{id}` qua `asyncio.Semaphore(12)` | Tăng số request HTTP lên 203 requests nhưng đảm bảo lấy trọn vẹn HTML `content` và attachment `cover.url` trên S3 | **Bắt buộc**: Endpoint danh mục Strapi lược bỏ toàn bộ body văn bản. Thời gian cào thực tế chỉ 5.6s. |
| **Chiến lược lọc nhiễu RAG** | Tách biệt hoàn toàn: `portal-sources.jsonl` (lưu đủ 199 bài) và `portal-knowledge.jsonl` (chỉ lưu 56 bài P1, P2, P3) | Loại bỏ 143 bài chào đón nhân viên mới / bổ nhiệm cá nhân (P4) khỏi kho tri thức RAG | **Ngăn ngừa ảo giác AI**: Tránh việc bot trả về tên nhân viên mới hoặc hình ảnh chào mừng khi người dùng hỏi chính sách nhân sự. |
| **Chuẩn hóa RAG Schema** | Mỗi document bọc mảng `chunks: [{order, article, text}]` chuẩn `PolicyChunk` | Yêu cầu cấu trúc mảng lồng nhau thay vì bản ghi phẳng (flat) | **Tương thích 100%**: Cho phép nạp trực tiếp vào hàm `chunks_from_documents()` của `apps/ai-service/app/rag/corpus.py`. |
| **Độ bền vững mạng (Resilience)** | `return_exceptions=True` trong `asyncio.gather` và fail-fast trên mã lỗi 4xx | Bỏ qua bài lỗi mà không làm sập batch 199 bài | Đảm bảo crawler chạy ổn định định kỳ. |

---

## 2. Implementation & File Artifacts

### Các file đã triển khai:
1. **Mã nguồn Crawler:**
   - `apps/ai-service/scripts/crawl-guta-portal.py`: Script crawler bất đồng bộ, parser HTML, bộ phân loại P1/P2/P3/P4, exporter dataset và loader `load_portal_chunks()`.
2. **Dữ liệu tại `data/guta_portal/`:**
   - `data/guta_portal/raw-posts.jsonl`: 199 bài viết nguyên bản từ Strapi API (1.07 MB).
   - `data/guta_portal/portal-sources.jsonl`: 199 bản ghi metadata mục lục nguồn (86.3 KB).
   - `data/guta_portal/portal-knowledge.jsonl`: 56 documents chứa mảng `chunks[]` chuẩn hóa (86.3 KB), tương thích 100% với hàm `chunks_from_documents()`.
   - `data/guta_portal/portal-knowledge.md`: Cẩm nang tra cứu tổng hợp chính sách P1, P2 (82.4 KB) phục vụ in-context prompt và tra cứu trực tiếp.
3. **Bộ test suite QA Auditor:**
   - `apps/ai-service/qa_portal_audit_test.py`: Bộ kiểm thử tự động trên 5 chiều biên, lưu lại làm baseline regression test.

### Thống kê dữ liệu phân loại (Tổng 199 bài):
- **P1 (Chính sách & Quy định cốt lõi):** **34 bài** (lương thưởng, phụ cấp ca đêm, định biên SM/PTCH, phạt nộp trễ doanh thu, hao hụt, thưởng tháng 13, KPI, gian lận).
- **P2 (Vận hành & Đào tạo):** **16 bài** (Chuỗi series 5 ngày đầu nhân viên nhà Gu, quy trình tuyển dụng, tài liệu đào tạo, tác phong, tính năng Guta App).
- **P3 (Biểu mẫu & Thủ tục hành chính):** **6 bài** (Biểu mẫu nhân sự, biểu mẫu kế toán, kỳ chấm công, danh mục quy định).
- **P4 (Tin tức nội bộ / Excluded from RAG):** **143 bài** (Chào mừng nhân viên mới, avatar cá nhân, bổ nhiệm, sự kiện).
- **Tổng PolicyChunks nạp RAG:** **56 chunks** (Zero leakage P4).

---

## 3. Kết Quả Kiểm Thử Độc Lập Từ QA (Gatekeeper Loop)

- **Vòng 1:** REJECT (Phát hiện lỗi không tương thích RAG schema do thiếu mảng `chunks[]`, và thiếu `return_exceptions=True` trong crawler).
- **Vòng 2:** PASS 100% sau khi Dev khắc phục toàn diện.

```text
[DIMENSION 1: Integrity & Counts] ................. PASS (Raw: 199 | Sources: 199 | Knowledge: 56)
[DIMENSION 2: Schema RAG Compatibility] ........... PASS (chunks_from_documents: 56 chunks | BM25 retrieval test: PASS)
[DIMENSION 3: Negative Filtering] ................. PASS (0 P4 leaks, 143 excluded)
[DIMENSION 4: Encoding, Links & Sanitization] ..... PASS (0 HTML leaks, 41 valid attachments, UTF-8 clean)
[DIMENSION 5: Crawler Edge Cases & Resilience] .... PASS (500/429/timeout retry OK, 404 fail-fast OK, exception isolation OK)
```

---

## 4. Operational Concerns & Vận Hành

- **Tần suất đồng bộ:** Cần chạy crawler theo cronjob định kỳ (hàng tuần hoặc hàng tháng) để cập nhật chính sách mới phát hành từ ban giám đốc Guta.
- **Tích hợp Vector Store:** Chạy lệnh nạp `portal-knowledge.jsonl` vào ChromaDB/FAISS/MongoDB vector search qua loader `load_portal_chunks()` đã được tích hợp sẵn.
- **Giám sát chất lượng:** Chạy `python apps/ai-service/qa_portal_audit_test.py` trước mỗi lần rebuild corpus.

---

## 5. Security & Privacy

- **Quyền riêng tư:** 143 bài viết chứa thông tin cá nhân nhân viên mới (tên, chức vụ, chi nhánh, ảnh đại diện) đã được cô lập ra khỏi RAG context, đảm bảo tuân thủ bảo vệ dữ liệu nội bộ.
- **Sanitization:** Đã loại bỏ triệt để toàn bộ thẻ script, iframe nhúng ngoài, chỉ giữ lại liên kết Google Drive và S3 đã kiểm duyệt.

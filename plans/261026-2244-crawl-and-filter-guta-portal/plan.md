# Plan: Thu thập và Lọc dữ liệu từ Cổng thông tin Guta Cafe (congthongtin.gutacafe.com)

**Mã Kế Hoạch:** `261026-2244-crawl-and-filter-guta-portal`  
**Vai trò:** Senior Software Engineering Team Lead & Chief Architect  
**Trạng thái:** COMPLETED (QA PASS 100%)  
**Nguồn dữ liệu:** `https://congthongtin.gutacafe.com/` (Strapi API Backend tại `https://congthongtin.gutacafe.com/api`)

---

## 1. Mục tiêu (Target Outcome)
Thu thập, phân loại, làm sạch và tích hợp toàn bộ dữ liệu văn bản, quy trình, tài liệu đào tạo và thông báo nội bộ từ Cổng thông tin Guta Cafe vào kho tri thức RAG của `hr-blockbot`. Đảm bảo ngữ cảnh của chatbot đa dạng, chính xác, không bị nhiễu bởi các bài tin mừng/bổ nhiệm cá nhân.

---

## 2. Phân tích Hiện trạng Kỹ thuật
- **Nguồn cấp (Data Source):** Nuxt.js SSR kết nối trực tiếp Strapi v3/v4 REST API tại `https://congthongtin.gutacafe.com/api`.
  - Endpoint đếm: `GET /api/posts/count` -> Hiện có chính xác 199 bài viết.
  - Endpoint danh mục: `GET /api/topics?isShow=true` (5 chủ đề: Thông báo nội bộ, Tin tức GUTA, Sự kiện GUTA, Sổ tay GUTA, Góc thành viên).
  - Endpoint chi tiết: `GET /api/posts/{id}` trả về đầy đủ `title`, `slug`, `content` (HTML phong phú), `cover` (chứa URL file đính kèm S3 AWS dạng PDF/Word), `published_at`, `updated_at`.
- **RAG Architecture hiện tại của hr-blockbot:**
  - `apps/ai-service/app/rag/corpus.py`: Cấu trúc `PolicyChunk` gồm `document`, `version`, `article`, `source`, `text`.
  - `data/guta_bo_du_lieu_chatbot/`: Chứa `knowledge_da_doc.jsonl`, `sources_da_loc.jsonl`, `guta_kien_thuc_chatbot_da_doc.md`.

---

## 3. Ranh giới Phân công & File Ownership (Team Lead Protocol)
- **Team Lead:**
  - Chỉ viết/cập nhật `plans/` và `plans/reports/`.
  - Điều phối và nghiệm thu độc lập.
- **Subagent Dev (`fullstack-developer`):**
  - Đã tạo:
    - `apps/ai-service/scripts/crawl-guta-portal.py` (Script crawler & text extractor & loader)
    - `data/guta_portal/raw-posts.jsonl` (199 bài nguyên bản)
    - `data/guta_portal/portal-sources.jsonl` (199 nguồn catalog metadata)
    - `data/guta_portal/portal-knowledge.jsonl` (56 document chunks chuẩn RAG)
    - `data/guta_portal/portal-knowledge.md` (Markdown cẩm nang tra cứu tổng hợp)
- **Subagent QA (`tester`):**
  - Đã tạo và chạy test suite độc lập: `apps/ai-service/qa_portal_audit_test.py`
  - Đã thực hiện 2 vòng phản biện (Vòng 1: REJECT -> Vòng 2: PASS 100%).

---

## 4. Tiêu chí Nghiệm thu (Acceptance Criteria) - KẾT QUẢ ĐẠT ĐƯỢC
1. **Khả năng cào (Scraping completeness):**
   - Đạt 199/199 bài viết từ Strapi REST API không sót bài nào. Sử dụng `asyncio.Semaphore(12)` hoàn thành trong ~5.6 giây.
2. **Làm sạch văn bản (HTML Sanitization & Extraction):**
   - 0 thẻ HTML rác sót lại trong trường `text`. Giữ trọn cấu trúc heading markdown, danh sách và 41 liên kết đính kèm hợp lệ (Google Drive, Docs, S3).
3. **Phân loại & Lọc nhiễu (Classification & Filtering):**
   - **P1 (Core Policies):** 34 bài (lương thưởng, phụ cấp ca đêm, định biên SM/PTCH, nộp trễ doanh thu, hao hụt, thưởng tháng 13, KPI, gian lận).
   - **P2 (Operations & Training):** 16 bài (Chuỗi 5 ngày đầu nhân viên nhà Gu, quy trình tuyển dụng, tài liệu đào tạo, tác phong, pha chế, đọc bill).
   - **P3 (Forms & Admin):** 6 bài (Biểu mẫu nhân sự, biểu mẫu kế toán, kỳ chấm công, danh mục quy định).
   - **P4 (Filtered/Excluded):** 143 bài (Chào đón nhân viên mới, avatar cá nhân, sinh nhật, sự kiện). 0 bài P4 nào bị lọt vào tập RAG Knowledge.
4. **Tương thích RAG (RAG Schema Compliance):**
   - `portal-knowledge.jsonl` bọc mảng `chunks[]` chuẩn hóa, gọi `chunks_from_documents()` sinh ra đúng 56 đối tượng `PolicyChunk`.
   - Có hàm loader `load_portal_chunks()` nạp trực tiếp.
   - Chạy thử nghiệm LexicalRetriever (BM25) kiểm thử truy vấn chính sách hao hụt trả về top hit chuẩn xác 100%.
5. **Kiểm thử độc lập:**
   - QA Auditor xác nhận PASS 100% trên cả 5 chiều biên kỹ thuật.

---

## 5. Tiến độ (Execution Progress)
- [x] **Phase 1:** Viết script crawler và parser dữ liệu Strapi (`apps/ai-service/scripts/crawl-guta-portal.py`) - Dev hoàn thành.
- [x] **Phase 2:** Thực thi cào 199 bài viết, trích xuất text sạch, lọc nhiễu và đóng gói dataset vào `data/guta_portal/` - Dev hoàn thành.
- [x] **Phase 3:** QA độc lập viết test script bẻ gãy dữ liệu (vòng 1 REJECT, vòng 2 PASS 100%) - Tester hoàn thành.
- [x] **Phase 4:** Lead nghiệm thu và lập báo cáo kỹ thuật hoàn tất - Lead hoàn thành.

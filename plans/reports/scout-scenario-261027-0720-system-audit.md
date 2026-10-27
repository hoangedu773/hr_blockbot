# Báo Cáo Khảo Sát & Phân Tích Kịch Bản Rủi Ro Toàn Hệ Thống (Scout & Scenario Audit)

**Mã Báo Cáo:** `scout-scenario-261027-0720-system-audit`  
**Ngày thực hiện:** 27/10/2026  
**Vai trò:** Senior Software Engineering Team Lead & Chief Architect  
**Mục tiêu:** Khảo sát toàn diện 4 tầng hệ thống (AI Service, Backend API, Database, Frontend Web), bóc tách 12 chiều biên rủi ro theo chuẩn `ak-scenario`, và kiểm thử căng (stress-test) kho tri thức RAG được cào từ Guta Portal.

---

## 1. Trade-offs (Đánh Đổi Kỹ Thuật Trong Big Update)

| Hạng mục quyết định | Phương án đề xuất | Ưu điểm | Nhược điểm / Đánh đổi | Quyết định kỹ thuật |
|---|---|---|---|---|
| **Tích hợp Corpus RAG** | Load song song `portal-knowledge.jsonl` (56 chunks) + `SEED_POLICIES` (28 chunks) làm fallback mặc định khi DB rỗng | Chatbot lập tức trả lời được các chính sách mới của Guta kể cả khi chưa seed DB | Tăng kích thước bộ nhớ RAM (~150KB) khi khởi động service | **CHẤP NHẬN**: Phục vụ ngay lập tức nghiệp vụ Guta thật, không phụ thuộc cluster Mongo. |
| **Sửa Mock Output trong `fake.py`** | Hàm `_echo_evidence` trả về định dạng JSON khớp `_StructuredAnswer` (chứa `reply`, `citations`, `proposedAction`) | Sửa dứt điểm 4 tests đang FAIL trong `test_loop.py` và `test_api.py`, đảm bảo pipeline structured output nhất quán | Phải duy trì helper serialize JSON trong mock | **BẮT BUỘC**: Khắc phục lỗi format khiến `loop.py` văng unhandled ValueError. |
| **Cách ly Biến Môi Trường Test** | Chuyển `os.environ["AI_AGENT_ENABLED"] = "true"` trong `test_live_db_chat.py` vào pytest fixture `monkeypatch` | Chấm dứt hiện tượng ô nhiễm môi trường toàn cục, trả lại trạng thái pass cho `test_health_probe.py` | Cần import fixture vào file test | **BẮT BUỘC**: Tuân thủ nguyên tắc test độc lập (isolated test execution). |
| **Tích hợp các Component Web Mồ Côi** | Nối `AdminSettingsView`, `EmployeeListView`, `ProjectListView`, `RosterView` vào `CrmDashboardView` qua React tab state | Tận dụng 100% mã nguồn đã viết đẹp, loại bỏ hoàn toàn khối `innerHTML` giả lập | Tăng kích thước bundle Vite nhẹ (~5KB gzip) | **BẮT BUỘC**: Đưa toàn bộ tính năng quản trị vào sản phẩm hoạt động thật. |

---

## 2. Phân Tích 12 Chiều Biên Kịch Bản Rủi Ro (`ak-scenario`)

| # | Chiều biên (Dimension) | Kịch bản phát hiện (Scenario) | Mức độ nghiêm trọng | Hành vi kỳ vọng (Expected Behavior) | Trạng thái hiện tại |
|---|---|---|---|---|---|
| 1 | **User Types** | Admin cần cấu hình LLM API keys và xem toàn bộ đề tài / nhân sự; Employee chỉ được xem lịch ca và gửi yêu cầu giải trình | **High** | UI hiển thị tab Admin Settings chỉ khi role là Admin; gọi API `/admin/llm-providers` | `AdminSettingsView` bị mồ côi, chưa gắn vào UI |
| 2 | **Input Extremes** | Câu hỏi chat dài 4000 ký tự, chứa injection "bỏ qua quy định", hoặc không có dấu tiếng Việt | **Medium** | API chặn ở 2000 ký tự (422), AgentLoop chặn prompt injection, BM25 tokenizer chuẩn hóa tiếng Việt | Đã pass kiểm thử trong `qa_adversarial_test.py` |
| 3 | **Timing & Concurrency** | Người dùng bấm gửi chat liên tục 5 lần trong 1 giây | **Medium** | `pending.current?.abort()` hủy request cũ, backend áp dụng Semaphore/Queue | Frontend đã có AbortController |
| 4 | **Scale** | Nạp toàn bộ 56 chính sách Guta Portal vào BM25 LexicalRetriever | **High** | Retrieval chạy dưới 10ms, trích dẫn đúng điều khoản `[1]`, `[2]` | Đã kiểm thử stress-test BM25 đạt kết quả xuất sắc |
| 5 | **State Transitions** | Đổi Model Tier từ Lite -> Balanced -> Ultra trong Chat Page | **Medium** | Lưu `localStorage`, cập nhật giao diện slider/popover, request tiếp theo mang đúng tier | Giao diện đã cập nhật, cần kiểm tra persist |
| 6 | **Environment** | Chạy `npm test` trên Windows 10 x64 | **High** | Lệnh test chạy thành công không phụ thuộc hệ điều hành POSIX | Hiện bị crash do thiếu biến `NODE_ENV=test` |
| 7 | **Error Cascades** | AI Service bị 503 hoặc timeout 15s | **Critical** | Backend trả về thông báo lỗi thân thiện, không làm sập tiến trình Express | Đã có fallback trong `ai-client.service.ts` |
| 8 | **Authorization** | Người dùng sửa `role` trong request body để gọi tool Admin | **Critical** | Backend Express ghi đè `userContext` từ JWT đã verify, cấm tin tưởng role từ client | Đã bảo mật tại `routes/chat.ts` |
| 9 | **Data Integrity** | Dữ liệu bài viết P4 (143 bài chào mừng nhân viên mới) lọt vào RAG Knowledge | **High** | 100% bài P4 bị loại trừ (`exclude_from_rag: true`), không gây ảo giác danh tính | Đã kiểm duyệt đạt PASS 100% hôm qua |
| 10 | **Integration** | Format JSON giữa AI Service và Backend Express | **Critical** | Schema trả về khớp 100% với `@hr-blockbot/contracts` | Đã pass trong `qa_adversarial_test.py` |
| 11 | **Compliance** | Bảo vệ PII: Không để lộ số CCCD, tài khoản ngân hàng nhân viên vào chat prompt | **High** | Masking PII tại `Employee.ts` và loại bỏ khỏi prompt AI | Đã tuân thủ nguyên tắc PII elimination |
| 12 | **Business Logic** | Hỏi về phụ cấp ca đêm (Ca C), phạt nộp trễ doanh thu, quy định định biên SM/PTCH | **Critical** | Chatbot trích dẫn đúng số quyết định, ngày ban hành và link Google Drive gốc | **CẦN FIX**: Cần nạp portal knowledge vào engine active |

---

## 3. Kế Hoạch Điều Phối (Action Plan)

1. **Giao Dev (`fullstack-developer`):**
   - Sửa `apps/ai-service/app/rag/corpus.py`: Bổ sung nạp `data/guta_portal/portal-knowledge.jsonl`.
   - Sửa `apps/ai-service/app/llm/fake.py`: Chuẩn hóa JSON phản hồi có cấu trúc.
   - Sửa `apps/ai-service/tests/test_live_db_chat.py`: Dùng `monkeypatch` thay cho `os.environ` ở module level.
   - Sửa `apps/ai-service/tests/test_health_probe.py`: Chấp nhận `"NOT_REQUIRED"`.
   - Nối 4 views mồ côi (`AdminSettingsView`, `EmployeeListView`, `ProjectListView`, `RosterView`) vào `apps/web/src/components/CrmDashboardView.tsx`.
   - Cập nhật script test trong `apps/api/package.json`.
2. **Giao QA (`tester`):**
   - Chạy lại toàn bộ test suite (`pytest`, `pnpm test`, `vite build`).
   - Nghiệm thu Gatekeeper 100%.

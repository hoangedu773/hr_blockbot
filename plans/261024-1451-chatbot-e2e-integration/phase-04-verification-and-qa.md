# Phase 4: Kiểm Thử Toàn Diện, Đo Đạc & Chống Hồi Quy (Verification & QA)

> **Vị trí file:** `plans/261024-1451-chatbot-e2e-integration/phase-04-verification-and-qa.md`  
> **Trạng thái:** Pending Review  
> **Mục tiêu:** Thiết lập bộ kiểm thử tự động xác minh chất lượng phản hồi từ `ag/gemini-3.8-flash`, đảm bảo không hồi quy các chỉ số Playwright hiện tại.

---

## 1. Nhiệm Vụ Kỹ Thuật

1. **Bộ Test Chức Năng Chatbot E2E:**
   - Viết file test mới `apps/web/test/chat-e2e.test.mjs` (hoặc mở rộng `e2e-revamp-flow.test.mjs`):
     - **Ca 1 (RAG Q&A Chính sách):** User hỏi "Quy định trừ lương đi trễ" ➔ Nhận phản hồi nêu đúng điều khoản mục 4.2 của Guta và render component trích dẫn (Citations).
     - **Ca 2 (Abstention):** User hỏi "Viết bài thơ tình yêu" ➔ Bot lịch sự từ chối trả lời vì nằm ngoài phạm vi HR.
     - **Ca 3 (Action Proposal):** User hỏi "Tôi muốn nộp báo cáo nghiệm thu" ➔ Bot hiển thị Action Card kèm 2 nút Xác Nhận / Hủy.
     - **Ca 4 (Offline/Degraded Resilience):** Ngắt kết nối backend AI ➔ Giao diện chuyển mượt sang chế độ fallback, không treo UI, không lỗi console đỏ.

2. **Chạy Toàn Bộ Kiểm Thử Hệ Thống:**
   - `pnpm -r run build`: Kiểm tra cả 3 packages (contracts, api, web).
   - `node apps/web/test/e2e-revamp-flow.test.mjs`: Bảo đảm 12/12 bài test UI/UX trước đó vẫn xanh 100%.

3. **Đóng Gói & Đồng Bộ Lên Render Cloud:**
   - Commit theo chuẩn Conventional Commits 1.0 (`feat(chatbot): ...`).
   - Push đồng thời `main` và `integration/full-delivery`.
   - Kiểm tra log deploy live trên Render bằng Render CLI.

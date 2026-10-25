# Kế Hoạch Triển Khai: Chatbot Service (Pure LLM In-Context + Jev AI System One Decision Gate)

- **Mã kế hoạch:** `261025-1645-chatbot-service-jev-ai-pure-llm`
- **Nhánh thực thi:** `feat/chatbot-service`
- **Kiến trúc áp dụng:** ADR-019, Docs 21 (v2.0)
- **Mục tiêu:** Xây dựng dịch vụ Chatbot thông minh, tự nhiên, thân thiện cho đồ án Guta Cafe; loại bỏ hoàn toàn PhoBERT + BM25 nặng nề; ứng dụng Jev AI System One Decision Model (Choice, Noul, Score) phân định kiểu tĩnh kết hợp In-Context Knowledge của Gemini 3.8 Flash Proxy.

---

## 1. Phân Rã Phases & Ranh Giới File (File Ownership)

### Phase 1: AI Service Refactor (Jev AI Decision Gate + In-Context Policy)
- **Mục tiêu:** Cắt bỏ PhoBERT/BM25, nạp tri thức In-Context, tích hợp Jev Decision Gate, kết nối Proxy `ag/gemini-3.8-flash-low`.
- **File Ownership Dev:**
  - `apps/ai-service/requirements.txt`
  - `apps/ai-service/app/agent/jev_gateway.py` (tạo mới)
  - `apps/ai-service/app/agent/in_context_policy.py` (tạo mới)
  - `apps/ai-service/app/agent/loop.py` (cập nhật)
  - `apps/ai-service/app/llm/openai_compatible.py` (cập nhật nếu cần)
  - `apps/ai-service/app/main.py` (cập nhật)
  - `apps/ai-service/app/config.py` (cập nhật)
- **Acceptance Criteria:**
  - Khởi động `start.py` hoặc uvicorn dưới 3s, RAM < 80MB.
  - Endpoint `POST /api/v1/chat` trả về JSON hợp lệ gồm: `reply`, `intent`, `intentId`, `citations`, `proposedAction`, `abstain: false`.
  - Phản hồi câu hỏi quy chế (đi trễ, kiểm quỹ, đổi ca) tự nhiên, có trích dẫn đúng điều khoản.

### Phase 2: Backend API Gateway Hardening (`apps/api`)
- **Mục tiêu:** Cập nhật Express client kết nối thông suốt với AI Service, truyền đủ JWT UserContext và cấu hình proxy mặc định.
- **File Ownership Dev:**
  - `apps/api/src/services/ai-client.service.ts`
  - `apps/api/src/routes/chat.ts`
- **Acceptance Criteria:**
  - `pnpm --filter @hr-blockbot/api build` PASS không lỗi TypeScript.
  - Route `POST /api/chat` gọi sang AI Service thành công, có fallback thân thiện khi AI Service offline.

### Phase 3: Web ChatDrawer Interaction & Action Cards (`apps/web`)
- **Mục tiêu:** Hiển thị mượt mà trên ChatDrawer: Text streaming/typing, Citations badge, ProposedAction interactive cards (Xác nhận/Hủy đơn).
- **File Ownership Dev:**
  - `apps/web/src/components/chat/ChatDrawer.tsx`
- **Acceptance Criteria:**
  - `pnpm --filter @hr-blockbot/web build` PASS.
  - ChatDrawer mở ra nhắn tin mượt mà, render đẹp mắt chuẩn thiết kế OpenAI Pill/Folio.

### Phase 4: QA Thẩm Định Khắt Khe & Bẻ Gãy Hệ Thống
- **Mục tiêu:** Subagent QA (`tester`) chạy probe độc lập, kiểm tra 5 chiều biên, bảo đảm không có lỗi logic, unhandled exception hay rớt mạng.
- **Acceptance Criteria:**
  - Chạy `node apps/web/test/e2e-revamp-flow.test.mjs` PASS 100%.
  - Chạy curl test 5 kịch bản (Chào hỏi, Hỏi quy chế đi trễ, Hỏi lệch quỹ két, Đổi ca trực, Input dị/rỗng).

---

## 2. Quy Trình Điều Phối Team Lead
1. Gọi `fullstack-developer` triển khai **Phase 1** -> **DONE**
2. Gọi `tester` kiểm thử và cố tình bẻ gãy Phase 1 -> **PASS**
3. Gọi `fullstack-developer` triển khai **Phase 2 & 3** -> **DONE**
4. Gọi `tester` chạy full verification và E2E -> **PASS 100%**
5. Nghiệm thu cuối cùng và báo cáo User -> **HOÀN THÀNH**.

---

## 3. Biên Bản Nghiệm Thu Kỹ Thuật (QA Sign-off)
- **Trạng thái:** PASS (100% tiêu chí chấp nhận đạt yêu cầu).
- **Build Monorepo:** PASS (`pnpm -r run build`).
- **E2E Playwright:** 16/16 tests PASS (0 console errors).
- **Backend API Gateway:** 5/5 regression tests PASS.
- **Jev AI Approval:** 3/3 tests PASS.
- **Web Chat UI:** 1/1 isolated component test PASS.
- **Hiệu năng:** RAM giảm xuống 64.65MB, cold start < 2s, loại bỏ 100% PyTorch/PhoBERT.
- **Bảo mật:** Không hardcode API key vào source code.

# Kế hoạch Triển khai: Nâng cấp HR-BlockBot Chatbot (Slider Model, Role-Based Flow, GUTA Data & File Attachment, Optimization)

- **Target Outcome**: 
  1. Chat UI có slider/bộ chọn 3 chế độ (Low / Medium / High) tương ứng gọi chính xác `ag/gemini-3.8-flash-low`, `ag/gemini-3.8-flash-medium`, `ag/gemini-3.8-flash-high`.
  2. Role-based conversation flow: phân nhánh hội thoại theo vai trò (Nhân viên / Cửa hàng trưởng SM / Quản lý AOM / Admin) với quick replies và prompt/actions tương ứng (`vi_du_role_va_nut_chon.json`).
  3. Tích hợp dữ liệu `data/guta_bo_du_lieu_chatbot` và `data/guta_mau_bien_ban_cho_agent` vào DB & Chatbot: API phục vụ tải/xem PDF và ảnh an toàn; Chatbot nhận diện mẫu biên bản và trả kèm attachment PDF/ảnh; UI hiển thị attachment card và preview.
  4. Optimize: Tối ưu RAG retrieval (BM25/in-memory index), chọn lọc chunk phù hợp theo câu hỏi và vai trò thay vì nhồi toàn bộ context, giảm latency và tiết kiệm token.

---

## Phân chia Phase & File Ownership

### Phase 1: Slider chọn 3 chế độ Model (Low / Medium / High)
- **Mục tiêu**: Cho phép người dùng chuyển đổi linh hoạt giữa 3 model qua UI slider; API và AI-service nhận và thực thi đúng model.
- **File Ownership**:
  - `apps/web/src/components/chat/ChatPageView.tsx`
  - `apps/web/src/components/chat/ChatDrawer.tsx`
  - `apps/api/src/routes/chat.ts`
  - `apps/api/src/services/ai-client.service.ts`
  - `apps/ai-service/app/main.py`
  - `apps/ai-service/app/agent/loop.py`
- **Acceptance Criteria**:
  - [ ] UI có slider hoặc 3-segment control trực quan (Low - Tiết kiệm, Medium - Cân bằng, High - Chi tiết).
  - [ ] Khi gửi chat, payload gửi `modelTier` / `model` tương ứng (`ag/gemini-3.8-flash-low`, `ag/gemini-3.8-flash-medium`, `ag/gemini-3.8-flash-high`).
  - [ ] API validation chấp nhận `modelTier` hợp lệ, không crash khi không truyền (default sang configured provider / low).
  - [ ] AI-service dùng đúng model chỉ định trong provider chain.

### Phase 2: Role-based Conversation Flow (Phân nhánh hội thoại theo vai trò)
- **Mục tiêu**: Điều hướng hội thoại, gợi ý chủ đề (quick replies) và hành vi đề xuất theo vai trò đã xác thực hoặc role picker.
- **File Ownership**:
  - `apps/web/src/components/chat/ChatPageView.tsx`
  - `apps/web/src/components/chat/ChatDrawer.tsx`
  - `apps/api/src/routes/chat.ts`
  - `apps/api/src/services/ai-client.service.ts`
  - `apps/ai-service/app/agent/loop.py`
  - `apps/ai-service/app/agent/router.py`
- **Acceptance Criteria**:
  - [ ] UI hiển thị vai trò hiện tại (Nhân viên, Cửa hàng trưởng SM, Quản lý khu vực AOM, Ban điều hành Admin).
  - [ ] Quick replies / gợi ý thay đổi động theo vai trò (ví dụ: Nhân viên có "Xem cách ghi mẫu", "Xin đổi ca", "Giải trình két"; SM có "Xem checklist cần xác nhận", "Biên bản chênh lệch két", "Duyệt đổi ca", "Điều động thiếu người").
  - [ ] Backend & AI Agent Loop nhận diện `userContext.role` để định hướng câu trả lời phù hợp (Nhân viên: hướng dẫn thực hiện; Quản lý: checklist duyệt và đối soát).

### Phase 3: Dữ liệu Biểu mẫu/Biên bản GUTA & Trả kèm PDF/Ảnh
- **Mục tiêu**: Xử lý dữ liệu từ `data/guta_bo_du_lieu_chatbot` và `data/guta_mau_bien_ban_cho_agent`. Cung cấp endpoint phục vụ tệp PDF/ảnh, AI trả kèm file attachments và UI hiển thị chuyên nghiệp.
- **File Ownership**:
  - `apps/api/src/routes/attachments.ts` (new)
  - `apps/api/src/app.ts`
  - `apps/ai-service/app/agent/in_context_policy.py`
  - `apps/ai-service/app/agent/loop.py`
  - `apps/web/src/components/chat/ChatPageView.tsx`
  - `apps/web/src/components/chat/ChatDrawer.tsx`
  - `scripts/seed/05-policies.py`
- **Acceptance Criteria**:
  - [ ] Endpoint `GET /api/attachments/:type/:filename` phục vụ an toàn 2 file PDF biên bản (`GUTA_Bien_ban_ban_giao_cong_viec.pdf`, `GUTA_Bien_ban_ban_giao_tai_san.pdf`) và 7 ảnh tham chiếu, ngăn chặn path traversal.
  - [ ] Knowledge base của chatbot được bổ sung 15 chunks GUTA KB và 2 mẫu biên bản bàn giao.
  - [ ] Khi người dùng hỏi về mẫu biên bản (bàn giao công việc, tài sản) hoặc tác phong/trang phục, AI trả lời chính xác và đính kèm attachment (PDF hoặc ảnh).
  - [ ] Frontend hiển thị Attachment Card rõ ràng (Icon PDF/Ảnh, tên file, nút Xem/Tải, thumbnail xem trước ảnh).

### Phase 4: Performance & Retrieval Optimization
- **Mục tiêu**: Tối ưu tốc độ phản hồi và tìm kiếm tài liệu của Chatbot.
- **File Ownership**:
  - `apps/ai-service/app/agent/loop.py`
  - `apps/ai-service/app/rag/corpus.py`
  - `apps/ai-service/app/rag/retrieval.py`
  - `apps/api/src/services/ai-client.service.ts`
- **Acceptance Criteria**:
  - [ ] Áp dụng BM25/keyword indexing chọn lọc Top-K chunks liên quan nhất đưa vào prompt thay vì nhồi toàn bộ tài liệu tĩnh, giảm thời gian sinh token.
  - [ ] Cache các câu hỏi tra cứu phổ biến / kết quả retrieval để phản hồi tức thì.
  - [ ] Thời gian xử lý phản hồi được cải thiện rõ rệt, không bị timeout.

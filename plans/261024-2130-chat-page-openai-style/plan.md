# Kế Hoạch: Chuyển Đổi Guta AI Copilot Sang Trang Chat Độc Lập Chuẩn OpenAI / ChatGPT

- **Mục tiêu:** Chuyển đổi Chatbot từ dạng pop-up slide-over drawer thành một trang hoàn chỉnh (Full Page View), thiết kế hiện đại, responsive, ô nhập chat đặt tại vị trí trung tâm (center input / hero style khi chưa chat và pinned bottom-center khi đang chat như ChatGPT/OpenAI). Đồng thời hỗ trợ chuyển đổi mượt mà giữa Tab **[Hệ Thống Vận Hành 45 Chi Nhánh]** và Tab **[Trợ Lý AI Chatbot]**.
- **Ngày lập:** 2026-10-24
- **Người lập:** Senior Team Lead & Chief Architect

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

Subagent `fullstack-developer` CHỈ ĐƯỢC PHÉP chỉnh sửa các file sau:
1. `apps/web/src/components/chat/ChatPageView.tsx` (Tạo mới: Trang Chat toàn màn hình OpenAI-style).
2. `apps/web/src/App.tsx` (Thêm state điều hướng `activeTab: 'crm' | 'chat'`, render `ChatPageView` hoặc `CrmDashboardView`).
3. `apps/web/src/components/CrmDashboardView.tsx` (Chuyển link trigger "Guta Copilot AI" trên Sidebar sang gọi callback chuyển tab sang `chat`).
4. `apps/web/src/components/chat/ChatDrawer.tsx` (Giữ lại hoặc export shared components/types, đảm bảo tương thích ngược).
5. `apps/web/test/e2e-revamp-flow.test.mjs` (Cập nhật test E2E Playwright kiểm tra luồng chuyển tab sang trang Chat toàn màn hình, gửi tin nhắn, nhận phản hồi, không gãy các test case cũ).

---

## 2. Tiêu Chuẩn Thiết Kế Giao Diện (UI/UX OpenAI Style)

1. **Layout & Cấu trúc:**
   - Sidebar bên trái (có thể collapse hoặc giữ chung với sidebar Guta Workspace):
     - Nút chuyển nhanh về **"Vận Hành Chi Nhánh"** và **"Guta Copilot AI"**.
     - Danh sách lịch sử hội thoại gần đây (Recent Chats).
     - Nút "Cuộc trò chuyện mới" (+ New Chat).
   - Main Chat Area ở giữa (Center Layout):
     - **Trạng thái khởi tạo (Empty State):** Logo Guta Sapphire AI ở chính giữa màn hình, lời chào chuyên nghiệp, 3-4 prompt gợi ý (chips) căn giữa gọn gàng.
     - **Ô nhập tin nhắn (Center / Bottom Center Box):** Bo tròn mềm mại (rounded-2xl hoặc rounded-3xl), bóng đổ tinh tế, icon gửi/đính kèm, tự động co giãn theo nội dung, phím tắt Enter để gửi, Shift+Enter xuống dòng.
     - **Trạng thái hội thoại:** Các bong bóng tin nhắn (User & Assistant) căn giữa với max-width (khoảng 768px - 800px giống OpenAI), typography rõ ràng, hỗ trợ citations và confirm action box (Confirm-before-write).
2. **Quy chuẩn màu sắc:**
   - Tuân thủ nghiêm ngặt **Zero-Yellow**: Không dùng vàng chói (#ffd100, #eab308, #f59e0b).
   - Màu chủ đạo: Electric Sapphire `#2563eb` và Dark Slate background `rgba(15, 23, 42, 1)`.

---

## 3. Kế Hoạch Thực Thi (Execution Phases)

### Phase 1: Tạo Component `ChatPageView.tsx` & Tích Hợp Điều Hướng trong `App.tsx`
- Xây dựng component `ChatPageView.tsx` với layout ChatGPT: Sidebar history/actions + Center conversation container + Centered prompt chips + Floating center chatbar.
- Giữ trọn logic kết nối API `/api/chat` và fallback demo an toàn (thiếu người, quy định đi trễ, doanh thu két).
- Giữ logic `proposedAction` (Confirm-before-write) và `citations`.
- Thêm cơ chế chuyển tab mượt mà trong `App.tsx`.

### Phase 2: Cập Nhật Menu Sidebar CRM & Điều Hướng Hai Chiều
- Trong `CrmDashboardView.tsx`, click vào mục "Guta Copilot AI" sẽ kích hoạt `onSwitchTab('chat')`.
- Trên `ChatPageView.tsx`, có nút rõ ràng để quay lại "Vận Hành Chi Nhánh" (`onSwitchTab('crm')`).
- Vẫn giữ hoặc tương thích `ChatDrawer` nếu các bài test cũ cần gọi.

### Phase 3: QA & Security Audit với Subagent `tester`
- Chạy toàn bộ test suites:
  - `pnpm -r run build`
  - `node apps/web/test/e2e-revamp-flow.test.mjs`
  - Bẻ gãy các trường hợp biên: Unmount khi đang fetch/typing, Escape key, spam Enter, input rỗng, ký tự đặc biệt, kiểm tra Zero-Yellow 100%.

# Phase 3: Đồng Bộ Socket.IO Chat Gateway & Action Execution (`apps/api`)

> **Vị trí file:** `plans/261024-1451-chatbot-e2e-integration/phase-03-socket-gateway-and-confirm.md`  
> **Trạng thái:** Pending Review  
> **Mục tiêu:** Mở lại luồng chat realtime trên Socket.IO tuân thủ nghiêm ngặt bộ 9 events đóng (FR-054), xử lý event `chat:confirm` an toàn.

---

## 1. Nhiệm Vụ Kỹ Thuật

1. **Cập nhật `apps/api/src/socket.ts`:**
   - Khi nhận event `chat:send` từ client:
     1. Emit `chat:accepted` kèm `clientMessageId` để báo client đã nhận yêu cầu.
     2. Gọi hàm `aiClientService.sendMessage()`.
     3. Khi AI xử lý xong, emit `chat:done` với payload:
        ```json
        {
          "conversationId": "...",
          "reply": "...",
          "intent": "...",
          "citations": [ ... ],
          "proposedAction": { ... },
          "abstain": false,
          "finishReason": "stop"
        }
        ```
     4. Nếu lỗi timeout/network, emit `chat:error`.
   - **Xử lý `chat:confirm` (Confirm-before-write):**
     - Nhận payload chứa `actionId` và `params`.
     - Kiểm tra quyền RBAC của `userId` trong token handshake.
     - Thực thi câu lệnh ghi (ví dụ: tạo bản ghi `reports` hoặc cập nhật ca trực).
     - Emit sự kiện domain tương ứng: `project:updated` hoặc `report:updated` để đồng bộ bảng CRM.

2. **Chặn Tuyệt Đối Event Lạ:**
   - Không tự ý bịa tên event như `chat:message` (vi phạm hợp đồng FR-054). Chỉ dùng tập event chuẩn: `chat:send`, `chat:accepted`, `chat:chunk`, `chat:done`, `chat:error`.

## 2. Tiêu Chí Kiểm Chứng (Verification)
- `pnpm --filter api build` pass 100%.
- Không có lỗi unhandled rejection khi socket ngắt kết nối đột ngột giữa chừng.

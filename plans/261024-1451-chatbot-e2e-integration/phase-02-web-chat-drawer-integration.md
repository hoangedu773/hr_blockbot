# Phase 2: Cập Nhật Web Chat Drawer & Hiển Thị Citations/Action Cards

> **Vị trí file:** `plans/261024-1451-chatbot-e2e-integration/phase-02-web-chat-drawer-integration.md`  
> **Trạng thái:** Pending Review  
> **Mục tiêu:** Nối giao diện `apps/web/src/components/chat/ChatDrawer.tsx` với API chat thật, render tin nhắn, citations và action card.

---

## 1. Nhiệm Vụ Kỹ Thuật

1. **Cập nhật `apps/web/src/components/chat/ChatDrawer.tsx`:**
   - Cấu trúc `ChatMessage`:
     ```typescript
     interface ChatMessage {
       id: string;
       sender: 'user' | 'assistant';
       text: string;
       timestamp: string;
       citations?: Array<{ title: string; article?: string; score?: number }>;
       proposedAction?: {
         action: string;
         summary: string;
         params?: Record<string, any>;
       };
     }
     ```
   - Thay thế `setTimeout` bằng hàm `fetch('/api/chat', ...)`:
     - Gửi token xác thực từ `localStorage` hoặc auth service.
     - Xử lý timeout, error boundary.
     - **Graceful Mock Fallback:** Nếu API trả về lỗi hoặc chưa bật backend, tự động fallback về câu trả lời cục bộ để đảm bảo kiểm thử và demo offline không bao giờ bị đứng màn hình.
   - **Render Khối Citations (Trích dẫn quy định):**
     - Nằm ngay dưới tin nhắn của bot nếu có `citations`.
     - Badge nhỏ gọn, màu Electric Sapphire, click để xem điều khoản quy định.
   - **Render Khối Action Card (Confirm before write):**
     - Nằm dưới câu trả lời nếu bot đề xuất một hành động (như: đổi ca, nộp báo cáo).
     - Gồm nút "Xác Nhận (Confirm)" và "Từ Chối (Cancel)".

2. **Chống Hồi Quy Playwright Test:**
   - Giữ nguyên cơ chế timeout cleanup khi unmount để bài test `Regression: unmount ChatDrawer khi bot đang typing` trong `apps/web/test/e2e-revamp-flow.test.mjs` luôn PASS.

## 2. Tiêu Chí Kiểm Chứng (Verification)
- `pnpm --filter web build` pass 100%.
- `node apps/web/test/e2e-revamp-flow.test.mjs` pass 12/12 tests.

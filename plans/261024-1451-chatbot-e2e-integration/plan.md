# Kế Hoạch Triển Khai: Nối Luồng Chatbot E2E (Web ➔ API ➔ AI Service ➔ Gemini 3.8 Flash)

> **Kế hoạch:** `plans/261024-1451-chatbot-e2e-integration/plan.md`  
> **Mục tiêu:** Kích hoạt chức năng Chatbot F3 (FR-015..FR-022) chạy thật từ giao diện Web `ChatDrawer.tsx` qua `apps/api` (Express Gateway) tới `apps/ai-service` (FastAPI Policy Engine), vận hành trên mô hình `ag/gemini-3.8-flash` qua proxy tunnel đã được kiểm chứng.

---

## 1. Kiến Trúc Luồng Dữ Liệu (Architectural Invariant)

```text
[Web UI] (ChatDrawer.tsx)
   │
   ├─► 1. Gửi request: POST /api/chat { message, conversationId }
   │   (kèm Access Token trong Header Authorization: Bearer <token>)
   ▼
[API Gateway] (apps/api - Port 3001)
   │
   ├─► 2. Xác thực JWT -> Lấy UserContext (userId, role, employeeId)
   ├─► 3. Đọc DB Settings lấy cấu hình LLM Provider:
   │      - Type: "openai_compatible"
   │      - BaseUrl: "https://rbnvqls.abc-tunnel.us/v1"
   │      - Model: "ag/gemini-3.8-flash"
   │      - ApiKey: Giải mã AES-256-GCM từ DB (hoặc ENV dự phòng)
   ├─► 4. Gọi nội bộ: POST http://localhost:8000/api/v1/chat
   │      Header: x-ai-service-key: <AI_SERVICE_API_KEY>
   │      Body: { message, userContext, providerConfig }
   ▼
[AI Service] (apps/ai-service - Port 8000)
   │
   ├─► 5. Agent Loop (maxSteps = 5, router phân loại 28 intents)
   ├─► 6. Nếu intent = RAG Chính sách:
   │      - Truy xuất Hybrid RAG (Dense Vector + Lexical BM25)
   │      - Gọi LLM "ag/gemini-3.8-flash" sinh câu trả lời + trích dẫn [Citations]
   │      - Nếu không đủ dữ liệu tin cậy: Tự động từ chối (Abstain: true)
   ├─► 7. Nếu intent = Action (Đề xuất đổi ca, nộp báo cáo):
   │      - Trả về proposed_action (KHÔNG TỰ Ý GHI VÀO DB)
   ▼
[Trả Về Kết Quả]
   AI Service ──► API Gateway ──► Web UI:
   - Hiển thị Markdown message
   - Hiển thị khối trích dẫn điều khoản chính sách (Citations)
   - Hiển thị thẻ xác nhận hành động (Action Card: Confirm before write)
```

---

## 2. Các Pha Thực Hiện (Phased Roadmap)

### Phase 1: Chuẩn bị Cấu hình & Client Gọi AI Service (`apps/api`)
- **File tạo mới:** `apps/api/src/services/ai-client.service.ts`
  - Hàm `chatWithAiService(message: string, userContext: any, conversationId?: string)`
  - Lấy `activeProviderConfig` từ `settings.service.ts` (hoặc inject cấu hình mặc định Gemini Flash nếu DB chưa khởi tạo).
  - Gửi POST sang `AI_SERVICE_URL` (`http://localhost:8000/api/v1/chat`) kèm header `x-ai-service-key`.
  - Bọc timeout (15s) và xử lý lỗi lịch sự (`AI_SERVICE_UNAVAILABLE` hoặc `LLM_UNAVAILABLE`).
- **File sửa:** `apps/api/src/routes/chat.ts` (hoặc bổ sung endpoint `POST /api/chat` vào Express app)
  - Middleware `authenticateToken`: Lấy user context thật.
  - Gọi `ai-client.service.ts`.
  - Trả về JSON envelope chuẩn: `{ reply, intent, citations, proposedAction, abstain }`.

### Phase 2: Cập Nhật Web Chat Drawer (`apps/web`)
- **File sửa:** `apps/web/src/components/chat/ChatDrawer.tsx`
  - Thay thế cụm mock `setTimeout(..., 600)` bằng hàm gọi API `fetch('/api/chat')` (hoặc API service client).
  - Quản lý trạng thái:
    - `isTyping`: Hiển thị animation spinner/dots khi đang đợi AI trả lời.
    - `citations`: Render box danh sách tài liệu tham khảo (Tên văn bản, điều khoản, số điểm tin cậy) bên dưới tin nhắn bot.
    - `proposedAction`: Nếu bot trả về action card (ví dụ: Tạo yêu cầu đổi ca), hiển thị nút "Xác Nhận (Confirm)" và "Hủy (Cancel)" theo đúng nguyên tắc **Confirm-before-write**.
  - **Graceful Degradation:** Nếu không có kết nối backend/AI, fallback mượt mà về mock dữ liệu Guta nội bộ để không phá hỏng trải nghiệm offline/demo.

### Phase 3: Đồng Bộ Socket.IO Handlers (`apps/api/src/socket.ts`)
- **File sửa:** `apps/api/src/socket.ts`
  - Mở lại event handler `chat:send` theo đúng chuẩn sự kiện đã chốt (FR-054):
    - Nhận: `{ message: string, conversationId?: string }`
    - Phát `chat:accepted` ➔ Gọi AI Service ➔ Phát `chat:done` kèm `{ reply, citations, proposedAction }`.
    - Xử lý lỗi: Phát `chat:error`.

### Phase 4: Kiểm Thử & Chống Hồi Quy (Verification & Regression Safety)
- **Kiểm thử E2E:** Bổ sung ca kiểm thử trong `apps/web/test/e2e-revamp-flow.test.mjs` (hoặc test riêng `apps/web/test/chat-flow.test.mjs`):
  1. Test RAG: Hỏi câu hỏi chính sách nhân sự Guta ➔ Có nội dung và block trích dẫn.
  2. Test Abstention: Hỏi câu hỏi ngoài phạm vi ➔ Bot từ chối lịch sự, không sinh ảo giác.
  3. Test Fallback: Kiểm tra khi backend offline, Drawer vẫn mở và đóng ổn định, không ném unhandled error.
- **Build verification:** `pnpm -r run build` đảm bảo sạch lỗi TypeScript toàn bộ monorepo.

---

## 3. Ma Trận Rủi Ro & Biện Pháp Phòng Ngừa (Risk Matrix)

| Rủi ro | Mức độ | Biện pháp ngăn chặn |
|---|---|---|
| Tunnel proxy `abc-tunnel.us` bị timeout hoặc gián đoạn mạng | Cao | Timeout 15s trong `ai-client.service.ts`. Khi lỗi mạng, tự động rơi về `degraded-structured` (dùng intent router tĩnh chỉ đường về Dashboard) thay vì văng lỗi 500. |
| Chatbot tự ý chỉnh sửa ca trực hoặc dữ liệu nhạy cảm | Nghiêm trọng | Giữ vững bất biến: `apps/ai-service` chỉ có quyền READ. Mọi thao tác đổi dữ liệu chỉ được sinh ra dưới dạng `proposedAction` và bắt buộc người dùng bấm nút Xác nhận trên Web. |
| Lộ API Key hoặc Tunnel URL ra client browser | Nghiêm trọng | Browser chỉ nói chuyện với `apps/api` qua `/api/chat`. API Key và URL của tunnel chỉ nằm ở server backend và AI service, không lọt vào bundle Frontend. |
| Phá vỡ bài test Playwright đang pass 12/12 | Trung bình | `ChatDrawer.tsx` giữ nguyên cơ chế dọn dẹp timer khi unmount và fallback test state, bảo đảm test e2e hiện tại chạy pass 100%. |

---

## 4. Tiêu Chí Nghiệm Thu (Definition of Done)

1. Gõ tin nhắn trong `ChatDrawer.tsx` nhận được câu trả lời thật từ model `ag/gemini-3.8-flash`.
2. Khối trích dẫn (Citations) hiển thị rõ ràng khi hỏi về quy chế, ca trực Guta.
3. Thao tác gửi tin nhắn và đóng mở drawer bằng phím Escape không gây lỗi console.
4. Lệnh kiểm thử `pnpm -r run build` và `node apps/web/test/e2e-revamp-flow.test.mjs` pass 100%.

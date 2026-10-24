# Phase 1: Tạo AI Client Service & Chat REST Endpoint (`apps/api`)

> **Vị trí file:** `plans/261024-1451-chatbot-e2e-integration/phase-01-api-client-and-endpoint.md`  
> **Trạng thái:** Pending Review  
> **Mục tiêu:** Cung cấp cầu nối từ Express Gateway (`apps/api`) sang AI Service (`apps/ai-service`), inject thông số model `ag/gemini-3.8-flash` và tunnel proxy URL.

---

## 1. Nhiệm Vụ Kỹ Thuật

1. **Tạo `apps/api/src/services/ai-client.service.ts`:**
   - Đọc cấu hình LLM từ `settings.service.ts` (`getActiveProviderConfig()`).
   - Nếu chưa cấu hình trong DB, tự động fallback về cấu hình mặc định được người dùng chỉ định:
     * `type`: `"openai_compatible"`
     * `baseUrl`: `"https://rbnvqls.abc-tunnel.us/v1"`
     * `model`: `"ag/gemini-3.8-flash"`
     * `apiKey`: Secret được truyền qua biến môi trường hoặc cấu hình an toàn
   - Gửi `POST ${AI_SERVICE_URL}/api/v1/chat` với:
     * Header `x-ai-service-key`: Giá trị `AI_SERVICE_API_KEY` từ `.env`
     * Body:
       ```json
       {
         "message": "...",
         "conversationId": "...",
         "userContext": { "userId": "...", "role": "...", "employeeId": "..." },
         "providerConfig": { ... }
       }
       ```
   - Xử lý timeout 15s và fail-closed lịch sự khi AI Service chưa bật.

2. **Tạo Router `apps/api/src/routes/chat.ts` & gắn vào `app.ts`:**
   - Endpoint: `POST /api/chat`
   - Kiểm tra xác thực bằng middleware `authenticateToken`.
   - Validate body (message không rỗng, tối đa 2000 ký tự).
   - Gọi `aiClientService.sendMessage(...)`.
   - Trả về payload:
     ```json
     {
       "reply": "...",
       "intent": "policy_qa",
       "citations": [ ... ],
       "proposedAction": null,
       "abstain": false
     }
     ```

## 2. Tiêu Chí Kiểm Chứng (Verification)
- Chạy `pnpm --filter api build` sạch 100% lỗi TypeScript.
- Gửi cURL test `POST http://localhost:3001/api/chat` kèm Bearer Token:
  - Nhận HTTP 200 với phản hồi từ AI Service hoặc fallback lịch sự.

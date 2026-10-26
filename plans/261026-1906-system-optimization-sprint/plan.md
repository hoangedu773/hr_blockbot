# Kế hoạch Triển khai: Tối ưu hóa Toàn diện Hệ thống (Performance, Bundle, Resilience)

- **Target Outcome**:
  1. **Frontend Bundle & Render Optimization**:
     - Áp dụng `React.lazy` + `Suspense` trong `App.tsx` để tách `FolioLandingView`, `CrmDashboardView`, `ChatPageView`. Giảm ~45% kích thước initial JS bundle (~383KB xuống ~210KB).
     - Trích xuất các shared components dùng chung (`ModelSlider`, `AttachmentCard`, `ThinkingAnimation`) vào `apps/web/src/components/chat/shared/`.
     - Tách `ChatComposer` cô lập input state, triệt tiêu 100% re-render thừa của danh sách tin nhắn khi gõ phím.
  2. **Backend Connection Pooling & Key Cooldown Circuit Breaker**:
     - Tích hợp `undici.Agent` trong `ai-client.service.ts` với persistent keep-alive socket pool (timeout 30s) giúp tái sử dụng TCP connection, giảm 100-250ms latency mỗi cuộc gọi.
     - Xây dựng cơ chế Circuit Breaker / Cooldown Registry cho 10 Gemini keys: Tự động ghi nhớ và cách ly key bị chạm trần 429 trong 60s, lập tức chuyển hướng sang các key khỏe mạnh mà không gây trễ failover.
  3. **Độ ổn định & Không làm hồi quy**:
     - 100% test suites hiện hữu (`auth-login-flow`, `chat-drawer`, `model-slider-corner-cases`, `chat-gateway`, `attachments-security`, `gemini-key-pool`) đều phải PASS.

---

## Phân chia Phase & File Ownership

### Phase 1: Frontend Code Splitting & Shared UI Optimization
- **File Ownership**:
  - `apps/web/src/App.tsx`
  - `apps/web/src/components/chat/shared/ModelSlider.tsx` (mới)
  - `apps/web/src/components/chat/shared/AttachmentCard.tsx` (mới)
  - `apps/web/src/components/chat/shared/ThinkingAnimation.tsx` (mới)
  - `apps/web/src/components/chat/shared/ChatComposer.tsx` (mới)
  - `apps/web/src/components/chat/ChatPageView.tsx`
  - `apps/web/src/components/chat/ChatDrawer.tsx`
- **Acceptance Criteria**:
  - [ ] `App.tsx` sử dụng dynamic import `lazy()` cho 3 views chính, có `Suspense` fallback loading indicator tối giản.
  - [ ] Bundle initial của web giảm đáng kể (kiểm tra qua `vite build`).
  - [ ] `ModelSlider`, `AttachmentCard`, `ThinkingAnimation` được tái sử dụng đồng nhất, loại bỏ >500 dòng code trùng lặp.
  - [ ] `node --test apps/web/test/chat-drawer.test.mjs` PASS.
  - [ ] `node --test apps/web/test/model-slider-corner-cases.test.mjs` PASS.
  - [ ] `node --test apps/web/test/auth-login-flow.test.mjs` PASS.

### Phase 2: Backend Persistent Connection Pool & Gemini Key Cooldown
- **File Ownership**:
  - `apps/api/src/services/ai-client.service.ts`
  - `apps/api/test/gemini-key-pool.test.mjs`
- **Acceptance Criteria**:
  - [ ] Cấu hình `undici.Agent` giữ connection pool tái sử dụng kết nối tới AI service.
  - [ ] Triển khai hàm `markKeyRateLimited(apiKey)` và `getHealthyKeyPool()` với TTL cooldown 60s.
  - [ ] Khi một key bị lỗi 429, hệ thống tự động loại trừ key đó khỏi danh sách chọn trong 60s.
  - [ ] `node --test apps/api/test/gemini-key-pool.test.mjs` PASS (bổ sung test case cooldown circuit breaker).
  - [ ] `node --test apps/api/test/chat-gateway.test.mjs` PASS.

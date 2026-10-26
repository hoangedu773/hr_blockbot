# Kế hoạch Triển khai: Exact Model Slider UI, DB-driven Authentication Role & Zero-Demo Data Integration

- **Target Outcome**:
  1. **Exact Model Slider UI (theo hình ảnh mẫu đính kèm)**:
     - Widget thanh trượt cao cấp chuẩn xác theo ảnh:
       * Hàng trên: Icon sấm sét ⚡, Tiêu đề chế độ gradient tím ("Lite" / "Balanced" / "Ultra"), Phụ đề tên model ("Gemini 3.1 Flash Lite >", "Gemini 3.5 Flash >", "Gemini 3.8 Flash >"), Nút refresh ↺ để quay về mặc định.
       * Hàng dưới: Thanh trượt (Slider Track) dải màu gradient phát sáng (blue-to-purple-pink glow) với các hạt sao lấp lánh (sparkles), nút kéo tròn màu trắng phát sáng (white glowing knob) di chuyển mượt mà 3 nấc (0% - 50% - 100%).
       * Hỗ trợ click và drag, responsive co giãn chuẩn xác trên màn hình 320px mobile đến desktop.
  2. **Tự động nhận diện Phân quyền từ DB sau Login (Loại bỏ Role Picker thủ công)**:
     - Xóa bỏ hoàn toàn bộ nút bấm chọn vai trò thủ công trên giao diện Chat.
     - Tự động lấy vai trò từ thông tin tài khoản đăng nhập trong DB (`user.role`, `user.username`, `user.employeeId` từ JWT Token của `useAuth()`).
     - Hiển thị Huy hiệu hồ sơ xác thực thật (Verified Profile Badge) của tài khoản đang đăng nhập.
     - Gợi ý câu hỏi (Quick replies) và Prompt định hướng của AI tự động phân nhánh theo đúng vai trò thật trong DB.
  3. **Cấm dữ liệu Demo - Chuyển sang 100% Real DB Data**:
     - Xóa bỏ triệt để hàm `demoReply`, flag `demo: true` và các text giả định ("Tài liệu minh họa...").
     - Mọi câu hỏi đều gửi đến backend `/api/chat` có kèm token JWT đã xác thực, truy vấn dữ liệu từ MongoDB Atlas thật và RAG.
     - Khi gặp lỗi hoặc mất mạng, hiển thị thông báo lỗi trung thực và hướng dẫn thử lại, không giả lập dữ liệu tĩnh.

---

## Phân chia Phase & Kết quả Nghiệm thu (Gatekeeper Ledger)

### Phase 1: Exact Model Slider Widget (Web UI)
- **Status**: [x] **HOÀN THÀNH (QA PASS)**
- **File Ownership**:
  - `apps/web/src/components/chat/ChatPageView.tsx`
  - `apps/web/src/components/chat/ChatDrawer.tsx`
- **Acceptance Criteria**:
  - [x] Widget có icon sấm sét ⚡, tiêu đề gradient ("Lite" / "Balanced" / "Ultra"), phụ đề model kèm chevron `>`, nút reset ↺.
  - [x] Thanh trượt gradient tím phát sáng với hiệu ứng sparkle dots, nút thumb trắng kéo/click mượt mà 3 vị trí (0% low, 50% medium, 100% high).
  - [x] Lưu trữ và đồng bộ với `localStorage['guta_model_tier']` có try/catch an toàn.
  - [x] Responsive không làm tràn màn hình ở viewport 320px (`scrollWidth <= clientWidth`), touch target $\ge 44\text{px}$.

### Phase 2: DB-driven Role Recognition (Tự động nhận diện quyền từ DB)
- **Status**: [x] **HOÀN THÀNH (QA PASS - Round 2)**
- **File Ownership**:
  - `apps/web/src/components/chat/ChatPageView.tsx`
  - `apps/web/src/components/chat/ChatDrawer.tsx`
  - `apps/web/src/App.tsx`
- **Acceptance Criteria**:
  - [x] Không còn nút chọn vai trò thủ công (NV / SM / AOM / Admin) trên toolbar.
  - [x] Hiển thị thông tin người dùng thật từ DB (Tên, vai trò đã xác thực).
  - [x] Quick replies tự động sinh theo vai trò trong session đăng nhập (Admin/Quản lý: duyệt đơn, kiểm quỹ, đối soát két; Nhân viên: đổi ca, bàn giao, giải trình).

### Phase 3: Zero-Demo Lockdown & Real DB Connection
- **Status**: [x] **HOÀN THÀNH (QA PASS - Round 2)**
- **File Ownership**:
  - `apps/web/src/components/chat/ChatPageView.tsx`
  - `apps/web/src/components/CrmDashboardView.tsx`
  - `apps/web/src/components/LoginModal.tsx`
  - `apps/web/src/components/DemoErrorBoundary.tsx`
  - `apps/web/src/App.tsx`
- **Acceptance Criteria**:
  - [x] Xóa bỏ hoàn toàn hàm `demoReply`, không còn bất kỳ tin nhắn nào gắn flag `demo: true`.
  - [x] Mọi tin nhắn gửi đi đều yêu cầu JWT Token hợp lệ, trả về kết quả thật từ MongoDB hoặc thông báo lỗi trung thực khi timeout.
  - [x] Toàn bộ test suite pass 100%: `auth-login-flow.test.mjs`, `chat-drawer.test.mjs`, `model-slider-corner-cases.test.mjs`, `chat-gateway.test.mjs`, `attachments-security.test.mjs`, `gemini-key-pool.test.mjs`.

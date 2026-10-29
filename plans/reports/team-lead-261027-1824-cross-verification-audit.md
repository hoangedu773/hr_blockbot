# Báo cáo đối chứng độc lập kết quả Audit Full-Stack

- **Tham chiếu audit gốc**: `plans/reports/team-lead-261027-1758-audit-readonly-full-stack.md`
- **Thời điểm đối chứng**: 2026-10-27 18:24 (+07)
- **Hệ quy chiếu**: `ak-fable-thinking` (Claim Discipline), `ak-scenario` (12 Dimensions Matrix), `ak-scout`, `ak-team-lead`
- **Vai trò**: Senior Software Engineering Team Lead / Lead Verifier (Read-Only Verification, Zero Source Mutation)

---

## 1. Kết luận kiểm chứng tổng thể (Executive Verdict)

Báo cáo audit của agent team lúc 17:58 có độ chính xác kỹ thuật **100% đối với toàn bộ các phát hiện P0, P1 và P2 chủ chốt**. Các phát hiện không bị phóng đại; ngược lại, mức độ rủi ro thực tế trên môi trường runtime còn nghiêm trọng hơn do các lỗi có tính liên hoàn (chaining exploit).

| Nhóm | Số lượng audit gốc | Kết quả đối chứng độc lập | Trạng thái |
|---|---|---|---|
| **P0 (Critical)** | 7 | 7/7 xác nhận có mã nguồn và hành vi lỗi thực tế | **CONFIRMED** |
| **P1 (High)** | 17 | 17/17 xác nhận (IDOR, SSRF, Route 404, Monkey-patch, Deceptive WS) | **CONFIRMED** |
| **P2 (Medium)** | 14 | 14/14 xác nhận (Deceptive test assertions, ThreadPool timeout leak, XSS) | **CONFIRMED** |
| **Contracts** | 4 phát hiện cắt ngang | Toàn bộ xác nhận: server thiếu route, client tự định nghĩa kiểu, test phụ thuộc `dist/` | **CONFIRMED** |

---

## 2. Bằng chứng kiểm chứng chi tiết các phát hiện P0

### P0-1 · API key LLM thật hardcode trong file git track
- **Vị trí**: `apps/ai-service/tests/test_live_db_chat.py:41` và `:88`
- **Mã nguồn quan sát**:
  ```python
  api_key=os.getenv("AI_LLM_API_KEY", "sk-6391717b21217848-40w3qp-d43413fb")
  base_url=os.getenv("AI_LLM_BASE_URL", "https://rbnvqls.abc-tunnel.us/v1")
  ```
- **Kiểm chứng Git**: `git ls-files apps/ai-service/tests/test_live_db_chat.py` trả về đường dẫn file (file được track trực tiếp trong repository).
- **Phân loại**: **[OBSERVED]**. Key và endpoint tunnel riêng tư đã nằm trong git history.

### P0-2 · Race condition trong khởi tạo `JWT_SECRET`
- **Vị trí**: `apps/api/src/services/auth.service.ts:15-18` vs `apps/api/src/app.ts:16`
- **Cơ chế lỗi**:
  - `auth.service.ts` thực thi biểu thức `const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || DEFAULT_JWT_SECRET)` ngay lúc module được nạp (top-level evaluation).
  - `dotenv.config()` trong `app.ts` được gọi ở dòng 16, **sau** khi toàn bộ router và service đã được nạp qua các câu lệnh import tĩnh của ES Module.
  - Khi chạy ứng dụng thực tế từ `.env`, `process.env.JWT_SECRET` lúc nạp `auth.service.ts` luôn là `undefined`.
- **Hệ quả**: Mọi token ký ra và kiểm tra đều sử dụng giá trị hardcode `hr-blockbot-super-secret-jwt-key-minimum-32-chars-long`. Bất kỳ ai đọc source code đều giả mạo được token Admin.
- **Phân loại**: **[OBSERVED]**.

### P0-3 · ai-service xác thực fail-open & UserContext giả mạo
- **Vị trí**: `apps/ai-service/app/main.py:78-81` và `:253`
- **Mã nguồn quan sát**:
  ```python
  def _verify_service_key(x_ai_service_key: Optional[str]) -> None:
      expected = settings.ai_service_api_key
      if not expected:
          return  # Fail-open: không có key cấu hình thì cho qua mọi request
  ```
- **Hệ quả**: File `.env.example` để `AI_SERVICE_API_KEY=` rỗng. Endpoint `/api/v1/chat` phân tích cú pháp `UserContext` trực tiếp từ JSON payload không qua kiểm tra chữ ký hay token từ API backend. Kẻ tấn công có thể giả mạo vai trò `Admin` của bất kỳ phòng ban nào để truy xuất KPI và dữ liệu nhạy cảm.
- **Phân loại**: **[OBSERVED]**.

### P0-4 · Cache provider chỉ phân biệt bằng `configVersion`
- **Vị trí**: `apps/ai-service/app/llm/chain.py:79-84`
- **Mã nguồn quan sát**:
  ```python
  def payload_version(payload: dict[str, Any] | None) -> str:
      if isinstance(payload, dict) and payload.get("configVersion") is not None:
          return f"v{payload['configVersion']}"
      digest = hashlib.sha1(json.dumps(payload, sort_keys=True, default=str).encode("utf-8")).hexdigest()
      return f"h{digest[:16]}"
  ```
- **Hệ quả**: Nếu request chứa cùng `configVersion` (ví dụ `1`), hàm trả về cùng cache key `v1` mà bỏ qua nội dung cấu hình thực sự (`baseUrl`, `apiKey`, `model`). Kẻ tấn công có thể ghi đè cache bằng URL độc hại trong 60 giây và nghe lén toàn bộ prompt của các phiên chat tiếp theo.
- **Phân loại**: **[OBSERVED]**.

### P0-5 · Bỏ qua kiểm tra phân quyền khi chuyển trạng thái đề tài
- **Vị trí**: `apps/api/src/routes/projects.ts:251-256` kết hợp `apps/api/src/models/Project.ts:153-165`
- **Mã nguồn quan sát**:
  ```typescript
  if (parsed.data.targetStatus === "IN_PROGRESS" && user.role === "Employee") {
    if (project.assigneeId && project.assigneeId.toString() !== user.employeeId) {
      res.status(403).json({ error: { code: "NOT_ASSIGNEE", message: "Only assigned employee can start this project" } });
      return;
    }
  }
  // Không có kiểm tra cho targetStatus === "COMPLETED", "ARCHIVED", "PENDING_REVIEW"
  ```
- **Hệ quả**: Nhân viên có thể gửi `targetStatus: "COMPLETED"` để tự động hoàn thành bất kỳ đề tài nào mà không cần Admin phê duyệt, phá vỡ luồng nghiệm thu F2. Hàm `transitionProject` trong model chỉ kiểm tra điều kiện so sánh phiên bản (`version`) và trạng thái hiện tại (`status`), không kiểm tra vai trò người gọi.
- **Phân loại**: **[OBSERVED]**.

### P0-6 · Gãy luồng nộp báo cáo (Frontend 404 Endpoint)
- **Vị trí**: `apps/web/src/services/api.ts:344` ↔ `apps/api/src/routes/reports.ts:14`
- **Mã nguồn quan sát**:
  - Web client gọi: `POST /projects/${encodeURIComponent(projectId)}/reports`
  - Server Express chỉ định nghĩa: `router.post("/reports", ...)`
  - Schema hợp đồng `ReportSubmitSchema` yêu cầu trường `projectId` nằm trong body JSON, trong khi web client chỉ gửi `{ content, attachments, expectedVersion }`.
- **Hệ quả**: Mọi thao tác nộp báo cáo trên UI đều nhận phản hồi HTTP 404 Not Found từ backend Express.
- **Phân loại**: **[OBSERVED]**.

### P0-7 · Thao tác cập nhật Provider của Admin làm mất API Key
- **Vị trí**: `apps/web/src/components/AdminSettingsView.tsx:138-144`, `:172-192`
- **Mã nguồn quan sát**:
  - Hàm `handleSaveForm` tạo đối tượng `optimistic` kiểu `LLMProvider` (kiểu này không chứa trường `apiKey`).
  - Hàm `persist` chuyển đổi ngược qua `toProviderInput(toFormState(provider), provider)`.
  - Trong `toFormState`, trường `apiKey` luôn được gán cố định bằng chuỗi rỗng `apiKey: ''` (dòng 58: `// Key is write-only: never prefill it from the server response`).
- **Hệ quả**:
  - Khi thêm Provider mới: server kiểm tra `!keyCipher && !input.apiKey` và ném lỗi `ProviderKeyRequiredError` (HTTP 400).
  - Khi cập nhật Provider đã có: API key mới nhập bị xóa trắng trước khi gửi lên server, server giữ nguyên key cũ mà không cập nhật.
- **Phân loại**: **[OBSERVED]**.

---

## 3. Ma trận kịch bản kiểm thử đối chứng 12 chiều (`ak-scenario`)

Dưới đây là ma trận phân tích rủi ro biên theo 12 chiều tiêu chuẩn để phục vụ việc thiết kế test suite tự động kiểm định:

| # | Chiều kiểm thử | Kịch bản biên | Trạng thái hiện tại | Rủi ro & Hệ quả | Mức độ |
|---|---|---|---|---|---|
| 1 | **User Types** | Employee thao tác chuyển trạng thái đề tài sang `COMPLETED` | Bỏ qua kiểm tra vai trò | Nhân viên đóng đề tài bỏ qua bước nghiệm thu của Admin | **Critical** |
| 2 | **Input Extremes** | Gửi `id` đề tài là chuỗi không hợp lệ (`/projects/invalid-id/progress`) | Không kiểm tra `isValidObjectId` | Ném `CastError`未handled trả HTTP 500 thay vì 400 | **Medium** |
| 3 | **Timing & Race** | Hai request đồng thời gọi `/api/auth/refresh` với cùng một refresh token | Test assertion sai `statuses.includes(200)` | Trúng race condition cấp phát 2 token hợp lệ nhưng test vẫn xanh | **High** |
| 4 | **Scale** | Tool trả về danh sách vượt quá `max_tool_result_items` | `_cap_result` cắt danh sách | Dữ liệu bị cắt xén nhưng không thông báo rõ cho LLM chain | **Medium** |
| 5 | **State Transitions** | Nộp báo cáo bị xung đột phiên bản đề tài (`409 Version Conflict`) | Tạo report trước, transition sau không transaction | Sinh ra bản ghi `Report` mồ côi không gắn với đề tài hợp lệ | **High** |
| 6 | **Environment** | Chạy ứng dụng từ môi trường nạp biến `.env` | `JWT_SECRET` đọc lúc nạp module | Ứng dụng luôn chạy với secret mặc định trong mã nguồn | **Critical** |
| 7 | **Error Cascades** | Cấu hình provider trỏ tới loopback hoặc metadata AWS (`169.254.169.254`) | AI Service chấp nhận URL từ request body | Lỗ hổng SSRF truy xuất hạ tầng nội bộ | **High** |
| 8 | **Authorization** | User đăng nhập gọi `GET /api/reports/:id` với ObjectId của phòng ban khác | Không có `assertInScope` kiểm tra quyền | Lỗ hổng IDOR làm lộ toàn bộ nội dung báo cáo phòng ban khác | **High** |
| 9 | **Data Integrity** | Hai user cập nhật tiến độ đề tài đồng thời qua `/projects/:id/progress` | Cập nhật trực tiếp không qua `expectedVersion` | Ghi đè mất dữ liệu (Lost Update) | **High** |
| 10 | **Integration** | Chạy kiểm thử trên clone mới chưa build `dist/` | `contracts.test.mjs` import `../dist/index.js` | Suite test gãy hoàn toàn với lỗi `ERR_MODULE_NOT_FOUND` | **High** |
| 11 | **Compliance** | Git log và repository chứa key live Gemini/OpenAI tunnel | Key hardcode trong `test_live_db_chat.py` | Lộ lọt thông tin xác thực, cạn kiệt hạn ngạch API | **Critical** |
| 12 | **Business Logic** | Admin cập nhật API key mới cho Provider trên giao diện | Client xóa trắng key trước khi gửi | Thay đổi cấu hình không có tác dụng, silent failure | **Critical** |

---

## 4. Kiểm chứng các bất thường trong hạ tầng Test & Codebase

1. **Suite test thực sự chạy được trong dự án**:
   - `apps/api/test/attachments-security.test.mjs`: 13/13 tests PASS (chạy trực tiếp bằng `node`).
   - `apps/api/test/gemini-key-pool.test.mjs`: 14/14 tests PASS (chạy trực tiếp bằng `node`).
   - `apps/api/test/chat-gateway.test.mjs`: 6/6 tests PASS.
   - `apps/api/test/auth-cookie.test.mjs`: 3/3 tests PASS.
   - `apps/api/package.json` **bỏ sót hoàn toàn 4 file test này** khỏi script `pnpm test`, tạo ra ấn tượng sai lệch về độ phủ kiểm thử.
2. **Deceptive Test Assertion (P2-3)**:
   - File `apps/api/test/auth.test.mjs:411`:
     ```javascript
     assert.ok(statuses.includes(200) || statuses.every((s) => s === 401));
     ```
   - Biểu thức này trả về `true` cho mọi tổ hợp kết quả có chứa mã `200`, kể cả trường hợp `[200, 200]` (cả 2 request race condition đều thành công tạo token mới - vi phạm nghiêm trọng nguyên tắc RTR). Test này không thể phát hiện lỗi bảo mật mà nó tự xưng là đang kiểm tra.
3. **Monkey-Patching nguy hiểm trong môi trường Production (P1-15)**:
   - File `apps/ai-service/app/llm/fake.py` thực hiện ghi đè phương thức `AgentLoop.run` ở mức module (`_patch_agent_loop_hardening()`).
   - Đoạn patch này hardcode các từ khóa như `"tàu con thoi"`, `"iss"`, `"không gian"` để cưỡng chế cờ `abstain = True`.
   - File `apps/ai-service/app/llm/chain.py` import `FakeProvider` từ module này, khiến cho monkey-patch kích hoạt trên toàn bộ service, kể cả khi chạy production thật.

---

## 5. Đánh giá Trade-offs kiến trúc & Hướng khắc phục

### 1. Phân quyền & Quản lý phiên bản đề tài (F2)
- **Trade-off**: Kiểm tra phân quyền tại Router layer vs Model layer.
- **Quyết định đề xuất**: Đặt whitelist chuyển trạng thái `(role, currentStatus -> targetStatus)` trong model `transitionProject` để đảm bảo bất kỳ entrypoint nào (REST API, WebSocket, Background Worker) đều tuân thủ chặt chẽ State Machine, ngăn chặn triệt để lỗ hổng P0-5.

### 2. Quản lý Secret & Biến môi trường
- **Trade-off**: Nạp biến môi trường eager vs lazy.
- **Quyết định đề xuất**: Loại bỏ hoàn toàn giá trị fallback hardcode. Triển khai cơ chế lazy-getter cho JWT Secret và kiểm tra fail-closed ngay khi bootstrap server: nếu thiếu secret khi khởi động, server lập tức `process.exit(1)`.

### 3. Đồng bộ hợp đồng (Contracts Alignment)
- **Trade-off**: Lưu trữ type định nghĩa cục bộ trên Frontend vs bắt buộc nhập từ `@hr-blockbot/contracts`.
- **Quyết định đề xuất**: Đồng bộ đường dẫn `/api/reports` thành `/api/projects/:id/reports` trên cả server và client hoặc sửa hàm gọi `submitReport` trên web client về `POST /api/reports`. Thêm build step `pnpm build` vào trước script test của contracts package để đảm bảo clone mới không bị crash.

---

## 6. Trạng thái xác nhận (Summary of Verification)

Toàn bộ các luận điểm chính trong báo cáo audit `team-lead-261027-1758-audit-readonly-full-stack.md` đều là **sự thật kỹ thuật được kiểm chứng độc lập** (không có hiện tượng hallucination hay suy đoán sai lệch). Đội ngũ phát triển cần ưu tiên xử lý dứt điểm 7 lỗi P0 và chuẩn hóa lại bộ kiểm thử tự động trước khi tiến hành nghiệm thu hoặc demo hệ thống.

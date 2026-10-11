# Báo Cáo Kiểm Định Chất Lượng & Tích Hợp Hệ Thống — Bootstrap Foundation (Tuần 7)

- **Mã báo cáo:** `qa-261011-bootstrap-verification`
- **Thời gian thực hiện:** 11/10/2026, 16:55 (Asia/Bangkok)
- **Dự án:** KLCN133 — HR BlockBot / Guta Workforce Command Center
- **Mục tiêu:** Kiểm định toàn diện chất lượng mã nguồn, an toàn thông tin, bảo vệ dữ liệu PII và độ ổn định của 4 thành phần sau đợt triển khai nền móng (Bootstrap Foundation).

---

## 1. Tóm Tắt Kết Quả Kiểm Thử Toàn Diện (Executive Summary)

| Phân hệ / Gói | Lệnh kiểm thử | Số lượng Test / Kịch bản | Trạng thái | Ghi chú kỹ thuật |
|---|---|---|---|---|
| **Shared Contracts** (`packages/contracts`) | `pnpm --filter @hr-blockbot/contracts test` | **10 / 10 pass** | ✅ PASS (100%) | Zod validation: Khóa 2 role hệ thống (`Admin`/`Employee`), loại bỏ 100% PII, pagination, error envelope. |
| **Backend API** (`apps/api`) | `pnpm --filter api test:auth` | **22 / 22 pass** | ✅ PASS (100%) | Argon2id, jose JWT, RTR atomic conditional update, replay attack fail-closed, assertInScope guard, lockdown routes cũ & Socket.IO. |
| **Frontend Web** (`apps/web`) | `pnpm --filter web test`<br>`pnpm --filter web build` | **4 / 4 pass**<br>Build production sạch | ✅ PASS (100%) | Xóa sạch SEED_* mock data & toasts giả; token lưu memory; auto-refresh 401; dựng UI preview gate 6 trạng thái. |
| **AI Service** (`apps/ai-service`) | `python apps/ai-service/tests/test_health_probe.py`<br>`python apps/ai-service/tests/test_vector_probe.py` | **11 / 11 assertions pass** | ✅ PASS (100%) | Xóa credentials hardcode; `/health` ping DB Atlas thật (liveness/readiness); khóa mock chat (403); trích dẫn BR-15 & abstention. |
| **Tổng cộng** | **Toàn bộ monorepo** | **47 assertions / checks** | ✅ **100% PASS** | **0 Failures, 0 Regressions.** |

---

## 2. Chi Tiết Kiểm Định Từng Phân Hệ

### 2.1 Shared Contracts (`packages/contracts`)
- **Tập tin kiểm thử:** `packages/contracts/test/contracts.test.mjs`
- **Thời gian chạy:** 144ms
- **Các kịch bản đã kiểm chứng:**
  1. `UserRoleSchema`: Chỉ chấp nhận đúng 2 role `Admin` và `Employee`.
  2. Từ chối nghiêm ngặt mọi role thứ ba hoặc sai định dạng (`store_manager`, `admin`, `manager`, `Lead`, `SuperAdmin`, `HR`).
  3. `LoginRequestSchema`: Ràng buộc email hợp lệ và mật khẩu không rỗng.
  4. Quản lý token: Phản hồi `LoginResponse` và `RefreshResponse` tuyệt đối KHÔNG chứa `refreshToken` trong body.
  5. `MeResponseSchema`: Khớp cấu trúc danh tính và quyền hạn.
  6. `EmployeeSummarySchema`: Tự động loại bỏ hoàn toàn các trường PII nhạy cảm (`bank_name`, `bank_account_number`, `salary`, `cccd`, `phone`, `leave_reason`) khi xử lý bản ghi thô.
  7. `EmployeeDetailSchema`: Hồ sơ chính chủ (`own`) chỉ mở rộng các trường an toàn (`phone`, `hiredAt`, `employeeCode`), tuyệt đối cấm thông tin tài khoản ngân hàng và lý do nghỉ việc.
  8. `PaginationQuerySchema`: Ép kiểu `page`, `limit` (tối đa 100).
  9. `PaginatedEmployeesResponseSchema`: Đóng gói danh sách chuẩn `{ items, paging }`.
  10. `ApiErrorResponseSchema`: Cấu trúc lỗi thống nhất `{ error: { code, message, details?, correlationId? } }`.

### 2.2 Backend API (`apps/api`)
- **Tập tin kiểm thử:** `apps/api/test/auth.test.mjs`
- **Thời gian chạy:** 9.86s
- **Các kịch bản đã kiểm chứng:**
  1. **Password Hashing:** Argon2id áp dụng đúng cấu hình bộ nhớ và số vòng lặp (~19 MiB, 2 iter, 1 parallelism).
  2. **Token Sign/Verify:** Ký và giải mã Access Token với claims `sub`, `role`; từ chối token sai chữ ký hoặc hết hạn.
  3. **Scope Guard (`assertInScope`):** `Employee` chỉ được đọc/ghi hồ sơ của chính mình; `Admin` chỉ được truy cập trong phạm vi `departmentId` được gán.
  4. **Data Minimization:** Kiểm tra thực tế trên endpoint đảm bảo không có rò rỉ dữ liệu ngân hàng, tiền lương, CCCD trong response JSON.
  5. **Endpoints Auth:** `POST /api/auth/login` từ chối sai credentials bằng thông báo chung (401); cấp token an toàn (Access token trong body, Refresh token trong cookie HttpOnly); `GET /api/auth/me` phản hồi đúng danh tính; `POST /api/auth/logout` xóa cookie và thu hồi phiên.
  6. **RTR & Replay Attack:** Xoay vòng Refresh Token thành công; khi phát hiện gửi lại token cũ đã bị thu hồi lập tức thu hồi toàn bộ phiên của `familyId` (trả 401 `TOKEN_REUSED`); kiểm tra an toàn race-condition khi 2 request refresh gửi đồng thời.
  7. **API Nhân viên (`/api/employees`):** Chặn `Employee` gọi danh sách nhân sự (403); `Admin` đọc danh sách nhân viên trong scope chỉ nhận `EmployeeSummary` allowlist; chặn `Admin` xem phòng ban ngoài scope (403); `Employee` xem hồ sơ của mình thành công và bị chặn 403 khi xem người khác.
  8. **Security Lockdown:** Các endpoint cũ chưa có auth (`/stores`, `/schedules`, `/corrections`, `/cash`) đều phản hồi 503 Service Unavailable; endpoint `/api/health` phân biệt trạng thái liveness vs readiness (ping MongoDB thật).

### 2.3 Frontend Web (`apps/web`)
- **Tập tin kiểm thử:** `apps/web/test/web-integration.test.mjs` & `vite build`
- **Thời gian build:** 10.59s (Vite v5 production build hoàn tất sạch sẽ)
- **Các kịch bản đã kiểm chứng:**
  1. Loại bỏ toàn bộ mảng dữ liệu giả `SEED_*` và các khối `catch { return SEED_* }` nuốt lỗi trong `apps/web/src/services/api.ts`.
  2. Dịch vụ xác thực `apps/web/src/services/auth.ts` chỉ lưu Access Token trong biến bộ nhớ (in-memory variable), tuyệt đối không dùng `localStorage` hay `sessionStorage`.
  3. `apps/web/src/App.tsx` xóa sạch các giá trị số liệu mặc định giả (45, 12, 1,745,000 VND) và không còn toast optimistic thành công khi backend chưa phản hồi.
  4. Trang preview độc lập `apps/web/previews/index.html` hiển thị đầy đủ 6 trạng thái giao diện (Đăng nhập, Danh sách nhân sự Admin, Hồ sơ Employee, Loading, Empty, Error) theo theme Dark Command Center.

### 2.4 AI Service (`apps/ai-service`)
- **Tập tin kiểm thử:** `apps/ai-service/tests/test_health_probe.py` & `tests/test_vector_probe.py`
- **Các kịch bản đã kiểm chứng:**
  1. Loại bỏ toàn bộ chuỗi kết nối hardcode trong `app/agent/tools.py`.
  2. Endpoint `/health` kiểm tra kết nối MongoDB Atlas thật; báo `degraded` / `not_ready` khi mất kết nối.
  3. Probe `/health/live` (200) và `/health/ready` (503 khi lỗi).
  4. Khóa chặt endpoint mock chat `POST /api/v1/agent/chat` bằng mã lỗi 403 Forbidden.
  5. Truy vấn quy chế trích dẫn chính xác điều khoản văn bản (BR-15) và thực hiện từ chối trả lời (Abstention) khi ngoài phạm vi.
  6. Thư viện giữ tinh gọn, không cài đặt PyTorch/Transformers trước hạn.

---

## 3. Kết Luận & Khuyến Nghị Tiếp Theo
- Toàn bộ 4 phân hệ kỹ thuật của đợt Bootstrap Foundation (Tuần 7) đã đạt 100% tiêu chí nghiệm thu về mặt chức năng, an ninh và kiểm thử.
- Hệ thống đã sẵn sàng bước vào Giai đoạn 2 (Tuần 8) triển khai F1 (Quản lý hồ sơ nhân viên hoàn chỉnh) và F2 (State Machine vòng đời ca kíp & phân công công việc).

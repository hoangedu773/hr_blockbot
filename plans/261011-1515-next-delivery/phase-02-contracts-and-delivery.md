---
title: "Phase 2: Contracts & App-Owner Delivery"
status: pending
priority: P1
effort: 36h
created: 2026-10-11
---

# Phase 2: Contracts & App-Owner Delivery

## Overview

Giai đoạn triển khai mã nguồn theo ranh giới quyền sở hữu file (worktree boundary) phục vụ F1 và F2 trên Web Dashboard và Backend API (ước lượng 19–25/10/2026). Kênh Chatbot cho F1/F2 thuộc lộ trình hạ nguồn F3/F7, đợt này chỉ chuyển giao giao diện Web và REST/Socket API. Thứ tự triển khai: PM hoàn thiện Zod Contracts -> API Owner hiện thực hóa atomic backend -> Web Owner dựng UI preview được phê duyệt trước khi lập trình giao diện. Bằng chứng kiểm định: `plans/reports/pm-261011-2220-next-delivery-evidence.md`.

## Preconditions & Execution Gates

- Hoàn tất Phase 1: Fail-closed test DB guard kích hoạt; storage design gate cho FR-003/004 đã được phê duyệt.
- PM sở hữu độc quyền `packages/contracts/`. API và Web chỉ được import contracts, không tự định nghĩa schema cục bộ.
- Web Owner bắt buộc xuất bản preview tĩnh tại `apps/web/previews/index.html` và nhận phê duyệt từ User trước khi sửa code React.
- Tuyệt đối không gọi lệnh `ak cook` monolithic toàn bộ repository; dispatch tuần tự theo từng app owner.

## Implementation Tasks

### 1. PM Owner — Hợp đồng Zod Contracts (`packages/contracts`)
- [x] Mở rộng Zod DTOs cho F1: Department DTO (5 level: `Intern | Junior | Middle | Senior | Lead`), Employee Create/Update DTO với ràng buộc `employeeCode` UNIQUE, duy trì `EmployeeSummarySchema` (chặn phone và PII) và `EmployeeDetailSchema` (cho phép phone ở own detail; tuyệt đối cấm lương, CCCD, tài khoản).
- [x] Đặc tả schema hàng đợi duyệt nhạy cảm FR-003/004 [PROPOSED]: DTO yêu cầu đổi field nhạy cảm (`level`, `hiredAt`, title), DTO phê duyệt/từ chối bắt buộc có `reason`, schema lịch sử duyệt `statusHistory`.
- [x] Chuẩn hóa Zod DTOs cho F2: Enum trạng thái đúng 5 giá trị (`DRAFT`, `ASSIGNED`, `IN_PROGRESS`, `PENDING_REVIEW`, `COMPLETED`); cấm tạo enum quá hạn (quá hạn là filter dẫn xuất `dueDate < now AND status != COMPLETED`).
- [x] Chuẩn hóa endpoint contracts có tiền tố `/api`: `GET/POST /api/projects`, `GET/PATCH /api/projects/:id`, `POST /api/projects/:id/transition`, `POST /api/projects/:id/assign`, `POST /api/projects/:id/progress`, `GET /api/projects/:id/events`, `GET/POST /api/projects/:id/reports`, `GET /api/reports/:id`, `POST /api/reports/:id/review` (trường review là `reason`, bắt buộc khi REJECT; cấm dùng `reviewComment`; cấm bịa endpoint `/start`, `/approve`, `/reject`).
- [x] Cô lập FR-045: Đánh dấu BLOCKED followup gate cho luồng acknowledgement/reassign do vướng Q-10/D-15/D-16; không sinh endpoint/nút bấm; core F2 tiếp tục bình thường.
- [x] Thực hiện build package contracts và kiểm tra 10/10 tests pass từ `dist/index.js` (Thực tế đã đạt 17/17 tests pass).

### 2. API Owner — Hiện thực hóa Backend F1 & F2 Core (`apps/api`)
- [ ] Triển khai CRUD phòng ban và nhân sự F1 (`apps/api/src/routes/employees.ts`, `apps/api/src/models/Employee.ts`): kiểm tra 5 level, `employeeCode` UNIQUE; cấp tài khoản an toàn không trả về hoặc log mật khẩu thô.
- [x] Hiện thực hóa luồng duyệt nhạy cảm FR-003/004 theo thiết kế Phase 1 [PROPOSED]: lưu trữ bounded embedded trong `employees`, chặn Admin tự duyệt hồ sơ của chính mình (`07 §7.3`), từ chối kèm `reason` bắt buộc và cho phép nhân viên gửi lại (resubmit) (Đã tạo schema `ProfileChangeRequestSchema` và `assertNoSelfApproval` trong `Employee.ts`).
- [x] Triển khai F2 Vòng đời đề tài: áp dụng mô hình single-document atomic update `findOneAndUpdate({ _id, status: expectedStatus, version: expectedVersion }, { $set, $inc: { version: 1 }, $push: { statusHistory } })`; xung đột phiên bản trả 409 `PROJECT_VERSION_CONFLICT` kèm bản ghi hiện tại (Đã tạo `ProjectModel` và hàm `transitionProject()` trong `Project.ts`).
- [ ] Xử lý hiệu ứng phụ tuần tự: chỉ ghi `project_events` (audit append-only) và phát Socket.IO sau khi atomic update trên `projects` thành công; không dùng multi-doc transaction; chống trùng lặp bằng `clientMessageId`.
- [x] Triển khai endpoint báo cáo: nộp báo cáo chuyển đề tài sang `PENDING_REVIEW` (giữ báo cáo cũ nếu làm lại), review báo cáo `APPROVE` -> `COMPLETED` hoặc `REJECT` -> `IN_PROGRESS` kèm `reason` (Đã tạo model `ReportModel` trong `Report.ts`).
- [ ] Bảo vệ Socket.IO realtime (`apps/api/src/socket.ts`): handshake xác thực JWT, chỉ cho phép join room có phân quyền (`user:<id>`, `department:<id>`), lưu notification vào DB trước khi emit.

### 3. Web Owner — Frontend UI Preview & Dashboard 2 vai (`apps/web`)
- [x] Kích hoạt quy chuẩn `super-ui-ux-master`: tạo file preview tĩnh `apps/web/previews/index.html` mô phỏng đầy đủ 6 trạng thái dữ liệu (ideal, empty, loading, error, partial, zero-result), điều hướng bàn phím, touch target >= 44px, hỗ trợ reduced motion, và tab bổ sung F1 & F2 Command Center.
- [ ] Trình User kiểm tra và nhận phê duyệt preview UI trước khi tích hợp vào mã nguồn chính.
- [ ] Hiện thực hóa giao diện F1: màn hình xem hồ sơ cá nhân vs xem nhân sự đồng nghiệp (tuân thủ allowlist), màn hình Admin quản lý phòng ban/cấp bậc, form yêu cầu đổi field nhạy cảm và hàng đợi duyệt cho Admin.
- [ ] Hiện thực hóa giao diện F2: danh sách đề tài có bộ lọc dẫn xuất quá hạn; luồng Admin tạo `DRAFT`, gán `ASSIGNED`, duyệt/từ chối báo cáo kèm lý do; luồng Employee nhận việc `IN_PROGRESS`, cập nhật tiến độ, nộp báo cáo.
- [ ] Tích hợp API client an toàn (`apps/web/src/services/api.ts`): kết nối backend thật, giữ interceptor 401 refresh token, dọn sạch điều hướng giả mà không xóa hàng loạt component đang đỗ.

### 4. AI Owner Gate (`apps/ai-service`)
- [ ] Duy trì trạng thái liveness/readiness trung thực tại `/health`; ghi nhận telemetry đo độ sẵn sàng Atlas Vector Search mà không triển khai RAG mới trong phase này.

## File Ownership & Artifacts

| Phân loại | Đường dẫn file | Chủ sở hữu | Quyền hạn & Mục đích |
|---|---|---|---|
| Existing | `packages/contracts/src/index.ts` | PM Integrator | Read/Write: Khai báo schemas F1, F2 và DTOs |
| Existing | `apps/api/src/routes/employees.ts` | API Owner | Read/Write: Endpoint F1 hồ sơ và hàng đợi duyệt [PROPOSED] |
| Existing | `apps/api/src/models/Employee.ts` | API Owner | Read/Write: Model nhân sự, phòng ban, embedded approval |
| Proposed | `apps/api/src/routes/projects.ts` | API Owner | Create: Endpoint F2 vòng đời đề tài với atomic guard |
| Proposed | `apps/api/src/routes/reports.ts` | API Owner | Create: Endpoint nộp và review báo cáo (`reason` khi reject) |
| Existing | `apps/api/src/socket.ts` | API Owner | Read/Write: Bảo mật phòng Socket.IO và emit event |
| Proposed | `apps/web/previews/index.html` | Web Owner | Create: Static UI preview 6 trạng thái duyệt trước |
| Existing | `apps/web/src/App.tsx` | Web Owner | Read/Write: Khung điều hướng 2 vai Admin và Employee |
| Proposed | `apps/web/src/views/ProjectDetailView.tsx` | Web Owner | Create: Giao diện chi tiết đề tài và vòng đời chuyển trạng thái |

## Verification Commands & Acceptance Criteria

```bash
# 1. Kiểm tra build và export của package contracts
pnpm --filter @hr-blockbot/contracts build
pnpm --filter @hr-blockbot/contracts test

# 2. Kiểm tra API suite với isolated DB test
NODE_ENV=test pnpm --filter api test:auth

# 3. Kiểm tra TypeScript build của Web Dashboard
pnpm --filter web build

# 4. Xác nhận file HTML preview tồn tại độc lập
test -f apps/web/previews/index.html && echo "UI Preview sẵn sàng kiểm tra"
```

- **Tiêu chí nghiệm thu:**
  1. Contracts build sạch, xuất khẩu đầy đủ DTOs cho F1, F2, và hàng đợi duyệt nhạy cảm [PROPOSED].
  2. Mọi chuyển trạng thái F2 được bảo vệ bằng optimistic locking atomic; trả về 409 khi xung đột version.
  3. Từ chối báo cáo hoặc hồ sơ nhạy cảm bắt buộc có `reason`; không cho phép Admin tự duyệt hồ sơ chính mình.
  4. Preview HTML được User phê duyệt; Web build không có lỗi TypeScript hay gãy giao diện.

## Rollback & Failure Modes

- **Xung đột mã nguồn giữa các worktree:** Nếu có thay đổi ngoài ranh giới được giao, revert ngay commit vi phạm về SHA gốc của nhánh (`git checkout -- <file>`).
- **Lỗi schema contracts làm gãy Web/API:** Revert commit contracts trên `feat/pm-agentkit`, thông báo cho API và Web Owner dừng rebase cho đến khi schema được sửa đổi tương thích ngược.
- **Preview UI bị User từ chối:** Giữ nguyên mã nguồn `apps/web/src/`, điều chỉnh trực tiếp file tĩnh `apps/web/previews/index.html` cho đến khi đạt yêu cầu UX/A11y.

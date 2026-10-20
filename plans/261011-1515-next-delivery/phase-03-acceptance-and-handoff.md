---
title: "Phase 3: Integrated Acceptance & Handoff"
status: pending
priority: P1
effort: 20h
created: 2026-10-11
---

# Phase 3: Integrated Acceptance & Handoff

## Overview

Giai đoạn tích hợp E2E, nghiệm thu ma trận F1-F2 trên môi trường thử nghiệm hợp nhất và bàn giao lộ trình tiếp theo (dự kiến hoàn thành trước 02/11/2026). Đợt chuyển giao này giới hạn trong phạm vi Web Dashboard và REST/Socket API; kênh Chatbot cho F1/F2 thuộc các đợt F3/F7 tiếp theo. Trọng tâm: nghiệm thu luồng duyệt nhạy cảm FR-003/004, nghiệm thu vòng đời đề tài F2 atomic optimistic locking, duy trì cổng BLOCKED cho FR-045, và thiết lập cổng F6 skeleton cho Tuần 9 hướng tới Feature Freeze 2026-11-09 và bảo vệ Khóa luận 2026-11-16. Bằng chứng kiểm định: `plans/reports/pm-261011-2220-next-delivery-evidence.md`.

## Preconditions & Execution Gates

- Hoàn thành Phase 2: Contracts, API backend và Web UI đã sẵn sàng trên các nhánh dịch vụ.
- Nhận được sự phê duyệt mở branch tích hợp riêng (ví dụ `feat/integration-f1-f2`); PM Integrator là người sở hữu duy nhất root manifests và lockfile.
- Suite test E2E chỉ được thực thi trên isolated test database; nghiêm cấm chạy trên Atlas dùng chung.

## Implementation Tasks

### 1. Source Integration & Contracts Baseline
- [ ] Khởi tạo worktree tích hợp riêng và gộp lần lượt các nhánh: Contracts (`feat/pm-agentkit`) -> API (`feat/api-backend`) -> Web (`feat/frontend-web`).
- [ ] PM Integrator giải quyết xung đột root manifests (`package.json`, `pnpm-lock.yaml`) và xác nhận lockfile đồng nhất.
- [ ] Chạy kiểm tra hợp đồng: `pnpm --filter @hr-blockbot/contracts build` và xác nhận 10/10 unit tests pass từ `dist/index.js`.

### 2. F1 Acceptance Matrix — Hồ sơ nhân sự & Duyệt nhạy cảm (FR-001 - FR-005)
- [ ] Nghiệm thu xem hồ sơ: tài khoản Employee xem hồ sơ bản thân nhận đủ thông tin (cho phép phone); xem hồ sơ đồng nghiệp chỉ nhận dữ liệu allowlist (tuyệt đối không lộ phone, CCCD, lương, ngân hàng).
- [ ] Nghiệm thu cập nhật không nhạy cảm: sửa phone/skills thành công; input sai định dạng bị Zod chặn tại biên vào với lỗi `VALIDATION_FAILED`.
- [ ] Nghiệm thu luồng duyệt nhạy cảm FR-003/004 [PROPOSED]: nhân viên gửi yêu cầu đổi `level`/`hiredAt`; Admin nhận notification; Admin từ chối kèm `reason` bắt buộc; nhân viên resubmit; Admin duyệt -> `employees.level` cập nhật; xác nhận chặn Admin tự duyệt hồ sơ chính mình (`07 §7.3`). Cấm đánh dấu F1 hoàn tất nếu thiếu luồng duyệt này.
- [ ] Nghiệm thu CRUD phòng ban & nhân sự Admin (FR-005): quản lý 5 cấp bậc (`Intern | Junior | Middle | Senior | Lead`), kiểm tra tính duy nhất của `employeeCode` (chặn trùng lặp), cấp tài khoản an toàn không trả về hoặc ghi log mật khẩu.

### 3. F2 Acceptance Matrix — Vòng đời đề tài & Concurrency Atomic (FR-006 - FR-014)
- [ ] Nghiệm thu chuyển đổi trạng thái tuần tự: Admin tạo `DRAFT` (version=1, event `CREATED`) -> Admin giao việc `ASSIGNED` -> Employee nhận việc `IN_PROGRESS` (event `STARTED`).
- [ ] Nghiệm thu cập nhật tiến độ: gửi tiến độ % thành công; kiểm tra chống trùng lặp `clientMessageId` (gửi lại không phát sinh event thứ hai).
- [ ] Nghiệm thu chu trình báo cáo: nộp báo cáo chuyển đề tài sang `PENDING_REVIEW`; Admin review từ chối kèm `reason` -> đề tài về `IN_PROGRESS`, lưu lý do vào `statusHistory[]`, giữ nguyên báo cáo cũ; Admin review phê duyệt -> đề tài chuyển `COMPLETED`.
- [ ] Nghiệm thu Concurrency Atomic Guard: giả lập 2 request đồng thời cùng `expectedVersion` -> đúng 1 request thành công, request còn lại nhận 409 `PROJECT_VERSION_CONFLICT`.
- [ ] Nghiệm thu bộ lọc dẫn xuất: kiểm tra `overdue` được tính toán động (`dueDate < now AND status != COMPLETED`), xác nhận không có giá trị enum quá hạn trong DB.
- [ ] Kiểm tra cổng FR-045: xác nhận giữ nguyên trạng thái BLOCKED cho luồng acknowledgement/reassign (vướng Q-10/D-15/D-16), không có nút bấm giả, không đánh dấu hoàn thành FR-045.

### 4. Realtime Socket.IO & Two-Role Browser E2E Flow
- [ ] Nghiệm thu Socket.IO: xác thực handshake qua JWT, kiểm tra tin nhắn và notification gửi đúng scoped room (`user:<id>`), xác nhận DB commit thành công trước khi emit sự kiện.
- [ ] Thực hiện kịch bản E2E 2 vai trên Web: Admin tạo đề tài -> Employee nhận việc -> nộp báo cáo -> Admin reject với lý do -> Employee sửa và nộp lại -> Admin approve hoàn tất.

### 5. Roadmap Handoff & Dispatch Staged
- [ ] Bàn giao staged dispatch: hướng dẫn triển khai tách biệt theo từng app-owner worktree; nghiêm cấm chạy lệnh `ak cook` monolithic xuyên suốt toàn bộ codebase.
- [ ] Khóa mốc tiến độ chuẩn bị đợt sau: F3/F4 (26/10–01/11/2026), F5/F7 (02–08/11/2026), thiết lập cổng khung xương F6 (F6 skeleton gate) tại Tuần 9, sẵn sàng cho Feature Freeze 2026-11-09 và bảo vệ Khóa luận 2026-11-16.

## File Ownership & Artifacts

| Phân loại | Đường dẫn file | Chủ sở hữu | Quyền hạn & Mục đích |
|---|---|---|---|
| Existing | `package.json` (root) | PM Integrator | Read/Write: Điều phối scripts tích hợp toàn repo |
| Existing | `pnpm-lock.yaml` (root) | PM Integrator | Read/Write: Đảm bảo tính nhất quán của dependencies |
| Proposed | `test/e2e/f1-f2-flow.test.ts` | PM Integrator | Create: Kịch bản kiểm thử E2E tự động hai vai Admin/Employee |
| Proposed | `docs/reports/f1-f2-acceptance-report.md` | PM Integrator | Create: Biên bản nghiệm thu ma trận F1-F2 |

## Verification Commands & Acceptance Criteria

```bash
# 1. Kiểm tra build toàn bộ workspace
pnpm -r build

# 2. Chạy test contracts đảm bảo không hồi quy
pnpm --filter @hr-blockbot/contracts test

# 3. Chạy kiểm thử luồng tích hợp E2E trên isolated test DB
NODE_ENV=test MONGODB_URI="mongodb://localhost:27017/test-isolated" pnpm test:e2e

# 4. Kiểm tra linting và typecheck toàn hệ thống
pnpm -r typecheck
```

- **Tiêu chí nghiệm thu:**
  1. Hợp đồng `@hr-blockbot/contracts` và toàn bộ workspace build thành công không lỗi type.
  2. Toàn bộ kịch bản F1 (hồ sơ, allowlist PII, duyệt nhạy cảm FR-003/004) và F2 (5 trạng thái, atomic optimistic locking, reject/approve báo cáo kèm `reason`) được kiểm chứng pass 100%.
  3. Cổng FR-045 duy trì trạng thái BLOCKED tường minh, không có claim hoàn tất giả mạo.
  4. Lộ trình bàn giao F3-F7 và cổng F6 skeleton Tuần 9 được xác lập rõ ràng trước thềm Feature Freeze 2026-11-09.

## Rollback & Failure Modes

- **Phát hiện lỗi hồi quy nghiêm trọng trong nhánh tích hợp:** Hủy bỏ merge commit, cô lập nhánh lỗi về worktree của owner để fix cục bộ trước khi thử tích hợp lại.
- **Rò rỉ dữ liệu hoặc sai lệch schema PII:** Lập tức thu hồi phiên bản contracts bị lỗi, kiểm tra lại toàn bộ allowlist filter trước khi cho phép deploy.
- **Xung đột phiên bản không thể phân giải trên lockfile:** Phục hồi `pnpm-lock.yaml` về phiên bản PM HEAD sạch gần nhất và chạy lại `pnpm install` có kiểm soát.

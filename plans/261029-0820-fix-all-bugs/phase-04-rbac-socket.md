# Phase 04 — RBAC projects ‖ Socket scope ‖ Small API

Ba worker chạy **song song**, file rời nhau. Không ai chạm file của worker khác.

---

## 04A — `apps/api/src/routes/projects.ts` (P0-5, P1-2, P2-2)

**P0-5** (`:309`) — hiện chỉ chặn `targetStatus === "IN_PROGRESS" && role === "Employee"`. Employee vẫn set
`COMPLETED`/`APPROVED` được.
- Thay bằng **whitelist chuyển trạng thái**: `(role, from → to)` tường minh. Ví dụ:
  `Employee: DRAFT→SUBMITTED`, `SM: SUBMITTED→IN_PROGRESS`, `SM: IN_PROGRESS→COMPLETED`, `Admin: *`.
- Transition ngoài whitelist ⇒ `403`, kèm `code: "TRANSITION_NOT_ALLOWED"`.
- **Không** dùng `role !== "Employee"` làm điều kiện — đó chính là lỗi hiện tại.

**P1-2** (`:159`) — `GET /projects/:id` không check `departmentId`. Thêm scope: Employee chỉ thấy project có
mình là member; SM/AOM chỉ trong department; Admin theo cấu hình.

**P2-2** (`:299`) — update progress read-then-write, không `expectedVersion` ⇒ mất update khi 2 người sửa.
- Thêm `expectedVersion` vào body, dùng `findOneAndUpdate({_id, version: expectedVersion})`; lệch ⇒ `409 CONFLICT`.

**Acceptance**
```bash
cd apps/api && npm test
# test mới: Employee COMPLETED → 403; SM IN_PROGRESS→COMPLETED → 200;
#           Employee GET project khác department → 404; 2 update cùng version → 1 pass 1 nhận 409
```

---

## 04B — `apps/api/src/socket.ts` (P1-6, P1-7, P1-9)

**P1-6** (`:144`) — `chat:confirm` trả "đã thực thi thành công" nhưng **không gọi service nào**. Đây là lỗi
tệ nhất trong nhóm: hệ thống nói dối người dùng.
- Hoặc gọi thật service xử lý action, hoặc đổi message thành trung thực (`"đã ghi nhận xác nhận, đang xử lý"`)
  và **không** nói "thực thi thành công". Chọn theo khả năng thật của hệ thống, không chọn theo câu chữ đẹp.

**P1-7** (`:79`) — `userContext` dựng qua socket thiếu `employeeId`/`departmentId` ⇒ tool scope sai (có thể
trả dữ liệu ngoài phạm vi). Lấy từ `socket.data.user` đã xác thực, không lấy từ payload client.

**P1-9** (`:89`) — `chat:done` phát field ngoài `ChatDonePayloadSchema` ⇒ client validate sẽ loại bỏ hoặc crash.
Đồng bộ với schema trong `packages/contracts` (thêm field vào schema nếu thật sự cần, ví dụ `degraded`,
`decisionSource`).

**Acceptance**
```bash
cd apps/api && npm test && node --test test/chat-gateway.test.mjs
# test mới: emit chat:confirm → service được gọi đúng 1 lần (hoặc message không claim đã thực thi)
#           chat:done parse được bằng ChatDonePayloadSchema
```

---

## 04C — API nhỏ (P1-3, P1-4, P2-10)

**P1-3** `apps/api/src/routes/attachments.ts:58` — route tải file thiếu `authenticateToken`.
- Gắn middleware + kiểm tra quyền theo `category` (attachment của ai, department nào).
- Đây là lỗ hổng tải file của người khác nếu biết tên file → ưu tiên cao nhất trong 04C.

**P1-4** `apps/api/src/routes/auth.ts:38` — login không rate limit + nhánh "không có user" trả ngay ⇒ timing
enumeration.
- Thêm rate limit theo IP + username (in-memory đủ cho đồ án, ghi rõ là giới hạn).
- Nhánh không có user vẫn phải chạy hash giả (constant-time-ish) trước khi trả lỗi.

**P2-10** `apps/api/src/routes/chat.ts:7` — schema request chat khai lại, lệch `RagQueryRequest` trong contracts.
- Import từ `packages/contracts` thay vì khai lại. Nếu contracts chưa có, thêm ở đó (file của packages — được
  phép, vì phase này sở hữu thay đổi contract đó).

**Acceptance**
```bash
cd apps/api && npm test
# test mới: GET /attachments/x/y không token → 401; 6 lần login sai liên tiếp → 429;
#           body chat thiếu field bắt buộc → 400 theo schema contracts
```

---

## Ranh giới giữa 3 worker

| Worker | Được sửa | Không được sửa |
|---|---|---|
| 04A | `routes/projects.ts`, `utils/scope.ts` (nếu tạo) | `socket.ts`, `reports.ts`, `attachments.ts` |
| 04B | `socket.ts`, schema trong `packages/contracts` | `routes/*.ts` |
| 04C | `routes/attachments.ts`, `routes/auth.ts`, `routes/chat.ts` | `socket.ts`, `projects.ts` |

Nếu 04B và 04C cùng cần đổi `packages/contracts` → **04B sở hữu** file schema, 04C chỉ đọc.

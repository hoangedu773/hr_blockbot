# Phase 03 — Reports flow: scope, atomicity, endpoint chết

**Mục tiêu:** chốt shape + quyền của luồng nộp/duyệt báo cáo **trước** khi sửa UI (phase 07 dùng lại).

## File sở hữu (exclusive)

```
apps/api/src/routes/reports.ts        P1-1, P1-5, P2-1   (P0-6 server-side đã fix)
apps/web/src/services/api.ts          P1-8               (P0-6 client-side đã fix)
```

## Việc

1. **P1-1 — IDOR ở `GET /reports/:id`** (`reports.ts:79`): hiện trả nguyên document cho bất kỳ user đã đăng nhập.
   - Thêm kiểm tra: `ownerId === user.userId` **hoặc** `user.role ∈ {SM, AOM, Admin}` **và** cùng `departmentId`.
   - Sai quyền ⇒ `404` (không phải `403`, để không xác nhận sự tồn tại của report).
2. **P1-5 — tạo report trước khi transition** (`reports.ts:37`): nếu `transitionProject` fail, report đã ghi ⇒ dữ liệu mồ côi.
   - Đảo thứ tự: validate + transition trước, ghi report sau; hoặc ghi report rồi **compensate** (xoá) khi transition fail.
   - Chọn cách nào cũng phải có test cho nhánh fail (project đã đổi trạng thái giữa chừng ⇒ không còn report mồ côi).
3. **P2-1 — Admin duyệt report không check department** (`reports.ts:115`): Admin toàn quyền là **sai** với dữ liệu
   nhân sự theo chi nhánh. Thêm cùng điều kiện scope như P1-1, trừ khi role là `SuperAdmin` (nếu có).
4. **P1-8 — web gọi endpoint không tồn tại** (`web/src/services/api.ts:218`, `change-requests`):
   - Kiểm tra `apps/api` có route đó không. Không có ⇒ **xoá caller** và thay bằng luồng thật (nộp report /
     transition project), không để nút bấm gọi 404.

## Acceptance

```bash
cd apps/api && npm test
# test mới bắt buộc:
#  - Employee B GET report của Employee A  → 404
#  - SM cùng department GET                → 200
#  - transition fail                        → không có report trong DB
#  - Admin khác department duyệt           → 404
node --test apps/web/test/web-integration.test.mjs
grep -n "change-requests" apps/web/src/services/api.ts    # 0 kết quả
```

## Ghi chú thiết kế

- Nếu phase 04A tạo `apps/api/src/utils/scope.ts`, **phase 03 không được tạo trước** — 04A sở hữu file đó.
  Phase 03 dùng inline check; 04A refactor sau nếu muốn (hoặc 04A export helper rồi 03 sửa lại — **không làm**,
  tránh sửa hai lần: nếu cần helper, tạo nó ngay trong phase 03 và ghi rõ 04A được import).

---
phase: 3
title: Adversarial QA
status: pending
owner: tester
depends_on: [1, 2]
---

# Phase 3 — Adversarial QA

Candidate = worktree `C:/work-space/worktrees/hr-blockbot-crm-real-data`, nhánh `feat/crm-real-data`. Không tin báo cáo của dev; tự chạy lệnh.

## Vector 1 — Boundary & type corruption

- `GET /api/stores?limit=0`, `limit=-1`, `limit=1000`, `limit=abc`, `page=0`, `page=999999`.
- `q` với 50 ký tự regex độc hại: `.*`, `(`, `[a-z`, `\`, unicode tiếng Việt có dấu, chuỗi 5KB.
- `POST /stores` với: `{}`, `name: "  "`, `name` 121 ký tự, `name` chỉ emoji, `kind: "OUTLET"` (sai case), `district` 61 ký tự, `code` trùng, `name` trùng.
- `PATCH /stores/:id` với `{}` (không field nào), `{ name: null }`, id không phải ObjectId, id là ObjectId hợp lệ nhưng không tồn tại.
- `DELETE /stores/:id` gọi 2 lần liên tiếp (idempotency).

## Vector 2 — Concurrency

- Hai `POST /stores` cùng `name` đồng thời → đúng 1 thành công, 1 nhận 409, không có 500 và không có 2 document.
- `PATCH` đổi tên cửa hàng trong khi `GET /stores` đang chạy → response không được chứa nửa cũ nửa mới (employee_count phải khớp employees.store_raw sau khi settle).
- `DELETE` trong khi `POST` employee đang trỏ vào store đó → không được để lại employee mồ côi.

## Vector 3 — Security & trust boundaries

- `GET /api/stores` không token → **401**, không được 200.
- Token Employee → **403** với danh sách toàn bộ cửa hàng (chỉ được thấy cửa hàng của mình, hoặc 403 nếu không có store).
- Admin có `departmentId` hẹp: `GET /api/stores?q=` phải không trả cửa hàng ngoài scope; thử cả `?district=` và `?kind=` để bypass.
- `POST/PATCH/DELETE /stores` với token Employee → **403**.
- Response lỗi không được chứa stack trace, connection string, tên collection Mongo, hay `err` thô.
- Grep `apps/api/src` đảm bảo không có `console.error` in raw `err` trong đường stores/dashboard.

## Vector 4 — Silent failure

- Tắt Mongo (đóng connection) rồi `GET /api/stores` → phải 500/503 với mã lỗi rõ, **không** trả `items: []` giả như thành công.
- `GET /api/dashboard/overview` khi `cash_counts` rỗng → `revenue.value` phải là `null` + `reason` khác rỗng, không phải `0`.
- Không có `catch {}` rỗng và không có `catch(() => [])` trong đường mới.
- Trên web: khi `fetchStores` reject, UI phải hiện error state, không hiện bảng rỗng như "không có cửa hàng".

## Vector 5 — Execution proof

Chạy thật, dán output:

```bash
cd C:/work-space/worktrees/hr-blockbot-crm-real-data
pnpm --filter api exec tsc --noEmit
pnpm --filter web exec tsc --noEmit
cd apps/api && node test/with-memory-mongo.mjs test/stores-crud.test.mjs test/dashboard-overview.test.mjs
cd C:/work-space/worktrees/hr-blockbot-crm-real-data && node --test apps/web/test/web-integration.source-shape.test.mjs
grep -rn "45 chi nhánh\|184\.250\.000\|98\.6%\|GUTA_45_STORES\|GT-CH-0" apps/web/src
```

Yêu cầu bổ sung: viết một script tạm trong `apps/api/test/` (xoá sau khi chạy) để chứng minh 401/403/scope bằng request thật qua `supertest` hoặc `fetch` tới app instance, không chỉ đọc code.

## Verdict

Kết luận đúng một trong hai:

```markdown
### QA Verdict: PASS
- Checks executed: ...
- Edge cases validated: ...
- Residual risks: ...
```

hoặc

```markdown
### QA Verdict: REJECT
- Failing check: <lệnh chính xác>
- Error output: <nguyên văn>
- Minimal reproduction: <snippet>
- Root cause hypothesis: ...
```

Một assertion đỏ, một 500 ngoài dự kiến, hay một chỗ trả `[]` giả khi lỗi ⇒ **REJECT**.

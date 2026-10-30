---
phase: 1
title: Contract + API stores CRUD + dashboard overview
status: pending
owner: fullstack-developer A
depends_on: []
files_owned:
  - packages/contracts/src/index.ts
  - apps/api/src/models/Store.ts
  - apps/api/src/routes/stores.ts
  - apps/api/src/routes/dashboard.ts
  - apps/api/src/app.ts
  - apps/api/test/stores-crud.test.mjs
  - apps/api/test/dashboard-overview.test.mjs
  - apps/api/package.json
---

# Phase 1 — Contract + API

## Bối cảnh

`apps/api/src/routes/stores.ts` hiện có `router.get("/stores")` nhưng **không được mount**; `apps/api/src/app.ts:63` chặn bằng `disabledLegacyHandler` trả 503. Router đó cũng **không có `authenticateToken`** và trả full `.lean()` không projection — không được mount nguyên trạng.

## Việc phải làm

1. **Contract** (`packages/contracts/src/index.ts`): append đúng block đã đóng băng trong `plan.md` §3. Không đổi symbol cũ.
2. **Model** (`apps/api/src/models/Store.ts`): thêm field optional `code`, `kind` (`outlet|group|support`, default `outlet`), `district`, `status` (`ACTIVE|INACTIVE`, default `ACTIVE`), `manager_employee_id` (ObjectId, ref Employee), `deleted_at`. Giữ `store_name` unique index và `employee_count`. Document cũ (chỉ có 2 field) phải đọc được — mọi field mới có default.
3. **Router** (`apps/api/src/routes/stores.ts`): viết lại thành CRUD thật, toàn bộ route gắn `authenticateToken`:
   - `GET /stores` — query: `page`, `limit` (max 100), `q` (escape regex, cap 50 ký tự), `kind`, `district`, `status`. Admin không global bị giới hạn theo scope (`departmentId`/`department`/`store_raw` như `routes/employees.ts:65-80`); Employee chỉ thấy cửa hàng của chính mình (`storeName` từ `resolveUserScope`). Trả `StoreListResponse`.
   - `GET /stores/:id` — 400 nếu ObjectId sai, 404 nếu không có, 403 nếu ngoài scope.
   - `POST /stores` — chỉ Admin; body validate bằng `StoreCreateSchema`; 409 khi trùng `store_name`.
   - `PATCH /stores/:id` — chỉ Admin; validate `StoreUpdateSchema`; nếu đổi `store_name` thì cascade `EmployeeModel.updateMany({ store_raw: oldName }, { store_raw: newName })` trong cùng logic, và recompute `employee_count`.
   - `DELETE /stores/:id` — chỉ Admin; **409 `STORE_HAS_EMPLOYEES`** nếu còn employee tham chiếu; nếu không thì soft delete (`deleted_at`) và loại khỏi mọi query list.
   - `employeeCount`/`activeEmployeeCount` **derive bằng aggregate trên `employees.store_raw`**, không tin `stores.employee_count` (đã xác minh khớp hôm nay nhưng có thể trôi sau CRUD).
   - `managerName`/`managerEmployeeId`: employee `active` có `businessRole` ∈ `sm|ptch` tại cửa hàng đó; nhiều người thì chọn `sm` trước, rồi tên A→Z; không có thì `null`.
4. **Dashboard router mới** (`apps/api/src/routes/dashboard.ts`): `GET /dashboard/overview` (auth, mọi role) trả `DashboardOverviewSchema`:
   - `stores.outlets/groups/support` đếm theo `kind` (fallback: tên khớp `^(GUTA CAFE|GUTA EXPRESS|BÁNH MÌ 365|CƠM CHIÊN GIÒN|CAFE|BẾP BÁNH MÌ)\s-\s` ⇒ outlet, `^Group ` ⇒ group, còn lại ⇒ support).
   - `employees.total/active/inactive` đếm thật.
   - `profileCompletionRate` = % `profile_status = "ĐÃ HOÀN TẤT"`, `source: "employees"`.
   - `managersCovered` = % outlet có manager, `source: "employees"`.
   - `employeesPerOutlet` = total/outlets, `source: "employees"`.
   - `revenue` = **`value: null`**, `reason` nêu rõ chỉ `cash_counts` phủ 9/N cửa hàng trong 1 kỳ, `source: "cash_counts"`, `asOf` = ngày dữ liệu.
   - `onTimeRate` = **`value: null`**, `reason` nêu rõ không có dữ liệu chấm công/punch trong nguồn, `source: "none"`, `asOf: null`.
   - `latestScheduleDate` = `max(work_date)` của `schedule_entries`.
   - Không được bịa số. Không hardcode bất kỳ con số nào.
5. **Mount** (`apps/api/src/app.ts`): mount `storesRouter` và `dashboardRouter` tại `/api` **trước** dòng `app.use("/api/stores", disabledLegacyHandler)` và **xoá** đúng dòng 503 của `/api/stores` (giữ nguyên 503 cho `/schedules`, `/corrections`, `/cash`).
6. **Test** (hermetic, dùng `test/with-memory-mongo.mjs`):
   - `apps/api/test/stores-crud.test.mjs`: 401 không token; 403 Employee; Admin scope hẹp không thấy store ngoài scope; global admin thấy hết; tạo → đọc → patch đổi tên cascade `employees.store_raw` → delete 409 khi còn nhân sự → chuyển hết nhân sự → delete OK → list không còn.
   - `apps/api/test/dashboard-overview.test.mjs`: shape khớp `DashboardOverviewSchema.parse`; `revenue.value === null` và `revenue.reason` khác rỗng; `onTimeRate.value === null`; đếm stores/employees khớp fixture; 401 không token.
   - Thêm 2 file test vào script `test` của `apps/api/package.json`.
7. **Xoá import/log rò rỉ**: `console.error("Error fetching stores:", err)` không được log raw `err` (có thể chứa connection string). Dùng thông điệp + mã lỗi.

## Ranh giới

- Không chạm `apps/web/**`.
- Không đổi hành vi `/api/schedules`, `/api/corrections`, `/api/cash` (vẫn 503).
- Không đổi `authenticateToken`, không đổi `resolveUserScope` signature.

## Acceptance

```bash
cd C:/work-space/worktrees/hr-blockbot-crm-real-data
pnpm --filter api exec tsc --noEmit
cd apps/api && node test/with-memory-mongo.mjs test/stores-crud.test.mjs test/dashboard-overview.test.mjs
```

Cả hai exit 0. Trả về output lệnh + danh sách route đã mount.

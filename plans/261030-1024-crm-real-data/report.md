# CRM big update — dữ liệu thật + CRUD thật, xoá hardcode

**Ngày:** 2026-10-30 · **Nhánh:** `feat/crm-real-data` · **Worktree:** `C:\work-space\worktrees\hr-blockbot-crm-real-data`
**Commit:** `8a888cd` (base `3d97e37` trên `main`)
**Plan:** `plans/261030-1024-crm-real-data/` · **ADR:** `docs/03-decision-records/ADR-020-crm-real-data-kpi-null-thay-vi-uoc-luong.md`

## Kết quả

Màn "Chi nhánh / Cửa hàng" giờ đọc dữ liệu thật từ Atlas qua API có auth và scope, có CRUD thật, và không còn một con số hardcode nào trong phạm vi CRM. Hai KPI không có nguồn dữ liệu (doanh thu, tỷ lệ đúng giờ) trả `null` kèm lý do thay vì bịa số — theo ADR-020.

Test xanh toàn bộ: API 137/137 (12 file), web source-shape 13/13, e2e 17/17, typecheck 0 error hai app, build Vite thành công.

## Vấn đề gốc đã xác minh bằng lệnh, không phải suy đoán

| # | Phát hiện | Bằng chứng |
|---|---|---|
| 1 | `routes/stores.ts` có `GET /stores` nhưng **không được mount**; `app.ts:63` chặn `/api/stores` bằng 503. Router còn **không có `authenticateToken`** | grep `storesRouter` = 0 hit trong `apps/api/src` |
| 2 | 4 KPI + 10 dòng bảng + tiêu đề "45 chi nhánh" hardcode trong chuỗi `CRM_HTML` | `CrmDashboardView.tsx:135,147,158,169,182,204…420,587` |
| 3 | `components/dashboard/**` (4 file, 1191 dòng) là dead subtree, không ai render | grep import ngoài subtree = 0 |
| 4 | `api.ts` không có fetcher stores; contracts chỉ có `StoreSchema {store_name, employee_count}` | `packages/contracts/src/index.ts:628` |
| 5 | Test **không bảo vệ** số liệu: `e2e-revamp-flow.test.mjs:232` chỉ có chữ "45" trong *tên* test, body không đếm | đọc test |
| 6 | `.gitignore:73` là `dashboard/` không neo đầu dòng → khớp mọi thư mục tên `dashboard`, kể cả `apps/web/src/components/` | `git check-ignore -v apps/web/src/components/dashboard/StoreTable.tsx` → `.gitignore:73` |

Phát hiện #6 giải thích vì sao 4 file dashboard chưa bao giờ được git track và vì sao các wave refactor trước không xoá được chúng.

## Thay đổi

### Contracts (`packages/contracts/src/index.ts`, +67)

`StoreKind`, `StoreStatus`, `StoreSummary`, `StoreListResponse`, `StoreCreate`, `StoreUpdate`, `DashboardMetric`, `DashboardOverview`. Read-model tách khỏi shape ETL: `StoreSchema` cũ (`store_name`/`employee_count`) vẫn là shape pipeline import, không dùng làm response API.

### API

| File | Thay đổi |
|---|---|
| `routes/stores.ts` | Viết lại toàn bộ (+878): CRUD thật sau `authenticateToken`; mutation chỉ Admin **và** phải trong scope; counts derive từ `employees.store_raw`; rename cascade dưới lease 15s; delete conditional-write |
| `routes/dashboard.ts` (mới) | `GET /dashboard/overview`: mọi số derive từ DB; `revenue`/`onTimeRate` trả `null` + `reason` |
| `models/Store.ts` | Thêm `code`, `kind`, `district`, `status`, `manager_employee_id`, `deleted_at`, `rename_lease_until`, `rename_lease_token` — đều optional, document cũ đọc được |
| `middlewares/auth.middleware.ts` | Tách lỗi verify token (401) khỏi lỗi hạ tầng DB (`next(err)` → 503) |
| `app.ts` | Mount stores + dashboard trước handler 503; error handler trung tâm tôn trọng `err.status` 4xx |
| `db.ts` | `serverSelectionTimeoutMS: 5000`; `resolveDbName` để test mode giữ isolation |
| `lib/redact.ts` (mới) | Một `redactSecrets()` duy nhất thay 5 bản copy không nhất quán |

### Web

| File | Thay đổi |
|---|---|
| `services/api.ts` | 6 fetcher: stores CRUD + overview |
| `components/StoreDirectoryView.tsx` (mới) | Bảng thật + form CRUD; loading/error/empty tách biệt; debounce 250ms + latest-request guard |
| `components/CrmDashboardView.tsx` | −1006 dòng hardcode; KPI/badge/count lấy từ overview; metric `null` render `—` + tooltip `reason` |
| `components/dashboard/**` | Xoá 4 file (1191 dòng) |
| `.gitignore` | `dashboard/` → `/dashboard/` |
| `test/*.mjs` | Guard thu hẹp còn 3 endpoint 503; e2e mock stores + đếm dòng thật |

## QA — 3 vòng, 2 lần REJECT

| Vòng | Verdict | Defect tìm được |
|---|---|---|
| 1 | REJECT | Cascade đổi tên không atomic: 2 PATCH đồng thời → **17/20 vòng** để lại nhân sự mồ côi, cả hai trả 200. DB outage bị phân loại thành **401** → đá toàn bộ user online về trang đăng nhập |
| 2 | REJECT | Bản sửa CAS chỉ bảo vệ `store_name`, không bảo vệ cascade → **mất dữ liệu ở N=1000** (825 nhân sự mồ côi, `employee_count=825` trên store sai, cả hai 200). Error handler nuốt lỗi 400/413 của `express.json()` thành 500 |
| 3 | PASS | Mutation test đỏ đúng chỗ khi gỡ scope check; 0/20 vòng race hỏng; 8/8 probe scope; 137/137 test |

Audit độc lập (song song vòng 2) tìm thêm **P0 cross-tenant write**: `requireAdmin` chỉ check `role === "Admin"`, bỏ qua `isGlobalAdmin`/`departmentId` — scoped admin PATCH/DELETE/POST được cửa hàng ngoài department (probe: `READ 403 / PATCH 200 / DELETE 204 / POST 201`). Cộng 4 P1 khác. Tất cả đã sửa ở vòng 3.

Trong QA vòng 3, tester phát hiện thêm một bug thật và tự sửa: `res.json()` đẩy response xuống socket **trước** khi `finally` nhả rename lease, nên client PATCH tiếp ngay nhận `409 STORE_RENAME_BUSY` giả.

### Bản sửa then chốt

**Rename cascade dưới lease.** Không dùng transaction (Atlas M0 + standalone mongod không hỗ trợ). Thứ tự: acquire lease bằng một `findOneAndUpdate` có điều kiện → đọc `previousName` từ document vừa lease → CAS rename → cascade `employees.store_raw` → recompute `employee_count` → release lease trong `finally` có điều kiện token. Request thua nhận `409 STORE_RENAME_BUSY`/`STORE_RENAME_CONFLICT` thay vì 200 giả.

**Delete conditional write.** `updateOne({_id, deleted_at: null, store_name: seenName})`; `modifiedCount === 0` → `409 STORE_DELETE_CONFLICT`. Đóng khoảng TOCTOU giữa `countDocuments` và `updateOne`.

**Scope cho mutation.** `resolveWriteDenial()` check `canReadStore(scope, storeName)` trước khi ghi; POST chỉ global admin (cửa hàng mới chưa có nhân sự nên không thuộc department nào).

## Lệnh kiểm chứng (chạy trên worktree, output nguyên văn đã dán trong log phiên)

```
pnpm --filter api exec tsc --noEmit                    → 0
pnpm --filter web exec tsc --noEmit                    → 0
pnpm --filter api test                                 → 137 passed / 0 failed (12 file)
pnpm --filter web exec vite build                       → built in 12.58s
node --test apps/web/test/web-integration.source-shape.test.mjs → 13/13
node --test apps/web/test/e2e-revamp-flow.test.mjs      → 17/17
grep -rn "45 chi nhánh|184.250.000|98.6%|GUTA_45_STORES|GT-CH-0|348 NS" <in-scope files> → rỗng
```

## Dữ liệu thật đang phục vụ

| Collection | Docs | Dùng cho |
|---|---|---|
| `stores` | 144 (133 outlet + 11 pseudo-entity) | danh sách, KPI số cửa hàng |
| `employees` | 2439 (740 active) | đếm nhân sự, quản lý cửa hàng, % hồ sơ hoàn tất |
| `cash_counts` | 9 cửa hàng, 1 kỳ | **không đủ** → `revenue: null` |
| `schedule_entries` | 3275, max `work_date` 2026-10-11 | `latestScheduleDate` |
| — | không có bảng punch | **không có** → `onTimeRate: null` |

Backup trước khi đổi schema: `C:\Users\hoang\AppData\Local\Temp\hr_bot-backup-20261030\` (stores 144, employees 2439, departments 37, cash_counts 9, schedule_entries 3275). Không có thao tác ghi nào lên Atlas trong phiên này.

## Quyết định đã chốt

1. **Không bịa số.** Metric thiếu nguồn trả `null` + `reason`; UI render `—`, không render `0`.
2. **Counts derive tại thời điểm đọc**, không tin `stores.employee_count`.
3. **Soft delete, fail-closed.** Còn nhân sự → 409, không cascade xoá người.
4. **Lease 15s thay transaction.** Best-effort, tự hết hạn khi process chết; đánh đổi được ghi trong code.
5. **Không đổi layout/màu/spacing CRM** — session UI/UX sở hữu phần đó.

## Việc bàn giao cho session UI/UX

- **Contract đã đóng băng**, UI mới phải code theo: `StoreSummary`, `StoreListResponse`, `StoreCreate`, `StoreUpdate`, `DashboardOverview`, `DashboardMetric`.
- Component đã có data thật: `StoreDirectoryView` (mới), `CrmDashboardView` (KPI + badge), `EmployeeListView`, `EmployeeProfileView`, `RosterView`, `ProjectListView`, `AdminSettingsView`, `UserAccountsView`.
- **Còn copy marketing hardcode "45 chi nhánh" ngoài scope phiên này**, session UI/UX phải quyết định thay bằng số thật hay đổi copy: `landing/LandingHero.tsx` (6 chỗ), `landing/InteractiveTabs.tsx` (4), `chat/ChatDrawer.tsx` (3), `FolioLandingView.tsx` (2), `landing/FaqSection.tsx` (1), `landing/AuthModal.tsx` (2), `landing/BentoFeatures.tsx` (1).
- **Ràng buộc kỹ thuật phải biết:** `apps/web/public/assets/crm/*.css` là Tailwind build tĩnh đóng băng, thiếu ~114 class mà markup dùng. Class mới **im lặng no-op**; visual thật đến từ `.crm-*` trong `index.css`. Thêm UI mới vào CRM phải dùng `.crm-*` hoặc inline style, hoặc build lại Tailwind.
- **Bảng stores giờ async.** Mọi assert e2e trên `tbody tr` phải qua `waitFor`, không sample cùng tick với tab switch.
- **Hành vi mới cần UI xử lý:** `409 STORE_RENAME_BUSY` ("thử lại sau") và `409 STORE_RENAME_CONFLICT` ("vừa được người khác đổi tên"). Hiện `StoreDirectoryView` đã map 409 sang thông điệp nghiệp vụ nhưng chưa phân biệt hai mã này.

## Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| Cascade ngoài transaction | Trung bình | Lease 15s thu hẹp cửa sổ nhưng không xoá. Rollback best-effort. Cần job đối soát `stores.employee_count` ↔ `countDocuments(employees.store_raw)` |
| `store_raw` là khoá liên kết dạng chuỗi người đọc, không phải FK | Trung bình | Writer ngoài API (ETL, script import) ghi trực tiếp sẽ làm gãy liên kết. Giải pháp bền: thêm `store_id` ObjectId vào `employees` + backfill |
| `employees.ts:65-79` có cùng bug ObjectId/string như `stores.ts` từng có | **Cao** | Admin không global thấy rỗng trên dữ liệu thật ở đường đọc nhân sự. Không sửa trong phiên này (ngoài scope) — cần đưa vào backlog ưu tiên cao |
| Test race phụ thuộc timing 60ms tiêm vào | Thấp | Có thể false-green trên CI tải cao; nên chuyển sang failpoint nếu flake |
| DELETE của scoped admin gần như bất khả thi về logic | Thấp | Scope cần có nhân sự, DELETE cần 0 nhân sự. Cần `departmentId` trên `stores` hoặc ẩn nút Xoá với scoped admin |
| Function > 50 LOC | Thấp | `dashboard.ts` 129, PATCH handler 215, `StoreDirectoryView` 706. Tách bây giờ tăng rủi ro ở vòng cuối; ghi nợ |
| `MongoServerError` do server shutdown (không phải network) vẫn rơi vào 401 | Thấp | Mở rộng classifier theo `codeName` nếu gặp thực tế |

## Lưu ý về file đã xoá

4 file `apps/web/src/components/dashboard/*.tsx` (1191 dòng) bị xoá khỏi working copy nhưng **không xuất hiện trong commit** vì chúng chưa bao giờ được git track (bị `.gitignore:73` che). Rule đã sửa thành `/dashboard/` nên source không còn bị che, nhưng lịch sử git không có bản gốc để đối chiếu. Nội dung cũ chỉ còn trong `dist` build trước đó. Không ảnh hưởng chức năng — subtree không được render ở đâu.

## Câu hỏi chưa chốt

1. `RENAME_LEASE_MS = 15s` có nên thành env? Cascade N=1000 đo được ~250ms, N=20k vẫn dưới 15s, nhưng nếu Atlas M0 chậm bất thường thì cửa sổ race mở lại.
2. Có cần job đối soát định kỳ `stores.employee_count` ↔ `employees.store_raw` để phát hiện trạng thái lệch sau rollback thất bại, hay chấp nhận phát hiện thủ công?
3. Có cần alert riêng cho `409 STORE_RENAME_BUSY` (tỉ lệ cao = UI cho hai người sửa cùng cửa hàng, cần optimistic concurrency ở client)?
4. Có sửa `employees.ts:65-79` (ObjectId/string) ngay trong sprint này không, hay để backlog?

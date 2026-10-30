---
plan: crm-real-data
created: 2026-10-30 10:24 (+07)
status: ready-for-execution
owner: lead
mode: team
branch: feat/crm-real-data
worktree: C:/work-space/worktrees/hr-blockbot-crm-real-data
scope: >
  packages/contracts/src/index.ts,
  apps/api/src/routes/stores.ts,
  apps/api/src/routes/dashboard.ts (new),
  apps/api/src/models/Store.ts,
  apps/api/src/app.ts,
  apps/api/test/stores-crud.test.mjs (new),
  apps/api/test/dashboard-overview.test.mjs (new),
  apps/api/package.json,
  apps/web/src/services/api.ts,
  apps/web/src/components/CrmDashboardView.tsx,
  apps/web/src/components/StoreDirectoryView.tsx (new),
  apps/web/src/components/dashboard/** (deleted),
  apps/web/test/e2e-revamp-flow.test.mjs,
  apps/web/test/web-integration.source-shape.test.mjs
---

# Plan: CRM big update — dữ liệu thật + CRUD thật, xoá toàn bộ hardcode

## 1. Bối cảnh (đã kiểm chứng bằng lệnh, không phải suy đoán)

Nguồn dữ liệu thật đang sống: MongoDB Atlas `hr_bot` (đọc được bằng `ATLAS_URI` trong `.env`, đã ping OK).

| Collection | Docs | Ghi chú |
|---|---|---|
| `stores` | 144 | 133 outlet thật + 11 pseudo-entity (`Group AOM/OM …`, `BẾP`, `GIAO HÀNG`, `Phụ trách dự án mới`) |
| `employees` | 2439 | 740 `active` / 1699 `inactive`; 2380 `ĐÃ HOÀN TẤT` hồ sơ |
| `departments` | 37 | kind: 26 `region`, 8 `group`, 3 `unmapped` |
| `cash_counts` | 9 | chỉ 9 cửa hàng, 1 kỳ — **không đủ** cho KPI doanh thu toàn chuỗi |
| `schedule_entries` | 3275 | `work_date` max = 2026-10-11 (dữ liệu cũ 19 ngày) |
| `attendance_corrections` | 115 | chỉ 7 cửa hàng, 2026-05-06 → 2026-06-04 |

Các sai lệch đã xác minh:

1. **`apps/api/src/routes/stores.ts` có `router.get("/stores")` nhưng KHÔNG được mount ở đâu.** `apps/api/src/app.ts:63` gắn `app.use("/api/stores", disabledLegacyHandler)` trả 503. Router còn **không có `authenticateToken`** — mount nguyên trạng sẽ là một data-leak cross-tenant.
2. **`CrmDashboardView.tsx` hardcode toàn bộ số liệu vận hành** trong một chuỗi `CRM_HTML` (mở `:23`, đóng `:552`): 4 KPI (`:135` "45 chi nhánh", `:147` "135 nhân sự", `:158` "184.250.000 ₫", `:169` "98.6%") và 10 dòng `<tr>` với `data-id="GT-CH-01…10"` (`:204,228,252,276,300,324,348,372,396,420`), cộng tiêu đề `:182` "Hiển thị 10 / 45 Cửa hàng" và `:587` "45 chi nhánh".
3. **`apps/web/src/components/dashboard/**` là dead subtree.** `StoreTable.tsx:15` export `GUTA_45_STORES` (45 fixture), `SlideOverDrawer.tsx:2` chỉ import *type* `StoreRecord`; không file nào render `StoreTable`/`SlideOverDrawer`/`CrmSidebar`/`CrmHeader`. 4 file vẫn bị typecheck mỗi build.
4. **`apps/web/src/services/api.ts` không có fetcher stores nào** (`:32`/`:47` chỉ re-export type `Store`).
5. **`packages/contracts/src/index.ts:628` chỉ có `StoreSchema {_id?, store_name, employee_count}`** — shape ETL nội bộ, không dùng được làm response API.
6. **Test hiện tại KHÔNG bảo vệ số liệu.** `apps/web/test/e2e-revamp-flow.test.mjs:232` chỉ là *tên* test có chữ "45"; body không đếm. `:765` có nhánh OR fallback. Ngược lại `:261` assert cứng `tr[data-id="GT-CH-02"]` và tên `Trương Quốc Thái` — đây mới là chỗ gãy khi đổi nguồn.
7. **`apps/web/test/web-integration.source-shape.test.mjs:84-93` cấm tuyệt đối chuỗi `/stores` và `fetchStores` trong `apps/web/src`.** Guard này được viết để chặn endpoint 503 legacy; nay có endpoint thật nên phải thu hẹp phạm vi, không được xoá trắng.
8. **Drift SQLite ↔ Atlas:** 19 `employee_code` có trong `db/hr_bot.db` nhưng thiếu ở Atlas, 2 mã chỉ có ở Atlas. Không có job đồng bộ trong session này (non-goal).

## 2. Outcome / Non-goals / Acceptance

**Outcome**
- Màn "Chi nhánh / Cửa hàng" đọc dữ liệu thật từ Atlas qua API có auth + scope, có CRUD thật (tạo/sửa/xoá cửa hàng), và **không còn một con số hardcode nào** trong CRM dashboard.
- KPI nào không có nguồn dữ liệu thật thì trả `null` kèm lý do hiển thị được, tuyệt đối không bịa số.

**Non-goals**
- Không đổi layout/typography/màu/spacing của CRM (session UI/UX big update sở hữu phần đó). Chỉ thay nguồn số liệu và thêm trạng thái loading/error/rỗng tối thiểu.
- Không làm pipeline ingest lại SQLite → Atlas, không xử lý drift 19/2.
- Không thêm chấm công thật (không có nguồn punch), không thêm module doanh thu mới.
- Không đổi cơ chế duyệt `change-request` của hồ sơ nhân sự (ADR hiện hành).

**Acceptance (đo được)**
1. `pnpm --filter api typecheck` và `pnpm --filter web typecheck` → 0 error.
2. `GET /api/stores` không token → 401; Employee role → 403; Admin scope hẹp chỉ thấy cửa hàng trong scope; global admin thấy toàn bộ.
3. CRUD stores chạy thật trên Mongo memory: tạo → đọc lại → PATCH đổi tên (cascade `employees.store_raw`, recompute `employee_count`) → DELETE (chặn khi còn nhân sự, trả 409) → xoá sau khi chuyển hết nhân sự.
4. `GET /api/dashboard/overview` trả số derive từ Atlas thật; `revenue` và `onTimeRate` là `null` kèm `reason`.
5. `grep -rn "45 chi nhánh\|184.250.000\|98.6%\|GUTA_45_STORES\|GT-CH-0" apps/web/src` → 0 hit.
6. `apps/web/src/components/dashboard/` không còn tồn tại.
7. `node --test apps/web/test/web-integration.source-shape.test.mjs` xanh với guard đã thu hẹp (vẫn cấm `/schedules`, `/corrections`, `/cash`).
8. e2e `apps/web/test/e2e-revamp-flow.test.mjs` xanh sau khi mock `/api/stores` bằng fixture, và có ít nhất một assertion thật sự đếm số dòng theo response.

## 3. Contract đóng băng (Dev A và Dev B cùng code theo đúng shape này)

```ts
// packages/contracts/src/index.ts
export const StoreKindSchema = z.enum(["outlet", "group", "support"]);
export const StoreStatusSchema = z.enum(["ACTIVE", "INACTIVE"]);

export const StoreSummarySchema = z.object({
  id: z.string(),                 // ObjectId string
  code: z.string().nullable(),    // mã cửa hàng nếu có, ngược lại null
  name: z.string(),
  kind: StoreKindSchema,
  district: z.string().nullable(),
  managerName: z.string().nullable(),
  managerEmployeeId: z.string().nullable(),
  employeeCount: z.number().int().nonnegative(),
  activeEmployeeCount: z.number().int().nonnegative(),
  status: StoreStatusSchema,
});
export type StoreSummary = z.infer<typeof StoreSummarySchema>;

export const StoreListResponseSchema = z.object({
  items: z.array(StoreSummarySchema),
  paging: PaginationMetaSchema,
  summary: z.object({
    totalOutlets: z.number().int().nonnegative(),
    totalGroups: z.number().int().nonnegative(),
  }),
});

export const StoreCreateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  code: z.string().trim().min(1).max(32).nullable().optional(),
  kind: StoreKindSchema.default("outlet"),
  district: z.string().trim().max(60).nullable().optional(),
  status: StoreStatusSchema.default("ACTIVE"),
});
export const StoreUpdateSchema = StoreCreateSchema.partial();
export type StoreCreate = z.infer<typeof StoreCreateSchema>;
export type StoreUpdate = z.infer<typeof StoreUpdateSchema>;

export const DashboardMetricSchema = z.object({
  value: z.number().nullable(),
  reason: z.string().nullable(),   // null khi có value, bắt buộc khi value = null
  source: z.string(),              // vd "employees", "stores", "cash_counts"
  asOf: z.string().nullable(),     // ISO hoặc null
});
export const DashboardOverviewSchema = z.object({
  stores: z.object({ outlets: z.number(), groups: z.number(), support: z.number() }),
  employees: z.object({ total: z.number(), active: z.number(), inactive: z.number() }),
  profileCompletionRate: DashboardMetricSchema,
  managersCovered: DashboardMetricSchema,
  employeesPerOutlet: DashboardMetricSchema,
  revenue: DashboardMetricSchema,     // value = null + reason (chỉ 9/133 cửa hàng có cash_counts)
  onTimeRate: DashboardMetricSchema,  // value = null + reason (không có dữ liệu punch)
  latestScheduleDate: z.string().nullable(),
  generatedAt: z.string(),
});
export type DashboardOverview = z.infer<typeof DashboardOverviewSchema>;
```

`StoreModel` được mở rộng (mọi field mới đều optional, document cũ vẫn đọc được):
`code?: string`, `kind?: "outlet"|"group"|"support"`, `district?: string`, `status?: "ACTIVE"|"INACTIVE"`, `manager_employee_id?: ObjectId`, `deleted_at?: Date|null`.

## 4. Phase

| # | Phase | Nội dung | Owner | Files |
|---|---|---|---|---|
| 1 | [Contract + API](phase-01-contract-and-api.md) | DTO, Store model, routes/stores CRUD, routes/dashboard, mount, api tests | fullstack-developer A | contracts, api |
| 2 | [Web data layer](phase-02-web-data-layer.md) | fetcher, StoreDirectoryView, CrmDashboardView bỏ hardcode, xoá dead subtree, test guards | fullstack-developer B | web |
| 3 | [Adversarial QA](phase-03-adversarial-qa.md) | 5 vector tấn công trên candidate | tester | — |
| 4 | [Audit + handover](phase-04-audit-and-handover.md) | code-reviewer, typecheck toàn repo, report, journal | code-reviewer / lead | — |

## 5. Success Criteria

- [ ] Toàn bộ Acceptance §2 xanh, có log lệnh thật.
- [ ] Không còn hardcode số liệu vận hành trong `apps/web/src`.
- [ ] `GET /api/stores` có auth + scope, có test chứng minh 401/403/scope.
- [ ] CRUD thật có test hermetic, không mock tầng DB.
- [ ] Report tại `plans/reports/` + `ak journal`.

<!-- slug: crm-real-data -->

# QA Report — CRM real data: scope, lease, KPI null (adversarial)

- Candidate: worktree `C:/work-space/worktrees/hr-blockbot-crm-real-data`
- Date: 2026-10-30
- Phạm vi: `apps/api/src/routes/stores.ts`, `routes/dashboard.ts`, `lib/redact.ts`, `app.ts`, `db.ts`
- Phương pháp: tự dựng mong đợi, tự chạy. Test của dev được coi là đối tượng kiểm tra, không phải nguồn sự thật.

### QA Verdict: PASS

---

## A. Mutation test P0 (`canReadStore` trong `requireAdminWithScope`)

**Đỏ khi gỡ.** Gỡ toàn bộ scope check (giữ check role), rebuild `tsc`, chạy `stores-crud.test.mjs`:

```
  ✔ PATCH đổi tên cascade employees.store_raw và tính lại employee_count (31.7313ms)
  ✖ Admin scope hẹp bị 403 khi PATCH/DELETE cửa hàng ngoài department (10.703ms)
  ✔ Admin scope hẹp không được tạo cửa hàng mới (403) (8.5768ms)
ℹ tests 21
ℹ pass 20
ℹ fail 1

test at test\stores-crud.test.mjs:373:3
✖ Admin scope hẹp bị 403 khi PATCH/DELETE cửa hàng ngoài department (10.703ms)
  AssertionError [ERR_ASSERTION]: Expected values to be strictly equal:
  200 !== 403
      at TestContext.<anonymous> (...test\stores-crud.test.mjs:382:12)
```

Đúng một test đỏ, đúng dòng 382 (`PATCH` store ngoài scope trả 200). Không có test nào khác đỏ ⇒ mutation được cô lập bởi test scoped-admin, không phải bởi hiệu ứng phụ.

**Xanh khi khôi phục.** Khôi phục nguyên bản, rebuild, chạy lại:

```
  ✔ Admin scope hẹp bị 403 khi PATCH/DELETE cửa hàng ngoài department (28.5083ms)
ℹ tests 21
ℹ pass 21
ℹ fail 0
```

Mutation được lặp lại **sau khi tôi sửa code** (mục D dưới) để chắc test vẫn giết được mutant trên bản mới, không chỉ trên bản dev: cùng kết quả `pass 20 / fail 1`, `200 !== 403`; khôi phục → `pass 21 / fail 0`.

---

## B. Probe P0 bằng HTTP thật (script tạm, đã xoá)

Scoped admin: `role: Admin`, `isGlobalAdmin: false`, hồ sơ nhân viên `departmentId = PROBE_DEPT_A` (store A). Global admin: `isGlobalAdmin: true`. Hai store legacy chỉ có `store_name`/`employee_count`.

```
PASS  GET /api/stores chỉ thấy store A — status=200 names=["PROBE GUTA CAFE - Quận 1"]
PASS  PATCH store B → 403 RBAC_DENIED — status=403 code=RBAC_DENIED
PASS  DELETE store B → 403 RBAC_DENIED — status=403 code=RBAC_DENIED
PASS  POST /api/stores (scoped) → 403 — status=403 code=RBAC_DENIED
PASS  PATCH store A (trong scope) → 200 — status=200 district=Quận 5
PASS  GET store B → 403 RBAC_DENIED — status=403 code=RBAC_DENIED
PASS  POST /api/stores (global admin) → 201 — status=201 name="PROBE GUTA CAFE - Global Tạo"
PASS  không ghi lậu vào DB từ request bị 403 — storeB.deleted_at=null storeB.district=null scopedCreateDocs=0

SUMMARY 8/8
```

7/7 kịch bản yêu cầu đúng, cộng một assertion phụ: ba request bị 403 không để lại side effect nào trong DB (store B không đổi `district`/`deleted_at`, không có document nào được tạo). Chạy lại sau khi sửa code: 8/8.

---

## C. Regression do bản sửa mới

| # | Kịch bản | Kết quả | Bằng chứng |
|---|----------|---------|-----------|
| C1 | `PATCH {name: <tên hiện tại>, status: "INACTIVE", district: "Q9", code: "C9"}` | PASS | 200; `StoreModel.findById` → `{status:"INACTIVE", district:"Q9", code:"C9"}`. Đọc DB, không tin response. |
| C2 | `PATCH {name: <tên hiện tại>}` không field khác | PASS | 200, body là summary, không `error`; DB giữ nguyên `INACTIVE/Q9/C9`. |
| C3 | DELETE khi tên đổi giữa `countDocuments` và `updateOne` | PASS | 409 `STORE_DELETE_CONFLICT`; `deleted_at=null`; store ở tên mới; 2 nhân sự ở tên store đang mang, 0 ở tên cũ, **0 nhân sự mồ côi**. |
| C4 | Scoped admin, `departmentId` là ObjectId thật | PASS | `items=["GUTA CAFE - PROBE Oid Dept"]`, `totalItems=1` (không phải 0 item). |
| C5 | `departmentId` là string (dữ liệu cũ) | PASS | `items=["GUTA CAFE - PROBE Str Dept"]`, `totalItems=1`. |
| C6a | Dashboard, employee có đủ `profile_status` + `businessRole` | PASS | `profileCompletionRate=37.5`, `managersCovered=42.9`, `reason=null`; kỳ vọng tính độc lập từ DB (8 nhân sự, 7 outlet), không hardcode. |
| C6b | Dashboard, employee **không có** hai field | PASS | `profileCompletionRate.value=null` + reason chứa `profile_status`; `managersCovered.value=null` + reason chứa `businessRole`. Không trả 0. |
| C7 | Redact | PASS | `mongodb://admin:p/ssw0rd@host/db` → `mongodb://***:***@host/db` (không còn `p/ssw0rd`, không còn `admin:`); `mongodb+srv://u:p%40ss@h` → `mongodb://***:***@h`; chuỗi tiếng Việt thường không đổi; message driver `user:pass@host` → `***:***@host`. |

Ba lần chạy liên tiếp: 8/8 mỗi lần.

### Phát hiện thêm: 409 giả `STORE_RENAME_BUSY` sau một PATCH thành công (đã sửa)

Lần chạy C2 đầu tiên fail `409 STORE_RENAME_BUSY` dù không có ai tranh chấp. Nguyên nhân không phải fixture: `res.json()` đẩy byte xuống socket **trước** khi khối `finally` nhả lease, nên client gửi request kế tiếp ngay sau khi nhận 200 vẫn thấy lease và bị từ chối.

Chứng minh bằng cách chỉ làm chậm đúng lệnh giải phóng lease (filter có `rename_lease_token`) 400ms:

```
PATCH#1 status=200 sau 35ms; release bắt đầu=34ms, xong=chưa
=> response về client TRƯỚC khi lease được giải phóng: true
PATCH#2 (ngay sau response) status=409 body={"error":{"code":"STORE_RENAME_BUSY",...}}
PATCH#3 (sau khi release xong) status=200
```

Sau khi sửa (hoãn response tới sau `finally`):

```
PATCH#1 status=200 sau 444ms; release bắt đầu=30ms, xong=443ms
=> response về client TRƯỚC khi lease được giải phóng: false
PATCH#2 (ngay sau response) status=200
PATCH#3 (sau khi release xong) status=200
```

Đây là lỗi thật với người dùng: PATCH đổi tên rồi lưu tiếp form (hoặc bấm sửa lần hai) rơi đúng cửa sổ vài ms và nhận 409 vô cớ, trong khi UI đã báo thành công. Cùng lớp lỗi với nhánh 403 (client retry ngay sau 403 nhận 409 thay vì 403) nên tôi sửa cả hai bằng cách tách `requireAdminWithScope` thành `resolveWriteDenial` (thuần quyết định, không gửi response) và để caller gửi.

---

## D. Race không hồi quy

N=1000 employee, 20 vòng, hai `PATCH` đổi tên đồng thời, cascade của request đi trước bị làm chậm 250ms để mở cửa sổ.

```
RACE RESULT: N=1000 employees, 20 vòng, hỏng 0/20 vòng
```

Mỗi vòng assert: đúng `[200, 409]`; loser ∈ {`STORE_RENAME_CONFLICT`, `STORE_RENAME_BUSY`}; `countDocuments({store_raw: oldName}) === 0`; 1000 employee ở tên store đang mang; `employee_count === 1000`; `GET /api/stores/:id` và `GET /api/stores` cùng trả `employeeCount=1000`; lease `until`/`token` đã nhả. 20/20 vòng `STORE_RENAME_BUSY` cho loser — không có vòng nào rơi vào `STORE_RENAME_CONFLICT`, nghĩa là lease đang làm việc như thiết kế.

**N/20 vòng hỏng: 0/20.**

---

## E. Execution proof

```
$ pnpm --filter api exec tsc --noEmit
EXIT=0

$ pnpm --filter web exec tsc --noEmit
EXIT=0
```

```
$ cd apps/api && node test/with-memory-mongo.mjs test/db-guard.test.mjs test/stores-crud.test.mjs \
    test/dashboard-overview.test.mjs test/auth.test.mjs test/db-outage.test.mjs test/business-role.test.mjs

[test-mongo] running test/db-guard.test.mjs
ℹ tests 5    ℹ pass 5    ℹ fail 0
[test-mongo] running test/stores-crud.test.mjs
ℹ tests 21   ℹ pass 21   ℹ fail 0
[test-mongo] running test/dashboard-overview.test.mjs
ℹ tests 8    ℹ pass 8    ℹ fail 0
[test-mongo] running test/auth.test.mjs
ℹ tests 30   ℹ pass 30   ℹ fail 0
[test-mongo] running test/db-outage.test.mjs
ℹ tests 7    ℹ pass 7    ℹ fail 0
[test-mongo] running test/business-role.test.mjs
ℹ tests 4    ℹ pass 4    ℹ fail 0
EXIT=0
```

```
$ node --test apps/web/test/web-integration.source-shape.test.mjs
ℹ tests 13   ℹ pass 13   ℹ fail 0
EXIT=0
```

Chạy thêm toàn bộ suite API (12 file) để loại trừ tác dụng phụ của việc đổi `requireAdminWithScope` → `resolveWriteDenial`: **137 tests, 137 pass, 0 fail**. Không còn tham chiếu `requireAdminWithScope` nào trong repo.

---

## Residual risks

1. **Lease là best-effort, không phải distributed lock.** Process chết giữa cascade thì lease tự hết hạn sau 15s; client nhận 409 và phải thử lại. Chấp nhận được, nhưng nghĩa là cửa sổ 15s không ghi được vào cửa hàng đó. Hướng bền: thêm `employees.store_id` (ObjectId) để bỏ hẳn cascade theo tên — đã ghi trong ADR-020, chưa làm.

2. **Cascade không nằm trong transaction** (Atlas M0/standalone). Rollback khi `updateMany` lỗi là best-effort; nếu chính rollback lỗi, trạng thái lệch chỉ lộ ra qua `employeeCount` sai và phải sửa bằng một PATCH nữa. Không có job đối soát tự động phát hiện lệch này — nên có một metric/alert định kỳ so `countDocuments({store_raw: name})` với `stores.employee_count`.

3. **`employee_count` vẫn là dữ liệu dẫn xuất được ghi lại**, không phải nguồn sự thật. Mọi read path đã derive từ `employees.store_raw`, nên con số này chỉ còn là cache cho consumer bên ngoài. Nếu có dashboard/report đọc thẳng `stores.employee_count`, nó có thể lệch sau khi ai đó sửa `employees.store_raw` ngoài API.

4. **Sửa response ordering làm tăng latency của PATCH đổi tên** thêm đúng một round-trip `updateOne` (nhả lease) trước khi trả response. Trong đo đạc: 444ms khi release bị làm chậm nhân tạo 400ms, tức chi phí thật là ~1ms. Không đáng kể, nhưng p99 của endpoint này giờ phụ thuộc cả lệnh ghi cuối.

5. **`resolveStoreScope` chạy lại cho mỗi write** (thêm một `distinct` trên `employees`). Với department lớn (hàng chục nghìn nhân sự) đây là truy vấn không index-friendly trên `$or` ba nhánh. Chưa thành vấn đề ở quy mô hiện tại, nhưng là ứng viên đầu tiên khi PATCH bắt đầu chậm.

6. **Test race phụ thuộc timing 60ms** giữa hai request. Trên CI tải cao, cửa sổ có thể không mở và test vẫn xanh mà không thực sự kiểm tra race (false green). Bản probe của tôi dùng cùng cơ chế; kết quả 20/20 `STORE_RENAME_BUSY` cho thấy cửa sổ có mở trong môi trường này, nhưng đây là điểm giòn của test suite nói chung.

7. **`GET /api/stores/:id` trả 404 trước 403** cho store không tồn tại, và 403 cho store tồn tại ngoài scope — cho phép suy ra sự tồn tại của store theo id. Với id là ObjectId khó đoán thì rủi ro thấp, nhưng không phải zero.

## Unresolved questions

- Ai sở hữu `stores.employee_count` sau đợt này? Nếu còn consumer bên ngoài đọc trực tiếp, cần chốt rằng nó chỉ được cập nhật qua PATCH rename và có thể trôi.
- Có cần thêm alert đối soát `employee_count` vs `employees.store_raw` không, hay chấp nhận phát hiện thủ công?

# Fix RBAC scope: departmentId ObjectId vs string hex

**Ngày:** 2026-10-30 · **Nhánh:** `feat/crm-real-data` · **Commit:** `a1a1f51`
**Worktree:** `C:\work-space\worktrees\hr-blockbot-crm-real-data`

## Nguyên nhân gốc (đo trên Atlas thật)

| Bước | Bằng chứng |
|---|---|
| `employees.departmentId` trong Atlas | BSON **ObjectId** (`6ad77a3ef4b31490e55d31c8`) |
| `auth.middleware.ts:118-121` đưa vào `req.user` | `employee?.departmentId?.toString()` → **string hex** |
| `find({ departmentId: "<hex string>" })` | **0 docs** |
| `find({ departmentId: ObjectId("<hex>") })` | **401 docs** |

Hệ quả: mọi Admin không global thấy **rỗng** trên dữ liệu thật, HTTP 200, không có log lỗi — failure im lặng. Test suite xanh vì fixture seed `departmentId: "DEPT_TECH"` (string), đúng dạng mà bug không chạm tới.

## Ba bug độc lập đã sửa

| # | Bug | Vị trí | Hành vi trước | Sau |
|---|---|---|---|---|
| 1 | Query department bằng string trên field ObjectId | `employees.ts` (scope filter, `?departmentId=`, `/change-requests`), `projects.ts` | 0 item | đúng số item trong scope |
| 2 | Admin unmapped đọc **toàn bộ** projects | `projects.ts:73` — không nhánh nào khớp ⇒ `query = {}` ⇒ `find({})` | 200 + toàn bộ collection | 403 `RBAC_DENIED` |
| 3 | Global admin bị 404 mọi project/report | `projects.ts:38`, `reports.ts:41` — `ActorContext` thiếu `isGlobalAdmin` | 404 | 200 |

Bug 2 và 3 là cùng một lớp lỗi (thiếu quyết định RBAC tường minh) ở hai chỗ khác nhau, không do thay đổi của phiên này gây ra.

## Bản sửa

**`apps/api/src/lib/department-scope.ts` (mới)**

```ts
export function departmentIdMatch(value: string | null | undefined): unknown {
  const trimmed = typeof value === "string" ? value.trim() : "";
  if (trimmed === "") return null;
  if (!/^[a-f0-9]{24}$/i.test(trimmed)) return trimmed;
  return { $in: [trimmed, new mongoose.Types.ObjectId(trimmed)] };
}
```

Ba quyết định trong 8 dòng này:

1. **`$in` hai dạng** thay vì cast một chiều — không cần migration, đọc được cả dữ liệu Atlas (ObjectId) và fixture/legacy (string).
2. **Regex 24-hex** thay `mongoose.Types.ObjectId.isValid()` — `isValid` chấp nhận chuỗi 12 byte ở một số phiên bản, sẽ biến department code ngắn thành ObjectId và match nhầm.
3. **Trả `null` khi rỗng**, không trả `""`. Nhưng `null` **không** an toàn khi là một nhánh trong `$or` hoặc giá trị scope — `{ departmentId: null }` match cả document thiếu field. Vì vậy các call site dựng scope vẫn giữ guard tường minh, có comment tại chỗ giải thích.

**Call site:** `employees.ts` (3 chỗ), `projects.ts` (2 nhánh), `stores.ts` (bỏ bản copy cục bộ, dùng helper chung).

**Guard RBAC mới:** `projects.ts:66-77` chặn Admin không global mà scope rỗng (`null`/`""`/`"   "`) trước khi build query, đồng bộ với `employees.ts:34` và `:397`.

**`isGlobalAdmin`:** truyền vào `ActorContext` của `assertProjectScope` và `assertReportScope`.

## Kiểm chứng

```
pnpm --filter api exec tsc --noEmit    → 0
pnpm --filter api test                 → 160/160 pass, 13 file, 0 fail
pnpm --filter web exec tsc --noEmit    → 0
```

`apps/api/test/employees-scope.test.mjs` mới: **23 case**, fixture dùng ObjectId thật (không phải string) để lỗi không bị che.

Mutation test 3 chiều, mỗi lần đều đỏ đúng chỗ rồi khôi phục:

| Gỡ gì | Test đỏ | Actual vs expected |
|---|---|---|
| Guard Admin unmapped (`projects.ts`) | 3 case | `200` vs `403` |
| `isGlobalAdmin` trong `assertProjectScope` | 1 case | `404` vs `200` |
| `isGlobalAdmin` trong `assertReportScope` | 2 case | `404` vs `200` |

## Điều đáng ghi nhận

Trong quá trình sửa, giả định của tôi về lỗ hổng thứ hai **sai**: tôi cho rằng `$or: [{ departmentId: undefined }]` khiến Mongoose lược key và `$or` còn `{}` → match toàn bộ collection. Đo thực tế: Mongoose 8 **cast `undefined` → `null`**, nên lỗ hổng hẹp hơn — chỉ rò document `departmentId` null/thiếu field, không phải toàn bộ. Test được dựng lại theo đúng hành vi thật, và comment sai trong code đã sửa.

Tương tự, mô tả bug 3 của tôi sai endpoint: `POST /api/reports` **không** đi qua `assertReportScope`; test theo mô tả đó sẽ xanh cả khi bug còn nguyên. Đã chuyển sang test `GET /api/reports/:id` và `POST /api/reports/:id/review` — hai endpoint thật sự đi qua hàm đó.

## Rủi ro còn lại

| Rủi ro | Mức | Ghi chú |
|---|---|---|
| `assertProjectScope` và `assertReportScope` là hai bản sao gần trùng | Trung bình | Đã lệch nhau một lần (bug 2 và 3). Ứng viên gộp thành helper chung |
| `departmentId` là `Mixed` với 2 dạng tồn tại | Trung bình | `$in` 2 phần tử vẫn dùng index nhưng là 2 seek. Ở 2.4k document không đáng lo; lên hàng trăm nghìn thì nên chuẩn hoá về một kiểu |
| `auth.middleware` vẫn trả `departmentId` dạng string | Thấp | Helper vá ở tầng query. Giải pháp gốc là mang `departmentObjectId` trong `req.user`, nhưng đổi contract `AuthenticatedUser` + `assertInScope` |
| `canActOnEmployee` và `assertInScope` so sánh string thuần | Thấp | Hiện đúng vì cả hai vế đều `.toString()`; sẽ lệch nếu ai đổi sang so sánh ObjectId trực tiếp |

## Câu hỏi chưa chốt

1. Có gộp `assertProjectScope` + `assertReportScope` thành một helper không? Hai bản sao này đã lệch nhau một lần và cùng loại lỗi.
2. Có chuẩn hoá `employees.departmentId` về ObjectId thuần và bỏ nhánh string không? Cần migration trên collection production chưa có test phủ, và `department`/`store_raw` vẫn là string nên `$or` 3 nhánh không biến mất.
3. Có thêm `departmentObjectId` vào `req.user` để hết phải match 2 dạng ở mọi query không? Đây là thay đổi contract `AuthenticatedUser`, cần bàn riêng.

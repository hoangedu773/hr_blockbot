# ADR-020 — CRM đọc dữ liệu thật, KPI không có nguồn trả `null` thay vì số ước lượng

- **Status:** Accepted (2026-10-30)
- **Ảnh hưởng:** `packages/contracts/src/index.ts`, `apps/api/src/routes/stores.ts`, `apps/api/src/routes/dashboard.ts`, `apps/api/src/models/Store.ts`, `apps/api/src/app.ts`, `apps/web/src/components/CrmDashboardView.tsx`, `apps/web/src/components/StoreDirectoryView.tsx`
- **Thay thế:** hành vi hardcode số liệu vận hành trong `CrmDashboardView.tsx` (4 KPI + 10 dòng bảng)

---

## 1. Bối cảnh

Màn "Chi nhánh / Cửa hàng" hiển thị số liệu vận hành nhưng **toàn bộ là hằng số viết trong một chuỗi HTML**: 45 chi nhánh, 135 nhân sự trực ca, 184.250.000 ₫ doanh thu két sáng, 98.6% đúng giờ, và 10 dòng cửa hàng với mã `GT-CH-01…10`. Dữ liệu thật đã có trong MongoDB Atlas (`stores` 144, `employees` 2439), nhưng:

- `apps/api/src/routes/stores.ts` có `router.get("/stores")` **không được mount**; `app.ts` chặn `/api/stores` bằng 503.
- Router đó **không có `authenticateToken`** và trả full document không projection — mount nguyên trạng là lỗ hổng đọc chéo tenant.
- Không có endpoint nào cho KPI tổng hợp.

Ba KPI trong bốn KPI **không có nguồn dữ liệu đủ** để tính đúng:

| KPI | Nguồn khả dụng | Kết luận |
|---|---|---|
| Số chi nhánh | `stores` 144 dòng, trong đó 11 là pseudo-entity (`Group AOM/OM …`, `BẾP`, `GIAO HÀNG`, `Phụ trách dự án mới`) | Tính được, sau khi phân loại `kind` |
| Nhân sự | `employees` 2439 (740 active) | Tính được |
| Doanh thu két | `cash_counts` chỉ phủ **9/133 outlet, 1 kỳ** | **Không** tính được toàn chuỗi |
| Tỷ lệ đúng giờ | Không có bảng chấm công/punch trong 33k `raw_cells`; `attendance_corrections` chỉ 7 cửa hàng, 5–6/2026 | **Không** tính được |

## 2. Quyết định

1. **Không bịa số.** Metric không có nguồn trả `value: null` kèm `reason` mô tả chính xác vì sao và `source` nêu tên collection. UI render `—` + tooltip, tuyệt đối không render `0`.
2. **Contract tách read-model khỏi shape ETL.** `StoreSchema` (`store_name`, `employee_count`) là shape nội bộ của pipeline import, **không** dùng làm response API. Response dùng `StoreSummarySchema` với field camelCase và số liệu derive.
3. **Counts luôn derive tại thời điểm đọc**, không tin `stores.employee_count`. Cột này hiện khớp (0 mismatch) nhưng sẽ trôi ngay khi CRUD đổi tên cửa hàng.
4. **CRUD thật, có auth và scope.** Mọi route stores có `authenticateToken`; mutation chỉ Admin; Admin không global bị giới hạn theo `departmentId`/`department`/`store_raw`; Employee chỉ thấy cửa hàng của mình.
5. **Xoá cửa hàng là soft delete và fail-closed.** Còn nhân sự tham chiếu → `409 STORE_HAS_EMPLOYEES`, không cascade xoá người.
6. **Đổi tên cửa hàng cascade `employees.store_raw`** trong cùng một luồng xử lý, vì đó là khoá liên kết thực tế giữa hai collection.

## 3. Hệ quả

**Tích cực**
- Không còn khả năng stakeholder trích dẫn một con số không tồn tại.
- Thêm nguồn dữ liệu mới (chấm công, POS theo ngày) chỉ cần thay `reason` bằng `value` tại một chỗ trong `dashboard.ts`.
- Xoá được dead subtree `apps/web/src/components/dashboard/**` (4 file, fixture 45 cửa hàng).

**Tiêu cực / nợ kỹ thuật chấp nhận**
- Hai KPI hiển thị `—` cho tới khi có nguồn. Đây là quyết định hiển thị có chủ ý, cần thống nhất với stakeholder.
- `store_raw` là khoá liên kết dạng chuỗi người đọc, không phải FK. Đổi tên phải cascade thủ công; nếu có writer khác ghi trực tiếp vào `employees.store_raw` thì liên kết sẽ gãy. Muốn hết hẳn phải thêm `store_id` ObjectId vào `employees` và backfill — ngoài scope lần này.
- `stores` vẫn còn 11 pseudo-entity; phân loại hiện dựa trên `kind` với fallback regex theo tiền tố tên. Dữ liệu mới nhập sai tiền tố sẽ bị xếp nhầm nhóm.

## 4. Việc phải làm khi có nguồn dữ liệu

- Có bảng chấm công/punch: đổi `onTimeRate` từ `null` sang aggregate, giữ nguyên `DashboardMetricSchema`.
- Có POS theo ngày đủ 133 outlet: đổi `revenue` tương tự, `asOf` = ngày dữ liệu.
- Có `store_id` trên `employees`: thay cascade theo tên bằng FK, bỏ regex fallback phân loại.

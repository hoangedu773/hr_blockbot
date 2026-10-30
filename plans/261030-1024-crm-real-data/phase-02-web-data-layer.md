---
phase: 2
title: Web data layer + xoá hardcode + xoá dead subtree
status: pending
owner: fullstack-developer B
depends_on: [1]
files_owned:
  - apps/web/src/services/api.ts
  - apps/web/src/components/CrmDashboardView.tsx
  - apps/web/src/components/StoreDirectoryView.tsx
  - apps/web/src/components/dashboard/**
  - apps/web/test/e2e-revamp-flow.test.mjs
  - apps/web/test/web-integration.source-shape.test.mjs
---

# Phase 2 — Web

## Bối cảnh

`apps/web/src/components/CrmDashboardView.tsx` chứa chuỗi `CRM_HTML` (dòng 23–552) hardcode toàn bộ số liệu: 4 KPI ở `:135/:147/:158/:169`, 10 dòng `<tr data-id="GT-CH-01…10">` ở `:204…:420`, tiêu đề `:182`, `:587`. `apps/web/src/components/dashboard/**` (4 file) là dead subtree không được render ở đâu, trong đó `StoreTable.tsx:15` chứa fixture 45 cửa hàng.

## Việc phải làm

1. **`apps/web/src/services/api.ts`**: thêm `fetchStores(params)`, `fetchStoreById(id)`, `createStore(body)`, `updateStore(id, body)`, `deleteStore(id)`, `fetchDashboardOverview()` — dùng `apiFetch` sẵn có, kiểu lấy từ `@hr-blockbot/contracts`. Không nuốt lỗi (`catch(() => [])` bị test guard cấm).
2. **`apps/web/src/components/StoreDirectoryView.tsx`** (mới): component React thay thế phần bảng cửa hàng.
   - Load `fetchStores` + `fetchDashboardOverview`; 3 trạng thái: loading (skeleton), error (thông điệp + nút thử lại), empty ("Chưa có cửa hàng nào").
   - Search debounce 250ms có latest-query guard (giữ đúng pattern đã dùng ở `EmployeeListView.tsx`), filter theo `kind`, `district`, `status`.
   - Bảng render từ `StoreSummary` thật; cột: mã, tên, khu vực, quản lý, số nhân sự (active/total), trạng thái.
   - Admin thấy nút "Thêm cửa hàng" / sửa / xoá; Employee không thấy. Xoá phải confirm và hiển thị lỗi 409 `STORE_HAS_EMPLOYEES` bằng thông điệp nghiệp vụ rõ ràng, không phải "lỗi 409".
   - **Giữ nguyên class Tailwind và cấu trúc DOM mà e2e đang bám**: bảng phải có `<table>`, hàng phải có `data-id` là ObjectId thật, `data-name`, `data-district`, `data-staff`. Ô tìm kiếm phải giữ placeholder `Lọc theo tên, quận, mã...`, phím tắt `Ctrl/⌘+K`, và empty-state text `Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.`
3. **`CrmDashboardView.tsx`**:
   - Xoá toàn bộ 10 `<tr>` hardcode và 4 KPI hardcode khỏi `CRM_HTML`; thay bằng container rỗng để `StoreDirectoryView` render vào (giữ cơ chế portal hiện có).
   - Xoá `title.textContent = 'Guta Workspace — Quản lý nhân sự & 45 chi nhánh'` (`:587`) → dùng số cửa hàng thật lấy từ overview, hoặc bỏ phần số.
   - Badge sidebar `45` (`:70`) lấy từ overview.
   - Không đổi class/màu/spacing/typography. Không đổi bố cục sidebar.
4. **Xoá `apps/web/src/components/dashboard/**`** (CrmHeader, CrmSidebar, SlideOverDrawer, StoreTable). Trước khi xoá phải chứng minh bằng grep rằng không còn ai import; nếu `CrmDashboardView` hoặc file khác còn tham chiếu thì sửa tham chiếu trước.
5. **Test guards**:
   - `apps/web/test/web-integration.source-shape.test.mjs:84-93`: guard hiện cấm chuỗi `/stores` và `fetchStores` trong toàn `src` vì trước đây là endpoint 503. Thu hẹp: vẫn cấm `/schedules`, `/corrections`, `/cash`; với stores thì cấm `/stores` **chỉ trong** `services/auth.ts` hoặc bất kỳ chỗ nào không phải `services/api.ts`. Cập nhật tên test cho đúng nghĩa mới. Không được xoá trắng guard.
   - `apps/web/test/e2e-revamp-flow.test.mjs`: thêm `page.route('**/api/stores**')` và `page.route('**/api/dashboard/overview')` trả fixture cố định. Sửa Bước 4 để assert **đếm thật** số hàng bằng `page.locator('table tbody tr')` khớp `items.length` của fixture (không dùng chữ "45"). Sửa Bước 5 bỏ phụ thuộc `GT-CH-02`/`Trương Quốc Thái`, dùng `data-id` của fixture. Giữ nguyên các bước landing/chat/zero-yellow.
6. **Không còn hardcode**: sau khi xong, `grep -rn "45 chi nhánh\|184\.250\.000\|98\.6%\|GUTA_45_STORES\|GT-CH-0\|348 NS" apps/web/src` phải rỗng.

## Ranh giới

- Không chạm `apps/api/**` hay `packages/contracts/**`.
- Không đổi `FolioLandingView.tsx`, `landing/**`, `chat/**` trong phase này (marketing copy có "45 chi nhánh" — sẽ xử lý ở phase riêng, ghi nhận vào report).

## Acceptance

```bash
cd C:/work-space/worktrees/hr-blockbot-crm-real-data
pnpm --filter web exec tsc --noEmit
pnpm --filter web exec vite build
node --test apps/web/test/web-integration.source-shape.test.mjs
node --test apps/web/test/e2e-revamp-flow.test.mjs   # cần dist vừa build
```

Trả về output từng lệnh và kết quả grep chứng minh hết hardcode.

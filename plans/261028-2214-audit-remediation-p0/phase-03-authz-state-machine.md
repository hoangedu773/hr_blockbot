---
phase: 3
name: authz-state-machine
owner: backend-security
claims: [P0-5, P1-1, P1-2, P2-1]
depends_on: [1]
---

# Phase 03 — AuthZ & state machine

## P0-5 · Employee tự đóng đề tài, không có state machine

**File**: `apps/api/src/models/Project.ts:131-181` (`transitionProject`) · `apps/api/src/routes/projects.ts:234-275`

Hiện trạng: route chỉ kiểm tra quyền ở nhánh `IN_PROGRESS`; `transitionProject` không có whitelist `from → to`.

**Yêu cầu**
1. Trong `Project.ts` khai báo whitelist tường minh, ví dụ:

   ```ts
   const TRANSITIONS: Record<ProjectStatus, Partial<Record<ProjectStatus, ReadonlyArray<"Admin" | "Employee">>>> = {
     DRAFT:          { ASSIGNED: ["Admin"], IN_PROGRESS: ["Admin"] },
     ASSIGNED:       { IN_PROGRESS: ["Admin", "Employee"] },
     IN_PROGRESS:    { PENDING_REVIEW: ["Admin", "Employee"] },
     PENDING_REVIEW: { COMPLETED: ["Admin"], IN_PROGRESS: ["Admin"] },
     COMPLETED:      {},
   };
   ```
   Bảng trên là **gợi ý**; nếu đọc code thấy luồng thật khác (ví dụ Admin cũng được set `PENDING_REVIEW`), điều chỉnh cho khớp `ProjectListView` + `reports.ts` và **ghi lý do vào report phase**. Không được để Employee chạm `COMPLETED`.
2. `transitionProject` nhận thêm `actorRole: "Admin" | "Employee"` (bắt buộc, không optional). Kiểm tra:
   - cặp `(expectedStatus → newStatus)` không có trong whitelist → throw `IllegalTransitionError` (message nêu rõ cặp trạng thái).
   - role không nằm trong danh sách cho phép của cặp đó → throw `ForbiddenTransitionError`.
3. Route `POST /projects/:id/transition`: truyền `actorRole: user.role`; **giữ** check assignee hiện có cho `IN_PROGRESS`; map 2 error mới sang `409 ILLEGAL_STATE_TRANSITION` và `403 FORBIDDEN_TRANSITION`. Mã lỗi `ILLEGAL_STATE_TRANSITION` đã có trong contracts (`index.ts:330`).
4. Mọi call site khác của `transitionProject` (grep toàn `apps/api/src`) phải truyền `actorRole`; nếu là luồng hệ thống (reports review) thì truyền role của user đang thao tác, không hardcode `"Admin"`.

**Acceptance**
- `grep -rn "transitionProject(" apps/api/src` → mọi call site đều có `actorRole`.
- Test thủ công (unit-style với model mock hoặc gọi hàm thuần): `IN_PROGRESS → COMPLETED` với `actorRole: "Employee"` → throw; `PENDING_REVIEW → COMPLETED` với `"Admin"` → pass. Dán output.
- `cd apps/api && npx tsc --noEmit` exit 0.

## P1-1 · IDOR `GET /reports/:id`

**File**: `apps/api/src/routes/reports.ts:71-89`

**Yêu cầu**: dùng `assertInScope` có sẵn ở `apps/api/src/services/rbac.service.ts:27` (hiện **không route nào dùng**). Truyền `ActorContext` từ `req.user` và `ResourceTarget` dựng từ report (`departmentId`, `ownerId`/`createdBy` nếu có). Bắt `RbacDeniedError` → 404 (không phải 403) để không lộ sự tồn tại của tài nguyên.

**Acceptance**: Employee phòng ban A gọi report của phòng B → 404; Admin cùng phòng → 200. Dán output test.

## P1-2 · IDOR `GET /projects/:id`

**File**: `apps/api/src/routes/projects.ts:151-191`

**Yêu cầu**: cùng cơ chế, đối chiếu với scope filter đã có ở list handler (`:32-39`): Admin → `departmentId`; Employee → `assigneeId` hoặc `departmentId`. Không khớp → 404.

**Acceptance**: Employee phòng B gọi project phòng A → 404; đúng scope → 200.

## P2-1 · Admin duyệt report ngoài department scope

**File**: `apps/api/src/routes/reports.ts:92-147`

**Yêu cầu**: thêm `assertInScope` cho nhánh review, cùng quy ước 404.

**Acceptance**: Admin phòng A review report phòng B → 404.

## Ràng buộc chung phase này

- Không sửa `packages/contracts`.
- Không đổi shape response đang có (chỉ thêm mã lỗi mới).
- Mọi thay đổi phải giữ `cd apps/api && npx tsc --noEmit` exit 0.

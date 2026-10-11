---
title: "Phase 1: Nền chung, bảo mật và contracts"
status: pending
---

# Phase 1 — PM: nền chung trước khi chia việc

## Outcome và ownership

Owner: `feat/pm-agentkit`, CWD `C:/work-space/hr-blockbot-pm`.
Được sửa: `packages/contracts/**`, root `package.json`, `pnpm-workspace.yaml`, `pnpm-lock.yaml`, root tooling config cần thiết, `scripts/verify-bootstrap.mjs`, `docs/**`, `plans/**`. Không sửa `apps/**`.
Đọc: README, docs/AGENT-GUIDELINES.md, docs/05-data-model.md, docs/06-api-spec.md, docs/07-auth-rbac.md, manifests/source liên quan; không mở raw datasets hoặc in secrets.

## Gate và thứ tự

Có thể bắt đầu kiểm tra tài liệu và soạn contracts offline ngay. Không cần credential để đọc code hoặc lập mapping. Trước dispatch, PM làm rõ quy định đọc trong `docs/AGENT-GUIDELINES.md`: dev được đọc shared docs/contracts/plan, quyền ghi vẫn theo app.

1. Xác minh `git status`, branch. Ba nhánh dev (`feat/api-backend`, `feat/frontend-web`, `feat/ai-service`) đã có sẵn trên repo. Dev có thể checkout làm việc trực tiếp trên từng nhánh hoặc tạo worktree riêng tùy chọn theo workflow của team.
2. Đề xuất các thao tác Git cần thiết (commit baseline Phase 1, tích hợp sang các nhánh dev) để user phê duyệt trước khi chạy.
3. API owner dọn fallback hardcode trong `apps/api/src/db.ts`, `apps/api/.env.example`; AI owner dọn trong `apps/ai-service/app/agent/tools.py`, `apps/ai-service/.env.example`.
4. Cấu hình Database: Sử dụng kết nối MongoDB Atlas đã có sẵn trong `.env` (`ATLAS_URI` hoặc `MONGODB_URI`). Đảm bảo code backend đọc `process.env.MONGODB_URI || process.env.ATLAS_URI`. Không bắt buộc tạo thêm database mới. Chỉ cần đảm bảo sao lưu trước khi ghi dữ liệu thử nghiệm.

## Contracts và quyết định chặn

- Chốt bảng mapping `employee_code`, `full_name`, `store_raw`, `job_title` sang API DTO và identity. Không suy `job_title` thành role/level; không bịa skills/activeLoad hoặc dùng số 0 giả khi thiếu dữ liệu.
- Role giữ `Admin | Employee`; mapping user-to-employee và scope Admin cần lead xác nhận. Không tự nâng `store_manager` thành Admin. Không có scope hợp lệ thì deny, không mặc định toàn công ty.
- Đề xuất theo docs: prefix thực tế `/api`, detail `/employees/:id` dùng ObjectId, list `{items,paging}`, detail `EmployeeDto` trực tiếp, error `{error:{code,message,details?,correlationId?}}`. Chốt mapping/compatibility trong docs/06 trước freeze; không tự thêm alias route. Mã nhân viên là trường business/search, không giả làm ObjectId.
- Chốt pagination, field null/optional và own-profile allowlist. `EmployeeSummarySchema` chỉ gồm dữ liệu tối thiểu docs cho phép và dataset thực sự có; không tái sử dụng raw `EmployeeSchema` chứa ngân hàng/lý do nghỉ làm public response.
- Thêm schema cho login request/response, refresh response, `/auth/me`, role, summary/detail, paging và error. Refresh token **không** có trong response body; chỉ cookie. Auth session models do API owner triển khai.
- Chốt cấu hình TTL access/refresh, thuật toán hash RT, issuer/audience, cookie Path/Domain/SameSite, allowed origin, chiến lược local HTTPS hoặc ngoại lệ loopback dev được duyệt. Không tự tắt Secure ở production; kiểm thử browser thực tế, không chỉ curl. Docs còn TBD thì ghi quyết định trước code.
- Giữ pipeline đã chốt Zod → OpenAPI → Orval cho subset bootstrap. PM sở hữu schema, OpenAPI generation và generator config; Web sở hữu generated client trong `apps/web/**`. Ghi lệnh, input/output và schema revision; không giả định generator đã có.

## Dependencies và baseline

### Dependency deltas cần PM điều phối (Chờ manifest delta từ owners):
- **API Backend (`apps/api/package.json`):**
  - Cần thêm: `jose` (ký/verify JWT), `argon2` (hash mật khẩu Argon2id), `cookie-parser` (đọc refresh token cookie).
  - Dev dependencies: `@types/cookie-parser`.
  - *Trạng thái:* Chờ API owner thêm vào manifest trên worktree `hr-blockbot-api` ở Phase 2 và gửi delta về cho PM. PM TUYỆT ĐỐI không tự sửa `apps/api/package.json`.
- **Frontend Web (`apps/web/package.json`):**
  - Cần thêm: `@hr-blockbot/contracts: "workspace:*"`.
  - *Trạng thái:* Chờ Web owner thêm vào manifest trên worktree `hr-blockbot-web` ở Phase 3 và gửi delta về cho PM. PM TUYỆT ĐỐI không tự sửa `apps/web/package.json`.
- **Điều phối root lockfile:**
  - PM sẽ gom các manifest deltas đã được phê duyệt, chạy cập nhật `pnpm-lock.yaml` một lần duy nhất tại root, chốt lockfile SHA và baseline SHA cho toàn bộ repo.

### Pipeline Zod → OpenAPI → Orval cho subset bootstrap:
- **Input:** `packages/contracts/src/index.ts` (Single Source of Truth).
- **Vị trí generated OpenAPI:** `packages/contracts/openapi/openapi.json`.
- **Generator config:** Thuộc quyền sở hữu của PM (`pnpm --filter @hr-blockbot/contracts generate:openapi`).
- **Trạng thái hiện tại:** Đã chốt hợp đồng và vị trí đầu ra. Tạm thời hoãn cài đặt tooling (`@asteasolutions/zod-to-openapi`, `orval`) để tránh làm biến động lockfile khi chưa có phê duyệt riêng. Web Phase 3 sẽ tiêu thụ trực tiếp TypeScript types export từ `@hr-blockbot/contracts` (`workspace:*`), không tự viết tay client DTO. Khi subset mở rộng và có phê duyệt manifest delta, PM sẽ kích hoạt script sinh OpenAPI tự động.

Chốt `baseline SHA`, contract revision, mapping decisions và lockfile SHA bằng cơ chế Git được user phê duyệt riêng. Mỗi dev phải xác nhận baseline đã vào branch của họ và contracts đã build. Chỉ đọc file PM không thay thế việc tích hợp code. Plan chưa commit vẫn đọc qua absolute PM path. Nếu chưa được phép tích hợp baseline, báo BLOCKED cho phần phụ thuộc, không tự commit/pull/rebase.

## Acceptance và checks

- [x] Quyền đọc chung/ghi riêng đã rõ trong `docs/AGENT-GUIDELINES.md`; worktree và owner không trùng.
- [ ] [BLOCKED - Phase 2 & 4] API/AI báo đã dọn 4 file chứa fallback; scan an toàn chỉ trả path/count, không in diff chứa secret cũ (thuộc sở hữu của API/AI owners trên worktree riêng).
- [x] Database: Đã có sẵn chuỗi kết nối trong `.env` (`ATLAS_URI`/`MONGODB_URI`); không cần tạo mới DB. Backend đọc `process.env.MONGODB_URI || process.env.ATLAS_URI`.
- [ ] [BLOCKED - Chờ Lead] Mapping identity/scope: Đã đề xuất phương án và ghi nhận vào `docs/06-api-spec.md`, đang chờ Lead xác nhận chính thức; DTO allowlist, routes canonical, pagination và error envelope đã chốt.
- [x] Schema Zod có test: contracts đạt 10/10 test assertions (reject role thứ ba, loại bỏ PII, pagination, error envelope); script scaffold `scripts/verify-bootstrap.mjs` sẵn sàng.
- [ ] [BLOCKED - Chưa làm] OpenAPI generation: script `generate:openapi` chưa sinh file — `@asteasolutions/zod-to-openapi` chưa cài, đang chờ phê duyệt manifest delta. Script hiện thoát exit 1 có chủ đích thay vì báo thành công giả. Mục tiêu: `packages/contracts/openapi/openapi.json`.
- [ ] [BLOCKED - Chờ User duyệt Git] Baseline/lockfile đã được phân phối có phê duyệt: Các lệnh Git đã được đề xuất cụ thể, đang chờ User phê duyệt để thực thi.

Lệnh **đã tồn tại & kiểm chứng đạt**:
- `pnpm --filter @hr-blockbot/contracts typecheck` (Pass, exit 0)
- `pnpm --filter @hr-blockbot/contracts build` (Pass, exit 0)
- `pnpm --filter @hr-blockbot/contracts test` (Pass, 10/10 tests pass, node:test runner)
- `node scripts/verify-bootstrap.mjs --dry-run` (Pass scaffold validation 7/7 suites)

Lệnh **chưa đạt (có chủ đích)**:
- `pnpm --filter @hr-blockbot/contracts generate:openapi` (exit 1 — chưa implement, chờ tooling approval; KHÔNG tính là pass)

### Sửa đổi sau review độc lập (2026-10-11)
- `EmployeeSummarySchema.activeLoad`: bỏ `.default(0)` → `nullable().optional()`, tránh bịa số 0 khi thiếu dữ liệu (đúng ràng buộc phase 1).
- `ErrorCodeSchema`: sửa typo `LOW_CONFIDENCE_ABNSTENTION` → `LOW_CONFIDENCE_ABSTENTION` (đồng bộ `docs/06-api-spec.md`, 4 chỗ).
- `generate:openapi`: đổi từ log "pending" (báo thành công giả) → exit 1 nêu rõ chưa implement.
- Còn tồn: `ApiErrorPayloadSchema.code` dùng `.or(z.string())` làm enum catalog mất tác dụng — cân nhắc siết lại khi API chốt error catalog.

## Dừng và rollback

Mapping chưa thống nhất, baseline chưa phân phối, DB chưa có quyền hoặc build fail: dừng phần phụ thuộc, báo owner. Giữ diff; rollback bằng sửa đảo đúng patch của mình sau khi xem diff. Không `checkout --`, `reset --hard`, clean, stash chung hoặc đưa credential cũ trở lại. Không rollback database tự động.

---
plan: account-provisioning
created: 2026-10-29 10:30 (+07)
status: done (2026-10-29 12:45 +07) — xem docs/25-account-provisioning-runbook.md
decided_by: user (10:28)
---

# Plan: cấp phát tài khoản hàng loạt + 3 Admin (Hoang, Phi, Hoa)

## Quyết định của chủ nhiệm (đã chốt, đừng hỏi lại)

1. **3 tài khoản Admin toàn quyền** — tên đăng nhập: **hoang, phi, hoa**. Toàn quyền hệ thống
   **và** quyền chatbot-admin (cài đặt LLM, hàng đợi duyệt yêu cầu sửa hồ sơ, quản lý
   tri thức Atlas). Khi họ chat, agent nhận `businessRole = "admin"`.
2. **Xoá 5 tài khoản cũ** — nhưng **chỉ xoá sau khi** 3 admin mới đăng nhập được và đã kiểm tra quyền. Trước đó không đụng vào.
3. **Cấp phát hàng loạt cho 2.439 nhân viên** — mỗi nhân viên 1 tài khoản, role theo
   `businessRole` đã backfill (staff 2239 · ptch 89 · sm 80 · am 24 · aom 5).
4. **Đăng nhập KHÔNG dùng email** — đăng nhập bằng **tên đăng nhập cấp sẵn** (mã nhân viên)
   + mật khẩu do quản lý phát. Không cần thu thập email của ai.

## Phát hiện quan trọng (đã kiểm trên Atlas, 10:30)

**Hoang / Phi / Hoa KHÔNG có hồ sơ nhân viên** trong `employees` (Hoang: 0 khớp; Phi/Hoa
chỉ khớp chuỗi con của tên nhân viên khác). ⇒ 3 admin là người văn phòng/Ban điều hành:
tạo User **không gắn employeeId** — `deriveBusinessRole(null, "Admin") = "admin"` đã
hỗ trợ sẵn, không cần hồ sơ.

## Phase P0 — Đổi đăng nhập từ email sang tên đăng nhập (bắt buộc làm trước)

Hiện `LoginRequestSchema` bắt buộc `email` (`packages/contracts/src/index.ts:16-19`) và
`users` định danh bằng email — không thể cấp phát 2.439 tài khoản không email. Cần:

| Việc | Chi tiết |
|---|---|
| Contract | `LoginRequestSchema`: `username` (min 3) + `password`; bỏ bắt buộc `email` |
| User model | thêm `username` (unique, index); `email` thành optional cho admin nếu muốn |
| auth route | tìm user theo `username`; rate-limit key đổi theo `username+ip` |
| Web login form | ô "Tên đăng nhập" thay ô email (`LoginView`) |
| Đổi mật khẩu | thêm `POST /api/auth/change-password` (cần access token) — hiện chưa có, mà mật khẩu cấp phát bắt buộc đổi |

## Phase P1 — 3 Admin + dọn tài khoản cũ

| Việc | Chi tiết |
|---|---|
| Tạo 3 user | `username: hoang / phi / hoa`, `role: "Admin"`, `businessRole: "admin"`, mật khẩu Argon2id **tạm** bắt buộc đổi lần đầu |
| Unique index | `users.username` unique + `users.employeeId` unique sparse |
| Xoá 5 user cũ | `users.deleteMany` + xoá `refresh_sessions` của họ — SAU bước xác minh đăng nhập |
| Xác minh | 3 admin login → `GET /api/auth/me` → quyền Admin trong UI; user cũ không login được |

## Phase P2 — Cấp phát 2.439 tài khoản nhân viên

| Việc | Chi tiết |
|---|---|
| Nguồn dữ liệu | `employees` (2.439, đủ `departmentId`), bỏ qua nhân viên đã có user |
| Tạo user | `role: "Employee"`, `employeeId` gắn đúng hồ sơ, `businessRole` copy từ employee (staff/ptch/sm/am/aom) |
| Mật khẩu | không đặt mật khẩu chung trong repo; sinh mật khẩu tạm ngẫu nhiên xuất file **riêng** cho quản lý phát tay, đánh dấu `mustChangePassword: true` |
| Hiệu năng | bulk_write theo lô 500; sau đó tạo index: `users.email` unique, `users.employeeId` unique sparse |
| Scale Jev | pool 10 key trial ~1.000 gọi/ngày **không đủ** cho 2.439 người — khi ra mắt thật cần 1 key Jev trả phí, hoặc chấp nhận rule-fallback khi hết; ghi rõ trong báo cáo |

## Phase P3 — Chatbot-admin authority

| Việc | Chi tiết |
|---|---|
| Phân quyền chatbot | Admin được: xem hàng đợi duyệt (`GET /change-requests`), cài LLM (`/admin/llm-providers`), quản lý tri thức Atlas (script 08/09 chạy bởi admin) |
| Kiểm chứng | Đăng nhập bằng từng admin → thấy đúng 3 khu vực trên; Employee **không** thấy hàng đợi duyệt |

## Acceptance chung

```bash
cd apps/api && npm test                    # cần Mongo local; hoặc chạy từng file
node --test test/business-role.test.mjs
# tay: 3 admin login + me + thấy Admin UI; 1 nhân viên mẫu login → đúng role;
#      xoá xong user cũ: login cũ 401; count users = 3 + số nhân viên cấp phát
```

## Việc cần từ chủ nhiệm trước khi chạy

1. **Duyệt chạy** — không cần cung cấp email hay gì thêm.
2. Chốt hình thức phát mật khẩu: quản lý phát tay theo file danh sách (mặc định), hay để nhân viên tự đổi ngay lần đầu đăng nhập (`mustChangePassword` đã có trong thiết kế).
3. Xác nhận được phép xoá 5 user cũ ngay trong phiên chạy (kèm backup `users` trước khi xoá).

---

## Kết quả thực thi (2026-10-29 11:47 → 12:50 +07)

Runbook thao tác: `docs/25-account-provisioning-runbook.md`. Số liệu đo trên Atlas `hr_bot`.

| Hạng mục | Kết quả |
|---|---|
| P0 contracts | `LoginRequestSchema` = `username` (min 3) + `password`; thêm `ChangePasswordRequestSchema`; `AuthUser`/`MeResponse` mang `username`, `mustChangePassword` |
| P0 API | login theo `username`, rate-limit key `ip|username`, `POST /api/auth/change-password` (thu hồi mọi refresh session sau khi đổi) |
| P0 web | ô "Tên đăng nhập"; modal bắt buộc đổi mật khẩu khi `mustChangePassword` |
| P1 admin | hoang / phi / hoa: `role=Admin`, `businessRole=admin`, `employeeId=null`, mật khẩu tạm 14 ký tự, `mustChangePassword` |
| P1 dọn cũ | backup 5 user + 18 session → xoá 5 user + 18 session (sau khi 3 admin đăng nhập & kiểm quyền xong) |
| P1 index | `username` unique, `email` unique **sparse**, `employeeId` unique **partial** |
| P2 | 2.439 tài khoản Employee, 5 lô × 500, `businessRole` copy từ employee, mật khẩu tạm 12 ký tự |
| P3 | Admin toàn quyền thấy hàng đợi duyệt + cài đặt LLM + danh sách nhân sự; Employee 403 ở cả ba |
| Tổng `users` | 2.442 (3 admin + 2.439 nhân viên) |

### Lệch so với plan (có lý do, đã kiểm chứng)

1. **`employees.businessRole` chưa hề tồn tại trên Atlas** (2.439/2.439 = `None`), dù plan ghi
   "đã có sẵn". Nguyên nhân: `scripts/seed/10-backfill-business-role.py` lọc
   `UpdateOne({"_id": str(...)})` trong khi `_id` là ObjectId → không cập nhật được dòng nào.
   Đã sửa (giữ ObjectId) và chạy `--apply`: 2.439 cập nhật, phân bố staff 2.239 · ptch 89 ·
   sm 80 · am 24 · aom 5 · admin 2.
2. **`employeeId` dùng unique partial, không phải sparse.** Sparse vẫn đánh index cho
   `employeeId: null`, nên tài khoản admin thứ hai vướng `E11000`. Partial
   (`$type: "objectId"`) mới đúng ý "unique cho hồ sơ, bỏ qua admin".
3. **`email_1` phải dựng lại thành sparse** trước khi tạo admin: index cũ unique không sparse
   chỉ chứa được một document `email: null`. Admin còn phải `$unset` email (không set `null`).
4. **Thêm cờ `isGlobalAdmin`** (ngoài plan). `GET /api/change-requests` và `GET /api/employees`
   trả 403 cho Admin không có `departmentId`, tức 3 admin mới sẽ không vào được hàng đợi duyệt
   — đúng phần P3 yêu cầu. Cờ tường minh giữ nguyên fail-closed cho admin "quên gán phòng ban"
   (có test riêng).
5. **Ngưỡng từ chối**: `MIN_EVIDENCE_LEXICAL` 0.35 → 0.60. `false_answer` 0.50 → 0.20,
   `abstain(out)` 0.50 → 0.80, giá phải trả `abstain(in)` 0.00 → 0.03 và `citation_hit`
   1.00 → 0.97; recall không đổi. Bảng quét đầy đủ trong `apps/ai-service/eval/report-db-lexical.md`.
6. **Harness test**: wrapper tách mỗi file test sang một mongod + database riêng
   (`test_hr_<file>`) và chạy `--test --test-force-exit` từng file; mirror npmmirror đã chết
   (404) nên bỏ mirror mặc định. `attachments-security.test.mjs` được cấp token thật vì route
   đã yêu cầu auth từ commit `e41e4e4`. `chat-gateway.test.mjs` được cấp `AI_LLM_BASE_URL` giả
   vì service fail-closed khi thiếu endpoint (J-5).

### Kiểm chứng đã chạy

- `cd apps/api && npm test` → 7 file, 72 test, 0 fail (chạy 2 lần liên tiếp).
- `npx tsc --noEmit` cho `apps/api` và `apps/web` → sạch.
- `packages/contracts && npm test` → 38/38.
- `eval/run_eval.py --corpus db --retriever lexical` → bảng mới trong report.
- Đăng nhập thật qua HTTP: 3 admin (login → `/auth/me` → hàng đợi duyệt → LLM settings →
  danh sách 2.439 nhân sự) và 6 tài khoản nhân viên mẫu (mỗi `businessRole` một phiếu) →
  đúng role, mọi khu vực quản trị 403.

### Chưa kiểm chứng / còn mở

- `apps/ai-service` pytest: 111 pass, 11 fail — các test này giả định "không có provider key"
  nhưng `apps/ai-service/.env` trên máy đang có key thật (`AI_LLM_API_KEYS`,
  `JEV_USEJEVAI_KEYS`), nên endpoint trả lời thay vì 503. Không liên quan tới thay đổi ngưỡng.
- Chưa có luồng "quên mật khẩu" cho nhân viên; chưa có màn hình quản trị người dùng.


---

## Bổ sung sau khi chạy: quyền CRUD tài khoản (2026-10-29 14:00)

Chủ nhiệm chốt: Admin là quyền cao nhất và phải tự quản lý được tài khoản, gồm cả **hạ role**.
Trước đó quyền này chỉ tồn tại dưới dạng script CLI, không có API/UI.

- `apps/api/src/routes/admin-users.ts`: `GET/POST /api/admin/users`, `PATCH/DELETE /api/admin/users/:id`,
  `POST /api/admin/users/:id/reset-password`.
- Chỉ `role = Admin` **và** `isGlobalAdmin = true`; Admin theo phòng ban và Employee đều 403.
- Chặn tự hạ quyền / tự xoá mình, chặn xoá hoặc hạ Admin toàn quyền cuối cùng.
- `Employee` không mang `businessRole = admin`; hạ role lấy lại bậc từ hồ sơ, nâng lên Admin thì bậc = `admin`.
- Đổi role thu hồi mọi refresh session; middleware đọc `role` từ DB nên hiệu lực ngay.
- Web: mục **Tài khoản** trong CRM (chỉ Admin), có tìm kiếm, đổi role, bật/tắt toàn quyền,
  đặt lại mật khẩu, xoá, và chọn hồ sơ nhân viên khi tạo.
- Kiểm chứng: `admin-users.test.mjs` 14 test; chạy thật trên Atlas với `hoang`
  (liệt kê 2.442 tài khoản, tạo → đăng nhập → hạ role → mất quyền ngay → đặt lại MK → xoá).

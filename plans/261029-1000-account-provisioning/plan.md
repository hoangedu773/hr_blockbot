---
plan: account-provisioning
created: 2026-10-29 10:30 (+07)
status: ready-for-execution (phiên sau)
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

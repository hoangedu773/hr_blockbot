# Runbook — cấp phát tài khoản (username = mã nhân viên)

> Thực hiện lần đầu 2026-10-29 theo `plans/261029-1000-account-provisioning/plan.md`.
> Mọi con số dưới đây là số đo thật trên Atlas `hr_bot`, không phải ước lượng.

## 1. Mô hình đăng nhập

- Đăng nhập bằng **tên đăng nhập cấp sẵn** (`username`), **không dùng email**.
  Nhân viên nhận `username = employee_code` viết thường (vd `GT-CH18030009` → `gt-ch18030009`).
- Mật khẩu do quản lý phát tay; `mustChangePassword = true` buộc đổi ở lần đăng nhập đầu
  qua `POST /api/auth/change-password` (web hiện modal chặn cho tới khi đổi xong).
- `users` có 3 index: `username` unique, `email` unique **sparse** (admin có thể có email),
  `employeeId` unique **partial** (`$type: "objectId"` — admin để `employeeId: null` nên
  sparse thường sẽ chặn tài khoản admin thứ hai).

## 2. Phân quyền

| Loại | `role` | `businessRole` | `employeeId` | `isGlobalAdmin` |
|---|---|---|---|---|
| Ban điều hành (hoang, phi, hoa) | `Admin` | `admin` | `null` | `true` |
| Nhân viên | `Employee` | copy từ `employees.businessRole` | ObjectId hồ sơ | `false` |

`isGlobalAdmin = true` là cờ **tường minh**: Admin không gắn hồ sơ nhân viên thì xem được
toàn bộ nhân sự và toàn bộ hàng đợi duyệt. Admin có hồ sơ vẫn bị giới hạn theo
`departmentId`; admin "quên gán phòng ban" vẫn fail-closed (403).

## 3. Lệnh cấp phát

Chạy từ `apps/api` sau `npm run build` (script đọc model từ `dist/`):

```bash
node scripts/provision-accounts.mjs backup                      # data/backups/users-<ts>.json
node scripts/provision-accounts.mjs indexes --apply             # email sparse + username unique
node scripts/provision-accounts.mjs admins --apply [--rotate]   # hoang / phi / hoa
node scripts/provision-accounts.mjs delete-legacy --backup <file> --apply
node scripts/provision-accounts.mjs indexes --apply             # thêm username/employeeId unique
node scripts/provision-accounts.mjs employees --apply [--limit N]
node scripts/provision-accounts.mjs report
```

Không có `--apply` thì mọi lệnh chỉ in kế hoạch. Mật khẩu tạm **chỉ** ghi ra
`data/accounts/admins-<ts>.csv` và `data/accounts/employees-<ts>.csv` (đã gitignore) —
không in ra stdout, không gửi qua chat/email nhóm.

`employees.businessRole` phải có trước khi cấp phát; script dừng nếu thiếu:

```bash
python scripts/seed/10-backfill-business-role.py --apply
```

## 4. Kết quả lần chạy 2026-10-29

- Backup: 5 user + 18 refresh session (`data/backups/users-20261029-120856.json`).
- 3 admin tạo mới, đăng nhập + `/auth/me` + hàng đợi duyệt + cài đặt LLM + danh sách
  nhân sự đều 200; 5 tài khoản email cũ đã xoá kèm 18 session.
- 2.439 tài khoản nhân viên tạo trong 5 lô 500; tổng `users` = 2.442.
- Phân bố `businessRole`: staff 2.239 · ptch 89 · sm 80 · am 24 · aom 5 · **admin 2**
  (2 hồ sơ có `job_title` chứa OD/OM). Hai người này là `role: Employee` nên **không**
  vào được khu vực quản trị — nếu cần quyền quản trị thì phải nâng `role` riêng.
- **1.699 / 2.439 hồ sơ đang `status: inactive`** (đã nghỉ) vẫn được cấp tài khoản theo
  quyết định "mỗi nhân viên 1 tài khoản". Cột `status` có trong file CSV để quản lý
  quyết định phát hay không.

## 5. Việc còn lại trước khi ra mắt thật

- **Jev**: pool 10 key trial ~1.000 gọi/ngày không đủ cho 2.442 người dùng; cần key trả
  phí hoặc chấp nhận rule-fallback khi hết quota.
- Phát phiếu mật khẩu tay; thu hồi file CSV sau khi phát xong.
- Chưa có luồng "quên mật khẩu" — quản lý phải đặt lại bằng script (`admins --rotate`
  chỉ áp dụng cho 3 admin; nhân viên cần bổ sung lệnh riêng khi có yêu cầu).

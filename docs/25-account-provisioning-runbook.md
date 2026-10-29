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

## 2. Quy luật cấp tài khoản (nguồn: `apps/api/scripts/lib/account-rule.mjs`)

```
username = mã nhân viên, viết thường          GT-CH18030009 -> gt-ch18030009
password = "Guta@" + 8 ký tự lấy từ HMAC-SHA256(ACCOUNT_PASSWORD_SECRET, username)
           bảng ký tự ABCDEFGHJKLMNPQRSTUVWXYZ23456789 (bỏ I/O/0/1)  -> vd Guta@N67S8EZB
```

- **Tất định**: cùng secret + cùng username luôn ra cùng mật khẩu. Không cần giữ file
  2.439 mật khẩu làm nguồn sự thật — in lại phiếu lúc nào cũng được.
- **Không đoán được**: thiếu `ACCOUNT_PASSWORD_SECRET` (≥ 32 ký tự, trong `.env`, không
  commit) thì không suy ra được mật khẩu của người khác. Đây là lý do **không** dùng luật
  `Guta@<mã nhân viên>`: mã nhân viên nằm trên bảng lương, sổ ca, bảng chấm công — đồng
  nghiệp biết mã của nhau, nên luật đó cho phép đăng nhập chéo cho tới lần đổi đầu tiên.
- 8 ký tự = 40 bit; `mustChangePassword = true` buộc đổi ngay lần đầu nên đây chỉ là
  mật khẩu tạm, không phải mật khẩu dài hạn.
- Mất secret = phải cấp lại toàn bộ (giống mất file mật khẩu). Secret hiện có trong `.env`
  máy chạy cấp phát; khi deploy phải đặt cùng biến đó trong env của Render.

Lệnh:

```bash
node scripts/provision-accounts.mjs passwords                            # in phiếu xem trước, KHÔNG ghi DB
node scripts/provision-accounts.mjs passwords --apply                    # chỉ Employee
node scripts/provision-accounts.mjs passwords --include-admins --apply   # cả 3 admin
```

Dry run xuất `employee-passwords-<ts>-preview.csv` — cùng secret thì phiếu này **trùng khít**
phiếu đã phát (đã đối chiếu 2.442/2.442 dòng), nên mất phiếu chỉ cần chạy lại lệnh không có
`--apply`. `--apply` ghi `employee-passwords-<ts>.csv` (username, mật khẩu tạm, họ tên, cửa hàng,
bậc, trạng thái) và thu hồi mọi refresh session của các tài khoản bị đổi.

## 3. Phân quyền

| Loại | `role` | `businessRole` | `employeeId` | `isGlobalAdmin` |
|---|---|---|---|---|
| Ban điều hành (hoang, phi, hoa) | `Admin` | `admin` | `null` | `true` |
| Nhân viên | `Employee` | copy từ `employees.businessRole` | ObjectId hồ sơ | `false` |

`isGlobalAdmin = true` là cờ **tường minh**: Admin không gắn hồ sơ nhân viên thì xem được
toàn bộ nhân sự và toàn bộ hàng đợi duyệt. Admin có hồ sơ vẫn bị giới hạn theo
`departmentId`; admin "quên gán phòng ban" vẫn fail-closed (403).

## 4. Lệnh cấp phát

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

## 5. Kết quả lần chạy 2026-10-29

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

## 6. Quản trị tài khoản sau khi cấp phát (API + UI)

Admin **toàn quyền** (`isGlobalAdmin = true`) quản lý tài khoản trực tiếp, không cần script:

| Việc | Endpoint | Ghi chú |
|---|---|---|
| Danh sách + tìm | `GET /api/admin/users?q=&role=&businessRole=&page=&limit=` | Không bao giờ trả `passwordHash` |
| Tạo | `POST /api/admin/users` | Bỏ trống `password` → server sinh mật khẩu tạm, trả về **một lần** |
| Đổi role / hạ quyền | `PATCH /api/admin/users/:id` | `role`, `businessRole`, `isGlobalAdmin`, `employeeId`, `email`, `mustChangePassword` |
| Đặt lại mật khẩu | `POST /api/admin/users/:id/reset-password` | Trả mật khẩu tạm một lần, thu hồi mọi phiên |
| Xoá | `DELETE /api/admin/users/:id` | Thu hồi phiên + bỏ liên kết `employees.userId` |

UI: CRM → mục **Tài khoản** (chỉ hiện với `role = Admin`), có tìm kiếm, đổi role bằng
dropdown, bật/tắt quyền toàn hệ thống, đặt lại mật khẩu và xoá.

Chốt an toàn đã cài (đều có test trong `apps/api/test/admin-users.test.mjs`):

- Chỉ Admin **toàn quyền** gọi được; Admin bị giới hạn phòng ban và Employee đều 403.
- Không tự hạ quyền / tự bỏ cờ toàn quyền / tự xoá tài khoản đang đăng nhập.
- Hệ thống luôn phải còn ít nhất một Admin toàn quyền.
- `role = Employee` không được mang `businessRole = admin`; nâng lên Admin thì bậc tự thành `admin`,
  hạ xuống Employee thì lấy lại bậc từ hồ sơ (không có hồ sơ → `staff`).
- Đổi role thu hồi toàn bộ refresh session. Access token cũ vẫn còn hạn nhưng middleware đọc
  `role` từ DB nên mất quyền ngay ở request kế tiếp (đã kiểm bằng HTTP thật).

## 7. Việc còn lại trước khi ra mắt thật

- **Jev**: pool 10 key trial ~1.000 gọi/ngày không đủ cho 2.442 người dùng; cần key trả
  phí hoặc chấp nhận rule-fallback khi hết quota.
- Phát phiếu mật khẩu tay; thu hồi file CSV sau khi phát xong.
- Chưa có luồng "quên mật khẩu" — quản lý phải đặt lại bằng script (`admins --rotate`
  chỉ áp dụng cho 3 admin; nhân viên cần bổ sung lệnh riêng khi có yêu cầu).

# Hồ sơ phân công SM V1

Đây là sổ ghi nhận phân công theo yêu cầu chủ dự án ngày 03/11/2026, dùng trong
mô hình mô phỏng nhiều outlet. Không phải quy định bổ nhiệm chính thức của GUTA.

## Căn cứ phân biệt vị trí

- `PRIMARY`: SM phụ trách chính tại nơi công tác đã canonical.
- `ADDITIONAL`: kiêm nhiệm outlet khác, bắt buộc có thời hạn; không có SM chính
  khác trùng thời gian ở outlet đó.
- `SUPERVISORY`: SM giám sát tại outlet được chỉ định.
- `TEMPORARY`: thay tạm một hồ sơ PRIMARY/ADDITIONAL đã xác nhận; bắt buộc có
  thời hạn nằm trong phân công gốc, không thay chính mình hoặc trùng người thay.

Hồ sơ có ID nhân sự/outlet, nguồn SIMULATION_APPROVED hoặc DOCUMENTED_ASSIGNMENT,
tham chiếu căn cứ, ngày hiệu lực, lý do, người đề nghị, người xác nhận và lịch sử.
Cấp bậc vẫn UNKNOWN: không suy SM1/2/3 từ loại phân công. Hai loại SM vẫn dùng
profile `sm`; vị trí không tự cấp capability, thay graph hay thay chức danh gốc.

## Quyền và quy trình

Tận dụng quyền HR đã có: `employees.update_other` gửi đề nghị ghi nhận;
`employees.review` xác nhận/từ chối/thu hồi, kiểm tra cả home scope của nhân sự
và outlet phân công. Người xác nhận phải khác người đề nghị và người nhận.
Không thêm role/capability hoặc cấp grant. system_admin không có đặc quyền HR.

PENDING → APPROVED/REJECTED; APPROVED → REVOKED. SCHEDULED/EFFECTIVE/EXPIRED
là trạng thái đọc theo thời gian, không cần scheduler đổi dữ liệu. Giao diện
không gọi hồ sơ đề nghị là bổ nhiệm đã hiệu lực. Thu hồi cần căn cứ bàn giao;
các công việc, grant và delegation phải xử lý bằng workflow hiện hành riêng.
Không có API sửa/xóa lịch sử hay sửa điều khoản đã đề nghị; tạo đề nghị mới
khi cần thay đổi và giữ hồ sơ cũ. Thu hồi một phân công không tự sửa lịch sử.

Không triển khai thăng chức hoặc mở `promotion.approve`. Đây là xác nhận chứng
cứ phân công cho nhân sự vốn đã có chức danh SM được xác minh; không thể dùng
để chuyển staff thành SM, đổi lương, grade hoặc software profile. Phê duyệt
hiện tại không phải quyền phê duyệt một quyết định nhân sự mới ngoài phạm vi đó.

## API / giao diện

- GET/POST `/api/employees/:id/sm-appointments`
- GET `/api/employees/:id/sm-appointments/:appointmentId`
- POST `/api/employees/:id/sm-appointments/:appointmentId/decision`
- GET `/api/stores/:id/sm-appointments`: chỉ các phân công đã xác nhận đang hiệu
  lực, lọc store và reporting trước count/paging, không trả lịch sử đầy đủ.

Nhân sự → chi tiết SM → Vị trí và phân công SM. HR gửi đề nghị; HR độc lập mở
cùng nhân sự để xác nhận. SM xem ở Hồ sơ của tôi. Chi tiết cửa hàng có phần
Phân công SM đã xác nhận, tách riêng danh sách lấy từ management graph.

Không import/bổ nhiệm hàng loạt từ management_relations. Không có hồ sơ thì ghi
chưa xác nhận, không giả lập lịch sử phê duyệt. Quan hệ mô phỏng cũ không tự biến
thành quyết định bổ nhiệm thật. Không upload tài liệu nội bộ trong tính năng này.

## Tính nhất quán

Collection mới `sm_appointments`, unique `(requestedBy, clientRequestId)`,
request hash chống dùng lại ID với payload khác; kiểm tra index trước ghi.
CRM cross-process writer lock + version CAS bảo vệ phê duyệt đồng thời và
kiểm tra trùng khoảng thời gian SM chính. Không dùng index duy nhất theo
employeeId: một nhân sự có thể có các phân công độc lập và kiêm nhiệm.
Audit hash-chain có actor/time/reason/before/after, state hash, từ chối sửa âm
thầm và giới hạn document 8 MiB/1.000 sự kiện. Không phải neo Blockchain công khai.

Rollback code: deploy lại commit nền tương thích, giữ collection chỉ để đọc;
không drop hồ sơ, ghi đè audit, hồi sinh session hoặc hoàn nguyên securityVersion.
Vì không sửa quyền/graph, rollout không cần migration users hoặc re-login.

## Giới hạn rõ ràng

Sổ phân công không tự tạm ngưng quyền SM vắng mặt, đổi người duyệt, chuyển nhiệm
vụ hoặc xác nhận bàn giao thực tế. Thay tạm chỉ trở thành quyền vận hành khi
delegation/grants và bàn giao tương ứng được duyệt bằng Authorization/HRM.
Quy trình thăng chức/chuyển vị trí có xử lý quyền tự động vẫn cần đặc tả riêng.

Kiểm thử: `pnpm --filter api test:sm-appointments`;
browser thực Web → API → DB local riêng:
`node apps/web/test/sm-appointments.integration.mjs` (sau build).

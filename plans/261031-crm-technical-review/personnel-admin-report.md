# CRM tiếp nối — quản trị hồ sơ và phòng ban

31/10/2026, dirty `main` vẫn từ `71bd202`. Tiếp tục theo yêu cầu “tiếp tục”, không push/deploy/sửa Atlas/tài khoản thật; không thay đổi mã nguồn Python/AI. Báo cáo này cập nhật phần F1 còn thiếu của `review-report.md`, không thay thế quy trình consent đã chốt.

## Đã bổ sung nghiệp vụ thật

| Chức năng | Web / API / DB | Kiểm soát |
|---|---|---|
| Tạo nhân viên | Form mã/họ tên/đơn vị/5 cấp bậc/kỹ năng/điện thoại/ngày vào làm → POST `/api/employees` → employee + creation history | Scoped Admin đúng đơn vị; global Admin chọn đơn vị đã biết. Không tạo login, không cấp role, không tạo KPI hoặc tự gắn nhãn hồ sơ hoàn tất |
| Sửa thông tin thường của nhân viên | Danh mục → Chi tiết → Chỉnh sửa → GET `/api/employees/:id/management`, PATCH có expectedVersion → profile history | Quản lý đúng scope; fullName/skills/phone. Không đổi mã, đơn vị, trạng thái hoặc bỏ qua approval field nhạy cảm |
| Tạo phòng ban | Quản trị phòng ban → tạo mới → POST `/api/departments` | Chỉ global Admin, vì scoped Admin không được tự tạo phạm vi ngoài đơn vị đã cấp |
| Xem/sửa phòng ban | GET/PATCH `/api/departments/:id` với version CAS → metadata/history | Global hoặc Admin đúng ID/phạm vi. Tên/mô tả/người phụ trách thay đổi; code/ID không đổi |
| Người phụ trách | Chọn từ nhân viên active trong đơn vị, có tải tiếp danh sách | Chỉ metadata tổ chức, không đổi User.role/isGlobalAdmin/job_title; gỡ phụ trách bằng null được |
| Lỗi / duplicate / race | Conflict giữ bản nháp; không tự retry ghi; lỗi index readiness có thông báo | DB uniqueness key cho API creates, CAS cho edit; duplicate không tạo bản ghi thứ hai |

Generic employee list/detail/matching vẫn trả summary, không tự thêm phone/hiredAt vào đó. Management là endpoint admin có scope riêng, allowlist rõ, không có ngân hàng/CCCD/lương/lý do nghỉ. Cấp bậc/ngày/chức danh của hồ sơ hiện hữu tiếp tục đi qua request→approval từ đợt trước.

## Tương thích và uniqueness

Thêm model `Department` trên chính collection đã có; hỗ trợ `_id` ObjectId/string và name alias legacy. Employee create giữ nguyên key đơn vị người quản trị chọn nếu danh mục đã biết; không tự đổi raw unit/code thành ObjectId và không backfill hồ sơ cũ. Mã phòng ban trùng một đơn vị legacy đang dùng bị dừng với `DEPARTMENT_MAPPING_REQUIRED`, tránh tạo song song hai định danh tổ chức.

Hai partial unique indexes kỹ thuật chỉ phủ bản ghi mới có key: `f1_personnel_creation_key` trên personnelKey và `f1_department_creation_key` trên creationKey. Không thay index cũ hoặc yêu cầu dữ liệu cũ tự hết duplicate. Trước tạo, kiểm mã hiện hữu trong employeeCode/employee_code hoặc departments.code/_id; mã mới trim nhưng giữ case, không tự đặt quy tắc case-folding cho dữ liệu nhập cũ. API phải xác nhận unique index sẵn sàng, nếu không trả 503 thay vì ghi không có bảo vệ race.

Các index chỉ được tạo/kiểm trong Mongo test riêng ở đợt này. Khi rollout có phép, cần dry-run/approve index và kiểm autoIndex; chưa xác minh trên Atlas. External import ghi trực tiếp mà không dùng creation keys **không** nằm trong bảo đảm concurrent API creates: cần protocol import/migration của nhóm. Đây là giới hạn công khai, không tuyên bố đã giải quyết uniqueness toàn bộ dữ liệu legacy/import.

Mọi phép thử xác nhận User collection và evaluations không đổi. Employee profile_history mới lưu actor/thời gian/before-after; department history append-only qua API, bounded 1000 events/8 MiB. Đây không phải blockchain/WORM bảo vệ khỏi DB admin.

## Kiểm thử

| Gate mới nhất | Kết quả |
|---|---|
| API regression, 18 file | **215/215 PASS**, 0 fail / 0 skip / 0 cancelled |
| Shared contracts | **45/45 PASS** |
| Web regression | **62/62 PASS**, bao gồm mandatory E2E |
| Browser thật → API → Mongo riêng | **8 nhóm PASS**, 0 runtime exception |
| Typecheck + build toàn monorepo | PASS; giữ 3 CSS warnings landing cũ |
| Diff whitespace | `git diff --check` PASS |

Các bộ 10 personnel / 15 technical review / 13 consent / 4 EVM local là thành phần của 215 API, không cộng trùng. EVM vẫn chỉ local, chưa neo công khai. Lần web đầu đạt 61/62 vì fixture phản hồi chat trả ngay làm một lần Enter mới hợp lệ bị tính là “duplicate”; đã làm test tất định bằng chờ request đầu thật sự pending rồi giữ response gate trong suốt Enter spam. Giữ nguyên assertions một request/user-message, conversationId và HTML escaping; không đổi production chat/AI. Log lỗi cũ `personnel-web-regression.log`, log cuối xanh `personnel-web-final.log`.

- Bộ API riêng `personnel-admin.test.mjs`: 10 ca đã PASS — create/scope/validation/PII separation/legacy alias/duplicates/concurrent create/CAS/in-unit manager/missing uniqueness index; snapshot toàn bộ users/evaluations sau mỗi ca.
- Browser thật → API → Mongo riêng: đã chạy create department → create employee → edit ordinary fields → select manager/edit department → DB verification/mobile → duplicate create giữ draft; không phát sinh login/KPI. Được thêm thành nhóm thứ tám trong CRM browser integration.
- Log cuối: `test-results/personnel-api-regression.log`, `personnel-contracts.log`, `personnel-typecheck.log`, `personnel-build.log`, `personnel-web-final.log`, `personnel-browser-regression.log`; E2E độc lập `personnel-required-e2e.log`.
- Ảnh đã xem: `test-results/crm-personnel-department-mobile.png`. Modal fit 390px; full-page screenshot có nền ngoài viewport từ layout hiện hữu, không dùng ảnh để tuyên bố toàn bộ CRM đã đạt visual/Lighthouse audit.

## Còn lại — không tự đặt chính sách

FR-005 đã có create employee + edit ordinary profile + department create/edit, nhưng **chưa gọi là full CRUD/HR lifecycle**. Archive/reactivate/delete nhân viên, chuyển đơn vị khi còn việc, đổi mã/gộp/xóa phòng ban và backfill imported aliases vẫn cần quy định của nhóm. Không mở unrestricted PATCH/DELETE để lấp checklist.

Các hạng mục nghiệm thu còn lại không thay đổi: chatbot write executor và schema adapter `assigneeId/assigneeIds`; Agenda deadline jobs + durable/realtime delivery; KPI cycle/formula/model/publish/trends; pagination profile queue/inbox; audit retention/archive; public-chain config/deploy/UAT; Lighthouse/Postman/UAT người thật/deploy khi được phép. Phân công và ưu tiên chi tiết vẫn trong `review-report.md`; phần của Hoàng/Hòa không bị loại khỏi nghiệm thu tích hợp.

# CRM — báo cáo triển khai và đối chiếu phạm vi

> Cập nhật tiếp nối: phần xin đổi/từ chối/chuyển giao ở báo cáo này là ảnh chụp **trước** khi chủ dự án chốt quy trình mới. Đã có triển khai tiếp nhận/phê duyệt/bàn giao và kiểm thử tại [kế hoạch tiếp nối](../261031-assignment-consent/plan.md), theo [ADR-021](../../docs/03-decision-records/ADR-021-assignment-consent-handover-hash-proof.md). Không dùng phần “chưa chốt Q-10/Q-11” bên dưới làm trạng thái hiện tại. Các số kiểm thử 173/43/62 là của đợt trước, không phải số cuối đợt tiếp nối.

Ngày: 31/10/2026. Nền mã nguồn mới nhất đã lấy về: `71bd202`, nhánh `main`. Lần kiểm tra remote cuối vẫn cùng commit. Các thay đổi của đợt này nằm ở working tree trên `main`, chưa commit/push/deploy.

## 1. Kết quả đã triển khai

### Công việc và nghiệm thu

- Mở phân hệ **Công việc & nghiệm thu** trong CRM, dùng API thật thay vì duyệt bằng một nút chuyển trạng thái chung.
- Tạo/sửa tiêu đề, mô tả, kỹ năng yêu cầu, phòng ban, ngày hạn theo giờ Việt Nam; chọn phòng ban từ danh mục trong phạm vi tài khoản.
- Chọn người đang hoạt động thuộc đúng phòng ban; tìm kiếm và tải tiếp nhân sự, không giới hạn ngầm vào 100 người đầu tiên.
- Tìm công việc theo nội dung; lọc trạng thái, phòng ban, quá hạn, việc của tôi; phân trang và giữ bộ lọc trên URL. “Quá hạn” là điều kiện dẫn xuất, không phải trạng thái thứ sáu.
- Người được giao bắt đầu, ghi tiến độ, nộp nội dung và tối đa 10 liên kết minh chứng HTTP/HTTPS. Đây là lưu liên kết, **không phải** chức năng tải tệp lên máy chủ.
- Quản lý đọc nội dung báo cáo thật, trả lại kèm lý do, nhận bản nộp mới và nghiệm thu. Bản bị từ chối không bị xoá; hoàn tất đặt tiến độ 100% và ngăn sửa sau nghiệm thu.
- Chi tiết hiển thị người nhận, người nộp/người duyệt, thời gian, nội dung và lịch sử thao tác. Người duyệt chưa có bản ghi nhân sự sẽ được hiển thị bằng định danh, không bịa tên.
- Kiểm soát phiên bản ở sửa/giao/bắt đầu/tiến độ/nộp/duyệt; xung đột trả 409. Biểu mẫu giữ nội dung đang nhập, tải phiên bản mới và không tự ghi lại.

### Dữ liệu và phân quyền

| Tài khoản | Quyền thực tế ở module công việc |
|---|---|
| Admin toàn hệ thống (`isGlobalAdmin`) | Đọc mọi đơn vị; chọn đơn vị, tạo/sửa/giao, duyệt báo cáo người khác |
| Admin theo đơn vị | Cùng các thao tác quản trị nhưng chỉ trong đơn vị được gán |
| Employee | Đọc việc được giao hoặc cùng đơn vị theo chính sách có sẵn; chỉ cập nhật/nộp việc được giao cho mình |
| Tài khoản chưa liên kết/chưa có phạm vi | Bị chặn, không rơi về quyền toàn hệ thống |

- Chức danh SM/AOM và cấp bậc Intern–Lead không tự mở quyền hệ thống.
- Không cho tự duyệt báo cáo; chặn cả trường hợp người nộp được định danh bằng user ID hoặc employee ID.
- Chặn đọc/ghi đối tượng ngoài phạm vi ở backend, không chỉ ẩn nút.
- Sửa lỗi lịch sử khởi tạo `from: null` không hợp lệ trong model cũ.
- Báo cáo mới lưu trong `projects.reports[]`, cùng lần cập nhật trạng thái/phiên bản/lịch sử. Giới hạn 100 bản nộp mỗi công việc; không dùng transaction đa collection.
- `reports` cũ vẫn đọc được; bản ghi riêng được cập nhật như projection tương thích. Nếu projection lỗi, báo cáo canonical vẫn đọc/duyệt được. Projection có projectVersion để một bản “chờ duyệt” đến muộn không ghi đè kết quả đã duyệt.
- Không có migration/backfill trên Atlas trong đợt này. Projection chưa có worker tự sửa lại; canonical read là cơ chế bảo toàn dữ liệu hiện tại.
- Thêm chỉ mục phạm vi/thời gian, trạng thái/hạn, định danh báo cáo nhúng trong model; chưa chạy cập nhật chỉ mục trên production từ phiên làm việc này.

### Danh mục nhân sự và tổng quan

- Danh mục nhân sự có tìm kiếm, cấp bậc, trạng thái, đơn vị, phân trang, chi tiết tối thiểu và chống phản hồi tìm kiếm cũ ghi đè kết quả mới.
- Kiểm tra đầu vào bộ lọc/phân trang; phản hồi allowlist không có ngân hàng, CCCD hoặc mật khẩu.
- Tổng quan nhân sự/cửa hàng được giới hạn theo người đang đăng nhập; không trả tổng toàn chuỗi cho quản trị theo đơn vị hoặc nhân viên.
- Doanh thu và đúng giờ vẫn hiện chưa đủ dữ liệu theo ADR-020; không đổi `null` thành số giả.
- Nút Telegram không còn báo gửi thành công khi chưa cấu hình kênh gửi.
- Giữ nguyên các module nhóm đã làm đúng: cửa hàng CRUD, hồ sơ cá nhân, yêu cầu thay đổi/duyệt hồ sơ, tài khoản cấp sẵn và cài đặt provider. Kiểm thử hồi quy bao phủ các module này; không phải viết lại toàn bộ chúng.

## 2. Giao diện và Antigravity

Đã tìm kết nối plugin và lệnh cục bộ Antigravity/Anti nhưng không có kết nối khả dụng. Không có bàn giao cho Anti nào đã thực hiện. Giao diện được triển khai trực tiếp theo `docs/DESIGN.md`: nền trung tính, bảng nghiệp vụ gọn, ít trang trí, dùng hệ token chung, loading/error/empty/retry.

Hộp thoại có giữ/trả focus, Tab/Shift+Tab, Escape, nền không tương tác và danh sách chọn nằm trong lớp hộp thoại. Đã xem ảnh kết quả desktop và điện thoại; kiểm thử thực tế có màn hình 390px và chế độ giảm chuyển động. Bộ hồi quy có thêm các kích thước 320/375px cho phần giao diện chung.

## 3. API chính được hoàn thiện

| API | Mục đích |
|---|---|
| `GET /api/departments` | Danh mục chỉ đọc, đúng phạm vi |
| `GET/POST /api/projects` | Danh sách/bộ lọc và tạo việc |
| `GET/PATCH /api/projects/:id` | Chi tiết và sửa có kiểm tra phiên bản |
| `POST /api/projects/:id/assign` | Giao người đang hoạt động đúng đơn vị |
| `POST /api/projects/:id/transition` | Bắt đầu; không được lách bước nộp/duyệt báo cáo |
| `POST /api/projects/:id/progress` | Tiến độ có expectedVersion |
| `GET /api/reports?projectId=...` | Lịch sử báo cáo, phân trang, chỉ việc được phép đọc |
| `POST /api/reports` | Nộp báo cáo và chuyển chờ nghiệm thu cùng một lần ghi |
| `GET /api/reports/:id` | Báo cáo DTO có `id`, không trả raw document |
| `POST /api/reports/:id/review` | Duyệt/trả lại đúng báo cáo, scope và phiên bản |

Client cũ gọi cập nhật tiến độ phải bổ sung expectedVersion. Dữ liệu báo cáo dùng `id` như shared contract, không dựa vào Mongo `_id` trong response. Hạn công việc vẫn chấp nhận thiếu/null để tương thích baseline; vì vậy chưa được tuyên bố đạt yêu cầu bắt buộc hạn của FR-006 nếu nhóm chọn áp dụng chặt cho mọi bản ghi mới.

## 4. Kiểm thử và khả năng tái lập

- Tất cả thử nghiệm dữ liệu chạy với MongoDB loopback và database `test_*` riêng; không tạo/sửa/xoá dữ liệu Atlas, không cấp lại tài khoản hay mật khẩu thật.
- Browser integration mới dùng bundle React thật → Express thật → MongoDB riêng, đăng nhập Admin và Employee bằng mật khẩu fixture. Không gọi Render, Atlas, dịch vụ AI hoặc provider ngoài.
- Đã kiểm tra tạo/giao/bắt đầu/tiến độ, xung đột thật giữa hai người dùng, giữ bản nháp, nộp/trả lại/nộp lại/duyệt, kiểm tra trạng thái trong Mongo, bàn phím và mobile.
- Bộ attachment cũ phụ thuộc tệp riêng không có trong clone. Đã chuyển kiểm thử sang fixture PDF/PNG tổng hợp trong thư mục tạm được sở hữu và dọn đúng phạm vi; không dùng fixture để giả tài liệu GUTA thật. Cấu hình tuỳ chọn `ATTACHMENTS_DATA_ROOT` hỗ trợ dữ liệu triển khai thật mà vẫn giữ chặn path traversal.
- Các kỳ vọng giao diện cũ như “+ New Chat”, “Chủ đề mẫu”, badge landing đã xoá được đồng bộ với nhãn hiện tại. Không sửa giao diện của nhóm để khôi phục nhãn cũ cho vừa test.

Lệnh tái lập: `pnpm install --frozen-lockfile`, `pnpm -r run build`, `pnpm -r typecheck`, `pnpm --filter @hr-blockbot/contracts test`, `pnpm --filter api test`, `node --test apps/web/test/*.test.mjs`, `pnpm test:crm`.

### Kết quả lượt cuối — mọi tiến trình đã kết thúc

| Kiểm tra | Kết quả |
|---|---|
| `pnpm -r typecheck` | PASS cả contracts/API/web |
| `pnpm -r run build` | PASS; 3 warning bộ tối ưu CSS landing có sẵn, không có lỗi build |
| Contracts | 43/43 PASS |
| API, tổng 14 tệp test | 173/173 PASS, không skip |
| Web, toàn bộ `*.test.mjs` | 62/62 PASS, không skip |
| E2E bắt buộc chạy riêng lần cuối | 17/17 PASS, 0 console/pageerrors; đã nằm trong 62, không cộng hai lần |
| CRM browser integration thật | PASS 5 nhóm: tạo/giao; tiến độ + xung đột giữ bản nháp; trả lại/nộp lại; nghiệm thu + kiểm DB; bàn phím/mobile/runtime |
| `git diff --check` | PASS |

Log cục bộ trong `test-results/`: `api-crm-final.log`, `contracts-crm-final.log`, `web-crm-final.log`, `crm-existing-e2e-final.log`, `crm-browser-final.log`, `crm-typecheck-final.log`. Ảnh đã xem: `crm-work-admin.png`, `crm-work-mobile.png`. Đây là artefact kiểm thử, không phải dữ liệu vận hành thật.

Tổng API 173 được cộng trực tiếp từ dòng `pass` của từng tệp; số 190 ở một cập nhật trong hội thoại là cộng nhầm và đã đính chính. Log cố ý tạo lỗi projection/outage để kiểm tra khả năng chịu lỗi; các lỗi mô phỏng này không phải test thất bại.

Không có lint gate trong repo. Không sửa Python nên không lấy việc không chạy AI suite làm bằng chứng AI đã hoàn tất.

## 5. Các yêu cầu vẫn giữ lại — CHƯA hoàn thành tổng thể

Đợt này đóng luồng công việc/nghiệm thu trên web và các lỗi tích hợp nêu trên, **không** đồng nghĩa CRM/toàn bộ F1–F7 đã xong. Những mục sau vẫn nằm trong checklist, không bị xoá khỏi phạm vi:

1. **FR-005: CRUD nhân sự/phòng ban đầy đủ.** Hiện danh mục nhân sự là tra cứu; duyệt thay đổi hồ sơ không thay thế chức năng tạo/sửa/lưu trữ nhân sự và cơ cấu phòng ban. Cần chốt mapping department-code/ObjectId/tên cửa hàng và quy tắc migration, tránh tạo một danh mục mới không nối được dữ liệu thật.
2. **Audit sự kiện/thông báo/nhắc hạn.** Lịch sử nhúng đã hoạt động nhưng chưa phải toàn bộ `project_events` append-only, inbox durable/read acknowledgements, Agenda, dedupe/restart và post-commit realtime của FR-014/038/041/042/044. Chưa có bằng chứng chạy nhắc tự động trong deployment thực.
3. **FR-045: từ chối/xin đổi phân công.** Tài liệu nhóm Q-10/Q-11 chưa chốt cách giải quyết, reassign, vô hiệu phản hồi cũ, reasonCode và ngưỡng leo thang. Đã hỏi người dùng để xin duyệt đề xuất hoặc để nhóm chốt. Không tự chuyển trách nhiệm hoặc thêm trạng thái thứ sáu.
4. **Ghi qua chatbot.** `apps/ai-service/app/agent/tools.py` hiện mô tả rõ `submit_report` tạo proposed action, không ghi MongoDB. Luồng web đã chạy không phải bằng chứng chatbot đã thực thi. Cần kết nối cùng service/phân quyền/confirm và kiểm thử xuyên hai kênh.
5. **KPI/F4/F5/F6.** Biểu đồ và luồng đánh giá phải nối dữ liệu/công thức có kiểm chứng. Matching hiện tại không phải PhoBERT. Không tự đổi phần AI của thành viên khác hoặc công bố số thực nghiệm chưa chạy.
6. **Nguồn ngoài và vận hành.** POS/chấm công/Telegram/tài liệu đính kèm thật cần nguồn và cấu hình được cấp quyền. Deploy/kiểm thử live/UAT chưa thực hiện trong đợt này.

Đề xuất cần người dùng/nhóm duyệt tiếp: giữ trạng thái 5 giá trị; phản hồi không tự chuyển người chịu trách nhiệm; chỉ quản trị đúng phạm vi giải quyết; mọi giải quyết có lý do, phiên bản và lịch sử; không tự chọn số ngày leo thang khi tài liệu còn TBD. Đây là đề xuất, chưa phải chính sách được áp dụng trong code.

## 6. Nguồn nghiên cứu chính

- [Microsoft Dynamics 365 HR — Manager self service](https://learn.microsoft.com/en-us/dynamics365/human-resources/mss-overview): tham khảo sự tách biệt thông tin cá nhân/đội nhóm và phạm vi người quản lý.
- [Zoho People — Employee Tasks](https://help.zoho.com/portal/en/kb/people/zoho-people-4-0/employee-handbook-zoho-people-4-0/employee-tasks/articles/zoho-people-employee-tasks): tham khảo danh sách việc, phân công, bình luận và nhắc việc; không suy ra mọi nghiệp vụ của Zoho thuộc phạm vi đồ án.
- [OWASP API1 — Object Level Authorization](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/): kiểm tra quyền trên từng đối tượng.
- [MongoDB — Atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/): cập nhật một document và điều kiện giá trị mong đợi.
- [W3C — Modal Dialog](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/): focus, Escape, nền inert và trả focus.

Nguồn nội bộ: `docs/00-vision-scope.md`, `docs/01-requirements.md`, `docs/04-domain-model.md`, `docs/06-api-spec.md`, `docs/18-user-flows.md`, `docs/DESIGN.md`, ADR-020. Nguồn tham khảo là cơ sở phân tích; không phải tuyên bố triển khai tương đương sản phẩm thương mại.

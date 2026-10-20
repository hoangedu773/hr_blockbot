## Đề xuất thiết kế FR-003/004 — chờ phê duyệt

**Khuyến nghị:** nhúng yêu cầu vào `employees`, không thêm collection thứ 12. `05-data-model.md` giữ baseline 11 collection và ưu tiên embed dữ liệu đọc/ghi cùng hồ sơ; kế hoạch Phase 1 cũng chọn embedded có giới hạn, thêm collection phải xin duyệt (`05-data-model.md:18-29, 31-43`; `phase-01-start.md:36-39`).

### Cấu trúc và luồng

Thêm `profileChangeRequests[]` vào employee. Mỗi phần tử gồm ID, người tạo, thời điểm, trạng thái, snapshot field cũ/mới, người duyệt, thời điểm duyệt, lý do từ chối, ID yêu cầu trước đó nếu là resubmit. **Đề xuất, chưa có trong schema hiện tại.**

- Chỉ cho phép field trong allowlist. FR-003 nêu `level`, `hiredAt`, chức danh; schema hiện tại có `level` và `hiredAt` nhưng chưa có `jobTitle` (`01-requirements.md:150-156`; `05-data-model.md:238-253`).
- Từ chối field ngoài allowlist; không cho phép lương, CCCD hoặc dữ liệu ngoài phạm vi (`01-requirements.md:154`; `04-domain-model.md §8`, được viện dẫn tại cùng đoạn).
- Gửi yêu cầu: không cập nhật giá trị hồ sơ; append yêu cầu `PENDING` vào cùng document.
- Duyệt: một conditional update nguyên tử kiểm tra yêu cầu còn `PENDING` và giá trị các field mục tiêu vẫn khớp snapshot cũ; đồng thời áp dụng giá trị mới và append kết quả duyệt. Nếu không khớp, trả conflict; không ghi đè dữ liệu mới hơn.
- Từ chối: bắt buộc lý do; cập nhật trạng thái yêu cầu. Resubmit tạo yêu cầu mới, liên kết yêu cầu bị từ chối; không sửa/xóa lịch sử cũ. Cách này khớp yêu cầu resubmit và giữ lịch sử (`01-requirements.md:147-155`).
- Chặn self-approval: người duyệt trùng người tạo thì trả `SELF_APPROVAL`, không mutate (`07-auth-rbac.md:330-337`; mã lỗi đã có trong `packages/contracts/src/index.ts:119-137`).
- `PATCH /employees/:id` hiện trả `pendingApprovalUnsupported` cho field nhạy cảm; API mới là đề xuất, chưa phải contract đã chốt (`06-api-spec.md:74-77`).

### Giới hạn lịch sử và hiệu ứng phụ

Giới hạn cứng kích thước mảng; **không xóa lịch sử cũ khi đầy**. Khi đạt giới hạn, từ chối tạo yêu cầu mới với lỗi giới hạn có thể xử lý, giữ nguyên document. Không tự động archive/delete: nếu cần tiếp tục sau khi đầy, phải có quyết định riêng về lưu trữ ngoài document hoặc thay đổi baseline. Con số giới hạn chưa có căn cứ trong tài liệu và cần người dùng chốt trước implementation.

Lưu kết quả và audit trong cùng document employee trước; chỉ sau commit mới persist notification, rồi phát `notification:new`. Notification phải tồn tại trước khi phát WS (`06-api-spec.md §2.2, §8`; `05-data-model.md:471-495`). Nếu persist notification lỗi, không rollback quyết định đã commit; giữ trạng thái thông báo chưa hoàn tất trong request, retry có kiểm soát và dùng `dedupeKey` để tránh bản trùng. Nếu WS lỗi sau khi persist, notification vẫn đọc lại được qua REST (`05-data-model.md:607-661`; `01-requirements.md:247`).

Endpoint, trạng thái chính xác, trường phiên bản và tên lỗi conflict mới đều là **đề xuất**. Spec hiện có `SELF_APPROVAL`, nhưng chưa định nghĩa lỗi conflict hồ sơ (`packages/contracts/src/index.ts:119-137`).

### Phương án và đánh đổi

- **Embed có giới hạn — khuyến nghị:** giữ 11 collection, cho phép cập nhật hồ sơ và lịch sử nguyên tử một document. Giả định tải/lịch sử đủ nhỏ; thất bại đầu tiên khi đạt trần, lúc đó phải từ chối request mới.
- **Collection riêng:** phù hợp hơn nếu cần lịch sử không giới hạn hoặc truy vấn/phân trang độc lập; vi phạm baseline 11 collection và cần phê duyệt. Không chọn nếu chưa có quyết định đó (`05-data-model.md:18-29`).

### Cần chốt trước khi code

1. Allowlist cuối cùng: `level`, `hiredAt`, `jobTitle` (field chưa có trong schema), và `phone` (đang xuất hiện trong API PATCH nhưng phân loại nhạy cảm chưa nhất quán; `05-data-model.md:248-250`, `06-api-spec.md:70-77`).
2. Giới hạn số request lịch sử; hành vi đề xuất khi đầy là từ chối mới, không xóa.
3. Có chấp thuận phương án embed và chấp nhận dừng nhận yêu cầu khi đạt trần không?

### Acceptance checks

- Gửi đổi field được phép không sửa hồ sơ trước duyệt; field ngoài allowlist bị từ chối.
- Duyệt áp dụng đúng giá trị; từ chối thiếu lý do bị chặn; self-approval trả `SELF_APPROVAL` và không mutate.
- Resubmit tạo bản ghi mới; yêu cầu trước và lý do từ chối còn nguyên.
- Cập nhật đồng thời làm snapshot stale thì trả conflict, không ghi đè.
- Đạt trần thì request mới bị từ chối, lịch sử không bị xóa.
- Notification được persist trước WS; lỗi WS không làm mất notification; lỗi persist không báo thành công và có thể retry mà không tạo trùng.

**Nguồn kỹ năng:** đã tải `ak-agentkit`, `ak-scout`, `ak-engineer:ak-brainstorm`. Chỉ đọc; không ghi file hoặc chạy test.

Status: DONE_WITH_CONCERNS  
Summary: Đề xuất thiết kế embedded cho FR-003/004, chưa được phê duyệt.  
Concerns/Blockers: Cần chốt allowlist, giới hạn lịch sử và hành vi khi đầy trước implementation.

# Tiếp nhận, từ chối và chuyển giao nhiệm vụ — quy trình đã được chủ dự án chốt

Ngày 31/10/2026; tiếp tục working tree hiện có trên main, không ghi đè các phần CRM đã làm. Yêu cầu người dùng trong hội thoại này thay thế giả định cũ “được giao là đã chịu trách nhiệm” và đóng Q-10/Q-11 cho luồng mới.

## Thiết kế tận dụng code hiện có

- Giữ vòng đời 5 trạng thái projects (DRAFT/ASSIGNED/IN_PROGRESS/PENDING_REVIEW/COMPLETED) cho tương thích; thêm trạng thái tiếp nhận độc lập: PENDING_ACCEPTANCE/ACCEPTED/MANAGER_REVIEW/HANDOVER_PENDING. UI hiển thị đúng nhãn nghiệp vụ, không dùng ASSIGNED để suy ra đã nhận trách nhiệm.
- Dữ liệu yêu cầu, trao đổi, quyết định, xác nhận bàn giao, khoảng trách nhiệm và audit hash-chain nằm trong project và cập nhật bằng version CAS một document. Không thêm workflow cạnh tranh hoặc transaction nhiều collection.
- ASSIGNED cũ chưa có xác nhận được coi là chờ tiếp nhận; IN_PROGRESS cũ được giữ thực trạng đã bắt đầu, ghi nhận mốc legacy rõ ràng khi cần, không bịa thời gian chấp nhận cũ. Không backfill Atlas.
- Từ chối trước tiếp nhận: chờ quản lý, không có người chịu trách nhiệm thực hiện. Từ chối yêu cầu đổi sau tiếp nhận: trách nhiệm cũ vẫn giữ và phải có lý do/thông báo. Người từ chối ban đầu không bị ép nhận trách nhiệm chỉ vì quản lý bác đề nghị.
- Chuyển giao đang thực hiện: quản lý phê duyệt người thay thế + ảnh chụp tiến độ/ghi chú; người cũ xác nhận bàn giao, người mới xác nhận tiếp nhận. Chỉ khi đủ hai xác nhận mới đổi assignee và đóng/mở khoảng trách nhiệm tại cùng thời điểm. Đóng băng cập nhật tiến độ/nộp báo cáo trong bước chờ hai xác nhận để snapshot không trôi; người mới có thể từ chối phương án bàn giao trước khi hoàn tất.
- Trao đổi append-only; nhân viên có thể chuyển cấp sau quyết định từ chối. Global admin khác người bị khiếu nghị xử lý chuyển cấp; không có global admin phù hợp thì trả thông báo cần cấp quyền/quy trình, không tự chỉ định cấp trên bằng chức danh.
- Thông báo tối thiểu lưu bền trong project, địa chỉ người nhận/nhóm quản lý được xác minh ở server. Đọc lại được sau offline; không giả gửi Telegram hay push.
- AI gợi ý thay thế là read-only, dùng kỹ năng/tải thực và KPI đã công bố nếu có, giải thích thiếu dữ liệu. Không dùng thiếu KPI như điểm 0, không gọi điểm phù hợp là KPI, không có đường tự giao lại hay trừ KPI.
- Audit hash có nonce ngẫu nhiên chống đoán PII; chỉ hai bytes32 (ID ngẫu nhiên + digest) gửi smart contract. Quyền ghi contract riêng. Tích hợp xác minh receipt/hash/chain/address; không tuyên bố hash cục bộ là blockchain. Không tự triển khai hoặc trả phí trên public chain khi chưa có chain/address/wallet được cấp.

## Các bước thực hiện

- [x] A1 Hợp đồng dữ liệu/model/service tiếp nhận, request, quyết định, handover, trách nhiệm, audit và thông báo.
- [x] A2 API scope/version/ownership, chặn bypass từ luồng progress/report, endpoint trao đổi/chuyển cấp.
- [x] A3 Dashboard và biểu mẫu tiếp nhận/từ chối/xin đổi/duyệt/bàn giao, bộ lọc/đếm, timeline và thông báo.
- [x] A4 Read-only baseline gợi ý người thay thế, KPI đã công bố có thang điểm/tải thực/kỹ năng và missing-data. **Chưa kết nối mô hình AI/PhoBERT thực**; không gọi baseline là AI đã hoàn chỉnh.
- [x] A5 Smart contract chỉ hash + tích hợp xác minh + kiểm thử EVM cục bộ. **Chưa deploy lên public testnet/mainnet**, chưa cấu hình ví/mạng thật của nhóm.
- [x] A6 Kiểm thử API/UI, âm tính và đồng thời, giữ nguyên KPI, legacy/tamper/chain receipts; API 188/188, contracts 44/44, web 62/62, browser integration thật 6 nhóm; typecheck/build/compile contract/diff-check PASS. Báo cáo: `implementation-report.md`.

## Điều kiện còn lại — không được coi là đã hoàn thành

- [ ] Nối AI/model service thật vào endpoint gợi ý và đánh giá chất lượng/benchmark trọng số; công thức hiện tại chỉ baseline công khai, không phải mô hình đã nghiệm thu.
- [ ] Chủ dự án chọn EVM network/registrar, deploy contract, cấu hình RPC/chain/address/confirmations và UAT ví thật. Không tự chi phí mạng hoặc hỏi private key.
- [ ] Push/deploy Render và kiểm thử live được thực hiện khi có yêu cầu triển khai. Đợt này không ghi dữ liệu Atlas hay thay tài khoản thật.
- [ ] Scheduler nhắc hạn/push realtime, chatbot write executor, full employee/department CRUD, KPI model/trends vẫn thuộc backlog CRM trước; không tự đánh dấu xong bằng việc hoàn tất nhánh consent.

## Nguồn kỹ thuật

- https://docs.ethers.org/v6/getting-started/ — provider, signer, chờ receipt.
- https://ethereum.org/developers/docs/smart-contracts/security/ — access control và event cho hành động quan trọng.
- https://docs.openzeppelin.com/contracts/5.x/api/access — phân biệt quyền ghi contract với quyền nghiệp vụ ứng dụng.
- Quy tắc single-document CAS và design system giữ nguyên từ kế hoạch CRM trước.

Không sửa AI Python/model của nhóm nếu chỉ cần service đọc/gợi ý mới ở API. Không ghi DB thật, không push/deploy trong kiểm thử. Từng trạng thái blockchain phải phân biệt NOT_CONFIGURED/PENDING/VERIFIED/FAILED, tuyệt đối không báo “đã xác thực” khi chỉ có hash.

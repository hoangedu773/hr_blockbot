# ADR-021 — Tiếp nhận tự nguyện, quản lý phê duyệt và bằng chứng phân công bằng hash

- Trạng thái nghiệp vụ: **Accepted**, chủ dự án chốt trực tiếp ngày 31/10/2026.
- Thay thế giả định PROPOSED cũ tại domain §4.6/BR-21 và UF-05 2a–2c: “được giao vẫn chịu trách nhiệm dù từ chối trước tiếp nhận”. Không dùng lại giả định đó cho luồng mới.
- Q-10/Q-11 về đường reassign/resolution được giải quyết bằng request theo assignmentRound và CAS version. Không còn chờ phỏng vấn để triển khai quy trình người dùng vừa chốt. Phân loại reasonCode và ngưỡng leo thang tự động vẫn chưa được người dùng yêu cầu/chốt; dùng lý do tự do bắt buộc và chuyển cấp do nhân viên chủ động.

## 1. Tận dụng kiến trúc hiện có

Giữ React/Vite, Express/TypeScript, shared Zod, project/report lifecycle và single-document conditional update. Giữ **5 trạng thái vòng đời** `DRAFT / ASSIGNED / IN_PROGRESS / PENDING_REVIEW / COMPLETED`. `ASSIGNED` là đề nghị phân công, không đồng nghĩa chấp nhận.

Bổ sung `assignmentStatus`, `assignmentRound`, `acceptedAt`, `responsibleEmployeeId`, `assignmentRequests[]`, `responsibilities[]`, `assignmentAudit[]`, `assignmentNotices[]` trong project. Không tạo subsystem giao việc thứ hai. Hộp thoại/danh mục nhân sự/phân quyền/optimistic locking sẵn có được tái sử dụng.

| Giai đoạn | Trạng thái tiếp nhận | Người chịu trách nhiệm thực hiện |
|---|---|---|
| Mới đề nghị phân công | PENDING_ACCEPTANCE | Chưa có |
| Từ chối trước tiếp nhận | MANAGER_REVIEW | Chưa có; không gỡ tên đề nghị nhưng không suy ra trách nhiệm |
| Nhân viên xác nhận nhận | ACCEPTED | Nhân viên từ mốc xác nhận |
| Xin đổi sau nhận/chưa bắt đầu | ACCEPTED + request PENDING | Người cũ tới khi quản lý duyệt giao lại |
| Xin chuyển giao đang làm | ACCEPTED + request PENDING | Người đang làm |
| Quản lý duyệt phương án chuyển giao | HANDOVER_PENDING | Người đang làm, chưa chuyển người |
| Cả hai bên đã xác nhận bàn giao | ACCEPTED, assignee mới, round mới | Người mới từ đúng mốc chuyển giao; đóng khoảng cũ/mở khoảng mới cùng timestamp |

Trường hợp quản lý bác từ chối ban đầu: trả về chờ tiếp nhận, **không ép người đó nhận trách nhiệm**. Trường hợp bác yêu cầu sau khi đã nhận: giữ người chịu trách nhiệm cũ, gửi rõ lý do và cho phép trao đổi/chuyển cấp.

## 2. Phê duyệt, bàn giao và ngoại lệ

- Mọi request có actor/user ID, employee ID, thời gian, lý do và assignmentRound. Quản lý đúng đơn vị hoặc global admin được phân quyền mới xử lý; không tự duyệt request của mình.
- Phê duyệt thay thế trước khi bắt đầu tạo **đề nghị mới**, người thay thế vẫn phải tiếp nhận; không tự chấp nhận thay người mới.
- Chuyển giao đang làm cần tiến độ snapshot và ghi chú của phương án được quản lý duyệt. Bên giao xác nhận đã bàn giao, bên nhận xác nhận đã nhận. Trách nhiệm chỉ chuyển khi đủ cả hai.
- Trong giai đoạn HANDOVER_PENDING, đóng băng progress/report và sửa nội dung nhiệm vụ để snapshot được xác nhận không trôi; quản lý có thể hủy phương án bằng lý do trước khi sửa, người nhận có thể không tiếp nhận và gửi lại quản lý.
- Khi request đổi/chuyển giao còn pending, không nộp nghiệm thu hoặc bắt đầu mới làm mất hiệu lực request; công việc đang làm vẫn cập nhật tiến độ trước khi phương án bàn giao được duyệt.
- Người thay thế phải active và cùng đơn vị; kiểm tra lại trước khi hoàn tất bàn giao, không chỉ lúc duyệt.
- Request cũ không được dùng lại sau round mới. Duplicate/stale/concurrent actions trả 409; không tự retry thao tác ghi và không ghi đôi audit/notice.
- Chuyển cấp chủ động: người yêu cầu sau khi bị bác có thể gửi tới global admin khác người ra quyết định bị khiếu nghị. Không có cấp trên độc lập thì trả ESCALATION_UNAVAILABLE, không giả thông báo đã chuyển thành công. Không tự đoán cấp trên từ chức danh SM/AOM.

## 3. Lịch sử, thông báo, dữ liệu cũ

- Các thao tác quan trọng append audit với actor, thời gian, lý do, before/after, delta quyết định và chuỗi hash. Không có API sửa/xóa lịch sử. Kiểm tra tính toàn vẹn trước mutation; lịch sử bị chỉnh hoặc mất sẽ không được ghi đè để “sửa cho chạy”.
- Snapshot/trách nhiệm/request/audit/notice cùng commit một project document. Notice bền, lọc đúng recipient; đọc offline/reopen qua inbox, read receipt riêng không sửa event gốc. Không tuyên bố đã gửi Telegram/email/Socket.IO push.
- Đặt ngưỡng an toàn 8 MiB/document, 100 request, 100 comment/request, 1000 audit/project. Chạm giới hạn trả lỗi yêu cầu quy trình lưu trữ, không tự cắt lịch sử.
- ASSIGNED legacy không có xác nhận ⇒ chờ tiếp nhận. IN_PROGRESS legacy giữ thực tế đã bắt đầu; khoảng cũ có startAt=null và legacy=true, không bịa thời gian nhận trách nhiệm. Không backfill production trong đợt này.
- Không ghi `evaluations`, điểm KPI, cấp bậc hoặc cache activeLoad từ bất kỳ thao tác tiếp nhận/từ chối/chuyển giao nào. Quá hạn cũng không tự phạt điểm.

## 4. AI là tư vấn, không là người phê duyệt

Endpoint gợi ý read-only dùng kỹ năng yêu cầu, tải công việc đang chịu trách nhiệm/dự kiến bàn giao và KPI **PUBLISHED** có **maxScore** rõ ràng. KPI thiếu/thang điểm không rõ trả missingData, không ép thành 0, không dùng bản nháp. Trọng số cơ sở 0.55 kỹ năng + 0.25 tải + 0.20 KPI, chuẩn hóa lại trên thành phần khả dụng và công khai cách tính.

Đây là **baseline theo quy tắc**, không phải kết quả huấn luyện/benchmark PhoBERT hay khẳng định F4/F5 đã hoàn tất. Module Python matching có sẵn chưa có endpoint phục vụ quy trình này và chưa đọc KPI; giữ nguyên module/model của thành viên khác. Các endpoint đọc nhân sự, dữ liệu và quyền hiện có được dùng lại. Chưa nối gọi mô hình AI thật vào endpoint gợi ý mới; phần này phải được báo là chưa triển khai, không đổi tên heuristic thành AI đã hoàn chỉnh.

Quản lý có thể chọn bất kỳ nhân sự hợp lệ trong danh mục, không bị buộc chọn top gợi ý. Không có API cho AI tự reassign hoặc trừ KPI. Điểm phù hợp phân công không phải điểm đánh giá nhân viên.

## 5. Smart contract và giới hạn bảo đảm

`packages/contracts/solidity/AssignmentDecisionRegistry.sol`: registrar duy nhất, mapping append-only từ bytes32 ID ngẫu nhiên tới bytes32 digest; retry cùng hash idempotent, hash khác bị chặn. Không nhận tên, mã nhân viên, KPI, lý do, tiến độ hoặc nội dung báo cáo.

Digest SHA-256 tính từ canonical event gồm nonce 256-bit và previousHash; nonce và dữ liệu HR nằm off-chain trong scope được cấp. Hash cục bộ **không** đồng nghĩa blockchain và không chống được quản trị DB đủ quyền tính lại toàn bộ chuỗi. Checkpoint độc lập trên chain giúp phát hiện việc sửa/tính lại sự kiện đã neo; sự kiện chưa neo không có bảo đảm đó. Không tuyên bố blockchain chứng minh quyết định là công bằng, dữ liệu đầu vào đúng hoặc người ký đã có thẩm quyền HR ngoài ứng dụng.

Luồng: lưu quyết định nghiệp vụ → quản lý chọn sự kiện → API kiểm toàn vẹn và chuẩn bị giao dịch → ví registrar xác nhận → API kiểm chain/address/calldata/receipt status/confirmations/hash trong contract → lưu proof metadata. Lỗi mạng/ví không rollback quyết định HR, không báo VERIFIED giả. Việc prepare chỉ tạo calldata, không ký/broadcast. Server không giữ private key.

Cấu hình tùy chọn ở `apps/api/.env.example`: ASSIGNMENT_CHAIN_RPC_URL, ASSIGNMENT_CHAIN_ID, ASSIGNMENT_REGISTRY_ADDRESS, ASSIGNMENT_CHAIN_CONFIRMATIONS. Không có cấu hình trả BLOCKCHAIN_NOT_CONFIGURED. Mặc định 1 confirmation chỉ là baseline kỹ thuật; chain công khai phải có policy finality do nhóm vận hành lựa chọn. UI phân biệt chưa có proof, pending, verified ở lần kiểm trước, và không khớp lịch sử; cho phép đọc lại chuỗi.

**Chưa thực hiện:** public testnet/mainnet deployment, cấp ví/phí mạng, chính sách vận hành/luân chuyển khóa registrar, audit bảo mật bên thứ ba, dịch vụ tự neo hàng loạt hoặc guarantee finality. Adapter hiện hỗ trợ giao dịch trực tiếp tới registry; chưa hỗ trợ trace giao dịch gọi qua multisig/forwarder. Không yêu cầu người dùng gửi private key vào chat hoặc server.

## 6. API đã thêm

- POST `/api/projects/:id/assignment/respond` (ACCEPT/DECLINE/REQUEST_CHANGE).
- POST `/api/projects/:id/assignment/requests/:requestId/review` (APPROVE/REJECT/CANCEL_HANDOVER).
- POST `/api/projects/:id/assignment/requests/:requestId/handover` (CONFIRM/DECLINE).
- POST `/api/projects/:id/assignment/requests/:requestId/comments` và `/escalate`.
- GET `/api/projects/:id/assignment/candidates`, `/audit`, `/proofs`.
- POST `/api/projects/:id/assignment/audit/:eventId/prepare` và `/verify`.
- GET `/api/assignment/summary`, `/notifications`; POST `/api/assignment/notifications/:projectId/:noticeId/read`.
- GET `/api/projects?assignmentView=AWAITING_ACCEPTANCE|PENDING_REQUESTS|HANDOVER` dùng cùng scope/pagination sẵn có.

Schema nguồn: packages/contracts. Đây là thao tác qua web/API; chatbot write executor cũ vẫn chỉ ghi nhận proposed action, chưa được chuyển thành executor thật trong đợt này.

## 7. Kiểm chứng

Technical review tiếp nối: state encoding mới có `stateVersion:2` để normalize model defaults trên bản legacy; event cũ không có marker vẫn verify theo encoding v1, không tính lại hash cũ. Mutation kiểm thêm consistency owner/round/interval/snapshot, đo BSON thay JSON length và giới hạn read metadata; helper transition unaudited cũ bị deprecate fail-closed. Có regression bàn giao bị treo do receiver inactive và cancel đua final confirmation. [Báo cáo hiện tại](../../plans/261031-crm-technical-review/review-report.md) phân biệt local EVM với neo công khai và các hạng mục chưa nghiệm thu.

API `assignment-consent.test.mjs`: accept/decline/reassign/change/reject/discuss/escalate/handover/cancel/scope/self-approval/concurrency/legacy/tamper, kiểm snapshot KPI và cache không đổi sau từng test.

`decision-anchor.test.mjs`: Solidity 0.8.30 → EVM local thật, quyền registrar/immutable/idempotency, calldata không PII, receipt thật, wrong chain/receipt, thiếu config, pending confirmations, local rehash bị checkpoint bên ngoài phát hiện. EVM trong test chỉ loopback, không dùng mạng công khai.

Browser integration: tài khoản quản lý + hai nhân viên, từ chối trước nhận, quản lý chọn thay thế, người mới tiếp nhận/bắt đầu/xin chuyển giao, quản lý duyệt và hai bên xác nhận, kiểm tra khoảng trách nhiệm và KPI không đổi trực tiếp trong Mongo riêng. Kết quả và giới hạn thực tế ghi trong báo cáo cạnh kế hoạch.

Nguồn kỹ thuật: [ethers v6](https://docs.ethers.org/v6/getting-started/), [Ethereum security](https://ethereum.org/developers/docs/smart-contracts/security/), [OpenZeppelin access control](https://docs.openzeppelin.com/contracts/5.x/api/access). Các nguồn này hướng dẫn kỹ thuật, không tự quyết định chính sách HR của nhóm.

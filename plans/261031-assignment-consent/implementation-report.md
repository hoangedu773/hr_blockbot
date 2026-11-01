# Kết quả: tiếp nhận, từ chối, xin đổi và chuyển giao nhiệm vụ

> Tiếp nối technical review: [báo cáo hiện tại](../261031-crm-technical-review/review-report.md) ghi thêm hardening legacy/CAS/BSON/scope, tương thích hash v1/v2, khép luồng hồ sơ và kết quả mới. Các số 188/44/62 trong báo cáo này là snapshot trước đợt review, không phải tổng regression hiện tại.

Ngày 31/10/2026 — triển khai tiếp trên main từ nền `71bd202`, giữ các thay đổi CRM trước. Đây là kết quả local đã kiểm thử, **chưa commit/push/deploy Render, không sửa Atlas hay tài khoản thật**.

## Đối chiếu 9 yêu cầu người dùng

| Yêu cầu đã chốt | Kết quả thực tế |
|---|---|
| 1. Chờ nhân viên tiếp nhận; chấp nhận hoặc từ chối/xin đổi kèm lý do | **Đã triển khai** API + UI. ASSIGNED không còn được coi là nhận trách nhiệm. Không thể bắt đầu nếu chưa chấp nhận. |
| 2. Từ chối trước nhận ⇒ chờ quản lý; không giao lại/phạt KPI/ép nhận trách nhiệm | **Đã triển khai**. responsibleEmployeeId=null; quản lý bác từ chối ban đầu vẫn không ép nhân viên thành người đã nhận. |
| 3. Đã nhận/chưa bắt đầu được xin đổi; quản lý duyệt/bác có lý do | **Đã triển khai**. Giao lại tạo đề nghị mới, người thay thế phải tiếp nhận. Lý do và thông báo được lưu bền. |
| 4. Đang thực hiện được xin chuyển giao; duyệt, snapshot tiến độ, xác nhận bàn giao, mốc trách nhiệm | **Đã triển khai**. Quản lý duyệt người mới + ghi chú; cả bên giao và bên nhận xác nhận. Chỉ lúc đủ hai xác nhận mới đổi assignee và đóng/mở khoảng trách nhiệm cùng timestamp, giữ tiến độ. |
| 5. Quản lý đúng đơn vị; từ chối có lý do, trao đổi/chuyển cấp | **Đã triển khai** scope server, không tự duyệt, trao đổi append-only và chuyển cấp chủ động tới global admin độc lập. Không có cấp trên hợp lệ trả lỗi rõ, không giả gửi. |
| 6. Lịch sử actor/thời gian/lý do/trước-sau/quyết định; không xóa/sửa âm thầm | **Đã triển khai** append-only audit hash-chain cùng commit nghiệp vụ, kiểm tra toàn vẹn trước ghi, không có endpoint sửa/xóa audit; có checkpoint smart contract để kiểm chứng độc lập nếu đã neo. Không tuyên bố local hash chống được quản trị DB đủ quyền tính lại cả chuỗi. |
| 7. AI chỉ tư vấn dựa KPI/kỹ năng/tải, không tự giao lại/trừ KPI | **Đã có baseline gợi ý read-only**, đọc KPI PUBLISHED có maxScore rõ, kỹ năng và tải chịu trách nhiệm tính từ việc thật; có giải thích/missingData. **Chưa nối mô hình AI/PhoBERT thực**, chưa có benchmark nghiệm thu trọng số. Không gọi baseline là mô hình AI hoàn chỉnh. |
| 8. Smart Contract chỉ nhận hash, không đưa HR nhạy cảm lên chain | **Đã có Solidity contract, API prepare/verify, UI ví và kiểm thử EVM local thật. Chưa deploy public testnet/mainnet hoặc cấu hình chain/ví thật của nhóm.** Hash cục bộ không được hiển thị như đã xác thực Blockchain. |
| 9. Dashboard chờ tiếp nhận/đang làm/yêu cầu chờ duyệt/quá hạn/lịch sử | **Đã triển khai** 5 ô đếm theo scope, lọc tương ứng, inbox/read receipt, chi tiết request/quyết định/trao đổi, khoảng trách nhiệm và audit/proof. |

## Luồng quan trọng đã thực hiện

1. Quản lý đề nghị giao: PENDING_ACCEPTANCE, chưa có người chịu trách nhiệm thực hiện.
2. Nhân viên từ chối: MANAGER_REVIEW, giữ người được đề nghị để theo dõi nhưng không suy ra trách nhiệm.
3. Quản lý duyệt người thay: tạo round mới, PENDING_ACCEPTANCE; người mới tự xác nhận.
4. Sau tiếp nhận, nhân viên bắt đầu và có thể xin chuyển giao.
5. Quản lý duyệt snapshot/ghi chú/người thay. HANDOVER_PENDING giữ người cũ chịu trách nhiệm, không đổi KPI. Tiến độ/nộp nghiệm thu tạm khóa để snapshot không trôi.
6. Bên giao và bên nhận xác nhận độc lập. Ai xác nhận trước cũng không làm đổi người ngay; CAS xử lý hai yêu cầu đồng thời và yêu cầu tải phiên bản mới khi xung đột.
7. Khi đủ hai xác nhận: assignee mới, giữ tiến độ, đóng khoảng cũ/mở khoảng mới tại cùng mốc; người cũ mất quyền cập nhật tiến độ/nộp báo cáo.

Người mới có thể từ chối phương án bàn giao; quản lý có thể hủy phương án kèm lý do. Không xóa request cũ, không sửa lịch sử để “giấu” lần từ chối.

## Tận dụng thay vì làm trùng

- Dùng lại Project/Report, 5 lifecycle statuses, shared Zod, JWT/database scope, version CAS, department/personnel directory, React Select/CrmDialog và các form/report APIs đã có.
- Bổ sung lớp assignment/consent trong cùng project, không tạo workflow hay collection nhiệm vụ thứ hai.
- Các đường bắt đầu/progress/report cũ được tích hợp guard mới, không để endpoint cũ bypass tiếp nhận/bàn giao.
- Canonical audit/notice/responsibility/request cùng một project document. `decision_anchors` chỉ chứa metadata chain/proof, không phải nguồn nghiệp vụ chính.
- Module Python matching hiện có chưa có HTTP endpoint cho luồng này và không đọc KPI. Để tránh tự sửa phần model của nhóm, giữ nguyên Python và đánh dấu endpoint gợi ý mới là baseline kỹ thuật. Nối model thật vẫn là việc chưa hoàn thành.

## Smart Contract: cái gì đã chạy và cái gì chưa

**Đã chạy:** compile Solidity 0.8.30, EVM local loopback chain 1337, triển khai contract trong fixture, registrar ký giao dịch local, receipt/chain/address/calldata/hash/confirmations được API đối chiếu thật. Kiểm thử không giả response RPC. Hai bytes32 trong calldata là ID ngẫu nhiên và SHA-256 digest có nonce; không chứa tên/mã nhân viên/KPI/lý do/báo cáo.

**Chưa làm:** public deployment, ví thật/hardware wallet UAT, phí mạng, policy finality/reorg vận hành, quản trị/rotation registrar, kiểm toán contract độc lập, hỗ trợ multisig/forwarder và dịch vụ tự neo mọi sự kiện. Server không giữ private key. Khóa registrar có quyền notarization, không tự cấp quyền quản lý nhân sự.

Kiểm thử có trường hợp quản trị DB sửa event rồi tự tính lại local hash: local check có thể hợp lệ, nhưng giao dịch/hash đã neo không khớp và prepare/verify bị chặn. Sự kiện chưa neo không có bảo đảm độc lập đó; UI ghi rõ từng sự kiện chưa có proof/pending/đã xác minh ở lần kiểm trước/không khớp và cho phép kiểm tra lại.

### Chuẩn bị triển khai khi chủ dự án chọn mạng

1. `pnpm --filter api contract:build` sinh ABI/bytecode trong `apps/api/artifacts/AssignmentDecisionRegistry.json` (generated, không commit). Lệnh chỉ biên dịch, không kết nối ví/RPC hoặc deploy.
2. Người vận hành triển khai contract tới EVM network được chọn, constructor nhận địa chỉ registrar. Giữ quyền ký trong ví, không gửi private key vào chat/.env/server.
3. Cấu hình API: ASSIGNMENT_CHAIN_RPC_URL, ASSIGNMENT_CHAIN_ID, ASSIGNMENT_REGISTRY_ADDRESS, ASSIGNMENT_CHAIN_CONFIRMATIONS. File mẫu đã bổ sung; mặc định để trống RPC/chain/address, không tự chọn public network.
4. Quản lý đúng scope chọn sự kiện và chuẩn bị giao dịch trong CRM. Ví phải ở đúng chain, đúng registrar, người dùng xác nhận phí/giao dịch. Có thể dán hash của giao dịch trực tiếp tới registry để API kiểm lại.
5. Chỉ sau receipt thành công, đủ confirmations và hash khớp mới trả VERIFIED. Thiếu config trả 503 BLOCKCHAIN_NOT_CONFIGURED; RPC/ví lỗi không rollback công việc và không báo đã ghi Blockchain.

## Kiểm thử cuối

| Gate | Kết quả |
|---|---|
| Cài dependency từ lockfile | PASS; native WebSocket acceleration không cần thiết bị tắt build, dùng JS fallback |
| Typecheck monorepo | PASS contracts/API/web |
| Build monorepo | PASS; giữ 3 warning CSS landing có sẵn ngoài phạm vi |
| Contracts | **44/44 PASS** |
| API, 16 tệp test | **188/188 PASS**, không skip |
| Web, toàn bộ *.test.mjs | **62/62 PASS**, không skip; có E2E bắt buộc 17 ca |
| Browser thật React → Express → Mongo riêng | **6 nhóm PASS**, gồm quản lý + hai nhân viên, từ chối/giao lại/tiếp nhận/chuyển giao hai xác nhận và xác minh KPI không đổi |
| Solidity build command | PASS, không public deployment |
| Solidity/EVM/API proof suite | **4/4 PASS**, đã nằm trong 188 API, không cộng lần hai |
| git diff --check | PASS |

Mỗi ca consent API so sánh toàn bộ evaluations fixture trước/sau và kiểm activeLoad cache không bị ghi lại. Candidate API chỉ dùng published KPI có thang điểm, không dùng bản nháp/không đoán thang/không xem thiếu KPI là 0. Role/scope/self-approval/concurrent stale version/legacy/tamper đều có ca âm tính.

Ảnh kiểm thử đã xem: `test-results/assignment-handover-desktop.png`, `assignment-handover-mobile.png`. Log: `consent-api-full.log`, `consent-contracts.log`, `consent-web-full.log`, `consent-browser-final.log`, `consent-typecheck.log`, `consent-build.log`. Chúng là fixture test, không phải dữ liệu thật của quán/Atlas. Ganache cảnh báo native µWS không hỗ trợ Node hiện tại và dùng JS fallback; các ca EVM vẫn PASS. Không sửa Python nên không gọi việc chưa chạy AI suite là bằng chứng AI đã hoàn thiện.

## Ranh giới còn lại ngoài nhánh vừa hoàn thiện

- Model AI thật và benchmark/calibration cho gợi ý; hiện baseline có giải thích nhưng chưa phải PhoBERT.
- Public-chain configuration/deployment/wallet UAT như trên.
- Scheduler tự nhắc hạn, push realtime/email/Telegram, chatbot write executor, full CRUD nhân sự/phòng ban và KPI model/trend của backlog CRM trước vẫn chưa được hoàn tất bởi đợt này.
- Chưa push/deploy Render, chưa nghiệm thu với người dùng thật trên môi trường triển khai. Không tự đổi scope thành “7/7 chức năng xong”.

Đặc tả có hiệu lực: [ADR-021](../../docs/03-decision-records/ADR-021-assignment-consent-handover-hash-proof.md). Các ghi chú PROPOSED cũ trong docs đã được gắn thông báo superseded để tránh thành viên khác áp dụng lại quy tắc trách nhiệm cũ.

# CRM — technical review, gap closure and acceptance status

> **Tiếp nối theo yêu cầu “tiếp tục”:** đã bổ sung tạo nhân viên, form sửa thông tin thường cho quản lý và tạo/sửa metadata phòng ban có scope/version/uniqueness guards. Xem [báo cáo F1 tiếp nối](personnel-admin-report.md). Các số 205/44/62/7 bên dưới là snapshot review trước increment này; không dùng làm số regression mới nhất.

Ngày review: 31/10/2026. Baseline: `71bd20214daedd3287e7a446f5562ea7a44dd14a` trên `main` (xem chính xác HEAD bằng `git rev-parse HEAD`; commit rút gọn `71bd202`). Toàn bộ kết quả là working tree cục bộ, chưa commit/push/deploy. Không reset/checkout/xóa thay đổi cũ, không gọi Atlas, không dùng tài khoản thật. Không sửa file Python/AI/PhoBERT.

## 1. Phạm vi và thứ tự ưu tiên

Đã rà phần tracked diff từ `71bd202` **và các file source/test/document untracked**; chỉ `git diff --stat` không thể hiện hết phần source mới. Kiểm tra các đường mutation project/report/assignment, employee/profile, dashboard/store scope, auth DTO, legacy HTTP/socket/helper, shared Zod, UI/dialog, dependencies/lockfile/build approvals, Solidity/receipt adapter và độ độc lập của fixture tests. Danh sách file nằm trong `changed-files.md` cạnh báo cáo.

Nguồn đối chiếu: `docs/00-vision-scope.md`, `01-requirements.md`, `02-architecture.md`, `04-domain-model.md`, `05-data-model.md`, `06-api-spec.md`, `07-auth-rbac.md`, `10-ui-ux-spec.md`, `16-project-plan.md`, `18-user-flows.md`, `backlog-parked.md`, ADR-020/021 và hai kế hoạch CRM trước. Quy trình chín điểm người dùng đã chốt / ADR-021 có hiệu lực trên các giả định PROPOSED cũ. Không thay đổi luật tiếp nhận/trách nhiệm/KPI.

Ưu tiên thực hiện: P0 quyền truy cập / an toàn dữ liệu → P1 tương thích & recovery bàn giao → P1 khép luồng hồ sơ đã đặc tả → hồi quy/browser/database → liệt kê khoảng trống nghiệm thu. Không thêm sales CRM, payroll, camera analytics, nghỉ phép hoặc công cụ ngoài đề tài.

## 2. Bảng tiến độ theo chức năng

`Đã triển khai local` không đồng nghĩa đã nghiệm thu live. `Một phần` không được tính là hoàn thành cả FR/F.

| Phân hệ / yêu cầu | Đã chạy được | Còn thiếu / giới hạn | Trách nhiệm theo RACI của repo |
|---|---|---|---|
| Xác thực, tài khoản, provider | Giữ login/refresh/logout/đổi mật khẩu, admin accounts và provider settings; chạy hồi quy | Chưa kiểm lại tài khoản thật hoặc Render; không cấp lại tài khoản | Hoàng; Phi phụ trách UI |
| Cửa hàng / CRM vận hành | Giữ CRUD, soft delete, lease/cascade, tìm kiếm/phân trang, scope; sửa canonical fallback scope | POS/chấm công/Telegram chưa có nguồn/kênh đủ điều kiện; không giả số hoặc báo gửi thành công | Phi; Hoàng phối hợp hạ tầng |
| F1 FR-001: hồ sơ chính mình | Đọc allowlist, admin có hồ sơ cũng đọc được own detail; người khác chỉ summary | Không mở PII tùy tiện cho admin khác | Phi |
| F1 FR-002: sửa thông tin thường | **Bổ sung API thật**, validate, own/scoped-admin, CAS revision, lưu lịch sử; UI gửi đúng phiên bản, xóa số điện thoại được | Replay stale PATCH trả 409, chưa có replay cache trả nguyên kết quả cũ theo `clientMessageId` | Phi |
| F1 FR-003/004: thay đổi nhạy cảm | **Khép web/API/DB**: yêu cầu giữ nguyên dữ liệu → so cũ/mới → duyệt/từ chối có lý do → lịch sử bền → gửi lại liên kết yêu cầu bị từ chối; không tự duyệt, chống concurrent review/stale snapshot | Chưa có push Socket.IO/nhắc lại hàng ngày; quyết định xem bằng tải lại hồ sơ. Hàng đợi admin chưa phân trang server; cần hoàn thiện trước tải lớn | Phi; Hoàng phụ trách delivery/scheduler |
| F1 FR-005: CRUD nhân sự/phòng ban | Danh mục/search/filter/paging/detail, 5 cấp bậc, create employee, admin edit thông tin thường, create/edit phòng ban/manager metadata và luồng sensitive approval | **Chưa có archive/chuyển đơn vị/delete/merge/code rename**; uniqueness toàn bộ legacy/external imports và migration còn cần protocol nhóm. Xem increment F1 cạnh báo cáo | Phi; nhóm chốt mapping/migration |
| F2: công việc/lifecycle | Tạo có hạn bắt buộc, sửa có version, giao, tiếp nhận, bắt đầu, tiến độ, nộp/duyệt/trả/bổ sung/hoàn tất; nội dung/minh chứng/lịch sử thật | Tạo nhiệm vụ chưa có idempotency key; một người nhận hiện tại, không phải multi-assignee; thiếu vài filter `dueBefore/dueAfter/requiredSkill` của spec cũ | Phi |
| Nhánh consent theo 9 điểm | Đã triển khai local đầy đủ quy trình đã chốt: decline/change/transfer, scope, lý do, trao đổi/chuyển cấp chủ động, hai xác nhận và intervals; **KPI không tự đổi** | Không tự đặt timeout/auto-escalation; cần vận hành quản lý/global admin khi bị treo | Phi |
| F3: chatbot tra cứu / thao tác | Giữ gateway/AI/service của nhóm; hai đường confirm socket đều báo đúng là chưa thực thi | **Chưa có write executor**; Python tools còn dùng `assigneeIds` trong khi CRM hiện dùng `assigneeId`: cần thống nhất adapter/query trước khi nghiệm thu chat đọc/ghi việc mới. Không coi web submit là chat submit | Hòa + Hoàng; Phi nối UI/nghiệp vụ |
| F4: matching | CRM có baseline tham khảo kỹ năng/KPI published có thang/tải thực, giải thích thiếu dữ liệu; quản lý chọn cuối | **Không phải PhoBERT**; chưa tích hợp model/benchmark/calibration/abstention thật | Hòa; Phi phụ trách card và quyết định người dùng |
| F5: KPI | Không ghi/phạt KPI từ decline/assignment/handover; baseline chỉ đọc published có scale | Chưa hoàn chỉnh mở kỳ, self/manager review, công thức/chặn trần, override/publish/history và UI; granularity/công thức/ngưỡng còn TBD | Hòa phụ trách model/công thức; Hoàng API; Phi UI/tích hợp |
| F6: dashboard | Danh mục việc/nhân sự, đếm chờ nhận/đang làm/chờ quản lý/chờ bàn giao/quá hạn; inbox assignment bền và read receipt; scope overview thật | **Chưa có hai biểu đồ biến động KPI**, chưa thống nhất notification collection/WS delivery toàn hệ thống; inbox hiện chỉ 100 notice gần nhất | Phi; Hòa cung cấp KPI; Hoàng realtime |
| F7: báo cáo + nhắc hạn | Web nộp báo cáo thật, canonical commit cùng project; projection legacy, reject/resubmit/approve; notice trong project | Chat executor, Agenda deadline jobs 3 ngày/1 ngày/quá hạn, dedupe/restart và push chưa hoàn thành; digest template còn TBD | Phi (nghiệp vụ/UI), Hoàng (jobs), Hòa (chat) |
| Blockchain | Solidity registry + ví/calldata + kiểm chain/address/receipt/hash/confirmations; EVM local đã kiểm | **Không có neo công khai nào được tạo trong đợt này**; chưa public deploy/registrar/finality/key-operation/UAT | Nhóm xác định vận hành, Phi tích hợp CRM |
| Kiểm thử / triển khai | Regression local, fixture DB/EVM độc lập, browser thật theo các luồng dưới đây | Chưa Lighthouse/Postman collection/UAT người dùng thật/live deployment; CI không tự được chứng minh bằng chạy local | Cả nhóm |

Các phần giao thành viên khác **vẫn là điều kiện nghiệm thu tích hợp**, không bị loại khỏi phạm vi CRM/đề tài. RACI là nguồn phân công repo, không phải khẳng định thành viên đã hoàn thành các phần đó.

## 3. Findings và xử lý

| ID / mức độ | Lỗi hoặc rủi ro cụ thể | Cách xử lý / bằng chứng |
|---|---|---|
| R01 / Cao | Scope nhân sự dùng OR đồng cấp giữa departmentId và alias cũ: người có canonical B nhưng alias A có thể lọt list/overview/store mapping A | Dùng thứ tự ưu tiên canonical → department khi canonical trống → store_raw khi cả hai trống. Áp dụng directory, approval queue, overview và quan hệ store. Test fixture conflicting alias không lộ ở directory/queue; suite scope/store/dashboard giữ xanh |
| R02 / Cao | Profile screens/client gọi PATCH và review API chưa tồn tại → nút có nhưng nghiệp vụ 404 | Bổ sung đúng đường API đang được client dùng, không dựng workflow mới; thêm hàng đợi đối chiếu và lịch sử own |
| R03 / Cao | ID request tạo trong API không có field lưu tương ứng ở Mongoose embedded schema, có thể khác ID khi mở lại | Lưu `id` rõ ràng; vẫn đọc được legacy `_id`; test gửi→đọc lại→duyệt và retry |
| R04 / Cao | Duyệt hồ sơ thiếu CAS/snapshot protection có thể ghi đè quyết định hoặc dữ liệu đã thay đổi | Revision atomic cùng request + sensitive changes + history; self/scope checks; so snapshot cũ và CAS field gốc; request nhập cũ cũng phải qua allowlist khi approve |
| R05 / Vừa | Raw legacy project thiếu version: DTO nhìn là 1 nhưng update có thể conflict/NaN | Match `$exists:false` trên bản cũ, set đúng version 2 cùng audit; không backfill production. Invalid version không được sửa âm thầm |
| R06 / Cao | Helper transition cũ không nhận verified actor context và bỏ qua consent/report/audit | Không còn runtime caller; deprecate export fail-closed cho cả bản cũ/mới. HTTP generic transition vẫn chỉ cho start đúng người đã nhận; schedules/corrections/cash vẫn 503 |
| R07 / Vừa | Dùng JSON length thay BSON không bảo đảm ngân sách document; read receipts không có bound | Dùng driver BSON sizing, ngưỡng an toàn 8 MiB; cap 100 requests/100 comments/1000 audit/100 reports, cap read receipts 10.000 và atomic BSON guard. CAS phát hiện read metadata thay đổi trong lúc ước lượng; không cắt lịch sử |
| R08 / Vừa | Hash khớp không tự chứng minh trạng thái phân công/intervals có nghĩa | Kiểm active owner/round/timeline/overlap/completed/pending handover/snapshot trước và sau mutation; không tự sửa dữ liệu sai |
| R09 / Vừa | ID hex viết hoa được DB nhận nhưng so quyền bằng chuỗi khác chữ có thể làm nhiệm vụ không tiếp nhận được | Chuẩn hóa assignee/replacement ở schema đầu vào, có ca API uppercase và replacement uppercase. Hai ca tái hiện từng fail trên output cũ; sau build lại contracts + API phải PASS |
| R10 / Vừa | Task mới được tạo không có dueDate dù FR-006 yêu cầu có hạn | Bắt buộc ngày hạn ở create schema và web. Legacy không có hạn vẫn đọc được; không gán hạn giả |
| R11 / Vừa | Đường `chat:send.confirm` cũ báo đã thực thi thành công trong khi `chat:confirm` mới chỉ acknowledge | Sửa thông báo cũ cho đúng thực tế; test hai đường Socket.IO thật xác nhận không ghi project/KPI, không đụng AI Python |
| R12 / Vừa | Runner có thể tái sử dụng MongoDB của người dùng ở localhost:27017 | Luôn tạo mongod riêng từng file; không coi prefix test_ là quyền xóa DB bên ngoài |
| R13 / Tương thích | Chuẩn hóa legacy defaults có thể làm hash cũ mất khả năng kiểm chứng | Version hóa state encoding ở sự kiện mới (`stateVersion:2`), vẫn kiểm encoding cũ khi thiếu marker; hash cũ giữ byte-for-byte. Có fixture v1 → append v2, không rehash lịch sử |

Không phát hiện lý do phải đổi quy trình chín điểm. Các ca recovery giữ đúng luật:

- Người nhận từ chối bàn giao → hủy phương án, người cũ vẫn chịu trách nhiệm, không phạt KPI.
- Quản lý đúng đơn vị/global được hủy phương án kể cả đã có một xác nhận; phải có lý do.
- Người thay thế inactive trước xác nhận cuối → không chuyển chủ; quản lý hủy để phục hồi cập nhật công việc.
- Hai bên confirm cùng version → một 200/một 409; bên thua tải lại và xác nhận, chỉ mở một interval mới.
- Manager cancel đua xác nhận cuối → một quyết định thắng, không có hai active intervals.
- Không có timeout đã chốt → không tự accept/chuyển người/xóa request/trừ KPI khi chờ lâu.

## 4. Dữ liệu cũ, storage, audit và giới hạn bảo đảm

Giữ ObjectId/string reference trong scope, alias tên nhân sự/đơn vị, reports standalone đọc được và canonical reports mới trong project. ASSIGNED cũ chưa có consent vẫn là chờ tiếp nhận. IN_PROGRESS cũ không bịa acceptance time; legacy interval có startAt=null khi cần ghi nhận. Unknown/invalid legacy request không được approve thành field ngoài schema. Không chạy migration hoặc thêm/sửa index trên Atlas từ phiên này.

Hash-chain local chỉ phát hiện thay đổi so với digest; DB admin đủ quyền có thể sửa và tính lại cả chuỗi, hoặc xóa marker. Endpoint không cho sửa/xóa audit không biến DB thành WORM. State encoding có version để không phá bằng chứng cũ. Profile history là append-only qua API, **không phải** blockchain/hash-chain bảo vệ trước DB admin.

Ngưỡng 8 MiB là headroom kỹ thuật dưới giới hạn BSON 16 MiB của MongoDB, không phải giải pháp archive hoàn chỉnh. Khi chạm giới hạn, API dừng ghi với lỗi có nghĩa; muốn tiếp tục phải có archive/checkpoint policy do nhóm chốt, không silently trim. Các bản cực lớn/hỏng schema cần dry-run repair riêng; không cam kết tự chữa mọi BSON nhập tay. Metadata collection `decision_anchors` và embedding reports/history khác sơ đồ 11 collection cũ; ADR-021 mô tả thực tế, tài liệu baseline cũ không được coi là migration plan.

## 5. Blockchain: local không phải công khai

| Bằng chứng | Đã có | Không được suy ra |
|---|---|---|
| SHA-256 hash-chain trong Mongo riêng | Hash/previousHash/nonce/state hash, tamper tests, tương thích encoding cũ | Không phải tx; không chống DB admin tính lại toàn chuỗi |
| EVM local thật | solc compile, Ganache loopback chain 1337, deploy fixture, receipt/call/registrar/immutable/hash/confirmations checks | Không phải public testnet/mainnet; không có explorer public |
| Neo công khai | **Chưa thực hiện** | Không được gọi toàn bộ lịch sử “đã xác thực công khai” |

Kết nối một RPC/chainId hợp lệ chỉ chứng minh adapter đọc được mạng đã cấu hình, không tự chứng minh đó là public network. VERIFIED là kết quả xác minh trên mạng cấu hình ở lần kiểm trước, không là cam kết finality vĩnh viễn. Chỉ ID ngẫu nhiên + hash lên registry; nonce và dữ liệu HR vẫn off-chain. Chưa quản trị multisig/key rotation/automatic anchoring, chưa security audit bên thứ ba. Không yêu cầu private key trong chat.

## 6. Kiểm thử thực tế

Kết quả cuối sau khi các phiên regression kết thúc (exit 0); không dùng số đợt trước làm số hiện tại:

| Gate | Kết quả thực tế |
|---|---|
| Toàn bộ API (17 file) | **205/205 PASS**, 0 fail / 0 skip / 0 cancelled |
| Shared contracts | **44/44 PASS** |
| Toàn bộ web regression | **62/62 PASS**, gồm mandatory E2E |
| Mandatory E2E chạy riêng đúng lệnh repo | **17/17 PASS**; cùng bộ 17 ca đã nằm trong 62 web, không cộng trùng |
| Browser → API → Mongo riêng | **7 nhóm PASS**, 0 runtime exception |
| Typecheck toàn monorepo | PASS |
| Build toàn monorepo | PASS, còn 3 CSS warnings cũ mô tả bên dưới |
| Solidity compile command | PASS; compile-only, không public deployment |
| git diff --check | PASS |

Bộ EVM local 4 ca nằm trong 205 API, không cộng lặp lần hai. Suite consent 13 ca và review 15 ca cũng là các phần của tổng API, không phải 28 ca ngoài tổng.

- API: `pnpm --filter api test` — xem `test-results/review-api-regression.log`.
- Contracts: `pnpm --filter @hr-blockbot/contracts test` — `review-contracts.log`.
- Web regression (bao gồm mandatory E2E): `node --test apps/web/test/*.test.mjs` — `review-web-regression.log`.
- Mandatory E2E độc lập: `node apps/web/test/e2e-revamp-flow.test.mjs` — `review-required-e2e.log`.
- Browser/database riêng: `node apps/web/test/crm-workflow.integration.mjs` — `review-browser-regression.log`.
- Typecheck/build: `review-typecheck.log`, `review-build.log`.
- Focused API/database: `review-focused-final.log` — 15 review cases + 13 consent cases PASS trước regression toàn bộ.

Browser thật sử dụng global manager và hai nhân viên fixture; request đi qua React→Express→MongoDB riêng, không mock thành công nghiệp vụ. Bảy nhóm: create/assign; consent/start/progress/real409 giữ draft; reject/resubmit report; approve và kiểm DB; initial decline/replacement/two-party handover/interval/KPI; profile edit/reject/history/resubmit/approve; keyboard/Escape/mobile/zero runtime exceptions. Socket confirmations cũng kiểm qua client/server thật trong API test. Không sử dụng dữ liệu/tài khoản thật của quán.

Ảnh đã xem: `test-results/crm-profile-approval-desktop.png`, `crm-profile-history-mobile.png`; ảnh assignment/report được giữ từ browser run. Cảnh báo tồn tại: 3 CSS optimizer warnings ở landing selector cũ; Ganache µWS native không hỗ trợ Node hiện tại và dùng JS fallback. Không sửa Python nên không tuyên bố đã chạy/đạt AI pytest hoặc eval model. Hai lỗi typecheck ở lần nối UI đầu đã sửa, build lại contracts trước kiểm tra. Các log `review-api-final.log` trước bản regression cuối có ca uppercase tái hiện lỗi trên build cũ, không phải bằng chứng gate xanh.

## 7. Kế hoạch còn lại trước nghiệm thu — không loại khỏi scope

| Ưu tiên | Việc | Tận dụng hiện có / điều kiện hoàn thành |
|---|---|---|
| P1 | Chốt canonical mapping phòng ban/cửa hàng/employeeCode và thay đổi đơn vị khi còn assignment | Dùng directory fallback + guards; kiểm duplicate hai alias, dry-run thống kê, rollback/migration có phê duyệt. Không suy ra mọi store_name là department mới |
| P1 | F1 create/edit đã được bổ sung; tiếp tục archive/transfer/migration khi có chính sách | Xem personnel-admin-report.md; không tự cấp account/role; partial creation-key uniqueness không thay backfill/import protocol. Archive/hard-delete/cascade chưa có luật thì nhóm chốt trước |
| P1 | Nối chat executor + thống nhất assigneeId/assigneeIds và progress fields | Hòa/Hoàng dùng dịch vụ consent/report có CAS/scope, server-owned proposal ID và explicit confirm; không tin args/identity do client tự gửi. Test chat và web chung một nguồn, giữ 409 thay vì bypass |
| P1 | Notification delivery + Agenda deadline jobs | Dùng notice/inbox như integration seam, thống nhất nguồn outbox/notifications, persist-before-emit, recipient revalidation, durable dedupe/restart; một scheduler entrypoint, không thêm Redis/BullMQ. Không coi backlog này bị chặn hoàn toàn bởi TBD: mốc 3/1/quá hạn đã có, riêng auto-escalation/digest template chưa chốt |
| P1 | KPI contract/cycle/formula theo nhóm → UI review/publish/history và trend | Không tự chọn granularity/trọng số/ceiling; reuse published read baseline chỉ như consumer tạm. Hòa cung cấp model/bảng số, Hoàng API, Phi UI |
| P2 | Pagination hàng đợi profile, inbox cũ và filters công việc chưa khép | Dùng paging shared; không ngầm chỉ lấy trang đầu; benchmark theo dữ liệu seed kích thước được nhóm chốt |
| P2 | Replay/idempotency đầy đủ và reconcile reports projection | CAS hiện chặn ghi trùng nhưng không là replay cache; cần khóa request/retained response, worker reconcile không tạo trạng thái duyệt thứ hai |
| P2 | Archive/audit checkpoint vận hành | Chốt retention/export/verify/restore cho bounded arrays; không tăng trần tùy tiện hoặc silently delete |
| P2 | Public-chain và UAT ví | Chọn mạng, registrar/finality, deploy khi được phép, bằng chứng tx/receipt/hash trên public explorer; không chi phí hoặc dùng private key ngoài thẩm quyền |
| Trước nghiệm thu | Đồng bộ tài liệu/API + Lighthouse/Postman/UAT + deploy được cho phép | Tài liệu cũ còn email-login/multi-assignee/11-collection/WS giả định khác code; bảng này giữ rõ khác biệt. UAT với người dùng thật là gate riêng, không thay bằng số test |

TBD nhóm cần chốt: mapping/migration và org-transfer/archive; granularity/công thức/ceiling KPI; escalation/acceptance timeout; template digest; retention/archive; public-chain network/finality/registrar. Không tự đặt luật. Các chức năng đã đặc tả như deadline jobs/chat executor vẫn là việc triển khai còn lại của nhóm, không được đổi nhãn thành “ngoài phạm vi”.

## 8. Nguồn kỹ thuật đã kiểm lại

- [MongoDB single-document atomicity](https://www.mongodb.com/docs/manual/core/write-operations-atomicity/): expected-value filters là cơ sở cho CAS, không bảo đảm atomic giữa employee/project/report collections khác nhau.
- [MongoDB limits](https://www.mongodb.com/docs/manual/reference/limits/): BSON document tối đa 16 MiB; ngưỡng 8 MiB của ứng dụng là headroom nội bộ.
- [OWASP API1:2023](https://api-security.owasp.org/editions/2023/en/0xa1-broken-object-level-authorization/): kiểm quyền đối tượng tại từng đường đọc/ghi. Việc áp dụng thứ tự canonical fallback là quyết định kỹ thuật dựa trên schema hiện hữu, không phải chính sách HR mới.

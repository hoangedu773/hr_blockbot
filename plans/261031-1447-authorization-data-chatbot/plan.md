---
title: "Phân quyền HR BlockBot: nghiệp vụ, dữ liệu và chatbot"
description: "Thiết kế quyền theo quy định phân cấp GUTA, Admin chuyên biệt và phạm vi được giao; đối chiếu source và MongoDB hr_bot."
status: pending
priority: P1
branch: integration/full-delivery
tags: [auth, database, api, backend, frontend, docs]
created: 2026-10-31
blockedBy: []
blocks: []
---

# Phân quyền HR BlockBot: hiện trạng, quyết định và kế hoạch

**Kết luận:** nhận định “vẫn chỉ có hai quyền” đúng ở tầng authorization hiện tại. DB có thêm chức danh nghiệp vụ nhưng chưa có mô hình cấp quyền quản lý theo cửa hàng/cụm. Không nên nâng toàn bộ SM/AOM thành `Admin`. Đề xuất giữ hai role kỹ thuật, bổ sung hồ sơ quyền nghiệp vụ được cấp rõ ràng, scope cửa hàng có kiểm chứng và một nơi thi hành policy cho cả REST lẫn chatbot.

Đây là **đề xuất để duyệt và triển khai**, không phải mô tả tính năng đã hoàn thành. Chỉ cập nhật file kế hoạch này; không sửa ứng dụng, schema, tài khoản, credential, dữ liệu hoặc văn bản GUTA gốc. Không commit/deploy. Các phase nằm chung file theo yêu cầu một đầu ra duy nhất; không sinh report, ADR, journal hay phase file phụ.

## 1. Trade-offs và hợp đồng đầu ra

### 1.1. Các hướng đã so sánh

| Hướng | Lợi ích | Chi phí/rủi ro | Giả định quan trọng nhất | Điều kiện hỏng đầu tiên |
|---|---|---|---|---|
| Chỉ mở rộng enum `role` thành các chức danh | Dễ hiểu lúc đầu | Đổi JWT/caller hàng loạt; chức danh vẫn không nói quản lý cửa hàng nào; dễ cấp quá quyền | Chức danh đủ quyết định quyền | AOM nhiều cửa hàng, AM thuộc group, người kiêm nhiệm |
| **Giữ role kỹ thuật; profile quyền nghiệp vụ + scope được giao; API thi hành chung** | Tái sử dụng auth; kiểm được action, document, field; chatbot không có cửa sau | Phải chuẩn hóa mapping và chuyển query nghiệp vụ của AI qua API | Có người chịu trách nhiệm duyệt phân công quản lý | Mapping thiếu hoặc hết hạn; xử lý bằng deny, không đoán |
| MongoDB user/view riêng cho từng người hoặc từng cửa hàng | Giảm blast radius khi credential bị lộ | Số credential/view tăng; pool và thu hồi phức tạp; khó xử lý chuyển cửa hàng, lịch hỗ trợ, duyệt chéo | Phân vùng dữ liệu ít thay đổi, gần như không giao nhau | Nhân viên hỗ trợ liên cửa hàng hoặc thay phân công |

**Chọn hướng thứ hai.** Policy quyết định bằng `(principal hiện hành, capability, resource scope, ownership, trạng thái nghiệp vụ, field projection)`. Không cần thêm CASL/policy server; dùng TypeScript/Zod/jose hiện có. Python không tự diễn giải lại quyền nghiệp vụ.

**Better approaches:** hướng trên tốt hơn cách nâng manager thành `Admin` hoặc chỉ thêm role. Bằng chứng: 5 AOM và 12 AM đang hoạt động thuộc department loại `group`, không có cạnh xác định các outlet họ quản lý; 11 cửa hàng có nhiều SM/PTCH đang hoạt động; API và AI đang kiểm quyền khác nhau. Đổi sang một policy API và mapping tường minh tốn công migration nhưng loại bỏ việc suy đoán scope từ tên nhóm/prompt. Không hứa MongoDB credential dùng chung tự lọc từng nhân viên.

### 1.2. Hợp đồng

- **Outcome:** xác định chính xác ai được làm gì, với dữ liệu nào, trên API/UI/chatbot/DB; có roadmap đủ để triển khai và kiểm chứng.
- **Constraints:** React 18/Vite, Express/TypeScript, FastAPI/Python, Zod contracts, MongoDB Atlas; single-document atomic update, không multi-document transaction; giữ dữ liệu nguồn; không tiết lộ PII/secrets. Đây là task đọc và lập plan, không triển khai.
- **Non-goals:** thêm payroll/POS/kho/attendance thật chưa có nguồn; xây permission editor tổng quát; tạo chức danh HR/kế toán khi chưa có chủ sở hữu nghiệp vụ; mở lại legacy chỉ vì đã viết guard; thay thuật toán matching/RAG; xây conversation persistence/executor chatbot trong task này.
- **Acceptance của file:** có bằng chứng DB live, đối chiếu code, ma trận profile/action/field/scope, đặc quyền service DB, chatbot hard guards, migration/rollback, file boundaries, test matrix, operational risks và câu hỏi nghiệp vụ còn thiếu.
- **Acceptance khi triển khai:** cùng principal và resource cho cùng quyết định ở REST/socket/chatbot; không đọc/ghi chéo scope; thu hồi quyền có hiệu lực với request mới; không rò qua totals, search, cache, citation, attachment, event; denial không tạo side effect.
- **Cập nhật theo nguồn người dùng cung cấp:** Admin chuyên biệt là vai quản trị hệ thống tách khỏi bộ máy vận hành GUTA. Nguồn nghiệp vụ là `C:/work-space/hr-blockbot/docs/phanquynguta.md`, văn bản 002-2023/QĐ/HCNS-GUTA V.1; không chỉnh nội dung ban hành của công ty để khớp thiết kế phần mềm. Nghiệm thu lần sửa này phải loại bỏ giả định AM chỉ hỗ trợ, PTCH ngang SM và gộp OM/OD thành một profile vận hành.

### 1.3. Nguồn GUTA mới và những điều đã chốt

Đã đọc đủ 297 dòng của `phanquynguta.md`. Đây là bản người dùng cung cấp; chưa xác minh có văn bản công ty thay thế sau V.1. Chức năng nghiệp vụ trong nguồn là căn cứ thiết kế, **không phải danh sách endpoint permissions đã được công ty phê duyệt**.

| Nội dung được nguồn xác định | Căn cứ | Hệ quả thiết kế |
|---|---|---|
| Cấp quản lý từ SM1 trở lên | Chương 1, định nghĩa, dòng 89 | PTCH không tự có bộ quyền manager hoặc quyền duyệt của SM |
| AM là Quản lý khu vực; AOM là Trợ lý OM; SAM là Quản lý khu vực cấp cao; OM là Quản lý vùng/Trưởng phòng Vận hành | Chương 1, dòng 97–102; Chương 2, dòng 136–145 | Không đoán nghĩa AM; bổ sung SAM/OM, không gộp thành `operations` |
| OM ở trên hai nhánh AOM và SAM; SAM có nhánh AM và SM3; AM quản lý SM1/SM2; PTCH hỗ trợ cửa hàng | Sơ đồ Chương 2, dòng 110–127 | Hiển thị đúng cơ cấu; không biến sơ đồ thành kế thừa toàn bộ permissions |
| AOM hỗ trợ OM, quản lý SAM/SM3/AM theo phạm vi nhiệm vụ | Bảng chức năng, dòng 144 | Tách quan hệ báo cáo trong sơ đồ khỏi authority theo nhiệm vụ; phải có phân công thực tế, không tự thêm cạnh báo cáo cố định trái nguồn |
| SM1/SM2: 01–02 cửa hàng; SM3: 03–05; AM1: 05–07; AM2: 07–10; AM3: 08–12; SAM: 12–20; AOM: 20–30 | Phụ lục 2, dòng 280; nguồn là Phân công của OM | Đây là khung năng lực/thăng tiến, không quota tự cấp storeIds hoặc tự chọn đủ số cửa hàng |
| Phân công cửa hàng và quản lý trực thuộc lấy từ OM | Phụ lục 2, dòng 280–281 | Quyết định nghiệp vụ thuộc OM/cấp được ủy quyền; Admin chỉ cấu hình grant theo bằng chứng, không tự tạo phân công |
| PTCH tập sự quản lý, hỗ trợ SM điều phối và đảm bảo dịch vụ | Chương 2, dòng 136 | Có đề xuất/điều phối được giao; mặc định không publish/duyệt độc lập |
| QC kiểm vi phạm; Đào tạo kiểm chứng chỉ và tổ chức thi; HCNS thẩm định và cập nhật DATA/lương; BGĐ phê duyệt | Chương 1, dòng 68–75; Chương 3, dòng 180–198 | Không để system_admin hoặc OM thay các bên này chỉ vì quyền kỹ thuật hoặc cấp bậc cao |
| KPI lương thay đổi theo quyết định BGĐ từng tháng | Chương 2, dòng 150–151 | Không tự tạo công thức payroll hoặc quyền override KPI từ title |

`OD` xuất hiện trong DB nhưng **không được định nghĩa trong văn bản này**; giữ nguyên chức danh nguồn, không tự ánh xạ sang OM, BGĐ hoặc Admin. Cấp NV1–NV3, SM1–SM3, AM1–AM3 phải lưu riêng với `level=Intern/Junior/Middle/Senior/Lead`; không chuyển đổi hai hệ cấp bậc bằng suy đoán.

Không chép khung lương vào plan hoặc coi là lương hiện hành năm 2026. Quyền xem văn bản có phụ lục lương phải theo ACL; không phân phối toàn bộ tài liệu cho mọi profile chỉ vì phần chức danh cần dùng chung.

## 2. Bằng chứng thực tế

### 2.1. Cách kiểm tra và giới hạn

- Source được đọc tại workspace hiện tại, branch thực tế `integration/full-delivery`; working tree sạch trước khi tạo file. Không checkout sang `main` hay sửa workspace gốc.
- MongoDB MCP `preconfigured` trỏ DB khác, không dùng làm bằng chứng HR. Kết nối riêng bằng cấu hình có sẵn tại repo gốc `C:/work-space/hr-blockbot/.env`, target `hr_bot`; không in URI hoặc giá trị credential.
- Đã chạy read-only: `listCollections`, aggregation `$facet/$group/$lookup/$project`, `collection-indexes`; thêm `connectionStatus` để xem quyền credential. Không `$out/$merge`, insert/update/delete, index/role change.
- Số liệu dưới đây là quan sát trực tiếp ngày **31/10/2026**, không lấy số cũ trong README. Credential này thuộc cấu hình repo gốc; **chưa xác minh credential Render đang chạy có giống nó hay không**.
- Không xuất username, tên nhân viên, mã nhân viên, số ngân hàng, token hoặc nội dung tài liệu riêng tư. Schema field là metadata; không đồng nghĩa người dùng được đọc field đó.
- Đây không phải snapshot transaction: các query đọc riêng, số lượng có thể thay đổi do ứng dụng đang hoạt động. Không chạy exploit, API smoke, typecheck/build/E2E trong task lập plan; findings source chưa được chứng minh bằng khai thác runtime.

### 2.2. Tài khoản và chức danh

| Nhóm trong DB | Tổng hồ sơ | Đang hoạt động | Đã nghỉ | `users.role` hiện tại |
|---|---:|---:|---:|---|
| staff | 2.239 | 635 | 1.604 | Employee |
| ptch | 89 | 44 | 45 | Employee |
| sm | 80 | 42 | 38 | Employee |
| am | 24 | 12 | 12 | Employee |
| aom | 5 | 5 | 0 | Employee |
| businessRole `admin` từ OD/OM | 2 | 2 | 0 | Employee |
| Global Admin không gắn employee | 3 | Không áp dụng | Không áp dụng | Admin, isGlobalAdmin=true |

- **2.439 employees, 2.442 users**; 2.439 user liên kết được employee; không thấy tài khoản Employee không liên kết trong dữ liệu hiện tại. Code vẫn cho phép tạo tình huống đó.
- `users.businessRole` khớp employee tại thời điểm đo: 0 mismatch. Chưa có `status/isActive/disabled` trên user trong shape đã đọc. **1.699 tài khoản liên kết employee đã nghỉ**; chưa chạy login để kết luận từng tài khoản còn đăng nhập được.
- `deriveBusinessRole()` ánh xạ OD/OM thành `admin`, nhưng không biến họ thành Admin hệ thống: `apps/api/src/models/Employee.ts:15-28`. Hai khái niệm đang bị đặt tên dễ nhầm.
- `level = Intern/Junior/Middle/Senior/Lead` là trình độ, **không phải quyền**. Giữ quyết định này của `docs/07-auth-rbac.md:15-45`.

### 2.3. Cấu trúc tổ chức và ownership

| Quan sát live | Ý nghĩa đối với quyền |
|---|---|
| 144 `stores`, chỉ có `_id/store_name/employee_count` trong documents đọc | Không phải 144 chi nhánh hoạt động; có group/support/đơn vị legacy; chưa có `kind/status` authoritative |
| 37 departments: 26 region, 8 group, 3 unmapped | Không coi department địa lý là cụm quản lý đã giao |
| 2.439/2.439 employees join đúng một department và một store theo tên | Join hợp lệ kỹ thuật, không chứng minh quyền quản lý |
| Cả 2.439 employees chưa có `storeId` | Phải có canonical ObjectId trước khi dùng store làm security boundary |
| 5 AOM active thuộc 5 group; 12 AM active thuộc 4 group | Không suy ra outlet coverage từ group chứa người quản lý |
| 86 hồ sơ SM/PTCH active trên 74 store names; 11 nơi có nhiều hồ sơ SM/PTCH; 9 nơi có cả hai chức danh | Đây là thống kê nhãn legacy, không khẳng định PTCH là cấp quản lý; xác nhận SM chịu trách nhiệm và PTCH hỗ trợ theo phân công |
| Không có collection quản lý assignment/role/permission hoặc `store_aliases` trong 19 collections live | Tài liệu nói alias đã có không chứng minh Atlas hiện có |

**Không dựng quan hệ quản lý cá nhân từ `departmentId`, `store_raw` hoặc tên người.** Nguồn GUTA mới xác định cơ cấu chức danh (§1.3), nhưng chưa cung cấp ai đang báo cáo cho ai hoặc quản lý outlet cụ thể nào. Cấu trúc chuẩn không thay danh sách phân công thực tế.

### 2.4. Dữ liệu cần bảo vệ

| Collection | Số document live | Ownership/giới hạn cần lưu ý |
|---|---:|---|
| employees | 2.439 | Có bank fields; 1.964 hồ sơ có giá trị ngân hàng không rỗng; có leave_reason/profile_status |
| users | 2.442 | Password hash, quyền, liên kết employee; không dùng làm directory công khai |
| stores / departments | 144 / 37 | Phải tách danh mục nguồn khỏi security assignment |
| schedule_entries | 3.275 | Không có storeId; join block qua `(sheet_name, block_index)`; 670 dòng không mã employee |
| schedule_blocks / schedule_weeks | 105 / 29 | Block code/tên sheet không phải security ID |
| attendance_corrections | 115 | 115 join được employee, **0** exact-match `store_name` với stores; 2 APPROVED, 113 thiếu status |
| training_attendance | 8 | Có dòng thiếu employee_code; location không mặc nhiên là cửa hàng quản lý |
| cash_counts | 9 | **0** exact-match store_name; không có ngày nghiệp vụ |
| cash_denominations / cash_summary | 9 / 1 | Túi tiền/tổng nguồn chung, không có chiều store; không phân bổ giả theo dòng |
| policies | 223, tổng 435 chunks | Tất cả departmentIds rỗng/thiếu; 0 document có allowedRoles/classification |
| projects / reports | 0 / 0 | Thiết kế từ source/contracts; không có dữ liệu live chứng minh workflow |
| settings | 1 | Provider credentials và audit cấu hình; không cho AI đọc trực tiếp |
| refresh_sessions | 37 tại lúc đo | Hash/token family metadata; chỉ auth service cần truy cập |
| raw_cells | 32.980 | Có thể tái dựng dữ liệu nhạy cảm; không mở như công cụ hỏi đáp tổng quát |
| data_provenance | 1 | Metadata import/seed; chỉ quản trị dữ liệu |

670 dòng lịch thiếu mã gồm shortage/support và 420 dòng `row_kind=employee`; không dùng tên người để tự gán ownership. Mọi lịch đều join được đúng block; điều đó chưa chứng minh block được map outlet. `AB1-B219` có 112 dòng; 433 dòng có block_code null. Tài liệu local mô tả alias bridge nhưng Atlas live chưa có: `docs/database-design.md:86-109`.

**Credential đang dùng để đọc có role `atlasAdmin` trên `admin`.** Đây là quyền cấp DB/service, không phải `users.role=Admin`. Cần thu hẹp; task này chưa thay quyền và chưa kiểm tra cấu hình Atlas của từng service.

## 3. Hiện trạng source và khoảng trống

| Khu vực | Đã có | Khoảng trống cần xử lý | Dẫn chứng |
|---|---|---|---|
| Auth | JWT `Admin/Employee`; HTTP đọc lại user | Chưa có permission profile/scope assignment; password-change gate chủ yếu UI | `apps/api/src/middlewares/auth.middleware.ts:43-50,109-145`; `apps/api/src/models/User.ts:8-59` |
| RBAC chung | Employee self; Admin department; global flag | Target thiếu department vẫn có nhánh cho qua; manager businessRole chưa tham gia | `apps/api/src/services/rbac.service.ts:31-71` |
| User provisioning | Global Admin quản lý tài khoản | Không có store grants; relink hai chiều có nguy cơ stale ownership; last-admin guard count rồi save | `apps/api/src/routes/admin-users.ts:24-42,329-413,469-505` |
| Employees | List Admin scope; detail self/department | Global bypass chưa đồng nhất; legacy `$or` có thể mở rộng scope khi dữ liệu mâu thuẫn | `apps/api/src/routes/employees.ts:21-130,155-249,283-427` |
| Stores | Global / department suy ra store / own store | AOM chỉ có group của mình; không có cụm được giao; manager hiển thị không là authority | `apps/api/src/routes/stores.ts:79-125,229-254,298-453` |
| Dashboard | Có aggregate thật | Auth-only, không lọc theo caller cho toàn bộ thống kê | `apps/api/src/routes/dashboard.ts:30-104` |
| Projects | State/version guards | Create/assign kiểm Admin nhưng không kiểm resource/assignee scope; transition ownership không đầy đủ; list có thể query rỗng nếu Employee không linked | `apps/api/src/routes/projects.ts:66-110,169-205,272-360,374-403` |
| Reports | Scope đọc/review qua project | Create Admin thiếu scope; chưa chặn tự duyệt | `apps/api/src/routes/reports.ts:70-119,147-248` |
| Settings | Admin-only | Scoped Admin vẫn đổi provider toàn hệ thống | `apps/api/src/routes/admin-settings.ts:16,96,122` |
| Legacy lịch/chấm công/tiền | Bị chặn mọi method bằng 503 | Router dormant không có guard; **không phải endpoint hiện đang mở** | `apps/api/src/app.ts:82-94`; `routes/schedules.ts`, `corrections.ts`, `cash.ts` |
| Chat HTTP | Context lấy từ server, body có validation | Resolver cache 60 giây, nuốt lỗi; businessRole từ job_title không phải grant | `apps/api/src/routes/chat.ts:10-42`; `services/user-scope.service.ts:22-67` |
| Socket | Auth lúc handshake, room theo user | Claims cũ sau đổi quyền/xóa user/expiry; không cùng lifecycle HTTP | `apps/api/src/socket.ts:29-52,71-115` |
| AI tools | Allowlist 7 tools, validate args, role checks, timeout/cap | Chỉ Admin/Employee; một số Admin thiếu department được đi tiếp; không store/cụm scope | `apps/ai-service/app/agent/tools.py:143-159,295-305,458-597` |
| RAG và policy tĩnh | Service key; RAG có scope department; BM25 policy tĩnh | Tool policy không truyền scope; scope thiếu cho phép toàn bộ; role prompt không là ACL | `apps/ai-service/app/agent/tools.py:411-412`; `app/rag/retrieval.py:85-98,321-329`; `app/agent/in_context_policy.py:284-346` |
| Attachments | Auth, path containment, category/extension allowlist | Chưa liên kết ACL tài liệu/owner; protected link cần authenticated fetch hoặc URL ngắn hạn | `apps/api/src/routes/attachments.ts:55-119`; `apps/web/src/components/chat/ChatPageView.tsx:420,445` |
| Chat writes/history | Proposal; UI messages trong memory | Không có executor hoặc persistence thật; socket có nhánh báo success dù không write | `apps/api/src/socket.ts:106-164`; `apps/web/src/components/chat/ChatPageView.tsx:197-204,289-292` |

Hai lỗi schema ảnh hưởng việc kiểm quyền chatbot: API dùng `assigneeId/progress`, AI có query `assigneeIds/progressPct`; proposal loại `_id` rồi dùng nó làm projectId. Phải sửa cùng contract khi chuyển tool reads, không vá bằng mock khác schema thật. Nguồn: `apps/api/src/models/Project.ts:18-27`; `apps/ai-service/app/agent/tools.py:227-252,424-450`.

**Ưu tiên chặn trước:** global dashboard ngoài scope; settings của Admin không global; project mutation/assignee scope; missing-scope fail-open; socket stale identity; chatbot báo thực thi giả. Các phát hiện là review source, chưa thực hiện exploit production.

## 4. Mô hình phân quyền đề xuất

### 4.1. Tách bốn khái niệm

| Khái niệm | Nguồn authoritative | Quy tắc |
|---|---|---|
| `role` kỹ thuật | users.role | Giữ `Admin/Employee` để tương thích auth; không đủ để cho phép nghiệp vụ |
| Chức danh/cấp GUTA | employees.job_title/businessRole và cấp GUTA có nguồn xác minh | Dữ liệu nhân sự theo văn bản; không tự cấp quyền; OD chưa được định nghĩa; OM không phải Admin |
| `authorization.profile` | Admin chuyên biệt cấu hình sau quyết định nghiệp vụ đúng thẩm quyền | Bộ capability cố định theo profile; không nhận permission tùy ý từ client; cấp quản lý không tự quản lý grants |
| `authorization.storeIds` | ObjectId outlet theo phân công OM/cấp được ủy quyền, lưu bằng chứng duyệt | Scope quản lý; department chỉ phân loại/report hoặc legacy target đã map được |

Profiles mục tiêu: `system_admin`, `om`, `aom`, `sam`, `am`, `sm`, `ptch`, `staff`. NV1–NV3 dùng `staff`; SM1–SM3 dùng `sm`; AM1–AM3 dùng `am`, cấp chi tiết lưu riêng. SAM/OM phải có trong contract dù DB hiện chưa có SAM và đang gộp OM/OD dưới businessRole `admin`. Không giữ alias `operations` hoặc dùng `businessRole=admin` để cấp quyền.

**Admin chuyên biệt của người dùng:** quản trị tài khoản, cấu hình tích hợp, chính sách và cấp/thu hồi grant theo căn cứ được duyệt; nằm ngoài sơ đồ GUTA. Không tự là OM/BGĐ/HCNS, không tự duyệt thăng tiến/lương/đề xuất vận hành, không mặc nhiên đọc bí mật hoặc sở hữu credential `atlasAdmin`. Ba tài khoản global hiện có là đối tượng cần review, không khẳng định cả ba đều là Admin chuyên biệt của người dùng và không tự xóa chúng.

Một user có một profile được cấp trong phạm vi hiện tại. Nhiều cửa hàng dùng storeIds được giao; cấp bậc hoặc số cửa hàng chuẩn năng lực không tự tăng quyền. Chưa thêm permission editor hoặc override từng action. Nếu cần kiêm nhiệm hai vai độc lập, phải thiết kế grant tách vai/scope trước, không dùng system_admin để kiêm luôn quyền duyệt nghiệp vụ.

### 4.2. Quy tắc quyết định bắt buộc

1. User tồn tại, account active; employee linked còn active khi profile yêu cầu employee; mật khẩu tạm chỉ được đổi mật khẩu, đọc session tối thiểu hoặc logout.
2. Profile hợp lệ; grant còn hiệu lực; `system_admin` phải đồng thời `role=Admin` và `isGlobalAdmin=true`. Các tổ hợp role/global/profile không nhất quán bị từ chối, không suy ra quyền.
3. Action thuộc capability cố định của profile. Không dùng so sánh “rank cao hơn” để suy diễn quyền.
4. Resource có canonical ownership/scope và nằm trong tập được giao; thiếu mapping là deny. Scope truy vấn là giao của filter người dùng với scope server, không phải filter người dùng ghi đè scope.
5. Check trạng thái nghiệp vụ, assignee, self-approval và fields được sửa. `level/job_title/storeId/role/grants/status` không nằm trong self-edit payload.
6. Áp allowlist projection trước khi trả hoặc đưa vào LLM; query/count/aggregate/citation/cache/event cùng scope.
7. Mutation dùng atomic predicate có `_id`, scope/assignee cần thiết, expected version/trạng thái. Denied trả 403 cho thiếu capability; detail ngoài scope trả 404 để không lộ tồn tại; list chỉ trả items/totals đã lọc. DB outage trả 503, không fallback global/empty-authority.

`system_admin` có phạm vi quản trị toàn hệ thống nhưng **không có quyền quyết định nghiệp vụ chỉ vì là Admin**. Có thể hỗ trợ chẩn đoán bằng DTO tối thiểu có audit; không tự duyệt báo cáo, chấm công, tiền, thăng tiến hoặc lương. Không tiếp tục hỗ trợ “Admin scoped” ngầm: review và chuyển sang profile nghiệp vụ có căn cứ hoặc khóa phần quyền chưa rõ. Live thấy 3 Admin global; chưa xác định tài khoản nào là Admin chuyên biệt, chưa thay đổi tài khoản nào.

### 4.3. Ma trận scope theo profile

| Profile | Phạm vi | Căn cứ cấp quyền | Không được suy diễn |
|---|---|---|---|
| system_admin | Quản trị toàn hệ thống, chẩn đoán dữ liệu tối thiểu | Vai Admin chuyên biệt do chủ hệ thống chỉ định; review ba tài khoản global hiện có | Không đồng nhất Admin với OM/BGĐ/HCNS hoặc Atlas admin |
| om | Vùng và outlet được phân công | Quyết định bổ nhiệm/phân công hợp lệ; có thể toàn chuỗi nếu quyết định ghi rõ | Không mặc định toàn công ty hoặc quyền user/provider |
| aom | Phần vùng/outlet và nhiệm vụ OM giao | Phân công hỗ trợ OM, quản lý theo chức năng trong nguồn | Không lấy tên group làm store coverage, không tự thay OM/BGĐ |
| sam | Khu vực, outlet và trách nhiệm quản lý được giao | Quyết định phân công; xác định người quản lý trực thuộc bằng nguồn thực tế | Không tự cấp quyền dù văn bản có khung 12–20 cửa hàng |
| am | Khu vực gồm các outlet được giao | AM1/AM2/AM3 theo hồ sơ và Phân công của OM | Không hạ thành assistant manager; không tự mở rộng scope theo quận |
| sm | Một hoặc nhiều outlet được giao | Phân công của OM; cấp SM1/SM2/SM3 xác minh từ hồ sơ | Không ép mọi SM chỉ một cửa hàng; title `SM` không đủ biết bậc |
| ptch | Công việc hỗ trợ tại outlet được giao | Phân công hỗ trợ SM; quyền giới hạn theo chức năng | Không tự có quyền publish/duyệt ngang SM; thời hạn là đề xuất kiểm soát, không phải điều khoản nguồn |
| staff | Self; roster tối thiểu nơi làm việc được xác nhận | Employee-store canonical, cấp NV nếu có nguồn | Không dùng NV3 hoặc Lead kỹ thuật để tự thành manager |

AM là quản lý khu vực thật, không còn mặc định chỉ hỗ trợ. Các quyền duyệt endpoint dưới đây là **đề xuất kỹ thuật cần duyệt**, vì văn bản chức danh chưa quy định ai được duyệt báo cáo/chấm công/tiền trong ứng dụng. PTCH mặc định đề xuất và điều phối, không publish/duyệt; ủy quyền thay SM cần căn cứ riêng, chưa bật bằng profile PTCH.

### 4.4. Ma trận hành động mục tiêu

Ký hiệu: **S** chính mình/được giao trực tiếp; **C** outlet được giao; **G** toàn hệ thống trong đúng capability; **ĐX** chỉ đề xuất/yêu cầu; **—** từ chối. OM/AOM/SAM/AM không tự có global scope. **KT** chỉ đọc DTO chẩn đoán tối thiểu có audit, không quyền phê duyệt hoặc đọc dữ liệu mật.

| Capability / hành động | system_admin | om | aom | sam | am | sm | ptch | staff |
|---|---|---|---|---|---|---|---|---|
| profile.read_self / change_request.create_self | S nếu có employee | S | S | S | S | S | S | S |
| employees.read_operational / directory.search | KT | C | C | C | C | C | C tối thiểu | — |
| employees.change_request.create_other | — | ĐX C | ĐX C | ĐX C | ĐX C | ĐX C | ĐX C | — |
| employees.change_request.review (đổi hồ sơ nhân sự) | — | — | — | — | — | — | — | — |
| dashboard.read / scoped aggregates | KT | C | C | C | C | C | C điều phối | S tối thiểu |
| stores.read | G metadata | C | C | C | C | C | C tối thiểu | Nơi làm việc, fields tối thiểu |
| stores.create / rename / delete / mapping.admin | G, theo yêu cầu hợp lệ | — | — | — | — | — | — | — |
| roster.read_self | S nếu có employee | S | S | S | S | S | S | S |
| roster.read_store_minimal | KT | C | C | C | C | C | C | Nơi làm việc, không hồ sơ riêng |
| schedule.propose | — | C | C | C | C | C | C | ĐX S |
| schedule.publish / amend | — | C | C | C | C | C | — | — |
| correction.create | — | C | C | C | C | C | ĐX C hoặc S | S |
| correction.review | — | C, không self | C, không self | C, không self | C, không self | C, không self | — | — |
| cash.read_store / count.propose | KT, không tạo count | C | C | C | C | C | ĐX C | — |
| cash.review | — | C, không self | C, không self | C, không self | C, không self | — | — | — |
| cash.read_global_source_summary | — | Chỉ scope toàn nguồn được duyệt | — | — | — | — | — | — |
| projects.create / assign | — | C | C | C | C | C | ĐX C | — |
| projects.read | KT | C hoặc S | C hoặc S | C hoặc S | C hoặc S | C hoặc S | S | S |
| projects.start / progress / report.submit | — | S | S | S | S | S | S | S |
| reports.review / project.complete_or_return | — | C, không self | C, không self | C, không self | C, không self | C, không self | — | — |
| kpi.read_self_published | S nếu có employee | S | S | S | S | S | S | S |
| kpi.read_store_published | — | C | C | C | C | C | — | — |
| kpi.override/publish / payroll.change / promotion.approve | — | — | — | — | — | — | — | — |
| training.read | KT metadata | C | C | C | C | C | S + tài liệu có ACL | S + tài liệu có ACL |
| policies.read / attachments.read | Theo ACL | Theo ACL | Theo ACL | Theo ACL | Theo ACL | Theo ACL | Theo ACL | Theo ACL |
| accounts.manage / grants.manage / provider_settings.manage | G | — | — | — | — | — | — | — |
| audit.read | G bảo mật, nội dung redact | C vận hành | C vận hành | C vận hành | C vận hành | C vận hành | Lịch sử yêu cầu S | Lịch sử yêu cầu S |
| raw_source.read / import / schema / indexes | Ngoài runtime, data-maintainer cấp riêng | — | — | — | — | — | — | — |

KT không phải quyền truy vấn tùy ý hoặc xuất dữ liệu. Một Admin không có employee vẫn dùng được quản trị; các action S yêu cầu employee bị từ chối khi không linked, không trả global fallback.

Đổi chức danh/cấp GUTA, lương hoặc phê duyệt thăng tiến không được giao cho các profile ở bảng chỉ để lấp chỗ trống. Theo nguồn: vận hành đề xuất; QC/Đào tạo/HCNS thẩm định; BGĐ hoặc cấp được BGĐ ủy quyền phê duyệt; HCNS cập nhật DATA/lương. Các bên này là **vai trò nghiệp vụ đã được nguồn xác định**, nhưng chưa có danh tính/phân quyền trong DB hoặc workflow ứng dụng để triển khai an toàn. Hiện deny các mutation đó; cần delivery nghiệp vụ riêng trước khi mở, không cho Admin thay người duyệt.

Không có KPI write được mount và không có evaluations live; giữ deny KPI override/publish. OM đề xuất thăng tiến không đồng nghĩa được duyệt cuối. Không dùng Admin hoặc cấp bậc cao để phá quy tắc phân tách trách nhiệm.

Các hành động lịch/chấm công/tiền ở bảng là **policy cho chức năng dormant khi được kích hoạt**, không yêu cầu xây tính năng mới chỉ để đủ ma trận. Giữ 503 đến khi nguồn dữ liệu, mapping, workflow và guard đều đạt gate. KPI/attendance/POS chưa đủ coverage vẫn `null/unavailable`, không bịa số.

### 4.5. Field-level protection

| Nhóm field | Self | Manager đúng scope | system_admin | Chatbot/provider |
|---|---|---|---|---|
| employee ID, tên, chức danh, outlet, trạng thái ca | Có | DTO vận hành; PTCH chỉ dữ liệu điều phối cần thiết | KT tối thiểu | Chỉ fields cần cho câu hỏi, đã lọc |
| skills/level và tải công việc | Có | Theo mục đích phân công trong scope | KT metadata | Tối thiểu cho matching; không tự cấp quyền từ level |
| KPI cá nhân | Chỉ đã published | Theo capability ở ma trận | Không tự có quyền từ Admin | Không expose draft/nhận xét riêng không cần thiết |
| bank_account_number/bank_account_raw | Masked, không sửa trực tiếp | Không | Không tự có quyền từ Admin | Không gửi LLM, không tool search/export |
| leave_reason, profile_status, note hồ sơ riêng | Self qua DTO riêng khi có nhu cầu | Không trong list/roster | Không tự có quyền từ Admin | Không đưa vào context tự động |
| passwordHash, refresh hash, provider secret | Không | Không | Không trả plaintext qua API/UI | Tuyệt đối không |
| source_row/raw_cells/provenance kỹ thuật | Không | Không | Chỉ vai data-maintainer ngoài runtime | Không |

Không mở full bank export vì chưa có nghiệp vụ HR/payroll được xác nhận. Cần chức năng đó thì duyệt capability mới, đối tượng được nhận, mục đích và audit; không mặc định là quyền của mọi Admin/SM.

## 5. DB: schema quyền, ownership và đặc quyền service

### 5.1. Schema thay đổi tối thiểu dự kiến

Đây là thiết kế migration, **chưa chạy**:

- `users.status = active | disabled`; `authorization = { profile, storeIds: ObjectId[], validUntil?: Date, version, businessApprovalRef?, grantedBy, grantedAt, reason }`. Version tăng cùng atomic update mỗi lần đổi profile/scope/status/password security state. Profile là nguồn quyền; businessRole là dữ liệu hiển thị. Grant nghiệp vụ phải có businessApprovalRef hợp lệ từ OM/cấp đúng thẩm quyền; grantedBy ghi Admin thực hiện cấu hình, không thay người phê duyệt nghiệp vụ. Tạo system_admin theo chỉ định chủ hệ thống, không theo phân công OM.
- Giữ `users.employeeId` làm liên kết authoritative. Không tiếp tục fallback `$or(employee._id, employee.userId)` cho authorization. Sau khi đối chiếu và cutover mọi caller, bỏ `employees.userId` dư thừa để hết hai nguồn ownership. Không unlink/relink silently.
- `employees.storeId` tham chiếu `stores._id`; giữ nguyên `store_raw`. `stores.kind/status` được xác nhận, không nhận regex tên làm authority. Outlet hợp lệ mới được cấp grant.
- Lưu cấp GUTA riêng, ví dụ `gutaGrade = NV1 | NV2 | NV3 | PTCH | SM1 | SM2 | SM3 | AM1 | AM2 | AM3 | SAM | AOM | OM`, nullable khi nguồn chỉ ghi SM/AM chung; giữ job_title gốc. Không map từ Intern/Junior/Middle/Senior/Lead hoặc tự bịa NV/SM/AM bậc nào. Có bảng mapping danh xưng rõ ràng: SAM không bị match nhầm AM; OM không bị gộp OD/admin; chức danh OD chưa rõ thì quarantine phần grant nghiệp vụ, không tự nâng quyền.
- Một collection `store_aliases` phái sinh để map `(alias, alias_kind)` về storeId; kèm provenance và approvedBy/approvedAt. Tái sử dụng logic local có sẵn nhưng mọi candidate phải duyệt duy nhất, không fuzzy-match runtime.
- Event có `storeId` theo **địa điểm sự kiện**, employeeId theo danh tính xác minh; không lấy cửa hàng hiện tại của employee để cấp quyền lịch sử. Giữ employee_code/store_name/block_code nguồn. Dòng thiếu mã chỉ cho store aggregate/roster nếu block đã map; không cho self-detail bằng match tên.
- Project thêm storeId authoritative cho công việc cấp store. Report kế thừa scope từ project; không tin department/store do body gửi. Project chỉ có department nhưng chưa map phải bị quarantine khỏi manager reads/writes; system_admin xử lý mapping có audit. DB live đang rỗng nên không giả định backfill đã chạy được.
- Policies thêm ACL bắt buộc: classification, allowedProfiles, scopeKind `global | stores | departments`, storeIds/departmentIds, reviewStatus `pending | approved`. Một ACL envelope cho document, mọi chunk/attachment kế thừa. `global` không đồng nghĩa public internet.
- Security/mutation history dùng eventId, actorId, subjectId, action, resource scope, policyVersion, before/after quyền đã redact, reason, timestamp/requestId. Không ghi token, nội dung chat hoặc bank fields vào audit.

User grants đồng thời profile/storeIds trong **một document**; tránh thay role rồi scope ở hai write khác nhau. Document update dùng expected version. Không xây collection permission tùy biến.

### 5.2. Những dữ liệu không được auto-backfill

- AOM/AM group sang outlet; OD/OM thành system_admin.
- 11 store names có nhiều manager active; cần xác nhận người có trách nhiệm và thời hạn.
- Attendance/cash alias không exact-match; block `AB1-B219`, block null; training thiếu employee code.
- `cash_summary/cash_denominations` là nguồn tổng chung, không gán xuống outlet giả. Muốn tổng của một cụm thì tính từ cash_counts đã map và báo coverage; không lấy nguồn tổng toàn chuỗi.
- Lịch sử chưa có storeId được duyệt không dùng employee.storeId hiện tại để suy ngược; người chuyển cửa hàng không làm lịch sử đổi chủ.
- 223 policies thiếu ACL không mặc định công khai. Policy tĩnh được nhúng trong Python cũng phải rà classification/allowedProfiles, không chỉ corpus Atlas.
- Employee inactive không được giữ quyền vì có password. Disable bằng migration có preimage; ngoại lệ tái tuyển phải có hồ sơ active và cấp lại grant.

### 5.3. Đặc quyền MongoDB tách theo service

MongoDB role bảo vệ database/collection của **credential**. Với credential API dùng chung, quyền từng end-user phải do API kiểm. Không mô tả RBAC Mongo như row-level security theo JWT ứng dụng.

| Principal DB mục tiêu | Cho phép | Tuyệt đối không |
|---|---|---|
| API runtime | `find` các collection nghiệp vụ được dùng; insert/update đúng users, refresh_sessions, projects, reports, stores, employees, settings; remove chỉ khi endpoint thật cần và đã review; ghi event audit cần thiết | atlasAdmin/root/readWriteAnyDatabase, quản user/role DB, drop/createIndex/schema migration, raw_cells/import mặc định |
| AI runtime | **Không credential MongoDB**; dữ liệu nghiệp vụ/policy qua gateway API có scope | Đọc users/settings/refresh/raw_cells; query Mongo tổng quát; direct write |
| Migration/import/index maintainer | Credential riêng, thời hạn ngắn; đúng DB/collections cần cho lần chạy | Gắn vào API/AI runtime hoặc browser |
| Backup/restore operator | Quyền tối thiểu theo công cụ backup/restore, storage mã hóa, restore trên target tách biệt | Dùng làm credential runtime; dump chứa PII trong Git/log |

Danh sách privilege API cuối cùng phải suy ra từ model/route đã cutover, không cấp `readWrite` cả DB cho tiện. Mongoose production tắt autoIndex/autoCreate; index/validator do maintainer chạy trước cutover. AI chỉ cần read qua gateway; credential read-only toàn DB vẫn quá rộng vì đọc được password hash, ngân hàng và raw_cells.

Validator kiểm shape enum/reference field type nhưng **không** thay authorization hoặc tự đảm bảo FK. Index dự kiến: users employeeId unique partial; alias+kind unique; employees(storeId,status); events(storeId,work_date), events(employeeId,work_date); projects(storeId,status); audit(resource scope,at). Chỉ thêm sau kiểm query plan/khối lượng thật, tránh index trùng đã có.

Index inspection hiện thấy policies chỉ `_id_`, **không có Atlas Search/vector index**; không ghi plan như thể vector filter đã sẵn sàng. Nếu bật vector sau này, ACL/store/profile phải có filter index phù hợp và kiểm filter trước trả text; không lọc sau khi đã đưa kết quả vào model.

Nguồn kỹ thuật: [Atlas custom roles](https://www.mongodb.com/docs/atlas/security-add-mongodb-roles/), [database users](https://www.mongodb.com/docs/atlas/security-add-mongodb-users/), [MongoDB authorization](https://www.mongodb.com/docs/manual/core/authorization/). Đã tra qua Context7; đặc quyền Atlas thực tế/tier cần xác minh khi triển khai.

## 6. Chatbot: cùng quyền với API, không dựa vào lời nhắc

### 6.1. Hướng tích hợp

- API là policy authority. REST chat và mỗi socket message resolve cùng principal hiện hành; không tin role/businessRole/store/employee từ body, prompt hoặc claims cũ.
- Chuyển các tool query nghiệp vụ ở Python qua một internal gateway API allowlist theo tool/action. API thực hiện scoped read/projection hoặc gọi workflow hiện có; Python giữ routing, reasoning, matching, retrieval ranking, generation.
- Gateway không nhận raw collection/filter/pipeline từ model. Args dùng schema riêng; không cho `$lookup/$unionWith/$function`, chọn field tùy ý hoặc query arbitrary. Các join hợp lệ nằm trong code API, lọc cả collection phụ.
- API phát delegation token ngắn hạn, ký bằng cơ chế server sẵn có, ràng buộc userId, audience gateway, requestId, expiry và authorization version; service authentication riêng. Gateway đọc lại user/grant; token version cũ bị deny. Không gửi delegation token, access JWT hoặc service key vào prompt/provider. Không dùng payload `userContext` tùy ý kèm một shared service key như chứng minh danh tính end-user.
- Policy retrieval cũng đi gateway: API lọc ACL/document IDs và projection trước khi cấp text/chunks/attachment metadata cho Python. Nếu dùng vector DB search, API thực thi retrieval query có ACL; Python vẫn tạo embedding/rank theo contract. Endpoint RAG trực tiếp chỉ chấp nhận scope do gateway chứng thực; thiếu scope từ chối, không coi là all.
- Giữ static in-context policy chỉ với tài liệu đã duyệt dùng chung, hoặc chọn theo ACL trước khi build prompt. Role instructions chỉ đổi cách diễn đạt, không cấp phép truy vấn.
- Query cache phân vùng theo principal/grant version, canonical scope, allowed fields, document ACL version, query và provider config; không tái dùng dữ liệu user trước cho user sau. Khi đổi quyền, request mới phải bỏ kết quả cache cũ.

Chuyển gateway có chi phí thêm một hop nội bộ, đổi lại xóa được hai policy implementations đang lệch. Không thay kiến trúc RAG/model chỉ để làm phân quyền; lexical retrieval hiện có vẫn dùng được trên tập tài liệu đã được phép, với provenance/coverage thật.

### 6.2. Ma trận tools và nguồn context

| Tool/nguồn | Enforcement mục tiêu |
|---|---|
| get_my_profile | Principal tự resolve employee; không nhận employeeId tùy chọn; DTO self-safe |
| list_projects / get_project_status | Assignee self hoặc manager scope theo action; dùng assigneeId/progress canonical; project thiếu scope deny |
| get_my_kpi | Self, kỳ published, thiếu nguồn trả unavailable |
| get_department_kpi | Không tin department arg; manager phải có capability; lọc theo outlet grant và mapping department thật; staff deny |
| query_policy | ACL được duyệt trước retrieval; thiếu ACL/scope deny; citations cùng ACL |
| submit_report proposal | Assignee đúng project/trạng thái; projectId thật; proposal không đồng nghĩa đã ghi |
| Staffing/shift/cash intent chưa có tool thật | Chỉ hướng dẫn/quy trình hoặc proposal rõ ràng; không bịa số hoặc báo đã thực thi |
| Attachments/citation | Metadata, nội dung và link download dùng cùng ACL; không trả file do prompt tự chỉ path |
| History/conversation | Hiện stateless. Không xây persistence ở phase quyền; nếu bật về sau bắt buộc owner=userId, không đọc theo conversationId đơn thuần |
| Notification/socket event | Emit tới user/scope đã authorize, không broadcast dữ liệu manager cho toàn bộ người đăng nhập; reauthorize trước phát payload |

### 6.3. Ghi dữ liệu và confirmation

Hiện chatbot chưa có executor thật. Giữ proposal-only và sửa thông báo success giả. Không tự mở executor trong đợt quyền.

Điều kiện bắt buộc **trước khi** cho chatbot ghi trong một delivery được duyệt riêng: pending action lưu server với owner/action/resource/argsHash/version/expiry; confirm do đúng owner; resolve quyền lại tại thời điểm thực thi; chống sửa args/replay; expected resource version; atomic consume/idempotency; workflow API thật trả receipt rồi mới thông báo thành công. Thu hồi scope giữa proposal và confirm phải khiến confirm bị từ chối. Service credential không được làm người duyệt.

Admin chuyên biệt không thực hiện phê duyệt nghiệp vụ qua chatbot. Manager được cấp capability cũng không tự duyệt yêu cầu của mình: kiểm cả requester và affected employee/user, kể cả khi tạo hộ. Chatbot không được đổi identity, giả OM/BGĐ hoặc dùng service credential để lách phân tách trách nhiệm.

## 7. Kế hoạch triển khai có ranh giới

Tất cả đường dẫn dưới đây tính từ root workspace. File “tạo mới” là thay đổi **tương lai**, không được tạo trong task lập plan này. Không chạy các phase song song trên cùng file contracts/auth/model.

### Phase 0 — Chốt nguồn nghiệp vụ và preflight (P1)

**Owner:** Lead + chủ nghiệp vụ + người quản trị Atlas. **Dependency:** duyệt chính sách đề xuất trong file này.

- Dùng định nghĩa AM/SAM/AOM/OM và PTCH đã xác minh ở §1.3; lấy Phân công của OM/cấp được ủy quyền theo outlet và nhiệm vụ, người duyệt, ngày hiệu lực. Xác minh văn bản V.1 còn áp dụng và chức danh OD từ nguồn khác; không hỏi lại nghĩa AM đã có trong tài liệu.
- Inventory đủ 144 store records; xác định outlet/group/support, không dùng con số 45 từ UI làm sự thật.
- Kiểm tra credential runtime Render theo metadata an toàn; xác minh API/AI có dùng chung account/cluster/database hay không. Không đưa secrets vào report.
- Dựng fixture/test DB cô lập chứa ít nhất hai cửa hàng cùng department, hai cụm khác nhau, account inactive, missing scope, multi-manager, event hỗ trợ khác home store.
- Backup preimage các collections bị migration, tài liệu Atlas privileges/indexes liên quan; thử restore vào DB cô lập. Phải có manifest/checksum/row counts, không commit dump.
- Chốt permissions endpoint còn là đề xuất: AM quản lý khu vực; PTCH chỉ hỗ trợ, không publish/duyệt mặc định; OM/AOM/SAM/AM/SM không có system administration. Admin chuyên biệt không thay BGĐ/HCNS/QC/Đào tạo. Thiếu assignment thì giữ self-only, không bật manager scope.

**Gate:** inventory đã duyệt; backup restore thực sự đọc lại được; không còn câu hỏi nào buộc phải đoán quyền để migrate. Không cần production writes ở phase này.

### Phase 1 — Contracts, principal và policy authority (P1)

**Owner:** một backend/contracts implementer. **Dependency:** Phase 0; chưa enable manager capabilities.

**Sửa:** `packages/contracts/src/index.ts`; `apps/api/src/models/User.ts`, `models/Employee.ts`; `middlewares/auth.middleware.ts`; `services/rbac.service.ts`, `services/user-scope.service.ts`, `services/auth.service.ts`; `routes/auth.ts`, `routes/admin-users.ts`; `socket.ts`.

**Tạo:** `apps/api/test/authorization-policy.test.mjs` và shared capability/profile definitions ngay trong contracts hiện có; chỉ tách file khi cần theo convention.

- Một principal resolver cho HTTP/socket/gateway, canonical user.employeeId; DB outage fail-closed 503; no swallow-and-cache-authority fallback.
- Schema đầy đủ system_admin/om/aom/sam/am/sm/ptch/staff, cấp GUTA tách khỏi level; store grants/account status/version và bằng chứng duyệt nghiệp vụ; ràng buộc system_admin/global/role. Staff/self không phụ thuộc manager mapping; thiếu employee chỉ được dùng các action kỹ thuật được cấp, không fallback global nghiệp vụ.
- Deny default, field projections, self-approval, capability map; bỏ scattered checks sau khi từng caller được migrate, không giữ hai policy paths lâu dài.
- `GET /auth/me` trả profile, capabilities và scope summary tối thiểu cho UI; không nhận các giá trị này từ client để authorize.
- Access token có authz/session version để reset/change-password/logout-all/demotion/disable làm token cũ bị reject theo policy lifecycle đã chọn. Mỗi socket message kiểm expiry và current user/version; disconnect hoặc từ chối message nếu bị revoke.
- Grant writes/password security state tăng version cùng atomic update; không dựa TTL cache 60 giây cho protected operations. Read principal từ DB trên request/message mới; không dùng in-process cache stale giữa nhiều API instances.
- Chặn tự nâng quyền, mass assignment, admin cuối; global-admin membership/count phải có điểm serialize bằng atomic control document/CAS hoặc quy trình bảo trì tuần tự chứng minh được trên Atlas không transaction. Không tiếp tục count-then-delete tự do. Mô tả recovery nếu process chết giữa các bước.
- Relink employee kiểm unique user.employeeId; bỏ reverse-link fallback sau reconciliation; deny khi đang ở trạng thái liên kết bất nhất.

**Gate:** policy matrix tests pass; cùng user trên HTTP/socket có cùng identity; inactive/temporary-password/token-version cũ deny; concurrent grant edits có một winner, không overwrite.

### Phase 2 — Canonical scope và migration dữ liệu (P1)

**Owner:** data/backend maintainer. **Dependency:** Phase 1 schema; backup/restore Phase 0; chưa mở legacy.

**Sửa:** `apps/api/src/models/Store.ts`, `models/Employee.ts`, `models/ScheduleEntry.ts`, `models/AttendanceCorrection.ts`, `models/Cash.ts`, `models/Project.ts`, `models/Report.ts`; script seed/provision thực tế dưới `scripts/seed/` hoặc `apps/api/scripts/` sau inventory.

**Tạo:** script migration có dry-run trong `apps/api/scripts/`, tên theo convention và một lần chạy có manifest; model alias nếu cần theo convention models hiện có.

- Backfill storeId theo alias đã duyệt; giữ source fields nguyên trạng; phân loại unknown/unmapped rõ, không tự tạo global scope.
- Cấp grants theo Phân công của OM/cấp được ủy quyền và Admin cấu hình; SM/PTCH cùng nơi không chọn người đầu. SAM/OM có contract dù chưa đủ hồ sơ; AOM/AM không lấy storeIds từ group. Không infer bậc SM1–3/AM1–3 từ title chung; sửa mapping OD/OM/SAM trước khi cấp quyền.
- Disable 1.699 user gắn employee inactive bằng expected version; chỉ ảnh hưởng đúng preimage đã review. Ba global admin và ngoại lệ nghiệp vụ xử lý riêng, không theo title.
- Policies pending cho tới review ACL; tài liệu đã duyệt chung giữ available; không làm public cả corpus để tránh giảm kết quả search.
- Lịch sử storeId dựa event location, không home store; thiếu mã không gán ownership theo employee_name.
- Migration rerunnable, checkpoint, compare-before-write; xung đột runtime chuyển vào danh sách cần xử lý, không ghi đè. FK check/quarantine trước validator required-field.
- Indexes/validators bằng maintainer; validate 0 orphan trong nhóm canonical đã mở quyền, 100% unknown được quarantine; counts nguồn không thay đổi ngoài thay đổi status/grants có chủ đích.

**Gate:** mỗi granted storeId là outlet hợp lệ; tất cả manager scope đã có bằng chứng duyệt; không mất raw data; rerun không đổi lần hai; fixture có transfer lịch sử vẫn giữ đúng ownership. Unknown bị deny, không bị giấu như “đã migrate đủ”.

### Phase 3 — API/business enforcement toàn diện (P1)

**Owner:** backend implementer. **Dependency:** Phase 1–2. Shared model/contracts chỉ một owner.

**Sửa:** `apps/api/src/routes/employees.ts`, `stores.ts`, `dashboard.ts`, `projects.ts`, `reports.ts`, `admin-settings.ts`, `admin-users.ts`, `attachments.ts`; `models/Project.ts`, `services/rbac.service.ts`; `app.ts` chỉ khi mount endpoint đã đạt readiness gate.

- Đổi guard ở **mọi** list/detail/search/count/mutation/history/export đang có, không chỉ menu UI; global exception thống nhất.
- Dashboard từng aggregate dùng scope caller; staff không nhìn total toàn chuỗi, manager không thấy số ngoài storeIds. Pagination totals, distinct options và search suggestions cùng filter.
- Project create/assign kiểm project scope và assignee nằm scope hợp lệ; mọi transition/progress kiểm assignee/capability/resource state, không riêng IN_PROGRESS. State machine chuyển từ role-only sang action-authorized, không truyền role Admin giả để manager đi qua.
- Reports kế thừa scope project; review cấm requester/subject tự duyệt; mutation denial không tạo orphan report, không tăng version/history. Nơi có hai-document write phải định nghĩa idempotent recovery/compensation với failpoint test, không viện transaction.
- Settings/provider và account/grant administration chỉ system_admin, theo căn cứ cấp hợp lệ. Manager không đổi provider; Admin không tạo/duyệt báo cáo, chấm công, tiền, hồ sơ nhân sự, thăng tiến hoặc lương thay vai nghiệp vụ. Các endpoint review nhân sự chưa có workflow HCNS/BGĐ tiếp tục deny.
- Document attachments liên kết policy ACL; resolve path an toàn rồi authorize tài liệu, không authorize chỉ bằng category. UI dùng authenticated fetch/download hoặc token ngắn hạn có expiry/resource, không URL công khai.
- Lịch/correction/cash dormant được bổ sung guard theo ma trận, nhưng giữ 503 nếu workflow/data còn thiếu. Các API mới chưa có như profile-request review không được khai “xong” chỉ bằng contract; chỉ implement nếu nằm trong cutover được duyệt.

**Tests sửa:** `apps/api/test/employees-scope.test.mjs`, `stores-crud.test.mjs`, `dashboard-overview.test.mjs`, `admin-users.test.mjs`, `attachments-security.test.mjs`; **tạo** `apps/api/test/project-report-authorization.test.mjs`. Test runner phải đăng ký các file mới.

**Gate:** matrix ít nhất hai outlet cùng department pass; không scope nào mở rộng bằng legacy field/body filter; all-denied mutation giữ document/version/history không đổi; legacy mọi method/subpath vẫn 503 khi chưa ready.

### Phase 4 — Gateway chatbot, RAG, cache và realtime (P1)

**Owner:** API/AI integration implementer. **Dependency:** Phase 3 policy/API reads sẵn sàng.

**Sửa:** `apps/api/src/routes/chat.ts`, `socket.ts`, `services/ai-client.service.ts`, `app.ts`; `apps/ai-service/app/main.py`, `db.py`, `agent/tools.py`, `agent/loop.py`, `agent/router.py`, `agent/in_context_policy.py`, `rag/retrieval.py`; shared contracts.

**Tạo:** internal tool/retrieval gateway route dưới `apps/api/src/routes/`, delegation validation trong services theo cấu trúc hiện có; không expose raw Mongo tool.

- Chuyển toàn bộ bảy tool business reads, policy fetch và RAG retrieval DB access qua scoped gateway. Kiểm cả startup warmup/eval/live utility để runtime AI không còn đòi DB credential.
- Python nhận principal summary chỉ để routing/UX; quyền và data projection vẫn API quyết định. Remove direct operational Mongo reads và schema assigneeIds/progressPct sai sau khi migrate callers.
- Scope/ACL kiểm trước context/embedding result/citation/attachment; direct `/rag` không chấp nhận caller tự đặt department làm authority. Policy tĩnh không bỏ qua ACL.
- Token delegation bound audience/expiry/version/request; model không được nhìn hoặc tạo token; reconnect/socket event tái xác thực; message length contract thống nhất.
- Cache identity/ACL/scope-aware; outage deny protected tool, không role fallback. ConversationId hiện là correlation, không giả owner persistence đã có.
- Giữ proposal-only; xóa success giả trên nhánh confirm chưa executor. Tool thiếu dữ liệu trả unavailable/abstain, không diễn giải thành đã ghi.
- Khi deploy cutover xong, gỡ Mongo URI khỏi AI service; khóa service principal quyền thừa. Không vô hiệu credential cũ trước khi chứng minh mọi runtime caller đã chuyển.

**Tests sửa:** `apps/api/test/chat-gateway.test.mjs`; `apps/ai-service/tests/test_tools.py`, `test_agent_boundaries.py`, `test_api.py`, `test_retrieval.py`, `test_router.py`, `test_loop.py`. **Tạo** gateway/socket authorization integration tests theo runner hiện có.

**Gate:** cùng câu hỏi cùng quyền trên HTTP/socket; giả identity qua prompt/body/tool args không tăng quyền; direct AI/gateway sai key/audience/expiry/version bị chặn; không query Mongo từ AI runtime; bank/hash/secret không tới provider spy; citations đúng ACL.

### Phase 5 — UI capability gates và nghiệm thu (P2)

**Owner:** frontend implementer + người kiểm định. **Dependency:** `/auth/me` và API Phase 3–4 ổn định.

**Sửa:** `apps/web/src/services/auth.ts`, `services/api.ts`, `App.tsx`, auth context thực tế sau discovery; `components/CrmDashboardView.tsx`, `StoreDirectoryView.tsx`, `UserAccountsView.tsx`, `AdminSettingsView.tsx`, `EmployeeListView.tsx`, `EmployeeProfileView.tsx`, `ProjectListView.tsx`, `RosterView.tsx`, `StaffDrawer.tsx`; `components/chat/ChatPageView.tsx`, `ChatDrawer.tsx`, `services/chatSocket.ts`.

- UI đọc capabilities/scope summary từ server; không check role-only để đoán manager. Hiển thị chức danh nghiệp vụ khác quyền quản trị; store picker chỉ chứa scope được cấp.
- Ẩn/bỏ action không được phép; API vẫn guard nếu gọi tay. Session đổi scope không giữ dữ liệu cửa hàng cũ trong state/query cache/chat context.
- Suggestion chatbot theo tool/capability thật; không gợi hành động đã làm được khi chỉ proposal. Hiển thị rõ unavailable/empty/denied, không biến denied thành dữ liệu 0 toàn chuỗi.
- Không redesign. Khi thực thi UI phải nạp `super-ui-ux-master` bằng cơ chế hợp lệ; không có thì chặn phần UI, không giả đã qua gate. Giữ design system, keyboard/focus, contrast, touch target 44px; kiểm 320px. Thay đổi lớn cần preview/approval theo policy dự án.
- Smoke bằng browser với system_admin chuyên biệt, OM, AOM, SAM, AM, SM, PTCH, staff và inactive; Admin không linked employee; hai account cùng chức danh khác scope. Không lưu credentials hoặc ảnh chứa PII trong repo.

**Gate:** mở URL trực tiếp không vượt quyền; menu/action/403 nhất quán; đổi role khi tab/socket mở bị thu hồi trước request mới; attachment tải đúng ACL; browser evidence cho desktop/mobile.

### Phase 6 — Least privilege, rollout và docs (P1)

**Owner:** backend/Atlas operator + tester độc lập. **Dependency:** toàn bộ gate trên pass.

**Sửa:** `render.yaml` và env examples nếu cần tách secret names; runbook hiện có `docs/07-auth-rbac.md`, `docs/06-api-spec.md`, `docs/05-data-model.md`, `docs/13-security.md`, `docs/21-chatbot-architecture.md`, `docs/25-account-provisioning-runbook.md`, `docs/24-deploy-runbook.md`; runner/package test registrations cần thiết.

- Tạo API principal least-privilege; AI không Mongo; migration/backup credentials riêng. Test privilege bằng positive/negative commands trên DB cô lập trước khi rotate production.
- Không dùng mongoose runtime autoIndex; tạo index/validator trước bằng maintenance principal. Kiểm startup/health với credential mới, không chỉ test query đơn lẻ.
- Rollout theo nhóm đã có assignment: staff/self và Admin chuyên biệt đã review; SM, AM, SAM, AOM, OM theo phân công; PTCH chỉ quyền hỗ trợ. Không tự chuyển cả ba global admin hoặc OM/OD thành Admin chuyên biệt; không bypass deny cho nhóm chưa map để demo.
- Chốt mô hình thay thế docs hai-role-only: role kỹ thuật vẫn hai; authorization có profile/scope/capability. Sửa báo cáo lịch sử/history/executor thành đúng runtime, không giữ tuyên bố chưa thực thi.
- Deploy/rotate credential chỉ khi người dùng cho phép riêng. Task hiện tại không có quyền push/deploy/đổi global settings.

**Gate:** all checks dưới §8 pass; quyền cũ bị thu hồi; restore/rollback drill pass; reviewer độc lập không tìm thấy đường mounted thiếu policy.

## 8. Test matrix và bằng chứng nghiệm thu

### 8.1. Các scenario phải có

| Nhóm | Ca bắt buộc | Kết quả |
|---|---|---|
| Horizontal isolation | SM store A và store B cùng department; AOM hai cụm; ID/filter chéo | Không items/totals/citation/event ngoài scope |
| Vertical isolation | staff/PTCH gọi publish/review; AM gọi grants/settings/store-delete; system_admin gọi duyệt nghiệp vụ | 403, không side effect; AM được action quản lý đã duyệt trong đúng scope |
| Cấp GUTA và phân tách trách nhiệm | SAM không match thành AM; OM khác OD/Admin; SM không rõ bậc; NV3/Lead không tự lên manager; khung số store không tự cấp quyền | Mapping rõ nguồn; unknown không grant; Admin không thay OM/BGĐ/HCNS; AOM không tự nhận quyền ngoài nhiệm vụ OM giao |
| Missing identity/scope | Employee chưa linked, manager không grant, target thiếu storeId, unmapped Admin legacy | Fail-closed; không query `{}` toàn collection |
| Self-approval | Reviewer là requester hoặc subject, qua REST và chat | Deny kể cả system_admin; không đổi history |
| Lifecycle | Inactive, temporary password, reset/password change, demotion, grant expiry, logout policy | Request/message mới bị chặn; old token/version không dùng lại |
| Stale cache | Đổi store/grant khi nhiều API instances và socket đang mở | Không dữ liệu scope cũ trả từ cache |
| Atomicity | Hai update grant/version; reassignment giữa check và write; report workflow lỗi giữa hai writes | Một winner/409; không ghi trái scope; recovery không tạo duplicate/orphan |
| Data ambiguity | Event khác home store; support/null employee; alias mơ hồ; cash summary toàn nguồn | Không suy ownership từ tên/home store; unknown bị quarantine |
| Mass assignment | Body chứa role/global/profile/storeIds/employeeId/scope thay thế | Validation deny hoặc server bỏ field theo contract; không tăng quyền |
| Aggregate leakage | paging, distinct, filters, search, `$lookup`, KPI denominator, overview | Toàn bộ từ tập đã authorize; không global total bên cạnh scoped rows |
| PII/secret | Profile list/tool/context/provider prompt/log/attachment | Không bank raw/hash/provider secret; projection allowlist |
| RAG | Policy thiếu ACL, ACL revoked, cache khác user, citation/link đoán ID | Deny trước model; không trả restricted title/text/download |
| Chat confirmation | Fake owner/action/version/expiry/replay; nút confirm hiện tại | Proposal-only không báo executed; future executor chưa được bật |
| Service identity | Sai audience/key/expiry/delegation version; fake userContext; direct gateway | Deny; không tin shared service key như end-user identity |
| DB least privilege | API đọc raw hoặc createRole/drop; AI thử direct DB; migration account hết hạn | Denied thực tế, không chỉ check env name |
| UI | Direct URL, hidden action gọi tay, switch account, 320px, keyboard | Không vượt API; không dữ liệu account trước; states đúng semantics |

### 8.2. Commands đã xác minh có trong repo, dành cho triển khai

Không chạy các lệnh này trên DB live. `apps/api/test/with-memory-mongo.mjs` tạo môi trường test cô lập; kiểm guard target trước mọi suite.

```powershell
pnpm -r typecheck
pnpm -r run build
pnpm --filter @hr-blockbot/contracts test
pnpm --filter api test
node apps/web/test/e2e-revamp-flow.test.mjs
```

Từ `apps/ai-service`:

```powershell
python -m pytest -q
```

Các file test mới phải thêm vào `apps/api/package.json` vì runner hiện liệt kê tên file tường minh. Không dùng `pnpm lint` làm gate vì repo không có lint gate. Không sửa test để giữ expectation global dashboard cũ; thay bằng kiểm isolation thật.

Sau suite, smoke thật trên fixture DB qua API/HTTP/socket/browser: đăng nhập hai principal cùng department khác store; đọc dashboard/list/detail; mutation trái scope; thu hồi grant khi socket mở; hỏi chatbot cùng dữ liệu; tải attachment được/không được phép. Quan sát response và DB không đổi sau denial. Tests đơn thuần chưa chứng minh wiring deployment/credential.

### 8.3. Validation của bản kế hoạch này

- Đã kiểm 19 collections live; đếm và shape; đối chiếu user-employee, employee-department/store, event-block, alias mismatch, manager coverage, policy ACL và indexes.
- Đã đọc code guard, mounted routes, auth, role derivation, tool/runtime/RAG, UI capability behavior; hai scout read-only độc lập phụ trách API và AI/UI. Lead tự giữ DB evidence và quyết định thiết kế.
- Đã phân biệt endpoint mounted/dormant, proposal/execution, policy tĩnh/RAG DB, role/businessRole; không nhận thiết kế trong docs là hành vi đã chạy.
- Bổ sung nguồn `C:/work-space/hr-blockbot/docs/phanquynguta.md`, đọc đủ 297 dòng: đã xác minh AM, SAM, AOM, OM, chức năng PTCH, phân công OM và các vai QC/Đào tạo/HCNS/BGĐ. Chưa xác minh văn bản thay thế, phân công cụ thể, nghĩa OD và quyền approve từng endpoint; không còn hỏi lại định nghĩa AM.
- Lần cập nhật theo nguồn mới: check artifact PASS — ma trận 8 profile có 30 dòng bảng, mỗi dòng đúng 9 cột; file 545 dòng; SHA-256 văn bản nguồn không đổi. Kiểm semantic gồm AM quản lý khu vực, PTCH không publish/review, SAM/OM tách riêng và Admin không duyệt nghiệp vụ. Không chạy monorepo suites vì không đổi code; không claim ứng dụng đã thi hành policy mới.

## 9. Operational concerns, rollback và team impact

### 9.1. Failure modes và quan sát

- Metrics thấp cardinality: authorization deny theo action/profile/reason, missing-scope count, stale-version reject, gateway failure, RAG ACL denial, disabled-login attempts. Không label tên/mã employee hay raw prompt.
- Structured log: requestId/eventId, actorId nội bộ, action, targetId, allow/deny reason code, policy/grant version. Không log credentials, full chat/context/record cá nhân.
- Audit protected mutations có cùng atomic write với business state khi embedded history khả thi. Nếu cần index audit tập trung, dùng idempotent event/outbox từ document nguồn; lỗi audit không được khiến API báo “chưa ghi” rồi client retry tạo duplicate sau khi state đã commit. Không thêm multi-document transaction.
- Outage DB/gateway: 503 hoặc tool unavailable; không đổi danh tính thành anonymous/Employee/global fallback; không trả cache vượt quyền để giữ chatbot trả lời.
- Denial tăng sau rollout thường là mapping thiếu; hỗ trợ theo target/grant version, không chữa bằng `isGlobalAdmin=true` hoặc bật readWrite toàn DB.
- Xóa/đổi tên store không được âm thầm làm grants “trôi” sang store khác. ObjectId giữ ổn định; soft-delete làm grant target unavailable; display-name cascade không là security migration.

### 9.2. Rollback an toàn

1. Trước write có encrypted backup/preimage, manifest và restore drill trên DB riêng. Rollback credential cần Atlas operator được phép; không in secret ra chat.
2. Migration từng batch có checkpoint/version. Lỗi partial dừng batch; đọc lại changed IDs, chỉ restore document chưa có chỉnh sửa mới hơn. Không restore dump đè toàn DB đang chạy.
3. Nếu policy/gateway lỗi, khóa chức năng bị ảnh hưởng hoặc giữ self-only. **Không rollback về fail-open/global dashboard/direct Mongo AI**.
4. Giữ credential cũ trong secret store có kiểm soát tới khi positive/negative smoke xong; sau đó revoke. Nếu credential cũ vốn `atlasAdmin`, không tái cấp cho runtime làm giải pháp lâu dài.
5. Giữ security revocations đã có chủ đích (inactive/demotion); rollback code không tự re-enable 1.699 accounts hoặc restore quyền đã thu hồi.

### 9.3. Team impact

- OM/cấp đúng thẩm quyền xác nhận phân công nghiệp vụ; Admin chuyên biệt cấu hình hệ thống theo căn cứ đó. Văn bản đã xác định AM/SAM/AOM/OM/PTCH và vai QC/Đào tạo/HCNS/BGĐ; developer không tạo thêm authority hoặc coi tên group là phân công.
- Backend sở hữu policy; frontend tiêu thụ capabilities; AI không có quyền riêng. Tester dùng chung matrix và fixture thật, không mock echo role.
- Thay contract có chủ đích: manager vẫn `role=Employee` nhưng có capabilities; caller không được dùng role-only nữa. Migrate toàn bộ caller rồi bỏ fallback/deprecated checks, không giữ alias cấp quyền cũ.
- Kế hoạch hiện tại đủ hướng kỹ thuật; chỉ được bắt đầu cấp quyền/migrate sau khi xác nhận các mục nghiệp vụ dưới đây. Không gọi đây là bản phân công thực tế của GUTA.

## 10. Các quyết định nghiệp vụ còn cần xác nhận

1. **Danh tính Admin chuyên biệt và ba global admin hiện có:** tài khoản nào thuộc người dùng, tài khoản nào tiếp tục được giữ? Chưa định danh hoặc thay đổi quyền; không mặc định ba tài khoản cùng một chủ thể.
2. **Phân công của OM/cấp được ủy quyền:** OM/AOM/SAM/AM/SM quản lý outlet và nhiệm vụ nào, hiệu lực từ khi nào? Số cửa hàng trong khung năng lực không thay bảng phân công thật; cần xác nhận người chịu trách nhiệm tại 11 nơi có nhiều SM/PTCH active.
3. **Văn bản V.1 còn hiệu lực và OD là chức danh nào?** Nguồn mới giải quyết nghĩa AM/SAM/AOM/OM nhưng không định nghĩa OD hoặc chỉ ra quyết định bổ nhiệm hiện tại.
4. **Quyền approve từng workflow ứng dụng và PTCH được ủy quyền đến đâu?** Đề xuất AM có quyền quản lý khu vực; PTCH không publish/duyệt; mọi reviewer không self. Cần thẩm quyền cụ thể cho chấm công/tiền/báo cáo, không suy ra từ mô tả chức năng chung.
5. **Staff có được xem roster tối thiểu tại nơi làm việc không?** Đề xuất có tên/chức danh/ca để phối hợp, không hồ sơ/KPI/ngân hàng; nếu không duyệt thì self-only.
6. **Có yêu cầu triển khai workflow HCNS/QC/Đào tạo/BGĐ, payroll hoặc KPI override trong project không?** Nguồn xác nhận vai trò nghiệp vụ, không chứng minh tài khoản/endpoint/dữ liệu đã có. Giữ deny các mutation tương ứng; không giao Admin chuyên biệt duyệt thay.

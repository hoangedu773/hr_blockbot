# 06 — Đặc tả API (REST + WebSocket + hợp đồng nội bộ)

Khóa luận KLCN133 — *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*. File này là **hợp đồng** giữa
`apps/web`, `apps/api` và `apps/ai-service`: bảng endpoint theo module, error catalog, 9 event Socket.IO, và
biên nội bộ Node → Python.

## 0. Nguồn và ký hiệu

Như `04-domain-model.md` §0: `(B<n>)` = `docs/research/NOTES-01.md`, `(RP §<n>)` =
`docs/research/RESEARCH-PLAN.md`, `01`/`02`/`04`/`05`/`07`/`11`/`18` = các file docs anh em,
`SUY DIỄN` = chi tiết do tài liệu này đặt ra để hợp đồng chạy được (nguồn không nêu), `TBD` = nguồn không cho
con số → **không đoán**, `[CẦN NGUỒN]` = cần URL/văn bản GVHD.

## 1. Nguyên tắc hợp đồng

Pipeline đã chốt ở `NOTES-01 §B2` và `02 §7.2`:

```text
packages/contracts:  Zod schema  →  OpenAPI 3  →  Orval  →  typed React client + React Query hooks
```

Bốn hệ quả ràng buộc toàn bộ file này:

| Nguyên tắc | Nội dung | Nguồn |
|---|---|---|
| **Một nguồn sự thật cho shape** | `x.schema.ts` của module là chỗ duy nhất định nghĩa DTO; controller validate bằng Zod ở biên vào; client **không** tự viết type tay | `B2` |
| **Không viết OpenAPI YAML bằng tay** | tài liệu này mô tả hợp đồng bằng **bảng endpoint + contract**; OpenAPI là **artifact sinh ra** từ Zod, không phải file nguồn. Path artifact chốt khi scaffold repo (`02 §7.2`) | `B2`, `02 §7.2` |
| **Schema là gate CI** | `schemathesis` fuzz mọi response; schema drift = fail build | `RP §11` hàng "API không trôi khỏi spec"; `02 §9` |
| **REST và tool chatbot cùng một nghiệp vụ** | tool đọc/ghi của `B6` gọi vào **cùng service layer và cùng RBAC check** như REST; không có đường vòng "chatbot được bỏ qua confirm" | `04 §7`, `B6`, BR-05, BR-06 |

Quy ước chung (`SUY DIỄN` về cú pháp, vì nguồn không đặt):

| Mục | Quy ước |
|---|---|
| Prefix | `/auth`, `/employees`, `/departments`, `/projects`, `/reports`, `/evaluations`, `/policies`, `/notifications` — mỗi module một tài nguyên số nhiều, khớp tên collection ở `05 §3` |
| Content type | `application/json; charset=utf-8`; UTF-8 là bắt buộc vì toàn bộ dữ liệu là tiếng Việt (`B5`: PhoBERT cần tiếng Việt đã word-segmented) |
| Auth | `Authorization: Bearer <Access Token>`; RT nằm ở cookie `HttpOnly + Secure + SameSite` (`B3`) |
| Idempotency | mọi endpoint ghi nhận `clientMessageId` trong body — field này đã có trong `project_events` (`05 §3.5`) và là luật `B7` |
| Error envelope | `{ error: { code, message, details?, correlationId? } }` — `code` lấy **duy nhất** từ catalog §5 (`SUY DIỄN` về hình thức bao gói; nguồn không định nghĩa envelope → `02 §7.5` ghi "Không có danh sách error code trong tài liệu này") |
| Ngày giờ | ISO 8601, UTC, trường `Date` của `05` |
| `departmentId` | `ObjectId` hoặc **mã phòng ban** — nguồn mâu thuẫn (`B15` ví dụ `"DEV"` vs `B4` index kiểu ObjectId) → xem §8 D-03; service resolve `code → _id` |
| Phân trang | **chưa chốt**: `RP §3 B4` hỏi "offset vs cursor", `NOTES-01` không trả lời → tên tham số là `TBD`; cột "Index phục vụ" ở các bảng dưới là phần đã chốt |

## 2. Bảng endpoint REST theo module

Cột "Vai" chỉ `role` hệ thống (`Admin` \| `Employee`, `B3`) — `level` **không** xuất hiện ở bất kỳ điều kiện
nào. Cột "Idempotency" mô tả hành vi khi gửi lại cùng request.

### 2.1 `auth`

Field theo `07 §2/.3/.5`; không có endpoint nào trả `passwordHash` hay token thô.

| Method | Path | Vai | Request (`field : kiểu : ràng buộc`) | Response | Mã lỗi | Idempotency | Index / filter |
|---|---|---|---|---|---|---|---|
| POST | `/auth/login` | công khai | `email : string : required, normalize chữ thường`<br>`password : string : required` | `200 { accessToken, user: { id, role } }` + `Set-Cookie` RT-1 (`HttpOnly`, `Secure`, `SameSite` = `TBD`) | `UNAUTHENTICATED` (401, thông báo chung — không phân biệt "không có user" và "sai mật khẩu"), `VALIDATION_FAILED` (400), `INTERNAL_ERROR` (500) | **Không** idempotent: mỗi login sinh một `familyId` mới (`07 §3.1`); login liên tiếp làm phiên trước đó vẫn còn tới khi hết `expiresAt` | `users.email` UNIQUE — I-13 (`SUY DIỄN`) |
| POST | `/auth/refresh` | có cookie RT | *(không body)* — đọc RT từ cookie | `200 { accessToken }` + `Set-Cookie` RT-2 | `TOKEN_REUSED` (401 → revoke cả family, `07 §3.3`), `UNAUTHENTICATED` (401) | Một RT chỉ đổi được **một lần**: conditional update `revokedAt: null` làm hai request đồng thời thành một thắng một 401 | `refresh_sessions.tokenHash` UNIQUE — I-08 |
| POST | `/auth/logout` | đã đăng nhập | *(không body)* | `204` + xoá cookie (`Expires` quá hạn) | `UNAUTHENTICATED` (401) | Idempotent: revoke lại một family đã revoke vẫn trả `204` (`07 §3.4`) | I-18 `(userId, familyId)` — revoke cả family |
| GET | `/auth/me` | cả hai | — | `200 { userId, role, employeeId, departmentId, level, skills }` (đọc từ DB, **không** đọc claim `level` — `level` không ở trong token, `07 §2`) | `UNAUTHENTICATED` (401) | Idempotent (đọc) | `users._id`, `employees.userId` — I-14 |

Không có endpoint `PUT /auth/password` hay "khoá tài khoản sau N lần sai": `RP §3 B3` có hỏi, `NOTES-01 §B3`
**không trả lời** (`07 §9` checklist mục 10–11) → `TBD`, không tự đặt mã lỗi.

### 2.2 `employees`

| Method | Path | Vai | Request | Response | Mã lỗi | Idempotency | Index / filter |
|---|---|---|---|---|---|---|---|
| GET | `/employees` | `Admin` | filter: `departmentId?`, `level?` (`Intern\|Junior\|Middle\|Senior\|Lead`), `skill?`, `q?` (theo `employeeCode`); phân trang `TBD` | `200 { items: [EmployeeSummaryDto], paging: TBD }` — **chỉ allowlist**, xem "Quy tắc dữ liệu tối thiểu" cuối §2.2; `Admin` chỉ nhận kết quả trong `departmentId` được gán (`07 §7.4`) | `RBAC_DENIED` (403), `VALIDATION_FAILED` (400) | Idempotent (đọc) | `employees.departmentId` — I-15; `employeeCode` UNIQUE — I-01. Text index trên `skills` **chưa chốt** (`05 §4.3`, I-20 `[CẦN NGUỒN]`) → lọc skill làm bằng query terms trên `skills[]` (`SUY DIỄN`) |
| GET | `/employees/:id` | `Admin`; `Employee` **chỉ own** | — | `200 EmployeeDto` — **own**: hồ sơ đầy đủ của chính mình; **người khác**: `EmployeeSummaryDto` theo allowlist (`19` §2.3(b)) | `RBAC_DENIED` (403), `RESOURCE_NOT_FOUND` (404) | Idempotent (đọc) | `employees._id`; đường own đi I-14 |
| PATCH | `/employees/:id` | `Admin`; `Employee` own, **nhóm không nhạy cảm** | `phone?`, `skills?`, … + `clientMessageId : string : required` | `200 EmployeeDto` | `VALIDATION_FAILED` (400), `RBAC_DENIED` (403), `DUPLICATE_KEY` (409 — trùng `employeeCode`) | Replay cùng `clientMessageId` → trả chính kết quả cũ, không ghi lần hai | `_id` |
| POST | `/employees` | `Admin` | `employeeCode : string : required, UNIQUE`<br>`fullName : string : required`<br>`departmentId : ObjectId : required`<br>`level : enum5 : required`<br>`skills : string[] : required (rỗng được)` | `201 EmployeeDto` | `VALIDATION_FAILED` (400), `DUPLICATE_KEY` (409) | Không idempotent theo `clientMessageId` ở tầng REST → một lần bấm = một bản ghi (`SUY DIỄN` — `employeeCode` UNIQUE là thứ chặn trùng thật sự, I-01) | I-01 |
| GET | `/employees/:id/kpi-history` | `Admin`; `Employee` own | filter: `period?` | `200 { items: [EvaluationDto] }` | `RBAC_DENIED` (403) | Idempotent (đọc) | `evaluations (employeeId, period)` — I-06; `(period)` — I-16 |

**Không có** endpoint đổi hồ sơ "chờ duyệt" ở đây: UF-01 có bước *duyệt field nhạy cảm* (`B0`) nhưng
`05 §1.1` đóng ở **11 collection** và không có collection nào chứa hàng đợi duyệt → xem §8 D-05. Vì vậy
`PATCH /employees/:id` với field nhạy cảm trả `VALIDATION_FAILED` kèm `details.pendingApprovalUnsupported`
`(SUY DIỄN)` cho tới khi hàng đợi duyệt được chốt.

**Quy tắc dữ liệu tối thiểu (BR mới theo `19` §2.3(b)):** response của **mọi** đường đọc hồ sơ người khác —
`get_employee` (tool) và `GET /employees/:id` / `GET /employees` (REST) — bị chặn bằng **allowlist field**, không
bằng cách nhớ "field nào đừng đưa". Hai danh sách dưới đây là hợp đồng, Zod schema của `EmployeeDto` sinh ra từ
đó (`B2`) phải phản ánh đúng nó.

| Cho phép trả về | Cấm trả về |
|---|---|
| `employeeId`, `fullName` (tên hiển thị), `level`, `departmentId`/`department` (tên phòng ban), `skills` khớp yêu cầu, `matchScore`/`rank` tổng hợp, `matchedSkills`/`missingSkills` (breakdown kỹ năng), `activeLoad` dạng **tổng hợp** (số đề tài đang mở), `status` (`active`/`inactive`) | `phone`; email cá nhân; địa chỉ; CCCD/bất kỳ định danh pháp lý; lương; `hiredAt`; **lý do nghỉ/vắng** và mọi field thuộc nhóm "nhạy cảm" của UF-01; `selfReview`/`managerReview` nguyên văn; `sentiment`/`themes`/`riskSignals`; điểm KPI chi tiết (`machineScore`, `finalScore`, `suggestedScoreComponent`, `overrideReason`); nội dung `projects` của người khác ngoài dữ kiện cần để biết ai đang rảnh |

Cấm **không phụ thuộc vai**: `Admin` muốn đọc số nhạy cảm thì dùng đường CRUD hồ sơ đầy đủ của module
`employees` (đã ghi `07 §7.3`), **không** phải bằng cách xin `find_candidates` trả thêm field — vì kết quả của
tool này đi thẳng vào prompt của LLM và vào card hiển thị cho người ra quyết định gán việc `// SUY DIỄN — cần
xác nhận` (phạm vi allowlist do docs đặt; `NOTES-01` không có chính sách PII nào — `07 §9` mục 21,
`13` §2.10, `[CẦN NGUỒN]`).

`get_employee` khi được gọi cho **chính mình** (own) trả hồ sơ đầy đủ của chính người dùng; khi gọi cho
**người khác** chỉ trả allowlist ở cột trái `// SUY DIỄN`. Chi tiết quyền: `07 §7.1`, `07 §7.4` (scope).

### 2.3 `departments`

| Method | Path | Vai | Request | Response | Mã lỗi | Idempotency | Index / filter |
|---|---|---|---|---|---|---|---|
| GET | `/departments` | cả hai (đọc); ghi chỉ `Admin` | — | `200 { items: [DepartmentDto] }` | `RBAC_DENIED` (403) | Idempotent (đọc) | `departments.code` UNIQUE (`SUY DIỄN`, `05 §3.3`) |
| POST | `/departments` | `Admin` | `code : string : required, UNIQUE`<br>`name : string : required`<br>`headEmployeeId? : ObjectId` | `201 DepartmentDto` | `VALIDATION_FAILED` (400), `DUPLICATE_KEY` (409) | Không idempotent (mỗi request một document) | `code` UNIQUE |
| PATCH | `/departments/:id` | `Admin` | `name?`, `headEmployeeId?` | `200 DepartmentDto` | `RBAC_DENIED` (403), `RESOURCE_NOT_FOUND` (404) | — | `_id` |

Không có tool chatbot nào cho `departments`: `NOTES-01 §B6` không khai báo tool đọc collection này (`18` intent
#3 `get_employee` + `[CẦN NGUỒN]`) → chỉ REST/dashboard.

### 2.4 `projects` (F2)

`projects.status` có **đúng năm** giá trị: `DRAFT`, `ASSIGNED`, `IN_PROGRESS`, `PENDING_REVIEW`, `COMPLETED`
(`05 §3.4`, sơ đồ `B4`). Không có giá trị nào khác, kể cả chỉ hạn. **Quá hạn là vị từ dẫn xuất**
(BR-01): `dueDate < now AND status != COMPLETED` → nó là **bộ lọc**, không phải trạng thái.

| Method | Path | Vai | Request | Response | Mã lỗi | Idempotency | Index / filter |
|---|---|---|---|---|---|---|---|
| GET | `/projects` | cả hai; `Employee` bị giới hạn `assigneeIds chứa mình` (BR-16) | filter: `status?` (enum 5), `assigneeId?`, `departmentId?`, `dueBefore?`, `dueAfter?`, `overdue? : boolean` (dẫn xuất, **không** phải status), `requiredSkill?` | `200 { items: [ProjectSummaryDto], paging: TBD }` | `RBAC_DENIED` (403), `VALIDATION_FAILED` (400) | Idempotent (đọc) | `overdue`/`status`+`dueDate` → **I-02**; `assigneeId`+`status` → **I-03**; `departmentId`+`status`+`dueDate` → **I-04** (`B4`) |
| POST | `/projects` | `Admin` (T-01) | `title : string : required`<br>`description?`, `requiredSkills : string[]`<br>`departmentId : ObjectId : required`<br>`dueDate : Date : required`<br>`assigneeIds : ObjectId[] : mảng rỗng ở DRAFT`<br>`clientMessageId : string : required` | `201 ProjectDto` (`status = DRAFT`, `version = 1`) + `project_events` `CREATED` + `project:updated` | `VALIDATION_FAILED` (400) | Replay cùng `clientMessageId` → trả `200` kèm document đã tạo, **không** tạo bản thứ hai (`SUY DIỄN` từ BR-13) | `_id` |
| GET | `/projects/:id` | cả hai (own với `Employee`) | — | `200 ProjectDto` gồm `status`, `version`, `updatedAt`, `statusHistory[]` (lý do reject nằm ở đây) | `RBAC_DENIED` (403), `RESOURCE_NOT_FOUND` (404) | Idempotent (đọc) | `_id` — I-11 |
| POST | `/projects/:id/transition` | theo bảng `04 §4.3`; `assign` và approve/reject là cửa của `Admin` | `to : enum5 : required`<br>`expectedStatus : enum5 : required`<br>`expectedVersion : number : required`<br>`assigneeIds? : ObjectId[]` (cho `DRAFT → ASSIGNED`)<br>`reason? : string : required khi T-05b`<br>`source? : 'rest'\|'chatbot'` `clientMessageId : string : required` | `200 ProjectDto` (`version + 1`, `statusHistory` thêm 1 phần) → chỉ sau đó mới audit + `project:updated` (+ `report:updated`, `notification:new`) | `ILLEGAL_STATE_TRANSITION` (422), `PROJECT_VERSION_CONFLICT` (409 + document hiện tại), `RBAC_DENIED` (403), `VALIDATION_FAILED` (400, thiếu `reason` ở T-05b) | **Có điều kiện**: `status`+`version` là điều kiện ghi → bấm lại lần hai sau khi thắng thì 409, không ghi chồng (`05 §5.2/.3`, BR-02) | `_id` + điều kiện `status`/`version` |
| PATCH | `/projects/:id` | `Admin` ở `DRAFT`; `Employee` own chỉ `progressPct` | `title?`, `description?`, `requiredSkills?`, `dueDate?`, `progressPct? : number : 0..100`, `clientMessageId` | `200 ProjectDto` | `VALIDATION_FAILED` (400), `RBAC_DENIED` (403), `PROJECT_VERSION_CONFLICT` (409) | theo `clientMessageId` | `_id`; bộ lọc sau sửa vẫn theo I-02/I-04 |
| GET | `/projects/upcoming-deadlines` | cả hai (`Employee` own) — chính là tool đọc `get_upcoming_deadlines` (`B6`) | `horizonDays?` (mặc định `TBD`), `includeOverdue : boolean` | `200 { items: [{ projectId, title, dueDate, status, overdue }] }` | `RBAC_DENIED` (403) | Idempotent (đọc) | **I-02** `(status, dueDate)`; bản dẫn xuất overdue tính ở service (`04 §4.4`) |
| GET | `/projects/:id/events` | cả hai (own) | paging `TBD`; sort `createdAt desc` | `200 { items: [ProjectEventDto] }` | `RBAC_DENIED` (403), `RESOURCE_NOT_FOUND` (404) | Idempotent (đọc) | `project_events (projectId, createdAt)` — **I-12** |
| POST | `/projects/:id/progress` | `Employee` own, `Admin` (`submit_progress` — write ⇒ confirm) (T-06) | `progressPct : number : 0..100 : required`<br>`note? : string`<br>`clientMessageId : string : required` | `200 { projectId, event: ProjectEventDto }` — **không** đổi trạng thái duyệt | `CONFIRMATION_REQUIRED` (428), `RBAC_DENIED` (403), `ILLEGAL_STATE_TRANSITION` (422), `VALIDATION_FAILED` (400) | `clientMessageId` đã thấy → bỏ qua, trả `200` kèm event cũ (BR-13) | append `project_events` (I-12) |
| POST | `/projects/:id/assign` | **`Admin` only** (`assign_project (confirm + Admin)` — `B6`) | `assigneeIds : ObjectId[] : required, không rỗng`<br>`expectedVersion : number : required`<br>`confirmed : boolean`<br>`clientMessageId : string : required` | `200 ProjectDto` at `ASSIGNED` → `project:updated` + `notification:new` "Assignment mới" | `CONFIRMATION_REQUIRED` (428), `RBAC_DENIED` (403), `PROJECT_VERSION_CONFLICT` (409), `VALIDATION_FAILED` (400) | điều kiện `status: DRAFT` + `version` → chỉ một lần gán có hiệu lực | `_id`, I-03 |
| POST | `/projects/:id/acknowledgement` | **bất kỳ `role`** — điều kiện duy nhất là **actor phải nằm trong `assigneeIds`**; Admin **không** có đường phản hồi thay Employee (BR-16, `07 §7.4` SC-04) | `response : 'ACKNOWLEDGE'\|'DECLINE'\|'REQUEST_CHANGE' : required`<br>`reasonCode : string : required khi DECLINE hoặc REQUEST_CHANGE` (**PROPOSED** — enum chưa chốt)<br>`comment? : string` (tự do, optional — **PROPOSED**)<br>`expectedVersion : number : required`<br>`confirmed : boolean`<br>`clientMessageId : string : required` | `200 { projectId, event: ProjectEventDto }` với `type` = `ACKNOWLEDGED` \| `DECLINED` \| `CHANGE_REQUESTED` (`05 §3.5`; mapping ở bảng dưới) → **chỉ sau đó** notify cho `Admin`; **không** đổi `projects.status`, **không** đổi `version`, **không** sang `transition` | `CONFIRMATION_REQUIRED` (428), `NOT_ASSIGNEE` (403 — actor không nằm trong `assigneeIds`), `VALIDATION_FAILED` (400 — thiếu `reasonCode` khi `DECLINE`/`REQUEST_CHANGE`), `RESOURCE_NOT_FOUND` (404) | `clientMessageId` đã thấy → bỏ qua, trả `200` kèm event cũ (BR-13); nhiều lần phản hồi của **cùng một** người cho **cùng** `response`: event cuối là dữ kiện đọc khi suy trạng thái, các bản trước vẫn giữ (append-only, BR-03) | append `project_events` — **I-12**; kiểm tra tư cách gán đọc `projects._id` + `assigneeIds` (I-03) |


**Mapping request → event (một chiều, không tự suy).** `response` là *ý định* client gửi lên; `type` là *dữ kiện*
được ghi vào `project_events`. Không có giá trị nào khác trong hai enum này.

| `response` (request) | `project_events.type` (event canonical) | Lý do? |
|---|---|---|
| `ACKNOWLEDGE` | `ACKNOWLEDGED` | **Không** — `ACKNOWLEDGED` không dùng `reasonCode` |
| `DECLINE` | `DECLINED` | Có — `reasonCode` **bắt buộc**, `comment` optional |
| `REQUEST_CHANGE` | `CHANGE_REQUESTED` | Có — `reasonCode` **bắt buộc**, `comment` optional |

`ACCEPTED` **không** nằm trong bảng này và **không** phải giá trị canonical: nó chỉ tồn tại trong
`research/NOTES-02.md` (raw) và trong câu trích state của NOTES-02 (`04 §10` điểm 6, `05 §3.5`). Schema lý do
(`reasonCode`/`comment`) mang nhãn **PROPOSED** — chờ phỏng vấn hiện trạng + GVHD (`19` §6).
Endpoint acknowledgement **không phải** một cửa của bảng transition: `19` §3 chốt VC-01 là **dữ kiện
append-only**, `projects.status` vẫn đúng 5 giá trị (`05 §3.4`). Trách nhiệm với đề tài **chưa chuyển** chỉ vì
một người bấm "tôi nhận" hay "tôi không nhận". Nhưng **"gán lại" hiện chưa phải một đường hợp lệ**:
`POST /projects/:id/assign` chỉ hợp lệ ở `status = DRAFT`, nên **không** dùng được cho đề tài đang `ASSIGNED`, và
cũng chưa có transition/endpoint nào để *đóng* một phản hồi `DECLINED`/`CHANGE_REQUESTED`. Docs **không** được
claim "Admin reassign để xử lý phản hồi". Nguyên tắc trách nhiệm lấy từ 7shifts *"The original shift remains the
responsibility of the employee **until** the shift trade request is approved by management"* (trích trong `19`
§2.1) là **analogy** shift-trade — **không** chứng minh trực tiếp cho *initial* assignment, nên Q-02 chỉ là
**PARTIALLY RESOLVED**. Hai câu hỏi chặn thiết kế Ticket/Project integration: **D-15** (reassign/resolution) và
**D-16** (stale-response race) — §8.
`ACKNOWLEDGE`/`DECLINE`/`REQUEST_CHANGE` đều là **write ⇒ confirm** (BR-05), nên chatbot phải hiện challenge
trước khi gọi; REST chỉ nhận cờ `confirmed`.

Endpoint `PATCH /projects/:id/status` kiểu "đặt `status` tuỳ ý" **cố ý không tồn tại**: `change_project_status`
phải đi qua bảng transition (`04 §7`).

### 2.5 `reports` (F7)

`reports.status` đi một vòng đời riêng: `SUBMITTED → APPROVED | REJECTED` (`05 §3.6`) — không dồn vào enum của
`projects.status`.

| Method | Path | Vai | Request | Response | Mã lỗi | Idempotency | Index / filter |
|---|---|---|---|---|---|---|---|
| POST | `/projects/:id/reports` | `Employee` own, `Admin` (`submit_report` — write ⇒ confirm; `B0`: `submit_report → confirm → reportService.create()`) (T-04) | `content : string : required`<br>`attachments? : string[] : TBD` (chưa có quyết định upload file — `07 §9` checklist mục 25)<br>`clientMessageId : string : required` | `201 ReportDto` (`status = SUBMITTED`) → đề tài chuyển `PENDING_REVIEW` + `report:updated` + `project:updated` + notify "Báo cáo đã nộp" → `Admin` | `CONFIRMATION_REQUIRED` (428), `RBAC_DENIED` (403), `ILLEGAL_STATE_TRANSITION` (422), `VALIDATION_FAILED` (400) | cùng `clientMessageId` → một bản ghi; nộp **đợt mới** sau reject phải là request khác id (`04` BR-04: giữ bản cũ) | insert `reports`; đọc theo **I-05** |
| GET | `/projects/:id/reports` | cả hai (own) | sort `createdAt desc` | `200 { items: [ReportDto] }` | `RBAC_DENIED` (403) | Idempotent (đọc) | `reports (projectId, createdAt)` — **I-05** (`B4`) |
| GET | `/reports/:id` | `Admin`; `Employee` là người nộp | — | `200 ReportDto` (`reviewReason` nếu bị từ chối) | `RBAC_DENIED` (403), `RESOURCE_NOT_FOUND` (404) | Idempotent (đọc) | `_id` |
| POST | `/reports/:id/review` | **`Admin` only** | `decision : 'APPROVE'\|'REJECT' : required`<br>`reason? : string : required khi REJECT`<br>`expectedProjectVersion : number : required`<br>`clientMessageId : string : required` | `200 { report, project }` — APPROVE ⇒ `COMPLETED` (T-05a); REJECT ⇒ `IN_PROGRESS` (T-05b) + lý do vào `statusHistory[]` | `CONFIRMATION_REQUIRED` (428), `RBAC_DENIED` (403), `PROJECT_VERSION_CONFLICT` (409), `VALIDATION_FAILED` (400) | hai người cùng approve → một thắng, một 409 (`05 §5.3`) | `_id` + điều kiện trên `projects` |

### 2.6 `evaluations` (F5)

| Method | Path | Vai | Request | Response | Mã lỗi | Idempotency | Index / filter |
|---|---|---|---|---|---|---|---|
| POST | `/evaluations/periods` | `Admin` (mở kỳ — `SUY DIỄN`: `B0` mô tả bước, không nêu cách gọi) | `period : string : required` (granularity `TBD`, Q-07 ở `04 §9`) | `201 { period, created }` — upsert `evaluations` cho từng `(employeeId, period)` | `VALIDATION_FAILED` (400), `DUPLICATE_KEY` (409) | Upsert theo `(employeeId, period)` UNIQUE → mở lại vẫn **một** bản ghi (BR-17) | **I-06** `(employeeId, period)` UNIQUE |
| GET | `/evaluations` | `Admin`; `Employee` own | filter: `period?`, `employeeId?`, `status?` (`DRAFT\|REVIEWED\|PUBLISHED`) | `200 { items: [EvaluationDto] }` | `RBAC_DENIED` (403) | Idempotent (đọc) | **I-16** `(period)` cho "KPI cần review"; **I-06** cho own |
| GET | `/evaluations/:id` | `Admin`; `Employee` own | — | `200 EvaluationDto` — bắt buộc đủ `machineScore \| finalScore \| overrideReason \| changedBy \| changedAt` (`B6`) | `RBAC_DENIED` (403), `RESOURCE_NOT_FOUND` (404) | Idempotent (đọc) | `_id` |
| PATCH | `/evaluations/:id/reviews` | `Employee` own (`selfReview`); `Admin` (`managerReview`) | `selfReview? : string`<br>`managerReview? : string`<br>`clientMessageId : string : required` | `200 EvaluationDto` | `RBAC_DENIED` (403), `VALIDATION_FAILED` (400) | theo `clientMessageId` | `_id` |
| POST | `/evaluations/:id/analyze` | hệ thống (`Admin` trigger); AI **chỉ** trả `sentiment\|themes\|riskSignals\|suggestedScoreComponent\|explanation` (BR-07) | `evaluationId` | `200 EvaluationDto` với 5 tín hiệu; `machineScore` tính ở `kpiService` bằng công thức tất định (FR-031) | `AI_SERVICE_UNAVAILABLE` (503), `AI_SERVICE_TIMEOUT` (504), `VALIDATION_FAILED` (400), `RBAC_DENIED` (403) | chạy lại cùng input → **cùng** `machineScore` (tất định, `04 §6.3`) | `_id` |
| POST | `/evaluations/:id/override` | **`Admin` only** (`override_kpi (confirm + reason + Admin)` — `B6`) | `finalScore : number : required`<br>`overrideReason : string : required`<br>`confirmed : boolean`<br>`clientMessageId : string : required` | `200 EvaluationDto` (`finalScore`, `overrideReason`, `changedBy`, `changedAt`) + `kpi:updated` | `CONFIRMATION_REQUIRED` (428), `VALIDATION_FAILED` (400 — thiếu reason), `RBAC_DENIED` (403) | Mỗi override là một mutation có audit; **không** có version lock trên `evaluations` (`05 §3.7` không có `version`) → **khoảng trống**, xem §8 D-04 | `_id`, I-06 |
| POST | `/evaluations/:id/publish` | `Admin` | `clientMessageId` | `200 EvaluationDto` (`status = PUBLISHED`, `publishedAt`) → `kpi:updated` cho Employee + room `department:<departmentId>` | `VALIDATION_FAILED` (400 — kỳ thiếu review), `RBAC_DENIED` (403) | publish lại → không đổi `publishedAt` lần hai (`SUY DIỄN`) | `_id` |
| GET | `/departments/:id/kpi` | **`Admin` only** (`get_department_kpi` — `B6`) | `period?`, `from?`, `to?` | `200 { departmentId, period, items: [...] }` | `RBAC_DENIED` (403) | Idempotent (đọc) | **I-04** `(departmentId, status, dueDate)` cho phần đề tài; **I-06/I-16** cho KPI; server **tự inject** scope (`B15`) |

### 2.7 `policies` (F3)

| Method | Path | Vai | Request | Response | Mã lỗi | Idempotency | Index / filter |
|---|---|---|---|---|---|---|---|
| GET | `/policies` | cả hai (đọc); ghi chỉ `Admin` | `category?`, `q?` | `200 { items: [PolicyDto] }` (không kèm `chunks.embedding`) | `RBAC_DENIED` (403) | Idempotent (đọc) | Vector Search trên `chunks.embedding` — **I-10**; `title`/`category` full-text **chưa làm** (`05 §4.3`) |
| POST | `/policies` | `Admin` | `title : string : required`<br>`version : string : required`<br>`source : string : required` (`B6`: answer phải kèm `document/version/source`)<br>`category?`, `effectiveFrom?`<br>`chunks : [{ text : string : required, order : number : required }]` | `201 PolicyDto` → job embedding chạy nền (`SUY DIỄN` về cách chạy) | `VALIDATION_FAILED` (400), `AI_SERVICE_UNAVAILABLE` (503) | Không idempotent (mỗi request một phiên bản tài liệu) | insert + tạo vector cho I-10 |
| POST | `/policies/:id/reindex` | `Admin` | — | `202 { policyId, chunks }` | `RESOURCE_NOT_FOUND` (404), `AI_SERVICE_UNAVAILABLE` (503), `QUOTA_EXCEEDED` (429 — provider embedding hết hạn mức, `B6`) | Chạy lại an toàn: re-embed toàn bộ chunk của một policy (`SUY DIỄN`) | I-10 |
| POST | `/policies/search` | cả hai (`search_policy` — read, **không** confirm) | `query : string : required`<br>`topK? : number` | `200 { answers: [{ text, document, version, source, score }] }` — `score` là **điểm retrieval**, không phải xác suất đúng (`B13`) | `QUOTA_EXCEEDED` (429), `AI_SERVICE_UNAVAILABLE` (503), `VALIDATION_FAILED` (400) | Idempotent (đọc) | **I-10** Atlas Vector Search top-K chunks |

`LOW_CONFIDENCE_ABNSTENTION` (§5) là kết quả **hợp lệ**, không phải lỗi: `B0` UF-10 "không đủ bằng chứng → từ
chối đoán". Import policy **không** có tool chatbot (`18` bước 8 của UF-10).

### 2.8 `notifications` (C5)

| Method | Path | Vai | Request | Response | Mã lỗi | Idempotency | Index / filter |
|---|---|---|---|---|---|---|---|
| GET | `/notifications` | cả hai, own | filter: `unreadOnly? : boolean`, `type?` (enum `05 §3.9`), `channel?` (`ws\|in_app\|digest`) | `200 { items: [NotificationDto], unreadCount }` | `RBAC_DENIED` (403) | Idempotent (đọc) | **I-07** `(userId, readAt, createdAt)` (`B4`); partial index trên `readAt: null` là candidate (`05 §4.2`) |
| POST | `/notifications/:id/read` | cả hai, own | `clientMessageId` | `200 { id, readAt }` | `RBAC_DENIED` (403), `RESOURCE_NOT_FOUND` (404) | Ack hai lần không đổi `readAt` lần hai (`SUY DIỄN`) | `_id`; I-07 |
| POST | `/notifications/:id/unread` | cả hai, own | `clientMessageId` | `200 { id, readAt: null }` | `RBAC_DENIED` (403) | như trên | `_id` |
| GET | `/notifications/digest` | `Admin` | `date?` | `200 { items: [NotificationDto] at channel = digest }` — **1 bản/ngày** | `RBAC_DENIED` (403) | Idempotent (đọc) | **I-17** `(userId, dedupeKey)` UNIQUE chặn digest đúp (`05 §3.9`, `B15`) |

Không có endpoint tạo notification cho người dùng: notification chỉ do **Agenda job** (`B15`) hoặc service
nghiệp vụ sinh ra. Client không bao giờ POST vào collection này.

### 2.9 `chatbot`

Không có REST endpoint cho hội thoại: `B7` định nghĩa hội thoại chạy hoàn toàn trên Socket.IO (§4). REST chỉ là
đường **đọc lại** cho dashboard (notification, project, KPI). Đây là điểm cần nhắc khi code: `RP §3 B7` hỏi
"có persist message vào Mongo không" và `NOTES-01` **không trả lời** → `05 §7` D-08 chốt MVP **không** lưu
lịch sử chat, nên **không có** endpoint `GET /chatbot/history`.

### 2.9.1 Hợp đồng response của tool đọc hồ sơ người khác

`19` §2.3(b) chốt: **tool chỉ trả dữ liệu tối thiểu cần để ra quyết định**. Quy tắc áp cho `find_candidates` và
`get_employee` (khi gọi cho người khác); nó là **ràng buộc response schema**, không phải lời khuyên trình bày.

| Tool | Response được phép (`CandidateSummaryDto`) | Cấm trong response | Ghi chú |
|---|---|---|---|
| `find_candidates` | `aiSuggestionId`, `items: [{ employeeId, fullName (tên hiển thị), level, matchScore, rank, matchedSkills[], missingSkills[], workload (số đề tài đang mở — tổng hợp) }]`, `abstain`, `clarify?` | `phone`, email cá nhân, địa chỉ, lương, `hiredAt`, lý do nghỉ/vắng, `selfReview`/`managerReview`, `sentiment`/`themes`/`riskSignals`, điểm KPI chi tiết (`machineScore`/`finalScore`/`suggestedScoreComponent`/`overrideReason`), tiêu đề/nội dung đề tài của người khác | `IN-02` chỉ nhận `[{ employeeId, skills, level, activeLoad }]` làm đầu vào → đầu ra **không cần** gì thêm ngoài những thứ đã vào; `matchedSkills`/`missingSkills` lấy từ phần breakdown đã có của `IN-03` (card "bằng chứng" `B14`). `aiSuggestionId` đã tồn tại trong `feedback_events` (`05 §3.11`) |
| `get_employee` (người khác) | `employeeId`, `fullName`, `level`, `departmentId`, `skills`, `status` | như cột giữa, cộng mọi field nhóm "nhạy cảm" của UF-01 | own (`get_my_profile`) mới trả hồ sơ đầy đủ; catalog `B6` **không** tách hai đường này → phân vùng là `// SUY DIỄN` (A-06 ở `07 §10`) |
| `explain_candidate_match` | `contributions: [{ skill, delta }]`, `workloadPenalty`, `method` | mọi field định danh cá nhân bổ sung (tool đã biết `employeeId` từ kết quả trước) | đúng 3 nhóm field của `IN-03`; **cấm** attention (`B14`) |

Cưỡng chế bằng **projection ở repository + allowlist ở Zod DTO** (`B2`), không bằng cách lọc thủ công trong
prompt: kết quả tool đi thẳng vào ngữ cảnh LLM, nên một field lọt vào response là đã lọt vào prompt. Test
tương ứng nằm ở `13` §2.16.

**Chưa chốt:** hành vi acknowledgement (§2.4) **chưa có tên tool** trong catalog 15 cái của `B6` — `19` §3 ghi
"3 intent chatbot mới" là việc của `18-user-flows.md`; đặt tên tool là `// SUY DIỄN — cần xác nhận` +
`[CẦN NGUỒN]`, và tool mới **phải** được đăng ký trước khi code vì `E-01` ràng buộc `tool` nằm trong đúng 15
tên đã khai báo (§4.2).

## 3. Công cụ sinh client

| Bước | Dụng cụ | Ghi chú |
|---|---|---|
| Zod schema ở `packages/contracts` | `zod` | mỗi module một `x.schema.ts` (`B2`) |
| OpenAPI 3 | sinh từ Zod (`B2`) | artifact path chốt khi scaffold (`02 §7.2`) |
| Typed client + React Query hooks | `Orval` (`B2`) | client **sinh**, không viết tay |
| Fuzz hợp đồng | `schemathesis` | gate "API không trôi khỏi spec" (`RP §11`, `02 §9`) |

Số request trong bộ Postman demo: `TBD` — `11 §1` ghi "chốt khi `06-api-spec.md` khoá".

---

## 4. WebSocket contract (`Socket.IO`)

### 4.1 Điều kiện kết nối

| Hạng mục | Nội dung | Nguồn |
|---|---|---|
| Instance | **một** instance, `Socket.IO + MongoDB`, **không Redis adapter** | `B7`, ADR-010 |
| Namespace | **một** namespace ("Không cần 2 namespace ngay") | `B7`, PARK-11 |
| Handshake auth | Access token qua `socket.handshake.auth`, server verify bằng `jose` **trước khi** cho vào room; không kết nối ẩn danh | `07 §8` mục 1 |
| Rooms | `user:<userId>` và `department:<departmentId>` — id lấy từ **JWT đã verify**, không từ payload client | `B7`, `07 §8` mục 2 |
| RBAC | check ở **mỗi tool call**, không phải mỗi kết nối | `B6`, BR-06 |
| Idempotency | mỗi client message mang `clientMessageId`; message trùng id bị bỏ qua | `B7`, BR-13 |
| Bền vững | durable notification **vẫn phải persist phía app** (`notifications`), WS chỉ là kênh đẩy; Socket.IO tự lo fallback + reconnect | `B7` |
| Hạ tầng | service có thể ngủ sau 15 phút không traffic, wake-up có thể ~1 phút → UI phải hiển thị "đang kết nối lại", không giả định tức thì | `B1` `[CẦN NGUỒN]`, `02 §6` |

**Bộ event đóng ở 9 tên** (`B7`). Gate "WS contract" ở `RP §11` làm build **đỏ** nếu code emit một event chưa
khai báo trong file này.

### 4.2 Bảng event

| # | Event | Chiều | Ai emit | Ai nhận | Ack? | Payload (`field : kiểu : ràng buộc`) |
|---|---|---|---|---|---|---|
| E-01 | `chat:send` | client → server | `Employee` \| `Admin` (browser) | gateway `realtime` | **có** — server trả ack `{ accepted: true, clientMessageId }` hoặc `{ error }` | `clientMessageId : string : required`<br>`text : string : required`<br>`tool? : string` — bắt buộc nằm trong 15 tên của `B6`<br>`args? : object` — luôn bị Zod validate<br>`confirm? : { clientMessageId của challenge, approved : boolean }` — nhánh trả lời confirm |
| E-02 | `chat:accepted` | server → client | server | **đúng socket** đã gửi | không | `clientMessageId : string : required`<br>`acceptedAt : Date : required` |
| E-03 | `chat:chunk` | server → client | server (stream LLM) | đúng socket đã gửi | không | `clientMessageId : string`<br>`seq : number : required, tăng dần từ 0`<br>`delta : string : required` |
| E-04 | `chat:done` | server → client | server | đúng socket đã gửi | không | `clientMessageId : string : required`<br>`finishReason : 'ANSWER'\|'TOOL_RESULT'\|'ABSTAIN'\|'ERROR' : required`<br>`tool? : string`<br>`card? : object` — kết quả tra cứu render được (VD card match của `B14`)<br>`citations? : [{ document, version, source }]` — **bắt buộc** khi trả lời chính sách (BR-15)<br>`usage? : { inputTokens, outputTokens }` |
| E-05 | `chat:error` | server → client | server | đúng socket đã gửi | không | `clientMessageId? : string`<br>`code : string : required` — lấy từ catalog §5<br>`message : string : required`<br>`retryable : boolean : required` |
| E-06 | `notification:new` | server → client | `notificationService` (hoặc Agenda job sau khi **persist**) | room `user:<userId>` của người nhận | không (ack là REST `POST /notifications/:id/read`) | `notificationId : ObjectId : required`<br>`type : enum9 : required` (`05 §3.9`)<br>`title : string`<br>`body : string`<br>`channel : 'ws'\|'in_app'\|'digest'`<br>`payload? : { projectId?\|reportId?\|evaluationId? }`<br>`createdAt : Date` |
| E-07 | `project:updated` | server → client | `projectService` **sau** atomic update thành công | room `user:<mỗi assignee>` + `department:<departmentId>` | không | `projectId : ObjectId : required`<br>`status : enum5 : required`<br>`version : number : required`<br>`updatedAt : Date : required`<br>`actorId? : ObjectId` `reason? : string` — có khi reject<br>`clientMessageId? : string` |
| E-08 | `report:updated` | server → client | `reportService` | room `user:<submitterId>` (Employee) và `department:` của đề tài; Admin nhận bản của "Báo cáo đã nộp" | không | `reportId : ObjectId : required`<br>`projectId : ObjectId : required`<br>`status : 'SUBMITTED'\|'APPROVED'\|'REJECTED' : required`<br>`reviewReason? : string`<br>`createdAt : Date : required` |
| E-09 | `kpi:updated` | server → client | `kpiService` khi publish/override/chốt | room `user:<employeeId>` + `department:<departmentId>` | không | `evaluationId : ObjectId : required`<br>`employeeId : ObjectId : required`<br>`period : string : required`<br>`machineScore? : number` `finalScore? : number`<br>`changedBy? : ObjectId` `changedAt? : Date`<br>`publishedAt? : Date` |

### 4.3 Ba ràng buộc hành vi

1. **Thứ tự phát event của một mutation** (`05 §5.2`): update có điều kiện thành công → `insertProjectEvent`
   (audit) → `emit('project:updated')` → tạo notification. Payload WS vì vậy luôn phản ánh **trạng thái đã cam
   kết**; không có cửa "gửi event rồi phát hiện update thất bại".
2. **Không có event phản hồi tức thì từ phía hệ thống cho message do hệ thống khởi xướng.** `B7` chỉ khai báo
   `chat:send` là client message. Nhu cầu "chatbot chủ động hỏi tiến độ" (S6, `B0` matrix dòng "Daily standup")
   **chưa có hợp đồng event** → `[CẦN NGUỒN]`/chưa chốt (§8 D-06); tạm thời digest đi bằng E-06
   `channel: 'digest'` + REST `GET /notifications/digest`, **không** tự đặt tên event mới.
3. **Reconnect**: sau khi kết nối lại, client đọc `notifications` (I-07) và `projects` qua REST để bù; WS không
   được dùng làm nguồn sự thật (`B7`, `02 §6`).

### 4.4 Ánh xạ notification matrix → event (`B0`)

| Sự kiện (B0) | Người nhận | Kênh B0 | Chống spam B0 | Event + collection |
|---|---|---|---|---|
| Deadline còn 3 ngày | Employee | WS + in-app | 1 lần/ngày | persist `notifications` → E-06; khoá trùng I-17 |
| Deadline còn 1 ngày | Employee | WS + in-app | 1 lần | persist → E-06 |
| Quá hạn | Employee + Admin | WS + digest | 1 lần/ngày | E-06 cho Employee; Agenda digest cho Admin |
| Báo cáo đã nộp | Admin | WS | theo event | E-08 + E-07 (`PENDING_REVIEW`) + E-06 |
| Báo cáo bị reject | Employee | WS | theo event | E-06 + E-07 (về `IN_PROGRESS`, lý do trong `statusHistory[]`) |
| Assignment mới | Employee | WS | theo event | E-07 + E-06 sau khi `assign_project` qua confirm |
| KPI cần review | Admin | digest | 1 lần/ngày | Agenda digest (B15); khi chốt xong → E-09 |
| Daily standup (S6) | Employee | chatbot | 1 lần/ngày | **chưa có event** — xem §8 D-06 `[CẦN NGUỒN]` |
| Daily digest (S6) | Admin | in-app | 1 bản/ngày | persist `notifications` kênh `in_app` + I-17 |

Khoá `dedupeKey` cụ thể cho từng dòng: nguồn **không** spec (`18` notification matrix ghi `[CẦN NGUỒN]`) →
`TBD`; cơ chế cưỡng chế đã có: UNIQUE `(userId, dedupeKey)` — I-17 (`05 §3.9`).

---

## 5. Error catalog

Chỉ dùng mã mà nghiệp vụ trong nguồn **thật sự sinh ra**. Cột "Nguồn" là bằng chứng; cột "Client làm gì" là hợp
đồng hành vi.

| Code | HTTP | Sinh ra từ | Nguồn | Client nên làm gì |
|---|---|---|---|---|
| `VALIDATION_FAILED` | 400 | Zod reject ở biên vào (mọi đối số, kể cả đối số LLM trả về); enum ngoài 5 giá trị `status`, ngoài 2 `role`, ngoài 5 `level`, ngoài 3 giá trị `response` của acknowledgement; bắt buộc `reasonCode` khi `DECLINE`/`REQUEST_CHANGE` (bắt buộc `reason` khi reject/override) | `B6` "Zod validate every argument"; `B2`; `04` BR-19 | Giữ dữ liệu người dùng đã nhập, highlight **field nào** sai trong `details`; **không** retry tự động |
| `UNAUTHENTICATED` | 401 | JWT thiếu/hết hạn; refresh fail; đăng nhập sai | `07 §2/.4` "trả 401, client xoá access token trong memory và chuyển về màn hình login" | Xoá access token trong memory, dừng thử refresh lại trong cùng trang, chuyển về login |
| `TOKEN_REUSED` | 401 | Refresh token cũ xuất hiện lại → **revoke TOÀN BỘ family** | `B3`; `07 §3.3` | Thông báo "phiên đã bị thu hồi vì lý do bảo mật", yêu cầu login lại; không cho phép im lặng login lại |
| `RBAC_DENIED` | 403 | RBAC check ở mỗi request và **mỗi tool call**; `Employee` chạm tool/cửa Admin (`assign_project`, `override_kpi`, `get_department_kpi`, `find_candidates`, duyệt hồ sơ); **`Admin` chạm dữ liệu ngoài `departmentId` được gán** (`07 §7.4` — scope enforcement ở service layer) | `B6` "RBAC check every tool"; `07 §7`, `07 §7.4`; BR-06 | Ẩn/bỏ action đó khỏi UI; **không** hiển thị dữ liệu một phần; giữ nguyên dữ liệu |
| `NOT_ASSIGNEE` | 403 | `POST /projects/:id/acknowledgement`: người gọi **không còn** nằm trong `assigneeIds` của đề tài (bị gán lại sau khi nhận notification), hoặc đề tài đang ở `DRAFT` — chưa có ai được giao mà phản hồi | `19` §3 hàng `VC-01` (ownership + response permission); suy ra từ BR-16 (`04`) — **tên mã do docs đặt** `// SUY DIỄN — cần xác nhận` | Ẩn nút/chip phản hồi khỏi card, reload đề tài; **không** retry; **không** đổi trạng thái nào (`ACKNOWLEDGED` không phải cửa của bảng transition) |
| `SELF_APPROVAL` | 403 | actor của hành động **duyệt/phê chuẩn** trùng với người **tạo** yêu cầu được duyệt — guard "không tự duyệt yêu cầu do chính mình tạo" (`07 §7.4`) | `19` §2.3(a) + `NOTES-02` §E VC-01 ("Manager không tự approve request của chính mình nếu cùng actor"); **tên mã do docs đặt** `// SUY DIỄN — cần xác nhận` | Báo rõ "bạn không thể duyệt chính yêu cầu của mình", gợi ý chuyển cho Admin khác trong cùng `departmentId`; **không** mutate, **không** ghi event duyệt |
| `CONFIRMATION_REQUIRED` | 428 | Tool **ghi** được gọi mà chưa có bước xác nhận | `B6` "Write tool → confirmation → execute"; `00 §4` S8; BR-05 | Hiển thị challenge "hệ thống sắp làm X — bạn có chắc không?", phát `chat:send` với `confirm.approved = true` khi người dùng đồng ý; **không** mutate gì cho tới lúc đó |
| `ILLEGAL_STATE_TRANSITION` | 422 | `to` không phải cửa ra hợp pháp của trạng thái hiện tại theo bảng transition; `COMPLETED → *`; `DRAFT → PENDING_REVIEW` | `B4` sơ đồ; `04 §4.3` "chỉ một transition duy nhất cho một trạng thái", "không nhảy tắt"; BR-01 | Reload đề tài, hiển thị `status` hiện tại; action sai bị loại khỏi UI — **không** retry |
| `PROJECT_VERSION_CONFLICT` | 409 | Điều kiện `(_id, status: expected, version: v)` không khớp: hai người cùng sửa / cùng bấm approve | `05 §5.2/.3`; `04` BR-02 | Đọc `details.actual` (document hiện tại) và **reload form**, người dùng bấm lại có ý thức; **không** auto-merge |
| `DUPLICATE_KEY` | 409 | Vi phạm UNIQUE: `employees.employeeCode` (I-01), `evaluations (employeeId, period)` (I-06), `refresh_sessions.tokenHash` (I-08), `notifications (userId, dedupeKey)` (I-17) | `B4` index; `05 §3` | Báo "bản ghi đã tồn tại" kèm giá trị trùng; job digest **bỏ qua** đây là hành vi đúng khi retry |
| `RESOURCE_NOT_FOUND` | 404 | `_id` không tồn tại hoặc bị lọc mất bởi scope ownership (BR-16) | `B6` phân vùng own/department (`07 §7.1`) | Hiển thị empty state; **không** tiết lộ sự tồn tại của tài nguyên ngoài scope |
| `LOW_CONFIDENCE_ABNSTENTION` | 200 | Điểm sau calibration dưới ngưỡng → **không đoán**, hỏi lại; retrieval không đủ bằng chứng → từ chối trả lời | `B13`; `B0` UF-10 "không đủ bằng chứng → từ chối đoán"; BR-10, BR-15 | Không phải lỗi. Hiển thị câu hỏi làm rõ ("Anh/chị đã làm React chưa?") hoặc "chưa có trong tài liệu chính sách"; **không** hiển thị gợi ý nào |
| `AI_SERVICE_UNAVAILABLE` | 503 | `apps/ai-service` không trả lời (cold start, OOM, VPS chưa đủ RAM — con số `TBD` `[CẦN NGUỒN]`) | kiến trúc `B5`/kết luận `NOTES-01`; `02 §6` hàng `apps/ai-service` | Với tool đọc: báo "không dùng được lúc này" + cho phép thử lại. Với mutation: **không** đổi trạng thái nghiệp vụ |
| `AI_SERVICE_TIMEOUT` | 504 | Vượt `toolTimeout`/`LLM timeout` của guard; `max tool result size` | `B6` guard; BR-19 | Phát `chat:error` với `retryable: true`; loop **dừng ở `maxSteps = 5`**, không tự nối thêm bước |
| `QUOTA_EXCEEDED` | 429 | Provider LLM/embedding chạm hạn mức free tier (`B6`: Groq nhiều model 30 RPM; `gpt-oss-120b` ~1.000 RPD, 8K TPM) | `B6`; `RP §9` S9 | Hiển thị "vượt hạn mức", kích hoạt con đường **graceful degradation** (S9) nếu đã bật; **không** spam retry. Số lần thử lại và backoff: `TBD` (nguồn không đặt) |
| `INTERNAL_ERROR` | 500 | Lỗi không phân loại; **bắt buộc** có `correlationId` để đối chiếu log | `02 §7.5` "fail có cấu trúc" | Hiển thị lỗi chung, không lộ stack; log `correlationId` vào phiếu UAT/defect |
| `DUPLICATE_REQUEST` | 200 | `clientMessageId` đã được xử lý → trả chính kết quả cũ, **không** mutate lần hai | `B7`; BR-13; `05 §3.5` | Coi như thành công; không hiển thị "đã gửi" hai lần |

**Những mã lỗi CỐ Ý KHÔNG tồn tại** (để không bịa hành vi):
nghỉ phép/quota ngày phép (UF-02 `PARKED — chờ GVHD`), onboarding/offboarding (UF-03 `PARKED — chờ GVHD`),
goal/OKR (UF-07 `PARKED — chờ GVHD`), pulse survey (UF-08 `PARKED — chờ GVHD`), **rate limit đăng nhập và khoá
tài khoản sau N lần sai** (`RP §3 B3` hỏi, `NOTES-01 §B3` không trả lời — `07 §9` checklist mục 10–11),
access-token deny-list (`07 §9` checklist mục 12), upload file chặn theo loại/dung lượng (`07 §9` checklist mục 25).

---

## 6. Hợp đồng nội bộ `apps/api` ↔ `apps/ai-service` (FastAPI)

### 6.1 Ranh giới

| Điều kiện | Nội dung | Nguồn |
|---|---|---|
| Hình thức gọi | **sync REST** Node → Python cho mọi endpoint dưới đây; `ai-service` **không** gọi ngược `apps/api` ở baseline | `02 §5.3` "Đường `chatbot → ai` là **một chiều**" |
| Vị trí agent loop | **chưa chốt** — `apps/api` hay `apps/ai-service`; `B0` đặt tool map thẳng tới repository trong khi sơ đồ lớp để LLM dưới FastAPI | `02 §12` mục 4 → §8 D-01 |
| Validate | mọi payload đi qua **biên** Node đều được Zod validate lại (`B6`), kể cả payload từ Python | `B6` |
| Tiền xử lý tiếng Việt | `B5`: "PhoBERT yêu cầu input tiếng Việt đã được word-segmented" → bước word segmentation **nằm trong** `ai-service`, không nằm trong chat UI | `B5`; `02 §6` |
| Model khởi tạo | phải warm-up trước khi nhận request; `Warm embedding inference < 500 ms` là **internal target**, chưa phải chuẩn ngoài | `B9`; `RP §3 B9` |
| Việc **không** nằm ở đây | LLM **không** sinh KPI cuối (`B6`), **không** sinh Mongo pipeline (`B15`), **không** giải thích bằng attention (`B14`) | `B6`, `B14`, `B15` |
| Auth nội bộ | **`[CẦN NGUỒN]`** — `RP §3 B2` nêu câu hỏi "shared secret hay HMAC" và `NOTES-01` **không trả lời**; `02 §12` mục 5 ghi cùng trạng thái. **Không** được giả định là "network nội bộ nên an toàn" | `RP §3 B2`; `02 §12` |

### 6.2 Endpoint nội bộ

Các endpoint này **không** nằm trong OpenAPI công khai (không cho browser gọi); chúng là hợp đồng nội bộ và
chỉ được `apps/api` gọi.

| # | Method + path | Vai trò | Request | Response | Lỗi | Nguồn |
|---|---|---|---|---|---|---|
| IN-01 | POST `/internal/embeddings` | text → vector (nền của `search_policy`, `find_candidates`) | `model : string : required` (tên checkpoint đã pin)<br>`texts : string[] : required`<br>`normalize : boolean` | `items : [{ text, vector : number[], dims : number, model }]` | `VALIDATION_FAILED`, `AI_SERVICE_UNAVAILABLE`, `AI_SERVICE_TIMEOUT`, `QUOTA_EXCEEDED` | `B6` flow "chunk → embedding"; `B5` (4 model ứng viên: TF-IDF/BM25, PhoBERT mean-pool, multilingual-e5-small 384 dims, MiniLM 384 dims) |
| IN-02 | POST `/internal/rank-candidates` | tool `find_candidates` → `aiService.rankCandidates()` (`B0`) | `requirement : { projectId, title, description?, requiredSkills : string[] }`<br>`candidates : [{ employeeId, skills : string[], level, activeLoad }]`<br>`topK : number`<br>`strategy : enum : TBD` (tên chiến lược embedding — **chưa khoá dataset/model**, `B5`) | `items : [{ employeeId, rawScore : number, rank, calibrated? : number }]`<br>`abstain : boolean` + `clarify? : { ask : string }` (S2) | như IN-01 + `LOW_CONFIDENCE_ABNSTENTION` (200) | `B5` (cosine + threshold tuning + top-K ranking + **tie-break bằng workload**), `B6`, `B13` |
| IN-03 | POST `/internal/explain-match` | tool `explain_candidate_match` — card "bằng chứng" | `projectId`, `employeeId`, `skills[]`, `requiredSkills[]`, `rawScore` | `contributions : [{ skill, delta }]` + `workloadPenalty` + `method : 'skill-to-skill-cosine' \| 'leave-one-skill-out'` | như IN-01 | `B14` (chọn skill-to-skill cosine + leave-one-out; **cấm** attention; số trong card chỉ minh hoạ **format**) |
| IN-04 | POST `/internal/calibrate` | hiệu chuẩn điểm cosine → xác suất ước lượng trước khi cắt ngưỡng | `rawScores : number[]`, `model : string`, `thresholdPolicy : string : TBD` | `probabilities : number[]`, `threshold : number : TBD`, `metrics? : { ece, brier }` | như IN-01 | `B13` (Platt / logistic; cosine 0.82 **không** phải 82% xác suất) — **path do docs đặt** `SUY DIỄN` |
| IN-05 | POST `/internal/sentiment` | F5: phân tích `selfReview` + `managerReview` | `evaluationId`, `selfReview? : string`, `managerReview : string`, `objectiveCompletionScore : number` | `sentiment`, `themes : string[]`, `riskSignals : string[]`, `suggestedScoreComponent : number`, `explanation : string` — **chỉ 5 field này** | như IN-01 + `VALIDATION_FAILED` nếu response chứa điểm tổng | `B6` "AI chỉ tạo: sentiment \| themes \| risk signals \| suggested score component \| explanation"; BR-07 |
| IN-06 | POST `/internal/policy/retrieve` | top-K chunk cho RAG chính sách | `query : string`, `topK : number` | `chunks : [{ policyId, order, text, document, version, source, score }]` | như IN-01; thiếu bằng chứng → `LOW_CONFIDENCE_ABNSTENTION` ở tầng tool | `B6` "Policy documents → chunk → embedding → Atlas Vector Search → top-K chunks"; `B0` UF-10 |
| IN-07 | GET `/internal/health` | readiness — service có ngủ đông/warm-up không | — | `200 { ready : boolean, loadedModels : string[] }` | `503` khi model chưa warm | `02 §6` (warm embedding), `B1` (wake-up có thể ~1 phút) |

**IN-06 có thể không tồn tại**: nếu agent loop nằm ở `apps/ai-service` thì `search_policy` chạy luôn trong
Python và Node chỉ còn là proxy mỏng. Câu hỏi này trùng §8 D-01 → **không** chốt được hợp đồng IN-06 trước khi
chốt vị trí agent loop. `NOTES-01 §B0` ví dụ `search_policy → ragService.search()` nhưng không nói
`ragService` sống ở process nào `[CẦN NGUỒN]`.

Dimension vector và model cho policy: `TBD` — `05 §3.8` ghi rõ `NOTES-01` chỉ cho dimension của
`multilingual-e5-small` (384) và MiniLM (384), **không** nói model nào dùng cho policy. Trần Atlas **3
Search/Vector index**, dùng 1 cho policy (I-10); F4 **không** dùng vector index mà cosine trong FastAPI (`B1`).
Toàn bộ các con số hạ tầng này `[CẦN NGUỒN]` (`NOTES-01` mục "CẦN BỔ SUNG").

---

## 7. Việc chưa làm được ở file này

| # | Nội dung | Lý do |
|---|---|---|
| 1 | OpenAPI 3 YAML/JSON đầy đủ | cố ý **không** viết: nguồn chốt pipeline "Zod → OpenAPI → Orval" (`B2`) nên OpenAPI là artifact sinh ra; viết tay sẽ tạo nguồn sự thật thứ hai |
| 2 | `GET /chatbot/history` | không có collection lưu message (`05 §7` D-08) |
| 3 | Endpoint CRUD cho leave/onboarding/goal/survey | bốn flow tương ứng `PARKED — chờ GVHD` (`18` flow inventory; PARK-01..04) |
| 4 | Endpoint NL→aggregation (S10) whitelist template | `PARKED — chờ GVHD` (PARK-05); `B15` còn yêu cầu khai báo whitelist template **trước khi** code, và whitelist đó chưa được GVHD duyệt |
| 5 | Endpoint phản hồi challenge xác nhận qua HTTP | confirm chạy trên WS (`chat:send` với `confirm`); REST mutation chỉ nhận cờ `confirmed` |
| 6 | Chuẩn hoá tên tham số phân trang + sort | offset vs cursor chưa chốt (`RP §3 B4`, `NOTES-01` không trả lời) |
| 7 | Mã hoá TTL/`SameSite`/`Path`/`Domain` của cookie RT thành con số trong hợp đồng | `07 §10` A-01/A-02; `NOTES-01 §B3` không cho số |

---

## 8. Việc chưa chốt — nối tiếp `02-architecture.md` §12

| ID | Treo ở đâu | Ảnh hưởng trực tiếp tới hợp đồng ở file này | Trạng thái `02 §12` | Ai chốt |
|---|---|---|---|---|
| D-01 | **Agent loop / tool runtime nằm ở `apps/api` hay `apps/ai-service`** | quyết định §6 có bao nhiêu endpoint và ai là chỗ gọi LLM; nếu ở Python thì §2.9 và IN-02/IN-06 đổi hình dạng; `B0` đặt tool map thẳng vào repository trong khi sơ đồ lớp để LLM dưới FastAPI | mục 4 — **chưa chốt**, cần ADR mới | nhóm + ADR |
| D-02 | **Chatbot có phải client cross-origin độc lập không** (cookie `HttpOnly` không hoạt động khi embed cross-origin) | nếu có → cần nhánh hợp đồng token cho public client (không cookie), kéo theo §2.1 và E-01 đổi chỗ mang token | mục 7 — chỉ chốt cho **web** | nhóm; ADR-008 cần nhánh mới |
| D-03 | **`departmentId` kiểu `ObjectId` hay mã chuỗi** (`B15` ví dụ `"DEV"` vs `B4` index/`B7` room) | mọi filter ở §2.2/§2.4/§2.6, và room `department:<departmentId>` ở §4 | `05 §7` D-02 | nhóm |
| D-04 | **Không có `version` trên `evaluations`** (`05 §3.7`) | `POST /evaluations/:id/override` không có khoá lạc quan → hai Admin override cùng lúc là last-write-wins, không có `409`; **không** được âm thầm thêm field vào collection | `05 §7` | nhóm |
| D-05 | **Hàng đợi duyệt field nhạy cảm của UF-01 chưa có chỗ lưu** trong khi `05 §1.1` đóng ở 11 collection | §2.2 đang chặn đường này (`pendingApprovalUnsupported`) | `05 §1.1` vs `B0` UF-01 | nhóm + GVHD |
| D-06 | **Event cho message do hệ thống khởi xướng** (S6 daily standup) | `B7` chỉ khai báo `chat:send` là client message; 9 event là đóng → **không** được thêm event thứ 10. Tạm đi đường persist + REST digest (§4.3 mục 2) | `18` notification matrix `[CẦN NGUỒN]` | nhóm + GVHD |
| D-07 | **Auth nội bộ api ↔ ai-service**: shared secret hay HMAC | §6.1 để trống cơ chế; hợp đồng chưa có lớp bảo vệ biên trong | mục 5 `[CẦN NGUỒN]` | nhóm + `[CẦN NGUỒN]` |
| D-08 | **Atlas Vector Search có trên M0/free hay không**; trần connection là 500 hay 512 | toàn bộ I-10 và IN-06; nếu không có thì RAG policy phải đổi thiết kế | mục 2, 3 `[CẦN NGUỒN]` | nhóm bổ sung URL vào `NOTES-01` |
| D-09 | **Khoá `dedupeKey` cho từng dòng notification matrix** | E-06 + I-17: không có khoá thì không chứng minh được "1 lần/ngày" | `18` `[CẦN NGUỒN]` | nhóm |
| D-10 | **`reports.attachments`** có upload file không; giới hạn loại/kích thước | §2.5 đang để `TBD` | `07 §9` checklist mục 25 | nhóm |
| D-11 | **F1 ≥ 85% đo bài toán nào** (`RP §7.2`) | IN-02 `strategy` và bộ metric của F4; không chặn REST contract nhưng chặn chốt `09-ai-evaluation.md` | mục 8 | GVHD |
| D-12 | **`period` granularity** (`04 §9` Q-07) | `POST /evaluations/periods`, filter `period` ở §2.6 | — | nhóm |
| D-13 | **Scope của Admin nằm ở đâu trong schema**: `07 §7.4` chốt *hành vi* (chặn theo `departmentId` được gán) nhưng `05 §3.1` chỉ có `users{email, passwordHash, role, employeeId}` — **không có field scope nào** và `NOTES-01 §B3` không đề cập khái niệm scope | mọi filter `departmentId` ở §2.2/§2.4/§2.6 và `RBAC_DENIED` ngoài scope; chưa quyết được là (a) thêm field vào `users`/`employees` hay (b) lấy scope từ `employees.departmentId` của chính Admin | `07 §7.4` `[CẦN NGUỒN]` | nhóm + GVHD (chạm 11 collection, `05 §1.1`) |
| D-14 | **Tên tool cho phản hồi phân công** chưa tồn tại trong catalog 15 tool của `B6`; `E-01` ràng buộc `tool` phải thuộc danh sách đóng đó | §2.4 (endpoint acknowledgement chạy được nhưng chatbot chưa gọi được) + §2.9.1 | `19` §3 ghi "3 intent chatbot mới" nhưng không đặt tên tool — `[CẦN NGUỒN]` | nhóm (`18-user-flows.md`, đang được người khác sửa) |
| D-15 | **Đường "xử lý phản hồi" phân công chưa tồn tại**: `POST /projects/:id/assign` chỉ hợp lệ ở `DRAFT`, nên không gán lại được đề tài `ASSIGNED`; cũng chưa có endpoint/transition nào để *đóng* một phản hồi `DECLINED`/`CHANGE_REQUESTED` | §2.4 (endpoint acknowledgement ghi được phản hồi nhưng **không có** cửa nào để resolve) | `04 §9` Q-10; docs **không** được claim reassign | GVHD + nhóm |
| D-16 | **Stale-response race**: phản hồi ghi `project_events` **không** đổi `projects.version` (BR-21) → phản hồi tạo trước khi Admin gán lại/xử lý vẫn được đọc là "đang hiệu lực"; chưa có luật nào vô hiệu hoá | §2.4 (idempotency chỉ theo `clientMessageId`, không theo mốc gán lại) | `04 §9` Q-11 | nhóm + GVHD |

## 9. Việc tiếp theo từ file này

1. Chốt D-01, D-02, D-03 → cập nhật lại §2, §4, §6 và mở ADR mới cho D-01 (`02 §11`).
2. Dịch catalog intent → tool ở `18-user-flows.md` thành fixture test tất định theo `11 §4.2` (mocked LLM,
   `temperature = 0`, snapshot).
3. Chốt whitelist report template cho S10 **trước khi** code (điều kiện ở PARK-05).
4. Bổ sung URL cho các con số `[CẦN NGUỒN]` ở §4.1 và §6 trước khi chép bất kỳ số nào vào báo cáo.
5. Khi repo có mã nguồn: gate `schemathesis` + gate WS contract (`RP §11`, `02 §9`) phải chạy thật; nếu không có
   lệnh thì bỏ gate đó khỏi tài liệu.

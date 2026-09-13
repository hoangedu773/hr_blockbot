# 05 — Mô hình dữ liệu (Data Model)

Khóa luận KLCN133. Dịch mô hình miền ở `04-domain-model.md` sang **11 MongoDB collection**, kèm ERD, schema,
chính sách index, quyết định "không transaction" và chính sách migration/seed.

## 0. Nguồn và ký hiệu

Giống hệt `04-domain-model.md` §0: `(B<n>)` = `docs/research/NOTES-01.md`, `(RP §<n>)` =
`docs/research/RESEARCH-PLAN.md`, `// SUY DIỄN — cần xác nhận` = field/khái niệm **nguồn không nêu** mà mô
hình phải có để chạy được, `[CẦN NGUỒN]` = cần URL, `TBD` = nguồn không cho con số → để trống, không đoán.
Riêng vòng này: `NOTES-02` = `docs/research/NOTES-02.md` (đề xuất của nhóm, **PROPOSED**, không phải yêu cầu
nghiệm thu), `19` = `docs/19-vertical-workforce-assessment.md` (quyết định phạm vi — mọi mục dẫn `19` đã được
chốt ở đó và **không** tự mở rộng thêm).

---

## 1. Tổng quan

### 1.1 Vì sao MongoDB và vì sao 11 collection này

Nguồn chốt trực tiếp: `NOTES-01 B4` liệt kê đúng 11 collection baseline, và `B1` chọn MongoDB Atlas làm nơi
chứa *business data + policies + 1 Vector Search index cho Policy RAG*.

```text
users  employees  departments  projects  project_events  reports
evaluations  policies  notifications  refresh_sessions  feedback_events (S4)
```

Mọi thiết kế dưới đây **không được thêm collection thứ 12** mà chưa qua GVHD — đây là danh sách baseline,
không phải danh sách "gợi ý".

### 1.2 Embed vs reference

`NOTES-01 B4` nêu nguyên tắc (là khuyến nghị của MongoDB): *embed khi dữ liệu thường đọc cùng nhau, reference
khi dữ liệu dùng chung / thay đổi độc lập / quan hệ phức tạp many-to-many*. Áp dụng nhất quán:

| Quan hệ | Cách xử lý | Lý do | Nguồn |
|---|---|---|---|
| `projects` → `statusHistory[]` | **embed** | đọc cùng document mỗi lần xem đề tài; chỉ tăng trưởng hữu hạn theo số lần đổi trạng thái; và **một document thì update là atomic** | `B1`, `B4` |
| `projects` → `project_events` | **reference** (collection riêng) | event log là audit stream, ghi nhiều, đọc phân trang, không cần nằm trong document đề tài; nhét vào embed sẽ làm document phình | `B4` |
| `projects` → `employees` (`assigneeIds`) | **reference, many-to-many** | một đề tài nhiều người, một người nhiều đề tài; index `(assigneeIds, status)` chỉ có nghĩa khi là reference | `B4` |
| `employees` → `departments` | **reference** | department dùng chung, đổi độc lập | `B4` |
| `employees` → `skills[]` | **embed** | kỹ năng là thuộc tính của hồ sơ, đọc/ghi cùng hồ sơ, không có collection `skills` | `B4` (danh sách collection), `B5` |
| `employees` → `level` | **embed, enum 5 giá trị** | enum đóng; không có collection `levels` trong baseline | `B3`, `B4` |
| `reports` → `projects` | **reference** | mỗi lần nộp là một document mới; giữ cả bản bị reject (BR-04) | `B4`, `B0` |
| `evaluations` → các trường AI (`sentiment`, `themes`, `riskSignals`, `suggestedScoreComponent`, `explanation`) | **embed** | giải thích/điểm thành phần được đọc cùng điểm, là bằng chứng giải trình của một kỳ | `B6`, `B14` |
| `policies` → `chunks[]` | **embed** (1 document policy nhiều mẩu + vector) | flow ở `B6` là *Policy documents → chunk → embedding → Atlas Vector Search → top-K chunks → LLM → answer + document/version/source*: kết quả trả về cần **đúng document/version/source** của mẩu vừa tìm → để cùng document là trọn vẹn một lần đọc. Atlas free chỉ tối đa 3 Search/Vector index `(B1)` → một index vector cho toàn bộ policy là đủ | `B6`, `B1` |
| `notifications` | **reference tới tác nhân** (`projectId`/`reportId`… dưới dạng `payload`) | notification là bản sao để hiển thị, không phải nguồn chân lý trạng thái | `B7`, `B4` |
| `refresh_sessions` → `users` | **reference** | vòng đời token độc lập với hồ sơ, có TTL riêng | `B3`, `B4` |
| `feedback_events` | **reference rời rạc** | append-only, không nằm trong vòng đời nghiệp vụ nào | `B4`, `RP §9 S4` |

Hệ quả của embedding `statusHistory[]`: một document có kích thước tối đa hữu hạn `(giới hạn cụ thể: [CẦN NGUỒN] — NOTES-01 không nêu)`.
Với quy mô đề tài của đồ án thì không chạm ngưỡng đó; nếu chạm thì phải chuyển `statusHistory[]` sang
`project_events` và để document chỉ giữ trạng thái hiện tại
// **SUY DIỄN — cần xác nhận** (ngưỡng và cách xử lý đều không có trong nguồn).

---

## 2. ERD (11 collections)

```mermaid
erDiagram
  USERS ||--o| EMPLOYEES : "danh_tinh_dang_nhap"
  USERS ||--o{ REFRESH_SESSIONS : "co_phien_rt"
  USERS ||--o{ NOTIFICATIONS : "nhan_thong_bao"
  DEPARTMENTS ||--o{ EMPLOYEES : "co_nhan_su"
  DEPARTMENTS ||--o{ PROJECTS : "so_huu"
  EMPLOYEES }o--o{ PROJECTS : "assigneeIds"
  EMPLOYEES ||--o{ PROJECT_EVENTS : "tac_nhan"
  PROJECTS ||--o{ PROJECT_EVENTS : "lich_su"
  PROJECTS ||--o{ REPORTS : "bao_cao_nghiem_thu"
  EMPLOYEES ||--o{ REPORTS : "nguoi_nop"
  EMPLOYEES ||--o{ EVALUATIONS : "duoc_danh_gia"
  EMPLOYEES ||--o{ FEEDBACK_EVENTS : "quyet_dinh"

  USERS {
    ObjectId _id PK
    string email "dang nhap"
    string passwordHash "Argon2id"
    string role "Admin / Employee"
    ObjectId employeeId "-> employees"
    date createdAt
  }
  EMPLOYEES {
    ObjectId _id PK
    string employeeCode "UNIQUE"
    string fullName
    ObjectId userId "-> users"
    ObjectId departmentId "-> departments"
    string level "Intern, Junior, Middle, Senior, Lead"
    array skills "string array, embed"
    string phone "du lieu nhay cam UF-01"
    date hiredAt
    string status "active / inactive (SUY DIEN)"
  }
  DEPARTMENTS {
    ObjectId _id PK
    string code "short name, vd DEV"
    string name "ten tieng Viet"
    ObjectId headEmployeeId "-> employees"
  }
  PROJECTS {
    ObjectId _id PK
    string title
    string description
    ObjectId departmentId "-> departments"
    array assigneeIds "nhiều employeeId - many-to-many"
    array requiredSkills "string array - input matching"
    string status "DRAFT / ASSIGNED / IN_PROGRESS / PENDING_REVIEW / COMPLETED"
    date dueDate "source of derived overdue"
    number progressPct "0 den 100"
    number version "optimistic lock"
    array statusHistory "embed va append-only"
    ObjectId createdBy "-> users"
    date createdAt
    date updatedAt
  }
  PROJECT_EVENTS {
    ObjectId _id PK
    ObjectId projectId "-> projects"
    string type "CREATED / ASSIGNED / STARTED / PROGRESS_UPDATED / REPORT_SUBMITTED / APPROVED / REJECTED / ACKNOWLEDGED / DECLINED / CHANGE_REQUESTED" // SUY DIEN
    string fromStatus
    string toStatus
    ObjectId actorId "-> users"
    ObjectId respondeeId "-> employees nguoi duoc giao phan hoi (SUY DIEN)"
    string reason "bat buoc khi REJECTED / DECLINED / CHANGE_REQUESTED"
    string source "rest / chatbot / scheduler"
    string clientMessageId "idempotency khi goi tu WS"
    string tool "ten tool neu gu tu Agent Loop"
    date createdAt
  }
  REPORTS {
    ObjectId _id PK
    ObjectId projectId "-> projects"
    ObjectId submitterId "-> employees"
    string content
    string status "SUBMITTED / APPROVED / REJECTED"
    string reviewReason "khi bi reject"
    ObjectId reviewerId "-> users"
    date reviewedAt
    date createdAt "index cung projectId"
  }
  EVALUATIONS {
    ObjectId _id PK
    ObjectId employeeId "-> employees"
    string period "khoa UNIQUE voi employeeId"
    string selfReview "buoc 1 chu ky KPI"
    string managerReview "buoc 2"
    string sentiment "AI signal"
    array themes "AI signal"
    array riskSignals "AI signal"
    number suggestedScoreComponent "AI signal, bi BR-08 tran"
    string explanation "breakdown cho nguoi dung"
    number objectiveCompletionScore "dan xuat tu projects"
    number machineScore "deterministic, bat bien"
    number finalScore "cong bo"
    string overrideReason "bat buoc neu khac machineScore"
    ObjectId changedBy "-> users"
    date changedAt
    string status "DRAFT / REVIEWED / PUBLISHED (SUY DIEN)"
    date publishedAt
  }
  POLICIES {
    ObjectId _id PK
    string title
    string version "document/version/source tra ve cung cau"
    string source "duong dan tai lieu goc"
    array chunks "text + embedding"
    string category
    date effectiveFrom
    date updatedAt
  }
  NOTIFICATIONS {
    ObjectId _id PK
    ObjectId userId "-> users"
    string type "deadline_3d / deadline_1d / overdue / report_submitted / report_rejected / assignment_new / kpi_review / standup_prompt / daily_digest"
    string title
    string body
    string channel "ws / in_app / digest"
    object payload "lien ket projectId / reportId / evaluationId"
    bool readFlag "dan xuat cua readAt phuc vu index"
    date readAt "null khi chua doc"
    string dedupeKey "chong spam theo B0 matrix"
    date createdAt
    date expiresAt "xoa notification cu (SUY DIEN)"
  }
  REFRESH_SESSIONS {
    ObjectId _id PK
    ObjectId userId "-> users"
    string familyId "rotated chain"
    string tokenHash "UNIQUE - chi luu hash"
    date expiresAt "TTL index"
    date revokedAt "null khi con hieu luc"
    string replacedBy "tokenHash cua RT ke tiep (SUY DIEN)"
    string userAgent
    string ipHash
    date createdAt
  }
  FEEDBACK_EVENTS {
    ObjectId _id PK
    string aiSuggestionId "goi trong ket qua find_candidates"
    ObjectId employeeId "-> employees duoc goi"
    string decision "accepted / rejected"
    string reason "mieu ta ly do (SUY DIEN)"
    ObjectId projectId "-> projects"
    number rank "vi tri trong danh sach gay ra quyet dinh"
    date createdAt
  }
```

---

## 3. Chi tiết từng collection

Ký hiệu schema: `field : type : ràng buộc`. `optional` = có thể thiếu/không; `?` cuối tên cũng nghĩa là
optional. Mọi `_id` là `ObjectId` do MongoDB sinh.

### 3.1 `users` — danh tính đăng nhập + quyền hệ thống

**Mục đích:** tách quyền hệ thống khỏi hồ sơ HR, đúng quyết định "RBAC không trộn 2 trục" `(B3)`.

```text
_id            : ObjectId             : PK
email          : string                : required, UNIQUE, đã normalize về chữ thường // SUY DIỄN — cần xác nhận
passwordHash   : string                : required; kết quả Argon2id (xem 07-auth-rbac.md) // SUY DIỄN — cần xác nhận (tên field)
role           : 'Admin' | 'Employee'  : required, enum đúng 2 giá trị (B3)
employeeId     : ObjectId?             : reference employees; null với tài khoản chưa gắn hồ sơ // SUY DIỄN — cần xác nhận
createdAt      : Date                  : required // SUY DIỄN — cần xác nhận
```

**Index:** `_id`; `email` UNIQUE `// SUY DIỄN — cần xác nhận`; `employeeId` `// SUY DIỄN — cần xác nhận`.

**Lý do thiết kế:** `role` nằm ở đây và **chỉ ở đây** — `B3` định nghĩa role là quyền hệ thống. Không có field
permission dạng mảng trong `users`: MVP có 2 role nên "không cần CASL" `(B3)`, suy ra không cần bảng
`roles`/`permissions` (`RP §4`: viết ADR/schema từ notes, không tự thêm abstraction).

### 3.2 `employees` — hồ sơ nhân sự, 5 cấp bậc, kỹ năng

```text
_id           : ObjectId              : PK
employeeCode  : string                : required, UNIQUE (B4)
fullName      : string                : required // SUY DIỄN — cần xác nhận
userId        : ObjectId?             : reference users; null nếu chưa cấp tài khoản // SUY DIỄN — cần xác nhận
departmentId  : ObjectId              : required, reference departments // SUY DIỄN — cần xác nhận
level         : 'Intern'|'Junior'|'Middle'|'Senior'|'Lead' : required, enum đúng 5 giá trị (B3)
skills        : string[]              : required (có thể rỗng); input của matching F4 (B4, B5)
phone         : string?               : field nhạy cảm — luồng UF-01 có bước "duyệt nếu field nhạy cảm" (B0) // SUY DIỄN — cần xác nhận
hiredAt       : Date?                 // SUY DIỄN — cần xác nhận
status        : 'active'|'inactive'   : soft-delete/logic-delete (RP §3 B4 yêu cầu "Audit/soft-delete") // SUY DIỄN — cần xác nhận
createdAt     : Date                  // SUY DIỄN — cần xác nhận
updatedAt     : Date                  // SUY DIỄN — cần xác nhận
```

**Index:** `employeeCode` UNIQUE `(B4)`; `departmentId` `// SUY DIỄN`; `userId` `// SUY DIỄN`; full-text trên
`skills` — `RP §3 B4` có hỏi "full-text search cho skills/policy" nhưng `B4` **không** chốt index này →
`// SUY DIỄN` + `[CẦN NGUỒN]` (biện luận ở §4.3).

**Lý do:** `skills[]` embed vì nó là thuộc tính đọc/ghi cùng hồ sơ và F4 cần lấy nhanh theo từng nhân viên;
không có collection `skills` trong `B4`. `level` embed dưới dạng enum vì là giá trị đóng. `employeeCode`
UNIQUE vì là định danh nghiệp vụ dùng để đối chiếu dữ liệu seed/import.

### 3.3 `departments` — phòng ban

```text
_id             : ObjectId : PK
code            : string   : required, UNIQUE  // SUY DIỄN — cần xác nhận
name            : string   : required          // SUY DIỄN — cần xác nhận
headEmployeeId  : ObjectId? : reference employees // SUY DIỄN — cần xác nhận
```

**Index:** `_id`; `code` UNIQUE `// SUY DIỄN`.

**Lý do:** `B7` khai báo room `department:<departmentId>` và `B4` có index `projects (departmentId, status,
dueDate)` → `departmentId` chắc chắn tồn tại như một khóa, dù không có collection nào khác mô tả nó. `code`
là giá trị đã dùng trong ví dụ của `B15` (`{"report":"department_kpi","departmentId":"DEV"}`), tức
`departmentId` trong thực tế có thể là **mã phòng ban** chứ không phải `ObjectId` → **mâu thuẫn nguồn ghi ở
§7**; schema trên để cả hai và chờ chốt.

### 3.4 `projects` — đề tài công việc (F2)

```text
_id             : ObjectId : PK
title           : string   : required // SUY DIỄN — cần xác nhận
description     : string?  : input phía "yêu cầu" của matching (RP §3 B5) // SUY DIỄN — cần xác nhận
departmentId    : ObjectId : required (có index (departmentId, status, dueDate)) // SUY DIỄN — cần xác nhận
assigneeIds     : ObjectId[] : required, mảng rỗng ở DRAFT (B4 index (assigneeIds, status))
requiredSkills  : string[] : optional; input matching, đổi tên nếu nhóm chốt cách khác // SUY DIỄN — cần xác nhận
status          : 'DRAFT'|'ASSIGNED'|'IN_PROGRESS'|'PENDING_REVIEW'|'COMPLETED'
                : required, enum — KHÔNG có 'OVERDUE' (B4) và KHÔNG có 'CANCELLED' (xem §7)
dueDate         : Date     : required; vế trái của vị từ overdue (B4)
progressPct     : number   : optional 0..100, đích đến của tool submit_progress // SUY DIỄN — cần xác nhận
version         : number   : required, khởi tạo 1, tăng mỗi lần ghi (B1)
statusHistory   : [{ from: string|null, to: string, actorId: ObjectId,
                    reason: string?, at: Date, source: 'rest'|'chatbot'|'scheduler' }]
                : required, embed, append-only (B1) // SUY DIỄN — cần xác nhận (tên field con)
createdBy       : ObjectId : required // SUY DIỄN — cần xác nhận
createdAt       : Date     : required // SUY DIỄN — cần xác nhận
updatedAt       : Date     : required (B1 nêu `project.updatedAt`)
```

**Index:** `(status, dueDate)`, `(assigneeIds, status)`, `(departmentId, status, dueDate)` — cả ba từ `B4`.

**Lý do:** `B1` chốt khuôn đúng cho F2:

```text
project.status
project.version
project.updatedAt
project.statusHistory[]
transition = atomic conditional update
```

đó là lý do `status` + `version` + `updatedAt` + `statusHistory[]` vừa là bắt buộc vừa là **embed**:
một transition = một update trên **một** document. `overdue` không có trong schema vì nó là dẫn xuất
`(B4)`; nếu sau này cần lọc nhanh, thêm field dẫn xuất có chỉ mục chứ **không** đổi thành state
// **SUY DIỄN — cần xác nhận**.

### 3.5 `project_events` — audit stream của vòng đời

**Mục đích:** "Audit/soft-delete/history (event log) — phục vụ theo dõi tiến độ" `(RP §3 B4)` + "audit every
mutation" `(B6)`.

```text
_id             : ObjectId : PK
projectId       : ObjectId : required // SUY DIỄN — cần xác nhận
type            : 'CREATED'|'ASSIGNED'|'STARTED'|'PROGRESS_UPDATED'|'REPORT_SUBMITTED'|'APPROVED'|'REJECTED'
                |'ACKNOWLEDGED'|'DECLINED'|'CHANGE_REQUESTED'
                : required // SUY DIỄN — cần xác nhận (bảng enum do docs đặt; `CANCELLED` **không** nằm trong enum — đã chốt ở Q-01; ba giá trị cuối thêm theo `19` §3 hàng `VC-01` và **chỉ** là loại event — xem mục "Mở rộng VC-01" dưới đây)
fromStatus      : string?  // SUY DIỄN — cần xác nhận
toStatus        : string?  // SUY DIỄN — cần xác nhận
actorId         : ObjectId : required; null với job hệ thống // SUY DIỄN — cần xác nhận
respondeeId     : ObjectId? : `employees._id` của người được giao mà phản hồi nói tới; chỉ dùng cho `ACKNOWLEDGED`/`DECLINED`/`CHANGE_REQUESTED` vì `actorId` là tài khoản đăng nhập còn phản hồi là hành vi trên `assigneeIds` // SUY DIỄN — cần xác nhận
reason          : string?  : REQUIRED khi type = REJECTED (transition T-05b ở docs 04); REQUIRED khi `DECLINED` hoặc `CHANGE_REQUESTED` (nhân viên phải nhận được lý do khi bị từ chối — `NOTES-02` §A5) // SUY DIỄN — cần xác nhận
source          : 'rest' | 'chatbot' | 'scheduler' // SUY DIỄN — cần xác nhận
tool            : string?  : tên tool nếu sinh ra từ Agent Loop (B6) // SUY DIỄN — cần xác nhận
clientMessageId : string?  : để audit một lần bấm nút đúng một sự kiện (B7) // SUY DIỄN — cần xác nhận
createdAt       : Date     : required // SUY DIỄN — cần xác nhận
```

**Index:** `(projectId, createdAt)` `// SUY DIỄN — cần xác nhận` (phục vụ "theo dõi tiến độ" đã nêu ở
`RP §3 B4`).

**Lý do:** collection này tồn tại trong baseline `B4` nhưng **không có field nào** được nguồn liệt kê → toàn
bộ field ở trên là phần docs phải đặt để phục vụ các hiệu ứng phụ đã chốt ở `04-domain-model.md` §4.3. Đây là
collection có nhiều `// SUY DIỄN` nhất; cần nhóm review trước khi code.

**Mở rộng VC-01 — phản hồi phân công (`19` §3, hàng `VC-01` = LÀM):** enum `type` nhận thêm ba giá trị
`ACKNOWLEDGED` (nhận việc), `DECLINED` (từ chối), `CHANGE_REQUESTED` (xin đổi). Đây là **dữ kiện append-only**
— "lúc T, anh X nói anh X nhận ca này" — **không phải** lifecycle state: `projects.status` vẫn **đúng 5 giá
trị** (`DRAFT|ASSIGNED|IN_PROGRESS|PENDING_REVIEW|COMPLETED`, `B4`) và **không** có state thứ 6 nào được thêm,
kể cả `OFFERED`/`ACCEPTED`. Không có collection mới: đây chính là "Option A — conservative" mà `NOTES-02` §I4
đề xuất và `19` §3 hàng "Đổi 11 collection baseline" chốt là **KHÔNG** đổi.

```text
ASSIGNED (event of the assignment itself)
   + ACKNOWLEDGED      → dữ kiện "người được giao đã nhận"
   + DECLINED          → dữ kiện "người được giao từ chối", bắt buộc reason
   + CHANGE_REQUESTED  → dữ kiện "xin đổi nội dung/thời hạn", bắt buộc reason
```

Ba hệ quả phải ghi rõ trước khi code:

1. **Trạng thái "đã xác nhận" là dẫn xuất**, đọc bằng `project_events (projectId, createdAt)` (I-12) — cùng
   khuôn dẫn xuất mà `B4` đã dùng cho `overdue`: state machine không đổi, chỉ có thêm dữ kiện để suy ra.
   Vì nhiều người có thể phản hồi trên **cùng một** đề tài (`assigneeIds` là mảng), một event chỉ kết luận
   được cho **một** `respondeeId` `// SUY DIỄN — cần xác nhận`.
2. **Một người chỉ phản hồi được phần của mình**: quyền và guard (kể cả "không tự duyệt yêu cầu do chính mình
   tạo") thuộc `07-auth-rbac.md` §7.4; `project_events` chỉ là nơi ghi kết quả.
3. **Không có `NO_RESPONSE`.** `NOTES-02` §E VC-01 đề xuất chuyển sang `NO_RESPONSE` sau một ngưỡng `TBD`;
   ngưỡng đó **không có nguồn** → **không** thêm loại event thứ tư cho "im lặng", và **không** tự coi im lặng
   là accept (`NOTES-02` tự để `TBD` cho ngưỡng này).

Các field `respondeeId` và ràng buộc `reason` ở trên là **docs đặt**, không có trong `NOTES-01` `// SUY DIỄN —
cần xác nhận`; `reason` bắt buộc với `DECLINED`/`CHANGE_REQUESTED` là cách đáp ứng yêu cầu "nhân viên nhận lý
do khi bị từ chối" của `NOTES-02` §A5, và cùng khuôn với `reports.reviewReason` (§3.6).

### 3.6 `reports` — báo cáo nghiệm thu (F7)

```text
_id          : ObjectId : PK
projectId    : ObjectId : required (B4 index (projectId, createdAt))
submitterId  : ObjectId : required, là employeeId // SUY DIỄN — cần xác nhận
content      : string   : required; tool ghi `submit_report` (B6) // SUY DIỄN — cần xác nhận
attachments  : string[]? : optional, URL file đính kèm // SUY DIỄN — cần xác nhận (chưa chắc có upload file)
status       : 'SUBMITTED'|'APPROVED'|'REJECTED' : required // SUY DIỄN — cần xác nhận
reviewReason : string?  : bắt buộc khi REJECTED // SUY DIỄN — cần xác nhận
reviewerId   : ObjectId? // SUY DIỄN — cần xác nhận
reviewedAt   : Date?     // SUY DIỄN — cần xác nhận
createdAt    : Date     : required (B4 index)
```

**Index:** `(projectId, createdAt)` `(B4)`.

**Lý do:** là reference chứ không embed vì **một đề tài có nhiều lần nộp** (reject → resubmit ở `B0`), và
vòng lặp lại đó không được xoá lịch sử (BR-04 ở `04-domain-model.md`). `status` của report tách khỏi `status`
của project: project chuyển `PENDING_REVIEW → IN_PROGRESS/COMPLETED`, còn report đi một chiều
`SUBMITTED → APPROVED/REJECTED` — hai vòng đời khác nhau, không dồn làm một enum
`// SUY DIỄN — cần xác nhận`.

### 3.7 `evaluations` — KPI một kỳ của một nhân viên (F5)

```text
_id                       : ObjectId : PK
employeeId                : ObjectId : required; (employeeId, period) UNIQUE (B4)
period                    : string   : required; granularity CHƯA chốt (Q-07 docs 04)
selfReview                : string?  : bước 1 (B0) // SUY DIỄN — cần xác nhận
managerReview             : string?  : bước 2 (B0) // SUY DIỄN — cần xác nhận
sentiment                 : string|number? : AI signal (B6) — chỉ là thành phần
themes                    : string[]?      : AI signal (B6)
riskSignals               : string[]?      : AI signal (B6)
suggestedScoreComponent   : number?        : AI signal (B6); bị BR-08 chặn trần
explanation               : string?        : AI signal (B6); phần breakdown cho người dùng
objectiveCompletionScore  : number?        : đầu vào tất định #1 của công thức (B6) // SUY DIỄN — cần xác nhận
machineScore              : number   : required khi tới bước 4; bất biến sau khi ghi (B6, BR-09 docs 04)
finalScore                : number   : required khi publish; mặc định = machineScore (B6)
overrideReason            : string?  : REQUIRED ⟺ finalScore ≠ machineScore (B6, RP §9 S13)
changedBy                 : ObjectId?: REQUIRED cùng overrideReason; là users._id (B6)
changedAt                 : Date?    : REQUIRED cùng overrideReason (B6)
status                    : 'DRAFT'|'REVIEWED'|'PUBLISHED' // SUY DIỄN — cần xác nhận
publishedAt               : Date?    // SUY DIỄN — cần xác nhận
createdAt / updatedAt     : Date     // SUY DIỄN — cần xác nhận
```

**Index:** `(employeeId, period)` **UNIQUE** `(B4)`; `(period)` và `(employeeId)` `// SUY DIỄN — cần xác nhận`
cho bài toán "so sánh KPI theo tháng" và đường dẫn trang `/employees/:id/kpi-history`.

**Lý do thiết kế:** năm field `machineScore | finalScore | overrideReason | changedBy | changedAt` là **bắt
buộc theo** `B6` — đó là cơ chế "final KPI" không do LLM sinh, đồng thời là dữ liệu để S12 (bias probe) và
S13 (override log bất biến) đo được. `selfReview`/`managerReview` embed thay vì collection riêng vì chu kỳ
`B0` coi chúng là hai bước của **cùng một bản đánh giá**, và UI cần hiển thị cả hai bên cạnh điểm.

`override_*` không tách sang collection riêng (append-only riêng) — nhưng lưu ý: nếu muốn "log bất biến" đúng
nghĩa thì `update` trên document này chỉ được phép ở các field chưa chốt; ràng buộc đó **không tồn tại trong
nguồn** `// SUY DIỄN — cần xác nhận`.

### 3.8 `policies` — tài liệu chính sách + chunk + embedding (F3)

```text
_id            : ObjectId : PK
title          : string   : required // SUY DIỄN — cần xác nhận
version        : string   : required; câu trả lời phải kèm document/version/source (B6)
source         : string   : required; nơi lấy tài liệu (B6)
category       : string?  : phục vụ lọc "quy định công ty" vs "quy trình nghiệp vụ" (B0) // SUY DIỄN — cần xác nhận
effectiveFrom  : Date?    // SUY DIỄN — cần xác nhận
updatedAt      : Date     // SUY DIỄN — cần xác nhận
chunks         : [{
                   text      : string  : required   // SUY DIỄN — cần xác nhận
                   order     : number  : required   thứ tự trong tài liệu // SUY DIỄN
                   embedding : number[] : required  vector cho Atlas Vector Search (B6)
                   model     : string  : required   tên model sinh vector // SUY DIỄN — cần xác nhận
                 }]
```

**Index:** **1 Atlas Vector Search index** trên `chunks.embedding` — `B1` chốt "1 Vector Search index dành cho
Policy RAG", `B6` nhắc lại trần 3 index của free tier; full-text/keyword cho `title`/`category`
`// SUY DIỄN — cần xác nhận`.

**Lý do:** chunking tiếng Việt + embedding là đường RAG đã chốt ở `B6` (không fine-tune LLM ở baseline).
Dimension của vector: `TBD` — phụ thuộc model embedding được chọn cho policy (xem `RP §3 B6`,
`NOTES-01 B5` chỉ cho dimension của `multilingual-e5-small` = 384 và MiniLM = 384, **không** nói model nào
dùng cho policy). Câu hỏi mở: nếu policy QA dùng cùng model với matching F4 thì **không** có vector index
cho F4 — vì `B1` quyết định F4 chạy cosine trong FastAPI, không qua Atlas.

### 3.9 `notifications` — thông báo bền (C5)

```text
_id        : ObjectId : PK
userId     : ObjectId : required; nhận theo room user:<userId> (B7)
type       : 'deadline_3d'|'deadline_1d'|'overdue'|'report_submitted'|'report_rejected'
           |'assignment_new'|'kpi_review'|'standup_prompt'|'daily_digest'
           : enum dựng từ 9 dòng matrix B0 // SUY DIỄN — cần xác nhận (tên)
title      : string   : required // SUY DIỄN — cần xác nhận
body       : string   : required // SUY DIỄN — cần xác nhận
channel    : 'ws'|'in_app'|'digest' : required, đúng cột "Kênh" của B0 // SUY DIỄN — cần xác nhận
payload    : object?  : projectId|reportId|evaluationId để client bấm tới đúng đối tượng // SUY DIỄN — cần xác nhận
readFlag   : boolean  : required, default false — field dẫn xuất từ readAt, phục vụ index/uniqueness // SUY DIỄN — cần xác nhận
readAt     : Date?    : null khi chưa đọc (B4 index (userId, readAt, createdAt))
dedupeKey  : string   : required; khoá chống trùng, vd `overdue:<projectId>:<YYYY-MM-DD>` // SUY DIỄN — cần xác nhận
createdAt  : Date     : required (B4 index)
expiresAt  : Date?    : dọn notification cũ // SUY DIỄN — cần xác nhận
```

**Index:** `(userId, readAt, createdAt)` `(B4)`; UNIQUE `(userId, dedupeKey)` `// SUY DIỄN — cần xác nhận`.

**Lý do:** `B7` chốt "durable notification vẫn phải persist phía app" → collection này là bằng chứng của cam
kết đó. `B0` matrix là **nguồn duy nhất** của danh sách sự kiện + kênh + tần suất chống spam; 9 dòng của nó
được mã hoá thành enum `type` + `channel` + `dedupeKey`. UNIQUE `(userId, dedupeKey)` là cách bảo đảm
"1 lần/ngày" ngay cả khi job `Agenda` chạy lại sau restart `(B15: job phải idempotent)`.

### 3.10 `refresh_sessions` — một vòng đời refresh token (B3)

```text
_id         : ObjectId : PK
userId      : ObjectId : required (B3)
familyId    : string   : required; chuỗi RT cùng gốc (B3)
tokenHash   : string   : required, UNIQUE; Mongo CHỈ lưu hash (B3)
expiresAt   : Date     : required; TTL index (B4)
revokedAt   : Date?    : null khi còn hiệu lực (B3)
replacedBy  : string?  : tokenHash của RT kế tiếp trong chain (B3)
userAgent   : string?  : (B3)
ipHash      : string?  : (B3)
createdAt   : Date     // SUY DIỄN — cần xác nhận
```

**Index:** `tokenHash` UNIQUE + `expiresAt` TTL `(B4)`; `(userId, familyId)` `// SUY DIỄN — cần xác nhận` cho
bước "revoke TOÀN BỘ family".

**Lý do:** sơ đồ `B3` định nghĩa hành vi, schema định nghĩa cách truy vấn để hành vi đó chạy được một cách
atomic:

```text
LOGIN → Access Token + Refresh Token
  → Refresh → invalidate RT-1 → issue RT-2
  → RT-1 xuất hiện lại?  no → tiếp tục
                         yes → revoke TOÀN BỘ family
```

`revokedAt` được ghi bằng **một conditional update** (`{_id, revokedAt: null}` → `$set revokedAt,
replacedBy`), tức chỉ request thắng mới đổi được trạng thái — hành vi đầy đủ ở `07-auth-rbac.md` §4; field
spec và các khoảng trống của `refresh_sessions` (thuật toán hash, TTL) ở `07-auth-rbac.md` §5.

### 3.11 `feedback_events` — vòng học từ quyết định thật (S4)

```text
_id             : ObjectId : PK
aiSuggestionId  : string   : required (RP §9 S4; B4 collection list)
employeeId      : ObjectId : required
decision        : 'accepted' | 'rejected' : required (RP §9 S4: "Đồng ý / Từ chối")
reason          : string?  : optional, free-text // SUY DIỄN — cần xác nhận
projectId       : ObjectId?: // SUY DIỄN — cần xác nhận
rank            : number?  : // SUY DIỄN — cần xác nhận
createdAt       : Date     : required // SUY DIỄN — cần xác nhận
```

**Index:** `(aiSuggestionId)`, `(employeeId, createdAt)` `// SUY DIỄN — cần xác nhận`.

**Lý do:** `RP §9 S4` yêu cầu "ghi `feedback_events` → hiệu chỉnh ngưỡng/reranker theo quyết định thật". Vấn
đề: `B4` không có collection nào chứa *bản thân gợi ý* để `aiSuggestionId` trỏ tới. Xử lý tạm thời (docs đề
xuất, chờ chốt): **copy snapshot** ngữ cảnh gợi ý vào event (`rank`, `projectId`, `score` `// SUY DIỄN`)
thay vì join sang một collection không tồn tại. Xem §7.

---

## 4. Index strategy

### 4.1 Bảng gộp (mọi index trong một chỗ)

| # | Collection | Index | Type | Nguồn | Query / cảnh báo dùng index này |
|---|---|---|---|---|---|
| I-01 | `employees` | `employeeCode` | **UNIQUE** | `B4` | import/seed đối chiếu nhân viên theo mã; chặn trùng khi `make demo` chạy lại |
| I-02 | `projects` | `(status, dueDate)` | compound | `B4` | "đề tài sắp hết hạn", job nhắc hạn 3 ngày/1 ngày, lọc theo trạng thái đang mở rồi đến hạn gần nhất |
| I-03 | `projects` | `(assigneeIds, status)` | compound (multikey trên `assigneeIds`) | `B4` | "xem đề tài của tôi", `list_projects`, tính workload của một người |
| I-04 | `projects` | `(departmentId, status, dueDate)` | compound | `B4` | `get_department_kpi`/dashboard phòng ban, template `department_kpi` của S10 (`B15`) |
| I-05 | `reports` | `(projectId, createdAt)` | compound | `B4` | "báo cáo của đề tài này, mới nhất trước" → chọn bản đang chờ duyệt |
| I-06 | `evaluations` | `(employeeId, period)` | **UNIQUE** | `B4` | BR-17: một người một kỳ đúng một bản; upsert khi mở kỳ |
| I-07 | `notifications` | `(userId, readAt, createdAt)` | compound | `B4` | chuông thông báo: chưa đọc của tôi, mới nhất; và đếm số chưa đọc |
| I-08 | `refresh_sessions` | `tokenHash` | **UNIQUE** | `B4`, `B3` | đường nóng nhất: mọi `/auth/refresh` tra RT bằng hash **đúng một lần** |
| I-09 | `refresh_sessions` | `expiresAt` | **TTL** | `B4`, `B3` | MongoDB tự xoá document khi đến hạn — không phải job của nhóm |
| I-10 | `policies` | Vector Search trên `chunks.embedding` | vector | `B1` ("1 Vector Search index dành cho Policy RAG"), `B6` | `search_policy` → top-K chunks |
| I-11 | `projects` | `_id` | default | mặc định của Mongo | mọi `findOneAndUpdate` ở §5 |
| I-12 | `project_events` | `(projectId, createdAt)` | compound | `// SUY DIỄN` | timeline tiến độ của một đề tài |
| I-13 | `users` | `email` | UNIQUE | `// SUY DIỄN` | login; không có index này thì login là collection scan |
| I-14 | `employees` | `userId` | thường/unique | `// SUY DIỄN` | `get_my_profile`: từ JWT sub → hồ sơ |
| I-15 | `employees` | `departmentId` | thường | `// SUY DIỄN` | gom nhân viên theo phòng cho `get_department_kpi` |
| I-16 | `evaluations` | `period` | thường | `// SUY DIỄN` | danh sách KPI cần review của một kỳ (notification "KPI cần review", `B0`) |
| I-17 | `notifications` | `(userId, dedupeKey)` | UNIQUE | `// SUY DIỄN` | cưỡng chế "1 lần/ngày" của `B0` + idempotency job `B15` |
| I-18 | `refresh_sessions` | `(userId, familyId)` | compound | `// SUY DIỄN` | "revoke TOÀN BỘ family" (`B3`) — update nhiều document cùng điều kiện |
| I-19 | `feedback_events` | `(aiSuggestionId)` | thường | `// SUY DIỄN` | truy "gợi ý này đã bị đồng ý/từ chối bao giờ chưa" |
| I-20 | `skills` (trên `employees`) / `policies.title` | full-text | text | `RP §3 B4` **đặt câu hỏi**, `NOTES-01 B4` **không chốt** | `// SUY DIỄN` + `[CẦN NGUỒN]` — xem 4.3 |

Con số **không có** trong các hàng trên (số index tối đa, trần storage, giới hạn connection) là số của
`NOTES-01 B1` và **toàn bộ URL của chúng đã mất khi paste** → không được chép vào báo cáo dưới dạng số liệu
kiểm chứng được `[CẦN NGUỒN]`.

### 4.2 Điều phối index với chi phí ghi

Free tier không cần tối ưu, nhưng **bài báo cáo** cần giải thích được tại sao không index bừa: mỗi index phụ
là một lần ghi thêm trên mỗi mutation. `B4` viết: *"Partial index giúp giảm dung lượng và index maintenance
cho tập con document."* Áp dụng hai chỗ có tập con rõ ràng:

| Candidate | Điều kiện partial | Đổi lại | Ghi chú |
|---|---|---|---|
| `refresh_sessions (userId, familyId)` **partial** `revokedAt: null` | chỉ phiên còn hiệu lực | tập nhỏ nhất, và cũng là tập duy nhất cần revoke | `// SUY DIỄN — cần xác nhận` (nguồn chỉ nói khái niệm partial index, không áp cụ thể) |
| `notifications` trên `readAt` **partial** `readAt: null` | chỉ thông báo chưa đọc | I-07 phình theo tổng số notification đã gửi, còn truy vấn "chưa đọc" thì không | cùng ghi chú |
| `projects (status, dueDate)` **partial** `status` ∈ 4 trạng thái đang mở | loại `COMPLETED` khỏi index | `COMPLETED` chiếm đa số document về lâu dài; query sắp hạn không bao giờ cần nó | cùng ghi chú |

**Không** dùng partial index cho `expiresAt`: TTL index phải phủ **mọi** document, vì document đã revoke vẫn
phải được dọn.

### 4.3 Full-text search: hai nhu cầu, không tự tiện mở

- **Policy:** đã có Vector Search (I-10). Một text index thứ hai trên `policies` chỉ để search tiêu đề →
  **chưa làm**, vì trần index free tier là ràng buộc thật `(B1)` `[CẦN NGUỒN]`.
- **Skills:** F4 không search text mà tính cosine trên embedding `(B5)`; `find_candidates` lọc theo kỹ năng
  bằng query regex/terms trên `skills[]` `// SUY DIỄN`. Nếu về sau cần fuzzy tiếng Việt cho `skills`, đó là
  quyết định riêng (text index hoặc chuyển sang Atlas Search) — **không** âm thầm thêm.

---

## 5. Tại sao không transaction

### 5.1 Quyết định nguồn

`NOTES-01 B1`, nguyên văn kết luận:

> *Transaction:* MongoDB đảm bảo atomic ở single document; multi-document transactions có trên replica set,
> nhưng MongoDB khuyên thiết kế schema để giảm nhu cầu distributed transaction.
> **Không thiết kế F2 dựa vào transaction nhiều collection.**

Khuôn mà `B1` chốt cho transition của F2:

```text
project.status / project.version / project.updatedAt / project.statusHistory[]
transition = atomic conditional update
```

Suy ra ba quyết định thiết kế đã hiện thực hoá ở §3:

1. `status`, `version`, `updatedAt` và **toàn bộ** `statusHistory[]` nằm trong **cùng một document** → đổi
   trạng thái + lưu lịch sử là **một** operation atomic.
2. Audit chi tiết (`project_events`) và báo cáo (`reports`) **không** nằm trong document → chúng là *hiệu ứng
   phụ best-effort sau khi update thành công*, không phải phần thứ hai của một transaction.
3. `refresh_sessions`: invalidate RT cũ + tạo RT mới cũng là **hai** document → dùng cùng khuôn: update có
   điều kiện trước, insert sau (xem `07-auth-rbac.md` §4).

### 5.2 Pseudocode transition (đúng khuôn phải dùng)

```js
// expectedStatus/expectedVersion lấy từ document mà client đã đọc
const updated = await db.collection('projects').findOneAndUpdate(
  { _id: projectId, status: expectedStatus, version: expectedVersion },   // ← điều kiện
  {
    $set:   { status: nextStatus, updatedAt: new Date() },
    $inc:   { version: 1 },
    $push:  {
      statusHistory: {
        from: expectedStatus, to: nextStatus,
        actorId, reason, at: new Date(), source
      }
    }
  },
  { new: true, returnDocument: 'after' }
);

if (!updated) {
  // điều kiện không khớp → document đã bị người khác đổi giữa lúc đọc và lúc ghi
  const current = await db.collection('projects').findOne({ _id: projectId });
  throw new ConflictError({ expectedStatus, expectedVersion, actual: current });  // HTTP 409
}
// CHỈ sau bước này mới phát hiệu ứng phụ:
await insertProjectEvent(updated);            // audit, append-only
await emit('project:updated', updated);       // WS, room user:<id> / department:<id>
await createNotifications(...);               // dedupeKey chống trùng
```

`updated` là document **sau khi ghi**, nên payload WS và audit luôn phản ánh đúng trạng thái đã cam kết —
không có cửa "gửi event rồi phát hiện update thất bại".

*(Nếu đổi cả `dueDate`/`assigneeIds` trong cùng một lần ghi, đưa hết vào `$set`; `$inc` luôn là operator
riêng, không nằm trong `$set`.)*

### 5.3 Xử lý xung đột

| Tình huống | Hành vi | Vì sao |
|---|---|---|
| Hai Admin cùng sửa một đề tài, một người thắng | Người thua nhận **409 + document hiện tại**, client reload và bấm lại | Giữ "đọc rồi ghi" trung thực; gộp tự động sẽ tạo trạng thái chưa ai duyệt |
| Cùng hai người bấm "approve" | Chỉ một transition `PENDING_REVIEW → COMPLETED` có hiệu lực; người kia 409 | `status: expected` là điều kiện → idempotent tự nhiên |
| Chatbot retry `submit_progress` sau reconnect | `clientMessageId` `(B7)` đã có trong event → bỏ qua lần trùng | chống duplicate là yêu cầu tường minh của `B7` |
| Audit insert / WS emit fail **sau khi** update thành công | Không rollback trạng thái; ghi log lỗi + job bù audit `// SUY DIỄN — cần xác nhận` | Không transaction → không có "all-or-nothing"; docs phải nói rõ để hội đồng không hỏi |
| Cần đổi 2 collection atomic (vd approve report + completed project) | Thiết kế lại để **một** operation chạm **một** document: `reports.status` update riêng, `projects` là nguồn chân lý duy nhất cho trạng thái duyệt `// SUY DIỄN — cần xác nhận` | đúng khuyến nghị "giảm nhu cầu distributed transaction" `(B1)` |

Điều phải nói thẳng trong báo cáo: đây là **khoá lạc quan (optimistic locking) bằng `version`**, không phải
"isolation". `version` không bảo vệ phần bất biến; nó bảo vệ *một* điều kiện ghi.

---

## 6. Migration & seed policy

### 6.1 Migration (schema thay đổi theo thời gian)

MongoDB không có schema version trong database → quản lý ở tầng ứng dụng:

1. **Không** dựng migration framework ở baseline `// SUY DIỄN — cần xác nhận` — `RP §14` chỉ định "tôi viết
   được ngay: ERD / JSON Schema", không có công cụ migration; thêm tool là mở scope không được yêu cầu.
2. Mỗi document có thể mang `schemaVersion: number` khi thật sự cần đọc-tương-thích-backward
   `// SUY DIỄN — cần xác nhận`. **Không** đặt field này cho cả 11 collection ngay từ đầu.
3. Validate lúc ghi bằng **Zod** ở service layer, không bằng JSON Schema của Mongo: pipeline contract đã chốt
   ở `B2` là `Zod schema → OpenAPI → Orval → typed React client`, và agent loop đã yêu cầu "Zod validate
   every argument" `(B6)`. Ràng buộc enum (`status`, `role`, `level`) vì vậy được thi hành **một lần ở service
   và một lần ở DB enum**, không thêm lớp thứ ba.
4. Thứ tự áp dụng thay đổi schema: **thêm field optional → deploy code đọc được cả hai → migrate backfill →
   bỏ field cũ**. Không destructive change trước tuần 11 (đóng băng tính năng, `RP §12` luật 5).

### 6.2 Seed / `make demo` (S14)

Yêu cầu đã chốt ở `RP §9 S14` và `RP §11`:

```text
make demo  = seed dữ liệu giả lập tiếng Việt có KHOÁ CỐ ĐỊNH + dựng DB + chạy eval in bảng số
gate CI    = "seed hash check": make demo phải dựng ra đúng bộ dữ liệu đã công bố trong báo cáo
```

Ràng buộc thiết kế rút ra từ đó, **không cam kết số liệu**:

| Yêu cầu | Cách đáp ứng | Ràng buộc nguồn |
|---|---|---|
| Khoá sinh ngẫu nhiên cố định | seed script nhận một `SEED_KEY` **cố định trong repo**, mọi phân bố (ai vào phòng nào, ai có kỹ năng gì, đề tài hạn nào) derive từ khoá đó; đổi khoá ⇒ ra dataset khác | `RP §9 S14` ("có khoá cố định"); **giá trị khoá: TBD** |
| Không hard-code id | dùng ObjectId sinh từ chuỗi deterministic theo khoá, hoặc map `employeeCode` → `_id` `// SUY DIỄN — cần xác nhận` | — |
| Số lượng bản ghi | **không nêu con số trong docs thiết kế**; khối lượng cụ thể là nội dung của S14 và phải khớp số liệu trong báo cáo + kết quả `seed hash check` ở CI | `RP §9 S14` có nhắc các số minh hoạ trong ngoặc, `RP §11` ràng buộc "phải tái lập đúng" |
| Data tiếng Việt thật về mặt ngôn ngữ | `fullName`, `title`, `description`, `selfReview`, `managerReview`, `policies` bằng tiếng Việt, vì PhoBERT yêu cầu đầu vào tiếng Việt đã word-segmented `(B5)` và toàn bộ UX là tiếng Việt | `B5` |
| Dữ liệu giả lập, không phải dữ liệu nhân sự thật | seed **không** chứa lương, CCCD, địa chỉ, số điện thoại thật; `phone` trong seed là số giả | `RP §7` câu 10 (dữ liệu thật hay giả lập — **chưa trả lời**), `RP §13 S5` (datasheet), `RP §3 B1` không bàn PII |
| Reset được | `make demo` xoá DB đích rồi seed lại; cấm chạy trên Atlas production `// SUY DIỄN — cần xác nhận` | — |
| Eval chạy được ngay | seed kèm bộ `(employee skills, project requirements)` có câu trả lời đúng đã gán nhãn để `09-ai-evaluation.md` tính P@K/MRR/F1 `[CẦN NGUỒN]`: protocol eval chưa chốt (blocking question `RP §7` câu 2) | `RP §3 B5`, `RP §11` |
| `mongodb-memory-server` | test integration dùng MongoDB thật trong process, **không** dùng seed production; có thể dựng replica set `(B10)` → chính môi trường này sẽ trả lời "transaction có trên M0 không" `[CẦN NGUỒN]` | `B10` |
| `refresh_sessions` | seed **không** tạo refresh session; token là sản phẩm của login runtime `// SUY DIỄN` | `B3` |

Kiểm tra bắt buộc sau seed (danh sách này là *điều kiện đủ để demo chạy*, không phải số liệu):

```text
mỗi employee đúng 1 level trong 5 giá trị và ≥ 1 skill
mỗi project đúng 1 status trong enum; dueDate trải cả quá hạn lẫn sắp tới hạn
   → demo được cả 3 dòng reminder của B0 matrix (3 ngày / 1 ngày / quá hạn)
có ≥ 1 project ở mỗi trạng thái, ≥ 1 project đã reject, ≥ 1 evaluation đã publish
```

---

## 7. Mâu thuẫn và khoảng trống của nguồn (về data model)

Không tự sửa hộ nguồn; ghi lại kèm phương án tạm:

| # | Phát hiện | Nguồn xung đột | Tạm xử lý | Cần ai chốt |
|---|---|---|---|---|
| D-01 | `B3` mô tả 9 field của `refresh_sessions` nhưng **không** nói `replacedBy` trỏ tới cái gì (`_id` của session kế tiếp hay `tokenHash` của nó), và không nêu thuật toán hash dùng cho `tokenHash`/`ipHash` | `B3` vs `B4` | docs chọn `replacedBy` = `tokenHash` của RT kế tiếp `// SUY DIỄN — cần xác nhận`; thuật toán hash để trống, xem `07-auth-rbac.md` §5 | nhóm |
| D-02 | `departmentId` kiểu gì: `B15` cho ví dụ `departmentId: "DEV"` (mã chuỗi), còn `B7` room `department:<departmentId>` và `B4` index không nói kiểu | `B4` vs `B15` | schema để `ObjectId` + `departments.code`; service chấp nhận tra theo `code` rồi resolve `// SUY DIỄN` | nhóm |
| D-03 | ~~`CANCELLED` có trong công thức overdue nhưng không có trong sơ đồ state machine~~ → **đã chốt: không có `CANCELLED`**. Sơ đồ `B4` có đúng 5 state; mọi công thức overdue trong bộ docs đã bỏ vế này. Hệ quả: nghiệp vụ "hủy đề tài" **không tồn tại ở MVP**, đã thành mục park chờ GVHD. | `B4` | enum `projects.status` = 5 giá trị; overdue = `dueDate < now AND status ≠ COMPLETED` | GVHD nếu muốn mở lại |
| D-04 | `feedback_events.aiSuggestionId` không có collection nào để tham chiếu | `B4` (11 collection) vs `RP §9 S4` | snapshot thuộc tính gợi ý vào event `// SUY DIỄN` | nhóm |
| D-05 | `B4` nói index cho *tập con document* bằng partial index nhưng không chỉ định collection nào; `RP §3 B4` lại hỏi "full-text search cho skills/policy" và `NOTES-01 B4` **không** trả lời | `B4` vs `RP §3 B4` | §4.2 nêu 3 candidate partial; §4.3 hoãn full-text, có lý do | nhóm |
| D-06 | `period` của `evaluations` không có granularity → không viết được quy tắc sinh seed hay job mở kỳ | `B4` (chỉ `(employeeId, period) UNIQUE`) | để `string`, format `TBD` | nhóm (Q-07 docs 04) |
| D-07 | Không có collection cho **kỹ năng** → `skills[]` là free-text, dễ lệch chính tả ("React" vs "reactjs") làm giảm chất lượng cosine. `RP §3 B4` có nêu "employee ↔ department ↔ **level** ↔ skills" như một câu hỏi embed/reference, `NOTES-01 B4` trả lời bằng cách **không** tạo collection `levels`/`skills` | `RP §3 B4` vs `B4` | giữ `skills: string[]`; chuẩn hoá bằng whitelist khi seed `// SUY DIỄN` | nhóm |
| D-08 | `B4` liệt kê 11 collection nhưng không có nơi nào chứa **message hội thoại** của chatbot, dù `B7` yêu cầu "durable notification vẫn phải persist phía app" (đã có `notifications`) và `RP §3 B7` hỏi "có persist message vào Mongo không" → **câu hỏi này `NOTES-01` không trả lời** | `B7` vs `RP §3 B7` | MVP **không** lưu lịch sử chat (không có collection) → ghi vào `06-api-spec.md` như một giới hạn | nhóm + GVHD |
| D-09 | `NOTES-02` §E VC-01/VF-01/VS-01 đề xuất một **chuỗi state riêng cho phân công** (`OFFERED → ACCEPTED/DECLINED/CHANGE_REQUESTED`, `… → AWAITING_MANAGER_APPROVAL`, `NO_RESPONSE`) — tức là state machine **thứ hai** song song với `projects` | `NOTES-02` vs `B4` (5 state) và `19` §3 | **Quyết định: KHÔNG** chuyển các giá trị đó vào `projects.status`. Lý do: (i) vi phạm đúng điều `B4` đã cấm khi bỏ `OVERDUE` — trộn *lifecycle state* với *tình trạng phản hồi*; (ii) `assigneeIds` là mảng nên phản hồi là dữ kiện **per-person**, không phải trạng thái **per-project**; (iii) `19` §3 chốt VC-01 làm theo "Option A — conservative": **không** thêm collection, **không** đổi enum. Thay vào đó: ba **event type** mới trong `project_events` (§3.5), suy ra trạng thái khi đọc | GVHD nếu muốn mở state machine riêng |

---

## 8. Việc tiếp theo từ file này

1. Chốt D-02, D-03, D-06 (trước khi code F2/F5).
2. Viết `06-api-spec.md`: mỗi collection ở §3 cần DTO Zod tương ứng; mỗi row §4.1 cần một endpoint hoặc job
   chứng minh nó được dùng.
3. Viết `08-algorithms.md`: định nghĩa `objectiveCompletionScore` và hàm `F` của `machineScore` (docs 04
   §6.3), để `evaluations` không phải chứa điểm do LLM tự nghĩ ra.
4. Bổ sung `[CẦN NGUỒN]` cho mọi con số hạ tầng ở §4.1 trước khi chép số liệu đó vào báo cáo.

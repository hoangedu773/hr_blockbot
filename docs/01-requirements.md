# 01 — Yêu cầu (Requirements)

Khóa luận KLCN133 — *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*. File này liệt kê **yêu cầu chức năng
(FR)** theo bảy chức năng F1..F7 của đề cương, **yêu cầu phi chức năng (NFR)**, **ràng buộc đề cương** và
**out of scope**, kèm bảng traceability về rubric.

## 0. Nguồn và ký hiệu

Nguồn sự thật duy nhất của mọi con số/tên trong file này:

| Viết tắt | Tài liệu |
|---|---|
| `NOTES-01 §Bn` | `docs/research/NOTES-01.md` — kết quả research vòng 1 (B0..B15) |
| `RP §n` | `docs/research/RESEARCH-PLAN.md` — §1 ràng buộc đề cương + rubric, §11 fitness functions, §12 luật phạm vi |
| `UF-xx` | `docs/18-user-flows.md` — 10 user flow, catalog 28 intent, notification matrix |
| `04 §n` | `docs/04-domain-model.md` — state machine F2, quy tắc nghiệp vụ BR-01..BR-20 |
| `05 §n` | `docs/05-data-model.md` — 11 collection, field, index I-01..I-20 |
| `07 §n` | `docs/07-auth-rbac.md` — permission matrix, tool read/write |
| `00 §n` | `docs/00-vision-scope.md` — phạm vi 3 tầng, Definition of Done |
| `11 §n` | `docs/11-quality-testing.md` — checklist luồng bắt buộc có test theo F1..F7 |
| `PARK-nn` | `docs/backlog-parked.md` — mục bị dời khỏi phạm vi |

Ký hiệu: `TBD` = nguồn không đưa con số → **không đoán** · `[CẦN NGUỒN]` = cần URL/văn bản GVHD trước khi
chép vào báo cáo (URL của các con số ở `NOTES-01 §B1`/`§B5` bị mất khi paste — xem `NOTES-01` mục "CẦN BỔ SUNG")
· `SUY DIỄN` = yêu cầu do tài liệu này đặt ra để hệ thống chạy được, nguồn nghiên cứu không nêu.

**Quy ước đánh số FR:** F1 → `FR-001..005` · F2 → `FR-006..014` · F3 → `FR-015..022` · F4 → `FR-023..027` ·
F5 → `FR-028..035` · F6 → `FR-036..039` · F7 → `FR-040..044` · yêu cầu nền (đề cương bắt buộc nhưng không
thuộc F nào) → `FR-050..056` · mục nhóm bổ sung (S-series) → `FR-060..068`.

**Trạng thái:** `Must` = đúng đề cương, không được bỏ · `Should` = nhóm làm, effort nhỏ, không cần duyệt
riêng (`00 §4`) · `stretch — chờ GVHD` = mục bổ sung phải qua `RP §7.8` trước khi thành cam kết nghiệm thu
(`RP §12` luật 4) · `PARKED — chờ GVHD` = **không** phải yêu cầu, chỉ được ghi ở §7.

**CLO:** đề cương và `NOTES-01` không định nghĩa danh mục CLO của học phần → cột CLO để `TBD`. Thang chiếu
hiện có duy nhất là rubric 10 điểm ở `RP §1`, và nó được dùng làm cột quy chiếu.

---

## 1. Bảy chức năng của đề cương (`RP §1`)

| F | Chức năng (nguyên văn đầu bài) | User flow | FR |
|---|---|---|---|
| F1 | Hồ sơ nhân sự, phòng ban, chuẩn hóa 5 cấp bậc | UF-01 | FR-001..005 |
| F2 | Danh mục & vòng đời đề tài (Khởi tạo → Đã giao → Đang thực hiện → Chờ duyệt → Hoàn thành) | UF-05 | FR-006..014 |
| F3 | Chatbot nhận diện ý định, tra cứu KPI & chính sách | UF-10 (+ UF-01/04/05/06 phần đọc) | FR-015..022 |
| F4 | Thuật toán gợi ý phân công theo ngữ nghĩa PhoBERT | UF-04 | FR-023..027 |
| F5 | Phân tích ngữ nghĩa nhận xét của quản lý → hỗ trợ lượng hóa KPI | UF-06 | FR-028..035 |
| F6 | Dashboard trực quan biến động KPI, danh mục đề tài & nhân sự | đích đến của UF-04/05/06/09 | FR-036..039 |
| F7 | Tiếp nhận báo cáo nghiệm thu qua chatbot + nhắc hạn tự động | UF-09 (+ UF-05 bước nộp/duyệt) | FR-040..044 |

F6 không phải một flow riêng — nó là màn hình đích ở bước cuối của UF-04/UF-05/UF-06/UF-09 (`18-user-flows.md`,
mục "Flow inventory").

---

## 2. Bảng traceability FR → F → UF → rubric → trạng thái

Cột "Rubric (`RP §1`)" là hạng mục điểm mà FR này là bằng chứng. Thang 10 điểm: khảo sát 0.75 · phân tích
(use-case & sơ đồ lớp phân tích) 0.75 · thiết kế lớp + dữ liệu 0.5 · thiết kế giao diện 0.5 · **cài đặt 7
chức năng 3.5** · kiểm thử & triển khai 0.75 · nội dung báo cáo 0.5 · định dạng báo cáo 0.5 · thái độ 0.5 ·
phong cách slide 0.5 · NCKH +1.0/+0.5.

| FR | F | UF | Rubric được phục vụ | CLO | Trạng thái |
|---|---|---|---|---|---|
| FR-001 | F1 | UF-01 | cài đặt 3.5 · khảo sát 0.75 | TBD | Must |
| FR-002 | F1 | UF-01 | cài đặt 3.5 · phân tích 0.75 | TBD | Must |
| FR-003 | F1 | UF-01 | cài đặt 3.5 · thiết kế lớp+dữ liệu 0.5 | TBD | Must |
| FR-004 | F1 | UF-01 | cài đặt 3.5 · phân tích 0.75 | TBD | Must |
| FR-005 | F1 | UF-01 | cài đặt 3.5 · thiết kế lớp+dữ liệu 0.5 | TBD | Must |
| FR-006 | F2 | UF-05 | cài đặt 3.5 · thiết kế lớp+dữ liệu 0.5 | TBD | Must |
| FR-007 | F2 | UF-04, UF-05 | cài đặt 3.5 · phân tích 0.75 | TBD | Must |
| FR-008 | F2 | UF-05 | cài đặt 3.5 | TBD | Must |
| FR-009 | F2 | UF-05 | cài đặt 3.5 · kiểm thử 0.75 | TBD | Must |
| FR-010 | F2 | UF-05 | cài đặt 3.5 | TBD | Must |
| FR-011 | F2 | UF-05 | cài đặt 3.5 · khảo sát 0.75 | TBD | Must |
| FR-012 | F2 | UF-05 | thiết kế lớp+dữ liệu 0.5 · kiểm thử 0.75 | TBD | Must |
| FR-013 | F2 | UF-05, UF-09 | thiết kế lớp+dữ liệu 0.5 | TBD | Must |
| FR-014 | F2 | UF-05 | thiết kế lớp+dữ liệu 0.5 | TBD | Must |
| FR-015 | F3 | UF-10 (28 intent) | cài đặt 3.5 · phân tích 0.75 | TBD | Must |
| FR-016 | F3 | UF-06 | cài đặt 3.5 | TBD | Must |
| FR-017 | F3 | UF-10 | cài đặt 3.5 · khảo sát 0.75 | TBD | Must |
| FR-018 | F3 | UF-10 | cài đặt 3.5 · NCKH +1.0/+0.5 | TBD | Must |
| FR-019 | F3 | mọi UF có chatbot | kiểm thử 0.75 · thiết kế lớp 0.5 | TBD | Must |
| FR-020 | F3 | UF-04/05/06 | cài đặt 3.5 | TBD | Must |
| FR-021 | F3 | UF-10 | cài đặt 3.5 · kiểm thử 0.75 | TBD | Must |
| FR-022 | F3 | UF-01, UF-06 | nội dung báo cáo 0.5 | TBD | Must |
| FR-023 | F4 | UF-04 | cài đặt 3.5 · NCKH +1.0/+0.5 | TBD | Must |
| FR-024 | F4 | UF-04 | cài đặt 3.5 · NCKH | TBD | Should (S2, cần `RP §7.8`) |
| FR-025 | F4 | UF-04 | cài đặt 3.5 · giao diện 0.5 · NCKH | TBD | Should (S1, cần `RP §7.8`) |
| FR-026 | F4 | UF-04 | cài đặt 3.5 · phân tích 0.75 | TBD | Must |
| FR-027 | F4 | UF-04 | nội dung báo cáo 0.5 · NCKH | TBD | Must |
| FR-028 | F5 | UF-06 | cài đặt 3.5 · thiết kế dữ liệu 0.5 | TBD | Must |
| FR-029 | F5 | UF-06 | cài đặt 3.5 · khảo sát 0.75 | TBD | Must |
| FR-030 | F5 | UF-06 | cài đặt 3.5 · NCKH | TBD | Must |
| FR-031 | F5 | UF-06 | cài đặt 3.5 · thiết kế lớp 0.5 | TBD | Must |
| FR-032 | F5 | UF-06 | cài đặt 3.5 · NCKH | TBD | Should (S13) |
| FR-033 | F5 | UF-06 | cài đặt 3.5 · kiểm thử 0.75 | TBD | Should (S13) |
| FR-034 | F5 | UF-06 | cài đặt 3.5 · giao diện 0.5 | TBD | Must |
| FR-035 | F5 | UF-06 | thiết kế dữ liệu 0.5 | TBD | Must |
| FR-036 | F6 | UF-06, UF-09 | giao diện 0.5 · cài đặt 3.5 | TBD | Must |
| FR-037 | F6 | UF-04, UF-05 | cài đặt 3.5 · giao diện 0.5 | TBD | Must |
| FR-038 | F6 | UF-09 | cài đặt 3.5 · kiểm thử 0.75 | TBD | Must |
| FR-039 | F6 | mọi UF | giao diện 0.5 · định dạng 0.5 | TBD | Must |
| FR-040 | F7 | UF-05 | cài đặt 3.5 · phân tích 0.75 | TBD | Must |
| FR-041 | F7 | UF-09 | cài đặt 3.5 · kiểm thử 0.75 | TBD | Must |
| FR-042 | F7 | UF-09 | cài đặt 3.5 · thiết kế dữ liệu 0.5 | TBD | Must |
| FR-043 | F7 | UF-09 | cài đặt 3.5 · NCKH | TBD | Should (S6, cần `RP §7.8`) |
| FR-044 | F7 | UF-09 | kiểm thử 0.75 | TBD | Must |
| FR-050 | nền (Auth) | mọi UF | cài đặt 3.5 (điều kiện cần) · kiểm thử 0.75 | TBD | Must |
| FR-051 | nền (Auth) | mọi UF | cài đặt 3.5 · thiết kế dữ liệu 0.5 | TBD | Must |
| FR-052 | nền (RBAC) | mọi UF | cài đặt 3.5 · thiết kế lớp 0.5 | TBD | Must |
| FR-053 | nền (Realtime) | UF-01..UF-10 | cài đặt 3.5 · kiểm thử 0.75 | TBD | Must |
| FR-054 | nền (Realtime) | UF-09, UF-10 | thiết kế lớp 0.5 · kiểm thử 0.75 | TBD | Must |
| FR-055 | nền (Kiến trúc) | — | thiết kế lớp 0.5 · định dạng 0.5 | TBD | Must |
| FR-056 | nền (Triển khai) | — | kiểm thử & triển khai 0.75 | TBD | Must |
| FR-060 | mọi F có số đo | UF-04/05/06 | nội dung báo cáo 0.5 · NCKH | TBD | stretch — chờ GVHD (S14) |
| FR-061 | F4 | UF-04 | NCKH +1.0/+0.5 · nội dung báo cáo 0.5 | TBD | stretch — chờ GVHD (S3) |
| FR-062 | F4 | UF-04 | NCKH · nội dung báo cáo 0.5 | TBD | stretch — chờ GVHD (S2) |
| FR-063 | F4 | UF-04 | NCKH · giao diện 0.5 | TBD | stretch — chờ GVHD (S1) |
| FR-064 | F7 | UF-09 | NCKH · cài đặt 3.5 | TBD | stretch — chờ GVHD (S6) |
| FR-065 | F3, F4 | UF-10, UF-04 | nội dung báo cáo 0.5 | TBD | Should (S5) |
| FR-066 | F3 | UF-04/05/06 | kiểm thử 0.75 | TBD | Should (S8) |
| FR-067 | F6 | UF-05, UF-04 | giao diện 0.5 | TBD | Should (S11) |
| FR-068 | F5 | UF-06 | NCKH · kiểm thử 0.75 | TBD | Should (S12, S13) |

`RP §12` luật 2: mục S nào không ánh xạ về một UF thật **hoặc** không đo được bằng số thì không nằm ở đây mà
ở `backlog-parked.md`. Vì vậy **S4, S7, S10 không có FR** — xem §7.

---

## 3. Yêu cầu chức năng — dạng kiểm chứng được

Mỗi FR gồm: mô tả · precondition · luồng chính · ngoại lệ · tiêu chí chấp nhận (`Given/When/Then`) · phép đo.
Cột "Đo bằng" chiếu vào `11 §5` (checklist luồng bắt buộc có test), `11 §4.2` (case guard của Agent Loop),
`11 §3` (coverage), `11 §6` (hiệu năng). Công cụ theo `NOTES-01 §B10`: `Vitest` · `Supertest` ·
`mongodb-memory-server` · `Playwright` · `pytest` · `Lighthouse CI`.

### 3.1 F1 — Hồ sơ nhân sự, phòng ban, 5 cấp bậc (UF-01)

Luồng nghiệp vụ nguồn: `xem → sửa → validate → gửi → duyệt nếu field nhạy cảm → cập nhật`, ngoại lệ
`bị từ chối → sửa/gửi lại` (`NOTES-01 §B0`).

| FR | Mô tả | Precondition | Luồng chính | Ngoại lệ | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|---|
| FR-001 | Hệ thống cho `Employee` xem hồ sơ của chính mình (họ tên, phòng ban, `level`, `skills`, ngày vào làm) trên dashboard và qua chatbot bằng tool `get_my_profile` (read) | phiên JWT hợp lệ (`07 §2`); `users.employeeId` nối tới `employees` | `[CHAT]` intent #1 → `get_my_profile` → trả bản ghi own; hoặc `[UI]` tab Hồ sơ | tool read fail → `chat:error`, dữ liệu vẫn đọc lại được qua REST | Given `Employee` đã đăng nhập, When hỏi "xem hồ sơ của tôi", Then trả đúng hồ sơ của **mình** và không có tool call nào ghi dữ liệu | `11 §5` dòng F1; `11 §4.2` "tool đọc không mutate" |
| FR-002 | `Employee` sửa nhóm field **không nhạy cảm** của hồ sơ; mọi input bị chặn bằng Zod schema ở biên vào | FR-001 | `[UI]` bấm Sửa → đổi giá trị → gửi → `[SYS]` Zod validate → ghi `employees` | validate fail → giữ form + báo field nào sai; **chatbot không có tool write cho việc này** (`18` intent #2 `— chưa có tool`) → mọi sửa hồ sơ chỉ qua dashboard | Given giá trị không hợp lệ, When gửi, Then **không** có bản ghi nào thay đổi và API trả `VALIDATION_FAILED` | `11 §5` dòng F1 (Supertest) |
| FR-003 | Thay đổi **field nhạy cảm** (`level`, `hiredAt`, chức danh) không ghi thẳng vào `employees` mà vào trạng thái *chờ duyệt* | FR-002; danh mục field nhạy cảm do `05 §3.2` giới hạn → phần còn lại `TBD` | `[UI]` gửi → `[SYS]` phân loại field → bản ghi chờ duyệt → `notification:new` tới room `user:<Admin>` | field nằm ngoài schema (VD lương) → **từ chối**, vì lương ngoài phạm vi (`04 §8`) và không có collection nào chứa nó (`05 §1.1`) | Given sửa `level`, When gửi, Then `employees.level` **không đổi** cho tới khi Admin duyệt | `11 §5` dòng F1; `11 §4.2` "audit mỗi mutation" |
| FR-004 | `Admin` duyệt hoặc từ chối kèm lý do; từ chối → `Employee` sửa và gửi lại (vòng `request → approval → reject/request-change → resubmit → notification`) | tồn tại bản ghi chờ duyệt | `[UI]` mở hàng đợi → so giá trị cũ/mới → duyệt ⇒ cập nhật `employees`; từ chối ⇒ giữ giá trị cũ + `notification:new` kèm lý do | bản ghi chờ duyệt bị bỏ quên → nhắc lại **không** quá 1 lần/ngày theo `BR-12`; nhân viên **không** tự duyệt hồ sơ của mình (`07 §7.3`) | Given bị từ chối kèm lý do, When Employee sửa và gửi lại, Then luồng quay lại bước validate và lịch sử cũ vẫn còn | `11 §5` dòng F1 (Unit + tích hợp API) |
| FR-005 | `Admin` quản lý phòng ban và hồ sơ: tạo/sửa nhân viên, gán `departmentId`, `level` trong đúng 5 giá trị `Intern \| Junior \| Middle \| Senior \| Lead`, duy trì `skills[]`; `employeeCode` là UNIQUE | quyền `Admin` | `[UI]` CRUD `employees`/`departments` → Zod + DB enum → ghi | trùng `employeeCode` → `VALIDATION_FAILED` (UNIQUE `05 §4.1` I-01); cố dùng `level` để mở quyền → **không có đường nào**, `level` không xuất hiện trong claim (`07 §2`) | Given một `level` bất kỳ, When gọi bất kỳ tool nào, Then kết quả phân quyền **giống hệt** `Intern` và `Lead` | `11 §5` dòng F1; `11 §4.2` "RBAC check mỗi tool" |

### 3.2 F2 — Vòng đời đề tài (UF-05)

Machine trạng thái và bảng transition lấy từ `04 §4` (`T-01..T-06`). Enum `projects.status` **đúng năm giá
trị**: `DRAFT`, `ASSIGNED`, `IN_PROGRESS`, `PENDING_REVIEW`, `COMPLETED` (`05 §3.4`).

| FR | Mô tả | Precondition | Luồng chính | Ngoại lệ | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|---|
| FR-006 | `Admin` tạo đề tài ở `DRAFT` với `title`, `requiredSkills`, `dueDate`, `departmentId` (transition T-01) | quyền `Admin` | `[UI]` form → Zod → insert `projects` (`version = 1`) → `project:updated` + `project_events` type `CREATED` | thiếu `dueDate`/`departmentId` → `VALIDATION_FAILED`; **không** gửi notification nào, vì `04 §4.3` T-01 ghi không có dòng notify | Given tạo đề tài hợp lệ, When lưu, Then `status = DRAFT`, `version = 1`, có một `project_events` type `CREATED` | `11 §5` dòng F2; `11 §3` (100% transition) |
| FR-007 | `Admin` giao đề tài `DRAFT → ASSIGNED` bằng tool `assign_project` (write ⇒ **confirm + Admin**) (T-02) | `assigneeIds` không rỗng; FR-023 hoặc chọn tay trên dashboard | xác nhận → atomic conditional update → `project_events` `ASSIGNED` → `project:updated` + `notification:new` vào room `user:<Employee>` | `Employee` gọi tool → `RBAC_DENIED` (nhãn `Admin` ở `NOTES-01 §B6`); không confirm → không ghi | Given `Employee` đã nhận việc, When `assign_project` được xác nhận, Then `status = ASSIGNED` và Employee nhận đúng **một** notification loại "Assignment mới" | `11 §5` dòng F2 + F4; `11 §4.2` "tool ghi có bước xác nhận" |
| FR-008 | Người được giao chuyển `ASSIGNED → IN_PROGRESS` qua `change_project_status` (write ⇒ confirm) (T-03) | `assigneeIds` chứa người gọi (`SUY DIỄN` theo `04 §4.3`) | `[UI]`/`[CHAT]` → confirm → update → `project_events` `STARTED` | cố nhảy `DRAFT → PENDING_REVIEW` hoặc `COMPLETED → *` → `ILLEGAL_STATE_TRANSITION` (`04 §4.3` "không nhảy tắt") | Given đề tài `ASSIGNED`, When người không trong `assigneeIds` đổi trạng thái, Then bị chặn `RBAC_DENIED` | `11 §3` (test phủ định cho cạnh không hợp lệ) |
| FR-009 | `Employee` gửi cập nhật tiến độ bằng `submit_progress` (write ⇒ confirm) — tạo một `project_events`, **không** đổi trạng thái duyệt (T-06) | đề tài `IN_PROGRESS` của mình | nhập %/mô tả → confirm → append `project_events` `PROGRESS_UPDATED` + `progressPct` → `project:updated` | gửi trùng khi reconnect → `clientMessageId` đã thấy thì **bỏ qua**, không tạo event thứ hai (`BR-13`) | Given gửi cùng `clientMessageId` hai lần, When job xử lý lần hai, Then số `project_events` type `PROGRESS_UPDATED` không tăng | `11 §5` dòng F2/Realtime |
| FR-010 | `Admin` approve báo cáo: `PENDING_REVIEW → COMPLETED` (T-05a) | tồn tại báo cáo nộp gần nhất | `[UI]` mở báo cáo → đối chiếu `project_events` → approve → update `status = COMPLETED` + `version` → `project_events` `APPROVED` → `project:updated` | hai Admin cùng bấm approve → một người thắng, người kia `PROJECT_VERSION_CONFLICT` | Given đề tài `PENDING_REVIEW`, When approve thành công, Then `status = COMPLETED`, `statusHistory` có thêm một phần tử, `version` tăng 1 | `11 §5` dòng F2; `11 §3` |
| FR-011 | `Admin` reject: `PENDING_REVIEW → IN_PROGRESS` **kèm lý do bắt buộc**; lý do vào `project.statusHistory[]` (T-05b) | có báo cáo đang chờ | reject + reason → update → `project:updated` + `report:updated` + `notification:new` cho Employee | thiếu lý do → `VALIDATION_FAILED`; report bị từ chối **vẫn còn** (BR-04), nhân viên nộp lại bằng FR-040 | Given bị reject, When Employee hỏi "xem lý do bị từ chối" (`get_project`), Then trả đúng `reason` của lần reject gần nhất | `11 §5` dòng F2/F7 |
| FR-012 | Mọi transition là **một** atomic conditional update theo `(_id, status: expected, version: v)`; không dùng transaction đa collection (BR-02) | client đã đọc document và giữ `expectedStatus`/`expectedVersion` | `findOneAndUpdate` điều kiện → `$inc version` → `$push statusHistory` → chỉ sau đó mới audit + WS + notify | update không khớp → đọc lại document hiện tại, trả `409` + payload hiện tại, **không** auto-merge | Given `version` đã bị người khác tăng, When ghi, Then nhận `PROJECT_VERSION_CONFLICT` và dữ liệu không đổi hai lần | `11 §5` dòng F2; `05 §5.2/.3` |
| FR-013 | "Quá hạn" **không** phải một trạng thái: chỉ là vị từ dẫn xuất `dueDate < now AND status != COMPLETED` (BR-01) | có `index (status, dueDate)` (I-02) | dashboard badge/bộ lọc; job nhắc hạn (`04 §4.4`) | cố ghi `status` = giá trị chỉ hạn → DB enum chặn, code là defect **S2** (`11 §8.3`) | Given đề tài quá hạn đang `IN_PROGRESS`, When Admin approve, Then vẫn chuyển `PENDING_REVIEW → COMPLETED` bình thường (`04 §4.4`) | `11 §3` (cạnh hợp pháp + phủ định); `11 §8.3` |
| FR-014 | `project.statusHistory[]` và `project_events` là **append-only**; không ai sửa/xoá (BR-03) | — | mọi mutation trạng thái chỉ `$push`/`insertOne` | nỗ lực update/xoá event → không có endpoint nào cho việc đó (`07 §7.3` "không ai") | Given một event đã ghi, When liệt kê timeline, Then nội dung cũ không đổi kể cả sau nhiều transition | `11 §5` dòng F2 |

### 3.3 F3 — Chatbot nhận diện ý định, tra cứu KPI & chính sách (UF-10)

Catalog 28 intent → tool ở `18-user-flows.md` (mục "Chatbot intent catalog"). **Chỉ 15 tên tool** ở
`NOTES-01 §B6`: 10 đọc (`get_my_profile`, `get_employee`, `list_projects`, `get_project`, `get_my_kpi`,
`get_department_kpi`, `find_candidates`, `explain_candidate_match`, `search_policy`,
`get_upcoming_deadlines`) + 5 ghi (`submit_progress`, `submit_report`, `assign_project`,
`change_project_status`, `override_kpi`).

| FR | Mô tả | Precondition | Luồng chính | Ngoại lệ | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|---|
| FR-015 | Mỗi câu hỏi của người dùng phải được router ánh xạ tới **một tool trong catalog** hoặc bị trả lời "không hỗ trợ"; không để hội thoại trôi thành câu hỏi tự do | phiên WS hợp lệ | `chat:send` → `chat:accepted` → Intent/router → Agent → Tool selection (`NOTES-01 §B6`) | intent không map được tool (7/28 intent trong `18`) → từ chối lịch sự + chỉ đường dashboard, **không tự đặt tên tool mới** | Given một câu trong catalog 28 intent, When chạy bộ test tất định, Then tool được chọn khớp cột `Tool` trong catalog | `11 §4.2` "Intent → tool" (mocked LLM + fixture + `temperature=0` + snapshot) |
| FR-016 | Tra cứu KPI: `get_my_kpi` cho cả hai vai (own), `get_department_kpi` chỉ `Admin` | `evaluations` có dữ liệu kỳ đang mở | `[CHAT]` "KPI của tôi tháng này" / "KPI phòng ban" → đọc theo `(employeeId, period)` (I-06) / `(period)` (I-16) | `Employee` gọi tool phòng ban → `RBAC_DENIED`; phòng ban là scope `Admin` (`07 §7.1`) | Given `Employee`, When hỏi KPI phòng ban, Then không nhận bất kỳ số liệu nào của người khác | `11 §4.2` "RBAC check mỗi tool" (test **cả hai vai**) |
| FR-017 | Hỏi đáp chính sách bằng RAG: `search_policy` → top-K chunk → trả lời **kèm `document` / `version` / `source`** (BR-15) | `policies` đã ingest; 1 Atlas Vector Search index cho policy (I-10, `NOTES-01 §B1`) | `chat:send` → retrieve → LLM → `chat:chunk`…`chat:done` | provider lỗi → `chat:error`; không fine-tune LLM ở baseline (`NOTES-01 §B6`) | Given một câu trả lời về quy định, When hiển thị, Then luôn có tên tài liệu + version + nguồn kèm theo | `11 §5` dòng F3; `11 §4.2` "Từ chối khi thiếu bằng chứng" |
| FR-018 | Khi bằng chứng retrieval không đủ, hệ thống **từ chối đoán** và nói rõ chưa có trong tài liệu (cùng nguyên tắc abstention với S2) | FR-017 | so điểm khớp ngưỡng → nhánh từ chối | đây là hành vi đúng, không phải lỗi: client không được hiển thị câu bịa | Given câu hỏi ngoài tập chính sách, When hỏi, Then hệ thống từ chối và **không** sinh nguồn giả | `11 §4.2` "Từ chối khi thiếu bằng chứng" |
| FR-019 | Guard của Agent Loop bắt buộc có mặt: `maxSteps = 5`, `toolTimeout`, `LLM timeout`, trần kích thước kết quả tool, Zod validate **mọi** tham số, RBAC check **mỗi** tool call (BR-19, `07 §8`) | — | chu trình `Tool selection → Zod validate → Permission check → execute` | LLM trả đối số thiếu/sai kiểu (hallucinated args) → tool không chạy, có đường xử lý dự phòng | Given một tool trả treo, When quá `toolTimeout`, Then hội thoại kết thúc bằng `chat:error`, không deadlock | `11 §4.2` (toàn bộ checklist guard) |
| FR-020 | Tool ghi chỉ thực thi sau một bước **confirm** do người dùng bấm (BR-05); tool đọc chạy ngay | tool nằm trong 5 tên write | agent đề xuất → hiển thị "tôi sắp làm X, bạn có chắc không?" → confirm → execute → audit | quá hạn confirm hoặc từ chối → **không** có mutation nào | Given không confirm, When chờ, Then `projects`/`reports`/`evaluations` không đổi bản ghi nào | `11 §4.2` "Tool ghi có bước xác nhận" |
| FR-021 | Trả lời được stream và chịu ràng buộc idempotency: mỗi client message mang `clientMessageId`, message trùng id bị bỏ qua (BR-13) | kết nối WS một namespace (`NOTES-01 §B7`) | `chat:send` → `chat:chunk` → `chat:done` | reconnect giữa chừng → client gửi lại cùng `clientMessageId` → không tạo hai mutation | Given mất kết nối sau `chat:accepted`, When gửi lại cùng id, Then hệ thống chỉ xử lý một lần | `11 §5` dòng Realtime |
| FR-022 | Intent chưa có tool **không** được "điền chỗ": 7/28 intent (`sửa số điện thoại`, `kiểm tra workload`, `hỏi thêm khi AI không chắc`, `so sánh KPI theo tháng`, `giải thích điểm KPI`, `gửi nhận xét`, `tóm tắt công việc hôm nay`) phải được (a) chuyển thành thao tác dashboard, (b) phủ bằng abstention, hoặc (c) xin GVHD thêm tool | `18-user-flows.md` mục catalog | hiển thị rõ giới hạn cho người dùng | tự đặt tên tool mới = vi phạm hợp đồng catalog | Given intent #23 "gửi nhận xét", When hỏi chatbot, Then hệ thống chỉ đường dashboard và **không** gọi tool nào | `11 §4.2` "Intent → tool"; review tài liệu |

### 3.4 F4 — Gợi ý phân công theo ngữ nghĩa (UF-04)

| FR | Mô tả | Precondition | Luồng chính | Ngoại lệ | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|---|
| FR-023 | `find_candidates` (read, `Admin`) nhận mô tả yêu cầu + `requiredSkills` và trả danh sách ứng viên xếp hạng theo ngữ nghĩa; phần tính cosine/vector chạy trong `apps/ai-service` (FastAPI), **không** dùng vector index Atlas cho F4 (`NOTES-01 §B1`) | có đề tài ở `DRAFT`/`ASSIGNED` và `employees.skills` không rỗng | `[UI]`/`[CHAT]` → embedding → ranking top-K → Zod validate + RBAC → card | `ai-service` timeout → `chat:error`, dashboard giữ trạng thái cũ | Given một yêu cầu có kỹ năng, When gọi tool, Then trả về đúng K ứng viên kèm điểm và **không** mutation nào xảy ra | `11 §5` dòng F4; `11 §4.2` "tool đọc không mutate" |
| FR-024 | Điểm tương đồng phải qua **calibration** trước khi cắt ngưỡng; dưới ngưỡng → **abstain**: hỏi lại thay vì gợi ý (BR-10) | có ngưỡng đã hiệu chuẩn (`NOTES-01 §B13`); giá trị ngưỡng `TBD` | `raw cosine → Platt/Logistic → estimated probability → threshold` | **cấm** diễn giải cosine thành xác suất đúng (`0.82 ≠ 82%`) | Given điểm sau calibration dưới ngưỡng, When trả kết quả, Then hệ thống hỏi thêm và **không** đưa ra gợi ý | `11 §4.2` "Abstention"; `pytest` eval harness |
| FR-025 | `explain_candidate_match` trả breakdown đóng góp từng kỹ năng theo **skill-to-skill cosine + leave-one-skill-out** cộng `Workload penalty`; **cấm** giải thích bằng attention của PhoBERT (BR-11) | đã có ranking | bấm "vì sao đề xuất nhân viên này" → card | không có breakdown → không hiển thị card giải thích | Given một gợi ý, When xem giải thích, Then mỗi kỹ năng có đóng góp cộng/trừ và tổng khớp điểm ranking | `11 §5` dòng F4 |
| FR-026 | `Admin` chọn hoặc **bác** gợi ý rồi xác nhận giao việc; tie-break bằng workload hiện tại | FR-023/FR-025 | chọn → `assign_project` (confirm + `Admin`) → T-02 | bác toàn bộ danh sách → đề tài ở lại `DRAFT`, không ghi gì | Given hai ứng viên cùng điểm, When chọn, Then người có workload thấp hơn được xếp trước | `11 §5` dòng F4 (Playwright bước xác nhận) |
| FR-027 | Chất lượng F4 được công bố bằng **P@1 / @3 / @5, Recall@5, MRR**, kèm latency và RAM — **không** dùng F1 đơn độc cho ranking Top-K (`NOTES-01 §B5`). F1 chỉ xuất hiện nếu GVHD chốt bài toán classification (`RP §7.2`) | có tập test đã gán nhãn + protocol (`09-ai-evaluation.md`) | eval harness chạy nightly/release | dataset HR cuối cùng **chưa chốt** → kết quả là `TBD` [CẦN NGUỒN] | Given một bộ seed cố định, When chạy eval, Then bảng số ra giống hệt lần trước (tái lập được) | `11 §4.4` "AI regression gate"; `pytest -m eval` |

### 3.5 F5 — Phân tích ngữ nghĩa nhận xét → hỗ trợ lượng hóa KPI (UF-06)

Chu trình đã được research **mở rộng** so với đầu bài (`NOTES-01 §B0`): `self-review → manager review →
calibration/approval → publish → history`. Đây là mở rộng phạm vi, cần GVHD duyệt (`RP §12` luật 4) — ghi rõ
ở `04 §6.1`.

| FR | Mô tả | Precondition | Luồng chính | Ngoại lệ | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|---|
| FR-028 | `Admin` mở kỳ đánh giá; hệ thống tạo `evaluations` cho từng `(employeeId, period)` với ràng buộc UNIQUE (BR-17) | `period` hợp lệ — granularity **`TBD`** (`04 §9` Q-07) | `[UI]` mở kỳ → upsert theo I-06 → `notification:new` | mở kỳ trùng → không tạo bản ghi thứ hai | Given một kỳ đã tồn tại cho `(employeeId, period)`, When mở lại, Then vẫn đúng một bản ghi | `11 §5` dòng F5 |
| FR-029 | `Employee` tự nhận xét (`selfReview`); `Admin` nhập nhận xét quản lý (`managerReview`). Ở baseline hai bước này chỉ làm trên **dashboard**, vì catalog `NOTES-01 §B6` không có tool ghi cho nhận xét (intent #23) | kỳ đang mở | `[UI]` form → Zod → ghi `evaluations` | kỳ chưa đóng mà đã publish → chặn | Given `Employee`, When nhập `managerReview` cho người khác, Then `RBAC_DENIED` | `11 §5` dòng F5 |
| FR-030 | AI **chỉ** sinh `sentiment`, `themes`, `riskSignals`, `suggestedScoreComponent`, `explanation`; không sinh KPI cuối (BR-07) | có đủ hai loại nhận xét | gọi `ai-service` phân tích ngữ nghĩa → ghi 5 tín hiệu | AI trả thêm field điểm tổng → bị Zod chặn | Given cùng input, When phân tích hai lần, Then `machineScore` không đổi (nó không do AI sinh) | `11 §5` dòng F5; `pytest` |
| FR-031 | `machineScore` do **công thức tất định** `F(objectiveCompletionScore, reviewSemanticSignal, managerAssessment)`; dạng `F` và trọng số: `TBD` (`04 §6.3`) | FR-030 | `kpiService` tính → ghi `machineScore` (bất biến sau khi sinh) | thiếu một trong ba đầu vào → không tính, kỳ ở trạng thái chờ | Given cùng ba đầu vào, When tính lại, Then ra cùng một điểm | `11 §3` (90% service), `11 §5` dòng F5 |
| FR-032 | Thành phần điểm lấy từ nhận xét bị **chặn trần** bởi tỷ lệ hoàn thành thật của đề tài (BR-08); ngưỡng cụ thể `TBD` | FR-031 | hàm ceiling trong `kpiService` | nhận xét rất tích cực + completion thấp → điểm không vượt completion | Given `suggestedScoreComponent` cao hơn trần, When tính, Then `machineScore` không vượt trần | `11 §5` dòng F5 (pytest + Vitest) |
| FR-033 | `override_kpi` (write ⇒ **confirm + reason + Admin**): khi `finalScore ≠ machineScore` thì `overrideReason`, `changedBy`, `changedAt` bắt buộc có mặt; bản ghi override không sửa được (BR-09) | đã có `machineScore` | Admin hiệu chỉnh → confirm → ghi 5 field bắt buộc → `kpi:updated` | override không lý do → `VALIDATION_FAILED` và **không** qua audit | Given `Employee` yêu cầu điều chỉnh điểm, When gọi tool, Then chỉ `Admin` thực hiện được (intent #24) | `11 §4.2` "Audit mỗi mutation" |
| FR-034 | `Admin` công bố KPI: `finalScore` thành số chính thức, Employee và `department:<departmentId>` nhận `kpi:updated`; kỳ trước vẫn xem lại được | kỳ đã review | publish → đọc history qua `get_my_kpi` / `get_department_kpi` | **thiếu review** → kỳ không chốt được, Admin nhận nhắc "KPI cần review" (digest, 1 lần/ngày theo `NOTES-01 §B0`) | Given kỳ đã publish, When `Employee` hỏi KPI tháng này, Then thấy `finalScore` + `explanation` | `11 §5` dòng F5/F6 |
| FR-035 | Mỗi bản ghi KPI hiển thị được chuỗi giải trình: `machineScore \| finalScore \| overrideReason \| changedBy \| changedAt` | — | card/ bảng KPI | thiếu bất kỳ field nào của một override → bản ghi không hợp lệ | Given một override, When xem lịch sử kỳ, Then thấy ai sửa, lúc nào, vì sao | `11 §5` dòng F5 |

### 3.6 F6 — Dashboard nền tối (đích của UF-04/05/06/09)

| FR | Mô tả | Precondition | Luồng chính | Ngoại lệ | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|---|
| FR-036 | Dashboard **nền tối** với biểu đồ biến động KPI theo thời gian, dựng bằng shadcn/ui + Recharts trên semantic tokens (`background`, `foreground`, `card`, `muted`, `primary`, `destructive`, `chart-1..5`) | có `evaluations` đã publish | `[UI]` mở → REST aggregate → vẽ | thiếu dữ liệu kỳ → empty state, **không** vẽ chart từ số chưa đo | Given đổi dark/light, When xem chart, Then bảng màu chart không lệch (`11 §5` dòng F6) | `11 §5` dòng F6; `11 §6.1` Lighthouse |
| FR-037 | Danh mục đề tài & nhân sự: lọc theo `status`, `dueDate`, `departmentId`, `assigneeIds`, có badge quá hạn là **dẫn xuất** | index I-02/I-03/I-04/I-15 | `[UI]` bảng + bộ lọc → phân trang | lọc tổ hợp không có index → chấp nhận, nhưng `TBD` kế hoạch index bổ sung | Given lọc "đang mở và hạn gần nhất", When thực thi, Then kết quả dùng I-02 (`(status, dueDate)`) | `11 §5` dòng F6 |
| FR-038 | Chuông thông báo đọc từ collection `notifications` (bền), đánh dấu `readAt` khi ack; WS chỉ là kênh đẩy nhanh | I-07 `(userId, readAt, createdAt)` | `notification:new` → badge; mở tab/sau reconnect → **đọc lại qua REST** | Render ngủ đông làm push trễ → danh sách vẫn đúng khi mở lại | Given notification đã đọc, When reconnect, Then không bị đẩy lại (`05 §3.9`) | `11 §5` dòng Realtime |
| FR-039 | Mọi view có loading/empty/error state; trạng thái kết nối WS được hiển thị, không giả định tức thì | — | — | lỗi mạng → giữ dữ liệu cũ + báo rõ | Given một view chưa có số đo, When render, Then không có con số nào được bịa ra | `11 §5` dòng F6; `11 §6.1` (CLS) |

### 3.7 F7 — Báo cáo nghiệm thu + nhắc hạn tự động (UF-05, UF-09)

| FR | Mô tả | Precondition | Luồng chính | Ngoại lệ | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|---|
| FR-040 | `Employee` nộp báo cáo nghiệm thu bằng `submit_report` (write ⇒ confirm) → tạo bản ghi `reports`, đề tài chuyển `PENDING_REVIEW` (T-04) | đề tài `IN_PROGRESS` của mình | `[UI]`/`[CHAT]` → confirm → `reportService.create()` → `report:updated` + `project:updated` + notify "Báo cáo đã nộp" → `Admin` | nộp lần hai sau reject → tạo bản ghi **mới**, bản cũ giữ nguyên (BR-04) | Given nộp thành công, When Admin mở hàng đợi, Then thấy đúng bản vừa nộp và đề tài ở `PENDING_REVIEW` | `11 §5` dòng F7 |
| FR-041 | Job định kỳ (`Agenda`, chạy trên Mongo, **không** Redis) quét item theo notification matrix `NOTES-01 §B0`: còn 3 ngày (Employee, 1 lần/ngày), còn 1 ngày (Employee, 1 lần), quá hạn (Employee + Admin, 1 lần/ngày) | đăng ký job trong API process; `dueDate` có trong I-02 | `[SYS]` query sắp hạn/qua hạn (dẫn xuất) → kiểm ngưỡng chống trùng → persist `notifications` → push `notification:new` | người nhận đang nghỉ phép → **baseline không có cơ sở dữ liệu để bỏ qua**, vì luồng UF-02 `PARKED — chờ GVHD` | Given một đề tài còn 3 ngày, When job chạy hai lần trong cùng ngày, Then đúng **một** notification được tạo | `11 §5` dòng F7 (pytest cho job) |
| FR-042 | Notification **phải được persist** trước khi đẩy qua WS (BR: "durable notification vẫn phải persist phía app"); ack ghi `notifications.readAt` | `notifications` có I-07/I-17 | insert → emit → client bấm → ack | emit fail sau insert → notification vẫn còn trong danh sách khi mở lại | Given client offline lúc gửi, When mở lại, Then thấy notification và trạng thái đọc đúng | `11 §5` dòng Realtime |
| FR-043 | `Admin` nhận **daily digest 1 bản/ngày** gom item quá hạn + "KPI cần review"; template digest chi tiết `TBD` (`NOTES-01 §B15` chưa mô tả) | FR-041 | `[SYS]` Agenda job dựng digest → persist kênh `in-app` | chạy lại job trong ngày → UNIQUE `(userId, dedupeKey)` chặn bản thứ hai | Given một ngày, When job chạy nhiều lần, Then Admin nhận đúng **một** bản digest | `11 §5` dòng F7 |
| FR-044 | Mọi job phải **idempotent** khi chạy lại sau restart/retry (`NOTES-01 §B15`) | dedupeKey + `clientMessageId` | job restart → kiểm tra khoá trùng → bỏ qua | job gửi trùng → defect S2 | Given job bị kill giữa chừng, When chạy lại, Then không có notification đúp | `11 §5` dòng F7 |

### 3.8 Yêu cầu nền (đề cương bắt buộc, không thuộc một F nào)

| FR | Mô tả | Precondition | Luồng chính | Ngoại lệ | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|---|
| FR-050 | Đăng nhập phát hành Access Token (memory) + Refresh Token (cookie `HttpOnly + Secure + SameSite`); Mongo **chỉ lưu hash** | `users.email` có index I-13 | `POST /auth/login` → Argon2id verify → sinh `familyId` → insert `refresh_sessions` → 200 | sai mật khẩu hoặc không có user → **cùng một** thông báo 401, không phân biệt | Given đăng nhập đúng, When kiểm DB, Then không có token thô nào trong `refresh_sessions` | `11 §5` dòng Auth; `07 §3.1` |
| FR-051 | Refresh Token **rotation + reuse detection**: mỗi lần refresh invalidate RT-1 → phát hành RT-2; RT-1 xuất hiện lại → revoke **TOÀN BỘ family** (`NOTES-01 §B3`) | phiên còn `familyId` | `POST /auth/refresh` → conditional update `revokedAt: null` → insert RT-2 | re-use → `TOKEN_REUSED`, mọi phiên trong family hết hiệu lực, client phải login lại | Given dùng lại RT-1 sau khi đã rotate, When refresh, Then RT-2 cũng bị thu hồi và cả hai trả 401 | `11 §5` dòng Auth; `07 §3.3` |
| FR-052 | RBAC đúng hai `role` (`Admin`, `Employee`), kiểm tra ở **mỗi** request và **mỗi** tool call; `level` không bao giờ mở quyền (BR-06) | JWT có claim `role` | middleware + tool permission check | không dùng CASL ở MVP (`NOTES-01 §B3`) | Given ma trận ở `07 §7`, When lần lượt test từng action × từng role, Then kết quả khớp 100% | `11 §4.2` "RBAC check mỗi tool" |
| FR-053 | Socket.IO xác thực ngay trong handshake (`socket.handshake.auth` + verify JWT bằng `jose`), sau đó mới cho vào room `user:<userId>` / `department:<departmentId>` | access token hợp lệ | handshake → verify → join room | kết nối ẩn danh → bị từ chối; id room **không** lấy từ payload client | Given token hết hạn, When kết nối, Then không vào được room nào | `11 §5` dòng Realtime; `07 §8` |
| FR-054 | Bộ event WS **đóng ở 9 tên** (`chat:send`, `chat:accepted`, `chat:chunk`, `chat:done`, `chat:error`, `notification:new`, `project:updated`, `report:updated`, `kpi:updated`); một namespace, một instance, không Redis adapter | — | khai báo trong `06-api-spec.md` | event chưa khai báo → gate "WS contract" fail CI (`RP §11`) | Given một event thứ 10, When chạy gate WS contract, Then build đỏ | `11 §5` dòng Realtime; `02 §9` |
| FR-055 | Hợp đồng API sinh một chiều: `Zod schema → OpenAPI → Orval → typed React client` (`NOTES-01 §B2`); client không tự viết type tay | `packages/contracts` | schema ở module → sinh client → build | schema drift → fail build | Given API đổi shape mà schema không đổi, When chạy `schemathesis`, Then CI đỏ | `02 §9` hàng "API không trôi khỏi spec" |
| FR-056 | Triển khai thật trên ba nền tảng cam kết: MongoDB Atlas M0 · Render hoặc VPS Ubuntu (API + AI service) · Vercel hoặc Netlify (client) — không chỉ `localhost` (`00 §7` DoD 1) | env matrix + runbook ở `14-devops-deployment.md` | deploy → smoke test trên môi trường thật | Render sleep sau 15 phút không traffic, wake-up có thể ~1 phút (`NOTES-01 §B1`) `[CẦN NGUỒN]` | Given bản `main`, When demo, Then mọi F1..F7 chạy trên URL công khai | `11 §5` + `11 §7` (UAT) |

### 3.9 Yêu cầu nhóm bổ sung (S-series)

`NOTES-01` chốt 5 mục và **đổi thứ tự** thành `S14 → S3 → S2 → S1 → S6`; bốn mục rẻ làm bất kể là
**S5, S8, S11, S13** (`00 §4`). Tất cả mang nhãn `stretch` hoặc `Should`, **không** phải cam kết đề cương.

| FR | S | Mô tả | Trạng thái | Tiêu chí chấp nhận | Đo bằng |
|---|---|---|---|---|---|
| FR-060 | S14 | `make demo` dựng lại toàn bộ: seed tiếng Việt có **khoá cố định** + dựng DB + chạy eval in đúng bảng đã công bố | stretch — chờ GVHD (`RP §7.8`) | Gate "Dữ liệu tái lập" chạy `make demo` và so seed hash | `02 §9` + `11 §4.5` |
| FR-061 | S3 | Benchmark **4** phương án embedding trên cùng tập test: `TF-IDF/BM25` (baseline rẻ) · `PhoBERT mean-pool` (bắt buộc theo đề cương) · `multilingual-e5-small` · `paraphrase-multilingual-MiniLM-L12-v2`; ba cột: chất lượng (P@5/MRR), độ trễ, RAM | stretch — chờ GVHD | Bảng số có commit + ngày + model + phần cứng; thiếu → `TBD` | `pytest -m eval` (nightly) |
| FR-062 | S2 | Calibration + abstention: reliability diagram, Brier, ECE, coverage, precision among accepted predictions | stretch — chờ GVHD | Công bố được cặp (ngưỡng, coverage) đo được; cosine không bị gọi là xác suất | `09-ai-evaluation.md` |
| FR-063 | S1 | Giải thích gợi ý bằng đóng góp kỹ năng, hiển thị dạng card trong chat và cột dashboard | stretch — chờ GVHD | Card có breakdown cộng/trừ từng kỹ năng + workload penalty; số minh hoạ phải ghi rõ là **format**, không phải kết quả model | `11 §5` dòng F4 |
| FR-064 | S6 | Chatbot **chủ động** hỏi tiến độ theo lịch và gom daily digest cho quản lý; chạy trên Agenda | stretch — chờ GVHD | Không vượt ngưỡng chống spam `07 §7`/`BR-12`. **Lưu ý:** `NOTES-01 §B7` chỉ khai báo `chat:send` là client message → chưa có event cho message do hệ thống khởi xướng → cần chốt hợp đồng `[CẦN NGUỒN]` (xem `06-api-spec.md` §8) | `11 §5` dòng F7 |
| FR-065 | S5 | Datasheet + Model Card cho từng mô hình (dữ liệu, giới hạn, thiên kiến, cách eval) | Should | Mỗi model có một trang; không ghi `license` khi chưa kiểm chứng checkpoint (`NOTES-01 §B5`) | review tài liệu |
| FR-066 | S8 | Confirm-before-write cho toàn bộ tool ghi (đã được nâng lên FR-020) | Should | Không có mutation nào thiếu bước confirm | `11 §4.2` |
| FR-067 | S11 | Command palette `Ctrl/Cmd+K` trên dashboard: tìm đề tài/nhân viên, chạy action nhanh | Should | Không mở quyền mới; mọi action vẫn qua cùng RBAC + confirm | `11 §5` dòng F6 |
| FR-068 | S12, S13 | Bias probe cho sentiment→KPI (tương quan độ dài/cách diễn đạt với điểm máy) + counter-weight/ceiling + log override bất biến | Should | Số liệu bias đo được trên bộ seed cố định; ceiling đúng FR-032 | `pytest`, `11 §5` dòng F5 |

Không có FR nào cho **S4, S7, S10** — ba mục này đang `PARKED — chờ GVHD` (PARK-08, PARK-06, PARK-05). Xem §7.

---

## 4. Yêu cầu phi chức năng (NFR)

Mỗi NFR phải đo được; cột "Đo" là lệnh/bằng chứng, theo đúng luật `RP §11`: *quy ước không có lệnh chạy trong
pipeline thì chỉ là văn bản*.

| ID | Nhóm | Yêu cầu | Lý do / nguồn | Đo bằng |
|---|---|---|---|---|
| NFR-01 | Bảo mật — phiên | Access Token ở **memory**; Refresh Token ở cookie `HttpOnly + Secure + SameSite`; Mongo chỉ lưu `tokenHash`; refresh rotation + reuse detection revoke cả family; ký/verify bằng `jose` | `NOTES-01 §B3`; ADR-007, ADR-008; `07 §2/.3` | `11 §5` dòng Auth (Vitest + Supertest); không có token thô trong DB là assertion bắt buộc |
| NFR-02 | Bảo mật — mật khẩu | Hash bằng **Argon2id** với cấu hình `NOTES-01 §B3` nêu (~19 MiB memory, 2 iterations, parallelism 1). Package Node **chưa chốt**; tham số cần xác nhận bằng nguồn chính thức: `[CẦN NGUỒN]` | `NOTES-01 §B3`; `07 §6` | test verify/re-hash; không có chuỗi mật khẩu thô ở bất kỳ log/response nào |
| NFR-03 | Bảo mật — phân quyền | Đúng 2 `role`, kiểm tra **mỗi tool call** và mỗi request; `level` không phải quyền; tool ghi **phải confirm**; `override_kpi` cần `reason`; không có deny-list access token ở MVP (chỉ dựa TTL ngắn, `TBD`) | `NOTES-01 §B3/§B6`; `07 §7/.9` | ma trận `07 §7` được dịch thành test tự động, cả hai vai, mọi action |
| NFR-04 | Độ tin cậy | Service có thể **ngủ sau 15 phút** không có HTTP/WS traffic, wake-up có thể ~1 phút → thiết kế không được giả định push tức thì: notification persist trước, client đọc lại khi mở tab, reminder là "hàng đợi việc cần làm" | `NOTES-01 §B1` [CẦN NGUỒN]; `02 §6` hàng `apps/api` | test tắt WS rồi mở lại: danh sách thông báo vẫn đúng (FR-038, FR-042) |
| NFR-05 | Độ tin cậy — suy giảm có chủ đích | Hết quota LLM → rơi về pipeline PhoBERT-only (intent cố định) thay vì chết, và **đo được % tính năng còn dùng được** (`S9`) | `RP §9` S9; `00 §6` R3 | kịch bản quota giả trong mocked test. Trạng thái: **stretch — chờ GVHD** (S9 không nằm trong 5 mục đã chọn) |
| NFR-06 | Hiệu năng | **Internal target của nhóm** (NOTES-01 `§B9` ghi rõ "chưa phải chuẩn ngoài — phải benchmark trước khi đưa thành kết quả"): `CRUD read p95 < 300 ms` · `Dashboard aggregate p95 < 800 ms` · `Chat tool lookup p95 < 1 s` · `Warm embedding inference < 500 ms` · `LLM first token < 2.5 s`. **Không phải gate chặn merge** | `NOTES-01 §B9`; `02 §8/.9` | `11 §6.2` (công cụ benchmark `TBD`); mỗi dòng phải có lệnh chạy mới được giữ |
| NFR-07 | Hiệu năng — chuẩn ngoài | Core Web Vitals đo tại percentile 75: `LCP ≤ 2.5 s` · `INP ≤ 200 ms` · `CLS ≤ 0.1`, assert trong CI | `NOTES-01 §B9`; `RP §11` | `npx @lhci/cli autorun` + `assert` (gate "Hiệu năng front") |
| NFR-08 | Khả dụng / giới hạn hạ tầng | Chạy được trong trần free tier: Atlas M0 **0.5 GB, tối đa 500 connections, 100 DB, 500 collections, ~100 ops/s, không backup tự động**; Search/Vector tối đa **3 index** (dùng 1/3); Render free có WebSocket. **Toàn bộ các con số này đang `[CẦN NGUỒN]`** vì URL bị mất khi paste (`NOTES-01` mục CẦN BỔ SUNG) và hai điểm còn phải xác minh: Vector Search có trên M0 hay không, ngưỡng connection là 500 hay 512 | `NOTES-01 §B1`; `02 §1.2/.6` | không được chép thành số liệu đã kiểm chứng vào báo cáo; connection budget phải chia cho API + Agenda + `ai-service` qua **một pool** |
| NFR-09 | Bảo trì | Một module = năm file (`controller/service/repository/schema/routes`); `domain/` không import `mongoose`/`express`; `ai-service` không import model của API; không circular deps; không thêm collection thứ 12 | `NOTES-01 §B2/§B4`; `02 §5.1/.9` | `pnpm depcruise --validate`; `pnpm -r typecheck`; `pnpm -r lint` |
| NFR-10 | Kiểm toán | **Mọi** mutation được audit: `project_events` (append-only) kèm `actorId`, `tool`, `clientMessageId`, `source`; `evaluations` giữ `machineScore \| finalScore \| overrideReason \| changedBy \| changedAt`; lịch sử là dữ liệu, không phải log | `NOTES-01 §B6`; `02 §7.4`; BR-03 | test: mỗi hành động ghi của F2/F5/F7 tạo đúng một audit record; không có endpoint sửa/xoá audit |
| NFR-11 | Quốc tế hoá | Toàn bộ UX và dữ liệu demo bằng **tiếng Việt**: `fullName`, `title`, `description`, `selfReview`, `managerReview`, `policies`; mã nguồn, comment, commit message bằng tiếng Anh. Ràng buộc kỹ thuật: **PhoBERT yêu cầu input tiếng Việt đã word-segmented** → bước tiền xử lý thuộc `apps/ai-service`, không thuộc chat UI | `RP §1`; `NOTES-01 §B5`; `05 §6.2`; `02 §6` | Playwright smoke chạy trên locale tiếng Việt; seed chứa tiếng Việt thật |
| NFR-12 | Giới hạn chi phí LLM | Provider đi qua `LLMProvider` abstraction (Gemini / Groq / OpenAI), không hard-code; baseline `gemini-3.1-flash-lite` (paid ~`$0.25/1M` input, `$1.50/1M` output) hoặc Groq Free (nhiều model 30 RPM; `gpt-oss-120b` ~1.000 RPD, 8K TPM). Guard `maxSteps`, timeout, trần kết quả tool để chặn chi phí trước khi chạm trần; **live eval không chạy mỗi PR** | `NOTES-01 §B6/§B10`; ADR-012, ADR-016 | mỗi dòng chi phí phải kèm commit/model/provider/ngày/seed; PR chỉ chạy mocked test |
| NFR-13 | Kiểm thử & tái lập | 100% transition state machine có test; 90% service; **không** đo coverage cho UI; nhãn `test-gaps` phải về 0 trước khi nộp báo cáo | `RP §11`; `11 §3` | `pnpm --filter api exec vitest run --coverage domain` |
| NFR-14 | Phạm vi | Không mục `S` nào được code trước khi F1..F7 + auth + deploy chạy được **trước tuần 9**; đóng băng tính năng tuần 11 | `RP §12` luật 1 & 5 | `16-project-plan.md` + review PR |

---

## 5. Ràng buộc từ đề cương không được phép vi phạm

Trích `RP §1` và `00 §5`. Trái một dòng nào phải xin GVHD **trước** khi thiết kế.

| # | Ràng buộc | Hệ quả bắt buộc trong tài liệu này |
|---|---|---|
| 1 | Bảy chức năng F1..F7 như định nghĩa ở §1 | mọi FR phải truy về đúng một F; không có FR "thứ tám" |
| 2 | Stack: MERN + TypeScript; lõi AI Python/FastAPI; Socket.IO; pnpm monorepo; CI/CD; MongoDB Atlas M0; Render/VPS Ubuntu; Vercel/Netlify | **Express.js**, không phải framework khác; NestJS chờ `RP §7.1` |
| 3 | Auth: JWT + Refresh Token Rotation; RBAC `Admin`/`Employee` | FR-050..052; không role thứ ba |
| 4 | Chatbot: Intent detection, Function Calling, Agent Loop, tra cứu KPI + hỏi đáp chính sách, realtime qua WebSocket | FR-015..021; 9 event WS |
| 5 | Bắt buộc có **PhoBERT** cho thành phần ngữ nghĩa; LLM theo cơ chế gọi hàm tự động | FR-023; PhoBERT mean-pool là hàng **bắt buộc** trong benchmark S3 |
| 6 | Chỉ tiêu đo: **F1 ≥ 85%** + Accuracy trên tập test chuẩn | `RP §7.2` chưa chốt F1 đo bài toán nào → metric của F4 ở FR-027 dùng P@K/MRR, F1 để `TBD`; **đang blocking** `09-ai-evaluation.md` |
| 7 | UI: dashboard **nền tối**, biểu đồ biến động KPI | FR-036 |
| 8 | Kiểm thử: Postman (API), Lighthouse (giao diện), eval mô hình, UAT với giảng viên + sinh viên đóng vai | `11 §1`, `11 §7`; mọi FR có cột "Đo bằng" |
| 9 | Tiến độ 12 tuần (24/08/2026 → 16/11/2026), 3 SV, gặp GVHD ≥ 1 lần/tuần | `RP §12` luật 1 & 5 → NFR-14 |
| 10 | Rubric 10 điểm (§2) | mọi FR ánh xạ về một hạng mục điểm |
| 11 | Định dạng báo cáo của Khoa (`NOTES-01 §B12`) | **`UNRESOLVED`** — bắt buộc xin GVHD/Khoa; ảnh hưởng hạng mục 0.5 + 0.5 |

---

## 6. Definition of Done của cả đề tài (`00 §7`)

Tám điều, trích để FR/NFR không "xong" một cách tự phong: triển khai thật trên 3 nền tảng · F1..F7 đi hết
vòng đời trên dữ liệu thật, không nút giả · hai vai dùng song song, nhắc hạn đúng người/đúng lúc/đúng tần suất
theo notification matrix · phần AI có bảng số thật (≥ 2 phương án embedding, kèm latency + RAM) · `make demo`
dựng lại được · CI xanh với các gate đã cam kết · `docs/` khớp mã nguồn ở ngày nộp · trình diễn end-to-end
qua cả hai kênh.

---

## 7. Out of scope

### 7.1 Mục đang `PARKED — chờ GVHD` (trích `docs/backlog-parked.md`)

**Không** là yêu cầu, **không** được mô tả như thứ hệ thống sẽ làm, **không** có test cho tới khi được duyệt
(`11 §5` "Ngoài phạm vi test (parked)").

| ID | Mục | Vì sao park | Điều kiện mở lại |
|---|---|---|---|
| PARK-01 | UF-02 Nghỉ phép & duyệt theo cấp | ngoài F1..F7 (`NOTES-01 §B0`); kéo theo state machine riêng + collection quota | `RP §7.8` + `RP §7.4`; viết lại B4 rồi mới tới B3, B6 |
| PARK-02 | UF-03 Onboarding / offboarding | "không đưa vào MVP nếu GVHD chưa duyệt mở scope" (`NOTES-01 §B0`) | `RP §7.8` + `RP §7.10` |
| PARK-03 | UF-07 Goal / OKR | ngoài F1..F7 và **overlap F5**; B4 không có collection `goals` | `RP §7.8` + `RP §7.2` |
| PARK-04 | UF-08 Pulse survey | ngoài F1..F7; **chưa có bằng chứng sản phẩm** nào được viện dẫn `[CẦN NGUỒN]` | `RP §7.8`, `§7.5`, `§7.10` + bổ sung bằng chứng B0 |
| PARK-05 | S10 Ask-your-data (NL → aggregation có whitelist) | rủi ro **Cao** (`RP §9`); effort L; không nằm trong 5 mục đã chọn | baseline xong trước tuần 8 **và** whitelist template đạt review; `06-api-spec.md` phải khai báo template trước khi code |
| PARK-06 | S7 Deadline-risk early warning | chỉ làm nếu S6 đã chạy (chung hạ tầng Agenda); chưa có trọng số đo được `[CẦN NGUỒN]` | `RP §7.8` + `§7.4`; S6 chạy ổn |
| PARK-07 | `UFoLD` + 5 dataset chưa xác minh | `UFoLD` là **tên sai** (kết quả công khai nổi bật là mô hình dự đoán cấu trúc RNA, không liên quan Vietnamese NLP); `ViETeDis`, `VNIntent`, `Shopee-ITS_VL`, `UIT-VSPC`, `NLUI-VN` chưa có nguồn đủ chắc | `RP §7.3`, `§7.2`, `§7.9`; mỗi dataset phải được xác minh độc lập |
| PARK-08 | S4 Learning loop (`feedback_events`) | không nằm trong 5 mục; rủi ro "cần dữ liệu sử dụng" | `RP §7.10`, `§7.8` |
| PARK-09 | Fine-tune LLM cho policy QA | `NOTES-01 §B6`: "Không fine-tune LLM cho policy QA ở baseline"; phá yêu cầu trả lời kèm nguồn | `RP §7.5`; RAG baseline dưới ngưỡng |
| PARK-10 | CASL / ABAC | `NOTES-01 §B3`: "Không cần CASL ở MVP với chỉ hai role" | chỉ khi số `role` > 2; **không** dùng `level` để mở rộng quyền |
| PARK-11 | Namespace Socket.IO thứ hai | `NOTES-01 §B7`: "Không cần 2 namespace ngay" | khi traffic/room vượt khả năng 1 namespace |
| PARK-12 | ECharts / Ant Design thay shadcn/ui + Recharts | `NOTES-01 §B8`: "Không cần ECharts lúc này"; AntD "hơi nặng tay" | khi shadcn + Recharts không vẽ được loại biểu đồ F6 cần |

Ngoài ra, `00 §4` còn ghi rõ hai mục ngoài phạm vi khác: **multi-step approval & delegation** (chuẩn ngành có
thật theo `NOTES-01 §B0`, nhưng MVP chỉ 2 role và 1 cấp duyệt), **lương / phiếu lương / bảo hiểm** (không có
trong F1..F7 và không có collection nào trong `NOTES-01 §B4`), và **voice input / trả lời bằng ảnh, đa
phương tiện** (không có trong đầu bài, không có bằng chứng ngành ở vòng research 1).

### 7.2 Danh sách "không thêm ở baseline" của `NOTES-01` (kết luận + `02 §10`)

| Mục | Lý do | Điều kiện xem xét lại |
|---|---|---|
| **NestJS** | giữ Express — Express đã nằm trong đầu bài | `RP §7.1` |
| **Redis** | một instance: `Socket.IO + MongoDB`, không Redis | chỉ khi cần hơn 1 instance API |
| **BullMQ** | cần Redis; đã chọn Agenda vì Atlas có sẵn Mongo | khi durable queue/retry vượt khả năng Agenda `[CẦN NGUỒN]` |
| **Turborepo** | 3 người / 12 tuần → pnpm workspace đủ | khi CI/build **đo được** là chậm |
| **Qdrant** | F4 chạy cosine trong FastAPI, dành quota vector index cho policy | khi vượt 3 Search/Vector index của free tier [CẦN NGUỒN] |
| **LangChain / LangGraph** | agent loop tự dựng đã có guard đủ (`NOTES-01 §B6`) | khi guard tự dựng không kiểm soát được branch `[CẦN NGUỒN]` |
| **Microservice phức tạp** | baseline đã có đúng một ranh giới: Express API + FastAPI | không có kế hoạch tách thêm service nào `[CẦN NGUỒN]` |
| **Kubernetes** | đề cương chọn Render/VPS + Vercel/Netlify | khi free tier không gánh nổi tải demo `[CẦN NGUỒN]` |

### 7.3 Quyết định đã bị research **bác** (không phải backlog)

`OVERDUE` làm trạng thái (`§B4`) · transaction nhiều collection cho F2 (`§B1`) · F1 đơn độc làm metric ranking
Top-K (`§B5`) · giải thích matching bằng attention của PhoBERT (`§B14`) · cho LLM sinh KPI cuối (`§B6`) · cho
LLM viết Mongo pipeline tự do (`§B15`) · Git Flow (`§B11`) · live LLM eval chặn mọi PR (`§B10`).

---

## 8. Việc chưa chốt (ảnh hưởng trực tiếp tới yêu cầu)

| # | Treo ở đâu | Ảnh hưởng lên FR/NFR | Ai chốt |
|---|---|---|---|
| 1 | F1 ≥ 85% đo trên bài toán nào (`RP §7.2`, `NOTES-01 §B5`) | metric của FR-027, baseline của AI regression gate | GVHD |
| 2 | Dataset HR cuối cùng (`RP §7.3`) | FR-027, FR-060, FR-061 | GVHD + nhóm |
| 3 | 5 mục bổ sung chưa được duyệt (`RP §7.8`) | toàn bộ §3.9 | GVHD |
| 4 | Dữ liệu thật hay giả lập (`RP §7.10`) | seed của FR-060, UAT, PII ở NFR-03 | GVHD |
| 5 | Được gọi LLM bên thứ ba không; ràng buộc gửi dữ liệu nhân sự ra ngoài (`RP §7.5`) | NFR-12, FR-017 | GVHD |
| 6 | Định dạng báo cáo (`NOTES-01 §B12` = `UNRESOLVED`) | hạng mục 0.5 + 0.5 của rubric | GVHD/Khoa |
| 7 | URL cho mọi con số hạ tầng ở `NOTES-01 §B1` và mô hình ở `§B5` | NFR-08, NFR-06, FR-061 | nhóm bổ sung vào `NOTES-01` |
| 8 | TTL access/refresh, thuật toán hash `tokenHash` (`07 §10` A-01, A-03) | NFR-01 | nhóm |
| 9 | `Lead` có phải `Admin` không (`04 §9` Q-09) | FR-052 | GVHD |
| 10 | Agent loop nằm ở `apps/api` hay `apps/ai-service` (`02 §12` mục 4) | FR-015..021, hợp đồng nội bộ ở `06 §6` | nhóm + ADR mới |
| 11 | Chatbot có phải client cross-origin độc lập không (`02 §12` mục 7) | FR-050, cookie `SameSite` | nhóm |
| 12 | 2 intent **write** chưa có tool: "sửa số điện thoại" (FR-002), "gửi nhận xét" (FR-029) | hoặc đổi luồng nghiệp vụ, hoặc xin thêm tool kèm confirm | GVHD + nhóm |
| 13 | Hàng đợi duyệt field nhạy cảm của UF-01 chưa có chỗ lưu, trong khi `05 §1.1` đóng ở 11 collection | FR-003, FR-004 | nhóm + GVHD |
| 14 | Không có collection lưu lịch sử hội thoại (`05 §7` D-08) | FR-021 (chatbot không có "mở lại phiên cũ") | nhóm + GVHD |
| 15 | Các ô "Đo bằng" dẫn tới `08`, `09`, `10`, `12`, `13`, `14`, `16`, `17` — những file này do agent khác soạn **đồng thời** lúc file này viết | hợp đồng chéo: nếu một file đó đổi tên mục thì cập nhật cột "Đo bằng" ở đây | nhóm đồng bộ khi review docs |

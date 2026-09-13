# NOTES-02 — Vertical Workforce Flows (bản nhóm nộp, lưu nguyên văn)

> File này là **kết quả research vòng 2** do nhóm nộp, lưu nguyên văn để làm bằng chứng.
> Kèm báo cáo này nhóm nộp **URL nguồn** cho 4 sản phẩm (7shifts, MISA AMIS, Frontline, Red Rover) —
> một phần mục 'CẦN BỔ SUNG' #3 của NOTES-01.md.
> **Đối chiếu & quyết định ingest: xem docs/19-vertical-workforce-assessment.md.**


---

# NOTES-02 — Vertical Workforce Flows

**Project:** KLCN133 — *Chatbot chuyển đổi số quản lý nhân sự*  
**Status:** Research only — **PROPOSED**, chưa phải yêu cầu nghiệm thu  
**Date:** 2026-09-13

> Mục tiêu của tài liệu này là đánh giá khả năng chuyển từ mô hình “quản lý nhân sự theo phòng ban + đề tài” sang một **workforce operations platform hai phía**, trong đó quản lý vận hành bằng Dashboard và nhân viên dùng mobile/chatbot hằng ngày.
>
> Nguyên tắc: mọi kết luận bên dưới tách rõ **EVIDENCE**, **INFERENCE**, **RECOMMENDATION**. Không coi feature list là user flow. Không coi một flow chỉ có Admin là flow vận hành hoàn chỉnh.

---

# A. Executive conclusion

## A1. Có nên dùng một lõi chung không?

**RECOMMENDATION — Có.** Không nên tách thành hai sản phẩm F&B và School.

Lõi chung nên xoay quanh 5 khái niệm:

1. `Person / Employee`
2. `Organization Unit / Location`
3. `Work Assignment`
4. `Availability / Absence`
5. `Request / Approval / Notification / Audit`

F&B và trường học khác nhau chủ yếu ở **template nghiệp vụ**, điều kiện đủ năng lực và metadata của assignment:

- F&B: location, role, shift start/end, break, open shift, trade.
- School: campus, subject, class/session, teacher, substitute, lesson handoff.

Điểm không nên làm là dùng flow F&B rồi đổi chữ “crew” thành “teacher”. School có nghiệp vụ **absence → coverage → substitute eligibility → lesson handoff**, khác bản chất với shift trade.

## A2. “Ops Platform” trong F&B

**UNRESOLVED — cần cung cấp tên hoặc URL của Ops Platform.**

Trong nguồn công khai đã kiểm tra, “ops platform” xuất hiện như cách gọi chung cho nền tảng vận hành/restaurant operations/workforce operations. Chưa có bằng chứng đủ để xác định “Ops Platform” là một sản phẩm cụ thể mà người dùng đã nghe nói tới.

Không gán tên 7shifts, Deputy, MISA hay nhà cung cấp khác cho cụm từ này.

## A3. 4 flow nên bổ sung/điều chỉnh cho MVP

| Priority | Flow | Decision | Lý do |
|---|---|---|---|
| 1 | `VC-01` Assignment acknowledgement & request-change | **EXTEND** | Tận dụng trực tiếp UF-04/UF-05, ít phá data model, biến Employee thành actor thật sự |
| 2 | `VC-02` Availability / absence request | **NEW** | Dùng chung cả F&B và School, giá trị hằng ngày cao, có bằng chứng mạnh |
| 3 | `VF-01` Shift trade / open shift coverage | **NEW** | Flow F&B hai phía rất rõ, demo tốt với 1 manager + 2 employees |
| 4 | `VS-01` Teacher absence → substitute coverage | **NEW** | Flow School đặc thù, có bằng chứng công khai mạnh từ Frontline |

**PARK:** clock-in/out đầy đủ, payroll, POS, SIS/LMS, certification engine, onboarding/offboarding workflow hoàn chỉnh, performance suite mới, incident management đầy đủ, advanced rostering optimizer.

## A4. Thay đổi quyền tối thiểu

**RECOMMENDATION — PROPOSED:** Không biến `Teacher`, `Substitute Teacher`, `Crew`, `Shift Leader` thành các system role riêng.

Phương án phù hợp nhất:

- `Admin`: HR/system configuration, cross-location.
- `Manager`: **PROPOSED role mới**, chỉ thao tác trong organization scope được gán.
- `Employee`: self-service + assignment actions của chính mình.
- Persona như `Teacher`, `SubstituteTeacher`, `Crew`, `TeachingAssistant` là **profile type/capability/qualification**, không phải role.

Lý do cần `Manager`: Store Manager, Campus Manager, Scheduler hoặc Subject Lead có nhu cầu approve/assign hằng ngày nhưng không nên có toàn quyền Admin toàn công ty.

Nếu GVHD không duyệt role thứ ba, phương án fallback là giữ `Admin/Employee` nhưng thêm bắt buộc:
`scope.locationIds / scope.departmentIds / scope.campusIds` và capability flag ở server. Khi đó “Admin vận hành” phải bị giới hạn scope, không được hiểu là super-admin.

## A5. Giá trị cụ thể cho nhân viên

Nhân viên không chỉ “bị giao việc”. Họ phải có khả năng:

- xem assignment/lịch của mình;
- xác nhận, từ chối hoặc yêu cầu thay đổi;
- khai báo availability;
- theo dõi trạng thái request;
- nhận lý do khi bị từ chối;
- nhận và hoàn thành checklist;
- hỏi policy bằng chatbot;
- nhận notification có liên quan, có chống spam;
- chỉ xem dữ liệu cá nhân và dữ liệu tối thiểu cần để thực hiện assignment.

## A6. Rủi ro scope lớn nhất

Rủi ro lớn nhất không phải UI mà là **mở thêm domain model**.

Baseline hiện tại có 11 collection cố định và state machine xoay quanh `projects`. Workforce scheduling thật cần thêm dữ liệu như:

- location/campus;
- shift/session;
- availability;
- absence/request;
- coverage/trade;
- qualification/certification.

Do đó, không nên “nhét” mọi thứ vào `projects`. Nếu GVHD giữ nguyên 11 collection, chỉ nên triển khai `VC-01` bằng cách mở rộng lifecycle assignment hiện có và **park** các flow scheduling mới.

---

# B. Product landscape

| Product | Vertical | Market | Manager experience | Employee experience | Public workflow evidence | Evidence quality | Sources |
|---|---|---|---|---|---|---|---|
| 7shifts | F&B / restaurant | International | Schedule, availability approval, shift pool approval, task management scoped by location/department | Mobile schedule, availability, time-off, shift trade, open shifts, task completion, reminders | Employee trade → coworker accept/decline → manager approval → schedules update; availability pending/approve/decline; tasks mobile-only for employee | **HIGH** | 7shifts official Knowledge Base |
| MISA AMIS Chấm Công | General HR, strong Vietnam relevance | Vietnam | Shift/timekeeping, approve forms, attendance management | Mobile self-service, clocking, leave request; AI/AVA can create leave request and user can review/edit | Employee creates leave request via app/chat assistant; manager can approve on phone; employee can review/edit request | **MEDIUM-HIGH** | MISA AMIS official pages |
| Frontline Absence & Time | K-12 school | U.S. K-12 | Absence tracking, qualified substitute matching, assign substitute | Employee creates absence; substitute sees eligible jobs and accepts/rejects; mobile alerts | Teacher creates absence, can attach notes/files; system exposes jobs to eligible subs; sub accepts; admin can assign | **HIGH** | Frontline official help/product docs |
| Red Rover | K-12 school | U.S. K-12 | Absence/substitute administration | Substitute app/job acceptance, time tracking | Public school districts publish employee/substitute/admin training material | **MEDIUM** | Public district training pages/manuals; vendor flow not fully verified here |

### Evidence notes

**7shifts — EVIDENCE**

- Employee availability can be submitted and become `Pending`; manager approves/declines; employee receives result and can see request status.
- Shift trading: employee A offers a shift; employee B accepts or declines; where approval is enabled, manager approves/declines; both employees are notified; schedules update.
- Shift Pool eligibility can be restricted by location/department/role.
- Task Management: managers create/assign lists; employees complete tasks on mobile; task completion can require photo/value/temperature proof; overdue/incomplete alerts exist.

**MISA AMIS — EVIDENCE**

- Employee can view own attendance/leave information, clock in from mobile, create leave request.
- AVA can guide/create a leave request from chat; user provides reason/time, AVA confirms details before creating.
- User can check the request from app/web and edit it.
- Managers can approve requests on mobile.
- This is strong evidence that chatbot-assisted self-service is viable in Vietnam, but it is not F&B-specific evidence by itself.

**Frontline — EVIDENCE**

- Employee creates absence with date, reason, time and whether substitute is required.
- Employee can add separate notes for admin/substitute and attach lesson-plan files.
- Qualified/available substitutes can be searched/assigned.
- Substitute quick-start material shows available jobs with `Accept` / `Reject`.
- Product materials state substitutes can find and accept jobs online/mobile; admins can directly assign a substitute; lesson plans/notes may be attached.

---

# C. Employee Jobs-to-be-Done

## C1. F&B

| Persona | Situation | Employee needs to | Desired outcome | Current project support | Gap |
|---|---|---|---|---|---|
| Crew | Được xếp ca mới | Xem ca, địa điểm, vai trò; xác nhận đã nhận | Biết chính xác mình làm khi nào/ở đâu | UF-05 có assignment notification | Không có shift/time/location; không có accept/decline |
| Crew | Không làm được ca | Nhường/đổi ca, theo dõi trạng thái | Tìm người thay mà không nhắn thủ công | Không | Thiếu trade/coverage request |
| Crew | Lịch cá nhân thay đổi | Khai báo availability | Manager tránh xếp lịch xung đột | Không | Thiếu availability domain |
| Crew | Bắt đầu/kết thúc ca | Clock-in/out, break | Công được ghi nhận chính xác | Không | Ngoài baseline |
| Crew | Trong ca | Nhận checklist, hoàn thành, gửi bằng chứng | Biết việc cần làm, manager biết đã xong | UF-05 có progress/report tương tự | Chưa có task list/shift checklist |
| Crew | Có sự cố | Báo thiếu người/thiết bị | Quản lý biết và xử lý | Có submit_progress/report ở mức project | Thiếu incident type/priority |
| Crew | Cần biết quy định | Hỏi chatbot | Có câu trả lời có nguồn | UF-10 hỗ trợ tốt | Có thể REUSE |
| Crew | Có nhiều thông báo | Chỉ nhận thứ cần thiết | Không bị spam | UF-09 có dedupe/digest | Có thể REUSE/EXTEND |

## C2. School

| Persona | Situation | Employee needs to | Desired outcome | Current project support | Gap |
|---|---|---|---|---|---|
| Teacher | Có lịch dạy | Xem session/campus/subject | Biết chính xác lịch và nơi làm việc | UF-05 chỉ có project/dueDate | Thiếu teaching session |
| Teacher | Bị xung đột lịch | Báo xung đột/yêu cầu thay đổi | Scheduler xử lý trước giờ dạy | Không | Thiếu conflict/request |
| Teacher | Vắng đột xuất | Tạo absence + ghi chú/lesson plan | Lớp được tìm người thay | UF-02 PARKED | Thiếu absence/coverage |
| Substitute Teacher | Có job phù hợp | Xem thông tin tối thiểu, accept/decline | Nhận assignment phù hợp khả năng | UF-04 matching + UF-05 assignment có thể tái sử dụng một phần | Thiếu invitation/job response |
| Substitute Teacher | Sau khi nhận job | Xem handoff/lesson plan | Có đủ nội dung để dạy | reports/policies không phù hợp trực tiếp | Thiếu handoff artifact |
| Teacher/Sub | Muốn biết request đang ở đâu | Xem pending/accepted/declined/filled | Không phải hỏi HR thủ công | Notifications có nền tảng | Thiếu request state |
| Staff không giảng dạy | Làm ca tại campus | Xem/xác nhận ca | Vận hành như workforce staff | Có assignment cơ bản | Thiếu shift/session |

---

# D. Shared versus vertical-specific matrix

| Flow | Shared core | Employee action | Manager action | F&B variation | School variation | Evidence |
|---|---|---|---|---|---|---|
| Assignment acknowledgement | Có | View / accept / decline / request change | Assign / review response | Shift | Teaching session / duty | 7shifts + Frontline |
| Availability | Có | Submit/edit availability | Approve/decline, use in scheduling | Hours/day/location | Campus/subject/teaching windows | 7shifts strong; Frontline qualification/availability supports school staffing |
| Absence / time-off | Có | Create request, view status | Approve/deny; trigger coverage | Time off affects shifts | Absence may require substitute | MISA + 7shifts + Frontline |
| Coverage replacement | Có pattern, khác implementation | Offer/accept replacement | Validate eligibility and approve | Trade/drop/open shift | Qualified substitute job | 7shifts + Frontline |
| Checklist | Có | Complete tasks/proof | Create/assign/review | Open/close/cleaning checklist | Campus duty / mandatory operational checklist | 7shifts; school evidence weaker |
| Handoff | Có concept | Provide/acknowledge handoff | Monitor completeness | Shift notes | Lesson plan/notes/files | Frontline strong for school; F&B employee-side handoff not fully verified |
| Timekeeping | Có | Clock-in/out/break | Monitor/correct | Shift clock | Non-teaching staff and substitutes | MISA/7shifts/Frontline |
| Policy chatbot | Có | Ask policy | Maintain policy source | Labor/shift rules | School HR rules | Current UF-10 + MISA AI-agent evidence |
| Reminder/digest | Có | Receive relevant reminder | Receive exceptions/digest | Shift/task reminders | Absence/coverage/cert reminders | Current UF-09 + product evidence |

---

# E. Detailed two-sided flow catalog

## VC-01 — Assignment acknowledgement & request-change

1. **Mục tiêu nghiệp vụ:** biến assignment thành cam kết hai phía, không phải manager gán một chiều.
2. **Ngành:** Shared.
3. **Employee persona:** Crew / Teacher / Support Staff / Substitute.
4. **Manager persona:** Store Manager / Campus Manager / Scheduler.
5. **Trigger:** manager publishes or assigns work.
6. **Preconditions:** employee is in manager scope; assignment includes minimum details; employee is eligible.
7. **Swimlane:** `Employee → System → Manager`.

### Happy path

1. Manager tạo/chọn assignment và người phù hợp.
2. System gửi notification cho Employee.
3. Employee mở Chatbot/mobile: xem title, time/due, location/campus, role/subject và note tối thiểu.
4. Employee chọn `Accept`, `Decline`, hoặc `Request change`.
5. Với write action, Chatbot hiển thị confirm.
6. System ghi response + timestamp + actor + source.
7. Nếu `Accept`: assignment thành `ACCEPTED/CONFIRMED`.
8. Nếu `Request change`: Manager nhận queue item.
9. Manager approve/reassign/request more information.
10. Employee nhận final result và next step.

### State transition — PROPOSED

`OFFERED → ACCEPTED`  
`OFFERED → DECLINED`  
`OFFERED → CHANGE_REQUESTED → OFFERED/REASSIGNED`

Không tự ghép các state này vào `projects.status` hiện tại nếu chưa duyệt thay đổi domain model.

### Reject / cancel / expiry

- Employee decline phải có optional reason code/comment.
- Manager may reassign.
- Offer can expire at a configured time; con số cụ thể `TBD`.
- Employee may withdraw a change request before manager action if business rule permits.

### Không phản hồi

**RECOMMENDATION:** reminder có dedupe, sau ngưỡng `TBD` chuyển `NO_RESPONSE` và báo manager; không tự coi im lặng là accept.

### Notification

- Assignment published: event.
- Reminder: tối đa theo rule đã cấu hình, không spam.
- Decision result: event.
- Không gửi daily digest cho nhân viên nếu đã có actionable push.

### Employee data visibility

Chỉ:
- assignment của mình / offer mình đủ điều kiện;
- location/campus, time, required role/subject;
- instruction cần thiết;
- trạng thái request của chính mình.

Không thấy hồ sơ nhạy cảm hoặc KPI của đồng nghiệp.

### Manager data visibility

Chỉ nhân sự trong organization scope của manager, kèm:
- eligibility;
- availability conflict;
- workload summary tối thiểu;
- response state.

### Entity cần lưu

**PROPOSED:** assignment response/event. Nếu chưa thêm collection, có thể thử nghiệm bằng `project_events` nhưng phải thêm event type có kiểm soát; không nên sửa `projects.status` bừa.

### Audit/compliance

Mọi accept/decline/reassign phải có actor/time/source. Manager không tự approve request của chính mình nếu cùng actor.

### Chatbot

Phù hợp:
- “Ca/nhiệm vụ mới của tôi?”
- “Tôi nhận.”
- “Tôi không thể nhận, lý do…”
- “Yêu cầu đổi thời gian.”

### Confirm-before-write

Bắt buộc cho accept/decline/request-change nếu hành động tạo thay đổi nghiệp vụ.

### Evidence

- 7shifts employee shift trade/request status and manager approval.
- Frontline substitute accepts available job; admins can assign substitute.
- Current project already enforces confirm-before-write for write tools.

**Confidence: HIGH**

---

## VC-02 — Availability / absence request

1. **Mục tiêu:** nhân viên chủ động khai báo khả năng làm việc/vắng mặt; manager dùng dữ liệu đó trước khi assign.
2. **Ngành:** Shared.
3. **Employee persona:** Crew / Teacher / Staff.
4. **Manager persona:** Store Manager / Campus Manager / Scheduler.
5. **Trigger:** employee's personal availability changes or needs time off.
6. **Preconditions:** employee authenticated; scope known; request period is valid.
7. **Swimlane:** `Employee → System → Manager`.

### Happy path

1. Employee mở Chatbot/mobile và chọn Availability hoặc Absence.
2. Nhập date/time + optional reason.
3. System validate conflict and show summary.
4. Employee confirm.
5. System saves `PENDING` request and notifies manager.
6. Manager sees request in dashboard with affected future assignments.
7. Manager approves/declines/request-change.
8. System updates request state.
9. Employee sees state in mobile/chatbot and receives result.
10. Approved availability becomes an input to later assignment eligibility.

### State transition — PROPOSED

`DRAFT → PENDING → APPROVED | DECLINED`  
Optional: `PENDING → WITHDRAWN` before manager decision.

### Không phản hồi

- Employee draft: no reminder unless user explicitly starts and abandons a critical request.
- Manager pending request: one digest/reminder according to anti-spam policy.

### Notification

Event on submit and manager decision. Manager can receive digest for pending requests.

### Employee visibility

Own request, reason, date/time, current status, decision reason.

### Manager visibility

Request + necessary staffing impact. Avoid exposing unrelated personal/medical information.

### Entity

**PROPOSED NEW DOMAIN:** `availability_requests` / `absence_requests`, or a generalized `workforce_requests` if the team can prove schema remains simple.

Do not reuse `project.status`.

### Audit

Track submit, edit, withdraw, approve/decline, reason, actor, time.

### Chatbot

Very strong fit. MISA AMIS publicly demonstrates chatbot-assisted leave creation and confirmation.

### Confirm-before-write

Yes: submit/edit/withdraw.

### Evidence

- 7shifts Availability: employee submits; pending; manager approve/decline; employee sees status.
- MISA AMIS: employee creates leave request by app/AVA chat, AVA confirms information, user can review/edit; manager approves on mobile.
- Frontline: employee creates absence and receives confirmation.

**Confidence: HIGH**

---

## VF-01 — F&B shift trade / open-shift coverage

1. **Mục tiêu:** cover ca khi nhân viên không làm được mà không nhắn tin thủ công.
2. **Ngành:** F&B.
3. **Employee persona:** Crew A + Crew B.
4. **Manager persona:** Store Manager / Shift Leader.
5. **Trigger:** Crew A cannot work a scheduled shift.
6. **Preconditions:** published shift; employee belongs to location/department; eligible coworkers exist.
7. **Swimlane:** `Employee A → System → Employee B → System → Manager`.

### Happy path

1. Crew A opens own shift.
2. Chooses trade/drop/open-shift request.
3. System lists only eligible coworkers/open-shift candidates.
4. Crew A submits and confirms.
5. Crew B gets notification with time/location/role and accepts or declines.
6. If accepted and manager approval is required, request becomes `AWAITING_MANAGER_APPROVAL`.
7. Manager sees conflict/overtime/eligibility warnings.
8. Manager approves.
9. System atomically updates assignment owner.
10. Both employees are notified and both schedules refresh.

### State transition — PROPOSED

`ACTIVE_SHIFT → TRADE_REQUESTED → PEER_ACCEPTED → MANAGER_APPROVED → REASSIGNED`

Branches:
- `PEER_DECLINED`
- `MANAGER_DECLINED`
- `EXPIRED`
- `WITHDRAWN`

### Không phản hồi

Offer expires at business-rule deadline `TBD`; original employee remains responsible until approved.

### Notification

- Peer offer.
- Peer response.
- Manager decision.
- Final schedule changed.
- Avoid repeated reminders to all eligible employees; target only actionable recipients.

### Employee visibility

Coworker only sees data necessary for the shift. No phone, KPI, personal leave reason.

### Manager visibility

Request, employee eligibility, scheduling conflicts, overtime warning if available.

### Entity

Requires true `shift` / `shift_trade` semantics. **Do not represent a real shift as a project unless the thesis explicitly defines project as generic assignment.**

### Audit

Record requester, responder, approver, old/new assignee, timestamps and reason.

### Chatbot

Good:
- “Tôi không đi được ca tối mai.”
- “Có ai nhận ca này không?”
- “Tôi nhận ca trống 18:00–22:00.”

### Confirm-before-write

Required for offer, accept, withdraw; manager approval.

### Evidence

7shifts official employee + manager documentation verifies essentially this workflow: employee trade, other employee accept/decline, manager approval, notifications, schedule update, location/department/role eligibility.

**Confidence: HIGH**

---

## VS-01 — Teacher absence → substitute coverage

1. **Mục tiêu:** bảo đảm buổi học bị ảnh hưởng được cover bởi người đủ điều kiện, kèm handoff.
2. **Ngành:** School.
3. **Employee personas:** Primary Teacher + Substitute Teacher.
4. **Manager persona:** Campus Manager / Scheduler / HR.
5. **Trigger:** teacher reports an absence affecting a scheduled teaching session.
6. **Preconditions:** teaching session exists; absence requires substitute; substitute pool has qualification/availability data.
7. **Swimlane:** `Teacher → System → Manager/System → Substitute → System`.

### Happy path

1. Teacher opens Chatbot/mobile and reports absence.
2. Provides date/time/reason category and whether teaching session is affected.
3. Teacher adds notes/lesson-plan handoff or attachment reference.
4. System validates and shows confirmation summary.
5. Teacher confirms.
6. System identifies impacted session(s).
7. System filters eligible substitutes by campus, subject/skill/certification and availability.
8. Manager can review recommendation or directly publish coverage job.
9. Substitute receives job invitation with minimum class/session information.
10. Substitute accepts or rejects.
11. On accept, system locks coverage, updates the affected session/assignment and notifies teacher + manager + substitute.
12. Substitute can later mark assignment completed / submit short completion note.

### State transition — PROPOSED

Absence:
`DRAFT → SUBMITTED → COVERAGE_NEEDED → COVERED`

Coverage:
`OPEN → OFFERED → ACCEPTED | DECLINED → ASSIGNED → COMPLETED`

### Reject / edit / cancel

- Substitute decline → job remains/open again.
- Teacher may edit notes before session cutoff `TBD`.
- Teacher cancellation after coverage assignment must notify substitute and manager.
- Manager can manually assign a specific substitute.

### Không phản hồi

System may offer to another eligible substitute or escalate to manager. Do not auto-accept on behalf of substitute.

### Notification

- Absence created.
- Coverage job available.
- Accepted/rejected.
- Final assignment.
- Last-minute escalation if still unfilled; cadence `TBD`.

### Teacher visibility

Own absence, status, whether coverage is filled, handoff materials they supplied.

### Substitute visibility

Only minimum session data needed to perform job:
campus, date/time, subject/class identifier, room, contact/instruction, lesson plan/notes.

No access to unrelated teacher HR data.

### Manager visibility

Affected session, eligibility, substitute pool, coverage state, audit.

### Entity

**PROPOSED:** teaching session + absence + coverage request, or generic `work_assignment` with vertical metadata plus explicit coverage entity.

### Audit/compliance

Store actor/time/status; protect employee absence reason; treat attachments as restricted operational data.

### Chatbot

Excellent:
- teacher: “Tôi xin báo vắng tiết Toán sáng mai.”
- system: summarize affected session + confirm.
- substitute: “Có ca dạy thay nào phù hợp với tôi?”
- accept/decline with confirm.

### Confirm-before-write

Teacher absence submission; substitute accept; manager manual assignment.

### Evidence

- Frontline employee guide: create absence, substitute required flag, notes to administrator/substitute, file attachment, confirmation number.
- Frontline official substitute management: qualified substitute matching using skills/certifications/preferences; substitutes can find/accept jobs online/mobile; admins can assign; lesson plans/notes attach to the job.
- Frontline Substitute QuickStart Guide: available jobs expose Accept and Reject.

**Confidence: HIGH**

---

## VC-03 — Shift/session checklist & proof of completion

1. **Mục tiêu:** nhân viên biết “phải làm gì trong ca/session” và manager biết “đã làm chưa”.
2. **Ngành:** Shared core, stronger F&B evidence.
3. **Employee:** Crew / School Support Staff.
4. **Manager:** Store/Campus Manager.
5. **Trigger:** employee starts assignment.
6. **Preconditions:** assignment exists and checklist template assigned.

### Happy path

Manager publishes checklist → employee sees assigned list on mobile → marks items done → optional photo/value proof → system records who/when → manager sees progress/overdue.

### State

`NOT_STARTED → IN_PROGRESS → COMPLETED` with per-item completion events.

### Evidence

7shifts Task Management officially supports web creation/assignment, employee mobile completion, photo/value/temperature proof, reminders and incomplete alerts.

### School-specific caveat

Equivalent public school frontline evidence for daily operational checklists was not strong enough in this research pass.

**EMPLOYEE SIDE VERIFIED for F&B. SCHOOL SIDE NOT VERIFIED.**  
**Confidence: MEDIUM**

**MVP decision: PARK** unless VC-01/02 are already complete.

---

# F. Fit-gap với dự án

| Proposed flow | Existing UF/F | Employee value | Manager value | Reuse/Extend/New | Data impact | RBAC impact | Chatbot value | Complexity | Decision |
|---|---|---|---|---|---|---|---|---|---|
| VC-01 Assignment acknowledgement | UF-04, UF-05 / F2,F4,F7 | Rất cao | Cao | Extend | Thấp–TB | Ownership + response permission | Rất cao | 2/5 | **EXTEND** |
| VC-02 Availability/absence | UF-02 PARKED | Rất cao | Rất cao | New | Cao | Scoped approval | Rất cao | 4/5 | **NEW** |
| VF-01 Shift trade/open shift | Không có | Rất cao | Rất cao | New | Cao | Employee↔Employee + Manager | Cao | 4/5 | **NEW** |
| VS-01 Teacher absence/sub coverage | UF-02 + UF-04 pattern | Rất cao | Rất cao | New | Cao | Teacher/Sub eligibility + Manager | Rất cao | 4/5 | **NEW** |
| VC-03 Checklist | UF-05 progress gần nhất | Cao | Cao | New/Extend | Trung bình | Scope by assignment | Trung bình | 3/5 | **PARK** |
| Policy chatbot | UF-10 / F3 | Cao | Trung bình | Reuse | Không | Own/common policy | Rất cao | 1/5 | **REUSE** |
| Reminder/digest | UF-09 / F7 | Cao | Cao | Extend | Thấp | Own/scope | Trung bình | 1/5 | **EXTEND** |
| Clock-in/out | Không có | Cao | Cao | New | Cao | Location/device/time rules | Thấp | 4/5 | **PARK** |
| Onboarding/offboarding | UF-03 PARKED | Trung bình | Cao | New | Cao | Auth + checklist | Trung bình | 4/5 | **PARK** |
| Certification engine | Không có | Trung bình | Cao | New | Cao | Sensitive employee qualification | Trung bình | 4/5 | **PARK** |

---

# G. MVP recommendation

## G1. Scoring

Quy ước:
- 1 = thấp / dễ
- 5 = cao / khó
- Với `Complexity` và `Data/RBAC risk`, điểm thấp tốt hơn khi ra quyết định.

| Flow | Real-world prevalence | Employee daily value | Manager value | Cross-vertical | Chatbot demo | Thesis fit | Complexity | Data/RBAC risk | Recommendation |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| VC-01 Assignment acknowledgement | 5 | 5 | 5 | 5 | 5 | 5 | 2 | 2 | **MVP #1** |
| VC-02 Availability/absence | 5 | 5 | 5 | 5 | 5 | 4 | 4 | 4 | **MVP #2 if scope approved** |
| VF-01 Shift trade | 5 | 5 | 5 | 2 | 4 | 4 | 4 | 3 | **MVP vertical demo** |
| VS-01 Substitute coverage | 5 | 5 | 5 | 2 | 5 | 5 | 4 | 4 | **MVP vertical demo** |
| VC-03 Checklist | 4 | 4 | 4 | 4 | 3 | 3 | 3 | 2 | PARK |

## G2. Chốt tối đa 4 flow

**RECOMMENDATION:**

1. `VC-01 Assignment acknowledgement`
2. `VC-02 Availability/absence`
3. `VF-01 Shift trade/open shift`
4. `VS-01 Teacher absence → substitute coverage`

Nhưng có điều kiện scope:

- Nếu GVHD **không cho thêm entity/collection**, chỉ làm `VC-01`, mở rộng UF-09/UF-10 và dùng hai vertical demo ở mức template mô phỏng trên assignment hiện tại.
- Nếu GVHD cho mở scope có kiểm soát, làm đủ 4 nhưng **không** thêm payroll, full timekeeping, SIS/LMS/POS.

---

# H. Hai kịch bản demo end-to-end

## H1. F&B demo — “Không đi được ca tối”

### Accounts

- `manager.binhthanh@demo` — Manager, scope Store A.
- `crew.an@demo` — Employee, Barista.
- `crew.binh@demo` — Employee, Barista.

### Seed

- Store A.
- Shift S-101: 18:00–22:00, Barista, assigned to An.
- Binh cùng location/role và available.
- Notification channels active.
- Policy: quy định đổi ca.

### Dashboard

1. Manager xem published schedule.
2. Sau peer accept, manager thấy trade request.
3. Dashboard hiển thị eligibility/conflict.
4. Manager approve.
5. Manager thấy new assignee = Binh; audit shows An → Binh.

### Chatbot/mobile

1. An: “Tôi không đi được ca 18h mai.”
2. Bot nhận diện shift của An, hỏi `Trade / Drop / Request change`.
3. An chọn Trade và confirm.
4. Binh nhận notification: ca 18:00–22:00 Store A.
5. Binh xem detail và `Accept` + confirm.
6. An thấy `Awaiting Manager Approval`.
7. Manager approve trên Dashboard.
8. Cả An và Binh nhận final notification.

### State

`ASSIGNED_TO_AN → TRADE_REQUESTED → PEER_ACCEPTED → APPROVED → ASSIGNED_TO_BINH`

### Verifiable result

- Shift owner changed.
- Both employee schedules updated.
- Audit contains requester/responder/approver.
- Notification history contains peer offer + final result.
- An no longer owns the shift; Binh does.

---

## H2. School demo — “Giáo viên báo vắng, tìm người dạy thay”

### Accounts

- `scheduler.campusA@demo` — Manager, scope Campus A.
- `teacher.lan@demo` — Employee, subject=Math.
- `sub.minh@demo` — Employee profile type `SubstituteTeacher`, eligible=Math, Campus A.

### Seed

- Campus A.
- Teaching session TS-202: Grade 8 Math, tomorrow 08:00–09:00, Teacher Lan.
- Minh available and qualified.
- Lesson handoff: “Chương 3, bài 2”, attached/linked lesson plan.
- Policy: absence procedure.

### Chatbot/mobile

1. Lan: “Tôi báo vắng tiết Toán lớp 8A sáng mai.”
2. Bot resolves TS-202.
3. Bot asks reason category + whether substitute required.
4. Lan adds lesson handoff.
5. Bot summarizes and asks confirmation.
6. Lan confirms.
7. Minh receives coverage job: Campus A, Math 8A, 08:00–09:00, lesson note.
8. Minh accepts + confirm.
9. Lan can ask: “Tiết của tôi đã có người dạy thay chưa?” → `COVERED by Minh`.
10. Minh after class marks completion / sends short note.

### Dashboard

1. Scheduler sees absence and affected session.
2. System shows qualified substitute candidate Minh.
3. Scheduler may publish or manually assign.
4. After Minh accepts, dashboard shows coverage filled.

### State

Absence:
`SUBMITTED → COVERAGE_NEEDED → COVERED`

Coverage:
`OPEN → OFFERED_TO_MINH → ACCEPTED → ASSIGNED → COMPLETED`

### Notifications

- Absence received.
- Coverage job invitation.
- Substitute accepted.
- Final coverage confirmation.
- Optional reminder before session, deduped.

### Verifiable result

- Original teacher remains owner of absence record.
- Substitute owns coverage assignment only.
- Lesson handoff is visible to substitute.
- Manager sees fill status.
- Audit identifies every actor.
- No unrelated teacher HR data is exposed.

---

# I. Đề xuất cập nhật tài liệu — không sửa trực tiếp

Tất cả nội dung dưới đây là **PROPOSED**.

## I1. `docs/18-user-flows.md`

Add:
- `VC-01` as extension of UF-05 or new UF for assignment response.
- `VC-02` availability/absence two-sided request.
- `VF-01` F&B shift trade.
- `VS-01` School substitute coverage.
- Explicit employee request state visibility.
- Explicit no-response branch.

Do not unpark UF-02 merely because research found evidence. It remains `PARKED — chờ GVHD` until approval.

## I2. `docs/01-requirements.md`

PROPOSED requirements:

- Employee can accept/decline/request-change an assignment.
- Employee can track request state.
- System enforces eligibility and organization scope.
- Manager cannot approve outside assigned scope.
- Employee cannot approve own request.
- All consequential writes have confirm-before-write and audit.
- Availability/absence only becomes `Must/Should` after GVHD scope approval.

## I3. `docs/04-domain-model.md`

PROPOSED additions only if approved:

- `Work Assignment` abstraction separated from `Project` where appropriate.
- `AvailabilityRequest`
- `AbsenceRequest`
- `CoverageRequest`
- `AssignmentResponse`
- Organization unit `Location/Campus`
- Qualification/capability data separate from system role.

Do **not** turn `Teacher`, `SubstituteTeacher`, `Crew` into RBAC roles by default.

## I4. `docs/05-data-model.md`

Current 11-collection baseline is not enough for authentic scheduling flows.

PROPOSED options:

### Option A — conservative
No new collection. Only implement `VC-01` using additional append-only assignment response events in existing structures. Vertical flows remain demo templates, not full scheduling.

### Option B — approved vertical MVP
Add the minimum set of collections/entities required for:
- `work_assignments` or `shifts/sessions`
- `workforce_requests` or explicit availability/absence
- `coverage_requests`

Do not add separate collection for every persona.

## I5. `docs/07-auth-rbac.md`

PROPOSED:

```
role = Admin | Manager | Employee
scope = { organizationId, locationIds?, departmentIds?, campusIds? }
capabilities = server-derived or configured for Manager
profile/persona = Crew | Teacher | SubstituteTeacher | TeachingAssistant | SupportStaff
```

Alternative fallback if 3 roles are rejected:

```
role = Admin | Employee
Admin + scopedOperationalManager flag/capabilities
```

This fallback is less clean because “Admin” would mean both super-admin and store/campus manager.

---

# J. Unresolved questions and Sources

## J1. Unresolved

1. **Ops Platform**
   - `UNRESOLVED — cần cung cấp tên hoặc URL của Ops Platform`.

2. **GVHD scope**
   - Is UF-02 allowed to move from PARKED to PROPOSED MVP?
   - Can baseline 11 collections be changed?
   - Can a third role `Manager` be added?
   - Is `projects` intended to represent generic work assignments or only project/deadline work?

3. **F&B interview questions**
   - Người lao động thường đổi ca bằng app hay Zalo/Messenger?
   - Manager có bắt buộc duyệt mọi đổi ca không?
   - Ai chịu trách nhiệm tới khi đổi ca được duyệt?
   - Có ràng buộc skill/role/location khi nhận ca?
   - Có giới hạn giờ làm/overtime cần cảnh báo không?
   - Checklist mở/đóng ca có cần ảnh bằng chứng không?
   - “Không đi được ca” có khác “xin nghỉ phép” không?

4. **School interview questions**
   - Giáo viên báo vắng cho ai và bằng kênh nào?
   - Scheduler có pool giáo viên thay thế riêng không?
   - Điều kiện đủ để dạy thay là môn, chứng chỉ, cơ sở hay kinh nghiệm?
   - Lesson plan/handoff hiện gửi qua đâu?
   - Substitute cần thấy bao nhiêu thông tin lớp học?
   - Ai xác nhận buổi dạy thay hoàn thành?
   - Nhân viên không giảng dạy có dùng ca giống F&B không?

5. **Data/privacy**
   - Absence reason nào được coi là nhạy cảm?
   - Có được hiển thị tên đồng nghiệp trong shift pool không?
   - Audit retention bao lâu? `TBD`.
   - Request edit/withdraw cutoff là khi nào? `TBD`.

## J2. Sources — official/public

### 7shifts

- Approve Availability Requests  
  https://kb.7shifts.com/hc/en-us/articles/4417519789587-Approve-Availability-Requests
- How to Trade Shifts (for Employees)  
  https://kb.7shifts.com/hc/en-us/articles/4417505341715-How-to-Trade-Shifts-for-Employees
- Approve or Deny Shift Pool Requests  
  https://kb.7shifts.com/hc/en-us/articles/4417505005459-Approve-or-Deny-Shift-Pool-Requests
- Manager Permissions  
  https://kb.7shifts.com/hc/en-us/articles/4417519940499-Manager-Permissions
- 7shifts 101: Task Management  
  https://kb.7shifts.com/hc/en-us/articles/4417520173075-7shifts-101-Task-Management
- Downloading the 7shifts Mobile Apps  
  https://kb.7shifts.com/hc/en-us/articles/37315066595219-Downloading-the-7shifts-Mobile-Apps

### MISA AMIS

- MISA AMIS Chấm Công  
  https://amis.misa.vn/amis-cham-cong/
- AI Agent Chấm Công  
  https://amis.misa.vn/ai-agent-cham-cong/
- Lập đơn xin nghỉ trên app MISA AMIS / MISA AVA  
  https://amis.misa.vn/196443/ava-lap-don-xin-nghi/

### Frontline Education

- Employee Web Guide — Absence Creation  
  https://help.frontlinek12.com/Employee/HelpGuide/desktop/Absence_Creation.htm
- Substitute Management System  
  https://www.frontlineeducation.com/school-hcm-software/absence-management/substitute-management-system/
- Absence & Time Management  
  https://www.frontlineeducation.com/school-hcm-software/absence-management/
- Substitute QuickStart Guide (public PDF mirror)  
  https://d16k74nzx9emoe.cloudfront.net/ff6c76f8-02ab-45d0-a4aa-cf6bcc1e815d/SubstituteQuickStartGuide-English.pdf

### Independent/public implementation evidence

- Selah School District — employee/substitute/admin Red Rover resources  
  https://www.selahschools.org/departments/business-services/employee-time-off-and-reporting

---

# Final recommendation

**Build one configurable workforce core, not two products.**

For the thesis, the most defensible path is:

1. Keep current F1–F7 as baseline.
2. **EXTEND UF-05 with employee acknowledgement/request-change first.**
3. Ask GVHD to approve one new shared request domain: availability/absence.
4. Use two industry templates for demo:
   - F&B: shift trade.
   - School: teacher absence → substitute coverage.
5. Add only one middle operational authorization concept: **Manager + organization scope**, or scoped Admin if GVHD refuses a role change.
6. Reuse existing chatbot policy, notification, audit and confirm-before-write infrastructure.
7. Do not build payroll, POS, SIS, LMS, full rostering optimization or full certification management.

This gives the employee a real daily workflow while keeping the research aligned with a 3-person / 12-week thesis scope.

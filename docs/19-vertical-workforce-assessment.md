# 19 — Đánh giá NOTES-02 (Vertical Workforce Flows) & quyết định phạm vi

- Nguồn được đánh giá: [`research/NOTES-02.md`](research/NOTES-02.md) (nhóm nộp, 13/09/2026)
- Người đánh giá: agent — dựa trên **kiểm chứng độc lập** các URL trong NOTES-02, không dựa trên uy tín của báo cáo.
- Ngày: 13/09/2026
- Mọi sửa đổi vào `docs/` khác phải dẫn ngược về file này.

---

## 0. Kết luận một câu

**Không xây hai sản phẩm F&B và School.** Nhưng NOTES-02 tìm ra **một lỗ hỏng thật** trong thiết kế hiện tại —
nhân viên không có quyền *chấp nhận / từ chối* việc được giao — và mục đó **làm được ngay trong baseline,
không thêm collection nào**. Đó là phần đáng giá nhất của vòng này.

---

## 1. Việc đầu tiên: kiểm chứng nguồn của NOTES-02

NOTES-01 mất toàn bộ URL khi paste; lần này nhóm có nộp link. Tôi fetch từng cái:

| Nguồn | Tình trạng kiểm chứng | Nội dung thực tế khớp với tuyên bố? |
|---|---|---|
| 7shifts KB — How to Trade Shifts (4417505341715) | ✅ tồn tại, cập nhật 18/08/2026 | ✅ khớp, **và còn mạnh hơn** những gì NOTES-02 viết (xem §2) |
| 7shifts KB — Approve Availability Requests (4417519789587) | ✅ tồn tại, cập nhật 03/09/2026 | ✅ khớp |
| 7shifts KB — Approve or Deny Shift Pool Requests (4417505005459) | ✅ tồn tại, cập nhật 11/09/2026 | ✅ khớp |
| 7shifts KB — Manager Permissions (4417519940499) | ✅ tồn tại, cập nhật 03/09/2026 | ✅ (chưa mổ chi tiết) |
| 7shifts KB — 7shifts 101: Task Management (4417520173075) | ✅ tồn tại, cập nhật 28/07/2026 | ⚠️ khớp, **nhưng** trang ghi rõ Tasks là **gói trả phí** ⇒ là tuyên bố sản phẩm, không phải chuẩn ngành |
| MISA AMIS — AVA lập đơn xin nghỉ (196443) | ✅ HTTP 200, title "Lập đơn xin nghỉ và kiểm tra phòng họp trống trên app MISA AMIS" | ✅ **nguồn quý nhất cho đề tài của mình** (VN + chatbot tạo request + user review) |
| Frontline — Employee Web Guide: Absence Creation | ✅ HTTP 200 | ✅ khớp |
| Frontline — Substitute Management System | ✅ HTTP 200 | ✅ khớp |
| Selah School District (Red Rover) | ⚠️ 403 từ máy này (chống bot), **không** kết luận là sai | NOTES-02 tự đánh "MEDIUM / not fully verified" → giữ nguyên mức đó |
| CloudFront PDF — Substitute QuickStart | ⚠️ chưa fetch lại | — |

**Kết luận về chất lượng:** đây là vòng research **có bằng chứng đầu tiên** của đề tài. Hai vòng trước
(NOTES-01) không kiểm chứng được nguồn nào. Vì vậy các phát hiện dưới đây được nâng từ "nhóm nói" lên
"nguồn công khai nói".

> Việc còn lại của nhóm: tự mở lại 2 link bị 403 (Selah, cloudfront PDF) trên trình duyệt và xác nhận,
> hoặc **xoá** chúng khỏi Tài liệu tham khảo. 403 từ script không phải bằng chứng rằng link hỏng.

---

## 2. Điều nguồn nói, và điều nó buộc mình phải sửa

### 2.1 — `VC-01` là lỗ hỏng thật, không phải tính năng trang trí

Trạng thái hiện tại của bộ docs (`04-domain-model.md` §4, `18-user-flows.md` UF-04/UF-05): đề tài đi
`DRAFT → ASSIGNED → IN_PROGRESS → …`. **Nhân viên không có bước nào để nói "tôi nhận" hay "tôi không nhận".**

Đây là lỗi của thiết kế hiện tại, và chính `04-domain-model.md` **lúc đó** đã tự đánh dấu nó là **Q-02 chưa trả lời** (sau vòng này đổi thành **PARTIALLY RESOLVED / PROPOSED** — xem §6 file này)
("Nhân viên có được từ chối đề tài được giao không? `B0` có UF-04 'chấp nhận/từ chối', `B4` state machine
**không có nhánh này**"). NOTES-02 trả lời đúng câu đó, và có bằng chứng ngành:

> 7shifts: *"Employees can only trade shifts with other employees who share the same locations, departments,
> and roles… The original shift remains the responsibility of the employee **until** the shift trade request is
> approved by management."*

Câu thứ hai là quy tắc nghiệp vụ đáng học nhất trong toàn bộ NOTES-02: **trách nhiệm không chuyển bằng
tuyên bố, nó chuyển bằng phê duyệt.** Gán việc mà không có bước xác nhận thì khi trễ, không ai nhận phần
trễ đó là của mình — đúng vào cái F7 (nghiệm thu) và nhắc hạn đang yếu.

**Giới hạn của bằng chứng này — Q-02 chỉ PARTIALLY RESOLVED / PROPOSED.** Trích dẫn trên nằm trên trang
*Trade Shifts*: nó nói về một ca **đã được giao cho A** rồi A mới xin đổi cho B. Nó **không** phát biểu về
*initial project assignment* — đúng chỗ mà `04-domain-model.md` đang dùng nó để chốt "trách nhiệm vẫn thuộc
người được giao tới khi Admin xử lý phản hồi". Đó là **analogy cùng hình dạng** (trách nhiệm chuyển bằng phê
duyệt), **không** phải bằng chứng trực tiếp. Vì vậy Q-02 chỉ được ghi là **PARTIALLY RESOLVED**, và phần schema
lý do (`reasonCode`/`comment`) cùng đường reassign/resolution giữ nhãn **PROPOSED** — xem §6 file này.

### 2.2 — Vì sao **không** tách F&B / School

Đề tài KLCN133 được duyệt với phạm vi "quản lý nhân sự trong doanh nghiệp", F1–F7, 12 tuần, 3 người.
`shift` và `teaching session` là **hai domain model mới**, không phải hai template:

| Thêm | Kéo theo |
|---|---|
| `shift` / `session` | lịch theo tuần, trùng lịch, múi giờ ca, nghỉ giữa ca, coverage → **state machine thứ hai song song** với `projects` |
| `availability` | nhập liệu định kỳ từ nhân viên → nguồn dữ liệu mới, vòng đời mới, màn hình mới |
| `qualification` / chứng chỉ | NOTES-02 đúng khi nói đây **không phải** role — nhưng nó là một trục dữ liệu mới, và là dữ liệu **nhạy cảm** |
| `Manager` role thứ ba | trái ràng buộc đã chốt: `NOTES-01 §B3` và **ADR-009** tách `role` khỏi `level`, MVP chỉ 2 vai |

Nó cũng va đúng **R4** (`00-vision-scope.md` §6: xác suất **Cao** — chạy song song 7 chức năng + 5 mục bổ
sung với 3 người / 12 tuần). Mỗi flow dọc ở NOTES-02 tự chấm complexity **4/5**; lấy hai flow là ~8/10 của
một học kỳ. Không có chỗ trong lịch.

Ngoài ra: NOTES-02 tự ghi **"Không phải feature list là user flow"** — tôi áp lại chính xác câu đó vào phần
đề xuất của họ. Bốn flow VF/VS/VC-02/VC-03 là *capability list* của sản phẩm khác, không phải phát hiện từ
**khảo sát hiện trạng** (mục mà đề cương cho 0.75đ và rubric gọi tên rõ: cơ cấu tổ chức, quy trình, biểu mẫu
của *đơn vị được khảo sát*). Chưa có một cuộc phỏng vấn người dùng thật nào trong hai vòng research.

### 2.3 — Hai ý của NOTES-02 đúng và nên lấy **bất kể** có làm scheduling hay không

**(a) Tách "ai được duyệt" khỏi "ai là admin".** Nhận xét của NOTES-02 về fallback rất chính xác:
*"Admin sẽ phải mang nghĩa vừa là super-admin vừa là quản lý cửa hàng/cơ sở"* — và chính trang 7shifts xác
nhận ngành giải quyết việc này bằng **permission + scope**, không bằng cách nâng role:
*"…who has the permission 'Can manage other employees' availability' enabled, **and is assigned to the same
Department** as the Employee"*.

Đối chiếu ADR-009: mình **không** thêm `Manager` làm role thứ ba (trái ràng buộc đã chốt và trái ADR-009),
nhưng **phải** giới hạn Admin thao tác trong `departmentId` được gán, nếu không thì `get_department_kpi` và
`find_candidates` cho phép một Admin bất kỳ đọc số liệu cả công ty. Đây là thay đổi nhỏ, không phá model,
và nó là **ràng buộc quyền**, không phải tính năng. → chuyển vào `07-auth-rbac.md` + `13-security.md`.

**(b) Nguyên tắc "nhân viên chỉ thấy dữ liệu tối thiểu cần để làm việc".** Bảng visibility của NOTES-02
(§E mỗi flow) viết tốt hơn phần mình đang có: *không lộ SĐT, KPI, lý do nghỉ của đồng nghiệp*. Đối chiếu
`18-user-flows.md`: intent "tìm top 5 nhân viên" và tool `find_candidates` hiện **không** nói kết quả trả về
trường nào. → ghi thành BR + siết response schema.

---

## 3. Bảng quyết định

Ký hiệu: **LÀM** = vào baseline kỳ này · **CÂN NHẮC** = chỉ khi GVHD duyệt mở phạm vi · **PARK** = ghi rõ lý do.

| Mục NOTES-02 | Quyết định | Lý do | Việc cụ thể phát sinh |
|---|---|---|---|
| **VC-01** Assignment acknowledgement | **LÀM** (extend) | Q-02 **PARTIALLY RESOLVED / PROPOSED**: nguồn 7shifts là *shift-trade analogy*, **không** chứng minh trực tiếp trách nhiệm của *initial* assignment; **không thêm collection**; giá trị nghiệp vụ thật (trách nhiệm tới khi duyệt) | UF-04/UF-05 thêm bước acknowledge/decline/request-change; event type mới trong `project_events`; 3 intent chatbot mới; schema lý do (`reasonCode`/`comment`) và đường reassign/resolution còn **PROPOSED** (§6 file này) |
| **Tách "duyên trong phạm vi" khỏi super-admin** (ý sau §2.3a) | **LÀM** (dưới dạng scope, **không** phải role mới) | ADR-009 giữ 2 role; 7shifts chứng minh ngành dùng permission+scope; đây là kiểm soát truy cập, không phải tính năng | `07-auth-rbac.md`: thêm cột/mục *scope enforcement*; `13-security.md`: threat "Admin đọc chéo phòng ban" |
| **Nguyên tắc dữ liệu tối thiểu cho Employee** | **LÀM** | Chi phí = vài dòng response schema, lợi ích = chặn lộ PII | `06-api-spec.md` siết field trả về của `find_candidates` / `get_employee` |
| **VC-02** Availability / absence | **CÂN NHẮC** | Trùng UF-02 (đang PARK); là domain model mới (`availability_requests`) → phá baseline 11 collection; **nhưng** MISA AMIS là bằng chứng VN mạnh nhất cho chatbot-tạo-đơn | Nếu GVHD duyệt: là flow thứ 2 có giá trị nhất sau VC-01. Cần thêm 1 collection + 1 state machine request |
| **VF-01** Shift trade (F&B) | **PARK** | Cần `shift` thật; NOTES-02 tự ghi *"Do not represent a real shift as a project"* ⇒ hoặc là model mới, hoặc là giả mạo phạm vi | `backlog-parked.md` PARK-13 |
| **VS-01** Teacher absence → substitute | **PARK** | Sai ngành so với đề tài đã duyệt; cần `teaching session` + `coverage` + `qualification` | PARK-14 |
| **VC-03** Checklist + bằng chứng | **PARK** | Bằng chứng là **gói trả phí** của 7shifts (không phải chuẩn ngành); NOTES-02 tự hạ confidence MEDIUM và tự đề nghị PARK | PARK-15 |
| **Clock-in/out, payroll, POS, SIS/LMS, certification engine** | **PARK** (đã có trong "Không làm ở baseline") | NOTES-02 đồng ý | không đổi |
| **Đổi 11 collection baseline** | **KHÔNG** — chờ GVHD | `05-data-model.md` đang chốt 11; phương án Option A của NOTES-02 (append-only event, không collection mới) chính là đường VC-01 đang đi | — |
| **`Manager` role thứ ba** | **KHÔNG** — chờ GVHD | Trái `NOTES-01 §B3` + ADR-009; fallback scope ở trên giải quyết 80% nhu cầu với 5% chi phí | PARK-16 |

**Về gợi ý "một lõi chung để sau này bung ra 2 ngành":** đúng về kỹ thuật, sai về ưu tiên. Đây là khóa luận,
không phải sản phẩm thương mại. Thiết kế `department` + `projects` + `workload` **đã** là lõi chung rồi;
viết thêm lớp "vertical template" trừ bị cho hai ngành mình không khảo sát là đúng nghĩa *speculative
generality*. Không làm.

---

## 4. Những gì tôi đã đổi trong bộ docs sau đánh giá này

| File | Thay đổi |
|---|---|
| `research/NOTES-02.md` | lưu nguyên văn bản nộp (new) |
| `19-vertical-workforce-assessment.md` | file này (new) |
| `04-domain-model.md` | **Q-02 PARTIALLY RESOLVED / PROPOSED** (chưa đóng — 7shifts chỉ là *analogy*); thêm quy tắc xác nhận assignment (append-only event, **không** phải state thứ 6 của `projects`); BR mới cho "trách nhiệm chuyển khi được duyệt"; thêm quy tắc scope của Admin |
| `18-user-flows.md` | UF-04/UF-05 thêm bước Employee **Accept / Decline / Request change** + confirm + nhánh không phản hồi; catalog intent +3; notification matrix +2 dòng |
| `01-requirements.md` | FR mới cho acknowledgement (nhóm F2/F7), FR scope cho quyền |
| `05-data-model.md` | `project_events.type` mở rộng có kiểm soát (thêm loại event xác nhận); ghi rõ **không** thêm collection mới cho VC-01 |
| `06-api-spec.md` | siết **dữ liệu tối thiểu** trong response của `find_candidates`/`get_employee` |
| `07-auth-rbac.md` | mục thực thi **scope** cho Admin (không thêm role); quy tắc "không tự duyệt yêu cầu của chính mình" |
| `13-security.md` | threat mới: đọc chéo phòng ban / lộ PII của đồng nghiệp |
| `backlog-parked.md` | PARK-13 VF-01, PARK-14 VS-01, PARK-15 VC-03, PARK-16 role `Manager`, và cập nhật UF-02/VC-02 với **bằng chứng mới + URL** |
| `README.md` | bảng tài liệu thêm NOTES-02 và file này |

Không có file nào ở trên đổi **enum 5 state** của `projects`, và không có collection mới nào được thêm.

---

## 5. Việc còn treo — sau vòng 2

| # | Việc | Ai | Ghi chú |
|---|---|---|---|
| 1 | **Phỏng vấn hiện trạng thật** ≥1 đơn vị (đúng nghĩa mục rubric 0.75đ): dùng đúng bộ câu hỏi §J1 của NOTES-02. Đây là thứ còn thiếu **lớn nhất** của cả hai vòng research — mọi vòng trước chỉ đọc sản phẩm, chưa lần nào hỏi người làm HR | nhóm | Không có cái này thì "thêm flow" vẫn là suy đoán từ vendor |
| 2 | GVHD duyệt 3 câu mới (§7.11–7.13): có cho thêm **collection** không, có cho **scope quyền** không, VC-02 (nghỉ phép) có vào phạm vi không | nhóm gửi | Đang chặn VC-02 |
| 3 | Xác nhận tay 2 link 403 hoặc xoá khỏi danh mục tham khảo | nhóm | Selah, cloudfront PDF |
| 4 | Bổ sung URL cho các phát hiện của **NOTES-01** (Personio workflow, Lattice calibration, Oracle HCM confirm) — đến giờ vẫn chưa có | nhóm | ADR-013 và `18-user-flows.md` còn nợ chỗ này |
| 5 | Các con số hạ tầng B1 (Atlas M0, Vector Search, Render sleep) vẫn **chưa có URL** — rủi ro lớn nhất vẫn là *Atlas Vector Search có trên M0 hay không* | nhóm | chặn ADR-005 và toàn bộ RAG |

---

## 6. Resolved / Still open — hợp đồng assignment acknowledgement

Ghi lại trạng thái chốt của hợp đồng này **tại thời điểm đồng bộ docs**, để §2–§4 ở trên không bị đọc như một
bản đã đóng hoàn toàn. Mọi mục `PROPOSED` dưới đây **chưa** qua phỏng vấn hiện trạng thật và **chưa** có GVHD duyệt.

### 6.1 Đã chốt — dùng được để code

| Hạng mục | Chốt | Nguồn |
|---|---|---|
| Event canonical | `project_events.type` nhận đúng ba giá trị mới: `ACKNOWLEDGED` / `DECLINED` / `CHANGE_REQUESTED`. **`ACCEPTED` không phải** giá trị canonical — nó chỉ còn trong `research/NOTES-02.md` (raw research) và trong câu trích state của NOTES-02 | `04 §4.6`, `05 §3.5`, BR-21 |
| Request enum + mapping | `response ∈ {ACKNOWLEDGE, DECLINE, REQUEST_CHANGE}`; mapping 1–1 sang event: `ACKNOWLEDGE→ACKNOWLEDGED`, `DECLINE→DECLINED`, `REQUEST_CHANGE→CHANGE_REQUESTED` | `06 §2.4` (bảng mapping) |
| Không phải state | Phản hồi là **dữ kiện append-only**; `projects.status` vẫn đúng 5 giá trị; không có state/transition mới | BR-21, `04 §4.6` |
| Actor hợp lệ | Chỉ actor đang nằm trong `assigneeIds` được phản hồi, **bất kể `role`**; Admin **không** phản hồi thay Employee; người gọi ngoài `assigneeIds` → `NOT_ASSIGNEE` | `07 §7.2` + `07 §7.4` SC-04, `06 §5` |
| Vocabulary field | `project_events.assigneeId` (đổi tên từ `respondeeId` — xem `05 §3.5`) | `05 §3.5` |
| Trách nhiệm | `DECLINED` không tự gỡ `assigneeIds`; người được giao vẫn chịu trách nhiệm tới khi Admin xử lý phản hồi | BR-21, `04 §4.6` |

### 6.2 Còn mở — chặn code hoặc chặn quyết định

| # | Còn mở | Vì sao chưa đóng | Ai chốt | Chỗ ghi |
|---|---|---|---|---|
| 1 | **Q-02 chỉ PARTIALLY RESOLVED / PROPOSED** | Nguồn 7shifts là *shift-trade analogy*: trang đó nói về một ca **đã giao** rồi mới xin đổi, **không** phát biểu về trách nhiệm của *initial* assignment. Chưa có nguồn nào chứng minh trực tiếp quy tắc "trách nhiệm vẫn thuộc người được giao tới khi quản lý duyệt" cho đề tài được giao lần đầu | nhóm + GVHD | Q-02 ở `04 §9`; §2.1 file này |
| 2 | **Schema lý do là PROPOSED**: `reasonCode` (bắt buộc với `DECLINED`/`CHANGE_REQUESTED`) + `comment` (tự do, optional); `ACKNOWLEDGED` không cần lý do | Chưa có phỏng vấn HR thật để chốt danh mục `reasonCode`; nguồn **không** bắt buộc field này | nhóm (phỏng vấn) + GVHD | `04 §4.6`, `05 §3.5`, `06 §2.4` |
| 3 | **Q-10 — chưa có đường "xử lý phản hồi"**: `POST /projects/:id/assign` chỉ hợp lệ ở `status = DRAFT`, nên **không** reassign được đề tài đang `ASSIGNED`; chưa có endpoint/transition nào để Admin đóng phản hồi | Contract hiện tại **không có cửa nào** để resolve một phản hồi. Đây là **câu hỏi chặn thiết kế Ticket/Project integration** — phải chốt trước khi code F2/F7 | GVHD + nhóm | Q-10 ở `04 §9`; D-15 ở `06 §8` |
| 4 | **Q-11 — stale-response race**: phản hồi ghi vào `project_events` **không** đổi `projects.version`, nên một phản hồi gửi trước khi Admin gán lại vẫn "thắng" khi đọc lại; không có luật nào vô hiệu hoá phản hồi đã cũ | Cần luật "phản hồi sau mốc gán lại bị vô hiệu" trước khi có Ticket/Project integration | nhóm + GVHD | Q-11 ở `04 §9`; D-16 ở `06 §8` |
| 5 | Ngưỡng ngày nhắc + escalate | NOTES-02 để `TBD`; docs **không** đoán số | nhóm | `04 §4.6`; `18` notification matrix |
| 6 | Tên tool chatbot cho ba intent `#12a..#12c` | Catalog `B6` đóng ở 15 tool; `E-01` ràng buộc `tool` thuộc đúng danh sách đó | nhóm + GVHD | D-14 ở `06 §8`; A-09 ở `07 §10` |
| 7 | **`ACKNOWLEDGED` có notify `Admin` hay không** | Notification matrix của `18` chỉ có dòng cho `DECLINED`/`CHANGE_REQUESTED` (cộng dòng escalate) — **không** có dòng nào cho `ACKNOWLEDGED`, dù đó là một phản hồi hợp lệ. Các câu mô tả "notify `Admin` sau mỗi phản hồi" đã được siết lại theo matrix | nhóm + GVHD | `18` notification matrix; `18` UF-04 bước 10 / UF-05 bước 2b |
| 8 | **Neo nguồn cho câu trích 7shifts** | Câu *"The original shift remains the responsibility of the employee **until** the shift trade request is approved by management"* (§2.1) chưa có URL/ID nội dòng và **không** nằm trong `research/NOTES-02.md`, nên không reproduce được từ repo (ID trang chỉ xuất hiện gián tiếp ở §1) | nhóm | §2.1 file này; §5 mục 4 |

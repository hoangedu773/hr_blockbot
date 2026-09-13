# 10 — UI/UX Spec: Dashboard nền tối & Khung chat

Khóa luận **KLCN133** — *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*. Nhóm 3 người, 12 tuần.

Hai bề mặt của cùng một hệ thống: **Web Dashboard** (nền tối, cho `Admin` là chính) và **Khung chat**
(kênh làm việc hằng ngày của `Employee`). Chúng chia sẻ một nguồn dữ liệu và một tập nghiệp vụ
(`00-vision-scope.md` §2), nên tài liệu này mô tả **một** hệ thống có hai cửa vào, không phải hai sản phẩm.

Nguồn (không có nội dung nào ngoài các nguồn này):

| Phần | Nguồn |
|---|---|
| Thư viện + hệ semantic token + dark qua token/theme + Recharts, không ECharts/AntD | `docs/research/NOTES-01.md` §B8, ADR-015 |
| Yêu cầu B8 trong plan: dark tokens, **WCAG AA**, màu chart phân biệt trong nền tối, chat UI (virtualized list, typing indicator, optimistic send, markdown + card, skeleton, responsive), `tabular-nums`, empty/error/loading | `docs/research/RESEARCH-PLAN.md` §3 B8 |
| Core Web Vitals là ngưỡng phải giữ khi thiết kế (CLS ↔ skeleton, INP ↔ tương tác bảng/chart) | `NOTES-01.md` §B9, `RESEARCH-PLAN.md` §11 |
| Format card giải thích gợi ý (breakdown đóng góp từng kỹ năng + workload penalty) | `NOTES-01.md` §B14, `04-domain-model.md` BR-11 |
| abstention / "hỏi lại" khi confidence thấp | `NOTES-01.md` §B13, `04-domain-model.md` BR-10 |
| 9 event Socket.IO, rooms, `clientMessageId` | `NOTES-01.md` §B7 |
| Hành vi từng luồng UF-01/04/05/06/09/10, catalog 28 intent, notification matrix | `18-user-flows.md` |
| Tool catalog (tên tool đọc/ghi) | `NOTES-01.md` §B6 |
| Index nào phục vụ query nào cho bảng có phân trang | `05-data-model.md` §4 |
| Rubric "Thiết kế giao diện" 0.5đ | `RESEARCH-PLAN.md` §1 |

> **Trạng thái repo:** chưa có mã nguồn (`README.md`), chưa có `apps/web`. Mọi "lệnh" trong file này là cam
> kết dựng cùng vòng scaffold. File này ghi **quy tắc thiết kế và cách đo**, **không ghi kết quả đo nào**.
> Số liệu trong các bảng `TBD` nghĩa là **chưa đo**, không phải "đã đạt".

---

## 1. Kiến trúc thông tin: ai thấy gì

| Bề mặt | Vai (`role`) | Vai trò | Vì sao nằm ở đây |
|---|---|---|---|
| **Dashboard** (`apps/web`, nền tối) | `Admin` (chính) + `Employee` (phụ) | *quản lý và phê duyệt*: danh mục đề tài, hàng đợi duyệt, KPI toàn công ty, biểu đồ biến động | `00-vision-scope.md` §2–§3 |
| **Khung chat** (cùng app, route riêng) | `Employee` (chính) + `Admin` | *làm việc và tra cứu*: hỏi hồ sơ/KPI/chính sách, cập nhật tiến độ, nộp báo cáo, nhận gợi ý phân công | `00-vision-scope.md` §3, `18-user-flows.md` (kênh `[CHAT]`) |

Nguyên tắc phân vùng (suy ra từ catalog tool `§B6` và permission matrix `07-auth-rbac.md` §7):

1. **Mọi ý định `Write` trong chat đều có bước xác nhận** (`§B6` guard "confirm write operations", S8). Chat
   không bao giờ mutate mà không có một màn hình confirm do người dùng bấm.
2. **Hai intent ghi chưa có tool** — "sửa số điện thoại" và "gửi nhận xét" (`18-user-flows.md`, catalog intent
   #2 và #23) — **chỉ tồn tại trên Dashboard**. Chat không được hiển thị nút cho việc hệ thống chưa làm được.
3. **Dữ liệu phòng ban chỉ `Admin`** (`07-auth-rbac.md` §7.1, BR-16 docs 04): mọi màn hình `department`
   trong sidebar bị ẩn khỏi `Employee`, không chỉ bị disable.
4. `level` (Intern/Junior/Middle/Senior/Lead) **là dữ liệu, không phải quyền** (`§B3`, ADR-009): UI hiển thị nó
   như một cột/badge, không bao giờ dùng nó để bật-tắt control.

---

## 2. Nền tối và token

### 2.1 Hệ token (đúng danh sách `NOTES-01 §B8`)

Toàn bộ màu đi qua **semantic CSS variables** do shadcn/ui cung cấp; dark mode là **đổi token**, không phải
sửa view (`§B8`, ADR-015 Điều 1).

| Token | Vai trò trong sản phẩm này | Xuất hiện ở |
|---|---|---|
| `background` | nền trang, canvas của dashboard và khung chat | mọi route |
| `foreground` | chữ chính trên `background` | mọi text |
| `card` | nền của **bề mặt nổi**: KPI card, bảng đề tài, message bubble của bot, popup confirm | Dashboard + Chat |
| `muted` | nền phụ / viền trong: header bảng, skeleton, zone bỏ trống, nhãn cấp 2 | mọi nơi cần "độ sâu thứ hai" |
| `primary` | hành động chính: nút xác nhận, link đang chọn, focus ring, điểm nhấn trong chart | CTA duy nhất trên một màn hình |
| `destructive` | hành động phá vỡ: từ chối báo cáo, huỷ đề tài, thu hồi phiên, xoá notification | chỉ trong dialog confirm và menu nguy hiểm |
| `chart-1` … `chart-5` | **màu chuỗi dữ liệu** — 5 màu, đủ cho tối đa 5 chuỗi trong một biểu đồ F6 | Recharts `Line`/`Bar`/`Area` |

Bốn quy tắc thi hành bằng code, không bằng lời nhắn:

1. **Không hard-code màu** trong component: không hex literal, không `text-white/50`, không `bg-[#0f172a]`.
   Đây chính là điều ADR-015 đã cảnh báo: *"Tailwind cho phép 'đi tắt' ngay bên cạnh hệ token. Cần rule lint
   cấm utility màu trực tiếp; nếu không có rule thì token chỉ là trang trí."*
   Rule lint: **chưa bật — chờ scaffold** (`packages/eslint-config`). Lệnh cam kết: `pnpm -r lint`.
2. **Chart cũng dùng token.** `§B8` chọn shadcn vì token phủ cả `chart-1..5`; vì vậy không có bảng màu biểu
   đồ riêng viết tay.
3. **Dark là chế độ mặc định của đề tài** (`RESEARCH-PLAN.md` §1: Dashboard **nền tối**). Light mode chỉ là hệ
   token thứ hai để demo lúc ban ngày; nếu bật, phải đổi token chứ không đổi component.
4. Palette cụ thể: **đề xuất của nhóm, chưa test tương phản bằng công cụ**.

| Token (dark) | Giá trị đề xuất | Ghi chú |
|---|---|---|
| `background` | `#0b0f14` | nền sâu, không phải đen tuyệt đối |
| `foreground` | `#e6e8eb` | |
| `card` | `#121821` | chênh với `background` ~1 bậc để phân biệt mặt nổi |
| `muted` | `#1a2230` / chữ phụ `#9aa4b2` | |
| `primary` | `#4c8dff` | một accent duy nhất |
| `destructive` | `#f2555a` | |
| `chart-1..5` | `#4c8dff`, `#3ecf8e`, `#f5b451`, `#e5639f`, `#8b8bf0` | 5 chuỗi tối đa; **không** thêm màu thứ 6 |

### 2.2 Tương phản — yêu cầu và trạng thái đo

- **Yêu cầu:** mọi cặp text/nền và mọi màu chuỗi dữ liệu trên nền tối phải đạt **WCAG 2.1 AA**
  (`RESEARCH-PLAN.md` §3 B8: "contrast WCAG AA trên nền tối, màu chart phân biệt được trong dark").
- **Công cụ đo:** `TBD — chưa chốt` (chưa có công cụ nào được khai báo trong `NOTES-01`; thêm một gate thì
  phải có lệnh chạy trong CI theo `RESEARCH-PLAN.md` §11).
- **Kết quả đo:** `TBD — chưa đo`. Không dòng nào ở §2.1 được chép vào báo cáo như "đã đạt AA" trước khi có
  số thật kèm ngày đo + commit.

Cấm hai kiểu "đo bằng mắt": (a) nói "tương phản tốt" vì nhóm nhìn thấy rõ trên màn hình của một người;
(b) lấy ảnh screenshot làm bằng chứng thay cho số.

---

## 3. Layout Dashboard

### 3.1 Khung

```text
┌────────────┬───────────────────────────────────────────────┐
│ Sidebar    │ Top bar: breadcrumb · search (chức năng)      │
│ (fixed)    │            · trạng thái kết nối WS · chuông   │
│            │            · avatar + role                    │
│ logo       ├───────────────────────────────────────────────┤
│ ─ nav      │ Content: 12-col grid, card = `card` token     │
│ ─ nav      │           KPI strip → chart → bảng chi tiết   │
│ ─ footer   │                                               │
└────────────┴───────────────────────────────────────────────┘
```

- Sidebar là vùng **ổn định về kích thước** (rộng không đổi khi đổi route) — đây là điều kiện để giữ CLS ở
  §B9, không phải sở thích thẩm mỹ.
- Top bar chứa **trạng thái kết nối realtime**: khi `apps/api` đang ngủ đông (`§B1`: sleep sau 15 phút không
  có traffic, wake-up có thể ~1 phút), người dùng phải thấy "đang kết nối lại" chứ không thấy một màn hình
  yên lặng như thể hệ thống chết (ADR-010 mục "Đánh đổi thật").

### 3.2 Route và màn hình (chỉ những luồng `IN SCOPE`)

| Route | Vai | Màn hình | Luồng nghiệp vụ | Nguồn hành vi |
|---|---|---|---|---|
| `/login` | cả hai | đăng nhập; sau khi reload chỉ còn cookie RT → tự `/auth/refresh` | nền tảng | `§B3`, `07-auth-rbac.md` §2 |
| `/overview` | `Admin` | KPI strip, số đề tài theo trạng thái, việc cần duyệt hôm nay | F6 | `18-user-flows.md` (UF-05/06/09 đích đến là dashboard) |
| `/employees` | `Admin` | danh mục nhân sự: mã, họ tên, phòng ban, `level`, kỹ năng | UF-01 (F1) | `§B0`, `05-data-model.md` §3.2 |
| `/employees/:id` | `Admin` | hồ sơ + kỹ năng + KPI các kỳ + đề tài đã tham gia | UF-01, UF-06 | `§B0` |
| `/me` | `Employee` | hồ sơ của mình + form sửa field thường + hàng đợi "chờ duyệt" của chính mình | UF-01 bước 2–4, 8 | `18-user-flows.md` UF-01 |
| `/departments` | `Admin` | phòng ban, nhân sự, điểm KPI trung bình | UF-01 (xem phòng ban) | `§B0`, `05` §3.3 |
| `/projects` | cả hai (`Employee` thấy `assigneeIds` chứa mình) | danh mục + lọc theo `status`/`dueDate`/phòng ban | UF-05 | `§B4` index, BR-16 docs 04 |
| `/projects/:id` | cả hai (own) | trạng thái + `statusHistory[]` + **lý do bị từ chối** + tiến độ + báo cáo | UF-05 bước 5–8 | `05` §3.4, `18-user-flows.md` UF-05 |
| `/projects/new` | `Admin` | tạo đề tài ở `DRAFT`, chọn kỹ năng yêu cầu, `dueDate` | UF-05 bước 1 | `18-user-flows.md` |
| `/projects/:id/assign` | `Admin` | hàng đợi gợi ý AI (card ở §5.2) → chọn → confirm `assign_project` | UF-04 | `§B0`, `§B14`, `§B6` |
| `/reviews` | `Admin` | hàng đợi báo cáo `PENDING_REVIEW`, đối chiếu `project_events`, approve/reject kèm lý do | UF-05 bước 6–8, F7 | `18-user-flows.md` |
| `/evaluations` | `Admin` | mở kỳ, self-review ↔ manager assessment ↔ `machineScore`, calibration, `override_kpi` (reason bắt buộc) | UF-06 | `§B0` (!), `§B6`, BR-07/08/09 docs 04 |
| `/evaluations/:employeeId/:period` | cả hai | breakdown `machineScore`, `finalScore`, `overrideReason`, `changedBy`, `changedAt` | UF-06 bước 5–8 | `05` §3.7 |
| `/kpi` | `Admin` | biểu đồ biến động KPI (§4) + tỷ lệ hoàn thành theo phòng ban | F6 | `RESEARCH-PLAN.md` §1 |
| `/notifications` | cả hai | hộp thoại in-app: chưa đọc/đã đọc, bấm tới đúng đối tượng theo `payload` | UF-09 bước 5–6 | `05` §3.9, `§B7` |
| `/chat` | cả hai | khung chat (§6) | UF-01/04/05/06/09/10 | `18-user-flows.md` |

**Không có route** cho UF-02 (nghỉ phép), UF-03 (onboarding), UF-07 (OKR), UF-08 (pulse survey): bốn luồng này
đang **`PARKED` — chờ GVHD duyệt mở scope** (`18-user-flows.md` "Flow inventory", NOTES-01 §B0 dòng chốt,
`backlog-parked.md` PARK-01/02/03/04). Không vẽ mock screen, không đặt tên route, không thêm sidebar item.

---

## 4. Biểu đồ F6 (Recharts)

`§B8` chốt Recharts; ADR-015 loại ECharts và visx. Hai loại biểu đồ đề cương gọi tên
(`RESEARCH-PLAN.md` §1: "biểu đồ biến động KPI (Recharts theo timeline tuần 3)"):

### 4.1 Line — biến động KPI theo tuần/tháng

| Hạng mục | Quy định |
|---|---|
| Trục X | chu kỳ (`period` của `evaluations`, `05` §3.6/D-06 — **format `period` chưa chốt**) |
| Trục Y | điểm KPI; **`finalScore`** là đường chính, `machineScore` là đường mờ để thấy mức hiệu chỉnh |
| Chuỗi | 1 chuỗi = 1 phòng ban (chế độ so sánh), tối đa **5** chuỗi vì chỉ có `chart-1..5` |
| Nguồn số liệu | **một** aggregation, không phải N request. Xem `12-performance.md` §4.2 |
| Interaction | hover tooltip hiển thị đúng giá trị + "tính tới thời điểm nào"; không zoom tự do ở MVP |
| Trạng thái dữ liệu | đủ 3: đang tải (skeleton, giữ nguyên chiều cao khung), không có kỳ nào (empty + giải thích vì sao + đường tới "mở kỳ"), lỗi (retry + mã lỗi từ error catalog `06-api-spec.md` — file chưa tồn tại) |

### 4.2 Bar — tỷ lệ hoàn thành theo phòng ban

| Hạng mục | Quy định |
|---|---|
| Đơn vị thanh | phòng ban; giá trị = tỷ lệ đề tài `COMPLETED` / tổng đề tài **không quá hạn** trong cửa sổ |
| Vì sao không phải "tỷ lệ theo status" | `status` chỉ có **5** giá trị `DRAFT/ASSIGNED/IN_PROGRESS/PENDING_REVIEW/COMPLETED`; `OVERDUE` **không phải state** (`§B4`) nên không có "thanh màu quá hạn" |
| Quá hạn thể hiện ở đâu | bằng **vị từ dẫn xuất** `dueDate < now AND status ≠ COMPLETED` (công thức gốc `§B4`; `CANCELLED` **không** nằm trong enum — `05` §7 D-03), thể hiện thành huy hiệu đỏ trên nhãn phòng ban, **không** thành một loạt dữ liệu |
| Màu | `chart-1` cho cột chính; `destructive` chỉ cho huy hiệu quá hạn |
| Số trên cột | `tabular-nums` (§9), có cả giá trị tuyệt đối trong tooltip |
| Tối đa | 5 phòng ban trong một biểu đồ + "xem tất cả" chuyển sang bảng; chống dashboard dày chart (`RESEARCH-PLAN.md` §3 B8 "anti-pattern dashboard dày chart") |

Nguyên tắc đọc số: **không vẽ số chưa đo và không vẽ số của model chưa chạy.** Card match (§5.2) mang nhãn
rõ "số minh hoạ format" khi demo bằng fixture, vì `§B14` nói thẳng con số trong card là format, không phải
kết quả model.

---

## 5. Inventory component

### 5.1 Bảng có phân trang — phân trang theo index nào

| Màn hình | Bảng | Phân trang/lọc theo | Index phục vụ (`05` §4.1) | Ghi chú |
|---|---|---|---|---|
| `/projects` | danh mục đề tài | lọc `status` + sắp `dueDate` | **I-02** `(status, dueDate)` | "đề tài sắp hết hạn"; job nhắc hạn đi cùng đường |
| `/projects` (chế độ *của tôi*) | đề tài của `Employee` | `(assigneeIds, status)` | **I-03** (multikey) | `list_projects` |
| `/departments`, `/kpi` | theo phòng ban | `(departmentId, status, dueDate)` | **I-04** | `get_department_kpi` |
| `/projects/:id` | báo cáo của một đề tài | `(projectId, createdAt)` | **I-05** | mới nhất trước; bản đang chờ duyệt |
| `/evaluations` | một kỳ | `(employeeId, period)` UNIQUE | **I-06** | một người một kỳ đúng một bản (BR-17) |
| `/notifications` | chuông + hộp thư | `(userId, readAt, createdAt)` | **I-07** | "chưa đọc của tôi, mới nhất" |
| `/employees` | danh mục nhân sự | `employeeCode` UNIQUE; lọc `departmentId` | **I-01**, **I-15** | |
| `/projects/:id` | timeline tiến độ | `(projectId, createdAt)` | **I-12** | `project_events`, append-only (BR-03) |

Quy tắc UI:

- **Kiểu phân trang: `TBD`** — `RESEARCH-PLAN.md` §3 B4 hỏi *offset vs cursor*, `NOTES-01` **không trả lời**.
  UI phải thiết kế sao cho cả hai cùng một hình (thanh "Tải thêm" ở cuối + số trang ở header bảng) để quyết
  định sau không đổi layout.
- **Giữ nguyên chiều cao hàng khi đổi trang** và hiển thị skeleton đúng số hàng đang tải — hai điều này là
  cách trực tiếp nhất để giữ `CLS ≤ 0.1` (`§B9`).
- Sắp xếp/lọc được **serial hoá vào URL** để một thông báo (`payload` trong `notifications`) deep-link tới đúng
  tập dữ liệu người dùng cần xem.
- Tương tác bảng (chọn lọc, đổi trang, mở row) không được làm layout nhảy: đó là luật **INP ≤ 200 ms**
  (`§B9`) chứ không phải yêu cầu mỹ thuật.

### 5.2 Card gợi ý phân công (S1 — giải thích được)

Định dạng **nghiêm ngặt theo `§B14`** — breakdown đóng góp từng kỹ năng + workload penalty:

```text
Nguyễn Văn A — Match 86%
React +0.24 · TypeScript +0.19 · Node.js +0.14 · MongoDB +0.09 · Docker +0.05
Workload penalty -0.08
```

Bốn ràng buộc:

1. **Không giải thích bằng attention của PhoBERT** (`§B14`, BR-11 docs 04). Chỉ `skill-to-skill cosine` +
   `leave-one-skill-out`. Trong UI, dòng breakdown **đến từ tool `explain_candidate_match`**, không phải từ
   suy diễn của LLM.
2. **Con số hiển thị là điểm đóng góp, không phải xác suất.** `§B13` + BR-10: cosine 0.82 **không** nghĩa là
   82% xác suất đúng. Nhãn "Match 86%" chỉ được dùng khi điểm đã qua calibration; nếu chưa, UI phải ghi
   "điểm tương đồng" chứ không ghi "%".
3. **Có đường bác gợi ý.** Card luôn có hai nút: *Chọn người này* (→ dialog confirm §6.6) và *Không phù hợp*
   (→ lý do ngắn, ghi log). Vòng học `feedback_events` (S4) **đang parked** (`backlog-parked.md` PARK-08),
   nên ở baseline lý do chỉ vào audit log, không huấn luyện lại gì cả.
4. **Trạng thái abstention (S2)**: khi điểm sau calibration dưới ngưỡng, **không có card xếp hạng**. Thay vào
   đó là khối "cần thêm thông tin" (§6.7).

### 5.3 Khung chat

| Thành phần | Hành vi | Ràng buộc |
|---|---|---|
| Danh sách message | **virtualized list** (`RESEARCH-PLAN.md` §3 B8) | message dài + markdown + card → phải đặt `min-height` cố định cho từng loại bubble, nếu không danh sách nhảy khi nội dung stream về (CLS) |
| Bubble của bot | nền `card`, chữ `foreground` | không dùng `muted` cho nội dung chính |
| Rich card kết quả tra cứu | bảng nhỏ / card nhân viên / card match (§5.2) / biểu đồ mini | render từ **kết quả tool có cấu trúc**, không phải từ text của LLM |
| Nguồn của câu trả lời chính sách | chip `document` + `version` + `source`, bấm được | BR-15 docs 04: **bắt buộc** có nguồn (`§B6`) |
| Trạng thái kết nối | "đang kết nối lại" khi WS rơi | `§B1` (Render sleep), `§B7` (Socket.IO tự fallback/reconnect) |

---

## 6. UX chat

Bảy hành vi, mỗi cái ánh xạ vào đúng **9 event** của `§B7` — không có event nào khác (`18-user-flows.md`
ràng buộc: event chưa khai báo trong `06-api-spec.md` → fail CI).

### 6.1 `chat:send` + optimistic send

Người dùng bấm Gửi → **bubble xuất hiện ngay** ở trạng thái `sending` với `clientMessageId` do client sinh,
không chờ server. `§B7` yêu cầu mỗi client message có `clientMessageId` để chống trùng khi
reconnect/retry; UI là chỗ sinh ra cái id đó.

```text
sending  → (chat:accepted)  → sent
         → (timeout / rơi WS) → retry cùng clientMessageId  (server bỏ qua id đã thấy)
         → (chat:error)      → failed + nút Gửi lại
```

Ba luật: (1) bấm đúp không tạo hai message — cùng một `clientMessageId`; (2) reconnect **không** đổi id;
(3) message thất bại nằm lại trong danh sách, không biến mất.

### 6.2 Typing indicator

`chat:accepted` → đổi bubble thành "đang suy nghĩ"; `chat:chunk` đầu tiên → ẩn indicator, bắt đầu nội dung.
Indicator **có nhịp đếm** ("vẫn đang chờ…"): `§B1` cho phép API ngủ đông và wake-up **có thể ~1 phút**, nên
một indicator vô hạn biến độ trễ hạ tầng thành cảm giác "app treo". Ngưỡng đổi nhãn: `TBD` (chưa đo).

### 6.3 Streaming

`chat:chunk` nối dần nội dung → `chat:done` chốt trạng thái cuối. Trong lúc stream, **giữ nguyên chiều cao
khung** (auto-scroll theo, không reflow layout cha).

### 6.4 Markdown + rich card

Text thường là markdown (danh sách, code, bảng nhỏ). Kết quả tra cứu **không** được ép vào text: tool trả cấu
trúc → component render (bảng / card / chart mini). Lý do: cùng một dữ liệu phải hiển thị giống nhau ở
Dashboard và Chat (một nguồn sự thật, `00-vision-scope.md` §2).

### 6.5 Skeleton, empty, error, loading

| Trạng thái | UI | Bắt buộc |
|---|---|---|
| loading | skeleton giữ đúng hình dạng nội dung sắp tới (bubble / card / bảng) | không spinner trần trên vùng trống |
| empty | câu giải thích + hành động kế tiếp ("chưa có đề tài nào giao cho bạn → xem đề tài sắp tới hạn") | không màn hình trắng |
| error | hiển thị **mã lỗi** từ error catalog (`06-api-spec.md` — chưa tồn tại) + nút thử lại | không lộ stack trace, không lộ message của Mongo (`15` §5.6) |
| quota hết (S9) | "đang dùng chế độ tra cứu không cần AI" + hướng dẫn làm gì tiếp | fallback là **trạng thái được thiết kế trước** (`§B6`, `RESEARCH-PLAN.md` §9 S9), không phải lỗi |

### 6.6 Confirm-before-write dialog (S8)

Mọi tool ghi trong catalog `§B6` — `submit_progress`, `submit_report`, `assign_project`,
`change_project_status`, `override_kpi` — phải bật dialog:

```text
Bạn sắp:  [hành vi bằng lời người, ví dụ "chuyển đề tài X sang Chờ duyệt"]
Dữ liệu:  [payload đã Zod-validate, dạng key: value]
Phạm vi:  [ai sẽ thấy việc này]
[ Huỷ ]  [ Xác nhận ]        ← nút xác nhận không phải mặc định được focus
```

Bốn quy tắc: dialog **khớp lệnh bàn phím** (Esc = huỷ); *Xác nhận* không phải nút default; `override_kpi` và
`assign_project` **hiện nhãn quyền Admin** và bị ẩn với `Employee` (matrix `07-auth-rbac.md` §7.2);
`override_kpi` có **ô lý do bắt buộc** (`§B6`: confirm + reason + Admin, BR-09). Không confirm → không có gì
được ghi, và UI phải nói rõ điều đó bằng cách **không** chèn message "đã nộp".

### 6.7 Abstention — UI "hỏi lại" (S2)

Khi `§B13`: điểm sau calibration dưới ngưỡng → **từ chối đoán**. UI không hiển thị danh sách gợi ý "hạng chót"
mà hỏi lại:

```text
Mình chưa đủ căn cứ để đề xuất ai cho "React Native + tối ưu ảnh".
Cho mình biết thêm:  ○ đã dùng React ở dự án nào?   ○ có kinh nghiệm native không?
```

Hai điều: mỗi câu hỏi lại phải **thu hẹp được tập ứng viên** (không phải hỏi cho đủ bộ), và người dùng trả lời
rồi thì cycle quay lại `find_candidates` với thông tin mới. Cùng nguyên tắc này áp cho chính sách (UF-10 bước
7): thiếu bằng chứng retrieval → nói "chưa có trong tài liệu chính sách", **không** bịa nguồn.

### 6.8 Command palette

`Ctrl/Cmd+K` trên dashboard nền tối là **S11** — theo `RESEARCH-PLAN.md` §9, mục này **chưa phải cam kết
nghiệm thu** (đang ở nhóm chờ duyệt phạm vi, `00-vision-scope.md` §4). Vì vậy tài liệu này **chưa** mô tả
hành vi của nó.

---

## 7. Responsive

| Breakpoint | Dashboard | Chat |
|---|---|---|
| desktop (≥ 1280) | sidebar thường trực, chart + bảng cạnh nhau | chat 2 cột: hội thoại + ngữ cảnh (card đang mở) |
| laptop (1024–1279) | sidebar thu còn icon | chat 1 cột, card mở thành overlay |
| tablet (768–1023) | sidebar thành drawer | chat toàn cột, bottom sheet cho card |
| mobile (< 768) | sidebar drawer; KPI strip xếp chồng; **bảng thành danh sách thẻ** | chat full-screen, composer dính bàn phím |

Ba quy tắc từ `RESEARCH-PLAN.md` §3 B8 ("responsive mobile") và `§B9`:

1. **Không ẩn nội dung bằng CSS một chiều**: bảng đề tài trên mobile mất cột `requiredSkills`, nhưng thông tin
   đó phải xuất hiện trong thẻ detail — không được "biến mất".
2. **Chart không co lại thành vô nghĩa**: dưới breakpoint, line chuyển thành danh sách giá trị theo kỳ, bar
   chuyển thành thanh ngang.
3. **Input area của chat không bị bàn phím ảo che** (viewport dinamic), vì gửi báo cáo qua chat là nghiệp vụ
   thật của UF-05 bước 5.

---

## 8. Accessibility checklist

Mục này là **danh sách thứ phải kiểm**, không phải tuyên bố đã đạt. Trạng thái kiểm chứng toàn bộ:
**CHƯA XÁC MINH** — chưa có màn hình nào được code.

- [ ] Mọi tương tác chuột làm được bằng bàn phím; thứ tự Tab khớp thị giác.
- [ ] Focus ring **nhìn thấy được trên nền tối** (`primary`/`ring`, không dùng `outline: none` mà không thay).
- [ ] Thoát khỏi bẫy bàn phím trong dialog confirm; `Esc` = huỷ.
- [ ] `aria-live="polite"` cho typing indicator và message mới; `aria-live="assertive"` cho lỗi gửi thất bại.
- [ ] Nội dung stream không bắn screen reader từng `chat:chunk`: chỉ công bố **bản đầy đủ khi `chat:done`**.
- [ ] Mọi input có `<label>` thật; lỗi gắn `aria-describedby`, không chỉ đổi viền đỏ (màu không mang nghĩa một mình).
- [ ] Bảng: `<caption>`, `th scope`, `aria-sort` trên cột đang sắp.
- [ ] Chart: **dữ liệu có bản thay thế dạng bảng/số** (Recharts không tự là nội dung tiếp cận được); tooltip không phải chỗ duy nhất có giá trị.
- [ ] Contrast text và phi-text (icon, focus, viền input) đạt WCAG 2.1 AA — công cụ + kết quả `TBD` (§2.2).
- [ ] Không vượt quá 3 lần nhấp nháy/giây; skeleton không chớp.
- [ ] Zoom 200% không vỡ layout, không che composer.
- [ ] Language của trang `vi`; số/thuật ngữ Anh không bị đọc sai do thiếu `lang`.
- [ ] Touch target ≥ 44×44 px ở mobile.
- [ ] `prefers-reduced-motion` tôn trọng §10.
- [ ] Thông báo trạng thái kết nối WS không chỉ bằng màu (có chữ + icon).

---

## 9. Typography cho số liệu

- **`font-variant-numeric: tabular-nums`** cho **mọi** ô chứa số so sánh được (yêu cầu tường minh ở
  `RESEARCH-PLAN.md` §3 B8): cột điểm KPI, điểm match, `%` hoàn thành, `dueDate`, giá trị tooltip, KPI strip.
  Chữ mặc định có số rộng hẹp khác nhau làm cột số **nhảy** khi đổi trang/lọc — vừa xấu vừa vi phạm CLS.
- Đơn vị luôn tách khỏi số bằng khoảng trắng không đổi dòng: `1.2 k`, `86 %`, `< 300 ms`.
- Số đo được nhưng chưa chốt thì hiển thị `—`, **không hiển thị `0`**. Một dashboard KPI hiện `0` vì chưa tính
  là một lỗi UI nghiêm trọng hơn hiện `—`.
- Điểm KPI: một chữ số thập phân, thống nhất mọi màn hình.
- `level` và `role` hiển thị bằng **badge có chữ**, không chỉ bằng màu (`§B3`: hai trục khác nhau, và a11y:
  màu không đơn độc mang nghĩa).
- Font: hệ thống stack của Vite/shadcn; không thêm webfont trong 12 tuần vì mỗi font là một khoản ngân sách
  byte (`12-performance.md` §3).

---

## 10. States & motion

**Nguyên tắc**, không phải danh sách thư viện. Không có animation library nào được chọn trong `NOTES-01`,
nên **không** đặt tên một thư viện ở đây; nếu cần, đó là một quyết định mới phải có ADR.

1. Motion phục vụ **giải thích chuyển tiếp trạng thái**, không trang trí: bubble đổi `sending → sent`,
   skeleton thành nội dung, card mở rộng breakdown.
2. Ngưỡng: **mọi motion phải để lại layout ổn định** — thời lượng `TBD`, nhưng CLS `≤ 0.1` (`§B9`) là trần
   không thương lượng. Chiều cao phần tử **không đổi** sau khi animation kết thúc.
3. Cùng một hành vi phải có ở Dashboard và Chat (nút "đã duyệt" và card `project:updated` giống nhau).
4. Tôn trọng `prefers-reduced-motion`: tắt translate/scale, giữ đổi màu tức thì.
5. Trạng thái "đang tải" của **biểu đồ** và **bảng** dùng chung một cơ chế skeleton để tránh hai kiểu nhảy
   layout khác nhau trong cùng một route.
6. Không animate thứ lặp lại hàng loạt (mỗi dòng bảng xuất hiện một kiểu): trên bảng 50 dòng đó chính là
   nguyên nhân chậm và nhảy.

---

## 11. Gate nào giữ UI này

Theo `RESEARCH-PLAN.md` §11: *không thêm gate nào nếu chưa có lệnh chạy nó trong CI*. Bốn gate dưới đây có
lệnh; hàng nào chờ file chưa tồn tại thì ghi thẳng **trạng thái: chưa bật — chờ file**.

| Gate | Luật | Lệnh | Trạng thái |
|---|---|---|---|
| Hiệu năng front | LCP < 2.5s, INP < 200ms, CLS ≤ 0.1 (`§B9`) | `npx @lhci/cli autorun` · `npx @lhci/cli assert` | **chưa bật — chờ scaffold `apps/web`** + cấu hình route (đang `TBD`, `11-quality-testing.md` §9 mục "Cấu hình đo Lighthouse") |
| Ngân sách bundle theo route | byte/dashboard ≠ byte/chat | `npx size-limit` | **chưa bật — chờ scaffold**; con số ngân sách `TBD — chưa đo` |
| WS contract | UI chỉ lắng nghe 9 event của `§B7` | `pnpm --filter api test -- realtime/contracts` | **chưa bật — chờ `06-api-spec.md`** (file khai báo event) |
| Không hard-code màu | eslint rule cấm utility màu trực tiếp / hex literal | `pnpm -r lint` | **chưa bật — chờ `packages/eslint-config`** (ADR-015 mục "Mở" #4) |

Không có gate cho a11y ở trên, vì **chưa có lệnh nào được nguồn khai báo** — giữ nó thành checklist §8,
không viết thành "đạt".

---

## 12. Việc chưa chốt

| # | Việc | Vì chưa chốt được | Chặn | Mốc |
|---|---|---|---|---|
| P-01 | Palette cụ thể + **kết quả** đo tương phản AA | nhóm đề xuất, chưa có công cụ + số | §2.1–§2.2 | tuần 4 (B8) |
| P-02 | Offset vs cursor cho mọi bảng phân trang | `RESEARCH-PLAN.md` §3 B4 hỏi, `NOTES-01` không trả lời | §5.1 | tuần 3 |
| P-03 | Ngân sách KB theo route | chưa đo; `§B9`/ADR-015 không có số | §11 | tuần 8 (B9) |
| P-04 | Cấu hình Lighthouse (số lần chạy, device profile, route nào bị assert) | nguồn chỉ cho ngưỡng | §11 | tuần 8 |
| P-05 | Danh sách report template cho chart của S10 | S10 **đang parked** (`backlog-parked.md` PARK-05) và whitelist phải khai báo trong `06-api-spec.md` (chưa tồn tại) | §4 | chỉ khi S10 được GVHD duyệt |
| P-06 | Cách hiển thị "báo cáo tính tới thời điểm nào" | ADR-014 mục "Mở" #3 để ngỏ | §4.1 | tuần 7 |
| P-07 | Trạng thái "đang tải" khi API wake-up sau sleep | cần đo độ thức thật tế, và số `§B1` **chưa có URL** | §3.1, §6.2 | tuần 10 |
| P-08 | Hành vi command palette | S11 chưa phải cam kết nghiệm thu | §6.8 | chỉ khi phạm vi S được duyệt (`RESEARCH-PLAN.md` §7.8) |
| P-09 | Màn hình approve/reject thay đổi field nhạy cảm của hồ sơ | `§B6` **không có tool** cho việc này (`07-auth-rbac.md` §7.3) | §1, §3.2 | tuần 3 |
| P-10 | `format` của `period` hiển thị trên trục X | `05` §7 D-06 | §4.1 | tuần 6 |
| P-11 | Lưu lịch sử chat để hiển thị lại | `05` §7 D-08: `NOTES-01` không trả lời `RESEARCH-PLAN.md` §3 B7 | §5.3 | tuần 6 |

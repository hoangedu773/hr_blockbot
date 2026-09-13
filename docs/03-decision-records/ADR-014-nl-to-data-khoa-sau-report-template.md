# ADR-014 — NL→data bị khoá sau report template + Zod enum; LLM không được sinh Mongo pipeline

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `06-api-spec.md` (report endpoints), `08-algorithms.md` (intent→tool),
  `13-security.md`, `18-user-flows.md` (intent #21), `backlog-parked.md` PARK về S10, ADR-012

---

## Context

Ý tưởng S10: để người dùng hỏi số liệu bằng ngôn ngữ tự nhiên — "KPI tháng 9 phòng Dev" — và nhận về
biểu đồ. Con đường hiển nhiên là cho LLM sinh truy vấn. `NOTES-01.md` §B15 ghi lại lý do không đi đường đó:
chính Vanna — công cụ chuyên NL→SQL — **cảnh báo** cách này có thể sinh SQL bất kỳ và khuyến nghị database
credential read-only + row-level security khi expose cho user.

Vấn đề với một hệ thống **quản lý nhân sự** còn nặng hơn bài toán NL→SQL thông thường: một pipeline bị lọt
`$lookup`/`$where` có thể trả về lương, KPI hoặc nhận xét đánh giá của người khác. Đây là loại lỗi mà
review code không bắt được, chỉ có kiến trúc mới chặn được.

## Decision

**LLM không được quyền mô tả truy vấn. Nó chỉ được quyền chọn một báo cáo đã duyệt và điền tham số.**

```text
LLM
 ↓  chọn report template (enum đóng)
Zod enum validation
 ↓
RBAC check
 ↓
server TỰ NẠP user/department scope   ← người dùng/LLM không được quyền chọn scope
 ↓
predefined aggregation (đã review)
 ↓
row cap → timeout → result
```

Đầu ra hợp lệ duy nhất của LLM trong luồng này:
```json
{ "report": "department_kpi", "departmentId": "DEV", "month": "2026-09" }
```

Bốn điều cấm tuyệt đối, ghi thành luật trong `13-security.md`:

1. Không `$lookup`, `$where`, `$function`, `$expr` tự do — LLM không được viết toán tử nào.
2. Không tên collection do client/LLM đưa lên.
3. Không raw Mongo query, không pipeline fragment.
4. Không có trường "scope" do người dùng chọn: `userId`/`departmentId` của phạm vi dữ liệu được **server
   nạp từ JWT đã verify**, không đọc từ payload LLM trả về. Giá trị `departmentId` trong payload chỉ là
   **yêu cầu lọc**, phải được đối chiếu với quyền của người gọi trước khi dùng.

Mỗi report template là một đơn vị code thật: tên enum + zod schema tham số + aggregation đã review +
chỉ số ước lượng kết quả. Thêm báo cáo mới = thêm code + PR review, **không phải** thêm prompt.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| LLM sinh Mongo aggregation pipeline tự do | Trái trực tiếp §B15; không có cách nào "validate" một pipeline tùy ý mà không tự viết lại cả một engine giới hạn |
| Cho phép pipeline nhưng chạy bằng read-only credential + row-level security (cách Vanna khuyên) | Vẫn còn đường đọc **trong phạm vi được phép**: trích xuất toàn bộ bảng nhân sự chỉ bằng một `$group` không mong muốn; và Atlas M0 không cho cấu hình người dùng/rằng buộc ở mức ta cần (`[CẦN NGUỒN]` — mục B1 chưa có URL) |
| LLM sinh SQL trên một view phẳng (DuckDB/CTAS) | Thêm một engine + một lớp dữ liệu nhân bản vào baseline đã bị cắt giảm (ADR-001/005/011); lợi ích so với template enum không đủ lớn |
| Không làm S10, chỉ có bộ lọc thủ công trên dashboard | Đây là **phương án mặc định hiện tại** — S10 đang parked (`backlog-parked.md`). ADR này chỉ có hiệu lực nếu và khi S10 được mở |

## Consequences

**Điểm mạnh**

- Mặt attack surface **hữu hạn và đếm được**: số report template, không phải số câu hỏi. Test được bằng
  cách liệt kê enum — một intent trả về tên báo cáo ngoài enum là lỗi, không phải rủi ro.
- RBAC và kiểm toán đặt ở một chỗ duy nhất (server trước khi chạy aggregation), nên không thể bị "prompt
  vượt qua".
- Kết quả **tất định** với cùng template + cùng tham số ⇒ đưa vào `11-quality-testing.md` như test thường,
  không cần LLM thật.
- Cho phép đo chi phí: mỗi template biết trước row cap và timeout, nên không có cảnh "một câu hỏi làm sập
  Atlas M0".

**Đánh đổi thật**

- **Độ phủ thấp**: hỏi ngoài danh sách template thì máy không trả lời được. Trải nghiệm "hỏi gì cũng ra
  biểu đồ" sẽ không có; phải thiết kế câu trả lời từ chối tốt ("chưa hỗ trợ, bạn thử A hoặc B").
- Mỗi loại báo cáo mới tốn công code + review; về dài hạn danh sách enum phình to.
- Vẫn cần làm **đối chiếu scope phía server** một cách đúng đắn — nếu chỉ tin `departmentId` trong payload
  thì enum khoá chặt đến mấy cũng vô nghĩa. Đây là bug dễ viết nhất của thiết kế này, phải có test riêng.

## Mở — cần quyết định tiếp

| # | Việc | Chặn bởi |
|---|---|---|
| 1 | Danh sách report template cho MVP (đề xuất: `my_kpi`, `department_kpi`, `kpi_trend`, `project_status_summary`) | `06-api-spec.md`; GVHD duyệt phạm vi S10 |
| 2 | Row cap & timeout cụ thể | chưa có số nguồn — `TBD` |
| 3 | Cách thể hiện "báo cáo này tính theo dữ liệu tới thời điểm nào" trên biểu đồ | `10-ui-ux-spec.md` |

## References

- `docs/research/NOTES-01.md` §B15 — "S10 NL → aggregation: không cho LLM viết Mongo pipeline tự do", chuỗi
  ràng buộc, ví dụ payload, danh sách toán tử cấm; phần Vanna cảnh báo NL→SQL
- `docs/research/RESEARCH-PLAN.md` §9 S10 (rủi ro **Cao**, bắt buộc whitelist + read-only)
- `docs/research/NOTES-01.md` §B6 — guard RBAC/Zod/confirm; ADR-012
- `docs/backlog-parked.md` — điều kiện để S10 ra khỏi trạng thái park

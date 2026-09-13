# ADR-013 — Điểm KPI cuối do công thức tất định sinh ra; AI chỉ được gợi ý thành phần

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `04-domain-model.md` §6 (luồng KPI), `05-data-model.md` `evaluations`,
  `06-api-spec.md` tool `override_kpi`, `08-algorithms.md` (F5), `17-innovation-playbook.md` (S12/S13), ADR-012

---

## Context

Đề cương mô tả F5 là: *ứng dụng AI phân loại sắc thái và phân tích ngữ nghĩa nhận xét của cấp quản lý,
hỗ trợ **tự động lượng hóa** mức độ hoàn thành nhiệm vụ và tính điểm KPI khách quan*.

Đọc sát thì "tự động lượng hóa" có hai cách hiểu, và hai cách này cho ra hai hệ thống khác hẳn:

1. Đưa nhận xét cho LLM, LLM trả về con số điểm.
2. LLM chỉ phân tích ngữ nghĩa, một **công thức tất định** mới ra điểm.

Cách (1) rẻ để viết nhưng có ba lỗi không sửa được về sau:

- **Không tái lập**: cùng một nhận xét, hai lần chạy có thể ra hai điểm. Một con số không tái lập được thì
  không phải kết quả đo, và không bảo vệ được trước phản biện.
- **Không giải thích được**: "model nói 8.2" không phải lý do. Người bị chấm thấp sẽ khiếu nại đúng vào chỗ đó.
- **Trội lên kết quả thật**: câu nhận xét hoa mỹ có thể điểm cao hơn công việc làm xong thật.

`NOTES-01.md` §B6 chốt theo hướng (2), và §B0 cho biết nghiệp vụ chuẩn cũng không phải một bước AI:
chu kỳ thật là `self-review → manager review → calibration/approval → publish → history`
(MISA có self-evaluation, manager feedback, chu kỳ đánh giá và nhắc hạn; Lattice có calibration).

## Decision

**LLM không được sinh ra KPI cuối cùng.**

```text
Objective completion score      (dữ liệu thật: tỷ lệ hoàn thành, nghiệm thu)
        +
Review semantic signal          (AI: sentiment | themes | risk signals)
        +
Manager assessment              (người thật chấm)
        ↓
deterministic KPI formula  →  machineScore
        ↓
finalScore  (kèm overrideReason + changedBy + changedAt nếu người hiệu chỉnh)
```

Bốn nghĩa vụ cài đặt:

1. **AI chỉ trả về thành phần, không trả về điểm cuối**: `sentiment`, `themes`, `risk signals`,
   `suggested score component`, `explanation` (§B6). `suggested score component` là **đầu vào** của công thức,
   không phải đầu ra.
2. **Công thức là hàm thuần, chạy lại được, có test**: cùng bộ đầu vào ⇒ cùng `machineScore`. Đây là thứ
   CI kiểm tra được bằng `vitest`, không cần gọi LLM.
3. **Mọi bản ghi đánh giá phải lưu vết hiệu chỉnh**: `machineScore`, `finalScore`, `overrideReason`,
   `changedBy`, `changedAt`. Thiếu một trong năm field là không đủ điều kiện nghiệm thu F5.
4. **Override là hành động Admin, bắt buộc có lý do, đi qua confirm-before-write** (ADR-012 guard
   "confirm write operations", "audit every mutation") và ghi log bất biến — không cho phép sửa đè.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| LLM trả thẳng điểm số | Mất tính tái lập và mất khả năng giải thích; đúng ba lỗi ở Context. Also: mọi thay đổi prompt/đổi provider (ADR-012) sẽ làm **toàn bộ lịch sử KPI** của các kỳ trước trở nên không so sánh được |
| Fine-tune một mô hình chuyên chấm điểm | Không có dữ liệu nhãn đủ lớn (§B5: dataset HR tiếng Việt **chưa tồn tại** ở dạng xác minh được); chi phí cao hơn lợi ích với nhóm 3 người / 12 tuần |
| LLM-as-judge làm điểm chuẩn, người chỉ duyệt | Vẫn để LLM giữ quyền quyết định cuối → khiếu nại không có chỗ dựa; và judge bias (thiên kiến cho câu dài) đi thẳng vào kết quả mà không bị đo |
| Bỏ hẳn AI khỏi F5 | Trái đề cương — F5 là một trong 7 chức năng được chấm 0.5đ |

## Consequences

**Điểm mạnh**

- KPI **tái lập được**: chạy lại công thức trên cùng dữ liệu ⇒ cùng số. `make demo` (S14) mới có nghĩa.
- F5 có chỗ để **đo** thay vì để **trình diễn**: S12 đo xem `suggested score component` có tương quan với
  độ dài/cách diễn đạt nhận xét hay không; S13 đặt trần cho tín hiệu ngữ nghĩa để câu chữ không thắng kết quả.
  Nếu LLM trực tiếp sinh điểm, hai mục này **không tồn tại được** — đó là lý do quyết định này giữ lại
  phần khoa học của F5.
- Tách được rủi ro: LLM đổi, prompt đổi, provider hết quota (S9) ⇒ `machineScore` vẫn tính lại được từ
  thành phần đã lưu, không phải gọi lại model.
- Khớp nghiệp vụ chuẩn mà §B0 phát hiện: có tầng manager review và calibration trước khi publish.

**Đánh đổi thật**

- **Phải định nghĩa công thức và cân nặng trước khi code.** "Công thức tất định" không tự nó đúng; nếu trọng
  số đặt sai thì sai một cách có hệ thống và trông rất khách quan. Đây là việc mở (xem dưới).
- Điểm **không còn "thông minh" theo cảm giác demo**. Người xem sẽ thấy AI chỉ giải thích, không quyết.
  Phải nói rõ trong báo cáo rằng đây là lựa chọn có chủ đích, không phải chưa làm được.
- Thêm chi phí nghiệp vụ: mỗi kỳ đánh giá có bước calibration, nên cần lịch (Agenda, ADR-011) và màn hình
  cho Admin — không phải tính năng miễn phí.
- Trọng số trong công thức **không có nguồn ngoài**; mọi giá trị phải gắn nhãn "giả định của nhóm" cho tới
  khi có dữ liệu thật kiểm chứng.

## Mở — cần quyết định tiếp

| # | Việc | Chặn bởi |
|---|---|---|
| 1 | Công thức cụ thể + trọng số của 3 thành phần | `04-domain-model.md` §6; cần GVHD duyệt vì đề cương chỉ nói "lượng hóa" |
| 2 | `suggested score component` được quyền tác động bao nhiêu % vào `machineScore` (trần của S13) | như trên |
| 3 | Metric nào chứng minh tín hiệu ngữ nghĩa là có ích (so với không dùng AI) | `09-ai-evaluation.md` + §7 câu 2 RESEARCH-PLAN |
| 4 | Override có được phép làm khác `machineScore` quá một ngưỡng nhất định không | chính sách nội bộ, `[CẦN NGUỒN]` |

## References

- `docs/research/NOTES-01.md` §B6 — "F5 sentiment → KPI: không cho LLM sinh KPI cuối cùng", khối công thức và 5 field bắt buộc
- `docs/research/NOTES-01.md` §B0 — chu kỳ `self-review → manager review → calibration/approval → publish → history` (MISA, Lattice)
- `docs/research/NOTES-01.md` §B6 — guard: confirm write operations, audit every mutation
- `docs/research/RESEARCH-PLAN.md` §9 S12, S13; §1 F5
- `docs/04-domain-model.md` §6, `docs/05-data-model.md` `evaluations`, ADR-012, ADR-011

# ADR-016 — PR chạy test mocked tất định; đánh giá LLM thật chạy nightly/release

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `11-quality-testing.md` §4, `14-devops-deployment.md` (workflow CI),
  `09-ai-evaluation.md`, ADR-012, ADR-013

---

## Context

Luồng chatbot phụ thuộc một mô hình **không tất định** và **có quota**. Nếu gọi provider thật trong mọi PR:

- Test đỏ/xanh đổi theo lần chạy → không dùng làm cổng hợp nhất được nữa. Khi một cổng hay đỏ vô cớ,
  nhóm sẽ bắt đầu bấm merge bỏ qua nó — mất luôn giá trị của gate.
- Quota free tier cạn giữa kỳ: `NOTES-01.md` §B6 ghi Groq Free ở mức ~30 RPM, `gpt-oss-120b` ~1.000 RPD
  và 8K TPM. Vài chục PR mỗi ngày ăn hết.
- Mỗi PR tốn tiền, dù rẻ (~$0.25/1M input với Gemini flash-lite).

Ngược lại, nếu chỉ test bằng mock thì **không có bằng chứng nào** rằng agent chọn đúng tool với model thật —
mà đó lại là phần đề cương yêu cầu chứng minh.

`NOTES-01.md` §B10 đã cắt vấn đề: "LLM live API eval không nên block mọi PR vì quota và tính không ổn định".

## Decision

**Hai tầng, hai nhịp, hai mục đích khác nhau — không thay thế nhau.**

```text
PR / merge   →  mocked deterministic agent tests
                (provider giả lập theo fixture; temperature=0; snapshot)
                chặn merge. Nhanh. Luôn chạy được offline.

nightly / release → live provider evaluation
                (provider thật, cùng bộ hội thoại + cùng metric)
                KHÔNG chặn merge. Có lịch cố định, có lưu kết quả theo ngày.
```

Bốn luật để hai tầng không trở thành hai thế giới tách biệt:

1. **Cùng một bộ kịch bản hội thoại.** Fixture của mocked test và tập input của live eval là một danh mục,
   không phải hai. Mock khớp kịch bản nào thì eval chạy kịch bản đó.
2. **Mock giả lập đúng hợp đồng, không giả lập hành vi.** Mock trả về `tool_call` đã ghi sẵn; nó **không**
   chứng minh model chọn đúng tool. Việc đó thuộc tầng live. Nói cách khác: mock test guard/Zod/RBAC/confirm
   (ADR-012), live test **chất lượng lựa chọn**.
3. **Kết quả live phải so được với baseline.** `09-ai-evaluation.md` công bố một con số baseline; gate là
   "không tụt quá 2 điểm" (`RESEARCH-PLAN.md` §11). Live eval không có chỗ ghi kết quả thì vô nghĩa.
4. **Fail của nightly phải thành issue có chủ**, không phải email tự động trôi.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| Live eval trong mọi PR | Đúng ba lỗi ở Context: không tất định, hết quota, tốn tiền. Ngoài ra CI sẽ chậm tới mức nhóm bỏ dùng CI |
| Chỉ mock, không bao giờ gọi thật | Không trả lời được câu hỏi trung tâm của đề tài: agent có chọn đúng tool không. Mock luôn "đỗ" vì ta tự viết câu trả lời cho nó |
| Đánh đổi: live eval mỗi tuần một lần, thủ công | Không có chuỗi thời gian ⇒ không phát hiện được model/provider tụt dần; và "làm thủ công" trong 12 tuần nghĩa là không làm |
| Ghi kết quả live vào PR như "warning không chặn" nhưng chạy trong PR | Vẫn tiêu quota theo số PR, vẫn bất định trong log PR. nightly tách hẳn nhịp là đơn giản hơn |

## Consequences

**Điểm mạnh**

- PR xanh/đỏ mang thông tin thật → đáng tin và được dùng thật.
- Có **chuỗi thời gian** chất lượng mô hình (nightly), thứ vừa phục vụ debug vừa là số liệu đẹp trong báo cáo.
- Cho phép demo offline khi quota cạn: mocked layer vẫn chứng minh toàn bộ nghiệp vụ chạy đúng.
- Fit với S9 (graceful degradation): hành vi "hết quota → rơi về pipeline PhoBERT-only" chỉ test được nếu
  có một mock giả lập đúng lỗi quota.

**Đánh đổi thật**

- **Khoảng trống giữa hai tầng**: PR pass + nightly fail = bug thật nhưng đến chậm tới sáng hôm sau. Với
  nhóm 3 người làm việc ban ngày, phải chấp nhận độ trễ này.
- Mock có thể **đóng băng định dạng lỗi thời**: nếu provider đổi schema tool_call, mock vẫn xanh cho tới kỳ
  nightly kế tiếp. Mitigation: mock sinh ra từ chính schema của live response (fixture capture), không viết tay.
- **Cần một chỗ lưu kết quả eval theo ngày** để chuỗi thời gian có nơi tích lũy — việc hạ tầng nhỏ, ghi ở `14-devops-deployment.md`.
- Vẫn chưa chốt được metric nào là "chính" cho tới khi GVHD trả lời `RESEARCH-PLAN.md` §7 câu 2
  (F1 đo trên bài toán nào) ⇒ con số baseline trong gate đang `TBD`.

## Mở — cần quyết định tiếp

| # | Việc | Chặn bởi |
|---|---|---|
| 1 | Danh mục kịch bản hội thoại dùng chung cho mock + eval | bộ 28 intent ở `18-user-flows.md`; dataset HR (đang chờ GVHD) |
| 2 | Ngưỡng và metric của live gate | `09-ai-evaluation.md` + §7 câu 2 |
| 3 | Cách capture fixture từ live response để mock không lệch schema | `11-quality-testing.md` |
| 4 | Nơi lưu lịch sử eval (file trong repo vs service ngoài) | `14-devops-deployment.md` — ưu tiên không thêm dịch vụ mới |

## References

- `docs/research/NOTES-01.md` §B10 — "LLM live API eval không nên block mọi PR vì quota và tính không ổn
  định"; `PR → mocked deterministic agent tests`, `nightly/release → live provider evaluation`; thứ tự CI
  có "AI regression gate"
- `docs/research/NOTES-01.md` §B6 — bảng quota/giá từng provider; guard `maxSteps`, timeout
- `docs/research/RESEARCH-PLAN.md` §3 B10 (test chatbot tất định: mock, fixture, `temperature=0`, snapshot);
  §11 (gate "F1/P@5 không tụt quá 2 điểm so với baseline đã công bố")
- ADR-012 (`LLMProvider` — chỗ cắm mock), ADR-013 (KPI tất định ⇒ phần bị đánh giá thật chỉ còn lựa chọn tool)

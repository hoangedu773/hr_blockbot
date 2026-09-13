# ADR-012 — Trừu tượng `LLMProvider`, không hard-code Gemini vào business logic

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §4 (biên `ai-service → LLM`), §6 (hàng LLM provider), §7.5 (guard), ADR-003

---

## Context

F3/F5 cần một LLM có function calling. Bảng so sánh provider vòng B6 (`NOTES-01.md` dòng 292–296):

| Provider | Số liệu ghi trong NOTES-01 |
|---|---|
| Gemini | "Tính tới 09/2026, Gemini có stable `gemini-3.8-flash`: function calling + structured outputs, context ~1,048,576 tokens"; bản rẻ hơn cho project sinh viên: `gemini-3.1-flash-lite` **có Free Tier**, paid ~$0.25/1M input, $1.50/1M output |
| Groq | "Free có quota thật: nhiều model ở 30 RPM; `gpt-oss-120b` ~1,000 RPD và 8K TPM trên Free Plan" |
| OpenAI | "không có Free tier cho GPT-5 Mini; ~$0.25/1M input, $2/1M output, có function calling" |

Vấn đề kiến trúc: ba nhà cung cấp này khác nhau về **hình thức tool call**, về **quota**, và về **giá**;
một trong ba lại **không có free tier**. Nếu business logic gọi thẳng SDK của một nhà cung cấp, mọi thay
đổi giá/quota ở tuần 8–11 (đúng lúc chạy UAT) sẽ thành refactor xuyên suốt.

`RESEARCH-PLAN.md` §9 S9 còn đòi hỏi một hành vi mà chỉ abstraction mới cho phép: "hết quota LLM → tự rơi
về pipeline PhoBERT-only (intent cố định) thay vì chết; đo % tính năng còn dùng được".

## Decision

**Giữ nguyên tầng abstraction đã chốt** (`NOTES-01.md` §B6 dòng 298–306) — "Chọn provider — có tầng
abstraction, không hard-code vào business logic":

```text
LLMProvider interface
├── GeminiProvider
├── GroqProvider
└── OpenAIProvider
Baseline: Gemini 3.1 Flash-Lite hoac Groq.
```

Bốn nghĩa vụ mà interface này phải phủ (tất cả đều là dữ kiện đã chốt ở §B6):

1. **Tool/function calling** + structured outputs — tool catalog (§B6 dòng 321–330) được khai báo một lần,
   mỗi provider adapter tự dịch sang định dạng của hãng.
2. **Khai báo quota** để guard dùng: `maxSteps = 5`, `toolTimeout`, `LLM timeout`, `max tool result size`
   (§B6 dòng 316).
3. **Lỗi quota là kết quả hợp lệ**, không phải exception: đó là chỗ S9 cắm fallback.
4. **Provider baseline phải có Free Tier** vì hai ứng viên baseline đều thỏa (Gemini 3.1 Flash-Lite có Free
   Tier; Groq Free có quota thật), còn OpenAI thì không.

**Không dùng LangChain/LangGraph** (§dòng 530): agent loop ở đây là một vòng lặp có guard tự định nghĩa
(§B6 dòng 310–318), không cần framework.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| Hard-code Gemini SDK vào service | Chính là điều NOTES-01 cấm: "không hard-code vào business logic" (§B6 dòng 298). Mất khả năng đổi khi hết quota/đổi giá, và mất luôn chỗ để đo S9 |
| **LangChain / LangGraph** | Liệt kê trong "Không thêm ở baseline" (§dòng 530). Agent loop cần có chỉ là router → tool → validate → permission → execute với guard; thêm framework để có loop là trả phí học không đổi lại quyết định thiết kế nào |
| Ollama / model chạy local | `RESEARCH-PLAN.md` §3 B6 dòng 163 có nêu Ollama trong danh sách "chọn model + nơi chạy", nhưng baseline NOTES-01 chốt là provider có function calling (Gemini/Groq). Chạy local còn đụng trần RAM chưa xác minh của VPS 2GB (ADR-003, `[CẦN NGUỒN]`) |
| Chọn OpenAI làm baseline | "không có Free tier cho GPT-5 Mini" (§B6 dòng 296) ⇒ không phù hợp project sinh viên, là lý do NOTES-01 đưa nó vào danh sách provider nhưng **không** đưa vào baseline |
| Tự gọi HTTP API của từng hãng không qua interface | Vẫn phải viết 3 adapter; khác biệt là không có chỗ chung để đặt guard + audit + fallback ⇒ nghiệp vụ sẽ phân nhánh theo tên provider |

## Consequences

**Điểm mạnh:**

- Đổi provider ở tuần 10 chỉ đụng một adapter, không đụng tool catalog, guard, hay RBAC.
- Guard và audit đặt ở tầng interface nên **áp dụng cho mọi provider**: "Zod validate every argument",
  "RBAC check every tool", "confirm write operations", "audit every mutation" (§B6 dòng 316–318). Nếu
  hard-code, bốn nghĩa vụ này dễ bị lọt ở adapter thứ hai.
- Cho phép **mock provider tất định** trong PR test (`temperature=0`, fixture — `RESEARCH-PLAN.md` §3 B10
  dòng 202) — tiền đề trực tiếp cho ADR-016.
- Test chi phí được: giá/1M token của từng nhà cung cấp đã có trong bảng B6 để ước tính.

**Đánh đổi thật:**

- **Interface nhỏ nhất chung cho ba hãng ⇒ mất tính đặc thù** (cache hint, thought signature, structured
  output mode riêng). Mỗi lần cần một tính năng "của riêng hãng X", hoặc thêm capability vào interface,
  hoặc thừa nhận adapter đó là ngoại lệ.
- Baseline chọn **model rẻ** (`gemini-3.1-flash-lite` / Groq) chứ không phải model mạnh nhất (`gemini-3.8-flash`,
  context ~1,048,576 tokens) ⇒ **chất lượng tool selection là ẩn số**, và nó chỉ lộ ra khi chạy eval live.
  Đây chính là lý do eval gate tồn tại ở ADR-016.
- Ba interface nhưng **hai implementation tối thiểu** (Gemini + Groq); adapter OpenAI chỉ đáng viết nếu thật
  sự dùng tới — ghi rõ để tránh code "cho đủ".
- Chi phí thật vẫn treo trên quota free (30 RPM, 8K TPM, ~1.000 RPD — §B6 dòng 295): abstraction không tạo
  thêm quota. demo trước hội đồng phải tính tới khả năng **hết quota giữa buổi**.
- Mọi con số B6 **chưa có URL** (§B6 không nằm ngoài mục CẦN BỔ SUNG dòng 549–552 về nguồn giá/model) ⇒
  không được trích vào báo cáo trước khi bổ sung.

## References

- `docs/research/NOTES-01.md` §B6 dòng 290–330 (bảng provider, `LLMProvider`, agent flow, guard, tool catalog)
- `docs/research/NOTES-01.md` dòng 505–528 (sơ đồ lớp: LLM là tầng cuối), dòng 530 (LangChain/LangGraph không thêm ở baseline)
- `docs/research/RESEARCH-PLAN.md` §3 B6 dòng 163–164; §3 B10 dòng 202; §9 S9 dòng 313
- `docs/02-architecture.md` §6 (hàng LLM provider), §7.5, §10 (hàng LangChain); ADR-003, ADR-016

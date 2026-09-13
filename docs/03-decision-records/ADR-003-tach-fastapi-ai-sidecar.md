# ADR-003 — Tách FastAPI AI sidecar, lõi AI không nằm trong Node

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §4 (container), §6 (trần RAM/CPU của `ai-service`), ADR-005, ADR-012

---

## Context

Đề cương chia stack thành hai hệ ngôn ngữ ngay từ đầu: **MERN + TypeScript** cho nền tảng và
**Python/FastAPI cho lõi AI** (`RESEARCH-PLAN.md` §1 dòng 26; `README.md` dòng 27). Phần "khoa học" của
khóa luận nằm hoàn toàn ở hệ Python: `vinai/phobert-base` cho semantic matching, `multilingual-e5-small`
làm baseline, sentiment → KPI, calibration (Platt/Logistic) và eval harness (`NOTES-01.md` §B5 dòng 252–268,
§B13 dòng 443–450).

Ba ràng buộc kỹ thuật khiến việc gộp tất cả vào Node không khả thi:

1. PhoBERT-base ~135M params, PhoBERT-large ~370M, và **PhoBERT yêu cầu input tiếng Việt đã được
   word-segmented** (`NOTES-01.md` §B5 dòng 254).
2. `RESEARCH-PLAN.md` §3 B9 dòng 194 nêu rõ mục tiêu "chạy suy luận ở process riêng để không block event
   loop" — suy luận synchronous trong Node sẽ giữ event loop và làm hỏng `CRUD read p95 < 300 ms` (§B9).
3. Hàng rào eval bắt buộc chạy `pytest` (`RESEARCH-PLAN.md` §11 dòng 348; `NOTES-01.md` §B10 dòng 397).

## Decision

**Giữ đúng bốn tầng của sơ đồ đã chốt** (`NOTES-01.md` dòng 507–528): React → Express → FastAPI → LLM.
`apps/ai-service` là **một tiến trình Python/FastAPI riêng**, đảm nhận:

```text
Tien trinh 3 - apps/ai-service
├── PhoBERT                    (embedding theo đề cương - bắt buộc)
├── multilingual-e5-small      (baseline so sánh - S3)
├── matching / eval
└── calibration
```

`apps/api` (Express) **gọi sang `apps/ai-service` một chiều qua HTTP nội bộ**; `ai-service` không gọi ngược
lại API ở baseline (biên vẽ ở `02-architecture.md` §4). Business logic, RBAC và persistence vẫn ở Node —
`modules/ai` trong API chỉ là **proxy + validate** (`02-architecture.md` §5.2).

**Đồng bộ hay bất bộ:** ở baseline, chiều `api → ai-service` là **sync REST** cho các truy vấn ngắn
(embedding, ranking, RAG search). Job kéo dài (nếu có) do **Agenda** trong process Express điều phối
(ADR-011), không phải bằng một hàng đợi riêng trong Python. *Ghi chú trung thực: NOTES-01 không chốt tường
tận "sync hay async job" cho từng endpoint — câu hỏi này được `RESEARCH-PLAN.md` §3 B2 dòng 129 nêu ra và
vòng 1 chưa trả lời → giới hạn cụ thể của từng endpoint thuộc `06-api-spec.md`.*

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| Chạy toàn bộ AI trong Node (`transformers.js` / ONNX) | Không có bằng chứng trong NOTES-01 rằng PhoBERT đã word-segmented chạy được trên Node; metric + eval harness là `pytest` (§B10 dòng 397) ⇒ vẫn phải giữ Python cho thực nghiệm. Đề cương cũng bắt buộc Python/FastAPI |
| gRPC thay HTTP nội bộ | Không được NOTES-01/RESEARCH-PLAN nhắc tới; thêm codegen layer cho 3 người / 12 tuần; thuộc nhóm "microservice phức tạp" bị loại ở `NOTES-01.md` dòng 530–531 |
| Message queue giữa Node và Python | Mọi queue nghiêm túc cần Redis (BullMQ) — đã bị loại ở baseline (`NOTES-01.md` dòng 530, §B15 dòng 481). Xung đột ADR-011 |
| Gộp `ai-service` vào cùng process với Express bằng child process | Không có bằng chứng trong nguồn; mất lợi ích restart/tài nguyên tách bạch và làm mất ý nghĩa "process riêng để không block event loop" (`RESEARCH-PLAN.md` §3 B9 dòng 194) |
| Ollama / model local thay provider ngoài | Được `RESEARCH-PLAN.md` §3 B6 dòng 163 nêu như một lựa chọn "chọn model + nơi chạy" nhưng NOTES-01 chốt baseline là **Gemini 3.1 Flash-Lite hoặc Groq** (§B6 dòng 305) — model nền tảng cần `transformers`/Python, không phải LLM chat |

## Consequences

**Điểm mạnh:**

- Event loop của Express không bị giữ bởi suy luận CPU ⇒ mục tiêu p95 ở `NOTES-01.md` §B9 còn giữ được ý
  nghĩa khi chatbot tải cao.
- Thực nghiệm S3 (so sánh 4 dòng model: TF-IDF/BM25, PhoBERT mean pooling, multilingual-e5-small,
  paraphrase-multilingual-MiniLM — §B5 dòng 259–264) chạy trong cùng hệ với eval gate CI, không phải
  bắc cầu hai ngôn ngữ.
- Cache embedding "theo skill-string" và warm-up model (`RESEARCH-PLAN.md` §3 B9 dòng 194–195) là việc
  nội bộ của Python; Node không cần biết.
- Là chỗ duy nhất được phép trả vector ⇒ gate "ai-service không import model của API"
  (`RESEARCH-PLAN.md` §11 dòng 344) kiểm chứng được bằng lệnh.

**Đánh đổi thật:**

- **Hai runtime, hai tập dependency, hai lần deploy.** Pipeline CI phải có cả nhánh "Python AI tests"
  (`NOTES-01.md` §B10 dòng 402).
- **Trần RAM chưa biết.** Câu hỏi "VPS Ubuntu 2GB RAM có đủ chạy Node API + Python FastAPI + PhoBERT
  inference trên CPU không? Cần bao nhiêu RAM?" (`RESEARCH-PLAN.md` §3 B1 dòng 118) **chưa có đáp án
  trong NOTES-01** → `[CẦN NGUỒN]`. Đây là rủi ro lớn nhất của ADR này: nếu không đủ RAM, phải chọn
  Render free (ngủ đông) hoặc giảm model, và cả hai đều đụng tới UX nhắc hạn (ADR-010).
- Mỗi call qua biên mạng thêm độ trễ; target `Warm embedding inference < 500 ms` (§B9 dòng 389) là
  **warm**, nên phải có bước warm-up lúc khởi động tiến trình Python.
- **Auth nội bộ giữa hai service chưa chốt:** `RESEARCH-PLAN.md` §3 B2 dòng 129 gợi ý "shared
  secret/HMAC" nhưng NOTES-01 không quyết → `[CẦN NGUỒN]`, phải chốt trước khi expose `ai-service`.
- Không có giao dịch liên tiến trình: `ai-service` không ghi Mongo business data (chỉ đọc policies/vector);
  mọi mutation vẫn do một service duy nhất của Express thực hiện — nhất quán với ADR-004.

## References

- `docs/research/NOTES-01.md` dòng 505–528 (sơ đồ lớp 4 tầng); §B5 dòng 252–268 (PhoBERT params, word segmentation, 4 dòng model); §B6 dòng 290–348; §B10 dòng 397, 401–404
- `docs/research/RESEARCH-PLAN.md` §1 dòng 26; §3 B1 dòng 118; §3 B2 dòng 129; §3 B9 dòng 194–195; §11 dòng 344, 348
- `README.md` dòng 27–28 (Stack, AI)
- `docs/02-architecture.md` §4, §6, §12 (điểm treo #4, #5, #6)

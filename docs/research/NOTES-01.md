# NOTES-01 — Research checkpoint B0–B15 (vòng 1)

- Ngày research: 13/09/2026
- Người thực hiện: (nhóm)
- Nguồn gốc file này: bản do nhóm nộp, lưu **nguyên văn nội dung** để làm bằng chứng khi viết báo cáo.
- Trạng thái nguồn: **URL của các dòng "Nguồn Atlas / Render / Vercel / Netlify" bị mất khi paste**
  (`RESEARCH-PLAN.md` §5 yêu cầu 1 URL cho mỗi con số). Nhóm cần bổ sung URL trước khi bất kỳ số nào
  được chép vào báo cáo. xem mục "CẦN BỔ SUNG" ở cuối file.
  được chép vào báo cáo. Xem mục "CẦN BỔ SUNG" ở cuối file.
Quy ước ký hiệu tôi dùng khi ingest: `(!)` = chỗ research của nhóm bác bỏ/đảo ngược giả định trong
`RESEARCH-PLAN.md` gốc của tôi.

---

## B0 — Chuẩn ngành HRM → user flow

### Kết luận

- ** QUYẾT ĐỊNH:** Phải có workflow `request → approval → reject/request-change → resubmit → notification`.
  Personio dùng đúng kiểu này cho leave, attendance và thay đổi dữ liệu nhân viên. Có cả multi-step
  approval và delegation khi người duyệt vắng.
- **(!) QUYẾT ĐỊNH:** F5 không nên chỉ có "AI đọc nhận xét → KPI". Chu trình đúng hơn là
  `self-review → manager review → calibration/approval → publish → history`. MISA có self-evaluation,
- **QUYẾT ĐỊNH:** Phải có workflow `request → approval → reject/request-change → resubmit → notification`.
- **QUYẾT ĐỊNH:** Onboarding là flow đáng lấy làm tham khảo nhưng **không** đưa vào MVP nếu GVHD chưa
  duyệt mở scope. MISA mô tả checklist, tạo tài khoản, đào tạo, đánh giá thử việc rồi xác nhận/gia hạn/kết thúc.
- **QUYẾT ĐỊNH:** Policy chatbot phù hợp ngành. MISA đã công khai hướng AI trả lời quy định doanh nghiệp
  và hỗ trợ quy trình HR.
- **QUYẾT ĐỊNH:** S8 "confirm-before-write" nên làm. Oracle HCM cũng dùng bước xác nhận/approval khi AI
  thay đổi goal.

### Flow inventory đề xuất

| ID | Flow | Các bước chính | Ngoại lệ quan trọng |
|---|---|---|---|
| UF-01 | Hồ sơ cá nhân | xem → sửa → validate → gửi → duyệt nếu field nhạy cảm → cập nhật | bị từ chối → sửa/gửi lại |
| UF-02 | Nghỉ phép | tạo yêu cầu → kiểm tra quota → quản lý duyệt → cập nhật lịch | reject, huỷ, approver vắng |
| UF-03 | Onboarding | checklist → cấp tài khoản → đào tạo → theo dõi → đánh giá | gia hạn thử việc / nghỉ |
| UF-04 | Gợi ý phân công | nhập yêu cầu → AI ranking → giải thích → quản lý chọn → xác nhận | AI confidence thấp → hỏi thêm |
| UF-05 | Vòng đời đề tài | tạo → giao → thực hiện → nộp → duyệt → hoàn thành | reject → quay lại thực hiện; quá hạn |
| UF-06 | Đánh giá KPI | mở kỳ → tự nhận xét → quản lý đánh giá → AI phân tích → calibration → chốt | thiếu review, override |
| UF-07 | Goal/OKR | tạo/sửa → gửi duyệt → approve/request-info/reject → publish | reject giữ lịch sử |
| UF-08 | Pulse survey | gửi survey → trả lời → aggregate → dashboard | thiếu sample / anonymous |
| UF-09 | Reminder/Digest | scheduler → tìm item sắp hạn → chống trùng → gửi → ack | nghỉ phép, spam, job chạy lại |
| UF-10 | Policy Helpdesk | câu hỏi → intent → retrieve policy → trả lời + nguồn | không đủ bằng chứng → từ chối đoán |

UF-02, UF-03, UF-07, UF-08 **nằm ngoài F1–F7 hiện tại** → để trong `docs/backlog-parked.md` tới khi GVHD duyệt.

### Catalog chatbot intent — bản nháp 28 intent

| Nhóm | Intent |
|---|---|
| Hồ sơ | xem hồ sơ của tôi |
| Hồ sơ | sửa số điện thoại |
| Hồ sơ | xem phòng ban |
| Hồ sơ | xem cấp bậc |
| Hồ sơ | xem kỹ năng |
| Đề tài | xem đề tài của tôi |
| Đề tài | xem đề tài sắp hết hạn |
| Đề tài | xem trạng thái đề tài |
| Đề tài | cập nhật tiến độ |
| Đề tài | nộp báo cáo |
| Đề tài | yêu cầu duyệt báo cáo |
| Đề tài | xem lý do bị từ chối |
| Matching | tìm người phù hợp cho đề tài |
| Matching | vì sao đề xuất nhân viên này |
| Matching | tìm top 5 nhân viên |
| Matching | lọc theo kỹ năng |
| Matching | kiểm tra workload |
| Matching | hỏi thêm khi AI không chắc |
| KPI | KPI của tôi tháng này |
| KPI | KPI phòng ban |
| KPI | so sánh KPI theo tháng |
| KPI | giải thích điểm KPI |
| KPI | gửi nhận xét |
| KPI | yêu cầu điều chỉnh điểm |
| Chính sách | hỏi quy định công ty |
| Chính sách | hỏi quy trình nghiệp vụ |
| Notification | việc nào sắp quá hạn |
| Notification | tóm tắt công việc hôm nay |

Intent phải map sang tool, không để tất cả thành câu hỏi tự do. Ví dụ:

```text
get_my_projects    → projectRepository.read()
find_candidates    → aiService.rankCandidates()
get_kpi            → kpiService.read()
search_policy      → ragService.search()
submit_report      → confirm → reportService.create()
```

### Notification matrix

| Sự kiện | Người nhận | Kênh | Chống spam |
|---|---|---|---|
| Deadline còn 3 ngày | Employee | WS + in-app | 1 lần/ngày |
| Deadline còn 1 ngày | Employee | WS + in-app | 1 lần |
| Quá hạn | Employee + Admin | WS + digest | 1 lần/ngày |
| Báo cáo đã nộp | Admin | WS | theo event |
| Báo cáo bị reject | Employee | WS | theo event |
| Assignment mới | Employee | WS | theo event |
| KPI cần review | Admin | digest | 1 lần/ngày |
| Daily standup (S6) | Employee | chatbot | 1 lần/ngày |
| Daily digest (S6) | Admin | in-app | 1 bản/ngày |

---

## B1 — Hạ tầng free tier

### Trần hạ tầng

| Service | Thực tế hiện tại | Ảnh hưởng |
|---|---|---|
| MongoDB Atlas Free | 0.5 GB, tối đa 500 connections, 100 DB, 500 collections, ~100 ops/s, không backup tự động | đủ đồ án/demo, không dùng như production thật |
| Atlas Search / Vector | Free tier có Search/Vector Search, tối đa 3 index | RAG policy chạy được |
| Render Free | WebSocket được hỗ trợ; sleep sau 15 phút không có HTTP/WS traffic; wake-up có thể ~1 phút | demo được, realtime không luôn tức thì |
| Vercel | từ 22/06/2026 WebSocket ở Public Beta, hỗ trợ cả Socket.IO | frontend + WS có thêm phương án mới |
| Netlify Functions | serverless/streaming tốt, nhưng không phải lựa chọn ưu tiên cho Socket.IO backend chính | dùng frontend tốt hơn |

### Quyết định

```text
MongoDB Atlas
├── business data
├── policies
└── 1 Vector Search index dành cho Policy RAG
```

- **(!) Không dựng Qdrant** ở baseline. F4 skill matching chạy vector/cosine trong Python FastAPI thay vì
  tốn thêm một Atlas Vector index → còn dư index cho thử nghiệm sau.
- **Transaction:** MongoDB đảm bảo atomic ở single document; multi-document transactions có trên replica set,
  nhưng MongoDB khuyên thiết kế schema để giảm nhu cầu distributed transaction. Chọn:

```text
project.status
project.version
project.updatedAt
project.statusHistory[]
transition = atomic conditional update
```

Không thiết kế F2 dựa vào transaction nhiều collection.

---

## B2 — Monorepo MERN + FastAPI

- **(!) Không dùng Turborepo** ở tuần đầu. Ba người / 12 tuần → pnpm workspace là đủ. Turborepo chủ yếu
  đem caching và remote caching; thêm từ đầu chưa tạo nhiều giá trị. Chỉ thêm khi CI/build thực sự chậm.
- **Giữ Express.js.** Không đổi sang NestJS nếu chưa có xác nhận của GVHD — Express đã nằm trong đầu bài.
- Tổ chức Express theo feature:

```text
root/
├─ apps/
│  ├─ web/
│  ├─ api/
│  └─ ai-service/
├─ packages/
│  ├─ contracts/
│  ├─ config/
│  └─ eslint-config/
├─ docs/
├─ pnpm-workspace.yaml
└─ package.json

modules/auth/
  auth.controller.ts
  auth.service.ts
  auth.repository.ts
  auth.schema.ts
  auth.routes.ts
```

- **Contract pipeline:** `Zod schema → OpenAPI → Orval → typed React client`
  (Orval sinh TypeScript client, React Query hooks và schema từ OpenAPI).

---

## B3 — JWT + Refresh Token Rotation + RBAC

- RFC 9700 khuyến nghị refresh-token rotation hoặc sender-constrained refresh token cho public clients.
  Token cũ bị dùng lại = dấu hiệu token family có thể đã bị đánh cắp.

```text
refresh_sessions
- _id / userId / familyId / tokenHash / expiresAt
- revokedAt / replacedBy / userAgent / ipHash
```

```text
LOGIN → Access Token + Refresh Token
  → Refresh → invalidate RT-1 → issue RT-2
  → RT-1 xuất hiện lại?  no → tiếp tục
                         yes → revoke TOÀN BỘ family
```

- Web: Access Token ở **memory**; Refresh Token ở **HttpOnly + Secure + SameSite**; Mongo chỉ lưu **hash**.
- **Password:** OWASP khuyến nghị Argon2id (cấu hình được liệt kê: ~19 MiB memory, 2 iterations, parallelism 1)
  → **Argon2id > bcrypt** cho project mới.
- **JWT library: `jose`** — đang được maintain, hỗ trợ JWT/JWS/JWE/JWK/JWKS, không phụ thuộc package khác.
- **(!) RBAC không trộn 2 trục:**

```text
role  = Admin | Employee          → quyền hệ thống
level = Intern | Junior | Middle | Senior | Lead   → dữ liệu nghiệp vụ
```

Không cần CASL ở MVP với chỉ hai role.

---

## B4 — MongoDB data model

Baseline collections:

```text
users  employees  departments  projects  project_events  reports
evaluations  policies  notifications  refresh_sessions  feedback_events (S4)
```

MongoDB khuyến nghị embed khi dữ liệu thường đọc cùng nhau, reference khi dữ liệu dùng chung / thay đổi
độc lập / quan hệ phức tạp many-to-many.

**State machine F2:**

```text
DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW ─┬─ approve ─→ COMPLETED
                        ↑                        │
                        └────── reject ──────────┘
```

- **(!) Không dùng OVERDUE làm state chính.** Overdue là dẫn xuất:
  `dueDate < now AND status NOT IN {COMPLETED, CANCELLED}`. Dùng OVERDUE làm state sẽ trộn
  *lifecycle state* với *deadline condition*.

**Index:**

```text
employees.employeeCode                      UNIQUE
projects  (status, dueDate) (assigneeIds, status) (departmentId, status, dueDate)
reports   (projectId, createdAt)
evaluations (employeeId, period)            UNIQUE
notifications (userId, readAt, createdAt)
refresh_sessions tokenHash UNIQUE / expiresAt TTL
```

Partial index giúp giảm dung lượng và index maintenance cho tập con document.

---

## B5 — PhoBERT & matching

- PhoBERT-base ~135M params, PhoBERT-large ~370M. **PhoBERT yêu cầu input tiếng Việt đã được word-segmented.**
- Bản gốc công bố MIT, nhưng phải kiểm tra đúng checkpoint trước khi ghi license; model repo khác có thể
  có điều kiện khác.
- **(!) S3 mở rộng thành 4 hàng có baseline rẻ:**

| Model | Vai trò |
|---|---|
| TF-IDF / BM25 | baseline rẻ |
| PhoBERT mean pooling | model **bắt buộc** theo đề cương |
| multilingual-e5-small | sentence embedding baseline mạnh (~118M params, 384 dims, MIT, có bản ONNX/int8 nhỏ hơn đáng kể) |
| paraphrase-multilingual-MiniLM-L12-v2 | baseline multilingual (~50 ngôn ngữ, vector 384 chiều) |

- **(!) Metric:** không dùng F1 để đánh ranking Top-K một cách đơn độc. F4 dùng
  `Precision@1 / @3 / @5, Recall@5, MRR, nDCG@5 (optional), latency, RAM`.
  Nếu GVHD bắt buộc `F1 ≥ 85%` thì định nghĩa thêm bài toán `(employee, project) → phù hợp / không phù hợp`
  và đo Precision/Recall/F1/Accuracy trên đó; Top-K vẫn dùng P@K/MRR. **Đây là câu phải chốt với GVHD.**

### Dataset — phát hiện quan trọng

- **(!) `UFoLD` trong plan gốc là TÊN SAI.** Kết quả công khai nổi bật cho "UFold" là mô hình dự đoán
  **cấu trúc RNA**, không liên quan Vietnamese NLP. → **Không đưa vào báo cáo.**
- `ViETeDis`, `VNIntent`, `Shopee-ITS_VL`, `UIT-VSPC`, `NLUI-VN`: **chưa tìm được nguồn đủ chắc** để xác
  nhận đúng dataset mà plan nói tới → coi như chưa xác minh, không trích.
- **Đã xác minh được:**
  - **PhoATIS** — Vietnamese intent detection + slot filling: 5,871 utterances, 28 intent labels,
    82 slot types; train 4,478 / dev 500 / test 893. Benchmark tổng hợp: JointIDSF intent accuracy ≈ 97.62%,
    JointBERT/PhoBERT ≈ 97.40%. **License cẩn thận**: nguồn VinAI yêu cầu phục vụ nghiên cứu/giáo dục,
    không tự ý phân phối lại.
  - **VN-SLU 2024** — 17,321 utterances từ 240 người nói; phù hợp làm nguồn tham khảo intent/SLU tiếng Việt.
- **Giới hạn phải nhớ:** PhoATIS là domain **đặt chuyến bay**, không phải HR. Không được viết "PhoATIS là
  dataset chuẩn để đánh giá HR chatbot". Nó chỉ phù hợp: pretraining/baseline intent, chứng minh phương
  pháp, benchmark ngoài domain. **Dataset cuối cùng cho HR vẫn nên là HR intent dataset do nhóm tự xây,
  có protocol rõ ràng.**

---

## B6 — LLM + Agent Loop + RAG

- Tính tới 09/2026, Gemini có stable `gemini-3.8-flash`: function calling + structured outputs,
  context ~1,048,576 tokens. Nhưng cho project sinh viên, model rẻ hơn hợp lý hơn:
  `gemini-3.1-flash-lite` có Free Tier, paid ~$0.25/1M input, $1.50/1M output.
- **Groq** Free có quota thật: nhiều model ở 30 RPM; `gpt-oss-120b` ~1,000 RPD và 8K TPM trên Free Plan.
- **OpenAI** không có Free tier cho GPT-5 Mini; ~$0.25/1M input, $2/1M output, có function calling.

**Chọn provider — có tầng abstraction, không hard-code vào business logic:**

```text
LLMProvider interface
├── GeminiProvider
├── GroqProvider
└── OpenAIProvider
Baseline: Gemini 3.1 Flash-Lite hoặc Groq.
```

**Agent architecture:**

```text
User → Intent/router → Agent → Tool selection → Zod validate → Permission check
  ├─ Read tool  → execute
  └─ Write tool → confirmation → execute
→ structured result → LLM response

Guard: maxSteps = 5 | toolTimeout | LLM timeout | max tool result size
       RBAC check every tool | Zod validate every argument
       confirm write operations | audit every mutation
```

**Tool catalog baseline:**

```text
read:   get_my_profile  get_employee  list_projects  get_project  get_my_kpi
        get_department_kpi  find_candidates  explain_candidate_match
        search_policy  get_upcoming_deadlines
write:  submit_progress (confirm)          submit_report (confirm)
        assign_project (confirm + Admin)   change_project_status (confirm)
        override_kpi (confirm + reason + Admin)
```

**RAG:** Atlas Free có Vector Search nhưng tối đa 3 Search/Vector index.

```text
Policy documents → chunk → embedding → Atlas Vector Search → top-K chunks
  → LLM → answer + document/version/source
```

Không fine-tune LLM cho policy QA ở baseline.

**(!) F5 sentiment → KPI — không cho LLM sinh KPI cuối cùng:**

```text
Objective completion score + review semantic signal + manager assessment
        → deterministic KPI formula
AI chỉ tạo: sentiment | themes | risk signals | suggested score component | explanation
Final KPI phải có: machineScore | finalScore | overrideReason | changedBy | changedAt
```

→ làm cho S12 + S13 có ý nghĩa khoa học hơn.

---

## B7 — Socket.IO

Với một instance: `Socket.IO + MongoDB`, **không Redis**.

```text
Rooms: user:<userId>   department:<departmentId>
Events: chat:send chat:accepted chat:chunk chat:done chat:error
        notification:new project:updated report:updated kpi:updated
```

Mỗi client message cần `clientMessageId` để chống duplicate khi reconnect/retry. Socket.IO tự hỗ trợ
fallback và reconnect, nhưng **durable notification vẫn phải persist phía app**. Không cần 2 namespace ngay.

---

## B8 — Dark dashboard

**Chọn shadcn/ui + Recharts.** shadcn hỗ trợ semantic CSS variables (`background`, `foreground`, `card`,
`muted`, `primary`, `destructive`, `chart-1..5`), dark mode qua token/theme → hợp dashboard tùy biến.
Ant Design cũng có dark algorithm/token system tốt nhưng hơi nặng tay nếu muốn UI có bản sắc riêng.
Không cần ECharts lúc này.

---

## B9 — Performance budget

Core Web Vitals "good" (đo tại percentile 75): `LCP ≤ 2.5s` · `INP ≤ 200ms` · `CLS ≤ 0.1`.
LHCI hỗ trợ performance budget và assertions trong CI.

**Internal target (chưa phải chuẩn ngoài — phải benchmark trước khi đưa thành "kết quả"):**

```text
CRUD read p95              < 300 ms
Dashboard aggregate p95    < 800 ms
Chat tool lookup p95       < 1 s
Warm embedding inference   < 500 ms
LLM first token            < 2.5 s
```

---

## B10 — Testing & CI

Chọn: `Vitest` · `Supertest` · `mongodb-memory-server` · `Playwright` · `pytest` · `Lighthouse CI`.
`mongodb-memory-server` chạy MongoDB thật trong process test và có thể dựng replica set → phù hợp hơn mock
repository đơn thuần.

```text
install → lint → typecheck → unit → API integration → Python AI tests
        → AI regression gate → build → Playwright smoke → Lighthouse → gitleaks
```

LLM live API eval **không nên block mọi PR** (quota + tính không ổn định):

```text
PR            → mocked deterministic agent tests
nightly/release → live provider evaluation
```

---

## B11 — Git convention

Conventional Commits 1.0: `type(scope): description`; `feat`, `fix`, `BREAKING CHANGE` có nghĩa semantic rõ.

```text
scopes: auth | hr | project | chatbot | ai | dashboard | realtime | docs | ci
branches: main · feat/... · fix/... · docs/...
```

**(!) Không Git Flow.** Ba người + 12 tuần → short-lived branches + PR + **squash merge**.

---

## B12 — Định dạng báo cáo HUIT

**`UNRESOLVED`.** Chưa tìm được nguồn chính thức đủ tin cậy của Khoa CNTT HUIT xác nhận font, line spacing,
APA hay IEEE, số trang, cách đánh số chương, quy định AI, template `.docx`. Có tài liệu của khoa khác trong
HUIT và file re-upload bên ngoài, nhưng **không coi là nguồn hợp lệ** cho khóa luận CNTT.
Không lấy template trên Scribd hoặc khoa khác để chốt B12. **Bắt buộc xin GVHD/Khoa.**

---

## B13 — Calibration + abstention

- Selective prediction là hướng nghiên cứu có cơ sở: model có thể abstain ở sample confidence thấp thay vì
  buộc dự đoán. ACL 2021 có nghiên cứu riêng về selective prediction trong NLP.
- **Cosine similarity 0.82 KHÔNG có nghĩa 82% xác suất đúng.**

```text
raw cosine score → validation labels → Platt / Logistic calibration
  → estimated probability → threshold
        ├─ high confidence → recommend
        └─ low confidence  → abstain / ask clarification
```

Đánh giá: Reliability diagram · Brier score · ECE · Coverage · Precision among accepted predictions.
Ví dụ objective: `accepted precision ≥ 90%` → đo được `coverage = 72%` (bỏ 28% ca khó để phần còn lại đáng tin).
→ **S2 rất đáng đưa vào NCKH.**

---

## B14 — Explainable matching

**(!) Không giải thích bằng "attention của PhoBERT cao nên skill này quan trọng"** — attention không tự
động đồng nghĩa explanation. Có hướng token-level matching đã được nghiên cứu cho semantic textual
similarity và dễ diễn giải.

| Cách | Dễ làm | CPU | Dễ giải thích |
|---|---|---|---|
| Skill-to-skill cosine | 5/5 | 5/5 | 5/5 |
| Leave-one-skill-out | 4/5 | 3/5 | 5/5 |
| Integrated Gradients | 2/5 | 2/5 | 3/5 |

**Chọn skill-to-skill cosine + leave-one-out.** Định dạng card (số chỉ minh hoạ format, không phải kết quả model):

```text
Nguyễn Văn A — Match 86%
React +0.24 · TypeScript +0.19 · Node.js +0.14 · MongoDB +0.09 · Docker +0.05
Workload penalty -0.08
```

---

## B15 — Scheduler + NL→Data an toàn

- `node-cron` hỗ trợ timezone và `noOverlap`, nhưng bản chất vẫn là cron trong process; tài liệu của nó hướng
  tới BullMQ/Agenda khi cần durable jobs/retries. `BullMQ` mạnh nhưng **cần Redis**; job phải idempotent vì
  queue có retry/delivery semantics. `Agenda` dùng MongoDB → phù hợp hạ tầng hiện có.
- **Chọn: `Agenda` > BullMQ > node-cron** cho reminder quan trọng. Lý do: Atlas đã có → Agenda dùng Mongo →
  không phải dựng Redis → job survive restart.

**S10 — không cho LLM viết Mongo pipeline tự do.** Vanna cảnh báo NL→SQL có thể sinh SQL bất kỳ và khuyên
credential read-only + row-level security khi expose cho user. Project mình khoá mạnh hơn:

```text
LLM → choose report template → Zod enum validation → RBAC
    → server inject user/department scope → predefined aggregation
    → row cap → timeout → result
```

Model chỉ được trả:

```json
{ "report": "department_kpi", "departmentId": "DEV", "month": "2026-09" }
```

Không được trả `$lookup`, `$where`, `$function`, collection name hay raw Mongo query.

---

## Kết luận kiến trúc sau vòng research

```text
React + TypeScript + shadcn/ui + Recharts
                │
                ▼
       Express + TypeScript
       ├── JWT / RT rotation
       ├── RBAC
       ├── Socket.IO
       ├── Agenda
       └── MongoDB Atlas
                │
                ▼
         FastAPI Python
         ├── PhoBERT
         ├── multilingual-e5-small
         ├── matching/eval
         └── calibration
                │
                ▼
             LLM
      Gemini / Groq / provider abstraction
```

**Không thêm ở baseline:** NestJS · Redis · BullMQ · Turborepo · Qdrant · LangChain/LangGraph ·
microservice phức tạp · Kubernetes — chưa tạo đủ giá trị cho nhóm 3 người / 12 tuần.

**5 innovation vẫn chọn:** S3 + S2 + S1 + S6 + S14, nhưng thứ tự đổi thành
`S14 → S3 → S2 → S1 → S6` (khoá phần khoa học trước, agentic feature làm sau).

**Sửa mạnh nhất trong plan gốc:** mục dataset của B5 — không ghi UFoLD / ViETeDis / VNIntent /
Shopee-ITS_VL / UIT-VSPC / NLUI-VN vào docs cho tới khi từng dataset được xác minh. PhoATIS và VN-SLU
mới là hai nguồn tiếng Việt đã xác minh chắc ở vòng này.

**Mốc tiếp theo:** B0, B1, B3, B4 đã đủ để bắt đầu viết architecture/domain/auth docs. B5/B6 đủ để thiết kế
thí nghiệm nhưng **chưa khoá dataset cuối cùng cho F4** tới khi GVHD trả lời "F1 ≥ 85% đo bài toán nào".

---

## CẦN BỔ SUNG (tôi không tự suy đoán thay được)

1. **URL cho mọi con số ở B1** (Atlas limits, Atlas Vector Search free, Render sleep/WebSocket, Vercel WS,
   Netlify) — 4 dòng "Nguồn:" trong bản nộp đang trống.
2. **URL cho B5**: trang PhoBERT (số params + yêu cầu word segmentation + licence), trang HuggingFace của
   multilingual-e5-small và MiniLM, paper + repo PhoATIS (số utterance/intent/slot), VN-SLU 2024,
   RFC 9700, OWASP cheat sheet (Argon2id), tài liệu `jose`, `Orval`, `Agenda`, `node-cron`, `mongodb-memory-server`,
   LHCI, Core Web Vitals, Conventional Commits, bài ACL 2021 selective prediction, paper token-level STS.
4. Xác nhận lại bằng nguồn chính thức: **Atlas Vector Search có trên M0/free hay không** (toàn bộ thiết kế
   RAG ở B6 dựa vào điều này) và **ngưỡng connection của M0** — số trong bảng B1 đang không kèm URL.
4. Xác nhận lại 2 con số cần kiểm tra trước khi chốt thiết kế: Atlas **Vector Search trên M0** (toàn bộ
   thiết kế RAG ở B6 dựa vào nó) và **số connection M0** (500 hay 512).

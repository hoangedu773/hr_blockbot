# 12 — Hiệu năng: ngân sách, chiến lược, cách đo

Khóa luận **KLCN133**. File này trả lời ba câu: **hệ thống được phép chậm tới đâu**, **làm gì để không chậm
hơn thế**, và **đo bằng lệnh nào**. Nó không chứa kết quả đo nào — repo chưa có mã nguồn (`README.md`).

Nguồn:

| Phần | Nguồn |
|---|---|
| Ngưỡng Core Web Vitals + 5 internal target | `docs/research/NOTES-01.md` §B9; `RESEARCH-PLAN.md` §11 (hàng "Hiệu năng front") |
| Trần hạ tầng: Atlas M0, Render sleep/wake, Vercel WS, Netlify | `NOTES-01.md` §B1 |
| Danh sách optimization phải áp dụng (code-split, N+1, projection, aggregate, cache embedding, warm-up, process riêng) | `RESEARCH-PLAN.md` §3 B9 |
| Công cụ đo: `Lighthouse CI` + `size-limit`, mocked vs nightly, thứ tự CI | `NOTES-01.md` §B10; `RESEARCH-PLAN.md` §11 |
| Index nào phục vụ query nào | `05-data-model.md` §4.1 |
| Vì sao aggregate là một pipeline chứ không phải nhiều query; transition là atomic conditional update | `05-data-model.md` §5; ADR-004 |
| Guard của agent loop (timeout, maxSteps, kích thước kết quả tool) | `NOTES-01.md` §B6 |
| Room/event/`clientMessageId` | `NOTES-01.md` §B7 |
| Whitelist report template + row cap + timeout | `NOTES-01.md` §B15; ADR-014 |
| Mô hình: PhoBERT-base ~135M params, multilingual-e5-small ~118M/384 dims | `NOTES-01.md` §B5 |
| Ngưỡng hiệu năng trong cam kết "xong" | `00-vision-scope.md` §7 |

> **Luật dùng số** (trích đúng tinh thần `NOTES-01.md` §B9): internal target *"chưa phải chuẩn ngoài — phải
> benchmark trước khi đưa thành 'kết quả'"*. Vì vậy mọi ô "đã đo chưa" trong file này là **CHƯA** và mọi cột
> "kết quả" là `TBD — chưa đo`. Không con số B1/B5/B6 nào được chép vào báo cáo trước khi nhóm bổ sung URL
> (NOTES-01 mục "CẦN BỔ SUNG").

---

## 1. Ngân sách hiệu năng (performance budget)

Ngân sách là **trần chấp nhận được**, không phải mục tiêu nỗ lực. Vượt trần = PR đó không merge (với các mục
có gate) hoặc phải giải trình (với các mục chưa có gate).

| Tầng | Ngân sách | Loại | Có gate CI? |
|---|---|---|---|
| Front — cảm nhận | LCP ≤ 2.5 s · INP ≤ 200 ms · CLS ≤ 0.1 @p75 (`§B9`) | chuẩn ngoài | có (một khi `apps/web` tồn tại) — `npx @lhci/cli assert` |
| Front — khối lượng | ngân sách KB **theo route** (dashboard ≠ chat) | tự đặt | **chưa có con số** → `TBD`; lệnh đã có: `npx size-limit` |
| API — đọc CRUD | p95 < 300 ms (`§B9`) | internal | **không** (chưa có harness → không được làm gate, theo `RESEARCH-PLAN.md` §11) |
| API — tổng hợp | p95 < 800 ms (`§B9`) | internal | không |
| Chat — tra cứu tool | p95 < 1 s (`§B9`) | internal | một phần: mocked provider chạy trong PR (`§B10`) |
| AI — embedding ấm | < 500 ms (`§B9`) | internal | không (đo ở nightly) |
| LLM — token đầu | < 2.5 s (`§B9`) | internal | **không được chặn PR** (quota + bất định, `§B10`) |
| Nền tảng — đánh thức | thời gian wake-up sau khi ngủ đông (`§B1`: có thể ~1 phút) | trần hạ tầng, không phải thứ tối ưu bằng code | không; quản trị bằng UX + warm-up (`10-ui-ux-spec.md` §6.2) |
| Bộ nhớ phiên AI | RAM tiến trình `ai-service` khi giữ model trong bộ nhớ | chưa có trần — `TBD` | không |

Hai điều không nằm trong ngân sách nào và **không nên** đưa vào báo cáo như cam kết: số request/giây, và
"phục vụ N người dùng". `NOTES-01` không có số nào cho tải kiểm thử; trần thật duy nhất đã biết là **~100
ops/s** và **500 connections** của Atlas M0 (§B1) — cả hai **đang thiếu URL** (`[CẦN NGUỒN]`).

---

## 2. Bảng Core Web Vitals (dịch từ `NOTES-01.md` §B9)

Chuẩn "good", **đo tại percentile 75** — không phải trung bình, không phải "một lần chạy đẹp".

| Chỉ số | Tên đầy đủ | Ngưỡng "good" | Đo bằng gì | Cửa CI | Kết quả |
|---|---|---|---|---|---|
| **LCP** | Largest Contentful Paint | ≤ **2.5 s** | `lighthouse-ci` (`@lhci/cli`) chạy trên bản build production của `apps/web`; `NOTES-01 §B9` nêu LHCI hỗ trợ performance budget + assertions | assertion trong job Lighthouse | `TBD — chưa đo` |
| **INP** | Interaction to Next Paint | ≤ **200 ms** | cùng Lighthouse/field emulation; phần tương tác bảng & chart được kiểm thêm bằng Playwright (`§B10` liệt kê Playwright) | assertion | `TBD — chưa đo` |
| **CLS** | Cumulative Layout Shift | ≤ **0.1** | cùng Lighthouse; nguyên nhân chính trong UI này là bảng đổi trang, skeleton đổi thành nội dung, chart render muộn (`10-ui-ux-spec.md` §5.1) | assertion | `TBD — chưa đo` |

Cấu hình cụ thể (số lần chạy, device profile, route nào bị assert): **`TBD`** — đang là mục #8 trong
`11-quality-testing.md` §9 "Chưa chốt được". Lệnh chạy:

```bash
# file cấu hình lighthouserc.js khai báo URL route nào bị assert (cấu hình: TBD)
npx @lhci/cli autorun
npx @lhci/cli assert
npx size-limit
```

Hàng **không** đưa vào gate ở file này: TBT/KPI nội bộ của Lighthouse — `NOTES-01` chỉ nêu ba chỉ số CWV,
không nêu TBT (tuy `RESEARCH-PLAN.md` §3 B9 có nhắc TBT trong danh sách ngân sách). Chọn giữ đúng ba cái có
ngưỡng; không thêm số thứ tư chưa có trần.

---

## 3. Internal target p95 theo đơn vị công việc

`06-api-spec.md` **chưa tồn tại** (đang được viết song song) → **không có endpoint path thật để dẫn**. Vì vậy
bảng dưới khoá theo **module Express** (`02-architecture.md` §5.2) + tool chatbot (`§B6`). Cột "Đường dự kiến"
ghi rõ là **đường tạm, phải thay bằng path thật khi `06-api-spec.md` khoá**.

| Module / đơn vị | Đường dự kiến (chưa chốt — chờ `06-api-spec.md`) | Target (`§B9`) | Cách đo | Đã đo chưa |
|---|---|---|---|---|
| `modules/auth` — login, refresh | `POST /auth/login`, `POST /auth/refresh` | p95 < 300 ms **trừ thời gian Argon2id verify** | benchmark API trên `mongodb-memory-server` | **CHƯA** — `TBD` |
| `modules/hr` — đọc hồ sơ, phòng ban | `GET /employees/:id`, `GET /departments` | p95 < 300 ms | cùng harness | **CHƯA** |
| `modules/project` — danh mục, chi tiết | `GET /projects`, `GET /projects/:id` | p95 < 300 ms | cùng harness; phải đi qua index I-02/I-03/I-04 | **CHƯA** |
| `modules/project` — transition | `PATCH /projects/:id/status` | p95 < 300 ms | cùng harness; một `findOneAndUpdate` + `$push` (`05` §5.2) | **CHƯA** |
| `modules/hr` — danh mục + phân trang | `GET /employees?page=` | p95 < 300 ms | cùng harness | **CHƯA** |
| F6 dashboard aggregate — KPI theo kỳ, theo phòng ban | route aggregate (tên chưa chốt) | p95 < **800 ms** | benchmark riêng, N lần lặp, có warm-up | **CHƯA** |
| Chat tool lookup — read (`get_my_profile`, `list_projects`, `get_my_kpi`, `get_upcoming_deadlines`, `search_policy`, `get_department_kpi`) | vòng tool-call nội bộ | p95 < **1 s**, **trên mocked provider** để loại độ trễ LLM | test PR mocked (`§B10`, `11-quality-testing.md` §6.2) | **CHƯA** |
| Chat tool lookup — AI (`find_candidates`, `explain_candidate_match`) | Node → `ai-service` | p95 < 1 s **cộng thêm** warm embedding < 500 ms | pytest benchmark CPU + harness API | **CHƯA** |
| Chat tool write (`submit_progress`, `submit_report`, `assign_project`, `change_project_status`, `override_kpi`) | confirm → execute | p95 < 300 ms cho phần execute (không tính thời gian người dùng bấm confirm) | benchmark + integration test | **CHƯA** |
| `ai-service` — embedding | `POST` endpoint embedding (tên chưa chốt) | warm < **500 ms** | `pytest` benchmark trên CPU, ghi rõ model + số chiều vector | **CHƯA** |
| `ai-service` — RAG retrieval | vector query Atlas (`§B6`) | chưa có target riêng — nằm trong 1 s của tool lookup | harness mocked provider + DB thật | **CHƯA** |
| LLM — token đầu tiên | provider API | < **2.5 s** | live provider evaluation, **chỉ nightly/release** | **CHƯA** |
| Realtime — đẩy event | 9 event `§B7` | chưa có target trong nguồn — `TBD` | đo từ lúc server emit tới lúc client nhận | **CHƯA** |

Bốn khoảng trống phải nói thẳng với hội đồng thay vì lấp bằng số:

1. **Mục tiêu chưa có harness thì không phải gate.** Internal target ở `§B9` có ngưỡng nhưng chưa có lệnh →
   `02-architecture.md` §9 đã loại chúng khỏi bảng fitness functions; file này giữ nguyên xử lý đó.
2. **p95 cần định nghĩa mẫu.** Không có N, không có warm-up, không có số lần lặp, không có môi trường → đó là
   "thấy nhanh", không phải con số.
3. **p95 của một hệ thống ngủ đông là vô nghĩa.** Render free sleep sau 15 phút (`§B1`) → phải tách *lạnh*
   (lần đầu sau idle) khỏi *ấm* (các lần sau). Bảng trên là **ấm**. Lần lạnh: `TBD`.
4. **`POST /auth/login` có độ trễ do thuật toán băm**, không do DB: Argon2id với cấu hình `§B3` (~19 MiB,
   2 iterations, parallelism 1) là chi phí **chủ đích đánh đổi** để chống offline attack — không tối ưu bằng
   cách hạ tham số.

---

## 4. Chiến lược

### 4.1 Bundle & code-split theo route

Hai route có hình dạng hoàn toàn khác nhau (`10-ui-ux-spec.md` §3, §6) → chia ở biên route, không chia vụn:

```text
apps/web/src/
  routes/chat.tsx          ← lazy: socket.io-client, markdown renderer, virtualized list
  routes/dashboard.tsx     ← lazy: recharts (Line/Bar), bảng phân trang, aggregate hooks
  routes/login.tsx         ← nhỏ nhất có thể, không mang chart
  chunks dùng chung        ← token/theme, UI primitives (shadcn đã copy vào repo), Orval client
```

Bốn quy tắc:

1. **Recharts không được nằm trong chunk của `/chat` và ngược lại.** Đây là điều `size-limit` assert được
   (`RESEARCH-PLAN.md` §11 hàng "Hiệu năng front").
2. **Không có webfont.** Font hệ thống; mỗi font tự nhúng là thêm request chặn render vào đúng chỗ LCP đo.
3. Code-split không được tạo "transparency bug": chunk load chậm thì vùng nội dung phải có skeleton giữ
   chiều cao (CLS), không được co giãn layout cha.
4. Ảnh: không có ảnh nội dung trong MVP; nếu thêm thì qua build pipeline, không đưa file thô.

Khoảng trống: **ADR-015 nói thẳng "Không có con số bundle của Recharts/shadcn trong nguồn"** → ngân sách byte
cho mỗi route chỉ được chốt sau lần đo đầu tiên (dự kiến tuần 8). Con số hiện tại: `TBD — chưa đo`.

### 4.2 Aggregate thay cho nhiều query; projection để tránh N+1

Đây là mục hiệu năng có **ràng buộc kiến trúc** chứ không chỉ mẹo. `RESEARCH-PLAN.md` §3 B9 nêu đúng ba mũi:
*N+1 do populate, projection, aggregate gộp*.

| Pattern sai | Pattern đúng | Vì sao |
|---|---|---|
| Vòng lặp `findById` cho từng nhân viên trong danh sách đề tài | `$in` một lần, hoặc `$lookup` có kiểm soát trong **một** pipeline | N+1 trên Atlas M0 tính vào trần ops/s; mỗi query thêm còn chiếm connection từ pool |
| `populate()` kéo toàn bộ document | `.select(...)` / `projection` đúng field hiển thị | payload nhỏ → network + parse nhỏ; dashboard `p95 < 800 ms` chủ yếu chết ở đây |
| Client gọi 5 endpoint để vẽ 1 màn hình | **một** route aggregate trả đủ các phần của màn hình | 5 round-trip qua internet biến 5 × 100 ms thành 500 ms + jitter; một pipeline `$group` rẻ hơn nhiều |
| Tính KPI bằng cách tải hết `evaluations` + `projects` lên Node | `$match → $group → $project` trong DB, trả kết quả gọn | trần `~100 ops/s` (`§B1`) không tha thứ cho "tải rồi tính" |
| Transition = 2 update ở 2 collection | **một** atomic conditional update trên `projects`, rồi insert audit sau (`05` §5.2) | vừa nhanh hơn vừa đúng quyết định ADR-004 / `§B1` |

Ba điều kiện đi kèm (không phải tối ưu miễn phí):

- Mỗi aggregate phải **khai báo index nó dùng** trong `05-data-model.md` §4.1. Aggregate không có index = vẫn
  chậm, chỉ chậm ở chỗ khác.
- Aggregate **phải là code đã review**, không phải chuỗi do client/LLM dựng: ADR-014 (`§B15`) — LLM chỉ được
  chọn template, kèm **row cap** và **timeout**. Ngưỡng row cap/timeout cụ thể: `[CẦN NGUỒN]`, ADR-014 mục
  "Mở" #2 để trống.
- Cache kết quả aggregate: **`TBD` — chưa quyết**. `RESEARCH-PLAN.md` §3 B9 nêu "cache Redis/in-memory, ETag"
  nhưng `NOTES-01` §B1 loại Redis khỏi baseline, nên phương án còn lại chỉ là in-memory trong một process —
  không đáng làm cho quy mô này nếu chưa đo.

### 4.3 Index nào phục vụ query nào

Trích `05-data-model.md` §4.1 (ID index giữ nguyên). Cột cuối là **chi phí**, vì mỗi index là một lần ghi thêm
trên mỗi mutation trên nền free tier.

| Index | Query/UI nó phục vụ | Nằm trên đường nóng nào |
|---|---|---|
| **I-01** `employees.employeeCode` UNIQUE | import/seed, đối chiếu mã nhân viên | `make demo` (S14) |
| **I-02** `projects (status, dueDate)` | "đề tài sắp hết hạn" (`get_upcoming_deadlines`), job nhắc hạn 3 ngày/1 ngày, lọc mở theo hạn gần nhất | UF-09 (Agenda quét mỗi lần chạy) |
| **I-03** `projects (assigneeIds, status)` | `list_projects` của một người, tính workload | UF-04 (tie-break bằng workload), `/projects` của Employee |
| **I-04** `projects (departmentId, status, dueDate)` | `get_department_kpi`, dashboard phòng ban, template `department_kpi` | F6 aggregate + S10 (parked) |
| **I-05** `reports (projectId, createdAt)` | "báo cáo của đề tài này, mới nhất trước" | UF-05 bước 5–6 |
| **I-06** `evaluations (employeeId, period)` UNIQUE | một người một kỳ đúng một bản; upsert khi mở kỳ | UF-06, BR-17 |
| **I-07** `notifications (userId, readAt, createdAt)` | chuông "chưa đọc của tôi, mới nhất" + đếm chưa đọc | mọi lần mount dashboard (đường lạnh → phải đọc lại từ DB) |
| **I-08** `refresh_sessions tokenHash` UNIQUE | *"đường nóng nhất: mọi `/auth/refresh` tra RT đúng một lần"* (`05` §4.1) | phiên nào cũng đi qua |
| **I-09** `refresh_sessions expiresAt` TTL | MongoDB tự dọn, "không phải job của nhóm" → **giữ ops cho trần 100/s** | nền |
| **I-10** Vector Search `policies.chunks.embedding` | `search_policy` top-K chunks | UF-10 |
| **I-12…I-18** (`// SUY DIỄN` trong `05`) | timeline tiến độ, login theo email, `userId`→hồ sơ, gom nhân viên theo phòng, danh sách kỳ, chống trùng notification, revoke theo family | — |

Ba cảnh báo đo được:

1. **I-10 là ẩn số hạ tầng.** Toàn bộ thời gian retrieval của UF-10 phụ thuộc "Atlas Vector Search có trên
   M0/free hay không" — `NOTES-01` mục CẦN BỔ SUNG #4 đánh dấu **chưa xác minh** `[CẦN NGUỒN]`. Nếu không có
   → chiến lược RAG đổi, và target 1 s của tool lookup đổi theo.
2. **Partial index (`05` §4.2)** là công cụ giảm chi phí ghi, nhưng bản thân nó là suy diễn của docs (`// SUY
   DIỄN`), không phải kết luận `§B4`. Chỉ bật khi phép đo ghi cho thấy chi phí index thật.
3. Không có **full-text index** thứ hai cho `skills`/`policies.title`: `05` §4.3 hoãn vì trần 3 Search/Vector
   index của Atlas free (`§B1`). Trần đó cũng **đang thiếu URL**.

### 4.4 Cache embedding theo skill-string

`RESEARCH-PLAN.md` §3 B9: "cache embedding theo skill-string". `§B5` cho biết vì sao đây là chỗ sinh lời
trong hệ này: `skills[]` là **mảng chuỗi tự do** (không có collection `skills` — `05` §7 D-07), và mỗi kỹ năng
là một đoạn text **ngắn, lặp lại rất nhiều lần** (React xuất hiện ở hàng trăm hồ sơ).

```text
skill string (đã chuẩn hoá)
  → cache in-memory: key = tên model + version + chuỗi
  → miss  → batch embedding một lần trong ai-service
  → hit   → không tính lại
```

Bốn ràng buộc để cache không thành bug:

- **Key phải có danh tính model.** Baseline có tới 4 ứng viên embedding (`§B5`: TF-IDF/BM25, PhoBERT mean
  pooling, multilingual-e5-small, paraphrase-multilingual-MiniLM) và S3 so sánh chúng. Cùng một chuỗi "React"
  cho vector khác nhau theo model — cache không phân biệt model = kết quả sai một cách im lặng.
- **Cache vô hướng, không cache điểm.** Điểm cosine/calibration phụ thuộc **cặp** (kỹ năng nhân viên, yêu cầu
  đề tài) và có workload penalty; chỉ phần embedding mới tái sử dụng được.
- **TTL/eviction: `TBD`** — nguồn không có số; một process duy nhất (`§B1`) nên cache phình là RAM của chính
  API.
- Cache **không** được cache kết quả LLM (live eval cần gọi thật, ADR-016).

### 4.5 Warm-up model

`§B9` đặt target *"**Warm** embedding inference"* — nghĩa là nguồn đã thừa nhận có trạng thái **lạnh**. Với
`PhoBERT-base` ~135M params và `multilingual-e5-small` ~118M params/384 dims (`§B5`) chạy trên CPU, lần suy
luận đầu tiên sau khi nạp model không thể so với các lần sau.

```text
startup ai-service
  → load model + tokenizer
  → một lần forward với input mồi (đã word-segmented theo yêu cầu §B5)
  → endpoint healthz trả "model: warm"
  → chỉ sau đó API mới nhận request matching
```

- "Chưa warm" phải là **trạng thái quan sát được**, không phải 500 error.
- Yêu cầu **word segmentation** của PhoBERT (`§B5`) nằm trong bước này: tiền xử lý chạy trong `ai-service`,
  không phải ở chat UI (`02-architecture.md` §6 hàng `apps/ai-service`).
- Thời gian warm-up thật: `TBD — chưa đo`. Đây là con số phải có **trước** buổi demo, không phải sau.

### 4.6 Chạy suy luận ở process riêng

Không phải để "kiến trúc cho đẹp": Node là một event loop. Một vòng tokenize + forward của model ~100M+ tham
số chạy trong process API sẽ **chặn mọi request khác**, kể cả REST đọc hồ sơ và WebSocket push. Tách
`apps/ai-service` (FastAPI — ADR-003, `RESEARCH-PLAN.md` §1) trả lại cho `apps/api` khả năng giữ `p95 < 300 ms`
của các route không liên quan AI.

Đánh đổi thật, nói thẳng: thêm một **biên network nội bộ** vào mỗi request AI. Vì thế `Chat tool lookup p95
< 1 s` (`§B9`) được tính **cộng** phần đó, và auth nội bộ giữa hai service vẫn đang treo —
`02-architecture.md` §12 điểm #5: shared secret hay HMAC, `[CẦN NGUỒN]`.

### 4.7 Trần Atlas M0 và connection budget

`NOTES-01.md` §B1 ghi cho M0: **0.5 GB · tối đa 500 connections · 100 DB · 500 collections · ~100 ops/s ·
không backup tự động**; Atlas Search/Vector tối đa **3 index**. Tất cả các số này **đang thiếu URL**
(NOTES-01 mục CẦN BỔ SUNG #1, #4) → chúng là **giả định thiết kế**, không phải số liệu trích được.

Ba hệ quả hiệu năng:

| Ràng buộc | Hệ quả | Cách sống chung |
|---|---|---|
| **~100 ops/s** `[CẦN NGUỒN]` | mỗi request nhiều query, mỗi job quét nhiều collection, mỗi rotation RT là read+write — tất cả cộng vào một cái đồng hồ | aggregate gộp (§4.2), projection, **một pool cho cả API**, TTL index để Mongo tự dọn thay job (`05` §4.1 I-09) |
| **500 connections** (`§B1`; chính con số này đang bị hỏi lại: 500 hay 512 — NOTES-01 CẦN BỔ SUNG #4) | API + `ai-service` + Agenda **cùng một Mongo** | **một** connection pool trong `apps/api` (`02-architecture.md` §6), không mở pool mới mỗi job; `ai-service` đọc policy qua đường riêng có giới hạn |
| **0.5 GB** | `policies.chunks` là phần ăn chỗ nhanh nhất (embedding nhiều chiều × nhiều chunk) | số lượng chunk đưa vào báo cáo là **kết quả đo**, không phải thiết kế; `make demo` dựng lại được là điều kiện bắt buộc (`14-devops-deployment.md`) |

**Không có** con số "hệ thống phục vụ được N người" — chưa bao giờ chạy tải nào, `TBD`.

### 4.8 Render ngủ đông 15 phút: hệ quả độ trễ và cách giảm

Dữ kiện nguồn (`§B1`): *sleep sau 15 phút không có HTTP/WS traffic; wake-up có thể ~1 phút*. `§B1` bình luận
luôn hệ quả: *"demo được, realtime không luôn tức thì"*.

Chuỗi nhân quả mà tài liệu này phải giải thích được, không được dấu (`ADR-010` "Đánh đổi thật"):

```text
không có traffic 15'
  → Render ngủ
  → Agenda (nằm TRONG apps/api, ADR-011) cũng không chạy
  → tới khi có traffic đánh thức (wake-up có thể ~1 phút)
  → reminder mới được gửi / màn hình đầu tiên mới có dữ liệu
```

Bốn cách giảm, xếp theo hiệu quả:

| Cách | Cơ chế | Chi phí / giới hạn |
|---|---|---|
| **Thiết kế lại kỳ vọng** (chủ chốt) | notification **được persist** trong `notifications`, client **đọc lại khi mở tab** (`§B7`: "durable notification vẫn phải persist phía app") → nhắc hạn là *hàng đợi việc cần làm*, không phải chuông đúng phút | không mất gì; đây là lý do ADR-010 biến trần này từ bug thành hạn chế chấp nhận được |
| **Health beat** | một request `GET /healthz` định kỳ từ ngoài để giữ tiến trình thức | **đang cân nhắc, chưa bật**: mỗi beat là một request thiết kế để không phục vụ ai, tính vào trần ops/s; nhịp beat cụ thể: `TBD` |
| **Giữ phiên khi demo** | mở sẵn tab dashboard + một kết nối WS trong suốt buổi demo (checklist "trước khi demo" ở `14-devops-deployment.md`) | chỉ cứu được phiên demo, không cứu ngày thường |
| **Demo sẵn / script đã chạy** | dữ liệu và kết quả đã hiển thị trước khi người xem tới | trung thực: phải nói rõ đó là phiên đã warm, không phải "vừa mở máy đã nhanh" |
| **VPS Ubuntu** (phương án đề cương cho phép — `RESEARCH-PLAN.md` §1) | tiến trình không ngủ → job đúng giờ, WS tức thì | RAM **chưa được chứng minh** đủ cho Node API + FastAPI + PhoBERT CPU (`02-architecture.md` §12 #6): `[CẦN NGUỒN]` |

Không có số đo nào cho "thời gian đánh thức thật là bao lâu". Con số "~1 phút" là của `§B1` **không kèm URL**
→ không được chép vào báo cáo như kết quả đo; muốn có số phải tự đo và ghi ngày + commit.

### 4.9 Độ trễ LLM và token đầu tiên

Target `LLM first token < 2.5 s` (`§B9`) là con số **dễ đạt nhất bị phá** trong bảng, vì nó không chỉ phụ thuộc
model: nó là tổng của (router/chọn tool) + (gửi prompt) + (hàng đợi RPM của provider) + (stream về).

Bốn kiểm soát, tất cả đều là quyết định đã chốt chứ không phải mẹo:

| Kiểm soát | Nội dung | Nguồn |
|---|---|---|
| Guard | `maxSteps = 5`, `toolTimeout`, `LLM timeout`, `max tool result size` | `§B6` |
| Prompt nhỏ | top-K chunks cho RAG, không dump cả tài liệu; tool result bị chặn kích thước ở trên | `§B6` (RAG flow), guard |
| Model rẻ có Free Tier | baseline `gemini-3.1-flash-lite` hoặc Groq, abstraction `LLMProvider` | `§B6`, ADR-012 |
| Stream | `chat:chunk` → `chat:done`: hiển thị dần thay vì chờ bản đầy đủ | `§B7` |

Và một sự thật phải nói to: **quota free tier** (`§B6`: Groq nhiều model ~30 RPM, `gpt-oss-120b` ~1.000 RPD
và 8K TPM; các con số này cũng **chưa có URL**). Hết quota → S9 rơi về pipeline PhoBERT-only
(`RESEARCH-PLAN.md` §9), và **đo % tính năng còn dùng được** — chỉ số đó là `TBD` cho tới khi chạy phép đo.

---
## 5. Quy trình đo

### 5.1 Bốn luật

1. **Không trích số chưa đo.** Ô trống thì ghi `TBD — chưa đo`, không ghi "dự kiến đạt".
2. **Mọi số phải kèm 5 thứ:** lệnh chạy · commit · ngày + múi giờ · môi trường (device/CPU/RAM, vùng hosting)
   · N và số lần lặp. Thiếu một trong năm → dòng đó là ghi chú, không phải kết quả (`11-quality-testing.md` §3
   cùng tinh thần).
3. **Một dòng target chỉ được giữ nếu có lệnh chạy nó** (`RESEARCH-PLAN.md` §11). Không có lệnh → xuống mục
   "kế hoạch", không lên bảng gate.
4. **Không suy ra "đạt" từ một lần chạy may mắn**, không mượn benchmark của dự án khác để so.

### 5.2 Frontend — Lighthouse CI trong CI

```bash
# build rồi phục vụ bản production để đo đúng thứ user nhận
pnpm --filter web build
pnpm --filter web start --port 4173 &   # chờ lên cổng

# URL route được đo khai báo trong lighthouserc.js (cấu hình: TBD — 11-quality-testing.md §9)
npx @lhci/cli autorun
npx @lhci/cli assert
npx size-limit
```

Ba ràng buộc cấu hình: assert **đúng ba chỉ số §B9** (LCP/INP/CLS); đo **cả hai route** (`/dashboard`,
`/chat`) vì chúng có bundle khác nhau (§4.1); số lần chạy lấy median, không lấy kết quả đơn lẻ. Ba giá trị cấu
hình đó (device profile, số lần, danh sách route) hiện là `TBD` — mục #8 của `11-quality-testing.md` §9.

### 5.3 API — benchmark p95

Công cụ: **`TBD`** — đây chính xác là mục #9 của `11-quality-testing.md` §9 ("Công cụ benchmark API +
embedding"), và `12-performance.md` là file được giao chốt nó. Phương án đang cân nhắc và **chưa chọn**:
script Node chạy trên `mongodb-memory-server` (cùng nền với gate "API integration" ở `§B10`, không cần dịch vụ
mới) so với k6 (đo tải thật hơn nhưng thêm một binary vào CI).

Khuôn báo cáo bắt buộc, áp dụng cho **mọi** dòng p95:

```text
target           : p95 < 300 ms  (§B9)
state            : warm | cold sau idle   ← hai số khác nhau, không trộn
N                : số request / số iteration
model/provider   : với đường AI, ghi rõ tên + phiên bản đã pin
hardware         : CPU/RAM của máy chạy hoặc loại instance hosting
dataset          : seed key (S14) — không có thì kết quả không tái lập
raw artifact     : file kết quả lưu trong CI artifact, không chỉ ảnh chụp
```

`Chat tool lookup p95` phải đo **với mocked provider** trong PR (`§B10`: PR chạy mocked deterministic agent
tests) và **với provider thật** ở nightly/release — hai con số khác nhau, cùng tên nhưng khác ý nghĩa
(ADR-016). Ghi nhầm số nightly vào cột PR là lỗi báo cáo, không phải lỗi đo.

### 5.4 AI service

```bash
cd apps/ai-service
pytest -q -m bench
```

Phải ghi: trạng thái warm (§4.5), số chiều vector, model đã pin, và **RAM** (`RESEARCH-PLAN.md` §3 B5/B9 yêu
cầu latency + RAM). Ngưỡng RAM không có trong nguồn → `TBD`.

### 5.5 Nhịp đo

| Khi | Chạy gì | Chặn merge? |
|---|---|---|
| Mỗi PR đụng `apps/web` | Lighthouse + `size-limit` (§5.2) | **có** |
| Mỗi PR | mocked chat tool lookup | **có** |
| Nightly | live provider eval (first token), API benchmark đầy đủ, pytest bench | **không** — fail thành issue có chủ (ADR-016 luật 4) |
| Tuần 8 (B9) | lần chốt ngân sách KB + cấu hình LHCI | — |
| Tuần 10–11 | đo nền cho báo cáo; đóng băng tính năng tuần 11 (`RESEARCH-PLAN.md` §12 luật 5) | — |
| Trước demo | chạy lại checklist "trước khi demo" ở `14-devops-deployment.md` | — |

Gate "Chất lượng mô hình" của `RESEARCH-PLAN.md` §11 (*F1/P@5 không tụt quá 2 điểm so với baseline công bố ở
`09-ai-evaluation.md`*): **chưa bật** — `09-ai-evaluation.md` đang được viết song song và baseline chưa tồn
tại; không có mốc thì gate không có ngữ nghĩa (`11-quality-testing.md` §4.4).

---

## 6. Optimization log (template)

Mọi thay đổi có chủ đích về hiệu năng phải để lại một dòng ở đây, **kèm phép đo trước/sau**. Không có dòng
nào được điền "sau" bằng con số chưa đo. Log trống ở thời điểm này là **trạng thái đúng**, không phải thiếu
sót.

| Ngày | Commit | Vùng | Thay đổi | Trước | Sau | Cách đo | Kết luận |
|---|---|---|---|---|---|---|---|
| — | — | — | *(trống — chưa có thay đổi nào được đo)* | `TBD` | `TBD` | §5 | — |

Năm quy tắc cho bảng này:

1. Một dòng = **một** thay đổi. Gom ba tối ưu vào một dòng thì không biết cái nào có công.
2. "Trước" phải đo **trên cùng harness** với "sau"; đổi harness giữa chừng = hai dòng, không phải một.
3. Không có "sau" thì không có dòng: thay đổi không đo được là thay đổi không đáng ghi (và theo §12 luật 2 của
   `RESEARCH-PLAN.md` — cũng không đáng đưa vào phạm vi).
4. Kết luận được phép là **`thua`** — một tối ưu làm chậm thêm, hoặc rẻ không đáng độ phức tạp nó mang lại, là
   kết quả thật. Báo cáo nên có ít nhất một dòng như vậy; đó là bằng chứng đã đo.
5. Số chưa có URL nguồn không được mang so sánh với số của dự án khác.

Danh sách ứng viên cho bảng này — lấy nguyên văn từ `RESEARCH-PLAN.md` §3 B9, mỗi cái sẽ thành một dòng khi có
đo: code-split dashboard/chat · `moment` → `dayjs` (chỉ nếu codebase thật sự đang dùng `moment`; chưa dùng thì
**không** có dòng này) · trọng số KB của Recharts · projection thay `populate` · aggregate gộp · cache
embedding theo skill-string · warm-up model · batch embedding · process riêng cho suy luận · ETag.

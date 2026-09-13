# RESEARCH PLAN — KLCN133: Chatbot chuyển đổi số quản lý nhân sự

Nguồn ràng buộc: `docs/KLCN133_TranVietHung.docx` (đề cương, GVHD Trần Việt Hùng, 25/08/2026).
Plan này chỉ định **nhóm đi research cái gì, theo thứ tự nào, nộp về dạng nào** để tôi convert thành docs chuẩn.

**TRẠNG THÁI — sau vòng research 1 (13/09/2026).** Kết quả nhóm nộp lưu tại [`NOTES-01.md`](NOTES-01.md).
Plan gốc dưới đây giữ nguyên làm bằng chứng vòng 1 và **đã bị research bác/đảo ngược tại**:
B0 (thêm tầng approval + chu kỳ KPI có calibration) · B1 (**bỏ Qdrant**, Atlas Vector có trên free; Render sleep 15'
→ WS không tức thì; **không multi-doc transaction**) · B2 (**bỏ Turborepo**, giữ Express) · B3 (**Argon2id thay bcrypt**,
**`jose` thay `jsonwebtoken`**, tách `role` khỏi `level`, **bỏ CASL**) · B4 (**`OVERDUE` không phải state**) ·
B5 (**danh sách dataset bị bác**, metric đổi sang P@K/MRR) · B6 (**LLM không sinh KPI cuối**) · B8 (chốt shadcn/ui +
Recharts) · B11 (**không Git Flow**, scope `task` → `project`) · B15 (**Agenda**, không Redis/BullMQ).
**B12 vẫn `UNRESOLVED` — bắt buộc xin GVHD/Khoa.**

---

## 0. Nguyên tắc làm việc

1. **Bạn research → tôi viết docs.** Tôi không bịa số liệu, không giả sử ràng buộc của Khoa.
   Mọi thứ quyết định kiến trúc (hạn mức hạ tầng, giới hạn mô hình AI, định dạng báo cáo) phải có nguồn.
2. **Research theo batch, không tràn lan.** Mỗi batch có câu hỏi đóng (trả lời được bằng có/không/số),
   từ khóa tìm kiếm, và output cụ thể. Quá giờ ngân sách mà chưa có câu trả lời → ghi `UNRESOLVED` rồi đi tiếp,
   đừng kẹt.
3. **Không research thứ tôi tự làm được** (xem §4).
4. **Tiêu chí chọn**: thông tin này có làm thay đổi quyết định thiết kế không? Không → bỏ.

---

## 1. Ràng buộc cứng trích từ đề cương (đây là "đầu bài", không cần research lại)

| Nhóm | Ràng buộc |
|---|---|
| Scope | 7 chức năng (F1 hồ sơ/phòng ban/5 cấp bậc, F2 vòng đời đề tài, F3 chatbot tra cứu, F4 gợi ý phân công PhoBERT, F5 phân tích ngữ nghĩa nhận xét → KPI, F6 dashboard, F7 báo cáo nghiệm thu + nhắc hạn) |
| Stack | MERN + TypeScript; lõi AI Python/FastAPI; Socket.IO; pnpm monorepo; CI/CD; MongoDB Atlas M0; Render/VPS Ubuntu; Vercel/Netlify |
| Auth | JWT + Refresh Token Rotation; RBAC Admin/Employee |
| Chatbot | Intent detection, Function Calling, Agent Loop, tra cứu KPI + hỏi đáp chính sách, realtime qua WebSocket |
| AI metric | **F1-score ≥ 85%** + Accuracy trên tập test chuẩn |
| UI | Dashboard **nền tối**, biểu đồ biến động KPI (Recharts theo timeline tuần 3) |
| Kiểm thử | Postman (API), Lighthouse (giao diện), eval mô hình, UAT với giảng viên + sinh viên đóng vai |
| Tiến độ | 12 tuần, 24/08/2026 → 16/11/2026, 3 SV, gặp GVHD ≥ 1 lần/tuần |
| Rubric | 10 điểm: khảo sát 0.75 · phân tích (use-case & sơ đồ lớp phân tích) 0.75 · thiết kế lớp + dữ liệu 0.5 · **thiết kế giao diện 0.5** · cài đặt 7 chức năng **3.5** · kiểm thử & triển khai **0.75** · nội dung báo cáo 0.5 · **định dạng báo cáo 0.5** · thái độ 0.5 · phong cách slide 0.5 · NCKH +1.0/+0.5 |

**Điểm mù cần clarify với GVHD trước khi research sâu** → xem §7.

---

## 2. Bộ docs sẽ sinh ra sau khi có kết quả research

Bạn không cần viết mấy file này — tôi viết. Bạn chỉ cần nộp "notes" theo template §5.

```
docs/
  00-vision-scope.md          Mục tiêu, phạm vi, out-of-scope, định nghĩa "xong"
  01-requirements.md          FR theo F1–F7 + NFR, traceability → CLO/rubric
  02-architecture.md          C4 (L1 Context / L2 Container / L3 Component), ADR index
  03-decision-records/        ADR-001..0nn (mỗi quyết định lớn 1 file)
  04-domain-model.md          Bounded context, 5 cấp bậc, trạng thái đề tài, nghiệp vụ KPI
  05-data-model.md            ERD Mongo + JSON Schema + index strategy + migration policy
  06-api-spec.md              REST/OpenAPI + WebSocket event contract + error catalog
  07-auth-rbac.md             Flow JWT/RT rotation, matrix quyền Admin × Employee
  08-algorithms.md            PhoBERT similarity, intent/agent loop, sentiment→KPI, công thức score
  09-ai-evaluation.md         Dataset, protocol, F1/accuracy baseline, target, cách báo cáo
  10-ui-ux-spec.md            Design tokens dark, layout, component inventory, chat UX, a11y
  11-quality-testing.md       Test pyramid, coverage target, Lighthouse budget, checklists
  12-performance.md           Latency budget, N+1/bundle/cache, capacity, optimization log
  13-security.md              Threat model, OWASP checklist, secrets, rate limit, PII
  14-devops-deployment.md     CI/CD, env matrix, runbook deploy/rollback, free-tier limits
  15-engineering-conventions.md Conventional Commits, branch model, naming, code style, DoR/DoD
  16-project-plan.md          WBS 12 tuần, RACI 3 người, mốc nghiệm thu theo tuần
  17-innovation-playbook.md   Ý tưởng sáng tạo S-series, effort, gate, map rubric/NCKH
  18-user-flows.md            Hành trình & luồng thao tác 2 vai, catalog ý định, ma trận thông báo
  backlog-parked.md           Ý tưởng bị dời ra ngoài phạm vi + lý do (chống mất dấu)
```

---

## 3. Plan research — B0–B12 (nền tảng), theo thứ tự dependency

Ngân sách ~**66h nhóm** cho B0–B12; B13–B15 (§13, ~11h) riêng cho Innovation track.
`P0` = không có là không code được; `P1` = chặn 1 tính năng; `P2` = làm sau vẫn an toàn.

### B0 — Chuẩn ngành HRM thông minh → luồng người dùng · **P0 · 6h · trước B3, B4, B6**
**Vì sao batch này tồn tại:** đề cương liệt kê 7 chức năng nhưng không nói *ai thao tác gì, theo thứ tự nào, ngoại lệ ra sao, hệ thống phải nói gì*. Đó chính là phần "khảo sát hiện trạng, mô hình hoá quy trình nghiệp vụ" mà rubric cho 0.75đ — và là căn cứ duy nhất để thêm luồng mới, thay vì nhóm tự nghĩ nghiệp vụ.

**Cách làm (mỗi sản phẩm ~25–30 phút; chỉ xem demo / video hướng dẫn / help doc / screenshot, bỏ qua trang marketing):**
1. Quốc tế — self-service & helpdesk AI: `Leena AI`, `Moveworks`, `HiBob`, `Personio`, `BambooHR`, `Rippling`, `Gusto`.
2. Quốc tế — hiệu suất & mục tiêu: `Lattice`, `15Five`, `Culture Amp`, `Peakon (Workday)`.
3. Quốc tế — suite & onboarding: `Workday`, `SAP SuccessFactors`, `Oracle HCM`, `UKG`, `Paradox`.
4. Việt Nam (giọng nghiệp vụ + biểu mẫu VN): `Base HR`, `AMIS HRM`, `Misa e-HR`, `1Force`, `NawaWorks`. *Kiểm chứng lại tên/ngành trước khi ghi báo cáo.*
5. Từ khoá: `HR chatbot user journey`, `employee self-service workflow`, `manager workflow HRIS`, `performance review cycle flow`, `AI HR assistant intents`.

**Khung so sánh — mỗi sản phẩm điền các ô sau:**

| Vai (actor) | Luồng thao tác | Điểm khởi đầu | Bước 1→n | Ngoại lệ / làm hỏng | Kênh & lịch thông báo | Có AI không — AI làm gì |
|---|---|---|---|---|---|---|

**Bảng chốt — đối chiếu với đề cương, để biết "thêm flow user" là thêm cái gì:**

| Luồng chuẩn ngành | Đề cương đã có? | Ghi vào đâu |
|---|---|---|
| Tra cứu/sửa hồ sơ cá nhân, phiếu lương, bảo hiểm | một phần (F1) | UF-01 |
| Xin nghỉ phép & duyệt theo cấp | **chưa** | UF-02 (kéo theo state machine mới trong B4) |
| Onboarding checklist / offboarding thu hồi quyền | chưa | UF-03 |
| Giao việc theo kỹ năng + chấp nhận/từ chối | có (F4) | UF-04 — nguồn intent cho chatbot |
| Theo dõi tiến độ & nộp báo cáo nghiệm thu | có (F2, F7) | UF-05 |
| Chu kỳ đánh giá KPI: tự nhận xét → cấp trên chấm → **hiệu chỉnh (calibration)** giữa phòng ban | một phần (F5) | UF-06 |
| Mục tiêu OKR cascade từ công ty xuống cá nhân | chưa | UF-07 (cân nhắc — dễ overlap F5) |
| Pulse survey / đo mức gắn kết | chưa | UF-08 |
| Nhắc hạn & digest cho quản lý | có (F7) | UF-09 |
| Helpdesk chính sách (hỏi đáp có trích nguồn) | có (F3) | UF-10 |

**Output phải nộp (thứ tôi ingest thẳng):**
- `flow inventory`: 8–12 luồng, mỗi luồng 5–8 bước, kèm **ngoại lệ** (từ chối, quá hạn, uỷ quyền, nghỉ giữa chừng).
- **catalog ý định** cho chatbot: 20–40 câu người dùng thật sẽ hỏi, phân nhóm, mỗi ý định → tool/dữ liệu cần đọc.
- **ma trận thông báo**: ai nhận, kênh nào (WS/email/push), tần suất, ngưỡng chống spam.
- 3–5 **screenshot/link demo** cho mỗi luồng đáng học + ghi chú "vì sao luồng này tốt".
- Ghi `UNRESOLVED` nếu sản phẩm không công khai tài liệu (đóng dấu "không kiểm chứng được" — tôi sẽ không viết vào docs).

**Hệ quả kéo theo:** luồng nào được chọn phải có **role + state + collection** tương ứng → B3 (RBAC) và B4 (data model) phải **chờ B0**, không làm ngược.

### B1 — Ràng buộc hạ tầng & hạn mức thực tế · P0 · 4h · trước tuần 1
Mục tiêu: biết trần của stack free để thiết kế không phải đập đi.
- Render: WebSocket/Socket.IO có chạy trên free tier không? idle timeout bao lâu, service có bị sleep không?
- Atlas M0: storage/RAM/collection limit, có **transactions** không (F2 đổi trạng thái + F7 ghi report), có backup không, connection string pooling?
- Vercel/Netlify free: timeout function, bandwidth, có giữ được WS client không?
- VPS Ubuntu rẻ (2GB RAM) có đủ chạy Node API + Python FastAPI + PhoBERT inference trên CPU không? Cần bao nhiêu RAM?
- Từ khóa: `render.com websocket socket.io timeout`, `mongodb atlas m0 limits transactions`, `vercel free tier limits 2026`, `phobert inference cpu memory`
- Nộp về: **bảng "Trần hạ tầng"** — mỗi dòng: dịch vụ / limit / nguồn URL / ảnh hưởng thiết kế / workaround nếu vượt.
- Hệ quả phải quyết: nếu M0 không có transaction → thiết kế state machine dùng atomic update + status log thay vì multi-doc transaction. Ghi rõ lựa chọn.

### B2 — Kiến trúc monorepo MERN + Python sidecar · P0 · 5h · tuần 1
- Cấu trúc `apps/` + `packages/` với pnpm workspace: API, Web, ai-service, shared types.
- Turborepo có cần không, hay pnpm workspace đủ cho repo 3 người?
- TypeScript: chia shared types giữa client/API thế nào (hand-written vs codegen từ OpenAPI vs `zod` + `zod-to-openapi`)?
- NestJS vs Express thuần — đề cương ghi Express.js; nếu muốn NestJS phải xin GVHD (§7).
- Pattern tổ chức module theo tính năng (thin controller → service → repository).
- Cách Node gọi FastAPI: sync REST hay async job; auth nội bộ giữa 2 service (shared secret/HMAC).
- Từ khóa: `pnpm workspaces turborepo node react monorepo structure`, `nestjs vs express typescript 2025`, `openapi typescript codegen orval`, `node python microservice internal auth`
- Nộp về: cây thư mục đề xuất + **3 reference repo GitHub** (star cao, còn maintain, cùng stack) + ghi chú vì sao chọn/bỏ.

### B3 — Auth: JWT + Refresh Token Rotation + RBAC · P0 · 5h · tuần 2
- Refresh token rotation + reuse detection: phát hiện thế nào, lưu hash ở đâu (Mongo), TTL khuyến nghị.
- Lưu token: httpOnly cookie vs memory + `Authorization` header (2 client: web + chatbot).
- RBAC 2 vai × 5 cấp bậc: permission matrix hay role hierarchy? Có cần CASL không?
- Password hashing: bcrypt vs argon2 + tham số cost; rate limit đăng nhập; khóa tài khoản.
- Thư viện JWT còn maintain không (`jose` vs `jsonwebtoken`).
- Từ khóa: `refresh token rotation reuse detection OWASP`, `jsonwebtoken vs jose npm`, `argon2 vs bcrypt node`, `RBAC vs ABAC node.js`
- Nộp về: **sequence diagram** (Mermaid) login → refresh → logout/reuse-detect + bảng permission matrix nháp + danh sách OWASP ASVS controls áp dụng.

### B4 — Data model MongoDB cho HR + workflow · P0 · 5h · tuần 2
- Embed vs reference: employee ↔ department ↔ level ↔ skills; task ↔ assignees; task ↔ status history; report ↔ task.
- State machine vòng đời đề tài: `Khởi tạo → Đã giao → Đang thực hiện → Chờ duyệt → Hoàn thành` (+ nhánh từ chối/quá hạn). Dùng `xstate` hay tự viết chuyển tiếp trong service?
- Index: tra cứu theo `employeeId + status + dueDate`, full-text search cho skills/policy.
- Audit/soft-delete/history (event log) — phục vụ "theo dõi tiến độ".
- Pagination cho dashboard: offset vs cursor; aggregate pipeline cho thống kê KPI theo tháng.
- Từ khóa: `mongodb schema design embed vs reference`, `mongodb state machine workflow pattern`, `mongodb partial index status dueDate`, `mongoose transaction alternative atomic update`
- Nộp về: **nháp ERD** (collection + field chính + quan hệ) + danh sách index dự kiến + ghi chú embed/reference.

### B5 — PhoBERT & semantic similarity cho gợi ý phân công (F4) · P0 · 8h · tuần 3–5
**Phần khoa học nhất: quyết định metric F1 ≥ 85% và cơ hội +1.0 điểm NCKH.**
- `vinai/phobert-base` vs `phobert-large`: kích thước, licence, chạy CPU được không, yêu cầu version `transformers`/`undertheseanlp`.
- Tokenization tiếng Việt: RoBERTa byte-level, có cần tiền xử lý dấu thanh/viết không dấu?
- Sentence embedding từ PhoBERT: mean-pooling vs CLS; các lựa chọn thay thế (`GloVe-25Vn`, `UTBank`, `multilingual-e5-small`, `paraphrase-multilingual-MiniLM`, `GlotFC`, `phoqwen`) — **phải có baseline so sánh**.
- Bài toán short-text matching (skills ↔ yêu cầu đề tài): cosine similarity + threshold tuning, top-K ranking, tie-break bằng workload hiện tại.
- ~~Dataset tiếng Việt: `UFoLD`, `ViETeDis`, `VNIntent`, `Shopee-ITS_VL`, `UiT-VSPC`, `NLUI-VN`~~ → **BÁC BỎ theo NOTES-01 B5.** `UFoLD` là tên sai ("UFold" công khai nổi bật là mô hình dự đoán cấu trúc **RNA**, không liên quan Vietnamese NLP); 5 tên còn lại **chưa xác minh được nguồn** → không trích vào báo cáo.
- Đã xác minh: **PhoATIS** (5.871 utterances / 28 intents / 82 slot types; licence hạn chế nghiên cứu–giáo dục) và **VN-SLU 2024** (17.321 utterances / 240 người nói). Giới hạn: PhoATIS là domain **đặt vé máy bay** → chỉ dùng làm baseline/phương pháp, không được gọi là "dataset chuẩn cho HR chatbot". Dataset HR cuối cùng do nhóm tự xây + protocol rõ.
- Đánh giá: **F1 không dùng đơn độc cho ranking Top-K** (NOTES-01 B5). F4 = Precision@1/@3/@5, Recall@5, MRR, nDCG@5 (optional), latency, RAM. Nếu GVHD giữ `F1 ≥ 85%` → định nghĩa thêm bài toán nhị phân `(employee, project) → phù hợp/không` rồi đo P/R/F1/Accuracy. Vẫn phải chốt ở §7.2.
- Từ khóa: `PhoATIS intent detection Vietnamese`, `VN-SLU 2024 dataset`, `PhoBERT word segmentation requirement`, `PhoBERT sentence embedding semantic similarity`, `precision@k evaluation recommendation`, `phobert mean pooling`
- Nộp về: **bảng so sánh mô hình** (tên / kích thước / chất lượng tiếng Việt / chạy ở đâu / licence / link) + dataset + protocol eval (cách chia train/test, cách tính F1) + **3 paper** để trích báo cáo.

### B6 — LLM: Function Calling + Agent Loop + hỏi đáp chính sách (F3, F5) · P1 · 8h · tuần 5–8
- Chọn model + nơi chạy: Gemini / GPT-4o-mini / Groq / Ollama local. Free tier thực tế (RPM, TPM, hành xử khi hết hạn), giá/1M token, tool calling chuẩn không.
- Agent loop: ReAct vs function-calling native; guard `max_steps`, timeout, fallback khi tool fail.
- Tool schema dạng JSON Schema; validate tham số LLM trả về bằng zod trước khi execute (LLM hallucinate args).
- Hỏi đáp chính sách: RAG trên tài liệu HR (chunking tiếng Việt, embedding nào, vector store: Atlas Vector Search vs Qdrant vs in-memory) so với prompt-stuffing / fine-tune. Atlas M0 có Vector Search không?
- Sentiment nhận xét → KPI (F5): classification vs regression vs LLM-as-judge; rubric ánh xạ điểm; chứng minh "công bằng" (giải thích được + cho phép hiệu chỉnh thủ công).
- Eval luồng hội thoại: bộ test case, tỷ lệ chọn đúng tool, tỷ lệ tham số đúng, latency, chi phí/phiên.
- Từ khóa: `LLM function calling reliability validate arguments`, `LangGraph vs plain loop agent`, `RAG Vietnamese documentation chatbot`, `Atlas Vector Search M0`, `LLM as a judge sentiment grading bias`
- Nộp về: bảng model (giá/limit/context/tool-calling) + luồng agent (Mermaid) + danh sách tool cần có + cách eval.

### B7 — Realtime Socket.IO · P1 · 4h · tuần 6
- Auth trong handshake (`socket.handshake.auth` + verify JWT), reconnect + state recovery, room theo `userId`/`departmentId`.
- Delivery guarantee: ack, retry, tin nhắn lúc offline → có persist message vào Mongo không.
- Scaling: Redis adapter — 1 instance thì không cần, nhưng phải ghi rõ "out of scope, tại sao".
- Render/VPS: `transports`, sticky session có cần không, heartbeat/timeout.
- 1 namespace hay 2 (chatbot hội thoại vs thông báo nhắc hạn).
- Từ khóa: `socket.io authentication jwt handshake`, `socket.io connection state recovery`, `websocket on render node`
- Nộp về: **event contract** nháp (tên event, payload, ai gửi/ai nhận, ack) — tôi đưa thẳng vào `06-api-spec.md`.

### B8 — Design system dark dashboard + chat UX (rubric 0.5đ giao diện) · P1 · 6h · tuần 4–7
- Dark tokens: nền/elevation, màu semantic, **contrast WCAG AA** trên nền tối, màu chart phân biệt được trong dark.
- Chart: Recharts (timeline đã chốt) đủ chưa hay cần visx/ECharts; loại biểu đồ cho "biến động KPI"; anti-pattern dashboard dày chart.
- Chat UI: virtualized list, typing indicator, optimistic send, markdown + card kết quả tra cứu, skeleton, responsive mobile.
- Component lib: shadcn/ui (Tailwind) vs Ant Design (enterprise, có dark token) vs tự viết.
- Iconography, spacing scale, typography cho số liệu (`tabular-nums`), empty/error/loading states.
- Từ khóa: `dark mode design system tokens contrast`, `dashboard design best practices data ink ratio`, `Recharts dark theme`, `shadcn ui dark mode`
- Nộp về: **bảng palette + link 3–5 screenshot dashboard/chat tham khảo** (sản phẩm thật/Dribbble) + lựa chọn component lib kèm lý do.

### B9 — Performance & optimization (điểm rơi tuần 11) · P1 · 5h · tuần 8–11
- Lighthouse: budget cụ thể (LCP/CLS/INP/TBT), đo trong CI bằng `lighthouse-ci`.
- Bundle: code-split route dashboard vs chat, `moment`→`dayjs`, `recharts` nặng bao nhiêu KB.
- API: N+1 do populate, projection, aggregate gộp, cache Redis/in-memory, ETag.
- AI latency: warm-up model, batch embedding, cache embedding theo skill-string, chạy suy luận ở process riêng để không block event loop.
- Từ khóa: `Lighthouse CI performance budget`, `mongodb N+1 populate projection`, `fastapi model warm up latency`
- Nộp về: **bảng "Ngân sách hiệu năng"** (endpoint → p95 target) + danh sách optimization kèm bằng chứng đo.

### B10 — Testing & CI (rubric 0.75đ kiểm thử) · P2 · 5h · tuần 9
- Pyramid: Vitest (unit) + Supertest (API) + Playwright (E2E) + eval harness Python cho AI.
- Test Mongo: `mongodb-memory-server` vs Testcontainers.
- CI: GitHub Actions cho monorepo pnpm (affected task, cache, matrix node/python).
- Test chatbot tất định: mock LLM, fixture, `temperature=0`, snapshot.
- Từ khóa: `vitest mongodb-memory-server`, `github actions pnpm monorepo affected`, `playwright websocket test`, `testing LLM deterministic`
- Nộp về: **checklist luồng bắt buộc có test** (map F1–F7) + cấu hình CI mẫu.

### B11 — Conventional Commits & quy trình Git · P2 · 2h · tuần 1
- Spec Conventional Commits 1.0: `feat|fix|docs|style|refactor|perf|test|build|ci|chore|revert`, scope, `!`, `BREAKING CHANGE`.
- Scope đặt theo module: auth, hr, project, chatbot, ai, dashboard, realtime, docs, ci.
  Đổi `task` -> `project` theo NOTES-01 B11: collection trong data model là `projects` nên scope phải trùng tên domain; README cũng sửa theo.
- Enforce: husky + commitlint + lint-staged; short-lived branch + PR + squash merge, KHÔNG Git Flow (NOTES-01 B11); PR bắt buộc 1 review.
- CHANGELOG theo Keep a Changelog + semantic release (rẻ, đẹp trong báo cáo).
- Từ khóa: `conventional commits specification`, `commitlint husky monorepo scopes`, `keep a changelog`
- Nộp về: **commit template** (type list + scope list + 10 ví dụ tốt/xấu) + quy tắc đặt tên branch/PR.

### B12 — Định dạng báo cáo & công cụ vẽ hình (rubric 0.5 + 0.5 + 0.5) · P2 · 3h · tuần 10
- Quy định Khoa CNTT HUIT: mẫu `.docx`, font/line-spacing, đánh số hình/bảng, cấu trúc chương, chuẩn trích dẫn (APA/IEEE?), số trang tối thiểu, quy định đạo văn & dùng AI hỗ trợ viết.
- Công cụ vẽ được phép: UML (PlantUML/Mermaid/draw.io), C4, ERD, screenshot hệ thống.
- Cách export diagram nét cao để dán vào Word.
- Nộp về: **file mẫu của Khoa + checklist định dạng** — phần này chỉ GVHD/trưởng bộ môn cung cấp hợp lệ được, tôi không tự suy đoán.

---

## 4. Đừng research mấy cái này — tôi lo được

- Viết ADR / C4 / ERD / OpenAPI / JSON Schema từ notes của bạn.
- Soạn `15-engineering-conventions.md` (commit, naming, structure) từ kết quả B11.
- Scaffold monorepo, config tsconfig/eslint/prettier/husky/commitlint, GitHub Actions YAML.
- Code CRUD, auth middleware, Socket.IO handler, React components, Recharts dashboard.
- Prompt/agent loop skeleton, FastAPI embedding endpoint, test scaffolds.
- Đối chiếu notes bạn nộp với rubric, chỉ ra khoảng trống.

Việc của bạn: **thông tin bên ngoài mà tôi không có hoặc không được phép đoán** — hạn mức dịch vụ, dataset tiếng Việt, quyết định của GVHD, mẫu báo cáo của Khoa, gu thẩm mỹ (screenshot tham khảo).

---

## 5. Template nộp kết quả (giữ đúng mẫu để tôi ingest nhanh)

```markdown
## B<n> — <tên batch>
Ngày: / Người: / Giờ đã bỏ:
### Kết luận (mỗi dòng 1 quyết định)
- QUYẾT ĐỊNH: <x> — LÝ DO: <y> — NGUỒN: <url>
### Bảng/số liệu
| ... | ... |  (copy số thật, kèm nguồn từng dòng)
### UNRESOLVED
- <câu hỏi còn treo> — đã thử: <đã tìm ở đâu, kết quả ra sao>
### Ảnh hưởng lên docs
- Cần ghi vào 08-algorithms.md: ...
### Phụ lục
- Link paper/repo/doc đã đọc (để trích báo cáo)
```

Yêu cầu: **URL nguồn cho mọi con số**. Không có nguồn → tôi phải gắn nhãn "giả định", và hội đồng sẽ bắt bẻ.

---

## 6. Lịch chạy đề xuất (khớp timeline tuần trong đề cương)

| Tuần code | Batch cần xong trước đó |
|---|---|
| 0 — khảo sát nghiệp vụ & luồng người dùng | **B0** |
| 1 — monorepo, DB, CI/CD | B1, B2, B11, B12 |
| 2 — auth & phân quyền | B3 (**chờ B0**) |
| 3 — hồ sơ NV, đề tài, khung dashboard | B4 (**chờ B0**), B8 |
| 4 — Agent Loop + tools | B6, B7 |
| 5–6 — PhoBERT + eval | B5 |
| 7 — LLM function calling | B6 (phần model/provider) |
| 8 — giao việc & nộp báo cáo qua chat | B7 (**B0** đã chốt catalog ý định) |
| 9 — sentiment → KPI | B5, B6 |
| 10 — nhắc hạn + test API | B9, B10 |
| 11 — deploy + E2E + UAT | B10 |
| 12 — optimize + viết báo cáo | B9, B12 |

---

## 7. Câu hỏi phải xin GVHD (gửi sớm — đang chặn nhiều batch)

1. **Backend framework**: đề cương ghi Express.js. Có được dùng NestJS thay không (kiến trúc module sạch hơn, dễ trình bày điểm "thiết kế")?
2. **F1 ≥ 85% tính trên bài toán nào**: phân loại intent (classification) hay gợi ý đề tài (ranking)? Nếu là ranking thì F1 không phải chuẩn đo phù hợp — xin đổi sang Precision@5 / Recall@5 / MRR, hoặc giữ F1 cho intent classification.
3. **"Tập dữ liệu thử nghiệm chuẩn"**: Khoa yêu cầu dataset cụ thể/tối thiểu bao nhiêu mẫu? Có chấp nhận dataset tự gom + công bố không? *Hệ quả từ B5: dataset tiếng Việt công khai duy nhất xác minh được (PhoATIS) thuộc domain đặt vé máy bay, nên cần thầy xác nhận phương án nhóm tự xây HR intent dataset + protocol rõ, thay vì trông chờ dataset chuẩn ngành.*
4. **Timeline**: bảng công việc theo tuần liệt kê 14 mục nhưng thời gian ghi 12 tuần → mục nào gộp?
5. **LLM bên thứ ba**: được phép gọi API Gemini/OpenAI/Groq cho chatbot không? Có ràng buộc dữ liệu nhân sự không được gửi ra service ngoài không?
6. **Định dạng báo cáo**: xin file mẫu + chuẩn trích dẫn (APA/IEEE) + giới hạn số trang + quy định về dùng AI hỗ trợ viết.
7. **Điểm NCKH (+1.0)**: nếu có tiềm năng ra bài báo/hội thảo cấp Khoa, tôi sẽ thiết kế `09-ai-evaluation.md` theo hướng có thực nghiệm so sánh mô hình ngay từ đầu — xin xác nhận để khỏi làm lại.
8. **Phạm vi sáng tạo (§9)**: nhóm được thêm bao nhiêu ngoài đề cương? Thầy ưu tiên hướng **thực nghiệm mô hình** (S2/S3/S12) hay hướng **sản phẩm agentic** (S6/S7/S10)? Xin duyệt danh sách 5 mục trước tuần 8.
9. **Mốc nộp NCKH / hội thảo sinh viên**: deadline là khi nào? (quy định việc phải khóa dataset và chạy thực nghiệm trước tuần mấy — xem §12)
10. **Dữ liệu thật hay giả lập**: được dùng dữ liệu nhân sự thật (kèm ràng buộc gì) hay bắt buộc/bao dung dữ liệu giả lập có khóa tái lập (S14)? Ảnh hưởng trực tiếp B4, B10, S4.
11. **Có được thêm collection/state machine mới không?** Vòng research 2 tìm ra quy tắc "nhân viên xác nhận/nhận/từ chối việc được giao" là chuẩn ngành. Đã nhét được vào `project_events` mà không phá 11 collection, nhưng availability/nghỉ phép thì **không**. Cho thêm collection hay giữ baseline? (chặn PARK-01/VC-02, PARK-13/14 — xem `19-vertical-workforce-assessment.md` §3)
12. **Có được thêm phạm vi quyền (scope) không?** Không xin role thứ ba — vẫn 2 vai. Nhưng Admin nên bị giới hạn theo `departmentId` được gán thay vì đọc được số liệu cả công ty. Đây là kiểm soát truy cập, không phải tính năng mới. (chặn `07-auth-rbac.md` mục scope)
13. **Phạm vi ngành dọc**: đề cương nói "doanh nghiệp". Có được demo theo hai hồ sơ nghiệp vụ (ca/kíp và lịch giảng dạy) không, hay chỉ một? Nếu chỉ một thì VF-01/VS-01 ở lại backlog vĩnh viễn.
14. **Cho phép phỏng vấn/khảo sát hiện trạng ở đâu?** Hai vòng research đều mới chỉ đọc tài liệu sản phẩm, chưa hỏi người làm HR thật nào — trong khi rubric cho 0.75đ đúng mục "khảo sát hiện trạng: cơ cấu tổ chức, quy trình, biểu mẫu". Nhóm có thể liên hệ đơn vị nào, và cần giấy xác nhận gì?

---

## 8. Thứ tự bắt đầu (để không đứng chờ nhau)

- **Hôm nay**: gửi §7 cho thầy + chạy **B0** (đối chiếu HRM thông minh → luồng người dùng, 6h, không code) — đây là batch phải đi trước vì B3/B4/B6 chờ nó.
- **Song song hôm nay**: **B1** (tra hạn mức hạ tầng, ~4h) — không phụ thuộc B0.
- **Ngày 2–3**: B2 + B11 → tôi dựng scaffold monorepo, viết `02-architecture.md` + `15-engineering-conventions.md`; có notes B0 thì tôi viết `18-user-flows.md` ngay.
- **B5, B6** giao người mạnh nhất nhóm: nặng nhất và là phần "khoa học" của khóa luận.

---

## 9. Innovation track — phần "sáng tạo thêm" (S1–S14)

Đầu bài chỉ yêu cầu một HR chatbot CRUD + PhoBERT — đó là **phần nghiệp vụ tối thiểu**. Mỗi S dưới đây phải qua 3 cửa: (a) bám một **luồng người dùng thật** đã đối chiếu với sản phẩm HRM ngoài thị trường (batch **B0**, §3); (b) không phải tính năng trang trí; (c) tạo ra **số liệu đo được** để đưa vào báo cáo.

| # | Ý tưởng | Nhóm | Giá trị nghiệp vụ → file docs | Effort | Rủi ro | Phụ thuộc |
|---|---|---|---|---|---|---|
| S1 | **Explainable matching**: mỗi gợi ý phân công kèm "bằng chứng" — kỹ năng nào đóng góp bao nhiêu vào điểm tương đồng, highlight trong card chat và cột dashboard | A | F4: quản lý có cơ sở tin hoặc bác gợi ý → `08-algorithms.md`, `10-ui-ux-spec.md` | M | Thấp | B5, B14 |
| S2 | **Calibration + abstention**: similarity dưới ngưỡng → không đoán, mà hỏi lại ("Anh/chị đã làm React chưa?"). Vẽ reliability diagram, đo ECE/Brier | A | chặn giao nhầm việc cho người thiếu kỹ năng → `08-algorithms.md`, `09-ai-evaluation.md` | M | Thấp | B5, B13 |
| S3 | **A/B mô hình embedding**: PhoBERT mean-pool vs multilingual-e5 vs GloVe-25Vn — 3 cột: chất lượng (P@5/MRR), độ trễ, RAM | A | `09-ai-evaluation.md` có bảng thực nghiệm; là cửa chạm +1.0 NCKH | L | Thấp | B5 |
| S4 | **Learning loop**: Admin bấm Đồng ý/Từ chối gợi ý → ghi `feedback_events` → hiệu chỉnh ngưỡng/reranker theo quyết định thật | A | F4: chất lượng gợi ý tăng theo thời gian → `04-domain-model.md`, `08-algorithms.md` | M | TB (cần dữ liệu sử dụng) | B0, B4, B5 |
| S5 | **Datasheet + Model Card** cho từng mô hình: dữ liệu, giới hạn, thiên kiến, cách eval | A | `09-ai-evaluation.md`, `13-security.md` — truy vết được nguồn gốc mô hình | S | Không | B5, B6 |
| S6 | **Agentic standup**: cron hỏi tiến độ từng nhân viên qua chat, gom thành **daily digest** cho quản lý + bóc rủi ro trễ từ chính câu trả lời | B | F3+F7: bỏ việc quản lý đi hỏi tay từng người → `18-user-flows.md`, `06-api-spec.md` | L | TB (design ẩu thành spam) | **B0**, B6, B7, B15 |
| S7 | **Deadline-risk early warning**: điểm rủi ro trễ từ nhịp nộp báo cáo + lịch sử chậm + gap kỹ năng (S1) → cảnh báo **trước** khi quá hạn; kèm anomaly (z-score/EWMA) trên chuỗi KPI tuần | B | F6+F7: "biến động KPI" thành phân tích dự báo → `12-performance.md`, `08-algorithms.md` | M | TB (phải giải thích được) | B5, B7 |
| S8 | **Confirm-before-write**: tool đọc tự chạy; tool ghi (giao việc, đổi trạng thái, nộp báo cáo) bắt buộc bước xác nhận | B | an toàn tác vụ ghi → `07-auth-rbac.md`, `13-security.md` | S | Không | B6, B7 |
| S9 | **Graceful degradation**: hết quota LLM → tự rơi về pipeline PhoBERT-only (intent cố định) thay vì chết; đo % tính năng còn dùng được | B | độ tin cậy hệ thống → `12-performance.md`, `14-devops-deployment.md` | M | TB | B1, B6 |
| S10 | **Ask-your-data (NL → aggregation có whitelist)**: "KPI tháng 9 phòng Dev" → LLM chỉ được chọn template đã duyệt, không sinh pipeline tự do → trả biểu đồ | C | F6: tra cứu số liệu không cần bấm lọc → `06-api-spec.md`, `13-security.md` | L | **Cao** (bắt buộc whitelist + read-only) | B0, B4, B6, B15 |
| S11 | **Command palette (Ctrl/Cmd+K)** trên dashboard nền tối: tìm đề tài/nhân viên, chạy action nhanh | C | tốc độ thao tác cho Admin → `10-ui-ux-spec.md` | S | Không | B8 |
| S12 | **Bias probe cho sentiment→KPI**: đo tương quan giữa độ dài/cách diễn đạt nhận xét với điểm máy cho | D | F5: chứng minh phần "công bằng" bằng số → `09-ai-evaluation.md` | M | Thấp | B5, B6 |
| S13 | **Counter-weight + ceiling**: điểm sentiment bị trần bởi tỷ lệ hoàn thành thật; mọi override của quản lý phải kèm lý do, ghi log bất biến | D | F5 + kiểm toán được → `04-domain-model.md`, `05-data-model.md` | S | Thấp | B0, B4 |
| S14 | **Reproducibility kit**: `make demo` = seed dữ liệu giả lập tiếng Việt có khoá cố định (200 NV / 30 phòng ban / 1000 đề tài, phân bố như thật) + dựng DB + chạy eval in bảng số; Dockerfile cho AI service | E | `11-quality-testing.md`, `14-devops-deployment.md` — số liệu trong báo cáo tái lập được | M | Không | B0, B10 |

**Effort**: S ≈ 1 buổi, M ≈ 2–4 ngày, L ≈ 1 tuần (tính cho 1 người trong quỹ 12 tuần của nhóm 3 người).

---

## 10. Nếu chỉ được chọn 5 (khuyến nghị của tôi)

Tiêu chí: (1) ánh xạ được về một UF-xx trong `18-user-flows.md` (B0 đã chốt 10 flow); (2) đo được bằng số;
(3) không phá cam kết P0. **Nhóm đã đảo thứ tự sau research (NOTES-01): `S14 → S3 → S2 → S1 → S6`** —
khoá phần khoa học trước, agentic feature làm sau. Bộ 5 giữ nguyên, chỉ đổi trật tự:

1. **S14** — `make demo` + dataset có khoá: mọi con số trong báo cáo tái lập được; đi trước vì S3/S2 cần nó.
2. **S3** — benchmark 4 hàng model: TF-IDF/BM25 (baseline rẻ) · PhoBERT mean-pool (bắt buộc theo đề cương) ·
   multilingual-e5-small · paraphrase-multilingual-MiniLM-L12-v2. Cửa thực tế duy nhất chạm +1.0 NCKH.
3. **S2** — calibration + abstention: cosine 0.82 **không phải** 82% xác suất đúng → Platt/logistic calibration
   rồi mới ngắt ngưỡng; mô hình không chắc thì hỏi lại thay vì giao nhầm việc.
4. **S1** — explainability bằng **skill-to-skill cosine + leave-one-out**, không dùng attention làm giải thích.
5. **S6** — chatbot tự khởi xướng hỏi tiến độ + daily digest, chạy trên **Agenda** (không Redis/BullMQ).

Để ngỏ: **S10** chỉ code khi baseline xong trước tuần 8 và bắt buộc qua whitelist report-template + Zod enum
(B15). **S7** chỉ làm nếu S6 đã chạy (chung hạ tầng Agenda). **S5 + S8 + S11 + S13** làm bất kể (< 3 buổi,
không rủi ro) — S8 và S13 đã có bằng chứng ngành trong NOTES-01 (Oracle HCM xác nhận khi AI đổi goal;
MISA/Lattice có chu kỳ đánh giá + calibration).

---

## 11. Architecture fitness functions — "chuẩn" không nằm im trong docs

Ý này đưa vào `11-quality-testing.md` + CI: quy ước mà không có lệnh chạy thật trong pipeline thì chỉ là văn bản. Mỗi dòng dưới đây phải tương ứng một lệnh CI chạy được, nếu không thì xoá dòng đó.

| Gate | Dụng cụ | Luật / ngưỡng |
|---|---|---|
| Kiến trúc không rò rỉ | `dependency-cruiser` | `domain/` không import `mongoose`/`express`; `ai-service` không import model của API; không circular deps |
| API không trôi khỏi spec | OpenAPI + `schemathesis` fuzz | mọi response phải validate schema; schema drift = fail CI |
| WS contract | test bộ event (B7) | event chưa khai báo trong `06-api-spec.md` → fail |
| Hiệu năng front | `lighthouse-ci` + `size-limit` | LCP < 2.5s, CLS < 0.1, INP < 200ms, ngân sách KB theo route — vượt là đỏ |
| Chất lượng mô hình | `pytest` eval harness | F1/P@5 **không được tụt quá 2 điểm** so với baseline đã công bố ở `09-ai-evaluation.md` |
| Commit | `commitlint` + scope whitelist | chỉ nhận các scope đã liệt kê; `feat`/`fix` phải tham chiếu issue |
| Bảo mật | `gitleaks` (pre-commit + CI) | 1 secret leak = fail build |
| Dữ liệu tái lập | seed hash check | `make demo` phải dựng ra đúng bộ dữ liệu đã công bố trong báo cáo |
| Che phủ logic | `vitest --coverage` trên `domain/` | 100% state-machine transition, 90% service; **không** tính coverage cho UI |

Cam kết: **không thêm gate nào nếu chưa có lệnh chạy nó trong CI.** Chống bệnh "docs trang trí".

---

## 12. Luật cho phần sáng tạo (để không tự giết phạm vi)

1. **Sàn trước, trần sau.** F1–F7 + auth + deploy thật phải chạy được **trước tuần 9**. Không S nào được code trước cột mốc đó, trừ S5/S8/S11/S13/S14 (tài liệu + hạ tầng, không đụng nghiệp vụ).
2. **Mỗi S phải ánh xạ về một luồng người dùng thật trong `18-user-flows.md` (B0) và phải đo được bằng số.** Không có luồng, không có số → dời sang `docs/backlog-parked.md` kèm lý do, không giữ trong plan.
3. **Không S nào được làm mờ F4/F5.** Hai chức năng AI là chỗ thầy chấm "chất khóa luận"; S nào giành thời gian của chúng thì S thua.
4. **Phạm vi sáng tạo phải được GVHD duyệt bằng văn bản/chat** (câu hỏi §7.8–§7.10) **trước khi** tôi ghi vào `00-vision-scope.md`. Mỗi mục thêm phải trích được "sản phẩm X đang có luồng này" (bằng chứng từ **B0**) — không chấp nhận lý do "thêm cho đẹp".
5. **Đóng băng tính năng ở tuần 11.** Sau đó chỉ: sửa bug, tối ưu, viết báo cáo.

---

## 13. Batch research bổ sung cho Innovation (B13–B15)

### B13 — Calibration, abstention & threshold tuning · 4h · **trước B5**
- Temperature scaling / Platt calibration áp cho sentence-similarity thế nào; ECE, Brier, reliability diagram; chọn ngưỡng abstention theo **target precision** (vd "chấp nhận bỏ 20% ca để 80% còn lại đúng ≥ 90%").
- Từ khóa: `confidence calibration sentence embedding`, `expected calibration error text classification`, `selective prediction abstention NLP`, `precision at k threshold tuning`
- Nộp về: công thức + code vẽ reliability diagram (Python) + 1 paper để trích.

### B14 — Explainability cho embedding matching · 3h · song song B5
- Đóng góp từng term/skill vào điểm cosine (gradient×input, hoặc phân rã theo chiếu embedding của từng skill term); cách trình bày "bằng chứng" gọn trong 1 card chat mà không thành tường thuật dài.
- Từ khóa: `explain sentence embedding similarity contribution`, `attention visualization PhoBERT`, `lexical overlap interpretability retrieval`
- Nộp về: 2–3 phương pháp chạy được trên CPU + đánh giá độ dễ cài đặt.

### B15 — Agentic scheduling & NL→query an toàn · 4h · trước tuần 7
- Scheduler trong Node: `node-cron` vs `BullMQ` vs `Agenda` (với Mongo); idempotency khi job chạy lại; chống spam user; múi giờ & tuần làm việc.
- Safety cho S10: read-only, row-level permission theo vai trò, whitelist template, timeout + row cap; tham khảo cách `Vanna AI` / `DB-GPT` ràng buộc LLM sinh query.
- Từ khóa: `node job queue mongodb BullMQ idempotent`, `text to SQL security read only row level`, `LLM query generation whitelist templates`
- Nộp về: bảng so sánh scheduler + checklist ràng buộc an toàn cho S10 + mô tả format daily digest (ai nhận, kênh nào, mấy dòng).

---

## 14. Việc mới của bạn vs. việc tôi tự lo

**Bạn research thêm**: **B0 (quan trọng nhất — nó quyết định luồng người dùng)**, rồi B13, B14, B15 (~11h) và lấy ý kiến thầy cho §12 luật 4.

**Tôi viết được ngay khi bạn gật** (không cần research):
- `17-innovation-playbook.md` — chốt danh sách S: user flow nào (B0) → effort → file docs nhận → gate CI nào giữ nó.
- Toàn bộ bảng fitness functions ở §11 thành workflow CI thật (`.github/workflows`, config `dependency-cruiser`, `commitlint`, `size-limit`, eval gate).

**Riêng `18-user-flows.md` cần notes B0** — tôi soạn hành trình/swimlane/catalog ý định từ kết quả đối chiếu của bạn, không tự nghĩ nghiệp vụ thay bạn.

Thứ tự tôi đề xuất: bạn chọn 5 trong §10 (hoặc phản đối và đề xuất cái khác) → tôi viết `17-innovation-playbook.md` + gắn ngược vào `01-requirements.md` dưới dạng FR bổ sung có nhãn `stretch`, để báo cáo tách rõ "theo đề cương" và "nhóm tự thêm".

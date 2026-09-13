# 11 — Kiểm thử & chất lượng (Quality & Testing)

Khóa luận **KLCN133** — *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*. Nhóm 3 người, 12 tuần (24/08/2026 → 16/11/2026).

Tài liệu này chốt **kim tự tháp test, chiến lược test cho phần AI, checklist theo chức năng F1–F7, ngân sách hiệu năng, UAT và quy ước defect**.

Nguồn (không có số liệu nào ngoài các nguồn này):

| Phần | Nguồn |
|---|---|
| Bộ công cụ + thứ tự CI + tách PR / nightly | `docs/research/NOTES-01.md` **B10** |
| Yêu cầu kiểm thử của đề cương (Postman, Lighthouse, eval mô hình, UAT) + định nghĩa F1–F7 + điểm rubric kiểm thử **0.75** | `docs/research/RESEARCH-PLAN.md` **§1** |
| Cách làm test tất định cho chatbot (mock LLM, fixture, `temperature=0`, snapshot) + Mongo test | `RESEARCH-PLAN.md` **§3 B10** |
| Fitness functions: coverage domain/service, ngưỡng AI regression, Lighthouse, gitleaks | `RESEARCH-PLAN.md` **§11** |
| Ngưỡng Core Web Vitals + internal target | `NOTES-01.md` **B9** |
| Luồng người dùng UF-01…UF-10, catalog 28 intent, notification matrix | `NOTES-01.md` **B0** |
| Guard Agent Loop (RBAC, Zod, confirm, audit, maxSteps) | `NOTES-01.md` **B6** |
| State machine F2, overdue là dẫn xuất | `NOTES-01.md` **B4** |
| Metric ranking F4, dataset đã xác minh / chưa xác minh | `NOTES-01.md` **B5** |
| Calibration / abstention, cosine ≠ xác suất | `NOTES-01.md` **B13** |
| Whitelist template cho NL→report | `NOTES-01.md` **B15** |
| Luật phạm vi S-series | `RESEARCH-PLAN.md` **§12** |

> **Trạng thái repo: chưa có mã nguồn, chưa có pipeline** (`README.md` dòng 9). Mọi "lệnh" trong file này là **tên cam kết** sẽ dựng cùng vòng scaffold (khung CI ở tuần 1, test ở tuần 9–11) — không phải lệnh đang chạy hôm nay. File này chỉ ghi **ngưỡng và cách đo**, không ghi kết quả đo nào.

---

## 1. Hai tầng ràng buộc: đề cương và quyết định kỹ thuật

Đề cương (`RESEARCH-PLAN.md` §1) bắt buộc: **Postman (API) · Lighthouse (giao diện) · eval mô hình · UAT với giảng viên + sinh viên đóng vai**. Kết quả research B10 chọn bộ công cụ tự động hoá trùng/mở rộng một phần. Cách ghép, ghi rõ để hội đồng không hỏi "sao khác đầu bài":

| Ràng buộc đề cương | Đáp án tự động (CI) | Đáp án thủ công / bằng chứng |
|---|---|---|
| Postman (API) | `Supertest` trong CI (gate 5) | Bộ **Postman collection** để demo trực tiếp + export vào phụ lục báo cáo; số request **TBD** (chốt khi `06-api-spec.md` khoá) |
| Lighthouse (giao diện) | `Lighthouse CI` assertions (gate 10) | Ảnh/bảng kết quả từng lần đo, kèm ngày + commit |
| Eval mô hình | `pytest` eval harness + AI regression gate (gate 6–7) | Bảng kết quả trong `09-ai-evaluation.md` (baseline **TBD**, đang chờ GVHD — §9) |
| UAT | Không tự động hoá được | **Phiếu UAT** ở §7 + bảng tổng hợp; không bịa kết quả |

Nguyên tắc chống "docs trang trí" (`RESEARCH-PLAN.md` §11): **không thêm gate nào nếu chưa có lệnh chạy nó trong CI.** Mục nào chưa có lệnh thì nó là kế hoạch, không phải cổng chặn.

---

## 2. Kim tự tháp test cho stack này

```text
              ▲  E2E (Playwright smoke)                    ít nhất — luồng khói
             ▲▲  Hiệu năng (Lighthouse CI)                PR đụng UI + nightly
            ▲▲▲  Tích hợp API (Supertest + mongodb-memory-server)
           ▲▲▲▲  Tích hợp AI (pytest: matching, eval, calibration)
          ▲▲▲▲▲  Đơn vị (Vitest domain/service · pytest unit)   — nhiều nhất
```

| Tầng | Công cụ (đúng danh sách B10) | Chạy ở đâu | Mục tiêu |
|---|---|---|---|
| Unit — Node/TS | **Vitest** | `pnpm test` — gate 4, mọi package trong `apps/*` + `packages/contracts` | Luật nghiệp vụ thuần: state machine F2, công thức KPI (F5), kiểm tra RBAC, zod schema. Nhanh, không chạm DB/mạng |
| Unit — Python | **pytest** | `pytest -q` — gate 6 | Word segmentation, pooling, ranking, calibration, sentiment→KPI |
| Tích hợp API | **Supertest** + **mongodb-memory-server** | `pnpm test:api` — gate 5 | HTTP thật + Mongo thật trong process test; B10 chọn `mongodb-memory-server` vì dựng được replica set → phủ hợp đồng request/response, RBAC, payload thật |
| Tích hợp AI | **pytest** (eval harness) | gate 6 | Bộ test case hội thoại: tỷ lệ chọn đúng tool, tỷ lệ tham số đúng, điểm ranking; seed tái lập được (S14) |
| E2E | **Playwright** | `pnpm test:e2e` — gate 9 (smoke), nightly (đầy đủ) | Luồng khói cross-stack có WebSocket: đăng nhập → hỏi chatbot → nhận card kết quả → xác nhận nộp báo cáo → dashboard đổi |
| Hiệu năng UI | **Lighthouse CI** | gate 10, PR đụng `apps/web` + nightly | Giữ LCP/INP/CLS (§6); assertion trong CI, không đo tay "một lần cho đẹp" |
| Đánh giá mô hình | **pytest** eval + live provider evaluation | **nightly / release** (§4.3) | Chất lượng F4/F5 + độ trễ + chi phí với model thật |

Tỉ lệ giữa các tầng: nguồn không có chuẩn nào → **TBD** (chốt ở tuần 9 theo số case thật của F1–F7). Mặc định vận hành: mỗi chuyển tiếp state machine có unit test, mỗi endpoint có integration test, mỗi UF trong scope có ≥ 1 Playwright flow.

**Không có tầng "manual chỉ nhìn".** Thứ kiểm bằng mắt được thì hoặc thành test, hoặc thành phiếu UAT/Postman có ghi kết quả — không phải "dev bảo chạy được".

---

## 3. Coverage target — đo ở đâu và **không** đo ở đâu

Nguồn duy nhất: `RESEARCH-PLAN.md` §11, dòng "Che phủ logic" (`vitest --coverage` trên `domain/`).

| Vùng | Mục tiêu | Lệnh | Ghi chú |
|---|---|---|---|
| `domain/` — state machine F2 | **100% state-machine transition** | `pnpm test:coverage` (scope `domain/`) | Mỗi cạnh hợp pháp **và** mỗi cạnh bất hợp pháp phải có case. Đây là luật ship — §8.3. Cộng **test phủ định cho enum**: `projects.status` chỉ nhận 5 giá trị, và `project_events.type` **không** nhận `ACCEPTED` (BR-21) |
| `domain/` — service | **90% service** | cùng lệnh, ngưỡng khai báo trong config | Chưa đạt thì PR đỏ, không "tạm bỏ qua" |
| **UI (`apps/web`)** | **KHÔNG đo coverage** | — | §11 ghi rõ **không tính coverage cho UI**. UI được bảo vệ bằng Playwright smoke + Lighthouse + checklist §5. Quyết định có chủ đích, không phải thiếu việc |
| `apps/ai-service` | **TBD** (nguồn không có con số) | `pytest --cov` | Khi có baseline (tuần 9) nhóm tự đặt ngưỡng và ghi lý do; **không** chép % từ internet |
| `packages/contracts` (zod) | **TBD** | — | Mỗi tool có schema thì đã bị validate ở gate 5; không đặt coverage riêng nếu test zod đã phủ |

Quy tắc đọc số: coverage là **điều kiện cần**, không phải bằng chứng đúng. Mỗi dòng số trong báo cáo phải kèm (a) lệnh chạy, (b) commit, (c) ngày đo, (d) số test. Thiếu 4 thứ đó → ghi `TBD`, không đoán.

---

## 4. Chiến lược test cho phần AI (chatbot, Agent Loop, matching)

### 4.1 Vì sao phải tách hai chế độ

`NOTES-01.md` B10: đánh giá LLM qua API sống **không nên block mọi PR**, vì đúng hai lý do nguồn nêu:

1. **Quota** — provider free tier có hạn mức thật (B6: Groq Free nhiều model ở 30 RPM; `gpt-oss-120b` ~1.000 RPD và 8K TPM). Chạy eval sống mỗi PR sẽ đốt hết hạn mức trước ngày demo.
2. **Tính không ổn định** — cùng một câu có thể cho kết quả khác nhau; gate không tất định thì không được dùng để chặn merge.

```text
PR              → mocked deterministic agent tests
nightly/release → live provider evaluation
```

### 4.2 PR: mocked deterministic agent test

Kỹ thuật lấy từ `RESEARCH-PLAN.md` §3 B10: **mock LLM + fixture + `temperature=0` + snapshot.**

| Việc | Cách làm | Ràng buộc trong test |
|---|---|---|
| Mock LLM | Provider giả cài đúng `LLMProvider` interface (B6), trả payload quay cứng sẵn | Test không được gọi ra ngoài; assert không có HTTP request sống nào |
| Fixture | Mỗi kịch bản một file: câu hỏi người dùng → tool call kỳ vọng → seed DB → kết quả kỳ vọng | Tên fixture theo intent, ví dụ `find_candidates_top5.json` |
| `temperature = 0` | Đặt ở mọi lần gọi, kể cả khi mock | Fixture ghi rõ là chế độ tất định, để sau này không ai nhầm là số của model thật |
| Snapshot | So cấu trúc: tool đã chọn, đối số đã validate, card đã render | Snapshot đổi phải kèm lời giải thích trong PR (đổi tool schema/dữ liệu) |

Nội dung PR bắt buộc phủ, theo guard ở `NOTES-01.md` B6 (mỗi dòng một nhóm case):

- [ ] `maxSteps = 5` — loop dừng ở bước 5; có test chứng minh không lặp vô hạn.
- [ ] `toolTimeout` và LLM timeout — tool treo → timeout, không deadlock hội thoại.
- [ ] max tool result size — kết quả quá cỡ bị chặn.
- [ ] **RBAC check mỗi tool** — `Employee` gọi `assign_project` / `override_kpi` (Admin-only theo catalog B6) phải bị chặn; test **cả hai vai** cho mọi tool.
- [ ] **Zod validate mỗi đối số** — LLM trả đối số thiếu/sai kiểu (hallucinated args) → tool không chạy, có đường xử lý dự phòng.
- [ ] **Tool ghi có bước xác nhận** — `submit_progress`, `submit_report`, `assign_project`, `change_project_status`, `override_kpi` phải trả challenge xác nhận trước khi mutate (S8); không xác nhận → không đổi dữ liệu.
- [ ] **Audit mỗi mutation** — có bản ghi; `override_kpi` bắt buộc lý do + `changedBy` + `changedAt` (B6/F5).
- [ ] **Tool đọc không mutate** — kiểm chứng `get_*` / `list_*` / `search_policy`.
- [ ] **Intent → tool** — catalog B0 yêu cầu mỗi intent map một tool, không rơi thành câu hỏi tự do; test cho từng intent đã cài.
- [ ] **Từ chối khi thiếu bằng chứng** — RAG chính sách không đủ ngữ cảnh → trả lời "không có căn cứ", không đoán, không bịa nguồn (B0 UF-10).
- [ ] **Abstention** — similarity dưới ngưỡng → hỏi lại thay vì gợi ý (S2); kết quả phải khớp ngưỡng đã cấu hình. Test không diễn giải cosine 0.82 thành "82% xác suất đúng" (B13).
- [ ] **NL→report whitelist** (S10, nếu được duyệt) — model trả `$lookup`, `$where`, `$function`, tên collection hay raw query → từ chối; chỉ nhận template enum (B15).

### 4.3 Nightly / release: live provider evaluation

- Chạy theo lịch (nightly) và trước mỗi bản demo/nghiệm thu (release); **không** chặn merge.
- Cùng bộ test case ở §4.2 nhưng gọi provider thật: tỷ lệ chọn đúng tool, tỷ lệ tham số đúng, `Chat tool lookup p95`, `LLM first token`, chi phí/phiên — B6 yêu cầu eval đúng 4 nhóm đó cộng độ trễ.
- Mỗi dòng kết quả phải kèm **commit, model, provider, ngày, múi giờ, seed dataset**. Thiếu một trong sáu → dòng đó là `TBD`, không phải số liệu.
- Live eval **không** thay mocked test trong PR: PR trả lời "hệ thống mình có đúng hợp đồng không", live eval trả lời "model thật hành xử ra sao".

### 4.4 "AI regression gate" nghĩa là gì

Định nghĩa theo `RESEARCH-PLAN.md` §11, dòng "Chất lượng mô hình":

> `pytest` eval harness — **F1/P@5 không được tụt quá 2 điểm so với baseline đã công bố ở `09-ai-evaluation.md`.**

Cụ thể hoá:

1. Baseline là **bảng số đã công bố**, không phải trí nhớ của nhóm. Lần đầu có kết quả thì chốt baseline trong `09-ai-evaluation.md`; **trước lúc đó gate không có mốc để so → gate TBD** (đang chờ GVHD, §9 dòng 1).
2. Chỉ số được giữ: **F1** (nếu GVHD chốt là classification) và **P@1 / @3 / @5, Recall@5, MRR** cho ranking — B5 ghi rõ *không* dùng F1 đơn độc để đo Top-K.
3. Ngưỡng đỏ: tụt **> 2 điểm** so với baseline.
4. Gate nằm **sau** "Python AI tests" và **trước** "build" trong chuỗi CI (B10), để failure trỏ vào model/dataset chứ không lẫn với build.
5. Đổi baseline = PR riêng (`test(ai):` hoặc `docs(ai):`) kèm lý do (đổi dataset/model/protocol) và có review. Không nới ngưỡng cho code pass.
6. Điểm tụt thật do dataset/ranker → PR đó không hợp lệ: hoặc tìm nguyên nhân, hoặc giữ nguyên điểm cũ.

### 4.5 Điều kiện để test AI có nghĩa

- **Seed tái lập**: `make demo` phải dựng ra đúng bộ dữ liệu đã công bố (gate "Dữ liệu tái lập" §11 + S14). Không đạt thì mọi con số eval mất giá trị.
- `apps/ai-service` phải pin version model + `transformers` để người khác chạy lại được.
- **Dataset cho F4 chưa chốt.** Đã xác minh: `PhoATIS` (5.871 utterances, 28 intent labels, 82 slot types; train 4.478 / dev 500 / test 893) và `VN-SLU 2024` (17.321 utterances, 240 người nói). Nhưng PhoATIS là domain **đặt chuyến bay** → chỉ dùng cho baseline/phương pháp, **không được viết là dataset chuẩn đánh giá HR chatbot**. Không trích `UFoLD` (tên sai — bài dự đoán cấu trúc RNA), `ViETeDis`, `VNIntent`, `Shopee-ITS_VL`, `UIT-VSPC`, `NLUI-VN` cho tới khi từng cái được xác minh (B5). Bộ test cuối cùng vẫn nên là **HR intent dataset do nhóm tự xây, có protocol rõ**.
- Các con số B1/B5 ở trên **đang thiếu URL nguồn** (NOTES-01 "CẦN BỔ SUNG") → chỉ được vào báo cáo sau khi bổ sung.

---

## 5. Checklist luồng bắt buộc có test, theo chức năng

Định nghĩa F1–F7 lấy nguyên văn từ `RESEARCH-PLAN.md` §1; cột UF đối chiếu `NOTES-01.md` B0.

| # | Chức năng (đề cương) | UF trong scope (B0) | Luồng bắt buộc có test | Kiểu test | Công cụ |
|---|---|---|---|---|---|
| **F1** | Hồ sơ & phân cấp nhân sự (5 cấp bậc) | UF-01 | Xem hồ sơ mình; sửa số điện thoại; field nhạy cảm → gửi → duyệt → cập nhật; bị từ chối → sửa/gửi lại; `Admin` thấy khác `Employee`; `level` không được dùng làm quyền (B3) | Unit + tích hợp API | Vitest, Supertest + mongodb-memory-server |
| **F2** | Vòng đời đề tài công việc | UF-05 | `DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → (approve) COMPLETED`; `reject → về IN_PROGRESS`; mọi cạnh **không** có trong sơ đồ phải bị chặn; quá hạn là **dẫn xuất** `dueDate < now AND status != COMPLETED` chứ không phải state; `statusHistory` + `version` tăng đúng; chuyển tiếp là atomic conditional update (B4); **assignment acknowledgement (BR-21)**: ba nhánh `ACKNOWLEDGE`/`DECLINE`/`REQUEST_CHANGE` ghi đúng một `project_events` với `type` tương ứng và **không** đổi `projects.status`/`version`, cộng nhánh **không phản hồi** (nhắc có dedupe → báo Admin, im lặng **không** là đồng ý) và nhánh **actor ngoài `assigneeIds` → `NOT_ASSIGNEE`, không ghi event** (kể cả Admin) | Unit (100% transition) + tích hợp API + E2E | Vitest, Supertest, Playwright |
| **F3** | Chatbot tra cứu KPI & chính sách | UF-10 (+ UF-01/05/06) | 28 intent trong catalog B0 map đúng tool; đọc KPI cá nhân / phòng ban; trả lời chính sách **kèm document/version/nguồn**; thiếu bằng chứng → từ chối đoán; toàn bộ guard §4.2 | AI integration tất định + E2E | pytest, Playwright, Postman (demo) |
| **F4** | Gợi ý phân công theo kỹ năng (PhoBERT) | UF-04 | Nhập yêu cầu → ranking → giải thích đóng góp từng kỹ năng (S1) → quản lý chọn → xác nhận; confidence thấp → hỏi thêm; tie-break bằng workload; số trong card chỉ là **format minh hoạ**, không phải kết quả model (B14) | pytest unit + eval harness + live eval | pytest, Playwright (bước xác nhận) |
| **F5** | Phân tích ngữ nghĩa nhận xét để lượng hóa KPI | UF-06 | `self-review → manager review → calibration/approval → publish → history` (B0); KPI cuối do **công thức tất định** sinh, AI chỉ cho sentiment / themes / risk / suggested component (B6); bắt buộc đủ `machineScore \| finalScore \| overrideReason \| changedBy \| changedAt`; điểm sentiment bị trần bởi tỷ lệ hoàn thành thật (S13) | Unit + pytest + tích hợp API | Vitest, pytest, Supertest |
| **F6** | Dashboard | — (phục vụ UF-06, UF-09) | Aggregate KPI theo tháng khớp pipeline; dark/light không lệch bảng màu chart; empty/error/loading state; tương tác bảng không làm sập layout (CLS) | Component test + E2E + hiệu năng | Vitest, Playwright, Lighthouse CI |
| **F7** | Tiếp nhận báo cáo nghiệm thu & nhắc hạn | UF-09 | Nộp báo cáo (tool ghi có confirm); admin nhận event; reminder đúng notification matrix B0 (deadline 3 ngày / 1 ngày / quá hạn + ngưỡng chống spam); job chạy lại **không** gửi trùng; notification vẫn được persist chứ không chỉ gửi qua WS | Tích hợp API + E2E + pytest (job) | Supertest, Playwright, pytest |
| **Realtime** (nền ngang, không phải F) | Socket.IO | UF-09 | Auth trong handshake; `clientMessageId` chống duplicate khi reconnect/retry; chỉ thành viên room nhận tin; event chưa khai báo trong `06-api-spec.md` → fail CI (gate §11) | Tích hợp + E2E | Supertest + socket client, Playwright |
| **Auth** (nền) | JWT + Refresh Token Rotation + RBAC | mọi UF | Access/refresh flow; **dùng lại refresh token cũ → thu hồi cả family**; Mongo chỉ lưu hash; cookie `HttpOnly + Secure + SameSite` | Unit + tích hợp API | Vitest, Supertest |

**Ngoài phạm vi test (parked):** UF-02 nghỉ phép, UF-03 onboarding, UF-07 OKR, UF-08 pulse survey — `NOTES-01.md` B0 xếp ngoài F1–F7 tới khi GVHD duyệt mở scope (`docs/backlog-parked.md`). **Không** viết test cho chúng trước khi được duyệt.

Cách đọc bảng: mỗi dòng là **một issue**; issue đó là đơn vị của `Closes #n` trong commit (`docs/15-engineering-conventions.md` §1.5). Dòng nào chưa có test = dòng đó chưa xong, bất kể code đã viết.

---

## 6. Performance test

### 6.1 Ngưỡng ngoài — Core Web Vitals (B9), đo tại **percentile 75**

| Chỉ số | Ngưỡng "good" | Cổng CI |
|---|---|---|
| LCP | ≤ **2.5 s** | assertion Lighthouse CI |
| INP | ≤ **200 ms** | assertion Lighthouse CI |
| CLS | ≤ **0.1** | assertion Lighthouse CI |

### 6.2 Internal target — **chưa phải chuẩn ngoài**

`NOTES-01.md` B9 ghi nguyên văn: *"Internal target (chưa phải chuẩn ngoài — phải benchmark trước khi đưa thành 'kết quả')"*. Bảng mục tiêu:

```text
CRUD read p95              < 300 ms
Dashboard aggregate p95    < 800 ms
Chat tool lookup p95       < 1 s
Warm embedding inference   < 500 ms
LLM first token            < 2.5 s
```

| Mục | Cách đo | Chạy khi | Điều kiện để được gọi là "kết quả" |
|---|---|---|---|
| Vitals + bundle front-end | `lighthouse-ci` assertions + `size-limit` theo route (§11 dòng "Hiệu năng front") | PR đụng `apps/web` + nightly | Có số **trước/sau** trong PR, kèm commit + ngày đo |
| `CRUD read p95`, `Dashboard aggregate p95` | Benchmark riêng chạy trên nền API integration (mongodb-memory-server) — **công cụ: TBD** (k6 hay script Node; chốt ở `12-performance.md`) | Nightly + tuần 10–11 | Phải ghi N, warm-up, số lần lặp, môi trường. Thiếu 4 ý đó thì mới là "thấy nhanh", chưa phải số |
| `Chat tool lookup p95` | Đo từ lúc tool được duyệt tới lúc có kết quả, **trên mocked provider** để loại độ trễ LLM | PR (mocked) | Cùng fixture với §4.2 |
| `Warm embedding inference < 500 ms` | `pytest` benchmark trên CPU, sau bước warm-up; ghi rõ model + số chiều vector | nightly + tuần 5–6 | Hardware cụ thể; đối chiếu trần RAM của VPS 2GB (B1) — các con số B1 **đang thiếu URL** |
| `LLM first token < 2.5 s` | Live provider evaluation | nightly / release | Không dùng làm cổng chặn PR (bất định + quota, B10) |

### 6.3 Luật dùng số

- Mỗi dòng target phải có **lệnh chạy** thì mới được giữ trong bảng gate; không có lệnh thì đó là ghi chú kế hoạch và **không** được chép vào báo cáo như kết quả (`RESEARCH-PLAN.md` §11).
- Không suy ra "đạt" từ một lần chạy may mắn; không mượn benchmark của dự án khác để so.
- Chưa benchmark → cột kết quả ghi `TBD` kèm ngày dự kiến đo (B9/B10 rơi tuần 8–11 theo `RESEARCH-PLAN.md` §3).
- Trần hạ tầng free tier chi phối cách đo (Atlas M0, Render sleep sau 15 phút không traffic, wake-up có thể ~1 phút — B1) → **phải bổ sung URL nguồn cho các con số B1 trước khi** những con số đó vào báo cáo.

---

## 7. UAT — theo đề cương

**Đầu bài (`RESEARCH-PLAN.md` §1):** UAT với **giảng viên + sinh viên đóng vai quản lý / nhân viên**. Rubric "kiểm thử & triển khai" 0.75đ — nên UAT phải có bằng chứng trên giấy, không phải "thầy xem rồi gật".

### 7.1 Thiết kế phiên

| Yếu tố | Quy định |
|---|---|
| Người tham gia | GVHD + sinh viên của nhóm đóng vai `Admin` (quản lý) và `Employee` (nhân viên). Không tự khai là "doanh nghiệp thật" |
| Vai được đóng | Đúng 2 role hệ thống (B3): `Admin` — duyệt, nhận báo cáo, giao việc, override KPI; `Employee` — tra cứu, xin sửa hồ sơ, nộp báo cáo, nhận nhắc hạn |
| Kịch bản | Mỗi kịch bản = **một luồng ở §5** (UF-01/04/05/06/09/10). Người kiểm chỉ nhận danh sách thao tác, không nhận trước kết quả kỳ vọng |
| Dữ liệu | Bộ seed tái lập được (S14). Nếu muốn dùng dữ liệu nhân sự thật: **chờ GVHD trả lời câu §7.10**; chưa trả lời → chỉ dùng dữ liệu giả lập |
| Ghi nhận | Có người thư ký; mỗi ca ghi ngày, phiên bản (commit), người đóng vai, kết quả từng bước |
| Thời điểm | Tuần 11 (đóng băng tính năng — `RESEARCH-PLAN.md` §12 luật 5) và lặp lại trước buổi bảo vệ. Sau UAT chỉ sửa bug/tối ưu |
| Không làm | Không tự điền phiếu thay người dùng; không gộp mọi phản hồi thành một câu "tích cực"; không bịa số |

### 7.2 Phiếu UAT (template trắng — không kèm kết quả)

```markdown
# PHIẾU UAT — KLCN133
Ngày: ____   Phiên bản/commit: ____   Ca số: ____
Người kiểm (tên / vai đóng): ______      Người thư ký: ______
Luồng được kiểm (F__ / UF-__): ______

## A. Kết quả thao tác (chấm theo chứng kiến, không theo cảm tình)
| Bước | Kỳ vọng | Đạt / Không / Không chạy được | Ghi chú |
|---|---|---|---|
| 1 |  |  |  |
| 2 |  |  |  |
| 3 |  |  |  |

## B. Chất lượng câu trả lời chatbot (nếu luồng có chatbot)
| Câu đã hỏi | Hệ thống trả lời gì | Đúng tool? | Đúng tham số? | Có nguồn? | Có xác nhận trước khi ghi? | Từ chối đúng lúc thiếu căn cứ? |
|---|---|---|---|---|---|---|
|  |  |  |  |  |  |  |

## C. Cảm nhận (khoanh 1–5; mỗi điểm thấp phải có 1 dòng giải thích)
- Luồng thao tác dễ hiểu ...... 1 2 3 4 5
- Tìm được thông tin cần ...... 1 2 3 4 5
- Tin được gợi ý của AI ...... 1 2 3 4 5
- Dashboard đọc nhanh ...... 1 2 3 4 5
- Thông báo đúng lúc, không spam ...... 1 2 3 4 5
- Giao diện nền tối dễ dùng ...... 1 2 3 4 5

## D. Định lượng (chỉ điền số đo được, không ước)
- Thời gian hoàn thành luồng (giây): ____
- Số lần phải thử lại / quay lại: ____
- Câu hỏi hệ thống không trả lời được: ____

## E. Defect cần mở issue (mỗi dòng một defect, phân loại theo §8)
| # | Hiện tượng | Vai nào gặp | Severity | Commit đang chạy |
|---|---|---|---|---|
| 1 |  |  |  |  |

## F. Kết luận của người kiểm (ký)
□ Dùng được cho demo   □ Dùng được sau khi sửa defect blocker   □ Không đạt
Ý kiến khác: ____________________
```

Kết quả tổng hợp vào phụ lục báo cáo **nguyên văn theo phiếu**; tỷ lệ "đạt" tính từ số dòng đã chấm, không suy diễn. Trước khi phiên UAT diễn ra, mọi ô trong bảng tổng hợp là `TBD`.

---

## 8. Quy ước defect / bug

### 8.1 Nhãn issue

| Nhóm | Nhãn | Ý nghĩa |
|---|---|---|
| Loại | `bug` · `task` · `test-gaps` · `eval` · `perf` · `docs` | `task` ở đây là **nhãn loại issue**, không phải scope commit — scope `task` không tồn tại |
| Vùng | `auth` `hr` `project` `chatbot` `ai` `dashboard` `realtime` `docs` `ci` | đúng whitelist scope ở `15-engineering-conventions.md` §1.2 |
| Nguồn phát hiện | `uat` · `e2e` · `ci` · `code-review` · `live-eval` | defect chui ra từ cổng nào |
| Trạng thái | `open` → `in-review` → `fixed` → `verified` | `verified` **chỉ** khi có test và người mở issue xác nhận |
| Phạm vi | `p0-floor` (F1–F7) · `stretch-s` (mục S) | nhắc §12: trần S không được giành đường của sàn F |
| Bổ sung | `needs-gvhd` | thứ phụ thuộc GVHD/dataset — kéo thẳng vào §9 |

### 8.2 Severity

| Mức | Định nghĩa (bám đầu bài, không phải sở thích) | Phản ứng |
|---|---|---|
| **S1 — blocker** | Không đăng nhập / không tra cứu / không nộp được báo cáo; hoặc **hở RBAC, tool ghi không confirm, lộ secret** | Sửa ngay, coi như `main` đỏ, dừng tính năng mới |
| **S2 — cao** | Một trong 7 F cho kết quả sai; state machine cho phép cạnh không hợp lệ; KPI tính sai; AI regression gate đỏ | Sửa trước mốc kế tiếp |
| **S3 — trung bình** | Lỗi hiển thị, luồng phụ còn đường vòng, số liệu dashboard lệch nhưng không đổi KPI đã chốt | Vào sprint, bắt buộc có issue |
| **S4 — thấp** | Mỹ thuật, copy, tối ưu nhỏ | Được dời sang `docs/backlog-parked.md` kèm lý do |

Không có "bug không ghi". Phát hiện trong review mà không mở issue là vi phạm §4.3 của `15-engineering-conventions.md`.

### 8.3 Luật cứng cho logic state machine

> **Không ship code chưa có test cho logic state machine.**

Áp dụng cho F2 (`DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED` + nhánh reject, B4) và mọi state machine sau này (kể cả UF-02 nếu GVHD duyệt):

1. Trước khi merge, bảng chuyển tiếp phải có **unit test cho mọi cạnh hợp pháp** và **test phủ định cho cạnh không hợp lệ** — mức **100% state-machine transition** ở §3.
2. Mọi mutation trạng thái đi qua **một** chỗ trong service (atomic conditional update + `version` + `statusHistory`); không có `updateOne({status})` rải rác ở repository/controller.
3. `OVERDUE` không được làm state (B4). Code nào biến nó thành state là defect **S2**, không phải "clean-up sau".
4. Thêm cạnh mới vào sơ đồ = đổi phạm vi nghiệp vụ → issue phải dẫn chứng từ `NOTES-01.md` B0/B4, không thêm "cho tiện".
5. PR thiếu test trong khối này → reviewer từ chối mà không cần đọc code (gate `vitest --coverage` + commit `test:` ở §6.2 của `15-engineering-conventions.md`).

### 8.4 Vòng đời defect

```text
mở issue (đủ nhãn 4 nhóm + F nào + các bước tái hiện + commit)
  → branch fix/<scope>-<issue>
  → commit fix(<scope>): ... + Closes #<issue>   (PR có test phủ định + test phủ dương)
  → CI xanh (§2/§3/§4.2) → squash merge → tác giả issue chuyển sang verified
```

Không đóng issue thủ công khi chưa có test; nhãn `test-gaps` phải về 0 trước khi nộp báo cáo (rubric kiểm thử 0.75đ).

---

## 9. Chưa chốt được (phụ thuộc GVHD / dataset / nguồn)

| # | Treo ở đâu | Hệ quả với kiểm thử | Mốc phải có |
|---|---|---|---|
| 1 | **F1 ≥ 85% đo trên bài toán nào** — classification intent hay ranking (`RESEARCH-PLAN.md` §7.2, `NOTES-01.md` B5: "đây là câu phải chốt với GVHD") | **AI regression gate chưa khoá được baseline** (§4.4 mục 1). Nếu buộc F1 cho ranking thì phải định nghĩa bài `(employee, project) → phù hợp / không phù hợp` và đo P/R/F1/Accuracy; Top-K vẫn dùng P@K/MRR | Trước tuần 5 (B5) |
| 2 | **Dataset đánh giá cuối cùng cho F4** (§7.3; B5). PhoATIS/VN-SLU đã xác minh nhưng không phải domain HR; 6 dataset kia chưa xác minh → không trích | Bộ test intent HR tự xây + protocol chia train/test: **TBD**. Không có dataset thì mọi % ở §4 là giả định | Trước tuần 5 |
| 3 | **Baseline công bố** của F1/P@K (cơ sở để so "không tụt quá 2 điểm") | Gate 7 chưa có mốc so → chạy rỗng hoặc `skip` có chú thích trong CI | Lần chạy eval đầu tiên, tuần 5–6 |
| 4 | **B12 định dạng báo cáo = UNRESOLVED** (`NOTES-01.md` B12): font, line spacing, APA/IEEE, số trang, đánh số chương/bảng, quy định dùng AI hỗ trợ viết, template `.docx` | Chưa biết kết quả eval + phiếu UAT phải trình bày/rút gọn thế nào. **Bắt buộc xin GVHD/Khoa**, không lấy template của khoa khác hoặc Scribd | Trước tuần 10 |
| 5 | **URL nguồn cho mọi con số B1/B5** (mục "CẦN BỔ SUNG" của NOTES-01: trần Atlas, Render sleep, Vercel WS, PhoBERT params, PhoATIS counts…) | Không con số nào được chép vào báo cáo khi chưa có URL → phần "khảo sát" của kiểm thử trống | Trước tuần 12 |
| 6 | **Dữ liệu thật hay giả lập** (§7.10) | Chọn seed cho §7.1, có/không che PII, có được demo bằng dữ liệu thật không | Trước tuần 2 (B4) |
| 7 | **Có được gọi LLM bên thứ ba không**, và ràng buộc gửi dữ liệu nhân sự ra ngoài (§7.5, B6) | Nếu không → live eval (§4.3) chuyển sang Ollama local; mocked deterministic test vẫn giữ nguyên hiệu lực | Trước tuần 5 |
| 8 | **Cấu hình đo Lighthouse** (số lần chạy, device profile, route nào được assert) — nguồn chỉ cho ngưỡng, không cho cấu hình | Ngưỡng ở §6.1 đã có, cách cụ thể hoá **TBD** | Tuần 8 (B9) |
| 9 | **Công cụ benchmark API + embedding** (§6.2 đang để trống) | Không có lệnh → không có gate → chỉ là kế hoạch, không phải kết quả | Tuần 9 (B10) |
| 10 | **Tỉ lệ các tầng test + coverage `apps/ai-service` + contracts** | Nguồn không có con số → **TBD**, nhóm tự đặt kèm lý do | Tuần 9 |

Dòng nào ở trên chưa có câu trả lời thì tài liệu này **giữ nguyên `TBD`**, không điền số "cho có" — theo `RESEARCH-PLAN.md` §0 nguyên tắc 1: không bịa số liệu, không giả sử ràng buộc của Khoa.

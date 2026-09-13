# 16 — Project plan: WBS 12 tuần, RACI 3 người, mốc nghiệm thu

Khóa luận **KLCN133** — *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*.
Thời gian theo đề cương: **12 tuần, 24/08/2026 → 16/11/2026**, nhóm **3 người** (Phạm Việt Hoàng · Nguyễn Thái
Hòa · Nguyễn Ngọc Phi), **gặp GVHD tối thiểu 1 lần/tuần** (`README.md`, `RESEARCH-PLAN.md` §1).

Nguồn của file này:

| Phần | Nguồn |
|---|---|
| Bảng "Thời gian và các công việc trong tuần" + ràng buộc 12 tuần / 3 SV / ≥1 lần gặp GVHD + thang rubric 10đ | `RESEARCH-PLAN.md` §1 |
| Lịch nghiên cứu theo tuần code (tuần 0 → 12, batch nào phải xong trước batch nào) | `RESEARCH-PLAN.md` §6 |
| Ngân sách giờ từng batch (B0 6h, B1 4h, B2 5h, B3 5h, B4 5h, B5 8h, B6 8h, B7 4h, B8 6h, B9 5h, B10 5h, B11 2h, B12 3h; B13–B15 ~11h; tổng B0–B12 ~66h nhóm) | `RESEARCH-PLAN.md` §3 |
| Thứ tự bắt đầu để không đứng chờ nhau | `RESEARCH-PLAN.md` §8 |
| Luật phạm vi 5 điều (sàn trước trần sau · ánh xạ UF + đo được · không làm mờ F4/F5 · GVHD duyệt §7.8–§7.10 · **đóng băng tính năng tuần 11**) | `RESEARCH-PLAN.md` §12 |
| 10 câu hỏi GVHD | `RESEARCH-PLAN.md` §7 |
| Danh mục 18 file docs phải sinh ra | `RESEARCH-PLAN.md` §2 |
| Scope 3 tầng (bắt buộc / bổ sung / ngoài phạm vi) + DoD 8 mục + R1–R6 | `00-vision-scope.md` §4, §6, §7 |
| Trạng thái UF (IN SCOPE / PARKED) | `18-user-flows.md` |
| Kết quả research vòng 1 (B0–B15, B12 `UNRESOLVED`) | `NOTES-01.md` |
| Nhịp UAT + gate CI | `11-quality-testing.md` §7, §9; `14-devops-deployment.md` §3 |

> **Đọc file này như một lịch có điều kiện, không như một cam kết ngày.** Bốn trong mười hai tuần bị chặn bởi
> câu trả lời của GVHD (§7.2, §7.3, §7.8, §7.10) và một mục (B12) đến giờ vẫn `UNRESOLVED`. Cột "Chặn bởi" ở
> mỗi tuần là phần thật của kế hoạch, không phải phần phụ.
>
> **Ghi chú lịch:** `NOTES-01.md` ghi ngày research vòng 1 là **13/09/2026**, tức đã rơi vào khoảng tuần 4 theo
> cách đánh số dưới đây, trong khi `RESEARCH-PLAN.md` §6 xếp B0/B1/B2/B11/B12 vào **tuần 0–1**. Đây là một
> trong những thứ thuộc câu hỏi §7.4 ("bảng công việc theo tuần liệt kê 14 mục nhưng thời gian ghi 12 tuần →
> mục nào gộp") — **phải chốt lại với GVHD, không tự sửa lịch cho khớp**.

---

## 1. Ánh xạ tuần theo đề cương

Đề cương nêu 14 mục việc trong 12 tuần; `RESEARCH-PLAN.md` §6 đã cho biết cách nhóm đang gộp: mục "khảo sát
nghiệp vụ & luồng người dùng" thành **tuần 0** (không code), và gộp "hồ sơ nhân viên" + "đề tài" + "khung
dashboard" vào **tuần 3**. Cách gộp đó **chưa được GVHD xác nhận** (§7.4).

| Tuần | dates | Mục việc theo đề cương (`RP §6`) | Batch research phải có trước đó (`RP §6`) |
|---|---|---|---|
| **0** | 24/08–30/08 | khảo sát nghiệp vụ & luồng người dùng (**không code**) | **B0** |
| **1** | 31/08–06/09 | monorepo, DB, CI/CD | B1, B2, B11, B12 |
| **2** | 07/09–13/09 | auth & phân quyền | B3 (**chờ B0**) |
| **3** | 14/09–20/09 | hồ sơ NV, đề tài, khung dashboard | B4 (**chờ B0**), B8 |
| **4** | 21/09–27/09 | Agent Loop + tools | B6, B7 |
| **5** | 28/09–04/10 | PhoBERT + eval (kỳ 1) | B5 |
| **6** | 05/10–11/10 | PhoBERT + eval (kỳ 2) | B5, B13, B14 |
| **7** | 12/10–18/10 | LLM function calling | B6 (phần model/provider) |
| **8** | 19/10–25/10 | giao việc & nộp báo cáo qua chat | B7 (**B0** đã chốt catalog ý định) |
| **9** | 26/10–01/11 | sentiment → KPI | B5, B6 |
| **10** | 02/11–08/11 | nhắc hạn + test API | B9, B10 |
| **11** | 09/11–15/11 | deploy + E2E + UAT — **ĐÓNG BĂNG TÍNH NĂNG** | B10 |
| **12** | 16/11 (hạn đề cương) + phần còn lại của tuần | optimize + viết báo cáo | B9, B12 |

Cột cuối **đã trễ một phần so với lịch đề cương**: vòng research 1 nộp 13/09 mới phủ B0–B15. Hệ quả thật: B5
(chặn tuần 5–6) và B6 (chặn tuần 4) đến **sớm hơn** lịch của chúng, nhưng **B12 vẫn `UNRESOLVED`** và
**dataset F4 vẫn chưa khoá** — hai thứ đó chặn tuần 5–6 và tuần 12, không phải khối lượng code.

---

## 2. RACI ba người theo vùng

Phân vùng lấy từ commit scope (`NOTES-01 §B11`, `15-engineering-conventions.md` §1.2) và module
(`02-architecture.md` §5.2):

| Người | Vùng code (scope commit) | Vì sao chia vậy |
|---|---|---|
| **Hoàng** | `auth`, `realtime`, `ci` (+ phần `docs` của các file anh chủ trì) → `modules/auth`, `modules/realtime`, `jobs/`, hạ tầng CI/CD, `apps/api` | auth + realtime + scheduler là một khối hạ tầng: JWT/RT rotation, Socket.IO handshake, Agenda — tất cả sống trong cùng một process `apps/api`, nên một người giữ để không ai mở pool thứ hai hay start scheduler ở hai chỗ |
| **Hòa** | `ai`, `chatbot` → `apps/ai-service` (PhoBERT, embedding, calibration, sentiment→KPI), `modules/chatbot`, `modules/ai`, eval harness | phần "khoa học" của khóa luận; `RP §8` giao đúng B5/B6 cho "người mạnh nhất nhóm" và ghi rõ đây là phần nặng nhất |
| **Phi** | `dashboard`, `hr`, `project`, `docs` → `apps/web` (shadcn/ui + Recharts + khung chat), `modules/hr`, `modules/project`, `modules/notification` | hai bề mặt UI + CRUD nghiệp vụ; `hr`/`project` là dữ liệu mà UI hiển thị, nên đi cùng nhau |

**Ownership file docs** (một file **một** chủ file; người kia review; không "đồng tác giả" để khỏi không ai làm):

| File docs | Chủ file | Review | Vì sao ở người đó |
|---|---|---|---|
| `00-vision-scope.md` | Hoàng | Hòa + Phi | phạm vi là quyết định có ràng buộc hạ tầng |
| `01-requirements.md` | Hoàng | Hòa + Phi | traceability FR→rubric |
| `02-architecture.md` | Hoàng | Phi | container/process boundaries |
| `03-decision-records/ADR-001…016` | Hoàng (001–011, 016) · **Hòa** (012–014) · **Phi** (015) | chéo | ADR của vùng nào thuộc người đó |
| `04-domain-model.md` | Hoàng | Phi | state machine + BR |
| `05-data-model.md` | Hoàng | Hòa | schema + index |
| `06-api-spec.md` | Hoàng | Phi | REST + WS contract + error catalog |
| `07-auth-rbac.md` | Hoàng | Hòa | rotation + matrix |
| `08-algorithms.md` | **Hòa** | Hoàng | PhoBERT/agent/KPI formula |
| `09-ai-evaluation.md` | **Hòa** | Hoàng | dataset + protocol + baseline |
| `10-ui-ux-spec.md` | **Phi** | Hoàng | tokens/layout/chat UX/a11y |
| `11-quality-testing.md` | **Hòa** | Hoàng | kim tự tháp test + eval gate |
| `12-performance.md` | **Hòa** | Hoàng | internal target nằm ở đường AI + API |
| `13-security.md` | **Hoàng** | Hòa | threat model = quyền + token |
| `14-devops-deployment.md` | **Hoàng** | Phi | env matrix, runbook |
| `15-engineering-conventions.md` | **Phi** | Hoàng | commit/naming/structure |
| `16-project-plan.md` | **Hoàng** | Hòa + Phi | lịch + RACI cần người nhìn cả ba vùng |
| `17-innovation-playbook.md` | **Hòa** | Hoàng | S-series nặng về thực nghiệm |
| `18-user-flows.md` | **Phi** | Hoàng | nghiệp vụ hiển thị ở UI |
| `backlog-parked.md` | **Phi** | Hoàng | chống mất dấu |
| Báo cáo + slide | **cả ba**, một người Chủ biên từng chương theo bảng §5 | chéo | rubric "phong cách slide 0.5" + "nội dung báo cáo 0.5" |

Quy tắc review giữ nguyên từ `15-engineering-conventions.md` §4.3: mỗi PR **một** approve từ người **không phải
tác giả**; ai code ở đâu thì **không** được là reviewer duy nhất ở đó.

---

## 3. WBS theo tuần

Ký hiệu: **M** = Mục tiêu · **V** = việc theo module · **D** = file docs phải xong · **N** = nghiêm thu tuần ·
**C** = chặn bởi · **R** = điểm rubric "kiếm" trong tuần.

### Tuần 0 — Khảo sát nghiệp vụ & luồng người dùng (không code)

| | |
|---|---|
| **M** | Đổi 7 chức năng của đề cương thành **luồng người dùng có thật**, có ngoại lệ và có bằng chứng ngành. Không viết dòng code nào. |
| **V** | Hoàng: khung phạm vi + DoD. Hòa: chuẩn bị câu hỏi GVHD (`RP §7`), đọc cấu trúc batch B5/B6 để biết phần thực nghiệm cần gì. Phi: chạy B0-worksheet trên ≥6 sản phẩm HRM, điền bảng đối chiếu UF. |
| **D** | `00-vision-scope.md`, `docs/research/B0-worksheet.md` (đã có mẫu), `docs/research/NOTES-01.md` phần B0 |
| **N** | 10 UF có ngoại lệ; catalog 28 intent; notification matrix 9 dòng; 4 flow được đánh dấu `PARKED` **và có lý do** (`backlog-parked.md`); `RP §7` đã **gửi** cho GVHD |
| **R** | **khảo sát 0.75** (toàn bộ), **phân tích 0.75** (một nửa: use-case) |
| **C** | — |
| **Gặp GVHD** | buổi 1 — nộp phạm vi + 10 câu hỏi; xin chốt §7.4 (gộp mục) ngay buổi này |

### Tuần 1 — Monorepo, DB, CI/CD

| | |
|---|---|
| **M** | Repo dựng được, pipeline chạy được, **một commit cũng đỏ được**. Không có CI thì mọi cam kết sau là chữ. |
| **V** | Hoàng: `pnpm-workspace.yaml`, cây `apps/` + `packages/` (`§B2`), tsconfig/eslint/prettier/husky/commitlint, GitHub Actions theo thứ tự `§B10`, `gitleaks`. Hòa: `apps/ai-service` (FastAPI + `pytest` + pin `transformers`). Phi: `apps/web` (Vite + Tailwind + shadcn), `packages/contracts` pipeline `Zod → OpenAPI → Orval`. |
| **D** | `02-architecture.md`, `05-data-model.md` (nháp), `15-engineering-conventions.md`, ADR-001, ADR-002 |
| **N** | `pnpm install --frozen-lockfile && pnpm -r lint && pnpm -r typecheck && pnpm test && pnpm -r build` xanh trên `main`; một commit sai scope bị `commitlint` chặn; một secret giả bị `gitleaks` chặn; Atlas M0 dev cluster nối được |
| **R** | **thái độ 0.5** (nhịp làm việc bắt đầu), **kiểm thử & triển khai 0.75** (một phần: hạ tầng) |
| **C** | B12 (định dạng báo cáo) **chưa có nguồn** — không chặn code nhưng chặn mọi thứ liên quan hình thức |
| **Gặp GVHD** | buổi 2 — demo CI; hỏi lại B12 + §7.6 |

### Tuần 2 — Auth & phân quyền

| | |
|---|---|
| **M** | Hai vai đăng nhập được, refresh đúng, và **hệ thống từ chối đúng chỗ**. |
| **V** | Hoàng: `modules/auth` — login/logout, `jose`, Argon2id, `refresh_sessions`, rotation + reuse detection (atomic conditional update, **không** transaction), cookie flags, RBAC guard. Hòa: mock `LLMProvider` để các tuần sau test tất định được. Phi: màn hình login + Orval client + interceptor "hết hạn → refresh → retry" **serialize** một lần refresh duy nhất (`ADR-008` cảnh báo bug kinh điển). |
| **D** | `07-auth-rbac.md`, ADR-006, ADR-007, ADR-008, ADR-009, `13-security.md` (§2.1–§2.4) |
| **N** | integration test: replay RT-1 → **cả `familyId` bị revoke**; Employee không gọi được `assign_project`/`override_kpi`; Mongo không chứa token thô; `pnpm --filter api test auth` xanh; **mọi TTL vẫn là `TBD` cho tới khi chốt A-01** |
| **R** | **cài đặt 3.5** (nền tảng cho cả 7 F), **thiết kế lớp + dữ liệu 0.5** (một phần) |
| **C** | §7.10 (dữ liệu thật/giả lập) ảnh hưởng seed account; `Lead` có phải `Admin` không (Q-09 docs 04) |
| **Gặp GVHD** | buổi 3 — demo rotation; **nhắc lại** §7.2 (metric) vì nó chặn tuần 5 |

### Tuần 3 — Hồ sơ NV, đề tài, khung dashboard

| | |
|---|---|
| **M** | Dữ liệu thật của hệ thống vào được DB, đọc được trên UI, và vòng đời đề tài **không cho phép cạnh sai**. |
| **V** | Hoàng: `modules/hr` (employees, departments, 5 `level`), `modules/project` (state machine + `statusHistory` + `version` + atomic conditional update + overdue là **dẫn xuất**), 20 index theo `05` §4. Phi: dashboard nền tối (`10-ui-ux-spec.md` §3), bảng có phân trang, sidebar theo role. Hòa: ingest `policies` + chunk (chưa embed) để chuẩn bị UF-10. |
| **D** | `04-domain-model.md`, `05-data-model.md` (khoá), `10-ui-ux-spec.md`, `18-user-flows.md`, ADR-004, ADR-005, ADR-009 |
| **N** | `pnpm --filter api exec vitest run --coverage domain` đạt **100% state-machine transition** + cạnh bất hợp pháp bị chặn (`11-quality-testing.md` §8.3); UF-01 chạy được trên Dashboard; **không** có nút nào cho UF-02/03/07/08 |
| **R** | **phân tích 0.75** (sơ đồ lớp phân tích), **thiết kế lớp + dữ liệu 0.5**, **cài đặt 3.5** (F1, F2) |
| **C** | Q-01 (`CANCELLED` có phải state không), P-09 docs 10 (màn hình duyệt field nhạy cảm — `§B6` **không có tool**) |
| **Gặp GVHD** | buổi 4 — demo state machine + dashboard; xin duyệt phạm vi S (§7.8) **trước tuần 8** |

### Tuần 4 — Agent Loop + tools

| | |
|---|---|
| **M** | Câu hỏi → intent → tool → kết quả có cấu trúc, và **tool ghi không tự chạy**. |
| **V** | Hoàng: `modules/realtime` (Socket.IO handshake verify, rooms `user:`/`department:`, 9 event, `clientMessageId` dedupe). Hòa: `modules/chatbot` — router, tool catalog **đúng 15 cái** của `§B6`, Zod validate mọi đối số, RBAC mỗi call, confirm-before-write (S8), guard `maxSteps=5` + timeouts. Phi: khung chat (`10-ui-ux-spec.md` §6): optimistic send, typing indicator, `chat:chunk` stream, skeleton/error. |
| **D** | `06-api-spec.md` (REST + **9 event** + error catalog), `08-algorithms.md` (phần agent), ADR-010, ADR-012 |
| **N** | Playwright smoke: login → hỏi "xem đề tài của tôi" → nhận card; gửi `submit_report` **không** confirm → dữ liệu không đổi; event ngoài 9 tên bị gate `realtime/contracts` chặn |
| **R** | **cài đặt 3.5** (F3 một phần), **thiết kế giao diện 0.5** (một phần) |
| **C** | điểm treo #4 (`02` §12): agent loop nằm ở Node hay Python — **phải chốt tuần này**, nó quyết định chỗ đặt RBAC |
| **Gặp GVHD** | buổi 5 — demo agent loop |

### Tuần 5–6 — PhoBERT + eval *(phần khoa học; hai tuần)*

| | |
|---|---|
| **M** | F4 chạy được **và chứng minh được** bằng số; S3/S2 có kết quả thật. |
| **V** | Hòa (chính): word segmentation trước khi vào PhoBERT (`§B5` yêu cầu), embedding 4 ứng viên (TF-IDF/BM25 · PhoBERT mean-pool · multilingual-e5-small · MiniLM), ranking + tie-break workload, skill-to-skill cosine + leave-one-out (S1), calibration Platt/logistic + abstention (S2), eval harness `P@1/@3/@5, Recall@5, MRR, latency, RAM`. Hoàng: `modules/ai` proxy + row cap/timeout + warm-up + cache embedding. Phi: card giải thích theo format `§B14`, khối "hỏi lại", bảng phân trang theo `list_projects`. |
| **D** | `08-algorithms.md`, `09-ai-evaluation.md` (dataset + protocol + **baseline công bố**), `12-performance.md`, `13-security.md` (§2.6), `17-innovation-playbook.md`, ADR-003, ADR-013, ADR-015 |
| **N** | bảng so sánh ≥2 phương án embedding trên **cùng một tập test** kèm latency + RAM (điều kiện DoD mục 4 của `00-vision-scope.md` §7); gate `pytest -q tests/eval -m gate` **có baseline để so**; reliability diagram + ECE/Brier vẽ được |
| **R** | **NCKH +1.0/+0.5** (toàn bộ cửa này nằm ở đây), **cài đặt 3.5** (F4) |
| **C** | **§7.2** (F1 đo bài toán nào) — `NOTES-01 §B5`: *"đây là câu phải chốt với GVHD"*, và chưa khoá dataset cho F4 tới khi có trả lời; **§7.3** (dataset tự xây có được chấp nhận không); `PhoATIS` chỉ là domain đặt vé máy bay → **không** được gọi là dataset chuẩn HR |
| **Gặp GVHD** | buổi 6 **và** buổi 7 — hai tuần này phải gặp **đủ hai lần**, vì metric chưa chốt |

### Tuần 7 — LLM function calling

| | |
|---|---|
| **M** | Provider thật chạy thật, và **tỷ lệ chọn đúng tool là số đo được**, không phải cảm giác. |
| **V** | Hòa: `LLMProvider` adapter Gemini/Groq, prompt có top-K chunks, `answer + document/version/source` (BR-15), fallback khi thiếu bằng chứng (UF-10 bước 7), S9 graceful degradation. Hoàng: rate/quota xử lý như kết quả hợp lệ, timeout. Phi: rich card cho kết quả tra cứu, trạng thái "chế độ không AI". |
| **D** | `09-ai-evaluation.md` phần live eval, `11-quality-testing.md` §4.3 cập nhật, `13-security.md` §2.12 |
| **N** | live eval (nightly) trả: tỷ lệ chọn đúng tool · tỷ lệ tham số đúng · `Chat tool lookup p95` · first token · chi phí/phiên; **mọi dòng có commit + model + provider + ngày + múi giờ + seed** (`11-quality-testing.md` §4.3); PR vẫn chỉ chạy mocked |
| **R** | **cài đặt 3.5** (F3), **kiểm thử & triển khai 0.75** (một phần) |
| **C** | §7.5 (được gọi LLM bên thứ ba không; ràng buộc gửi dữ liệu nhân sự ra ngoài) — **câu này còn mở là S9 và RAG đổi thiết kế** |
| **Gặp GVHD** | buổi 8 |

### Tuần 8 — Giao việc & nộp báo cáo qua chat

| | |
|---|---|
| **M** | **Sàn khép lại:** F1–F7 chạy được toàn trình qua **cả hai kênh**. Đây là mốc của `RP §12` luật 1 ("trước tuần 9"). |
| **V** | Hoàng: `modules/project` transition qua chat (T-02/T-03/T-04) + audit + WS. Hòa: `find_candidates` → `explain_candidate_match` → `assign_project` (confirm + Admin); whitelist template cho S10 **chỉ khi** được duyệt (`backlog-parked.md` PARK-05). Phi: luồng UF-04 + UF-05 trên chat, dialog confirm, màn hình reject + "xem lý do bị từ chối". |
| **D** | `17-innovation-playbook.md` khoá danh sách S, `10-ui-ux-spec.md` cập nhật, `18-user-flows.md` rà lại lần cuối |
| **N** | một đề tài đi hết `DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED` **và** nhánh reject, **khởi đầu từ chat** cả hai chiều Admin/Employee; S1/S2/S8 đã có bằng chứng; **danh sách 5 mục S được GVHD duyệt bằng văn bản/chat** (`RP §12` luật 4) |
| **R** | **cài đặt 3.5** (F4, F7 một phần), **thiết kế giao diện 0.5** |
| **C** | §7.8 — nếu chưa trả lời thì **mọi mục S ngoài 5 đã duyệt bị đóng**, không được code tiếp |
| **Gặp GVHD** | buổi 9 — **bắt buộc có chữ duyệt phạm vi sáng tạo** |

### Tuần 9 — Sentiment → KPI

| | |
|---|---|
| **M** | F5 ra số theo **công thức tất định**, AI chỉ gợi ý thành phần, và **đo được tính thiên kiến**. |
| **V** | Hòa: sentiment/themes/risk signals/suggested component (`§B6`), deterministic formula (BR-07), counter-weight + ceiling (BR-08, S13), bias probe (S12). Hoàng: `override_kpi` (confirm + reason + Admin) + `evaluations` UNIQUE theo `(employeeId, period)`. Phi: màn hình calibration, breakdown `machineScore`, badge override, `kpi:updated`, **hai biểu đồ F6** (`10-ui-ux-spec.md` §4). |
| **D** | `04-domain-model.md` §6 cập nhật, `10-ui-ux-spec.md` §4 xong, `12-performance.md` mục dashboard aggregate |
| **N** | `machineScore \| finalScore \| overrideReason \| changedBy \| changedAt` **đủ mặt** ở mọi bản ghi đã chốt; override không lý do bị chặn; bảng bias probe có số (hoặc ghi `TBD — chưa chạy`); `pytest` phủ đường ceil |
| **R** | **cài đặt 3.5** (F5, F6), **NCKH** (S12/S13 là nội dung bổ trợ) |
| **C** | Q-06 (`managerReview` chưa có tool ghi trong `§B6`) |
| **Gặp GVHD** | buổi 10 |

### Tuần 10 — Nhắc hạn + test API

| | |
|---|---|
| **M** | Agenda chạy đúng matrix `§B0`, idempotent khi chạy lại; **Postman + Lighthouse có bằng chứng**. |
| **V** | Hoàng: `jobs/` (deadline 3 ngày / 1 ngày / quá hạn / KPI cần review / daily digest), `dedupeKey` UNIQUE, persist-trước-emit, `SCHEDULER_ENABLED` một entrypoint, deploy `main` thật lên Render/Vercel (hoặc Netlify). Hòa: `lighthouse-ci` config + API benchmark, chốt ngân sách KB theo route. Phi: hộp thư thông báo + deep-link theo `payload`, responsive + a11y pass, tập Postman. |
| **D** | `14-devops-deployment.md` (runbook đã áp dụng thật), `12-performance.md` §6 bắt đầu có dòng đầu tiên, `11-quality-testing.md` §6 cập nhật |
| **N** | `make demo` chạy từ đầu tới cuối + in bảng số; job chạy lại **không** gửi đúp; deployment thật trên **3 nền tảng** chạy được (DoD mục 1); Lighthouse có số của hai route; Postman collection export được |
| **R** | **kiểm thử & triển khai 0.75** (phần lớn), **cài đặt 3.5** (F7) |
| **C** | **B12 phải xong trước tuần này kết thúc** (`RP §3 B12` xếp B12 ở tuần 10; `11-quality-testing.md` §9 mục 4 đặt mốc "trước tuần 10") — vẫn `UNRESOLVED` → **rủi ro mất 0.5đ định dạng là hiện thực** |
| **Gặp GVHD** | buổi 11 — **nộp chương 1–3 đã theo template Khoa** |

### Tuần 11 — Deploy + E2E + UAT — **ĐÓNG BĂNG TÍNH NĂNG**

| | |
|---|---|
| **M** | Không thêm gì mới. Chỉ còn: sửa bug, tối ưu, viết báo cáo (`RP §12` luật 5). |
| **V** | Hoàng: demo end-to-end hai vai, checklist "trước khi demo" của `14-devops-deployment.md` §7, export dữ liệu trước phiên UAT (`§B1`: M0 **không backup tự động**). Hòa: live eval lần cuối, khoá số liệu vào `09-ai-evaluation.md`, chạy S3/S2 đủ bảng. Phi: UAT với giảng viên + sinh viên đóng vai, phiếu UAT theo `11-quality-testing.md` §7.2, defect phân loại S1–S4. |
| **D** | toàn bộ `docs/` **khớp mã nguồn ở ngày nộp** (DoD mục 7); chương kết quả thực nghiệm viết xong |
| **N** | `pnpm test:e2e` xanh; UAT có phiếu ký, có người thư ký, có commit; **không** còn nhãn `test-gaps`; **không** còn S nào chưa duyệt trong code; **sẵn sàng cho DoD mục 8**: trình diễn đúng một lần, end-to-end, qua cả chat và dashboard |
| **R** | **kiểm thử & triển khai 0.75** (phần UAT), **nội dung báo cáo 0.5** |
| **C** | §7.10 quyết định dữ liệu UAT là seed hay dữ liệu thật |
| **Gặp GVHD** | buổi 12 — UAT có sự dự của GVHD (đúng đầu bài: *"UAT giảng viên + sinh viên đóng vai"*) |

### Tuần 12 — Optimize + viết báo cáo

| | |
|---|---|
| **M** | Số liệu đứng vững, hình thức đứng vững, slide đứng vững. |
| **V** | Hoàng: optimization log (`12-performance.md` §6) — mỗi dòng có trước/sau/cách đo; chạy `make demo` trên máy của người **không** viết script để chứng minh tái lập. Hòa: `09-ai-evaluation.md` chốt bảng kết quả + Datasheet/Model Card (S5); giới hạn nêu thẳng. Phi: báo cáo theo template Khoa, trích dẫn, hình vẽ nét cao, slide; lặp lại UAT trước buổi bảo vệ nếu cần. |
| **D** | **báo cáo + slide**, `01-requirements.md` (traceability), `backlog-parked.md` (đối chiếu mục đã làm / chưa làm) |
| **N** | không còn ô `TBD` nào trong báo cáo mà chưa được giải thích là "chưa đo được vì …"; mọi con số có URL nguồn theo `RP §5`; **mọi con số B1/B5/B6** phải nằm trong nhóm đã bổ sung URL vào `NOTES-01.md` |
| **R** | **nội dung báo cáo 0.5**, **định dạng báo cáo 0.5**, **phong cách slide 0.5**, **NCKH +1.0/+0.5** |
| **C** | B12 (nếu GVHD/Khoa chậm, **0.5đ định dạng** bị đe doạ trực tiếp); mốc nộp NCKH §7.9 |
| **Gặp GVHD** | buổi 13–14 (tuần cuối thường cần 2 lần: duyệt bản hoàn chỉnh + tổng duyệt slide) |

---

## 4. Bảng phụ thuộc — tuần nào chặn tuần nào

```text
T0 (B0: UF, 28 intent, notification matrix)
 ├─► T2 (B3: RBAC cần biết ai làm gì)      ─► T4 (chatbot: tool + confirm)
 ├─► T3 (B4: state machine + collection)    ─► T8 (toàn trình F2/F7)
 └─► T8 (catalog ý định đã chốt)

T1 (B1+B2+B11+B12: repo + CI)  ─► MỌI tuần sau — không có CI thì không có gate
T2 (auth)                       ─► T3 (mọi màn hình cần role) ─► T4 (handshake verify)
T3 (hr + project + dashboard)   ─► T4 (tool đọc gì) ─► T7 (function calling trên tool thật)
T4 (agent loop + realtime)      ─► T8 (write qua chat) ─► T10 (nhắc hạn đẩy qua WS)
T5–T6 (embedding + eval + baseline) ─► T7 (live eval so với baseline)
                                  ─► T9 (S2/S3 là đầu vào của S12/S13)
                                  ─► T12 (bảng số trong báo cáo)
T7 (provider + RAG)             ─► T9 (phân tích ngữ nghĩa nhận xét)
T8 (sàn khép lại)               ─► MỌI mục S còn lại (RP §12 luật 1)
T9 (F5 + KPI)                   ─► T11 (dashboard có nội dung để UAT)
T10 (deploy + test API)         ─► T11 (UAT trên môi trường thật, không localhost)
T11 (đóng băng)                 ─► T12 (chỉ đo + viết)
```

| BỊ CHẶN | CHẶN BỞI | Thuộc | Nếu chậm một tuần thì sao |
|---|---|---|---|
| T5–T6 (đo F4) | **§7.2** — F1 đo bài toán nào; **§7.3** — dataset; `NOTES-01 §B5`: chưa khoá dataset cho F4 | **GVHD** | không có baseline ⇒ gate `pytest -m gate` rỗng ⇒ tuần 7 live eval không có mốc so ⇒ tuần 12 không có bảng số. **Đây là dependency nguy hiểm nhất của cả lịch.** |
| T4 (điểm đặt RBAC) | `02-architecture.md` §12 #4: agent loop ở Node hay Python | **nhóm** | mỗi lần đổi là đổi cả `modules/*` + auth nội bộ + test; chốt muộn tới T7 là refactor giữa kỳ |
| T9–T11 (mục S) | **§7.8** duyệt 5 mục sáng tạo — hạn **trước tuần 8** | **GVHD** | S chưa duyệt không được code (`RP §12` luật 1 + 4); chậm ⇒ mất NCKH, không mất F |
| T10, T12 (hình thức) | **B12** — template Khoa; `RP §3 B12` = `UNRESOLVED` | **GVHD/Khoa** | **0.5đ định dạng** mất vì lý do không liên quan chất lượng |
| T3 (seed/UAT dữ liệu) | **§7.10** dữ liệu thật hay giả lập | **GVHD** | ảnh hưởng `05` §6.2, S14, và cả §7.1 của UAT |
| mọi bảng số | URL cho B1/B5/B6 (`NOTES-01` mục CẦN BỔ SUNG) | **nhóm** | số không có nguồn ⇒ hội đồng bắt bẻ (`RP §5`) |
| T12 (mốc nộp NCKH) | **§7.9** | **GVHD** | quyết định phải khoá dataset **trước tuần mấy** |

---

## 5. Mốc đóng băng tính năng — tuần 11

| Từ | Đến | Được làm | Không được làm |
|---|---|---|---|
| đầu T11 | hết T11 | sửa bug (S1–S4 theo `11-quality-testing.md` §8.2), tối ưu có đo, viết báo cáo, UAT, **thêm test** | thêm tính năng; thêm mục S; **destructive schema change** (`05` §6.1 mục 4); đổi metric đã công bố; nới ngưỡng gate cho code pass |
| đầu T12 | 16/11/2026 + những ngày còn lại | đo + tối ưu + báo cáo + slide + tổng duyệt | bất kỳ thay đổi hành vi nào. **Trước buổi bảo vệ: chỉ fix blocker** |

Ba hệ quả vận hành phải nói trước, không phải khi đã muộn:

1. **Mọi mục S chưa xong ở hết T10 sẽ không "nợ lại" sang T11** — nó đi thẳng vào `backlog-parked.md` kèm lý
   do. Đó là cách giữ `RP §12` luật 2 ("không có luồng, không có số → dời sang backlog").
2. **Đóng băng ≠ đóng CI.** Chuỗi gate ở `14-devops-deployment.md` §3.1 chạy đến ngày nộp; tắt gate để "kịp
   báo cáo" là đổi luôn định nghĩa của "xong" (`00-vision-scope.md` §7 mục 6).
3. **Đóng băng làm lộ nợ:** những thứ đang `chưa bật — chờ file` (WS contract chờ `06-api-spec.md`, AI
   regression gate chờ `09-ai-evaluation.md`, Lighthouse chờ cấu hình route) phải được bật **hoặc** bị ghi
   trong báo cáo là *không có gate*, không được để im lặng.

---

## 6. Mười câu hỏi cho GVHD, kèm hạn trả lời

Nguyên văn 10 câu từ `RESEARCH-PLAN.md` §7, cột "hạn" và "trạng thái" là phần cập nhật của file này.
**§7.x** = số thứ tự câu trong §7.

| # | Câu hỏi | Ảnh hưởng tới | **Hạn trả lời** | Trạng thái hiện tại |
|---|---|---|---|---|
| §7.1 | **Backend framework**: đề cương ghi Express.js — có được đổi sang NestJS không? | `02`, ADR-002, toàn bộ `apps/api` | tuần 1 (sớm, vì nó đổi cấu trúc module) | **đã tự chốt theo hướng KHÔNG đổi** (`§B2`: giữ Express, cần xác nhận của GVHD mới đổi) → chỉ còn hình thức xác nhận |
| §7.2 | **F1 ≥ 85% tính trên bài toán nào** — classification intent hay ranking? Nếu ranking thì xin đổi sang Precision@5/Recall@5/MRR, hoặc giữ F1 cho intent classification | **chặn `09-ai-evaluation.md`** (dataset + protocol + baseline), metric F4, gate `pytest -m gate`, cửa NCKH | **trước tuần 5** (nguồn `11-quality-testing.md` §9 mục 1: "Trước tuần 5") | 🔴 **đang chặn — `NOTES-01 §B5` gọi đây là "câu phải chốt với GVHD"**; `09-ai-evaluation.md` đang được viết nên câu trả lời tới muộn sẽ **viết lại file đó** |
| §7.3 | **"Tập dữ liệu thử nghiệm chuẩn"**: Khoa yêu cầu tối thiểu bao nhiêu mẫu? Có chấp nhận dataset tự gom + công bố protocol không? | `09`, S14, toàn bộ số thực nghiệm | **cùng hạn với §7.2 — trước tuần 5** | 🟠 chưa trả lời. Hệ quả từ B5: dataset tiếng Việt công khai duy nhất xác minh được (`PhoATIS`) thuộc domain **đặt vé máy bay** → không phải dataset HR chuẩn; hướng nhóm chọn là **tự xây HR intent dataset** dựa trên catalog 28 intent |
| §7.4 | **Timeline**: bảng công việc liệt kê **14 mục** nhưng thời gian ghi **12 tuần** → mục nào gộp? | file này (§1), T3, T10 | **buổi gặp tuần 0–1** | 🟠 nhóm đang gộp tạm theo `RP §6` (xem §1 ở trên) và ghi rõ là **tạm**; chênh lệch lịch sử research (13/09) so với tuần 0–1 cũng thuộc câu này |
| §7.5 | **LLM bên thứ ba**: được gọi Gemini/OpenAI/Groq không? Có ràng buộc gì về việc gửi dữ liệu nhân sự ra service ngoài? | T7, RAG, live eval, `13-security.md` §2.10, ADR-012 | **trước tuần 7** (T7 là tuần provider thật chạy) | 🟠 chưa trả lời. Nếu bị cấm → live eval chuyển hướng Ollama local và **đụng trần RAM chưa chứng minh** của VPS 2GB (`02` §12 #6) |
| §7.6 | **Định dạng báo cáo**: file mẫu + chuẩn trích dẫn (APA/IEEE) + giới hạn số trang + quy định dùng AI hỗ trợ viết | B12, **rubric định dạng 0.5** + nội dung 0.5 | **trước tuần 10** | 🔴 **B12 vẫn `UNRESOLVED`** (`NOTES-01 §B12`): chưa tìm được nguồn chính thức của Khoa CNTT HUIT; có tài liệu của **khoa khác** và file re-upload nhưng **không coi là nguồn hợp lệ**; **cấm** lấy template Scribd/khoa khác |
| §7.7 | **Điểm NCKH (+1.0)**: nếu có tiềm năng ra bài báo/hội thảo cấp Khoa, nhóm sẽ thiết kế `09-ai-evaluation.md` theo hướng thực nghiệm so sánh mô hình ngay từ đầu — xin xác nhận để khỏi làm lại | `09`, S3, `17-innovation-playbook.md` | **tuần 2** (trước khi viết `09`) | 🟢 nhóm đã **làm như thể có** (thứ tự `S14 → S3 → S2 → S1 → S6` của `§B5`/dòng kết luận). Rủi ro: nếu thầy không lấy hướng này thì bỏ công S3 — **phải xin chữ ký xác nhận** |
| §7.8 | **Phạm vi sáng tạo**: được thêm bao nhiêu ngoài đề cương? Ưu tiên **thực nghiệm mô hình** (S2/S3/S12) hay **sản phẩm agentic** (S6/S7/S10)? **Xin duyệt danh sách 5 mục trước tuần 8** | `00-vision-scope.md` §4, `17`, `18`, mọi mục S, `backlog-parked.md` | **trước tuần 8** — đây là hạn **đang giữ**, vì T8 có mốc "S chưa duyệt thì không code" | 🟠 5 mục **đã chọn nhưng chưa được duyệt** (`00-vision-scope.md` §9, dòng "Việc chặn"). Bốn mục rẻ (S5/S8/S11/S13) thuộc nhóm "làm bất kể" theo `RP §10` |
| §7.9 | **Mốc nộp NCKH / hội thảo sinh viên**: deadline khi nào? | tuần phải **khoá dataset** và chạy thực nghiệm; T5–T6, T12 | **tuần 3** | 🟠 chưa trả lời; `RP §7` ghi rõ nó "quy định việc phải khoá dataset và chạy thực nghiệm trước tuần mấy" |
| §7.10 | **Dữ liệu thật hay giả lập** (kèm ràng buộc gì)? | `05` §6.2 (seed), `11` §7.1 (UAT), S14, S4, `13` §2.10 | **trước tuần 3** (`RP §6`: B4 ở tuần 2–3) | 🟠 chưa trả lời → seed hiện hành là **giả lập có khoá**, và mọi câu hỏi "ẩn danh" (UF-08) chưa có nghĩa gì |

**Cách gửi:** một lần, đủ 10 câu, ngay buổi tuần 0 (đúng `RP §8`: "Hôm nay: gửi §7 cho thầy"); sau đó **dò lại
từng câu quá hạn** ở mỗi buổi. Trạng thái 🔴 là câu **đang làm trôi công việc của tuần khác**, không chỉ chậm
riêng nó.

---

## 7. Rủi ro tiến độ — nối R1..R6 của `00-vision-scope.md` §6

Bảng dưới **không** đặt ra rủi ro mới; nó dịch sáu rủi ro đã chốt thành **tác động lên lịch** và **hành động
sớm nhất có thể**.

| # | Rủi ro (`00-vision-scope.md` §6) | Xác suất | Biểu hiện **trên lịch** | Hành động theo tuần, đã ghi ở docs | Điểm rubric bị đe doạ |
|---|---|---|---|---|---|
| **R1** | Không có dataset HR tiếng Việt đạt chuẩn → phần thực nghiệm không có chỗ đo | **Cao** | T5–T6 chạy mà **không có bảng số**; T7 không có baseline để so; T12 không có chương kết quả | T0: gửi §7.2+§7.3. T1: dựng S14 (seed có khoá) **trước** khi cần nó. T3: `policies` ingest sẵn để đường RAG không chết theo dataset. T5: tự xây bộ intent HR từ **catalog 28 intent**; `PhoATIS` chỉ là baseline ngoài domain | **NCKH +1.0**, một phần **cài đặt 3.5** (F4), **nội dung 0.5** |
| **R2** | Free tier không gánh được: Atlas M0 0.5 GB, Render sleep 15' → WS không tức thì | TB | T10 "deploy thật" và T11 "UAT trên môi trường thật" là hai tuần **dễ vỡ nhất**; demo giữa buổi có thể đứng hình | Không multi-doc transaction (ADR-004, rẻ hơn cho M0); notification **persist** + đọc lại khi mount (`§B7`); warm-up + giữ phiên + **demo sẵn** (`12-performance.md` §4.8); phương án **VPS** đã có trong đề cương — nhưng RAM chưa chứng minh: `[CẦN NGUỒN]`; checklist T-60' ở `14` §7 | **kiểm thử & triển khai 0.75**, **thái độ 0.5** (hội đồng thấy demo đứng hình) |
| **R3** | LLM hết quota giữa kỳ test → mất khả năng demo chatbot | TB | T7, T11, **và đặc biệt tuần 12** (mọi người cùng bấm demo) | PR **không** gọi provider thật (ADR-016) — đây là control **chống tự-doS**, không chỉ chống chậm; guard `maxSteps=5` + timeouts (`§B6`); **S9** fallback + bật sẵn trước buổi bảo vệ; mock provider luôn chạy được offline; theo dõi quota mỗi sáng từ T10 | **cài đặt 3.5** (F3), **phong cách slide 0.5** |
| **R4** | Chạy song song 7 chức năng + 5 mục bổ sung với 3 người / 12 tuần | **Cao** | T5–T9 là **nút cổ chai**: hai người (Hòa, Hoàng) cùng bị kéo vào cả F lẫn S | Luật `RP §12` đã là lịch: **không S nào được code trước khi sàn khép lại ở hết T8** (trừ S5/S8/S11/S13/S14 — tài liệu + hạ tầng); **đóng băng T11**; `00-vision-scope.md` §4 cắt UF-02/03/07/08 ra `backlog-parked.md`; RACI §2 ở trên cho mỗi vùng **một** chủ; **S nào giành thời gian F4/F5 thì S thua** (luật 3) | **cài đặt 3.5** (rủi ro lớn nhất của toàn đề tài), NCKH |
| **R5** | Định dạng báo cáo chưa có nguồn chính thức (B12 `UNRESOLVED`) | **Chắc chắn nếu không hỏi** | T12 là tuần **duy nhất** cho hình thức; nếu template đến muộn hơn T10 thì **viết lại toàn bộ** | Gửi §7.6 ở T0; **dò lại mỗi buổi từ T2**; `11-quality-testing.md` §9 mục 4 đặt mốc "trước tuần 10"; **không** lấy template khoa khác/Scribd — ghi thẳng vào docs là chưa chốt | **định dạng 0.5** + **nội dung 0.5** = **1.0đ** |
| **R6** | AI chấm điểm KPI bị cho là thiên kiến | TB | T9 sinh ra số phải giải thích được; nếu không, **buổi bảo vệ biến thành phiên phản biện F5** thay vì demo | Chu trình `self-review → manager review → calibration/approval → publish → history` (B0(!)); **AI không sinh KPI cuối** — công thức tất định (ADR-013, BR-07); **S12** bias probe; **S13** counter-weight + ceiling; `override_kpi` **bắt buộc lý do**, `changedBy`, `changedAt`, log bất biến (BR-09); giải thích **không** bằng attention (`§B14`) | **cài đặt 3.5** (F5), **nội dung 0.5**, phần "chất khóa luận" của NCKH |

### 7.1 Ba đường dự phòng đã được chọn trước, để không phải quyết định trong hoảng loạn

| Nếu | Thì | Đã ghi ở |
|---|---|---|
| §7.2/§7.3 vẫn chưa trả lời ở **hết tuần 5** | F4 được đo bằng **bộ intent HR tự xây từ catalog 28 intent** + protocol công khai, và metric lấy theo hướng `P@1/@3/@5, Recall@5, MRR` (hướng `§B5` đã chốt), kèm **một dòng ghi rõ trong báo cáo** rằng chỉ tiêu F1 đang chờ GVHD | `09-ai-evaluation.md`, `11-quality-testing.md` §9 |
| T8 (sàn khép lại) **trễ** | Cắt **toàn bộ** mục S ngoài S14/S8/S13 (ba cái gần như miễn phí vì là hạ tầng + tài liệu), giữ F1–F7. Không "làm bớt F" để làm S — ngược với luật 3 | `RP §12` luật 1, 3; `backlog-parked.md` |
| Render/VPS sập trong buổi bảo vệ | Chuyển sang **bản ghi hình + screenshot có chú thích ngày/commit**, nói rõ đó là phiên đã warm, rồi tiếp tục bằng môi trường local. Không đổ lỗi free tier mà không nói trước | `14-devops-deployment.md` §7, `12-performance.md` §4.8 |

### 7.2 Nhịp phát hiện sớm

| Chu kỳ | Việc | Ai |
|---|---|---|
| mỗi ngày | `main` xanh? đỏ quá 4 giờ ⇒ hoặc revert (`revert:`), hoặc dừng tính năng mới (defect **S1** theo `11` §8.2) | người vừa merge |
| mỗi tuần | gặp GVHD **≥ 1 lần** (ràng buộc đề cương); rà **danh sách 10 câu §7**, đánh dấu câu quá hạn | Hoàng |
| mỗi tuần | đối chiếu "tuần này có đúng dòng **N** ở §3 không"; **nợ thì ghi nợ vào file, không âm thầm dời lịch** | chủ vùng |
| mỗi 2 tuần | đếm mục S đã code mà **chưa** được duyệt (`RP §12` luật 4) → mục thừa cắt ngay | Hòa |
| ở T5, T8, T10 | kiểm ba mốc sàn: baseline eval tồn tại chưa / F1–F7 khép vòng chưa / deploy thật chạy chưa | cả ba |

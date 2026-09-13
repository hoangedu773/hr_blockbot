# 17 — Innovation playbook (các mục nhóm tự bổ sung)

Không phải danh sách "tính năng cho vui". Mỗi mục S ở đây phải qua **3 cửa** trước khi được code:

1. ánh xạ về một **user flow UF-xx** có thật, đã đối chiếu với sản phẩm HRM trên thị trường (`NOTES-01` §B0);
2. tạo ra **số đo được**, không phải màn trình diễn;
3. không cướp thời gian của F4/F5 — hai chức năng AI mà đề cương chấm nặng nhất về chất lượng.

Nguồn: `research/NOTES-01.md` (vòng research 1, 13/09/2026) + `research/RESEARCH-PLAN.md` §9/§10/§12 +
`18-user-flows.md`. Luật phạm vi ở `00-vision-scope.md` §4.

> **Trạng thái phê duyệt:** 5 mục chính vẫn **chờ GVHD duyệt** (`RESEARCH-PLAN` §7 câu 8).
> Bốn mục nhóm (S5/S8/S11/S13) không cần duyệt riêng vì chúng là tài liệu + kỷ luật, không phải nghiệp vụ mới.
> Mục nào chưa được duyệt mà đã code là vi phạm luật §12.4.

---

## 1. Năm mục chính — thứ tự đã đảo sau research

Nhóm chốt thứ tự `S14 → S3 → S2 → S1 → S6` (`NOTES-01` phần kết luận): **khoá phần thực nghiệm trước,
tính năng agentic làm sau.** Lý do rất thực dụng — S6 mà làm trước thì khi quota LLM cạn, không còn gì để báo cáo;
ngược lại, có bảng số rồi thì mất S6 vẫn là một khóa luận đủ.

### S14 — Reproducibility kit

| | |
|---|---|
| **Bản chất** | `make demo` dựng lại toàn bộ: seed dữ liệu giả lập tiếng Việt có **khoá cố định** + tạo DB + chạy eval in ra đúng bảng số đã công bố. Dockerfile cho `ai-service`. |
| **Flow** | phục vụ mọi flow có số đo: UF-04 (matching), UF-05, UF-06 (KPI) |
| **Vì sao là nhu cầu thật** | Không tái lập được thì con số là **tuyên bố**, không phải kết quả. R1 trong `00-vision-scope.md` (không có dataset HR chuẩn) chỉ đối phó được bằng cách tự xây dữ liệu có khoá. |
| **Số phải nộp** | hash của bộ seed; thời gian dựng; bảng eval in ra giống 100% so với báo cáo |
| **Gate CI** | "Dữ liệu tái lập" trong `02-architecture.md` §9 — **chưa bật**, chờ `make demo` tồn tại |
| **Effort / rủi ro** | M · Không |
| **Đi trước** | S3 và S2 đều cần nó ⇒ về lịch, S14 là mục **đầu tiên** |

### S3 — Benchmark 4 phương án embedding

| | |
|---|---|
| **Bản chất** | So trên **cùng một tập test**: TF-IDF/BM25 · PhoBERT mean-pooling · multilingual-e5-small · paraphrase-multilingual-MiniLM-L12-v2. Mỗi hàng 4 cột: P@1/@3/@5 + MRR, độ trễ, RAM, giấy phép. |
| **Vì sao không phải "chơi sang"** | Đề cương **bắt** PhoBERT nhưng không bắt **chứng minh** nó là lựa chọn đúng. Không có baseline rẻ (TF-IDF) thì không nói được PhoBERT mua lại gì. |
| **Số phải nộp** | bảng so sánh + cách chia train/dev/test + seed cố định; metric theo `09-ai-evaluation.md` §2 |
| **Ràng buộc đã bị bác** | không dùng F1 đơn độc cho ranking (`NOTES-01` §B5) — metric ranking là P@K/MRR; F1 chỉ dùng cho bài toán nhị phân phụ |
| **Gate CI** | "Chất lượng mô hình" (`pytest -m eval`, không tụt quá 2 điểm) — **chưa bật**, chờ baseline |
| **Effort / rủi ro** | L · Thấp |
| **Cửa NCKH** | đây là khung thực nghiệm của bài báo cấp Khoa; không có S3 thì không có bài báo |

### S2 — Calibration + abstention

| | |
|---|---|
| **Bản chất** | cosine 0.82 **không** nghĩa 82% xác suất đúng (`NOTES-01` §B13). Pipeline: điểm thô → nhãn tập validation → Platt/logistic calibration → xác suất ước lượng → ngưỡng → *recommend* hoặc **abstain (hỏi lại)**. |
| **Flow** | UF-04 bước "AI confidence thấp → hỏi thêm"; intent "hỏi thêm khi AI không chắc" |
| **Vì sao là nghiệp vụ, không phải học thuật** | Giao nhầm việc cho người thiếu kỹ năng là **hỏng quy trình**, không chỉ hỏng model. Abstention là cách duy nhất để hệ thống chịu nói "tôi không chắc". |
| **Số phải nộp** | reliability diagram, Brier, ECE, **coverage** và **accepted precision**. Ví dụ objective: "accepted precision ≥ 90% ⇒ đo coverage" (các con số trong `NOTES-01` là minh hoạ format, **không phải kết quả**) |
| **Gate CI** | không có gate riêng — nằm trong eval harness của S3 |
| **Effort / rủi ro** | M · Thấp |

### S1 — Explainable matching

| | |
|---|---|
| **Bản chất** | Card gợi ý cho thấy **kỹ năng nào đóng góp bao nhiêu** + workload penalty. Phương pháp: **skill-to-skill cosine + leave-one-out** (`NOTES-01` §B14). |
| **Cấm rõ ràng** | Không được giải thích bằng "attention của PhoBERT cao nên kỹ năng này quan trọng" — attention không phải lời giải thích. Không dùng Integrated Gradients (nặng, khó giải thích lại). |
| **Flow** | UF-04 bước "AI ranking → **giải thích** → quản lý chọn → xác nhận"; tool `explain_candidate_match` |
| **Vì sao thật sự cần** | Người duyệt cần lý do để **tin hoặc bác** một gợi ý. Không có breakdown thì quyết định của quản lý chỉ là nhấn nút. |
| **Số phải nộp** | đóng góp từng kỹ năng phải **cộng ra** điểm similarity trước khi trừ workload (độ khớp cộng tính); sai số cho phép |
| **Effort / rủi ro** | M · Thấp |
| **Ghi chú format** | Ví dụ card trong `NOTES-01` §B14 (React +0.24 …) là **minh hoạ định dạng**, nguồn ghi rõ "không phải kết quả model". Không được chép vào báo cáo như số đo. |

### S6 — Agentic standup + daily digest

| | |
|---|---|
| **Bản chất** | Chatbot **tự khởi xướng**: job định hỏi tiến độ từng nhân viên, bóc rủi ro trễ từ chính câu trả lời, gom thành **1 bản digest/ngày** cho quản lý. |
| **Flow** | UF-09 (nhắc hạn & digest) + matrix thông báo 9 dòng trong `18-user-flows.md` |
| **Hạ tầng** | **Agenda** chạy trên Mongo (ADR-011) — **không** Redis/BullMQ. Job phải idempotent vì có retry. |
| **Rủi ro thiết kế** | làm ẩu thành **spam**: mỗi notification có khoá chống trùng, đúng tần suất matrix; nhân viên nghỉ phép thì sao — nguồn không trả lời, để mở |
| **Số phải nộp** | tỷ lệ câu trả lời thu được; số notification bị chặn bởi khoá chống trùng; thời gian quản lý tiết kiệm so với hỏi tay (**chưa đo — không bịa**) |
| **Gate CI** | "WS contract" (9 event) — **chưa bật**, chờ OpenAPI sinh từ Zod |
| **Effort / rủi ro** | L · Trung bình |
| **Vị trí lịch** | **cuối cùng** trong 5 mục — cố ý, để phần khoa học không bị cướp thời gian |

---

## 2. Bốn mục nền — làm bất kể, không cần duyệt riêng

Tổng chi phí < 3 buổi, không mục nào rủi ro, và mỗi mục đã có bằng chứng ngành trong `NOTES-01`:

| # | Mục | Bằng chứng ngành | Ràng buộc nào ép phải làm |
|---|---|---|---|
| **S5** | Datasheet + Model Card cho từng mô hình (nguồn dữ liệu, giới hạn, thiên kiến, cách eval) | — (thông lệ FAccT) | `NOTES-01` §B5 licence PhoATIS hạn chế nghiên cứu/giáo dục + mọi con số B1/B5 **đang thiếu URL** ⇒ bắt buộc phải khai giấy phép và giới hạn ở đâu đó |
| **S8** | Confirm-before-write: tool đọc tự chạy, tool ghi bắt buộc xác nhận | **Oracle HCM** dùng bước xác nhận/approval khi AI thay đổi goal (`NOTES-01` §B0) | §B6 guard: "confirm write operations"; 5 tool ghi trong catalog đều đánh dấu `(confirm)` |
| **S11** | Command palette `Ctrl/Cmd+K` trên dashboard nền tối | — | `10-ui-ux-spec.md`: Admin thao tác danh mục đề tài/nhân viên rất nhiều lần mỗi ngày |
| **S13** | Counter-weight + ceiling: điểm tín hiệu ngữ nghĩa bị **trần** bởi tỷ lệ hoàn thành thật; mọi override kèm lý do, ghi log bất biến | MISA/Lattice có chu kỳ đánh giá + hiệu chỉnh (`NOTES-01` §B0 — **chưa có URL**) | ADR-013: KPI cuối do công thức tất định, AI chỉ gợi ý thành phần ⇒ S13 là chỗ đặt trần trong công thức đó |

S12 (bias probe) đi kèm S13 và S3: một lần chạy eval sinh ra cả hai số.

---

## 3. Không làm ở vòng này

| # | Mục | Vì sao không | Điều kiện mở lại |
|---|---|---|---|
| **S4** | Vòng phản hồi Đồng ý/Từ chối → hiệu chỉnh reranker | Cần **dữ liệu sử dụng thật**; 12 tuần demo không tích luỹ đủ tín hiệu để nói "P@5 tăng". Ghi `feedback_events` sẵn trong model dữ liệu nhưng **không hứa kết quả học được** | Có người dùng thật ≥ vài tuần; `backlog-parked.md` PARK-08 |
| **S7** | Điểm rủi ro trễ + anomaly trên chuỗi KPI | Dùng chung hạ tầng với S6 → chỉ làm khi S6 chạy ổn; chưa có trọng số đo được cho "rủi ro trễ" | S6 xong + còn quỹ tuần 9–10 |
| **S9** | Graceful degradation khi hết quota LLM | **Được nâng lên thành yêu cầu kiến trúc**, không còn là "sáng tạo": mock provider giả lập lỗi quota là điều kiện để test được (§B10) ⇒ ghi ở `13-security.md` + `12-performance.md` | đã nằm trong thiết kế, không tính là stretch |
| **S10** | Hỏi số liệu bằng ngôn ngữ tự nhiên | Rủi ro **Cao** về an toàn dữ liệu; ADR-014 đã khoá bằng whitelist template, nhưng vẫn là effort L | baseline xong trước tuần 8 **và** GVHD duyệt; `backlog-parked.md` PARK-05 |

**S9 đã đổi nhãn** so với `RESEARCH-PLAN.md` §9: nó không còn là điểm cộng, nó là điều kiện để CI chạy được
khi provider chết. Đừng ghi vào báo cáo như một tính năng "sáng tạo".

---

## 4. Ánh xạ S → docs → gate

Không mục nào được coi là xong nếu cột "Gate" trống và chưa có lệnh.

| Mục | File docs nhận kết quả | Gate CI tương ứng | Trạng thái gate |
|---|---|---|---|
| S14 | `14-devops-deployment.md`, `11-quality-testing.md` | Dữ liệu tái lập (`make demo` + seed hash) | chưa bật |
| S3 | `09-ai-evaluation.md`, `08-algorithms.md` | `pytest -m eval` | chưa bật — chờ baseline |
| S2 | `09-ai-evaluation.md` §6, `08-algorithms.md` §5 | nằm trong eval harness | chưa bật |
| S1 | `08-algorithms.md` §4, `10-ui-ux-spec.md` | test cộng tính của breakdown đóng góp | chưa viết |
| S6 | `18-user-flows.md` UF-09, `06-api-spec.md` | WS contract (9 event) | chưa bật |
| S5 | `09-ai-evaluation.md` §8 | không có gate — đây là tài liệu | n/a |
| S8 | `07-auth-rbac.md` §7, `13-security.md` | test: tool ghi không có `confirmation` ⇒ **phải fail** | viết cùng `modules/chatbot` |
| S11 | `10-ui-ux-spec.md` | không có gate | n/a |
| S12 | `09-ai-evaluation.md` §7 | không chặn merge — báo cáo theo kỳ | n/a |
| S13 | `04-domain-model.md` §6, `05-data-model.md` `evaluations` | test: `finalScore` không vượt `ceiling` khi completion thấp | viết cùng `modules/hr` |

---

## 5. Kỷ luật chống loãng

Trích luật §12 của `RESEARCH-PLAN.md`, áp vào danh sách trên:

1. **Sàn trước trần sau.** F1–F7 + auth + deploy thật chạy được **trước tuần 9**. Không mục S nào được code
   trước mốc đó, trừ S5/S8/S11/S13/S14 (tài liệu + hạ tầng).
2. **Mỗi S chiếu vào một UF-xx.** Mục không chiếu được → `backlog-parked.md`, không giữ trong plan.
3. **Không S nào làm mờ F4/F5.** Hai chức năng AI là chỗ "chất khóa luận" — S nào giành thời gian của chúng thì S thua.
4. **Số chưa đo = `TBD`.** Không chép ví dụ minh hoạ format vào báo cáo như thể là kết quả (S1, S2 đều có bẫy này).
5. **Đóng băng tính năng tuần 11.** Sau đó chỉ: sửa bug, tối ưu, viết báo cáo.
6. **Mục S đã code mà chưa được duyệt**: đếm ở mỗi mốc 2 tuần (`16-project-plan.md` §7.2) → thừa thì cắt ngay.

## 6. Việc còn treo

| # | Việc | Ai |
|---|---|---|
| 1 | GVHD duyệt 5 mục chính (§7 câu 8 của RESEARCH-PLAN) — và cho biết thầy nghiêng hướng **thực nghiệm** (S2/S3/S12) hay **agentic** (S6/S10) | nhóm |
| 2 | URL nguồn cho Personio / MISA / Lattice / Oracle HCM — nếu không có, các câu "sản phẩm X làm vậy" phải hạ xuống thành *quan sát chưa kiểm chứng* | nhóm |
| 3 | Chốt metric của F4 (câu §7.2) trước khi viết baseline S3 | GVHD + nhóm |
| 4 | Dữ liệu nhân sự **thật hay giả lập** — quyết định S14 và UAT | GVHD |
| 5 | B12 template báo cáo vẫn `UNRESOLVED` | GVHD/Khoa |

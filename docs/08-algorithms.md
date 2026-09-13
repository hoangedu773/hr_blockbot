# 08 — Thuật toán (Algorithms)

Khóa luận **KLCN133** — *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*. Nhóm 3 người, 12 tuần.

File này định nghĩa **thuật toán** cho ba chỗ AI của hệ thống: F4 (gợi ý phân công theo kỹ năng),
F3 (Agent Loop + hỏi đáp chính sách) và F5 (nhận xét → KPI). Nó trả lời câu "chạy công thức gì, theo
trình tự nào, lỗi thì xử lý ra sao". Chất lượng của những thuật toán này **được đo**, và cách đo nằm ở
[`09-ai-evaluation.md`](09-ai-evaluation.md) — file đó là chỗ duy nhất công bố số.

## 0. Nguồn và ký hiệu

| Ký hiệu | Nghĩa |
|---|---|
| `NOTES-01 §B<n>` | Quyết định / số liệu lấy từ batch B<n> của `docs/research/NOTES-01.md` |
| `RP §<n>` | Ràng buộc hoặc mục của `docs/research/RESEARCH-PLAN.md` |
| `ADR-<n>` | `docs/03-decision-records/` |
| `BR-<n>` | Quy tắc nghiệp vụ, `docs/04-domain-model.md` §5 |
| `// SUY DIỄN — cần xác nhận` | Chi tiết người viết thêm để thuật toán chạy được; **nguồn nghiên cứu không nêu** |
| `[CẦN NGUỒN]` | Cần URL hoặc văn bản GVHD trước khi chi tiết này được chép vào báo cáo |
| `TBD — chưa đo` | Chưa có phép đo → **không** thay bằng số đoán |
| `TBD` | Nguồn không đưa con số / quyết định → để trống |

Ba luật cứng chi phối toàn bộ file:

1. **Không có kết quả thực nghiệm ở đây.** Mọi số trong ví dụ là *minh hoạ format* và phải được gắn nhãn
   như vậy tại chỗ (`NOTES-01 §B14`: "số chỉ minh hoạ format, không phải kết quả model").
2. **Cosine không phải xác suất** (BR-10, `NOTES-01 §B13`). Điểm thô không được diễn giải thành "% đúng".
3. **LLM không sinh điểm KPI cuối** (BR-07, ADR-013, `NOTES-01 §B6`).

Phạm vi thuật toán bị khoá bởi ba quyết định hạ tầng đã chốt: lõi AI chạy trong `apps/ai-service`
(Python/FastAPI, ADR-003); F4 dùng vector/cosine **trong Python**, không qua Atlas Vector Search
(ADR-005, `NOTES-01 §B1`); chỉ có **một (01)** Atlas Vector index, dành cho Policy RAG (ADR-005).

---

## 1. Bài toán F4 phát biểu hình thức

### 1.1 Dữ liệu vào / ra

```text
Input
  employee e   : skills(e)   = [s_1 .. s_m]        (employees.skills, 05 §3.2)
  project  p   : requiredSkills(p) = [r_1 .. r_n]  (projects.requiredSkills, 05 §3.4)
                 description(p)    : string        (projects.description, 05 §3.4)
                 dueDate, status                   (ràng buộc lịch/ràng buộc trạng thái)
  workload(e)  : số đề tài đang mở của e trong kỳ   // SUY DIỄN — xem 3.2

Output
  top_k(p)     : dãy giảm dần theo score của ứng viên đủ điều kiện
  explanation  : với mỗi ứng viên được trả, phân rã đóng góp từng kỹ năng + workload penalty (BR-11)
  decision     : {recommend | abstain}             — abstain khi sau calibration dưới ngưỡng (S2)
```

Định nghĩa hình thức của hàm xếp hạng:

```text
score(e, p) = w_sim · sim(e, p) − w_load · loadPenalty(e)      (công thức chi tiết: mục 3)

với  sim : (E × P) → [0, 1]  là độ tương đồng ngữ nghĩa sau chuẩn hoá
và   top_k(p) = k phần tử có score cao nhất của  C(p) = { e : e hợp lệ để xét }
```

`C(p)` (tập ứng viên đủ điều kiện) là một **vị từ cứng**, áp trước khi xếp hạng: nhân viên đang `active`,
đúng scope phòng ban mà RBAC cho phép đọc (BR-16), và `projects.status ∈ {DRAFT, ASSIGNED}` — vì UF-04
chỉ chạy trên đề tài "cần người" (`18-user-flows.md` UF-04 precondition). Tập này **không** do model quyết
định; model chỉ thứ tự hoá phần còn lại.

### 1.2 Vì đây là ranking, không phải classification

Đề cương mô tả F4 là *gợi ý phân công* (`RP §1`), nghiệp vụ là "tìm top 5 nhân viên" và "tìm người phù hợp
cho đề tài" (intent #13/#15 trong catalog 28 intent, `18-user-flows.md`; bản gốc `NOTES-01 §B0`). Ba đặc
điểm dưới đây làm nó **không phải** một bài phân loại:

| Đặc điểm | Classification | F4 thực tế |
|---|---|---|
| Không gian quyết định | một nhãn trên 1 cặp | **thứ tự** trên toàn tập ứng viên đủ điều kiện `C(p)` |
| Số lượng "đúng" | 1 | nhiều ứng viên cùng chấp nhận được, và quản lý chọn 1 |
| Chi phí lỗi | sai/nhãn | **giao nhầm việc** (đưa người thiếu kỹ năng vào đề tài) — cái giá nằm ở vị trí cao của danh sách |
| Điều kiện biên | tập nhãn đóng | `k` bị chặn bởi số ứng viên đủ điều kiện; nhân viên mới chưa có kỹ năng trong hồ sơ |
| Chỉ tiêu đề cương | F1 ≥ 85% đo tự nhiên | F1 **không** đo được chất lượng thứ tự |

Hệ quả phương pháp luận — đây chính là lý do metric phải hỏi lại GVHD (`NOTES-01 §B5`: "Đây là câu phải
chốt với GVHD"; `RP §7` câu 2): `RP §1` bắt **F1 ≥ 85%**, nhưng `NOTES-01 §B5` bác việc dùng F1 đơn độc để
đánh ranking Top-K và chốt bộ metric `Precision@1/@3/@5, Recall@5, MRR, nDCG@5 (optional), latency, RAM`.

Cách duy nhất dung hoà mà **không đổi đầu bài** là tách bài toán thành hai, như `NOTES-01 §B5` đề xuất:

```text
(A) phân loại nhị phân  (employee, project) → phù hợp / không phù hợp
      → Precision / Recall / F1 / Accuracy   ← chỗ chỉ tiêu "F1 ≥ 85%" có nghĩa
(B) xếp hạng Top-K      project → ordering của C(p)
      → P@1/@3/@5, Recall@5, MRR, nDCG@5     ← chỗ chất lượng nghiệp vụ thật nằm ở đó
```

(A) và (B) dùng **chung** pipeline embedding ở mục 2 nhưng khác nhau ở ngưỡng và ở nhãn. Định nghĩa cụ thể,
công thức và cách chia dữ liệu của (A)/(B) thuộc `09-ai-evaluation.md` §2; file này chỉ cam kết thuật toán
sinh ra được cả hai loại dự đoán: `score` liên tục (để xếp hạng) và `label` nhị phân sau threshold
`τ_match` (để phân loại) — `τ_match`: `TBD`.

---

## 2. Pipeline nhúng (embedding)

### 2.1 Tiền xử lý tiếng Việt — bước dễ sai nhất của toàn bộ F4

`NOTES-01 §B5` chốt một câu có tính quyết định về mặt triển khai:

> PhoBERT-base ~135M params, PhoBERT-large ~370M. **PhoBERT yêu cầu input tiếng Việt đã được
> word-segmented.**

Nghiêm trọng ở chỗ: sai ở bước này **không ném exception** — không lỗi, không cảnh báo, chỉ cho ra vector vô
nghĩa, và điểm matching vẫn trông rất "hợp lý" trên demo. Đây là lỗi im lặng (silent failure). Triệu chứng
điển hình là mô hình "chạy được" nhưng mọi cặp kỹ năng đều có cosine 0.8x, tức mọi kết quả eval mất nghĩa.

Pipeline bắt buộc:

```text
raw text (tiếng Việt)
  → 1. normalize     : gộp khoảng trắng, bỏ ký tự điều khiển, giữ nguyên dấu câu có nghĩa
                       (R&D / React.js / C++ không được bị phá)
  → 2. word segment  : "phát triển ứng dụng" → "phát_triển ứng_dụng" (token glue theo chuẩn PhoBERT)
  → 3. tokenize      : byte-level BPE của PhoBERT (RoBERTa-style) + token đặc biệt;
                       max length: TBD — NOTES-01 không nêu context length
  → 4. forward       : model → hidden states
  → 5. pooling       : mean-pooling over token vectors, mask padding (mục 2.3)
  → 6. L2 normalize  : để cosine = dot product
```

Ba bẫy cụ thể sau đây do nhóm rút ra từ **tính chất** của yêu cầu ở `NOTES-01 §B5` — bản thân nguồn
**không** liệt kê danh sách bẫy nào (`// SUY DIỄN — cần xác nhận`).

1. **Segment cho chuỗi kỹ năng lai.** `"ReactJS"`, `"CI/CD"`, `"Node.js"`, `"AI/ML"` là token lai
   Việt–Anh; bộ phân đoạn câu tiếng Việt có thể tách hoặc dán sai. Quyết định của nhóm: **không** segment
   các chuỗi chỉ gồm kỹ năng viết hoa/code; chỉ segment văn bản mô tả tự nhiên (`requiredSkills[*]` đi
   đường khác `description` — xem 2.2). Đây là lựa chọn của nhóm, không phải chuẩn ngành `[CẦN NGUỒN]`.
2. **Dùng nhầm pipeline của model multilingual.** `multilingual-e5-small` và MiniLM **không** cần word
   segmentation; nếu bẻ đôi câu rồi đưa vào hai model này thì điểm của chúng tụt, và bảng so sánh S3 trở
   thành so sánh "tiền xử lý" chứ không phải "model". → Mỗi hàng trong bảng S3 phải mang đúng pipeline của
   nó, và tên bước phải ghi trong bảng (RP §9 S3; chi tiết ở `09-ai-evaluation.md` §5).
3. **Thư viện phân đoạn và version chưa chốt.** `RP §3 B5` có hỏi về `undertheseanlp`; `NOTES-01 §B5`
   **không** trả lời tên thư viện segmenter nào được dùng. → công cụ segment: `TBD` `[CẦN NGUỒN]`;
   đơn vị test "word segmentation" trong `pytest` (`11-quality-testing.md` §2) phải có fixture đối chứng.

Không có bước 2 thì số liệu F4 không có giá trị, bất kể model nào. Đó là lý do khâu tiền xử lý đứng trước
cả khâu chọn model trong thứ tự công việc.

### 2.2 Hai đường vào, một hàm nhúng

```text
path A (skill-level)  : từng r_i ∈ requiredSkills(p)  ×  từng s_j ∈ skills(e)  → vector ngắn
                        dùng cho: sim trong 3.1 và phân rã giải thích ở mục 4
path B (text-level)   : requiredSkills(p) join + description(p)  → 1 vector;
                        skills(e) join  → 1 vector
                        dùng cho: candidate-level score và baseline so sánh
```

Đường A là đường **chính** vì nó mang lại tính giải thích (mục 4). Đường B rẻ hơn về số lần tính nhưng tối
đa thông tin và không phân rã được. Vì skill là chuỗi ngắn và lặp lại nhiều giữa các nhân viên, cache theo
skill-string (mục 9) làm chi phí đường A không còn là vấn đề.

### 2.3 Pseudocode: mean-pooling + L2 normalize + cosine

```python
# INPUT:  model, tokenizer, texts: list[str] đã qua word segmentation (riêng PhoBERT)
# OUTPUT: vectors: list[np.ndarray] đã chuẩn hoá đơn vị
# INVARIANT: với vector đã L2-normalize thì cosine(u, v) == dot(u, v)

def encode(model, tokenizer, texts, batch_size=BATCH_SIZE, max_len=MAX_LEN):   # 2.1: TBD
    vectors = []
    for batch in chunks(texts, batch_size):
        enc = tokenizer(batch, padding=True, truncation=True,
                        max_length=max_len, return_tensors="pt")
        with torch.no_grad():
            out = model(**enc)                      # out.last_hidden_state: (B, T, H)
        hidden = out.last_hidden_state
        mask = enc["attention_mask"].unsqueeze(-1)  # (B, T, 1) — 1 token thật, 0 padding
        summed = (hidden * mask).sum(dim=1)         # loại padding khỏi trung bình
        counts = mask.sum(dim=1).clamp(min=1)       # tránh chia 0 với chuỗi rỗng
        pooled = summed / counts                    # mean-pooling  -> (B, H)
        vectors.extend(l2_normalize(pooled))
    return vectors

def l2_normalize(x, eps=1e-12):
    return x / (np.linalg.norm(x, axis=-1, keepdims=True) + eps)

def cosine(u, v):                                  # u, v đã L2 normalize
    return float(np.dot(u, v))                     # nằm trong [-1, 1]

def sim_skill(a, b):                               # semantic similarity của 2 kỹ năng
    s = cosine(emb(a), emb(b))
    return max(0.0, min(1.0, s))                   # clip về [0,1] vì score nghiệp vụ không âm
```

Ghi chú triển khai, đều là quyết định của nhóm chứ không phải của nguồn:

- **Mean-pooling chứ không phải CLS.** `RP §3 B5` nêu "mean-pooling vs CLS" như một lựa chọn phải research;
  `NOTES-01 §B5` chốt tên hàng là "PhoBERT **mean pooling**" → theo đó. CLS có thể là biến thể so sánh sau,
  không phải baseline. `// SUY DIỄN — cần xác nhận`
- **Không chuẩn hoá lại điểm theo từng batch** (z-score/softmax) — làm vậy sẽ phá tính so sánh được giữa
  các truy vấn và phá luôn phép đo calibration ở mục 3.4. `// SUY DIỄN`
- **Dimension** của vector: `NOTES-01 §B5` chỉ cho `multilingual-e5-small` = 384 và MiniLM = 384; PhoBERT
  base/large **không** được nêu số chiều trong nguồn → `TBD` `[CẦN NGUỒN]` (không được đoán từ tài liệu
  ngoài vì mọi số phải truy vết được).
- **Padding mask là bắt buộc.** Quên mask không gây lỗi; nó làm vector của chuỗi ngắn bị lệch bởi các token
  `PAD` — đúng loại lỗi im lặng ở 2.1.

### 2.4 Bốn phương án so sánh (S3)

Bốn hàng dưới đây lấy nguyên từ `NOTES-01 §B5` (ký hiệu `(!)` trong nguồn = research bác giả định plan gốc:
thêm baseline rẻ). Cột "có word segmentation?" phản ánh ràng buộc ở 2.1.

| # | Phương án | Thông số đã xác minh ở `NOTES-01 §B5` | Vai trò | Word segmentation? |
|---|---|---|---|---|
| M1 | **TF-IDF / BM25** | baseline rẻ (không phải neural, không embedding) | sàn so sánh: nếu model 135M params không thắng được nó thì phần "ngữ nghĩa" không có bằng chứng | không |
| M2 | **PhoBERT mean pooling** | `PhoBERT-base ~135M params`, `PhoBERT-large ~370M`; bản gốc công bố MIT nhưng **phải kiểm tra đúng checkpoint trước khi ghi licence** | **bắt buộc theo đề cương** (`RP §1`: F4 dùng PhoBERT) | **CÓ — yêu cầu cứng** |
| M3 | **multilingual-e5-small** | ~118M params, **384 dims**, MIT, có bản ONNX/int8 nhỏ hơn đáng kể | sentence-embedding baseline mạnh | không |
| M4 | **paraphrase-multilingual-MiniLM-L12-v2** | vector **384 chiều**, ~50 ngôn ngữ | baseline multilingual | không |

`GloVe-25Vn` từng được `RP §9 S3` nêu như một cột so sánh nhưng `NOTES-01 §B5` **không** xác minh được
kích thước/licence → **không** đưa vào bảng thực nghiệm cho tới khi có nguồn `[CẦN NGUỒN]`.

Kết quả của cả bốn hàng (chất lượng/độ trễ/RAM) là `TBD — chưa đo`; khung bảng nằm ở
`09-ai-evaluation.md` §4–§5.

---

## 3. Công thức điểm gợi ý

### 3.1 Thành phần tương đồng

Phân rã theo yêu cầu của đề tài (đây cũng là thứ card giải thích ở mục 4 hiển thị):

```text
sim(e, p) = Σ_{r ∈ requiredSkills(p)} α_r · max_{s ∈ skills(e)} sim_skill(e, s↔r)
            ────────────────────────────────────────────────────────────────────
                              n = |requiredSkills(p)|

α_r ≥ 0,  Σ α_r = 1        →  α_r: TBD (chưa có nguồn; xem 10)
```

- `max` (không phải `mean`) vì kỹ năng của người thường **thừa** so với yêu cầu: `"React"`, `"Next.js"`,
  `"React Native"` cùng khớp một yêu cầu `"React"` và trung bình cộng sẽ phạt người có nhiều kỹ năng lân cận.
- Yêu cầu **không** khớp với kỹ năng nào (max ≈ 0) kéo `sim` xuống — đó là tín hiệu nghiệp vụ đúng, không
  phải lỗi.
- Khi `requiredSkills(p)` rỗng: **không** tính điểm ngữ nghĩa, trả `abstain` + hỏi lại (mục 5). Không được
  tự chế `description` → `requiredSkills` bằng LLM rồi đưa vào ranking mà không có bước người duyệt `// SUY DIỄN`.

### 3.2 Workload penalty

```text
loadPenalty(e) = clamp( (activeCount(e) − freeCapacity) / capacitySpan , 0, 1 )
score(e, p)    = sim(e, p) − w_load · loadPenalty(e)
```

Trạng thái nguồn của ba đại lượng:

| Đại lượng | Nguồn nói gì | Trạng thái |
|---|---|---|
| "tie-break bằng workload hiện tại" | `RP §3 B5` chốt đúng vai trò này: **tie-break**, không phải thành phần chính | đã chốt |
| `activeCount(e)` | `projects` có index `(assigneeIds, status)` (`NOTES-01 §B4`) ⇒ đếm được đề tài đang mở | **cách đếm là `// SUY DIỄN`**: gồm những status nào, có theo `dueDate` không |
| `freeCapacity`, `capacitySpan`, `w_load` | `NOTES-01` **không** có; intent "kiểm tra workload" cũng **chưa có tool** (`18-user-flows.md` #17) | `TBD` `[CẦN NGUỒN]` |

Vì `RP §3 B5` gọi workload là **tie-break**, cách đúng với nguồn nhất là: dùng `w_load · loadPenalty` với
trọng số nhỏ (để thẻ vẫn hiển thị được `-0.08` như format ở `NOTES-01 §B14`) và **phân hạng bằng
loadPenalty khi `|score(a) − score(b)| < ε`** thay vì để nó tự đẩy thứ hạng. `ε`: `TBD`.
`// SUY DIỄN — cần xác nhận`

### 3.3 Tie-break và tính tất định của thứ tự

```text
def order_by_score(cands):
    # thứ tự sắp xếp phải KHÔNG phụ thuộc thứ tự đọc DB
    return sorted(
        cands,
        key = lambda e: ( round(score(e, p), 6),      # 1. điểm, làm tròn về 6 chữ số thập phân
                          -activeCount(e),            # 2. người khoẻ hơn thắng khi điểm bằng nhau
                          e.employeeCode ),           # 3. định danh nghiệp vụ, UNIQUE (NOTES-01 §B4)
        reverse = True)
```

Khoá sắp xếp cuối cùng phải là một field **duy nhất** (`employeeCode` UNIQUE theo `NOTES-01 §B4`) — nếu
không, hai lần chạy trên cùng dữ liệu cho hai thứ tự khác nhau và `09-ai-evaluation.md` không so sánh được
nữa. Đây là điều kiện để P@K/MRR có nghĩa.

### 3.4 Threshold, và vì sao bắt buộc phải có

Không có ngưỡng thì hệ thống **luôn** trả về đúng `k` người, kể cả khi không có ai phù hợp: với
`|C(p)| ≥ k` thì danh sách luôn đầy, và quản lý không phân biệt được "top 5 tốt nhất trong kho" với "5
người tệ nhất mà vẫn phải đưa ra". Ngưỡng biến danh sách thành một **tuyên bố có thể sai**.

```text
τ_abstain : ngưỡng cắt hành vi  → dưới ngưỡng = không gợi ý, hỏi lại (mục 5, S2)
τ_match   : ngưỡng cắt nhãn     → phục vụ bài toán phân loại (A) ở 1.2
```

**Hai ngưỡng này được cắt trên điểm đã hiệu chuẩn, không trên cosine thô.** `NOTES-01 §B13`: "Cosine
similarity 0.82 KHÔNG có nghĩa 82% xác suất đúng", và pipeline:

```text
raw cosine score → validation labels → Platt / Logistic calibration
  → estimated probability → threshold
        ├─ high confidence → recommend
        └─ low confidence  → abstain / ask clarification
```

Ánh xạ confidence, phát biểu cho đúng:

```text
p_hat(e, p) = σ(a · score(e, p) + b)          # Platt scaling — 2 tham số a, b

a, b  = fit bằng logistic regression trên TẬP VALIDATION (không phải tập test)
p_hat ∈ [0,1] mới là "xác suất gợi ý đúng" và mới được đưa vào UI
τ_abstain, τ_match chọn theo target precision, đo bằng ECE/Brier/reliability
```

| Đại lượng | Giá trị |
|---|---|
| `a`, `b` | `TBD — chưa đo` (cần nhãn + tập validation, xem `09-ai-evaluation.md` §6) |
| `τ_abstain`, `τ_match` | `TBD` — chọn theo objective "accepted precision ≥ X", X đang chờ GVHD |
| Tập validation để fit | tách riêng train/dev/test — `09-ai-evaluation.md` §3 |
| Cách hiển thị trên card | chỉ hiển thị `p_hat` đã hiệu chuẩn; **cấm** hiển thị cosine thô như một xác suất (BR-10) |

Nếu `p_hat` chưa khả dụng (chưa có nhãn để fit), hành vi đúng là **tắt hẳn chế độ "recommend"**, chỉ trả
danh sách kèm nhãn "chưa hiệu chuẩn" và bắt Admin chọn tay — không phải hiển thị cosine như xác suất.
`// SUY DIỄN — cần xác nhận`

---

## 4. Explainability (S1)

### 4.1 Hai phương pháp được chọn, và một phương pháp bị cấm

`NOTES-01 §B14` bác rõ ràng: **không** giải thích bằng "attention của PhoBERT cao nên skill này quan trọng"
— attention không tự động đồng nghĩa explanation. Bảng đánh giá của nguồn:

| Cách | Dễ làm | CPU | Dễ giải thích |
|---|---|---|---|
| Skill-to-skill cosine | 5/5 | 5/5 | 5/5 |
| Leave-one-skill-out | 4/5 | 3/5 | 5/5 |
| Integrated Gradients | 2/5 | 2/5 | 3/5 |

→ **chọn skill-to-skill cosine + leave-one-out** (BR-11). Hai phương pháp này bổ nhau: cái thứ nhất trả lời
"điểm đến từ đâu", cái thứ hai trả lời "bỏ kỹ năng này đi thì mất bao nhiêu" — câu hỏi mà người bác gợi ý
đang thực sự hỏi.

### 4.2 Pseudocode

```python
# (1) PHÂN RÃ THEO CẶP KỸ NĂNG — giải thích "tại sao khớp"
def explain_by_pairs(e, p, emb):
    contrib, unmatched = [], []
    for r in p.required_skills:
        best, best_s = None, -1.0
        for s in e.skills:
            v = cosine(emb(s), emb(r))
            if v > best_s:
                best, best_s = s, v
        if best_s < MIN_EXPLAIN_SIM:          # ngưỡng hiển thị, TBD
            unmatched.append(r)               # nói thật: không có kỹ năng nào khớp yêu cầu này
        else:
            contrib.append(SkillContrib(r, best, best_s, alpha=1.0 / len(p.required_skills)))
    return Explanation(pairs=sorted(contrib, key=lambda c: -c.weighted()),
                       unmatched=unmatched)   # weighted() = alpha * best_s — đúng số cộng vào sim(e,p)

# (2) LEAVE-ONE-SKILL-OUT — giải thích "bỏ kỹ năng này thì sao"
#     CHI PHÍ: O(|skills(e)|) lần tính lại score -> chỉ chạy cho ứng viên được bấm "vì sao",
#     KHÔNG chạy cho toàn bộ top-K trong truy vấn thường (mục 9).
def leave_one_out(e, p, emb):
    base = score(e, p, emb)
    deltas = []
    for s in e.skills:
        e_wo = e.without(s)
        deltas.append(SkillDelta(s, base - score(e_wo, p, emb)))
    return sorted(deltas, key=lambda d: -abs(d.delta))
```

Ba ràng buộc phải có trong test (`11-quality-testing.md` §4.2):

- **Cộng được phải khớp.** `Σ contrib.weighted() ≈ sim(e, p)` trước khi trừ workload; lệch quá một dung sai
  do làm tròn là bug, không phải "cách trình bày khác". `// SUY DIỄN — cần xác nhận`
- **Không có số xấu.** Nếu một kỹ năng cho delta âm (có mặt nó làm điểm giảm, do tối đa hoá trên tập vector
  khác), hiển thị delta âm và **không** giấu; giấu là mất quyền tin của card.
- **Không suy diễn nhân quả.** Card nói "đóng góp vào điểm", không nói "kỹ năng này quan trọng với đề tài".

### 4.3 Định dạng output card

Chép nguyên format của `NOTES-01 §B14`, giữ nguyên các số của nguồn vì chúng **minh hoạ format, không phải
kết quả model**:

```text
Nguyễn Văn A — Match 86%
React +0.24 · TypeScript +0.19 · Node.js +0.14 · MongoDB +0.09 · Docker +0.05
Workload penalty -0.08
```

> **Toàn bộ số trong block trên là số minh hoạ format theo `NOTES-01 §B14`, không phải kết quả model.**
> Không được chép vào báo cáo dưới dạng ví dụ chạy thật, và không được dùng làm fixture "kết quả đúng".

Quy ước hiển thị (`// SUY DIỄN — cần xác nhận`, vì nguồn chỉ cho khuôn):

| Element | Luật |
|---|---|
| `Match <n>%` | chỉ được hiển thị khi `n` là **`p_hat` đã hiệu chuẩn**; nếu chưa có calibration thì đổi nhãn thành `Score <điểm thô>` và **không** dùng dấu `%` (BR-10) |
| Dòng kỹ năng | tối đa 5 dòng theo `weighted()` giảm dần, có dấu `+`; phần còn lại ẩn sau "xem thêm" |
| `unmatched` | nếu có, hiển thị `⚠ chưa có kỹ năng khớp yêu cầu: <r>` — không được bỏ trống làm card trông "đẹp" |
| `Workload penalty` | luôn hiện, kể cả bằng `0`, để người đọc hiểu điểm đã bị trừ gì |
| `leave-one-out` | nằm ở chế độ mở rộng, dạng "nếu bỏ <skill>, điểm còn X (−Y)" — X/Y là chỗ điền số đo, **không** có giá trị mẫu ở file này |

---

## 5. Abstention & clarification (S2)

### 5.1 Khi nào hỏi lại

```text
ABSTAIN nếu:
  1. p_hat(top_1) < τ_abstain                            # sau calibration — nguồn §B13, UF-04 bước 4
  2. |C(p)| == 0                                         # không có ứng viên hợp lệ
  3. requiredSkills(p) rỗng hoặc description quá ngắn     # không đủ ngữ nghĩa để so
  4. p_hat(top_1) − p_hat(top_k) < margin_min            # trên dưới như nhau ⇒ thứ tự không có nghĩa
  5. embedding backend lỗi / model chưa warm quá timeout  # xem mục 9
```

`margin_min`, `τ_abstain`: `TBD`. Nguồn chỉ chốt nguyên tắc "điểm sau calibration dưới ngưỡng → **không
đoán**, hệ thống hỏi lại" (`18-user-flows.md` UF-04 bước 4, `NOTES-01 §B13`).

### 5.2 Câu hỏi clarification được sinh ra thế nào

Câu hỏi **không** do LLM tự chế từ toàn văn đề tài. Nó sinh ra từ chính phép phân rã ở 4.2, theo khuôn cố
định — cùng nguyên tắc "không để model tự do" mà `NOTES-01 §B15` áp dụng cho NL→data (whitelist + Zod enum):

```text
def clarify(expl, p):
    if expl.unmatched:                      # thiếu kỹ năng nào → hỏi đúng kỹ năng đó
        return f"Anh/chị đã làm {expl.unmatched[0]} chưa?"      # ví dụ nguyên văn từ RP §9 S2
    if all_low_confidence(expl):            # khớp mờ toàn bộ → hỏi độ sâu kinh nghiệm
        return f"Kinh nghiệm {expl.pairs[0].requirement} của anh/chị ở mức nào (năm / dự án thật)?"
    if len(p.required_skills) == 0:         # bản thân yêu cầu chưa rõ → hỏi lại yêu cầu
        return "Đề tài này cần những kỹ năng cụ thể nào?"
```

Hành vi bắt buộc:

- Câu hỏi **trở lại đúng một bước** trong UF-04 (`hỏi thêm → AI ranking lại`), không kết thúc phiên.
- Trả lời của người dùng được ghi nhận **làm dữ liệu đầu vào của lượt xếp hạng kế tiếp**, không tự động sửa
  `employees.skills`. Sửa hồ sơ là UF-01, có bước duyệt riêng cho field nhạy cảm (`NOTES-01 §B0`) `// SUY DIỄN`.
- abstention **không** được tính là "không có kết quả": báo cáo phải đếm riêng số câu hỏi được sinh và số
  ca được giải quyết sau khi hỏi (`09-ai-evaluation.md` §6, coverage).

### 5.3 Trạng thái nghiệp vụ tương ứng

Intent "hỏi thêm khi AI không chắc" là **#18** trong catalog 28 intent, được `18-user-flows.md` chốt là
**`— chưa có tool`**: abstention là **một bước trong agent loop** sau calibration, không phải tool, RBAC
`Admin`, không ghi dữ liệu. Vì vậy trạng thái nghiệp vụ của hệ thống **không đổi** khi abstain:

| Đối tượng | Trạng thái sau abstain |
|---|---|
| `projects.status` | giữ nguyên `DRAFT`/`ASSIGNED` — **không** có state "chờ AI", **không** có transition nào được gọi (04 §4.2, enum chỉ 5 giá trị, không `OVERDUE`, không `CANCELLED`) |
| `project_events` / `statusHistory[]` | **không** ghi gì (BR-03 append-only — không có mutation thì không có event) |
| Audit | abstain không phải mutation ⇒ không vào `audit every mutation` của BR-19; chỉ vào log hội thoại |
| `feedback_events` (S4) | không thuộc baseline; nếu bật sau này, abstain là một outcome cần ghi riêng để không tính nhầm vào precision |
| Socket.IO | `chat:accepted` → `chat:done` với payload là câu hỏi; **không** phải `chat:error` (`NOTES-01 §B7`) |

Tóm lại abstention là một **kết quả hợp lệ**, không phải lỗi — cùng nguyên tắc ADR-012 đặt cho "lỗi quota
là kết quả hợp lệ".

---

## 6. Agent Loop

### 6.1 Vòng lặp

Khung lấy từ `NOTES-01 §B6`:

```text
User → Intent/router → Agent → Tool selection → Zod validate → Permission check
  ├─ Read tool  → execute
  └─ Write tool → confirmation → execute
→ structured result → LLM response
```

Cụ thể hoá thành pseudocode (các chú thích `// SUY DIỄN` trong khối là do nhóm chốt để vòng lặp chạy được):

```python
def agent_loop(session, user_turn, user_ctx):        # user_ctx: {userId, role, departmentId}
    steps = 0
    while steps < MAX_STEPS:                          # MAX_STEPS = 5 (BR-19)
        steps += 1
        plan = llm.route(session, TOOLS)              # function calling / structured output
        if plan.is_final_answer:
            return answer(plan.text)
        tool = TOOLS.get(plan.name)
        if tool is None:                              # hallucinated tool name
            continue_or_fallback(plan, reason="unknown_tool")
        args = zod(tool.schema, plan.args)            # BR-19: validate MỌI argument
        if args.invalid:
            continue_or_fallback(plan, reason="invalid_args")
        if not rbac.allows(user_ctx.role, tool):      # BR-06: check ở MỖI tool call
            return deny(reason="permission_denied")   #    không suy ra từ router
        if tool.kind == "write":                      # BR-05: S8 confirm-before-write
            challenge = pending_action(tool, args)    # chưa mutate gì ở đây
            return ask_confirmation(challenge)        # client bấm xác nhận → resume cùng token
        result = with_timeout(tool_timeout, tool.run, args, user_ctx)   # server inject scope
        if result.too_large:                          # max tool result size
            result = truncate_or_refuse(result)
        audit(tool, args, result, actor=user_ctx, client_message_id=session.msg_id)
        session.append(structured(result))            # *structured result*, không phải chuỗi free-text
    return guard_exceeded()                           # hết maxSteps → fallback, không lặp tiếp
```

Sáu điểm làm vòng lặp này khác một đoạn gọi API tự do:

1. **Intent map sang tool**, không để tất cả thành câu hỏi tự do (`NOTES-01 §B0`). 28 intent ở
   `18-user-flows.md` là khoá; 7 intent chưa có tool thì **không** được tự đặt tên tool mới.
2. **Tên tool lấy đúng catalog** `NOTES-01 §B6`: read `get_my_profile · get_employee · list_projects ·
   get_project · get_my_kpi · get_department_kpi · find_candidates · explain_candidate_match ·
   search_policy · get_upcoming_deadlines`; write `submit_progress · submit_report · assign_project ·
   change_project_status · override_kpi`. Ví dụ trong `§B0` dùng `get_my_projects` — tên đó **không** có
   trong catalog nên không được dùng (`18-user-flows.md` intent #6).
3. **Zod validate** vì LLM hallucinate args (`RP §3 B6`).
4. **RBAC sau validate, trước execute**, và lặp lại ở mỗi bước — không tin router (`BR-06`).
5. **Structured result** là input cho bước tiếp theo và là payload `chat:done`; nhờ đó mock PR test được
   (ADR-016).
6. **Xác nhận write là một round-trip**, không phải tham số của lần gọi: server không mutate trước khi nhận
   confirm, và `clientMessageId` (BR-13) bảo đảm một lần bấm nút chỉ đúng một mutation khi reconnect/retry.

### 6.2 Guard

```text
Guard: maxSteps = 5 | toolTimeout | LLM timeout | max tool result size
       RBAC check every tool | Zod validate every argument
       confirm write operations | audit every mutation
```

| Guard | Hành vi khi chạm ngưỡng | Hệ quả nhìn thấy được |
|---|---|---|
| `maxSteps = 5` | dừng loop, trả `guard_exceeded` | "tôi chưa xong sau 5 bước" + phần đã có, **không** im lặng lặp |
| `toolTimeout` | huỷ call sang `ai-service`/repository | `chat:error` (UF-04 đã khai báo event này cho ai-service timeout) |
| LLM timeout | huỷ provider | `chat:error` hoặc fallback S9 |
| max tool result size | chặn, hoặc cắt bớt có kiểm soát | chống nổ context và chống chạm trần Atlas ~100 ops/s / 0.5 GB (`NOTES-01 §B1`, **thiếu URL** ⇒ `[CẦN NGUỒN]`) |
| RBAC mỗi tool | từ chối trước execute | Employee gọi `assign_project`/`override_kpi` bị chặn (`11-quality-testing.md` §4.2) |
| Zod mỗi arg | tool không chạy | có đường xử lý dự phòng, không mutate |
| confirm write | không mutate khi chưa xác nhận | BR-05 |
| audit every mutation | mutation không có audit log = bug | `project_events` / `evaluations.override*` |

Ngưỡng cụ thể của `toolTimeout`, `LLM timeout`, `max tool result size`: `TBD` — `NOTES-01 §B6` đặt tên
guard nhưng không cho giá trị `[CẦN NGUỒN]`.

### 6.3 Fallback khi lỗi / hết quota (S9)

`RP §9 S9` yêu cầu hành vi, không phải con số: "hết quota LLM → tự rơi về pipeline **PhoBERT-only (intent
cố định)** thay vì chết; **đo % tính năng còn dùng được**". Mô tả hành vi ở ba mức độ hỏng:

| Chế độ | Điều kiện vào | Còn dùng được | Mất | Hành vi với người dùng |
|---|---|---|---|---|
| **full** | provider bình thường | toàn bộ F1–F7 | — | hội thoại tự do + tool |
| **degraded-structured** | `429`/hết quota/timeout provider, còn `ai-service` | tra cứu và matching **không qua LLM**: intent theo mẫu cố định (regex/khớp từ khoá của catalog 28 intent), `find_candidates` vẫn chạy (mục 2–3), `list_projects`, `get_my_kpi`, `search_policy` dạng top-K trích + hiển thị chunk gốc | sinh câu trả lời văn xuôi, tool chọn theo ngữ cảnh, `explain_candidate_match` dạng tường thuật | nói rõ "đang ở chế độ không có model ngôn ngữ lớn", trả **kết quả thô** thay vì câu chuyện; **không** trả lời chính sách nếu top-K không đủ bằng chứng (BR-15) |
| **off** | `ai-service` chết hoặc không đủ RAM/CPU | CRUD, dashboard, notification, workflow F2 qua Web | mọi tính năng chat | UI hiển thị chat bị tắt, không phải spinner vĩnh viễn (`02-architecture.md` §7.5) |

Ba luật cho fallback (`// SUY DIỄN — cần xác nhận`):

1. **Không giả vờ đang hoạt động đầy đủ.** Người dùng phải nhìn thấy chế độ hiện hành.
2. **Không có write-through-fallback.** Tool write vẫn cần confirm; nếu LLM chết giữa chừng thì pending
   action hết hạn, không tự mutate.
3. **Mock được cả ba chế độ** — ADR-016 nói S9 "chỉ test được nếu có một mock giả lập đúng lỗi quota".

Số đo của S9 (% tính năng còn dùng được, tỷ lệ phiên rơi chế độ) là `TBD — chưa đo`.

---

## 7. RAG cho hỏi đáp chính sách (F3)

### 7.1 Pipeline

```text
Policy documents → chunk → embedding → Atlas Vector Search → top-K chunks
  → LLM → answer + document/version/source
```

Đó là **một** Atlas Vector Search index duy nhất, trên `policies.chunks.embedding`
(`05-data-model.md` §3.8; ADR-005; `NOTES-01 §B1`). F4 **không** dùng index này.

### 7.2 Chunking văn bản tiếng Việt

| Tham số | Nguồn | Giá trị |
|---|---|---|
| Đơn vị cắt | `RP §3 B6` nêu "chunking tiếng Việt" như việc phải research; `NOTES-01` không chốt | `TBD` |
| Kích thước chunk / overlap | `ADR-005` ghi tường minh: "Chunking tiếng Việt (độ dài chunk, overlap) **chưa được NOTES-01 chốt** → thuộc `08-algorithms.md`; không có thông số để ghi: `[CẦN NGUỒN]`" | `TBD` |
| Metadata bắt buộc trên chunk | `ADR-005` điều kiện 2: chunk phải mang metadata về tài liệu nguồn để câu trả lời kèm `document/version/source` | `sourceDocumentId`, `version`, `order`, `text`, `embedding`, `model` (`05-data-model.md` §3.8) |
| Model embedding cho policy | `05-data-model.md` §3.8: `NOTES-01 §B5` chỉ cho dimension của e5/MiniLM = 384, **không** nói model nào dùng cho policy | `TBD` |

Nguyên tắc cắt đề xuất cho nhóm, gắn nhãn rõ là giả định (`// SUY DIỄN — cần xác nhận`): cắt theo **điều
mục/mục có đánh số của tài liệu** trước (một điều khoản là một đơn vị nghĩa), chỉ dùng cửa sổ trượt khi tài
liệu không có cấu trúc; overlap đủ để không cắt đôi câu điều kiện ("nếu … thì …"). Không được để một chunk
chứa hai điều khoản mâu thuẫn nhau — đó là cách nhanh nhất để model trả lời lẫn.

### 7.3 Retrieval và sinh câu trả lời

```python
def answer_policy(question, user_ctx):
    qv   = embed(question)                                  # cùng model với lúc ingest — kiểm tra lúc warm-up
    hits = atlas_vector_search(qv, num_matches=TOP_K)       # TOP_K: TBD
    ev   = [h for h in hits if h.score >= MIN_EVIDENCE]     # MIN_EVIDENCE: TBD
    if not ev:
        return refuse(reason="no_evidence")                 # BR-15 / UF-10: từ chối đoán
    prompt = render(ev, scope=user_ctx.department)          # chỉ chunk của phạm vi được phép đọc
    return cite(llm.answer(prompt), fields=["document", "version", "source"])
```

Luật "không đủ bằng chứng thì từ chối đoán" (BR-15; `NOTES-01 §B0` UF-10) là **cùng họ** với abstention ở
mục 5 (`18-user-flows.md` UF-10 bước 7 ghi rõ điều đó): một bên từ chối xếp hạng, một bên từ chối trả lời.
Câu bị từ chối phải nói được *thiếu gì*: "chưa có trong tài liệu chính sách đang lưu", kèm danh mục tài
liệu đã nạp nếu có — **không** bịa nguồn, **không** dẫn một tài liệu không có trong `policies`.

Câu trả lời bắt buộc kèm `document / version / source` (BR-15, ADR-005). Đó là lý do RAG nằm cạnh
`policies` trong cùng Atlas: không phải đồng bộ giữa hai hệ.

### 7.4 Vì sao không fine-tune ở baseline

`NOTES-01 §B6`: "**Không fine-tune LLM cho policy QA ở baseline.**" Ba lý do có sẵn trong nguồn và ràng buộc:

1. **Không có dữ liệu nhãn đủ lớn.** ADR-013 ghi: "Không có dữ liệu nhãn đủ lớn (§B5: dataset HR tiếng
   Việt **chưa tồn tại** ở dạng xác minh được)".
2. **Không đủ nhân/quỹ thời gian.** Nhóm 3 người / 12 tuần, F1–F7 là sàn (`RP §12` luật 1).
3. **Không có cách nào chứng minh tính đúng.** Câu trả lời chính sách phải **trích dẫn được** phiên bản
   tài liệu; retrieval làm việc đó hiển thị được, fine-tune thì không — và nếu chính sách đổi, model vẫn
   trả lời theo bản cũ.

---

## 8. F5: sentiment nhận xét → KPI

### 8.1 Pipeline ba thành phần

```text
Objective completion score      (dữ liệu thật: tỷ lệ hoàn thành, nghiệm thu)
        +
Review semantic signal          (AI: sentiment | themes | risk signals | suggested score component | explanation)
        +
Manager assessment              (người thật chấm)
        ↓
deterministic KPI formula  →  machineScore          (bất biến sau khi ghi)
        ↓
finalScore  = machineScore  |  override (kèm overrideReason + changedBy + changedAt)
```

Trình tự 8 bước nghiệp vụ ở `04-domain-model.md` §6.2 (`mở kỳ → tự nhận xét → quản lý đánh giá → AI phân
tích → tính điểm máy → calibration/duyệt → công bố → lịch sử`). Ranh giới trách nhiệm:

| Tầng | Được làm | Không được làm |
|---|---|---|
| `ai-service` | `sentiment`, `themes`, `riskSignals`, `suggestedScoreComponent`, `explanation` | tính `machineScore`, gọi `finalScore` |
| `kpiService` (Node) | `objectiveCompletionScore`, `machineScore`, `finalScore`, trần BR-08 | gọi LLM trong lúc tính |
| UI | hiển thị breakdown, thu override | cho Employee tự sửa `finalScore` |

### 8.2 Công thức dạng tổng quát

`NOTES-01 §B6` chỉ cho **đầu vào/đầu ra**; `04-domain-model.md` §6.3 ghi rõ "`F` cụ dạng gì — **TBD**, tài
liệu này không đặt trọng số giả". Khung mà nhóm đề xuất, để GVHD duyệt:

```text
C  = objectiveCompletionScore ∈ [0, 1]        # tỷ lệ hoàn thành THẬT, từ projects/reports
S  = suggestedScoreComponent  ∈ [0, 1]        # AI — đầu vào, không phải đầu ra
M  = managerAssessment        ∈ [0, 1]        # người thật chấm

machineScore_01 = w_c · C  +  w_s · S  +  w_m · M          w_c + w_s + w_m = 1
machineScore    = scale · min(machineScore_01, ceiling(C)) # scale = thang hiển thị (10 / 100)
```

| Tham số | Giá trị | Ghi chú |
|---|---|---|
| `w_c`, `w_s`, `w_m` | `TBD — cần GVHD duyệt` | đề cương chỉ nói "lượng hóa" (`RP §1`), không có trọng số; ADR-013: "trọng số trong công thức **không có nguồn ngoài**; mọi giá trị phải gắn nhãn giả định của nhóm" |
| `scale` (thang 10 hay 100) | `TBD — cần GVHD duyệt` | chưa có trong nguồn |
| dạng của `C` (đếm đề tài hoàn thành hay weighted theo `progressPct`) | `TBD` | `progressPct` là `// SUY DIỄN` trong `05-data-model.md` §3.4 |
| granularity của `period` | `TBD` | Q-07 ở `04-domain-model.md` §9 |
| `w_s` có được quyền tác động bao nhiêu % | `TBD — cần GVHD duyệt` | chính là mục #2 đang mở của ADR-013 (= trần S13) |

### 8.3 Ceiling / counter-weight (S13, BR-08)

Vấn đề S13 giải quyết: một câu nhận xét hoa mỹ không được thắng công việc chưa làm xong (`RP §9` S13,
ADR-013). Cơ chế: **trần theo completion thật**, tức tín hiệu ngữ nghĩa bị chặn trên bởi kết quả khách
quan:

```text
ceiling(C) = C + κ · (1 − C)          κ ∈ [0, 1)   # κ: TBD — cần GVHD duyệt
machineScore = scale · min(w_c·C + w_s·S + w_m·M, ceiling(C))
```

Hai hệ quả phải nói thẳng trong báo cáo: (a) với `κ` nhỏ, phần "AI" chỉ còn tác động trong giới hạn hẹp —
đúng chủ đích, đó là chỗ S12 đo; (b) `min` làm `machineScore` **không khả vi theo S** ở vùng bị trần, nên
khi phân tích độ nhạy phải báo cả số ca bị cắt trần (`// SUY DIỄN`).

### 8.4 Override log

```text
override_kpi  = write tool: confirm + reason + Admin          (NOTES-01 §B6)
finalScore ≠ machineScore  ⇒  overrideReason, changedBy, changedAt  bắt buộc   (BR-09)
machineScore bất biến sau khi ghi; bản ghi override không được sửa đè
thiếu 1 trong 5 field  ⇒  không đủ điều kiện nghiệm thu F5                      (ADR-013)
```

`machineScore` lưu để `finalScore` luôn giải thích lại được; đó cũng là lý do `explanation` của AI phải
được **lưu cùng kỳ** chứ không sinh lại mỗi lần đọc (đổi prompt/đổi provider sẽ làm lịch sử không so sánh
được — ADR-013).

Tính tất định của `machineScore` là **thứ làm S12/S13 đo được**: nếu LLM trực tiếp sinh điểm thì không còn
baseline để so (`04-domain-model.md` §6.3). Thiết kế bias probe ở `09-ai-evaluation.md` §7.

---

## 9. Độ phức tạp & hiệu năng

### 9.1 Chi phí tính

Ký hiệu: `m = |skills(e)|`, `n = |requiredSkills(p)|`, `d` = số chiều vector, `N` = số nhân viên đang xét.

| Việc | Độ phức tạp | Ghi chú |
|---|---|---|
| Embed **một** chuỗi, 1 model, CPU | `O(L² · H)` cho self-attention — **không có số liệu từ nguồn** | `L` = số token sau segmentation; `H` = hidden size (`TBD`, xem 2.4). Chi phí tuyệt đối: `TBD — chưa đo` |
| Build/refresh kho embedding nhân viên | `O(N · m)` lần gọi model | chỉ chạy khi `skills` đổi hoặc tiến trình khởi động lại |
| `sim(e, p)` theo đường A (skill-to-skill) | `O(n · m)` cosine `O(d)` = `O(n·m·d)` | `n`, `m` đều nhỏ (đôi chữ số) |
| Một truy vấn top-k, **đã cache vector** | `O(N · n · m · d)` cosine + `O(N log k)` sắp xếp | `N` của `make demo` (S14) là 200 nhân viên / 1000 đề tài (`RP §9` S14) ⇒ khối lượng nhỏ; chưa đo: `TBD — chưa đo` |
| leave-one-out cho **1** ứng viên | `O(m)` lần tính lại `score` | vì tốn hơn nhiều nên chỉ chạy khi được bấm (4.2) |
| Bộ 4 model × toàn bộ eval | ≈ `4 ×` chi phí trên, theo `09-ai-evaluation.md` | S3 |

Vector của F4 nằm **trong RAM** của `ai-service` và tự rebuild khi khởi động — hệ quả trực tiếp của
ADR-005/`NOTES-01 §B1` ("F4 skill matching chạy vector/cosine trong Python FastAPI"), và là thứ phải trả
giá vì Render free tier ngủ đông sau 15 phút (`NOTES-01 §B1`).

### 9.2 Bốn cơ chế đã chốt

1. **Cache theo skill-string.** `RP §3 B9` nêu "cache embedding theo skill-string" là một trong bốn cơ chế
   latency của AI. Khoá cache = `(model_id, model_version, preprocessed_text)`; `model_version` phải có vì
   đổi checkpoint làm toàn bộ vector cũ vô nghĩa. `// SUY DIỄN — cần xác nhận` về hình thức lưu.
   Cache phải **vượt qua khởi động lại** nếu có thể — vector chỉ là hàm của chuỗi, nên tái sử dụng được
   không phá invariant nào. `// SUY DIỄN`
2. **Warm-up model lúc khởi động.** `ADR-005` ghi: target "Warm embedding inference < 500 ms" **chỉ đúng
   khi đã warm** ⇒ phải có bước warm-up. Kèm theo đó, batch embedding khi rebuild (`RP §3 B9`).
3. **Chạy ở process riêng.** Toàn bộ suy luận nằm trong `apps/ai-service` để **không block event loop** của
   Express (`RP §3 B9`; ADR-003). Trần RAM/CPU của container này **chưa có đáp án** — `RP §3 B1` hỏi "VPS
   2GB RAM có đủ chạy Node API + FastAPI + PhoBERT inference trên CPU không" và vòng 1 chưa trả lời
   (`02-architecture.md` §6) ⇒ `[CẦN NGUỒN]`.
4. **Batch + dedupe** các chuỗi cần nhúng trong một truy vấn (`set(requiredSkills ∪ skills)`), không gọi
   model từng chuỗi một. `// SUY DIỄN`

### 9.3 Ngân sách

Chỉ có **target nội bộ** của nhóm, và `NOTES-01 §B9` chính thức gắn nhãn chúng là "chưa phải chuẩn ngoài —
phải benchmark trước khi đưa thành 'kết quả'":

```text
CRUD read p95              < 300 ms
Dashboard aggregate p95    < 800 ms
Chat tool lookup p95       < 1 s
Warm embedding inference   < 500 ms
LLM first token            < 2.5 s
```

| Số cần có trong báo cáo | Trạng thái |
|---|---|
| p50/p95 embedding inference, theo từng model M1–M4 | `TBD — chưa đo` |
| p95 một truy vấn top-k end-to-end (`find_candidates`) | `TBD — chưa đo` |
| RAM thường trú / RAM đỉnh theo model | `TBD — chưa đo` |
| Thời gian warm-up / thời gian "nguội" sau khi Render ngủ đông | `TBD — chưa đo` |
| Tỷ lệ tính năng còn dùng được khi rơi chế độ (S9) | `TBD — chưa đo` |
| LCP / INP / CLS | chuẩn ngoài: `LCP ≤ 2.5s · INP ≤ 200ms · CLS ≤ 0.1` tại p75 (`NOTES-01 §B9`); **kết quả đo: `TBD — chưa đo`** |

Bảng kết quả và cách đo nằm ở `09-ai-evaluation.md` §4 và `12-performance.md`; file này chỉ cam kết **đối
tượng nào cần được đo**, không cam kết số.

---

## 10. Những gì chưa chốt

| # | Chưa chốt | Đang chặn ở file này | Chặn bởi | Mốc phải có |
|---|---|---|---|---|
| 1 | **Metric chính của F4** — F1 đo bài toán nào | mục 1.2: hình thức hoá (A)/(B); `τ_match` | `RP §7` câu 2; `NOTES-01 §B5` "phải chốt với GVHD" | trước tuần 5 |
| 2 | **Dataset cuối cùng** cho F4 + intent HR | mục 9.1 không có `N` thật; bảng M1–M4 trống số | `RP §7` câu 3; `NOTES-01 §B5` | trước tuần 5 |
| 3 | **Segmenter + version** (`undertheseanlp` hay công cụ khác) | mục 2.1 bước 2 | `RP §3 B5`; `NOTES-01` không trả lời + `[CẦN NGUỒN]` URL PhoBERT | trước tuần 3 |
| 4 | **Trọng số `w_c`/`w_s`/`w_m`, `scale`, `κ`, `ceiling`** | mục 8.2, 8.3 | GVHD + `04-domain-model.md` Q-08; ADR-013 mục mở #1–#2 | trước tuần 9 |
| 5 | **`τ_abstain`, `τ_match`, `margin_min`, calibration params `a`,`b`** | mục 3.4, 5.1 | cần nhãn + tập validation → `09-ai-evaluation.md` §6 | tuần 5–6 |
| 6 | **Giá trị guard** (`toolTimeout`, `LLM timeout`, max tool result size) | mục 6.2 | `NOTES-01 §B6` không cho số | tuần 4 |
| 7 | **Vị trí đúng của Agent Loop** — trong `apps/api` hay `apps/ai-service` | mục 6.1 (việc "router" chạm LLM ở đâu) | `RP §3 B2` có hỏi chiều sync/async, vòng 1 chưa trả lời (ADR-003 ghi chú); ADR-012 đặt `LLMProvider` | trước tuần 4 |
| 8 | **Thông số chunking policy + model embedding cho RAG** | mục 7.2 | `ADR-005` đánh dấu `[CẦN NGUỒN]`; `05-data-model.md` §3.8 | tuần 7 |
| 9 | **Định nghĩa workload** (`activeCount`, capacity, ε tie-break) | mục 3.2 | `NOTES-01` không có; intent #17 chưa có tool | tuần 6 |
| 10 | **`α_r` (trọng số từng yêu cầu)** | mục 3.1 | nguồn chỉ nói cosine; để đều = đồng nhất giả định | tuần 5 |
| 11 | **`Atlas Vector Search` có trên M0/free hay không** | mục 7 toàn bộ | `NOTES-01` "CẦN BỔ SUNG" mục 4; ADR-005 tự nhận là "ADR dễ bị đảo nhất" | trước tuần 7 |
| 12 | **URL cho mọi con số B1/B5** (params, 384 dims, PhoATIS counts…) | không được chép số nào vào báo cáo | `NOTES-01` "CẦN BỔ SUNG" | trước tuần 12 |

Mục nào còn `TBD` thì **giữ nguyên `TBD`** — theo `RP §0` nguyên tắc 1 (không bịa số liệu, không giả sử ràng
buộc của Khoa) và đúng tinh thần `11-quality-testing.md` §9.

# 09 — Đánh giá AI (AI Evaluation)

Khóa luận **KLCN133** — *Xây dựng Chatbot chuyển đổi số quản lý nhân sự*.

File này là **nơi duy nhất công bố số liệu thực nghiệm** của đề tài. Thuật toán được đo ở đây định nghĩa
trong [`08-algorithms.md`](08-algorithms.md); cơ chế test tự động trong pipeline CI ở
[`11-quality-testing.md`](11-quality-testing.md) §4.

> **Trạng thái hiện tại: chưa có kết quả.** Toàn bộ ô số trong file này là `TBD — chưa đo`. Lý do thật,
> không phải cách nói: (a) chưa có dataset HR đã chốt (§3), (b) GVHD chưa trả lời "F1 ≥ 85% đo trên bài
> toán nào" (§1), (c) chưa có mã nguồn và chưa có harness (`README.md`: repo chưa có pipeline). Viết
> protocol trước kết quả là thứ tự đúng — protocol viết sau kết quả thì không còn là protocol.

## 0. Nguồn và ký hiệu

| Ký hiệu | Nghĩa |
|---|---|
| `NOTES-01 §B<n>` | batch B<n> của `docs/research/NOTES-01.md` |
| `RP §<n>` | mục của `docs/research/RESEARCH-PLAN.md` |
| `ADR-<n>` / `BR-<n>` | `docs/03-decision-records/` / `docs/04-domain-model.md` §5 |
| `TBD — chưa đo` | chưa chạy phép đo → **cấm** thay bằng số phỏng đoán |
| `TBD` | nguồn không cho con số / quyết định |
| `[CẦN NGUỒN]` | cần URL chính thức; `NOTES-01` mục "CẦN BỔ SUNG" ghi rõ **URL của các con số B1/B5 bị mất khi paste** |
| `minh hoạ` | số ví dụ để định hình format, **không phải kết quả model** |

Bốn luật sắt của file này:

1. **Không số nào được vào báo cáo nếu thiếu cả bốn**: (a) lệnh chạy, (b) commit, (c) ngày đo, (d) N mẫu —
   theo `11-quality-testing.md` §3.
2. **Không dùng F1 đơn độc để đánh ranking Top-K** (`NOTES-01 §B5`).
3. **Không gọi PhoATIS là dataset chuẩn cho HR chatbot** (§3.1).
4. **Cosine 0.82 ≠ 82% xác suất đúng** (`NOTES-01 §B13`) — độ đo xác suất phải đi qua calibration (§6).

---

## 1. Mục tiêu đo, và vì sao phải hỏi lại định nghĩa F1

### 1.1 Ba câu hỏi thực nghiệm của khóa luận

| # | Câu hỏi | Đối tượng | Chỉ trả lời được bằng |
|---|---|---|---|
| Q1 | Mô hình nhúng nào xếp hạng ứng viên tốt nhất trên dữ liệu HR tiếng Việt, với chi phí CPU/RAM nào? | F4 | bảng so sánh 4 model, §2 + §5 |
| Q2 | Khi nào **không nên** tin gợi ý của mô hình, và cắt ngưỡng ở đâu? | F4 + S2 | calibration + selective evaluation, §6 |
| Q3 | Tín hiệu ngữ nghĩa từ nhận xét có đóng góp thật (và công bằng) vào `machineScore` không? | F5 + S12/S13 | bias probe + ablation, §7 |

Đề cương quy định chỉ tiêu: **F1-score ≥ 85% + Accuracy trên tập test chuẩn** (`RP §1`, hàng "AI metric").
Ba cụm trong một câu đó đều đang mở: *F1 trên bài toán nào*, *Accuracy của cái gì*, *tập test chuẩn là đâu*.

### 1.2 Xung đột cụ thể giữa đầu bài và kết quả research

| Nguồn | Nói gì |
|---|---|
| `RP §1` (đầu bài) | F1 ≥ 85% + Accuracy trên tập test chuẩn |
| `NOTES-01 §B5` (research) | **không dùng F1 để đánh ranking Top-K một cách đơn độc**; F4 dùng `Precision@1/@3/@5, Recall@5, MRR, nDCG@5 (optional), latency, RAM`; "Nếu GVHD bắt buộc F1 ≥ 85% thì định nghĩa thêm bài toán `(employee, project) → phù hợp / không phù hợp`" — và ghi rõ "**Đây là câu phải chốt với GVHD**" |
| `RP §7` câu 2 | chính là câu hỏi đã soạn để gửi GVHD: "F1 ≥ 85% tính trên bài toán nào: phân loại intent (classification) hay gợi ý đề tài (ranking)? Nếu là ranking thì F1 không phải chuẩn đo phù hợp" |
| `RP §7` câu 3 | "Khoa yêu cầu dataset cụ thể/tối thiểu bao nhiêu mẫu? Có chấp nhận dataset tự gom + công bố không?" |

### 1.3 Hệ quả phương pháp luận: vì sao không tự quyết

F1 trên một bài ranking chỉ đo được sau khi ép mô hình đưa ra quyết định nhị phân — tức là **đã giấu đi
thứ tự**, đúng phần mà quản lý thật sự dùng. Nếu nhóm tự ý báo `F1` cho Top-K thì hoặc là vi phạm đầu bài,
hoặc là đưa một con số vô nghĩa về mặt khoa học. Cả hai đều không chấp nhận được trong một khóa luận.

Vì vậy tài liệu này **không** chọn hộ. Nó định nghĩa **cả hai** bài toán (§2) để:

- nếu GVHD giữ F1 → có ngay bài (A) với protocol đo chuẩn;
- nếu GVHD đổi sang P@5/MRR → bài (B) đã sẵn;
- và trong mọi trường hợp, bảng kết quả §5 có đủ hai cột, không phải viết lại thực nghiệm.

**Trạng thái:** metric chính = `TBD` (chờ `RP §7` câu 2). Mọi gate ở §5 treo ở quyết định này — giống ghi
chú của ADR-016: "vẫn chưa chốt được metric nào là chính cho tới khi GVHD trả lời".

---

## 2. Hai bài toán tách biệt

Chung một pipeline vector (§2 của `08-algorithms.md`), khác nhau ở **nhãn**, **ngưỡng** và **metric**.

### 2.1 (A) Phân loại nhị phân: `(employee, project) → phù hợp / không phù hợp`

**Định nghĩa mẫu:** một cặp `(e, p)`. Nhãn `1` = "đủ kỹ năng để giao đề tài này"; nhãn `0` = "không đủ".
Nhãn do người (Admin/người gán việc) quyết định theo rubric cố định, không do model.

| Dự đoán \ Thực tế | phù hợp (1) | không phù hợp (0) |
|---|---|---|
| **phù hợp (1)** | TP — giao đúng người | FP — **giao nhầm việc** (lỗi đắt nhất về nghiệp vụ) |
| **không phù hợp (0)** | FN — bỏ sót người tốt (đỡ hơn: quản lý còn tìm tay được) | TN — từ chối đúng |

```text
Precision = TP / (TP + FP)          Recall    = TP / (TP + FN)
Accuracy  = (TP + TN) / (TP+FP+FN+TN)
F1        = 2 · P · R / (P + R)     [ harmonic mean — không dùng khi 2 lớp mất cân bằng nghiêm trọng ]
```

Cặp `(P, R)` phải được báo **cùng nhau**, không chỉ F1: mục tiêu nghiệp vụ là giữ FP thấp (tránh giao nhầm
việc), nên có thể phải chấp nhận recall thấp. Đó là đúng tinh thần abstention (S2).

- **Micro F1** (cộng TP/FP/FN toàn bộ rồi tính một lần) = accuracy khi 2 lớp cân bằng → **không** dùng một
  mình nó.
- **Macro F1** (trung bình F1 của hai lớp) phản ánh tốt hơn khi `0` áp đảo (số cặp "phù hợp" luôn ít hơn
  số cặp thử). Báo **cả hai** cho bài (A); công thức tổng quát ở §4.2.

**Bài (A) trả lời chỉ tiêu nào của đề cương:** đúng chỗ `RP §1` — "F1-score ≥ 85% + Accuracy". Ngưỡng nào
được tính là "đủ" ở nhãn `1` thuộc §3.4 (cách gán nhãn), không thuộc model.

### 2.2 (B) Xếp hạng Top-K: `project → ordering của C(p)`

**Định nghĩa mẫu:** một truy vấn = một đề tài `p` đang cần người (`DRAFT`/`ASSIGNED`); relevance là **danh
mục ứng viên đúng** cho `p` (nhiều phần tử, không phải một).

```text
P@K      = |relevant ∩ top-K| / K
Recall@K = |relevant ∩ top-K| / |relevant|
RR       = 1 / rank_first_relevant        ;  MRR = trung bình RR trên các truy vấn
nDCG@K   = DCG@K / IDCG@K ,  DCG@K = Σ_{i=1..K} (2^rel_i − 1) / log2(i + 1)
```

Kèm hai cột phi-chất-lượng đã chốt trong cùng bộ metric của `NOTES-01 §B5`: **latency** và **RAM**
(RP §9 S3 đòi đúng 3 cột: chất lượng / độ trễ / RAM).

**Bài (B) trả lời câu nào:** chất lượng nghiệp vụ của F4 — "top 5 người này có nên chọn không". Nó **không**
trả lời chỉ tiêu F1 ≥ 85% và không được trình bày như thể có.

### 2.3 Quan hệ giữa (A) và (B), và vì sao không được gộp

```text
score(e, p)  ──(ngưỡng τ_match, trên điểm ĐÃ HIỆU CHUẨN p_hat)──►  dự đoán nhị phân (A)
     └────────────(sắp xếp theo score, tie-break)──────────────►  danh sách xếp hạng (B)
```

| Nếu gộp thành một bài thì | Hệ quả |
|---|---|
| chỉ đo (A) | mất thông tin vị trí: một hệ thống xếp người đúng ở hạng 20 vẫn "đúng nhãn" |
| chỉ đo (B) và báo F1 | F1 khi đó là F1 **của một ngưỡng ẩn** chưa từng được công bố → không tái lập, không bảo vệ được trước hội đồng |
| chia nhỏ cùng cặp `(e,p)` vào cả hai tập | §3.5 (leak) |

Cả hai bài dùng **chung một tập test** nhưng **khác cách cắt ngưỡng**: (A) tại `τ_match`, (B) là ordering.
Định nghĩa `τ_match`: `TBD` (§6 — phụ thuộc objective precision).

### 2.4 Bài thứ ba, chỉ cho F3 — Agent Loop

Không nằm trong chỉ tiêu `RP §1` nhưng bắt buộc phải có vì đề cương yêu cầu Function Calling + Agent Loop
(`RP §1` hàng "Chatbot") và ADR-016 đã quy ước chỗ đo. Bốn số, theo `RP §3 B6` ("tỷ lệ chọn đúng tool, tỷ
lệ tham số đúng, latency, chi phí/phiên"):

| Số đo | Cách tính | Chỗ báo cáo |
|---|---|---|
| tool accuracy | số lượt chọn đúng tool theo fixture / tổng lượt | §5.3 (live eval) |
| argument accuracy | số lượt đối số pass Zod + đúng giá trị kỳ vọng / tổng lượt | như trên |
| guard behaviour | số ca chạm `maxSteps=5`/timeout và hành vi đầu ra | `08-algorithms.md` §6.2–§6.3 |
| chi phí/phiên | token in/out × đơn giá provider **đã xác minh URL** | provider pricing ở `NOTES-01 §B6` **thiếu URL** ⇒ `TBD` `[CẦN NGUỒN]` |

Tầng này **chỉ đo được bằng live eval** — ADR-016 luật 2: "mock luôn 'đỗ' vì ta tự viết câu trả lời cho nó".

---

## 3. Dữ liệu

### 3.1 Tình trạng hiện tại (`NOTES-01 §B5`)

| Khẳng định | Nguồn |
|---|---|
| **Không có dataset HR công khai đã xác minh** cho tiếng Việt. ADR-013 ghi nguyên văn: "dataset HR tiếng Việt **chưa tồn tại** ở dạng xác minh được" | `NOTES-01 §B5`, ADR-013 |
| Hai nguồn tiếng Việt **đã** xác minh được: **PhoATIS** — 5.871 utterances, 28 intent labels, 82 slot types; train 4.478 / dev 500 / test 893. **VN-SLU 2024** — 17.321 utterances từ 240 người nói | `NOTES-01 §B5` |
| Cả hai **khác domain**: PhoATIS là domain **đặt chuyến bay**; VN-SLU là SLU tiếng Việt nói chung. Cả hai chỉ dùng làm **baseline / chứng minh phương pháp / benchmark ngoài domain** | `NOTES-01 §B5`, `RP §3 B5` |
| Mọi con số trên **đang thiếu URL nguồn** → chưa được chép vào báo cáo | `NOTES-01` "CẦN BỔ SUNG" mục 2 |

> **Cấm:** viết "PhoATIS là dataset chuẩn để đánh giá HR chatbot". Nguồn ghi rõ: *Không được viết* như vậy.
> PhoATIS cũng **không** được dùng làm tập test cho F4/F3 của đề tài — chỉ dùng để (i) chứng minh harness
> chạy đúng trên dữ liệu đã biết kết quả, (ii) so sánh phương pháp ngoài domain nếu có thời gian.
> Licence PhoATIS do nguồn yêu cầu **chỉ phục vụ nghiên cứu/giáo dục, không tự ý phân phối lại**
> (`NOTES-01 §B5`) → không đưa raw data vào repo, không redistribute trong `make demo`.

**Đã loại + lý do** (theo đúng danh sách bị bác ở `NOTES-01 §B5`; giữ lại đây để hội đồng thấy nhóm đã xét):

| Tên từng được `RP §3 B5` nêu | Lý do loại |
|---|---|
| `UFoLD` | **tên sai** — kết quả công khai nổi bật cho "UFold" là mô hình dự đoán **cấu trúc RNA**, không liên quan Vietnamese NLP → không đưa vào báo cáo |
| `ViETeDis`, `VNIntent`, `Shopee-ITS_VL`, `UIT-VSPC`, `NLUI-VN` | **chưa tìm được nguồn đủ chắc** để xác nhận đúng dataset mà plan nói tới → coi như chưa xác minh, không trích |
| `GloVe-25Vn`, `UTBank`, `GlotFC`, `phoqwen` (dòng model, không phải dataset) | `RP §3 B5` và `RP §9 S3` từng nêu; `NOTES-01 §B5` **không** xác minh → không vào bảng 4 model, chỉ được xét nếu tự xác minh được licence + trang model `[CẦN NGUỒN]` |

### 3.2 Phương án được chọn: HR intent/matching dataset do nhóm tự xây

`NOTES-01 §B5`: "**Dataset cuối cùng cho HR vẫn nên là HR intent dataset do nhóm tự xây, có protocol rõ
ràng**"; `RP §7` câu 3 đang xin GVHD duyệt đúng phương án này.

**Nguồn utterance — không nghĩ nghiệp vụ mới.** Toàn bộ utterance sinh ra từ **catalog 28 intent** của
`18-user-flows.md` (bản gốc `NOTES-01 §B0`). Không thêm intent nào ngoài catalog; 7 intent chưa có tool
(`#2, #17, #18, #21, #22, #23, #28`) vẫn được dùng làm lớp intent để đo **router**, nhưng hành vi hệ thống
với chúng là "chưa hỗ trợ qua chat" chứ không phải bịa tool.

```text
28 intent (nhóm: Hồ sơ 5 · Đề tài 7 · Matching 6 · KPI 6 · Chính sách 2 · Notification 2 — đếm theo 18 §catalog)
   → mỗi intent: bộ khung "lời nói mẫu" do nhóm viết (template)
   → mỗi người dùng thật tự diễn đạt lại theo cách của mình (paraphrase) → utterance KHÔNG chuẩn hoá
```

Cấu trúc bản ghi:

```text
{ utterance_id, text_raw, speaker_id, intent,           # bài (A)/(router)
  slots?: {projectRef?, skill?, period?, topK?},        # bài slot (optional, không bắt buộc theo đề cương)
  candidates_for_matching?: [ {employeeCode, label} ]   # chỉ mẫu của bài (A)
}
```

### 3.3 Kích thước tối thiểu

| Hạng | Giá trị | Cơ sở |
|---|---|---|
| utterance / intent | `TBD` | `RP §7` câu 3 hỏi đúng con số này: "Khoa yêu cầu dataset cụ thể/tối thiểu bao nhiêu mẫu? Có chấp nhận dataset tự gom + công bố không?" |
| tổng utterance | `TBD` | phụ thuộc dòng trên × 28 intent |
| cặp `(e, p)` có nhãn cho bài (A) | `TBD` | cần đủ để mỗi phòng ban có ca dương và ca âm |
| truy vấn (đề tài) có relevance list cho bài (B) | `TBD` | P@K/MRR cần nhiều hơn một vài chục truy vấn để std có nghĩa |
| số người tạo utterance | `TBD` (tối thiểu: nhóm 3 người + tình nguyện viên, **không** phải 240 như VN-SLU — đó là con số không với tới) | trung thực về quy mô |

Không được lấy cảm hứng từ "5.871 utterances của PhoATIS" rồi đặt mục tiêu theo — đó là dataset của một
nhóm nghiên cứu khác, có annotation team chuyên nghiệp, và **khác domain**.

### 3.4 Cách gán nhãn

| Bài | Đơn vị | Nhãn | Rubric |
|---|---|---|---|
| Router/intent | 1 utterance | 1 trong 28 intent + `out_of_scope` | người đọc chọn intent theo **hành vi hệ thống phải xảy ra**, không theo từ khoá |
| (A) phù hợp/không | 1 cặp `(e, p)` | `1` = đủ kỹ năng để giao; `0` = thiếu kỹ năng cốt lõi | rubric 2 mức do nhóm + GVHD chốt: `TBD` |
| (B) relevance list | 1 đề tài `p` | tập con ứng viên "chấp nhận được" (graded 0/1, hoặc 0/1/2 nếu GVHD duyệt graded) | graded hay binary: `TBD` — ảnh hưởng trực tiếp nDCG@5 |

Hai luật cho nhãn (A)/(B):

1. **Người có thẩm quyền quyết, model không được làm trọng tài.** Admin/người gán việc thật chấm; model
   chấm lại sẽ tạo vòng lặp tự khẳng định (cùng bias được đo và được cho điểm).
2. **Kỹ năng trong hồ sơ là bằng chứng duy nhất.** Nếu người gán "biết" ứng viên làm được A nhưng hồ sơ
   `skills` không có → nhãn `0`, và đó chính là lý do mục 5 của `08-algorithms.md` tồn tại (hỏi lại rồi mới
   xếp hạng). Nhãn dựa trên tri thức ngoài hệ thống làm metric đo sai thứ cần đo (chất lượng **hệ thống**).

### 3.5 Chia train / dev / test và chống leak

```text
train  (fit model / fit calibration weights — nếu có fine-tune: KHÔNG có ở baseline, §7 `08-algorithms.md`)
calib  (dùng riêng cho §6: Platt/logistic, τ_abstain, τ_match)   ← tách khỏi dev và test
dev    (chọn model, chỉnh prompt/threshold, xem lỗi)
test   (đo một lần cho mỗi bảng công bố; KHÔNG dùng để chỉnh gì)
```

Nguyên tắc: **`calib` không được đụng vào quyết định kiến trúc**, vì threshold chọn trên `calib` rồi báo
precision trên `calib` là tự xác nhận. Test chỉ chạy khi protocol đã đóng băng.

**Leak — phần quan trọng nhất.** Trong matching skill, "hai mẫu giống nhau" không phải trùng câu mà là
trùng **cặp kỹ năng**: cùng cặp `(React, Next.js)` nằm ở train và test thì model ghi nhớ embedding của cặp
đó, P@5 tăng, và con số **vô nghĩa**. Bốn lớp chống leak, áp dụng theo thứ tự:

| # | Lớp | Luật | Kiểm bằng |
|---|---|---|---|
| L1 | **skill-pair** (mạnh nhất) | Một cặp `{skill_a, skill_b}` đã xuất hiện trong `train` **không** được xuất hiện trong `test` (kể cả với employee/role khác). Với nDCG: toàn bộ `requiredSkills(p)` của đề tài test phải **không** có cặp nào nằm trong tập cặp của train | `pytest` test đối chiếu tập cặp đã chuẩn hoá (lowercase + đã segment) giữa hai tập |
| L2 | **employee-disjoint** | Mọi mẫu của một `employeeCode` nằm trọn trong **một** split — không nhân viên nào vừa có mẫu train vừa có mẫu test | test trên `employeeCode` |
| L3 | **project-disjoint** | Một `projectId` (và `description` đã chuẩn hoá) chỉ thuộc một split; không dùng lại mô tả đề tài giữa dev và test | test trên `projectId` + hash mô tả đã chuẩn hoá |
| L4 | **paraphrase / cùng người tạo** | Utterance cùng intent do **cùng một người** viết không được rải ở cả train và test, vì văn phong cá nhân là feature rò rỉ | test trên `speaker_id` (nguồn VN-SLU: 240 người nói — speaker-disjoint là chuẩn ngành, `NOTES-01 §B5`) |

Bộ seed `make demo` (S14) là **dữ liệu giả lập có khoá cố định** — nó cấp khung (200 nhân viên / 30 phòng
ban / 1000 đề tài theo `RP §9` S14) chứ **không** cấp nhãn. Nhãn là sản phẩm của người gán việc thật (§3.4).

### 3.6 Hai người nhãn + disagreement

```text
mỗi mẫu → 2 người nhãn độc lập (không trao đổi trước khi nộp)
  đồng ý            → nhận nhãn chung
  không đồng ý      → đưa vào hàng đợi "ambiguous":
                      (a) người thứ 3 quyết (Admin/người gán việc có thẩm nghiệp vụ), hoặc
                      (b) loại khỏi tập test nếu không có quy tắc quyết định chắc chắn
```

Số **phải** báo cáo: **số mẫu đã gán**, **số cặp disagreement**,
**tỷ lệ đồng ý** (đo thống kê đồng thuận 2 người, vd Cohen's κ — công cụ: `TBD`), và **số mẫu bị loại vì
ambiguous**. Tỷ lệ đồng ý thấp là **phát hiện về rubric**, không phải về model: khi đó phải sửa rubric
(§3.4) rồi gán lại, không được "làm ngơ" cho đủ số mẫu.

Vì sao đây không phải thủ tục hình thức: toàn bộ §6 (calibration) và §7 (bias probe) lấy nhãn người làm
chuẩn. Nếu chuẩn đó không ổn định thì ECE, accepted precision và hệ số tương quan bias đều đo trên nhiễu.

---

## 4. Protocol đo

### 4.1 Ma trận cấu hình chạy (mỗi hàng một ô trong bảng §5)

```text
{ model ∈ {M1 TF-IDF/BM25, M2 PhoBERT mean-pool, M3 multilingual-e5-small, M4 MiniLM-L12-v2}   # NOTES-01 §B5
  preprocessing ∈ {raw, word-segmented}                          # bắt buộc đúng cặp: M2 cần segmented
  k ∈ {1, 3, 5}
  pooling (với M2) ∈ {mean}                                      # CLS: biến thể sau, không phải baseline
  workload: {bật, tắt}                                           # ablation của w_load · loadPenalty
  calibration: {thô, Platt}                                      # §6
  seed ∈ {s1, s2, s3} }
```

Cấu hình được phép chạy đầy đủ: `TBD` (quy mô nhỏ có chủ đích — 4 model × 2 preproc × 3 seeds đã là 24
lần; thêm biến thể là hết quỹ). Bảng kết quả sẽ công bố **số lần chạy thật** của mỗi hàng.

### 4.2 Định nghĩa exact của từng metric

Ký hiệu: `q` = một truy vấn (đề tài), `R_q` = tập ứng viên relevance của `q`, `|R_q|` = số phần tử của nó,
`C_q` = tập ứng viên đủ điều kiện đưa vào xếp hạng, `rel_i` = nhãn relevance của vị trí thứ `i`.

```text
(A) bài phân loại nhị phân, nhãn dương = "phù hợp":
  Precision = Σ TP / (Σ TP + Σ FP)        Recall = Σ TP / (Σ TP + Σ FN)
  F1        = 2PR/(P+R)                   Accuracy = (TP+TN)/(TP+FP+FN+TN)

  macro-X = (X_lớp 1 + X_lớp 0) / 2       # trung bình KHÔNG trọng số theo số mẫu mỗi lớp
  micro-X = tính một lần từ Σ TP, Σ FP, Σ FN gộp cả hai lớp
  macro-F1 được ưu tiên trình bày vì tập cặp thử mất cân bằng; micro được báo kèm để so.

(B) ranking:
  P@K(q)       = |{i ≤ K : rel_i = 1}| / K
  Recall@K(q)  = |{i ≤ K : rel_i = 1}| / |R_q|
  RR(q)        = 1/rank_first_relevant ;  0 nếu không có relevance nào được truy hồi
  MRR          = (1/|Q|) Σ_q RR(q)
  nDCG@K(q)    = DCG@K / IDCG@K ,  DCG@K = Σ_{i=1..K} (2^rel_i − 1)/log2(i+1)
                 IDCG@K = DCG@K của sắp xếp lý tưởng trên chính R_q
  điểm tổng = trung bình trên |Q| truy vấn; K cố định = {1,3,5}; K không được vượt |C_q| (với |C_q| < K
              thì báo rõ N và không tính truy vấn đó vào P@K, chỉ vào MRR)

hiệu năng:
  latency   = p50/p95 mỗi bước (embed 1 chuỗi | 1 truy vấn top-k | end-to-end find_candidates), ms
  RAM       = RSS đỉnh của tiến trình ai-service khi rebuild kho vector + khi trả lời truy vấn, MB
```

Mọi metric chất lượng báo **trên tập test, sau khi threshold đã chốt trên `calib`** — không tune trên test.

### 4.3 Tính tất định và báo cáo thống kê

| Việc | Luật |
|---|---|
| Seed | cố định cho mọi bước: tạo/gom dữ liệu, sắp xếp khi tie-break, sampling tập, và `torch.manual_seed` / `numpy` / `random` trong harness. Danh sách seed dùng phải ghi trong bảng kết quả (giá trị seed: chốt trong `seed_dataset.py`) |
| `temperature = 0` | đặt ở **mọi** lần gọi LLM, kể cả mock (`RP §3 B10`) |
| Số lần chạy | mỗi cấu hình chạy `TBD` lần (đề xuất ≥ 3) — **và số lần chạy thật phải được công bố**, không suy ra |
| Báo cáo | `trung bình ± độ lệch chuẩn` trên các lần chạy; với metric chất lượng trên một tập test cố định thì độ lệch phản ánh **biến động của pipeline**, không của mẫu → phải nói rõ điều đó trong báo cáo |
| So sánh 2 model | khi cùng một tập test, dùng test có cặp (vd paired bootstrap trên toàn bộ số truy vấn, `TBD` số vòng lặp) để nói khác biệt có vượt nhiễu không — **không** kết luận bằng mắt thường trên 1 điểm |
| Kết quả F3 | mỗi dòng live eval phải kèm **commit, model, provider, ngày, múi giờ, seed dataset**; thiếu một trong sáu → dòng đó là `TBD`, theo `11-quality-testing.md` §4.3 |

### 4.4 Phần cứng và môi trường benchmark

Theo `RP §9` S3, cột "độ trễ" và "RAM" là hai trong ba cột của bảng thực nghiệm, nên chúng **chỉ có nghĩa
kèm cấu hình máy**. `NOTES-01 §B5` và §B9 không có dòng nào về cấu hình benchmark → toàn bộ bảng dưới đây
`TBD` `[CẦN NGUỒN]`:

| Hạng mục | Giá trị |
|---|---|
| CPU (dòng, số core dành cho benchmark) | `TBD` |
| RAM khả dụng cho `ai-service` | `TBD` — `RP §3 B1` hỏi "VPS 2GB RAM có đủ chạy Node API + FastAPI + PhoBERT inference trên CPU không", vòng 1 **chưa trả lời** (`02-architecture.md` §6) |
| GPU | không dùng ở baseline (mọi số phải đo trên CPU để tái lập được) |
| Python / `transformers` / `torch` version | pin trong `apps/ai-service` (`11-quality-testing.md` §4.5) — giá trị: `TBD` |
| `batch_size`, `max_len` | `TBD` |
| Warm-up trước khi đo | bắt buộc (`ADR-005`: target "Warm embedding inference < 500 ms" **chỉ đúng khi đã warm**); số lần warm-up / số lần lặp đo: `TBD` |
| N của tập benchmark | `TBD` (§3.3) |
| Có/không đo trong lúc Render ngủ đông | ghi rõ môi trường: local hay Render free tier (`NOTES-01 §B1`) |

Không có cấu hình ⇒ hai con số latency không so sánh được với nhau, kể cả khi cùng tên.

---

## 5. Baseline và regression gate

### 5.1 Bảng kết quả công bố (khung — chưa có số)

```text
model / cấu hình | P@1 | P@3 | P@5 | Recall@5 | MRR | nDCG@5 | macro-F1 (A) | Accuracy (A) | p95 (ms) | RAM (MB) | N | seed | commit | ngày
```

| Hàng | Chất lượng | Latency | RAM | Trạng thái |
|---|---|---|---|---|
| M1 TF-IDF / BM25 (baseline rẻ) | `TBD — chưa đo` | `TBD — chưa đo` | `TBD — chưa đo` | chưa chạy |
| M2 PhoBERT mean-pooling (**bắt buộc theo đề cương**) | `TBD — chưa đo` | `TBD — chưa đo` | `TBD — chưa đo` | chưa chạy |
| M3 multilingual-e5-small (384d, ~118M) | `TBD — chưa đo` | `TBD — chưa đo` | `TBD — chưa đo` | chưa chạy |
| M4 paraphrase-multilingual-MiniLM-L12-v2 (384d) | `TBD — chưa đo` | `TBD — chưa đo` | `TBD — chưa đo` | chưa chạy |
| M2 + workload penalty tắt (ablation) | `TBD — chưa đo` | — | — | chưa chạy |
| M2 + calibration Platt (§6) | `TBD — chưa đo` | — | — | chưa chạy |

**Baseline công bố = `TBD`.** Lý do: chưa chạy lần nào, và **chưa biết metric nào là chính** (§1.3). Ghi chú
này khớp `11-quality-testing.md` §9 hàng 3 ("Baseline công bố của F1/P@K — gate 7 chưa có mốc so → chạy
rỗng hoặc `skip` có chú thích trong CI") và `NOTES-01` kết luận ("**chưa khoá dataset cuối cùng cho F4** tới
khi GVHD trả lời").

Quy tắc chốt baseline: lần chạy eval đầu tiên **có dataset + protocol đã đóng băng** mới được công bố là
baseline. Đổi baseline = PR riêng (`test(ai):` hoặc `docs(ai):`) kèm lý do và có review; **không nới ngưỡng
cho code pass** (`11-quality-testing.md` §4.4 mục 5).

### 5.2 Regression gate

Theo `RP §11`, hàng "Chất lượng mô hình":

> `pytest` eval harness — **F1/P@5 không được tụt quá 2 điểm** so với baseline đã công bố ở
> `09-ai-evaluation.md`.

```text
đỏ nếu   baseline_metric − current_metric > 2   (điểm phần trăm, trên metric đã công bố ở §5.1)
gate nằm SAU "Python AI tests" và TRƯỚC "build" trong chuỗi CI (NOTES-01 §B10)
```

Ba điều kiện để gate có hiệu lực: (1) baseline đã công bố ở §5.1; (2) metric chính đã chốt (§1.3);
(3) dataset + seed không đổi giữa hai lần đo. Nay cả ba đều chưa đủ ⇒ **gate đang `TBD`**, và CI phải
`skip` có chú thích thay vì im lặng pass.

### 5.3 Hai nhịp đánh giá (ADR-016)

| Nhịp | Chế độ | Chặn merge | Đo gì |
|---|---|---|---|
| **PR** | mocked, tất định: provider giả theo fixture, `temperature=0`, snapshot | **có** | hợp đồng: Zod, RBAC, confirm-before-write, audit, guard `maxSteps=5`/timeouts, intent→tool, từ chối khi thiếu bằng chứng (`11-quality-testing.md` §4.2) |
| **nightly / release** | live provider evaluation | **không** | chất lượng lựa chọn: tool accuracy, argument accuracy, P@K/MRR trên tập input đã đóng băng, latency, chi phí/phiên; **có chuỗi thời gian theo ngày** (ADR-016) |

Bốn luật của ADR-016 áp trực tiếp vào bảng này, đáng nhớ nhất là luật 2: mock **không** chứng minh model
chọn đúng tool, còn live **không** thay được mocked test trong PR. Khoảng trống giữa hai tầng (PR xanh,
nightly đỏ) là đánh đổi đã chấp nhận; mỗi fail nightly phải thành **một issue có chủ**.

### 5.4 Ablation bắt buộc (để từng thành phần có bằng chứng riêng)

| Ablation | Câu trả lời cần có | Kết quả |
|---|---|---|
| tắt `w_load · loadPenalty` | workload đổi thứ hạng bao nhiêu | `TBD — chưa đo` |
| tắt explainability path (chỉ đường B text-level) | skill-to-skill có giữ được chất lượng không (`08-algorithms.md` §2.2) | `TBD — chưa đo` |
| không calibration vs Platt | accepted precision / coverage đổi ra sao (§6) | `TBD — chưa đo` |
| bỏ `suggestedScoreComponent` khỏi `F` (§8 `08-algorithms.md`) | **AI có làm KPI tốt hơn không, hay chỉ làm demo đẹp hơn** — metric nào chứng minh: ADR-013 mục mở #3 đang `TBD` | `TBD — chưa đo` |
| tắt word segmentation với M2 | chứng minh định lượng §B5 là ràng buộc thật, không phải lời khuyên | `TBD — chưa đo` |

---

## 6. Calibration & abstention (S2, `NOTES-01 §B13`)

### 6.1 Vì sao phải đo cái này

Pipeline của `08-algorithms.md` §3.4 lấy `score` và cắt `τ_abstain`. Nếu cắt trên cosine thô thì ngưỡng là
một con số **không có đơn vị xác suất** — và BR-10 cấm đúng việc đó. Calibration là bước biến
`score` → `p_hat` để:

- ngưỡng mang nghĩa nghiệp vụ ("bỏ lại bao nhiêu % ca, đổi lại phần được recommend đúng bao nhiêu %"),
- UI được phép hiển thị phần trăm,
- abstention trở thành một chính sách **đo được** thay vì một cảm giác.

### 6.2 Pipeline

```text
train (không dùng ở đây — baseline không fine-tune)
calib  : (score, label) → logistic/Platt  → p_hat = σ(a·score + b)   [temperature scaling là biến thể 1 tham số]
          ├ chọn τ theo objective trên CHÍNH tập calib
          └ và chỉ kiểm chứng lại trên test MỘT LẦN
test   : đo accepted precision / coverage / ECE / Brier với τ ĐÃ đóng băng, không chỉnh tiếp
```

| Đại lượng | Nguồn | Trạng thái |
|---|---|---|
| phương pháp | `NOTES-01 §B13`: "Platt / Logistic calibration"; `RP §3 B13` thêm "temperature scaling" | Platt + logistic là phương án chính; temperature scaling: biến thể so sánh |
| tham số `a`, `b` | fit trên `calib` | `TBD — chưa đo` |
| kích thước `calib` | cần đủ mẫu ở mỗi khoảng điểm | `TBD` (§3.3) |
| `τ_abstain`, `τ_match` | chọn theo objective precision | `TBD` |

### 6.3 Độ đo

```text
reliability diagram : chia p_hat ra B bins; mỗi bin vẽ (p̄_bin, observed_rate_bin); đường chéo = hoàn hảo
ECE                 = Σ_b (|B_b| / N) · | p̄_b − observed_rate_b |          # B: TBD
Brier               = (1/N) Σ_i (p_hat_i − y_i)²
coverage            = số ca được "recommend" / tổng số ca            # phần còn lại → abstain/hỏi lại (§5 `08-algorithms.md`)
accepted precision  = precision tính TRÊN PHẦN coverage đó — không phải trên toàn bộ tập
```

`ECE` và `Brier` **hướng thấp**, `coverage` và `accepted precision` **hướng cao**, và chúng đánh đổi lẫn
nhau — nên bộ năm chỉ số phải báo **cùng nhau**, không chọn một. Lý do `NOTES-01 §B13` nói "selective
prediction là hướng nghiên cứu có cơ sở" chính là chỗ này: cái ta báo là một **đường trade-off**, không
phải một điểm.

### 6.4 Objective ví dụ (minh hoạ, không phải kết quả)

`NOTES-01 §B13` nêu ví dụ objective, và con số đi kèm là **của nguồn nêu để minh hoạ phương pháp**, **không
phải kết quả đo của nhóm**:

> Ví dụ objective: `accepted precision ≥ 90%` → đo được `coverage = 72%` (bỏ 28% ca khó để phần còn lại
> đáng tin). — `NOTES-01 §B13`, số minh hoạ phương pháp.

```text
objective của nhóm (chờ GVHD duyệt):  accepted precision ≥ X%   →  coverage = TBD
X: TBD — 90% chỉ là giá trị ví dụ mà §B13 nêu để minh hoạ phương pháp, không phải mục tiêu đã cam kết
```

Bảng phải nộp khi có số (`TBD — chưa đo` toàn bộ):

| τ | accepted precision | coverage | ECE | Brier | số ca abstain | số ca hỏi lại giải quyết được sau khi hỏi |
|---|---|---|---|---|---|---|
| … | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` | `TBD` |

Cột cuối là chỗ S2 chứng minh nó **giúp** chứ không chỉ **làm chậm**: abstention chỉ có giá trị nếu phần lớn
ca hỏi rồi thì trả lời đúng.

---

## 7. Bias probe cho F5 (S12)

### 7.1 Vấn đề

F5 đưa nhận xét của quản lý vào `machineScore`. ADR-013 chỉ ra lỗi không sửa được nếu để LLM sinh điểm:
"**Trội lên kết quả thật** — câu nhận xét hoa mỹ có thể điểm cao hơn công việc làm xong thật". Ceiling
(S13, BR-08) **chặn** tác hại đó; S12 **đo** xem nó lớn đến mức nào.

```text
câu hỏi nghiên cứu S12:  suggestedScoreComponent có tương quan với ĐỘ DÀI và CÁCH DIỄN ĐẠT
                        của nhận xét nhiều hơn với kết quả thật không?
```

### 7.2 Thiết kế đo

Ba biến độc lập trên mỗi `evaluations` (`05-data-model.md` §3.7):

| Biến | Cách lấy |
|---|---|
| `len_chars`, `len_tokens` | đo trực tiếp trên `selfReview` / `managerReview` |
| `styleIntensity` | số tính từ/khen + dấu cảm thán + tỷ lệ từ cường độ cao trên tổng từ. Bộ từ điển: `TBD` (danh sách từ do nhóm tự công bố) — đây là một **phép đo do nhóm định nghĩa**, không phải chuẩn ngành `[CẦN NGUỒN]` |
| `objectiveCompletion` | `objectiveCompletionScore` — kết quả thật, **không** phụ thuộc câu chữ |

Biến phụ thuộc: `suggestedScoreComponent`, và `machineScore`.

Ba phép đo, chạy theo thứ tự đó:

```text
(1) tương quan đơn biến
    spearman(suggestedScoreComponent, len_chars)         # Spearman, vì phân bố điểm không giả định tuyến tính
    spearman(suggestedScoreComponent, styleIntensity)
    spearman(machineScore,            objectiveCompletion)   # cái này PHẢI cao hơn rõ rệt

(2) can thiệp tối thiểu (nghiêng về bằng chứng nhân quả hơn tương quan)
    với MỘT công việc cố định (cùng objectiveCompletion), tạo các bản nhận xét
    dài dần / hoa mỹ dần nhưng KHÔNG thay đổi thông tin sự kiện:
       "Hoàn thành module X." → "Hoàn thành module X đúng hạn." → "... xuất sắc, vượt kỳ vọng."
    Δ suggestedScoreComponent trên cùng một sự kiện = độ "bóp méo do câu chữ" của tín hiệu.
    Các bản nhận xét biến thể này là DỮ LIỆU TEST DO NHÓM SOẠN, phải gắn nhãn rõ là vậy.

(3) kiểm tra tác động của trần S13
    tỷ lệ ca bị cắt bởi ceiling(C) (08 §8.3) và suggestedScoreComponent của chúng.
```

### 7.3 Cách kết luận

| Kết quả đo được | Kết luận được phép |
|---|---|
| tương quan với `objectiveCompletion` cao hơn hẳn với `len`/`style` | tín hiệu ngữ nghĩa **có thông tin**, không chỉ là cảm tình câu chữ |
| tương quan với `len`/`style` dương rõ và Δ ở bước (2) đáng kể | **có** thiên kiến câu chữ → `κ` (trần S13) phải đặt thấp, hoặc `w_s` nhỏ, và **phải nêu trong hạn chế** |
| Δ ở bước (2) ≈ 0 nhưng tương quan (1) cao | tương quan đó đến từ **nội dung** (nhận xét dài vì làm nhiều việc) → phải tách bằng bước (2), không được quy cho model |
| `machineScore` và `finalScore` phân kỳ thường xuyên (đọc từ `overrideReason`) | người dùng đang bất đồng với công thức → là phát hiện về `w_c/w_s/w_m`, không phải về model |

Ba điều **không** được kết luận: (a) không có thiên kiến không có nghĩa F5 **công bằng** — chỉ là một nguồn
thiên kiến đã được loại; (b) không suy ra "AI chấm giống người" từ tương quan cao, vì cả hai cùng đọc một
đoạn văn; (c) không dùng kết quả để chứng minh `w_s` nên tăng — `w_s` là quyết định nghiệp vụ của GVHD.

Quy mô mẫu của probe: `TBD` (phụ thuộc số `evaluations` sinh được từ `make demo` và số kỳ đánh giá đã chạy).
**Không** có kết quả nào ở mục này cho tới khi F5 chạy thật: `TBD — chưa đo`.

---

## 8. Datasheet + Model Card (S5)

`RP §9` S5: khung tài liệu cho **từng** mô hình (dữ liệu, giới hạn, thiên kiến, cách eval). Mục đích khoa
học: mọi con số trong báo cáo truy vết được nguồn gốc mô hình đã sinh ra nó. Một card/một mô hình, đúng mẫu:

```text
# Model Card — <tên model>            (mẫu trắng, chưa điền)
1. Danh tính    : checkpoint, version/commit, framework + version, số chiều vector
2. Nguồn gốc    : ai train, trên dữ liệu gì, paper/repo mô tả
3. Licence      : giấy phép của CHÍNH checkpoint này (không phải của paper gốc)
4. Cách dùng    : yêu cầu tiền xử lý, context length, CPU/GPU, dung lượng
5. Giới hạn     : domain train, ngôn ngữ/đa ngôn ngữ, tác vụ không phù hợp
6. Thiên kiến   : phát hiện đã biết + phát hiện nhóm đo được (§7 nếu liên quan F5)
7. Eval trong đề tài này : dataset, protocol, metric, bảng số, cấu hình máy
8. Không dùng cho : tuyên bố rõ những gì mô hình này không được dùng để quyết định
```

| Model | Dimension | Params | Licence theo `NOTES-01 §B5` | **Trạng thái xác minh** |
|---|---|---|---|---|
| `PhoBERT-base` (`vinai/phobert-base`) | `TBD` — nguồn **không** nêu | ~135M | "bản gốc công bố MIT" | **chưa xác minh cho checkpoint** — nguồn yêu cầu: "phải kiểm tra đúng checkpoint trước khi ghi licence; model repo khác có thể có điều kiện khác". Không có URL → `[CẦN NGUỒN]` |
| `PhoBERT-large` | `TBD` | ~370M | như trên | **chưa xác minh** `[CẦN NGUỒN]` |
| `multilingual-e5-small` | **384** | ~118M | MIT | số liệu từ `§B5`, **trang HuggingFace chưa có URL** trong notes → `[CẦN NGUỒN]`; bản ONNX/int8 "nhỏ hơn đáng kể" cũng **chưa có số** → `TBD` |
| `paraphrase-multilingual-MiniLM-L12-v2` | **384** | `TBD` | `TBD` | **chưa xác minh** — nguồn chỉ nêu "~50 ngôn ngữ, vector 384 chiều" → `[CẦN NGUỒN]` |
| TF-IDF / BM25 (M1) | — | — | — | không phải model học trước; **quan trọng**: nếu dùng thư viện Python thì phải ghi licence thật, không phải MIT "vì code mở nguồn" |
| LLM provider (`RP`/`NOTES-01 §B6`: Gemini 3.1 Flash-Lite hoặc Groq) | — | — | — | **không công bố params**; phải ghi: context, quota free tier, giá/1M token — **mọi con số §B6 đang thiếu URL** → `TBD` `[CẦN NGUỒN]`. Kèm mục riêng: **dữ liệu nhân sự có được gửi ra service ngoài không** → `RP §7` câu 5 đang chờ GVHD |

Datasheet cho **dữ liệu của nhóm** (§3) phải trả lời thêm: ai tạo, tạo bằng cách nào, có PII thật hay giả
lập (`RP §7` câu 10), license công bố ra sao, giữ bao lâu, cho phép ai dùng lại. Bộ seed của `make demo`
(S14) **không** chứa PII thật cho tới khi GVHD cho phép dữ liệu thật — mặc định an toàn, ghi tại `05-data-model.md` §6.2.

---

## 9. Giới hạn trung thực của phần thực nghiệm

Bảy hạn chế dưới đây **sẽ** xuất hiện trong báo cáo, không phải "nếu có". Viết trước ở đây để hội đồng thấy
nhóm biết mình đo đến đâu.

| # | Hạn chế | Hệ quả thật |
|---|---|---|
| 1 | **Sample nhỏ, tự xây.** §B5: không tồn tại dataset HR tiếng Việt đã xác minh; nhóm phải tự gom | kết luận thống kê yếu, khoảng tin cậy rộng; std có thể lớn hơn chênh lệch giữa hai model → phải báo cả `N` |
| 2 | **Domain giả lập.** `make demo` sinh dữ liệu (200 NV / 30 phòng ban / 1000 đề tài, S14) | phân bố kỹ năng/đề tài là **ước lượng của nhóm**, không phải phân bố doanh nghiệp thật |
| 3 | **Không so được với production.** Không có hệ thống HR thật nào làm chuẩn đối chiếu; hạ tầng free tier (Atlas M0, Render ngủ đông) áp trần hiệu năng | các con số latency/RAM chỉ đúng trên cấu hình đã khai ở §4.4 và **không** phải năng lực hệ thống thương mại |
| 4 | **Nhãn do chính nhóm tạo một phần.** 3 người vừa xây hệ thống vừa tham gia gán nhãn | bias người nhãn ≈ bias thiết kế → giảm bằng 2 người nhãn độc lập + người thứ 3 (§3.6) và ghi rõ tỷ lệ disagreement |
| 5 | **Đo trên CPU, một cấu hình.** §B5 yêu cầu matching chạy CPU được | số latency không ngoại suy sang môi trường khác; bảng §5 phải ghi đúng máy (§4.4) |
| 6 | **Phụ thuộc provider không tất định và có quota.** §B6; ADR-012; ADR-016 | live eval có thể chạy sai trong lúc demo; quality của F3 là thuộc tính của **cặp** (prompt, model, provider) chứ không phải của hệ thống |
| 7 | **Nhiều tham số nghiệp vụ là giả định.** `w_c/w_s/w_m`, `τ_abstain`, `τ_match`, `κ`, `α_r` — chưa có nguồn ngoài (ADR-013: "mọi giá trị phải gắn nhãn giả định của nhóm") | bảng ablation §5.4 và sensitivity là phần duy nhất chứng minh được kết luận không đổi chiều khi đổi trọng số |

Hai điều nhóm **không** tuyên bố, dù nó sẽ là chỗ bị hỏi: (i) rằng F4 "hiểu" kỹ năng — nó so khớp vector
ngữ nghĩa trên chuỗi kỹ năng; (ii) rằng hệ thống công bằng — §7 chỉ đo **một** cơ chế thiên kiến (câu chữ
thắng kết quả).

---

## 10. Việc chặn (blocking items)

| # | Việc chặn | Chặn bởi ai / ở đâu | Chặn phần nào của file này | Mốc phải có |
|---|---|---|---|---|
| 1 | **Metric chính**: F1 (classification) hay P@5/MRR (ranking) | `RP §7` câu 2 — GVHD; `NOTES-01 §B5` "phải chốt với GVHD" | §1.2–§1.3, §2.3, §5.1, và gate §5.2 | trước tuần 5 |
| 2 | **Dataset cuối cùng** cho F4/intent HR + chấp nhận "tự gom + công bố" | `RP §7` câu 3 — GVHD/Khoa | §3.2→§3.6 (kích thước, split, nhãn), §5.1 | trước tuần 5 |
| 3 | **Định nghĩa `suggestedScoreComponent` được tác động bao nhiêu** (trần S13 / `w_s`, `κ`) | `RP §7`; ADR-013 mục mở #1–#2; `04-domain-model.md` Q-08 | §7 (không có công thức thì không có gì để đo bias) | trước tuần 9 |
| 4 | **Được gọi LLM bên thứ ba không**, có ràng buộc gửi dữ liệu nhân sự ra ngoài không | `RP §7` câu 5 — GVHD | §2.4, §5.3 (live eval sang Ollama local nếu bị cấm) | trước tuần 5 |
| 5 | **Dữ liệu thật hay giả lập** | `RP §7` câu 10 | §3.5 seed, §8 PII, §9 hạn chế 2 | trước tuần 2 (B4) |
| 6 | **Atlas Vector Search có trên M0/free hay không** | `NOTES-01` "CẦN BỔ SUNG" mục 4; ADR-005 tự nhận là ADR dễ bị đảo nhất | F3 eval (tỷ lệ từ chối đoán, chất lượng retrieval) — và pipeline RAG nói chung | trước tuần 7 |
| 7 | **URL cho mọi con số B1/B5** (params, 384 dims, PhoATIS/VN-SLU counts, licence checkpoints) | `NOTES-01` "CẦN BỔ SUNG" mục 2 | §3.1, §8 (không URL → không được chép vào báo cáo) | trước tuần 12 |
| 8 | **Cấu hình máy + harness để benchmark latency/RAM** | `RP §3 B1` chưa trả lời 2GB RAM đủ không; `11-quality-testing.md` §9 hàng 9 "công cụ benchmark **TBD**" | §4.4, mọi ô latency/RAM | tuần 9 (B10) |
| 9 | **Số người tham gia gán nhãn / UAT** | nhóm 3 người; UAT với giảng viên + sinh viên đóng vai (`RP §1`) | §3.6 độ tin cậy nhãn, §9 hạn chế 1 & 4 | tuần 9 |
| 10 | **Định dạng báo cáo (B12 = `UNRESOLVED`)** — font, APA/IEEE, cách trình bày bảng số | `NOTES-01 §B12`: **bắt buộc xin GVHD/Khoa** | cách trình bày mọi bảng ở §5–§7 | trước tuần 10 |

Hàng nào chưa có câu trả lời thì hàng đó **giữ nguyên `TBD`**, không điền số "cho có" — theo `RP §0`
nguyên tắc 1 và đúng thông lệ đã ghi ở `11-quality-testing.md` §9.

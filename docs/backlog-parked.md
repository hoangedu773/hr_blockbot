# Backlog parked — các mục bị dời ra ngoài phạm vi

- **Mục đích file:** chống mất dấu. `RESEARCH-PLAN.md` §2 khai báo file này trong bộ docs chuẩn
  ("Ý tưởng bị dời ra ngoài phạm vi + lý do (chống mất dấu)"), và §12 luật 2 bắt buộc: mục S nào không ánh xạ
  được về một user flow thật trong [`18-user-flows.md`](18-user-flows.md) **hoặc** không đo được bằng số thì
  "dời sang `docs/backlog-parked.md` kèm lý do, không giữ trong plan".
- **Ngày:** 13/09/2026.
- **Nguồn duy nhất:** [`docs/research/NOTES-01.md`](research/NOTES-01.md) (batch B0, B1–B15 và phần kết luận),
  [`docs/research/RESEARCH-PLAN.md`](research/RESEARCH-PLAN.md) §7 (câu hỏi phải xin GVHD), §9 (danh mục S1–S14 +
  thang effort), §12 (luật phạm vi), [`README.md`](../README.md) (7 chức năng F1..F7).
- **Không có mục nào trong file này được đưa vào `00-vision-scope.md`, `01-requirements.md` hay
  `16-project-plan.md`** trước khi mục đó qua được "điều kiện để đưa vào scope" ghi ở từng dòng.

## Cách đọc

**Thang effort** lấy nguyên văn `RESEARCH-PLAN.md` §9: `S ≈ 1 buổi`, `M ≈ 2–4 ngày`, `L ≈ 1 tuần`
(tính cho 1 người trong quỹ 12 tuần của nhóm 3 người). Những mục flow (UF-02/03/07/08) **không có effort trong
NOTES-01 lẫn RESEARCH-PLAN** → các con số S/M/L ở đó là **ước lượng của tài liệu này** theo đúng thang §9, dựa
 trên số collection/state/screen phải thêm; chúng không phải số liệu research và không được chép vào báo cáo
như kết quả khảo sát.

**10 câu hỏi GVHD** được viện dưới dạng `§7.n`, tương ứng thứ tự trong `RESEARCH-PLAN.md` §7:

| §7.n | Câu hỏi |
|---|---|
| §7.1 | Backend framework: có được dùng NestJS thay Express không |
| §7.2 | F1 ≥ 85% tính trên bài toán nào (intent classification hay ranking) |
| §7.3 | Khoa yêu cầu dataset tối thiểu bao nhiêu mẫu; có chấp nhận dataset tự gom + công bố không |
| §7.4 | Timeline: 14 mục việc nhưng 12 tuần → mục nào gộp |
| §7.5 | Được gọi API Gemini/OpenAI/Groq không; có ràng buộc gì về gửi dữ liệu nhân sự ra service ngoài |
| §7.6 | Định dạng báo cáo + chuẩn trích dẫn + quy định dùng AI |
| §7.7 | Điểm NCKH: có thiết kế ngay từ đầu theo hướng thực nghiệm so sánh mô hình không |
| §7.8 | Phạm vi sáng tạo: được thêm bao nhiêu ngoài đề cương; ưu tiên hướng thực nghiệm (S2/S3/S12) hay agentic (S6/S7/S10); **duyệt danh sách 5 mục trước tuần 8** |
| §7.9 | Mốc nộp NCKH / hội thảo sinh viên |
| §7.10 | Dữ liệu thật hay giả lập (kèm ràng buộc); ảnh hưởng B4, B10, S4 |

## Bảng tổng hợp

| ID | Mục | Nhóm | Effort | Câu hỏi §7 đang chặn | Căn cứ park |
|---|---|---|---|---|---|
| PARK-01 | UF-02 Nghỉ phép | user flow | **L** (ước lượng) | §7.8, §7.4 | NOTES-01 dòng 47 |
| PARK-02 | UF-03 Onboarding / offboarding | user flow | **L** (ước lượng) | §7.8, §7.10 | NOTES-01 B0 "không đưa vào MVP nếu GVHD chưa duyệt mở scope" |
| PARK-03 | UF-07 Goal/OKR | user flow | **L** (ước lượng) | §7.8, §7.2 | NOTES-01 dòng 47; RESEARCH-PLAN §3 "dễ overlap F5" |
| PARK-04 | UF-08 Pulse survey | user flow | **M → L** (ước lượng) | §7.8, §7.5, §7.10 | NOTES-01 dòng 47; **chưa có bằng chứng sản phẩm** `[CẦN NGUỒN]` |
| PARK-05 | S10 Ask-your-data (NL→aggregation có whitelist) | innovation | **L** (§9) | §7.8, §7.5 | §9 rủi ro "Cao"; §10 chỉ chọn 5, S10 không nằm trong 5 |
| PARK-06 | S7 Deadline-risk early warning | innovation | **M** (§9) | §7.8, §7.4 | §10 "S7 chỉ làm nếu S6 đã chạy"; NOTES-01 đổi thứ tự `S14→S3→S2→S1→S6` |
| PARK-07 | UFoLD + 5 dataset chưa xác minh | dataset / thực nghiệm | **M** (ước lượng) | §7.3, §7.2, §7.9 | NOTES-01 B5: UFoLD là **tên sai**; 5 dataset "chưa tìm được nguồn đủ chắc" |
| PARK-08 | S4 Learning loop (`feedback_events`) | innovation | **M** (§9) | §7.8, §7.10 | §10 không chọn S4; §9 ghi rủi ro "TB (cần dữ liệu sử dụng)" |
| PARK-09 | Fine-tune LLM cho policy QA | AI | **L** (ước lượng) | §7.5, §7.8 | NOTES-01 B6: "Không fine-tune LLM cho policy QA ở baseline" |
| PARK-10 | CASL (ABAC khi trên 2 role) | auth | **S** (ước lượng) | §7.8 | NOTES-01 B3: "Không cần CASL ở MVP với chỉ hai role" |
| PARK-11 | Namespace Socket.IO thứ hai | realtime | **S** (ước lượng) | — | NOTES-01 B7: "Không cần 2 namespace ngay" |
| PARK-12 | ECharts / Ant Design thay shadcn + Recharts | UI | **M** (ước lượng) | — | NOTES-01 B8: "Ant Design… hơi nặng tay"; "Không cần ECharts lúc này" |

---

## PARK-01 — UF-02 Nghỉ phép

| Trường | Nội dung |
|---|---|
| **Tên** | Xin nghỉ phép & duyệt theo cấp (`request → approval → reject/request-change → resubmit → notification`) |
| **Nguồn ý tưởng** | **Personio** — NOTES-01 B0 kết luận: "Personio dùng đúng kiểu này cho leave, attendance và thay đổi dữ liệu nhân viên. Có cả multi-step approval và delegation khi người duyệt vắng." (RESEARCH-PLAN §3 cũng xếp dòng này vào `UF-02 (kéo theo state machine mới trong B4)`.) |
| **Lý do park** | NOTES-01 dòng 47 xếp UF-02 ngoài F1–F7 hiện tại, "tới khi GVHD duyệt". Cost thật không nằm ở form đơn: phải thêm **state machine riêng** (B4 đã chốt `project.status` chỉ lo vòng đời đề tài, và `OVERDUE` bị bác làm state), thêm **collection quota ngày phép** (baseline B4 không có), thêm **màn hình hàng đợi duyệt + delegation**, và nối vào UF-09 vì ngoại lệ "người nhận đang nghỉ phép" của nhắc hạn **đang không có cơ sở dữ liệu để xử lý** (nhánh ngoại lệ UF-09 bước 8 trong `18-user-flows.md`). |
| **Điều kiện để đưa vào scope** | §7.8 phải trả lời **nhóm được thêm bao nhiêu mục ngoài đề cương** và GVHD gật UF-02 là một trong số đó; đồng thời §7.4 phải chốt **mục nào bị gộp khỏi 14 mục việc trong 12 tuần** để lấy chỗ. Sau khi GVHD duyệt → batch B4 phải viết lại (thêm collection + index) rồi mới đến B3 (RBAC cho hành động duyệt) và B6 (thêm tool write `leave` với confirm). |
| **Effort** | **L** (≈ 1 tuần/1 người) — state machine + collection + 2 màn hình + integration UF-09. *Ước lượng của tài liệu này theo thang §9; NOTES-01 không ghi effort cho flow.* |
| **Trạng thái thiết kế** | Đã mô tả 8 bước + sequenceDiagram tại `18-user-flows.md`, mục "UF-02 — Nghỉ phép" |

## PARK-02 — UF-03 Onboarding / offboarding

| Trường | Nội dung |
|---|---|
| **Tên** | Onboarding checklist → cấp tài khoản → đào tạo → theo dõi → đánh giá thử việc; offboarding thu hồi quyền |
| **Nguồn ý tưởng** | **MISA** (e-HR) — NOTES-01 B0: "MISA mô tả checklist, tạo tài khoản, đào tạo, đánh giá thử việc rồi xác nhận/gia hạn/kết thúc." |
| **Lý do park** | Chính văn NOTES-01 B0: "Onboarding là flow đáng lấy làm tham khảo nhưng **không** đưa vào MVP nếu GVHD chưa duyệt mở scope." Ngoài ra flow này đụng trực tiếp phần nhạy cảm nhất của auth: **cấp tài khoản** và **thu hồi quyền** (`users`, `refresh_sessions`, `revokedAt`) trong khi B3 mới chỉ chốt 2 role và refresh-token rotation — thêm onboarding nghĩa là thêm vòng đời bản ghi `users`, chưa được research ở batch nào. |
| **Điều kiện để đưa vào scope** | §7.8 (duyệt mở scope) **và** §7.10 (dữ liệu nhân sự **thật hay giả lập**): nếu phải dùng dữ liệu nhân sự thật thì cấp/thu hồi tài khoản kéo theo ràng buộc PII và quy trình vận hành mà nhóm 3 sinh viên không tự xử được; nếu là dữ liệu giả lập theo S14 thì flow chỉ diễn được ở mức demo. Không có hai trả lời này thì không viết `07-auth-rbac.md` cho vòng đời tài khoản. |
| **Effort** | **L** (≈ 1 tuần/1 người) — checklist engine + provisioning + đánh giá thử việc + offboarding. *Ước lượng của tài liệu này theo thang §9.* |
| **Trạng thái thiết kế** | Đã mô tả 8 bước + flowchart tại `18-user-flows.md`, mục "UF-03 — Onboarding" |

## PARK-03 — UF-07 Goal / OKR

| Trường | Nội dung |
|---|---|
| **Tên** | Goal/OKR: tạo/sửa → gửi duyệt → approve/request-info/reject → publish; OKR cascade công ty → cá nhân |
| **Nguồn ý tưởng** | **Oracle HCM** — NOTES-01 B0: "Oracle HCM cũng dùng bước xác nhận/approval khi AI thay đổi goal" (được dùng làm bằng chứng cho quyết định S8 confirm-before-write). Nhóm "hiệu suất & mục tiêu" (Lattice, 15Five, Culture Amp, Peakon/Workday) mới chỉ xuất hiện ở **danh sách sản phẩm đề xuất điều tra** trong RESEARCH-PLAN §3, **chưa** có kết luận nào được chép vào NOTES-01 cho OKR `[CẦN NGUỒN]`. |
| **Lý do park** | Ba lớp lý do chồng nhau: (1) NOTES-01 dòng 47 xếp UF-07 ngoài F1–F7; (2) RESEARCH-PLAN §3 đánh dấu UF-07 "**dễ overlap F5**" — trong khi `NOTES-01` dòng 533–534 (thứ tự `S14 → S3 → S2 → S1 → S6`, "khoá phần khoa học trước") và RESEARCH-PLAN §12 luật 3 yêu cầu **không mục nào làm mờ F4/F5**, hai chức năng AI mà hội đồng chấm "chất khóa luận"; (3) kết quả goal là đầu vào của `objective completion score` trong deterministic KPI formula (B6) → thêm OKR là đổi **công thức KPI** giữa chừng, ảnh hưởng trực tiếp phần thực nghiệm S12/S13. B4 cũng không có collection `goals`. |
| **Điều kiện để đưa vào scope** | §7.8 (GVHD ưu tiên hướng nào, duyệt danh sách 5 mục trước tuần 8) và §7.2 (F1 ≥ 85% đo trên bài toán nào — vì OKR kéo thêm dữ liệu chấm điểm làm đổi tập đo). Chỉ vào scope nếu GVHD xác nhận **UF-06 vẫn giữ `objective completion score` thủ công** khi không có OKR, để không phải sửa công thức KPI. |
| **Effort** | **L** (≈ 1 tuần/1 người) — collection + phê duyệt + cascade + publish + nối `evaluations`. *Ước lượng của tài liệu này theo thang §9.* |
| **Trạng thái thiết kế** | Đã mô tả 8 bước + flowchart tại `18-user-flows.md`, mục "UF-07 — Goal/OKR" |

## PARK-04 — UF-08 Pulse survey

| Trường | Nội dung |
|---|---|
| **Tên** | Pulse survey / đo mức gắn kết: gửi survey → trả lời → aggregate → dashboard |
| **Nguồn ý tưởng** | **Không có sản phẩm nào được NOTES-01 viện dẫn cho flow này.** Kết luận B0 chỉ trích Personio (workflow duyệt), MISA (self-evaluation, onboarding, policy AI), Oracle HCM (approval khi AI đổi goal). Trong khi đó RESEARCH-PLAN §12 luật 4 yêu cầu: "Mỗi mục thêm phải trích được 'sản phẩm X đang có luồng này' (bằng chứng từ **B0**) — không chấp nhận lý do 'thêm cho đẹp'." → **mục này hiện không đủ điều kiện đề xuất**, phải bổ sung bằng chứng trước `[CẦN NGUỒN]`. |
| **Lý do park** | (1) NOTES-01 dòng 47 xếp ngoài F1–F7; (2) thiếu bằng chứng chuẩn ngành như vừa nêu; (3) ngoại lệ của nó trong B0 — `thiếu sample / anonymous` — là hai ràng buộc **chưa có số nào trong NOTES-01**: ngưỡng tỉ lệ phản hồi tối thiểu chưa định nghĩa, và chế độ ẩn danh xung đột thẳng với mô hình dữ liệu (B4 keyed theo `employeeId`) và với `13-security.md` (PII); (4) NOTES-01 B6 chốt final KPI chỉ đến từ `objective completion score + review semantic signal + manager assessment` → kết quả survey **không có đường vào hợp pháp nào** trong công thức KPI ở baseline. |
| **Điều kiện để đưa vào scope** | §7.8 (duyệt phạm vi sáng tạo) và **hai** câu hỏi dữ liệu: §7.5 (có được gửi nội dung trả lời ẩn danh qua LLM bên thứ ba không) và §7.10 (dữ liệu thật hay giả lập — câu hỏi ẩn danh chỉ có nghĩa khi có người thật trả lời). Đồng thời phải có thêm một mục research B0 kiểu "sản phẩm X có pulse survey, tài liệu ở đây" trước khi ghi vào `00-vision-scope.md`. |
| **Effort** | **M** cho vòng tối thiểu (template + phiếu + aggregate + 1 chart dashboard); **L** nếu bật ẩn danh + kiểm soát suy ngược cá nhân. *Ước lượng của tài liệu này theo thang §9.* |
| **Trạng thái thiết kế** | Đã mô tả 8 bước + flowchart tại `18-user-flows.md`, mục "UF-08 — Pulse survey" |

## PARK-05 — S10 Ask-your-data (NL→aggregation có whitelist)

| Trường | Nội dung |
|---|---|
| **Tên** | "KPI tháng 9 phòng Dev" → LLM chỉ được **chọn template đã duyệt**, không sinh pipeline Mongo tự do → trả biểu đồ |
| **Nguồn ý tưởng** | Ý tưởng S của nhóm trong RESEARCH-PLAN §9, dựa trên kết luận B15: **Vanna** cảnh báo NL→SQL có thể sinh SQL bất kỳ và khuyên credential read-only + row-level security khi expose cho user; NOTES-01 viết "Project mình khoá mạnh hơn" (LLM → choose report template → Zod enum validation → RBAC → server inject user/department scope → predefined aggregation → row cap → timeout → result). |
| **Lý do park** | §9 gắn nhãn rủi ro **"Cao" (bắt buộc whitelist + read-only)** và effort **L**; §10 ghi thẳng: "S10 hay nhưng rủi ro cao và dễ nuốt 1 tuần — **chỉ code khi baseline xong trước tuần 8**". NOTES-01 dòng 533 chốt 5 mục là `S14 → S3 → S2 → S1 → S6` — **S10 không có trong danh sách**. Về nghiệp vụ: S10 không tự ánh xạ về flow nào, nó phải cắm vào UF-06 (intent "so sánh KPI theo tháng", đang `— chưa có tool`) và UF-08 (aggregate survey) — cả hai đầu kia đều đang park. |
| **Điều kiện để đưa vào scope** | §7.8 (GVHD ưu tiên hướng agentic S6/S7/S10 hay hướng thực nghiệm S2/S3/S12, duyệt 5 mục trước tuần 8) **và** mốc §12 luật 1 được đáp ứng: F1–F7 + auth + deploy chạy được **trước tuần 9**. Kèm điều kiện kỹ thuật đã chốt ở B15: chỉ nhận output dạng `{"report": "department_kpi", "departmentId": "DEV", "month": "2026-09"}`, **không** được trả `$lookup`, `$where`, `$function`, collection name hay raw Mongo query — nên cần `06-api-spec.md` khai báo whitelist template **trước khi** code. |
| **Effort** | **L** (§9) |
| **Trạng thái thiết kế** | Whitelist pipeline + ràng buộc đã ghi ở `18-user-flows.md` (UF-08 bước 4, catalog intent #21) |

## PARK-06 — S7 Deadline-risk early warning

| Trường | Nội dung |
|---|---|
| **Tên** | Điểm rủi ro trễ từ nhịp nộp báo cáo + lịch sử chậm + gap kỹ năng (S1) → cảnh báo **trước** khi quá hạn; kèm anomaly (z-score/EWMA) trên chuỗi KPI tuần |
| **Nguồn ý tưởng** | RESEARCH-PLAN §9 nhóm B (agentic). Phần "cảnh báo trước khi quá hạn" bám đúng ngoại lệ của **UF-05** (`quá hạn`) và **UF-09** (`scheduler → tìm item sắp hạn → chống trùng → gửi → ack`) trong NOTES-01 B0; phần "gap kỹ năng" bám card match có `Workload penalty` ở B14 (Personio là sản phẩm B0 viện dẫn cho chuỗi nhắc/duyệt). |
| **Lý do park** | §10: "**S7 chỉ làm nếu S6 đã chạy** (chung hạ tầng scheduler)" — mà S6 là mục cuối cùng trong thứ tự ưu tiên `S14 → S3 → S2 → S1 → S6` của NOTES-01 dòng 533–534 ("khoá phần khoa học trước, agentic feature làm sau"). Rủi ro §9 "TB (phải giải thích được)": điểm rủi ro mà không giải thích được sẽ xung đột trực tiếp với nguyên tắc đã chốt ở B13/B14 (không dùng attention làm giải thích, cosine ≠ xác suất) và với B6 (AI không sinh chỉ số cuối). |
| **Điều kiện để đưa vào scope** | §7.8 (duyệt phạm vi sáng tạo) và §7.4 (timeline — quỹ tuần còn lại sau tuần 9). Điều kiện kỹ thuật bắt buộc: **S6 đã chạy trên Agenda** (B15) **và** có ngưỡng đo được cho "rủi ro" — hiện NOTES-01 chỉ có dữ kiện "quá hạn" dẫn xuất, chưa có **trọng số** nào cho early warning nên chưa đủ điều kiện "đo được bằng số" của §12 luật 2 `[CẦN NGUỒN]`. |
| **Effort** | **M** (§9) |
| **Trạng thái thiết kế** | Chưa có flow riêng — sẽ là nhánh mới của UF-09 khi được duyệt |

## PARK-07 — UFoLD và các dataset HR tiếng Việt chưa xác minh

| Trường | Nội dung |
|---|---|
| **Tên** | Dataset dùng cho bài toán intent/semantic của F4 và chatbot (UFoLD, ViETeDis, VNIntent, Shopee-ITS_VL, UIT-VSPC, NLUI-VN) |
| **Nguồn ý tưởng** | Chính `RESEARCH-PLAN.md` gốc của nhóm — NOTES-01 B5 đánh dấu `(!)` "Sửa mạnh nhất trong plan gốc: mục dataset của B5". |
| **Lý do park** | NOTES-01 B5: **`UFoLD` là TÊN SAI** — "Kết quả công khai nổi bật cho 'UFold' là mô hình dự đoán **cấu trúc RNA**, không liên quan Vietnamese NLP. → **Không đưa vào báo cáo.**" Năm dataset còn lại "**chưa tìm được nguồn đủ chắc** để xác nhận đúng dataset mà plan nói tới → coi như chưa xác minh, không trích." Không có URL (RESEARCH-PLAN §5 bắt buộc 1 URL cho mỗi con số; NOTES-01 đã mất nhóm "Nguồn:" khi paste). Kết luận cuối NOTES-01: "không ghi UFoLD / ViETeDis / VNIntent / Shopee-ITS_VL / UIT-VSPC / NLUI-VN vào docs cho tới khi từng dataset được xác minh". Hai nguồn **đã** xác minh là **PhoATIS** và **VN-SLU 2024**, nhưng PhoATIS thuộc domain **đặt chuyến bay**, chỉ dùng được cho pretraining/baseline intent/chứng minh phương pháp — **không được viết** "PhoATIS là dataset chuẩn để đánh giá HR chatbot". |
| **Điều kiện để đưa vào scope** | Ba câu hỏi §7 phải có trả lời: **§7.3** (Khoa yêu cầu dataset tối thiểu bao nhiêu mẫu; có chấp nhận **dataset HR tự xây + công bố protocol** không — đây là hướng NOTES-01 đã chốt: "Dataset cuối cùng cho HR vẫn nên là HR intent dataset do nhóm tự xây, có protocol rõ ràng"), **§7.2** (F1 ≥ 85% đo bài toán classification hay ranking — quyết định dataset nào là chuẩn đo), **§7.9** (mốc nộp NCKH — quyết định phải **khoá dataset trước tuần mấy**, vì B5 không cho bắt đầu thực nghiệm trước khi chốt: "chưa khoá dataset cuối cùng cho F4 tới khi GVHD trả lời 'F1 ≥ 85% đo bài toán nào'"). Kèm điều kiện pháp lý của chính nguồn đã xác minh: PhoATIS **license cẩn thận** — "nguồn VinAI yêu cầu phục vụ nghiên cứu/giáo dục, không tự ý phân phối lại" → phải ghi ràng buộc này vào `09-ai-evaluation.md` trước khi dùng. |
| **Effort** | **M** (ước lượng: gom + gắn nhãn + protocol cho bộ HR intent dựa trên catalog 28 intent ở B0). *Thang §9; NOTES-01 không ghi effort cho việc xây dataset.* |
| **Trạng thái thiết kế** | 28 intent trong `18-user-flows.md` chính là bộ khung câu test ban đầu cho dataset tự xây |

## PARK-08 — S4 Learning loop (`feedback_events`)

| Trường | Nội dung |
|---|---|
| **Tên** | Admin bấm Đồng ý/Từ chối gợi ý → ghi `feedback_events` → hiệu chỉnh ngưỡng/reranker theo quyết định thật |
| **Nguồn ý tưởng** | RESEARCH-PLAN §9 nhóm A; collection `feedback_events (S4)` đã được liệt kê trong baseline B4 của NOTES-01 |
| **Lý do park** | §9 gắn rủi ro "TB (**cần dữ liệu sử dụng**)"; §10 không chọn S4 vào 5 mục. Không có người dùng thật vận hành trong 12 tuần thì không có feedback để học → không đáp ứng §12 luật 2 ("phải đo được bằng số"). |
| **Điều kiện để đưa vào scope** | §7.10 (**dữ liệu thật hay giả lập**): nếu UAT chỉ với "giảng viên + sinh viên đóng vai" (README §Phạm vi kỹ thuật) thì phải chứng minh được số lượng quyết định đủ để hiệu chỉnh ngưỡng; nếu §7.8 cho phép đưa S4 vào thay mục nào đó trong 5 mục thì mới code. |
| **Effort** | **M** (§9) |

## PARK-09 — Fine-tune LLM cho policy QA

| Trường | Nội dung |
|---|---|
| **Tên** | Fine-tune model tạo câu trả lời chính sách thay vì chỉ RAG |
| **Nguồn ý tưởng** | Hệ quả của hướng RAG ở NOTES-01 B6 (`Policy documents → chunk → embedding → Atlas Vector Search → top-K chunks → LLM → answer + document/version/source`) |
| **Lý do park** | NOTES-01 B6 ghi thẳng: "**Không fine-tune LLM cho policy QA ở baseline.**" Lý do ngầm với hạ tầng B1: cần GPU/chi phí và sẽ phá yêu cầu "trả lời + nguồn" của UF-10 (kiến thức nằm trong weights thì không trích được `document/version/source`), tức phá luôn ngoại lệ "không đủ bằng chứng → từ chối đoán". |
| **Điều kiện để đưa vào scope** | §7.5 (được gọi LLM bên thứ ba và **ràng buộc dữ liệu nhân sự không được gửi ra service ngoài**) — điều kiện này cũng chặn luôn việc upload chính sách nội bộ lên dịch vụ fine-tune. Chỉ xem xét khi kết quả RAG baseline đo ở `09-ai-evaluation.md` dưới ngưỡng và GVHD đồng ý đổi phương án. |
| **Effort** | **L** (ước lượng) *Thang §9; NOTES-01 không ghi effort cho mục này.* |

## PARK-10 đến PARK-12 — mục nhỏ chờ nhu cầu thật

Ba mục cuối **không** xuất phát từ một product HRM nào được NOTES-01 viện dẫn ở B0 — ý tưởng của chúng nằm ở
chính các batch hạ tầng (B3, B7, B8) và được ghi lại ở đây theo đúng tinh thần "chống mất dấu" của §2, nên cột
"nguồn ý tưởng" là **batch** chứ không phải tên sản phẩm.

| ID | Tên | Nguồn ý tưởng | Lý do park (nguyên văn NOTES-01) | Điều kiện vào scope | Effort |
|---|---|---|---|---|---|
| PARK-10 | **CASL** (quyền kiểu ABAC) | B3 | "Không cần CASL ở MVP với chỉ hai role." | Chỉ khi số `role` vượt 2 (không bao giờ dùng `level` để mở rộng quyền — B3 cấm trộn 2 trục); hoặc khi GVHD duyệt thêm vai "trưởng phòng" từ các flow park → §7.8 | **S** (ước lượng) |
| PARK-11 | **Namespace Socket.IO thứ hai** | B7 | "Không cần 2 namespace ngay." | Khi số client room/loại traffic vượt khả năng 1 namespace — chưa có dấu hiệu ở B1/B7 | **S** (ước lượng) |
| PARK-12 | **ECharts** và **Ant Design** | B8 | "Không cần ECharts lúc này."; "Ant Design cũng có dark algorithm/token system tốt nhưng hơi nặng tay nếu muốn UI có bản sắc riêng." | Chỉ khi shadcn/ui + Recharts không vẽ được loại biểu đồ cần cho F6 (biến động KPI) — kiểm chứng ở B9/B10 | **M** (ước lượng) |

---

## Nhóm "bị bác", không phải "chờ duyệt"

Những mục dưới đây **không phải backlog** — NOTES-01 đã research và **bác/đảo ngược** (ký hiệu `(!)`). Chúng
được ghi lại ở đây để báo cáo không chép nhầm thành tính năng bị bỏ ngỏ, và để trả lời câu hỏi "sao không làm"
(RESEARCH-PLAN B0-worksheet Phần 6 mục 3):

| Mục | Kết luận của NOTES-01 |
|---|---|
| **Qdrant** (vector DB riêng) | B1: "Không dựng Qdrant ở baseline. F4 skill matching chạy vector/cosine trong Python FastAPI thay vì tốn thêm một Atlas Vector index → còn dư index cho thử nghiệm sau." |
| **Redis**, **BullMQ**, **Turborepo**, **NestJS**, **LangChain/LangGraph**, **microservice phức tạp**, **Kubernetes** | Kết luận cuối file, dòng 530–531: "**Không thêm ở baseline** … chưa tạo đủ giá trị cho nhóm 3 người / 12 tuần." Lý do từng mục: NestJS chờ xác nhận GVHD (§7.1) và Express đã nằm trong đầu bài (B2); BullMQ cần Redis trong khi Atlas đã có Mongo → chọn Agenda (B15); Turborepo "chỉ thêm khi CI/build thực sự chậm" (B2); Socket.IO 1 instance + MongoDB, không Redis (B7). Bảng đầy đủ ở `18-user-flows.md`, mục "Out of scope (baseline)". |
| **`OVERDUE` là state chính** của đề tài | B4: bác; quá hạn là **dẫn xuất** `dueDate < now AND status NOT IN {COMPLETED, CANCELLED}` |
| **Transaction nhiều collection cho F2** | B1: "Không thiết kế F2 dựa vào transaction nhiều collection"; chuyển sang *atomic conditional update* trên `project.status`/`project.version` |
| **F1 đơn độc làm metric ranking Top-K** | B5: bác; dùng `Precision@1/@3/@5, Recall@5, MRR, nDCG@5 (optional), latency, RAM` |
| **Giải thích matching bằng attention của PhoBERT** | B14: bác; chọn skill-to-skill cosine + leave-one-skill-out |
| **Cho LLM sinh KPI cuối cùng** | B6: bác; AI chỉ tạo `sentiment \| themes \| risk signals \| suggested score component \| explanation`, final KPI do deterministic formula + manager assessment |
| **Cho LLM viết Mongo pipeline tự do** | B15: bác; whitelist template + Zod enum + RBAC + row cap + timeout |
| **Git Flow** | B11: bác; short-lived branches + PR + squash merge |
| **LLM live API eval block mọi PR** | B10: bác; PR dùng mocked deterministic agent tests, live provider evaluation chạy nightly/release |

## Việc phải làm để "xoá park"

1. Gửi `RESEARCH-PLAN.md` §7 cho GVHD — riêng cho file này, câu **§7.2, §7.3, §7.8, §7.9, §7.10** là 5 câu mở
   khoá nhiều mục nhất (§7.8 mở khoá PARK-01/02/03/04/05/06/08).
2. Nhóm bổ sung URL cho phần "CẦN BỔ SUNG" ở cuối NOTES-01 (B1, B5) và tìm bằng chứng sản phẩm cho pulse
   survey (PARK-04) — không có URL thì các mục đó **ở lại backlog vĩnh viễn** theo §5 và §12 luật 4.
3. Chốt catalog tool với GVHD: 2 intent **`Write` mà chưa có tool** trong `18-user-flows.md`
   ("sửa số điện thoại", "gửi nhận xét") hoặc bị loại khỏi chatbot (chuyển sang Web dashboard), hoặc được duyệt
   thêm tool write mới kèm confirm — **không tự đặt tên tool** khi chưa có quyết định.

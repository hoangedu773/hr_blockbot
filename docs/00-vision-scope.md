# 00 — Vision & Scope

Đề tài: **KLCN133 — Xây dựng Chatbot chuyển đổi số quản lý nhân sự** (Khóa luận cử nhân CNTT, HUIT, 2026–2027).
Nguồn đầu bài: [`KLCN133_TranVietHung.docx`](KLCN133_TranVietHung.docx) ·
Bằng chứng research: [`research/NOTES-01.md`](research/NOTES-01.md) ·
Kế hoạch: [`research/RESEARCH-PLAN.md`](research/RESEARCH-PLAN.md)

---

## 1. Vấn đề

Doanh nghiệp nhỏ và vừa phân công việc cho nhân viên qua tin nhắn/chat tay, nên:

- Vòng đời công việc không có trạng thái chính thức → không biết đề tài nào đang ở đâu, cái nào sắp trễ.
- Điểm KPI dựa vào nhận xét chủ quan của cấp trên, không truy vết được vì sao ra con số đó.
- Chính sách nhân sự nằm trong file rời; nhân viên hỏi HR lặp lại cùng một câu.
- Người có kỹ năng phù hợp với đề tài không được nhìn thấy, và người giao việc không có cơ sở để chọn.

## 2. Giải pháp (một câu)

Một nền tảng gồm **Web Dashboard** cho bộ phận Quản lý nhân sự và **Trợ lý ảo Chatbot** là kênh làm việc
hằng ngày của nhân viên, nối với nhau bằng AI (PhoBERT cho matching ngữ nghĩa, LLM + Function Calling
cho tác vụ) và thông báo thời gian thực qua WebSocket.

Hai giao diện không phải hai sản phẩm tách rời: chúng chia sẻ **một nguồn dữ liệu và một tập nghiệp vụ**.
Dashboard là nơi *quản lý và phê duyệt*; chatbot là nơi *làm việc và tra cứu*.

## 3. Người dùng & giá trị

| Vai (`role`) | Dùng để | Giá trị chính |
|---|---|---|
| **Admin** (Quản lý nhân sự) | Dashboard + duyệt trong chat | giao việc có căn cứ, duyệt nhanh, thấy biến động KPI toàn công ty, hiệu chỉnh điểm kèm lý do |
| **Employee** | Chatbot là chính, Dashboard phụ | biết việc của mình & hạn chót, tra KPI/chính sách tức thì, nộp báo cáo tại chỗ, không phải chờ HR trả lời |

Trục thứ hai, **không phải quyền hạn**: `level` = `Intern | Junior | Middle | Senior | Lead`
là dữ liệu nghiệp vụ dùng cho matching và báo cáo. Trộn `level` vào phân quyền là lỗi thiết kế
đã bị loại có chủ đích — xem `03-decision-records/ADR-009`.

## 4. Phạm vi

### Trong phạm vi (bắt buộc — đúng đề cương)

Bảy chức năng F1–F7, ánh xạ sang `01-requirements.md`:

| | Chức năng | User flow |
|---|---|---|
| F1 | Hồ sơ nhân sự, phòng ban, chuẩn hóa 5 cấp bậc | UF-01 |
| F2 | Danh mục & vòng đời đề tài (Khởi tạo → Đã giao → Đang thực hiện → Chờ duyệt → Hoàn thành) | UF-05 |
| F3 | Chatbot nhận diện ý định, tra cứu KPI & chính sách | UF-04, UF-10 |
| F4 | Thuật toán gợi ý phân công theo ngữ nghĩa PhoBERT | UF-04 |
| F5 | Phân tích ngữ nghĩa nhận xét của quản lý → hỗ trợ lượng hóa KPI | UF-06 |
| F6 | Dashboard trực quan biến động KPI, danh mục đề tài & nhân sự | UF-05, UF-06 |
| F7 | Tiếp nhận báo cáo nghiệm thu qua chatbot + nhắc hạn tự động | UF-09 |

Kèm theo: xác thực JWT + Refresh Token Rotation, phân quyền 2 vai, Socket.IO, CI/CD, triển khai lên
Atlas + Render/VPS + Vercel/Netlify, kiểm thử API/giao diện/mô hình và UAT.

### Trong phạm vi (nhóm bổ sung — đã có bằng chứng ngành, cần GVHD duyệt)

Năm mục được chọn theo luật §12 của RESEARCH-PLAN (phải ánh xạ về một UF + đo được bằng số),
thứ tự `S14 → S3 → S2 → S1 → S6`:

| # | Bổ sung | Vì đây là nhu cầu thật, không phải trang trí | Flow/Chức năng |
|---|---|---|---|
| S14 | Bộ seed dữ liệu giả lập có khóa + `make demo` chạy eval in bảng số | Không tái lập thì không phải kết quả thực nghiệm | mọi mục AI |
| S3 | Benchmark 4 phương án embedding trên cùng một tập test | Đề cương bắt PhoBERT nhưng không bắt chứng minh nó là lựa chọn đúng | F4 |
| S2 | Calibration + abstention (không chắc thì hỏi lại) | Giao nhầm việc cho người thiếu kỹ năng là hỏng nghiệp vụ, không chỉ hỏng model | UF-04 |
| S1 | Giải thích gợi ý bằng đóng góp từng kỹ năng | Người duyệt cần lý do để tin hoặc bác một gợi ý | UF-04 |
| S6 | Chatbot chủ động hỏi tiến độ + daily digest cho quản lý | Bỏ việc quản lý đi hỏi tay từng người | UF-09 |

Bốn mục rẻ nhưng làm, không cần duyệt riêng: **S5** (Datasheet + Model Card), **S8**
(confirm-before-write cho tool ghi — Oracle HCM cũng xác nhận khi AI đổi dữ liệu), **S11**
(command palette), **S13** (KPI bị trần bởi kết quả thật, override phải có lý do + log bất biến).

### Ngoài phạm vi — có chủ đích

| Bỏ | Lý do | Điều kiện để mở lại |
|---|---|---|
| UF-02 nghỉ phép & duyệt theo cấp | Ngoài F1–F7; kéo theo state machine + collection mới | GVHD duyệt mở scope |
| UF-03 onboarding/offboarding | Như trên; độ phức tạp bằng một chức năng mới | Như trên |
| UF-07 Goal/OKR | Trùng lấn F5; làm cả hai là loãng phần chấm điểm | Chọn 1 trong 2 sau tuần 8 |
| UF-08 Pulse survey | Không phải nghiệp vụ lõi của đề cương | Có dư lực sau tuần 10 |
| S7 cảnh báo sớm rủi ro trễ | Phụ thuộc hạ tầng nhắc việc của S6 chạy ổn trước | S6 xong + còn quỹ tuần 9–10 |
| S10 hỏi số liệu bằng ngôn ngữ tự nhiên | Rủi ro an toàn dữ liệu cao nhất trong danh sách | Baseline xong trước tuần 8 **và** whitelist template đạt review |
| Voice input hoặc trả lời bằng ảnh/đa phương tiện trong chatbot | Không có trong đầu bài, không có bằng chứng ngành ở vòng research 1 | Có yêu cầu mới từ GVHD |
| NestJS · Redis · BullMQ · Turborepo · Qdrant · LangChain/LangGraph · Kubernetes · chia nhỏ thêm microservice | Chưa tạo đủ giá trị cho nhóm 3 người / 12 tuần; mỗi cái thêm một mặt bằng phải vận hành | CI/build thực sự chậm, hoặc nhu cầu scale thật |

Ghi chú: danh sách "bỏ" này **có giá trị trình bày** — nó cho thấy phạm vi được cắt bằng quyết định,
không phải bằng sự vô tình. Giữ nguyên trong báo cáo.

## 5. Ràng buộc không thương lượng

Trích từ đề cương; mọi thiết kế trái một trong các dòng này phải xin GVHD trước.

- Stack: MERN + TypeScript; lõi AI Python/FastAPI; Socket.IO; pnpm monorepo; MongoDB Atlas M0;
  Render/VPS Ubuntu cho API + AI service; Vercel/Netlify cho client. (**Express.js**, không phải framework khác.)
- Bắt buộc có PhoBERT cho thành phần ngữ nghĩa; LLM theo cơ chế gọi hàm tự động cho hội thoại/tác vụ.
- Chỉ tiêu đo: **F1 ≥ 85%** + Accuracy trên tập thử nghiệm chuẩn → *đang chờ GVHD chốt F1 đo trên bài toán
  nào* (xem `research/RESEARCH-PLAN.md` §7 câu 2 và mục "Việc chặn" ở cuối file này).
- Thời gian 12 tuần: 24/08/2026 → 16/11/2026, nhóm 3 người, gặp GVHD tối thiểu 1 lần/tuần.
- Kiểm thử: API bằng Postman, giao diện bằng Lighthouse, mô hình bằng F1/Accuracy, UAT với người dùng thử.

## 6. Rủi ro lớn nhất của đề tài

| # | Rủi ro | Xác suất | Đánh đổi nếu xảy ra | Giảm thiểu đã ghi vào docs |
|---|---|---|---|---|
| R1 | Không có dataset HR tiếng Việt đạt chuẩn → phần "thực nghiệm" không có chỗ đo | **Cao** | Mất chất khoa học của F4/F5 và cửa NCKH | S14 (seed có khóa) + tự xây HR intent dataset, protocol ghi ở `09-ai-evaluation.md`; PhoATIS chỉ dùng làm baseline ngoài domain |
| R2 | Free tier không gánh được: Atlas M0 0.5 GB / Render sleep 15 phút → WS không tức thì | TB | Demo đứng hình giữa chừng | Không multi-doc transaction; warm-up + health beat; demo luôn bật sẵn phiên; phương án VPS |
| R3 | LLM hết quota giữa kỳ test → mất khả năng demo chatbot | TB | Hỏng đúng phần ấn tượng nhất | S9 graceful degradation về pipeline PhoBERT-only; PR test bằng mocked LLM, live eval chạy nightly |
| R4 | Chạy song song 7 chức năng + 5 mục bổ sung với 3 người / 12 tuần | **Cao** | Trễ cả hai thứ | Luật §12: không mục S nào được code trước khi F1–F7 chạy được ở tuần 9; đóng băng tính năng tuần 11 |
| R5 | Định dạng báo cáo của Khoa chưa có nguồn chính thức (B12 `UNRESOLVED`) | Chắc chắn nếu không hỏi | Mất 0.5đ chỉ vì format | Bắt buộc xin GVHD/Khoa trước tuần 10 — không tự lấy template khoa khác |
| R6 | AI chấm điểm KPI bị cho là thiên kiến | TB | Phản biện xoay quanh F5 | S12 bias probe + S13 counter-weight/ceiling + override có log bất biến; KPI cuối do công thức tất định, AI chỉ gợi ý thành phần |

## 7. Định nghĩa "xong" (Definition of Done của cả đề tài)

Toàn bộ phải đúng đồng thời — thiếu một dòng là chưa xong:

1. Triển khai thật chạy được trên 3 nền tảng cam kết (Atlas / Render hoặc VPS / Vercel hoặc Netlify),
   không chỉ `localhost`.
2. F1–F7 đi hết vòng đời trên dữ liệu thật của hệ thống, không có nút giả.
3. Một nhân viên và một quản lý dùng song song; nhắc hạn tới đúng người, đúng lúc, đúng tần suất
   theo ma trận thông báo ở `18-user-flows.md`.
4. Phần AI có **bảng số thật**: ≥ 2 phương án embedding so trên cùng tập test, kèm latency + RAM;
   metric đúng định nghĩa GVHD đã chốt.
5. `make demo` dựng lại được toàn bộ: dữ liệu seed có khóa + chạy eval in ra đúng bảng đã công bố.
6. CI xanh với các gate đã cam kết ở `11-quality-testing.md` — gate nào không có lệnh chạy thì xóa gate đó.
7. Bộ tài liệu `docs/` khớp với mã nguồn ở ngày nộp (không "docs một đằng, code một nẻo").
8. Quy trình nghiệm thu được trình diễn đúng một lần, end-to-end, qua cả hai kênh chat và dashboard.

## 8. Các bên liên quan & nhịp làm việc

- **GVHD (Trần Việt Hùng)**: duyệt phạm vi bổ sung + chốt metric + cấp template báo cáo.
  Tối thiểu 1 lần/tuần; **trước mỗi buổi báo cáo nhóm phải tích hợp nội dung được phân công vào
  chung một tài liệu/phần mềm** (yêu cầu của đề cương).
- **Nhóm 3 người**: Hoàng · Hòa · Phi. RACI và WBS theo tuần ở `16-project-plan.md`.
- **Hội đồng**: chấm theo thang 10 điểm đã trích ở `research/RESEARCH-PLAN.md` §1 — nơi nặng nhất là
  cài đặt 7 chức năng (3.5đ), vì vậy nó dẫn đường ưu tiên, không phải mục nào "ngầu" hơn.
- **Người dùng thử**: giảng viên + sinh viên đóng vai quản lý nhân sự và nhân viên.

## 9. Việc chặn (blocking) tại thời điểm viết file này

| Chặn bởi | Ảnh hưởng tới | Ai xử lý |
|---|---|---|
| GVHD chưa trả lời §7.2 (F1 đo bài toán nào) | `09-ai-evaluation.md`, metric của F4 | Nhóm gửi thầy |
| GVHD chưa duyệt 5 mục bổ sung | §4 ở trên, `17-innovation-playbook.md` | Nhóm gửi thầy |
| B12 vẫn UNRESOLVED (template + chuẩn trích dẫn) | Hình thức báo cáo = 1.0đ (nội dung 0.5 + định dạng 0.5) | Nhóm xin Khoa |
| URL nguồn cho các con số ở B1/B5 còn thiếu | Mọi bảng số đưa vào báo cáo | Nhóm bổ sung vào `NOTES-01.md` |
| Dữ liệu thật hay giả lập chưa chốt | `05-data-model.md`, seed S14, UAT | Nhóm hỏi thầy |

# NOTES-03 — Vòng 3: pháp lý tiền lương 2026 · thị trường HRM VN · AI/NLP tiếng Việt · workforce ops F&B

Ngày: 2026-10-06 · Người: ZCode (agent research, 4 luồng) · Giờ đã bỏ: ~4h agent + 1h tổng hợp
Trạng thái: PROPOSED (chưa phải yêu cầu nghiệm thu)

Điểm khác vòng 1–2: vòng này **chạy vì hai mục đích** (1) vá nợ `[CẦN NGUỒN]` của vòng 1 ở những chỗ chốt
quyết định (pháp lý 2026, benchmark embedding), (2) nối **ba tuyến công việc** của repo (khóa luận · VietHR
Core · dữ liệu GUTA) — xem `20-project-map-and-direction.md`. Mọi phát hiện dưới đây có URL ở bảng nguồn.

---

## 1. BẢNG NGUỒN

| ID | Loại | Tên chính xác | Đường dẫn đầy đủ | Ngày truy cập | Ghi chú version/ngày | Dùng cho |
|---|---|---|---|---|---|---|
| S01 | chính văn (phổ biến) | Bộ luật Lao động 2019 (45/2019/QH14) | https://thuvienphapluat.vn/van-ban/Lao-dong-Tien-luong/Bo-Luat-lao-dong-2019-333670.aspx | 2026-10-06 | hiệu lực 01/01/2021 | F-04..F-07 |
| S02 | tổng hợp luật | Giới hạn giờ làm thêm (ebh.vn) | https://ebh.vn/tin-tuc/gioi-han-so-gio-lam-them-nguoi-lao-dong | 2026-10-06 | — | F-05, F-06 |
| S03 | tổng hợp luật | Số ngày nghỉ phép năm (ebh.vn) | https://ebh.vn/tin-tuc/quy-dinh-ve-so-ngay-nghi-phep-nam | 2026-10-06 | — | F-07 |
| S04 | chính văn (báo CP) | Nghị định 161/2026: lương cơ sở 2.530.000₫ từ 01/07/2026 | https://baochinhphu.vn/chinh-thuc-tang-luong-co-so-len-2530000-dong-thang-tu-01-7-2026-102260516214238878.htm | 2026-10-06 | ND ký 15/05/2026 | F-01 |
| S05 | tổng hợp luật | Lương tối thiểu vùng 2026 (NĐ 293/2025/NĐ-CP) | https://thuvienphapluat.vn/lao-dong-tien-luong/tu-01012026-chinh-thuc-tang-luong-toi-thieu-tu-706-den-726-250000-den-350000-dongthang-cho-toan-bo--51838.html | 2026-10-06 | hiệu lực 01/01/2026 | F-02 |
| S06 | tổng hợp luật | Trần đóng BHXH/BHYT/BHTN | https://thuvienphapluat.vn/chinh-sach-phap-luat-moi/vn/ho-tro-phap-luat/tu-van-phap-luat/90973/muc-tran-luong-thang-dong-bhxh-bhyt-bhtn-la-bao-nhieu | 2026-10-06 | cập nhật theo Luật Việc làm | F-01, F-02 |
| S07 | chính văn (Cục Thuế tỉnh) | NQ 110/2025/UBTVQH15: giảm trừ gia cảnh 15,5/6,2 triệu từ kỳ thuế 2026 | https://vinhlong.gdt.gov.vn ⚠️ URL chi tiết bài/PDF chưa có | 2026-10-06 | hiệu lực 01/01/2026 | F-03 |
| S08 | chính văn (phổ biến) | NĐ 115/2015/NĐ-CP (hướng dẫn BHXH bắt buộc — Điều 16 thử việc) | https://thuvienphapluat.vn/van-ban/bao-hiem/Nghi-dinh-115-2015-ND-CP-huong-dan-Luat-bao-hiem-xa-hoi-bat-buoc-279974.aspx | 2026-10-06 | vẫn là văn bản thủ tục đang dẫn | F-09 |
| S09 | chính văn | Luật Bảo vệ dữ liệu cá nhân 2025 (91/2025/QH15) | https://thuvienphapluat.vn/van-ban/Bo-may-hanh-chinh/Luat-Bao-ve-du-lieu-ca-nhan-2025-so-91-2025-QH15-625628.aspx · https://vbpl.vn/van-ban/chi-tiet/luat-bao-ve-du-lieu-ca-nhan-so-91-2025-qh15--179252 | 2026-10-06 | thông qua 26/06/2025, hiệu lực 01/01/2026 | F-08 |
| S10 | chính văn (phổ biến) | BLLĐ 2019 Điều 35 (thời hạn báo trước) | https://hethongphapluat.com/bo-luat-lao-dong-2019/dieu-35 | 2026-10-06 | — | F-07 |
| S11 | chính văn (BHXH tỉnh) | Thai sản 6 tháng (Điều 139) | https://danang.baohiemxahoi.gov.vn/tintuc/Pages/bhxh-so-vssid.aspx?CateID=0&ItemID=16038 | 2026-10-06 | — | F-11 |
| S12 | trang giá hãng | MISA AMIS (gói 30 NV) | https://amis.misa.vn | 2026-10-06 | tuyên bố sản phẩm | F-13 |
| S13 | trang giá hãng | 1Office bảng giá | https://1office.vn/bang-gia/ | 2026-10-06 | tuyên bố sản phẩm | F-13, F-14 |
| S14 | trang giá hãng | ACheckin bảng giá | https://acheckin.vn/bang-gia | 2026-10-06 | tuyên bố sản phẩm | F-13 |
| S15 | trang sản phẩm | iPOS HRM (F&B chain) | https://quanlynhansu.ipos.vn/ | 2026-10-06 | tuyên bố sản phẩm | F-13, F-14 |
| S16 | trang sản phẩm | KiotViet chấm công + KiotViet Nhân sự | https://www.kiotviet.vn/huong-dan-su-dung-kiotviet/retail-nhan-vien/quan-ly-cham-cong · https://employee.kiotviet.vn | 2026-10-06 | tuyên bố sản phẩm | F-13, F-14 |
| S17 | tài liệu sản phẩm | Sapo FnB chấm công QR/GPS | https://help.sapo.vn/cham-cong-fnb · https://help.sapo.vn/thiet-lap-qr-cham-cong-va-ca-lam-viec-tren-phan-mem-sapo-fnb | 2026-10-06 | tuyên bố sản phẩm | F-13 |
| S18 | báo chính thống | Base 2.0 "AI-first" (09/2026) | https://nhandan.vn/base-chinh-thuc-gioi-thieu-base-20-nen-tang-moi-cho-ky-nguyen-con-nguoi-va-ai-cung-lam-viec-post989216.html | 2026-10-06 | — | F-14 |
| S19 | ⚠️ tổng hợp bên thứ ba | Bảng giá phần mềm nhân sự (DVTech, 08/2025) | https://dvtech.info.vn/blog/gia-mot-so-phan-mem-nhan-su-tien-luong-nhan-vien-pho-bien-hien-nay-giup-doanh-nghiep-lua-chon-phu-hop-082025.html | 2026-10-06 | blog nhà cung cấp — KHÔNG dùng làm chuẩn ngành | F-13 |
| S20 | report thị trường (bán) | Ken Research: Vietnam HR Technology | https://www.kenresearch.com ⚠️ URL trang con chưa có | 2026-10-06 | con số chưa đọc bản gốc | F-15 |
| S21 | khảo sát chính thức | Thực trạng ứng dụng công nghệ số của DN VN (a2f.business.gov.vn) | https://a2f.business.gov.vn/chi-tiet-tin-tuc/49109-thuc-trang-va-nhu-cau-ung-dung-cong-nghe-so-trong-nghiep-vu-hoat-dong-cua-mot-so-doanh-nghiep-viet-nam | 2026-10-06 | — | F-16 |
| S22 | paper | VN-MTEB (arXiv 2507.21500, 07/2025) | https://arxiv.org/abs/2507.21500 · https://arxiv.org/html/2507.21500v1 | 2026-10-06 | benchmark dịch tự động — proxy | F-18 |
| S23 | paper | Qwen3 Embedding (arXiv 2506.05176) + card 0.6B | https://arxiv.org/abs/2506.05176 · https://huggingface.co/Qwen/Qwen3-Embedding-0.6B | 2026-10-06 | Apache-2.0 | F-18 |
| S24 | model card | vinai/phobert-base-v2 | https://huggingface.co/vinai/phobert-base-v2 | 2026-10-06 | AGPL-3.0, bắt buộc segmentation | F-19 |
| S25 | model card | intfloat/multilingual-e5-small | https://huggingface.co/intfloat/multilingual-e5-small | 2026-10-06 | MIT, ~118M | F-18 |
| S26 | model card | paraphrase-multilingual-MiniLM-L12-v2 | https://huggingface.co/sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2 | 2026-10-06 | Apache-2.0, 117.65M, dim 384 | F-18 |
| S27 | model card | BAAI/bge-m3 | https://huggingface.co/BAAI/bge-m3 | 2026-10-06 | 568M | F-18 |
| S28 | paper | PhoATIS (arXiv 2104.02021) | https://arxiv.org/abs/2104.02021 · https://huggingface.co/datasets/SEACrowd/phoatis | 2026-10-06 | 28 intent, domain du lịch | F-21 |
| S29 | paper | Vietnamese Legal Information Retrieval in QA (arXiv 2409.13699) | https://arxiv.org/html/2409.13699v1 | 2026-10-06 | công thức hybrid BM25+vector | F-22 |
| S30 | trang giá hãng | OpenAI · Gemini · DeepSeek · Alibaba Cloud · Zhipu · Mistral pricing | https://openai.com/api/pricing/ · https://ai.google.dev/pricing · https://api-docs.deepseek.com/quick_start/pricing/ · https://www.alibabacloud.com/help/en/model-studio/billing-for-model-studio · https://docs.z.ai/guides/overview/pricing · https://docs.mistral.ai/inference/pricing/ | 2026-10-06 | giá OpenAI lấy từ kết quả tìm kiếm, chưa fetch trực tiếp | F-23 |
| S31 | dataset card | phamhai/Vietnamese-Function-Calling-Test | https://huggingface.co/datasets/phamhai/Vietnamese-Function-Calling-Test | 2026-10-06 | không công bố kết quả model | F-24 |
| S32 | repo | py_vncorenlp / VnCoreNLP · underthesea | https://github.com/vncorenlp/VnCoreNLP · https://github.com/undertheseanlp/underthesea | 2026-10-06 | underthesea v9.3 chuyển hướng agentic toolkit | F-19 |
| S33 | tài liệu API hãng | 7shifts API (shift/punch/open shift) | https://developers.7shifts.com | 2026-10-06 | tuyên bố sản phẩm | F-26, F-28 |
| S34 | tài liệu API/help hãng | Deputy API + so sánh roster vs timesheet + Deputy AI (beta) | https://developer.deputy.com · https://help.deputy.com | 2026-10-06 | `TIMESHEET_MATCH_ROSTER` | F-26, F-27, F-29 |
| S35 | blog hãng | 7shifts: earned vs actual labor hours | https://www.7shifts.com/blog/track-earned-vs-actual-labor-hours | 2026-10-06 | tuyên bố sản phẩm | F-27 |
| S36 | trang sản phẩm | Toast POS cash reconciliation · Xenia checklist | https://pos.toasttab.com · https://www.xenia.team | 2026-10-06 | tuyên bố sản phẩm | F-30 |
| S37 | trang giá hãng | FastHRM Online (license on-prem) | https://fast.com.vn/bang-gia-phan-mem-quan-ly-nhan-su-fast-hrm-online/ | 2026-10-06 | tuyên bố sản phẩm | F-13 |

Quy tắc đã áp dụng: trang hãng = **tuyên bố sản phẩm** (không phải chuẩn ngành); blog "top phần mềm" (S19)
chỉ dùng cho *giá được bên thứ ba trích dẫn*, độ tin cậy MEDIUM; report bán (S20) không được trích vào báo cáo
khi chưa đọc bản gốc.

---

## 2. Phát hiện

### A. Pháp lý tiền lương — cập nhật 2026 (vá nợ stale của `vietnam-hrm-platform-proposal.md`)

### F-01 — Trần BHXH/BHYT 2026 là 50.600.000₫, không còn 46.800.000₫
- LOẠI: EVIDENCE · NGUỒN: S04, S06 · ĐỘ TIN CẬY: HIGH
- Lương cơ sở **2.530.000₫ từ 01/07/2026** (NĐ 161/2026/NĐ-CP, ký 15/05/2026); con số 2.340.000₫/trần
  46.800.000₫ chỉ đúng tới 30/06/2026. Trần BHTN vùng I = 20× LTTV vùng = **106.200.000₫ từ 01/01/2026**.
- ẢNH HƯỞNG: `vietnam-hrm-platform-proposal.md` L414–417 (quy tắc trần), L597–609 (payroll constants
  `baseSalaryCap: 46_800_000`, `regionalMinWageCap: 99_200_000`) — đã vá kèm ngày hiệu lực (bản vá ghi chú
  "đúng đến 30/06/2026" cho 46,8tr để công thức còn đối chiếu được với kỳ lương quá khứ).

### F-02 — Lương tối thiểu vùng 2026: 5.310.000₫ (vùng I)
- LOẠI: EVIDENCE · NGUỒN: S05 · ĐỘ TIN CẬY: HIGH
- NĐ 293/2025/NĐ-CP hiệu lực 01/01/2026: vùng I **5.310.000₫** / II 4.730.000₫ / III 4.140.000₫ /
  IV 3.700.000₫ (+250k–350k, ~7,1–7,3%). BHTN cap = 20× LTTV vùng.
- ẢNH HƯỞNG: proposal §5.1 (Vùng I 4.960.000 → 5.310.000), payroll engine validation.

### F-03 — Giảm trừ gia cảnh từ kỳ tính thuế 2026: 15,5 triệu / 6,2 triệu
- LOẠI: EVIDENCE · NGUỒN: S07 · ĐỘ TIN CẬY: MEDIUM (nguồn Cục Thuế cấp tỉnh; URL chi tiết bài chưa đủ — xem §4)
- NQ 110/2025/UBTVQH15: bản thân **15.500.000₫/tháng**, người phụ thuộc **6.200.000₫/tháng**, áp dụng **từ kỳ
  tính thuế năm 2026**. Kỳ quyết toán 2025 vẫn 11tr/4,4tr (NQ 954/2020). Biểu 7 bậc 5–35% không đổi.
- ẢNH HƯỞNG: proposal §5.2 — cần bảng giá theo 2 kỳ (2025: 11/4,4 · 2026: 15,5/6,2), engine PIT phải lấy
  tham số theo năm chứ không hardcode.

### F-04 — Điều 20 BLLĐ 2019: HĐXĐTH chỉ ký/gia hạn thêm 1 lần (tổng 2 hợp đồng)
- LOẠI: EVIDENCE · NGUỒN: S01 · ĐỘ TIN CẬY: HIGH
- Proposal đang diễn đạt đúng ("tối đa 02 lần, hết lần 2 → chuyển HĐ không xác định thời hạn", L461). Không cần sửa.

### F-05 — Hệ số làm thêm/đêm: 150/200/300% + đêm +30%; OT đêm cộng thêm 20% (ngày thường) / 27% (cuối tuần, lễ)
- LOẠI: EVIDENCE · NGUỒN: S01, S02 · ĐỘ TIN CẬY: HIGH
- Proposal L451–453 đã ghi đúng hướng (đêm +30%, OT đêm +20%) nhưng **thiếu biến thể +27%** cho OT đêm vào
  ngày nghỉ tuần/lễ. Engine payroll phải đủ 6 hệ số: 150/200/300 × (1) và × (+20%/+27% biến thể đêm).
- ẢNH HƯỞNG: proposal §5.4; (tương lai) payroll engine test matrix.

### F-06 — Trần giờ làm thêm: 40h/tháng, 200h/năm, 300h/năm cho lĩnh vực được liệt kê (NĐ 145/2020)
- LOẠI: EVIDENCE · NGUỒN: S01, S02 · ĐỘ TIN CẬY: HIGH · ẢNH HƯỞNG: proposal §5.4 (đúng, giữ nguyên).

### F-07 — Nghỉ tuần ≥24h liên tục là **Điều 111** (không phải 112); nghỉ ≥12h giữa 2 ca; không có độ dài ca tối thiểu theo luật
- LOẠI: EVIDENCE · NGUỒN: S01, S10 · ĐỘ TIN CẬY: HIGH
- ẢNH HƯỞNG: proposal module chấm công (validation luật); dữ liệu GUTA: validation rule trên `schedule_entries`
  (nếu mở rộng domain ca sau khóa luận — xem `20-project-map-and-direction.md` §3).

### F-08 — Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15 hiệu lực 01/01/2026 (ghi nhận thuần túy)
- LOẠI: EVIDENCE · NGUỒN: S09 · ĐỘ TIN CẬY: HIGH
- Thay thế NĐ 13/2023 (văn bản hướng dẫn mới NĐ 356/2025 — số văn bản UNVERIFIED, xem §4). Phạt tới **5% doanh
  thu năm liền trước**. Dữ liệu GUTA chứa thông tin cá nhân thật (họ tên, số tài khoản của 2.439 người).
- ẢNH HƯỞNG: **không sinh việc** — nhóm chốt 06/10/2026: dữ liệu GUTA là **data đề bài**, dùng nguyên bản,
  không pseudonymize/purge (`20-project-map-and-direction.md` §3). Phát hiện giữ lại chỉ để lưu chứng đối chiếu.

### F-09 — BHXH thử việc: HĐ thử việc riêng KHÔNG thuộc diện bắt buộc; thử việc nằm trong HĐLĐ → đóng từ tháng 1
- LOẠI: EVIDENCE · NGUỒN: S08 · ĐỘ TIN CẬY: MEDIUM (NĐ 115/2015 vẫn hiệu lực cho thủ tục; đang chờ NĐ thực thi Luật BHXH 2024 — số NĐ UNVERIFIED)
- ẢNH HƯỞNG: proposal payroll rules (tab "quy tắc BHXH").

### F-10 — Lương tháng 13 không bắt buộc (thưởng theo Điều 104, ràng buộc nếu ghi trong hợp đồng/chính sách)
- LOẠI: EVIDENCE · NGUỒN: S01 · ĐỘ TIN CẬY: HIGH · ẢNH HƯỞNG: proposal FAQ/benefit config.

### F-11 — Từ 01/07/2026 thai sản con thứ 2 tăng thêm 1 tháng (Luật Dân số 2025)
- LOẠI: EVIDENCE · ĐỘ TIN CẬY: LOW (chỉ từ snippet luatvietnam/bhxh; chưa fetch chính văn) · NGUỒN: S11 (nền Điều 139)
- ẢNH HƯỞNG: proposal leave module — ghi chú "cần xác minh chính văn trước khi cài".

### F-12 — Mẫu D02-LT mới nhất: QĐ 366/QĐ-BHXH (2026), trước đó 1674/QĐ-BHXH (2025)
- LOẠI: EVIDENCE · NGUỒN: S08 (hệ thống văn bản BHXH) · ĐỘ TIN CẬY: MEDIUM · ẢNH HƯỞNG: proposal § reporting —
  engine form phải version hóa theo quyết định, không hardcode một mẫu.

### B. Thị trường HRM Việt Nam (đầu vào cho phần cạnh tranh/kinh doanh đang thiếu của proposal)

### F-13 — Bảng giá công khai HRM VN cho SME (10/2026)
- LOẠI: EVIDENCE · NGUỒN: S12, S13, S14, S15, S16, S17, S37, S19 · ĐỘ TIN CẬY: HIGH (trang giá hãng) / MEDIUM (qua S19)
- MISA AMIS ~1.050.000₫/tháng/30 NV (~35k/người); Base từ 1.000.000₫/tháng/30 tài khoản, tính theo module;
  1Office 40k/60k/150k người·tháng + phí triển khai 5–30tr + khóa 1 năm; ACheckin 25k/40k/49k người·tháng;
  iPOS HRM ~150k/tháng ("5k/ngày") định vị F&B chain; FastHRM on-prem 10.000 USD license + 200 USD/người.
  Dải phổ biến: **chấm công thuần 10–40k · HRM SME 25–60k · suite đa module 100–150k (₫/người/tháng)**;
  chiết khấu trả năm ~19% (Tanca); free tier hiếm.
- ẢNH HƯỞNG: `vietnam-hrm-platform-proposal.md` — phần mô hình kinh doanh còn thiếu hẳn; đã thêm mục nháp §10
  trỏ về NOTES-03 này thay vì bịa số.

### F-14 — AI assistant đã thành chuẩn ở 3 suite lớn, NHƯNG khoảng trống nằm ở chấm công/F&B
- LOẠI: EVIDENCE (tuyên bố sản phẩm) · NGUỒN: S18, S12, S13, S15, S16, S17 · ĐỘ TIN CẬY: HIGH cho sự tồn tại, MEDIUM cho chất lượng
- MISA AVA + AMIS OneAI (09/2025) + Agentwork agentic; Base 2.0 "AI-first" (09/2026); 1Office 1AI + AI Agents.
  ACheckin/iPOS/KiotViet/Sapo chỉ có AI nhận diện khuôn mặt — **không sản phẩm chấm công/F&B nào có chatbot
  hạng nhất**. Tanca, vHRM, iHCM, Bravo: không tìm thấy bằng chứng chatbot (§4).
- ẢNH HƯỞNG: định vị của CẢ HAI sản phẩm — đề tài khóa luận (chatbot HR) không đụng hàng trực tiếp với suite lớn
  ở phân khúc nó chạm (F&B/SME ops); VietHR Core nên đặt AI assistant làm differentiator rõ ràng trong §1.

### F-15 — Quy mô thị trường: 3 ước tính khác nhau (112,9–156 triệu USD 2025), tăng trưởng 6–16%/năm
- LOẠI: EVIDENCE (report bán) · NGUỒN: S20 · ĐỘ TIN CẬY: LOW–MEDIUM (khác định nghĩa HCM/HR tech/core HR; chưa đọc bản gốc)
- Ken Research: 133tr USD (2025) → 376tr (2032), CAGR 16%. **Không trích số nào vào báo cáo khóa luận/proposal
  khi chưa đọc phương pháp đo.** Chỉ dùng để lập luận "thị trường tồn tại và tăng trưởng".

### F-16 — Chỉ ~2,2% doanh nghiệp VN thành thạo phần mềm quản lý phục vụ phân tích/quyết định; ~60,6% đã dùng cloud
- LOẠI: EVIDENCE · NGUỒN: S21 · ĐỘ TIN CẬY: HIGH (nguồn nhà nước) · ẢNH HƯỞNG: proposal §1.1 (headroom thật, có nguồn).

### C. AI/NLP tiếng Việt — đầu vào cho S3/08/09 và risk R1

### F-17 — (trùng F-18, bỏ)

### F-18 — VN-MTEB 07/2025: MiniLM-L12 **rất yếu trên tiếng Việt (46,05)**; e5-small 60,66; bge-m3 64,90; Qwen3-Embedding-0.6B 64,33
- LOẠI: EVIDENCE + RECOMMENDATION · NGUỒN: S22, S23, S25, S26, S27 · ĐỘ TIN CẬY: HIGH cho số benchmark, MEDIUM cho suy luận khuyến nghị
- Bảng VN-MTEB: m-e5-large-instruct 67,99 · e5-Mistral-7B 67,67 · gte-multilingual-base 65,22 · bge-m3 64,90 ·
  **m-e5-small 60,66** · MiniLM-L12 **46,05** (dim 384, 117,65M). Qwen3-Embedding-0.6B (Apache-2.0, 0,6B,
  dim 32–1024): 64,33 multilingual.
- RECOMMENDATION: **giữ nguyên pool 4 mô hình đã cam kết của S3** (TF-IDF/BM25 · PhoBERT mean-pool · e5-small ·
  MiniLM) vì pool đã bị "khoá" vào FR-061/17 — MiniLM giờ là baseline yếu **biết trước là yếu**; ghi prior này
  vào 08/09 làm "expected result", và cân nhắc **thay MiniLM bằng Qwen3-0.6B chỉ khi** RGHD duyệt đổi pool
  (đổi pool sau khi đã viết trong docs = phá cam kết cũ, cần lý do: benchmark từ 2 nguồn độc lập).
- ẢNH HƯỞNG: `08-algorithms.md` M4, `09-ai-evaluation.md` bảng M1–M4, `01-requirements.md` FR-061,
  `17-innovation-playbook.md` §S3.

### F-19 — PhoBERT-base-v2 (135M, AGPL-3.0) bắt buộc word segmentation (py_vncorenlp); BamiBERT không cần (2048 ctx)
- LOẠI: EVIDENCE · NGUỒN: S24, S32 · ĐỘ TIN CẬY: HIGH (card) / UNVERIFIED cho ID paper BamiBERT
- ẢNH HƯỞNG: `08-algorithms.md` pipeline (đã có mục cảnh báo word-segmentation — giữ); giấy phép AGPL của
  phobert-base-v2 cần ghi vào 08 khi chọn checkpoint (base v1 cũng AGPL — kiểm tra license khi pin model).

### F-20 — KHÔNG TỒN TẠI dataset intent tiếng Việt domain HR (đã thử nhiều truy vấn 2023–2026)
- LOẠI: EVIDENCE (null result) · NGUỒN: S28 (bối cảnh) · ĐỘ TIN CẬY: MEDIUM (null result — luôn có thể có dataset chưa index)
- Khẳng định lại R1 của `00-vision-scope.md`: phải **tự xây 28 intents** theo protocol `09-ai-evaluation.md`.
  PhoATIS = domain du lịch/hàng không (28 intent labels — trùng số lượng với catalog đề tài), chỉ dùng làm
  baseline ngoài domain như docs đã quy định.
- ẢNH HƯỞNG: `00-vision-scope.md` R1 (đã đúng — bổ sung bằng chứng), `09-ai-evaluation.md` protocol giữ nguyên.

### F-21 — Sửa hiểu lầm tiềm năng: UIT-ViSFD là ABSA (không phải intent); UIT-ViHSD là hate speech; VN-SLU là spoken SLU
- LOẠI: EVIDENCE · NGUỒN: S28 (phối hợp) · ĐỘ TIN CẬY: HIGH
- ẢNH HƯỞNG: tránh trích nhầm 3 dataset này làm "intent benchmark" trong báo cáo.

### F-22 — Công thức RAG tiếng Việt đã chứng minh trên ~1,29M điều luật: hybrid BM25+vector, chunk ≤256 token theo section, word-segmentation, LLM rerank → Recall@1 0,86 / Recall@10 0,98
- LOẠI: RECOMMENDATION (nguồn EVIDENCE) · NGUỒN: S29 · ĐỘ TIN CẬY: HIGH cho số, áp dụng phải đo lại trên policy ngắn
- ẢNH HƯỞNG: `08-algorithms.md` RAG policy — nâng thiết kế từ "vector search trên 1 index Atlas" thành
  **hybrid BM25 + vector + rerank** (Atlas Search text index + vector index cùng nằm trong cap 3 index của M0:
  1 text + 1 vector vẫn nằm trần). Chốt khi lên plan.

### F-23 — LLM free tier/rẻ cho dev 10/2026: GLM-4.7-Flash (free) · Gemini 2.5 Flash free tier · Qwen free quota 1M token · GPT-5 mini $0.25/$2 · DeepSeek flash $0.15–0.30/$0.60–1.20
- LOẠI: EVIDENCE (trang giá) · NGUỒN: S30 · ĐỘ TIN CẬY: MEDIUM (giá OpenAI từ tìm kiếm, chưa fetch trực tiếp; giá đổi liên tục)
- ẢNH HƯỞNG: R3 của `00-vision-scope.md` (LLM hết quota) giảm nghiêm trọng nhờ free tier đa nhà cung cấp;
  ADR-012 (provider abstraction) càng đúng — pin 1 provider free làm chính + 1 fallback. Chốt provider khi plan.

### F-24 — Dataset `Vietnamese-Function-Calling-Test` tồn tại nhưng KHÔNG công bố kết quả model nào
- LOẠI: EVIDENCE · NGUỒN: S31 · ĐỘ TIN CẬY: HIGH
- ẢNH HƯỞNG: `09-ai-evaluation.md` — có thể thêm gate nhỏ "tool-call pass-rate trên 10–20 case tự viết" khi
  chốt provider; không tin benchmark của ai, tự đo.

### F-25 — Atlas M0 + `$vectorSearch`: vẫn chưa xác minh được từ docs chính thức MongoDB
- LOẠI: INFERENCE · NGUỒN: (thiếu) · ĐỘ TIN CẬY: LOW
- Giả định nền tảng nhất của `02-architecture.md` vẫn đứng ở trạng thái "đang chờ đo thật" (đúng như
  TEMPLATE-NOTES §8 mục 2 đã định). Không có nguồn nào vòng 3 giải quyết được — chỉ có nguồn thứ cấp.
- ẢNH HƯỞNG: giữ nguyên trạng thái `[CẦN ĐO]`; việc đầu tiên khi dựng hạ tầng W7 là test `$vectorSearch` trên M0.

### D. Workforce ops F&B — đầu vào cho dữ liệu GUTA (tuyến C) và tương lai VietHR Core

### F-26 — Data model chuẩn ngành shift: location/area/role · shift template vs scheduled shift · open shift/swap · availability · punch/timesheet/approval
- LOẠI: EVIDENCE (tuyên bố sản phẩm) · NGUỒN: S33, S34, S36 · ĐỘ TIN CẬY: MEDIUM–HIGH (API docs của 3 hãng lớn)
- ẢNH HƯỞNG: `database-design.md` (schema GUTA hiện tại thiếu `shift_template` — ca chỉ là mã `A1/B2` verbatim,
  hợp lệ cho nguyên tắc "không thay đổi dữ liệu", thiếu cho phía ứng dụng); proposal §2.2.

### F-27 — "LỊCH ĐĂNG KÍ" nên mô hình hoá theo **availability/request semantics**, không phải "lịch thứ hai"; report chuẩn ngành = so sánh scheduled vs actual
- LOẠI: EVIDENCE + RECOMMENDATION · NGUỒN: S34 (`TIMESHEET_MATCH_ROSTER`), S35 · ĐỘ TIN CẬY: HIGH cho pattern, MEDIUM cho ánh xạ cụ thể
- Deputy đối soát roster↔timesheet bằng setting; 7shifts/Legend productize "earned vs actual". Schema hiện tại
  (schedule_type = actual/registered trong cùng bảng) **hợp lệ để lưu**, nhưng khi dựng ứng dụng thì phân tích
  coverage/variance là báo cáo, còn "đăng kí" là ý muốn của nhân viên (request), không phải lịch.
- ẢNH HƯỞNG: `database-design.md` §3 (ghi chú ngữ nghĩa), proposal §2.2, `backlog-parked.md` PARK-13.

### F-28 — Quản lý site: tích hợp dùng **stable ID**, tên chỉ display → `store_aliases` là pattern đúng
- LOẠI: EVIDENCE + RECOMMENDATION · NGUỒN: S33, S34 · ĐỘ TIN CẬY: HIGH
- ẢNH HƯỞNG: `database-design.md` §4.3 (khuyến nghị `store_aliases` có tiền lệ ngành, ~20 dòng cần người map).

### F-29 — Deputy AI (beta) gợi ý xếp ca từ availability + nghỉ phép + **hồ sơ đào tạo** — tiền lệ trực tiếp cho "gợi ý phân công" (F4) ở domain shift
- LOẠI: EVIDENCE (tuyên bố sản phẩm) · NGUỒN: S34 · ĐỘ TIN CẬY: MEDIUM
- ẢNH HƯỞNG: `backlog-parked.md` PARK-13 (F&B shift trade) — điều kiện mở lại được củng cố: sau khóa luận,
  mô hình F4 + dữ liệu GUTA đủ để thí điểm "gợi ý ca theo kỹ năng/đào tạo" cho VietHR Core.

### F-30 — Cash-up thuộc POS/ops (Toast/Xenia), training attendance không có chuẩn sản phẩm (Jolt checklist gần nhất)
- LOẠI: EVIDENCE · NGUỒN: S36 · ĐỘ TIN CẬY: MEDIUM
- ẢNH HƯỞNG: `database-design.md` §6 — `cash_counts`/`training_attendance` là side-tables hợp lệ, không ép vào
  domain shift của sản phẩm nào.

---

## 3. Việc cần NGƯỜI quyết — không phải việc của agent

| # | Câu hỏi | Ai trả lời | Chặn file nào | Hạn |
|---|---|---|---|---|
| N1 | Dữ liệu GUTA thật hay tổng hợp cho seed/UAT | Nhóm | **chốt 06/10:** data đề bài → dùng nguyên bản (`20-project-map-and-direction.md` §3) | xong |
| N2 | Metric "F1 ≥ 85%" đo trên bài toán nào (câu hỏi §7.2 cũ) | GVHD | `09-ai-evaluation.md`, gate F4 | tuần 7 (gửi ngay) |
| N3 | Chốt hướng đi 3 tuyến (khóa luận trước · GUTA làm tài nguyên · VietHR Core sau 16/11) | Nhóm 3 người | `20-project-map-and-direction.md` | tuần 7 |
| N4 | Map ~20 dòng `store_aliases` (tên cửa hàng ↔ block code) | Người nắm dữ liệu GUTA | `database-design.md` §4.3 | trước khi dựng báo cáo ca |
| N5 | Duyệt/hủy module Ticket trong `prompt/` (thay S6?) | GVHD + nhóm | `17-innovation-playbook.md`, ADR mới | tuần 8 |
| N6 | Pool S3 giữ MiniLM hay đổi Qwen3-Embedding-0.6B (F-18) | Nhóm + GVHD | FR-061, 08, 09, 17 | trước tuần 10 (khi chạy eval) |

## 4. UNRESOLVED

- URL đầy đủ của bài NQ 110/2025 trên vinhlong.gdt.gov.vn — đã thử: tìm "NQ 110/2025 UBTVQH15 giảm trừ gia cảnh" trên gdt.gov.vn + thuvienphapluat — kết quả: chỉ snippet cấp tỉnh, chưa fetch được trang bài.
- Số văn bản NĐ thực thi Luật BV DLCN (được dẫn là 356/2025/NĐ-CP) — đã thử: tìm trên chinhphu.vn/vbpl.vn — kết quả: chỉ thấy trong tóm tắt bên thứ ba, chưa đối chiếu chính văn.
- Hiệu lực Luật Việc làm 74/2025/QH15 (nguyên liệu trần BHTN) — đã thử: tra Luật Việc làm 2025 — kết quả: các snippet nói 01/01/2026 nhưng chưa fetch chính văn.
- Trang `pbgdpl.haiphong.gov.vn` (hệ số OT đêm +27%) — đã thử: fetch trực tiếp — kết quả: HTTP 500 từ script (không phải link sai; dò lại bằng cách khác).
- Link baotintuc.vn (MISA OneAI) và trang con Ken Research — đã thử: fetch — kết quả: agent trả về chỉ domain; cần dò lại nếu muốn trích.
- Giá OpenAI GPT-5 mini — đã thử: fetch openai.com/api/pricing/ — kết quả: agent lấy từ kết quả tìm kiếm, chưa fetch trực tiếp.
- Atlas M0 hỗ trợ `$vectorSearch` — đã thử: tìm docs MongoDB chính thức + nguồn thứ cấp — kết quả: chỉ nguồn thứ cấp (freetiers.com); cần đo thật trên tài khoản nhóm (đúng §8 của TEMPLATE-NOTES).
- "vnsBERT" — đã thử: 3 truy vấn HF + web — kết quả: không tồn tại; nếu docs nào đang dùng tên này thì là sai tên (kiểm tra: grep docs/ hiện không có — an toàn).

## 5. Danh mục tên riêng (đã kiểm chứng chính tả)

`VN-MTEB` (arXiv 2507.21500) · `BamiBERT` (paper ID UNVERIFIED) · `BGE-M3` · `Qwen3-Embedding-0.6B` ·
`multilingual-e5-small` · `paraphrase-multilingual-MiniLM-L12-v2` · `py_vncorenlp` · `PhoATIS` ·
`UIT-ViSFD (ABSA)` · `UIT-ViHSD (hate speech)` · `VN-SLU (Interspeech 2024)` ·
`Vietnamese-Function-Calling-Test (HF)` · `TIMESHEET_MATCH_ROSTER (Deputy)` · `NQ 110/2025/UBTVQH15` ·
`NĐ 293/2025/NĐ-CP` · `NĐ 161/2026/NĐ-CP` · `Luật 91/2025/QH15` · `QĐ 366/QĐ-BHXH` · `MISA AMIS OneAI` ·
`Base 2.0` · `1Office 1AI` · `iPOS HRM` · `Deputy AI (beta)`.

## 6. Việc agent đã làm sau khi nhận kết quả (đúng TEMPLATE §6)

1. Ghi file này nguyên văn theo template, mọi phát hiện có ID nguồn. 2. Viết `20-project-map-and-direction.md`
(bản đồ 3 tuyến + khung plan phục hồi 6 tuần + sổ quyết định). 3. Vá: `vietnam-hrm-platform-proposal.md`
(header định vị + số pháp lý F-01/F-02/F-03 + mục §10 nháp cạnh tranh/kinh doanh), `database-design.md`
(PII + liên kết research), `00-vision-scope.md` + `16-project-plan.md` (ghi chú cập nhật trạng thái), `README.md`.
4. KHÔNG đụng: `01`, `02`, `04`, `05`, `06`, `07`, `08`, `09` (việc vá của chúng thuộc bước plan — mọi delta đã
   liệt kê ở ẢNH HƯỞNG của từng F-xx, đủ để chốt trong buổi plan).
5. Cập nhật sau phản hồi nhóm (cùng ngày): dữ liệu GUTA xác định là **data đề bài** → bỏ toàn bộ yêu cầu
   pseudonymize/purge; F-08 chuyển thành ghi nhận thuần túy; §3 của `20-project-map-and-direction.md` đổi thành
   "quyết định đã chốt"; N1 đóng.

## 7. Tự kiểm tra trước khi nộp

- [x] Mọi con số có ID nguồn; không dòng nào trong bảng 1 bỏ trống "Đường dẫn" (các ô ⚠️ đã được đăng ký ở §4 kèm cách đã thử).
- [x] Không phát hiện EVIDENCE nào lấy nguồn từ trang marketing (F-14/F-26..F-30 là tuyên bố sản phẩm, đã ghi rõ loại).
- [x] Không chép số liệu minh hoạ làm kết quả đo (F-15 đánh giá LOW, cấm trích vào báo cáo).
- [x] Không đề xuất nào mà không nói phá assumption cũ (F-18 ghi rõ pool đã khoá, F-22 ghi rõ cap index M0).
- [x] UNRESOLVED liệt kê đủ + "đã thử gì".
- [x] Tên riêng đã kiểm chứng (§5).
- [x] File ≤ ~500 dòng.

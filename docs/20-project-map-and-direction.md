# 20 — Bản đồ dự án & định hướng (project map & direction)

Ngày: 2026-10-06 · hôm nay là **tuần 7/12** của khóa luận (24/08–16/11/2026) · còn **6 tuần** tới hạn nộp.
Nguồn bằng chứng: [`research/NOTES-03.md`](research/NOTES-03.md) (vòng 3, có URL) · khảo sát toàn repo cùng ngày.
Trạng thái: **ĐỀ XUẤT ĐỊNH HƯỚNG** — Q2/Q4 đã chốt 06/10 (GUTA là **data đề bài**, giữ nguyên bản); còn chờ nhóm chốt Q1, sau đó bước plan chính thức (`/plan`) cắm chi tiết.

---

## 0. Hợp đồng của bản giao này (brainstorm contract)

- **Outcome:** một bộ tài liệu không còn mâu thuẫn nội bộ, định hướng rõ "làm gì trong 6 tuần còn lại" và
  "hai tuyến còn lại đặt ở đâu", đủ đầu vào cho bước plan.
- **Constraints:** deadline khóa luận 16/11/2026 là ràng buộc cứng duy nhất không đàm phán được; nhóm 3 người;
  rubric chấm điểm nặng nhất ở 7 chức năng (3,5đ); stack khóa luận đã chốt qua 16 ADR; luật phạm vi
  `RESEARCH-PLAN.md` §12 (đóng băng tuần 11, không S-item trước khi F1–F7 chạy).
- **Non-goals:** không viết code; không tự sửa lịch đã ký với GVHD (câu hỏi §7.4 vẫn phải hỏi); không đổi scope
  F1–F7; không quyết thay GVHD những việc thuộc §7 (gửi câu hỏi, không tự trả lời).
- **Acceptance criteria:** (1) mọi mâu thuẫn liên tuyến được gọi tên bằng bảng; (2) mỗi quyết định còn mở có
  người quyết + hạn; (3) khung 6 tuần có gate đo được; (4) các con số pháp lý stale đã được vá kèm nguồn.

## 1. Hiện trạng: ba tuyến công việc sống chung nhưng chưa tài liệu nào nối chúng

| | Tuyến A — Khóa luận KLCN133 | Tuyến B — VietHR Core | Tuyến C — Dữ liệu GUTA |
|---|---|---|---|
| Tài liệu | `00`–`19` + 16 ADR + `backlog-parked.md` (09/2026) | `vietnam-hrm-platform-proposal.md` (18/09/2026) | `database-design.md` + `database-extraction.md` (04–06/10/2026) |
| Sản phẩm | Web dashboard + chatbot AI (PhoBERT + LLM), 2 vai | SaaS HRM đa tenant: chấm công, phép, lương gross-to-net, tuyển dụng, **không AI** | SQLite + Atlas: 2.439 nhân viên, 3.275 dòng lịch ca, chấm công bù, kê tiền — **dữ liệu thật** |
| Stack | MERN+TS · Express · FastAPI · Atlas M0 · Socket.IO | NestJS · PostgreSQL+RLS · Redis/BullMQ · Turborepo | Python scripts (tool, không phải sản phẩm) |
| Trạng thái thật | 0 dòng code; lịch `16-project-plan.md` trễ ~6 tuần | Chỉ là đề xuất; chưa có giá, khách, đội; **4 số pháp lý stale** | Đã trích xuất + import Atlas xong; **PII thật (tên + STK)** chưa có chính sách |

Mâu thuẫn liên tuyến (bắt buộc phải thấy trước khi lên plan):

| Proposal (tuyến B) | Trái với | Nội dung mâu thuẫn |
|---|---|---|
| NestJS | ADR-002 | Khóa luận chốt Express vì đủ dùng, tránh mặt bằng vận hành thêm |
| Turborepo | ADR-001 | Khóa luận chốt pnpm workspace thuần |
| Redis + BullMQ | ADR-011 | Khóa luận chốt Agenda, từ chối Redis |
| 4 vai (có LINE_MANAGER) | ADR-009 + PARK-16 | Khóa luận chốt 2 vai, tách `level` khỏi quyền |
| PostgreSQL RLS, transaction | ADR-004 | Khóa luận chốt Mongo + atomic single-document |
| Không có AI trong MVP | `00-vision-scope.md` §2 | Đề cương bắt buộc chatbot + PhoBERT là lõi |

Kết luận quan trọng: **ba mâu thuẫn stack không phải lỗi của ai** — hai sản phẩm khác nhau, khác ràng buộc.
Lỗi duy nhất là *chưa ghi rõ ranh giới*, khiến repo đọc như một dự án tự mâu thuẫn. Ghi ranh giới là mục đích
của chính file này (§2) và các header đã vá vào `vietnam-hrm-platform-proposal.md`, `00-vision-scope.md`,
`16-project-plan.md`.

Thêm hai việc bị lộ khi khảo sát nhưng chưa nằm trong bất kỳ tài liệu chính thức nào:

1. `prompt/` có runbook 12 bước cho module **Ticket / Service Desk** ("thay S6") — tham chiếu file interview
   không tồn tại, chưa có ADR, chưa ghi trong backlog. Xử lý ở §6/Q5.
2. Dữ liệu GUTA là **data đề bài** — dùng nguyên bản, không biến đổi (quyết định đã chốt 06/10/2026, §3).
   Phát hiện pháp lý liên quan vẫn ghi nhận tại NOTES-03 F-08 với tư cách lưu chứng, **không sinh việc nào**.

## 2. Định hướng khuyến nghị: một gốc, hai nhánh có mốc

**D1 — Khóa luận là đường găng (tuần 7–12):** mọi tài nguyên dồn cho F1–F7 chạy end-to-end + S-items theo thứ tự
S14→S3→S2→S1→S6. Lý do: là cam kết tốt nghiệp, deadline cố định, bộ tài liệu đã chặt đến mức chỉ thiếu code;
rubric nặng nhất đúng phần đang thiếu.

**D2 — Dữ liệu GUTA chuyển từ "tuyến riêng" thành "tài nguyên của tuyến A":** đây là **data đề bài** — dùng
nguyên bản, không biến đổi (§3). Vai trò: (a) corpus seed quy mô thật (2.439 hồ sơ), (b) dữ liệu UAT thực tế
cho UF-01/UF-05, (c) cơ sở trả lời câu hỏi §7.10 (dữ liệu thật hay giả lập). Trong phạm vi khóa luận **không**
dựng domain ca/xếp lịch thành chức năng thứ 8 — đó là PARK-13, giữ nguyên.

**D3 — VietHR Core là lộ trình sau 16/11, có GUTA làm khách thí điểm:** proposal được giữ nguyên như tài liệu
sản phẩm (header đã ghi rõ ngoài phạm vi khóa luận); số pháp lý đã vá về mốc 2026; sau khi khóa luận nộp,
làm plan riêng cho nó và tiếp cận GUTA làm pilot (dữ liệu ca/chấm công của GUTA khớp đúng module 2.2 —
NOTES-03 F-26/F-27/F-29).

### So sánh ba phương án theo kịch bản xấu nhất (không phải kịch bản tốt nhất)

| Phương án | Assumption chịu lực nhất | Sập đầu tiên khi nào | Đánh giá |
|---|---|---|---|
| **A1 (khuyến nghị): khóa luận trước, GUTA làm tài nguyên, VietHR Core hoãn** | Nhóm 3 người dựng được F1–F7 skeleton trong ~3 tuần (đến gate W9) | W9 không đạt gate → cắt S1/S6, thu nhỏ F5 về template | Rủi ro tập trung một chỗ, có thang cắt rõ |
| A2: gộp một codebase — làm VietHR Core như chính khóa luận | GVHD chấp nhận đổi đề tài/ngôn ngữ kỹ thuật | Ngay tuần 7: đề cương bắt chatbot+PhoBERT, proposal không có AI; 5 ADR phải gỡ | Loại — phá đề cương và rubric |
| A3: chạy song song khóa luận + MVP thương mại | 3 người đủ lực duy trì 2 sản phẩm | Tuần 8–9: cả hai dở dang; R4 của `00-vision-scope.md` nhân đôi | Loại — rủi ro kép với 6 tuần |

Trade-off của A1 phải nói thẳng: **cái giá phải trả là nhánh thương mại đứng yên thêm ~2 tháng** (từ 06/10 đến
sau 16/11, cộng thời gian viết báo cáo). Nếu điều đó không chấp nhận được, đó là lý do đổi sang A2/A3 — nhưng
khi đó phải đàm phán lại với GVHD trước, không phải sau.

## 3. Dữ liệu GUTA — quyết định đã chốt (06/10/2026)

Dữ liệu GUTA là **data đề bài**: giữ nguyên bản thật, **không pseudonymize, không purge Atlas, không biến đổi
dữ liệu** — đúng nguyên tắc "dữ liệu gốc giữ nguyên không thay đổi" của `database-extraction.md`. Phát hiện
pháp lý (Luật BV DLCN 91/2025) vẫn nằm trong `research/NOTES-03.md` F-08 với tư cách ghi nhận lưu chứng,
**không sinh việc nào** cho nhóm.

Hai việc còn lại với dữ liệu này (không phải biến đổi dữ liệu):

1. **Store aliases (NOTES-03 F-28) — XONG 07/10/2026:** `scripts/apply_store_aliases.py` tự map 23/24 biến thể
   (7 chấm công bù + 9 kê tiền + 1 đào tạo + 6/7 block code, cross-check `employee_majority_ok` 6/6), verify
   115/115 · 9/9 · 8/8 dòng sự kiện. Chỉ còn block `AB1-B219` chờ người nắm đề bài xác nhận. Chi tiết:
   `database-design.md` §4.3.
2. **Trích xuất → seed:** `export_for_mongo.py` đổ nguyên bản vào Atlas cho seed/UAT của khóa luận (tuyến A).

## 4. Khung plan phục hồi 6 tuần (đầu vào cho bước plan, không thay thế bước plan)

Luật vẫn giữ nguyên: **không S-item nào code trước khi F1–F7 chạy được ở tuần 9; đóng băng tính năng tuần 11.**

| Tuần | Ngày | Bàn giao | Gate đo được |
|---|---|---|---|
| **7** | 06–12/10 | Monorepo scaffold (pnpm, Express+TS, FastAPI, client) · CI · 11 collections + index · JWT+RTR · gửi các câu hỏi chặn GVHD còn lại (Q3, Q5, Q7 — §6) · seed dùng data đề bài GUTA nguyên bản | `pnpm test` xanh trên CI; đăng nhập 2 vai được |
| **8** | 13–19/10 | F1 hồ sơ + F2 vòng đời đề tài (state machine 5 trạng thái) · khung dashboard · Socket.IO nối sự kiện | UF-01, UF-05 đi được qua API; WS nhận event |
| **9** | 20–26/10 | F4 matching MVP (PhoBERT/e5 + workload) · F3 chatbot MVP (intent + tool tra cứu, không ghi) | **GATE LỚN: F1–F7 skeleton chạy end-to-end** — điều kiện để mở S-items |
| **10** | 27/10–02/11 | F5 sentiment→KPI (bản nhỏ nhất) · F7 báo cáo + nhắc hạn · S14 seed có khóa + `make demo` · S3 benchmark chạy thật (4 mô hình, số thật đầu tiên) | Bảng eval có số thật; `make demo` tái lập được |
| **11** | 03–09/11 | S2 (đã nằm trong F4) + S1 giải thích + S6 chủ động hỏi (nếu kịp) · deploy Atlas/Render/Vercel · E2E · UAT · **ĐÓNG BĂNG 09/11** | DoD 1–4 của `00-vision-scope.md` đạt |
| **12** | 10–16/11 | Báo cáo + docs khớp code + diễn tập nghiệm thu cả 2 kênh (DoD 8) | Nộp 16/11 |

Thang cắt khi trễ (theo thứ tự, không tự động — phải báo GVHD): S6 → S1 → F5 thu về chấm theo template tĩnh →
S3 giữ 2 mô hình thay vì 4. S14 và S2 không được cắt (S14 là điều kiện "kết quả thực nghiệm", S2 đã nằm lõi F4).

Chênh lệch so với lịch cũ (`16-project-plan.md`): weeks 1–6 (scaffold→PhoBERT kỳ 2) bị nén còn weeks 7–9.
Điều này **phải được trình GVHD ở buổi gần nhất**, kèm câu hỏi §7.4 — không tự sửa lịch trong docs cũ (đã ghi
chú ở `16-project-plan.md`).

## 5. Delta kỹ thuật chờ bước plan chốt (không tự vá docs 08/09 ngay)

Đã đủ bằng chứng trong NOTES-03, liệt kê để buổi plan quyết:

1. **RAG policy → hybrid BM25 + vector + rerank** (F-22): vẫn nằm trong trần 3 index M0 (1 text + 1 vector).
2. **LLM provider:** pin 1 free tier làm chính (GLM-4.7-Flash hoặc Gemini Flash), 1 fallback trả phí rẻ;
   thêm gate tool-call pass-rate tự đo 10–20 case (F-23, F-24).
3. **Pool S3:** giữ 4 mô hình đã cam kết; MiniLM ghi prior "yếu trên tiếng Việt (46,05)" làm expected result;
   đổi sang Qwen3-Embedding-0.6B chỉ khi GVHD duyệt (F-18).
4. **D2-LT / payroll:** form version hóa theo quyết định BHXH (F-12); PIT tham số hóa theo năm thuế (F-03) —
   thuộc tuyến B, làm sau khóa luận.
5. **`$vectorSearch` trên M0:** test thật ngay tuần 7 khi dựng hạ tầng (F-25) — biến giả định nền của
   `02-architecture.md` thành số đo được.

## 6. Sổ quyết định

| # | Quyết định | Người quyết | Trạng thái | Hạn |
|---|---|---|---|---|
| Q1 | Chọn phương án §2 (mặc định A1) | Nhóm 3 người | chờ chốt | tuần 7 |
| Q2 | Seed khóa luận: dữ liệu nào? | Nhóm | **chốt 06/10:** data đề bài GUTA nguyên bản (§3) | xong |
| Q3 | Metric F1 đo bài toán nào (§7.2) | GVHD | chờ gửi thầy | tuần 7 |
| Q4 | ~~Purge hay tách cluster cho PII GUTA~~ | Nhóm | **đóng 06/10:** không cần — data đề bài, giữ nguyên (§3) | xong |
| Q5 | Module Ticket trong `prompt/`: duyệt (thay S6) hay park | GVHD + nhóm | chờ trình bày | tuần 8 |
| Q6 | Pool S3 giữ/thay MiniLM | Nhóm + GVHD | chờ, trước khi chạy eval | tuần 10 |
| Q7 | Mẫu báo cáo B12 + format Khoa | Khoa/GVHD | UNRESOLVED từ vòng 1 | trước tuần 10 |

## 7. Việc ngay tuần này (không cần chờ plan)

1. Gửi GVHD các câu hỏi chặn còn lại: §7.2 (metric F1), §7.8 (duyệt S-items), B12 (template báo cáo) — đã chờ
   từ vòng 1, mỗi tuần trễ là một tuần kế hoạch đứng.
2. Chốt Q1 trong nội bộ nhóm (một buổi, dùng đúng §2 của file này làm cơ sở) — Q2/Q4 đã chốt 06/10.
3. Test `$vectorSearch` trên Atlas M0 (30 phút) — câu hỏi tồn từ NOTES-01, giờ là điều kiện dựng RAG ở tuần 10.

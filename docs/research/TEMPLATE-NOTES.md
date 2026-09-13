# Mẫu ghi kết quả research (NOTES-0n) — dùng cho mọi vòng sau

Lý do tồn tại: vòng 1 (`NOTES-01.md`) nộp **không một URL nào** (link mất khi paste) → toàn bộ con số hạ tầng
và mô hình trong `docs/` đang phải đánh dấu `[CẦN NGUỒN]`, và một giả định trong đó (Atlas Vector Search trên
M0) vẫn chưa biết đúng hay sai. Vòng 2 (`NOTES-02.md`) có link nên **lần đầu tiên** ta kiểm chứng được.

Vì vậy: **mỗi vòng nộp phải điền đủ mục 1 và 3, nếu không tôi không ingest.**

---

## 0. Header

```markdown
# NOTES-0<n> — <chủ đề>
Ngày: YYYY-MM-DD · Người: · Giờ đã bỏ:
Trạng thái: PROPOSED (chưa phải yêu cầu nghiệm thu) / CONFIRMED
```

## 1. BẢNG NGUỒN — bắt buộc, đặt ở ĐẦU file, không để cuối

Mỗi dòng là một nguồn. Không có dòng nào trong bảng này ⇒ mọi phát hiện dẫn tới nó bị hạ thành "không kiểm chứng".

| ID | Loại | Tên chính xác | Đường dẫn đầy đủ | Ngày truy cập | Version/ngày cập nhật của tài liệu | Dùng cho phát hiện số |
|---|---|---|---|---|---|---|
| S1 | tài liệu hãng / paper / repo / trang sản phẩm / phỏng vấn | | | | | F-01, F-04 |
| S2 | | | | | | |

Quy tắc:
- **Loại "phỏng vấn"** thì thêm: người được hỏi (chức danh), ngày, hình thức, có ghi âm/ghi chú không.
- Trang của hãng tự mô tả tính năng = **tuyên bố sản phẩm**, không phải chuẩn ngành. Ghi rõ trong cột "Loại".
- Tính năng nằm sau **gói trả phí** → chú thích "(paid add-on)" — nó không chứng minh "nghiệp vụ phải thế".
- Trang marketing/list bài "top 10 phần mềm" **không** được tính là nguồn.

## 2. Phát hiện — đánh số F-xx, mỗi phát hiện trỏ về ID nguồn

```markdown
### F-01 — <một câu, đủ để hiểu không cần đọc ngữ cảnh>
- LOẠI: EVIDENCE (nguồn nói vậy) | INFERENCE (tôi suy ra) | RECOMMENDATION (đề xuất)
- NGUỒN: S1
- TRÍCH NGUYÊN VĂN (<= 25 từ, để sau này đối chiếu, đừng chép cả đoạn):
  "..."
- ẢNH HƯỞNG TỚI docs/: 04-domain-model.md §..., 07-auth-rbac.md §...
- ĐỘ TIN CẬY: HIGH / MEDIUM / LOW + lý do vì sao
```

Ba nhãn **EVIDENCE / INFERENCE / RECOMMENDATION** phải có mặt ở mọi phát hiện. Đây là chỗ vòng 1 hay lẫn:
"không nên dùng OVERDUE làm state" là **RECOMMENDATION**, còn "MongoDB đảm bảo atomic ở single document" là
**EVIDENCE** — hai thứ khác nhau về sức nặng, nhưng trong NOTES-01 chúng cùng dạng một dòng gạch đầu dòng.

## 3. Việc cần NGƯỜI quyết — không phải việc của tôi

| # | Câu hỏi | Ai trả lời | Chặn file nào | Hạn |
|---|---|---|---|---|

Đừng tự trả lời hộ GVHD/Khoa. Ghi câu hỏi + chỗ nó chặn là đủ.

## 4. UNRESOLVED — thành phần thật của báo cáo, không phải điểm yếu

```markdown
- <câu hỏi> — đã thử: <tìm ở đâu, bằng từ khoá nào> — kết quả: <rỗng / 403 / trái ngược>
```

Bổn cũ vòng 1: 2 link của NOTES-02 trả **403 từ script** (`selahschools.org`, trang `kb.7shifts.com` bản HTML).
Kiểm tra lại bằng cách khác mới kết luận được — và 403 **không** có nghĩa link sai, thường chỉ là chống bot.
Ghi cả cách đã thử, vì vòng sau khỏi mất công dò lại.

## 5. Danh mục từ mới / tên riêng

Viết **đúng chính tả và có kiểm chứng**: vòng 1 tôi từng điền `UFoLD` vào kế hoạch và nó là tên **sai**
("UFold" thật ra là mô hình dự đoán cấu trúc RNA). Vòng 2 có `Peakon (Workday)`, `1Force` — cần xác nhận lại
xem tên/ngành còn đúng ở thời điểm trích dẫn không. Mọi tên riêng vào báo cáo phải có ID nguồn.

## 6. Những gì tôi (agent) tự làm sau khi nhận file

1. Fetch/kiểm chứng từng ID nguồn trong bảng 1, báo lại link nào không truy cập được.
2. Gán lại nhãn EVIDENCE/INFERENCE/RECOMMENDATION nếu thấy phát hiện bị dán nhãn nhầm.
3. Ghi thành `docs/research/NOTES-0n.md` **nguyên văn** để làm bằng chứng, kèm header của tôi.
4. Viết file đánh giá + quyết định phạm vi (kiểu `19-vertical-workforce-assessment.md`): cái nào LÀM /
   CÂN NHẮC / PARK, và **tại sao PARK** — phần này phải nêu được chi phí phá vỡ cam kết cũ, không chỉ "hết thời gian".
5. Vá vào các file `docs/` liên quan + thêm mục cho `RESEARCH-PLAN.md` §7 nếu phát sinh câu hỏi cho GVHD.
6. Chạy rà soát nhất quán toàn bộ `docs/` (enum, tên tool, event WS, con số, viện dẫn stale).

## 7. Tự kiểm tra trước khi nộp

- [ ] Mọi con số có ID nguồn; không dòng nào trong bảng 1 bị bỏ trống cột "Đường dẫn".
- [ ] Không có phát hiện nào mang nhãn EVIDENCE mà nguồn là trang marketing.
- [ ] Không chép số liệu **minh hoạ format** từ tài liệu khác vào như kết quả đo.
- [ ] Không có tính năng nào được đề xuất mà không nói nó phá assumption cũ nào (đối chiếu §3).
- [ ] UNRESOLVED liệt kê đủ, có "đã thử gì".
- [ ] Tên riêng/dataset đã kiểm chứng chính tả + còn tồn tại.
- [ ] File ≤ ~500 dòng; phần dài thì tách phụ lục. Báo cáo dài làm giảm số dòng được đọc thật sự.

## 8. Vòng 3 nên hỏi gì (định hướng, không bắt buộc)

Theo thứ tự giá trị/chi phí, sau 2 vòng chỉ đọc tài liệu sản phẩm:

1. **Phỏng vấn hiện trạng** ≥1 đơn vị thật (bộ câu hỏi trong NOTES-02 §J1 tốt, dùng lại được) — mục này
   được 0.75đ và hiện **trống**; đồng thời là cách duy nhất để "thêm flow" không phải suy từ vendor.
2. **Đo trên tài khoản thật**: Atlas M0 (Vector Search có hoạt động không, bao nhiêu connection thật),
   Render free (WebSocket có lên được không, sleep bao lâu, mất bao lâu để đánh thức) — tự đo trên tài khoản
   của nhóm, không chép từ diễn đàn → biến các con số `[CẦN NGUỒN]` ở §1.2 của `02-architecture.md` thành
   số đã kiểm chứng.
3. **Chạy thử 1 mô hình** trong catalog S3 trên ~50 cặp (kỹ năng, yêu cầu) tự viết bằng tiếng Việt để biết
   PhoBERT có cần word segmentation thật không, và thời gian suy luận trên CPU của máy nhóm là bao nhiêu.
   Chưa cần đẹp, chỉ cần **có một con số của riêng mình**.

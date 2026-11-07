# Gói tài liệu nguồn để làm báo cáo Word và slide KLCN133

Đây là dữ kiện đã đối chiếu với code, sơ đồ nguồn và hướng dẫn, không phải bản báo cáo hoàn chỉnh. Người ghép tự viết văn, render sơ đồ và chụp ảnh. Mọi chỗ ghi `[CHƯA KIỂM CHỨNG: ...]` là số liệu hoặc hành vi chưa có bằng chứng trong repo, không được tự điền.

| File | Nội dung | Dùng cho |
|---|---|---|
| `01-mo-dau-va-chuong-1-khao-sat.md` | Mở đầu, khảo sát GUTA, kế hoạch 12 tuần | Mở đầu, Chương 1 |
| `02a-chuong-2-phan-tich-yeu-cau-usecase-lop.md` | Yêu cầu, actor, use case tổng, sơ đồ lớp, máy trạng thái | Chương 2 (2.1–2.4) |
| `02b-chuong-2-dac-ta-usecase-uc01-uc07.md` | Đặc tả UC01–UC07 kèm tuần tự và hoạt động | Chương 2 (2.5.1–2.5.7) |
| `02c-chuong-2-dac-ta-usecase-uc08-uc14.md` | Đặc tả UC08–UC14 kèm tuần tự và hoạt động | Chương 2 (2.5.8–2.5.14) |
| `03-chuong-3-thiet-ke-he-thong.md` | Kiến trúc, CSDL, ERD, lớp thiết kế, giao diện, API, bảo mật | Chương 3 |
| `04-chuong-4-thuat-toan-ung-dung.md` | F4, RAG, agent, KPI, nhắc hạn | Chương 4 |
| `05-chuong-5-cai-dat-he-thong.md` | Cài đặt từng chức năng, trích mã thật | Chương 5 |
| `05b-checklist-chup-anh-man-hinh.md` | Bảng ảnh cần chụp và cách chạy local | Chương 5 |
| `06-chuong-6-kiem-thu-trien-khai-ket-luan.md` | Kiểm thử, triển khai, kết luận, tham khảo, phụ lục | Chương 6, Kết luận |
| `07-bang-tong-hop-cho-nguoi-ghep-word.md` | Viết tắt, checklist định dạng Word | Phần đầu và cuối báo cáo |
| `08-dan-y-slide-bao-cao.md` | Dàn ý slide, câu hỏi phản biện, kịch bản demo | PowerPoint |

## Cách dùng

1. Mở file theo thứ tự chương, đọc phần hướng dẫn rồi tự viết văn theo mẫu của Thầy.
2. Sơ đồ nằm trong khối `mermaid`. Dán vào https://mermaid.live để xuất PNG hoặc SVG rồi chèn vào Word.
3. Chụp ảnh theo các dòng `[CHÈN ẢNH: ...]` và bảng ở `05b`.
4. Số liệu 4 dòng lệnh test trong Chương 6 đã được chạy lại: contracts 64/64, ai-service 239 passed 1 skipped.
5. Cột hoặc dòng `Nguồn:` cho biết file repo để truy vết khi GVHD hỏi. Xóa chúng khi dán vào Word.
6. Phần phân công thành viên ở Chương 1 để trống cho nhóm điền.

## Điểm cần nhóm quyết định trước khi nộp

- Hỏi GVHD có chấp nhận báo cáo xếp hạng F4 bằng P@K, Recall@K, MRR thay cho F1 ≥ 85% hay không. Hiện F4 chưa có nhãn human-gold.
- Chốt cách nêu số chi nhánh (45 dùng cho giao diện, 34 sheet gốc, 144 tên đơn vị, 133 outlet thực) như Bảng đối soát ở file 01.
- Định dạng báo cáo của Khoa chưa có văn bản chính thức. Mẫu Times New Roman 13 chỉ là quan sát từ file tham khảo.

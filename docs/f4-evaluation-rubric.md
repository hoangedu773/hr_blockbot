# F4 — rubric đề xuất, CHỜ NGƯỜI DUYỆT

Đây là đề xuất cho thí nghiệm ranking trên dữ liệu hư cấu, không phải quy định đánh giá nhân viên GUTA. Không phải phê duyệt nghiệp vụ, KPI hoặc authorization. Chưa có ai được ghi nhận đã duyệt/chấm trong bộ bàn giao.

## Đối tượng và bằng chứng

Một cặp = **một nhiệm vụ + một ứng viên**. Hai người độc lập chấm cùng200 cặp. Chỉ đọc requiredSkills, mô tả nhiệm vụ và kỹ năng được cung cấp. Không suy từ tên/chức danh/kinh nghiệm không được ghi. Workload là tie-break khi xếp hạng, không phải bằng chứng năng lực nên được ẩn khỏi phiếu; phạm vi/quan hệ quản lý do Node kiểm riêng.

Trước khi chọn mức, người chấm tự đối chiếu **từng yêu cầu**: có bằng chứng đầy đủ, một phần hay chưa có? Với cách diễn đạt tương đương, ghi vì sao nó hỗ trợ yêu cầu; không chỉ thấy vài từ giống nhau rồi coi là tương đương. Mô tả chỉ làm rõ nhiệm vụ, không được dùng để tự thêm kỹ năng cho ứng viên.

| Mức đề xuất | Cách phân biệt | Nội dung lý do cần ghi |
|---|---|---|
| 0 — chưa có bằng chứng phù hợp | Không có bằng chứng hữu ích đáp ứng yêu cầu đã nêu | Nêu bằng chứng nào đã đọc và vì sao chưa hỗ trợ yêu cầu; không kết luận con người kém năng lực ngoài dữ liệu |
| 1 — phù hợp một phần | Có bằng chứng cho một số yêu cầu, hoặc một phần nội dung của yêu cầu, nhưng chưa đủ cho toàn bộ | Ghi rõ phần đã được hỗ trợ và yêu cầu/khía cạnh còn thiếu; không dùng mức1 như chỗ chứa mọi trường hợp phân vân |
| 2 — đủ bằng chứng theo yêu cầu | Tất cả yêu cầu đã nêu đều có bằng chứng; tương đương ngữ nghĩa phải có giải thích của người chấm | Đối chiếu đủ các yêu cầu, chỉ ra bằng chứng/cách diễn đạt tương đương, không suy thêm chứng chỉ hoặc nghiệp vụ |
| Chưa rõ — relevance=null | Dữ liệu hoặc ý nghĩa yêu cầu còn mơ hồ, chưa quyết định được có cơ sở | Ghi câu hỏi trong reason, để chưa chấm; không ép thành0/1 cho đủ số lượng |

Nếu chỉ có một yêu cầu, vẫn có thể phân biệt mức1 (bằng chứng mới hỗ trợ một phần nội dung) với mức2 (hỗ trợ đủ yêu cầu). Nếu nội dung quá chung để phân biệt, giữ null và yêu cầu nhóm làm rõ, không tự đặt điều kiện mới. Nếu các yêu cầu trùng ý/nghĩa mơ hồ, ghi vấn đề để người phụ trách xử lý bằng phiên bản được duyệt, không sửa nguồn trong khi chấm.

Không có đáp án gợi ý theo từng cặp pilot trong tài liệu này. Không dùng LLM, baseline hoặc PhoBERT để tạo nhãn, điền lời xác nhận hay làm trọng tài.

## Đề xuất protocol đi kèm — cũng cần duyệt

Nguồn máy đọc: `apps/ai-service/eval/f4-evaluation-protocol.proposed.json`. Bộ export chứa bản sao byte-identical và SHA256 của nó. Người duyệt cần xác nhận cả rubric **và** các quy ước sau trước khi chấm chính thức:

- Precision@1/@3/@5, Recall@5 và MRR coi nhãn1/2 là relevant; nhãn0 là không relevant. Đây là lựa chọn đề xuất, không suy Precision@K thành F1.
- MRR lấy reciprocal rank của ứng viên relevant đầu tiên trong10 ứng viên.
- NDCG@5 dùng gain `2^relevance-1`, discount `log2(rank+1)`, chia cho DCG lý tưởng trên cùng10 ứng viên.
- Task không có ứng viên relevant: các chỉ số bằng0, vẫn nằm trong macro average; báo riêng số lượng để không giấu ca khó. Đây là quy ước cần duyệt, không phải chứng minh chất lượng mô hình.
- Báo dev/test riêng, cùng candidate pool. Alpha grid0/0,25/0,5/0,75/1; chọn theo dev.NDCG@5, hòa chọn alpha nhỏ hơn. Giữ test cho đánh giá sau khi khóa alpha. Nếu baseline alpha0 thắng thì báo đúng, không ép PhoBERT phải thắng.
- Không có tự phân xử bất đồng. Giữ hai bản chấm độc lập, liệt kê ca bất đồng và chặn benchmark. Quy trình adjudication nếu cần phải được con người duyệt riêng; công cụ hiện chưa tự áp dụng một luật giải quyết mới.

Chỉ thay đổi protocol bằng phiên bản và phê duyệt mới trước khi chấm, không thay tiêu chí sau khi xem kết quả model/test. Người duyệt ghi mã/người, thời gian có múi giờ và tham chiếu phê duyệt thật vào phần rubricApproval; Codex không điền hộ.

## Căn cứ phương pháp

Các metric ở đây do evaluator tính theo định nghĩa ghi rõ, có unit test toán học; không cài hay mặc định dùng `sklearn.ndcg_score`. [Tài liệu NDCG của scikit-learn](https://scikit-learn.org/stable/modules/generated/sklearn.metrics.ndcg_score.html) giải thích discounted gain và chuẩn hóa theo thứ tự lý tưởng; quy ước gain/binary threshold cụ thể của dự án nằm trong protocol cần duyệt, không được ngầm coi mọi thư viện có cùng cấu hình.

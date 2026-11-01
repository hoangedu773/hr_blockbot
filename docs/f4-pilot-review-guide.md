# F4 pilot: hướng dẫn hai người đánh giá độc lập

Đây là bộ dữ liệu **hư cấu**, 20 nhiệm vụ × 10 ứng viên. Không có hồ sơ nhân sự thật. Tài liệu này chuẩn bị đánh giá, không xác nhận rubric/nhãn đã được duyệt và không công bố chất lượng mô hình.

## Trước khi chấm

1. Nhóm/chủ dự án duyệt [rubric chi tiết](f4-evaluation-rubric.md) và protocol JSON đi kèm bằng SHA256. Ghi người duyệt, thời gian có múi giờ và tham chiếu thật vào `rubricApproval` của bản sao `approval.pending.json`. Việc này phải trước khi hoàn tất chấm. Giữ status tổng PENDING đến khi nhãn cũng đã được duyệt. Không sửa trạng thái hoặc judgments trong pilot gốc.
2. Phân công hai người thật, dùng hai mã người đánh giá khác nhau. Mỗi người chỉ nhận packet A hoặc B, không xem nhãn của người kia, xếp hạng baseline/PhoBERT, dev/test hoặc hệ số alpha.
3. Xuất bộ bằng `python eval/prepare_f4_review.py --with-ui --destination <thu-muc-private-moi>` từ thư mục AI service. Không cần Torch/model/Atlas/dịch vụ ngoài. Hai JSON, hai HTML offline, protocol và mẫu phê duyệt được tạo riêng; không ghi đè dữ liệu đã có. Phiếu cũ đợt trước được giữ, chưa có nhãn; dùng bộ mới có fingerprint protocol cho lần chấm sắp tới.

## Dùng phiếu offline

- Người A chỉ nhận reviewer-A.html và JSON A; người B nhận bộ B. Mở HTML bằng trình duyệt; trang không gọi mạng, không tải model, không lưu vào Atlas.
- Mỗi trang nhiệm vụ có10 ứng viên, tổng20 nhiệm vụ. Đọc yêu cầu rồi chọn riêng0/1/2, ghi lý do, tự đánh dấu xác nhận độc lập cho từng cặp đã chấm. Không có nút tự chấm hoặc xác nhận hàng loạt.
- Nếu chưa rõ, không chọn radio và ghi câu hỏi. Bộ đếm chỉ phản ánh đủ trường, không biến null thành0 và không chứng nhận chất lượng nhãn.
- Nhập mã người chấm của chính mình. Chỉ nhập completedAt sau khi thật sự hoàn tất, theo ISO có múi giờ. Không dùng thời gian ví dụ làm thời gian hoàn tất thật.
- Tải JSON bản nháp thường xuyên, giữ phiên bản cũ. Trang không tự lưu; đóng trang khi chưa tải có thể mất dữ liệu trong bộ nhớ. Dùng chức năng nhập JSON để tiếp tục phiếu của chính mình. Phiếu sai slot/nguồn/ID/kỹ năng bị từ chối.
- Nút kiểm tra bàn giao không phê duyệt nhãn và không điền phần còn thiếu. Gửi file JSON cuối, không gửi riêng HTML đã mở vì HTML chứa phiếu trống ban đầu. Phiếu JSON có thể chỉnh bằng trình soạn thảo nếu không dùng UI, vẫn phải giữ dữ liệu nguồn.

## Cách đánh giá từng cặp nhiệm vụ–ứng viên

Chỉ xét yêu cầu, mô tả nhiệm vụ và bằng chứng kỹ năng được cung cấp. Không suy đoán năng lực ngoài dữ liệu. Không dùng chức danh, KPI hoặc tải công việc để gán mức phù hợp kỹ năng. Authorization vẫn là bước độc lập của Node, không phải nhãn relevance này.

Rubric tóm tắt **đề xuất, cần được xác nhận trước khi chấm chính thức/benchmark**, chi tiết ở tài liệu rubric:

- `0`: không có bằng chứng hữu ích đáp ứng yêu cầu, không đánh giá con người ngoài dữ liệu.
- `1`: có phần yêu cầu được hỗ trợ nhưng chưa đủ toàn bộ; ghi cả phần có và thiếu.
- `2`: tất cả yêu cầu có bằng chứng; giải thích cách diễn đạt tương đương, không suy thêm kỹ năng.

Điền `reviewer` bằng mã của mình, `relevance` là số nguyên 0/1/2 và `reason` ngắn cho mỗi ứng viên. Chỉ đặt `independentHumanAttestation: true` khi chính mình đã đánh giá độc lập cặp đó; điền `completedAt` sau khi hoàn tất. `null` là chưa đánh giá, tuyệt đối không chuyển tự động thành 0. Nếu tình huống mơ hồ, ghi lý do và để chưa hoàn tất để nhóm làm rõ, không đoán cho đủ 200 cặp.

Giữ nguyên ID, kỹ năng và yêu cầu. Gói chấm đã ẩn workload, split/scenario và thứ tự ứng viên gốc để giảm thiên lệch. Hai gói không có bất kỳ nhãn sẵn nào.

## Đối chiếu và chuyển nhãn

- Giữ nguyên hai bản chấm gốc và SHA256 nguồn; chỉ đối chiếu sau khi cả hai đã hoàn tất độc lập.
- Kiểm đủ 200 cặp, hai mã người chấm khác nhau, nhãn hợp lệ, lời xác nhận và tính toàn vẹn ID/kỹ năng.
- Nếu bất đồng: lập danh sách từng cặp và lý do. Không tự lấy trung bình, chọn người có chức danh cao hơn, lấy dự đoán mô hình hoặc sửa một bản chấm để làm nhãn giống nhau. Chưa có cơ chế giải quyết được duyệt thì cặp đó và benchmark tiếp tục PENDING.
- Điều phối viên chạy `python eval/compare_f4_reviews.py --reviewer-a <A-final.json> --reviewer-b <B-final.json> --output <comparison-moi.json>`. File đối chiếu có mọi cặp thiếu/bất đồng, hai lý do, source/protocol/file hashes và cờ readyForHumanApproval; cờ này không phải phê duyệt.
- Không sửa judgments/trạng thái của pilot và không gộp tay nhãn vào nguồn. Evaluator mới đọc nguồn không đổi, hai phiếu độc lập và manifest phê duyệt riêng; chỉ sửa hai chuỗi status của dataset không còn mở được benchmark.
- Khi đủ200 cặp hợp lệ, hai mã người chấm khác nhau, toàn bộ lý do/xác nhận, completedAt có múi giờ và không bất đồng, người có thẩm quyền đối chiếu dữ liệu thật rồi tự ghi SHA256 hai file cuối, approvedBy/approvedAt/reference, xác nhận rubric/labels/independentReviews trong bản sao approval.pending.json. Chỉ khi đã duyệt thật mới đổi status tổng thành APPROVED.
- Hash bảo đảm liên kết file, không chứng minh danh tính/con người đã chấm. Chủ dự án phải xác minh người thật và giữ bằng chứng ngoài file. Không được điền tên/thời gian/xác nhận giả để vượt gate. Mốc duyệt rubric phải không sau completedAt; duyệt nhãn không trước khi hai người hoàn tất.

## Chạy benchmark sau khi được xác nhận

`eval/evaluate_f4.py` chặn trước khi load model nếu thiếu/mismatch nguồn, protocol, hai file người chấm hoặc phê duyệt. Kiểm trước bằng `python eval/evaluate_f4.py --reviewer-a <A-final.json> --reviewer-b <B-final.json> --approval <approval-human.json> --check-only`. Check-only không load model hoặc tạo metric. Chỉ chạy chính thức sau khi đầy đủ bằng chứng và preflight tài nguyên đạt.

Alpha chọn trên **dev**, không xem kết quả test để chọn lại. So sánh baseline và tổ hợp semantic trên cùng tập ứng viên. Báo cáo hiện dùng relevance > 0 là relevant cho Precision/Recall/MRR; NDCG dùng mức 0/1/2. Cần xác nhận cách hiểu này cùng rubric trước chạy chính thức; không đổi tiêu chí sau khi xem kết quả. Không quy Precision@K thành F1.

Lưu dataset đã xác nhận, hai phiếu gốc, bằng chứng phê duyệt, hash, revision model/segmenter, phiên bản thư viện, phần cứng và kết quả đầy đủ kể cả trường hợp thua baseline. Latency lõi mô hình, load time và latency CRM đầu-cuối là các phép đo khác nhau.

Alpha khai báo riêng cho test tích hợp chỉ chứng minh kết nối kỹ thuật, không phải alpha tối ưu và không được bật thành mặc định production.

Xem thêm [checklist benchmark và demo](f4-evaluation-checklists.md). Giao diện/công cụ này không kết nối vào hệ thống Role/CRM hoặc tự cấp quyền cho người chấm.

"""In-context knowledge supplied by the project brief, not verified legal policy.

Section labels below are descriptive, not invented official article numbers.
Unspecified thresholds, recipes and KPI formulas must be confirmed with the SM.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class PolicySection:
    id: str
    document: str
    version: str
    article: str
    text: str


POLICIES = (
    PolicySection(
        "attendance", "Nghị định 04/2026/GUTA", "04/2026", "Mục chấm công và ca trực",
        "Theo quy chế nội bộ Guta được cung cấp trong đề bài: đi trễ dưới 15 phút thì nhắc nhở; "
        "trên 15 phút phạt 50.000đ; trên 45 phút tính vắng không phép (mốc trên 45 phút ưu tiên). "
        "Đúng 45 phút vẫn thuộc mốc trên 15 phút, chưa phải trên 45 phút. "
        "Đề bài chưa quy định cách xử lý đúng 15 phút, không tự suy diễn; hỏi SM. "
        "Đổi ca phải báo trước tối thiểu 4 tiếng. Đề xuất đổi ca cần người dùng xác nhận và SM duyệt; "
        "chưa có xác nhận không đồng nghĩa lịch đã đổi. Không khẳng định chế tài tiền là hợp pháp "
        "hoặc tự động khấu trừ lương; đây không phải nghị định của Nhà nước.",
    ),
    PolicySection(
        "cash", "Quy định kiểm quỹ két Guta", "Đề bài 2026-10-25", "Mục kiểm quỹ đầu và cuối ca",
        "Kiểm quỹ két ở đầu ca và cuối ca, đối chiếu tiền thực đếm với số ghi nhận. "
        "Chênh lệch có độ lớn dưới 20.000đ: giải trình ca sau; trên 50.000đ: lập biên bản với SM. "
        "Tiền thừa nộp quỹ dự phòng, không tự ý giữ lại hoặc bù trừ. "
        "Khoảng từ 20.000đ đến 50.000đ, gồm hai mốc bằng, chưa có cách xử lý trong đề bài: "
        "ghi nhận chênh lệch và hỏi SM, không tự đặt chế tài. Giải trình/biên bản chỉ là bản nháp "
        "chờ xác nhận và SM duyệt; không tự ghi sổ hoặc sửa số dư.",
    ),
    PolicySection(
        "barista", "Quy chế thưởng phạt Barista Guta", "Đề bài 2026-10-25", "Mục chuyên cần và KPI ca trực",
        "Mức thưởng chuyên cần là 500.000đ/tháng. Có đánh giá KPI ca trực. "
        "Đề bài chưa cung cấp điều kiện chi tiết nhận thưởng, trọng số, công thức KPI hay mức phạt "
        "khác cho Barista; không tự đặt thêm, không khẳng định một nhân viên đủ điều kiện khi chưa có dữ liệu.",
    ),
    PolicySection(
        "service", "Văn hóa phục vụ và tiêu chuẩn đồ uống Guta", "Đề bài 2026-10-25", "Mục hướng dẫn phục vụ",
        "Hướng dẫn phục vụ: chào hỏi lịch sự, lắng nghe và xác nhận yêu cầu của khách; "
        "tôn trọng khách hàng, phối hợp bàn giao ca rõ ràng. Hướng dẫn đồ uống: tuân thủ công thức "
        "được cửa hàng phê duyệt, giữ vệ sinh dụng cụ và khu vực pha chế, kiểm tra chất lượng nguyên liệu. "
        "Đây là hướng dẫn trong phạm vi đồ án, chưa có tài liệu định lượng chính thức của Guta: "
        "không bịa công thức, định lượng, thời gian phục vụ, thực đơn hay chương trình khuyến mãi hiện hành.",
    ),
)

POLICY_BY_ID = {policy.id: policy for policy in POLICIES}
IN_CONTEXT_POLICY = "\n\n".join(
    f"[{policy.id}] Document: {policy.document}\nVersion: {policy.version}\n"
    f"Article: {policy.article}\n{policy.text}" for policy in POLICIES
)

"""In-context knowledge supplied by the project brief, GUTA operating procedures and forms.

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
    attachment_type: str | None = None
    attachment_url: str | None = None
    attachment_title: str | None = None
    attachment_file: str | None = None


POLICIES = (
    PolicySection(
        "attendance",
        "Nghị định 04/2026/GUTA",
        "04/2026",
        "Mục chấm công và ca trực",
        "Theo quy chế nội bộ Guta được cung cấp trong đề bài: đi trễ dưới 15 phút thì nhắc nhở; "
        "trên 15 phút phạt 50.000đ; trên 45 phút tính vắng không phép (mốc trên 45 phút ưu tiên). "
        "Đúng 45 phút vẫn thuộc mốc trên 15 phút, chưa phải trên 45 phút. "
        "Đề bài chưa quy định cách xử lý đúng 15 phút, không tự suy diễn; hỏi SM. "
        "Đổi ca phải báo trước tối thiểu 4 tiếng. Đề xuất đổi ca cần người dùng xác nhận và SM duyệt; "
        "chưa có xác nhận không đồng nghĩa lịch đã đổi. Không khẳng định chế tài tiền là hợp pháp "
        "hoặc tự động khấu trừ lương; đây không phải nghị định của Nhà nước.",
    ),
    PolicySection(
        "cash",
        "Quy định kiểm quỹ két Guta",
        "Đề bài 2026-10-25",
        "Mục kiểm quỹ đầu và cuối ca",
        "Kiểm quỹ két ở đầu ca và cuối ca, đối chiếu tiền thực đếm với số ghi nhận. "
        "Chênh lệch có độ lớn dưới 20.000đ: giải trình ca sau; trên 50.000đ: lập biên bản với SM. "
        "Tiền thừa nộp quỹ dự phòng, không tự ý giữ lại hoặc bù trừ. "
        "Khoảng từ 20.000đ đến 50.000đ, gồm hai mốc bằng, chưa có cách xử lý trong đề bài: "
        "ghi nhận chênh lệch và hỏi SM, không tự đặt chế tài. Giải trình/biên bản chỉ là bản nháp "
        "chờ xác nhận và SM duyệt; không tự ghi sổ hoặc sửa số dư.",
    ),
    PolicySection(
        "barista",
        "Quy chế thưởng phạt Barista Guta",
        "Đề bài 2026-10-25",
        "Mục chuyên cần và KPI ca trực",
        "Mức thưởng chuyên cần là 500.000đ/tháng. Có đánh giá KPI ca trực. "
        "Đề bài chưa cung cấp điều kiện chi tiết nhận thưởng, trọng số, công thức KPI hay mức phạt "
        "khác cho Barista; không tự đặt thêm, không khẳng định một nhân viên đủ điều kiện khi chưa có dữ liệu.",
    ),
    PolicySection(
        "service",
        "Văn hóa phục vụ và tiêu chuẩn đồ uống Guta",
        "Đề bài 2026-10-25",
        "Mục hướng dẫn phục vụ",
        "Hướng dẫn phục vụ: chào hỏi lịch sự, lắng nghe và xác nhận yêu cầu của khách; "
        "tôn trọng khách hàng, phối hợp bàn giao ca rõ ràng. Hướng dẫn đồ uống: tuân thủ công thức "
        "được cửa hàng phê duyệt, giữ vệ sinh dụng cụ và khu vực pha chế, kiểm tra chất lượng nguyên liệu. "
        "Đây là hướng dẫn trong phạm vi đồ án, chưa có tài liệu định lượng chính thức của Guta: "
        "không bịa công thức, định lượng, thời gian phục vụ, thực đơn hay chương trình khuyến mãi hiện hành.",
    ),
    # GUTA Forms (Biên bản)
    PolicySection(
        "bb_cong_viec",
        "Biên bản bàn giao công việc GUTA",
        "GUTA-BB-CV",
        "Mẫu biểu bàn giao công việc",
        "Mẫu ghi nhận các đầu việc được chuyển giao cùng tình trạng thực hiện. "
        "Mẫu có phần thông tin hai bên (Bên giao và Bên nhận), lý do chuyển giao, danh sách nội dung công việc "
        "cần bàn giao và phần xác nhận ký tên của ba bên (Người giao, Người nhận, Quản lý/Người làm chứng). "
        "Tệp đính kèm chính thức: GUTA_Bien_ban_ban_giao_cong_viec.pdf (tải tại /api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf). "
        "Lưu ý: Không dùng mẫu bàn giao này để thay cho biên bản vi phạm, đi trễ hoặc kỷ luật.",
        attachment_type="pdf",
        attachment_url="/api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf",
        attachment_title="Biên bản bàn giao công việc GUTA",
        attachment_file="GUTA_Bien_ban_ban_giao_cong_viec.pdf",
    ),
    PolicySection(
        "bb_tai_san",
        "Biên bản bàn giao tài sản GUTA",
        "GUTA-BB-TS",
        "Mẫu biểu bàn giao tài sản",
        "Mẫu ghi nhận việc chuyển giao tài sản, máy móc thiết bị và công cụ dụng cụ giữa bên giao và bên nhận tại cửa hàng. "
        "Mẫu có phần thông tin hai bên, lý do bàn giao, danh sách chi tiết tài sản/hiện trạng hoạt động và chữ ký xác nhận của ba bên. "
        "Tệp đính kèm chính thức: GUTA_Bien_ban_ban_giao_tai_san.pdf (tải tại /api/attachments/pdf/GUTA_Bien_ban_ban_giao_tai_san.pdf). "
        "Khi bàn giao ca hoặc thay đổi nhân sự quản lý, hai bên phải kiểm kê thực tế đối chiếu với mẫu biên bản này.",
        attachment_type="pdf",
        attachment_url="/api/attachments/pdf/GUTA_Bien_ban_ban_giao_tai_san.pdf",
        attachment_title="Biên bản bàn giao tài sản GUTA",
        attachment_file="GUTA_Bien_ban_ban_giao_tai_san.pdf",
    ),
    # GUTA Knowledge Base (15 Chunks)
    PolicySection(
        "kb_001",
        "Tài liệu đào tạo GUTA",
        "GUTA-KB-001",
        "Tra cứu tài liệu đào tạo",
        "Tài liệu đào tạo của GUTA chia thành 4 nhóm: tài liệu GUTA Cafe, bộ quy trình cửa hàng GUTA Cafe, "
        "bộ quy trình Bánh Mì 365 và bộ quy trình GUTA Express. Chọn đúng mô hình cửa hàng trước khi mở tài liệu. "
        "Liên hệ bộ phận Đào tạo khi cần hỗ trợ tìm tài liệu chính thức.",
    ),
    PolicySection(
        "kb_002",
        "Danh mục quy trình quy định GUTA",
        "GUTA-KB-002",
        "Tra cứu quy trình, quy định và biểu mẫu",
        "Danh mục trung tâm GUTA tập hợp liên kết về nhân sự (lương thưởng, lịch trả lương, phân cấp, tuyển dụng), "
        "vận hành (KPI, nộp doanh thu, đơn online, hao hụt, gian lận) và biểu mẫu chia thành kế toán và nhân sự.",
    ),
    PolicySection(
        "kb_003",
        "Biểu mẫu nhân sự GUTA",
        "GUTA-KB-003",
        "Tra cứu biểu mẫu nhân sự",
        "Biểu mẫu nhân sự chia theo khối cửa hàng (tuyển dụng, nghỉ phép, chấm công, đề xuất đổi lương/chức danh, "
        "tiếp nhận/nghỉ việc/điều chuyển) và khối văn phòng (đề nghị tuyển dụng, mô tả công việc, đánh giá thử việc, nghỉ phép).",
    ),
    PolicySection(
        "kb_004",
        "Biểu mẫu kế toán GUTA",
        "GUTA-KB-004",
        "Tra cứu biểu mẫu kế toán",
        "Cung cấp 4 loại biểu mẫu: đề nghị tạm ứng, đề nghị hoàn ứng, bảng kê hoàn ứng và đề nghị thanh toán. "
        "Mỗi mẫu có liên kết tải riêng. Khi thiếu mẫu liên hệ Phòng Kế toán Guta.",
    ),
    PolicySection(
        "kb_005",
        "Chính sách lương GUTA",
        "GUTA-KB-005",
        "Chính sách lương NVBH và PTCH",
        "Chính sách lương cho nhân viên bán hàng và phụ trách cửa hàng đề cập 4 nhóm: "
        "ghi nhận thời gian làm việc và số giờ tối thiểu, chế độ công ngày lễ, cấp lương cơ bản và thưởng tháng 13.",
    ),
    PolicySection(
        "kb_006",
        "Hội nhập GUTA Ngày 1",
        "GUTA-KB-006",
        "Quy chuẩn tác phong và trang phục",
        "Nhân viên mới được hướng dẫn tác phong trang phục: quần áo sạch sẽ, ngay ngắn, áo đồng phục Guta, "
        "giày che kín đầu chân (giày bít mũi), tóc thu gọn gàng, đeo tạp dề và bảng tên đúng quy định; tránh đeo phụ kiện rườm rà.",
    ),
    PolicySection(
        "kb_007",
        "Hội nhập GUTA Ngày 2",
        "GUTA-KB-007",
        "Tiêu chuẩn chào khách",
        "Nội dung tập trung vào cách đón khách lịch sự và thân thiện: nét mặt tích cực, tươi tắn, giao tiếp bằng ánh mắt, "
        "dùng giọng chào ấm áp rõ ràng để tạo cảm giác khách được chào đón nồng nhiệt.",
    ),
    PolicySection(
        "kb_008",
        "Hội nhập GUTA Ngày 3",
        "GUTA-KB-008",
        "Đọc đơn hàng và bill bán hàng",
        "Khi đọc bill cần kiểm tra: tên món khách gọi, số lượng, thời điểm đặt đơn, các ghi chú yêu cầu riêng "
        "(độ ngọt, lượng đá, topping). Kiểm tra kỹ giúp pha chế đúng món, giảm tối đa sai sót đơn hàng.",
    ),
    PolicySection(
        "kb_009",
        "Hội nhập GUTA Ngày 4",
        "GUTA-KB-009",
        "Phân biệt bill và cỡ ly",
        "Phân biệt rõ ràng 3 cỡ ly: S (nhỏ), M (vừa) và L (lớn) để dùng đúng định lượng đá và nguyên liệu pha chế "
        "theo công thức tiêu chuẩn GUTA, giảm nhầm cỡ ly khi phục vụ và giao hàng.",
    ),
    PolicySection(
        "kb_010",
        "Hội nhập GUTA Ngày 5",
        "GUTA-KB-010",
        "Sơ chế và chuẩn bị nước đường",
        "Các công đoạn chuẩn bị nước đường: đong đo tỷ lệ nguyên liệu, gia nhiệt nấu tan đều, lọc cặn sạch sẽ và bảo quản "
        "trong bình kín chuyên dụng, đảm bảo vệ sinh an toàn thực phẩm và tính ổn định khi pha chế.",
    ),
    PolicySection(
        "kb_011",
        "Đào tạo nhân viên GUTA",
        "GUTA-KB-011",
        "Hình thức đào tạo nhân viên",
        "Đào tạo cho nhân viên mới theo từng vị trí, kết hợp học lý thuyết kiến thức sản phẩm với thực hành tại quầy. "
        "Các chuyên đề gồm: pha chế Barista, bán hàng gợi ý (upsell), chăm sóc khách hàng, quản lý vệ sinh và kiểm soát chất lượng.",
    ),
    PolicySection(
        "kb_012",
        "Vận hành Cửa hàng trưởng GUTA",
        "GUTA-KB-012",
        "Nhiệm vụ của Cửa hàng trưởng (SM)",
        "Năm nhóm nhiệm vụ chính của SM: 1) Sắp xếp và phân bổ lịch làm việc nhân viên; 2) Hướng dẫn và đào tạo nhân viên mới; "
        "3) Kiểm tra nguyên vật liệu và công cụ dụng cụ; 4) Duy trì vệ sinh an toàn cửa hàng; 5) Theo dõi và báo cáo doanh thu két định kỳ.",
    ),
    PolicySection(
        "kb_013",
        "Quản lý khu vực GUTA",
        "GUTA-KB-013",
        "Vai trò Quản lý khu vực (AOM)",
        "AOM là đầu mối kết nối Ban điều hành vận hành với các Quản lý cửa hàng (SM). Vai trò gồm triển khai chỉ đạo vận hành, "
        "theo dõi hoạt động cụm chi nhánh, điều phối nhân sự hỗ trợ ca thiếu người và đào tạo nâng cao chất lượng đội ngũ.",
    ),
    PolicySection(
        "kb_014",
        "Kỹ năng tổ chức công việc GUTA",
        "GUTA-KB-014",
        "Gợi ý tổ chức công việc hiệu quả",
        "Năm thói quen làm việc hiệu quả: xác định việc ưu tiên, phân chia thời gian cho từng nhiệm vụ, giảm yếu tố gây mất tập trung, "
        "điều chỉnh thói quen ảnh hưởng năng suất và nghỉ ngơi hợp lý. Kèm ảnh tham chiếu minh họa (/api/attachments/images/A-0f2e554322.png).",
        attachment_type="image",
        attachment_url="/api/attachments/images/A-0f2e554322.png",
        attachment_title="Gợi ý tổ chức công việc hiệu quả GUTA",
        attachment_file="A-0f2e554322.png",
    ),
    PolicySection(
        "kb_015",
        "Kỹ năng mềm GUTA",
        "GUTA-KB-015",
        "Các nhóm kỹ năng mềm cho nhân viên",
        "Các kỹ năng mềm thiết yếu cho nhân viên quầy: giao tiếp lịch thiệp với khách hàng, phối hợp làm việc nhóm ăn ý, "
        "tinh thần học hỏi thích nghi, quản lý thời gian và bình tĩnh xử lý vấn đề phát sinh trong ca trực. Kèm ảnh tham chiếu (/api/attachments/images/A-104e9ffff0.jpg).",
        attachment_type="image",
        attachment_url="/api/attachments/images/A-104e9ffff0.jpg",
        attachment_title="Kỹ năng mềm nhân viên GUTA",
        attachment_file="A-104e9ffff0.jpg",
    ),
    PolicySection(
        "kb_thang_tien",
        "Lộ trình thăng tiến GUTA",
        "GUTA-KB-PROMOTION",
        "Hệ thống phân cấp và lộ trình thăng tiến",
        "Lộ trình phát triển sự nghiệp trong khối vận hành GUTA: Nhân viên thử việc -> Barista / Thu ngân chính thức -> Ca trưởng -> Cửa hàng trưởng (SM) -> Quản lý khu vực (AOM). "
        "Kèm ảnh sơ đồ lộ trình thăng tiến tham chiếu (/api/attachments/images/A-a7f1d20c2e.jpg).",
        attachment_type="image",
        attachment_url="/api/attachments/images/A-a7f1d20c2e.jpg",
        attachment_title="Sơ đồ lộ trình thăng tiến GUTA",
        attachment_file="A-a7f1d20c2e.jpg",
    ),
)

def _build_searchable_policy_text(p: PolicySection) -> str:
    return f"{p.id} {p.document} {p.version} {p.article} {p.text} {p.attachment_title or ''} {p.attachment_file or ''}"


class _PolicyBM25:
    def __init__(self, policies: tuple[PolicySection, ...]) -> None:
        from app.rag.retrieval import BM25Index
        from app.text_utils import tokenize

        self.policies = policies
        self._tokenize = tokenize
        tokenised_docs = [
            tokenize(_build_searchable_policy_text(p), drop_stopwords=True)
            for p in policies
        ]
        self._index = BM25Index(tokenised_docs)

    def search(self, query: str, top_k: int = 4) -> list[tuple[PolicySection, float]]:
        query_tokens = self._tokenize(query, drop_stopwords=True)
        if not query_tokens:
            return []
        scores = self._index.scores(query_tokens)
        ranked = [
            (policy, score)
            for policy, score in zip(self.policies, scores)
            if score > 0
        ]
        ranked.sort(key=lambda item: item[1], reverse=True)
        return ranked[:top_k]


_POLICY_INDEX: _PolicyBM25 | None = None


def _get_policy_index() -> _PolicyBM25:
    global _POLICY_INDEX
    if _POLICY_INDEX is None:
        _POLICY_INDEX = _PolicyBM25(POLICIES)
    return _POLICY_INDEX


def select_relevant_policies(query: str, role: str | None = None, top_k: int = 4) -> list[PolicySection]:
    """Top-K BM25 policy chunk filtering with core policy prioritization."""
    q = (query or "").strip().lower()
    if not q:
        return [POLICIES[0], POLICIES[1]]

    index = _get_policy_index()
    ranked_hits = index.search(q, top_k=top_k * 2)

    selected: list[PolicySection] = []
    selected_ids: set[str] = set()

    # Priority heuristics: always prioritize core policy matching query domain
    if any(k in q for k in ("trễ", "muộn", "đổi ca", "chấm công", "vắng", "nghỉ", "ca trực", "lịch làm", "giờ công")):
        p = POLICY_BY_ID.get("attendance")
        if p and p.id not in selected_ids:
            selected.append(p)
            selected_ids.add(p.id)

    if any(k in q for k in ("két", "quỹ", "tiền thừa", "chênh lệch", "thực đếm", "thu ngân", "pos", "doanh thu")):
        p = POLICY_BY_ID.get("cash")
        if p and p.id not in selected_ids:
            selected.append(p)
            selected_ids.add(p.id)

    if any(k in q for k in ("công việc", "bb-cv", "bàn giao công việc", "nghỉ việc")):
        p = POLICY_BY_ID.get("bb_cong_viec")
        if p and p.id not in selected_ids:
            selected.append(p)
            selected_ids.add(p.id)

    if any(k in q for k in ("tài sản", "bb-ts", "bàn giao tài sản", "máy móc", "thiết bị", "kiểm kê")):
        p = POLICY_BY_ID.get("bb_tai_san")
        if p and p.id not in selected_ids:
            selected.append(p)
            selected_ids.add(p.id)

    # Role-based fallback / prior
    r = (role or "").strip().lower()
    if r in ("admin", "sm", "aom", "quản lý", "quản lý khu vực", "cửa hàng trưởng"):
        if any(k in q for k in ("nhiệm vụ", "vai trò", "quản lý", "sm", "aom", "cửa hàng trưởng")):
            p = POLICY_BY_ID.get("kb_012") or POLICY_BY_ID.get("kb_013")
            if p and p.id not in selected_ids:
                selected.append(p)
                selected_ids.add(p.id)

    # Add ranked BM25 hits
    for policy, _score in ranked_hits:
        if policy.id not in selected_ids:
            selected.append(policy)
            selected_ids.add(policy.id)
        if len(selected) >= top_k:
            break

    # Fallback if query matched nothing: default ca kíp & quỹ két
    if not selected:
        for default_id in ("attendance", "cash", "bb_cong_viec", "service"):
            p = POLICY_BY_ID.get(default_id)
            if p and p.id not in selected_ids:
                selected.append(p)
                selected_ids.add(p.id)
            if len(selected) >= top_k:
                break

    return selected[:top_k]


def render_policy_sections(sections: list[PolicySection]) -> str:
    return "\n\n".join(
        f"[{policy.id}] Document: {policy.document}\nVersion: {policy.version}\n"
        f"Article: {policy.article}\n{policy.text}"
        for policy in sections
    )

POLICY_BY_ID = {policy.id: policy for policy in POLICIES}
IN_CONTEXT_POLICY = "\n\n".join(
    f"[{policy.id}] Document: {policy.document}\nVersion: {policy.version}\n"
    f"Article: {policy.article}\n{policy.text}"
    for policy in POLICIES
)

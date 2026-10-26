"""Policy corpus model and read-only loaders.

`policies` is owned by `apps/api`/Phase 1; this service only reads it. Two shapes are
accepted because the upstream schema (`docs/05-data-model.md` §3.8, `title` +
`chunks[]`) and the older seed shape (`document` + `articles[]`) coexist in the repo:
each document becomes one `PolicyChunk` per article/chunk, carrying the metadata
required for BR-15 citations (`document`, `version`, `article`, `source`).

`SEED_POLICIES` is demo content already shipped in this service; it is the offline
corpus for tests/eval until `policies` is populated. It is not the production policy
set and must be replaced by Phase 1 data before any reported metric.
"""

from __future__ import annotations

from dataclasses import dataclass, replace
from typing import Any, Iterable

SEED_POLICIES: list[dict[str, Any]] = [
    {
        "document": "Quy Chế Chấm Công & Giải Trình Công GUTA",
        "version": "v2.1-2026",
        "source": "seed",
        "articles": [
            {
                "article": "Điều 1: Chu kỳ tính lương",
                "text": "Chu kỳ chấm công và tính lương của toàn bộ chuỗi Guta Cafe được chốt từ ngày 06 tháng này đến hết ngày 05 tháng kế tiếp. Bảng công khóa vào 23h59 ngày 05 hàng tháng.",
            },
            {
                "article": "Điều 2: Thời hạn nộp giải trình quên chấm công",
                "text": "Trường hợp nhân viên quên bấm vân tay, lỗi hệ thống IT chưa cập nhật mã ca, hoặc nhân viên mới chưa có mã, nhân viên phải nộp phiếu giải trình điều chỉnh công (attendance_corrections) trong vòng 48 giờ kể từ khi kết thúc ca làm, và chậm nhất là trước 23h59 ngày 05 hàng tháng. Các khiếu nại nộp sau thời gian chốt kỳ lương sẽ không được giải quyết vào kỳ lương hiện tại.",
            },
            {
                "article": "Điều 3: Quy trình phê duyệt giải trình",
                "text": "Phiếu giải trình công bắt buộc phải qua 2 cấp duyệt: Cửa hàng trưởng (Store Manager) xác nhận nhân viên có mặt thực tế tại cửa hàng, sau đó phòng Nhân sự (HR Admin) kiểm tra định mức giờ làm và chốt công chính thức.",
            },
        ],
    },
    {
        "document": "Quy Định Vận Hành Ca Kíp Cửa Hàng GUTA",
        "version": "v1.8-2026",
        "source": "seed",
        "articles": [
            {
                "article": "Điều 4: Khung giờ các ca làm việc chuẩn",
                "text": "Hệ thống áp dụng 2 ca chính và ca tăng cường: Ca A (Ca sáng): từ 06:00 đến 14:00 (8 tiếng). Ca B (Ca chiều/tối): từ 14:00 đến 22:00 (8 tiếng). Ca gãy hoặc ca tăng cường (A1, A1.749, B2): bố trí theo lượng khách cao điểm do Cửa hàng trưởng phân bổ.",
            },
            {
                "article": "Điều 5: Định mức nhân sự tối thiểu mỗi ca",
                "text": "Mỗi ca làm việc tại điểm bán phải đảm bảo tối thiểu 1 nhân viên Pha chế (Barista) và 1 nhân viên Thu ngân hoặc Bếp. Không được mở ca nếu thiếu nhân sự pha chế đã qua đào tạo đạt chuẩn.",
            },
            {
                "article": "Điều 6: Quy trình xin nghỉ và đổi ca đột xuất",
                "text": "Nhân viên có việc bận hoặc ốm đột xuất phải thông báo cho Cửa hàng trưởng trước giờ vào ca ít nhất 04 tiếng. Nhân viên tự tìm người đổi ca cùng chức danh hoặc nhờ Cửa hàng trưởng điều phối nhân sự hỗ trợ từ các cửa hàng lân cận trong cùng khu vực.",
            },
        ],
    },
    {
        "document": "Quy Chế Quản Lý Két Tiền & Kiểm Kê Quỹ Ca",
        "version": "v3.0-2026",
        "source": "seed",
        "articles": [
            {
                "article": "Điều 7: Trách nhiệm kiểm kê két tiền cuối ca",
                "text": "Khi kết thúc ca làm việc, nhân viên thu ngân và nhân viên giao ca phải cùng kiểm đếm toàn bộ tiền mặt theo từng mệnh giá (500k, 200k, 100k, 50k, 20k, 10k, 5k, 2k, 1k) và ghi nhận vào bảng kê (cash_denominations). Doanh thu bán hàng tại quầy và khách vãng lai (walk-in) phải được đối chiếu khớp với phần mềm POS.",
            },
            {
                "article": "Điều 8: Xử lý chênh lệch quỹ tiền mặt",
                "text": "Nếu tiền mặt thực tế kiểm đếm lệch so với số liệu phần mềm: Thiếu tiền: Thu ngân ca đó phải giải trình nguyên nhân và chịu trách nhiệm đền bù số tiền thiếu hụt. Thừa tiền: Phải ghi nhận vào khoản thu nhập khác của cửa hàng, nghiêm cấm nhân viên tự ý giữ lại tiền thừa.",
            },
        ],
    },
    {
        "document": "Nội Quy Lao Động & Khen Thưởng Kỷ Luật GUTA",
        "version": "v2.0-2026",
        "source": "seed",
        "articles": [
            {
                "article": "Điều 9: Tiêu chuẩn đào tạo và ra ca cho nhân viên mới",
                "text": "Nhân viên mới (NVM) phải tham gia đầy đủ các buổi đào tạo lý thuyết và thực hành (training_attendance) tối thiểu 3 buổi tại trung tâm đào tạo. Chỉ khi giảng viên đánh giá ĐÃ HOÀN TẤT thì Cửa hàng trưởng mới được phân ca làm việc chính thức tại điểm bán.",
            },
            {
                "article": "Điều 10: Chế độ làm việc ngày Lễ Tết",
                "text": "Nhân viên đi làm vào các ngày Lễ, Tết theo quy định của Luật Lao động được hưởng lương hệ số 300% (gấp 3 lần ngày thường) cộng phụ cấp ca đặc biệt theo thông báo của Ban Giám Đốc.",
            },
        ],
    },
    {
        "document": "Biểu Mẫu Biên Bản Bàn Giao GUTA",
        "version": "v1.0-2026",
        "source": "seed",
        "articles": [
            {
                "article": "Biên bản bàn giao công việc",
                "text": "Mẫu ghi nhận các đầu việc được chuyển giao cùng tình trạng thực hiện. Mẫu có phần thông tin hai bên (Bên giao và Bên nhận), lý do chuyển giao, danh sách nội dung công việc và chữ ký xác nhận của ba bên (Người giao, Người nhận, Quản lý SM). Tệp đính kèm chính thức: GUTA_Bien_ban_ban_giao_cong_viec.pdf (tải tại /api/attachments/pdf/GUTA_Bien_ban_ban_giao_cong_viec.pdf).",
            },
            {
                "article": "Biên bản bàn giao tài sản",
                "text": "Mẫu ghi nhận việc chuyển giao tài sản, máy móc thiết bị và công cụ dụng cụ giữa bên giao và bên nhận tại cửa hàng. Mẫu có phần thông tin hai bên, lý do bàn giao, danh sách chi tiết tài sản/hiện trạng hoạt động và chữ ký xác nhận của ba bên. Tệp đính kèm chính thức: GUTA_Bien_ban_ban_giao_tai_san.pdf (tải tại /api/attachments/pdf/GUTA_Bien_ban_ban_giao_tai_san.pdf).",
            },
        ],
    },
    {
        "document": "Bộ Tri Thức Đào Tạo & Hội Nhập GUTA",
        "version": "v1.0-2026",
        "source": "seed",
        "articles": [
            {
                "article": "GUTA-KB-001: Tra cứu tài liệu đào tạo",
                "text": "Tài liệu đào tạo GUTA gồm 4 nhóm: tài liệu GUTA Cafe, bộ quy trình GUTA Cafe, bộ quy trình Bánh Mì 365 và bộ quy trình GUTA Express. Chọn đúng mô hình cửa hàng trước khi mở tài liệu. Liên hệ bộ phận Đào tạo khi cần hỗ trợ tìm tài liệu chính thức.",
            },
            {
                "article": "GUTA-KB-002: Tra cứu quy trình, quy định và biểu mẫu",
                "text": "Danh mục trung tâm GUTA tập hợp liên kết về nhân sự (lương thưởng, lịch trả lương, phân cấp, tuyển dụng), vận hành (KPI, nộp doanh thu, đơn online, hao hụt, gian lận) và biểu mẫu chia thành kế toán và nhân sự.",
            },
            {
                "article": "GUTA-KB-003: Tra cứu biểu mẫu nhân sự",
                "text": "Biểu mẫu nhân sự chia theo khối cửa hàng (tuyển dụng, nghỉ phép, chấm công, đề xuất đổi lương/chức danh, tiếp nhận/nghỉ việc/điều chuyển) và khối văn phòng (đề nghị tuyển dụng, mô tả công việc, đánh giá thử việc, nghỉ phép).",
            },
            {
                "article": "GUTA-KB-004: Tra cứu biểu mẫu kế toán",
                "text": "Cung cấp 4 loại biểu mẫu: đề nghị tạm ứng, đề nghị hoàn ứng, bảng kê hoàn ứng và đề nghị thanh toán. Khi thiếu mẫu liên hệ Phòng Kế toán Guta.",
            },
            {
                "article": "GUTA-KB-005: Chính sách lương NVBH và PTCH",
                "text": "Chính sách lương cho nhân viên bán hàng và phụ trách cửa hàng đề cập 4 nhóm: ghi nhận thời gian làm việc và số giờ tối thiểu, chế độ công ngày lễ, cấp lương cơ bản và thưởng tháng 13.",
            },
            {
                "article": "GUTA-KB-006: Hội nhập ngày 1 - Tác phong trang phục",
                "text": "Nhân viên mới được hướng dẫn tác phong trang phục: quần áo sạch sẽ, ngay ngắn, áo đồng phục Guta, giày che kín đầu chân (giày bít mũi), tóc thu gọn gàng, đeo tạp dề và bảng tên đúng quy định.",
            },
            {
                "article": "GUTA-KB-007: Hội nhập ngày 2 - Tiêu chuẩn chào khách",
                "text": "Cách đón khách lịch sự và thân thiện: nét mặt tích cực, tươi tắn, giao tiếp bằng ánh mắt, dùng giọng chào ấm áp rõ ràng để tạo cảm giác khách được chào đón nồng nhiệt.",
            },
            {
                "article": "GUTA-KB-008: Hội nhập ngày 3 - Đọc đơn hàng và bill",
                "text": "Khi đọc bill cần kiểm tra: tên món khách gọi, số lượng, thời điểm đặt đơn, các ghi chú yêu cầu riêng (độ ngọt, lượng đá, topping). Kiểm tra kỹ giúp pha chế đúng món, giảm tối đa sai sót đơn hàng.",
            },
            {
                "article": "GUTA-KB-009: Hội nhập ngày 4 - Phân biệt cỡ ly",
                "text": "Phân biệt rõ ràng 3 cỡ ly: S (nhỏ), M (vừa) và L (lớn) để dùng đúng định lượng đá và nguyên liệu pha chế theo công thức tiêu chuẩn GUTA, giảm nhầm cỡ ly khi phục vụ và giao hàng.",
            },
            {
                "article": "GUTA-KB-010: Hội nhập ngày 5 - Chuẩn bị nước đường",
                "text": "Công đoạn chuẩn bị nước đường: đong đo tỷ lệ nguyên liệu, gia nhiệt nấu tan đều, lọc cặn sạch sẽ và bảo quản trong bình kín chuyên dụng, đảm bảo vệ sinh an toàn thực phẩm và tính ổn định khi pha chế.",
            },
            {
                "article": "GUTA-KB-011: Hình thức đào tạo nhân viên",
                "text": "Đào tạo cho nhân viên mới theo từng vị trí, kết hợp học lý thuyết kiến thức sản phẩm với thực hành tại quầy: pha chế Barista, bán hàng gợi ý, chăm sóc khách hàng, quản lý vệ sinh và kiểm soát chất lượng.",
            },
            {
                "article": "GUTA-KB-012: Nhiệm vụ của Cửa hàng trưởng (SM)",
                "text": "Năm nhóm nhiệm vụ chính của SM: sắp xếp và phân bổ lịch làm việc nhân viên, hướng dẫn và đào tạo nhân viên mới, kiểm tra nguyên vật liệu và công cụ dụng cụ, duy trì vệ sinh an toàn cửa hàng, theo dõi và báo cáo doanh thu két định kỳ.",
            },
            {
                "article": "GUTA-KB-013: Vai trò Quản lý khu vực (AOM)",
                "text": "AOM là đầu mối kết nối Ban điều hành vận hành với các SM điểm bán: triển khai chỉ đạo vận hành, theo dõi hoạt động cụm chi nhánh, điều phối nhân sự hỗ trợ ca thiếu người và đào tạo nâng cao chất lượng đội ngũ.",
            },
            {
                "article": "GUTA-KB-014: Gợi ý tổ chức công việc hiệu quả",
                "text": "Năm thói quen làm việc hiệu quả: xác định việc ưu tiên, phân chia thời gian cho từng nhiệm vụ, giảm yếu tố gây mất tập trung, điều chỉnh thói quen ảnh hưởng năng suất và nghỉ ngơi hợp lý. Kèm ảnh tham chiếu (/api/attachments/images/A-0f2e554322.png).",
            },
            {
                "article": "GUTA-KB-015: Kỹ năng mềm cho nhân viên",
                "text": "Các kỹ năng mềm thiết yếu: giao tiếp lịch thiệp với khách hàng, phối hợp làm việc nhóm ăn ý, tinh thần học hỏi thích nghi, quản lý thời gian và bình tĩnh xử lý vấn đề phát sinh tại quầy. Kèm ảnh tham chiếu (/api/attachments/images/A-104e9ffff0.jpg).",
            },
            {
                "article": "GUTA-KB-PROMOTION: Lộ trình thăng tiến khối vận hành",
                "text": "Lộ trình phát triển sự nghiệp trong khối vận hành GUTA: Nhân viên thử việc -> Barista / Thu ngân chính thức -> Ca trưởng -> Cửa hàng trưởng (SM) -> Quản lý khu vực (AOM). Kèm ảnh sơ đồ lộ trình thăng tiến tham chiếu (/api/attachments/images/A-a7f1d20c2e.jpg).",
            },
        ],
    },
]


@dataclass(frozen=True)
class PolicyChunk:
    """One retrievable policy unit with the citation fields required by BR-15."""

    chunk_id: str
    document: str
    version: str
    article: str
    text: str
    source: str
    order: int
    department_ids: tuple[str, ...] = ()
    embedding: tuple[float, ...] | None = None
    model: str | None = None

    @property
    def citation(self) -> dict[str, Any]:
        return {
            "document": self.document,
            "version": self.version,
            "article": self.article,
            "source": self.source,
        }

    def searchable_text(self) -> str:
        return f"{self.document} {self.version} {self.article} {self.text}"

    def with_embedding(self, embedding: list[float], model: str) -> "PolicyChunk":
        return replace(self, embedding=tuple(float(value) for value in embedding), model=model)


def _chunk_id(document: str, version: str, order: int) -> str:
    return f"{document}|{version}|{order}"


def chunks_from_documents(documents: Iterable[dict[str, Any]]) -> list[PolicyChunk]:
    """Flatten `policies` documents into chunks (read-only mapping, no DB access)."""
    chunks: list[PolicyChunk] = []
    for doc in documents:
        document = str(doc.get("document") or doc.get("title") or "Tài liệu chính sách")
        version = str(doc.get("version") or "v1.0")
        source = str(doc.get("source") or "policies")
        departments = tuple(str(item) for item in (doc.get("departmentIds") or ()))
        articles = doc.get("articles") or []
        raw_chunks = doc.get("chunks") or []
        if articles:
            for order, article in enumerate(articles):
                chunks.append(
                    PolicyChunk(
                        chunk_id=_chunk_id(document, version, order),
                        document=document,
                        version=version,
                        article=str(article.get("article") or f"Điều {order + 1}"),
                        text=str(article.get("text") or ""),
                        source=source,
                        order=order,
                        department_ids=departments,
                    )
                )
        elif raw_chunks:
            for order, chunk in enumerate(raw_chunks):
                embedding = chunk.get("embedding")
                chunks.append(
                    PolicyChunk(
                        chunk_id=_chunk_id(document, version, int(chunk.get("order", order))),
                        document=document,
                        version=version,
                        article=str(chunk.get("article") or chunk.get("title") or f"Mục {order + 1}"),
                        text=str(chunk.get("text") or ""),
                        source=source,
                        order=int(chunk.get("order", order)),
                        department_ids=departments,
                        embedding=tuple(float(value) for value in embedding) if embedding else None,
                        model=chunk.get("model") or None,
                    )
                )
    return chunks


def seed_chunks() -> list[PolicyChunk]:
    return chunks_from_documents(SEED_POLICIES)


def load_db_chunks(collection: Any, limit: int = 100) -> list[PolicyChunk]:
    """Read policy chunks from Mongo (read-only). Returns [] when the collection is empty."""
    if collection is None:
        return []
    try:
        documents = list(collection.find({}, {"_id": 0}).limit(limit))
    except Exception:  # noqa: BLE001 - DB failure degrades to seed corpus, never crashes
        return []
    return chunks_from_documents(documents)


def chunks_by_document(documents: Iterable[dict[str, Any]]) -> list[PolicyChunk]:
    return chunks_from_documents(documents)

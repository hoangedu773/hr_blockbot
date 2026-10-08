"""
Policy RAG Engine for Guta Cafe HR & Operations.
Implements hierarchical chunking, retrieval, scoring, and abstention rule (FR-018 / BR-15).
"""

from typing import List, Dict, Any
import re

POLICIES_SEED: List[Dict[str, Any]] = [
    {
        "document": "Quy Chế Chấm Công & Giải Trình Công GUTA",
        "version": "v2.1-2026",
        "articles": [
            {
                "article": "Điều 1: Chu kỳ tính lương",
                "text": "Chu kỳ chấm công và tính lương của toàn bộ chuỗi Guta Cafe được chốt từ ngày 06 tháng này đến hết ngày 05 tháng kế tiếp. Bảng công khóa vào 23h59 ngày 05 hàng tháng."
            },
            {
                "article": "Điều 2: Thời hạn nộp giải trình quên chấm công",
                "text": "Trường hợp nhân viên quên bấm vân tay, lỗi hệ thống IT chưa cập nhật mã ca, hoặc nhân viên mới chưa có mã, nhân viên phải nộp phiếu giải trình điều chỉnh công (attendance_corrections) trong vòng 48 giờ kể từ khi kết thúc ca làm, và chậm nhất là trước 23h59 ngày 05 hàng tháng. Các khiếu nại nộp sau thời gian chốt kỳ lương sẽ không được giải quyết vào kỳ lương hiện tại."
            },
            {
                "article": "Điều 3: Quy trình phê duyệt giải trình",
                "text": "Phiếu giải trình công bắt buộc phải qua 2 cấp duyệt: Cửa hàng trưởng (Store Manager) xác nhận nhân viên có mặt thực tế tại cửa hàng, sau đó phòng Nhân sự (HR Admin) kiểm tra định mức giờ làm và chốt công chính thức."
            }
        ]
    },
    {
        "document": "Quy Định Vận Hành Ca Kíp Cửa Hàng GUTA",
        "version": "v1.8-2026",
        "articles": [
            {
                "article": "Điều 4: Khung giờ các ca làm việc chuẩn",
                "text": "Hệ thống áp dụng 2 ca chính và ca tăng cường: Ca A (Ca sáng): từ 06:00 đến 14:00 (8 tiếng). Ca B (Ca chiều/tối): từ 14:00 đến 22:00 (8 tiếng). Ca gãy hoặc ca tăng cường (A1, A1.749, B2): bố trí theo lượng khách cao điểm do Cửa hàng trưởng phân bổ."
            },
            {
                "article": "Điều 5: Định mức nhân sự tối thiểu mỗi ca",
                "text": "Mỗi ca làm việc tại điểm bán phải đảm bảo tối thiểu 1 nhân viên Pha chế (Barista) và 1 nhân viên Thu ngân hoặc Bếp. Không được mở ca nếu thiếu nhân sự pha chế đã qua đào tạo đạt chuẩn."
            },
            {
                "article": "Điều 6: Quy trình xin nghỉ và đổi ca đột xuất",
                "text": "Nhân viên có việc bận hoặc ốm đột xuất phải thông báo cho Cửa hàng trưởng trước giờ vào ca ít nhất 04 tiếng. Nhân viên tự tìm người đổi ca cùng chức danh hoặc nhờ Cửa hàng trưởng điều phối nhân sự hỗ trợ từ các cửa hàng lân cận trong cùng khu vực."
            }
        ]
    },
    {
        "document": "Quy Chế Quản Lý Két Tiền & Kiểm Kê Quỹ Ca",
        "version": "v3.0-2026",
        "articles": [
            {
                "article": "Điều 7: Trách nhiệm kiểm kê két tiền cuối ca",
                "text": "Khi kết thúc ca làm việc, nhân viên thu ngân và nhân viên giao ca phải cùng kiểm đếm toàn bộ tiền mặt theo từng mệnh giá (500k, 200k, 100k, 50k, 20k, 10k, 5k, 2k, 1k) và ghi nhận vào bảng kê (cash_denominations). Doanh thu bán hàng tại quầy và khách vãng lai (walk-in) phải được đối chiếu khớp với phần mềm POS."
            },
            {
                "article": "Điều 8: Xử lý chênh lệch quỹ tiền mặt",
                "text": "Nếu tiền mặt thực tế kiểm đếm lệch so với số liệu phần mềm: Thiếu tiền: Thu ngân ca đó phải giải trình nguyên nhân và chịu trách nhiệm đền bù số tiền thiếu hụt. Thừa tiền: Phải ghi nhận vào khoản thu nhập khác của cửa hàng, nghiêm cấm nhân viên tự ý giữ lại tiền thừa."
            }
        ]
    },
    {
        "document": "Nội Quy Lao Động & Khen Thưởng Kỷ Luật GUTA",
        "version": "v2.0-2026",
        "articles": [
            {
                "article": "Điều 9: Tiêu chuẩn đào tạo và ra ca cho nhân viên mới",
                "text": "Nhân viên mới (NVM) phải tham gia đầy đủ các buổi đào tạo lý thuyết và thực hành (training_attendance) tối thiểu 3 buổi tại trung tâm đào tạo. Chỉ khi giảng viên đánh giá ĐÃ HOÀN TẤT thì Cửa hàng trưởng mới được phân ca làm việc chính thức tại điểm bán."
            },
            {
                "article": "Điều 10: Chế độ làm việc ngày Lễ Tết",
                "text": "Nhân viên đi làm vào các ngày Lễ, Tết theo quy định của Luật Lao động được hưởng lương hệ số 300% (gấp 3 lần ngày thường) cộng phụ cấp ca đặc biệt theo thông báo của Ban Giám Đốc."
            }
        ]
    }
]

class PolicyEngine:
    def __init__(self, abstain_threshold: float = 0.28):
        self.abstain_threshold = abstain_threshold
        self.corpus = self._build_corpus()

    def _build_corpus(self) -> List[Dict[str, Any]]:
        chunks = []
        for doc in POLICIES_SEED:
            for art in doc["articles"]:
                chunks.append({
                    "document": doc["document"],
                    "version": doc["version"],
                    "article": art["article"],
                    "text": art["text"],
                    "full_content": f"{doc['document']} ({doc['version']}) - {art['article']}: {art['text']}"
                })
        return chunks

    def _tokenize(self, text: str) -> set:
        clean = re.sub(r'[^\w\s]', ' ', text.lower())
        words = clean.split()
        return set(words)

    def query(self, question: str) -> Dict[str, Any]:
        q_tokens = self._tokenize(question)
        if not q_tokens:
            return {
                "answer": "Vui lòng nhập câu hỏi rõ ràng về chính sách hoặc quy chế.",
                "citations": [],
                "abstain": True
            }

        scored_chunks = []
        for chunk in self.corpus:
            c_tokens = self._tokenize(chunk["full_content"])
            intersection = q_tokens.intersection(c_tokens)
            if not intersection:
                score = 0.0
            else:
                # Combined Jaccard + keyword importance
                jaccard = len(intersection) / len(q_tokens.union(c_tokens))
                coverage = len(intersection) / len(q_tokens)
                score = 0.7 * coverage + 0.3 * jaccard

            scored_chunks.append({
                **chunk,
                "score": round(score, 3)
            })

        scored_chunks.sort(key=lambda x: x["score"], reverse=True)
        top_candidates = [c for c in scored_chunks if c["score"] >= self.abstain_threshold][:3]

        if not top_candidates:
            # Rule Abstention FR-018: Không có bằng chứng -> từ chối đoán
            return {
                "answer": "Thông tin bạn hỏi chưa được quy định trong các tài liệu chính sách và quy chuẩn hiện hành của Guta Cafe. Vui lòng liên hệ trực tiếp phòng Nhân sự hoặc Cửa hàng trưởng để được hỗ trợ cụ thể.",
                "citations": [],
                "abstain": True
            }

        # Build grounded response with citations
        best = top_candidates[0]
        answer_parts = [
            f"Theo quy định tại **{best['article']}** ({best['document']} - Phiên bản {best['version']}):",
            f"> \"{best['text']}\""
        ]

        citations = [
            {
                "document": c["document"],
                "version": c["version"],
                "article": c["article"],
                "score": c["score"]
            }
            for c in top_candidates
        ]

        return {
            "answer": "\n\n".join(answer_parts),
            "citations": citations,
            "abstain": False
        }

policy_engine = PolicyEngine()

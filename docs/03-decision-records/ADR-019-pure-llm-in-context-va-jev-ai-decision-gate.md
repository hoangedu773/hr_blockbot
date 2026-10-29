# ADR-019 — Bỏ PhoBERT + BM25, Chuyển Sang Pure LLM In-Context & Jev AI Decision Gate

- **Status:** Accepted (2026-10-25); revised 2026-10-28 — §2.2 (ba đường gọi), §3.3 (số đo & giới hạn)
- **Ảnh hưởng:** `docs/21-chatbot-architecture.md`, `docs/08-algorithms.md`, `docs/09-ai-evaluation.md` §6.5, `apps/ai-service`, `apps/api`

---

## 1. Bối cảnh (Context)

Kiến trúc ban đầu của hệ thống Chatbot (F3) sử dụng mô hình Hybrid RAG gồm:
1. `DenseRetriever`: Dùng mô hình PhoBERT (~400MB) trích xuất vector embedding và truy vấn qua MongoDB Atlas Vector Search.
2. `LexicalRetriever`: Dùng BM25 / Text index trên MongoDB.

**Các vấn đề thực tế phát sinh trong môi trường đồ án & Cloud Deploy:**
- **Gánh nặng tài nguyên:** PhoBERT yêu cầu PyTorch và các thư viện NLP nặng, gây cạn kiệt RAM (OOM) trên gói Render Free Tier (giới hạn 512MB RAM) và thời gian khởi động nguội (Cold start) lên tới hàng phút.
- **Phụ thuộc môi trường:** Cài đặt PyTorch và tokenizers trên Windows/Linux gặp nhiều xung đột phiên bản C++ binary.
- **Sự phát triển vượt bậc của LLM:** Với các model hiện đại (như Gemini 3.8/1.5 Flash có context window 1M tokens), toàn bộ quy chế và chính sách của chuỗi Guta Cafe có thể nạp trọn vẹn vào In-Context Prompt mà vẫn đạt tốc độ xử lý dưới 500ms.
- **Nhu cầu phân luồng chuẩn xác:** Cần một cơ chế phân định ý định (Intent) và rẽ nhánh luồng quyết định (Typed Decisions) nhanh chóng, không bị ảo giác trước khi kích hoạt LLM sinh văn bản.

---

## 2. Quyết định (Decision)

1. **Loại bỏ hoàn toàn cụm PhoBERT + BM25 local:**
   - Xóa bỏ việc tải checkpoint PhoBERT và việc chunking/embedding thủ công vào Atlas Vector Search cho F3.
   - Sử dụng **In-Context Policy Injection**: Nạp toàn bộ danh mục văn bản quy chế chuẩn của Guta vào System Prompt của LLM.
2. **Áp dụng Jev AI (TypeSafe System One Decision Model):**
   - Đặt Jev AI làm **Decision Gateway** ở tầng đầu vào để đưa ra các quyết định có kiểu tĩnh (Typed Decisions):
     - `Choice`: Phân loại nhóm intent (`policy_query`, `shift_operation`, `cash_audit`, `general_chat`).
     - `Noul`: Xác định độ tin cậy và kiểm tra quyền phê duyệt của Quản lý (`needs_approval`).
     - `Score`: Chấm điểm mức độ khẩn cấp (Urgency Score) của tình huống ca trực/két tiền.
   - **Gateway có ba đường gọi, và mỗi quyết định phải khai báo mình đến từ đường nào** (`TypedDecision.source`,
     trả ra ngoài dưới dạng `decisionSource`):

     | # | `source` | Điều kiện | Wire format | Thời gian đo được |
     |---|---|---|---|---|
     | 1 | `jev_systemone` | `JEV_API_KEY` | `POST thejevai.com/v1/systemone`, `questions` = object + `criteria`, đồng bộ | ~0,4s suy luận |
     | 2 | `jev_usejevai` | `JEV_USEJEVAI_KEYS` (pool trial, xoay vòng) | `POST usejevai.com/api/v1/runs` (202) → poll `GET /runs/{id}`, `questions` = array + `options` | **2,5–3,7s** end-to-end |
     | 3 | `llm_fallback` / `rule` | không credential, hoặc Jev lỗi/hết key | LLM ép JSON 3 khoá, hoặc `classify()` rule | <100ms (rule) |

   - Xoay key (chỉ đường 2): `401`/hết quota → disable key vĩnh viễn trong phiên; `429` → cooldown 60s;
     hết key dùng được → `NO_KEY_AVAILABLE` → rơi về đường 3 với `degraded=True`. **Không** trả 503 vì hết
     quota trial, nhưng cũng **không** được báo cáo đó là quyết định của Jev.
   - `TypedDecision` giữ `intent_probabilities` + `intent_confidence` để đo calibration (`09 §6.5`); bản
     fallback để mặc định thay vì bịa số tin cậy.
3. **LLM Generation:**
   - Dùng trực tiếp upstream LLM Proxy (`ag/gemini-3.8-flash-low`) với API endpoint chuyên trách để tổng hợp câu trả lời tự nhiên, kèm trích dẫn văn bản (Citations) và đề xuất hành động (ProposedAction).

---

## 3. Hệ quả (Consequences)

### Tích cực:
- **Zero-Footprint PyTorch:** Giảm 90% dung lượng RAM tiêu thụ của `apps/ai-service`, loại bỏ hoàn toàn nguy cơ sập RAM trên Render.
- **Khởi động tức thì (< 3 giây):** Không cần thời gian load weight model PhoBERT vào memory.
- **Trải nghiệm đàm thoại tự nhiên:** Người dùng không bị chặn bởi các luật từ chối cứng nhắc (Abstention Rule cứng); LLM trả lời linh hoạt, thông minh và thân thiện.
- **Kiến trúc hiện đại ("mới & dị"):** Ứng dụng mô hình Typed Decision của Jev AI kết hợp Large Context LLM chuẩn xu hướng 2026.

### Đánh đổi:
- Token đầu vào của LLM tăng thêm ~2,000–3,000 tokens cho phần In-Context Policy (hoàn toàn nằm trong khả năng chịu tải và quota của Gemini Flash proxy).
- Đường trial (UseJevAI) **chậm hơn** đường key đồng bộ khoảng 6–9 lần và có trần concurrency; đổi lại chi phí bằng 0.

### 3.3. Đo lường & giới hạn đã biết (2026-10-28)

| Đại lượng | Số đo | Nguồn |
|---|---|---|
| Phân loại intent trên 4 mẫu tiếng Việt | **4/4 đúng** | `python scripts/jev_gateway_live_check.py` |
| Suy luận phía server | 423ms | `elapsedMs` của một run |
| End-to-end qua pool trial | **2,44–3,66s** | cùng lệnh, 4 lượt |
| Chi phí mỗi lần | **$0,0000199** (474 input token, `funding: trial`) | `usage.cost` |
| `intent_confidence` | **1,00** ở cả 4 mẫu | cùng lệnh — hệ quả ghi ở `09 §6.5` |

Giới hạn phải nói khi bảo vệ:

- **Không có "~100ms" end-to-end.** Đường trial là API xếp hàng; giảm `poll_interval` 1,2s → 0,5s không cải thiện.
- Trial chỉ **3 run song song + 20 attempt/phút mỗi tài khoản** → pool 4 key đủ cho demo và eval nhỏ, **không** đủ tải thật.
- `thejevai.com` nằm sau Cloudflare, chặn User-Agent `Python-urllib/*` (403 `error code: 1010`); client phải giữ UA kiểu `python-httpx/*`.
- Hợp đồng payload của `thejevai.com` (object + `criteria`) **chưa** được xác nhận bằng một response thành công thật — mới xác nhận envelope `{code, message}` và `401` khi key sai.

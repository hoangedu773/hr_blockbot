# 21 — Kiến trúc Chatbot (F3): Agent loop + Hybrid RAG

- **Trạng thái:** PROPOSED — chờ GVHD duyệt 2 điểm ở §12, chưa code
- **Ngày:** 2026-10-20
- **Phạm vi:** F3 (FR-015..FR-022) + phần đọc dữ liệu cho F1/F2/F5/F7
- **Nguồn bắt buộc:** `01-requirements.md` FR-015..022 · `02-architecture.md` §5, §12 · `05-data-model.md` §2–§4, D-08 · `08-algorithms.md` §7 · `ADR-005`, `ADR-010`, `ADR-012`
- **Nguồn quan sát thực nghiệm:** [`research/SPEC-chatbase-2026-10-20.md`](research/SPEC-chatbase-2026-10-20.md) (REA, phiên thật 2026-10-20) — chỉ dùng cho **vòng đời stream**, không copy transport

---

## 1. Quyết định kiến trúc (đã chốt trong phiên 2026-10-20)

| # | Quyết định | Lý do | Hệ quả nếu sai |
|---|---|---|---|
| D-21.1 | **Pure LLM + Jev AI Decision Gate** (Bỏ PhoBERT + BM25 local), In-Context Policy Store | Loại bỏ gánh nặng PyTorch / vector index 400MB; tận dụng context window 1M tokens của Gemini 3.8/1.5 Flash. Jev AI (TypeSafe System One) đảm nhiệm phân luồng Typed Decision (Choice, Noul, Score) trong ~100ms. | Tăng token đầu vào LLM; bù lại setup siêu nhẹ, zero-cold-start trên Render, đàm thoại tự nhiên 100%. |
| D-21.2 | **Agent loop ở `ai-service`, nhưng `ai-service` không ghi DB** | Giữ ranh giới một chiều `api → ai-service` (`02 §5`); giải điểm treo #4 `02 §12`; RBAC enforce ở nơi có JWT | Nếu đặt ở `api` thì phải nhân đôi logic tool + guard |
| D-21.3 | **Lưu hội thoại: 1 collection `conversations`, `messages[]` embed, trần 50** | Đúng 1 collection mới, đủ dữ liệu eval; thay cho D-08 "không lưu gì" | Nếu GVHD không duyệt → rơi về phương án C (không lưu), ghi rõ giới hạn |
| D-21.4 | **Transport = WebSocket** `chat:*`, không SSE | FR-020 cần confirm hai chiều giữa stream; ADR-010 đã chốt Socket.IO | SSE sẽ phải thêm kênh phụ cho confirm |

**Không làm:** rerank cross-encoder · GraphRAG · LangChain/LangGraph · fine-tune LLM · lưu chain-of-thought.

---

## 2. Sơ đồ khối
> **Bản đồ kiến trúc trực quan (Interactive Architecture Reader):** Xem file HTML tương tác tại [`docs/diagrams/chatbot-architecture.html`](diagrams/chatbot-architecture.html) hoặc vector SVG [`docs/diagrams/chatbot-architecture.svg`](diagrams/chatbot-architecture.svg) (biên dịch từ typed IR `chatbot-architecture.json` theo chuẩn `ak-diagram`).


```mermaid
flowchart TB
  subgraph Browser
    UI[Chat panel<br/>render chunk · citation · action card]
  end

  subgraph API["apps/api (Express, cổng 3001)"]
    GW[Chat Gateway<br/>JWT · RBAC scope · idempotency<br/>persist conversations]
    EX[Action Executor<br/>thực thi write sau confirm]
  end

  subgraph AI["apps/ai-service (FastAPI, cổng 8000)"]
    OR[Orchestrator<br/>intent → tool → compose<br/>guard maxSteps=5]
    TR[Tool Runtime<br/>read-only]
    RT[Retrieval Layer<br/>Retriever interface]
    LP[LLMProvider<br/>primary · fallback · judge]
  end

  DB[(MongoDB Atlas)]
  IX[(Atlas Vector index<br/>policies.chunks.embedding)]

  UI <-->|WS chat:*| GW
  GW -->|HTTP một chiều<br/>+ user scope| OR
  OR --> TR
  OR --> RT
  OR --> LP
  TR -->|read| DB
  RT --> IX
  RT -->|BM25 / text index| DB
  OR -->|proposed_action<br/>KHÔNG ghi| GW
  GW --> EX
  EX -->|write sau confirm| DB
  GW --> DB
```

**Bất biến ranh giới**
1. `ai-service` **không** gọi ngược `apps/api`, **không** mutate collection nào.
2. Mọi mutation đi qua `api`, sau bước confirm của người dùng (FR-020).
3. Mọi tool call phải qua RBAC + validate tham số trước khi chạy (FR-019).
4. Client không phải nguồn sự thật: lịch sử do server giữ theo `conversationId`.

---

## 3. Bốn luồng chính

### 3.1 Hỏi chính sách (RAG)
```text
client  --chat:send{clientMessageId}-----→ gateway
gateway --(auth ok, chưa thấy id này)----→ ai-service
ai      --intent=policy_qa---------------→ Retriever.hybrid(question, scope)
retriever --top-K + score----------------→ Orchestrator
orchestrator --ev rỗng?------------------→ abstain → chat:done{abstain:true, missing}
orchestrator --LLM(prompt từ ev)---------→ answer + citation[document,version,article,score]
gateway --lưu message, chat:chunk--------→ client  (nhiều delta)
gateway --chat:done{finishReason}--------→ client
```

### 3.2 Tra số liệu (tool đọc)
`intent` → tool tương ứng → đọc DB → **không** gọi LLM nếu kết quả đã là bảng có cấu trúc; LLM chỉ diễn đạt lại khi cần. Rẻ và ít sai hơn.

### 3.3 Hành động ghi (confirm)
```text
intent=write → orchestrator trả proposed_action{type, args, preview}
gateway → chat:chunk{kind:"action_proposal"}
client bấm xác nhận → chat:confirm{actionId}
gateway → Action Executor: validate RBAC + schema → execute → audit event
gateway → chat:done{applied:true, ref}
```
Quá hạn confirm hoặc từ chối → **không** mutation nào (FR-020).

### 3.4 Degraded (hết quota / provider lỗi)
Theo `08 §6` chế độ `degraded-structured`: intent bằng mẫu cố định, trả **kết quả thô** thay văn xuôi, **không** trả lời chính sách nếu top-K không đủ bằng chứng. Client hiển thị rõ "đang ở chế độ không có LLM".

---

## 4. Hợp đồng WebSocket (nguồn chuẩn: `06-api-spec.md §4.2`)

> **Payload canonical nằm ở [`06-api-spec.md §4.2`](06-api-spec.md).** Mục này chỉ là **mô tả kiến trúc** — ánh xạ
> event vào các luồng ở §3 và cách đọc chúng; **không** định nghĩa lại field. Nếu mục này khác `06 §4.2` thì
> `06 §4.2` thắng và mục này phải sửa. Tổng cộng **10 event đóng** (9 tên của `B7` + `chat:confirm`).

| Event | Chiều | Vai trò trong luồng kiến trúc | Đọc payload ở |
|---|---|---|---|
| `chat:send` | client → server | vào gateway; ack trả `conversationId` + `messageId` để client join stream | `06 §4.2` E-01 |
| `chat:accepted` | server → client | mở một lượt trả lời; `messageId` là khoá join cho mọi chunk | `06 §4.2` E-02 |
| `chat:chunk` | server → client | stream: `kind:'text'` = delta LLM; `kind:'citation'` = bằng chứng RAG (§3.1); `kind:'action_proposal'` = đề xuất hành động ghi chờ confirm (§3.3) | `06 §4.2` E-03 + quy ước §4.2.1 |
| `chat:confirm` | client → server | trả lời challenge confirm của `action_proposal` (`{actionId, approve}`); `approve=false` ⇒ không mutation (FR-020) | `06 §4.2` E-10 |
| `chat:done` | server → client | kết thúc lượt: `finishReason` + `citations`/`card`; message đã commit vào `conversations` **trước** khi emit | `06 §4.2` E-04 |
| `chat:error` | server → client | lỗi guard/provider/LLM; `code` lấy từ catalog `06 §5` (gồm `LLM_UNAVAILABLE`, `MAX_STEPS`, `TOOL_TIMEOUT`, `CONVERSATION_FULL`) | `06 §4.2` E-05 |

Đối chiếu với phiên Chatbase quan sát được (`research/SPEC-chatbase-2026-10-20.md` §3): `start/start-step/text-delta/finish` ánh xạ 1–1 vào `accepted/chunk/done`; `data-showQnaMatched` là bằng chứng cho thấy **data-part nghiệp vụ** là hợp lệ — ta dùng đúng chỗ đó cho `citation` và `action_proposal`.

---

## 5. Tool catalog (thay 6 tool ca kíp hiện có)

| Tool | Loại | Collection | Quyền | Ghi chú |
|---|---|---|---|---|
| `get_my_profile` | read | `employees` | own | allowlist, không phone của người khác |
| `get_my_projects` | read | `projects` | own (`assigneeIds`) | index `(assigneeIds,status)` |
| `get_project_status` | read | `projects` | own / Admin scope | |
| `get_my_kpi` | read | `evaluations` | own | cần tạo collection |
| `get_department_kpi` | read | `evaluations` | Admin | RBAC_DENIED cho Employee (FR-016) |
| `search_policy` | read | `policies` | cả 2 vai | hybrid retrieval + citation |
| `submit_report` | **write** | `reports` | assignee | confirm bắt buộc (FR-020) |

**Khoảng trống catalog** (đã ghi ở FR-022): 10 intent chưa có tool, trong đó `#12a..#12c` (nhận/từ chối/đổi phân công) thuộc FR-045 đang BLOCKED — chatbot **không** được giả tool cho các intent này, chỉ chỉ đường dashboard.

Tool hiện tại (`get_my_schedule`, `get_shift_coworkers`, `submit_attendance_correction`, `get_cash_reconciliation`, `find_replacement_staff`) thuộc domain ca kíp đã bị loại khỏi phạm vi (`20 §4`, quyết định A1) → **không port sang F3**.

---

## 6. Decision & Knowledge Layer (Jev AI + In-Context Policy)

Thay thế hoàn toàn cụm PhoBERT + BM25 bằng mô hình phân định Typed Decision của **Jev AI (TypeSafe System One)** kết hợp **In-Context Policy Prompting**:

### 6.1. Jev AI Decision Gateway (~100ms)
Trước khi gọi LLM sinh văn bản, request đi qua Jev AI Decision Model để đưa ra các quyết định có kiểu tĩnh (Typed Decisions):
1. **Choice (Phân loại Intent):**
   - `policy_query`: Hỏi quy chế, nội quy, kiểm quỹ, đi trễ, nghỉ phép.
   - `shift_operation`: Tra cứu ca, đổi ca, xin vắng ca.
   - `cash_audit`: Tra cứu số dư két, biên bản kiểm quỹ, chênh lệch tiền.
   - `general_chat`: Chào hỏi, tư vấn thực đơn Guta, hỏi đáp chung.
2. **Noul (Boolean Probability - Cần phê duyệt?):**
   - Đánh giá xem hành động người dùng yêu cầu có vượt thẩm quyền hay cần Manager (SM/AOM) duyệt không (`needs_approval`).
3. **Score (Urgency 0.0 - 1.0):**
   - Chấm điểm mức độ khẩn cấp (sự cố mất quỹ, thiếu nhân sự ca gấp, tai nạn cửa hàng).

### 6.2. In-Context Policy Injection (Zero-Vector, Zero-PyTorch)
- Do Gemini 3.8/1.5 Flash có context window cực lớn (1M tokens) và chi phí xử lý trên proxy tối ưu, toàn bộ 10 quy chế cốt lõi của Guta Cafe (chấm công, kiểm quỹ, nội quy lao động, kỷ luật) được nạp trực tiếp vào System Prompt / Dynamic Context.
- **Ưu thế vượt trội:**
  - Không cần tải model PyTorch 400MB (PhoBERT) làm sập RAM Render free tier.
  - Không phụ thuộc Atlas Vector Index hay BM25 text index (loại bỏ lỗi môi trường Windows/Linux).
  - LLM nhìn thấy toàn văn điều khoản để trích dẫn chính xác 100% (Document, Version, Article) mà không bị cắt vụn qua chunking.

---

## 7. LLM Provider

- Giữ `LLMProvider` abstraction (`ADR-012`): primary + fallback, đổi provider bằng config.
- **Data minimization trước khi ra khỏi hệ thống:** chỉ gửi allowlist (`fullName`, `level`, `department`, `skills`, `status`); cấm `bank_*`, lương, CCCD, `leave_reason` (NFR-12).
- **Judge model** riêng cho eval (faithfulness/citation) — dùng chính API dư của nhóm, không ảnh hưởng production path.
- Không log prompt chứa PII; log chỉ `messageId` + `score` + `finishReason`.

---

## 8. Guard & failure modes (FR-019)

### 8.1 Quyết định quyền là **ba giá trị**, không phải boolean

Học từ `PermissionEngine` của Skawld (`src/permissions/engine.ts`, MIT — chỉ tham khảo pattern, **không** dùng làm dependency):

```text
allow  → chạy ngay
deny   → không chạy, trả lý do (KHÔNG hỏi lại, tránh vòng lặp dụ dỗ)
ask    → hiển thị confirm cho người dùng, chờ quyết định
```

Thiết kế cũ của tôi ("write thì hiện confirm") là boolean đội lốt. Ba giá trị cho phép biểu diễn
đúng trường hợp **deny cứng**: `Employee` gọi `get_department_kpi` phải bị chặn thẳng, không được
hiện hộp thoại "bạn có muốn cho phép?" — vì người dùng bấm Có cũng không được phép.

### 8.2 Thứ tự đánh giá (tất định, không có LLM trong vòng này)

```text
1. validate tham số          → sai kiểu/thiếu field  ⇒ deny
2. rule khớp đầu tiên        → tool rule > path rule > custom rule (first match wins)
3. mặc định theo loại tool   → read: allow (nếu trong scope) · write: ask
4. ask → confirm của người dùng
```

**Bất biến quan trọng:** model **không** được tham gia bước 2–4. Model chỉ đề xuất `tool + args`;
quyền do code quyết. Nếu để model tự đánh giá "việc này có an toàn không" thì đó là lỗ hổng, không
phải tính năng.

### 8.3 Fail-closed — mọi nhánh lỗi đều là `deny`

| Tình huống | Kết quả | Nguồn pattern |
|---|---|---|
| Không có handler confirm (client cũ, lỗi UI) | **deny** | `canUseTool` undefined |
| Confirm callback throw / timeout | **deny** | callback failed |
| Người dùng đóng hộp thoại / huỷ phiên (`abort`) | **deny** | signal aborted |
| Response confirm sai shape | **deny** | invalid response |
| `updatedInput` (người dùng sửa tham số trước khi duyệt) sai schema | **deny** + validate lại | re-validate sau khi duyệt |

Điểm cuối là bài học đáng giá nhất: nếu cho phép người dùng/Admin **sửa tham số** trong lúc duyệt
(ví dụ sửa `assigneeId`), thì phải **validate lại** — nếu không, đường duyệt trở thành đường vòng qua
validate ban đầu.

### 8.4 Guard cụ thể

| Guard | Giá trị | Hành vi khi vượt | Trạng thái |
|---|---|---|---|
| `maxSteps` | 5 (FR-019) | `chat:error{code:"MAX_STEPS"}` | chốt |
| `toolTimeout` | `TBD` | `chat:error{code:"TOOL_TIMEOUT"}`, không deadlock | phải đo p95 trước khi đặt |
| `LLM timeout` | `TBD` | rơi `degraded-structured` (`08 §6`) | phải đo p95 |
| validate args | mọi tham số | `deny` + hỏi lại, **không** chạy tool | chốt |
| RBAC mỗi tool | bảng §5 | `RBAC_DENIED`, không lộ dữ liệu | chốt |
| trần kết quả tool | `TBD` | cắt + ghi log `truncated=true` | phải đo kích thước thật |
| trần `maxSteps` khi confirm | 1 lượt confirm / 1 action | action quá hạn ⇒ `deny`, không mutation | chốt |

### 8.5 Fail-closed đã có tiền lệ trong repo

Cùng nguyên tắc đã áp cho những chỗ khác, nên đây không phải quy tắc mới:
- Refresh-token reuse ⇒ revoke cả family (`ADR-008`)
- Test DB guard: sai URI ⇒ `exit 1` trước khi import app
- AI mock chat ⇒ `403` khi chưa cấu hình

### 8.6 Tham khảo (không bắt buộc đọc)

| File | Pattern | Dùng ở |
|---|---|---|
| `skawld-sdk/src/permissions/engine.ts` | tri-state + fail-closed + re-validate `updatedInput` | §8.1–8.3 |
| `skawld-sdk/src/permissions/mode.ts` | mode `default / acceptEdits / yolo` | gợi ý: `dev` vs `demo` của ta, **chưa** áp |
| `skawld-sdk/src/permissions/rules.ts` | first-match, deny thắng, tách lệnh ghép `&& \|\| ; \| &` rồi xét từng đoạn | nếu sau này có tool shell (hiện không có) |

---

## 9. Dữ liệu & ERD delta

### 9.1 `conversations` (collection thứ 12 — cần GVHD duyệt)

```mermaid
erDiagram
  USERS ||--o{ CONVERSATIONS : "so_huu"
  CONVERSATIONS {
    ObjectId _id PK
    ObjectId userId "-> users"
    string channel "web"
    string status "active / closed / handoff"
    array messages "embed, tran 50"
    date startedAt
    date lastMessageAt
    number messageCount "dan xuat, phuc vu tran"
  }
```

Chi tiết trường, bất biến, index, retention: [`design/conversations-storage.md`](design/conversations-storage.md).

**Phân biệt hai thứ dễ bị gộp làm một (bài học từ `skawld-sdk/src/core/compaction.ts`):**

| | Trần lưu trữ (DB) | Cửa sổ gửi LLM (prompt) |
|---|---|---|
| Giới hạn | 50 message / conversation | 10 lượt gần nhất + tóm tắt phần cũ |
| Ai chịu trách nhiệm | `apps/api` | `ai-service` khi dựng prompt |
| Hệ quả khi vượt | tạo conversation mới, bản cũ `closed` | nén phần cũ thành **1 message tóm tắt** ở đầu |
| Mất mát | không mất (append-only trong document) | mất chi tiết, giữ quyết định + tool + câu hỏi mở |

Lý do phải tách: trần 50 **không** bảo vệ được context window. 50 tin nhắn chính sách dài có thể vượt
ngưỡng token của model, và lúc đó nếu chỉ biết "cắt bớt" thì mất đúng phần đầu cuộc hội thoại — nơi
người dùng đã nêu ràng buộc. Nén có tóm tắt giữ được thông tin mà cắt thô thì không.

**Ngưỡng nén (chưa áp dụng, ghi để chốt sau):** kích hoạt khi `input_tokens + max_output_tokens ≥ 0.8 ×
contextWindow` — đo token thật, **không** đếm số message. Trần 50 chỉ là chốt chặn lưu trữ, không phải
logic nén.

### 9.2 `employees.profileChangeRequests` (đã duyệt 12/10, **chưa có trong ERD `05 §2`**)

Embed bounded (trần 20 request), trạng thái `PENDING|APPROVED|REJECTED`, chặn tự duyệt, resubmit giữ `previousRequestId`. Nguồn: `design/fr003-004-approval-storage.md`. → `05 §2` cần bổ sung khi cập nhật ERD.

### 9.3 Collection thiết kế có nhưng **chưa có model** trong code

`departments` · `project_events` · `evaluations` · `policies` · `notifications` · `feedback_events`

F3 **không chạy được** nếu thiếu `policies` (retrieval) và `evaluations` (KPI). Đây là phụ thuộc cứng, không phải việc "làm sau".

### 9.4 Ngoài phạm vi, không xoá

`stores`, `schedule_entries`, `attendance_corrections`, `cash_counts` (legacy ca kíp) — model còn, API đã 503. ERD tổng thể phải ghi chú "legacy, ngoài phạm vi F1–F7" để hội đồng không hỏi nhầm.

---

## 10. Eval (điều kiện để F3 có điểm khoa học)

| Metric | Đo gì | Nguồn |
|---|---|---|
| Intent→tool accuracy | câu trong catalog 28 intent → tool đúng | FR-015 |
| Retrieval recall@K | chunk đúng có trong top-K | mới, theo `08 §7` |
| Citation correctness | `document/version/article` khớp chunk | BR-15, FR-017 |
| Abstain rate / false-answer rate | từ chối đúng chỗ, không bịa | FR-018 |
| Faithfulness (judge) | câu trả lời có suy ra từ evidence | mới, LLM-as-judge |

Harness: bộ câu hỏi tất định + `temperature=0` + snapshot, chạy `pytest -m eval` trong `apps/ai-service` (`02 §8`).

---

## 11. Rủi ro & gate

| # | Rủi ro | Gate / cách chặn |
|---|---|---|
| R-21.1 | `$vectorSearch` không chạy trên Atlas M0 | **ĐÃ PROBE 2026-10-20 — PASS.** DB tạm `rea_vector_probe`: `createSearchIndexes` accepted, index `READY` sau ~30s, query trả `doc0` score 1.0 / `doc1` 0.5, DB đã drop. Hybrid khả thi về hạ tầng |
| R-21.2 | Collection thứ 12 bị GVHD từ chối | Có sẵn phương án C (không lưu), chỉ mất dữ liệu eval |
| R-21.3 | Hybrid làm trễ tiến độ | Cắt về `dense` bằng config; interface đã tách |
| R-21.4 | Gửi PII ra LLM bên thứ ba | Allowlist ở §7 + câu hỏi GVHD #5 (`01` §câu hỏi mở) |
| R-21.5 | Sai ngưỡng abstention | Hiệu chuẩn trên tập validation, ghi số thật vào báo cáo |

---

## 12. Cần duyệt trước khi code

1. **Collection thứ 12 `conversations`** (D-21.3) — trái luật baseline `05 §1.1`, phải có ý kiến GVHD.
2. **Hybrid dùng text index thứ 2** — nằm trong trần 3 index free tier (`05 §4.3`), nhưng phải xác nhận không đụng index của F4.
3. **Agent loop ở `ai-service`** (D-21.2) — đóng điểm treo #4 `02 §12`, cần ADR mới ghi lại.

## 13. Chưa quyết (ghi rõ, không giả vờ đã xong)

- `TOP_K`, `MIN_EVIDENCE`, trọng số fusion, model embedding, chunk size/overlap
- `toolTimeout`, `LLM timeout`, trần kích thước kết quả tool
- Retention của `conversations` (bao lâu thì xoá/đóng)
- Có dùng lại `feedback_events` cho đánh giá câu trả lời hay không

---

## 14. Lộ trình mở rộng & Học hỏi Agent Sandbox (Roadmap / Coming Soon)

Học hỏi từ mô hình Agentic Container Isolation (tham chiếu kiến trúc Zero-Trust Agent Host):

1. **Outbound Egress Proxy & Key-Swap:** Tách biệt LLM API Key thật khỏi AI Sidecar. Sidecar chỉ nhận `per-turn ephemeral token`; Egress Proxy hoán đổi secret key từ Vault và thực thi domain allowlist nghiêm ngặt (chống prompt injection data exfiltration).
2. **Isolated Docker Sandbox Runner:** Cung cấp môi trường thực thi mã cô lập (Docker container) để chạy phân tích số liệu chấm công / KPI / xuất file báo cáo mà không tiêu tốn RAM hay rủi ro crash dịch vụ chính.
3. **Headless Browser Agent (Chrome CDP + Xvnc):** Tự động hóa tác vụ trên portal nhân sự bên ngoài (tra cứu bảo hiểm xã hội, nộp báo cáo lao động).
4. **Episodic & Long-term Memory (Qdrant + SQLite Git):** Vượt qua giới hạn 50 tin nhắn của `conversations`, lưu trữ vết ngữ cảnh dài hạn và thói quen đổi ca của nhân viên có thể kiểm toán qua Git commit log.
5. **Omni-Channel Ingress Relay:** Mở rộng kết nối qua Telegram Bot và Zalo OA thông qua Tailscale sidecar bảo mật cho quản lý cửa hàng trên di động.


# Thiết kế lưu trữ hội thoại Chatbot (F3)

- **Trạng thái:** PROPOSED — chờ GVHD duyệt collection thứ 12
- **Ngày:** 2026-10-20
- **Liên quan:** `FR-021` (idempotency), `D-08` (`05 §7` — trước đây chốt "không lưu"), `21-chatbot-architecture.md` §9

---

## 0. Vì sao phải bàn lại D-08

`D-08` kết luận: *"MVP không lưu lịch sử chat (không có collection) → ghi vào `06-api-spec.md` như một giới hạn"*.

Ba lý do khiến quyết định đó không còn đủ:

1. **FR-021** yêu cầu idempotency theo `clientMessageId` — muốn chống trùng sau reconnect thì phải biết message nào đã xử lý. Không có nơi lưu ⇒ chỉ chống trùng trong RAM, mất khi restart.
2. **FR-018 + eval** cần dữ liệu thật của các lần abstain để đo `abstain rate` / `false answer rate`.
3. **FR-017** cần truy vết `citation` đã trả cho người dùng, phục vụ review học thuật.

Đổi lại: thêm **1 collection** (điều baseline `05 §1.1` cấm nếu chưa có ý kiến GVHD).

---

## 1. Schema

```text
conversations
  _id             : ObjectId   : PK
  userId          : ObjectId   : required, reference users  (index (userId, lastMessageAt))
  channel         : 'web'      : required, enum đóng — chưa mở Zalo/Telegram
  status          : 'active' | 'closed' | 'handoff'
  messages        : Message[]  : embed, tối đa 50 phần tử
  messageCount    : number     : dẫn xuất của messages.length, phục vụ kiểm tra trần
  startedAt       : Date
  lastMessageAt   : Date
  closedAt        : Date?      : có khi status = 'closed'
  contextSummary  : object?    : {text, coversUpToMessageId, createdAt} — chỉ có khi đã nén cửa sổ prompt
```

```text
Message (embed)
  id              : string     : UUID, khớp messageId phát ra client
  role            : 'user' | 'assistant' | 'system'
  content         : string     : nội dung hiển thị (assistant: markdown)
  intent          : string?    : từ catalog 28 intent
  toolCalled      : string?    : tên tool trong catalog
  citations       : Citation[] : {document, version, article, score}
  score           : number?    : điểm retrieval cao nhất của câu trả lời
  abstain         : boolean    : true nếu FR-018 kích hoạt
  clientMessageId : string?    : chỉ có ở role='user', dùng chống trùng
  createdAt       : Date
```

**Không lưu:** chain-of-thought, prompt thô gửi LLM, `bank_*`, lương, CCCD, `leave_reason`. Nếu message chứa PII do người dùng tự gõ, lưu nguyên văn nhưng **không** dùng lại trong prompt của người khác.

---

## 2. Bất biến

1. **Trần 50 message/conversation.** Chạm trần → tạo conversation mới (`status = active`), conversation cũ chuyển `closed`. **Không xoá** message cũ trong cùng document.
2. **Append-only trong một conversation.** Không sửa/xoá message đã ghi; chỉ đổi `status` của conversation.
3. **Idempotency:** `chat:send` trùng `clientMessageId` trong cùng conversation → trả lại kết quả cũ, **không** thêm message, **không** gọi tool lần hai (FR-021).
4. **Atomic theo single-document:** `findOneAndUpdate({_id, messageCount: {$lt: 50}}, {$push:{messages}, $inc:{messageCount:1}})` — không cần multi-document transaction (`ADR-004`).
5. **Thứ tự ghi:** commit message vào `conversations` **trước**, phát `chat:done` **sau**. Lỗi WS không làm mất bản ghi (cùng nguyên tắc với FR-003/004 notification).
6. **Không lưu khi chưa xác thực:** conversation luôn gắn `userId`; không có conversation ẩn danh (khác Chatbase — có chủ đích, vì RBAC).
7. **Trần lưu trữ không phải cửa sổ prompt.** 50 message là giới hạn **lưu**; cửa sổ **gửi LLM** là 10 lượt gần nhất + tóm tắt phần cũ. Hai thứ do hai service khác nhau quản (`apps/api` vs `ai-service`). Gộp chúng làm một là lỗi: 50 message chính sách dài vẫn có thể vượt context window.
8. **Nếu dùng tóm tắt thì phải lưu tóm tắt.** Trường optional `contextSummary: {text, coversUpToMessageId, createdAt}` — để lần chạy sau và lúc eval tái lập được đúng nội dung đã gửi model. Không lưu thì mỗi lượt tóm tắt lại một kiểu, kết quả eval không tái lập.

---

## 3. Index

| Index | Loại | Dùng cho |
|---|---|---|
| `(userId, lastMessageAt)` | compound desc | mở lại phiên gần nhất |
| `(userId, status)` | compound | danh sách phiên đang mở |
| `messages.clientMessageId` | không index | dò trong document sau khi đã có conversationId; nếu cần dò toàn cục thì thêm `(userId, messages.clientMessageId)` — **chưa làm** vì chưa có query đó |

Không thêm index nào khác: mỗi index là một lần ghi thêm (`05 §4.2`).

---

## 4. Retention

- `active` → `closed` khi: chạm trần 50, hoặc quá **30 ngày** không có message mới.
- `closed` giữ **90 ngày** rồi xoá (TTL trên `closedAt`), trừ khi bật cờ giữ lại cho eval.
- `retention` là **cấu hình**, không hard-code, và phải ghi trong báo cáo phần dữ liệu.

---

## 5. Phương án dự phòng nếu GVHD từ chối collection thứ 12

| Phương án | Cách làm | Mất gì |
|---|---|---|
| **C** (đúng D-08) | Không lưu; client giữ history trong memory; idempotency bằng cache Redis-like trong RAM | mất dữ liệu eval, mất khả năng mở lại phiên; `clientMessageId` chỉ chống trùng trong 1 phiên |
| **B'** (thu nhỏ) | Lưu **1 message cuối + score + abstain** vào `feedback_events` (đã có trong baseline) | không có hội thoại, nhưng vẫn đo được chất lượng |

Ghi rõ phương án chọn vào `06-api-spec.md` như giới hạn đã biết — không im lặng.

---

## 6. Việc phải làm khi được duyệt

1. Thêm schema vào `packages/contracts` (`ConversationSchema`, `ChatMessageRecordSchema`)
2. Model Mongoose `Conversation` trong `apps/api/src/models`
3. Cập nhật ERD `05 §2` (hiện chưa có `conversations` và `profileChangeRequests`)
4. API: `GET /api/conversations`, `GET /api/conversations/:id` (own-only, Admin theo scope)
5. Test: trần 50, idempotency, append-only, TTL — đều phải có assertion

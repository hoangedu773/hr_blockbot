---
plan: agent-clarify
created: 2026-10-29 09:20 (+07)
status: ready-for-execution
depends_on: plans/261029-0820-fix-all-bugs (P1-7 đã xong phần dữ liệu)
---

# Plan: Agent biết hỏi lại (clarify turn)

## Vấn đề

Hiện agent chỉ có hai kết cục: trả lời, hoặc từ chối/khớp rule. Khi câu hỏi cần một tham số mà hệ thống
không có (ví dụ: "ca tối nay của tôi thế nào?" nhưng tài khoản chưa gắn cửa hàng, hoặc người dùng muốn hỏi
cửa hàng khác), agent **đoán** hoặc trả lời sai phạm vi.

Yêu cầu: câu hỏi chung (áp dụng toàn chuỗi) thì trả lời luôn; câu hỏi cần cửa hàng cụ thể thì agent **hỏi
lại kèm menu** để người dùng chọn. Đây là năng lực chung, không chỉ cho cửa hàng.

## Thiết kế

### 1. Kiểu trả lời mới: `clarify`

`AgentTurn` thêm một trường (không phá vỡ client cũ vì là optional):

```json
{
  "clarify": {
    "field": "store",
    "question": "Bạn muốn xem ca làm của cửa hàng nào?",
    "options": [{ "label": "Guta Nguyễn Trãi", "value": "store-001" }, ...],
    "originalText": "ca tối nay của tôi thế nào"
  }
}
```

`field` mở rộng được: `store | employee | date_range | policy_scope`. Thêm field mới chỉ cần thêm một
nhánh dựng `options`, không đổi contract.

### 2. Khi nào hỏi lại — phải tất định, không để LLM quyết

Điều kiện (kiểm trong `loop.py`, trước khi gọi LLM):

```text
plan.tool_name ∈ TOOLS_CẦN_CỬA_HÀNG   (get_shift, get_coworkers, get_cash, ...)
AND user_ctx không có store đang chọn
AND không có clarifyAnswer trong lượt này
→ trả clarify, options lấy từ collection `stores` (144 dòng, lọc theo department nếu có)
```

- Không gọi LLM cho bước này ⇒ < 50ms, không tốn token.
- Câu hỏi toàn chuỗi (`policy_query`) **không** kích hoạt clarify ⇒ trả lời luôn như hiện tại.
- Tối đa **1 lần** clarify mỗi lượt; nếu người dùng vẫn không chọn được ⇒ trả lời kèm giả định, ghi rõ
  giả định trong `answer_source`.

### 3. Đáp lại clarify

Request sau mang thêm `clarifyAnswer: { field, value }`. Server lưu vào bộ nhớ theo `conversationId`
(TTL 10 phút) rồi chạy lại câu hỏi gốc với `user_ctx` đã bổ sung cửa hàng. Không cần client giữ state.

### 4. Đường đi qua các tầng

| Tầng | Thay đổi |
|---|---|
| `packages/contracts` | thêm `ClarifySchema` + `clarify?` vào `ChatDonePayloadSchema`; thêm `clarifyAnswer?` vào `ChatSendPayloadSchema` |
| `apps/ai-service` | `AgentTurn.clarify` + `as_dict`; hàm `build_clarify()`; nhánh trong `loop.run`; `ClarifyMemory` (dict + TTL) |
| `apps/api` | `chatResultSchema` + `ChatResult` + `routes/chat.ts` + `socket.ts` chuyển tiếp `clarify` / `clarifyAnswer` |
| `apps/web` | `ChatPageView` vẽ nút lựa chọn dưới bong bóng; bấm ⇒ gửi `clarifyAnswer` kèm `originalText` |

## Phase

| Phase | Nội dung | File sở hữu | Xong khi |
|---|---|---|---|
| C1 | Contract + kiểu `clarify` | `packages/contracts/src/index.ts` | `contracts test` pass, có test schema mới |
| C2 | Sinh clarify trong agent + bộ nhớ đáp án | `apps/ai-service/app/agent/loop.py`, `clarify.py` (mới), `tests/test_clarify.py` | test: câu cần cửa hàng → clarify; câu toàn chuỗi → trả lời luôn; đáp lại → chạy đúng tool |
| C3 | Chuyển tiếp qua API + socket | `routes/chat.ts`, `socket.ts`, `ai-client.service.ts` | `tsc` 0, `chat-gateway.test.mjs` pass |
| C4 | Menu trong khung chat | `ChatPageView.tsx` | bấm chọn ⇒ có câu trả lời, không lặp menu |
| C5 | Kiểm với dữ liệu thật | — | 144 cửa hàng đổ vào menu; chọn 1 cửa hàng ⇒ tool trả đúng dữ liệu cửa hàng đó |

## Acceptance (kiểm bằng lệnh)

```bash
cd apps/ai-service && python -m unittest tests.test_clarify -v
cd apps/api && npx tsc --noEmit
node --test apps/api/test/chat-gateway.test.mjs
node --test apps/web/test/landing-workflow.test.mjs
```

Ba kịch bản bắt buộc:

1. `"Đi muộn 10 phút bị phạt bao nhiêu?"` (toàn chuỗi) → **trả lời ngay**, không clarify.
2. `"Ca tối nay của tôi thế nào?"` khi tài khoản chưa gắn cửa hàng → **clarify**, options = 144 cửa hàng,
   phản hồi < 200ms, không gọi LLM.
3. Sau khi chọn cửa hàng → tool chạy đúng phạm vi cửa hàng đó, `answer_source` ghi rõ đã dùng lựa chọn.

## Không làm trong plan này

- Không thêm collection mới (ADR-018). Bộ nhớ clarify là in-memory, mất khi restart — chấp nhận được vì
  TTL 10 phút và chỉ phục vụ một lượt hội thoại.
- Không dùng LLM để sinh câu hỏi clarify (giữ tất định + rẻ). Nếu sau này cần câu hỏi tự nhiên hơn, thay
  phần `question` bằng template có tham số, không gọi model.

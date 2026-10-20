# SPEC — Chat surface (clean-room, evidence-first)

- **Ngày tạo:** 2026-10-20 (Asia/Bangkok)
- **Chế độ:** `--spec-only` (không viết code sản phẩm)
- **Target:** Chatbase web widget công khai `https://www.chatbase.co/`
- **Công cụ:** REA 6.7.0 (npm `rea-agents@6.7.0`, MIT), PowerShell 7, Playwright/CDP (Chromium 153)
- **Trạng thái:** chờ reviewer gate + người duyệt. **Chưa build.**

> Nguyên tắc: mỗi rule dưới đây chỉ được giữ nếu có evidence trích dẫn được. Rule nào
> không truy được về file/bản ghi cụ thể thì nằm ở §8 "Chưa biết", không được nâng thành rule.

---

## 1. Nguồn bằng chứng (evidence ledger)

| ID | Loại | Vị trí | Ghi chú |
|---|---|---|---|
| E1 | REA evidence | `ev_95a4475f...c8cb1c4` — `cb-bot-page.json` | `inspect-web-page` qua CDP, 8s, 80 script, DOM + accessibility + console |
| E2 | REA evidence | `ev_fb542dd0...846e793` — `cb-har-evidence.json` | `inspect-web-network-capture` trên HAR đã lọc, 2 record |
| E3 | REA evidence | `ev_a2a6e1de...52d4c011` | `list-browser-targets` (Chrome/153.0.8010.12, CDP 1.3) |
| E4 | HAR gốc | `chatbase-chat.har` (298 entry) | phiên chat thật, 2026-10-20T13:24:32Z→13:24:44Z |
| E5 | HAR lọc | `chatbase-chat.min.har` (2 entry) | chỉ giữ `/api/chat/*` để REA decode được |
| E6 | Ảnh chụp | `chatbase-chat.png` | trạng thái sau khi agent trả lời xong |
| E7 | Transcript | stdout `interact-chatbase.cjs` | DOM text của widget sau khi trả lời |

Không có bước nào đọc source code của Chatbase; toàn bộ là bundle đã phát hành + traffic thật
của phiên do mình khởi tạo.

---

## 2. Hợp đồng request

- **Method/Path:** `POST /api/chat/{chatbotId}`
- **Content-Type:** `application/json`
- **Accept:** `*/*` (client không yêu cầu `text/event-stream`, server vẫn trả SSE) — E5
- **Body (quan sát nguyên văn, E5):**

```json
{
  "user": { "anon_user_id": "fa178703-17a1-445f-a387-07a7f5cc8568" },
  "timezone": "Asia/Bangkok",
  "chatbotId": "z2c2HSfKnCTh5J4650V0I",
  "conversationId": "45b0e6ef-735e-48c9-92e7-ccee2770652a",
  "message": "What can Chatbase do for customer support?",
  "clientInitialMessages": [],
  "channel": "chat_widget",
  "embedOrigin": "https://www.chatbase.co/"
}
```

**R1.** Danh tính người dùng là **anonymous id sinh phía client**, không phải tài khoản: cùng một
`anon_user_id` được gửi lại ở mọi lượt. (E5)

**R2.** `conversationId` được client cấp và **giữ nguyên giữa các lượt**; `chatbotId` nằm cả trong
path lẫn body. (E5)

**R3.** Client gửi kèm `timezone` (IANA) và `embedOrigin` — server dùng để cá nhân hoá thời gian
và kiểm tra nguồn nhúng. (E5)

**R4.** Lịch sử hội thoại **không** được client gửi lại mỗi lượt (`clientInitialMessages: []`).
Lịch sử do server giữ theo `conversationId`. (E5) — hệ quả thiết kế: server là nguồn sự thật,
client chỉ gửi tin mới.

---

## 3. Hợp đồng response — SSE

- **Status:** `200`, **`Content-Type: text/event-stream`**, độ dài quan sát `27.156` ký tự,
  `473` dòng, `235` frame JSON. Thời gian 12.379,86 ms. (E4, E5)
- Mỗi frame là một dòng `data: {json}\n`; **không có** dòng `event:` (tên sự kiện nằm trong
  trường `type` của JSON). (E4)

### 3.1 Bảng event (đếm thật từ phiên E4)

| # | `type` | Số lần | Payload quan sát | Ý nghĩa suy ra (DERIVED từ thứ tự) |
|---|---|---:|---|---|
| 1 | `start` | 1 | `messageId`, `messageMetadata.createdAt` | mở một message assistant mới |
| 2 | `start-step` | 1 | — | mở một "step" (một lượt gọi model) |
| 3 | `message-metadata` | 116 | `messageMetadata.createdAt` | cập nhật mốc thời gian giữa các delta |
| 4 | `reasoning-start` | 1 | `id`, `providerMetadata.openai.itemId`, `reasoningEncryptedContent` | bắt đầu phần suy luận ẩn |
| 5 | `reasoning-end` | 1 | như trên | kết thúc suy luận ẩn |
| 6 | `text-start` | 1 | `id`, `providerMetadata.openai.phase="final_answer"` | bắt đầu phần trả lời hiển thị |
| 7 | `text-delta` | 110 | `id`, `delta` (chuỗi ngắn) | từng mảnh chữ để render dần |
| 8 | `text-end` | 1 | `id` | đóng phần trả lời |
| 9 | `finish-step` | 1 | — | đóng step |
| 10 | `finish` | 1 | `finishReason: "stop"`, `messageMetadata.createdAt` | đóng stream, báo lý do kết thúc |
| 11 | `data-showQnaMatched` | 1 | `id`, `data: false` | data-part tuỳ biến: cờ "không khớp QnA có sẵn" |

**R5.** Giao thức là họ **Vercel AI SDK UI message stream** (tên `type` trùng khớp bộ
`start / start-step / text-start / text-delta / text-end / finish-step / finish`), không phải
WebSocket. (E4)

**R6.** Thứ tự bắt buộc quan sát được: `start` → `start-step` → (`reasoning-*` tuỳ chọn) →
`text-start` → `text-delta`* → `text-end` → `finish-step` → `finish`. (E4)

**R7.** Suy luận của model được truyền cho client **ở dạng mã hoá** (`reasoningEncryptedContent`,
tiền tố `gAAAAA`), tức client không đọc được nội dung, chỉ biết "đang suy luận". (E4) — đây là
pattern để ẩn chain-of-thought mà vẫn hiển thị trạng thái.

**R8.** Nội dung trả lời cuối nằm ở `text-delta.delta` nối tiếp nhau; `text-start` mang cờ
`phase: "final_answer"`. (E4)

**R9.** Kết thúc bình thường = `finish.finishReason = "stop"`; không có frame `error` trong phiên
này. (E4)

---

## 4. Resource hội thoại (đọc lại sau phiên)

`GET /api/chat/{chatbotId}/conversations/{conversationId}` → `200 application/json`, 2.136 ký tự (E5)

```json
{
  "id": "45b0e6ef-...",
  "messages": [
    { "id": "...", "createdAt": "...", "role": "assistant", "type": "text", "content": "..." },
    { "id": "...", "createdAt": "...", "role": "user", "content": "..." },
    { "id": "...", "stepId": "...", "role": "assistant", "type": "text", "score": 0.8843, "content": "..." }
  ],
  "activity_state": "...",
  "last_message_at": "...",
  "live_chat": "...",
  "attachmentSignedUrls": "..."
}
```

**R10.** Message lưu DB **khác** message stream: có `id`, `createdAt`, `role`, `type`, tuỳ chọn
`stepId`; message assistant có thêm **`score`** (số thực 0–1, phiên này `0.8843`). (E5)

**R11.** Phản hồi có cấu trúc markdown (danh sách `-`), được lưu nguyên văn trong `content`. (E5)

**R12.** Có `live_chat` trong resource → hệ thống có khái niệm chuyển sang người thật, tách khỏi
luồng text. (E5) — giá trị cụ thể chưa quan sát được, xem §8.

---

## 5. Trạng thái giao diện quan sát được (E6, E7)

| Trạng thái | Bằng chứng | Mô tả |
|---|---|---|
| Chào | E7 | "Hey! 👋 Ask me anything about Chatbase." — assistant mở đầu trước khi hỏi |
| Đang trả lời | E6 | bong bóng "..." + nút **End** để cắt phiên |
| Có câu trả lời | E6, E7 | render markdown, có nhãn thời gian "Just now" |
| Cuộn | E7 | nút "Scroll to bottom" xuất hiện khi nội dung dài |
| Lỗi | E6 (lần mở iframe trực tiếp) | "Not supported" + nút **Try again** — iframe khoá theo referrer |

**R13.** Widget chặn nhúng trực tiếp khi thiếu host hợp lệ: mở `chatbot-iframe/...` ngoài ngữ
cảnh trang chủ trả về trạng thái lỗi "Not supported". (E6) — tức có kiểm tra `embedOrigin`.

---

## 6. Giới hạn đã gặp khi chạy REA (không giấu)

1. **`rea analyze-web-bundle` OOM** trên cả trang chủ (2,5 MB, ~40 chunk) và trang widget nhỏ:
   chết ở 4.096 MB rồi 6.144 MB heap (`FATAL ERROR: Ineffective mark-compacts near heap limit`).
   Không lấy được module graph tự động ⇒ chuyển sang đường runtime (CDP + HAR), vẫn là
   evidence hợp lệ của REA nhưng **không có** call graph.
2. **`rea inspect-web-network-capture` từ chối HAR Playwright**: entry 103 có
   `serverIPAddress` không phải IPv4 → `invalid_request`. Khắc phục bằng lọc còn 2 entry
   `/api/chat/*` + chuẩn hoá IP → decode được.
3. **Fin (`fin.ai`) không dùng được**: bấm "View demo" mở form **bắt buộc business email**
   trước khi vào demo. Không đạt tiêu chí "lấy được liền".
4. **Perplexity**: gửi được query nhưng lần capture đầu crash trước khi ghi HAR; chưa có dữ liệu.

---

## 7. Rule đề xuất đưa vào F3 (sau khi reviewer duyệt)

Chỉ những rule có evidence ở trên, không thêm suy đoán:

- API chat dạng **POST + SSE**, không WebSocket (R5, R6)
- Danh tính **anonymous**, hội thoại do server giữ theo `conversationId` (R1, R2, R4)
- Stream có **vòng đời rõ**: start → step → text-* → finish (R6)
- Suy luận ẩn dưới dạng **encrypted blob** (R7)
- **Data-part tuỳ biến** (`data-*`) để mang tín hiệu nghiệp vụ, ví dụ "có khớp QnA không" (R5, bảng §3.1)
- Bản ghi lưu DB có **score** và **stepId**, tách khỏi message stream (R10)
- Có nhánh **live chat** (chuyển người) tách khỏi luồng text (R12)
- Widget kiểm tra **origin** khi nhúng (R13)

---

## 8. Chưa biết (không được nâng thành rule)

| # | Câu hỏi | Cách xác minh nếu cần |
|---|---|---|
| U1 | Hành vi khi **ngoài phạm vi tài liệu** (từ chối thế nào) | hỏi câu lạc đề, xem `finishReason`/`data-*` |
| U2 | Có **trích nguồn** trong text không | hỏi câu cần dẫn nguồn, xem `data-*`/markdown |
| U3 | `live_chat` kích hoạt khi nào | cần phiên có người thật, hoặc account |
| U4 | Cơ chế **auth** cho user đã đăng nhập | không có account ⇒ không quan sát |
| U5 | Rate limit / lỗi 4xx-5xx | gửi lặp, nhưng phải cân nhắc ToS |
| U6 | Tool-call (`tool-input-*`, `tool-output-*`) | cần kịch bản có hành động, chưa quan sát |

---

## 9. Ánh xạ sang HR BlockBot (F3) — không copy code

| Rule Chatbase | Áp vào F3 thế nào | Ghi chú |
|---|---|---|
| R5/R6 SSE lifecycle | `apps/ai-service` phát SSE `/api/v1/chat`; web đọc `text-delta` | thay mock 403 hiện tại |
| R1/R2 anonymous + conversationId | đổi sang **JWT user** + `conversationId` cho RBAC 2 vai | khác biệt có chủ đích |
| R7 encrypted reasoning | không cần; F3 chỉ cần trạng thái "đang tra cứu" | tránh lộ chain-of-thought |
| data-part tuỳ biến | dùng `data-sources` để trả **trích nguồn chính sách** | đây là điểm khoa học |
| R10 score/stepId | lưu `score` = confidence của RAG | phục vụ eval |
| R12 live chat | nhánh "chuyển Admin" cho câu hỏi ngoài thẩm quyền | |
| R13 origin check | CORS whitelist đã có trong `apps/api/src/app.ts` | |

---

## 10. Rủi ro & pháp lý

- Chỉ dùng **phiên của mình**, một tài khoản ẩn danh, không scrape, không tải dữ liệu người khác.
- Không copy asset/logo/CSS/nội dung; spec chỉ ghi **hành vi**.
- Không suy ra hay tái tạo prompt/model của họ — ngoài phạm vi và không cần cho luận văn.
- Nếu GVHD yêu cầu nguồn học thuật thay vì sản phẩm thương mại: dùng chuẩn công khai
  [Vercel AI SDK UI message stream](https://ai-sdk.dev/docs/ai-sdk-ui/stream-protocol) làm trích dẫn
  chính, và ghi Chatbase là ca quan sát.

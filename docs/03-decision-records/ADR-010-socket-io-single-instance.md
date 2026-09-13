# ADR-010 — Socket.IO một instance, không Redis adapter; notification vẫn persist trong app

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §4 (container), §5.3 (module `realtime`), §6 (trần Render), §7.3, ADR-011

---

## Context

Đề cương bắt buộc realtime qua WebSocket (`RESEARCH-PLAN.md` §1) cho cả hội thoại chatbot lẫn nhắc
hạn. B7 được giao câu hỏi về scaling: "Redis adapter — 1 instance thì không cần, nhưng phải ghi rõ 'out of
scope, tại sao'" (`RESEARCH-PLAN.md` §3 B7).

Hai dữ kiện hạ tầng quyết định (`NOTES-01.md` §B1 dòng 116):

> "Render Free | WebSocket được hỗ trợ; sleep sau 15 phút không có HTTP/WS traffic; wake-up có thể ~1 phút |
> demo được, realtime không luôn tức thì"

và giới hạn connection của Atlas M0: **500 connections** (§B1 dòng 114). Kèm theo là một yêu cầu thiết kế
đã ghi ở §11 của plan: "WS contract" là gate CI (event chưa khai báo trong `06-api-spec.md` → fail).

## Decision

**Chạy Socket.IO trên cùng một tiến trình Express, `Socket.IO + MongoDB`, không Redis**
(`NOTES-01.md` §B7 dòng 356). Cụ thể:

```text
Rooms:  user:<userId>   department:<departmentId>
Events: chat:send chat:accepted chat:chunk chat:done chat:error
        notification:new project:updated report:updated kpi:updated
```

Bốn quy tắc kèm theo đã được chốt trong cùng B7 (dòng 363–366):

1. **Mỗi client message mang `clientMessageId`** để chống duplicate khi reconnect/retry.
2. **Durable notification vẫn phải persist phía app** — WS là kênh tăng tốc, Mongo là sự thật.
3. Socket.IO tự lo fallback + reconnect ⇒ **không** tự viết lại tầng đó.
4. **Một namespace duy nhất**, "không cần 2 namespace ngay".

Và một quy tắc architecture rút ra cho `apps/api`: **chỉ module `realtime` được chạm Socket.IO server**;
mọi module khác (project, notification, chatbot) đẩy event qua publisher duy nhất
(`02-architecture.md` §5.3).

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| **Redis adapter cho Socket.IO** | "Với một instance: `Socket.IO + MongoDB`, **không Redis**" (§B7 dòng 356). Redis nằm trong danh sách "**Không thêm ở baseline**" (§dòng 530). Thêm Redis chỉ để phục vụ 1 instance là trả phí vận hành cho khả năng không dùng |
| **Vercel làm backend WebSocket** | Vercel có hỗ trợ WS từ 22/06/2026 nhưng **đang ở Public Beta** (§B1 dòng 117); NOTES-01 xếp Vercel/Netlify cho frontend ("Netlify … dùng frontend tốt hơn" — dòng 118–119) |
| **Netlify Functions cho WS backend** | "serverless/streaming tốt, nhưng **không phải lựa chọn ưu tiên cho Socket.IO backend chính**" (§B1 dòng 118) |
| **2 namespace (chatbot vs notification)** | "Không cần 2 namespace ngay" (§B7 dòng 365–366); tách namespace khi còn một room model duy nhất chỉ tăng hợp đồng phải giữ |
| **SSE / long-polling tự viết thay Socket.IO** | Trái ràng buộc Socket.IO của đề cương (`RESEARCH-PLAN.md` §1) và bỏ mất fallback/reconnect mà NOTES-01 ghi nhận là Socket.IO "tự hỗ trợ" |

## Consequences

**Điểm mạnh:**

- Không thêm service, không thêm secret, không thêm connection pool — nguyên tắc "ít khớp nối" của toàn bộ
  baseline (§dòng 530–531).
- Room model tối giản (`user:` / `department:`) đủ cho notification matrix của B0 (§B0 dòng 92–104) và
  matching theo phòng ban cho dashboard.
- Vì notification **được persist**, mất kết nối không làm mất nghiệp vụ: người dùng mở lại tab vẫn thấy
  danh sách việc cần làm. Đây là điều biến trần "sleep 15 phút" từ bug thành hạn chế chấp nhận được.
- Hợp đồng event là file khai báo ⇒ có gate thật: `pnpm --filter api test -- realtime/contracts`
  (`02-architecture.md` §9).

**Đánh đổi thật — phải nói thẳng trong báo cáo:**

- **Realtime không tức thì khi service đang ngủ.** Chuỗi nhân quả: Render free **sleep sau 15 phút không có
  HTTP/WS traffic** ⇒ Agenda **đang nằm trong chính tiến trình đó** (ADR-011) ⇒ khi API ngủ, **job cũng
  không chạy** ⇒ đến khi có traffic đánh thức (wake-up **có thể ~1 phút**), reminder mới được gửi.
  Hệ quả UX: nhắc hạn là **"hàng đợi việc cần làm khi mở app"**, không phải tiếng chuông đúng phút.
  `docs/10-ui-ux-spec.md` phải thiết kế theo hướng đó.
- **Không scale ngang.** Đây là out-of-scope được ghi nhận có chủ đích (`RESEARCH-PLAN.md` §3 B7);
  nếu sau này cần 2 instance, ADR này bị supersede và kéo theo Redis (tức là kéo theo cả quyết định
  BullMQ/queue đã loại ở ADR-011).
- Mọi kết nối WS của người dùng đang hoạt động đều nằm trên **một event loop** cùng với REST API; broadcast
  lớn (digest cho cả `department:<id>`) là việc phải đo, không được giả định là rẻ.
- Không có durable queue cho event: client offline trong khoảnh khắc gửi thì **chỉ còn bản ghi trong
  `notifications`** để đọc lại — nghĩa là mọi loại thông báo đều phải có đường "đọc từ DB", không được chỉ
  tin WS.
- **Agenda và WS cùng chết khi process restart.** Job survive restart (ADR-011) nhờ Mongo, nhưng kết nối
  WS thì không; reconnect là trách nhiệm client (`clientMessageId` để không tạo duplicate).

## References

- `docs/research/NOTES-01.md` §B7 dòng 354–366 (một instance, không Redis, rooms, events, `clientMessageId`, 1 namespace)
- `docs/research/NOTES-01.md` §B1 dòng 114, 116–119 (Atlas 500 connections; Render sleep 15 phút, wake-up ~1 phút; Vercel WS Public Beta; Netlify)
- `docs/research/NOTES-01.md` §B0 dòng 92–104 (notification matrix, kênh WS + in-app + digest); dòng 530 (Redis không thêm ở baseline)
- `docs/research/RESEARCH-PLAN.md` §1; §3 B7; §11 (gate WS contract)
- `docs/02-architecture.md` §4, §5.3, §6 (hàng `apps/api`), §7.3, §9, §10 (hàng Redis / namespace thứ hai)

# ADR-008 — Refresh token rotation + reuse detection; Access Token ở memory, Refresh Token ở HttpOnly cookie

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §7.1, ADR-006, ADR-007, ADR-010

---

## Context

Đề cương yêu cầu "JWT + **Refresh Token Rotation**; RBAC Admin/Employee" (`RESEARCH-PLAN.md` §1 dòng 27).
Research B3 phải trả lời hai câu: (a) rotation + reuse detection phát hiện thế nào, lưu hash ở đâu, TTL
khuyến nghị; (b) lưu token ở httpOnly cookie hay memory + `Authorization` header, cho **hai client** là web
và chatbot (`RESEARCH-PLAN.md` §3 B3 dòng 134–135).

Bằng chứng chuẩn ngành mà NOTES-01 trích (`§B3 dòng 182–183`):

> "RFC 9700 khuyến nghị refresh-token rotation hoặc sender-constrained refresh token cho public clients.
> Token cũ bị dùng lại = dấu hiệu token family có thể đã bị đánh cắp."

Ràng buộc hạ tầng liên quan: frontend là SPA trên Vercel/Netlify, API là **một** Express instance
(ADR-002, ADR-010), Mongo có collection `refresh_sessions` với `tokenHash` UNIQUE và `expiresAt` TTL
(`NOTES-01.md` §B4 dòng 218, 245).

## Decision

**Áp dụng refresh token rotation kèm reuse detection, theo đúng flow đã chốt**
(`NOTES-01.md` §B3 dòng 192–196):

```text
LOGIN → Access Token + Refresh Token
  → Refresh → invalidate RT-1 → issue RT-2
  → RT-1 xuất hiện lại?  no → tiếp tục
                         yes → revoke TOÀN BỘ family
```

**Cách lưu, đúng nguyên văn kết luận B3 (dòng 198):**

```text
Web:   Access Token  -> memory
       Refresh Token -> HttpOnly + Secure + SameSite
Mongo: chi luu HASH cua refresh token (khong luu token goc)
```

Model lưu trữ theo §B3 dòng 186–189:

```text
refresh_sessions
- _id / userId / familyId / tokenHash / expiresAt
- revokedAt / replacedBy / userAgent / ipHash
```

Năm hệ quả thiết kế rút từ flow và model trên:

1. `familyId` là **đơn vị thu hồi**: một lần reuse bị phát hiện ⇒ revoke cả family, không chỉ một token.
2. `tokenHash` UNIQUE cho phép phát hiện reuse bằng **một query**, không cần đọc token gốc.
3. `expiresAt` TTL ⇒ Mongo tự dọn session hết hạn, không cần cron riêng (giữ ops cho trần ~100 ops/s —
   §B1 dòng 114).
4. `userAgent` + `ipHash` phục vụ điều tra sau sự cố; lưu hash chứ không lưu IP thô.
5. Access Token **không nằm trong `localStorage`**; nó chỉ sống trong memory của tab, nên đóng tab là phải
   gọi `/refresh` bằng cookie. Chỗ hợp lý để đặt logic "tự refresh rồi retry" là client + React Query hooks
   do Orval sinh (`02-architecture.md` §7.2).

**TTL của access/refresh:** `RESEARCH-PLAN.md` §3 B3 dòng 134 yêu cầu "TTL khuyến nghị" nhưng **NOTES-01
không có con số** → `[CẦN NGUỒN]`, chốt ở `07-auth-rbac.md`.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| Refresh token tĩnh (không rotation) | Trái ràng buộc đề cương (rotation là đầu bài) và trái khuyến nghị RFC 9700 mà NOTES-01 trích: reuse detection chỉ có nghĩa khi token bị thay thế có chủ đích |
| Refresh token ở `localStorage` | NOTES-01 chốt HttpOnly + Secure + SameSite (dòng 198); localStorage đọc được bởi script ⇒ mất tác dụng của cookie HttpOnly |
| Access Token cũng nhét vào cookie | NOTES-01 chọn memory cho access (dòng 198). Để access trong cookie thì mọi route nghiệp vụ thành cookie-auth và phải có phòng thủ CSRF riêng cho chúng — thêm một lớp chưa ai buộc phải làm ở đây |
| Sender-constrained refresh token (DPoP/mTLS) | Là lựa chọn **đồng hạng** trong chính câu trích RFC 9700 ("rotation **hoặc** sender-constrained"), nhưng NOTES-01 chọn rotation; DPoP thêm hạ tầng key phía client mà nhóm 3 người không duy trì nổi trong 12 tuần |
| Lưu refresh token gốc trong Mongo | NOTES-01 ghi tường minh "Mongo chỉ lưu **hash**" (dòng 198) |
| Session server-side hoàn toàn (không JWT) | Trái đề cương — xem ADR-007 |

## Consequences

**Điểm mạnh:**

- Phát hiện được **tái sử dụng token đã bị đánh cắp**, không chỉ giả mạo chữ ký — đúng loại tấn công mà
  rotation sinh ra để bắt.
- Thu hồi theo family ⇒ một lần lộ thiết bị không mở đường vô hạn cho kẻ tấn công.
- DB chỉ thấy hash: lộ dữ liệu Mongo **không tương đương** lộ session còn hiệu lực. (Đi kèm thực tế: Atlas
  free **không backup tự động** — §B1 dòng 114.)
- TTL do Mongo dọn bằng index sẵn có, không thành job riêng chiếm tài nguyên `apps/api`.

**Đánh đổi thật:**

- **Trải nghiệm sau khi Render ngủ đông:** SPA mở lại sau 15 phút idle (§B1 dòng 116) có access token hết
  hạn trong memory và phải đánh thức API bằng `/refresh` trước khi bất kỳ màn hình nào có dữ liệu ⇒
  **độ trễ wake-up (có thể ~1 phút) nằm ngay trên đường vào lại hệ thống**.
- **Nhiều request đồng thời lúc access hết hạn** phải được serialize ở client (một lần refresh duy nhất,
  các request khác chờ); nếu không, chính client tạo reuse và **tự revoke family của mình** — bug kinh điển
  của pattern này, phải thành test case ở `07-auth-rbac.md`.
- Rotation phá tính stateless tinh khiết: mỗi refresh là một vòng đọc-ghi Mongo, tính vào trần ~100 ops/s.
- **Cookie HttpOnly không dùng được cho client nhúng cross-origin.** `RESEARCH-PLAN.md` §3 B3 dòng 135 nêu
  vấn đề "2 client: web + chatbot" nhưng NOTES-01 chỉ chốt cho **Web** ⇒ nếu chatbot là widget nhúng độc lập,
  cần thiết kế riêng cho public client: `[CẦN NGUỒN]` (điểm treo #7 ở `02-architecture.md` §12).
- **Không có gate CI mới** cho ADR này, theo đúng luật "không thêm gate nào nếu chưa có lệnh chạy nó trong
  CI" (`RESEARCH-PLAN.md` §11 dòng 354). Kiểm chứng hiện có: unit/integration test của `modules/auth` chạy
  trên `mongodb-memory-server` (§B10 dòng 398).

## References

- `docs/research/NOTES-01.md` §B3 dòng 180–209 (RFC 9700, flow rotation, model `refresh_sessions`, cách lưu token)
- `docs/research/NOTES-01.md` §B4 dòng 218, 245 (collection, index `tokenHash` UNIQUE / `expiresAt` TTL)
- `docs/research/NOTES-01.md` §B1 dòng 114, 116 (trần ops/s, sleep 15 phút, wake-up ~1 phút); dòng 551 (thiếu URL RFC 9700)
- `docs/research/RESEARCH-PLAN.md` §1 dòng 27; §3 B3 dòng 134–135; §11 dòng 354
- `docs/02-architecture.md` §7.1, §12; ADR-006, ADR-007, ADR-010

---
phase: 7
name: backlog
owner: lead
claims: [P1-3, P1-4, P1-5, P1-6, P1-7, P1-9, P1-13, P1-14, P1-15, P1-16, P1-17, P2-2, P2-4, P2-5, P2-6, P2-7, P2-8, P2-9, P2-10, P2-11, P2-12, P2-14]
depends_on: [6]
---

# Phase 07 — Backlog (không thực thi trong đợt này)

Mỗi mục dưới đây bị hoãn vì lý do kỹ thuật cụ thể, không phải vì thiếu thời gian.

## Cần thiết kế trước khi code

| Claim | Lý do hoãn |
|---|---|
| **P1-3** — `/attachments/:category/:filename` không auth | Web đang render URL attachment trực tiếp trong `<img src>` (`ChatPageView.tsx:504-520`). Gắn `authenticateToken` sẽ làm ảnh vỡ vì trình duyệt không gửi `Authorization` khi tải `<img>` cross-origin. Cần chọn: (a) signed URL có hạn, (b) fetch blob qua `apiFetch` rồi `URL.createObjectURL`, (c) cookie same-site + proxy. Đây là quyết định kiến trúc, không phải one-liner. |
| **P1-9** — `chat:done` phát `reply` ngoài `ChatDonePayloadSchema` | Sửa đúng phải thêm `reply` vào contract ⇒ chạm `packages/contracts`, mà AGENTS.md §5 đặt `packages/contracts/**` read-only với nhánh dev. Cần PR riêng vào nhánh PM. |
| **P1-7** — `userContext` qua socket thiếu `employeeId`/`departmentId` | Liên quan P0-3: nếu chưa có cơ chế ký context nội bộ thì thêm field chỉ mở rộng bề mặt giả mạo. Làm cùng lúc với thiết kế trust nội bộ. |
| **P1-6** — `chat:confirm` báo "đã thực thi" mà không gọi service | Cần thống nhất hành vi confirm thật (gọi tool nào, ai approve) trước khi sửa emit. Sửa emit trước sẽ thành deceptive theo hướng khác. |
| **P1-5 / P2-2** — thiếu transaction / lost update | MongoDB standalone ở dev không có transaction đa document (ADR-004 cấm). Cần chọn compensating action hoặc conditional update có version. |

## Sửa được nhưng chưa cấp thiết cho demo

| Claim | Ghi chú |
|---|---|
| P1-4 | Rate limit login + timing enumeration — cần thêm middleware + store đếm; tách sprint. |
| P1-13 | CORS `*` + credentials — sửa nhỏ nhưng phải biết origin thật trên Render. |
| P1-14 | Decision gate tự xác nhận vòng tròn — cần thiết kế lại policy, không phải patch. |
| P1-15 | `fake.py` monkey-patch `AgentLoop.run` khi import — bỏ patch là thay đổi hành vi agent, cần test riêng. |
| P1-16 | `ProjectListView` refetch vô hạn — **giảm nhẹ** vì phase 05.2 gỡ `projects` khỏi nav demo; vẫn phải sửa khi module được bật lại. |
| P1-17 | `EmployeeProfileView` không mount — là tính năng thiếu, không phải bug. |
| P2-4…P2-8, P2-10…P2-12, P2-14 | Chất lượng/độ bền; gom vào sprint "hardening" sau khi P0 xong. |

## Việc con người phải làm (không automate được)

1. **Rotate key LLM** đã lộ ở P0-1 — phase 01 chỉ gỡ khỏi source, không làm key cũ an toàn trở lại.
2. Cân nhắc **purge git history** cho key + tunnel URL.
3. Xác nhận `JWT_SECRET` / `AI_SERVICE_API_KEY` đã set trên Render trước khi deploy bản có fail-closed, nếu không chat sẽ 503.

# ADR-011 — Agenda (job store trên MongoDB) thay BullMQ và node-cron cho nhắc hạn

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §4 (Agenda trong `apps/api`), §5.2 (`jobs/`), §6 (hệ quả Render sleep), ADR-010

---

## Context

F7 yêu cầu "tiếp nhận báo cáo nghiệm thu & nhắc hạn" (`README.md` dòng 24–26) và UF-09 trong B0 là
`scheduler → tìm item sắp hạn → chống trùng → gửi → ack` với ngoại lệ "nghỉ phép, spam, job chạy lại"
(`NOTES-01.md` §B0 dòng 44). Notification matrix cho thấy lịch nhắc là thật và có ngưỡng chống spam:
"Deadline còn 3 ngày — 1 lần/ngày", "Deadline còn 1 ngày — 1 lần", "Quá hạn — 1 lần/ngày", "KPI cần review
— digest 1 lần/ngày" (§B0 dòng 92–104).

Research B15 so sánh đúng ba ứng viên (`NOTES-01.md` §B15 dòng 480–484):

- `node-cron`: "hỗ trợ timezone và `noOverlap`, nhưng bản chất vẫn là cron trong process; tài liệu của nó
  hướng tới BullMQ/Agenda khi cần durable jobs/retries."
- `BullMQ`: "mạnh nhưng **cần Redis**; job phải idempotent vì queue có retry/delivery semantics."
- `Agenda`: "dùng MongoDB → phù hợp hạ tầng hiện có."

## Decision

**Chọn Agenda, theo thứ tự ưu tiên đã chốt: `Agenda` > BullMQ > node-cron** cho reminder quan trọng
(`NOTES-01.md` dòng 483–484). Lý do ghi nguyên văn: "**Atlas đã có → Agenda dùng Mongo → không phải dựng
Redis → job survive restart**."

Vị trí trong kiến trúc: Agenda là **worker chạy trong tiến trình `apps/api`**, không phải service riêng.
Vì nó dùng Mongo làm job store, mọi job đều nằm trong cùng trần hạ tầng đã đo ở §B1 (0.5 GB, ~100 ops/s).

Ba ràng buộc nghiệp vụ phải được implement thành điều kiện của job, không phải của thư viện:

1. **Chống trùng/chống spam** — UF-09 yêu cầu "chống trùng" và notification matrix gắn ngưỡng "1 lần/ngày"
   (§B0 dòng 44, 94–104) ⇒ mỗi lần nhắc phải để lại dấu vết trong `notifications` để lần chạy lại không gửi
   trùng.
2. **Idempotent khi job chạy lại** — tình huống này được nêu là ngoại lệ của UF-09; dù BullMQ bị loại, yêu
   cầu idempotency vẫn còn nguyên.
3. **Overdue không phải do job "đánh dấu"** — nó là dẫn xuất `dueDate < now AND status NOT IN {COMPLETED,
   CANCELLED}` (§B4 dòng 233–235), nên job chỉ **gửi thông báo**, không đổi trạng thái nghiệp vụ. Điều này
   làm giảm mạnh phạm vi phải dùng transaction (khớp ADR-004).

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| **BullMQ** | "**cần Redis**" (§B15 dòng 481). Redis bị loại ở baseline (§dòng 530) và Socket.IO một instance cũng không cần nó (ADR-010). Dựng Redis chỉ cho một queue là thêm một dịch vụ phải vận hành và thêm một credential phải quản lý |
| **node-cron** | "bản chất vẫn là cron trong process" (§B15 dòng 480) ⇒ job **không survive restart**, trong khi ngoại lệ "job chạy lại" của UF-09 và việc Render ngủ đông/restart (ADR-010) là chuyện bình thường với hạ tầng này. Chính tài liệu node-cron hướng người dùng sang BullMQ/Agenda khi cần durable jobs (dòng 480–482) |
| Tự viết scheduler bằng `setTimeout` + collection riêng | Không có trong phạm vi research ⇒ không có bằng chứng; và sẽ tự viết lại đúng phần khó nhất của Agenda (claim job, lock, retry) |
| Chạy scheduler bằng cron của CI | Không được nguồn nhắc tới ⇒ không có bằng chứng; đồng thời có hai vấn đề rõ: không có ngữ cảnh người dùng để kiểm tra quyền, và không đẩy được WS event vào tiến trình `apps/api` |

## Consequences

**Điểm mạnh:**

- **Không thêm hạ tầng**: một state store duy nhất cho nghiệp vụ + token + job (nguyên tắc ở
  `02-architecture.md` §6).
- **Job survive restart** — đúng lý do chọn trong NOTES-01; khi process Express khởi động lại sau wake-up,
  Agenda đọc lại job từ Mongo.
- Job định nghĩa bằng code TypeScript trong cùng monorepo, không thêm ngôn ngữ và không thêm client queue.
- Cùng một module `notification` phục vụ cả nhắc hạn do job tạo và sự kiện do WS đẩy ⇒ logic chống spam chỉ
  viết một lần.

**Đánh đổi thật — giới hạn trung thực của lựa chọn này:**

- **Agenda chạy trong cùng tiến trình với API ⇒ khi API ngủ vì Render free tier (sleep sau 15 phút không có
  traffic), job cũng không chạy.** Đây là điểm yếu **cố hữu của toàn bộ baseline**, không phải của riêng
  Agenda: nó chính là lý do nhắc hạn phải được thiết kế là "hàng đợi đọc khi mở app" (ADR-010,
  `02-architecture.md` §6). Nếu cần đảm bảo giờ giấc tuyệt đối, phương án duy nhất có trong nguồn là **VPS**
  (`RESEARCH-PLAN.md` §1 dòng 26 cho phép Render **hoặc** VPS Ubuntu), với điều kiện RAM chưa được chứng
  minh là đủ: `[CẦN NGUỒN]`.
- Job store nằm trên cùng Atlas M0 ⇒ thêm ops vào trần **~100 ops/s** và thêm document vào trần **0.5 GB**;
  chính sách dọn dẹp lịch sử job không được NOTES-01 nêu → `[CẦN NGUỒN]`.
- Các tham số cấu hình của Agenda (concurrency, số lần retry, lock limit) **không có trong NOTES-01** →
  `[CẦN NGUỒN]`, chốt ở `14-devops-deployment.md`.
- Hai process cùng start Agenda (API + một lệnh CLI vô tình khởi động scheduler) sẽ tranh nhau cùng job ⇒
  phải có quy ước "chỉ một entrypoint được start scheduler"; quy ước này chưa có trong nguồn, phải ghi ở
  `14-devops-deployment.md`.

## References

- `docs/research/NOTES-01.md` §B15 dòng 478–484 (so sánh node-cron / BullMQ / Agenda, thứ tự chọn, lý do)
- `docs/research/NOTES-01.md` §B0 dòng 44 (UF-09 + ngoại lệ "job chạy lại"), dòng 92–104 (notification matrix, ngưỡng chống spam)
- `docs/research/NOTES-01.md` §B4 dòng 233–235 (OVERDUE là dẫn xuất); §B1 dòng 114 (trần Atlas); dòng 530 (Redis, BullMQ không thêm ở baseline)
- `docs/research/RESEARCH-PLAN.md` §1 dòng 26 (Render/VPS); §3 B15 dòng 380–384 (câu hỏi scheduler, idempotency, chống spam)
- `README.md` dòng 24–26 (F7 nhắc hạn)
- `docs/02-architecture.md` §4, §5.2 (hàng `jobs/`), §6, §10; ADR-004, ADR-010

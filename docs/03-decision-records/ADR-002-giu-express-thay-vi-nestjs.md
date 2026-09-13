# ADR-002 — Giữ Express.js, không chuyển sang NestJS

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §5 (component trong `apps/api`), ADR-001, ADR-010

---

## Context

Đầu bài của đề cương ghi **MERN + TypeScript** (`RESEARCH-PLAN.md` §1), trong đó chữ "N" là Node
với Express. Research B2 được giao đúng câu hỏi mở (`RESEARCH-PLAN.md` §3 B2): "NestJS vs Express
thuần — đề cương ghi Express.js; nếu muốn NestJS phải xin GVHD (§7)". Câu hỏi §7.1 gửi GVHD tới nay
**chưa có trả lời**.

Kiến trúc được chốt ở `NOTES-01.md` (dòng 510–516) mô tả `apps/api` là "Express + TypeScript" mang bốn
trách nhiệm: JWT/RT rotation, RBAC, Socket.IO, Agenda, và nối MongoDB Atlas. Toàn bộ module layout mà
research đề xuất (`NOTES-01.md` §B2 dòng 167–173) được viết theo file Express thuần:

```text
modules/auth/
  auth.controller.ts
  auth.service.ts
  auth.repository.ts
  auth.schema.ts
  auth.routes.ts
```

## Decision

**Giữ Express.js cho `apps/api`.** Tính tổ chức của NestJS được thay bằng **một rule cấu trúc bắt buộc**
mà CI giữ hộ: mỗi module theo feature có đúng 5 file như khuôn ở trên, và luồng phụ thuộc
`routes → controller → service → repository` một chiều (`02-architecture.md` §5.1).

Rule "domain không import mongoose/express" (`RESEARCH-PLAN.md` §11) áp dụng **với cả hai lựa
chọn framework**, nên đây không phải điểm khác biệt để chọn NestJS.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| **NestJS** | "`Giữ Express.js.` Không đổi sang NestJS nếu chưa có xác nhận của GVHD — Express đã nằm trong đầu bài" (`NOTES-01.md` §B2 dòng 150). NestJS còn nằm trong danh sách "**Không thêm ở baseline**" ở `NOTES-01.md` dòng 530. Chi phí học DI/decorator/module system không đổi lại được giá trị nào trong 12 tuần mà chưa được GVHD cho phép |
| Express + sinh route/OpenAPI từ decorator metadata | Không có bằng chứng trong NOTES-01 cho phương án này; hợp đồng API đã chốt theo ngả Zod → OpenAPI → Orval (§B2 dòng 175–176), không cần một nguồn metadata thứ hai cạnh Zod |
| Fastify thay Express | Không được NOTES-01 đề cập; sẽ lệch khỏi đầu bài MERN và làm mất lý do "Express đã nằm trong đề cương" |

## Consequences

**Điểm mạnh:**

- Đúng đầu bài, không cần xin sửa đề cương → không treo tiến độ tuần 1–2 vì chờ GVHD.
- Bề mặt học gần bằng 0 cho cả 3 thành viên; mọi middleware JWT/Argon2/Socket.IO/Agenda đều có ví dụ
  Express trực tiếp.
- Kiểm soát được 4 thành phần cùng process (HTTP server + WS server + Agenda worker + Mongo pool) mà
  không phải qua tầng DI.

**Đánh đổi thật:**

- **Không có kiến trúc module sẵn.** Discipline cấu trúc do **lint + dependency-cruiser** giữ, không do
  framework giữ. Nếu dev đặt logic vào controller, chỉ gate CI mới phát hiện ⇒ gate "Kiến trúc không rò rỉ"
  (`pnpm depcruise --validate .dependency-cruiser.js apps/api/src`) là **điều kiện cần** của ADR này,
  không phải thứ trang trí.
- Không có validation pipe sẵn ⇒ phải tự gắn Zod middleware ở mọi route (đây cũng là cách pipeline
  OpenAPI sinh ra nhất quán).
- Không có DI container ⇒ wiring thủ công (composition root); dễ phát sinh vòng import nếu bất cẩn —
  gate circular deps xử lý phần này.
- Nếu GVHD trả lời §7.1 **cho phép NestJS**, quyết định này có thể bị supersede; khi đó ADR-002 chuyển
  trạng thái `Superseded` và §5 của `02-architecture.md` phải vẽ lại module theo module/provider.

## References

- `docs/research/NOTES-01.md` §B2 dòng 150 (quyết định giữ Express), dòng 153–173 (module layout)
- `docs/research/NOTES-01.md` dòng 505–528 (sơ đồ lớp "Express + TypeScript"), dòng 530 ("Không thêm ở baseline: NestJS")
- `docs/research/RESEARCH-PLAN.md` §1; §3 B2; §7.1 (câu hỏi còn treo)
- `docs/02-architecture.md` §5.1 (luật phân lớp), §9 (gate dependency-cruiser)

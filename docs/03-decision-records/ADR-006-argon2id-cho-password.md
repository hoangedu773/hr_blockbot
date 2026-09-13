# ADR-006 — Argon2id cho password hashing

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §7.1, ADR-007, ADR-008

---

## Context

`modules/auth` phải lưu mật khẩu cho collection `users` (`NOTES-01.md` §B4 dòng 218). Research B3 được giao
đúng câu hỏi so sánh (`RESEARCH-PLAN.md` §3 B3): "Password hashing: bcrypt vs argon2 + tham số
cost; rate limit đăng nhập; khóa tài khoản."

Kết luận của vòng research (`NOTES-01.md` §B3 dòng 199–200):

> "**Password:** OWASP khuyến nghị Argon2id (cấu hình được liệt kê: ~19 MiB memory, 2 iterations,
> parallelism 1) → **Argon2id > bcrypt** cho project mới."

Bối cảnh ràng buộc: đây là dự án **mới** (chưa có mã nguồn — `README.md` dòng 9), không có mật khẩu legacy
cần migrate, và hạ tầng có trần (~100 ops/s ở Atlas, một instance Express trên Render/VPS — §B1).

## Decision

**Hash mật khẩu bằng Argon2id**, với cấu hình **được ghi đúng như danh sách mà NOTES-01 trích từ OWASP**:

```text
memory  ~19 MiB
iterations 2
parallelism 1
```

Toàn bộ hash/verify nằm trong `modules/auth` (service), không lọt xuống repository, không lọt sang
`ai-service`. Không có đường nào để đọc lại mật khẩu — chỉ verify.

**Hai điều NOTES-01 KHÔNG chốt, tài liệu này không tự điền:**

- Ngưỡng thời gian/memory tối thiểu theo phiên bản cheat sheet OWASP đang dùng và **ngày truy cập nguồn**:
  `[CẦN NGUỒN]` (mục CẦN BỔ SUNG dòng 551 nêu thiếu "OWASP cheat sheet (Argon2id)" — URL).
- **Rate limit đăng nhập** và **chính sách khóa tài khoản** là một phần câu hỏi B3
 (`RESEARCH-PLAN.md` §3 B3) nhưng **NOTES-01 không có kết luận** → `[CẦN NGUỒN]`. Thuộc
  `07-auth-rbac.md` + `13-security.md`.

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| **bcrypt** | "Argon2id > bcrypt cho project mới" (`NOTES-01.md` §B3 dòng 200) — dự án này chưa có hash cũ nào, nên lợi thế lớn nhất của bcrypt (tương thích ngược) không tồn tại |
| scrypt | Không được NOTES-01/RESEARCH-PLAN nhắc tới ⇒ **không có bằng chứng** để chọn; ghi ở đây chỉ để đánh dấu rằng phương án này **không bị research loại**, mà là chưa được xét |
| PBKDF2-HMAC | Như trên — không có trong phạm vi research vòng 1 |
| Argon2 **không phải** biến thể id (dùng variant i hoặc d) | Nguồn ghi đích danh "Argon2id" (OWASP khuyến nghị, dòng 199); chọn variant khác là tự suy diễn ngoài nguồn |

## Consequences

**Điểm mạnh:**

- Đúng khuyến nghị OWASP đang được trích dẫn trong research, và **đúng lựa chọn cho dự án xanh** — không
  phải gánh lịch sử hash.
- Chi phí memory của một lần hash được giới hạn ở ~19 MiB (theo đúng cấu hình NOTES-01 trích OWASP), tức là
  có thể đưa vào ngân sách tài nguyên của một instance Express duy nhất.
- Là một tham số cấu hình của auth service, không phải quyết định phân tán → dễ tăng cost khi chuẩn đổi.

**Đánh đổi thật:**

- Argon2id là hàm **có chủ đích chậm và ngốn memory**; tài liệu này không có số đo tốc độ hash trên phần
  cứng của nhóm ⇒ mọi so sánh chi phí với bcrypt để ở trạng thái chưa kiểm chứng: `[CẦN NGUỒN]`.
- Hệ quả chắc chắn về mặt logic: **test không được dùng đúng cost của production**, nếu không bước unit và
  API integration trong pipeline §B10 (dòng 402–403) sẽ chậm. Cách tách config test/prod thuộc
  `11-quality-testing.md` + `15-engineering-conventions.md`.
- **Bó buộc native dependency** cho Node (`argon2`), nên bước `install` trong CI cần toolchain phù hợp;
  đây là loại rủi ro mà NOTES-01 không đo.
- Nếu Render ngủ đông ⇒ request đăng nhập đầu tiên sau wake-up vừa phải đánh thức process vừa hash Argon2
  ⇒ cảm giác chậm cộng dồn (§B1 dòng 116: wake-up có thể ~1 phút).
- **Không có đường quay lại bcrypt** nếu sau này phát hiện chi phí không chấp nhận được trên VPS 2GB RAM
  (mà con số RAM đó lại chưa có đáp án — ADR-003, `[CẦN NGUỒN]`).

## References

- `docs/research/NOTES-01.md` §B3 dòng 199–200 (quyết định + cấu hình Argon2id)
- `docs/research/NOTES-01.md` §B4 dòng 218 (`users` collection), dòng 198 (chỉ lưu **hash** ở Mongo)
- `docs/research/RESEARCH-PLAN.md` §3 B3 (câu hỏi bcrypt vs argon2, rate limit, khóa tài khoản)
- `docs/research/NOTES-01.md` dòng 549–551 (CẦN BỔ SUNG: thiếu URL OWASP cheat sheet)
- `docs/02-architecture.md` §7.1 (ba bất biến auth), §12
- ADR-007 (`jose`), ADR-008 (rotation) — cùng nhóm quyết định trong B3

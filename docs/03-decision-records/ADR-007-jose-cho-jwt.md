# ADR-007 — `jose` là JWT library của `apps/api`

- **Status:** Accepted
- **Date:** 13/09/2026
- **Quyết định này ảnh hưởng tới:** `02-architecture.md` §7.1, ADR-006, ADR-008, ADR-010

---

## Context

`apps/api` ký mới và verify Access Token cho toàn bộ hệ thống (REST + handshake Socket.IO). Đề cương buộc
"JWT + Refresh Token Rotation" (`RESEARCH-PLAN.md` §1 dòng 27). Câu hỏi research B3 được nêu tường minh
(`RESEARCH-PLAN.md` §3 B3 dòng 138): "Thư viện JWT còn maintain không (`jose` vs `jsonwebtoken`)."

Kết luận (`NOTES-01.md` §B3 dòng 201):

> "**JWT library: `jose`** — đang được maintain, hỗ trợ JWT/JWS/JWE/JWK/JWKS, không phụ thuộc package khác."

Ba nhu cầu cụ thể của hệ thống chạm tới thư viện này:

1. **Access Token ở memory**, gửi qua `Authorization` header (`NOTES-01.md` §B3 dòng 198).
2. **Verify JWT ngay trong Socket.IO handshake** (`socket.handshake.auth` — `RESEARCH-PLAN.md` §3 B7 dòng 173)
   ⇒ cùng một lib phải dùng được ngoài HTTP middleware.
3. **Refresh token rotation + reuse detection** với `familyId` / `tokenHash` / `replacedBy`
   (`NOTES-01.md` §B3 dòng 186–196) — logic này do app viết, lib chỉ cung cấp primitives.

## Decision

**Dùng `jose` làm JWT layer duy nhất của `apps/api`.** Không dùng song song `jsonwebtoken`, không dùng
wrapper nào khác. Module `auth` là nơi duy nhất ký token; các module khác (kể cả `realtime`) chỉ **verify**
qua interface do `auth` export — cùng nguyên tắc "một ngã duy nhất" đã dùng cho mutation ở
`02-architecture.md` §7.4.

Thuật toán ký và định dạng key cụ thể **không được NOTES-01 chốt** → `[CẦN NGUỒN]`, sẽ ghi ở
`07-auth-rbac.md` sau khi chọn JWS alg (secret đối xứng nội bộ, hoặc khoá bất đối xứng + JWKS nếu tách bên
verify).

## Alternatives considered

| Phương án | Lý do loại |
|---|---|
| **`jsonwebtoken`** | Chính là vế so sánh của câu hỏi B3 (`RESEARCH-PLAN.md` §3 B3 dòng 138); `NOTES-01.md` dòng 201 chốt `jose` vì "**đang được maintain**" và "**không phụ thuộc package khác**" — hai tiêu chí mà research dùng để chấm, và `jsonwebtoken` không thắng ở đó |
| Session cookie truyền thống (không JWT) | Trái ràng buộc đề cương "JWT + Refresh Token Rotation" (`RESEARCH-PLAN.md` §1 dòng 27) |
| Tự viết ký/verify bằng Web Crypto | Không có trong phạm vi research; tự chịu rủi ro về `alg` confusion, `kid`, clock skew — đúng loại lỗi mà lib duy trì để xử lý |
| OIDC provider bên ngoài | Không được NOTES-01/RESEARCH-PLAN nhắc tới ⇒ không có bằng chứng; thêm phụ thuộc dịch vụ ngoài vào một hệ đã có hai bên thứ ba (Atlas, LLM provider) |

## Consequences

**Điểm mạnh:**

- Một lib cho cả HTTP và WebSocket handshake ⇒ không có hai đường verify lệch nhau về `exp`/`aud`/`iss`.
- Hỗ trợ JWK/JWKS ngay trong lib ⇒ nếu sau này `ai-service` hoặc một client thứ hai cần tự verify, không
  phải đổi kiến trúc (liên quan điểm treo #5 ở `02-architecture.md` §12).
- "Đang được maintain" là tiêu chí chấm của B3, nên ADR ghi lại được **lý do có bằng chứng**, không phải thói
  quen của nhóm.

**Đánh đổi thật:**

- Không phụ thuộc package khác là lợi thế chuỗi cung ứng, nhưng đồng nghĩa `jose` là **điểm phụ thuộc đơn**
  cho toàn bộ auth: nếu lib gặp vấn đề, không có phương án hai sẵn trong repo.
- API của `jose` **tường minh hơn** (promises, chỉ rõ `alg`, `iss`, `aud`, `exp`); dev quen kiểu gọi ngắn của
  `jsonwebtoken` sẽ phải học lại cách đặt tham số verify. Đây là chỗ dễ sinh lỗi "verify lỏng".
- **Không có gate CI riêng cho việc chọn lib này** — theo luật "mỗi gate phải có lệnh"
  (`RESEARCH-PLAN.md` §11 dòng 354), ADR này **không** tạo gate mới. Chỗ dựa kiểm chứng hiện có: unit test
  của `modules/auth` và gate coverage `pnpm --filter api exec vitest run --coverage domain`.
- Nếu chọn JWKS, phải quyết định thêm về rotation key và nơi lưu key — NOTES-01 không nêu → `[CẦN NGUỒN]`.
- Mọi rủi ro còn lại của JWT là **trách nhiệm thiết kế của app**, không của lib: TTL, khả năng thu hồi access
  token, binding token với Socket.IO session. Chi tiết ở ADR-008 và `07-auth-rbac.md`.

## References

- `docs/research/NOTES-01.md` §B3 dòng 198 (access ở memory), dòng 201 (chọn `jose`), dòng 182–196 (rotation)
- `docs/research/RESEARCH-PLAN.md` §1 dòng 27; §3 B3 dòng 138; §3 B7 dòng 173 (verify JWT trong handshake)
- `docs/research/NOTES-01.md` dòng 551 (CẦN BỔ SUNG: thiếu URL tài liệu `jose`)
- `docs/02-architecture.md` §7.1; ADR-006, ADR-008

# ADR-018 — Bỏ giới hạn "11 collection", cho phép collection mới có kiểm soát

- **Status:** Accepted (2026-10-20) — thay thế ràng buộc trong `05-data-model.md` §1.1
- **Ảnh hưởng:** `05-data-model.md` §1.1 & §2 (ERD), `01-requirements.md` §8 (#13, #14), `02-architecture.md`, README
- **Người quyết:** nhóm (chủ dự án) — không qua GVHD

---

## Context

`05-data-model.md` §1.1 ghi: *"Mọi thiết kế dưới đây **không được thêm collection thứ 12** mà chưa qua GVHD"*.
Ràng buộc này lấy từ `NOTES-01 B4` (danh sách 11 collection baseline), không phải yêu cầu của đề cương.

Thực tế đã chứng minh nó chặn hai nhu cầu có thật:

| Nhu cầu | Vấn đề nếu không có collection |
|---|---|
| Lưu lịch sử hội thoại (F3, FR-021) | không có `clientMessageId` bền vững → chống trùng sau reconnect chỉ trong RAM; không có dữ liệu eval abstention (`01 §8 #14`, `05 §7 D-08`) |
| Cấu hình LLM provider tại runtime (ADR-017) | không lưu được key đã mã hoá → buộc dùng env, mất UI Admin |

Đo trên DB thật (2026-10-20): `hr_bot` có 11 collection nhưng phần lớn là dữ liệu thô GUTA; **9/11 collection của thiết kế chưa tồn tại**. Nói cách khác, con số "11" chưa bao giờ được dùng làm chặn kỹ thuật thật — nó chỉ là chặn thủ tục.

## Decision

1. **Bỏ giới hạn cứng 11 collection.** Cho phép thêm collection mới với 3 điều kiện:
   - có ADR hoặc mục design nêu lý do + invariant,
   - có tên trong ERD `docs/22-erd-overall.md`,
   - có test cho invariant của nó (trần, idempotency, hoặc index TTL).
2. Collection mới **được phép** trong đợt này:

| Collection | Lý do | ADR/design |
|---|---|---|
| `conversations` | FR-021 + eval F3 | `design/conversations-storage.md` |
| `settings` | ADR-017 | `ADR-017` |

3. Collection **không** được thêm mà không có mục đích rõ: mỗi collection mới phải trả lời "query nào cần nó" — nếu chỉ để chứa cho đầy thì không thêm.

## Consequences

- `05-data-model.md` §1.1 phải sửa: đổi "không được thêm" thành "thêm được nếu có ADR + test".
- `01 §8` #13, #14 chuyển từ "chờ GVHD" sang "đã giải quyết trong ADR-017/018 + design doc".
- Báo cáo luận văn phải nêu rõ: dữ liệu GUTA là nguồn, schema ứng dụng là **thiết kế riêng**; việc tách collection là quyết định kỹ thuật có ghi chép, không phải mở rộng tuỳ tiện.
- Không ảnh hưởng điểm rubric: rubric chấm chức năng, không chấm số collection.

## Risks

| Rủi ro | Giảm thiểu |
|---|---|
| Phình schema, mỗi tuần thêm một collection | điều kiện 3: phải có query + test + tên trong ERD |
| Người đọc báo cáo thấy mâu thuẫn với tài liệu cũ | sửa `05 §1.1` trong cùng PR; ghi ngày hiệu lực |

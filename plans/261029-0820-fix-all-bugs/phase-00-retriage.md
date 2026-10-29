# Phase 00 — Re-triage 21 claim DRIFT/FAIL (không sửa code)

**Mục tiêu:** biết chính xác claim nào còn bug trước khi ai đó bỏ công fix.
**Thời lượng:** 60–90 phút. **Không được sửa source trong phase này.**

## Vào

`node scripts/verify-claims.mjs` → 18 DRIFT + 3 FAIL. Danh sách:

```
DRIFT: P0-1 P0-4 P0-5 P0-6 P0-7 P1-1 P1-2 P1-5 P1-6 P1-13 P1-14 P1-17 P2-1 P2-2 P2-5 P2-7 P2-12 P2-13
FAIL : P0-3 P1-12 P2-3
```

Đã xác nhận bằng mắt (đừng làm lại): **P0-1, P0-3, P0-4, P0-6, P1-11 = FIXED**.

## Việc

1. Với mỗi claim còn lại, chạy **đúng một** trong hai:
   - `grep -n "<anchor cũ>" <file>` — nếu anchor mất → đọc vùng xung quanh (±20 dòng) xem code mới có chặn bug chưa;
   - hoặc đọc trực tiếp hàm/handler liên quan.
2. Phân loại **chỉ một trong ba**:
   - `FIXED` — code hiện tại đã chặn đúng kịch bản của claim. **Bắt buộc** kèm `file:line` + 1 dòng code chứng minh.
   - `STILL-BUG` — hành vi lỗi vẫn tái hiện được (kể cả khi đã dời dòng).
   - `N/A` — code liên quan đã bị xoá/đổi kiến trúc, claim không còn nghĩa.
3. Ghi kết quả vào `plans/261029-0820-fix-all-bugs/retriage.md`, bảng 3 cột: `claim | verdict | bằng chứng (file:line + code)`.
4. Cập nhật lại `plan.md` §1.1 nếu số lượng rổ A thay đổi.

## Luật

- **Cấm** kết luận `FIXED` bằng suy luận ("chắc là đã sửa rồi"). Phải có dòng code hoặc output lệnh.
- Claim `FIXED` không được đưa vào phase fix nào nữa; chỉ cần một dòng trong `retriage.md`.
- Nếu một claim vừa `FIXED` một nửa (vá ở API nhưng chưa vá ở web) → đánh `STILL-BUG`, ghi rõ nửa nào còn.

## Xong khi

- `retriage.md` có đủ 21 dòng, mỗi dòng có bằng chứng.
- `plan.md` §1.1 khớp với kết quả (không còn claim đã FIXED nằm trong danh sách fix).

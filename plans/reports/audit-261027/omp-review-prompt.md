# Prompt cho OMP (chạy trong Orca) — cross-check report audit

Dán nguyên khối dưới đây vào session OMP trong Orca, tại working dir `C:/work-space/hr-blockbot`.

---

Bạn là **reviewer độc lập, đối kháng**. Một auditor khác (WorkBuddy) vừa đưa ra 38 finding về repo này. Nhiệm vụ của bạn là **cố bác bỏ** từng cái, không phải xác nhận.

## Đọc gì

`plans/reports/audit-261027/claims.json` — mỗi claim có `id`, `severity`, `claim`, `files[]` gồm `file`, `line`, `anchor`.

Với mỗi claim: mở đúng file đó, đọc **rộng hơn dòng được chỉ** (ít nhất ±40 dòng, và đọc cả hàm/route chứa nó). Đừng chỉ đọc đúng dòng `line` — phần lớn bug nằm ở ngữ cảnh xung quanh.

## Phán xét

Với mỗi claim, trả về đúng một trong ba:

- `CONFIRMED` — code thật sự cho phép điều claim nói. Phải chỉ ra được **đường đi cụ thể**: hàm nào gọi, điều kiện nào thiếu, dữ liệu nào lọt qua.
- `REFUTED` — claim sai. Nêu rõ cái gì chặn nó (middleware, schema, guard ở tầng khác, state machine…). Nếu bạn tìm thấy guard ở file khác, đó là REFUTED, không phải UNSURE.
- `UNSURE` — chỉ khi thật sự không đủ thông tin trong repo (ví dụ phụ thuộc config deploy bên ngoài).

Gán `severity` **theo đánh giá của bạn**, đừng bê mức của claim gốc: `P0` = chiếm quyền / lộ secret / mất dữ liệu / luồng chính không dùng được; `P1` = sai hành vi hoặc khai thác hạn chế; `P2` = dễ vỡ / chất lượng.

## Ràng buộc

- **Không sửa bất kỳ file source nào.** Chỉ được tạo đúng một file output ở dưới.
- Không chạy `npm/pnpm install`, không build, không gọi mạng.
- Đừng đọc `verdicts.json` hay bất kỳ file kết luận nào của auditor kia — sẽ làm bạn neo theo. Chỉ đọc `claims.json` + code.

## Output

Ghi ra `plans/reports/audit-261027/omp-verdicts.json`, đúng schema, **không thêm prose**:

```json
[
  {
    "id": "P0-1",
    "verdict": "CONFIRMED",
    "severity": "P0",
    "reason": "<= 25 từ, nêu đường đi cụ thể hoặc guard đã chặn>"
  }
]
```

Đủ 38 phần tử, đúng `id` như trong `claims.json`. Xong thì in ra một dòng tóm tắt: `CONFIRMED x / REFUTED y / UNSURE z`.

---

## Sau khi OMP xong

Quay lại đây, tôi chạy:

```bash
node scripts/diff-verdicts.mjs \
  plans/reports/audit-261027/verdicts.json \
  plans/reports/audit-261027/omp-verdicts.json \
  --out=plans/reports/audit-261027/diff.md
```

Kết quả phân loại: `AGREE` · `DISPUTE_REFUTED` (OMP bác — phải xử) · `SEVERITY_DIFF` (lệch mức) · `INSUFFICIENT_EXCERPT` · `NO_VERDICT`.

**Quy tắc xử bất đồng**: `REFUTED` phải kèm guard cụ thể. Nếu OMP chỉ nói "có thể có kiểm tra ở nơi khác" mà không chỉ ra file:line thì không tính là bác — giữ nguyên mức, ghi vào mục "chưa kiểm chứng".

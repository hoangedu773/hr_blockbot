# Phase 08 — Verify toàn bộ, đóng audit, cập nhật docs

**Mục tiêu:** biến "đã sửa" thành "đã chứng minh", và để lại một file đóng audit mà người sau tin được.

## Việc

1. **Chạy đủ 6 cổng** (plan §5). Ghi **nguyên văn output** vào `plans/reports/audit-261029-close-verdict.md`:
   lệnh, exit code, số test pass/fail, ngày, HEAD commit.
2. **Đối chiếu từng claim** đã sửa: mỗi claim một dòng `claim | trạng thái | bằng chứng (lệnh + output)`.
   - Claim không sửa được trong đợt này ⇒ ghi `DEFERRED` + lý do thật (không dùng "hết thời gian").
3. **Cập nhật `claims.json`** (nếu có claim đã FIXED vĩnh viễn): thêm `status: fixed` + `fixedAt`, **không xoá**
   claim — giữ lịch sử để lần audit sau không báo lại.
4. **Cập nhật docs bị ảnh hưởng:**
   - `docs/06-api-spec.md` nếu response/route đổi (phase 03/04).
   - `docs/13-security.md` nếu thêm rate limit / allowlist / CORS (phase 02/04C/05).
   - `docs/21-chatbot-architecture.md` §6 nếu timeout/decision thay đổi (phase 05).
5. **Ghi lại 2 phát hiện quy trình** vào `docs/11-quality-testing.md`:
   - `verify-claims.mjs` chỉ kiểm anchor, **không** kiểm bug ⇒ phải kèm đọc code (P1-11 là ví dụ anchor xanh
     nhưng bug đã chết; P0-5 là ví dụ anchor dời nhưng bug còn).
   - Test "luôn xanh" (P2-3, P2-14) nguy hiểm hơn không có test, vì nó tạo bằng chứng giả.

## Acceptance

```bash
# tất cả phải xanh, hoặc được liệt kê là "đã biết, chấp nhận"
pnpm --filter @hr-blockbot/contracts test
cd apps/api && npm test
cd apps/ai-service && python -m unittest discover -s tests -p "test_jev*.py"
node --test apps/web/test/landing-workflow.test.mjs
node --test apps/web/test/web-integration.test.mjs
pnpm --filter web build && pnpm --filter api build
python scripts/jev_gateway_live_check.py
```

## Xong khi

- `audit-261029-close-verdict.md` tồn tại, mỗi dòng có bằng chứng chạy được.
- `plan.md` frontmatter đổi `status: done` (hoặc `partially-done` + danh sách DEFERRED).
- Không còn dòng nào trong plan nói "đã fix" mà thiếu lệnh chứng minh.

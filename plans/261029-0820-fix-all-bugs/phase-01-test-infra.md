# Phase 01 — Test infra: làm cho test có khả năng phát hiện lỗi

**Mục tiêu:** trước khi sửa bảo mật, phải có test đáng tin. Hiện có ít nhất 3 test luôn xanh vô điều kiện.

## File sở hữu (exclusive)

```
packages/contracts/test/contracts.test.mjs     P1-10
apps/api/test/auth.test.mjs                    P2-3
apps/web/test/web-integration.test.mjs         P2-14
apps/api/package.json                          P1-11 (đã fix — chỉ verify)
```

Không file nào khác được chạm trong phase này.

## Việc

1. **P1-10** — `contracts.test.mjs:47` import từ `../dist`, mà `dist` bị gitignore ⇒ test chỉ chạy được sau
   `build`, và trên máy sạch sẽ fail. Sửa: import từ `../src` (hoặc thêm bước build vào script test, chọn **một**).
   Ghi rõ lựa chọn vào commit message.
2. **P2-3** — `auth.test.mjs:411` assert kiểu `statuses.includes(200)` luôn đúng với mọi tổ hợp ⇒ test race
   không chứng minh gì. Sửa thành assert trạng thái **cụ thể** cho từng nhánh (200 khi đúng version, 409 khi lệch).
3. **P2-14** — `web-integration.test.mjs:109` chỉ `grep` chuỗi trong source ⇒ test "integration" không chạy gì.
   Sửa: ít nhất một case phải render/mount thật hoặc gọi hàm thật; nếu không kịp, đổi tên file thành
   `*.source-shape.test.mjs` để không ai trích nó làm bằng chứng tích hợp.
4. **P1-11** — xác nhận `apps/api/package.json` liệt kê đủ 6 file test. Nếu đúng, chỉ ghi vào `retriage.md`,
   không sửa.

## Acceptance

```bash
pnpm --filter @hr-blockbot/contracts test        # pass trên checkout sạch (không cần build trước)
cd apps/api && npm test                          # chạy đủ 6 file, in ra 6 dòng test
node --test apps/web/test/web-integration.test.mjs
```

- Test mới phải **fail được**: thử cố ý làm sai một assert, xác nhận nó đỏ, rồi hoàn lại.
- Không được nới lỏng test để dễ pass.

## Rollback

Revert riêng commit phase 01 — không ảnh hưởng source sản phẩm.

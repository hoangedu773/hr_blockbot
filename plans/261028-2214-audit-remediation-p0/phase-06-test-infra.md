---
phase: 6
name: test-infra
owner: backend-security + web-demo-ui
claims: [P1-10, P1-11, P2-3, e2e-stale]
depends_on: [1, 5]
---

# Phase 06 — Hạ tầng test

## 6a · `apps/api` — script test bỏ sót 4/6 file (P1-11)

**File**: `apps/api/package.json:10`

Hiện trạng: `test` chỉ chạy `test/db-guard.test.mjs test/auth.test.mjs`. Bỏ sót `attachments-security`, `auth-cookie`, `chat-gateway`, `gemini-key-pool` (4 file, ~36 test, đều đang pass khi chạy tay theo report đối chứng).

**Yêu cầu**
1. `test` chạy **cả 6** file. Giữ nguyên `--import` data-URL đang dùng để set `NODE_ENV`/`TEST_MONGODB_URI`.
2. Test import `../dist/*` ⇒ script `test` phải build trước: `"test": "npm run build && node --import … --test test/*.test.mjs"` (hoặc `pretest`). Không dùng glob nếu shell Windows không expand — liệt kê tường minh 6 file.
3. Không đổi `test:guard`.

**Acceptance**
- `cd apps/api && pnpm test` → 6 file chạy, dán dòng tổng kết (`# pass` / `# fail`).
- Nếu file nào fail vì lý do **không liên quan thay đổi của phase này** (ví dụ cần Mongo thật), ghi rõ tên file + lỗi, **không** sửa test để nó xanh.

## 6b · Deceptive assert trong `auth.test.mjs` (P2-3)

**File**: `apps/api/test/auth.test.mjs:411`

Hiện trạng: `assert.ok(statuses.includes(200) || statuses.every((s) => s === 401));` — đúng với gần như mọi tổ hợp, kể cả khi cả 2 request race đều 200 (vi phạm RTR).

**Yêu cầu**
1. Thay bằng assert khẳng định **đúng bất biến**: với refresh-token rotation, tối đa **một** request được 200; request còn lại phải 401. Ví dụ: `assert.equal(statuses.filter((s) => s === 200).length, 1)` cộng `assert.equal(statuses.filter((s) => s === 401).length, 1)`.
2. Nếu chạy test thấy bất biến bị vi phạm thật → **không** nới assert; báo BLOCKED kèm output, vì đó là lỗi RTR thật cần phase riêng.
3. Ghi rõ trong report: assert cũ pass giả, assert mới có thể fail nếu RTR còn lỗi.

**Acceptance**
- `cd apps/api && pnpm test` → file `auth.test.mjs` chạy; dán kết quả test tương ứng. Nếu fail, dán nguyên văn assertion + statuses.

## 6c · `packages/contracts` test phụ thuộc `dist/` (P1-10)

**File**: `packages/contracts/package.json`, `packages/contracts/test/contracts.test.mjs:47`

Hiện trạng: test import `../dist/index.js`; `dist/` bị gitignore và không script nào build trước ⇒ clean clone fail `ERR_MODULE_NOT_FOUND`. Trên máy này `dist/` đang có sẵn nên không tái hiện.

**Yêu cầu**
1. Thêm `"pretest": "npm run build"` (hoặc gộp vào `test`) cho `packages/contracts`.
2. Không sửa file test để trỏ sang `src` (TypeScript không chạy trực tiếp bằng `node --test` ở setup này).
3. **Không** sửa `packages/contracts/src/**` — chỉ `package.json`.

**Acceptance**
- `cd packages/contracts && rm -rf dist && pnpm test` → build rồi test pass (dán output). Nếu không dám xoá `dist`, chứng minh bằng cách chạy `pnpm --filter @hr-blockbot/contracts test` và chỉ ra `pretest` đã chạy.

## 6d · 5 test e2e lỗi thời (test 9–12, 14)

**File**: `apps/web/test/e2e-revamp-flow.test.mjs`

| Test | Vì sao fail | Cách xử lý |
|---|---|---|
| 9 | chờ chuỗi `Demo an toàn · Dịch vụ AI chưa khả dụng` — chuỗi không tồn tại | Phase 05.3 thêm chuỗi → test phải xanh, **không** sửa test |
| 10, 11, 12 | `locator('nav a').filter({hasText:'Copilot'})` không thấy vì app đang ở tab `chat` | Sửa test: điều hướng về CRM trước (`getByRole('button', {name:/Quay lại Vận Hành/})` hoặc tương đương đọc từ `ChatPageView`), rồi mới click Copilot |
| 14 | chờ `data-section="attendance"/"cash"` và heading `Đội ngũ Barista & SM` — không tồn tại | Sửa test cho khớp nav thật sau phase 05.2 (liệt kê đúng các `data-section` còn lại + heading tương ứng) |

**Yêu cầu**
1. Chỉ sửa test cho khớp **hành vi đúng hiện tại**; không nới assert thành vô nghĩa, không `skip`.
2. Test 15 (console sạch) phải xanh sau phase 05.1 — nếu vẫn đỏ, đó là lỗi thật, báo lại.
3. Không xoá test nào nếu chưa có test thay thế tương đương.

**Acceptance**
- `node --test apps/web/test/e2e-revamp-flow.test.mjs` → **16/16 pass**, dán dòng tổng kết.
- Không có `skip`, không có `consoleErrors.length === 0` bị nới thành `<= 1`.

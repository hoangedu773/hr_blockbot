# Phase 3: Kiểm Thử Toàn Diện, Chống Hồi Quy & Đồng Bộ Render

> **Mục tiêu:** Chạy trọn vẹn bộ kiểm thử tự động, build monorepo và kiểm tra triển khai thực tế.

---

## 1. Danh Mục Lệnh Kiểm Thử Bắt Buộc

1. **Build Monorepo:**
   ```powershell
   pnpm -r run build
   ```
   *Yêu cầu:* Contracts + API + Web build thành công 100%, 0 lỗi TypeScript.

2. **Chạy Bộ Test Playwright E2E:**
   ```powershell
   node apps/web/test/e2e-revamp-flow.test.mjs
   ```
   *Yêu cầu:* 12/12 bài test PASS 100%, 0 console error. Đặc biệt:
   - Bước 1: Render Landing Page chuẩn, tiêu đề chuẩn, logo marquee.
   - Bước 2-3: Mở AuthModal và đăng nhập SM vào CRM Dashboard.
   - Bước 4-6: Bảng 45 chi nhánh, mở Drawer, gửi cảnh báo Telegram.
   - Bước 7: Bấm nút Đăng Xuất, quay lại Trang Chủ an toàn.

3. **Contracts Unit Tests:**
   ```powershell
   pnpm --filter @hr-blockbot/contracts test
   ```
   *Yêu cầu:* 38/38 unit tests PASS 100%.

---

## 2. Quy Chuẩn Commit & Deploy Render Cloud

```powershell
# 1. Commit theo chuẩn Conventional Commits 1.0:
git commit -m "feat(dashboard): overhaul ui-ux layout with svg icons and fix logout flow"

# 2. Push đồng thời 2 nhánh để kích hoạt auto-deploy:
git push origin main
git push origin main:integration/full-delivery

# 3. Kiểm tra trạng thái deploy trên Render:
render deploys list srv-dbbvs6o473hc73ahqu00 -o json
```
*Trạng thái đạt:* `status: "live"`.

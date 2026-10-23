# PROMPT GIAO VIỆC DÀNH CHO FRONTEND AGENT: FIX TOÀN DIỆN LỖI UI/UX VỤN VẶT

> **Kích hoạt kỹ năng:** `/ak-cook`, `/custom-design`, `/super-ui-ux-master`, `/ak-fable-thinking`  
> **Phạm vi file cho phép sửa (Write Scope):**  
> - `apps/web/src/components/CrmDashboardView.tsx`  
> - `apps/web/src/components/FolioLandingView.tsx`  
> - `apps/web/test/e2e-revamp-flow.test.mjs`  
> **Ranh giới tuyệt đối:** Không cài thêm npm dependencies mới; Không đụng vào `packages/contracts` hay `apps/api/`; Giữ nguyên quy tắc Zero-Yellow (`#2563eb` Electric Sapphire, slate/zinc neutral).

---

## 1. Bối Cảnh Nhiệm Vụ

Hệ thống đã triển khai thành công 2 view chuẩn:
- **Landing Page:** [`apps/web/src/components/FolioLandingView.tsx`](../apps/web/src/components/FolioLandingView.tsx) (bóc tách từ `folio-layout.html`).
- **CRM Dashboard:** [`apps/web/src/components/CrmDashboardView.tsx`](../apps/web/src/components/CrmDashboardView.tsx) (bóc tách từ `preview-21st-crm.html`).

Nhiệm vụ của bạn là thực hiện **sửa đổi vi phẫu (Surgical Changes)** để khắc phục dứt điểm 10 khuyết tật vi tương tác (micro-interactions) dưới đây theo đúng kế hoạch [`plans/261023-2030-ui-ux-polish/plan.md`](../plans/261023-2030-ui-ux-polish/plan.md).

---

## 2. Danh Mục 10 Lỗi Cần Fix Dứt Điểm (Checklist)

### A. Tại CRM Dashboard (`apps/web/src/components/CrmDashboardView.tsx`)
- [ ] **1. Phím tắt `Escape` đóng Drawer:** Trong `useEffect`, lắng nghe sự kiện `window.addEventListener('keydown', ...)`: nếu `e.key === 'Escape'` và drawer đang mở (`drawer.classList.contains('drawer-open')`) thì gọi `closeDrawer()`. Nhớ dọn dẹp ở cleanup.
- [ ] **2. Phím tắt `⌘K` / `Ctrl+K` kích hoạt Search:** Bắt tổ hợp `(e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')` -> `e.preventDefault()`, tìm thẻ `input[type="text"]` hoặc `input[type="search"]` và gọi `.focus()`, `.select()`.
- [ ] **3. Debounce & Loading Feedback nút Telegram Alert:** Khi click nút "Gửi Cảnh Báo Telegram":
  - Lưu lại text gốc của nút.
  - Đổi text sang `<span class="animate-spin inline-block mr-1">↻</span> Đang gửi...`, gán `disabled = true`.
  - Gọi `onTelegramAlert(currentStoreId)`.
  - Dùng `setTimeout` 800ms để trả lại text cũ và bỏ disabled.
- [ ] **4. Empty State khi tìm kiếm không khớp:** Khi hàm `handleFilter` lọc các dòng trong bảng, nếu không có hàng nào hiển thị (`visibleCount === 0`):
  - Hiển thị dòng thông báo `<tr><td colspan="8" class="text-center py-8 text-muted-foreground text-sm">Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.</td></tr>`.
  - Ẩn dòng thông báo này khi có ít nhất 1 hàng hiển thị.
- [ ] **5. Bộ lọc Ca trực (Pill Badges):** Bắt sự kiện click trên các nút lọc ca (`Tất cả`, `Ca 1`, `Ca 2`, `Ca 3`): lọc các dòng `tr` có chứa chuỗi ca tương ứng.

### B. Tại Folio Landing Page (`apps/web/src/components/FolioLandingView.tsx`)
- [ ] **6. Tự động đóng Mobile Menu khi click Nav Links:** Khi người dùng bấm vào các link menu điều hướng (`#features`, `#solution`, `#product`, `#about`): tự động gán lại `data-state="false"` cho thẻ `nav` và `aria-expanded="false"` cho nút toggle.
- [ ] **7. Phím `Escape` đóng Auth Modal:** Trong `FolioLandingView`, thêm `useEffect` lắng nghe phím `Escape` khi `isAuthOpen === true` để gọi `setIsAuthOpen(false)`.
- [ ] **8. Xoay icon Accordion FAQ:** Trong hàm `handleAccordion`: tìm icon mũi tên SVG bên trong trigger và toggle class `rotate-180 transition-transform duration-200`.
- [ ] **9. Focus-visible Ring cho nút bấm:** Đảm bảo các nút bấm chính và link CTA có class `focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:outline-none`.

### C. Mở Rộng Kiểm Thử E2E (`apps/web/test/e2e-revamp-flow.test.mjs`)
- [ ] **10. Bổ sung các Assertions mới:**
  - Test nhấn `page.keyboard.press('Escape')` kiểm tra Slide-Over Drawer đóng lại.
  - Test nhấn `page.keyboard.press('Control+KeyK')` kiểm tra ô tìm kiếm nhận focus.
  - Test nhập từ khóa `"KhongTonTai123"` kiểm tra dòng Empty State xuất hiện.

---

## 3. Lệnh Kiểm Chứng Bắt Buộc Sau Khi Sửa (Verification Gates)

Chạy 2 lệnh sau từ thư mục gốc, bắt buộc không được có bất kỳ lỗi nào:
```powershell
# 1. Build TypeScript + Vite
pnpm --filter web build

# 2. Chạy toàn bộ Playwright E2E Test Suite
node apps/web/test/e2e-revamp-flow.test.mjs
```

---

## 4. Quy Trình Commit & Push Lên Render Cloud

Sau khi test pass 100%, thực hiện đúng 4 bước theo runbook [`docs/AGENT-GUIDELINES.md:100-140`](../docs/AGENT-GUIDELINES.md#L100-L140):
```powershell
# Bước 1: Commit trên working directory chính (nhánh main)
git add apps/web/src/components/CrmDashboardView.tsx apps/web/src/components/FolioLandingView.tsx apps/web/test/e2e-revamp-flow.test.mjs
git commit -m "fix(dashboard): polish ui micro-interactions keyboard shortcuts and empty states"

# Bước 2: Fast-forward merge vào worktree integration/full-delivery
git -C "C:/work-space/hr-blockbot-int" merge main --ff-only

# Bước 3: Push cả 2 nhánh lên GitHub remote để Render auto-deploy
git push origin main
git -C "C:/work-space/hr-blockbot-int" push origin integration/full-delivery

# Bước 4: Kiểm tra trạng thái deploy live
render deploys list srv-dbbvs6o473hc73ahqu00 --output json
```

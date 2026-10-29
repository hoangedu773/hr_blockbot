# Báo Cáo Thực Thi Combo C: Ẩn Tính Năng Dở Dang & Dọn Rác (Containment)
**Ngày thực hiện:** 2026-10-24  
**Dự án:** HR BlockBot (Guta Workspace Workforce Command Center)  
**Kỹ năng kích hoạt:** `ak-scout` + `ak-fix`  
**Trạng thái:** Hoàn tất 100% | 12/12 E2E Tests Pass | 0 Console Errors | 0 Pageerrors  

---

## 1. Kết Quả Quét Codebase (Scout Findings)
1. **Quét chuỗi "TODO", "FIXME", "Lorem", dummy data bẩn:**
   - `apps/web/src`: 0 kết quả.
   - `apps/api/src`: 0 kết quả.
   - `apps/ai-service`: 0 kết quả.
   - `packages/contracts`: 0 kết quả.
   - Không còn bất kỳ comment "TODO", chuỗi placeholder Lorem Ipsum hay dữ liệu rác nào sót lại trong mã nguồn hoạt động.

2. **Quét các Router / Button / Entrypoint dở dang:**
   - 4 liên kết trên thanh bên (Sidebar Navigation) của `CrmDashboardView`:
     - `Đội ngũ Barista & SM`
     - `Lịch Phân Ca 24H`
     - `Chấm công & Đi trễ`
     - `Báo cáo Két ca`
     Trước đây mang `href="#"` không có cờ phân biệt trạng thái hoàn thiện.
   - Các nút demo trên Landing Page preview card (`.crm-btn`, `.crm-mini-btn`) trước đây chưa gắn handler điều hướng thực tế.

---

## 2. Các Biện Pháp Khắc Phục Đã Triển Khai (Containment Fixes)

### A. Gắn Cờ & Khóa Phân Hệ Chưa Hoàn Thiện (`CrmDashboardView.tsx`)
- **Badge 'Coming Soon':** Bổ sung badge chuẩn mono `Coming Soon` tại từng mục menu chưa hoàn thiện:
  ```html
  <span class="ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded">Coming Soon</span>
  ```
- **Trạng thái tương tác (Disabled UX):** Gắn cờ `data-entrypoint="coming-soon"`, style `opacity-70 cursor-not-allowed select-none` để người xem nhận biết rõ đây là các phân hệ thuộc giai đoạn tích hợp tiếp theo (Phase 2).
- **Chặn nhảy trang và gắn Toast thông báo lộ trình:** Khi click vào các mục này, sự kiện được chặn ngay lập tức và kích hoạt toast:
  `Tính năng đang trong chu kỳ đồng bộ dữ liệu ZKTeco ([Tên phân hệ] — Coming Soon)` với tiêu đề `Lộ trình phát triển`.

### B. Kích Hoạt Tương Tác Thẻ Preview Trên Landing Page (`FolioLandingView.tsx`)
- Tự động gắn handler cho toàn bộ nút bấm nghiệp vụ trong thẻ preview CRM (`.crm-btn`, `.crm-mini-btn`, `Khám phá dashboard`):
  Khi người xem bấm vào bất kỳ vị trí nút nào trên preview, hệ thống lập tức mở hộp thoại **Đăng Nhập Nhanh 1-Click** để mời trải nghiệm trực tiếp giao diện tương tác thật thay vì để nút bấm bị liệt.

---

## 3. Kết Quả Kiểm Chứng Thực Tế

```
pnpm --filter web build                            PASS (tsc + vite build in 11.35s)
node --test apps/web/test/e2e-revamp-flow.test.mjs  12/12 PASS
Console errors / pageerrors:                       0
git diff --check                                   PASS
```

Chi tiết 12 kịch bản E2E kiểm tra:
1. Render Landing Page, tiêu đề chuẩn, logo marquee, 0 pixel màu vàng (PASS)
2. Bấm nút "Get Started", mở Auth Modal 1-Click (PASS)
3. Đăng nhập vai trò SM Phương Anh, vào CRM Dashboard (PASS)
4. Bảng hiển thị 45 chi nhánh, tìm kiếm và lọc tức thì (PASS)
5. Mở Drawer chi tiết nhân sự & barista (PASS)
6. Nút gửi cảnh báo Telegram có spinner & toast (PASS)
7. Regression: Đóng liên tục, double click, Escape sớm, filter ký tự đặc biệt (PASS)
8. Regression: Unmount ChatDrawer khi bot đang typing, hủy timer sạch (PASS)
9. Combo B UI/UX: Spinner nút trigger, illustrated empty state & CTA reset, Send button state (PASS)
10. **Combo C Containment (CRM):** Khóa 4 entrypoint Coming Soon, chặn link dead `href="#"`, bắn toast ZKTeco chuẩn (PASS)
11. Đăng xuất an toàn về Landing Page, console sạch 100% (PASS)
12. **Combo C Containment (Landing):** Chặn link dead, click preview controls mở AuthModal, 0 từ khóa học thuật/khóa luận/TODO/Lorem (PASS)

---

## 4. Bước Kế Tiếp
Kích hoạt **Combo D: Giả Lập Mạng Yếu & Stress Test Demo** (`ak-web-testing`) để kiểm tra toàn bộ luồng demo dưới điều kiện offline và network latency cao.

# Báo Cáo Audit Tổng Lực Tiền Demo (Pre-Demo Readiness Audit)
**Ngày thực hiện:** 2026-10-23  
**Dự án:** HR BlockBot (Guta Workspace Workforce Command Center)  
**Vai trò:** Principal Engineer & Lead QA  

---

## 1. Kết Quả Audit Theo 5 Trục Sống Còn

Format chuẩn: `[Vấn đề] - [Mức độ rủi ro] - [Vị trí file] - [Cách chặn ngay]`

### Trục 1: Happy Path & Core Flow
- **Nút 'X' đóng Drawer văng lỗi `closeDrawer is not defined` và không đóng được** - **CRITICAL** - `apps/web/src/components/CrmDashboardView.tsx:98-102, 133-136` - Gán `(window as any).closeDrawer = closeDrawer;` vào `window` trong `useEffect` và bind trực tiếp sự kiện click cho nút đóng icon SVG.
- **Click vào các hàng trong bảng chi nhánh ném lỗi `openDrawer is not defined` ra console** - **HIGH** - `apps/web/src/components/CrmDashboardView.tsx:12, 105-130` - Thêm `(window as any).openDrawer = openDrawer;` trong `useEffect` hoặc chạy `rows.forEach(r => r.removeAttribute('onclick'))` sau khi mount để triệt tiêu inline handler lỗi thời.
- **Nhân bản thẻ `emptyRow` và rò rỉ click listener khi component re-render** - **MEDIUM** - `apps/web/src/components/CrmDashboardView.tsx:105-130, 157-160` - Thêm kiểm tra `if (!tableBody.querySelector('.empty-filter-row'))` trước khi append thẻ thông báo rỗng; bổ sung hàm gỡ listener trong `cleanup` của `useEffect`.
- **Rò rỉ timer cập nhật state trên unmounted component trong Chat Copilot** - **LOW** - `apps/web/src/components/chat/ChatDrawer.tsx:60-81` - Lưu `timerRef` cho `setTimeout` 600ms và `clearTimeout` khi đóng drawer hoặc unmount component.

### Trục 2: Mock & Fallback Safety
- **Khởi động ứng dụng gọi `refreshAccessToken()` ngầm gây lỗi đỏ `ERR_CONNECTION_REFUSED`** - **MEDIUM** - `apps/web/src/context/AuthContext.tsx:43-56`, `apps/web/src/services/auth.ts:14-16` - Kiểm tra nếu đã có tài khoản demo trong `localStorage.getItem('guta_user')` thì bỏ qua lệnh refresh tới port 3001 khi chạy demo độc lập.
- **Trộn lẫn ngữ cảnh đề tài học thuật ("Tạo đề tài", "Vòng đời đề tài") trong giao diện chuỗi cà phê F&B** - **MEDIUM** - `apps/web/src/components/FolioLandingView.tsx:7`, `apps/web/src/components/CrmDashboardView.tsx:42-44` - Đồng bộ text tiêu đề và thẻ preview landing page thành "Quản lý nhân sự & Điều phối ca trực chuỗi Guta".
- **Các mô-đun cũ không có Skeleton Loader khi fetch dữ liệu rỗng/chậm** - **LOW** - `apps/web/src/components/EmployeeListView.tsx:1-80`, `apps/web/src/components/ProjectListView.tsx:1-80` - Bọc fallback loading skeleton cho danh sách nhân viên và dự án nếu cần chuyển view demo.

### Trục 3: UI/UX & Polish (Anti-Glitches)
- **Nút "Bộ lọc Quận" và "Tạo Ca Đột Xuất" trên thanh công cụ bị liệt (Dead Buttons)** - **HIGH** - `apps/web/src/components/CrmDashboardView.tsx:12` - Gắn sự kiện click cho `Bộ lọc Quận` để lọc theo quận (Tân Bình/Q1/Q3/Q10) và `Tạo Ca Đột Xuất` để bật toast "Đã gửi đề xuất thêm ca trực khẩn cấp".
- **4 liên kết thanh bên (Sidebar Links) mang `href="#"` làm giật trang khi click** - **HIGH** - `apps/web/src/components/CrmDashboardView.tsx:12` - Chặn hành vi mặc định `e.preventDefault()` cho các link `href="#"` và hiển thị thông báo popup hoặc toast "Mô-đun đang đồng bộ dữ liệu thời gian thực".
- **Anchor link `#guta-dashboard` và `#questions` trên Landing Page không cuộn tới vị trí đích** - **LOW** - `apps/web/src/components/FolioLandingView.tsx:7` - Thêm thuộc tính `id="guta-dashboard"` và `id="questions"` vào đúng section trên Landing Page.

### Trục 4: WIP Containment (Giấu tính năng dở dang)
- **Các tính năng chưa hỗ trợ đầy đủ trên thanh bên (Barista, Lịch phân ca 24h, Két ca) chưa gắn cờ trạng thái** - **MEDIUM** - `apps/web/src/components/CrmDashboardView.tsx:12` - Thêm badge `[Sắp ra mắt]` hoặc `[Đang đồng bộ]` bên cạnh các mục menu chưa hoàn thiện để chủ động thông báo cho người xem.
- **Mã nguồn cũ (legacy components) chưa bọc route bảo vệ** - **LOW** - `apps/web/src/components/AdminSettingsView.tsx`, `apps/web/src/components/StaffDrawer.tsx` - Các view này đã được cô lập ngoài luồng `App.tsx`, duy trì trạng thái đóng và không mở đường dẫn truy cập trực tiếp trong demo.

### Trục 5: Quick Fixes (Top 5 Rủi Ro Chí Mạng & Lệnh Fix Vi Phẫu)

1. **Rủi ro 1: Nút đóng Drawer không hoạt động do `closeDrawer is not defined` (CRITICAL)**
   - Vị trí: `apps/web/src/components/CrmDashboardView.tsx:98`
   - Lệnh fix vi phẫu:
     ```ts
     (window as any).closeDrawer = closeDrawer;
     (window as any).openDrawer = openDrawer;
     ```
     Đồng thời bổ sung tìm kiếm nút đóng:
     ```ts
     root.querySelectorAll('button[onclick*="closeDrawer"]').forEach((b) => {
       (b as HTMLButtonElement).onclick = closeDrawer;
     });
     ```

2. **Rủi ro 2: Lỗi console `openDrawer is not defined` khi click hàng chi nhánh (HIGH)**
   - Vị trí: `apps/web/src/components/CrmDashboardView.tsx:107`
   - Lệnh fix vi phẫu:
     ```ts
     rows.forEach((r) => r.removeAttribute('onclick'));
     ```

3. **Rủi ro 3: Bấm các mục menu bên trái làm giật trang do `href="#"` (HIGH)**
   - Vị trí: `apps/web/src/components/CrmDashboardView.tsx:220`
   - Lệnh fix vi phẫu:
     ```ts
     root.querySelectorAll('aside nav a[href="#"]').forEach((link) => {
       link.addEventListener('click', (e) => {
         e.preventDefault();
         if (!link.textContent?.includes('Chi nhánh') && !link.textContent?.includes('Copilot')) {
           onTelegramAlert('DEMO-COMING-SOON');
         }
       });
     });
     ```

4. **Rủi ro 4: Nút "Bộ lọc Quận" và "Tạo Ca Đột Xuất" không phản hồi (MEDIUM)**
   - Vị trí: `apps/web/src/components/CrmDashboardView.tsx:185`
   - Lệnh fix vi phẫu:
     ```ts
     root.querySelectorAll('button').forEach((b) => {
       const txt = b.textContent?.trim() || '';
       if (txt.includes('Tạo Ca Đột Xuất')) {
         b.onclick = () => onTelegramAlert('EMERGENCY-SHIFT');
       }
     });
     ```

5. **Rủi ro 5: Lỗi đỏ `ERR_CONNECTION_REFUSED` khi app khởi động mà không bật backend API (MEDIUM)**
   - Vị trí: `apps/web/src/context/AuthContext.tsx:44`
   - Lệnh fix vi phẫu:
     ```ts
     if (localStorage.getItem('guta_user')) {
       setIsLoading(false);
       return;
     }
     ```

---

## 2. Combo Prompt AgentKit Kích Hoạt Theo Kết Quả Audit

### Combo A: Bịt Rủi Ro Crash Happy Path (Chặn chết demo)
*Áp dụng xử lý lỗi `closeDrawer` / `openDrawer` và ngăn chặn văng lỗi tham chiếu trong bảng điều khiển.*

**Skill:** `ak-scenario` + `ak-fix` + `ak-test`  
**Prompt kích hoạt:**
```markdown
Dùng ak-scenario lập ma trận 5 edge case có thể làm crash luồng demo CrmDashboardView và ChatDrawer (click liên tục nút đóng Drawer, double click dòng bảng, phím tắt Escape khi Drawer chưa render xong, filter từ khóa đặc biệt, unmount ChatDrawer khi bot đang typing). Sau đó dùng ak-fix bọc error boundaries và gán an toàn hàm openDrawer/closeDrawer vào scope window, dọn dẹp attribute onclick inline. Dùng ak-test chạy lại regression test `node --test apps/web/test/e2e-revamp-flow.test.mjs` xác nhận không crash và 0 lỗi console.
```

### Combo B: Đánh Bóng Giao Diện Tránh Lộ Lỗi (UI/UX Anti-Slop)
*Áp dụng xử lý các nút bấm chết (Bộ lọc Quận, Tạo Ca Đột Xuất) và trạng thái tương tác phản hồi tức thì.*

**Skill:** `super-ui-ux-master` + `ak-ui-styling`  
**Prompt kích hoạt:**
```markdown
Kích hoạt super-ui-ux-master rà soát các route demo [FolioLandingView, CrmDashboardView, ChatDrawer]. Bổ sung micro-interaction: feedback spinner/toast khi bấm nút "Bộ lọc Quận" và "Tạo Ca Đột Xuất", gắn tooltip hoặc badge [Đang đồng bộ] cho các menu chưa có dữ liệu thật trên CrmSidebar, và đảm bảo trạng thái empty state khi lọc chi nhánh không làm vỡ chiều cao bảng. Dùng ak-ui-styling đồng bộ typography giữa Landing Page và CRM Workspace.
```

### Combo C: Ẩn Tính Năng Dở Dang & Dọn Rác (Containment)
*Áp dụng dọn dẹp các link chết `href="#"`, đồng bộ ngữ cảnh thương hiệu và giấu tính năng dở dang.*

**Skill:** `ak-scout` + `ak-fix`  
**Prompt kích hoạt:**
```markdown
Dùng ak-scout quét toàn bộ project tìm chuỗi liên kết `href="#"` không có handler trong CrmDashboardView và FolioLandingView. Dùng ak-fix chặn toàn bộ sự kiện click vào các link chết, thay thế bằng toast thông báo thân thiện "Tính năng đang trong chu kỳ đồng bộ dữ liệu ZKTeco", đồng thời thay thế các text nhầm ngữ cảnh đề tài học thuật sang nghiệp vụ điều hành chuỗi cà phê F&B.
```

### Combo D: Giả Lập Mạng Yếu & Stress Test Demo
*Kiểm tra độ chịu đựng của giao diện và tính độc lập của chế độ trình chiếu.*

**Skill:** `ak-web-testing`  
**Prompt kích hoạt:**
```markdown
Dùng ak-web-testing viết test Playwright mô phỏng luồng demo chính (Landing Page -> 1-Click Login -> Bảng 45 chi nhánh -> Mở chi tiết -> Gửi cảnh báo Telegram -> Mở Chat AI Copilot -> Đăng xuất) dưới điều kiện offline hoàn toàn (ngắt kết nối tới port 3001 và 8000). Xác nhận toàn bộ tương tác demo hoạt động trơn tru 100% không văng màn hình trắng và không bị chặn bởi bất kỳ timeout promise nào.
```

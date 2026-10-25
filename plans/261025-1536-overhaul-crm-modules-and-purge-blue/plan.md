# Kế Hoạch: Hoàn Thiện Toàn Bộ 5 Phân Hệ CRM (Xóa Bỏ Toàn Bộ "Coming Soon") & Thanh Trừng Màu Xanh (Blue/Sapphire) Khỏi Toàn Bộ Giao Diện

- **Mục tiêu:**
  1. **Thanh trừng 100% màu xanh (Blue/Sapphire/Navy) khỏi Toast và các thành phần giao diện (Giải quyết trực diện Image #2)**:
     - Sửa `Toast.tsx`: Loại bỏ dải viền xanh `#2563eb` và `#3b82f6`. Thay nền `#0d111a` (xám xanh navy) bằng `rgba(18, 18, 20, 0.96)` (neutral obsidian), viền trái dùng neutral `#71717a` (info), `#10b981` (success), `#ef4444` (error).
     - Loại bỏ các class `border-blue-500`, `bg-blue-500`, `text-blue-400`, `text-blue-500` trong `CrmDashboardView.tsx`, `FolioLandingView.tsx`, `ChatDrawer.tsx`.
  2. **Biến 4 phân hệ "Coming Soon" thành 4 phân hệ hoạt động thật 100% trong CRM Command Center**:
     - **Phân hệ 1: Cửa hàng / Chi nhánh (`stores`)**: Bảng 45 chi nhánh Guta Coffee kèm Drawer Barista và Cảnh báo Telegram.
     - **Phân hệ 2: Đội ngũ Barista & SM (`employees`)**: Bảng quản lý nhân sự chuỗi (Họ tên, Mã NV, Vai trò: Head Barista, SM, Cashier, Chi nhánh công tác, Đánh giá kỹ năng).
     - **Phân hệ 3: Lịch Phân Ca 24H (`schedules`)**: Bảng phân ca chi tiết (Ca 1 06:00-14:00, Ca 2 14:00-22:00, Ca Đêm 22:00-06:00), định biên nhân sự và trạng thái mở ca.
     - **Phân hệ 4: Chấm công & Đi trễ (`attendance`)**: Bảng đối soát chấm công ZKTeco vân tay (Giờ vào ca, giờ ra ca, số phút đi trễ, giải trình ca, trạng thái duyệt).
     - **Phân hệ 5: Báo cáo Két ca (`cash`)**: Bảng đối soát quỹ tiền mặt (Két đầu ca, Doanh thu POS, Két cuối ca, Chênh lệch 0 ₫, Trạng thái bàn giao ca).
     - Xóa bỏ hoàn toàn nhãn `Coming Soon` và handler `showSyncNotice` chặn click. Khi bấm vào menu sidebar, dashboard chuyển view tức thời và mượt mà (`cubic-bezier(0.23, 1, 0.32, 1)`).
  3. **Kiểm thử tự động & Nghiệm thu**:
     - Cập nhật E2E Playwright test kiểm tra cả 5 phân hệ hoạt động, không có dead link, không popup Coming Soon.
     - Đo kiểm tra tương phản và kiểm tra Zero-Blue token.
     - Đảm bảo 100% tests PASS và deploy Render live.

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

- `apps/web/src/components/Toast.tsx` (Xóa màu xanh và nền navy, đưa về neutral obsidian)
- `apps/web/src/components/CrmDashboardView.tsx` (Hoàn thiện 5 views hoạt động thật, gỡ nhãn Coming Soon, xóa sạch token xanh)
- `apps/web/src/components/FolioLandingView.tsx` (Xóa fallback toast xanh)
- `apps/web/src/components/chat/ChatDrawer.tsx` (Xóa token xanh)
- `apps/web/src/index.css` (Style cho các bảng phân hệ mới và animation chuyển view)
- `apps/web/test/e2e-revamp-flow.test.mjs` (Cập nhật kịch bản test 5 phân hệ)
- `docs/10-ui-ux-spec.md` & `docs/DESIGN.md` (Cập nhật kiến trúc 5 phân hệ CRM)

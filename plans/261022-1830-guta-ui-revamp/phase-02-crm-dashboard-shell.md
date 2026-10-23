---
title: "Phase 2: CRM Dashboard Shell & Data Table Chi Nhánh Guta (Zero Yellow)"
status: pending
phase: 2
owner: feat/frontend-web
depends_on: ["Phase 1"]
---

# Phase 2: Xây Dựng Khung Điều Khiển CRM Dashboard & Bảng Dữ Liệu Chi Nhánh Guta

## 1. Mục Tiêu

1. **Tái cấu trúc Sidebar (`apps/web/src/components/dashboard/CrmSidebar.tsx`):**
   - Thiết kế tinh gọn theo mẫu 21st CRM với phím tắt tìm kiếm `⌘K`.
   - Brand Header: Logo Guta chữ trắng Titanium trên nền tối, icon khối đa giác sapphire, nút về trang chủ.
   - Menu items:
     * 🏪 Danh Sách Chi Nhánh (Active, Badge 45)
     * 👥 Đội Ngũ Nhân Sự (Badge 348)
     * ⏱ Lịch Trình Phân Ca 24H (Badge Realtime nhấp nháy xanh)
     * 📋 Nhật Ký Chấm Công & Đi Trễ
     * 💰 Quản Lý Két Ca
     * ✨ Guta AI Copilot (Kích hoạt Chat Drawer)
   - Bottom Profile Card: Hiển thị người dùng hiện tại (Nguyễn Thị Phương Anh - SM Tân Bình), avatar chữ cái đầu, nút Đăng xuất.
2. **Top Navigation Bar (`apps/web/src/components/dashboard/CrmHeader.tsx`):**
   - Breadcrumb phân cấp: `Guta Workspace / Vận Hành Chi Nhánh & Phân Ca`.
   - Realtime status pill: `45/45 Cửa hàng đang mở ca sáng` với chấm tròn xanh emerald `pulse`.
   - Search bar input có icon kính lúp, hỗ trợ lọc tức thì theo tên cửa hàng hoặc tên quận.
3. **Bảng Dữ Liệu Chi Nhánh Thực Tế (`apps/web/src/components/dashboard/StoreTable.tsx`):**
   - Nạp dữ liệu 45 cửa hàng thực tế từ `data/stores.csv` (Sư Vạn Hạnh, Nguyễn Cửu Vân, Đặng Văn Sâm, Nguyễn Thị Minh Khai, Pasteur, v.v.).
   - Cột hiển thị:
     1. Mã CH (`font-mono text-xs text-muted`)
     2. Tên Chi Nhánh (kèm icon cửa hàng `☕`)
     3. Cửa Hàng Trưởng phụ trách
     4. Quận
     5. Số Barista
     6. Ca Hiện Tại
     7. Doanh Thu Két Sáng (`font-mono font-semibold`)
     8. Tỷ Lệ Đúng Giờ (`font-mono text-emerald-500`)
     9. Trạng Thái (Pill xanh emerald `Đang mở ca`)
   - Hiệu ứng hover từng dòng: `hover:bg-slate-800/40` (Dark) hoặc `hover:bg-slate-100/60` (Light), con trỏ pointer.
   - Khi click vào bất kỳ dòng nào -> kích hoạt mở Slide-Over Drawer với dữ liệu của chi nhánh đó.

## 2. Chi Tiết Kỹ Thuật & Cấu Trúc Dữ Liệu

### 2.1. Type Definition (`StoreRecord`)
```typescript
export interface StoreRecord {
  id: string;          // e.g. "GT-CH-01"
  name: string;        // e.g. "GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm"
  manager: string;     // e.g. "Nguyễn Thị Phương Anh"
  district: string;    // e.g. "Tân Bình"
  staffCount: number;  // e.g. 46
  currentShift: string;// e.g. "Ca 1 (06:00 - 14:00)"
  revenue: string;     // e.g. "8.420.000 ₫"
  onTimeRate: string;  // e.g. "100%"
  status: 'OPEN' | 'SHIFT_HANDOVER' | 'CLOSED';
}
```

### 2.2. Interactive States & Filter Logic
- Ô tìm kiếm: Lọc thời gian thực theo chuỗi gõ (case-insensitive) trên cả `name`, `id` và `district`.
- Trạng thái rỗng (Empty State): Khi tìm kiếm không ra kết quả -> hiển thị component EmptyState với icon kính lúp mờ và nút "Xóa bộ lọc".

## 3. Tiêu Chí Nghiệm Thu (Verification Gates)

1. `pnpm --filter web build` pass 100%.
2. Bảng dữ liệu hiển thị đủ 45 chi nhánh Guta, định dạng số tiền tiếng Việt chuẩn (`8.420.000 ₫`).
3. Gõ từ khóa tìm kiếm (ví dụ "Quận 1" hoặc "Sư Vạn Hạnh") lọc kết quả chính xác không có độ trễ giật lag.
4. Bấm click vào hàng cửa hàng gọi callback `onSelectStore(store)` chuẩn xác.

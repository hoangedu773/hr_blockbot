---
title: "Guta Workspace UI Revamp: Chuyển đổi toàn diện sang Folio Landing & 21st CRM Dashboard (Zero-Yellow Titanium Token System)"
description: "Kế hoạch kỹ thuật chi tiết chuyển đổi toàn bộ giao diện apps/web: Triệt tiêu 100% màu vàng cũ, thiết lập hệ thống Design Tokens Titanium Slate & Electric Sapphire chuẩn OKLCH, Landing Page Folio, Auth Modal theo vai trò, CRM Data Grid 45 chi nhánh Guta, Slide-Over Sheet và AI Copilot."
status: in_progress
priority: P1
effort: "40h"
branch: feat/frontend-web
tags: [ui-revamp, folio, 21st-crm, guta-workspace, design-tokens, oklch, react18, zero-yellow]
created: 2026-10-22
---

# Kế Hoạch Chuyển Đổi Giao Diện Mới: Guta Workspace (Folio + 21st CRM)

## 1. Bản Đặc Tả Thiết Kế (Design Brief theo ak-frontend-design & custom-design)

```text
Register:  Brand (Landing Page) & Product (CRM Workspace Dashboard)
Scene:     Quản lý chuỗi F&B (AOM, SM) và Barista theo dõi vận hành 45 chi nhánh Guta trên màn hình laptop và tablet, phòng điều hành hoặc tại quầy bar nhịp độ nhanh.
Direction: Precision Titanium & High-Density Clean Data Grid (phong cách Linear & 21st CRM). Triệt tiêu 100% màu vàng chói cũ, thay bằng tông Slate/Zinc trung tính và Accent Sapphire cao cấp.
Color:     Restrained (Accent <= 10% diện tích).
           Dark Mode:  bg oklch(0.12 0.015 250) [#090d16], surface oklch(0.16 0.018 250) [#0f172a], text oklch(0.98 0.005 250) [#f8fafc], accent oklch(0.55 0.22 260) [#2563eb]
           Light Mode: bg oklch(0.985 0.005 250) [#f8fafc], surface oklch(1 0 0) [#ffffff], text oklch(0.12 0.015 250) [#0f172a], accent oklch(0.55 0.22 260) [#2563eb]
           Semantic:   Success/Active: oklch(0.65 0.18 155) [#10b981]; Danger/Late: oklch(0.60 0.22 25) [#f43f5e]
           BAN:        CẤM 100% màu vàng (#ffd100, #eab308, #f59e0b). Logo & Brand GUTA dùng Titanium White & Dark Slate.
Type:      Display & Body: Inter / Geist Sans (tỷ lệ 1.25, line-height 1.45–1.5); Mono: JetBrains Mono / SF Mono cho mã CH, tiền két, giờ ca.
Signature: Data Table 45 chi nhánh với Slide-Over Drawer trượt êm từ phải (cubic-bezier(0.16, 1, 0.3, 1)) hiển thị Barista trực tiếp và nút gọi Telegram Bot.
Dials:     variance 3, motion 2, density 7.
```

---

## 2. Hệ Thống Design Tokens Chuẩn (Zero-Yellow Token Specification)

Toàn bộ thuộc tính màu sắc, khoảng cách, viền và đổ bóng bắt buộc phải ăn theo các biến CSS sau trong `apps/web/src/index.css`:

```css
:root {
  /* Surface Tokens - Light Mode */
  --bg-app: oklch(0.985 0.005 250);          /* #f8fafc */
  --bg-card: oklch(1 0 0);                   /* #ffffff */
  --bg-card-subtle: oklch(0.96 0.005 250);   /* #f1f5f9 */
  --bg-hover: oklch(0.94 0.008 250);         /* #e2e8f0 */
  --border-subtle: rgba(15, 23, 42, 0.08);
  --border-strong: rgba(15, 23, 42, 0.16);

  /* Typography Tokens - Light Mode */
  --text-primary: oklch(0.12 0.015 250);     /* #0f172a */
  --text-secondary: oklch(0.40 0.02 250);    /* #475569 */
  --text-muted: oklch(0.55 0.02 250);        /* #64748b */

  /* Accent & Semantic Tokens */
  --accent-primary: oklch(0.55 0.22 260);    /* #2563eb Electric Sapphire */
  --accent-primary-hover: oklch(0.48 0.22 260); /* #1d4ed8 */
  --accent-subtle: rgba(37, 99, 235, 0.08);
  --status-active: oklch(0.65 0.18 155);     /* #10b981 Emerald */
  --status-late: oklch(0.60 0.22 25);        /* #f43f5e Rose */
  --status-pending: oklch(0.55 0.02 250);    /* #64748b Slate */

  /* Radii & Motion */
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 12px;
  --radius-pill: 9999px;
  --ease-spring: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms;
  --duration-normal: 250ms;
}

.dark, [data-theme="dark"], :root:not(.light) {
  /* Surface Tokens - Dark Obsidian/Titanium */
  --bg-app: oklch(0.12 0.015 250);          /* #090d16 */
  --bg-card: oklch(0.16 0.018 250);         /* #0f172a */
  --bg-card-subtle: oklch(0.20 0.02 250);   /* #1e293b */
  --bg-hover: oklch(0.24 0.02 250);         /* #334155 */
  --border-subtle: rgba(255, 255, 255, 0.08);
  --border-strong: rgba(255, 255, 255, 0.16);

  /* Typography Tokens - Dark Mode */
  --text-primary: oklch(0.98 0.005 250);     /* #f8fafc */
  --text-secondary: oklch(0.75 0.015 250);   /* #cbd5e1 */
  --text-muted: oklch(0.60 0.015 250);       /* #94a3b8 */

  /* Accent & Semantic Tokens */
  --accent-primary: oklch(0.60 0.20 260);    /* #3b82f6 Sapphire Blue */
  --accent-primary-hover: oklch(0.68 0.20 260);
  --accent-subtle: rgba(59, 130, 246, 0.12);
  --status-active: oklch(0.70 0.17 155);     /* #34d399 */
  --status-late: oklch(0.65 0.20 25);        /* #fb7185 */
  --status-pending: oklch(0.60 0.015 250);   /* #94a3b8 */
}
```

---

## 3. Kiến Trúc Thành Phần Mới (Component Hierarchy)

```text
apps/web/src/
├── App.tsx                     # Điều hướng: Landing Page (khi chưa login) <-> CRM Dashboard (khi đã login)
├── index.css                   # Zero-yellow design tokens, utilities & custom scrollbar
├── context/
│   └── AuthContext.tsx         # Quản lý phiên: SM Phương Anh / AOM Trầm / Admin, localStorage sync
├── components/
│   ├── landing/                # Module Landing Page (Bóc tách từ Folio Ruixen UI)
│   │   ├── LandingNavbar.tsx   # Header, Theme Toggle, CTA "Get Started"
│   │   ├── LandingHero.tsx     # Hero banner, Dashboard mockup tương tác
│   │   ├── LogoMarquee.tsx     # Băng chuyền 13 đối tác vô tận
│   │   ├── BentoFeatures.tsx   # Bento grid 4 thẻ tính năng 3D
│   │   ├── InteractiveTabs.tsx # 4 tab tự chuyển 6s kèm progress bar
│   │   ├── FaqSection.tsx      # Câu hỏi thường gặp dạng accordion
│   │   └── AuthModal.tsx       # Modal 1-Click Login theo vai trò (SM/AOM/Admin)
│   ├── dashboard/              # Module CRM Dashboard (Bóc tách từ 21st CRM Data Grid)
│   │   ├── CrmSidebar.tsx      # Sidebar thu gọn ⌘K, User Profile card
│   │   ├── CrmHeader.tsx       # Breadcrumb, Realtime pill "45/45 CH mở ca", actions
│   │   ├── StoreTable.tsx      # Data table 45 chi nhánh Guta, sort/filter
│   │   └── SlideOverDrawer.tsx # Drawer trượt êm hiển thị Barista trong ca & Telegram alert
│   └── chat/
│       └── ChatDrawer.tsx      # Guta AI Copilot slide-in chat kết nối WebSocket backend
```

---

## 4. Các Giai Đoạn Triển Khai (Phases)

| # | Phase | Nội Dung Trọng Tâm | Tiêu Chí Kiểm Chứng |
|---|---|---|---|
| **Phase 1** | [Design Tokens & Landing Page](./phase-01-design-tokens-and-landing.md) | Triệt tiêu màu vàng trong `index.css`, dựng trọn bộ `landing/` components. | Route `/` hiển thị đầy đủ, không còn 1 pixel vàng nào, tabs chạy 6s. |
| **Phase 2** | [CRM Dashboard & Store Table](./phase-02-crm-dashboard-shell.md) | Xây dựng `CrmSidebar.tsx`, `CrmHeader.tsx`, `StoreTable.tsx` nạp 45 CH từ CSV. | Route `/app` hiển thị 45 chi nhánh, hover mượt, click chọn dòng. |
| **Phase 3** | [Slide-Over Drawer & Live Roster](./phase-03-slideover-and-roster-details.md) | Dựng `SlideOverDrawer.tsx` với thông tin Barista, két tiền, AI alert. | Click dòng -> Drawer mở trong 250ms, nút Telegram alert bấm có phản hồi. |
| **Phase 4** | [Auth Routing, Chat & E2E Test](./phase-04-auth-routing-and-e2e.md) | Ghép `App.tsx`, `AuthModal.tsx`, `ChatDrawer.tsx`, chạy Playwright test suite. | `pnpm --filter web build` pass 100%, E2E Playwright test pass toàn luồng. |

---

## 5. Quy Chuẩn Tương Tác & Chống AI Slop (Super UI/UX Standards)

1. **8 Interactive States bắt buộc:** Mọi thành phần tương tác (Button, Row, Input, Tab) phải có đủ:
   - `default`: Nền chuẩn theo token, tương phản rõ ràng.
   - `hover`: Nền sáng/tối nhẹ (`--bg-hover`), con trỏ pointer, chuyển màu trong 150ms.
   - `focus-visible`: Viền outline 2px màu `--accent-primary` cách viền 2px (`ring-2 ring-primary ring-offset-2`).
   - `active`: Co nhẹ `transform: scale(0.98)` để tạo cảm giác bấm thật.
   - `disabled`: Mờ 50%, `cursor: not-allowed`, loại bỏ pointer events.
   - `loading`: Skeleton shimmer theo tông titanium, không giật layout.
   - `error`: Viền đỏ rose nhẹ (`--status-late`), thông báo lỗi inline.
   - `success`: Viền xanh lục emerald nhẹ (`--status-active`).
2. **Quy tắc trượt Drawer:**
   - Khi đóng: `transform: translateX(100%); pointer-events: none; visibility: hidden;`
   - Khi mở: `transform: translateX(0); pointer-events: auto; visibility: visible;`
   - Tuyệt đối không để Drawer ẩn chặn click lên bảng dữ liệu bên dưới.
3. **Quy tắc Font & Cấm Select OS:**
   - Cấm dùng `<select>` mặc định của hệ điều hành. Dùng Custom Dropdown/Popover component.
   - Custom Scrollbar: Rộng 4px, bo góc tròn 9999px, nền trong suốt.

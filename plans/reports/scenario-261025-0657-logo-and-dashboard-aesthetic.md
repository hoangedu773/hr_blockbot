# Scenario Analysis: Logo Pure Consistency & CRM Frosted Gray Aesthetic Overhaul

- **Target**: Đổi logo sang `/assets/logos/guta-mark-pure.svg`, khôi phục chữ WORKSPACE thành màu tự nhiên (`text-foreground`), bổ sung hiệu ứng mờ nhẹ xám nhẹ (frosted glass) cho Dashboard.
- **Ngày**: 2026-10-25
- **Lead Evaluator**: Senior Team Lead & Chief Architect

---

## 1. Kịch bản phân rã 12 chiều (Scenario Decomposition)

| # | Dimension | Kịch bản / Rủi ro | Mức độ | Hành vi mong đợi |
|---|---|---|---|---|
| 1 | **Environment (Zero-Yellow Gate)** | Khi thêm hiệu ứng xám nhẹ hoặc shadow, token màu bị lẫn dải màu vàng chói (`#ffd100`, `#eab308`, `#f59e0b`) | Critical | Bộ kiểm thử Zero-Yellow DOM scanner quét toàn bộ phần tử phải trả về `0 pixel vàng` |
| 2 | **Regression Test (Playwright Assertions)** | File test `e2e-revamp-flow.test.mjs` có các selector kiểm tra header title, logo hoặc navbar link | High | Các selector test như `page.getByText(/Vận Hành Chi Nhánh & Phân Ca/i)`, `nav a`, `Guta Workspace` phải pass 100% không gãy |
| 3 | **State Transitions (Chuyển tab CRM <-> Chat)** | Chuyển qua lại giữa CRM Dashboard và ChatPageView có logo đồng bộ, không bị giật layout (layout shift) hoặc lệch kích thước logo | Medium | Logo ở cả CRM và ChatPage đều dùng chung `guta-mark-pure.svg`, kích thước cố định (`size-7` hoặc `size-8`), không giật |
| 4 | **Environment (Mobile / Performance)** | Backdrop-filter blur (`backdrop-blur-md`, `backdrop-blur-xl`) kết hợp gradient trên Safari / Mobile yếu gây tụt FPS hoặc tràn viền ngang | Medium | Giữ `scrollWidth <= clientWidth` ở viewport 320px/375px; dùng CSS hardware acceleration (`will-change`, GPU composite layer) |
| 5 | **Visual Contrast (WCAG AA Accessibility)** | Các badge, card KPI và text trên nền xám mờ không đủ tương phản (dưới 4.5:1) | High | Đảm bảo text trên nền xám mờ giữ độ tương phản tối thiểu ≥ 4.5:1 với nền Dark Slate |
| 6 | **Git & Deployment Delivery** | Commit sai scope hoặc push thiếu nhánh `integration/full-delivery` khiến Render không kích hoạt tự động deploy | High | Commit đúng whitelist (`feat(dashboard): ...`), push đủ `origin main` và `origin main:integration/full-delivery` |

---

## 2. Các hành động kỹ thuật cụ thể

1. **Logo & Text Branding**:
   - `CrmDashboardView.tsx`:
     - Thay `01-electric-sapphire.svg` -> `/assets/logos/guta-mark-pure.svg`.
     - Bỏ container xanh `bg-blue-600/10 p-1 border-blue-500/20`, thay bằng `size-8 flex items-center justify-center rounded-xl bg-white/[0.04] border border-white/10 p-1`.
     - Thay `<span class="font-semibold tracking-tight text-blue-500 text-sm">WORKSPACE</span>` -> `<span class="font-semibold tracking-tight text-foreground text-sm">WORKSPACE</span>` (giống y hệt trang chủ `FolioLandingView.tsx`).
   - `ChatPageView.tsx`:
     - Thay `01-electric-sapphire.svg` ở Sidebar và Hero -> `/assets/logos/guta-mark-pure.svg`.
   - `ChatDrawer.tsx`:
     - Đồng bộ thay logo sang `/assets/logos/guta-mark-pure.svg`.
2. **Hiệu ứng mờ nhẹ xám nhẹ (Frosted Gray & Deep Glass Aesthetic)**:
   - Sidebar CRM: Bổ sung subtle backdrop-blur `bg-slate-950/80 backdrop-blur-xl border-r border-white/[0.06]`.
   - Topbar CRM: `crm-header-smooth` phủ lớp blur mềm mại `background: rgba(15, 23, 42, 0.75) !important; backdrop-filter: blur(20px) !important; border-bottom: 1px solid rgba(255, 255, 255, 0.07) !important;`.
   - 4 Thẻ KPI: Thêm hiệu ứng xám mờ nhiều lớp `background: linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.015) 100%) !important; backdrop-filter: blur(16px) !important; border: 1px solid rgba(255, 255, 255, 0.08) !important; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.06), 0 8px 24px rgba(0, 0, 0, 0.3) !important;`.
   - Hàng bảng dữ liệu: Hover nhẹ nhàng `bg-white/[0.035] backdrop-blur-xs`.
   - Slide-over Drawer: Thêm gradient xám chiều sâu `bg-slate-900/95 backdrop-blur-2xl border-l border-white/[0.08]`.
3. **Acceptance Verification**:
   - `pnpm -r run build` -> Exit 0.
   - `node apps/web/test/e2e-revamp-flow.test.mjs` -> PASS 16/16.
   - `git push origin main` && `git push origin main:integration/full-delivery`.

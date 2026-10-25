# Kế Hoạch: Khôi Phục Logo Chuẩn Guta & Tinh Chỉnh Hiệu Ứng Mờ Nhẹ Xám Nhẹ (Frosted Gray Glass)

- **Mục tiêu:**
  1. Loại bỏ toàn bộ logo màu xanh lạ (`01-electric-sapphire.svg`), khôi phục về logo thuần `/assets/logos/guta-mark-pure.svg` chuẩn nhận diện như ở trang chủ `FolioLandingView.tsx`.
  2. Xóa bỏ màu xanh ở chữ `WORKSPACE`, trả về màu tự nhiên (`text-foreground`).
  3. Bổ sung các hiệu ứng mờ nhẹ, xám nhẹ (Frosted Glass, subtle backdrop-blur, linear-gradient xám, inner-glow) trên Dashboard CRM để giao diện có chiều sâu, thanh lịch, bớt nhàm chán.
  4. Đảm bảo toàn bộ test E2E Playwright và build PASS 100%, tuân thủ Zero-Yellow.
  5. Commit theo Conventional Commits và push lên cả `main` lẫn `integration/full-delivery` để Render tự động build & deploy.
- **Ngày lập:** 2026-10-25
- **Người lập:** Senior Team Lead & Chief Architect

---

## 1. Ranh Giới File Sở Hữu (Strict File Ownership)

Subagent `fullstack-developer` CHỈ ĐƯỢC PHÉP chỉnh sửa các file sau:
1. `apps/web/src/components/CrmDashboardView.tsx` (Logo pure, chữ WORKSPACE tự nhiên, các card/header xám mờ)
2. `apps/web/src/components/chat/ChatPageView.tsx` (Logo pure tại sidebar và hero)
3. `apps/web/src/components/chat/ChatDrawer.tsx` (Logo pure tại header drawer)
4. `apps/web/src/index.css` (Tăng cường styles frosted glass, border xám mờ nhẹ, KPI card gradient)
5. `apps/web/test/e2e-revamp-flow.test.mjs` (Cập nhật assertion nếu có liên quan đến logo/brand, đảm bảo pass 16/16)

---

## 2. Chi Tiết Thực Thi

### Phase 1: Chuẩn Hóa Logo & Typography Nhận Diện Thương Hiệu
- Đổi toàn bộ đường dẫn logo `01-electric-sapphire.svg` sang `/assets/logos/guta-mark-pure.svg`.
- Trên Sidebar CRM (`CrmDashboardView.tsx`):
  - Khung logo: Bỏ `bg-blue-600/10 border-blue-500/20`, chuyển sang `bg-white/[0.04] border border-white/10 rounded-xl p-1`.
  - Chữ: `<span class="font-black tracking-wider text-foreground text-sm">GUTA</span> <span class="font-semibold tracking-tight text-foreground text-sm">WORKSPACE</span>`.
- Trên Chat Page (`ChatPageView.tsx`):
  - Sidebar: Logo pure + Guta Workspace.
  - Hero Section: Logo pure với `size-12` thanh lịch.

### Phase 2: Nâng Cấp Hiệu Ứng Mờ Nhẹ Xám Nhẹ (Frosted Gray & Obsidian Glass)
- Trong `apps/web/src/index.css` & `CrmDashboardView.tsx`:
  - KPI Cards: Nền gradient xám nhẹ mờ `linear-gradient(135deg, rgba(255, 255, 255, 0.04) 0%, rgba(255, 255, 255, 0.015) 100%)`, viền `border-white/[0.08]`, `backdrop-filter: blur(16px)`, shadow đa lớp có chiều sâu. Hover nâng nhẹ `translateY(-2px)` với viền xám sáng hơn `border-white/15`.
  - Header & Topbar: Thêm `backdrop-blur-xl bg-slate-900/75 border-b border-white/[0.07]`.
  - Bảng dữ liệu cửa hàng:
    - Thead: Nền xám mờ `bg-slate-900/60 backdrop-blur-md border-b border-white/[0.06]`.
    - Dòng bảng: Hover xám nhẹ `bg-white/[0.03] transition-colors`.
    - Badge icon: Đổi các icon chi nhánh từ nền xanh chói sang nền xám mờ nhẹ `bg-white/[0.05] text-slate-300 border border-white/10`.
  - Slide-Over Drawer: Backdrop xám mờ sâu `bg-black/60 backdrop-blur-md`, ruột drawer `bg-slate-900/95 backdrop-blur-2xl border-l border-white/[0.08]`.

### Phase 3: Kiểm Thử Nghiêm Ngặt & Đẩy Code Lên Render
- Build monorepo: `pnpm -r run build` (Exit 0).
- Chạy E2E Playwright: `node apps/web/test/e2e-revamp-flow.test.mjs` (PASS 16/16).
- Kiểm tra Zero-Yellow: 0 pixel màu vàng cấm.
- Sau khi Subagent QA nghiệm thu PASS 100%:
  - Thực hiện commit: `git commit -m "feat(dashboard): restore pure guta mark and polish frosted gray glass aesthetic"`
  - Thực hiện push lên 2 nhánh:
    ```powershell
    git push origin main
    git push origin main:integration/full-delivery
    ```

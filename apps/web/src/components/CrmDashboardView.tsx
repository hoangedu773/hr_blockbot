import React, { useEffect, useRef } from 'react';
import type { NotifyFn } from './Toast';

export interface CrmDashboardViewProps {
  userName: string;
  userRole: string;
  userScope: string;
  onLogout: () => void;
  onTelegramAlert: (storeId: string) => void;
  onOpenAiCopilot?: () => void;
  onSwitchTab?: (tab: 'crm' | 'chat') => void;
  onNotify?: NotifyFn;
}

const CRM_HTML = `
  <div data-slot="sidebar-wrapper" style="--sidebar-width:16rem;--sidebar-width-icon:16rem" class="group/sidebar-wrapper flex min-h-svh w-full h-svh overflow-hidden">

    <!-- SIDEBAR -->
    <aside class="crm-sidebar w-64 border-r border-white/[0.08] bg-slate-900/70 backdrop-blur-xl flex flex-col justify-between shrink-0 select-none">
      <div class="flex flex-col">
        <!-- Brand Header with HR-BlockBot Logo -->
        <div class="p-4 border-b border-border/80 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex size-8 items-center justify-center rounded-xl bg-white/[0.04] p-1 border border-white/10 shrink-0">
              <img src="/assets/logos/guta-mark-pure.svg" alt="Guta Logo" class="size-6 object-contain" />
            </div>
            <div class="flex flex-col">
              <div class="flex items-center gap-1.5 leading-none">
                <span class="font-black tracking-wider text-foreground text-sm">GUTA</span>
                <span class="font-semibold tracking-tight text-foreground text-sm">WORKSPACE</span>
              </div>
            </div>
          </div>
          <a href="#logout" title="Trở về Trang Chủ" class="text-xs text-muted-foreground hover:text-foreground p-1.5 rounded-lg hover:bg-muted transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </a>
        </div>

        <!-- Search Bar Trigger -->
        <div class="px-3 pt-3">
          <div class="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/70 bg-background/60 text-xs text-muted-foreground shadow-xs cursor-pointer hover:border-blue-500/50 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <input type="text" placeholder="Lọc theo tên, quận, mã..." class="flex-1 bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-muted-foreground w-full" />
            <kbd class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono border border-border shrink-0">⌘K</kbd>
          </div>
        </div>

        <!-- Navigation Menu with AI Copilot at TOP -->
        <nav class="px-2 py-3 space-y-1">
          <div class="px-2 pb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Trợ Lý Thông Minh</div>

          <a href="#" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-blue-600/10 text-blue-400 border border-blue-500/20 shadow-xs hover:bg-blue-600/15 transition cursor-pointer mb-3">
            <div class="size-6 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-2xs shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </div>
            <span class="font-bold">Guta Copilot AI</span>
            <span class="ml-auto text-[10px] font-mono font-semibold bg-blue-500/20 text-blue-400 px-2 py-0.5 rounded-full border border-blue-500/30">Mở Chat</span>
          </a>

          <div class="px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Hệ Thống Vận Hành</div>

          <a href="#" class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold bg-muted/60 text-foreground border border-border/80">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-500"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            <span>Cửa hàng / Chi nhánh</span>
            <span class="ml-auto rounded-full bg-blue-600/20 px-2 py-0.5 text-[10px] font-bold font-mono text-blue-400">45</span>
          </a>

          <a href="#" data-entrypoint="coming-soon" class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground/75 opacity-70 cursor-not-allowed select-none transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <span>Đội ngũ Barista & SM</span>
            <span class="ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded">Coming Soon</span>
          </a>

          <a href="#" data-entrypoint="coming-soon" class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground/75 opacity-70 cursor-not-allowed select-none transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2"/><line x1="16" x2="16" y1="2" y2="6"/><line x1="8" x2="8" y1="2" y2="6"/><line x1="3" x2="21" y1="10" y2="10"/></svg>
            <span>Lịch Phân Ca 24H</span>
            <span class="ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded">Coming Soon</span>
          </a>

          <a href="#" data-entrypoint="coming-soon" class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground/75 opacity-70 cursor-not-allowed select-none transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            <span>Chấm công & Đi trễ</span>
            <span class="ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded">Coming Soon</span>
          </a>

          <a href="#" data-entrypoint="coming-soon" class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-muted-foreground/75 opacity-70 cursor-not-allowed select-none transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
            <span>Báo cáo Két ca</span>
            <span class="ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded">Coming Soon</span>
          </a>
        </nav>
      </div>

      <!-- User Profile at bottom -->
      <div class="p-3 border-t border-border bg-sidebar/50">
        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-border/60 bg-background/80 shadow-xs">
          <div class="size-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs ring-1 ring-border shrink-0">PA</div>
          <div class="flex-1 min-w-0">
            <div class="font-bold text-foreground text-xs truncate">Nguyễn Thị Phương Anh</div>
            <div class="text-[10px] text-muted-foreground truncate" title="Cửa hàng trưởng (SM)">Cửa hàng trưởng (SM)</div>
          </div>
          <button type="button" role="button" aria-label="Đăng Xuất Phiên" title="Đăng Xuất Phiên" class="text-muted-foreground hover:text-red-500 p-1.5 rounded-md hover:bg-muted transition cursor-pointer shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          </button>
        </div>
      </div>
    </aside>

    <!-- MAIN CONTENT INSET -->
    <div class="flex flex-col flex-1 h-svh overflow-hidden bg-background">

      <!-- TOP BAR (To hơn, mềm mại hơn) -->
      <header class="crm-header-smooth flex items-center justify-between shrink-0">
        <div class="flex items-center gap-4">
          <div class="flex items-center gap-2 text-xs text-muted-foreground font-medium">
            <span class="text-foreground/90 font-medium text-sm">Guta Workspace</span>
            <span class="text-muted-foreground/30 font-mono">/</span>
            <span class="text-foreground font-semibold text-sm">Vận Hành Chi Nhánh & Phân Ca</span>
          </div>
          <span class="rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-3.5 py-1 text-xs font-medium flex items-center gap-2 shadow-2xs">
            <span class="size-2 rounded-full bg-emerald-500 animate-pulse"></span>
            45/45 Chi nhánh mở ca sáng
          </span>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2.5">
            <button type="button" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/80 bg-background/80 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs cursor-pointer active:scale-95 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span>Bộ lọc Quận</span>
            </button>
            <button type="button" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-500 hover:to-blue-600 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              <span>Tạo Ca Đột Xuất</span>
            </button>
          </div>
        </div>
      </header>

      <!-- DATA TABLE AREA -->
      <main class="flex-1 overflow-auto p-6">
        <!-- KPI SUMMARY RIBBON (Frosted Muted Slate Gray) -->
        <div class="crm-kpi-grid">
          <div class="crm-kpi-card">
            <div class="crm-kpi-header">
              <span class="crm-kpi-title">Tổng Cửa Hàng</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
            </div>
            <div class="crm-kpi-value">45 <small style="font-size: 13px; font-weight: 400; color: #94a3b8; font-family: sans-serif;">chi nhánh</small></div>
            <div class="crm-kpi-meta" style="color: #34d399;">
              <span style="width: 6px; height: 6px; border-radius: 9999px; background: #10b981;"></span>
              <span>100% mở ca 1</span>
            </div>
          </div>

          <div class="crm-kpi-card">
            <div class="crm-kpi-header">
              <span class="crm-kpi-title">Nhân Sự Trực Ca</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-indigo-400"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <div class="crm-kpi-value">135 <small style="font-size: 13px; font-weight: 400; color: #94a3b8; font-family: sans-serif;">nhân sự</small></div>
            <div class="crm-kpi-meta" style="color: #94a3b8;">
              <span>Định biên 3 người / cửa hàng</span>
            </div>
          </div>

          <div class="crm-kpi-card">
            <div class="crm-kpi-header">
              <span class="crm-kpi-title">Doanh Thu Két Sáng</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-blue-400"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 18V6"/></svg>
            </div>
            <div class="crm-kpi-value" style="color: #60a5fa;">184.250.000 ₫</div>
            <div class="crm-kpi-meta" style="color: #34d399;">
              <span>Khớp 99.94% máy POS</span>
            </div>
          </div>

          <div class="crm-kpi-card">
            <div class="crm-kpi-header">
              <span class="crm-kpi-title">Tỷ Lệ Đúng Giờ</span>
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-emerald-400"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
            </div>
            <div class="crm-kpi-value">98.6%</div>
            <div class="crm-kpi-meta" style="color: #94a3b8;">
              <span>Đồng bộ ZKTeco vân tay</span>
            </div>
          </div>
        </div>

        <div class="mb-4 flex items-center justify-between">
          <div>
            <h1 class="text-xl font-bold tracking-tight text-foreground">Chi Nhánh Cà Phê Guta (Khu Vực TP.HCM)</h1>
            <p class="text-xs text-muted-foreground mt-0.5">Dữ liệu nhân sự, ca làm việc hiện tại và doanh thu két thời gian thực. Bấm vào từng hàng để mở Slide-Over Drawer.</p>
          </div>
          <div class="text-xs font-medium text-muted-foreground whitespace-nowrap">
            Hiển thị 10 / 45 Cửa hàng
          </div>
        </div>

        <!-- TABLE -->
        <div class="crm-table-shell rounded-xl border border-white/[0.08] bg-white/[0.02] backdrop-blur-md shadow-xs overflow-x-auto">
          <table class="w-full text-left text-xs border-collapse min-w-[960px]">
            <thead class="crm-table-head bg-slate-900/60 backdrop-blur-md">
              <tr class="border-b border-white/[0.06] font-semibold text-muted-foreground">
                <th class="py-3 px-3 whitespace-nowrap">Mã CH</th>
                <th class="py-3 px-3 whitespace-nowrap">Tên Cửa Hàng / Chi Nhánh</th>
                <th class="py-3 px-3 whitespace-nowrap">Cửa Hàng Trưởng (SM)</th>
                <th class="py-3 px-3 whitespace-nowrap">Quận</th>
                <th class="py-3 px-3 text-center whitespace-nowrap">Số Barista</th>
                <th class="py-3 px-3 whitespace-nowrap">Ca Hiện Tại</th>
                <th class="py-3 px-3 text-right whitespace-nowrap">Doanh Thu Két</th>
                <th class="py-3 px-3 text-center whitespace-nowrap">Đúng Giờ</th>
                <th class="py-3 px-3 text-center whitespace-nowrap">Trạng Thái</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-border/60 font-medium">

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-01" data-name="GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm" data-sm="Nguyễn Thị Phương Anh" data-district="Tân Bình" data-staff="46" data-shift="Ca 1 (06:00 - 14:00)" data-rev="8.420.000 ₫" data-ontime="100%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-01</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Nguyễn Thị Phương Anh</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Tân Bình</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">46</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">8.420.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">100%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-02" data-name="GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh" data-sm="Đỗ Quỳnh Anh" data-district="Quận 10" data-staff="56" data-shift="Ca 1 (06:00 - 14:00)" data-rev="12.150.000 ₫" data-ontime="98%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-02</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Đỗ Quỳnh Anh</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 10</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">56</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">12.150.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">98%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-03" data-name="GUTA CAFE - Bình Thạnh - 18 Nguyễn Cửu Vân" data-sm="Nguyễn Lê Quang Trường" data-district="Bình Thạnh" data-staff="47" data-shift="Ca 1 (06:00 - 14:00)" data-rev="7.890.000 ₫" data-ontime="95%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-03</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Bình Thạnh - 18 Nguyễn Cửu Vân</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Nguyễn Lê Quang Trường</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Bình Thạnh</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">47</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">7.890.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">95%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-04" data-name="GUTA CAFE - Quận 3 - 100 Nguyễn Thị Minh Khai" data-sm="Nguyễn Thị Thu Trúc" data-district="Quận 3" data-staff="45" data-shift="Ca 1 (06:00 - 14:00)" data-rev="9.340.000 ₫" data-ontime="100%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-04</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 3 - 100 Nguyễn Thị Minh Khai</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Nguyễn Thị Thu Trúc</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 3</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">45</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">9.340.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">100%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-05" data-name="GUTA CAFE - Quận 3 - 41 Trần Cao Vân" data-sm="Triệu Quang Nhân" data-district="Quận 3" data-staff="45" data-shift="Ca 1 (06:00 - 14:00)" data-rev="8.120.000 ₫" data-ontime="96%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-05</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 3 - 41 Trần Cao Vân</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Triệu Quang Nhân</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 3</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">45</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">8.120.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">96%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-06" data-name="GUTA CAFE - Quận 1 - 146 Nguyễn Văn Thủ" data-sm="Trương Quốc Thái" data-district="Quận 1" data-staff="43" data-shift="Ca 1 (06:00 - 14:00)" data-rev="6.950.000 ₫" data-ontime="94%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-06</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 1 - 146 Nguyễn Văn Thủ</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Trương Quốc Thái</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 1</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">43</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">6.950.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">94%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-07" data-name="GUTA CAFE - Gò Vấp - 1B Nguyễn Kiệm" data-sm="Thái Thanh Lam" data-district="Gò Vấp" data-staff="42" data-shift="Ca 1 (06:00 - 14:00)" data-rev="7.200.000 ₫" data-ontime="97%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-07</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Gò Vấp - 1B Nguyễn Kiệm</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Thái Thanh Lam</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Gò Vấp</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">42</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">7.200.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">97%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-08" data-name="GUTA CAFE - Gò Vấp - 30 Phạm Văn Đồng" data-sm="Lại Ngọc Hoàng Nguyên" data-district="Gò Vấp" data-staff="42" data-shift="Ca 1 (06:00 - 14:00)" data-rev="7.600.000 ₫" data-ontime="99%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-08</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Gò Vấp - 30 Phạm Văn Đồng</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Lại Ngọc Hoàng Nguyên</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Gò Vấp</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">42</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">7.600.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">99%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-09" data-name="GUTA CAFE - Bình Thạnh - 193F Điện Biên Phủ" data-sm="Nguyễn Cao Thanh Hằng" data-district="Bình Thạnh" data-staff="39" data-shift="Ca 1 (06:00 - 14:00)" data-rev="6.450.000 ₫" data-ontime="95%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-09</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Bình Thạnh - 193F Điện Biên Phủ</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Nguyễn Cao Thanh Hằng</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Bình Thạnh</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">39</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">6.450.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">95%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

              <tr class="table-row-hover cursor-pointer" data-id="GT-CH-10" data-name="GUTA CAFE - Quận 3 - 206 Pasteur" data-sm="Lê Ngọc Bảo Trân" data-district="Quận 3" data-staff="38" data-shift="Ca 1 (06:00 - 14:00)" data-rev="8.870.000 ₫" data-ontime="100%">
                <td class="py-3 px-3 font-mono text-[11px] text-muted-foreground whitespace-nowrap">GT-CH-10</td>
                <td class="py-3 px-3 font-semibold text-foreground flex items-center gap-2 whitespace-nowrap">
                  <div class="crm-branch-icon size-6 rounded-md bg-white/[0.05] text-slate-300 flex items-center justify-center shrink-0 border border-white/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4Z"/><line x1="6" x2="6" y1="2" y2="4"/><line x1="10" x2="10" y1="2" y2="4"/><line x1="14" x2="14" y1="2" y2="4"/></svg>
                  </div>
                  <span>GUTA CAFE - Quận 3 - 206 Pasteur</span>
                </td>
                <td class="py-3 px-3 text-foreground/90 whitespace-nowrap">Lê Ngọc Bảo Trân</td>
                <td class="py-3 px-3 whitespace-nowrap">
                  <span class="rounded-md bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground whitespace-nowrap">Quận 3</span>
                </td>
                <td class="py-3 px-3 text-center font-semibold text-foreground whitespace-nowrap">38</td>
                <td class="py-3 px-3 text-foreground/80 font-mono text-[11px] whitespace-nowrap">Ca 1 (06:00 - 14:00)</td>
                <td class="py-3 px-3 text-right font-mono font-semibold text-foreground whitespace-nowrap">8.870.000 ₫</td>
                <td class="py-3 px-3 text-center font-mono text-emerald-400 whitespace-nowrap">100%</td>
                <td class="py-3 px-3 text-center whitespace-nowrap">
                  <span class="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 text-[11px] font-semibold text-emerald-400 whitespace-nowrap">
                    <span class="size-1.5 rounded-full bg-emerald-500"></span>
                    Đang mở ca
                  </span>
                </td>
              </tr>

            </tbody>
          </table>
        </div>
      </main>

    </div>
  </div>

  <!-- SLIDE-OVER DETAIL DRAWER -->
  <div id="drawer-backdrop" class="fixed inset-0 z-40 bg-black/60 backdrop-blur-md transition-opacity duration-200 opacity-0 pointer-events-none"></div>
  <aside id="detail-drawer" class="fixed inset-y-0 right-0 z-50 w-full max-w-md bg-slate-900/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl flex flex-col h-full transform translate-x-full transition-transform duration-200">
    <!-- Drawer Header (shrink-0) -->
    <div class="p-6 border-b border-border flex items-start justify-between bg-muted/20 shrink-0">
      <div>
        <span class="rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 px-2 py-0.5 text-[10px] font-bold font-mono uppercase" id="d-id">GT-CH-01</span>
        <h2 class="text-base font-bold text-foreground mt-2" id="d-name">GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm</h2>
        <p class="text-xs text-muted-foreground mt-0.5" id="d-district">Quận: Tân Bình • Cửa hàng trưởng: Nguyễn Thị Phương Anh</p>
      </div>
      <button type="button" aria-label="Đóng chi tiết" data-close-drawer class="size-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition cursor-pointer shrink-0">
        <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
      </button>
    </div>

    <!-- Drawer Body (scrollable) -->
    <div class="p-6 space-y-5 flex-1 overflow-y-auto">
      <p class="text-xs text-muted-foreground" role="note">Nội dung minh họa — không phải dữ liệu nhân sự hay vận hành thật.</p>

      <!-- Metrics Grid -->
      <div class="grid grid-cols-2 gap-3">
        <div class="p-3.5 rounded-xl border border-border bg-background/80 shadow-2xs">
          <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block whitespace-nowrap">Doanh Thu Két Ca</span>
          <div class="text-base font-bold font-mono text-blue-600 dark:text-blue-400 mt-1" id="d-rev">8.420.000 ₫</div>
          <span class="text-[10px] text-emerald-400 font-medium block mt-1">↑ +14% so với ca hôm qua</span>
        </div>
        <div class="p-3.5 rounded-xl border border-border bg-background/80 shadow-2xs">
          <span class="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block whitespace-nowrap">Tổng Nhân Sự</span>
          <div class="text-base font-bold font-mono text-foreground mt-1" id="d-staff">46 người</div>
          <span class="text-[10px] text-muted-foreground font-medium block mt-1" id="d-ontime">Đúng giờ: 100%</span>
        </div>
      </div>

      <!-- Shift Live Roster -->
      <div>
        <div class="flex items-center justify-between mb-3">
          <h3 class="text-xs font-bold text-foreground uppercase tracking-wider">Barista Đang Làm Ca Hiện Tại</h3>
          <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/25 px-2.5 py-0.5 rounded-full">Đủ 3 người</span>
        </div>

        <div class="space-y-2.5">
          <div class="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-background/80 shadow-2xs">
            <div class="flex items-center gap-3">
              <div class="size-8 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs ring-1 ring-blue-500/25 shrink-0">QT</div>
              <div>
                <div class="text-xs font-semibold text-foreground">Trương Quốc Thái</div>
                <div class="text-[10px] text-muted-foreground mt-0.5">Pha chế chính (Barista) • Check-in: 05:55</div>
              </div>
            </div>
            <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap">Đúng ca</span>
          </div>

          <div class="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-background/80 shadow-2xs">
            <div class="flex items-center gap-3">
              <div class="size-8 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center font-bold text-xs ring-1 ring-blue-500/25 shrink-0">KN</div>
              <div>
                <div class="text-xs font-semibold text-foreground">Lê Thị Kim Ngân</div>
                <div class="text-[10px] text-muted-foreground mt-0.5">Thu ngân / Order • Check-in: 06:01</div>
              </div>
            </div>
            <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap">Đúng ca</span>
          </div>

          <div class="flex items-center justify-between p-2.5 rounded-xl border border-border/80 bg-background/80 shadow-2xs">
            <div class="flex items-center gap-3">
              <div class="size-8 rounded-full bg-purple-500/15 text-purple-400 flex items-center justify-center font-bold text-xs ring-1 ring-purple-500/25 shrink-0">VD</div>
              <div>
                <div class="text-xs font-semibold text-foreground">Nguyễn Văn Đạt</div>
                <div class="text-[10px] text-muted-foreground mt-0.5">Phụ ca / Rửa dụng cụ • Check-in: 06:00</div>
              </div>
            </div>
            <span class="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 border border-emerald-500/25 px-2.5 py-1 rounded-md shrink-0 whitespace-nowrap">Đúng ca</span>
          </div>
        </div>
      </div>

      <!-- AI Assistant Recommendation -->
      <div class="p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5">
        <div class="flex items-center gap-2 text-indigo-400 text-xs font-bold mb-1.5">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
          <span>Trợ lý ca Guta AI</span>
        </div>
        <p class="text-[11px] text-foreground/80 leading-relaxed">
          Dự báo lượng khách giờ trưa (11:30 - 13:00) tại chi nhánh này tăng 35% do khu vực văn phòng. Khuyến nghị điều chuyển thêm 1 Barista Part-time hỗ trợ order máy cà phê.
        </p>
      </div>

    </div>

    <!-- Drawer Footer Actions (shrink-0) -->
    <div class="p-4 border-t border-border bg-slate-900/95 flex items-center gap-2.5 shrink-0 z-10">
      <button type="button" class="flex-1 py-2.5 px-3 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-xs transition shadow-sm text-center cursor-pointer">
        Gửi Cảnh Báo Telegram
      </button>
      <button type="button" aria-label="Đóng" data-close-drawer class="py-2.5 px-4 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition cursor-pointer">
        Đóng
      </button>
    </div>
  </aside>
`;

const SPINNER_SVG = `<svg class="animate-spin inline-block mr-1.5 size-3.5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

export const CrmDashboardView: React.FC<CrmDashboardViewProps> = ({
  userName,
  userRole,
  userScope,
  onLogout,
  onTelegramAlert,
  onOpenAiCopilot,
  onSwitchTab,
  onNotify,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTelegramAlertRef = useRef(onTelegramAlert);
  onTelegramAlertRef.current = onTelegramAlert;
  const onOpenAiCopilotRef = useRef(onOpenAiCopilot);
  onOpenAiCopilotRef.current = onOpenAiCopilot;
  const onSwitchTabRef = useRef(onSwitchTab);
  onSwitchTabRef.current = onSwitchTab;
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // 1. Update user profile display
    const title = root.querySelector('main h1');
    if (title) title.textContent = 'Guta Workspace — Quản lý nhân sự & 45 chi nhánh';
    const subtitle = root.querySelector('main h1 + p');
    if (subtitle) subtitle.textContent = 'Hồ sơ nhân sự • Điều phối ca trực • Quỹ két ca • Trợ lý AI Copilot';
    const userInitials = root.querySelector('.size-8.rounded-full.bg-gradient-to-tr');
    if (userInitials) {
      userInitials.textContent = userRole === 'SM' ? 'PA' : userRole === 'AOM' ? 'TT' : 'AD';
    }

    const userNameEl = root.querySelector('.font-bold.text-foreground.text-xs');
    if (userNameEl) {
      userNameEl.textContent = userName;
    }

    const userScopeEl = root.querySelector('.text-\\[10px\\].text-muted-foreground.truncate');
    if (userScopeEl) {
      userScopeEl.textContent = userRole + ' • ' + userScope;
    }

    // 2. Slide-Over Drawer
    const drawer = root.querySelector('#detail-drawer') as HTMLElement | null;
    drawer?.setAttribute('aria-label', 'Chi tiết minh họa');
    const backdrop = root.querySelector('#drawer-backdrop') as HTMLElement | null;
    const telegramTimers: ReturnType<typeof setTimeout>[] = [];

    let currentStoreId = 'GT-CH-01';

    const openDrawer = (
      id: string,
      name: string,
      sm: string,
      district: string,
      staff: number | string,
      _shift: string,
      rev: string,
      onTime: string
    ) => {
      currentStoreId = id;
      const dId = root.querySelector('#d-id');
      const dName = root.querySelector('#d-name');
      const dDistrict = root.querySelector('#d-district');
      const dRev = root.querySelector('#d-rev');
      const dStaff = root.querySelector('#d-staff');
      const dOnTime = root.querySelector('#d-ontime');

      if (dId) dId.textContent = id;
      if (dName) dName.textContent = name;
      if (dDistrict) dDistrict.textContent = 'Quận: ' + district + ' • Cửa hàng trưởng: ' + sm;
      if (dRev) dRev.textContent = rev;
      if (dStaff) dStaff.textContent = staff + ' người';
      if (dOnTime) dOnTime.textContent = 'Đúng giờ: ' + onTime;

      drawer?.classList.remove('translate-x-full');
      drawer?.classList.add('drawer-open');
      backdrop?.classList.add('backdrop-open');
    };

    const closeDrawer = () => {
      drawer?.classList.add('translate-x-full');
      drawer?.classList.remove('drawer-open');
      backdrop?.classList.remove('backdrop-open');
    };

    const drawerWindow = window as Window & {
      openDrawer?: typeof openDrawer;
      closeDrawer?: typeof closeDrawer;
    };
    const previousOpenDrawer = drawerWindow.openDrawer;
    const previousCloseDrawer = drawerWindow.closeDrawer;
    drawerWindow.openDrawer = openDrawer;
    drawerWindow.closeDrawer = closeDrawer;
    const listeners = new AbortController();

    // Bind table row clicks
    const rows = root.querySelectorAll('tbody tr');
    root.querySelectorAll('[onclick], [data-close-drawer]').forEach((element) => {
      element.setAttribute('data-close-drawer', '');
      element.addEventListener('click', closeDrawer, { signal: listeners.signal });
      if (element.tagName === 'BUTTON' && !element.textContent?.trim()) {
        element.setAttribute('aria-label', 'Đóng chi tiết');
      }
      element.removeAttribute('onclick');
    });

    const dataRows = Array.from(rows).filter((row) => row.querySelectorAll('td').length >= 8);
    dataRows.forEach((row) => {
      row.addEventListener('click', () => {
        const cells = row.querySelectorAll('td');
        const id = row.getAttribute('data-id') || cells[0].textContent?.trim() || '';
        const name = row.getAttribute('data-name') || cells[1].textContent?.trim() || '';
        const sm = row.getAttribute('data-sm') || cells[2].textContent?.trim() || '';
        const district = row.getAttribute('data-district') || cells[3].textContent?.trim() || '';
        const staff = row.getAttribute('data-staff') || cells[4].textContent?.trim() || '40';
        const shift = row.getAttribute('data-shift') || cells[5].textContent?.trim() || 'Ca 1';
        const rev = row.getAttribute('data-rev') || cells[6].textContent?.trim() || '8.000.000 ₫';
        const onTime = row.getAttribute('data-ontime') || cells[7].textContent?.trim() || '100%';
        openDrawer(id, name, sm, district, staff, shift, rev, onTime);
      }, { signal: listeners.signal });
    });

    backdrop?.addEventListener('click', closeDrawer);
    root.querySelectorAll('button').forEach((btn) => {
      if (btn.textContent?.trim() === 'Đóng') {
        (btn as HTMLButtonElement).onclick = closeDrawer;
      } else if (btn.textContent?.includes('Telegram')) {
        (btn as HTMLButtonElement).onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const telegramButton = btn as HTMLButtonElement;
          if (telegramButton.disabled) return;
          const originalText = telegramButton.innerHTML;
          telegramButton.innerHTML = `${SPINNER_SVG} Đang gửi...`;
          telegramButton.disabled = true;
          onTelegramAlertRef.current(currentStoreId);
          telegramTimers.push(setTimeout(() => {
            telegramButton.innerHTML = originalText;
            telegramButton.disabled = false;
          }, 800));
        };
      }
    });

    // 3. Search Filter, District Filter & Trigger Buttons
    const searchInputs = root.querySelectorAll('input[type="text"], input[type="search"]');
    const tableBody = root.querySelector('tbody');

    // Anti-slop Illustrated Empty State
    const emptyRow = document.createElement('tr');
    emptyRow.className = 'empty-state-row';
    emptyRow.innerHTML = `
      <td colspan="8" class="text-center py-10 px-4">
        <div class="flex flex-col items-center justify-center max-w-sm mx-auto space-y-3">
          <div class="size-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground shadow-2xs">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" class="opacity-70"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/><path d="M8 11h6"/></svg>
          </div>
          <div class="space-y-1">
            <p class="text-sm font-semibold text-foreground">Không tìm thấy chi nhánh nào phù hợp với từ khóa tìm kiếm.</p>
            <p class="text-xs text-muted-foreground">Vui lòng kiểm tra lại tên đường, mã chi nhánh hoặc xóa bộ lọc.</p>
          </div>
          <button type="button" class="reset-filter-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition active:scale-95 cursor-pointer">
            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
            <span>Đặt lại bộ lọc</span>
          </button>
        </div>
      </td>
    `;
    emptyRow.hidden = true;
    tableBody?.append(emptyRow);

    // Skeleton loader rows for smooth simulated fetch / filter transitions
    const skeletonRows: HTMLTableRowElement[] = [];
    for (let i = 0; i < 3; i++) {
      const skRow = document.createElement('tr');
      skRow.className = 'skeleton-preview-row';
      skRow.hidden = true;
      skRow.innerHTML = `
        <td class="p-3"><div class="skeleton h-4 w-16"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-44"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-28"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-20"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-12"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-16"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-20"></div></td>
        <td class="p-3"><div class="skeleton h-4 w-14"></div></td>
      `;
      tableBody?.append(skRow);
      skeletonRows.push(skRow);
    }

    const showSkeletonTransition = (callback: () => void) => {
      dataRows.forEach((r) => ((r as HTMLElement).style.display = 'none'));
      skeletonRows.forEach((sr) => (sr.hidden = false));
      telegramTimers.push(setTimeout(() => {
        skeletonRows.forEach((sr) => (sr.hidden = true));
        callback();
      }, 120));
    };

    let activeShift = '';
    let activeDistrict = '';

    const handleFilter = (query: string) => {
      const q = query.toLowerCase().trim();
      let visibleCount = 0;
      dataRows.forEach((row) => {
        const text = row.textContent?.toLowerCase() || '';
        const cells = row.querySelectorAll('td');
        const districtCell = cells[3]?.textContent?.toLowerCase() || '';
        const matchesDistrict = !activeDistrict || districtCell.includes(activeDistrict.toLowerCase());
        const matchesQuery = !q || text.includes(q);
        const matchesShift = !activeShift || text.includes(activeShift.toLowerCase());
        const visible = matchesQuery && matchesShift && matchesDistrict;
        (row as HTMLElement).style.display = visible ? '' : 'none';
        if (visible) visibleCount++;
      });
      emptyRow.hidden = visibleCount > 0;
    };

    const resetFilterBtn = emptyRow.querySelector('.reset-filter-btn');
    resetFilterBtn?.addEventListener('click', () => {
      searchInputs.forEach((input) => {
        (input as HTMLInputElement).value = '';
      });
      activeShift = '';
      activeDistrict = '';
      if (districtBtnSpan) districtBtnSpan.textContent = 'Bộ lọc Quận';
      handleFilter('');
    }, { signal: listeners.signal });

    searchInputs.forEach((input) => {
      input.addEventListener('input', (e) => {
        handleFilter((e.target as HTMLInputElement).value);
      }, { signal: listeners.signal });
    });

    // District Filter Cycle Button with responsive active state
    const districtBtn = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Bộ lọc Quận'));
    const districtBtnSpan = districtBtn?.querySelector('span');
    const districtList = ['Tất cả quận', 'Quận 1', 'Quận 3', 'Quận 10', 'Tân Bình', 'Gò Vấp', 'Bình Thạnh'];
    let districtIdx = 0;

    if (districtBtn) {
      districtBtn.classList.add('active:scale-95', 'transition-transform');
      districtBtn.addEventListener('click', (e) => {
        e.preventDefault();
        districtIdx = (districtIdx + 1) % districtList.length;
        const selected = districtList[districtIdx];
        activeDistrict = selected === 'Tất cả quận' ? '' : selected;
        if (districtBtnSpan) {
          districtBtnSpan.textContent = activeDistrict ? `Quận: ${activeDistrict}` : 'Bộ lọc Quận';
        }
        showSkeletonTransition(() => {
          handleFilter(Array.from(searchInputs).map((input) => (input as HTMLInputElement).value).find(Boolean) || '');
        });
      }, { signal: listeners.signal });
    }

    // Trigger button: Tạo Ca Đột Xuất with disable state + spinner
    const emergencyBtn = Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.includes('Tạo Ca Đột Xuất'));
    if (emergencyBtn) {
      emergencyBtn.classList.add('active:scale-95', 'transition-transform');
      emergencyBtn.addEventListener('click', (e) => {
        e.preventDefault();
        if (emergencyBtn.disabled) return;
        const originalContent = emergencyBtn.innerHTML;
        emergencyBtn.innerHTML = `${SPINNER_SVG} Đang khởi tạo...`;
        emergencyBtn.disabled = true;
        onTelegramAlertRef.current('GT-EMERGENCY-SHIFT');
        telegramTimers.push(setTimeout(() => {
          emergencyBtn.innerHTML = originalContent;
          emergencyBtn.disabled = false;
        }, 800));
      }, { signal: listeners.signal });
    }

    const shiftFilters = Array.from(root.querySelectorAll('button')).filter((button) => /^(Tất cả|Ca [123])$/.test(button.textContent?.trim() || ''));
    const handleShiftFilter = (e: Event) => {
      const button = e.currentTarget as HTMLButtonElement;
      activeShift = button.textContent?.trim() === 'Tất cả' ? '' : button.textContent?.trim() || '';
      showSkeletonTransition(() => {
        handleFilter(Array.from(searchInputs).map((input) => (input as HTMLInputElement).value).find(Boolean) || '');
      });
    };
    shiftFilters.forEach((button) => button.addEventListener('click', handleShiftFilter));
    root.querySelectorAll('[role="tab"]:not(button), [data-shift-filter]').forEach((control) => {
      if (/^(Tất cả|Ca [123])$/.test(control.textContent?.trim() || '')) {
        control.addEventListener('click', handleShiftFilter);
        shiftFilters.push(control as HTMLButtonElement);
      }
    });

    // 4. Logout bindings
    const logoutLinks = root.querySelectorAll('a[href="#logout"], a[title="Trở về Trang Chủ"], [aria-label="Đăng Xuất Phiên"]');
    logoutLinks.forEach((link, idx) => {
      if (idx === logoutLinks.length - 1) {
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', 'Đăng Xuất Phiên');
      }
      link.addEventListener('click', (e) => {
        e.preventDefault();
        onLogoutRef.current();
      }, { signal: listeners.signal });
    });

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawer?.classList.contains('drawer-open')) closeDrawer();
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        const searchInput = root.querySelector('input[type="text"], input[type="search"]') as HTMLInputElement | null;
        searchInput?.focus();
        searchInput?.select();
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);

    // 5. AI Copilot trigger
    root.querySelectorAll('nav a').forEach((link) => {
      if (link.textContent?.includes('Copilot')) {
        link.addEventListener('click', (e) => {
          e.preventDefault();
          if (onSwitchTabRef.current) onSwitchTabRef.current('chat');
          else onOpenAiCopilotRef.current?.();
        }, { signal: listeners.signal });
      }
    });

    // 6. Coming Soon & Dead links interceptor (Phân hệ chưa kích hoạt / demo containment)
    const showSyncNotice = (message: string) => {
      if (onNotifyRef.current) {
        onNotifyRef.current(
          message,
          'info',
          'Lộ trình phát triển'
        );
      } else {
        const existing = document.getElementById('zkteco-sync-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'zkteco-sync-toast';
        toast.setAttribute('role', 'status');
        toast.className = 'fixed bottom-6 right-6 z-50 bg-slate-900/95 border border-blue-500/40 text-slate-100 px-4 py-3 rounded-xl shadow-2xl text-xs flex items-center gap-2.5 backdrop-blur';
        toast.innerHTML = `<span class="size-2 rounded-full bg-blue-500 animate-ping inline-block"></span><span class="font-medium">${message}</span>`;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      }
    };

    const comingSoonLinks = root.querySelectorAll('a[data-entrypoint="coming-soon"]');
    comingSoonLinks.forEach((link) => {
      link.addEventListener('click', (e) => {
        e.preventDefault();
        const label = link.querySelector('span')?.textContent?.trim() || 'Phân hệ';
        showSyncNotice(`Tính năng đang trong chu kỳ đồng bộ dữ liệu ZKTeco (${label} — Coming Soon)`);
      }, { signal: listeners.signal });
    });

    const deadLinks = root.querySelectorAll('a[href="#"], a[href=""]');
    deadLinks.forEach((link) => {
      if (link.textContent?.includes('Copilot')) return;
      if (link.getAttribute('href') === '#logout' || link.getAttribute('title')?.includes('Trang Chủ')) return;
      if (link.hasAttribute('data-entrypoint')) return;
      link.addEventListener('click', (e) => {
        e.preventDefault();
        showSyncNotice('Tính năng đang trong chu kỳ đồng bộ dữ liệu thời gian thực.');
      }, { signal: listeners.signal });
    });

    return () => {
      listeners.abort();
      emptyRow.remove();
      skeletonRows.forEach((sr) => sr.remove());
      root.querySelectorAll('button').forEach((button) => { button.onclick = null; });
      if (drawerWindow.openDrawer === openDrawer) {
        if (previousOpenDrawer) drawerWindow.openDrawer = previousOpenDrawer;
        else delete drawerWindow.openDrawer;
      }
      if (drawerWindow.closeDrawer === closeDrawer) {
        if (previousCloseDrawer) drawerWindow.closeDrawer = previousCloseDrawer;
        else delete drawerWindow.closeDrawer;
      }
      backdrop?.removeEventListener('click', closeDrawer);
      window.removeEventListener('keydown', handleGlobalKeydown);
      shiftFilters.forEach((button) => button.removeEventListener('click', handleShiftFilter));
      telegramTimers.forEach(clearTimeout);
    };
  }, [userName, userRole, userScope]);

  return (
    <div
      ref={containerRef}
      className="min-h-full flex flex-col bg-background text-foreground antialiased"
      dangerouslySetInnerHTML={{ __html: CRM_HTML }}
    />
  );
};

import React, { useEffect, useRef } from 'react';
import type { NotifyFn } from './Toast';

export interface CrmDashboardViewProps {
  userName: string;
  userRole: string;
  userScope: string;
  onLogout: () => void;
  onTelegramAlert: (storeId: string) => void;
  onOpenAiCopilot?: () => void;
  onNotify?: NotifyFn;
}

const CRM_HTML = "\n  <div data-slot=\"sidebar-wrapper\" style=\"--sidebar-width:16.5rem;--sidebar-width-icon:3.5rem\" class=\"group/sidebar-wrapper flex min-h-svh w-full h-svh overflow-hidden\">\n    \n    <!-- SIDEBAR -->\n    <aside class=\"w-64 border-r border-border bg-sidebar flex flex-col justify-between shrink-0 select-none\">\n      <div class=\"flex flex-col\">\n        <!-- Brand Header -->\n        <div class=\"p-4 border-b border-border/80 flex items-center justify-between\">\n          <div class=\"flex items-center gap-2.5\">\n            <div class=\"flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-zinc-900 to-zinc-800 dark:from-zinc-100 dark:to-zinc-200 dark:text-zinc-900 text-white font-black text-sm shadow-sm\">G</div>\n            <div class=\"flex flex-col\">\n              <div class=\"flex items-center gap-1.5 leading-none\">\n                <span class=\"font-black tracking-wider text-foreground text-sm\">GUTA</span>\n                <span class=\"font-semibold tracking-tight text-foreground text-sm\">WORKSPACE</span>\n              </div>\n              <span class=\"text-[10px] text-muted-foreground mt-0.5 font-medium\">Chuỗi Cà Phê • 45 Cửa Hàng</span>\n            </div>\n          </div>\n          <a href=\"#logout\" title=\"Trở về Trang Chủ\" class=\"text-xs text-muted-foreground hover:text-foreground p-1 rounded hover:bg-muted transition\">\n            <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><polyline points=\"16 17 21 12 16 7\"/><line x1=\"21\" y1=\"12\" x2=\"9\" y2=\"12\"/></svg>\n          </a>\n        </div>\n\n        <!-- Search Bar Trigger -->\n        <div class=\"px-3 pt-3\">\n          <div class=\"flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border/80 bg-background/60 text-xs text-muted-foreground shadow-xs cursor-pointer hover:border-blue-500/50 transition\">\n            <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"11\" cy=\"11\" r=\"8\"/><path d=\"m21 21-4.3-4.3\"/></svg>\n            <input type=\"text\" placeholder=\"Lọc theo tên, quận, mã...\" class=\"flex-1 bg-transparent border-0 outline-none text-xs text-foreground placeholder:text-muted-foreground w-full\" />\n            <kbd class=\"rounded bg-muted px-1.5 py-0.5 text-[10px] font-mono border border-border\">⌘K</kbd>\n          </div>\n        </div>\n\n        <!-- Navigation Menu -->\n        <nav class=\"px-2 py-3 space-y-1\">\n          <div class=\"px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase\">Hệ Thống Vận Hành</div>\n          \n          <a href=\"#\" class=\"flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-semibold bg-primary/10 text-primary border border-primary/20\">\n            <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z\"/><polyline points=\"9 22 9 12 15 12 15 22\"/></svg>\n            <span>Cửa hàng / Chi nhánh</span>\n            <span class=\"ml-auto rounded-full bg-primary/20 px-1.5 py-0.2 text-[10px] font-bold text-primary\">45</span>\n          </a>\n\n          <a href=\"#\" data-entrypoint=\"coming-soon\" class=\"flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-muted-foreground/75 opacity-70 cursor-not-allowed select-none transition\">\n            <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2\"/><circle cx=\"9\" cy=\"7\" r=\"4\"/><path d=\"M22 21v-2a4 4 0 0 0-3-3.87\"/><path d=\"M16 3.13a4 4 0 0 1 0 7.75\"/></svg>\n            <span>Đội ngũ Barista & SM</span>\n            <span class=\"ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded\">Coming Soon</span>\n          </a>\n\n          <a href=\"#\" data-entrypoint=\"coming-soon\" class=\"flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-muted-foreground/75 opacity-70 cursor-not-allowed select-none transition\">\n            <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><rect width=\"18\" height=\"18\" x=\"3\" y=\"4\" rx=\"2\" ry=\"2\"/><line x1=\"16\" x2=\"16\" y1=\"2\" y2=\"6\"/><line x1=\"8\" x2=\"8\" y1=\"2\" y2=\"6\"/><line x1=\"3\" x2=\"21\" y1=\"10\" y2=\"10\"/></svg>\n            <span>Lịch Phân Ca 24H</span>\n            <span class=\"ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded\">Coming Soon</span>\n          </a>\n\n          <a href=\"#\" data-entrypoint=\"coming-soon\" class=\"flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-muted-foreground/75 opacity-70 cursor-not-allowed select-none transition\">\n            <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M22 11.08V12a10 10 0 1 1-5.93-9.14\"/><polyline points=\"22 4 12 14.01 9 11.01\"/></svg>\n            <span>Chấm công & Đi trễ</span>\n            <span class=\"ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded\">Coming Soon</span>\n          </a>\n\n          <a href=\"#\" data-entrypoint=\"coming-soon\" class=\"flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-muted-foreground/75 opacity-70 cursor-not-allowed select-none transition\">\n            <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"16\" height=\"16\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><circle cx=\"12\" cy=\"12\" r=\"10\"/><path d=\"M12 6v6l4 2\"/></svg>\n            <span>Báo cáo Két ca</span>\n            <span class=\"ml-auto text-[9px] font-mono text-muted-foreground/80 bg-muted/80 border border-border/50 px-1.5 py-0.5 rounded\">Coming Soon</span>\n          </a>\n\n          <div class=\"pt-4 px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase\">AI Intelligence</div>\n\n          <a href=\"#\" class=\"flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition\">\n            <div class=\"size-4 rounded bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-[10px] text-white\">✨</div>\n            <span>Guta Copilot AI</span>\n            <span class=\"ml-auto text-[10px] bg-indigo-500/10 text-indigo-500 px-1.5 py-0.5 rounded font-mono\">Chat</span>\n          </a>\n        </nav>\n      </div>\n\n      <!-- User Profile at bottom -->\n      <div class=\"p-3 border-t border-border bg-sidebar/50\">\n        <div class=\"flex items-center gap-3 p-2 rounded-xl border border-border/60 bg-background/80 shadow-xs\">\n          <div class=\"size-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center font-bold text-xs ring-1 ring-border\">PA</div>\n          <div class=\"flex-1 min-w-0\">\n            <div class=\"text-xs font-semibold text-foreground truncate\">Nguyễn Thị Phương Anh</div>\n            <div class=\"text-[10px] text-muted-foreground truncate\">Cửa hàng trưởng (SM)</div>\n          </div>\n          <a href=\"#logout\" role=\"button\" aria-label=\"Đăng Xuất Phiên\" title=\"Đăng Xuất Phiên\" class=\"text-muted-foreground hover:text-destructive p-1 transition\">\n            <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4\"/><polyline points=\"16 17 21 12 16 7\"/><line x1=\"21\" y1=\"12\" x2=\"9\" y2=\"12\"/></svg>\n          </a>\n        </div>\n      </div>\n    </aside>\n\n    <!-- MAIN CONTENT INSET -->\n    <div class=\"flex flex-col flex-1 h-svh overflow-hidden bg-background\">\n      \n      <!-- TOP BAR -->\n      <header class=\"h-14 border-b border-border px-6 flex items-center justify-between shrink-0 bg-background\">\n        <div class=\"flex items-center gap-3\">\n          <div class=\"flex items-center gap-1.5 text-xs text-muted-foreground font-medium\">\n            <span>Guta Workspace</span>\n            <span class=\"text-border\">/</span>\n            <span class=\"text-foreground font-semibold\">Vận Hành Chi Nhánh & Phân Ca</span>\n          </div>\n          <span class=\"rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 px-2 py-0.5 text-[11px] font-semibold flex items-center gap-1.5\">\n            <span class=\"size-1.5 rounded-full bg-emerald-500 animate-pulse\"></span>\n            45/45 Chi nhánh mở ca sáng\n          </span>\n        </div>\n\n        <div class=\"flex items-center gap-3\">\n          <div class=\"flex items-center gap-2\">\n            <button class=\"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-xs font-medium text-foreground hover:bg-muted transition shadow-2xs\">\n              <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><polygon points=\"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3\"/></svg>\n              <span>Bộ lọc Quận</span>\n            </button>\n            <button class=\"inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white text-xs font-semibold transition shadow-sm\">\n              <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"13\" height=\"13\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M5 12h14\"/><path d=\"M12 5v14\"/></svg>\n              <span>Tạo Ca Đột Xuất</span>\n            </button>\n          </div>\n        </div>\n      </header>\n\n      <!-- DATA TABLE AREA -->\n      <main class=\"flex-1 overflow-auto p-6\">\n        <div class=\"mb-4 flex items-center justify-between\">\n          <div>\n            <h1 class=\"text-xl font-bold tracking-tight text-foreground\">Chi Nhánh Cà Phê Guta (Khu Vực TP.HCM)</h1>\n            <p class=\"text-xs text-muted-foreground mt-0.5\">Dữ liệu nhân sự, ca làm việc hiện tại và doanh thu két thời gian thực. Bấm vào từng hàng để mở Slide-Over Drawer.</p>\n          </div>\n          <div class=\"text-xs font-medium text-muted-foreground\">\n            Hiển thị 10 / 45 Cửa hàng\n          </div>\n        </div>\n\n        <!-- TABLE -->\n        <div class=\"rounded-xl border border-border bg-card shadow-xs overflow-hidden\">\n          <table class=\"w-full text-left text-xs border-collapse\">\n            <thead>\n              <tr class=\"border-b border-border bg-muted/40 font-semibold text-muted-foreground\">\n                <th class=\"py-3 px-4\">Mã CH</th>\n                <th class=\"py-3 px-4\">Tên Cửa Hàng / Chi Nhánh</th>\n                <th class=\"py-3 px-4\">Cửa Hàng Trưởng (SM)</th>\n                <th class=\"py-3 px-4\">Quận</th>\n                <th class=\"py-3 px-4 text-center\">Số Barista</th>\n                <th class=\"py-3 px-4\">Ca Hiện Tại</th>\n                <th class=\"py-3 px-4 text-right\">Doanh Thu Két</th>\n                <th class=\"py-3 px-4 text-center\">Đúng Giờ</th>\n                <th class=\"py-3 px-4 text-center\">Trạng Thái</th>\n              </tr>\n            </thead>\n            <tbody class=\"divide-y divide-border font-medium\">\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-01', 'GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm', 'Nguyễn Thị Phương Anh', 'Tân Bình', 46, 'Ca 1 (06:00 - 14:00)', '8.420.000 ₫', '100%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-01</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Nguyễn Thị Phương Anh</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Tân Bình</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">46</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">8.420.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">100%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-02', 'GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh', 'Đỗ Quỳnh Anh', 'Quận 10', 56, 'Ca 1 (06:00 - 14:00)', '12.150.000 ₫', '98%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-02</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Đỗ Quỳnh Anh</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Quận 10</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">56</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">12.150.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">98%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-03', 'GUTA CAFE - Bình Thạnh - 18 Nguyễn Cửu Vân', 'Nguyễn Lê Quang Trường', 'Bình Thạnh', 47, 'Ca 1 (06:00 - 14:00)', '7.890.000 ₫', '95%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-03</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Bình Thạnh - 18 Nguyễn Cửu Vân</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Nguyễn Lê Quang Trường</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Bình Thạnh</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">47</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">7.890.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">95%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-04', 'GUTA CAFE - Quận 3 - 100 Nguyễn Thị Minh Khai', 'Nguyễn Thị Thu Trúc', 'Quận 3', 45, 'Ca 1 (06:00 - 14:00)', '9.340.000 ₫', '100%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-04</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Quận 3 - 100 Nguyễn Thị Minh Khai</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Nguyễn Thị Thu Trúc</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Quận 3</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">45</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">9.340.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">100%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-05', 'GUTA CAFE - Quận 3 - 41 Trần Cao Vân', 'Triệu Quang Nhân', 'Quận 3', 45, 'Ca 1 (06:00 - 14:00)', '8.120.000 ₫', '96%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-05</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Quận 3 - 41 Trần Cao Vân</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Triệu Quang Nhân</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Quận 3</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">45</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">8.120.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">96%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-06', 'GUTA CAFE - Quận 1 - 146 Nguyễn Văn Thủ', 'Trương Quốc Thái', 'Quận 1', 43, 'Ca 1 (06:00 - 14:00)', '6.950.000 ₫', '94%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-06</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Quận 1 - 146 Nguyễn Văn Thủ</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Trương Quốc Thái</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Quận 1</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">43</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">6.950.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">94%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-07', 'GUTA CAFE - Gò Vấp - 1B Nguyễn Kiệm', 'Thái Thanh Lam', 'Gò Vấp', 42, 'Ca 1 (06:00 - 14:00)', '7.200.000 ₫', '97%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-07</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Gò Vấp - 1B Nguyễn Kiệm</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Thái Thanh Lam</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Gò Vấp</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">42</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">7.200.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">97%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-08', 'GUTA CAFE - Gò Vấp - 30 Phạm Văn Đồng', 'Lại Ngọc Hoàng Nguyên', 'Gò Vấp', 42, 'Ca 1 (06:00 - 14:00)', '7.600.000 ₫', '99%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-08</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Gò Vấp - 30 Phạm Văn Đồng</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Lại Ngọc Hoàng Nguyên</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Gò Vấp</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">42</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">7.600.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">99%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-09', 'GUTA CAFE - Bình Thạnh - 193F Điện Biên Phủ', 'Nguyễn Cao Thanh Hằng', 'Bình Thạnh', 39, 'Ca 1 (06:00 - 14:00)', '6.450.000 ₫', '95%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-09</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Bình Thạnh - 193F Điện Biên Phủ</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Nguyễn Cao Thanh Hằng</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Bình Thạnh</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">39</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">6.450.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">95%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n              <tr class=\"table-row-hover\" onclick=\"openDrawer('GT-CH-10', 'GUTA CAFE - Quận 3 - 206 Pasteur', 'Lê Ngọc Bảo Trân', 'Quận 3', 38, 'Ca 1 (06:00 - 14:00)', '8.870.000 ₫', '100%')\">\n                <td class=\"py-3 px-4 font-mono text-[11px] text-muted-foreground\">GT-CH-10</td>\n                <td class=\"py-3 px-4 font-semibold text-foreground flex items-center gap-2\">\n                  <div class=\"size-6 rounded bg-slate-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-[10px]\">☕</div>\n                  <span>GUTA CAFE - Quận 3 - 206 Pasteur</span>\n                </td>\n                <td class=\"py-3 px-4 text-foreground/90\">Lê Ngọc Bảo Trân</td>\n                <td class=\"py-3 px-4\">\n                  <span class=\"rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground\">Quận 3</span>\n                </td>\n                <td class=\"py-3 px-4 text-center font-semibold text-foreground\">38</td>\n                <td class=\"py-3 px-4 text-foreground/80 font-mono text-[11px]\">Ca 1 (06:00 - 14:00)</td>\n                <td class=\"py-3 px-4 text-right font-mono font-semibold text-foreground\">8.870.000 ₫</td>\n                <td class=\"py-3 px-4 text-center font-mono text-emerald-600 dark:text-emerald-400\">100%</td>\n                <td class=\"py-3 px-4 text-center\">\n                  <span class=\"inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400\">\n                    <span class=\"size-1 rounded-full bg-emerald-500\"></span>\n                    Đang mở ca\n                  </span>\n                </td>\n              </tr>\n              \n            </tbody>\n          </table>\n        </div>\n      </main>\n\n    </div>\n  </div>\n\n  <!-- SLIDE-OVER DETAIL DRAWER -->\n  <div id=\"drawer-backdrop\" class=\"fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity duration-300 opacity-0 pointer-events-none\" onclick=\"closeDrawer()\"></div>\n  <aside id=\"detail-drawer\" class=\"fixed inset-y-0 right-0 z-50 w-full max-w-md bg-card border-l border-border shadow-2xl flex flex-col justify-between transform translate-x-full transition-transform duration-300 ease-in-out\">\n    <div>\n      <!-- Drawer Header -->\n      <div class=\"p-6 border-b border-border flex items-start justify-between bg-muted/20\">\n        <div>\n          <span class=\"rounded bg-blue-500/10 text-foreground px-2 py-0.5 text-[10px] font-bold font-mono uppercase\" id=\"d-id\">GT-CH-01</span>\n          <h2 class=\"text-base font-bold text-foreground mt-1.5\" id=\"d-name\">GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm</h2>\n          <p class=\"text-xs text-muted-foreground mt-0.5\" id=\"d-district\">Quận: Tân Bình • Cửa hàng trưởng: Nguyễn Thị Phương Anh</p>\n        </div>\n        <button type=\"button\" onclick=\"closeDrawer()\" class=\"size-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition\">\n          <svg xmlns=\"http://www.w3.org/2000/svg\" width=\"18\" height=\"18\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\"><path d=\"M18 6 6 18\"/><path d=\"m6 6 12 12\"/></svg>\n        </button>\n      </div>\n\n      <!-- Drawer Body -->\n      <div class=\"p-6 space-y-6 overflow-y-auto max-h-[calc(100vh-210px)]\">\n        <p class=\"mb-4 text-xs text-muted-foreground\" role=\"note\">Nội dung minh họa — không phải dữ liệu nhân sự hay vận hành thật.</p>\n        <!-- Metrics Grid -->\n        <div class=\"grid grid-cols-2 gap-3\">\n          <div class=\"p-3.5 rounded-xl border border-border bg-background\">\n            <span class=\"text-[10px] font-medium text-muted-foreground uppercase\">Doanh Thu Két Hiện Tại</span>\n            <div class=\"text-base font-bold font-mono text-blue-600 dark:text-blue-400 mt-0.5\" id=\"d-rev\">8.420.000 ₫</div>\n            <span class=\"text-[10px] text-emerald-500 font-medium\">↑ +14% so với ca hôm qua</span>\n          </div>\n          <div class=\"p-3.5 rounded-xl border border-border bg-background\">\n            <span class=\"text-[10px] font-medium text-muted-foreground uppercase\">Tổng Nhân Sự Barista</span>\n            <div class=\"text-base font-bold font-mono text-foreground mt-0.5\" id=\"d-staff\">46 người</div>\n            <span class=\"text-[10px] text-muted-foreground font-medium\" id=\"d-ontime\">Đúng giờ: 100%</span>\n          </div>\n        </div>\n\n        <!-- Shift Live Roster -->\n        <div>\n          <div class=\"flex items-center justify-between mb-3\">\n            <h3 class=\"text-xs font-bold text-foreground uppercase tracking-wider\">Barista Đang Làm Ca Hiện Tại</h3>\n            <span class=\"text-[10px] font-semibold text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-full\">Đủ 3 người</span>\n          </div>\n\n          <div class=\"space-y-2\">\n            <div class=\"flex items-center justify-between p-2.5 rounded-lg border border-border bg-background\">\n              <div class=\"flex items-center gap-2.5\">\n                <div class=\"size-7 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center font-bold text-xs\">QT</div>\n                <div>\n                  <div class=\"text-xs font-semibold text-foreground\">Trương Quốc Thái</div>\n                  <div class=\"text-[10px] text-muted-foreground\">Pha chế chính (Barista) • Check-in: 05:55</div>\n                </div>\n              </div>\n              <span class=\"text-[10px] font-semibold text-emerald-600 bg-emerald-500/15 px-2 py-0.5 rounded\">Đúng ca</span>\n            </div>\n\n            <div class=\"flex items-center justify-between p-2.5 rounded-lg border border-border bg-background\">\n              <div class=\"flex items-center gap-2.5\">\n                <div class=\"size-7 rounded-full bg-blue-500/15 text-blue-500 flex items-center justify-center font-bold text-xs\">KN</div>\n                <div>\n                  <div class=\"text-xs font-semibold text-foreground\">Lê Thị Kim Ngân</div>\n                  <div class=\"text-[10px] text-muted-foreground\">Thu ngân / Order • Check-in: 06:01</div>\n                </div>\n              </div>\n              <span class=\"text-[10px] font-semibold text-emerald-600 bg-emerald-500/15 px-2 py-0.5 rounded\">Đúng ca</span>\n            </div>\n\n            <div class=\"flex items-center justify-between p-2.5 rounded-lg border border-border bg-background\">\n              <div class=\"flex items-center gap-2.5\">\n                <div class=\"size-7 rounded-full bg-purple-500/15 text-purple-500 flex items-center justify-center font-bold text-xs\">VD</div>\n                <div>\n                  <div class=\"text-xs font-semibold text-foreground\">Nguyễn Văn Đạt</div>\n                  <div class=\"text-[10px] text-muted-foreground\">Phụ ca / Rửa dụng cụ • Check-in: 06:00</div>\n                </div>\n              </div>\n              <span class=\"text-[10px] font-semibold text-emerald-600 bg-emerald-500/15 px-2 py-0.5 rounded\">Đúng ca</span>\n            </div>\n          </div>\n        </div>\n\n        <!-- AI Assistant Recommendation -->\n        <div class=\"p-3.5 rounded-xl border border-indigo-500/20 bg-indigo-500/5\">\n          <div class=\"flex items-center gap-2 text-indigo-500 text-xs font-bold mb-1\">\n            <span>✨ Trợ lý ca Guta AI</span>\n          </div>\n          <p class=\"text-[11px] text-foreground/80 leading-relaxed\">\n            Dự báo lượng khách giờ trưa (11:30 - 13:00) tại chi nhánh này tăng 35% do khu vực văn phòng. Khuyến nghị điều chuyển thêm 1 Barista Part-time hỗ trợ order máy cà phê.\n          </p>\n        </div>\n\n      </div>\n    </div>\n\n    <!-- Drawer Footer Actions -->\n    <div class=\"p-4 border-t border-border bg-muted/10 flex items-center gap-2\">\n      <button type=\"button\" onclick=\"alert('Đã gửi thông báo phân ca tới Bot Telegram của Quản lý chi nhánh!')\" class=\"flex-1 py-2 px-3 rounded-lg bg-zinc-900 hover:bg-zinc-800 dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-white font-semibold text-xs transition shadow-sm text-center\">\n        Gửi Cảnh Báo Telegram\n      </button>\n      <button type=\"button\" onclick=\"closeDrawer()\" class=\"py-2 px-3 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition\">\n        Đóng\n      </button>\n    </div>\n  </aside>\n\n  \n";

export const CrmDashboardView: React.FC<CrmDashboardViewProps> = ({
  userName,
  userRole,
  userScope,
  onLogout,
  onTelegramAlert,
  onOpenAiCopilot,
  onNotify,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const onTelegramAlertRef = useRef(onTelegramAlert);
  onTelegramAlertRef.current = onTelegramAlert;
  const onOpenAiCopilotRef = useRef(onOpenAiCopilot);
  onOpenAiCopilotRef.current = onOpenAiCopilot;
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const brand = root.querySelector('.flex.size-8.items-center.justify-center.rounded-lg');
    if (brand) brand.innerHTML = '<img src="/assets/logos/guta-mark-pure.svg" alt="GUTA" class="size-8 object-contain" />';
    const topbar = root.querySelector('main');
    if (topbar && !root.querySelector('[data-demo-notice]')) {
      const notice = document.createElement('p');
      notice.dataset.demoNotice = 'true';
      notice.setAttribute('role', 'note');
      notice.className = 'border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground';
      notice.textContent = 'Minh họa giao diện — nội dung mẫu, không phải dữ liệu nhân sự hay vận hành thật.';
      topbar.prepend(notice);
    }

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
      if (element.getAttribute('onclick') === 'closeDrawer()' || element.hasAttribute('data-close-drawer')) {
        element.setAttribute('data-close-drawer', '');
        element.addEventListener('click', closeDrawer, { signal: listeners.signal });
        if (element.tagName === 'BUTTON' && !element.textContent?.trim()) {
          element.setAttribute('aria-label', 'Đóng chi tiết');
        }
      }
      element.removeAttribute('onclick');
    });

    const dataRows = Array.from(rows).filter((row) => row.querySelectorAll('td').length >= 8);
    dataRows.forEach((row) => {
      row.addEventListener('click', () => {
        const cells = row.querySelectorAll('td');
        const id = cells[0].textContent?.trim() || '';
        const name = cells[1].textContent?.trim() || '';
        const sm = cells[2].textContent?.trim() || '';
        const district = cells[3].textContent?.trim() || '';
        const staff = cells[4].textContent?.trim() || '40';
        const shift = cells[5].textContent?.trim() || 'Ca 1';
        const rev = cells[6].textContent?.trim() || '8.000.000 ₫';
        const onTime = cells[7].textContent?.trim() || '100%';
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
          telegramButton.innerHTML = '<span class="animate-spin inline-block mr-1">↻</span> Đang gửi...';
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
        emergencyBtn.innerHTML = '<span class="animate-spin inline-block mr-1">↻</span> Đang khởi tạo...';
        emergencyBtn.disabled = true;
        onTelegramAlertRef.current('GT-EMERGENCY-SHIFT');
        telegramTimers.push(setTimeout(() => {
          emergencyBtn.innerHTML = originalContent;
          emergencyBtn.disabled = false;
        }, 500));
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
          onOpenAiCopilotRef.current?.();
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

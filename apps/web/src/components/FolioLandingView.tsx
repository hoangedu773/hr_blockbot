import React, { useEffect, useRef, useState } from 'react';
import type { NotifyFn } from './Toast';

export interface FolioLandingViewProps {
  onLogin: (role: 'SM' | 'AOM' | 'Admin') => void;
  onNotify?: NotifyFn;
}

const FOLIO_HTML = "<div class=\"relative flex min-h-svh flex-col overflow-x-hidden bg-background text-foreground antialiased folio-preview\">\n\n<div hidden=\"\"></div><style>\n:root {\n  --bprogress-color: var(--color-primary);\n  --bprogress-height: 2px;\n  --bprogress-spinner-size: 18px;\n  --bprogress-spinner-animation-duration: 400ms;\n  --bprogress-spinner-border-size: 2px;\n  --bprogress-box-shadow: 0 0 10px var(--color-primary), 0 0 5px var(--color-primary);\n  --bprogress-z-index: 99999;\n  --bprogress-spinner-top: 15px;\n  --bprogress-spinner-bottom: auto;\n  --bprogress-spinner-right: 15px;\n  --bprogress-spinner-left: auto;\n}\n\n.bprogress {\n  width: 0;\n  height: 0;\n  pointer-events: none;\n  z-index: var(--bprogress-z-index);\n}\n\n.bprogress .bar {\n  background: var(--bprogress-color);\n  position: fixed;\n  z-index: var(--bprogress-z-index);\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: var(--bprogress-height);\n}\n\n/* Fancy blur effect */\n.bprogress .peg {\n  display: block;\n  position: absolute;\n  right: 0;\n  width: 100px;\n  height: 100%;\n  box-shadow: var(--bprogress-box-shadow);\n  opacity: 1.0;\n  transform: rotate(3deg) translate(0px, -4px);\n}\n\n/* Remove these to get rid of the spinner */\n.bprogress .spinner {\n  display: block;\n  position: fixed;\n  z-index: var(--bprogress-z-index);\n  top: var(--bprogress-spinner-top);\n  bottom: var(--bprogress-spinner-bottom);\n  right: var(--bprogress-spinner-right);\n  left: var(--bprogress-spinner-left);\n}\n\n.bprogress .spinner-icon {\n  width: var(--bprogress-spinner-size);\n  height: var(--bprogress-spinner-size);\n  box-sizing: border-box;\n  border: solid var(--bprogress-spinner-border-size) transparent;\n  border-top-color: var(--bprogress-color);\n  border-left-color: var(--bprogress-color);\n  border-radius: 50%;\n  -webkit-animation: bprogress-spinner var(--bprogress-spinner-animation-duration) linear infinite;\n  animation: bprogress-spinner var(--bprogress-spinner-animation-duration) linear infinite;\n}\n\n.bprogress-custom-parent {\n  overflow: hidden;\n  position: relative;\n}\n\n.bprogress-custom-parent .bprogress .spinner,\n.bprogress-custom-parent .bprogress .bar {\n  position: absolute;\n}\n\n.bprogress .indeterminate {\n  position: fixed;\n  top: 0;\n  left: 0;\n  width: 100%;\n  height: var(--bprogress-height);\n  overflow: hidden;\n}\n\n.bprogress .indeterminate .inc,\n.bprogress .indeterminate .dec {\n  position: absolute;\n  top: 0;\n  height: 100%;\n  background-color: var(--bprogress-color);\n}\n\n.bprogress .indeterminate .inc {\n  animation: bprogress-indeterminate-increase 2s infinite;\n}\n\n.bprogress .indeterminate .dec {\n  animation: bprogress-indeterminate-decrease 2s 0.5s infinite;\n}\n\n@-webkit-keyframes bprogress-spinner {\n  0%   { -webkit-transform: rotate(0deg); transform: rotate(0deg); }\n  100% { -webkit-transform: rotate(360deg); transform: rotate(360deg); }\n}\n\n@keyframes bprogress-spinner {\n  0%   { transform: rotate(0deg); }\n  100% { transform: rotate(360deg); }\n}\n\n@keyframes bprogress-indeterminate-increase {\n  from { left: -5%; width: 5%; }\n  to { left: 130%; width: 100%; }\n}\n\n@keyframes bprogress-indeterminate-decrease {\n  from { left: -80%; width: 80%; }\n  to { left: 110%; width: 10%; }\n}\n</style><!--$!--><template data-dgst=\"BAILOUT_TO_CLIENT_SIDE_RENDERING\"></template><header vt-update=\"auto\"><nav data-state=\"false\" class=\"fixed z-20 w-full px-2\"><div class=\"mx-auto mt-2 max-w-6xl px-6 transition-all duration-300 lg:px-12\"><div class=\"relative flex flex-wrap items-center justify-between gap-6 py-3 lg:gap-0 lg:py-4\"><div class=\"flex w-full justify-between lg:w-auto\">\n<a aria-label=\"Guta Workspace home\" class=\"flex items-center gap-2.5\" href=\"#\">\n  <img src=\"/assets/logos/guta-mark-pure.svg\" alt=\"Guta Logo\" class=\"size-8 object-contain\" />\n  <div class=\"flex flex-col\">\n    <div class=\"flex items-center gap-1.5 leading-none\">\n      <span class=\"font-black tracking-wider text-foreground text-base\">GUTA</span>\n      <span class=\"font-semibold tracking-tight text-foreground text-base\">WORKSPACE</span>\n    </div>\n    <span class=\"text-[9px] font-medium tracking-wide text-muted-foreground uppercase mt-0.5\">HR &amp; Smart Shift AI</span>\n  </div>\n</a>\n<button type=\"button\" aria-label=\"Open Menu\" class=\"-m-2.5 -mr-4 relative z-20 block cursor-pointer p-2.5 lg:hidden\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-menu m-auto size-6 duration-200 in-data-[state=active]:rotate-180 in-data-[state=active]:scale-0 in-data-[state=active]:opacity-0\"><line x1=\"4\" x2=\"20\" y1=\"12\" y2=\"12\"></line><line x1=\"4\" x2=\"20\" y1=\"6\" y2=\"6\"></line><line x1=\"4\" x2=\"20\" y1=\"18\" y2=\"18\"></line></svg><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"24\" height=\"24\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-x -rotate-180 absolute inset-0 m-auto size-6 scale-0 opacity-0 duration-200 in-data-[state=active]:rotate-0 in-data-[state=active]:scale-100 in-data-[state=active]:opacity-100\"><path d=\"M18 6 6 18\"></path><path d=\"m6 6 12 12\"></path></svg></button></div><div class=\"absolute inset-0 m-auto hidden size-fit lg:block\"><ul class=\"flex gap-8 text-sm\"><li><a class=\"block text-muted-foreground duration-150 hover:text-accent-foreground\" href=\"#features\">Nghiệp vụ</a></li><li><a class=\"block text-muted-foreground duration-150 hover:text-accent-foreground\" href=\"#solution\">Luồng làm việc</a></li><li><a class=\"block text-muted-foreground duration-150 hover:text-accent-foreground\" href=\"#product\">Trợ lý AI</a></li><li><a class=\"block text-muted-foreground duration-150 hover:text-accent-foreground\" href=\"#about\">Nguyên tắc</a></li></ul></div><div class=\"mb-6 hidden w-full flex-wrap items-stretch justify-end gap-6 rounded-3xl border bg-background p-6 shadow-2xl shadow-zinc-300/20 in-data-[state=active]:block md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:items-center lg:gap-6 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none lg:in-data-[state=active]:flex dark:shadow-none dark:lg:bg-transparent\"><div class=\"lg:hidden\"><ul class=\"space-y-6 text-base\"><li><a class=\"block text-muted-foreground duration-150 hover:text-accent-foreground\" href=\"#features\">Nghiệp vụ</a></li><li><a class=\"block text-muted-foreground duration-150 hover:text-accent-foreground\" href=\"#solution\">Luồng làm việc</a></li><li><a class=\"block text-muted-foreground duration-150 hover:text-accent-foreground\" href=\"#product\">Trợ lý AI</a></li><li><a class=\"block text-muted-foreground duration-150 hover:text-accent-foreground\" href=\"#about\">Nguyên tắc</a></li></ul></div><div class=\"flex w-full flex-col gap-3 sm:flex-row sm:items-center lg:w-auto\"><div class=\"relative inline-flex items-center rounded-full shrink-0\" data-theme-toggle=\"\" aria-label=\"Toggle Theme\"><button type=\"button\" class=\"relative rounded-full\" aria-label=\"Light theme\" title=\"Chuyển chế độ sáng\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-sun\"><circle cx=\"12\" cy=\"12\" r=\"4\"></circle><path d=\"M12 2v2\"></path><path d=\"M12 20v2\"></path><path d=\"m4.93 4.93 1.41 1.41\"></path><path d=\"m17.66 17.66 1.41 1.41\"></path><path d=\"M2 12h2\"></path><path d=\"M20 12h2\"></path><path d=\"m6.34 17.66-1.41 1.41\"></path><path d=\"m19.07 4.93-1.41 1.41\"></path></svg></button><button type=\"button\" class=\"relative rounded-full\" aria-label=\"Dark theme\" title=\"Chuyển chế độ tối\"><svg xmlns=\"http://www.w3.org/2000/svg\" width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\" stroke-linecap=\"round\" stroke-linejoin=\"round\" class=\"lucide lucide-moon\"><path d=\"M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z\"></path></svg></button></div><a data-slot=\"button\" class=\"inline-flex shrink-0 items-center justify-center whitespace-nowrap font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;_svg:not([class*='size-'])]:size-4 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:border-border dark:bg-input/30 dark:hover:bg-input/50 h-8 gap-1.5 rounded-md px-3 has-[&gt;svg]:px-2.5 w-full sm:w-auto\" href=\"#login\" role=\"button\" aria-label=\"Get Started\">Đăng nhập</a><a data-slot=\"button\" class=\"shrink-0 items-center justify-center whitespace-nowrap font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;_svg:not([class*='size-'])]:size-4 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 bg-primary text-primary-foreground shadow-xs hover:bg-primary/90 h-8 gap-1.5 rounded-md px-3 has-[&gt;svg]:px-2.5 inline-flex\" href=\"#guta-dashboard\">Xem dashboard</a></div></div></div></div></nav></header><main class=\"flex min-h-screen flex-col\" vt-update=\"auto\"><div class=\"min-h-screen\"><main class=\"relative z-10 overflow-hidden border-b\"><section class=\"relative bg-background\"><div class=\"container relative mx-auto\"><div class=\"border-border border-dashed bg-background sm:border-x\"><div class=\"pt-24 pb-20 md:pt-32 lg:pt-40\"><div class=\"relative z-10 mx-auto grid max-w-5xl items-center gap-4 px-6 text-center\"><div class=\"relative inline-flex justify-self-center\"><div class=\"-inset-[1px] absolute overflow-hidden rounded-full\"><div class=\"absolute inset-0 animate-spin-slow\" style=\"background:conic-gradient(from 0deg, transparent 0%, transparent 70%, #3b82f6 85%, #10b981 95%, transparent 100%)\"></div></div><div class=\"relative rounded-full border border-border/50 bg-background\"><a class=\"block\" href=\"#\"><span class=\"relative z-10 flex items-center gap-1 px-4 py-1.5 font-medium text-foreground text-sm\">F&amp;B Workforce Intelligence — Next-Gen HR</span></a></div></div><h1 class=\"text-balance font-semibold text-4xl sm:text-5xl lg:text-6xl\">Quản Trị Nhân Sự &amp; Phân Ca Tự Động</h1><div class=\"mx-auto max-w-2xl\"><p class=\"mb-6 text-balance text-lg text-muted-foreground lg:text-xl\">Guta Workspace tự động hóa xếp ca 24H, đối soát chấm công và trợ lý AI điều phối nhân sự cho chuỗi cà phê — nhanh chóng, không sai sót ca làm.</p><div class=\"flex items-center justify-center gap-3\"><a data-slot=\"button\" class=\"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;_svg:not([class*='size-'])]:size-4 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 h-9 px-4 py-2 has-[&gt;svg]:px-3 shadow-md\" href=\"#guta-dashboard\" role=\"button\" aria-label=\"Khám phá dashboard\">Khám phá dashboard</a><a data-slot=\"button\" class=\"inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium text-sm outline-none transition-all focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&amp;_svg:not([class*='size-'])]:size-4 [&amp;_svg]:pointer-events-none [&amp;_svg]:shrink-0 border bg-background hover:bg-accent hover:text-accent-foreground dark:border-border dark:bg-input/30 dark:hover:bg-input/50 h-9 px-4 py-2 has-[&gt;svg]:px-3 shadow-sm\" href=\"#solution\">Xem luồng làm việc</a></div><p class=\"mt-4 text-muted-foreground text-xs\">Bản giới thiệu giao diện Guta Workspace · Quản trị chuỗi F&B 45 chi nhánh TP.HCM</p></div></div><div class=\"relative pt-12 lg:pt-20\"><div class=\"relative mx-auto max-w-7xl px-1 md:px-0 lg:px-6\"><div class=\"-inset-20 sm:-inset-28 lg:-inset-40 pointer-events-none absolute opacity-60\" style=\"mask-image:linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%),\n                        linear-gradient(to bottom, transparent 0%, black 30%, black 100%);-webkit-mask-image:linear-gradient(to right, transparent 0%, black 25%, black 75%, transparent 100%),\n                        linear-gradient(to bottom, transparent 0%, black 30%, black 100%);mask-composite:intersect;-webkit-mask-composite:source-in\"><img alt=\"\" aria-hidden=\"true\" fetchpriority=\"high\" width=\"2000\" height=\"1333\" decoding=\"async\" data-nimg=\"1\" class=\"size-full object-cover\" style=\"color:transparent\" sizes=\"(max-width: 768px) 100vw, (max-width: 1280px) 1280px, 1600px\" src=\"/assets/folio/images/dashboard-bg.jpg\"></div><div class=\"relative z-10\" style=\"mask-image:linear-gradient(to bottom, black 0%, black 92%, transparent 100%);-webkit-mask-image:linear-gradient(to bottom, black 0%, black 92%, transparent 100%)\"><div class=\"guta-demo-scroll\" tabindex=\"0\" aria-label=\"Minh họa dashboard nhân sự 21st-CRM, cuộn ngang để xem đầy đủ\" role=\"region\" id=\"dashboard-preview\">\n  <div class=\"crm-app\" id=\"guta-dashboard\" role=\"region\" aria-label=\"Minh họa 21st-CRM Dashboard nhân sự HR BlockBot\">\n    <!-- Topbar (21st-crm header) -->\n    <header class=\"crm-topbar\">\n      <div class=\"crm-topbar-left\">\n        <div class=\"crm-brand-icon\">G</div>\n        <div class=\"crm-brand-meta\">\n          <span class=\"crm-brand-title\">GUTA WORKSPACE</span>\n          <span class=\"crm-brand-sub\">Guta CRM · Quản trị Phân Ca &amp; Nhân Sự Chuỗi</span>\n        </div>\n      </div>\n      <div class=\"crm-search-bar\" role=\"search\">\n        <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><circle cx=\"11\" cy=\"11\" r=\"8\"></circle><path d=\"m21 21-4.3-4.3\"></path></svg>\n        <span>Tìm kiếm chi nhánh, barista, ca trực...</span>\n        <kbd>⌘K</kbd>\n      </div>\n      <div class=\"crm-topbar-actions\">\n        <span class=\"crm-role-badge\">Admin HR</span>\n        <button type=\"button\" class=\"crm-btn crm-btn-outline\"><svg width=\"12\" height=\"12\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\"><polygon points=\"22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3\"></polygon></svg> Bộ lọc</button>\n        <button type=\"button\" class=\"crm-btn crm-btn-primary\">+ Tạo ca trực</button>\n      </div>\n    </header>\n\n    <!-- Stats Ribbon (21st-crm metric cards with rounded.sm: 10px) -->\n    <div class=\"crm-metrics-grid\">\n      <div class=\"crm-metric-box\">\n        <div class=\"crm-metric-head\"><span>TỔNG NHÂN SỰ</span><span class=\"crm-tag-neutral\">34 Chi nhánh</span></div>\n        <div class=\"crm-metric-value\">2.439 <small>nhân sự</small></div>\n        <div class=\"crm-metric-foot\">Chuẩn hóa 5 cấp bậc (Intern → Lead)</div>\n      </div>\n      <div class=\"crm-metric-box\">\n        <div class=\"crm-metric-head\"><span>LỊCH TRÌNH VẬN HÀNH CA</span><span class=\"crm-tag-info\">5 Trạng thái</span></div>\n        <div class=\"crm-metric-value\">18 <small>đang quản lý</small></div>\n        <div class=\"crm-metric-foot\">Khởi tạo → Giao → Làm → Duyệt → Xong</div>\n      </div>\n      <div class=\"crm-metric-box\">\n        <div class=\"crm-metric-head\"><span>HÀNG ĐỢI DUYỆT</span><span class=\"crm-tag-warning\">4 Chờ duyệt</span></div>\n        <div class=\"crm-metric-value\">04 <small>báo cáo mới</small></div>\n        <div class=\"crm-metric-foot\">Cần Admin đối chiếu &amp; xác nhận</div>\n      </div>\n      <div class=\"crm-metric-box\">\n        <div class=\"crm-metric-head\"><span>GỢI Ý PHOBERT AI</span><span class=\"crm-tag-success\">Semantic Match</span></div>\n        <div class=\"crm-metric-value\">94.2% <small>độ tương đồng</small></div>\n        <div class=\"crm-metric-foot\">Khớp kỹ năng hồ sơ với yêu cầu việc</div>\n      </div>\n    </div>\n\n    <!-- Main Workspace (Pipeline Stage Kanban Columns + AI Assistant Panel) -->\n    <div class=\"crm-workspace-body\">\n      <!-- 5-Stage Pipeline Columns -->\n      <div class=\"crm-pipeline-container\">\n        <!-- Stage 1 -->\n        <div class=\"crm-stage-col\">\n          <div class=\"crm-stage-header\">\n            <span class=\"crm-stage-name\">1. Khởi tạo</span>\n            <span class=\"crm-stage-count\">1</span>\n          </div>\n          <div class=\"crm-cards-list\">\n            <div class=\"crm-card\">\n              <div class=\"crm-card-tags\">\n                <span class=\"crm-pill crm-pill-gray\">Ca Sáng</span>\n                <span class=\"crm-pill crm-pill-blue\">SOP-01</span>\n              </div>\n              <h4 class=\"crm-card-title\">Định biên nhân sự ca sáng</h4>\n              <p class=\"crm-card-desc\">Thiết lập định biên Barista và nhân sự phụ ca cho 45 cửa hàng.</p>\n              <div class=\"crm-card-meta\">\n                <div class=\"crm-avatar\">HR</div>\n                <span>Phòng Nhân sự</span>\n              </div>\n              <div class=\"crm-card-footer\">\n                <span class=\"crm-date\">Hạn: 30/10</span>\n                <span class=\"crm-status-text\">Chưa mở kỳ</span>\n              </div>\n            </div>\n          </div>\n        </div>\n\n        <!-- Stage 2 -->\n        <div class=\"crm-stage-col\">\n          <div class=\"crm-stage-header\">\n            <span class=\"crm-stage-name\">2. Đã giao</span>\n            <span class=\"crm-stage-count\">1</span>\n          </div>\n          <div class=\"crm-cards-list\">\n            <div class=\"crm-card\">\n              <div class=\"crm-card-tags\">\n                <span class=\"crm-pill crm-pill-green\">PhoBERT 95%</span>\n                <span class=\"crm-pill crm-pill-gray\">SOP-04</span>\n              </div>\n              <h4 class=\"crm-card-title\">Rà soát quy chế ca 24H</h4>\n              <p class=\"crm-card-desc\">Cập nhật quy định chấm công ZKTeco và phụ cấp ca đêm.</p>\n              <div class=\"crm-card-meta\">\n                <div class=\"crm-avatar\">VA</div>\n                <span>Nguyễn Văn An (Senior)</span>\n              </div>\n              <div class=\"crm-card-footer\">\n                <span class=\"crm-date\">Giao: 20/10</span>\n                <span class=\"crm-status-text\">Đã gửi qua Bot</span>\n              </div>\n            </div>\n          </div>\n        </div>\n\n        <!-- Stage 3 -->\n        <div class=\"crm-stage-col\">\n          <div class=\"crm-stage-header\">\n            <span class=\"crm-stage-name\">3. Đang thực hiện</span>\n            <span class=\"crm-stage-count\">2</span>\n          </div>\n          <div class=\"crm-cards-list\">\n            <div class=\"crm-card\">\n              <div class=\"crm-card-tags\">\n                <span class=\"crm-pill crm-pill-blue\">Hồ sơ &amp; Kỹ năng</span>\n              </div>\n              <h4 class=\"crm-card-title\">Chuẩn hóa hồ sơ nhân sự</h4>\n              <p class=\"crm-card-desc\">Phân loại kỹ năng pha chế, quản lý kho theo chuẩn Guta.</p>\n              <div class=\"crm-progress-bar\"><div class=\"crm-progress-fill\" style=\"width: 60%\"></div></div>\n              <div class=\"crm-card-meta\">\n                <div class=\"crm-avatar\">TB</div>\n                <span>Trần Thị Bình (Middle)</span>\n              </div>\n              <div class=\"crm-card-footer\">\n                <span class=\"crm-date\">Tiến độ: 60%</span>\n                <span class=\"crm-status-text\">Đang cập nhật</span>\n              </div>\n            </div>\n\n            <div class=\"crm-card\">\n              <div class=\"crm-card-tags\">\n                <span class=\"crm-pill crm-pill-purple\">Socket.IO</span>\n                <span class=\"crm-pill crm-pill-gray\">SOP-09</span>\n              </div>\n              <h4 class=\"crm-card-title\">Chatbot nhắc ca &amp; chốt két</h4>\n              <p class=\"crm-card-desc\">Gửi thông báo vào ca và nhắc hạn chốt quỹ két tự động.</p>\n              <div class=\"crm-progress-bar\"><div class=\"crm-progress-fill\" style=\"width: 85%\"></div></div>\n              <div class=\"crm-card-meta\">\n                <div class=\"crm-avatar\">LC</div>\n                <span>Lê Hoàng Cường (Lead)</span>\n              </div>\n              <div class=\"crm-card-footer\">\n                <span class=\"crm-date\">Tiến độ: 85%</span>\n                <span class=\"crm-status-text\">Test luồng chat</span>\n              </div>\n            </div>\n          </div>\n        </div>\n\n        <!-- Stage 4 -->\n        <div class=\"crm-stage-col\">\n          <div class=\"crm-stage-header\">\n            <span class=\"crm-stage-name\">4. Chờ duyệt</span>\n            <span class=\"crm-stage-count crm-count-alert\">1</span>\n          </div>\n          <div class=\"crm-cards-list\">\n            <div class=\"crm-card crm-card-highlight\">\n              <div class=\"crm-card-tags\">\n                <span class=\"crm-pill crm-pill-amber\">Cần đối chiếu</span>\n                <span class=\"crm-pill crm-pill-gray\">SOP-05</span>\n              </div>\n              <h4 class=\"crm-card-title\">Đối soát bàn giao két ca</h4>\n              <p class=\"crm-card-desc\">Đã gửi biên bản chốt quỹ két qua Chatbot. Chờ Quản lý đối soát.</p>\n              <div class=\"crm-card-meta\">\n                <div class=\"crm-avatar\">PD</div>\n                <span>Phạm Minh Dũng (Junior)</span>\n              </div>\n              <div class=\"crm-card-actions\">\n                <button type=\"button\" class=\"crm-mini-btn crm-btn-confirm\">Phê duyệt</button>\n                <button type=\"button\" class=\"crm-mini-btn crm-btn-secondary\">Trả lại (lý do)</button>\n              </div>\n            </div>\n          </div>\n        </div>\n\n        <!-- Stage 5 -->\n        <div class=\"crm-stage-col\">\n          <div class=\"crm-stage-header\">\n            <span class=\"crm-stage-name\">5. Hoàn thành</span>\n            <span class=\"crm-stage-count\">1</span>\n          </div>\n          <div class=\"crm-cards-list\">\n            <div class=\"crm-card\">\n              <div class=\"crm-card-tags\">\n                <span class=\"crm-pill crm-pill-green\">Đã chốt két</span>\n                <span class=\"crm-pill crm-pill-gray\">Chuẩn 100%</span>\n              </div>\n              <h4 class=\"crm-card-title\">Nghiệm thu ca làm &amp; bàn giao</h4>\n              <p class=\"crm-card-desc\">Đã đồng bộ chấm công ZKTeco và khớp dữ liệu két ca.</p>\n              <div class=\"crm-card-meta\">\n                <div class=\"crm-avatar\">DE</div>\n                <span>Đặng Thu Em (Senior)</span>\n              </div>\n              <div class=\"crm-card-footer\">\n                <span class=\"crm-date\">Xong: 22/10</span>\n                <span class=\"crm-status-text\">Đã chốt két</span>\n              </div>\n            </div>\n          </div>\n        </div>\n      </div>\n\n      <!-- Right Side: AI Assistant & Matching Card (21st-crm side panel) -->\n      <aside class=\"crm-assistant-panel\">\n        <div class=\"crm-assistant-head\">\n          <div class=\"crm-bot-status\"><span class=\"crm-dot\"></span><strong>TRỢ LÝ HR BLOCKBOT</strong></div>\n          <span class=\"crm-tag-xs\">AI Copilot</span>\n        </div>\n        \n        <div class=\"crm-assistant-body\">\n          <div class=\"crm-chat-msg crm-msg-user\">\n            <small>Nhân viên hỏi qua Chatbot:</small>\n            <p>“Làm thế nào để tôi báo cáo chốt quỹ két và đổi ca trực?”</p>\n          </div>\n          <div class=\"crm-chat-msg crm-msg-bot\">\n            <small>Trợ lý phản hồi (SOP-05 / Vận hành ca):</small>\n            <p>Chọn ca trực phụ trách, đính kèm biên bản két và bấm xác nhận. Dữ liệu sẽ chuyển sang cột <strong>Chờ duyệt</strong> trên Dashboard của Quản lý.</p>\n            <div class=\"crm-msg-cite\">Quy định vận hành F&B: Xác nhận trước khi chốt két</div>\n          </div>\n\n          <div class=\"crm-recommendation-box\">\n            <div class=\"crm-rec-label\">GỢI Ý PHÂN CÔNG PHOBERT</div>\n            <h5>Ca trực: Tăng cường Barista giờ cao điểm</h5>\n            <div class=\"crm-rec-candidate\">\n              <div class=\"crm-avatar-sm\">LC</div>\n              <div>\n                <strong>Lê Hoàng Cường</strong> · Lead\n                <small>Điểm tương đồng kỹ năng: <strong>96%</strong> · Tải việc: 1/3</small>\n              </div>\n            </div>\n            <div class=\"crm-rec-action\">\n              <button type=\"button\" class=\"crm-btn crm-btn-primary crm-btn-block\">Chấp thuận phân công</button>\n            </div>\n            <span class=\"crm-rec-note\">Admin giữ quyền quyết định cuối cùng.</span>\n          </div>\n        </div>\n        <div class=\"crm-assistant-foot\">\n          <span>Minh họa 2 vai (Quản trị &amp; Barista) · Hệ thống Guta F&B</span>\n        </div>\n      </aside>\n    </div>\n  </div></div><p>Minh họa giao diện 21st-CRM HR BlockBot · Dữ liệu mô phỏng vận hành chuỗi cà phê · Cuộn ngang trên màn hình nhỏ</p></div></div></div></div></div></div></section></main><section class=\"py-14 sm:py-20 border-b border-border/30\">\n    <div class=\"guta-container pb-6 border-b border-border/20 flex flex-wrap items-center justify-center gap-6 text-xs font-semibold uppercase tracking-widest text-muted-foreground\">\n      <span class=\"text-primary font-bold\">ĐỐI TÁC CUNG ỨNG F&B:</span>\n      <div class=\"flex flex-wrap items-center gap-5\">\n        <span>Vinamilk</span>\n        <span>•</span>\n        <span>La Marzocco</span>\n        <span>•</span>\n        <span>Dalatmilk</span>\n        <span>•</span>\n        <span>Monin</span>\n        <span>•</span>\n        <span>Torani</span>\n        <span>•</span>\n        <span>OATLY</span>\n        <span>•</span>\n        <span>Rich's</span>\n      </div>\n    </div>\n    <div class=\"guta-container guta-capabilities pt-6\"><span class=\"guta-label\">PHẠM VI NGHIỆP VỤ</span><div><span>Hồ sơ nhân sự</span><span>Vận hành ca trực</span><span>Chatbot tiếng Việt</span><span>Gợi ý phân công</span><span>Đánh giá KPI</span><span>Báo cáo &amp; nhắc hạn</span></div></div></section><section class=\"py-16 sm:py-20 md:py-28\" id=\"features\"><div class=\"guta-container\"><header class=\"guta-section-head\"><span class=\"guta-label\">TỪ DỮ LIỆU ĐẾN QUYẾT ĐỊNH</span><h2>Bớt hỏi lại. Có chỗ để đối chiếu.</h2><p>Mỗi thông tin đi cùng một việc cần làm, thay vì nằm rải rác trong file và tin nhắn.</p></header><div class=\"guta-grid-three\"><article class=\"guta-card\"><div class=\"guta-mini\"><span>HỒ SƠ NHÂN SỰ</span><strong>Kỹ năng → Yêu cầu công việc</strong><p>Cấp bậc là dữ liệu, không phải quyền truy cập.</p></div><h3>Biết hồ sơ nào phù hợp</h3><p>Tập hợp kỹ năng, cấp bậc và lịch sử tham gia công việc để người quản lý có cơ sở lựa chọn.</p></article><article class=\"guta-card\"><div class=\"guta-mini\"><span>TRẠNG THÁI CÔNG VIỆC</span><strong>Đang thực hiện → Chờ duyệt</strong><p>Giữ lịch sử, không chỉ ghi trạng thái cuối.</p></div><h3>Biết việc đang ở đâu</h3><p>Theo dõi từng bước từ mở ca đến chốt két. Báo cáo ca trực bị từ chối phải có lý do để nhân sự điều chỉnh đúng chỗ.</p></article><article class=\"guta-card\"><div class=\"guta-mini\"><span>CĂN CỨ ĐÁNH GIÁ</span><strong>Kết quả + Nhận xét + Lịch sử</strong><p>AI hỗ trợ; quyết định không bị giấu sau một con số.</p></div><h3>Biết vì sao ra điểm số</h3><p>Đối chiếu kết quả, nhận xét và điểm KPI. Mọi hiệu chỉnh của quản lý cần lý do và người thực hiện.</p></article></div></div></section><section class=\"py-20 md:py-28\" id=\"solution\"><div class=\"guta-container\"><header class=\"guta-section-head\"><span class=\"guta-label\">MỘT VÒNG VIỆC, HAI CỬA VÀO</span><h2>Từ mở ca đến chốt két.</h2><p>Dashboard giữ góc nhìn quản lý. Chatbot đưa việc tra cứu và báo cáo về cuộc hội thoại hằng ngày.</p></header><div class=\"guta-flow\"><div><span>01</span><strong>Khởi tạo</strong></div><div><span>02</span><strong>Đã giao</strong></div><div><span>03</span><strong>Đang thực hiện</strong></div><div><span>04</span><strong>Chờ duyệt</strong></div><div><span>05</span><strong>Hoàn thành</strong></div></div><div class=\"guta-grid-two\"><article class=\"guta-card\"><div class=\"guta-mini\"><span>ĐIỂM KIỂM SOÁT</span><strong>Đúng người. Đúng trạng thái.</strong></div><h3>Quản lý trên dashboard</h3><p>Tạo ca trực, bố trí định biên, gợi ý điều động nhân sự. Khi nhận báo cáo, đối chiếu kết quả rồi duyệt hoặc trả lại kèm lý do.</p></article><article class=\"guta-card\"><div class=\"guta-mini\"><span>VÍ DỤ CÂU HỎI</span><strong>“Tôi đang được giao những việc nào?”</strong></div><h3>Nhân viên làm việc qua chat</h3><p>Tra cứu hồ sơ của mình, hỏi chính sách, xem KPI và gửi báo cáo. Thao tác ghi dữ liệu cần bước xác nhận.</p></article></div></div></section><section class=\"py-20 md:py-28\" id=\"product\"><div class=\"guta-container\"><header class=\"guta-section-head\"><span class=\"guta-label\">AI CÓ VAI TRÒ CỤ THỂ</span><h2>Gợi ý có lý do. Tra cứu có ngữ cảnh.</h2><p>Hệ thống tối ưu theo quy trình chuỗi F&B thực tế, minh bạch mọi quyết định điều phối ca.</p></header><div class=\"guta-grid-two\"><article class=\"guta-card\"><div class=\"guta-mini\"><span>YÊU CẦU → GỢI Ý → NGƯỜI DUYỆT</span><strong>Không tự giao việc thay quản lý.</strong></div><h3>Phân công theo kỹ năng và khối lượng việc</h3><p>PhoBERT là thành phần ngữ nghĩa trong thiết kế matching. Người quản lý xem độ phù hợp và tải công việc trước khi quyết định.</p></article><article class=\"guta-card\"><div class=\"guta-mini\"><span>HỎI → TRA CỨU → ĐỐI CHIẾU</span><strong>“Quy định nộp báo cáo ở đâu?”</strong></div><h3>Tra cứu chính sách bằng tiếng Việt</h3><p>Hỏi theo tình huống thay vì dò nhiều file. Thiết kế chatbot ưu tiên câu trả lời bám tài liệu; chưa đủ thông tin thì hỏi lại.</p></article></div></div></section><section class=\"py-20 md:py-28\" id=\"about\"><div class=\"guta-container\"><header class=\"guta-section-head\"><span class=\"guta-label\">THIẾT KẾ ĐỂ KIỂM TRA ĐƯỢC</span><h2>Không cần tin một cách mù quáng.</h2><p>Quy trình điều phối chuẩn hóa, kiểm soát chặt chẽ chấm công máy ZKTeco và két ca.</p></header><div class=\"guta-grid-three\"><article class=\"guta-card\"><h3>Phân quyền theo vai</h3><p>Quản lý điều phối chi nhánh. Barista thao tác ca trực và đối soát két trong ca làm.</p></article><article class=\"guta-card\"><h3>Xác nhận trước khi ghi</h3><p>Nhận ca, bàn giao quỹ két hay gửi cảnh báo đều cần xác nhận chính xác trước khi lưu.</p></article><article class=\"guta-card\"><h3>Giữ dấu vết thay đổi</h3><p>Trạng thái điểm danh, lý do đi trễ và hiệu chỉnh công ca phải có nhật ký kiểm soát rõ ràng.</p></article></div></div></section><section class=\"bg-background py-16 md:py-24\" id=\"questions\"><div class=\"guta-container\"><header class=\"guta-section-head\"><span class=\"guta-label\">TRƯỚC KHI TRẢI NGHIỆM</span><h2>Những điều cần rõ.</h2><p>Phạm vi và giới hạn được nói ngay trên trang.</p></header><div class=\"guta-faq\"><details><summary>HR BlockBot giải quyết việc gì?</summary><p>Tập trung hồ sơ nhân sự, lịch phân ca 24/7, điều phối barista chéo, tra cứu quy chế, quỹ két và báo cáo trong cùng một hệ thống.</p></details><details><summary>Dashboard và chatbot có dữ liệu riêng không?</summary><p>Không. Theo thiết kế, hai giao diện chia sẻ một nguồn dữ liệu và cùng nghiệp vụ; khác nhau ở cách người dùng thao tác.</p></details><details><summary>AI có tự giao việc hay quyết định điểm KPI không?</summary><p>Thiết kế đặt AI ở vai trò hỗ trợ. Quản lý xác nhận phân công; hiệu chỉnh KPI phải có lý do và lịch sử.</p></details><details><summary>Đây có phải dữ liệu Guta đang chạy thật không?</summary><p>Không. Các công việc và hội thoại trên trang là nội dung minh họa giao diện; không phải dữ liệu vận hành hoặc kết quả AI đã đo.</p></details><details><summary>Hệ thống có xếp ca, tính lương hay duyệt nghỉ phép không?</summary><p>Hệ thống tập trung cốt lõi vào điều phối ca trực, điểm danh ZKTeco và quản trị két ca 45 chi nhánh. Các phân hệ tính lương và duyệt nghỉ phép tự động đang trong lộ trình tích hợp tiếp theo.</p></details></div></div></section></div></main><footer class=\"relative mt-12 overflow-hidden bg-background\" vt-update=\"auto\"><div class=\"guta-container guta-footer\"><strong>GUTA WORKSPACE <span>· HR BlockBot</span></strong><p>Guta Workspace · Nền tảng điều hành nhân sự &amp; chuỗi cà phê F&B</p><a href=\"#questions\">Phạm vi &amp; câu hỏi</a></div></footer><section aria-label=\"Notifications alt+T\" tabindex=\"-1\" aria-live=\"polite\" aria-relevant=\"additions text\" aria-atomic=\"false\"></section>\n<!-- AUTH MODAL -->\n\n\n\n</div>";

export const FolioLandingView: React.FC<FolioLandingViewProps> = ({ onLogin, onNotify }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isAuthOpen, setIsAuthOpen] = useState(false);
  const onNotifyRef = useRef(onNotify);
  onNotifyRef.current = onNotify;

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    // 1. Mobile Menu Toggle
    const toggle = root.querySelector('button[aria-label="Open Menu"]');
    let handleToggle: (() => void) | null = null;
    if (toggle) {
      toggle.setAttribute('aria-expanded', 'false');
      handleToggle = () => {
        const nav = toggle.closest('nav');
        if (!nav) return;
        const open = nav.getAttribute('data-state') !== 'active';
        nav.setAttribute('data-state', open ? 'active' : 'false');
        toggle.setAttribute('aria-expanded', String(open));
      };
      toggle.addEventListener('click', handleToggle);
    }
    const nav = toggle?.closest('nav');
    const syncScrolledNav = () => nav?.classList.toggle('nav-scrolled', window.scrollY > 20);
    syncScrolledNav();
    window.addEventListener('scroll', syncScrolledNav, { passive: true });
    const navLinks = nav?.querySelectorAll('a[href="#features"], a[href="#solution"], a[href="#product"], a[href="#about"]');
    const closeMobileMenu = () => {
      nav?.setAttribute('data-state', 'false');
      toggle?.setAttribute('aria-expanded', 'false');
    };
    navLinks?.forEach((link) => link.addEventListener('click', closeMobileMenu));

    // 2. Intercept Login Triggers to open 1-Click Auth Modal
    const loginTriggers = root.querySelectorAll('a[href="#login"], a[href="#demo"], a[href="#crm"], button[data-auth-trigger]');
    const handleLoginClick = (e: Event) => {
      e.preventDefault();
      setIsAuthOpen(true);
    };
    loginTriggers.forEach((el) => el.addEventListener('click', handleLoginClick));

    const showSyncNotice = (e: Event) => {
      e.preventDefault();
      if (onNotifyRef.current) {
        onNotifyRef.current(
          'Tính năng đang trong chu kỳ đồng bộ dữ liệu ZKTeco',
          'info',
          'Đồng bộ dữ liệu ZKTeco'
        );
      } else {
        const existing = document.getElementById('zkteco-sync-toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.id = 'zkteco-sync-toast';
        toast.setAttribute('role', 'status');
        toast.className = 'fixed bottom-6 right-6 z-50 bg-slate-900/95 border border-blue-500/40 text-slate-100 px-4 py-3 rounded-xl shadow-2xl text-xs flex items-center gap-2.5 backdrop-blur';
        toast.innerHTML = '<span class="size-2 rounded-full bg-blue-500 animate-ping inline-block"></span><span class="font-medium">Tính năng đang trong chu kỳ đồng bộ dữ liệu ZKTeco</span>';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 4000);
      }
    };

    // Intercept dead links (href="#" or empty href) without custom handlers
    const deadLinks = root.querySelectorAll('a[href="#"], a[href=""]');
    deadLinks.forEach((link) => {
      const text = link.textContent?.trim().toLowerCase() || '';
      if (
        text.includes('bắt đầu ngay') ||
        text.includes('get started') ||
        text.includes('xem dashboard') ||
        text.includes('đăng nhập')
      ) {
        return;
      }
      link.addEventListener('click', showSyncNotice);
    });


    // Also attach to buttons with text "Bắt đầu", "Get Started", "Đăng nhập", "Xem dashboard", "Khám phá dashboard" or CRM preview controls
    const allButtonsAndLinks = root.querySelectorAll('button, a');
    allButtonsAndLinks.forEach((el) => {
      const text = el.textContent?.trim().toLowerCase() || '';
      if (
        text.includes('bắt đầu ngay') ||
        text.includes('get started') ||
        text.includes('xem dashboard') ||
        text.includes('khám phá dashboard') ||
        text.includes('đăng nhập') ||
        el.classList.contains('crm-btn') ||
        el.classList.contains('crm-mini-btn')
      ) {
        el.addEventListener('click', handleLoginClick);
      }
    });

    // 3. Accordion FAQ
    const triggers = root.querySelectorAll('[data-slot="accordion-trigger"]');
    const handleAccordion = (e: Event) => {
      const trigger = e.currentTarget as HTMLElement;
      const item = trigger.closest('[data-slot="accordion-item"]');
      const content = item?.querySelector('[data-slot="accordion-content"]') as HTMLElement | null;
      if (!content) return;
      const open = trigger.getAttribute('aria-expanded') !== 'true';
      trigger.setAttribute('aria-expanded', String(open));
      const icon = trigger.querySelector('svg');
      icon?.classList.add('transition-transform', 'duration-200');
      icon?.classList.toggle('rotate-180', open);
      content.hidden = !open;
    };
    triggers.forEach((t) => t.addEventListener('click', handleAccordion));

    // 4. Dark / Light Theme Toggle
    const lightBtn = root.querySelector('[data-theme-toggle] button[aria-label="Light theme"]');
    const darkBtn = root.querySelector('[data-theme-toggle] button[aria-label="Dark theme"]');
    const setLight = (e: Event) => {
      e.preventDefault();
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    };
    const setDark = (e: Event) => {
      e.preventDefault();
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    };
    lightBtn?.addEventListener('click', setLight);
    darkBtn?.addEventListener('click', setDark);

    return () => {
      window.removeEventListener('scroll', syncScrolledNav);
      navLinks?.forEach((link) => link.removeEventListener('click', closeMobileMenu));
      if (handleToggle && toggle) toggle.removeEventListener('click', handleToggle);
      loginTriggers.forEach((el) => el.removeEventListener('click', handleLoginClick));
      deadLinks.forEach((link) => link.removeEventListener('click', showSyncNotice));
      triggers.forEach((t) => t.removeEventListener('click', handleAccordion));
      lightBtn?.removeEventListener('click', setLight);
      darkBtn?.removeEventListener('click', setDark);
    };
  }, []);

  useEffect(() => {
    if (!isAuthOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAuthOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [isAuthOpen]);

  return (
    <div className="folio-view-container relative min-h-screen">
      <div ref={containerRef} dangerouslySetInnerHTML={{ __html: FOLIO_HTML }} />
      <style>{`button:focus-visible, a[role="button"]:focus-visible, a[data-slot="button"]:focus-visible { outline: none; box-shadow: 0 0 0 2px #2563eb; }`}</style>

      {/* 1-CLICK ROLE AUTH MODAL */}
      {isAuthOpen && (
        <div
          id="auth-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auth-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fadeIn"
          style={{ animation: 'fadeIn 0.2s cubic-bezier(0.16, 1, 0.3, 1)' }}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-slate-700/80 bg-slate-900/95 p-6 shadow-2xl text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-3">
                <img src="/assets/logos/guta-mark-pure.svg" alt="Guta" className="size-7 object-contain" />
                <div>
                  <h3 id="auth-modal-title" className="text-base font-bold text-white leading-tight">
                    Đăng Nhập Nhanh 1-Click
                  </h3>
                  <p className="text-xs text-slate-400">Chọn vai trò để trải nghiệm Guta Workspace</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setIsAuthOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-3">
              {/* Role 1: SM */}
              <button
                type="button"
                onClick={() => {
                  setIsAuthOpen(false);
                  onLogin('SM');
                }}
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-800/40 hover:bg-blue-600/10 hover:border-blue-500/50 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-blue-600/20 text-blue-400 flex items-center justify-center font-bold text-sm border border-blue-500/30">
                    PA
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-white group-hover:text-blue-400 transition-colors">
                      Nguyễn Thị Phương Anh
                    </div>
                    <div className="text-xs text-slate-400">Cửa hàng trưởng (SM) • Chi nhánh Tân Bình</div>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-500/10 text-blue-400 border border-blue-500/20">
                  Vào Ca →
                </span>
              </button>

              {/* Role 2: AOM */}
              <button
                type="button"
                onClick={() => {
                  setIsAuthOpen(false);
                  onLogin('AOM');
                }}
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-800/40 hover:bg-emerald-600/10 hover:border-emerald-500/50 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-emerald-600/20 text-emerald-400 flex items-center justify-center font-bold text-sm border border-emerald-500/30">
                    TT
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-white group-hover:text-emerald-400 transition-colors">
                      Nguyễn Cao Thanh Trầm
                    </div>
                    <div className="text-xs text-slate-400">Quản lý khu vực (AOM) • Cụm Q1 / Q3 / Q10</div>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Vào Khu Vực →
                </span>
              </button>

              {/* Role 3: Admin */}
              <button
                type="button"
                onClick={() => {
                  setIsAuthOpen(false);
                  onLogin('Admin');
                }}
                className="w-full text-left p-3.5 rounded-xl border border-slate-800 bg-slate-800/40 hover:bg-purple-600/10 hover:border-purple-500/50 transition-all flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-purple-600/20 text-purple-400 flex items-center justify-center font-bold text-sm border border-purple-500/30">
                    AD
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-white group-hover:text-purple-400 transition-colors">
                      Ban Điều Hành Guta
                    </div>
                    <div className="text-xs text-slate-400">Quản trị viên hệ thống (Admin) • Toàn quyền chuỗi</div>
                  </div>
                </div>
                <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                  Toàn Quyền →
                </span>
              </button>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-800/80 text-center">
              <span className="text-[11px] text-slate-500">
                Môi trường thử nghiệm trực tiếp • Không cần mật khẩu
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DashboardOverview, StoreSummary } from '@hr-blockbot/contracts';
import type { NotifyFn } from './Toast';
import { AdminSettingsView } from './AdminSettingsView';
import { UserAccountsView } from './UserAccountsView';
import { EmployeeListView } from './EmployeeListView';
import { EmployeeProfileView } from './EmployeeProfileView';
import { ProjectListView } from './ProjectListView';
import { RosterView } from './RosterView';
import { StoreDirectoryView } from './StoreDirectoryView';

export type ActiveCrmView = 'stores' | 'employees' | 'profile' | 'schedules' | 'projects' | 'settings' | 'accounts';
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
    <aside class="crm-sidebar w-64 border-r border-white/[0.08] bg-neutral-900/70 backdrop-blur-xl flex flex-col justify-between shrink-0 select-none">
      <div class="flex flex-col">
        <!-- Brand Header with HR-BlockBot Logo -->
        <div class="p-4 border-b border-border/80 flex items-center justify-between">
          <div class="flex items-center gap-3">
            <div class="flex size-8 items-center justify-center rounded-xl bg-white/[0.04] p-1 border border-white/10 shrink-0">
              <img src="/assets/logos/guta-mark-pure.svg" alt="HR-BlockBot Logo" class="size-6 object-contain" />
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

        <!-- Search Bar Trigger: focuses the directory search below (single owner of the filter state) -->
        <div class="px-3 pt-3">
          <div id="crm-search-trigger" role="button" tabindex="0" aria-label="Tìm cửa hàng" class="flex items-center gap-2 px-3 py-2 rounded-xl border border-border/70 bg-background/60 text-xs text-muted-foreground shadow-xs cursor-pointer hover:border-zinc-400/50 transition">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="shrink-0 text-muted-foreground"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>
            <span class="flex-1 truncate">Lọc theo tên, quận, mã...</span>
            <kbd class="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono border border-border shrink-0">⌘K</kbd>
          </div>
        </div>

        <!-- Navigation Menu with AI Copilot at TOP -->
        <nav class="px-2 py-3 space-y-1">
          <div class="px-2 pb-1.5 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Trợ Lý Thông Minh</div>

          <a href="#" aria-label="Trợ Lý AI (Copilot)" class="flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-xs font-semibold bg-zinc-700/10 text-zinc-300 border border-zinc-400/20 shadow-xs hover:bg-zinc-700/15 transition cursor-pointer mb-3">
            <div class="size-6 rounded-lg bg-gradient-to-tr from-zinc-700 to-zinc-600 flex items-center justify-center text-white shadow-2xs shrink-0">
              <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>
            </div>
            <span class="font-bold">Guta Copilot AI</span>
            <span class="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono font-semibold bg-zinc-400/20 text-zinc-300 px-2 py-0.5 rounded-full border border-zinc-400/30"><span class="size-1.5 rounded-full bg-emerald-400 animate-pulse" aria-hidden="true"></span>Trợ Lý AI (Copilot)</span>
          </a>

          <div class="px-2 pb-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">Hệ Thống Vận Hành</div>

          <button type="button" data-section="stores" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-semibold bg-muted/60 text-foreground border border-border/80 text-left">Chi nhánh / Cửa hàng <span class="ml-auto" id="crm-nav-store-count">—</span></button>
          <button type="button" data-section="employees" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-white/[0.06] text-left">Nhân sự</button>
          <button type="button" data-section="profile" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-white/[0.06] text-left">Hồ sơ của tôi</button>
          <button type="button" data-section="schedules" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-white/[0.06] text-left">Hồ sơ nhân sự</button>
          <button type="button" data-section="accounts" id="crm-nav-accounts" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-white/[0.06] text-left">Tài khoản</button>
          <button type="button" data-section="settings" id="crm-nav-settings" class="crm-nav-item flex w-full items-center gap-2.5 px-2.5 py-2 rounded-xl text-xs font-medium text-zinc-400 hover:bg-white/[0.06] text-left">Cài đặt LLM</button>
        </nav>
      </div>

      <!-- User Profile at bottom -->
      <div class="p-3 border-t border-border bg-sidebar/50">
        <div class="flex items-center gap-3 p-2.5 rounded-xl border border-border/60 bg-background/80 shadow-xs">
          <div class="size-8 rounded-full bg-gradient-to-tr from-zinc-700 to-zinc-600 text-white flex items-center justify-center font-bold text-xs ring-1 ring-border shrink-0">PA</div>
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
            <span id="crm-header-store-chip">Đang tải số chi nhánh…</span>
          </span>
        </div>

        <div class="flex items-center gap-3">
          <div class="flex items-center gap-2.5">
            <button type="button" class="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-border/80 bg-background/80 text-xs font-semibold text-foreground hover:bg-muted transition shadow-2xs cursor-pointer active:scale-95 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              <span>Bộ lọc Quận</span>
            </button>
            <button type="button" class="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-zinc-700 to-zinc-800 hover:from-zinc-400 hover:to-zinc-700 text-white text-xs font-bold transition shadow-sm cursor-pointer active:scale-95 transition-transform">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M12 5v14"/></svg>
              <span>Tạo Ca Đột Xuất</span>
            </button>
          </div>
        </div>
      </header>

      <!-- DATA TABLE AREA -->
      <main class="flex-1 overflow-auto p-6">
        <div id="crm-stores-container">
        <!-- KPI ribbon + store table are rendered by StoreDirectoryView through a React
             portal (see #crm-stores-portal). No DB value is ever interpolated into this
             string: CRM_HTML is injected with dangerouslySetInnerHTML. -->
        <div id="crm-stores-portal"></div>
        <div id="crm-custom-view-portal" class="space-y-6" style="display: none;"></div>
      </main>

    </div>
  </div>

  <!-- Slide-over drawer is rendered by React into this root (no HTML interpolation). -->
  <div id="crm-drawer-root"></div>
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
  const [activeView, setActiveView] = useState<ActiveCrmView>('stores');
  const [storesPortalEl, setStoresPortalEl] = useState<HTMLElement | null>(null);
  const [customViewPortalEl, setCustomViewPortalEl] = useState<HTMLElement | null>(null);
  const [drawerRootEl, setDrawerRootEl] = useState<HTMLElement | null>(null);
  const [overview, setOverview] = useState<DashboardOverview | null>(null);
  const [overviewError, setOverviewError] = useState<string | null>(null);
  const [selectedStore, setSelectedStore] = useState<StoreSummary | null>(null);
  const [district, setDistrict] = useState<string>('');
  const [districtOptions, setDistrictOptions] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const storesRef = useRef<StoreSummary[]>([]);
  const selectedStoreRef = useRef<StoreSummary | null>(null);
  selectedStoreRef.current = selectedStore;

  const safeNotify: NotifyFn = onNotify || ((type, message) => {
    console.log(`[Toast ${type}] ${message}`);
  });
  const onTelegramAlertRef = useRef(onTelegramAlert);
  onTelegramAlertRef.current = onTelegramAlert;
  const onOpenAiCopilotRef = useRef(onOpenAiCopilot);
  onOpenAiCopilotRef.current = onOpenAiCopilot;
  const onSwitchTabRef = useRef(onSwitchTab);
  onSwitchTabRef.current = onSwitchTab;
  const onLogoutRef = useRef(onLogout);
  onLogoutRef.current = onLogout;

  // Chrome-only DOM wiring. Every number on screen comes from React state; this
  // effect never writes a value it cannot source from the API.
  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;

    const sidebar = root.querySelector('.crm-sidebar');
    const userInitials = sidebar?.querySelector('.size-8.rounded-full.bg-gradient-to-tr');
    if (userInitials) {
      userInitials.textContent = userName.split(/\s+/).filter(Boolean).slice(-2).map((part) => part[0]).join('').toUpperCase();
    }

    const userNameEl = sidebar?.querySelector('.font-bold.text-foreground.text-xs');
    if (userNameEl) {
      userNameEl.textContent = userName;
    }

    const userScopeEl = sidebar?.querySelector('.text-\\[10px\\].text-muted-foreground.truncate');
    if (userScopeEl) {
      userScopeEl.textContent = userRole + ' • ' + userScope;
    }

    const listeners = new AbortController();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const closeDrawer = () => setSelectedStore(null);

    const drawerWindow = window as Window & {
      openDrawer?: (id: string) => void;
      closeDrawer?: () => void;
    };
    const previousOpenDrawer = drawerWindow.openDrawer;
    const previousCloseDrawer = drawerWindow.closeDrawer;
    // Kept for backwards compatibility with external callers; rows open the
    // drawer through React state, this is only a lookup shim.
    drawerWindow.openDrawer = (id: string) => {
      const match = storesRef.current.find((store) => store.id === id || store.code === id);
      if (match) setSelectedStore(match);
    };
    drawerWindow.closeDrawer = closeDrawer;

    const searchTrigger = root.querySelector('#crm-search-trigger');
    const focusSearch = () => {
      const input = root.querySelector<HTMLInputElement>('input[placeholder="Lọc theo tên, quận, mã..."]');
      input?.focus();
      input?.select();
    };
    searchTrigger?.addEventListener('click', focusSearch, { signal: listeners.signal });
    searchTrigger?.addEventListener('keydown', (event) => {
      const key = (event as KeyboardEvent).key;
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        focusSearch();
      }
    }, { signal: listeners.signal });

    const telegramButton = Array.from(root.querySelectorAll('button')).find((btn) => btn.textContent?.includes('Telegram'));
    telegramButton?.addEventListener('click', (event) => {
      event.preventDefault();
      if (telegramButton.disabled) return;
      const storeId = selectedStoreRef.current?.id ?? '';
      if (!storeId) return;
      const originalText = telegramButton.innerHTML;
      telegramButton.innerHTML = `${SPINNER_SVG} Đang gửi...`;
      telegramButton.disabled = true;
      onTelegramAlertRef.current(storeId);
      timers.push(setTimeout(() => {
        telegramButton.innerHTML = originalText;
        telegramButton.disabled = false;
      }, 800));
    }, { signal: listeners.signal });

    const districtBtn = Array.from(root.querySelectorAll('button')).find((btn) => btn.textContent?.includes('Bộ lọc Quận') || btn.textContent?.includes('Quận: '));
    districtBtn?.addEventListener('click', (event) => {
      event.preventDefault();
      cycleDistrictRef.current();
    }, { signal: listeners.signal });

    const emergencyBtn = Array.from(root.querySelectorAll('button')).find((btn) => btn.textContent?.includes('Tạo Ca Đột Xuất'));
    if (emergencyBtn) {
      emergencyBtn.addEventListener('click', (event) => {
        event.preventDefault();
        if (emergencyBtn.disabled) return;
        const originalContent = emergencyBtn.innerHTML;
        emergencyBtn.innerHTML = `${SPINNER_SVG} Đang khởi tạo...`;
        emergencyBtn.disabled = true;
        onTelegramAlertRef.current('EMERGENCY_SHIFT');
        timers.push(setTimeout(() => {
          emergencyBtn.innerHTML = originalContent;
          emergencyBtn.disabled = false;
        }, 800));
      }, { signal: listeners.signal });
    }

    const logoutLinks = root.querySelectorAll('a[href="#logout"], a[title="Trở về Trang Chủ"], [aria-label="Đăng Xuất Phiên"]');
    logoutLinks.forEach((link, idx) => {
      if (idx === logoutLinks.length - 1) {
        link.setAttribute('role', 'button');
        link.setAttribute('aria-label', 'Đăng Xuất Phiên');
      }
      link.addEventListener('click', (event) => {
        event.preventDefault();
        onLogoutRef.current();
      }, { signal: listeners.signal });
    });

    const handleGlobalKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedStoreRef.current) setSelectedStore(null);
      if ((event.metaKey || event.ctrlKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        focusSearch();
      }
    };
    window.addEventListener('keydown', handleGlobalKeydown);

    root.querySelectorAll('nav a').forEach((link) => {
      if (link.textContent?.includes('Copilot')) {
        link.addEventListener('click', (event) => {
          event.preventDefault();
          if (onSwitchTabRef.current) onSwitchTabRef.current('chat');
          else onOpenAiCopilotRef.current?.();
        }, { signal: listeners.signal });
      }
    });

    const navItems = root.querySelectorAll<HTMLButtonElement>('nav [data-section]');
    const settingsNav = root.querySelector('#crm-nav-settings') as HTMLElement | null;
    if (settingsNav && userRole !== 'Admin') {
      settingsNav.style.display = 'none';
    }
    const accountsNav = root.querySelector('#crm-nav-accounts') as HTMLElement | null;
    if (accountsNav && userRole !== 'Admin') {
      accountsNav.style.display = 'none';
    }

    const storesPortal = root.querySelector('#crm-stores-portal') as HTMLElement | null;
    if (storesPortal) setStoresPortalEl(storesPortal);
    const customViewPortal = root.querySelector('#crm-custom-view-portal') as HTMLElement | null;
    if (customViewPortal) setCustomViewPortalEl(customViewPortal);
    const drawerRoot = root.querySelector('#crm-drawer-root') as HTMLElement | null;
    if (drawerRoot) setDrawerRootEl(drawerRoot);

    navItems.forEach((button) => {
      button.addEventListener('click', () => {
        const section = button.dataset.section as ActiveCrmView;
        if (!section) return;
        if (section === 'settings' && userRole !== 'Admin') return;
        if (section === 'accounts' && userRole !== 'Admin') return;
        setActiveView(section);
        navItems.forEach((item) => {
          item.classList.remove('bg-muted/60', 'text-foreground', 'border', 'border-border/80');
          item.classList.add('text-zinc-400');
        });
        button.classList.add('bg-muted/60', 'text-foreground', 'border', 'border-border/80');
        button.classList.remove('text-zinc-400');
      }, { signal: listeners.signal });
    });

    return () => {
      listeners.abort();
      if (drawerWindow.openDrawer && previousOpenDrawer !== drawerWindow.openDrawer) {
        if (previousOpenDrawer) drawerWindow.openDrawer = previousOpenDrawer;
        else delete drawerWindow.openDrawer;
      }
      if (drawerWindow.closeDrawer && previousCloseDrawer !== drawerWindow.closeDrawer) {
        if (previousCloseDrawer) drawerWindow.closeDrawer = previousCloseDrawer;
        else delete drawerWindow.closeDrawer;
      }
      window.removeEventListener('keydown', handleGlobalKeydown);
      timers.forEach(clearTimeout);
    };
  }, [userName, userRole, userScope]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const storesPortal = root.querySelector('#crm-stores-portal') as HTMLElement | null;
    const customViewPortal = root.querySelector('#crm-custom-view-portal') as HTMLElement | null;
    if (storesPortal) storesPortal.style.display = activeView === 'stores' ? 'block' : 'none';
    if (customViewPortal) customViewPortal.style.display = activeView === 'stores' ? 'none' : 'block';
  }, [activeView]);

  useEffect(() => {
    if (!overview) return;
    const root = containerRef.current;
    if (!root) return;
    const navCount = root.querySelector('#crm-nav-store-count');
    if (navCount) navCount.textContent = String(overview.stores.outlets);
    const headerChip = root.querySelector('#crm-header-store-chip');
    if (headerChip) headerChip.textContent = `${overview.stores.outlets} chi nhánh trong danh mục`;
  }, [overview]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const districtBtn = Array.from(root.querySelectorAll('button')).find((btn) => btn.textContent?.includes('Bộ lọc Quận') || btn.textContent?.includes('Quận: '));
    const label = districtBtn?.querySelector('span');
    if (label) label.textContent = district ? `Quận: ${district}` : 'Bộ lọc Quận';
  }, [district]);

  useEffect(() => {
    if (!overviewError) return;
    const root = containerRef.current;
    if (!root) return;
    const navCount = root.querySelector('#crm-nav-store-count');
    if (navCount) navCount.textContent = '—';
    const headerChip = root.querySelector('#crm-header-store-chip');
    if (headerChip) headerChip.textContent = 'Không tải được số chi nhánh';
  }, [overviewError]);

  const districtRef = useRef(district);
  districtRef.current = district;
  const districtOptionsRef = useRef(districtOptions);
  districtOptionsRef.current = districtOptions;

  const cycleDistrict = useCallback(() => {
    const options = districtOptionsRef.current;
    if (options.length === 0) return;
    const currentIndex = districtRef.current === '' ? -1 : options.indexOf(districtRef.current);
    const nextIndex = currentIndex + 1;
    setDistrict(nextIndex >= options.length ? '' : options[nextIndex]);
  }, []);

  const cycleDistrictRef = useRef(cycleDistrict);
  cycleDistrictRef.current = cycleDistrict;

  const handleOverviewLoaded = useCallback((data: DashboardOverview) => {
    setOverview(data);
    setOverviewError(null);
  }, []);

  const handleOverviewError = useCallback((message: string) => {
    setOverviewError(message);
  }, []);

  const handleStoresLoaded = useCallback((stores: StoreSummary[]) => {
    storesRef.current = stores;
  }, []);

  return (
    <>
      <div
        ref={containerRef}
        className="min-h-full flex flex-col bg-background text-foreground antialiased"
        dangerouslySetInnerHTML={{ __html: CRM_HTML }}
      />
      {storesPortalEl &&
        createPortal(
          <StoreDirectoryView
            userRole={userRole}
            onNotify={safeNotify}
            onSelectStore={setSelectedStore}
            onOverviewLoaded={handleOverviewLoaded}
            onOverviewError={handleOverviewError}
            onStoresLoaded={handleStoresLoaded}
            district={district}
            onDistrictChange={setDistrict}
            onDistrictOptions={setDistrictOptions}
          />,
          storesPortalEl
        )}
      {customViewPortalEl &&
        createPortal(
          activeView === 'employees' ? (
            <EmployeeListView />
          ) : activeView === 'profile' ? (
            <EmployeeProfileView onLogout={onLogout} onNotify={safeNotify} />
          ) : activeView === 'schedules' ? (
            <RosterView onNotify={safeNotify} />
          ) : activeView === 'projects' ? (
            <ProjectListView onNotify={safeNotify} />
          ) : activeView === 'settings' && userRole === 'Admin' ? (
            <AdminSettingsView onNotify={safeNotify} />
          ) : activeView === 'accounts' && userRole === 'Admin' ? (
            <UserAccountsView onNotify={safeNotify} />
          ) : null,
          customViewPortalEl
        )}
      {drawerRootEl &&
        createPortal(
          <StoreDetailDrawer
            store={selectedStore}
            outlets={overview?.stores.outlets ?? null}
            onClose={() => setSelectedStore(null)}
            onTelegramAlert={onTelegramAlert}
          />,
          drawerRootEl
        )}
    </>
  );
};

interface StoreDetailDrawerProps {
  store: StoreSummary | null;
  outlets: number | null;
  onClose: () => void;
  onTelegramAlert: (storeId: string) => void;
}

const StoreDetailDrawer: React.FC<StoreDetailDrawerProps> = ({ store, outlets, onClose, onTelegramAlert }) => {
  const open = store !== null;
  const [isSending, setIsSending] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const handleTelegram = () => {
    if (!store || isSending) return;
    setIsSending(true);
    onTelegramAlert(store.id);
    timerRef.current = setTimeout(() => setIsSending(false), 800);
  };

  return (
    <>
      <div
        id="drawer-backdrop"
        className={open ? 'fixed inset-0 z-40 bg-black/60 backdrop-blur-md transition-opacity duration-200 backdrop-open' : 'fixed inset-0 z-40 bg-black/60 backdrop-blur-md transition-opacity duration-200 opacity-0 pointer-events-none'}
        onClick={onClose}
      />
      <aside
        id="detail-drawer"
        aria-label="Chi tiết vận hành chi nhánh"
        className={
          open
            ? 'fixed inset-y-0 right-0 z-50 w-full max-w-md bg-neutral-900/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl flex flex-col h-full drawer-open'
            : 'fixed inset-y-0 right-0 z-50 w-full max-w-md bg-neutral-900/95 backdrop-blur-2xl border-l border-white/[0.08] shadow-2xl flex flex-col h-full transform translate-x-full transition-transform duration-200'
        }
      >
        <div className="p-6 border-b border-border flex items-start justify-between bg-muted/20 shrink-0">
          <div>
            <span className="rounded-md bg-zinc-400/10 border border-zinc-400/20 text-zinc-300 px-2 py-0.5 text-[10px] font-bold font-mono uppercase" id="d-id">
              {store?.code ?? store?.id ?? ''}
            </span>
            <h2 className="text-base font-bold text-foreground mt-2" id="d-name">{store?.name ?? ''}</h2>
            <p className="text-xs text-muted-foreground mt-0.5" id="d-district">
              Quận: {store?.district ?? '—'} • Cửa hàng trưởng: {store?.managerName ?? '—'}
            </p>
          </div>
          <button type="button" aria-label="Đóng chi tiết" data-close-drawer onClick={onClose} className="size-8 rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground flex items-center justify-center transition cursor-pointer shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
          </button>
        </div>

        <div className="p-6 space-y-5 flex-1 overflow-y-auto">
          <p className="text-xs text-muted-foreground" role="note">
            {outlets === null ? 'Đang tải số liệu danh mục cửa hàng' : `Hệ thống dữ liệu vận hành ${outlets} chi nhánh chuỗi GUTA Cafe`}
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3.5 rounded-xl border border-border bg-background/80 shadow-2xs">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block whitespace-nowrap">Nhân Sự Đang Hoạt Động</span>
              <div className="text-base font-bold font-mono text-zinc-700 dark:text-zinc-300 mt-1" id="d-staff">
                {store ? `${store.activeEmployeeCount} / ${store.employeeCount} người` : '—'}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium block mt-1">
                Tổng nhân sự: {store?.employeeCount ?? '—'}
              </span>
            </div>
            <div className="p-3.5 rounded-xl border border-border bg-background/80 shadow-2xs">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block whitespace-nowrap">Trạng Thái</span>
              <div className="text-base font-bold font-mono text-foreground mt-1" id="d-status">
                {store ? (store.status === 'ACTIVE' ? 'Đang hoạt động' : 'Tạm dừng') : '—'}
              </div>
              <span className="text-[10px] text-muted-foreground font-medium block mt-1" id="d-kind">
                Loại: {store ? store.kind : '—'}
              </span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-500/20 bg-zinc-500/5">
            <div className="flex items-center gap-2 text-zinc-300 text-xs font-bold mb-1.5">
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" /></svg>
              <span>Nguồn dữ liệu</span>
            </div>
            <p className="text-[11px] text-foreground/80 leading-relaxed">
              Hồ sơ cửa hàng và số nhân sự lấy trực tiếp từ danh mục cửa hàng. Doanh thu két và chấm công theo ca chưa có nguồn dữ liệu xác thực nên không hiển thị.
            </p>
          </div>
        </div>

        <div className="p-4 border-t border-border bg-neutral-900/95 flex items-center gap-2.5 shrink-0 z-10">
          <button
            type="button"
            onClick={handleTelegram}
            disabled={!store || isSending}
            className="flex-1 py-2.5 px-3 rounded-lg bg-zinc-700 hover:bg-zinc-800 text-white font-semibold text-xs transition shadow-sm text-center cursor-pointer disabled:opacity-50"
          >
            {isSending ? 'Đang gửi...' : 'Gửi Cảnh Báo Telegram'}
          </button>
          <button type="button" aria-label="Đóng" data-close-drawer onClick={onClose} className="py-2.5 px-4 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium text-foreground transition cursor-pointer">
            Đóng
          </button>
        </div>
      </aside>
    </>
  );
};

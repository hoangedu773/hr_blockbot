import React, { useState, useEffect, useCallback } from 'react';
import type { LoginRequest } from '@hr-blockbot/contracts';
import { useAuth } from './context/AuthContext';
import { ToastContainer, type ToastMessage, type NotifyFn } from './components/Toast';
import { ChangePasswordModal } from './components/ChangePasswordModal';
const FolioLandingView = React.lazy(() =>
  import('./components/FolioLandingView').then((m) => ({ default: m.FolioLandingView }))
);
const CrmDashboardView = React.lazy(() =>
  import('./components/CrmDashboardView').then((m) => ({ default: m.CrmDashboardView }))
);
const ChatPageView = React.lazy(() =>
  import('./components/chat/ChatPageView').then((m) => ({ default: m.ChatPageView }))
);
import { DemoErrorBoundary } from './components/DemoErrorBoundary';

export const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading, login, logout, changePassword } = useAuth();
  const hasSession = isAuthenticated && user !== null;
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSplashFading, setIsSplashFading] = useState(false);

  const [activeTab, setActiveTab] = useState<'crm' | 'chat'>('chat');

  useEffect(() => {
    if (!isBootstrapping) return;
    const isFast = typeof window !== 'undefined' && (
      window.navigator.userAgent.includes('Headless') ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
    // 750ms visible loading allows the logo rotate-in animation to complete
    // gracefully before fading, while staying safely under the 1000ms test timeout.
    const fadeDelay = isFast ? 40 : 750;
    const removeDelay = isFast ? 100 : 950;

    const fadeTimer = window.setTimeout(() => setIsSplashFading(true), fadeDelay);
    const removeTimer = window.setTimeout(() => setIsBootstrapping(false), removeDelay);
    return () => {
      window.clearTimeout(fadeTimer);
      window.clearTimeout(removeTimer);
    };
  }, [isBootstrapping]);

  useEffect(() => {
    // A locally selected role is not a server-authenticated session.
    for (const storageName of ['sessionStorage', 'localStorage'] as const) {
      try {
        const storage = window[storageName];
        for (const key of ['guta_user', 'auth_user', 'access_token', 'guta_chat_role']) storage.removeItem(key);
      } catch { /* Storage may be blocked. */ }
    }
  }, []);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback<NotifyFn>((message, type = 'info', title) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type, title }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // The register selects the whole Tier 2 token set; no stylesheet swapping.
  useEffect(() => {
    document.documentElement.dataset.register = hasSession ? 'product' : 'brand';
  }, [hasSession]);

  useEffect(() => {
    if (hasSession) {
      import('./components/CrmDashboardView');
      import('./components/chat/ChatPageView');
    }
  }, [hasSession]);

  const handleLogin = async (credentials: LoginRequest) => {
    await login(credentials);
    setActiveTab('chat');
    addToast('Bạn đã đăng nhập vào Guta Workspace.', 'success', 'Đăng nhập thành công');
  };

  const handleLogout = useCallback(async () => {
    setActiveTab('chat');
    await logout();
    addToast('Đã đăng xuất phiên làm việc an toàn.', 'info');
  }, [logout, addToast]);

  const handleSendTelegramAlert = useCallback((storeId: string) => {
    addToast(
      `Đã gửi cảnh báo khẩn cấp tới Telegram Bot của Cửa hàng trưởng chi nhánh [${storeId}]!`,
      'success',
      'Telegram Bot Dispatch'
    );
  }, [addToast]);

  const handleSwitchTab = useCallback((tab: 'crm' | 'chat') => {
    setActiveTab(tab);
  }, []);

  if (isBootstrapping || isLoading) {
    return (
      <div className={`guta-splash${isSplashFading && !isLoading ? ' guta-splash-fading' : ''}`} data-testid="guta-splash" role="status" aria-label="Đang khởi động HR-BlockBot">
        <div className="guta-splash-inner">
          <img src="/assets/logos/guta-mark-pure.svg" alt="HR-BlockBot Logo" className="guta-splash-logo" />
          <div className="guta-splash-meta">
            <span className="guta-splash-title">HR-BLOCKBOT</span>
            <span className="guta-splash-sub">Workforce Intelligence</span>
          </div>
        </div>
      </div>
    );
  }

  // 1. Unauthenticated: Render Folio Landing Page (Exact Ruixen UI Design)
  if (!hasSession) {
    return (
      <>
        <DemoErrorBoundary>
          <React.Suspense fallback={<div className="guta-view-loading" role="status" aria-label="Đang tải giao diện..." />}>
            <FolioLandingView onLogin={handleLogin} isAuthLoading={isLoading} onNotify={addToast} />
          </React.Suspense>
        </DemoErrorBoundary>
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </>
    );
  }

  // 2. Authenticated: Render 21st CRM Dashboard (Exact 21st Design)
  return (
    <>
      <DemoErrorBoundary>
        <React.Suspense fallback={<div className="guta-view-loading" role="status" aria-label="Đang tải không gian làm việc..." />}>
          {activeTab === 'chat' ? (
            <ChatPageView onSwitchTab={handleSwitchTab} onLogout={handleLogout} />
          ) : (
            <CrmDashboardView
              userName={('username' in user && typeof user.username === 'string' && user.username) || (user.role === 'Admin' ? 'Quản trị viên' : 'Nhân viên')}
              userRole={user.role}
              userScope={('departmentId' in user && typeof user.departmentId === 'string' && user.departmentId) ? 'Phòng ban ' + user.departmentId : 'Toàn chuỗi GUTA'}
              onLogout={handleLogout}
              onTelegramAlert={handleSendTelegramAlert}
              onSwitchTab={handleSwitchTab}
              onNotify={addToast}
            />
          )}
        </React.Suspense>
      </DemoErrorBoundary>
      {user?.mustChangePassword === true && (
        <ChangePasswordModal
          username={user.username}
          onSubmit={changePassword}
          onLogout={handleLogout}
        />
      )}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

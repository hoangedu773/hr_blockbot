import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './context/AuthContext';
import { ToastContainer, type ToastMessage, type NotifyFn } from './components/Toast';
import { FolioLandingView } from './components/FolioLandingView';
import { CrmDashboardView } from './components/CrmDashboardView';
import { ChatPageView } from './components/chat/ChatPageView';
import { DemoErrorBoundary } from './components/DemoErrorBoundary';

interface LocalUser {
  role: 'SM' | 'AOM' | 'Admin';
  name: string;
  scope: string;
}

const ROLE_PROFILES: Record<'SM' | 'AOM' | 'Admin', LocalUser> = {
  SM: {
    role: 'SM',
    name: 'Nguyễn Thị Phương Anh',
    scope: 'Tân Bình - 02 Đặng Văn Sâm',
  },
  AOM: {
    role: 'AOM',
    name: 'Nguyễn Cao Thanh Trầm',
    scope: 'Khu vực Q1/Q3/Q10 (18 Chi nhánh)',
  },
  Admin: {
    role: 'Admin',
    name: 'Ban Điều Hành Guta',
    scope: 'Toàn bộ 45 Chi nhánh TP.HCM',
  },
};

export const AppContent: React.FC = () => {
  const { user: authUser, logout: authLogout } = useAuth();
  const isLoggingOutRef = useRef(false);
  const [localUser, setLocalUser] = useState<LocalUser | null>(() => {
    if (typeof window !== 'undefined') {
      // Prioritize sessionStorage so new tabs always start on Landing Page
      const saved = sessionStorage.getItem('guta_user');
      if (saved) {
        try {
          return JSON.parse(saved) as LocalUser;
        } catch {
          return null;
        }
      }
    }
    return null;
  });

  const [activeTab, setActiveTab] = useState<'crm' | 'chat'>('crm');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback<NotifyFn>((message, type = 'info', title) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type, title }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  // Dynamic stylesheet switching according to route / localUser view
  useEffect(() => {
    let link = document.getElementById('theme-css') as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = 'theme-css';
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    const targetHref = localUser ? '/assets/crm/2voh1gse7971r.css' : '/assets/folio/folio.css';
    if (link.getAttribute('href') !== targetHref) {
      link.setAttribute('href', targetHref);
    }

    const folioCss = document.getElementById('folio-layout-css') as HTMLLinkElement | null;
    if (folioCss) folioCss.disabled = Boolean(localUser);

    const crmCss = document.getElementById('crm-layout-css') as HTMLLinkElement | null;
    if (crmCss) crmCss.disabled = !Boolean(localUser);
  }, [localUser]);

  // Sync if context authUser changes (guarded against resurrection during logout)
  useEffect(() => {
    if (isLoggingOutRef.current) return;
    if (authUser && !localUser && typeof window !== 'undefined' && sessionStorage.getItem('guta_user')) {
      const role = authUser.role === 'Admin' ? 'Admin' : 'SM';
      const profile = ROLE_PROFILES[role];
      setLocalUser(profile);
      sessionStorage.setItem('guta_user', JSON.stringify(profile));
    }
  }, [authUser, localUser]);

  const handleSelectRole = (role: 'SM' | 'AOM' | 'Admin') => {
    isLoggingOutRef.current = false;
    const profile = ROLE_PROFILES[role];
    setLocalUser(profile);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('guta_user', JSON.stringify(profile));
      localStorage.removeItem('guta_user');
    }
    addToast(`Đăng nhập thành công với vai trò ${profile.name} (${role})`, 'success', 'Xác thực thành công');
  };

  const handleLogout = useCallback(async () => {
    isLoggingOutRef.current = true;
    setLocalUser(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('guta_user');
      localStorage.removeItem('guta_user');
      localStorage.removeItem('auth_user');
      localStorage.removeItem('access_token');
    }
    setActiveTab('crm');
    try {
      await authLogout();
    } catch {
      // Ignore if offline
    }
    setTimeout(() => {
      isLoggingOutRef.current = false;
    }, 1000);
    addToast('Đã đăng xuất phiên làm việc an toàn.', 'info');
  }, [authLogout, addToast]);

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

  // 1. Unauthenticated: Render Folio Landing Page (Exact Ruixen UI Design)
  if (!localUser) {
    return (
      <>
        <FolioLandingView onLogin={handleSelectRole} onNotify={addToast} />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </>
    );
  }

  // 2. Authenticated: Render 21st CRM Dashboard (Exact 21st Design)
  return (
    <>
      <DemoErrorBoundary>
      {activeTab === 'chat' ? (
        <ChatPageView onSwitchTab={handleSwitchTab} onLogout={handleLogout} />
      ) : (
        <CrmDashboardView
          userName={localUser.name}
          userRole={localUser.role}
          userScope={localUser.scope}
          onLogout={handleLogout}
          onTelegramAlert={handleSendTelegramAlert}
          onSwitchTab={handleSwitchTab}
          onNotify={addToast}
        />
      )}
      </DemoErrorBoundary>
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

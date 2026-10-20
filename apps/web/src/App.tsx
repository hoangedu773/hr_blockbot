import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MobileBottomNav } from './components/MobileBottomNav';
import { ToastContainer, type NotifyFn, type ToastMessage } from './components/Toast';
import { LoginModal } from './components/LoginModal';
import { RosterView } from './components/RosterView';
import { ProjectListView } from './components/ProjectListView';
import { AdminSettingsView } from './components/AdminSettingsView';
import { ChatPanel } from './components/ChatPanel';
import { EmployeeProfileView } from './components/EmployeeProfileView';

interface ViewMeta {
  title: string;
  subtitle: string;
}

const VIEW_META: Record<string, ViewMeta> = {
  employees: {
    title: 'Hồ Sơ Nhân Sự',
    subtitle: 'F1 · allowlist DTO, phạm vi phòng ban theo JWT, hàng đợi duyệt field nhạy cảm',
  },
  projects: {
    title: 'Vòng Đời Đề Tài',
    subtitle: 'F2 · DRAFT → ASSIGNED → IN_PROGRESS → PENDING_REVIEW → COMPLETED',
  },
  chat: {
    title: 'Trợ Lý Chính Sách',
    subtitle: 'F3 · RAG có trích dẫn, từ chối khi thiếu bằng chứng, confirm trước khi ghi',
  },
  settings: {
    title: 'Cấu Hình LLM Provider',
    subtitle: 'ADR-017 · key mã hoá một chiều, client chỉ nhận keyHint',
  },
  profile: {
    title: 'Hồ Sơ Của Tôi',
    subtitle: 'F1 · own scope, thông tin thường sửa trực tiếp, field nhạy cảm qua duyệt',
  },
};

export const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [activeNav, setActiveNav] = useState<string>('employees');
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback<NotifyFn>((message, type = 'info', title) => {
    const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [...prev, { id, message, type, title }]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  useEffect(() => {
    setActiveNav(user?.role === 'Employee' ? 'profile' : 'employees');
  }, [user?.role]);

  if (authLoading) {
    return (
      <div
        style={{
          display: 'flex',
          width: '100%',
          height: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'var(--bg)',
          color: 'var(--text-muted)',
        }}
      >
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#f8fafc', marginBottom: '8px' }}>GUTA CAFE HR BLOCKBOT</div>
          <p style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>Đang kiểm tra phiên làm việc…</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div style={{ width: '100%', height: '100dvh', background: 'var(--bg)' }}>
        <LoginModal isOpen={true} />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </div>
    );
  }

  const isAdmin = user.role === 'Admin';
  const availableNav = isAdmin
    ? ['employees', 'projects', 'chat', 'settings']
    : ['profile', 'projects', 'chat'];
  const nav = availableNav.includes(activeNav) ? activeNav : availableNav[0];
  const meta = VIEW_META[nav] ?? VIEW_META.employees;

  const renderView = () => {
    switch (nav) {
      case 'employees':
        return isAdmin ? <RosterView onNotify={addToast} /> : <EmployeeProfileView onLogout={logout} onNotify={addToast} />;
      case 'profile':
        return <EmployeeProfileView onLogout={logout} onNotify={addToast} />;
      case 'projects':
        return <ProjectListView onNotify={addToast} />;
      case 'chat':
        return <ChatPanel />;
      case 'settings':
        return isAdmin ? <AdminSettingsView onNotify={addToast} /> : <div className="empty">403 — RBAC_DENIED</div>;
      default:
        return null;
    }
  };

  return (
    <div style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden' }}>
      <Sidebar role={user.role} activeNav={nav} onSelectNav={setActiveNav} />

      <main>
        <Header
          title={meta.title}
          subtitle={meta.subtitle}
          user={user}
          onLogout={() => {
            void logout();
            addToast('Đã đăng xuất và xoá access token khỏi bộ nhớ.', 'info');
          }}
        />

        <div className="content-body">{renderView()}</div>
      </main>

      <MobileBottomNav role={user.role} activeTab={nav} onSelectTab={setActiveNav} />

      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

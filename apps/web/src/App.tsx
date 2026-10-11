import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { PromptChips } from './components/PromptChips';
import { MetricCards } from './components/MetricCards';
import { VisualTimeline } from './components/VisualTimeline';
import { TwoColumnGrid } from './components/TwoColumnGrid';
import { AiCopilotBar } from './components/AiCopilotBar';
import { StaffDrawer } from './components/StaffDrawer';
import { MobileBottomNav } from './components/MobileBottomNav';
import { AiCopilotModal } from './components/AiCopilotModal';
import { AddShiftModal } from './components/AddShiftModal';
import { ToastContainer, ToastMessage } from './components/Toast';
import { LoginModal } from './components/LoginModal';
import { EmployeeProfileView } from './components/EmployeeProfileView';
import { EmployeeListView } from './components/EmployeeListView';
import {
  fetchStores,
  fetchSchedules,
  fetchCorrections,
  fetchCashCounts,
  approveCorrection,
  rejectCorrection,
  Store,
  ScheduleEntry,
  AttendanceCorrection,
  CashCount,
} from './services/api';

export const AppContent: React.FC = () => {
  const { user, isAuthenticated, isLoading: authLoading, logout } = useAuth();
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStore, setActiveStore] = useState<string>('');
  const [activeNav, setActiveNav] = useState<string>('schedule');
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [cashCounts, setCashCounts] = useState<CashCount[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // In-app Modal States
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiModalQuery, setAiModalQuery] = useState<string>('');
  const [isAddShiftOpen, setIsAddShiftOpen] = useState<boolean>(false);

  // Toast Notification State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info', title?: string) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts((prev) => [...prev, { id, message, type, title }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const loadData = async (showNotification = false) => {
    if (!isAuthenticated) return;
    setIsLoading(true);
    setApiError(null);
    try {
      const [st, sc, cr, cs] = await Promise.all([
        fetchStores().catch(() => []),
        fetchSchedules(activeStore || undefined).catch(() => []),
        fetchCorrections().catch(() => []),
        fetchCashCounts().catch(() => []),
      ]);
      setStores(st);
      if (!activeStore && st.length > 0) {
        setActiveStore(st[0].store_name);
      }
      setSchedules(sc);
      setCorrections(cr);
      setCashCounts(cs);
      if (showNotification) {
        addToast(
          `Đã đồng bộ dữ liệu live API (${sc.length} ca trực, ${cr.length} phiếu công)`,
          'success',
          'Đồng Bộ Thành Công'
        );
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể tải dữ liệu từ máy chủ API';
      setApiError(msg);
      addToast(msg, 'error', 'Lỗi API');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (isAuthenticated) {
      loadData();
    }
  }, [activeStore, isAuthenticated]);

  const handleApprove = async (id: number | string) => {
    try {
      await approveCorrection(id);
      setCorrections((prev) =>
        prev.map((c) =>
          c.id === id || c.employee_code === id || (c as { _id?: string })._id === id
            ? { ...c, status: 'APPROVED' }
            : c
        )
      );
      addToast(`Đã duyệt bù công thành công cho phiếu giải trình #${id}`, 'success', 'Duyệt Công Hoàn Tất');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể duyệt phiếu giải trình';
      addToast(msg, 'error', 'Lỗi Duyệt Phiếu');
    }
  };

  const handleReject = async (id: number | string) => {
    try {
      await rejectCorrection(id);
      setCorrections((prev) =>
        prev.map((c) =>
          c.id === id || c.employee_code === id || (c as { _id?: string })._id === id
            ? { ...c, status: 'REJECTED' }
            : c
        )
      );
      addToast(`Đã từ chối phiếu #${id}`, 'warning', 'Đã Từ Chối Phiếu');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Không thể từ chối phiếu giải trình';
      addToast(msg, 'error', 'Lỗi Từ Chối Phiếu');
    }
  };

  const handleAiMessage = (query: string) => {
    setAiModalQuery(query);
    setIsAiModalOpen(true);
  };

  if (authLoading) {
    return (
      <div style={{ display: 'flex', width: '100%', height: '100dvh', alignItems: 'center', justifyContent: 'center', background: 'var(--bg)', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '18px', fontWeight: 700, color: '#fff', marginBottom: '8px' }}>GUTA CAFE HR BLOCKBOT</div>
          <p style={{ fontSize: '12px', fontFamily: 'var(--mono)' }}>Đang kiểm tra phiên làm việc...</p>
        </div>
      </div>
    );
  }

  // Nếu chưa đăng nhập: Hiển thị màn hình Login
  if (!isAuthenticated) {
    return (
      <div style={{ width: '100%', height: '100dvh', background: 'var(--bg)' }}>
        <LoginModal isOpen={true} />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </div>
    );
  }

  // RBAC: Nếu là Employee -> Chỉ xem hồ sơ cá nhân và ca của chính mình
  if (user?.role === 'Employee') {
    return (
      <div style={{ width: '100%', height: '100dvh', overflowY: 'auto', background: 'var(--bg)' }}>
        <EmployeeProfileView onLogout={logout} />
        <ToastContainer toasts={toasts} onDismiss={removeToast} />
      </div>
    );
  }

  // RBAC: Admin Dashboard
  const pendingCorrections = corrections.filter((c) => c.status === 'PENDING');
  const currentStoreObj = stores.find((s) => s.store_name === activeStore);
  const employeeCount = currentStoreObj ? currentStoreObj.employee_count : null;
  const cashFund = cashCounts.length > 0 ? cashCounts[0].cash_total_vnd : null;

  return (
    <div style={{ display: 'flex', width: '100%', height: '100dvh', overflow: 'hidden' }}>
      {/* Desktop Sidebar */}
      <Sidebar
        stores={stores}
        activeStore={activeStore}
        onSelectStore={(st) => {
          setActiveStore(st);
          addToast(`Đã chuyển sang điểm bán: ${st}`, 'info');
        }}
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        pendingCorrectionCount={pendingCorrections.length}
      />

      {/* Main Content Area */}
      <main>
        <Header
          storeName={activeStore || 'Điểm Bán GUTA CAFE'}
          onSync={() => loadData(true)}
          onAddShift={() => setIsAddShiftOpen(true)}
          user={user}
          onLogout={logout}
        />

        <div className="content-body">
          {apiError && (
            <div
              style={{
                padding: '12px 16px',
                borderRadius: '8px',
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                color: '#fca5a5',
                fontSize: '12px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <span>⚠️ Lỗi API: {apiError}</span>
              <button
                onClick={() => loadData(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #fca5a5',
                  color: '#fca5a5',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                Thử lại
              </button>
            </div>
          )}

          {activeNav === 'employees' ? (
            <EmployeeListView />
          ) : (
            <>
              <PromptChips onSelectPrompt={handleAiMessage} />

              <MetricCards
                employeeCount={employeeCount}
                shiftsTodayCount={schedules.length}
                pendingCorrectionCount={pendingCorrections.length}
                cashFund={cashFund}
              />

              <VisualTimeline
                schedules={schedules}
                onSelectEmployee={setSelectedSchedule}
              />

              <TwoColumnGrid
                cashCounts={cashCounts}
                corrections={corrections}
                onApproveCorrection={handleApprove}
                onRejectCorrection={handleReject}
              />

              <AiCopilotBar onSendMessage={handleAiMessage} isLoading={isLoading} />
            </>
          )}
        </div>
      </main>

      {/* Slide-over Drawer for employee details */}
      <StaffDrawer
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
      />

      {/* Custom Dark AI Copilot Modal Window */}
      <AiCopilotModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        query={aiModalQuery}
      />

      {/* Custom Dark Add Shift Modal Window */}
      <AddShiftModal
        isOpen={isAddShiftOpen}
        onClose={() => setIsAddShiftOpen(false)}
        storeName={activeStore}
      />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeNav}
        onSelectTab={setActiveNav}
        onOpenAi={() => handleAiMessage('Tra cứu nhanh qua AI Copilot')}
      />

      {/* In-App Toast System */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};

export const App: React.FC = () => {
  return <AppContent />;
};

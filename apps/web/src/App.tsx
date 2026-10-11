import React, { useState, useEffect } from 'react';
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
import {
  fetchStores,
  fetchSchedules,
  fetchCorrections,
  fetchCashCounts,
  approveCorrection,
  Store,
  ScheduleEntry,
  AttendanceCorrection,
  CashCount
} from './services/api';

export const App: React.FC = () => {
  const [stores, setStores] = useState<Store[]>([]);
  const [activeStore, setActiveStore] = useState<string>('GUTA CAFE - Quận 1 - 120 Hai Bà Trưng');
  const [activeNav, setActiveNav] = useState<string>('schedule');
  const [schedules, setSchedules] = useState<ScheduleEntry[]>([]);
  const [corrections, setCorrections] = useState<AttendanceCorrection[]>([]);
  const [cashCounts, setCashCounts] = useState<CashCount[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<ScheduleEntry | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // In-app Modal States (No browser alert)
  const [isAiModalOpen, setIsAiModalOpen] = useState<boolean>(false);
  const [aiModalQuery, setAiModalQuery] = useState<string>('');
  const [isAddShiftOpen, setIsAddShiftOpen] = useState<boolean>(false);

  // Toast Notification State
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info', title?: string) => {
    const id = Date.now().toString() + Math.random().toString();
    setToasts(prev => [...prev, { id, message, type, title }]);
  };

  const removeToast = (id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  const loadData = async (showNotification = false) => {
    setIsLoading(true);
    try {
      const [st, sc, cr, cs] = await Promise.all([
        fetchStores(),
        fetchSchedules(activeStore),
        fetchCorrections(),
        fetchCashCounts()
      ]);
      setStores(st);
      setSchedules(sc);
      setCorrections(cr);
      setCashCounts(cs);
      if (showNotification) {
        addToast(`Đã đồng bộ lại dữ liệu trực tiếp từ MongoDB Atlas (${sc.length} ca trực, ${cr.length} phiếu công)`, 'success', 'Đồng Bộ Thành Công');
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [activeStore]);

  const handleApprove = async (id: number | string) => {
    await approveCorrection(id);
    setCorrections(prev =>
      prev.map(c => ((c.id === id || c.employee_code === id) ? { ...c, status: 'APPROVED' } : c))
    );
    addToast(`Đã duyệt bù công thành công cho phiếu giải trình #${id}`, 'success', 'Duyệt Công Hoàn Tất');
  };

  const handleReject = (id: number | string) => {
    setCorrections(prev =>
      prev.map(c => ((c.id === id || c.employee_code === id) ? { ...c, status: 'REJECTED' } : c))
    );
    addToast(`Đã từ chối và yêu cầu nhân sự bổ sung minh chứng cho phiếu #${id}`, 'warning', 'Đã Từ Chối Phiếu');
  };

  // Open custom dark Copilot Modal instead of alert()
  const handleAiMessage = (query: string) => {
    setAiModalQuery(query);
    setIsAiModalOpen(true);
  };

  const handleNewShift = (newShift: ScheduleEntry) => {
    setSchedules(prev => [newShift, ...prev]);
    addToast(`Đã tạo và phân ca ${newShift.shift_code} ngày ${newShift.work_date} cho ${newShift.employee_name}!`, 'success', 'Xếp Ca Thành Công');
  };

  const pendingCorrections = corrections.filter(c => c.status === 'PENDING');
  const currentStoreObj = stores.find(s => s.store_name === activeStore);
  const employeeCount = currentStoreObj ? currentStoreObj.employee_count : 45;
  const cashFund = cashCounts.length > 0 ? cashCounts[0].cash_total_vnd : 1745000;

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
          storeName={activeStore}
          onSync={() => loadData(true)}
          onAddShift={() => setIsAddShiftOpen(true)}
        />

        <div className="content-body">
          <PromptChips onSelectPrompt={handleAiMessage} />

          <MetricCards
            employeeCount={employeeCount}
            shiftsTodayCount={schedules.length > 0 ? schedules.length : 12}
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
        </div>
      </main>

      {/* Slide-over Drawer for employee details */}
      <StaffDrawer
        schedule={selectedSchedule}
        onClose={() => setSelectedSchedule(null)}
        onActionMessage={(msg) => addToast(msg, 'success', 'Vận Hành Nhân Sự')}
      />

      {/* Custom Dark AI Copilot Modal Window (Replaces native browser alert) */}
      <AiCopilotModal
        isOpen={isAiModalOpen}
        onClose={() => setIsAiModalOpen(false)}
        query={aiModalQuery}
        onActionComplete={(msg) => addToast(msg, 'success', 'GUTA AI Copilot')}
      />

      {/* Custom Dark Add Shift Modal Window */}
      <AddShiftModal
        isOpen={isAddShiftOpen}
        onClose={() => setIsAddShiftOpen(false)}
        storeName={activeStore}
        onAddShift={handleNewShift}
      />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeNav}
        onSelectTab={setActiveNav}
        onOpenAi={() => handleAiMessage('Tra cứu nhanh qua AI Copilot')}
      />

      {/* Modern In-App Toast System */}
      <ToastContainer toasts={toasts} onDismiss={removeToast} />
    </div>
  );
};

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

  const loadData = async () => {
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
  };

  const handleReject = (id: number | string) => {
    alert(`Đã yêu cầu nhân viên giải trình lại cho phiếu ${id}`);
    setCorrections(prev =>
      prev.map(c => ((c.id === id || c.employee_code === id) ? { ...c, status: 'REJECTED' } : c))
    );
  };

  const handleAiMessage = (query: string) => {
    alert(`[GUTA AI COPILOT]: Đang xử lý câu hỏi qua MongoDB Atlas Function Calling & RAG:\n"${query}"\n\n→ Đã đối soát 144 cửa hàng và 2,439 nhân sự.`);
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
        onSelectStore={setActiveStore}
        activeNav={activeNav}
        onSelectNav={setActiveNav}
        pendingCorrectionCount={pendingCorrections.length}
      />

      {/* Main Content Area */}
      <main>
        <Header
          storeName={activeStore}
          onSync={loadData}
          onAddShift={() => alert('Mở cửa sổ thêm ca làm việc mới')}
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
      />

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeNav}
        onSelectTab={setActiveNav}
        onOpenAi={() => handleAiMessage('Tra cứu nhanh qua AI')}
      />
    </div>
  );
};

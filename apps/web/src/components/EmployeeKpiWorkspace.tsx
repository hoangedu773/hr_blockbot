import { useCallback, useRef, useState } from 'react';
import { KpiView } from './KpiView';
import { PerformanceKpiView } from './PerformanceKpiView';
import type { NotifyFn } from './Toast';
import { useAuthorization } from '../context/useAuthorization';
import { fetchDepartmentKpi, fetchMyKpi } from '../services/api';

export function EmployeeKpiWorkspace({ performance, legacy, historyFirst, onOpenWork, onNotify }: {
  performance: boolean;
  legacy: boolean;
  historyFirst: boolean;
  onOpenWork?: (target: { id: string; period: string }) => void;
  onNotify: NotifyFn;
}) {
  const [tab, setTab] = useState(() => historyFirst && legacy ? 'history' : 'current');
  const { can } = useAuthorization();
  const legacyRead = can('kpi.read_department') ? fetchDepartmentKpi : fetchMyKpi;
  const preference = useRef(historyFirst || !!sessionStorage.getItem('performance-kpi-navigation'));
  const check = useRef(0);
  const [period, setPeriod] = useState(() => {
    try {
      const link = JSON.parse(sessionStorage.getItem('performance-kpi-navigation') ?? 'null');
      if (performance && link && /^20\d{2}-(0[1-9]|1[0-2])$/.test(link.period)) return String(link.period);
    } catch { /* use the current month */ }
    return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
  });
  const selectTab = (value: string) => {
    preference.current = true;
    check.current++;
    setTab(value);
  };
  const showLegacyWhenOnlyAvailable = useCallback((loadedPeriod: string, count: number) => {
    if (count || !legacy || loadedPeriod !== period || preference.current) return;
    const request = ++check.current;
    void legacyRead(loadedPeriod).then(({ items }) => {
      if (request !== check.current || !items.length) return;
      setTab(items.some(item => item.status !== 'PUBLISHED') ? 'unfinished' : 'history');
    }).catch(() => { /* the existing tabs remain available */ });
  }, [legacy, legacyRead, period]);
  const activeTab = !performance && tab === 'current' ? 'unfinished' : !legacy ? 'current' : tab;
  return <section className="crm-workspace" aria-label="KPI hiệu suất nhân viên">
    <header className="crm-work-heading">
      <div><h2>KPI hiệu suất</h2><p>Đánh giá theo kỳ và tra cứu kết quả đã công bố theo mẫu trước đây.</p></div>
      <label className="field">Kỳ đánh giá
        <input className="input" type="month" min="2000-01" max="2099-12" value={period}
          onChange={event => {
            if (!/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) return;
            check.current++;
            if (!preference.current && performance) setTab('current');
            setPeriod(event.target.value);
          }} />
      </label>
    </header>
    <nav className="crm-work-actions" aria-label="Các nhóm đánh giá">
      {performance && <button type="button" className="btn" aria-pressed={activeTab === 'current'} onClick={() => selectTab('current')}>Đánh giá theo bằng chứng</button>}
      {legacy && <>
        <button type="button" className="btn" aria-pressed={activeTab === 'unfinished'} onClick={() => selectTab('unfinished')}>Mẫu cũ đang xử lý</button>
        <button type="button" className="btn" aria-pressed={activeTab === 'history'} onClick={() => selectTab('history')}>Lịch sử đánh giá</button>
      </>}
    </nav>
    {activeTab === 'current'
      ? <PerformanceKpiView key={period} selectedPeriod={period} onOpenWork={onOpenWork} onEvaluationsLoaded={showLegacyWhenOnlyAvailable} />
      : <KpiView key={activeTab + period} selectedPeriod={period} published={activeTab === 'history'} onNotify={onNotify} />}
  </section>;
}

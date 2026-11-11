import { useState } from 'react';
import { PerformanceKpiView } from './PerformanceKpiView';
import { PerformanceMigrationQueue, PerformanceHistory } from './PerformanceMigrationQueue';
import { useAuthorization } from '../context/useAuthorization';

export function EmployeeKpiWorkspace({ performance, legacy, onOpenWork }: {
  performance: boolean;
  legacy: boolean;
  onOpenWork?: (target: { id: string; period: string }) => void;
}) {
  const { can } = useAuthorization();
  const [revision, setRevision] = useState(0);
  const [period, setPeriod] = useState(() => {
    try {
      const link = JSON.parse(sessionStorage.getItem('performance-kpi-navigation') ?? 'null');
      if (link && /^20\d{2}-(0[1-9]|1[0-2])$/.test(link.period)) return String(link.period);
    } catch { /* Open the current evaluation period. */ }
    return new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 7);
  });
  return <section className="crm-workspace" aria-label="KPI hiệu suất nhân viên">
    <header className="crm-work-heading">
      <div><h2>KPI hiệu suất</h2><p>Chấm theo tiêu chí và bằng chứng · Công bố điểm tạm · Kiến nghị và khiếu nại.</p></div>
      <label className="field">Kỳ đánh giá
        <input className="input" type="month" min="2000-01" max="2099-12" value={period}
          onChange={event => {
            if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(event.target.value)) setPeriod(event.target.value);
          }} />
      </label>
    </header>
    {performance
      ? <PerformanceKpiView key={period + ':' + revision} selectedPeriod={period} onOpenWork={onOpenWork} />
      : <p role="status">HR cần cấp quyền KPI hiệu suất theo bằng chứng cho tài khoản này.</p>}
    {performance && can('performance_kpi.policy_manage') &&
      <PerformanceMigrationQueue period={period} onConverted={() => setRevision(value => value + 1)} />}
    {legacy && <PerformanceHistory key={period} period={period} />}
  </section>;
}

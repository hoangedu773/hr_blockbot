import { useEffect, useState } from 'react';
import type { KpiEvaluation } from '@hr-blockbot/contracts';
import { useAuthorization } from '../context/useAuthorization';
import { fetchDepartmentKpi, fetchMyKpi, newClientMessageId } from '../services/api';
import { performanceMigrations, performanceConvertEvaluation, type PendingPerformanceMigration } from '../services/performance-kpi-api';

export function PerformanceMigrationQueue({ period, onConverted }: { period: string; onConverted: () => void }) {
  const [items, setItems] = useState<PendingPerformanceMigration[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [revision, setRevision] = useState(0);
  const [selected, setSelected] = useState<PendingPerformanceMigration | null>(null);
  useEffect(() => {
    let live = true;
    setItems([]); setError(''); setSelected(null);
    void performanceMigrations(period)
      .then(result => { if (live) setItems(result.items); })
      .catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [period, revision]);
  async function convert() {
    if (!selected || busy) return;
    setBusy(true); setError('');
    try {
      await performanceConvertEvaluation(selected.id, {
        expectedVersion: selected.version, clientRequestId: newClientMessageId(),
        policyId: selected.policyId, reason: 'HR chuyển hồ sơ sang đánh giá theo bằng chứng.',
      });
      setSelected(null); setRevision(value => value + 1); onConverted();
    } catch (error) { setError(error instanceof Error ? error.message : 'Chưa chuyển được hồ sơ.'); }
    finally { setBusy(false); }
  }
  if (!items.length && !error) return null;
  return <section className="pf-card" aria-label="Hồ sơ cần HR xác minh">
    <h3>Hồ sơ cần HR xác minh ({items.length})</h3>
    <p>Chuyển hồ sơ đủ điều kiện để người quản lý chấm theo từng tiêu chí. Nhận xét và điểm đã nhập được lưu làm căn cứ đối chiếu.</p>
    {error && <p role="alert">{error}</p>}
    {items.map(item => <article key={item.id}>
      <p><strong>{item.employeeName}</strong> · {item.canConvert ? 'Sẵn sàng chuyển' : item.blockedReason}</p>
      {(item.selfReview || item.managerReview || item.managerScore != null) && <details>
        <summary>Nhận xét đã lưu</summary>
        <p>Tự nhận xét · {item.selfReview ?? 'Chưa có'}</p>
        <p>Nhận xét quản lý · {item.managerReview ?? 'Chưa có'}</p>
        <p>Điểm quản lý tham khảo · {item.managerScore ?? 'Chưa có'}</p>
      </details>}
      {item.canConvert && <button type="button" className="btn" disabled={busy} onClick={() => setSelected(item)}>Xem trước chuyển hồ sơ</button>}
    </article>)}
    {selected && <div className="pf-card" role="region" aria-label="Xem trước chuyển hồ sơ">
      <h4>{selected.employeeName} · {period}</h4>
      <p>Hồ sơ sẽ mở theo chính sách của kỳ để SM/AM chấm từng tiêu chí.</p>
      <p>Tự nhận xét đã lưu · {selected.selfReview ?? 'Chưa có'}</p>
      <p>Nhận xét quản lý đã lưu · {selected.managerReview ?? 'Chưa có'}</p>
      <p>Điểm quản lý tham khảo · {selected.managerScore ?? 'Chưa có'}</p>
      <button type="button" className="btn btn--primary" disabled={busy} onClick={() => void convert()}>Xác nhận chuyển hồ sơ</button>
      <button type="button" className="btn" disabled={busy} onClick={() => setSelected(null)}>Hủy</button>
    </div>}
  </section>;
}

export function PerformanceHistory({ period }: { period: string }) {
  const { can } = useAuthorization();
  const scoped = can('kpi.read_department');
  const [items, setItems] = useState<KpiEvaluation[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    setItems([]); setError('');
    void (scoped ? fetchDepartmentKpi(period) : fetchMyKpi(period))
      .then(result => { if (live) setItems(result.items.filter(item => item.status === 'PUBLISHED')); })
      .catch(error => { if (live) setError(error.message); });
    return () => { live = false; };
  }, [period, scoped]);
  if (!items.length && !error) return null;
  return <details className="pf-card">
    <summary>Kết quả đã công bố trước đây ({items.length})</summary>
    {error && <p role="alert">{error}</p>}
    {items.map(item => <article key={item.id}>
      <h3>{item.employeeName} · {item.period}</h3>
      <p>Điểm đã công bố · {item.finalScore == null ? 'Chưa có' : new Intl.NumberFormat('vi-VN').format(item.finalScore)} / 100</p>
      {item.selfReview && <p>Tự nhận xét · {item.selfReview}</p>}
      {item.managerReview && <p>Nhận xét quản lý · {item.managerReview}</p>}
      {item.analysis?.explanation && <p>{item.analysis.explanation}</p>}
      {item.overrideReason && <p>Lý do hiệu chỉnh: {item.overrideReason}</p>}
    </article>)}
  </details>;
}


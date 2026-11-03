import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { KpiEvaluation, KpiDashboard, NotificationItem } from '@hr-blockbot/contracts';
import {
  analyzeKpi, ApiError, fetchDepartmentKpi, fetchKpiDashboard, fetchMe, fetchMyKpi,
  fetchNotifications, markAllNotificationsRead, markNotificationRead, openKpiPeriod,
  overrideKpi, publishKpi, saveKpiManagerReview, saveKpiSelfReview,
} from '../services/api';
import type { NotifyFn } from './Toast';
import '../styles/crm-work.css';

const STATUS_LABEL: Record<string, string> = { OPEN: 'Đang mở', ANALYZED: 'Chờ công bố', PUBLISHED: 'Đã công bố' };
const monthOptions = (count = 12) => {
  const values: string[] = [];
  const now = new Date();
  for (let index = 0; index < count; index += 1) {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - index, 1));
    values.push(`${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`);
  }
  return values;
};
const scoreText = (value: number | null | undefined) => typeof value === 'number' ? value.toFixed(1) : '—';
const percent = (value: number | null | undefined) => typeof value === 'number' ? `${Math.round(value * 100)}%` : '—';

const Card: React.FC<{ title: string; children: React.ReactNode; aside?: React.ReactNode }> = ({ title, children, aside }) => (
  <section className="rounded-xl border border-border bg-card p-4 text-card-foreground">
    <div className="mb-3 flex items-center justify-between gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>{aside}
    </div>
    {children}
  </section>
);
const Bar: React.FC<{ label: string; value: number; hint?: string }> = ({ label, value, hint }) => (
  <div className="mb-2">
    <div className="mb-1 flex justify-between text-xs text-muted-foreground"><span>{label}</span><span>{Math.round(value * 100)}%</span></div>
    <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }} /></div>
    {hint && <p className="mt-1 text-[11px] text-muted-foreground">{hint}</p>}
  </div>
);

export const KpiView: React.FC<{ onNotify?: NotifyFn }> = ({ onNotify }) => {
  const notify: NotifyFn = onNotify ?? ((message, type) => console.log(`[Toast ${type}] ${message}`));
  const [capabilities, setCapabilities] = useState<string[]>([]);
  const [period, setPeriod] = useState(() => monthOptions(1)[0]);
  const [tab, setTab] = useState<'mine' | 'department' | 'dashboard'>('mine');
  const [mine, setMine] = useState<KpiEvaluation | null>(null);
  const [department, setDepartment] = useState<KpiEvaluation[]>([]);
  const [dashboard, setDashboard] = useState<KpiDashboard | null>(null);
  const [selectedId, setSelectedId] = useState<string>('');
  const [notifications, setNotifications] = useState<{ items: NotificationItem[]; unread: number }>({ items: [], unread: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selfText, setSelfText] = useState('');
  const [managerText, setManagerText] = useState('');
  const [managerScore, setManagerScore] = useState('70');
  const [overrideScore, setOverrideScore] = useState('');
  const [overrideReason, setOverrideReason] = useState('');
  const can = useCallback((capability: string) => capabilities.includes(capability), [capabilities]);
  const selected = useMemo(() => department.find((item) => item.id === selectedId) ?? null, [department, selectedId]);
  const fail = (cause: unknown) => {
    const message = cause instanceof ApiError ? cause.message : 'Không tải được dữ liệu KPI.';
    setError(message); notify(message, 'error');
  };

  useEffect(() => {
    let active = true;
    fetchMe().then((me) => {
      if (!active) return;
      const caps = me.authorization?.capabilities ?? [];
      setCapabilities(caps);
      setTab(caps.includes('kpi.read_department') ? 'department' : 'mine');
    }).catch(fail).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const reload = useCallback(async () => {
    setError('');
    try {
      if (can('kpi.read_self')) { const result = await fetchMyKpi(period); setMine(result.items[0] ?? null); setSelfText(result.items[0]?.selfReview ?? ''); }
      if (can('kpi.read_department')) {
        const result = await fetchDepartmentKpi(period); setDepartment(result.items);
        if (!selectedId && result.items[0]) setSelectedId(result.items[0].id);
      }
      if (can('kpi.read_department')) setDashboard(await fetchKpiDashboard(period));
      setNotifications(await fetchNotifications(8));
    } catch (cause) { fail(cause); }
  }, [period, can, selectedId]);

  useEffect(() => { void reload(); }, [period, capabilities.join('|')]);

  useEffect(() => {
    if (!selected) return;
    setManagerText(selected.managerReview ?? '');
    setManagerScore(String(selected.managerScore ?? 70));
    setOverrideScore(String(selected.finalScore ?? selected.machineScore ?? ''));
    setOverrideReason(selected.overrideReason ?? '');
  }, [selectedId, selected?.version]);

  const run = async (action: () => Promise<unknown>, message: string) => {
    if (busy) return;
    setBusy(true); setError('');
    try { await action(); notify(message, 'success'); await reload(); }
    catch (cause) { fail(cause); }
    finally { setBusy(false); }
  };

  return (
    <div className="crm-workspace space-y-4">
      <div className="crm-work-heading flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">KPI &amp; đánh giá hiệu suất</h2>
          <p className="text-xs text-muted-foreground">Điểm máy do công thức tất định tính từ hoàn thành thật, tín hiệu AI và điểm quản lý. AI không sinh điểm cuối.</p>
        </div>
        <div className="crm-work-toolbar flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="kpi-period">Kỳ</label>
          <select id="kpi-period" className="rounded-md border border-border bg-background px-2 py-1 text-sm" value={period} onChange={(event) => setPeriod(event.target.value)}>
            {monthOptions(12).map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Khu vực KPI">
        {can('kpi.read_self') && <button type="button" role="tab" aria-selected={tab === 'mine'} className={`rounded-md px-3 py-1.5 text-sm ${tab === 'mine' ? 'bg-primary text-primary-foreground' : 'border border-border'}`} onClick={() => setTab('mine')}>Của tôi</button>}
        {can('kpi.read_department') && <button type="button" role="tab" aria-selected={tab === 'department'} className={`rounded-md px-3 py-1.5 text-sm ${tab === 'department' ? 'bg-primary text-primary-foreground' : 'border border-border'}`} onClick={() => setTab('department')}>Phòng ban</button>}
        {can('kpi.read_department') && <button type="button" role="tab" aria-selected={tab === 'dashboard'} className={`rounded-md px-3 py-1.5 text-sm ${tab === 'dashboard' ? 'bg-primary text-primary-foreground' : 'border border-border'}`} onClick={() => setTab('dashboard')}>Tổng quan</button>}
      </div>

      {error && <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      {loading ? <p className="crm-work-skeleton">Đang tải quyền và dữ liệu KPI…</p> : null}

      {tab === 'mine' && !loading && (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card title="Kỳ đánh giá của tôi" aside={<span className="rounded-full border border-border px-2 py-0.5 text-[11px]">{mine ? STATUS_LABEL[mine.status] : 'Chưa có kỳ'}</span>}>
            {!mine ? (
              <p className="text-sm text-muted-foreground">Chưa có bản đánh giá cho kỳ này. Quản lý cần mở kỳ trước khi bạn tự nhận xét.</p>
            ) : (
              <div className="space-y-4">
                <div className="flex flex-wrap items-end gap-4">
                  <div><p className="text-xs text-muted-foreground">Điểm chốt</p><p className="text-3xl font-semibold tabular-nums">{scoreText(mine.finalScore)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Điểm máy</p><p className="text-xl tabular-nums">{scoreText(mine.machineScore)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Hoàn thành thật</p><p className="text-xl tabular-nums">{percent(mine.objectiveCompletionScore)}</p></div>
                </div>
                {mine.breakdown && (
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Bar label="Hoàn thành" value={mine.breakdown.components.completion} hint={`trọng số ${mine.breakdown.weights.completion}`} />
                    <Bar label="Tín hiệu AI" value={mine.breakdown.components.semantic} hint={`trọng số ${mine.breakdown.weights.semantic}`} />
                    <Bar label="Quản lý chấm" value={mine.breakdown.components.manager} hint={`trọng số ${mine.breakdown.weights.manager}`} />
                  </div>
                )}
                {mine.breakdown?.capped && <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs">Điểm bị chặn trần theo tỷ lệ hoàn thành thật ({percent(mine.breakdown.ceiling01)}).</p>}
                {mine.analysis && (
                  <div className="rounded-lg border border-border p-3 text-sm">
                    <p className="font-medium">Phân tích ngữ nghĩa <span className="text-xs text-muted-foreground">({mine.analysis.model}{mine.analysis.degraded ? ', dự phòng' : ''})</span></p>
                    <p className="mt-1 text-muted-foreground">{mine.analysis.explanation}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {mine.analysis.themes.map((theme) => <span key={theme} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{theme}</span>)}
                      {mine.analysis.riskSignals.map((signal) => <span key={signal} className="rounded-full border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive">{signal}</span>)}
                    </div>
                  </div>
                )}
                {mine.status === 'OPEN' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium" htmlFor="kpi-self">Tự nhận xét</label>
                    <textarea id="kpi-self" className="min-h-24 w-full rounded-md border border-border bg-background p-2 text-sm" maxLength={4000} value={selfText} onChange={(event) => setSelfText(event.target.value)} placeholder="Nêu kết quả, khó khăn và đề xuất của bạn trong kỳ." />
                    <button type="button" disabled={busy || !selfText.trim()} className="mt-2 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50" onClick={() => run(() => saveKpiSelfReview(mine.id, selfText, mine.version), 'Đã lưu tự nhận xét.')}>Lưu tự nhận xét</button>
                  </div>
                )}
                {mine.history.length > 0 && (
                  <ol className="crm-work-history space-y-1 text-xs text-muted-foreground">
                    {mine.history.slice(-6).map((entry) => <li key={entry.at + entry.action}>{new Date(entry.at).toLocaleString('vi-VN')} · {entry.action}{entry.reason ? ` · ${entry.reason}` : ''}</li>)}
                  </ol>
                )}
              </div>
            )}
          </Card>
          <Card title="Thông báo" aside={<button type="button" className="text-xs underline" disabled={!notifications.unread} onClick={() => run(markAllNotificationsRead, 'Đã đánh dấu tất cả đã đọc.')}>Đọc tất cả</button>}>
            {notifications.items.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có thông báo.</p> : (
              <ul className="space-y-2">
                {notifications.items.map((item) => (
                  <li key={item.id} className={`rounded-lg border p-2 text-sm ${item.readAt ? 'border-border/60 opacity-70' : 'border-primary/40 bg-primary/5'}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div><p className="font-medium">{item.title}</p><p className="text-xs text-muted-foreground">{item.body}</p><p className="mt-1 text-[11px] text-muted-foreground">{new Date(item.createdAt).toLocaleString('vi-VN')}</p></div>
                      {!item.readAt && <button type="button" className="text-[11px] underline" onClick={() => run(() => markNotificationRead(item.id), 'Đã đọc thông báo.')}>Đọc</button>}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {tab === 'department' && !loading && (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <Card title={`Đánh giá phòng ban · ${period}`} aside={can('kpi.manage') ? <button type="button" className="rounded-md border border-border px-2 py-1 text-xs" disabled={busy} onClick={() => run(() => openKpiPeriod(period), 'Đã mở kỳ cho nhân viên trong phạm vi.')}>Mở kỳ</button> : null}>
            <div className="crm-work-table-wrap overflow-x-auto">
              <table className="crm-work-table w-full text-sm">
                <thead><tr><th className="text-left">Nhân viên</th><th className="text-right">Hoàn thành</th><th className="text-right">Điểm máy</th><th className="text-right">Điểm chốt</th><th className="text-left">Trạng thái</th></tr></thead>
                <tbody>
                  {department.length === 0 ? <tr><td colSpan={5} className="py-4 text-center text-muted-foreground">Chưa có bản đánh giá trong kỳ. Bấm “Mở kỳ” để tạo cho nhân viên trong phạm vi.</td></tr> : department.map((item) => (
                    <tr key={item.id} className={`cursor-pointer ${item.id === selectedId ? 'bg-muted/60' : ''}`} onClick={() => setSelectedId(item.id)}>
                      <td>{item.employeeName}</td>
                      <td className="text-right tabular-nums">{percent(item.objectiveCompletionScore)}</td>
                      <td className="text-right tabular-nums">{scoreText(item.machineScore)}</td>
                      <td className="text-right tabular-nums">{scoreText(item.finalScore)}</td>
                      <td><span className="crm-work-status">{STATUS_LABEL[item.status]}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
          <Card title={selected ? selected.employeeName : 'Chọn một nhân viên'} aside={selected ? <span className="text-[11px] text-muted-foreground">{STATUS_LABEL[selected.status]}</span> : null}>
            {!selected ? <p className="text-sm text-muted-foreground">Chọn một dòng để nhập nhận xét, phân tích và công bố.</p> : (
              <div className="space-y-3 text-sm">
                <div className="grid grid-cols-3 gap-2">
                  <div><p className="text-xs text-muted-foreground">Hoàn thành</p><p className="tabular-nums">{percent(selected.objectiveCompletionScore)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Điểm máy</p><p className="tabular-nums">{scoreText(selected.machineScore)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Điểm chốt</p><p className="tabular-nums">{scoreText(selected.finalScore)}</p></div>
                </div>
                {selected.selfReview && <div className="rounded-md bg-muted/50 p-2"><p className="text-xs font-medium">Tự nhận xét</p><p className="text-muted-foreground">{selected.selfReview}</p></div>}
                {selected.status === 'OPEN' && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs font-medium" htmlFor="kpi-manager">Nhận xét quản lý</label>
                      <textarea id="kpi-manager" className="min-h-20 w-full rounded-md border border-border bg-background p-2 text-sm" maxLength={4000} value={managerText} onChange={(event) => setManagerText(event.target.value)} />
                    </div>
                    <div className="flex items-end gap-2">
                      <div><label className="mb-1 block text-xs font-medium" htmlFor="kpi-manager-score">Điểm quản lý (0-100)</label>
                        <input id="kpi-manager-score" type="number" min={0} max={100} className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm" value={managerScore} onChange={(event) => setManagerScore(event.target.value)} /></div>
                      <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50" disabled={busy || !managerText.trim()} onClick={() => run(() => saveKpiManagerReview(selected.id, managerText, Number(managerScore), selected.version), 'Đã lưu nhận xét quản lý.')}>Lưu nhận xét</button>
                    </div>
                  </>
                )}
                {selected.status === 'OPEN' && can('kpi.manage') && (
                  <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" disabled={busy || !selected.selfReview || !selected.managerReview} onClick={() => run(() => analyzeKpi(selected.id, selected.version), 'AI đã phân tích; điểm máy đã được tính và khoá.')}>Phân tích AI &amp; tính điểm máy</button>
                )}
                {selected.status === 'ANALYZED' && can('kpi.publish') && (
                  <button type="button" className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50" disabled={busy} onClick={() => run(() => publishKpi(selected.id, selected.version), 'Đã công bố KPI cho nhân viên.')}>Công bố điểm {scoreText(selected.machineScore)}</button>
                )}
                {selected.status === 'PUBLISHED' && can('kpi.override') && (
                  <div className="rounded-lg border border-border p-3">
                    <p className="mb-2 text-xs font-medium">Hiệu chỉnh điểm chốt (bắt buộc lý do)</p>
                    <div className="flex flex-wrap items-end gap-2">
                      <input type="number" min={0} max={100} aria-label="Điểm chốt mới" className="w-24 rounded-md border border-border bg-background px-2 py-1 text-sm" value={overrideScore} onChange={(event) => setOverrideScore(event.target.value)} />
                      <input aria-label="Lý do hiệu chỉnh" className="min-w-40 flex-1 rounded-md border border-border bg-background px-2 py-1 text-sm" placeholder="Lý do hiệu chỉnh" value={overrideReason} onChange={(event) => setOverrideReason(event.target.value)} />
                      <button type="button" className="rounded-md border border-border px-3 py-1.5 text-sm disabled:opacity-50" disabled={busy || overrideReason.trim().length < 5} onClick={() => run(() => overrideKpi(selected.id, selected.version, Number(overrideScore), overrideReason), 'Đã ghi hiệu chỉnh kèm lý do.')}>Hiệu chỉnh</button>
                    </div>
                  </div>
                )}
                {selected.analysis && <p className="rounded-md bg-muted/50 p-2 text-xs text-muted-foreground">{selected.analysis.explanation}</p>}
                {selected.overrideReason && <p className="text-xs">Lý do hiệu chỉnh: {selected.overrideReason}</p>}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'dashboard' && !loading && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Card title="Đã công bố"><p className="text-2xl font-semibold tabular-nums">{dashboard?.published ?? 0}</p></Card>
            <Card title="Chờ công bố"><p className="text-2xl font-semibold tabular-nums">{dashboard?.pendingReview ?? 0}</p></Card>
            <Card title="Điểm chốt TB"><p className="text-2xl font-semibold tabular-nums">{scoreText(dashboard?.averageFinalScore)}</p></Card>
            <Card title="Điểm máy TB"><p className="text-2xl font-semibold tabular-nums">{scoreText(dashboard?.averageMachineScore)}</p></Card>
          </div>
          <Card title="Biến động 6 kỳ">
            {(dashboard?.trend.length ?? 0) === 0 ? <p className="text-sm text-muted-foreground">Chưa có dữ liệu để vẽ biểu đồ.</p> : (() => {
              const trend = dashboard!.trend, width = 620, height = 190, pad = 28;
              const point = (index: number, value: number) => ({
                x: pad + index * (width - pad * 2) / Math.max(1, trend.length - 1),
                y: height - pad - Math.max(0, Math.min(100, value)) / 100 * (height - pad * 2),
              });
              const points = trend.map((row, index) => row.averageFinalScore === null ? null : point(index, row.averageFinalScore));
              const line = points.filter((value): value is { x: number; y: number } => value !== null).map((value) => `${value.x},${value.y}`).join(' ');
              return (
                <svg role="img" aria-label="Biểu đồ điểm KPI trung bình theo kỳ" viewBox={`0 0 ${width} ${height}`} className="h-auto w-full">
                  {[0, 25, 50, 75, 100].map((value) => <g key={value}><line x1={pad} x2={width - pad} y1={point(0, value).y} y2={point(0, value).y} stroke="currentColor" strokeOpacity="0.12" /><text x={4} y={point(0, value).y + 4} fontSize="10" fill="currentColor" fillOpacity="0.6">{value}</text></g>)}
                  {line && <polyline points={line} fill="none" stroke="currentColor" strokeWidth="2" />}
                  {points.map((value, index) => value ? <circle key={index} cx={value.x} cy={value.y} r="3.5" fill="currentColor" /> : null)}
                  {trend.map((row, index) => <text key={row.period} x={point(index, 0).x} y={height - 8} fontSize="10" textAnchor="middle" fill="currentColor" fillOpacity="0.7">{row.period.slice(2)}</text>)}
                </svg>
              );
            })()}
          </Card>
          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Phân bố điểm chốt">
              {(dashboard?.distribution ?? []).map((bucket) => (
                <div key={bucket.label} className="mb-2">
                  <div className="mb-1 flex justify-between text-xs"><span>{bucket.label}</span><span>{bucket.count}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${dashboard?.published ? Math.min(100, bucket.count / dashboard.published * 100) : 0}%` }} /></div>
                </div>
              ))}
            </Card>
            <Card title="Chủ đề &amp; rủi ro">
              <div className="flex flex-wrap gap-1.5">
                {(dashboard?.themes ?? []).map((theme) => <span key={theme.theme} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{theme.theme} · {theme.count}</span>)}
                {(dashboard?.riskSignals ?? []).map((risk) => <span key={risk.signal} className="rounded-full border border-destructive/40 px-2 py-0.5 text-[11px] text-destructive">{risk.signal} · {risk.count}</span>)}
              </div>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
};

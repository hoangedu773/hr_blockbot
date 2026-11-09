import { useEffect, useState } from 'react';
import type { NotificationItem } from '@hr-blockbot/contracts';
import { fetchNotifications, markNotificationRead } from '../services/api';
import { performanceEvaluation, performanceTask } from '../services/performance-kpi-api';
import { performanceDate, performanceLabels } from './TaskDetailView';

export const notificationSeverityLabels = {
  INFO: 'Thông tin',
  ACTION_REQUIRED: 'Cần xử lý',
  URGENT: 'Khẩn cấp',
};

export function PerformanceNotificationTarget({ id, isTask, onOpenWork }: { id: string; isTask: boolean; onOpenWork?: (period: string, id: string) => void }) {
  const [detail, setDetail] = useState<{ title: string; period: string; status: string; due?: string; description?: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    const request = isTask
      ? performanceTask(id).then(t => ({
        title: t.title, period: t.kpiPeriod, status: t.status,
        due: t.extendedDueAt ?? t.dueAt, description: t.description,
      }))
      : performanceEvaluation(id).then(e => ({
        title: 'Đánh giá của ' + e.employeeName, period: e.period, status: e.evaluationStatus,
      }));
    void request.then(row => { if (active) setDetail(row); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [id, isTask]);

  if (failed) return <p role="alert">Chưa xem được hồ sơ liên quan. Hãy kiểm tra lại quyền truy cập hoặc thử mở lại.</p>;
  if (!detail) return <p role="status">Đang tải chi tiết…</p>;
  return <div className="pf-notification-target">
    <strong>{detail.title}</strong>
    <p>Kỳ {detail.period.slice(5)}/{detail.period.slice(0, 4)} · {performanceLabels[detail.status] ?? detail.status}</p>
    {detail.due && <p>Hạn thực hiện {performanceDate(detail.due)}</p>}
    {detail.description && <p>{detail.description}</p>}
    {isTask && onOpenWork && <button type="button" className="btn" onClick={() => onOpenWork(detail.period, id)}>Mở công việc có thang điểm</button>}
  </div>;
}

export function PerformanceNotifications({ reload, work }: { reload: number; work: boolean }) {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [filter, setFilter] = useState<'ALL' | NotificationItem['severity']>('ALL');
  const [selected, setSelected] = useState<string>();
  const [marking, setMarking] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void Promise.all([fetchNotifications(30, work ? 'task' : 'performance_kpi')])
      .then(groups => {
        if (!active) return;
        setItems(groups.flatMap(group => group.items).sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        setUnread(groups.reduce((total, group) => total + group.unread, 0));
      })
      .catch(() => { if (active) setError('Chưa tải được thông báo. Hãy dùng nút Tải lại.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reload, work]);

  async function markRead(id: string) {
    setMarking(id);
    setError('');
    try {
      await markNotificationRead(id);
      setItems(rows => rows.map(row => row.id === id ? { ...row, readAt: new Date().toISOString() } : row));
      setUnread(count => Math.max(0, count - 1));
    } catch {
      setError('Chưa đánh dấu được thông báo. Hãy tải lại hoặc thử lại.');
    } finally {
      setMarking(undefined);
    }
  }

  const visible = filter === 'ALL' ? items : items.filter(item => item.severity === filter);
  return <details className="pf-card pf-notifications">
    <summary>{work?'Thông báo công việc':'Thông báo KPI hiệu suất'} · {unread} chưa đọc</summary>
    <label className="pf-notification-filter">Mức độ
      <select value={filter} onChange={event => setFilter(event.target.value as typeof filter)}>
        <option value="ALL">Tất cả</option>
        {Object.entries(notificationSeverityLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select>
    </label>
    {loading && <p role="status">Đang tải thông báo…</p>}
    {error && <p role="alert" className="pf-error">{error}</p>}
    {!loading && !error && !visible.length && <p>Chưa có thông báo ở mức này.</p>}
    <ul className="pf-notification-list">
      {visible.map(item => {
        const isTask = item.entityKind === 'task';
        const entityId = item.entityId;
        const hasTarget = (isTask || item.entityKind === 'performance_kpi') && entityId && /^[a-f0-9]{24}$/i.test(entityId);
        const expanded = selected === item.id;
        return <li key={item.id}>
          <div className="pf-notification-meta">
            <span className="pf-notification-severity" data-severity={item.severity}>{notificationSeverityLabels[item.severity]}</span>
            <span>{isTask ? 'Nhiệm vụ' : 'KPI hiệu suất'}</span>
            <time dateTime={item.createdAt}>{performanceDate(item.createdAt)}</time>
            <span>{item.readAt ? 'Đã đọc' : 'Chưa đọc'}</span>
          </div>
          <h3>{item.title}</h3>
          <p>{item.body}</p>
          <div className="pf-notification-actions">
            {hasTarget && <button type="button" aria-expanded={expanded} onClick={() => setSelected(expanded ? undefined : item.id)}>
              {expanded ? 'Thu gọn chi tiết' : isTask ? 'Xem nhiệm vụ' : 'Xem bản đánh giá'}
            </button>}
            {!item.readAt && <button type="button" disabled={!!marking || loading} onClick={() => void markRead(item.id)}>
              {marking === item.id ? 'Đang đánh dấu…' : 'Đánh dấu đã đọc'}
            </button>}
          </div>
          {hasTarget && expanded && <PerformanceNotificationTarget key={item.id} id={entityId} isTask={isTask} />}
        </li>;
      })}
    </ul>
  </details>;
}

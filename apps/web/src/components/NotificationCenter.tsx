import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { notificationEntityKinds, type NotificationGroup, type NotificationInboxItem } from '@hr-blockbot/contracts';
import { fetchNotificationInbox, markNotificationRead, readAssignmentNotice } from '../services/api';
import type { ActiveCrmView } from './CrmDashboardView';
import { PerformanceNotificationTarget, notificationSeverityLabels } from './PerformanceNotifications';
import { performanceDate } from './TaskDetailView';
import { CrmDialog } from './ui/CrmDialog';
import '../styles/crm-work.css';
import './notification-center.css';

const groups: Record<NotificationGroup, { label: string; view?: ActiveCrmView }> = {
  schedule: { label: 'Lịch làm & phân ca', view: 'schedules' },
  work: { label: 'Công việc & nghiệm thu', view: 'projects' },
  revenue: { label: 'KPI doanh thu', view: 'revenueKpi' },
  performance: { label: 'KPI hiệu suất & công việc', view: 'performanceKpi' },
  evaluation: { label: 'KPI & đánh giá', view: 'kpi' },
  other: { label: 'Khác' },
};
const groupEntries = Object.entries(notificationEntityKinds) as [NotificationGroup, readonly string[]][];
const pageSize = 30;

function groupFor(item: NotificationInboxItem) {
  return groups[groupEntries.find(([, kinds]) => kinds.includes(item.entityKind ?? ''))?.[0] ?? 'other'];
}

function Inbox({ onChanged, onClose, onNavigate }: {
  onChanged: () => void;
  onClose: () => void;
  onNavigate: (view: ActiveCrmView) => void;
}) {
  const [group, setGroup] = useState<NotificationGroup | ''>('');
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [items, setItems] = useState<NotificationInboxItem[]>([]);
  const [selected, setSelected] = useState<string>();
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const request = useRef<AbortController>();

  const load = useCallback(async (cursor?: NotificationInboxItem) => {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const page = await fetchNotificationInbox({ limit: pageSize + 1, group: group || undefined, unreadOnly, cursor, signal: controller.signal });
      if (controller.signal.aborted) return;
      const visible = page.items.slice(0, pageSize);
      setItems(previous => cursor ? [...previous, ...visible] : visible);
      setMore(page.items.length > pageSize);
    } catch {
      if (!controller.signal.aborted) setError('Chưa tải được thông báo. Hãy thử lại.');
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [group, unreadOnly]);

  useEffect(() => {
    setItems([]);
    setMore(false);
    setSelected(undefined);
    void load();
    return () => request.current?.abort();
  }, [load]);

  async function markRead(item: NotificationInboxItem) {
    setSaving(true);
    setError('');
    try {
      if (item.source === 'assignment' && item.entityId) await readAssignmentNotice(item.entityId, item.id);
      else await markNotificationRead(item.id);
      setItems(previous => previous.flatMap(row => {
        if (row.source !== item.source || row.id !== item.id) return [row];
        return unreadOnly ? [] : [{ ...row, read: true }];
      }));
      onChanged();
      if (unreadOnly) void load();
    } catch {
      setError('Chưa đánh dấu được thông báo. Hãy tải lại rồi thử lại.');
    } finally {
      setSaving(false);
    }
  }

  return <CrmDialog title="Thông báo" onClose={onClose} busy={saving}>
    <div className="notification-inbox">
      <div className="notification-inbox-tools">
        <label>Nhóm thông báo
          <select value={group} disabled={saving} onChange={event => setGroup(event.target.value as NotificationGroup | '')}>
            <option value="">Tất cả</option>
            {Object.entries(groups).map(([key, category]) => <option key={key} value={key}>{category.label}</option>)}
          </select>
        </label>
        <label className="notification-unread-toggle">
          <input type="checkbox" checked={unreadOnly} disabled={saving} onChange={event => setUnreadOnly(event.target.checked)} />
          Chỉ chưa đọc
        </label>
      </div>
      {error && <p role="alert">{error} <button type="button" className="btn" onClick={() => void load()}>Tải lại</button></p>}
      {loading && <p role="status">Đang tải thông báo…</p>}
      {!loading && !error && !items.length && <p>{unreadOnly ? 'Bạn đã đọc hết thông báo trong nhóm này.' : 'Chưa có thông báo trong nhóm này.'}</p>}
      <ul className="notification-inbox-list">
        {items.map(item => {
          const isTask = item.entityKind === 'task';
          const category = isTask ? groups.work : groupFor(item);
          const entityId = item.entityId;
          const canShowDetail = (isTask || item.entityKind === 'performance_kpi') && !!entityId && /^[a-f0-9]{24}$/i.test(entityId);
          const expanded = selected === item.id;
          return <li key={item.source + ':' + item.id} data-unread={!item.read}>
            <div className="notification-inbox-meta">
              <span>{category.label}</span>
              <span className="notification-level" data-severity={item.severity}>{notificationSeverityLabels[item.severity]}</span>
              <time dateTime={item.createdAt}>{performanceDate(item.createdAt)}</time>
              <span>{item.read ? 'Đã đọc' : 'Chưa đọc'}</span>
            </div>
            <h4>{item.title}</h4>
            <p>{item.body}</p>
            <div className="notification-inbox-actions">
              {canShowDetail && <button type="button" className="btn" aria-expanded={expanded} onClick={() => setSelected(expanded ? undefined : item.id)}>
                {expanded ? 'Thu gọn chi tiết' : isTask ? 'Xem nhiệm vụ' : 'Xem bản đánh giá'}
              </button>}
              {category.view && <button type="button" className="btn" disabled={saving} onClick={() => onNavigate(category.view!)}>
                Mở mục {category.label}
              </button>}
              {!item.read && <button type="button" className="btn" disabled={saving || loading} onClick={() => void markRead(item)}>Đánh dấu đã đọc</button>}
            </div>
            {canShowDetail && expanded && <PerformanceNotificationTarget id={entityId} isTask={isTask} onOpenWork={isTask ? (period,id) => {
              sessionStorage.setItem('scored-work-notification', period+':'+id);
              onNavigate('projects');
            } : undefined} />}
          </li>;
        })}
      </ul>
      {more && items.length > 0 && <button type="button" className="btn" disabled={loading || saving} onClick={() => void load(items[items.length - 1])}>
        Xem thông báo cũ hơn
      </button>}
    </div>
  </CrmDialog>;
}

export function NotificationCenter({ onNavigate }: { onNavigate: (view: ActiveCrmView) => void }) {
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const request = useRef<AbortController>();
  const refresh = useCallback(() => {
    if (document.visibilityState === 'hidden') return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    void fetchNotificationInbox({ limit: 1, signal: controller.signal })
      .then(page => { if (!controller.signal.aborted) setUnread(page.unread); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    const timer = window.setInterval(refresh, 30000);
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('focus', refresh);
    return () => {
      request.current?.abort();
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [refresh]);

  return <>
    <button type="button" className="notification-bell" aria-label={unread ? 'Thông báo, ' + unread + ' chưa đọc' : 'Thông báo'}
      aria-haspopup="dialog" aria-expanded={open} onClick={() => { refresh(); setOpen(true); }}>
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
      </svg>
      {unread > 0 && <span className="notification-bell-count" aria-hidden="true">{unread > 99 ? '99+' : unread}</span>}
    </button>
    {open && createPortal(
      <Inbox onChanged={refresh} onClose={() => setOpen(false)} onNavigate={view => { setOpen(false); onNavigate(view); }} />,
      document.body
    )}
  </>;
}

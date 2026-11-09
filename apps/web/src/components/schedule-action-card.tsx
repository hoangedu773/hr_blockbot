import React, { useState } from 'react';
import type { ScheduleChatAction } from '@hr-blockbot/contracts';
import { apiFetch, API_BASE } from '../services/auth';

// Card cho ba loại đề xuất lịch. Không chứa luật nghiệp vụ: chỉ hiển thị preview
// server đã dựng và gửi quyết định xác nhận/huỷ về đúng endpoint.
export interface ScheduleActionCardProps {
  initial: ScheduleChatAction;
  onExecuted?: () => void;
}

const copy: Record<ScheduleChatAction['type'], { title: string; confirm: string }> = {
  'schedule.registration': { title: 'Đăng ký ca', confirm: 'Gửi đăng ký ca' },
  'schedule.change': { title: 'Yêu cầu đổi ca', confirm: 'Gửi yêu cầu đổi ca' },
  'schedule.change_decision': { title: 'Xử lý yêu cầu đổi ca', confirm: 'Xác nhận xử lý' },
};

function summary(action: ScheduleChatAction): string[] {
  if (action.type === 'schedule.registration') {
    const p = action.preview;
    return [`Cửa hàng: ${p.storeName}`, `Ngày: ${p.date}`, `Ca: ${p.shiftCode} — ${p.shiftName}`, `Tuần: ${p.weekStart}`];
  }
  if (action.type === 'schedule.change') {
    const p = action.preview;
    return [`Ca nguồn: ${p.sourceDate} (${p.sourceShift})`,
      `Hình thức: ${p.kind === 'COVER' ? 'nhận ca thay' : 'đổi ca'} / ${p.arrangement === 'MANAGER' ? 'quản lý điều phối' : 'trực tiếp'}`,
      `Người nhận: ${p.receiverName ?? 'quản lý chọn'}`, `Trạng thái: chờ xử lý`];
  }
  const p = action.preview;
  return [`Người yêu cầu: ${p.requesterName || '(không rõ)'}`, `Ca nguồn: ${p.sourceDate}`,
    `Người nhận: ${p.receiverName ?? '—'}`, `Trạng thái: ${p.status}`];
}

export const ScheduleActionCard: React.FC<ScheduleActionCardProps> = ({ initial, onExecuted }) => {
  const [action, setAction] = useState<ScheduleChatAction>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [closed, setClosed] = useState<'EXECUTED' | 'CANCELLED' | null>(null);
  const pending = closed === null;
  const labels = copy[action.type];

  const decide = async (approve: boolean) => {
    setBusy(true); setError('');
    try {
      const response = await apiFetch(`${API_BASE}/chat/actions/${encodeURIComponent(action.actionId)}/decision`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ approve }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        setError(body?.error?.message ?? 'Không xử lý được đề xuất lịch.');
        return;
      }
      const saved = await response.json();
      setAction(saved);
      setClosed(approve ? 'EXECUTED' : 'CANCELLED');
      onExecuted?.();
    } catch {
      setError('Mất kết nối khi xử lý đề xuất lịch.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="guta-chat-action-card" aria-label={labels.title}>
      <header>
        <strong>{labels.title}</strong>
        <span>{closed ?? 'chờ xác nhận'}</span>
      </header>
      <ul>
        {summary(action).map((line) => <li key={line}>{line}</li>)}
      </ul>
      {error && <p role="alert" className="guta-chat-action-error">{error}</p>}
      {pending ? (
        <div className="guta-chat-actions">
          <button type="button" disabled={busy} onClick={() => void decide(true)}>{labels.confirm}</button>
          <button type="button" disabled={busy} onClick={() => void decide(false)}>Huỷ</button>
        </div>
      ) : (
        <p className="guta-chat-action-done">
          {closed === 'EXECUTED' ? 'Đã ghi nhận. Kiểm tra lại bảng lịch để xác nhận.' : 'Đề xuất đã huỷ.'}
        </p>
      )}
    </section>
  );
};

import React from 'react';
import type { ScheduleEntry } from '../services/api';

interface StaffDrawerProps {
  schedule: ScheduleEntry | null;
  onClose: () => void;
  onActionMessage?: (msg: string) => void;
}

export const StaffDrawer: React.FC<StaffDrawerProps> = ({ schedule, onClose }) => {
  if (!schedule) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.6)',
          backdropFilter: 'blur(4px)',
          zIndex: 90,
        }}
      />
      <div
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 'min(400px, 100vw)',
          height: '100dvh',
          background: '#0f131c',
          borderLeft: '1px solid var(--border)',
          boxShadow: '-20px 0 50px rgba(0,0,0,0.8)',
          zIndex: 100,
          display: 'flex',
          flexDirection: 'column',
          padding: '24px',
          gap: '18px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '14px' }}>
          <h3 style={{ color: '#fff', fontSize: '15px', fontWeight: 700 }}>Hồ Sơ Vận Hành Nhân Viên</h3>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '18px' }}
          >
            ✕
          </button>
        </div>

        <div>
          <div style={{ fontSize: '18px', fontWeight: 800, color: '#fff' }}>
            {schedule.employee_name}
          </div>
          <div style={{ fontFamily: 'var(--mono)', color: 'var(--guta-yellow)', fontSize: '12px' }}>
            {schedule.employee_code}
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            fontSize: '12px',
            background: 'rgba(0,0,0,0.3)',
            padding: '14px',
            borderRadius: '6px',
            border: '1px solid var(--border)',
          }}
        >
          <div>Khối Ca: <strong style={{ color: '#fff' }}>{schedule.block_code}</strong></div>
          <div>Ca Trực: <strong style={{ color: '#fde047' }}>{schedule.shift_code} ({schedule.work_date})</strong></div>
          <div>Loại Lịch: <strong style={{ color: '#fff' }}>{schedule.schedule_type}</strong></div>
          <div>Tình Trạng: <span style={{ color: '#34d399' }}>● Đã ghi nhận lịch làm việc</span></div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: 'auto' }}>
          <button
            className="btn"
            disabled
            style={{
              padding: '10px',
              fontWeight: 600,
              background: 'rgba(255, 209, 0, 0.1)',
              color: 'var(--text-muted)',
              border: '1px dashed rgba(255, 209, 0, 0.3)',
              borderRadius: '6px',
              cursor: 'not-allowed',
            }}
          >
            ⚡ Điều Chuyển Ca (Đang Cập Nhật)
          </button>
          <button
            className="btn"
            onClick={onClose}
            style={{
              padding: '10px',
              background: 'var(--surface)',
              color: '#fff',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              cursor: 'pointer',
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </>
  );
};

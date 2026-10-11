import React from 'react';
import type { ScheduleEntry } from '../services/api';

interface VisualTimelineProps {
  schedules: ScheduleEntry[];
  onSelectEmployee: (schedule: ScheduleEntry) => void;
}

export const VisualTimeline: React.FC<VisualTimelineProps> = ({
  schedules,
  onSelectEmployee,
}) => {
  return (
    <div
      style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '12px',
        padding: '20px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <svg style={{ width: 16, height: 16, stroke: 'var(--guta-yellow)', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
          </svg>
          Dòng Thời Gian Phân Ca (Visual Timeline 24H)
        </div>
        <span
          style={{
            fontFamily: 'var(--mono)',
            fontSize: '10px',
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '3px 7px',
            borderRadius: '4px',
            color: 'var(--text-muted)',
          }}
        >
          {schedules.length} ca trực trong kỳ
        </span>
      </div>

      <div
        style={{
          background: 'rgba(10, 13, 20, 0.8)',
          border: '1px solid var(--border)',
          borderRadius: '8px',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Time ruler */}
        <div className="timeline-time-header">
          <span style={{ textAlign: 'left' }}>NHÂN SỰ</span>
          <span>06:00</span><span>07:00</span><span>08:00</span><span>09:00</span>
          <span>10:00</span><span>11:00</span><span>12:00</span><span>13:00</span>
          <span>14:00</span><span>15:00</span><span>16:00</span><span>17:00</span>
          <span>18:00</span><span>19:00</span><span>20:00</span><span>22:00</span>
        </div>

        {/* Empty state */}
        {schedules.length === 0 ? (
          <div style={{ padding: '36px 16px', textAlign: 'center', color: 'var(--text-muted)' }}>
            <p style={{ fontSize: '13px', marginBottom: '4px' }}>Chưa có ca trực nào được phân bổ cho điểm bán này</p>
            <p style={{ fontSize: '11px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
              Bấm 'Đồng Bộ' để tải lại dữ liệu mới nhất từ hệ thống
            </p>
          </div>
        ) : (
          schedules.map((item, idx) => {
            const isMorning = item.shift_code.startsWith('A');
            return (
              <div
                key={idx}
                className="timeline-row"
                onClick={() => onSelectEmployee(item)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div
                    style={{
                      width: '28px',
                      height: '28px',
                      borderRadius: '50%',
                      background: '#1e293b',
                      border: `1px solid ${isMorning ? 'var(--guta-yellow)' : '#38bdf8'}`,
                      color: isMorning ? 'var(--guta-yellow)' : '#38bdf8',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 700,
                      fontSize: '10px',
                      fontFamily: 'var(--mono)',
                      flexShrink: 0,
                    }}
                  >
                    {item.employee_name.charAt(0)}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <h4 style={{ fontSize: '12px', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.employee_name}
                    </h4>
                    <p style={{ fontSize: '10px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                      {item.employee_code}
                    </p>
                  </div>
                </div>

                <div className="timeline-track-cell">
                  <div
                    className="shift-pill-block"
                    style={{
                      left: isMorning ? '0%' : '50%',
                      width: '50%',
                      background: isMorning
                        ? 'linear-gradient(90deg, rgba(255, 209, 0, 0.18), rgba(255, 209, 0, 0.28))'
                        : 'linear-gradient(90deg, rgba(56, 189, 248, 0.18), rgba(56, 189, 248, 0.28))',
                      color: isMorning ? '#fef08a' : '#bae6fd',
                      border: `1px solid ${isMorning ? 'rgba(255, 209, 0, 0.4)' : 'rgba(56, 189, 248, 0.4)'}`,
                    }}
                  >
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.shift_code} • {isMorning ? '06:00 - 14:00 (Ca sáng)' : '14:00 - 22:00 (Ca chiều)'}
                    </span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

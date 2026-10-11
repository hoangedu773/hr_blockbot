import React from 'react';
import { CashCount, AttendanceCorrection } from '../services/api';

interface TwoColumnGridProps {
  cashCounts: CashCount[];
  corrections: AttendanceCorrection[];
  onApproveCorrection: (id: number | string) => void;
  onRejectCorrection: (id: number | string) => void;
}

export const TwoColumnGrid: React.FC<TwoColumnGridProps> = ({
  cashCounts,
  corrections,
  onApproveCorrection,
  onRejectCorrection
}) => {
  return (
    <div className="two-col-responsive" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
      gap: '16px'
    }}>
      {/* Col 1: Cash Counts */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(14, 18, 27, 0.7)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>Bảng Kê Tiền Két Điểm Bán</span>
          <span style={{
            fontFamily: 'var(--mono)',
            fontSize: '10px',
            background: 'rgba(255, 255, 255, 0.08)',
            padding: '2px 6px',
            borderRadius: '4px',
            color: 'var(--text-muted)'
          }}>
            cash_counts
          </span>
        </div>

        {cashCounts.map((c, idx) => (
          <div key={idx} style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ color: '#fff' }}>{c.store_name}</strong>
              <span style={{ fontFamily: 'var(--mono)', color: '#34d399', fontWeight: 700 }}>
                {c.grand_total_vnd.toLocaleString('vi-VN')} ₫
              </span>
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              Tiền mặt: {c.cash_total_vnd.toLocaleString('vi-VN')} ₫ • Vãng lai: {c.walkin_total_vnd.toLocaleString('vi-VN')} ₫ • Khớp 100%
            </div>
          </div>
        ))}
      </div>

      {/* Col 2: Attendance Corrections */}
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: '10px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '12px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'rgba(14, 18, 27, 0.7)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}>
          <span style={{ fontWeight: 700, fontSize: '13px', color: '#fff' }}>Phiếu Khiếu Nại Chờ Duyệt</span>
          <span style={{
            fontSize: '10px',
            fontWeight: 700,
            padding: '2px 6px',
            borderRadius: '10px',
            background: 'rgba(245, 158, 11, 0.2)',
            color: '#fbbf24',
            fontFamily: 'var(--mono)'
          }}>
            Kỳ 6/5 - 5/6
          </span>
        </div>

        {corrections.map((item, idx) => (
          <div key={idx} style={{
            padding: '12px 18px',
            borderBottom: '1px solid var(--border)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontWeight: 700, color: '#fff' }}>
                {item.employee_name || item.employee_code}
              </span>
              <span style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
                Ca {item.shift_code} • {item.work_date}
              </span>
            </div>
            <div style={{
              fontSize: '12px',
              color: '#cbd5e1',
              background: 'rgba(10, 13, 20, 0.8)',
              padding: '8px 12px',
              borderRadius: '5px',
              borderLeft: '3px solid var(--guta-yellow)'
            }}>
              "{item.note}"
            </div>
            <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
              <button
                className="btn btn-gold"
                disabled={item.status === 'APPROVED'}
                onClick={() => onApproveCorrection(item.id || item.employee_code)}
                style={{
                  minHeight: '28px',
                  padding: '3px 12px',
                  background: item.status === 'APPROVED' ? '#065f46' : 'var(--guta-yellow)',
                  color: item.status === 'APPROVED' ? '#a7f3d0' : '#07090e',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: item.status === 'APPROVED' ? 'default' : 'pointer'
                }}
              >
                {item.status === 'APPROVED' ? '✓ Đã duyệt' : 'Duyệt Công'}
              </button>
              <button
                className="btn"
                onClick={() => onRejectCorrection(item.id || item.employee_code)}
                style={{
                  minHeight: '28px',
                  padding: '3px 12px',
                  border: '1px solid var(--border)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Từ Chối
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

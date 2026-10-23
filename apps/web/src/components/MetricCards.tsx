import React from 'react';

interface MetricCardsProps {
  employeeCount: number | null;
  shiftsTodayCount: number;
  pendingCorrectionCount: number;
  cashFund: number | null;
}

export const MetricCards: React.FC<MetricCardsProps> = ({
  employeeCount,
  shiftsTodayCount,
  pendingCorrectionCount,
  cashFund,
}) => {
  return (
    <div className="metric-grid-container">
      {/* Metric 1 */}
      <div
        className="metric-card-box"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          transition: 'all 180ms ease',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
          <span>NHÂN SỰ ĐIỂM BÁN</span>
          <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none' }} viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        </div>
        <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#fff' }}>
          {employeeCount !== null ? `${employeeCount} NV` : '—'}
        </div>
        <div style={{ fontSize: '11px', color: employeeCount ? 'var(--emerald)' : 'var(--text-faint)', fontWeight: 500 }}>
          {employeeCount ? 'Theo định biên điểm bán' : 'Chưa có dữ liệu điểm bán'}
        </div>
      </div>

      {/* Metric 2 */}
      <div
        className="metric-card-box"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          transition: 'all 180ms ease',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
          <span>CA TRỰC HÔM NAY</span>
          <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none' }} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        </div>
        <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent-primary)' }}>
          {shiftsTodayCount} Ca
        </div>
        <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          {shiftsTodayCount > 0 ? 'Dữ liệu phân ca thực tế' : 'Chưa ghi nhận ca trực'}
        </div>
      </div>

      {/* Metric 3 */}
      <div
        className="metric-card-box"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          transition: 'all 180ms ease',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
          <span>PHIẾU GIẢI TRÌNH CHỜ DUYỆT</span>
          <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none' }} viewBox="0 0 24 24">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--mono)', color: 'var(--accent-primary)' }}>
          {pendingCorrectionCount} Phiếu
        </div>
        <div style={{ fontSize: '11px', color: pendingCorrectionCount > 0 ? 'var(--accent-primary)' : 'var(--text-faint)' }}>
          {pendingCorrectionCount > 0 ? 'Cần Cửa hàng trưởng phê duyệt' : 'Không có tồn đọng'}
        </div>
      </div>

      {/* Metric 4 */}
      <div
        className="metric-card-box"
        style={{
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: '10px',
          padding: '16px 18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          transition: 'all 180ms ease',
        }}
      >
        <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600, display: 'flex', justifyContent: 'space-between' }}>
          <span>QUỸ KÉT TIỀN GIAO CA</span>
          <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none' }} viewBox="0 0 24 24">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2" />
          </svg>
        </div>
        <div style={{ fontSize: '22px', fontWeight: 800, fontFamily: 'var(--mono)', color: cashFund !== null ? '#34d399' : 'var(--text-muted)' }}>
          {cashFund !== null ? `${cashFund.toLocaleString('vi-VN')} ₫` : '—'}
        </div>
        <div style={{ fontSize: '11px', color: cashFund !== null ? 'var(--emerald)' : 'var(--text-faint)' }}>
          {cashFund !== null ? 'Số liệu kiểm kê đối soát' : 'Tính năng đang cập nhật'}
        </div>
      </div>
    </div>
  );
};

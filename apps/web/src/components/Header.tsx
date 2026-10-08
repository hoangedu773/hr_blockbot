import React from 'react';

interface HeaderProps {
  storeName: string;
  onSync: () => void;
  onAddShift: () => void;
}

export const Header: React.FC<HeaderProps> = ({ storeName, onSync, onAddShift }) => {
  return (
    <header style={{
      padding: '12px 24px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      background: 'rgba(11, 14, 21, 0.85)',
      backdropFilter: 'blur(16px)',
      position: 'sticky',
      top: 0,
      zIndex: 30,
      gap: '16px'
    }}>
      <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <h1 style={{
          fontSize: '15px',
          fontWeight: 700,
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          {storeName}
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--emerald)',
              boxShadow: '0 0 10px var(--emerald)',
              display: 'inline-block',
              flexShrink: 0
            }}
            title="Đồng bộ trực tiếp với MongoDB Atlas hr_bot"
          />
        </h1>
        <p style={{
          fontSize: '11px',
          color: 'var(--text-muted)',
          fontFamily: 'var(--mono)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis'
        }}>
          Kỳ Lương 06/05 – 05/06/2026 • Khối ca 1BNK • Dữ liệu live Atlas
        </p>
      </div>

      <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        <button
          className="btn"
          onClick={onSync}
          style={{
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid var(--border)',
            background: 'var(--surface-card)',
            color: 'var(--text)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/>
          </svg>
          Đồng Bộ
        </button>

        <button
          className="btn btn-gold"
          onClick={onAddShift}
          style={{
            padding: '7px 14px',
            borderRadius: '6px',
            fontSize: '12px',
            fontWeight: 700,
            cursor: 'pointer',
            border: '1px solid var(--guta-yellow)',
            background: 'var(--guta-yellow)',
            color: '#07090e',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            boxShadow: '0 2px 10px rgba(255, 209, 0, 0.2)'
          }}
        >
          + Xếp Thêm Ca
        </button>
      </div>
    </header>
  );
};

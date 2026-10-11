import React from 'react';
import type { AuthUser } from '@hr-blockbot/contracts';

interface HeaderProps {
  storeName: string;
  onSync: () => void;
  onAddShift: () => void;
  user: AuthUser | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  storeName,
  onSync,
  onAddShift,
  user,
  onLogout,
}) => {
  return (
    <header
      className="app-header"
      style={{
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
        gap: '16px',
      }}
    >
      <div className="header-titles" style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <h1
          style={{
            fontSize: '15px',
            fontWeight: 700,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {storeName}
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: 'var(--emerald)',
              boxShadow: '0 0 10px var(--emerald)',
              display: 'inline-block',
              flexShrink: 0,
            }}
            title="Đồng bộ trực tiếp qua REST API (không mock data)"
          />
        </h1>
        <p
          style={{
            fontSize: '11px',
            color: 'var(--text-muted)',
            fontFamily: 'var(--mono)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          Kỳ Lương 06/05 – 05/06/2026 • Khối ca 1BNK • Dữ liệu live API
        </p>
      </div>

      <div className="header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
        {/* User Role Badge */}
        {user && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '4px 8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              fontSize: '11px',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--mono)',
                fontWeight: 700,
                color: user.role === 'Admin' ? 'var(--guta-yellow)' : '#38bdf8',
              }}
            >
              {user.role}
            </span>
          </div>
        )}

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
            gap: '6px',
          }}
        >
          <svg style={{ width: 14, height: 14, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
            <polyline points="1 4 1 10 7 10" />
            <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
          </svg>
          Đồng Bộ
        </button>

        <button
          className="btn"
          onClick={onAddShift}
          style={{
            padding: '7px 12px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 600,
            cursor: 'pointer',
            border: '1px dashed rgba(255, 209, 0, 0.4)',
            background: 'rgba(255, 209, 0, 0.08)',
            color: 'var(--guta-yellow)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
          }}
          title="Xếp ca động đang được phát triển trong kỳ kế tiếp"
        >
          + Xếp Ca (Đang cập nhật)
        </button>

        <button
          className="btn"
          onClick={onLogout}
          style={{
            padding: '7px 10px',
            borderRadius: '6px',
            fontSize: '11px',
            fontWeight: 500,
            cursor: 'pointer',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
          }}
          title="Đăng xuất và xóa sạch in-memory access token"
        >
          Thoát
        </button>
      </div>
    </header>
  );
};

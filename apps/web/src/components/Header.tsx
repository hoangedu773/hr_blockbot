import React from 'react';
import type { AuthUser } from '@hr-blockbot/contracts';

interface HeaderProps {
  title: string;
  subtitle: string;
  user: AuthUser | null;
  onLogout: () => void;
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, user, onLogout }) => {
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
            color: '#f8fafc',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {title}
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
          {subtitle}
        </p>
      </div>

      <div className="header-actions" style={{ display: 'flex', gap: '8px', alignItems: 'center', flexShrink: 0 }}>
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
                color: user.role === 'Admin' ? 'var(--guta-yellow)' : '#7dd3fc',
              }}
            >
              {user.role}
            </span>
          </div>
        )}

        <button
          type="button"
          className="btn btn--ghost"
          onClick={onLogout}
          title="Đăng xuất và xoá access token khỏi bộ nhớ"
        >
          Thoát
        </button>
      </div>
    </header>
  );
};

import React from 'react';
import type { Store } from '../services/api';

interface SidebarProps {
  stores: Store[];
  activeStore: string;
  onSelectStore: (store: string) => void;
  activeNav: string;
  onSelectNav: (nav: string) => void;
  pendingCorrectionCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  stores,
  activeStore,
  onSelectStore,
  activeNav,
  onSelectNav,
  pendingCorrectionCount,
}) => {
  return (
    <aside
      style={{
        width: '250px',
        background: 'rgba(11, 14, 21, 0.85)',
        backdropFilter: 'blur(20px)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 20,
      }}
    >
      {/* Brand box */}
      <div
        style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
          alignItems: 'flex-start',
          overflow: 'hidden',
          maxWidth: '100%',
        }}
      >
        <img
          src="/assets/guta-logo.png"
          alt="GUTA CAFE"
          style={{
            maxWidth: '120px',
            height: 'auto',
            objectFit: 'contain',
            display: 'block',
            filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))',
          }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--guta-yellow)',
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              background: 'rgba(255, 209, 0, 0.12)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(255, 209, 0, 0.25)',
            }}
          >
            COMMAND CENTER
          </span>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--text-faint)',
              fontFamily: 'var(--mono)',
              fontWeight: 600,
            }}
          >
            {stores.length} ĐIỂM BÁN
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav style={{ padding: '14px 10px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <div
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            color: 'var(--text-faint)',
            fontWeight: 700,
            padding: '10px 10px 4px',
            letterSpacing: '0.06em',
          }}
        >
          Vận Hành Chi Nhánh
        </div>

        <div
          onClick={() => onSelectNav('schedule')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '9px 12px',
            color: activeNav === 'schedule' ? 'var(--guta-yellow)' : 'var(--text-muted)',
            background: activeNav === 'schedule' ? 'rgba(255, 209, 0, 0.08)' : 'transparent',
            borderColor: activeNav === 'schedule' ? 'rgba(255, 209, 0, 0.25)' : 'transparent',
            borderRadius: '8px',
            borderWidth: '1px',
            borderStyle: 'solid',
            cursor: 'pointer',
            fontWeight: activeNav === 'schedule' ? 600 : 500,
          }}
        >
          <svg style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
          </svg>
          <span>Lịch Ca & Phân Bổ</span>
        </div>

        <div
          onClick={() => onSelectNav('corrections')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '9px 12px',
            color: activeNav === 'corrections' ? 'var(--guta-yellow)' : 'var(--text-muted)',
            background: activeNav === 'corrections' ? 'rgba(255, 209, 0, 0.08)' : 'transparent',
            borderColor: activeNav === 'corrections' ? 'rgba(255, 209, 0, 0.25)' : 'transparent',
            borderRadius: '8px',
            borderWidth: '1px',
            borderStyle: 'solid',
            cursor: 'pointer',
            fontWeight: activeNav === 'corrections' ? 600 : 500,
          }}
        >
          <svg style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>Duyệt Giải Trình</span>
          {pendingCorrectionCount > 0 && (
            <span
              style={{
                marginLeft: 'auto',
                fontSize: '10px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '10px',
                background: 'rgba(245, 158, 11, 0.2)',
                color: '#fbbf24',
                fontFamily: 'var(--mono)',
                border: '1px solid rgba(245, 158, 11, 0.3)',
              }}
            >
              {pendingCorrectionCount} Tồn
            </span>
          )}
        </div>

        <div
          onClick={() => onSelectNav('cash')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '9px 12px',
            color: activeNav === 'cash' ? 'var(--guta-yellow)' : 'var(--text-muted)',
            background: activeNav === 'cash' ? 'rgba(255, 209, 0, 0.08)' : 'transparent',
            borderColor: activeNav === 'cash' ? 'rgba(255, 209, 0, 0.25)' : 'transparent',
            borderRadius: '8px',
            borderWidth: '1px',
            borderStyle: 'solid',
            cursor: 'pointer',
            fontWeight: activeNav === 'cash' ? 600 : 500,
            opacity: 0.8,
          }}
          title="Phân hệ tiền két đang trong lộ trình phát triển"
        >
          <svg style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
            <rect x="2" y="6" width="20" height="12" rx="2" />
            <circle cx="12" cy="12" r="2" />
          </svg>
          <span>Đối Soát Két Tiền</span>
          <span style={{ marginLeft: 'auto', fontSize: '9px', color: 'var(--text-faint)', fontFamily: 'var(--mono)' }}>
            [Cập nhật]
          </span>
        </div>

        <div
          style={{
            fontSize: '10px',
            textTransform: 'uppercase',
            color: 'var(--text-faint)',
            fontWeight: 700,
            padding: '14px 10px 4px',
            letterSpacing: '0.06em',
          }}
        >
          Hệ Thống Trụ Sở
        </div>

        <div
          onClick={() => onSelectNav('employees')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            padding: '9px 12px',
            color: activeNav === 'employees' ? 'var(--guta-yellow)' : 'var(--text-muted)',
            background: activeNav === 'employees' ? 'rgba(255, 209, 0, 0.08)' : 'transparent',
            borderColor: activeNav === 'employees' ? 'rgba(255, 209, 0, 0.25)' : 'transparent',
            borderRadius: '8px',
            borderWidth: '1px',
            borderStyle: 'solid',
            cursor: 'pointer',
            fontWeight: activeNav === 'employees' ? 600 : 500,
          }}
        >
          <svg style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
          </svg>
          <span>Hồ Sơ Nhân Sự</span>
        </div>
      </nav>

      {/* Store selector at bottom */}
      <div
        style={{
          padding: '14px 16px',
          borderTop: '1px solid var(--border)',
          background: 'rgba(7, 9, 14, 0.9)',
        }}
      >
        <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginBottom: '6px', fontWeight: 700, textTransform: 'uppercase' }}>
          Điểm Bán Đang Chọn:
        </div>
        <select
          value={activeStore}
          onChange={(e) => onSelectStore(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--surface-card)',
            color: '#fff',
            border: '1px solid var(--border)',
            padding: '7px 10px',
            borderRadius: '6px',
            fontSize: '12px',
            outline: 'none',
            cursor: 'pointer',
          }}
        >
          {stores.length === 0 ? (
            <option value="">(Chưa có dữ liệu điểm bán)</option>
          ) : (
            stores.map((s, idx) => (
              <option key={idx} value={s.store_name}>
                {s.store_name} ({s.employee_count} NV)
              </option>
            ))
          )}
        </select>
      </div>
    </aside>
  );
};

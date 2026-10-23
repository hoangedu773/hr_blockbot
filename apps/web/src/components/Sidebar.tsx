import React from 'react';
import { API_BASE } from '../services/auth';
import type { UserRole } from '@hr-blockbot/contracts';

interface SidebarProps {
  role: UserRole;
  activeNav: string;
  onSelectNav: (nav: string) => void;
}

const Icon = (path: React.ReactNode) => (
  <svg style={{ width: 16, height: 16, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75, flexShrink: 0 }} viewBox="0 0 24 24" aria-hidden="true">
    {path}
  </svg>
);

const ICONS = {
  people: Icon(
    <>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </>
  ),
  projects: Icon(
    <>
      <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M3 10h18" />
    </>
  ),
  chat: Icon(
    <>
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l2.2-2.6A8.5 8.5 0 1 1 21 11.5z" />
      <line x1="8" y1="11" x2="16" y2="11" />
      <line x1="8" y1="14.5" x2="13" y2="14.5" />
    </>
  ),
  settings: Icon(
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 3a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z" />
    </>
  ),
  profile: Icon(
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 21a7 7 0 0 1 14 0" />
    </>
  ),
};

interface NavEntry {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const ADMIN_NAV: { section: string; entries: NavEntry[] }[] = [
  {
    section: 'Vận Hành F1 · F2',
    entries: [
      { id: 'employees', label: 'Hồ Sơ Nhân Sự', icon: ICONS.people },
      { id: 'projects', label: 'Vòng Đời Đề Tài', icon: ICONS.projects },
      { id: 'chat', label: 'Trợ Lý Chính Sách', icon: ICONS.chat },
    ],
  },
  {
    section: 'Quản Trị',
    entries: [{ id: 'settings', label: 'Cấu Hình LLM', icon: ICONS.settings }],
  },
];

const EMPLOYEE_NAV: { section: string; entries: NavEntry[] }[] = [
  {
    section: 'Cá Nhân',
    entries: [
      { id: 'profile', label: 'Hồ Sơ Của Tôi', icon: ICONS.profile },
      { id: 'projects', label: 'Đề Tài Được Giao', icon: ICONS.projects },
      { id: 'chat', label: 'Trợ Lý Chính Sách', icon: ICONS.chat },
    ],
  },
];

export const Sidebar: React.FC<SidebarProps> = ({ role, activeNav, onSelectNav }) => {
  const groups = role === 'Admin' ? ADMIN_NAV : EMPLOYEE_NAV;

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
      <div
        style={{
          padding: '16px 18px',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          flexDirection: 'column',
          gap: '6px',
        }}
      >
        <img
          src="/assets/guta-logo.png"
          alt="GUTA CAFE"
          style={{ maxWidth: '120px', height: 'auto', objectFit: 'contain', display: 'block', filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.5))' }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: '10px',
              color: 'var(--accent-primary)',
              fontFamily: 'var(--mono)',
              fontWeight: 700,
              letterSpacing: '0.05em',
              textTransform: 'uppercase',
              background: 'rgba(37, 99, 235, 0.12)',
              padding: '2px 6px',
              borderRadius: '4px',
              border: '1px solid rgba(37, 99, 235, 0.25)',
            }}
          >
            WORKFORCE OPS
          </span>
          <span className="chip">{role === 'Admin' ? 'ADMIN SCOPE' : 'OWN SCOPE'}</span>
        </div>
      </div>

      <nav style={{ padding: '10px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {groups.map((group) => (
          <React.Fragment key={group.section}>
            <div className="nav-section">{group.section}</div>
            {group.entries.map((entry) => (
              <button
                key={entry.id}
                type="button"
                className="nav-item"
                aria-current={activeNav === entry.id ? 'page' : undefined}
                onClick={() => onSelectNav(entry.id)}
              >
                {entry.icon}
                <span>{entry.label}</span>
              </button>
            ))}
          </React.Fragment>
        ))}
      </nav>

      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', background: 'rgba(7, 9, 14, 0.9)' }}>
        <div style={{ fontSize: '10px', color: 'var(--text-faint)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
          API Endpoint
        </div>
        <div
          title={API_BASE}
          style={{
            fontSize: '10px',
            fontFamily: 'var(--mono)',
            color: 'var(--text-muted)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {API_BASE}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-faint)', marginTop: '6px' }}>
          F1 hồ sơ · F2 đề tài · F3 trợ lý chính sách
        </div>
      </div>
    </aside>
  );
};

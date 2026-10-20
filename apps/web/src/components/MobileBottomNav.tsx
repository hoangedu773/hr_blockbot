import React from 'react';
import type { UserRole } from '@hr-blockbot/contracts';

interface MobileBottomNavProps {
  role: UserRole;
  activeTab: string;
  onSelectTab: (tab: string) => void;
}

interface TabEntry {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const icon = (path: React.ReactNode) => (
  <svg style={{ width: 18, height: 18, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24" aria-hidden="true">
    {path}
  </svg>
);

const TABS: Record<UserRole, TabEntry[]> = {
  Admin: [
    {
      id: 'employees',
      label: 'Nhân Sự',
      icon: icon(
        <>
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
          <circle cx="9" cy="7" r="4" />
        </>
      ),
    },
    {
      id: 'projects',
      label: 'Đề Tài',
      icon: icon(
        <>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M3 10h18" />
        </>
      ),
    },
    {
      id: 'chat',
      label: 'Trợ Lý',
      icon: icon(
        <>
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l2.2-2.6A8.5 8.5 0 1 1 21 11.5z" />
        </>
      ),
    },
    {
      id: 'settings',
      label: 'Cấu Hình',
      icon: icon(
        <>
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2 2 2 0 1 1-4 0 1.7 1.7 0 0 0-2.9-1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.7 1.7 0 0 0 3 15a2 2 0 1 1 0-4 1.7 1.7 0 0 0 1.5-2.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.7 1.7 0 0 0 11 3a2 2 0 1 1 4 0 1.7 1.7 0 0 0 2.9 1.5l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1A1.7 1.7 0 0 0 21 11a2 2 0 1 1 0 4z" />
        </>
      ),
    },
  ],
  Employee: [
    {
      id: 'profile',
      label: 'Hồ Sơ',
      icon: icon(
        <>
          <circle cx="12" cy="8" r="3.5" />
          <path d="M5 21a7 7 0 0 1 14 0" />
        </>
      ),
    },
    {
      id: 'projects',
      label: 'Đề Tài',
      icon: icon(
        <>
          <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <path d="M3 10h18" />
        </>
      ),
    },
    {
      id: 'chat',
      label: 'Trợ Lý',
      icon: icon(
        <>
          <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l2.2-2.6A8.5 8.5 0 1 1 21 11.5z" />
        </>
      ),
    },
  ],
};

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({ role, activeTab, onSelectTab }) => {
  return (
    <div className="mobile-bottom-nav">
      {TABS[role].map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`m-nav-item ${activeTab === tab.id ? 'active' : ''}`}
          aria-current={activeTab === tab.id ? 'page' : undefined}
          onClick={() => onSelectTab(tab.id)}
          style={{ background: 'transparent', border: 0, padding: 0 }}
        >
          {tab.icon}
          <span>{tab.label}</span>
        </button>
      ))}
    </div>
  );
};

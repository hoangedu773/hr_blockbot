import React from 'react';

interface MobileBottomNavProps {
  activeTab: string;
  onSelectTab: (tab: string) => void;
  onOpenAi: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeTab,
  onSelectTab,
  onOpenAi
}) => {
  return (
    <div className="mobile-bottom-nav">
      <div
        className={`m-nav-item ${activeTab === 'schedule' ? 'active' : ''}`}
        onClick={() => onSelectTab('schedule')}
      >
        <svg style={{ width: 18, height: 18, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
          <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
          <line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/>
        </svg>
        <span>Lịch Ca</span>
      </div>

      <div
        className={`m-nav-item ${activeTab === 'corrections' ? 'active' : ''}`}
        onClick={() => onSelectTab('corrections')}
      >
        <svg style={{ width: 18, height: 18, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
        </svg>
        <span>Duyệt Công</span>
      </div>

      <div
        className={`m-nav-item ${activeTab === 'cash' ? 'active' : ''}`}
        onClick={() => onSelectTab('cash')}
      >
        <svg style={{ width: 18, height: 18, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
          <rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/>
        </svg>
        <span>Két Tiền</span>
      </div>

      <div
        className="m-nav-item"
        onClick={onOpenAi}
      >
        <svg style={{ width: 18, height: 18, stroke: 'currentColor', fill: 'none', strokeWidth: 1.75 }} viewBox="0 0 24 24">
          <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
        </svg>
        <span>AI Bot</span>
      </div>
    </div>
  );
};

import React from 'react';

export type AppIconName =
  | 'store'
  | 'user'
  | 'calendar'
  | 'document'
  | 'shieldCheck'
  | 'alert'
  | 'checkCircle'
  | 'xCircle'
  | 'search'
  | 'filter'
  | 'trend'
  | 'revenue'
  | 'export'
  | 'allocation'
  | 'lock'
  | 'options'
  | 'target'
  | 'zap'
  | 'clock'
  | 'sparkles'
  | 'message'
  | 'table'
  | 'cards'
  | 'plus'
  | 'edit'
  | 'phone'
  | 'mail'
  | 'link'
  | 'chain'
  | 'building'
  | 'crown'
  | 'tie'
  | 'clipboard'
  | 'handshake'
  | 'coffee'
  | 'bulb'
  | 'download'
  | 'map'
  | 'close';

export interface AppIconProps {
  name: AppIconName;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const ICON_PATHS: Record<AppIconName, React.ReactNode> = {
  store: (
    <>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5.5 9v11h13V9M9 20v-6h6v6" />
    </>
  ),
  user: (
    <>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20v-1.5a6.5 6.5 0 0 1 13 0V20zM16 5.5a3.5 3.5 0 0 1 0 6.8M18 15a5 5 0 0 1 3.5 4.7V20h-4" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18M8 14h3M14 14h2M8 18h2" />
    </>
  ),
  document: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M8 7h8M8 11h8M8 15h4M17 15l1.5 1.5L21 14" />
    </>
  ),
  shieldCheck: (
    <>
      <path d="M12 3 20 6v5.5c0 4.7-3.3 7.8-8 9.5-4.7-1.7-8-4.8-8-9.5V6z" />
      <path d="m8.5 12 2.3 2.3 4.8-5" />
    </>
  ),
  alert: (
    <>
      <path d="M12 3 22 20H2z" />
      <path d="M12 9v5M12 17.5h.01" />
    </>
  ),
  checkCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m8 12 2.5 2.5L16 9" />
    </>
  ),
  xCircle: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m9 9 6 6m0-6-6 6" />
    </>
  ),
  search: (
    <>
      <circle cx="10.8" cy="10.8" r="6.3" />
      <path d="m16 16 4.5 4.5M8 10.8h5.6" />
    </>
  ),
  filter: <path d="M4 5h16l-6.2 7.2v5.4l-3.6 2v-7.4z" />,
  trend: (
    <>
      <path d="M4 18V6m0 12h17M7 15l4-4 3 2 6-7" />
      <path d="M16 6h4v4" />
    </>
  ),
  revenue: (
    <>
      <path d="M12 3v18M5 8h10a3 3 0 0 1 0 6H8a3 3 0 0 0 0 6h11" />
      <circle cx="12" cy="3" r="1" />
      <circle cx="12" cy="21" r="1" />
    </>
  ),
  export: (
    <>
      <path d="M7 3h7l5 5v13H5V3zM14 3v6h5M8 13h8M8 17h6" />
    </>
  ),
  allocation: <path d="M12 3v18M6 8h9a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h9" />,
  lock: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4M12 15v2" />
    </>
  ),
  options: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" />
      <circle cx="9" cy="5" r="2" fill="none" />
      <circle cx="15" cy="12" r="2" fill="none" />
      <circle cx="10" cy="19" r="2" fill="none" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" />
    </>
  ),
  zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 6 12 12 16 14" />
    </>
  ),
  sparkles: (
    <path d="m12 3 1.9 5.8a2 2 0 0 0 1.3 1.3L21 12l-5.8 1.9a2 2 0 0 0-1.3 1.3L12 21l-1.9-5.8a2 2 0 0 0-1.3-1.3L3 12l5.8-1.9a2 2 0 0 0 1.3-1.3Z" />
  ),
  message: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  table: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M3 15h18M9 9v12" />
    </>
  ),
  cards: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M7 5V3h10v2M3 10h18" />
    </>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  edit: <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />,
  phone: (
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  ),
  mail: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <polyline points="3 7 12 13 21 7" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </>
  ),
  chain: <path d="M9 17H7A5 5 0 0 1 7 7h2M15 7h2a5 5 0 1 1 0 10h-2M8 12h8" />,
  building: (
    <>
      <line x1="2" y1="21" x2="22" y2="21" />
      <line x1="12" y1="3" x2="2" y2="8" />
      <line x1="12" y1="3" x2="22" y2="8" />
      <line x1="6" y1="8" x2="6" y2="18" />
      <line x1="10" y1="8" x2="10" y2="18" />
      <line x1="14" y1="8" x2="14" y2="18" />
      <line x1="18" y1="8" x2="18" y2="18" />
      <line x1="4" y1="18" x2="20" y2="18" />
    </>
  ),
  crown: (
    <>
      <path d="m2 4 3 12h14l3-12-6 7-4-7-4 7-6-7zm3 16h14" />
    </>
  ),
  tie: (
    <>
      <path d="m10 3 2 4 2-4h-4zm2 4-2 7 2 7 2-7-2-7z" />
      <path d="M6 3h12l-2 4H8z" />
    </>
  ),
  clipboard: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <rect x="4" y="4" width="16" height="17" rx="2" />
      <path d="M8 11h8M8 15h6" />
    </>
  ),
  handshake: (
    <>
      <path d="m11 17 2 2a1 1 0 0 0 1.4 0l4.3-4.3a1 1 0 0 0 0-1.4l-1.3-1.3M8 14l-2 2a1 1 0 0 0 0 1.4l1.3 1.3a1 1 0 0 0 1.4 0l2-2" />
      <path d="M2 11 9 4a2 2 0 0 1 2.8 0L17 9.2a2 2 0 0 1 0 2.8L12 17" />
    </>
  ),
  coffee: (
    <>
      <path d="M18 8h1a4 4 0 0 1 0 8h-1M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8zM6 1v3M10 1v3M14 1v3" />
    </>
  ),
  bulb: (
    <>
      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4.5 12.3c.7.6 1.5 1.7 1.5 2.7h6c0-1 .8-2.1 1.5-2.7A7 7 0 0 0 12 2z" />
    </>
  ),
  download: (
    <>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </>
  ),
  map: (
    <>
      <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21" />
      <line x1="9" y1="3" x2="9" y2="18" />
      <line x1="15" y1="6" x2="15" y2="21" />
    </>
  ),
  close: (
    <>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </>
  ),
};

export const AppIcon: React.FC<AppIconProps> = ({
  name,
  size = 16,
  className,
  style,
}) => {
  const content = ICON_PATHS[name];
  if (!content) return null;

  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
      style={{ display: 'inline-block', verticalAlign: 'middle', flexShrink: 0, ...style }}
    >
      {content}
    </svg>
  );
};

import React, { useState, useEffect } from 'react';

export interface LandingNavbarProps {
  onOpenAuthModal: () => void;
}

export const LandingNavbar: React.FC<LandingNavbarProps> = ({ onOpenAuthModal }) => {
  const [isDark, setIsDark] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('theme');
      if (saved) return saved === 'dark';
      return document.documentElement.classList.contains('dark') || true;
    }
    return true;
  });

  useEffect(() => {
    if (isDark) {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    }
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark((prev) => !prev);
  };

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        backdropFilter: 'blur(16px)',
        backgroundColor: 'rgba(9, 13, 22, 0.85)',
        borderBottom: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.08))',
        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
      }}
    >
      <div
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '14px 24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(37, 99, 235, 0.4)',
            }}
          >
            <span style={{ color: '#ffffff', fontWeight: 800, fontSize: '16px' }}>G</span>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span
                style={{
                  fontWeight: 800,
                  fontSize: '15px',
                  letterSpacing: '-0.02em',
                  color: 'var(--text-primary, #f8fafc)',
                }}
              >
                GUTA WORKSPACE
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--mono)',
                  fontWeight: 700,
                  padding: '1px 6px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(37, 99, 235, 0.15)',
                  color: '#3b82f6',
                  border: '1px solid rgba(37, 99, 235, 0.3)',
                }}
              >
                FOLIO 2.0
              </span>
            </div>
            <div
              style={{
                fontSize: '10px',
                color: 'var(--text-muted, #94a3b8)',
                letterSpacing: '0.04em',
              }}
            >
              PRECISION F&amp;B WORKFORCE CRM
            </div>
          </div>
        </div>

        {/* Navigation Anchors */}
        <nav
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '24px',
          }}
          className="desktop-nav"
        >
          <a
            href="#features"
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary, #cbd5e1)',
              textDecoration: 'none',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#3b82f6')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary, #cbd5e1)')}
          >
            Tính Năng
          </a>
          <a
            href="#tabs"
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary, #cbd5e1)',
              textDecoration: 'none',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#3b82f6')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary, #cbd5e1)')}
          >
            Quy Trình
          </a>
          <a
            href="#faq"
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: 'var(--text-secondary, #cbd5e1)',
              textDecoration: 'none',
              transition: 'color 150ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#3b82f6')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary, #cbd5e1)')}
          >
            Hỏi Đáp
          </a>
        </nav>

        {/* Right CTA Actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Chuyển đổi giao diện sáng/tối"
            style={{
              background: 'transparent',
              border: '1px solid var(--border-subtle, rgba(255, 255, 255, 0.12))',
              color: 'var(--text-primary, #f8fafc)',
              borderRadius: '8px',
              padding: '6px 10px',
              cursor: 'pointer',
              fontSize: '12px',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'all 150ms ease',
            }}
          >
            {isDark ? '🌙 Tối' : '☀️ Sáng'}
          </button>

          {/* Login / Get Started */}
          <button
            type="button"
            onClick={onOpenAuthModal}
            style={{
              background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
              color: '#ffffff',
              border: 'none',
              padding: '8px 18px',
              borderRadius: '8px',
              fontWeight: 600,
              fontSize: '13px',
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(37, 99, 235, 0.35)',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              transition: 'transform 150ms ease, box-shadow 150ms ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = 'translateY(-1px)';
              e.currentTarget.style.boxShadow = '0 6px 20px rgba(37, 99, 235, 0.45)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = 'translateY(0)';
              e.currentTarget.style.boxShadow = '0 4px 16px rgba(37, 99, 235, 0.35)';
            }}
          >
            <span>Get Started</span>
            <span style={{ fontSize: '11px' }}>→</span>
          </button>
        </div>
      </div>
    </header>
  );
};

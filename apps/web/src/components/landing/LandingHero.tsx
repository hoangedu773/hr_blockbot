import React from 'react';

export interface LandingHeroProps {
  onOpenAuthModal: () => void;
}

export const LandingHero: React.FC<LandingHeroProps> = ({ onOpenAuthModal }) => {
  return (
    <section
      style={{
        position: 'relative',
        padding: '64px 24px 80px',
        maxWidth: '1280px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        textAlign: 'center',
        overflow: 'hidden',
      }}
    >
      {/* Background Radial Glow (Electric Sapphire) */}
      <div
        style={{
          position: 'absolute',
          top: '-120px',
          left: '50%',
          transform: 'translateX(-50%)',
          width: '700px',
          height: '400px',
          background: 'radial-gradient(circle, rgba(37, 99, 235, 0.15) 0%, rgba(9, 13, 22, 0) 70%)',
          pointerEvents: 'none',
          zIndex: 0,
        }}
      />

      {/* Pill Badge */}
      <div
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 14px',
          borderRadius: '9999px',
          background: 'rgba(37, 99, 235, 0.1)',
          border: '1px solid rgba(37, 99, 235, 0.3)',
          marginBottom: '24px',
          zIndex: 1,
        }}
      >
        <span
          style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            boxShadow: '0 0 10px #10b981',
            animation: 'pulse-subtle 2s infinite',
          }}
        />
        <span
          style={{
            fontSize: '11px',
            fontWeight: 700,
            fontFamily: 'var(--mono)',
            color: '#93c5fd',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}
        >
          45/45 Chi Nhánh Guta Đang Mở Ca Trực Tuyến
        </span>
      </div>

      {/* Hero Headline */}
      <h1
        style={{
          fontSize: 'clamp(32px, 5vw, 56px)',
          fontWeight: 800,
          lineHeight: 1.15,
          letterSpacing: '-0.03em',
          color: 'var(--text-primary, #f8fafc)',
          maxWidth: '900px',
          margin: '0 0 20px',
          zIndex: 1,
        }}
      >
        Quản Trị Nhân Sự &amp;{' '}
        <span
          style={{
            background: 'linear-gradient(135deg, #3b82f6 0%, #60a5fa 50%, #93c5fd 100%)',
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}
        >
          Phân Ca Tự Động
        </span>{' '}
        Chuỗi F&amp;B
      </h1>

      {/* Subtitle */}
      <p
        style={{
          fontSize: 'clamp(15px, 2vw, 18px)',
          color: 'var(--text-secondary, #94a3b8)',
          maxWidth: '680px',
          lineHeight: 1.6,
          margin: '0 0 36px',
          zIndex: 1,
        }}
      >
        Nền tảng CRM thế hệ mới dành cho Cửa Hàng Trưởng (SM) và Quản Lý Vùng (AOM).
        Đồng bộ máy chấm công vân tay, đối soát quỹ két ca và cảnh báo thiếu hụt nhân sự qua Telegram tức thì.
      </p>

      {/* Hero CTA Buttons */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '14px',
          marginBottom: '56px',
          zIndex: 1,
        }}
      >
        <button
          type="button"
          onClick={onOpenAuthModal}
          style={{
            minHeight: '46px',
            padding: '0 28px',
            borderRadius: '10px',
            background: 'linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%)',
            color: '#ffffff',
            border: 'none',
            fontSize: '14px',
            fontWeight: 700,
            cursor: 'pointer',
            boxShadow: '0 8px 24px rgba(37, 99, 235, 0.4)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 160ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = 'translateY(-2px)';
            e.currentTarget.style.boxShadow = '0 12px 30px rgba(37, 99, 235, 0.55)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = 'translateY(0)';
            e.currentTarget.style.boxShadow = '0 8px 24px rgba(37, 99, 235, 0.4)';
          }}
        >
          <span>Bắt Đầu Ngay (1-Click Login)</span>
          <span style={{ fontSize: '13px' }}>→</span>
        </button>

        <a
          href="#features"
          style={{
            minHeight: '46px',
            padding: '0 24px',
            borderRadius: '10px',
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            color: 'var(--text-primary, #f8fafc)',
            fontSize: '14px',
            fontWeight: 600,
            textDecoration: 'none',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            transition: 'all 160ms ease',
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.08)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.2)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
            e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.12)';
          }}
        >
          <span>Khám Phá Tính Năng</span>
          <span style={{ fontSize: '12px' }}>↓</span>
        </a>
      </div>

      {/* Interactive Mockup Container */}
      <div
        style={{
          width: '100%',
          maxWidth: '1080px',
          background: 'rgba(15, 23, 42, 0.75)',
          border: '1px solid rgba(255, 255, 255, 0.14)',
          borderRadius: '16px',
          padding: '16px',
          boxShadow: '0 30px 80px rgba(0, 0, 0, 0.6), 0 0 40px rgba(37, 99, 235, 0.15)',
          backdropFilter: 'blur(20px)',
          position: 'relative',
          zIndex: 1,
          textAlign: 'left',
        }}
      >
        {/* Mockup Header Controls */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingBottom: '14px',
            marginBottom: '14px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#3b82f6' }} />
            <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
            <span
              style={{
                marginLeft: '12px',
                fontSize: '11px',
                fontFamily: 'var(--mono)',
                color: 'var(--text-muted, #94a3b8)',
              }}
            >
              guta-workspace.internal/app • Live Roster Monitor
            </span>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '11px',
              fontFamily: 'var(--mono)',
              color: '#34d399',
            }}
          >
            <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#10b981' }} />
            <span>REALTIME SYNC: ACTIVE</span>
          </div>
        </div>

        {/* Mockup Quick Stats Row */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '12px',
            marginBottom: '16px',
          }}
        >
          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>TỔNG CHI NHÁNH</div>
            <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#f8fafc' }}>
              45 CH
            </div>
            <div style={{ fontSize: '10px', color: '#10b981', marginTop: '2px' }}>100% Đang mở ca sáng</div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>BARISTA TRONG CA</div>
            <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#3b82f6' }}>
              348 NS
            </div>
            <div style={{ fontSize: '10px', color: '#94a3b8', marginTop: '2px' }}>3 ca vận hành liên tục</div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>ĐÚNG GIỜ ĐẦU CA</div>
            <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#10b981' }}>
              98.6%
            </div>
            <div style={{ fontSize: '10px', color: '#10b981', marginTop: '2px' }}>Vân tay ZKTeco sync</div>
          </div>

          <div
            style={{
              background: 'rgba(255, 255, 255, 0.03)',
              border: '1px solid rgba(255, 255, 255, 0.06)',
              borderRadius: '10px',
              padding: '12px 14px',
            }}
          >
            <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '4px' }}>DOANH THU KÉT SÁNG</div>
            <div style={{ fontSize: '20px', fontWeight: 800, fontFamily: 'var(--mono)', color: '#f8fafc' }}>
              184.250.000 ₫
            </div>
            <div style={{ fontSize: '10px', color: '#3b82f6', marginTop: '2px' }}>+12.4% vs tuần trước</div>
          </div>
        </div>

        {/* Mockup Mini Table Preview */}
        <div
          style={{
            background: 'rgba(9, 13, 22, 0.8)',
            border: '1px solid rgba(255, 255, 255, 0.06)',
            borderRadius: '10px',
            overflow: 'hidden',
          }}
        >
          <div
            style={{
              padding: '10px 14px',
              background: 'rgba(255, 255, 255, 0.02)',
              borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
              fontSize: '11px',
              fontFamily: 'var(--mono)',
              color: '#94a3b8',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>DANH SÁCH CHI NHÁNH NỔI BẬT (REALTIME FEED)</span>
            <span style={{ color: '#3b82f6', cursor: 'pointer' }} onClick={onOpenAuthModal}>
              Xem chi tiết 45 CH →
            </span>
          </div>

          <div style={{ padding: '4px 0' }}>
            {[
              { id: 'GT-CH-01', name: 'GUTA CAFE - Quận 10 - 581 Sư Vạn Hạnh', staff: '56 NS', rev: '8.420.000 ₫', rate: '100%' },
              { id: 'GT-CH-03', name: 'GUTA CAFE - Bình Thạnh - 18 Nguyễn Cửu Vân', staff: '47 NS', rev: '7.150.000 ₫', rate: '98%' },
              { id: 'GT-CH-04', name: 'GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm', staff: '46 NS', rev: '9.820.000 ₫', rate: '100%' },
            ].map((row, i) => (
              <div
                key={row.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '9px 14px',
                  borderBottom: i < 2 ? '1px solid rgba(255, 255, 255, 0.04)' : 'none',
                  fontSize: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{ fontFamily: 'var(--mono)', fontSize: '11px', color: '#64748b' }}>{row.id}</span>
                  <span style={{ fontWeight: 600, color: '#f8fafc' }}>{row.name}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <span style={{ color: '#94a3b8', fontSize: '11px' }}>{row.staff}</span>
                  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600, color: '#f8fafc' }}>{row.rev}</span>
                  <span
                    style={{
                      padding: '2px 8px',
                      borderRadius: '9999px',
                      background: 'rgba(16, 185, 129, 0.12)',
                      color: '#34d399',
                      fontSize: '10px',
                      fontWeight: 700,
                    }}
                  >
                    {row.rate}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

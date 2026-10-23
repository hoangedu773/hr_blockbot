import React from 'react';

const PARTNERS = [
  { name: 'Guta Cafe', category: 'Coffee Chain' },
  { name: 'Highlands Coffee', category: 'Coffee Chain' },
  { name: 'Starbucks', category: 'Global F&B' },
  { name: 'KFC', category: 'Fast Food' },
  { name: 'Vinamilk', category: 'Dairy Supplier' },
  { name: 'La Marzocco', category: 'Espresso Equipment' },
  { name: 'Phúc Long', category: 'Tea & Coffee' },
  { name: 'The Coffee House', category: 'Coffee Chain' },
  { name: 'Trung Nguyên', category: 'Coffee Legend' },
  { name: 'Lotteria', category: 'Quick Service' },
  { name: 'Pizza Hut', category: 'Restaurant' },
  { name: 'Katinat', category: 'Saigon Cafe' },
];

export const LogoMarquee: React.FC = () => {
  // Duplicate list to achieve continuous infinite marquee effect
  const marqueeList = [...PARTNERS, ...PARTNERS];

  return (
    <section
      style={{
        padding: '36px 0 48px',
        borderTop: '1px solid rgba(255, 255, 255, 0.06)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        backgroundColor: 'rgba(15, 23, 42, 0.3)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          textAlign: 'center',
          marginBottom: '20px',
        }}
      >
        <span
          style={{
            fontSize: '11px',
            fontFamily: 'var(--mono)',
            fontWeight: 700,
            color: '#64748b',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
          }}
        >
          MẠNG LƯỚI ĐỐI TÁC CHUỖI F&amp;B ĐỒNG HÀNH VẬN HÀNH
        </span>
      </div>

      {/* Marquee Track with Mask */}
      <div
        style={{
          width: '100%',
          overflow: 'hidden',
          position: 'relative',
          WebkitMaskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
          maskImage: 'linear-gradient(to right, transparent, black 15%, black 85%, transparent)',
        }}
      >
        <div
          style={{
            display: 'flex',
            width: 'max-content',
            gap: '20px',
            animation: 'auto-scroll-ribbon 32s linear infinite',
          }}
        >
          {marqueeList.map((item, index) => (
            <div
              key={`${item.name}-${index}`}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                padding: '8px 18px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                whiteSpace: 'nowrap',
                transition: 'border-color 150ms ease, background 150ms ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
                e.currentTarget.style.backgroundColor = 'rgba(37, 99, 235, 0.08)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.backgroundColor = 'rgba(255, 255, 255, 0.03)';
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: '#3b82f6',
                }}
              />
              <span
                style={{
                  fontSize: '13px',
                  fontWeight: 700,
                  color: 'var(--text-primary, #f8fafc)',
                  letterSpacing: '-0.01em',
                }}
              >
                {item.name}
              </span>
              <span
                style={{
                  fontSize: '10px',
                  fontFamily: 'var(--mono)',
                  color: '#64748b',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  padding: '1px 6px',
                  borderRadius: '4px',
                }}
              >
                {item.category}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

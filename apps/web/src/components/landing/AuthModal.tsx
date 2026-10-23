import React, { useEffect } from 'react';

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRole: (role: 'SM' | 'AOM' | 'Admin') => void;
}

interface AccountPreset {
  role: 'SM' | 'AOM' | 'Admin';
  name: string;
  title: string;
  scope: string;
  avatar: string;
  badgeColor: string;
  description: string;
}

const PRESETS: AccountPreset[] = [
  {
    role: 'SM',
    name: 'Nguyễn Thị Phương Anh',
    title: 'Cửa Hàng Trưởng (Store Manager)',
    scope: 'GUTA CAFE - Tân Bình - 02 Đặng Văn Sâm',
    avatar: 'PA',
    badgeColor: '#3b82f6',
    description: 'Quyền phê duyệt ca trực, chấm công vân tay và kiểm soát quỹ két ca chi nhánh Tân Bình.',
  },
  {
    role: 'AOM',
    name: 'Nguyễn Cao Thanh Trầm',
    title: 'Quản Lý Khu Vực (Area Ops Manager)',
    scope: 'Cụm Vận Hành Quận 1, Quận 3 & Quận 10 (18 Chi nhánh)',
    avatar: 'TT',
    badgeColor: '#10b981',
    description: 'Giám sát vận hành 18 cửa hàng trung tâm, điều phối nhân sự chéo và xử lý sự cố thiếu ca.',
  },
  {
    role: 'Admin',
    name: 'Ban Điều Hành Guta',
    title: 'Quản Trị Hệ Thống (Super Admin)',
    scope: 'Toàn bộ 45 Chi nhánh TP.HCM',
    avatar: 'AD',
    badgeColor: '#60a5fa',
    description: 'Toàn quyền cấu hình định biên nhân sự, thuật toán xếp ca AI và báo cáo tài chính toàn chuỗi.',
  },
];

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose, onSelectRole }) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="overlay"
      onClick={onClose}
      style={{
        zIndex: 100,
        position: 'fixed',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(4, 6, 10, 0.75)',
        backdropFilter: 'blur(8px)',
        padding: '20px',
      }}
    >
      <div
        className="sheet"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%',
          maxWidth: '520px',
          background: 'rgba(15, 23, 42, 0.95)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: '16px',
          padding: '28px',
          boxShadow: '0 30px 60px rgba(0, 0, 0, 0.8), 0 0 30px rgba(37, 99, 235, 0.15)',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
            paddingBottom: '14px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '18px', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              Đăng Nhập Nhanh 1-Click
            </h3>
            <p style={{ fontSize: '12px', color: '#94a3b8', margin: '4px 0 0' }}>
              Chọn vai trò thực tế để trải nghiệm trực tiếp Guta CRM Dashboard
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng hộp thoại đăng nhập"
            style={{
              background: 'transparent',
              border: 'none',
              color: '#94a3b8',
              fontSize: '20px',
              cursor: 'pointer',
              padding: '4px 8px',
              borderRadius: '6px',
            }}
          >
            ✕
          </button>
        </div>

        {/* 3 Role Preset Cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {PRESETS.map((preset) => (
            <div
              key={preset.role}
              onClick={() => onSelectRole(preset.role)}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '14px',
                padding: '16px',
                borderRadius: '12px',
                background: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.08)',
                cursor: 'pointer',
                transition: 'all 160ms cubic-bezier(0.16, 1, 0.3, 1)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(37, 99, 235, 0.1)';
                e.currentTarget.style.borderColor = 'rgba(37, 99, 235, 0.4)';
                e.currentTarget.style.transform = 'translateY(-2px)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
                e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
                e.currentTarget.style.transform = 'translateY(0)';
              }}
            >
              {/* Avatar Initial */}
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(37, 99, 235, 0.2)',
                  border: `1px solid ${preset.badgeColor}`,
                  color: '#ffffff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 800,
                  fontSize: '14px',
                  fontFamily: 'var(--mono)',
                  flexShrink: 0,
                }}
              >
                {preset.avatar}
              </div>

              {/* Info */}
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2px' }}>
                  <span style={{ fontSize: '14px', fontWeight: 700, color: '#f8fafc' }}>
                    {preset.name}
                  </span>
                  <span
                    style={{
                      fontSize: '10px',
                      fontFamily: 'var(--mono)',
                      fontWeight: 700,
                      padding: '1px 6px',
                      borderRadius: '4px',
                      background: 'rgba(37, 99, 235, 0.15)',
                      color: preset.badgeColor,
                    }}
                  >
                    {preset.role}
                  </span>
                </div>

                <div style={{ fontSize: '12px', color: '#cbd5e1', fontWeight: 500, marginBottom: '4px' }}>
                  {preset.title}
                </div>

                <div style={{ fontSize: '11px', color: '#3b82f6', fontFamily: 'var(--mono)', marginBottom: '4px' }}>
                  📍 {preset.scope}
                </div>

                <div style={{ fontSize: '11px', color: '#94a3b8', lineHeight: 1.4 }}>
                  {preset.description}
                </div>
              </div>

              {/* Action arrow */}
              <div style={{ color: '#3b82f6', fontSize: '16px', alignSelf: 'center' }}>
                →
              </div>
            </div>
          ))}
        </div>

        {/* Footer info */}
        <div
          style={{
            marginTop: '20px',
            paddingTop: '14px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            textAlign: 'center',
            fontSize: '11px',
            color: '#64748b',
          }}
        >
          Phiên làm việc sẽ được lưu tự động vào trình duyệt (localStorage).
        </div>
      </div>
    </div>
  );
};

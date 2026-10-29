import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface LoginModalProps {
  isOpen: boolean;
  onClose?: () => void;
}

export const LoginModal: React.FC<LoginModalProps> = ({ isOpen, onClose }) => {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      await login({ username, password });
      if (onClose) onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập không thành công';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(7, 9, 14, 0.88)',
        backdropFilter: 'blur(12px)',
        zIndex: 200,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <div
        style={{
          background: '#0d111a',
          border: '1px solid rgba(255, 209, 0, 0.4)',
          borderRadius: '14px',
          width: '100%',
          maxWidth: '440px',
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), 0 0 30px rgba(255, 209, 0, 0.08)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px 24px',
            borderBottom: '1px solid var(--border)',
            background: 'rgba(14, 20, 32, 0.95)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
          }}
        >
          <img
            src="/assets/guta-logo.png"
            alt="GUTA CAFE"
            style={{ height: '24px', width: 'auto' }}
          />
          <div>
            <h2 style={{ fontSize: '15px', fontWeight: 700, color: '#fff' }}>
              HR BlockBot — Xác Thực
            </h2>
            <p style={{ fontSize: '11px', color: 'var(--text-muted)', fontFamily: 'var(--mono)' }}>
              In-Memory Auth & RBAC Security Gate
            </p>
          </div>
        </div>

        {/* Notice */}
        <div
          style={{
            margin: '16px 20px 0',
            padding: '10px 12px',
            borderRadius: '6px',
            background: 'rgba(0, 71, 186, 0.12)',
            border: '1px solid rgba(0, 71, 186, 0.3)',
            fontSize: '11px',
            color: '#93c5fd',
            lineHeight: 1.5,
          }}
        >
          🛡️ <strong>Chính sách bảo mật:</strong> Access Token lưu duy nhất trong bộ nhớ tạm (in-memory variable); tuyệt đối không dùng localStorage/sessionStorage. Refresh token truyền qua HttpOnly cookie.
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {error && (
            <div
              style={{
                padding: '10px 12px',
                borderRadius: '6px',
                background: 'rgba(244, 63, 94, 0.15)',
                border: '1px solid rgba(244, 63, 94, 0.35)',
                color: '#fca5a5',
                fontSize: '12px',
                lineHeight: 1.4,
              }}
            >
              ⚠️ {error}
            </div>
          )}

          <div>
            <label
              htmlFor="login-username"
              style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}
            >
              Tên đăng nhập:
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="mã nhân viên"
              style={{
                width: '100%',
                background: '#161d2b',
                color: '#fff',
                border: '1px solid var(--border)',
                padding: '9px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          <div>
            <label
              htmlFor="login-password"
              style={{ display: 'block', fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', fontWeight: 600 }}
            >
              Mật Khẩu:
            </label>
            <input
              id="login-password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                width: '100%',
                background: '#161d2b',
                color: '#fff',
                border: '1px solid var(--border)',
                padding: '9px 12px',
                borderRadius: '6px',
                fontSize: '13px',
                outline: 'none',
              }}
            />
          </div>

          {/* Tài khoản do quản lý phát: không còn nút chọn sẵn tài khoản demo. */}

          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <button
              type="submit"
              disabled={isSubmitting}
              className="btn btn-gold"
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                background: 'var(--accent-primary)',
                color: '#ffffff',
                border: 'none',
                fontWeight: 700,
                fontSize: '13px',
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                boxShadow: '0 2px 10px rgba(37, 99, 235, 0.25)',
              }}
            >
              {isSubmitting ? 'Đang xác thực...' : 'Đăng Nhập Qua API Chuẩn'}
            </button>

          </div>
        </form>
      </div>
    </div>
  );
};

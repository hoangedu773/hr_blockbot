import React, { useState } from 'react';

interface ChangePasswordModalProps {
  username?: string;
  onSubmit: (currentPassword: string, newPassword: string) => Promise<void>;
  onLogout: () => Promise<void>;
}

/**
 * Bắt buộc đổi mật khẩu ở lần đăng nhập đầu tiên: mật khẩu quản lý phát là mật khẩu
 * tạm, chỉ dùng một lần. Modal không có nút đóng — người dùng đổi mật khẩu hoặc đăng xuất.
 */
export const ChangePasswordModal: React.FC<ChangePasswordModalProps> = ({ username, onSubmit, onLogout }) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setError('');

    if (newPassword.length < 8) {
      setError('Mật khẩu mới phải có ít nhất 8 ký tự.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Xác nhận mật khẩu không khớp.');
      return;
    }
    if (newPassword === currentPassword) {
      setError('Mật khẩu mới phải khác mật khẩu tạm.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(currentPassword, newPassword);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa đổi được mật khẩu. Vui lòng thử lại.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-password-title"
      style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.78)', backdropFilter: 'blur(10px)' }}
    >
      <div style={{ width: '100%', maxWidth: 420, maxHeight: '90dvh', overflowY: 'auto', border: '1px solid #333', borderRadius: 20, background: '#171717', color: '#f5f5f5', padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,.4)', colorScheme: 'dark', fontFamily: "'Geist', system-ui, sans-serif" }}>
        <span style={{ fontSize: 12, letterSpacing: '.12em', fontWeight: 600, color: '#b4b4b4' }}>GUTA WORKSPACE</span>
        <h2 id="change-password-title" style={{ margin: '20px 0 8px', fontSize: 24, fontWeight: 600 }}>Đổi mật khẩu lần đầu</h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.6, color: '#b4b4b4' }}>
          {username ? <>Tài khoản <strong style={{ color: '#f5f5f5' }}>{username}</strong> đang dùng mật khẩu tạm.</> : 'Tài khoản đang dùng mật khẩu tạm.'}{' '}
          Vui lòng đặt mật khẩu riêng trước khi tiếp tục.
        </p>

        <form onSubmit={handleSubmit} aria-busy={isSubmitting} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {error && <div role="alert" style={{ padding: 12, borderRadius: 10, color: '#fecaca', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 14 }}>{error}</div>}

          <div>
            <label htmlFor="cp-current" style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>Mật khẩu tạm hiện tại</label>
            <input id="cp-current" name="current-password" type="password" required autoComplete="current-password" disabled={isSubmitting} value={currentPassword} onChange={(e) => { setCurrentPassword(e.target.value); setError(''); }} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #404040', borderRadius: 10, padding: '12px 14px', color: '#f5f5f5', background: '#111', fontSize: 16 }} />
          </div>

          <div>
            <label htmlFor="cp-new" style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>Mật khẩu mới (≥ 8 ký tự)</label>
            <input id="cp-new" name="new-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={isSubmitting} value={newPassword} onChange={(e) => { setNewPassword(e.target.value); setError(''); }} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #404040', borderRadius: 10, padding: '12px 14px', color: '#f5f5f5', background: '#111', fontSize: 16 }} />
          </div>

          <div>
            <label htmlFor="cp-confirm" style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>Nhập lại mật khẩu mới</label>
            <input id="cp-confirm" name="confirm-password" type="password" required minLength={8} maxLength={128} autoComplete="new-password" disabled={isSubmitting} value={confirmPassword} onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #404040', borderRadius: 10, padding: '12px 14px', color: '#f5f5f5', background: '#111', fontSize: 16 }} />
          </div>

          <button type="submit" disabled={isSubmitting} style={{ width: '100%', padding: '13px 16px', border: 0, borderRadius: 10, color: '#171717', background: '#f5f5f5', fontWeight: 600, fontSize: 15, opacity: isSubmitting ? .65 : 1, cursor: isSubmitting ? 'wait' : 'pointer' }}>
            {isSubmitting ? 'Đang lưu…' : 'Đổi mật khẩu'}
          </button>
          <button type="button" disabled={isSubmitting} onClick={() => void onLogout()} style={{ width: '100%', padding: '11px 16px', border: '1px solid #404040', borderRadius: 10, color: '#d4d4d4', background: 'transparent', fontSize: 14, cursor: 'pointer' }}>
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  );
};

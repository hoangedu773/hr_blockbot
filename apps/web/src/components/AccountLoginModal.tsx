import React, { useEffect, useRef, useState } from 'react';
import type { LoginRequest } from '@hr-blockbot/contracts';

interface AccountLoginModalProps {
  isOpen: boolean;
  isRestoringSession?: boolean;
  onClose: () => void;
  onLogin: (credentials: LoginRequest) => Promise<void>;
}

export const AccountLoginModal: React.FC<AccountLoginModalProps> = ({
  isOpen, isRestoringSession = false, onClose, onLogin,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');
  const submittingRef = useRef(false);
  const busy = isSubmitting || isRestoringSession;

  useEffect(() => {
    if (!isOpen) return;
    setPassword('');
    setShowPassword(false);
    setError('');
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialogRef.current?.querySelector<HTMLInputElement>('input[type="email"]')?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !submittingRef.current) onClose();
      if (event.key !== 'Tab') return;
      const elements = dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not(:disabled), input:not(:disabled)'
      );
      if (!elements?.length) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
      previousFocus?.focus();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || submittingRef.current) return;
    submittingRef.current = true;
    setIsSubmitting(true);
    setError('');
    try {
      await onLogin({ email: email.trim(), password });
      setPassword('');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Chưa thể đăng nhập. Vui lòng thử lại.');
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <div
      id="auth-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !submittingRef.current) onClose();
      }}
      style={{ position: 'fixed', inset: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, background: 'rgba(0,0,0,.72)', backdropFilter: 'blur(10px)' }}
    >
      <div ref={dialogRef} style={{ width: '100%', maxWidth: 420, maxHeight: '90dvh', overflowY: 'auto', border: '1px solid #333', borderRadius: 20, background: '#171717', color: '#f5f5f5', padding: 24, boxShadow: '0 24px 64px rgba(0,0,0,.4)', colorScheme: 'dark', fontFamily: "'Geist', system-ui, sans-serif" }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <span style={{ fontSize: 12, letterSpacing: '.12em', fontWeight: 600, color: '#b4b4b4' }}>GUTA WORKSPACE</span>
          <button type="button" aria-label="Đóng đăng nhập" disabled={isSubmitting} onClick={onClose} style={{ background: 'transparent', color: '#b4b4b4', border: 0, padding: 8, minHeight: 44, cursor: 'pointer', fontSize: 13 }}>Đóng</button>
        </div>
        <h2 id="auth-modal-title" style={{ margin: '20px 0 8px', fontSize: 24, fontWeight: 600, color: '#f5f5f5' }}>Đăng nhập Guta Workspace</h2>
        <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.6, color: '#b4b4b4' }}>Sử dụng tài khoản được cấp để truy cập không gian làm việc.</p>
        <form onSubmit={handleSubmit} aria-busy={busy} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {error && <div id="login-error" role="alert" style={{ padding: 12, borderRadius: 10, color: '#fecaca', background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', fontSize: 14 }}>{error}</div>}
          <div>
            <label htmlFor="login-email" style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>Email</label>
            <input id="login-email" name="email" type="email" required autoComplete="username" maxLength={254} disabled={busy} value={email} onChange={(event) => { setEmail(event.target.value); setError(''); }} aria-describedby={error ? 'login-error' : undefined} style={{ width: '100%', boxSizing: 'border-box', border: '1px solid #404040', borderRadius: 10, padding: '12px 14px', color: '#f5f5f5', background: '#111', fontSize: 16 }} />
          </div>
          <div>
            <label htmlFor="login-password" style={{ display: 'block', fontSize: 14, marginBottom: 8 }}>Mật khẩu</label>
            <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #404040', borderRadius: 10, background: '#111' }}>
              <input id="login-password" name="password" type={showPassword ? 'text' : 'password'} required autoComplete="current-password" disabled={busy} value={password} onChange={(event) => { setPassword(event.target.value); setError(''); }} aria-describedby={error ? 'login-error' : undefined} style={{ minWidth: 0, flex: 1, border: 0, borderRadius: 10, padding: '12px 14px', color: '#f5f5f5', background: 'transparent', fontSize: 16 }} />
              <button type="button" disabled={busy} aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} style={{ color: '#d4d4d4', padding: 12, minHeight: 44, background: 'transparent', border: 0, cursor: 'pointer', fontSize: 13 }}>{showPassword ? 'Ẩn' : 'Hiện'}</button>
            </div>
          </div>
          <button type="submit" disabled={busy} style={{ width: '100%', padding: '13px 16px', border: 0, borderRadius: 10, color: '#171717', background: '#f5f5f5', fontWeight: 600, fontSize: 15, opacity: busy ? .65 : 1, cursor: busy ? 'wait' : 'pointer' }}>
            {isRestoringSession ? 'Đang kiểm tra phiên…' : isSubmitting ? 'Đang đăng nhập…' : 'Đăng nhập'}
          </button>
          <p style={{ margin: 0, color: '#b4b4b4', fontSize: 12, lineHeight: 1.6 }}>Nếu chưa có tài khoản hoặc quên mật khẩu, vui lòng liên hệ quản trị viên.</p>
        </form>
      </div>
    </div>
  );
};

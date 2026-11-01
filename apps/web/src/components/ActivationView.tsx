import { useState, type FormEvent } from 'react';
import { API_BASE } from '../services/auth';
export function ActivationView({ token, onDone, purpose = 'onboarding' }: { token: string; onDone: () => void; purpose?: 'onboarding' | 'reactivation' | 'recovery' }) {
  const [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false), [done, setDone] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); if (busy) return;
    if (password.length < 12 || password !== confirmation) { setError('Mật khẩu cần ít nhất 12 ký tự và hai lần nhập phải khớp.'); return; }
    setBusy(true); setError('');
    try { const response = await fetch(`${API_BASE}/auth/${purpose === 'recovery' ? 'recover-password' : purpose === 'reactivation' ? 'reactivate' : 'activate'}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'omit', referrerPolicy: 'no-referrer', body: JSON.stringify({ token, newPassword: password }) });
      if (!response.ok) throw new Error(purpose === 'recovery'
        ? response.status === 400 ? 'Liên kết hết hạn, đã dùng hoặc không còn hợp lệ. Liên hệ quản trị kỹ thuật để kiểm tra.' : 'Chưa xác nhận được kết quả. Thử đăng nhập bằng mật khẩu vừa đặt; nếu chưa được, liên hệ quản trị kỹ thuật để đối chiếu hoặc phát hành lại. Không tạo tài khoản mới.'
        : response.status === 400 ? 'Lời mời đã hết hạn, đã dùng hoặc không hợp lệ. Liên hệ HR để kiểm tra.' : 'Chưa thể hoàn tất kích hoạt. Liên hệ HR kiểm tra trạng thái, không tạo tài khoản mới.');
      setPassword(''); setConfirmation(''); setDone(true);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Không kết nối được máy chủ.'); } finally { setBusy(false); }
  };
  return <main className="crm-workspace" style={{ maxWidth: 560, margin: '48px auto', padding: 24 }}><h1>{purpose === 'recovery' ? 'Khôi phục mật khẩu' : 'Kích hoạt tài khoản nhân viên'}</h1>{done ? <><p role="status">Đã thiết lập mật khẩu. Bạn có thể đăng nhập bằng mã nhân viên.</p><button className="btn btn--primary" onClick={onDone}>Về đăng nhập</button></> : <form className="crm-work-form" onSubmit={(event) => void submit(event)}><p>Lời mời chỉ dùng một lần. Không chia sẻ đường dẫn hoặc mật khẩu của bạn.</p>
    <label className="field">Mật khẩu mới<input className="input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={password} onChange={(event) => setPassword(event.target.value)} /></label>
    <label className="field">Nhập lại mật khẩu<input className="input" type="password" autoComplete="new-password" required disabled={busy} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} /></label>
    {error && <p role="alert">{error}</p>}<button className="btn btn--primary" disabled={busy}>Thiết lập mật khẩu</button><button className="btn" type="button" disabled={busy} onClick={onDone}>Về đăng nhập</button></form>}</main>;
}

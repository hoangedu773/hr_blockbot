import { useState, type FormEvent } from 'react';
import { confirmPasswordOtp, sendPasswordOtp } from '../services/auth';
import { CrmDialog } from './ui/CrmDialog';

export function PasswordOtpDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [current, setCurrent] = useState('');
  const [challenge, setChallenge] = useState<Awaited<ReturnType<typeof sendPasswordOtp>> | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError('');
    if (challenge && password !== confirmation) {
      setError('Hai lần nhập mật khẩu mới chưa khớp.');
      return;
    }
    setBusy(true);
    try {
      if (challenge) {
        await confirmPasswordOtp(current, password, challenge.challengeId, code);
        onSuccess();
      } else {
        setChallenge(await sendPasswordOtp(current));
      }
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'Chưa thực hiện được. Vui lòng thử lại.');
    } finally {
      setBusy(false);
    }
  }

  function requestAgain() {
    setChallenge(null);
    setCode('');
    setPassword('');
    setConfirmation('');
    setError('');
  }

  return <CrmDialog title="Đổi mật khẩu" busy={busy} onClose={onClose}>
    <form className="crm-work-form" aria-busy={busy} onSubmit={submit}>
      {challenge ? <>
        <p role="status">Đã gửi mã 6 số đến {challenge.destination}. Mã có hiệu lực {challenge.expiresInSeconds / 60} phút.</p>
        <label className="field">Mã xác nhận<input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required disabled={busy} value={code} onChange={event => setCode(event.target.value)} /></label>
        <label className="field">Mật khẩu mới (tối thiểu 12 ký tự)<input className="input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={password} onChange={event => setPassword(event.target.value)} /></label>
        <label className="field">Nhập lại mật khẩu mới<input className="input" type="password" autoComplete="new-password" minLength={12} maxLength={128} required disabled={busy} value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label>
      </> : <label className="field">Mật khẩu hiện tại<input className="input" type="password" autoComplete="current-password" maxLength={128} required disabled={busy} value={current} onChange={event => setCurrent(event.target.value)} /></label>}
      {error && <p role="alert">{error}</p>}
      <button className="btn btn--primary" disabled={busy}>{busy ? 'Đang xử lý…' : challenge ? 'Xác nhận và đổi mật khẩu' : 'Gửi mã qua email'}</button>
      {challenge && <button className="btn" type="button" disabled={busy} onClick={requestAgain}>Yêu cầu mã mới</button>}
    </form>
  </CrmDialog>;
}

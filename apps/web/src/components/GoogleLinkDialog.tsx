import { useState } from 'react';
import { linkGoogleAccount } from '../services/auth';
import { GoogleAccountButton } from './GoogleAccountButton';
import { CrmDialog } from './ui/CrmDialog';

export function GoogleLinkDialog({ onClose, onLinked }: { onClose: () => void; onLinked: () => void }) {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  return <CrmDialog title="Liên kết tài khoản Google" busy={busy} onClose={onClose}>
    <div className="crm-work-form">
      <p>Xác nhận mật khẩu HRM hiện tại rồi chọn tài khoản Google của bạn. Email nhận OTP và quyền HRM giữ nguyên.</p>
      <label className="field">Mật khẩu HRM hiện tại<input className="input" type="password" autoComplete="current-password"
        maxLength={128} value={password} disabled={busy} onChange={event => setPassword(event.target.value)} /></label>
      <GoogleAccountButton link disabled={!password || busy} onCredential={async input => {
        setBusy(true);
        try {
          await linkGoogleAccount(input, password);
          onLinked();
        } finally {
          setBusy(false);
        }
      }} />
    </div>
  </CrmDialog>;
}

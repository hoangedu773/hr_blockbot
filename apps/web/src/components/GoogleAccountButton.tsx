import { useEffect, useRef, useState } from 'react';
import { getGoogleChallenge } from '../services/auth';

type Credential = { credential: string; nonce: string };
type GoogleIdentity = {
  initialize(options: { client_id: string; nonce: string; callback: (value: { credential: string }) => void }): void;
  renderButton(element: HTMLElement, options: { theme: string; size: string; text: string; locale: string }): void;
};

function identity() {
  return (window as Window & { google?: { accounts?: { id?: GoogleIdentity } } }).google?.accounts?.id;
}

let scriptReady: Promise<GoogleIdentity> | undefined;
function loadGoogleIdentity() {
  const current = identity();
  if (current) return Promise.resolve(current);
  if (!scriptReady) {
    scriptReady = new Promise<GoogleIdentity>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      const failed = () => { script.remove(); reject(new Error('Không tải được nút Google.')); };
      const timeout = window.setTimeout(failed, 10000);
      script.onload = () => {
        window.clearTimeout(timeout);
        const ready = identity();
        if (ready) resolve(ready);
        else failed();
      };
      script.onerror = () => { window.clearTimeout(timeout); failed(); };
      document.head.append(script);
    }).catch(error => { scriptReady = undefined; throw error; });
  }
  return scriptReady;
}

export function GoogleAccountButton({ link = false, disabled = false, onCredential }: {
  link?: boolean; disabled?: boolean; onCredential: (credential: Credential) => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const latest = useRef({ disabled, onCredential });
  latest.current = { disabled, onCredential };
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const element = container.current;
    let active = true;
    let used = false;
    let enabled = false;
    async function setup() {
      const config = await getGoogleChallenge(link);
      if (!active || !element) return;
      if (!config.enabled) {
        if (link) setError('Đăng nhập Google chưa được bật.');
        return;
      }
      enabled = true;
      const google = await loadGoogleIdentity();
      if (!active) return;
      google.initialize({ client_id: config.clientId, nonce: config.nonce, callback: async ({ credential }) => {
        if (!active || used || latest.current.disabled) return;
        used = true;
        setBusy(true);
        try { await latest.current.onCredential({ credential, nonce: config.nonce }); }
        catch (failure) { if (active) setError(failure instanceof Error ? failure.message : 'Xác thực Google thất bại.'); }
        finally { if (active) setBusy(false); }
      } });
      google.renderButton(element, { theme: 'outline', size: 'large', text: link ? 'continue_with' : 'signin_with', locale: 'vi' });
    }
    setup().catch(failure => { if (active && (link || enabled)) setError(failure instanceof Error ? failure.message : 'Chưa tải được Google.'); });
    return () => { active = false; element?.replaceChildren(); };
  }, [attempt, link]);

  return <>
    <div ref={container} hidden={busy || disabled || !!error} />
    {busy && <p role="status">Đang xác thực với Google…</p>}
    {error && <><p role="alert">{error}</p><button type="button" className="btn" onClick={() => { setError(''); setAttempt(value => value + 1); }}>Thử lại với Google</button></>}
  </>;
}

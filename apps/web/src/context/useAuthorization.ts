import { useEffect, useState } from 'react';
import type { AuthorizationCapability, AuthorizationSummary } from '@hr-blockbot/contracts';
import { useAuth } from './AuthContext';
import { fetchMe } from '../services/api';

// UI hints only. Every REST/socket/tool operation rechecks the current database principal.
export function useAuthorization() {
  const { user, accessToken } = useAuth();
  const [summary, setSummary] = useState<AuthorizationSummary | null>(user?.authorization ?? null);
  useEffect(() => {
    let current = true, sequence = 0;
    setSummary(user?.authorization ?? null);
    const refresh = () => {
      const request = ++sequence;
      void fetchMe().then((me) => { if (current && request === sequence) setSummary(me.authorization ?? null); }).catch(() => { if (current && request === sequence) setSummary(null); });
    };
    if (accessToken) refresh();
    window.addEventListener('focus', refresh);
    return () => { current = false; window.removeEventListener('focus', refresh); };
  }, [user?.id, accessToken]);
  const can = (capability: AuthorizationCapability) => !!summary?.capabilities.includes(capability);
  return { summary, can, stores: summary?.stores ?? [] };
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AuthUser, LoginRequest } from '@hr-blockbot/contracts';
import {
  getAccessToken,
  getAuthUser,
  login as authLogin,
  logout as authLogout,
  changePassword as authChangePassword,
  refreshAccessToken,
  onAuthStateChange,
  onAuthFailure,
} from '../services/auth';

interface AuthContextType {
  user: AuthUser | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * Marker proving this browser had a session. The access token and user live in
 * memory only, so after a reload they are gone while the HttpOnly refresh cookie
 * survives. Without this marker the provider cannot tell "returning session" from
 * "anonymous visitor" and would refresh on every cold load.
 */
const SESSION_HINT_KEY = 'guta_session_hint';

const readSessionHint = (): boolean => {
  if (getAuthUser() !== null || getAccessToken() !== null) return true;
  try {
    return window.localStorage.getItem(SESSION_HINT_KEY) === '1';
  } catch {
    return false;
  }
};

const writeSessionHint = (active: boolean): void => {
  try {
    if (active) window.localStorage.setItem(SESSION_HINT_KEY, '1');
    else window.localStorage.removeItem(SESSION_HINT_KEY);
  } catch {
    // Storage can be blocked (private mode / quota); the in-memory state still works.
  }
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(getAuthUser());
  const [accessToken, setToken] = useState<string | null>(getAccessToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Lắng nghe thay đổi auth từ interceptor/service
    const unsubscribeChange = onAuthStateChange((newUser, newToken) => {
      setUser(newUser);
      setToken(newToken);
      writeSessionHint(newUser !== null && newToken !== null);
    });

    const unsubscribeFailure = onAuthFailure(() => {
      setUser(null);
      setToken(null);
    });

    let isMounted = true;
    if (!readSessionHint()) {
      // No session at all: skip the refresh call so an offline demo never fires
      // a doomed request (and never logs ERR_CONNECTION_REFUSED).
      setIsLoading(false);
    } else {
      // Thử silent refresh 1 lần duy nhất khi ứng dụng tải
      void (async () => {
        try {
          const token = await refreshAccessToken();
          if (token && isMounted) {
            // Token refreshed, user will be set if available
          }
        } catch {
          // Có phiên nhưng API offline: giữ UI ở trạng thái chưa đăng nhập
        } finally {
          if (isMounted) {
            setIsLoading(false);
          }
        }
      })();
    }

    return () => {
      isMounted = false;
      unsubscribeChange();
      unsubscribeFailure();
    };
  }, []);

  const handleLogin = async (credentials: LoginRequest) => {
    const res = await authLogin(credentials);
    setUser(res.user);
    setToken(res.accessToken);
    writeSessionHint(true);
  };

  const handleLogout = async () => {
    await authLogout();
    writeSessionHint(false);
  };

  const handleChangePassword = async (currentPassword: string, newPassword: string) => {
    await authChangePassword(currentPassword, newPassword);
    const current = getAuthUser();
    if (current) setUser(current);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        accessToken,
        isAuthenticated: !!user && !!accessToken,
        isLoading,
        login: handleLogin,
        logout: handleLogout,
        changePassword: handleChangePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

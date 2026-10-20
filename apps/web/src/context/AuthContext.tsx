import React, { createContext, useContext, useState, useEffect } from 'react';
import type { AuthUser, LoginRequest } from '@hr-blockbot/contracts';
import {
  getAccessToken,
  getAuthUser,
  login as authLogin,
  logout as authLogout,
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(getAuthUser());
  const [accessToken, setToken] = useState<string | null>(getAccessToken());
  const [isLoading, setIsLoading] = useState<boolean>(true);

  useEffect(() => {
    // Lắng nghe thay đổi auth từ interceptor/service
    const unsubscribeChange = onAuthStateChange((newUser, newToken) => {
      setUser(newUser);
      setToken(newToken);
    });

    const unsubscribeFailure = onAuthFailure(() => {
      setUser(null);
      setToken(null);
    });

    // Thử silent refresh 1 lần duy nhất khi ứng dụng tải
    let isMounted = true;
    (async () => {
      try {
        const token = await refreshAccessToken();
        if (token && isMounted) {
          // Token refreshed, user will be set if available
        }
      } catch {
        // Không có phiên đăng nhập hợp lệ hoặc API offline
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    })();

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
  };

  const handleLogout = async () => {
    await authLogout();
    setUser(null);
    setToken(null);
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

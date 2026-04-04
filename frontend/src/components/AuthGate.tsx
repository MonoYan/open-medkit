import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

import { getAuthStatus, logout as logoutRequest, setOnUnauthenticated } from '../lib/api';
import { LoginPage } from './LoginPage';

type AuthState = 'loading' | 'public' | 'authenticated' | 'unauthenticated';

interface AuthContextValue {
  requiresAuth: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthGate');
  return ctx;
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>('loading');
  const [requiresAuth, setRequiresAuth] = useState(false);

  const checkAuth = useCallback(async () => {
    try {
      const status = await getAuthStatus();
      setRequiresAuth(status.requiresAuth);

      if (!status.requiresAuth) {
        setState('public');
      } else if (status.authenticated) {
        setState('authenticated');
      } else {
        setState('unauthenticated');
      }
    } catch {
      setState('unauthenticated');
      setRequiresAuth(true);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  useEffect(() => {
    setOnUnauthenticated(() => {
      setState('unauthenticated');
      setRequiresAuth(true);
    });
    return () => setOnUnauthenticated(null);
  }, []);

  const logout = useCallback(async () => {
    await logoutRequest();
    setState('unauthenticated');
  }, []);

  const handleLoginSuccess = useCallback(() => {
    void checkAuth();
  }, [checkAuth]);

  if (state === 'loading') {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <div className="animate-pulse font-mono text-[12px] text-ink3">loading…</div>
      </div>
    );
  }

  if (state === 'unauthenticated') {
    return <LoginPage onSuccess={handleLoginSuccess} />;
  }

  return (
    <AuthContext.Provider value={{ requiresAuth, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

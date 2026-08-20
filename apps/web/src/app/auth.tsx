import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, asApiError, setAccessToken } from '@/api/client';

export interface SessionUser {
  id: string;
  email: string;
  role: 'admin' | 'volunteer';
  profileComplete: boolean;
  volunteer: {
    id: string;
    firstName: string;
    lastName: string;
    phase: string;
  } | null;
}

interface AuthState {
  /** 'loading' while the silent refresh runs on first mount. */
  status: 'loading' | 'authenticated' | 'anonymous';
  user: SessionUser | null;
  login: (email: string, password: string) => Promise<SessionUser>;
  /** Account + profile in one call — an abandoned form creates nothing. */
  register: (payload: Record<string, unknown>) => Promise<SessionUser>;
  logout: () => Promise<void>;
  /** Re-fetch /auth/me — call after mutations that change profile state. */
  refresh: () => Promise<SessionUser>;
}

const AuthContext = createContext<AuthState | null>(null);

interface LoginResponse {
  accessToken: string;
  user: { id: string; email: string; role: 'admin' | 'volunteer' };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState['status']>('loading');
  const [user, setUser] = useState<SessionUser | null>(null);
  const queryClient = useQueryClient();

  const loadMe = useCallback(async (): Promise<SessionUser> => {
    const { data } = await api.get<SessionUser>('/auth/me');
    setUser(data);
    setStatus('authenticated');
    return data;
  }, []);

  // Silent session resume: the refresh cookie may still be valid even though
  // the in-memory access token died with the last tab.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data } = await api.post<LoginResponse>('/auth/refresh');
        if (cancelled) return;
        setAccessToken(data.accessToken);
        await loadMe();
      } catch {
        if (!cancelled) setStatus('anonymous');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadMe]);

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await api.post<LoginResponse>('/auth/login', { email, password });
      setAccessToken(data.accessToken);
      return loadMe();
    },
    [loadMe],
  );

  const register = useCallback(
    async (payload: Record<string, unknown>) => {
      const { data } = await api.post<LoginResponse>('/auth/register', payload);
      setAccessToken(data.accessToken);
      return loadMe();
    },
    [loadMe],
  );

  const logout = useCallback(async () => {
    // Server-side revocation of the whole session family; local teardown must
    // proceed even if the network call fails.
    await api.post('/auth/logout').catch(() => undefined);
    setAccessToken(null);
    setUser(null);
    setStatus('anonymous');
    queryClient.clear();
  }, [queryClient]);

  const value = useMemo(
    () => ({ status, user, login, register, logout, refresh: loadMe }),
    [status, user, login, register, logout, loadMe],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/** Human-readable message from an auth API failure. */
export function authErrorMessage(err: unknown): string {
  const apiErr = asApiError(err);
  if (!apiErr) return 'Could not reach the server. Please try again.';
  switch (apiErr.code) {
    case 'EMAIL_TAKEN':
      return 'An account with this email already exists. Try logging in.';
    case 'ACCOUNT_LOCKED':
      return apiErr.message;
    case 'UNAUTHORIZED':
      return 'Invalid email or password.';
    default:
      return apiErr.message || 'Something went wrong.';
  }
}

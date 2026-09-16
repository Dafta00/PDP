'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, ApiError, setAccessToken } from './api-client';

export type Role =
  | 'SUPER_ADMIN'
  | 'STATE_ADMIN'
  | 'SENATORIAL_ADMIN'
  | 'LGA_ADMIN'
  | 'WARD_ADMIN'
  | 'POLLING_UNIT_OFFICER'
  | 'DATA_ENTRY_OFFICER';

export interface ScopeUnit {
  id: string;
  name: string;
}

export interface ScopePath {
  senatorialDistrict?: ScopeUnit;
  lga?: ScopeUnit;
  ward?: ScopeUnit;
  pollingUnit?: ScopeUnit;
}

export interface AuthUser {
  id: string;
  email: string;
  fullName?: string;
  role: Role;
  senatorialDistrictId: string | null;
  lgaId: string | null;
  wardId: string | null;
  pollingUnitId: string | null;
  /** POLLING_UNIT_OFFICER-only: SUPER_ADMIN-granted permission to create Data Entry Officer accounts. */
  canCreateUsers?: boolean;
  scopePath?: ScopePath;
  /**
   * This user's effective permission set (role defaults + personal
   * overrides), resolved server-side at login/refresh. UI-only — every
   * protected action is still independently re-checked by the API, which
   * is the actual security boundary; this just drives what the interface
   * shows (e.g. hiding an action nobody could complete anyway).
   */
  permissions?: string[];
}

export const UNRESTRICTED_ROLES: Role[] = ['SUPER_ADMIN', 'STATE_ADMIN'];

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    (async () => {
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        setLoading(false);
        return;
      }
      try {
        const tokens = await api.post<{ accessToken: string; refreshToken: string }>(
          '/auth/refresh',
          { refreshToken },
        );
        setAccessToken(tokens.accessToken);
        localStorage.setItem('refreshToken', tokens.refreshToken);
        const me = await api.get<AuthUser>('/auth/me');
        setUser(me);
      } catch {
        localStorage.removeItem('refreshToken');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await api.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      '/auth/login',
      { email, password },
    );
    setAccessToken(result.accessToken);
    localStorage.setItem('refreshToken', result.refreshToken);
    setUser(result.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      if (refreshToken) await api.post('/auth/logout', { refreshToken });
    } catch {
      // best-effort revoke; proceed with local logout regardless
    }
    setAccessToken(null);
    localStorage.removeItem('refreshToken');
    setUser(null);
    router.push('/login');
  }, [router]);

  const hasPermission = useCallback(
    (permission: string) => user?.permissions?.includes(permission) ?? false,
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, hasPermission }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

export function isApiError(e: unknown): e is ApiError {
  return e instanceof ApiError;
}

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import type { SafeUser, OnboardingCompleteResponse } from '@hudumika/types';
import { resetEnabledAppsCache } from './useEnabledApps.js';
import { hydrateCompanyFromServer, resetCompanyCache } from '../data/companyStore.js';
import { hydrateTasksFromServer, resetTasksCache } from '../data/calendarStore.js';

const KEYS = {
  token: 'hudumika_token',
  // Long-lived, and only /auth/refresh accepts it. Stored so a one-hour access
  // token can renew itself rather than ending the session.
  refresh: 'hudumika_refresh',
  user:  'hudumika_user',
  superToken: 'hudumika_super_token',
  superUser:  'hudumika_super_user',
};

interface AuthContextType {
  user: SafeUser | null;
  isImpersonating: boolean;
  login: (email: string, password: string) => Promise<SafeUser>;
  completeOnboarding: (res: OnboardingCompleteResponse) => void;
  logout: () => void;
  impersonate: (tenantId: string) => Promise<void>;
  stopImpersonating: () => void;
  updateUser: (patch: Partial<SafeUser>) => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

/**
 * Refresh the signed-in user from the server.
 *
 * Merged onto the stored copy rather than replacing it, so a field the identity
 * endpoint does not return cannot be blanked out by a refresh. Failure is
 * silent on purpose: the cached user is still usable, and an unreachable API
 * should not sign anybody out.
 */
async function hydrateIdentityFromServer(setUser: (u: any) => void): Promise<void> {
  try {
    const me = await apiFetch('/v1/identity/me');
    if (!me?.id) return;
    setUser((prev: any) => {
      const merged = { ...(prev ?? {}), ...me };
      localStorage.setItem(KEYS.user, JSON.stringify(merged));
      return merged;
    });
  } catch { /* keep the cached user */ }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);

  const isImpersonating = !!localStorage.getItem(KEYS.superToken);

  useEffect(() => {
    const storedUser = localStorage.getItem(KEYS.user);
    const storedToken = localStorage.getItem(KEYS.token);
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        hydrateCompanyFromServer();
        hydrateTasksFromServer();
        // The stored copy is as old as the session. It was written at login and
        // never refreshed, so a picture set afterwards — or a name, role or
        // phone changed by an administrator — appeared nowhere until the person
        // signed out and back in. NexusHR looked right only because it fetches
        // staff rows itself; every other app drew initials from stale data.
        hydrateIdentityFromServer(setUser);
      } catch {
        localStorage.removeItem(KEYS.user);
        localStorage.removeItem(KEYS.token);
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    localStorage.setItem(KEYS.token, res.access_token);
    if (res.refresh_token) localStorage.setItem(KEYS.refresh, res.refresh_token);
    localStorage.setItem(KEYS.user,  JSON.stringify(res.user));
    resetEnabledAppsCache();
    resetCompanyCache();
    resetTasksCache();
    setUser(res.user);
    hydrateCompanyFromServer();
    hydrateTasksFromServer();
    return res.user;
  };

  const completeOnboarding = (res: OnboardingCompleteResponse) => {
    localStorage.setItem(KEYS.token, res.access_token);
    if (res.refresh_token) localStorage.setItem(KEYS.refresh, res.refresh_token);
    localStorage.setItem(KEYS.user,  JSON.stringify(res.user));
    setUser(res.user);
    hydrateCompanyFromServer();
    hydrateTasksFromServer();
  };

  /**
   * Drop every trace of the session from this tab.
   *
   * Shared by the sign-out button and by the cross-tab listener, so the two
   * can never end up clearing different things.
   */
  const clearSessionLocally = () => {
    for (const k of Object.values(KEYS)) localStorage.removeItem(k);
    resetEnabledAppsCache();
    resetCompanyCache();
    resetTasksCache();
    setUser(null);
  };

  const logout = () => {
    // Tell the server first — it needs the token that is about to be deleted.
    // Not awaited: sign-out must not hang on a slow or unreachable API, and it
    // must not fail either. The device row is revoked server-side, which is
    // what actually ends the session; clearing storage only ends it here.
    apiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    clearSessionLocally();
  };

  /**
   * Signing out in one tab signs out every tab.
   *
   * localStorage fires `storage` in the *other* tabs of the same origin, never
   * in the one that made the change — so this is exactly the signal for "some
   * other tab ended the session". A tab that clears the whole store reports
   * `key: null`, so that case has to be handled too rather than filtered out.
   *
   * The token going missing is not the only thing worth reacting to. If
   * another tab signs in as somebody else, this tab keeps rendering the old
   * user while every request it makes now carries the new user's token —
   * showing one person's screen and acting as another. There is no way to
   * repair that in place, so the tab reloads and adopts whoever is now
   * signed in.
   */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea && e.storageArea !== localStorage) return;
      if (e.key !== null && e.key !== KEYS.token && e.key !== KEYS.user) return;

      const token = localStorage.getItem(KEYS.token);
      if (!token) {
        // Already signed out here — nothing to do, and setUser would loop.
        if (!localStorage.getItem(KEYS.user) && !user) return;
        clearSessionLocally();
        return;
      }
      try {
        const stored = JSON.parse(localStorage.getItem(KEYS.user) || 'null');
        if (user && stored?.id && stored.id !== user.id) window.location.reload();
      } catch { /* an unreadable user blob is handled on next load */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

  const impersonate = async (tenantId: string) => {
    const res = await apiFetch('/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    // Save current superadmin session
    localStorage.setItem(KEYS.superToken, localStorage.getItem(KEYS.token)!);
    localStorage.setItem(KEYS.superUser,  localStorage.getItem(KEYS.user)!);
    // Switch to impersonated session
    localStorage.setItem(KEYS.token, res.access_token);
    if (res.refresh_token) localStorage.setItem(KEYS.refresh, res.refresh_token);
    localStorage.setItem(KEYS.user,  JSON.stringify(res.user));
    setUser(res.user);
    // Navigate to home so the tenant app loads fresh
    window.location.href = '/';
  };

  const updateUser = (patch: Partial<SafeUser>) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...patch };
      localStorage.setItem(KEYS.user, JSON.stringify(next));
      return next;
    });
  };

  const stopImpersonating = () => {
    const savedToken = localStorage.getItem(KEYS.superToken);
    const savedUser  = localStorage.getItem(KEYS.superUser);
    if (!savedToken || !savedUser) return;
    localStorage.setItem(KEYS.token, savedToken);
    localStorage.setItem(KEYS.user,  savedUser);
    localStorage.removeItem(KEYS.superToken);
    localStorage.removeItem(KEYS.superUser);
    window.location.href = '/admin?v=companies';
  };

  return (
    <AuthContext.Provider value={{ user, isImpersonating, login, completeOnboarding, logout, impersonate, stopImpersonating, updateUser, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import type { SafeUser, OnboardingCompleteResponse } from '@hudumika/types';
import { resetEnabledAppsCache } from './useEnabledApps.js';
import { hydrateCompanyFromServer, resetCompanyCache } from '../data/companyStore.js';
import { hydrateTasksFromServer, resetTasksCache } from '../data/calendarStore.js';
import { applyTenantLocale } from '../lib/tenantLocale.js';
import { clearIdleLockState } from '../lib/idleLockKeys.js';

// Session-cookie migration (security checklist #9): the access/refresh
// tokens are httpOnly cookies now, invisible to JS entirely — only the
// cached user object (not sensitive, needed for instant UI hydration
// before any round-trip completes) still lives here.
const KEYS = {
  user: 'hudumika_user',
};

interface AuthContextType {
  user: SafeUser | null;
  isImpersonating: boolean;
  login: (email: string, password: string) => Promise<SafeUser>;
  requestOtpLogin: (phone: string) => Promise<{ success: boolean; message: string }>;
  verifyOtpLogin: (phone: string, code: string) => Promise<SafeUser>;
  loginWithTotp: (email: string, code: string) => Promise<SafeUser>;
  requestPasskeyLoginOptions: (email: string) => Promise<any>;
  verifyPasskeyLogin: (email: string, response: any) => Promise<SafeUser>;
  loginWithGoogle: (credential: string) => Promise<SafeUser>;
  loginWithMicrosoft: (credential: string) => Promise<SafeUser>;
  completeOnboarding: (res: OnboardingCompleteResponse) => void;
  logout: () => void;
  impersonate: (tenantId: string) => Promise<void>;
  impersonateCustomer: (customerId: string) => Promise<void>;
  stopImpersonating: () => Promise<void>;
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
 * should not sign anybody out — a genuinely dead session (401) is already
 * handled globally by api.ts's handleUnauthorized, which this call would
 * have gone through on its way here.
 */
async function hydrateIdentityFromServer(setUser: (u: any) => void): Promise<void> {
  try {
    const me = await apiFetch('/v1/identity/me');
    if (!me?.id) return;

    /**
     * Adopt the workspace's language and timezone.
     *
     * The tenant's Localization setting was written and never read — language
     * came from each browser's own localStorage, so an admin choosing Kiswahili
     * changed nothing for anybody. This is the read. A person who has chosen a
     * language for themselves keeps it; applyTenantLocale returns null in that
     * case and nothing switches under them.
     */
    const adopt = applyTenantLocale(me?.tenant?.localization);
    if (adopt) {
      const { default: i18n } = await import('../i18n/index.js');
      if (i18n.language?.slice(0, 2) !== adopt) {
        i18n.changeLanguage(adopt);
        document.documentElement.lang = adopt;
        document.documentElement.dir = adopt === 'ar' ? 'rtl' : 'ltr';
      }
    }

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

  const isImpersonating = !!user?.impersonated_by;

  useEffect(() => {
    const storedUser = localStorage.getItem(KEYS.user);
    if (storedUser) {
      try {
        setUser(JSON.parse(storedUser));
        hydrateCompanyFromServer();
        hydrateTasksFromServer();
        // The stored copy is as old as the session. It was written at login and
        // never refreshed, so a picture set afterwards — or a name, role or
        // phone changed by an administrator — appeared nowhere until the person
        // signed out and back in. NexusHR looked right only because it fetches
        // staff rows itself; every other app drew initials from stale data.
        // Also the *only* real signal of whether this browser still holds a
        // live session at all — there's no client-readable token to check
        // anymore, so a dead session surfaces via this call's 401 (handled
        // globally in api.ts) rather than a synchronous local check.
        hydrateIdentityFromServer(setUser);
      } catch {
        localStorage.removeItem(KEYS.user);
      }
    }
    setLoading(false);
  }, []);

  // Shared by every login path (password, OTP, TOTP) — each hits a
  // different endpoint but they all return the same { user, ...tokens }
  // shape (see ondi-auth.routes.ts's issueSessionFor / auth.routes.ts's
  // /login, both built on the same issueTokens+setSessionCookies seam).
  const completeLogin = (res: { user: SafeUser }) => {
    localStorage.setItem(KEYS.user, JSON.stringify(res.user));
    resetEnabledAppsCache();
    resetCompanyCache();
    resetTasksCache();
    setUser(res.user);
    hydrateCompanyFromServer();
    hydrateTasksFromServer();
    // Also on a fresh sign-in, not only when restoring a stored session — this
    // is the first moment a new colleague sees the workspace, and it is exactly
    // when the workspace's own language should already be in place.
    hydrateIdentityFromServer(setUser);
    return res.user;
  };

  const login = async (email: string, password: string) => {
    const res = await apiFetch('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return completeLogin(res);
  };

  const requestOtpLogin = async (phone: string) => {
    return apiFetch('/v1/ondi/auth/otp/request', {
      method: 'POST',
      body: JSON.stringify({ phone }),
    });
  };

  const verifyOtpLogin = async (phone: string, code: string) => {
    const res = await apiFetch('/v1/ondi/auth/otp/verify', {
      method: 'POST',
      body: JSON.stringify({ phone, code }),
    });
    return completeLogin(res);
  };

  const loginWithTotp = async (email: string, code: string) => {
    const res = await apiFetch('/v1/ondi/auth/totp/verify', {
      method: 'POST',
      body: JSON.stringify({ email, code }),
    });
    return completeLogin(res);
  };

  const requestPasskeyLoginOptions = async (email: string) => {
    return apiFetch('/v1/ondi/auth/passkey/login/options', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  };

  const verifyPasskeyLogin = async (email: string, response: any) => {
    const res = await apiFetch('/v1/ondi/auth/passkey/login/verify', {
      method: 'POST',
      body: JSON.stringify({ email, response }),
    });
    return completeLogin(res);
  };

  const loginWithGoogle = async (credential: string) => {
    const res = await apiFetch('/v1/ondi/auth/google/verify', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
    return completeLogin(res);
  };

  const loginWithMicrosoft = async (credential: string) => {
    const res = await apiFetch('/v1/ondi/auth/microsoft/verify', {
      method: 'POST',
      body: JSON.stringify({ credential }),
    });
    return completeLogin(res);
  };

  const completeOnboarding = (res: OnboardingCompleteResponse) => {
    localStorage.setItem(KEYS.user, JSON.stringify(res.user));
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
    clearIdleLockState();
    resetEnabledAppsCache();
    resetCompanyCache();
    resetTasksCache();
    setUser(null);
  };

  const logout = () => {
    // Tell the server first — it needs the session cookie that is about to
    // be cleared. Not awaited: sign-out must not hang on a slow or
    // unreachable API, and it must not fail either. The device row is
    // revoked server-side, which is what actually ends the session;
    // clearing local state only ends it here.
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
   * The user going missing is not the only thing worth reacting to. If
   * another tab signs in as somebody else, this tab keeps rendering the old
   * user while every request it makes now carries the new user's session —
   * showing one person's screen and acting as another. There is no way to
   * repair that in place, so the tab reloads and adopts whoever is now
   * signed in.
   */
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.storageArea && e.storageArea !== localStorage) return;
      if (e.key !== null && e.key !== KEYS.user) return;

      const stored = localStorage.getItem(KEYS.user);
      if (!stored) {
        // Already signed out here — nothing to do, and setUser would loop.
        if (!user) return;
        clearSessionLocally();
        return;
      }
      try {
        const parsed = JSON.parse(stored);
        if (user && parsed?.id && parsed.id !== user.id) window.location.reload();
      } catch { /* an unreadable user blob is handled on next load */ }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [user]);

  // Keeps this user's real presence current for everyone else's status dot
  // (lib/presence.ts, PersonAvatar) — every signed-in tab pings once on load
  // and every 60s after. Best-effort: a failed beat just means the next one
  // (or the 3-minute offline threshold on the server) sorts it out, never
  // something to surface to the user.
  useEffect(() => {
    if (!user) return;
    const beat = () => { apiFetch('/v1/presence/heartbeat', { method: 'POST' }).catch(() => {}); };
    beat();
    const interval = setInterval(beat, 60_000);
    return () => clearInterval(interval);
  }, [user?.id]);

  const impersonate = async (tenantId: string) => {
    // The server stashes the caller's own current session cookies before
    // overwriting them with the impersonated one (see auth.routes.ts's
    // /impersonate and lib/cookies.ts's setSuperCookies) — nothing for the
    // client to juggle anymore.
    const res = await apiFetch('/auth/impersonate', {
      method: 'POST',
      body: JSON.stringify({ tenant_id: tenantId }),
    });
    localStorage.setItem(KEYS.user, JSON.stringify(res.user));
    setUser(res.user);
    // Navigate to home so the tenant app loads fresh
    window.location.href = '/';
  };

  const impersonateCustomer = async (customerId: string) => {
    const res = await apiFetch('/auth/impersonate-customer', {
      method: 'POST',
      body: JSON.stringify({ customer_id: customerId }),
    });
    localStorage.setItem(KEYS.user, JSON.stringify(res.user));
    setUser(res.user);
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

  /**
   * The current `user` state IS the impersonated identity at the moment
   * this is called — describing it in the audit body is exactly what the
   * pre-cookie version did by reading it out of localStorage before
   * overwriting it. What's different now: the server (not this function)
   * restores the real actor's session cookies, so there's no local copy of
   * *that* identity to switch back to — the full-page navigation below
   * re-derives it via the ordinary AuthProvider init → hydrateIdentityFromServer
   * path, authenticated by the now-restored cookie.
   */
  const stopImpersonating = async () => {
    const target = user;
    let res: { success: boolean } | null = null;
    try {
      res = await apiFetch('/auth/stop-impersonating', {
        method: 'POST',
        body: JSON.stringify({
          target_id: target?.id ?? null, target_role: target?.role ?? null,
          tenant_id: target?.tenant_id ?? null, target_name: target?.name ?? null,
        }),
      });
    } catch { /* best-effort — fall through without navigating if this failed */ return; }
    if (!res?.success) return;
    window.location.href = '/admin?v=companies';
  };

  return (
    <AuthContext.Provider value={{ user, isImpersonating, login, requestOtpLogin, verifyOtpLogin, loginWithTotp, requestPasskeyLoginOptions, verifyPasskeyLogin, loginWithGoogle, loginWithMicrosoft, completeOnboarding, logout, impersonate, impersonateCustomer, stopImpersonating, updateUser, loading }}>
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

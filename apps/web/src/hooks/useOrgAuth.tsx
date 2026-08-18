import React, { createContext, useContext, useState, useEffect } from 'react';
import type { SafeOrgUser } from '@hudumika/types';
import { BASE_URL } from '../lib/api.js';

/**
 * Session for an Organization login (migration 230) — a platform-level
 * identity spanning every tenant that has linked one of its own customers
 * to it. Deliberately its own context, its own localStorage key, and its
 * own tiny fetch helper, completely separate from useAuth()/apiFetch():
 * an OrgJWTPayload has no tenant_id at all, and nearly everything else in
 * this app (branding, WorkspaceApp, ImpersonationBanner, every apiFetch
 * caller) assumes a staff/customer session shape that always has one.
 * Reusing that shared state would mean auditing all of it for a claim this
 * session type doesn't carry; a parallel, narrow session avoids that
 * entirely and can't collide with a staff/customer login open in the same
 * browser — including at the cookie layer (hudumika_org_access/_refresh
 * are separate names from the main hudumika_access/_refresh pair).
 */

const KEYS = {
  user: 'hudumika_org_user',
};

function csrfToken(): string | null {
  const m = document.cookie.match(/(?:^|; )hudumika_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

/**
 * Ask the server to renew the org session from the httpOnly org refresh
 * cookie. Mirrors api.ts's refreshAccessToken() — /auth/refresh branches on
 * the token's role claim (see token.service.ts / auth.routes.ts), so this
 * hits the same endpoint the staff session does.
 */
let orgRefreshInFlight: Promise<boolean> | null = null;

async function orgRefreshAccessToken(): Promise<boolean> {
  if (orgRefreshInFlight) return orgRefreshInFlight;

  orgRefreshInFlight = (async () => {
    try {
      const csrf = csrfToken();
      const res = await fetch(`${BASE_URL}/v1/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
        headers: csrf ? { 'X-CSRF-Token': csrf } : undefined,
      });
      return res.ok;
    } catch {
      return false;
    } finally {
      setTimeout(() => { orgRefreshInFlight = null; }, 0);
    }
  })();

  return orgRefreshInFlight;
}

/** Shared by orgApiFetch/orgFetchRaw — sends the org session cookie, retries once on a 401. */
async function orgDoFetch(path: string, options: RequestInit = {}): Promise<Response> {
  const headers = new Headers(options.headers);
  const csrf = csrfToken();
  if (csrf) headers.set('X-CSRF-Token', csrf);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let response = await fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: 'include' });

  if (response.status === 401) {
    const refreshed = await orgRefreshAccessToken();
    if (refreshed) {
      const freshCsrf = csrfToken();
      if (freshCsrf) headers.set('X-CSRF-Token', freshCsrf);
      response = await fetch(`${BASE_URL}${path}`, { ...options, headers, credentials: 'include' });
    }
  }

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Request failed with status ${response.status}`);
  }
  return response;
}

export async function orgApiFetch(path: string, options: RequestInit = {}) {
  const response = await orgDoFetch(path, options);
  if (response.status === 204) return null;
  return response.json();
}

/** Like orgApiFetch, but hands back the raw Response — for a blob/text body or a response header apiFetch doesn't expose. */
export async function orgFetchRaw(path: string, options: RequestInit = {}): Promise<Response> {
  return orgDoFetch(path, options);
}

interface OrgAuthContextType {
  orgUser: SafeOrgUser | null;
  orgLoading: boolean;
  orgLogin: (email: string, password: string) => Promise<SafeOrgUser>;
  orgLogout: () => void;
}

const OrgAuthContext = createContext<OrgAuthContextType | null>(null);

export const OrgAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [orgUser, setOrgUser] = useState<SafeOrgUser | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);

  useEffect(() => {
    const storedUser = localStorage.getItem(KEYS.user);
    if (storedUser) {
      try { setOrgUser(JSON.parse(storedUser)); }
      catch { localStorage.removeItem(KEYS.user); }
    }
    setOrgLoading(false);
  }, []);

  const orgLogin = async (email: string, password: string) => {
    const res = await orgApiFetch('/auth/org-login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(KEYS.user, JSON.stringify(res.user));
    setOrgUser(res.user);
    return res.user as SafeOrgUser;
  };

  const orgLogout = () => {
    // /auth/logout is reachable by an ORG token now (middleware/auth.ts's
    // ORG_ALLOWED_ROUTES) and clears the org cookie pair server-side — not
    // awaited, matching useAuth.tsx's logout()'s own fire-and-forget pattern.
    orgApiFetch('/auth/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem(KEYS.user);
    setOrgUser(null);
  };

  return (
    <OrgAuthContext.Provider value={{ orgUser, orgLoading, orgLogin, orgLogout }}>
      {children}
    </OrgAuthContext.Provider>
  );
};

export function useOrgAuth(): OrgAuthContextType {
  const ctx = useContext(OrgAuthContext);
  if (!ctx) throw new Error('useOrgAuth must be used within OrgAuthProvider');
  return ctx;
}

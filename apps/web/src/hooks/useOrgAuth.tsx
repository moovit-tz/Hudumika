import React, { createContext, useContext, useState, useEffect } from 'react';
import type { SafeOrgUser } from '@hudumika/types';

/**
 * Session for an Organization login (migration 230) — a platform-level
 * identity spanning every tenant that has linked one of its own customers
 * to it. Deliberately its own context, its own localStorage keys, and its
 * own tiny fetch helper, completely separate from useAuth()/apiFetch():
 * an OrgJWTPayload has no tenant_id at all, and nearly everything else in
 * this app (branding, WorkspaceApp, ImpersonationBanner, every apiFetch
 * caller) assumes a staff/customer session shape that always has one.
 * Reusing that shared state would mean auditing all of it for a claim this
 * session type doesn't carry; a parallel, narrow session avoids that
 * entirely and can't collide with a staff/customer login open in the same
 * browser.
 */

const BASE_URL = 'http://localhost:3001';

const KEYS = {
  token: 'hudumika_org_token',
  refresh: 'hudumika_org_refresh',
  user: 'hudumika_org_user',
};

export async function orgApiFetch(path: string, options: RequestInit = {}) {
  const token = localStorage.getItem(KEYS.token);
  const headers = new Headers(options.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || err.error || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
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
    const storedToken = localStorage.getItem(KEYS.token);
    if (storedUser && storedToken) {
      try { setOrgUser(JSON.parse(storedUser)); }
      catch { localStorage.removeItem(KEYS.user); localStorage.removeItem(KEYS.token); }
    }
    setOrgLoading(false);
  }, []);

  const orgLogin = async (email: string, password: string) => {
    const res = await orgApiFetch('/auth/org-login', { method: 'POST', body: JSON.stringify({ email, password }) });
    localStorage.setItem(KEYS.token, res.access_token);
    if (res.refresh_token) localStorage.setItem(KEYS.refresh, res.refresh_token);
    localStorage.setItem(KEYS.user, JSON.stringify(res.user));
    setOrgUser(res.user);
    return res.user as SafeOrgUser;
  };

  const orgLogout = () => {
    for (const k of Object.values(KEYS)) localStorage.removeItem(k);
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

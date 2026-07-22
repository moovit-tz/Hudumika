import React, { createContext, useContext, useState, useEffect } from 'react';
import { apiFetch } from '../lib/api.js';
import type { SafeUser, OnboardingCompleteResponse } from '@hudumika/types';
import { resetEnabledAppsCache } from './useEnabledApps.js';
import { hydrateCompanyFromServer, resetCompanyCache } from '../data/companyStore.js';
import { hydrateTasksFromServer, resetTasksCache } from '../data/calendarStore.js';

const KEYS = {
  token: 'hudumika_token',
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<SafeUser | null>(null);
  const [loading, setLoading] = useState(true);

  const isImpersonating = !!localStorage.getItem(KEYS.superToken);

  useEffect(() => {
    const storedUser = localStorage.getItem(KEYS.user);
    const storedToken = localStorage.getItem(KEYS.token);
    if (storedUser && storedToken) {
      try { setUser(JSON.parse(storedUser)); hydrateCompanyFromServer(); hydrateTasksFromServer(); } catch {
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
    localStorage.setItem(KEYS.user,  JSON.stringify(res.user));
    setUser(res.user);
    hydrateCompanyFromServer();
    hydrateTasksFromServer();
  };

  const logout = () => {
    localStorage.removeItem(KEYS.token);
    localStorage.removeItem(KEYS.user);
    localStorage.removeItem(KEYS.superToken);
    localStorage.removeItem(KEYS.superUser);
    resetEnabledAppsCache();
    resetCompanyCache();
    resetTasksCache();
    setUser(null);
  };

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

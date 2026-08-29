import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';

import { OneIdUsers } from '../pages/OneIdUsers.js';
import { OneIdSSO } from '../pages/OneIdSSO.js';
import { OneIdSessions } from '../pages/OneIdSessions.js';
import { OneIdLoginActivity } from '../pages/OneIdLoginActivity.js';
import { OneIdKyc } from '../pages/OneIdKyc.js';
import { OneIdRoles } from '../pages/OneIdRoles.js';
import { OneIdPersonal } from '../pages/OneIdPersonal.js';
import { OneIdBusinessVerification } from '../pages/OneIdBusinessVerification.js';
import { OndiAuthorize } from '../pages/OndiAuthorize.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

const PERSONAL_NAV: SidebarSection[] = [
  { items: [{ label: 'My Identity', icon: 'fingerprint', path: '/ondi/personal', exact: true }] },
];

const BUSINESS_NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Users',          icon: 'users',    path: '/ondi', exact: true },
      { label: 'Business Verification', icon: 'building', path: '/ondi/business' },
      { label: 'KYC Review',     icon: 'shield', path: '/ondi/kyc' },
      { label: 'Roles & Access', icon: 'userCheck', path: '/ondi/roles' },
      { label: 'SSO & Providers', icon: 'key',     path: '/ondi/sso' },
      { label: 'Sessions & Security', icon: 'lock', path: '/ondi/sessions' },
      { label: 'Login Activity', icon: 'clock',    path: '/ondi/login-activity' },
    ],
  },
];

/**
 * Personal / Business mode toggle — the concept ondi-mvp's own registration
 * flow establishes ("Everyone starts as a personal account... Business
 * details are an optional toggle") ported here as a view switch rather than
 * a separate signup path, since this platform has one integrated workspace
 * per tenant, not separate personal/business apps to route between.
 * Personal mode is every signed-in user's own identity (KYC, 2FA, passkeys —
 * AccountSecurityPanel, the same panel /profile's Security tab renders).
 * Business mode is the existing admin-facing Ondi console (users, KYC
 * review, roles, SSO, sessions) plus the workspace's own KYB. The toggle
 * tracks whichever mode the current URL is actually in (so the sidebar
 * never shows Personal while a Business page is open, or vice versa) —
 * landing on the bare /ondi index (unchanged, still the Users directory)
 * starts in Business; landing on /ondi/personal starts in Personal.
 */
function ModeToggle({ mode, onChange, collapsed }: { mode: 'personal' | 'business'; onChange: (m: 'personal' | 'business') => void; collapsed: boolean }) {
  if (collapsed) return null;
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 100, padding: 4, margin: '0 12px 12px' }}>
      {(['personal', 'business'] as const).map(m => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          style={{
            flex: 1, border: 'none', borderRadius: 100, padding: '7px 10px', fontSize: 12.5, fontWeight: 700,
            fontFamily: 'var(--font)', cursor: 'pointer', textTransform: 'capitalize',
            background: mode === m ? 'var(--teal)' : 'transparent',
            color: mode === m ? '#fff' : 'var(--ink3)',
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

export function OneIdShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mode, setMode] = useState<'personal' | 'business'>(
    location.pathname.startsWith('/ondi/personal') ? 'personal' : 'business'
  );

  // Keeps the sidebar's mode in sync with browser back/forward or any other
  // navigation into /ondi/* that didn't go through switchMode() below —
  // useState's initializer only runs once, so without this the sidebar
  // could show Personal while a Business page (or vice versa) is on screen.
  React.useEffect(() => {
    setMode(location.pathname.startsWith('/ondi/personal') ? 'personal' : 'business');
  }, [location.pathname]);

  function switchMode(next: 'personal' | 'business') {
    setMode(next);
    navigate(next === 'personal' ? '/ondi/personal' : '/ondi');
  }

  return (
    <WorkspaceApp appId="oneid">
      <div className="app-shell" data-oneid="true">
        <AppSidebar
          appId="oneid"
          sections={mode === 'personal' ? PERSONAL_NAV : BUSINESS_NAV}
          beforeNav={({ collapsed }) => <ModeToggle mode={mode} onChange={switchMode} collapsed={collapsed} />}
        />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<OneIdUsers />} />
                <Route path="personal" element={<OneIdPersonal />} />
                <Route path="business" element={<OneIdBusinessVerification />} />
                <Route path="kyc" element={<RequireRoles roles={[...ADMIN_ROLES]}><OneIdKyc /></RequireRoles>} />
                <Route path="roles" element={<OneIdRoles />} />
                <Route path="authorize" element={<OndiAuthorize />} />
                <Route path="sso" element={<RequireRoles roles={[...ADMIN_ROLES]}><OneIdSSO /></RequireRoles>} />
                <Route path="sessions" element={<RequireRoles roles={[...ADMIN_ROLES]}><OneIdSessions /></RequireRoles>} />
                <Route path="login-activity" element={<RequireRoles roles={[...ADMIN_ROLES]}><OneIdLoginActivity /></RequireRoles>} />
              </Route>
              <Route path="*" element={<Navigate to="/ondi" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

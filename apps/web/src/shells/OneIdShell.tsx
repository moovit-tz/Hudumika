import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection, SidebarNavItem } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';

import { OneIdUsers } from '../pages/OneIdUsers.js';
import { OneIdSSO } from '../pages/OneIdSSO.js';
import { OneIdSessions } from '../pages/OneIdSessions.js';
import { OneIdLoginActivity } from '../pages/OneIdLoginActivity.js';
import { OneIdKyc } from '../pages/OneIdKyc.js';
import { OneIdRoles } from '../pages/OneIdRoles.js';
import { OneIdPersonal } from '../pages/OneIdPersonal.js';
import { OneIdSecuritySettings } from '../pages/OneIdSecuritySettings.js';
import { OneIdVault } from '../pages/OneIdVault.js';
import { OneIdTrust } from '../pages/OneIdTrust.js';
import { OneIdPersonalDevices } from '../pages/OneIdPersonalDevices.js';
import { OneIdPersonalActivity } from '../pages/OneIdPersonalActivity.js';
import { OneIdApps } from '../pages/OneIdApps.js';
import { OneIdPrivacy } from '../pages/OneIdPrivacy.js';
import { OneIdBusinessVerification } from '../pages/OneIdBusinessVerification.js';
import { OndiAuthorize } from '../pages/OndiAuthorize.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

// Sectioned to match the house-style mockup's Personal nav grouping
// (You / Account / Business) — Wallet/Apps/Create Organization land in
// their own later milestones, added into these same sections rather than
// requiring another restructure.
const PERSONAL_NAV: SidebarSection[] = [
  {
    items: [
      { label: 'My Profile', icon: 'fingerprint', path: '/ondi/personal', exact: true },
    ],
  },
  {
    title: 'YOU',
    items: [
      { label: 'Trust',    icon: 'trendingUp',  path: '/ondi/personal/trust' },
      { label: 'Devices',  icon: 'smartphone',  path: '/ondi/personal/devices' },
      { label: 'Activity', icon: 'activity',    path: '/ondi/personal/activity' },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { label: 'Documents',        icon: 'fileText', path: '/ondi/personal/documents' },
      { label: 'Privacy',          icon: 'shield',   path: '/ondi/personal/privacy' },
      { label: 'Security Settings', icon: 'lock',     path: '/ondi/personal/security' },
    ],
  },
  {
    title: 'BUSINESS',
    items: [
      { label: 'Apps', icon: 'grid', path: '/ondi/personal/apps' },
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
    <div style={{
      position: 'relative',
      display: 'flex',
      background: 'var(--bg)',
      border: '1px solid var(--border-soft, var(--border))',
      borderRadius: 100,
      padding: 3,
      margin: '14px 12px',
      boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)',
      overflow: 'hidden'
    }}>
      {/* Sliding background highlight */}
      <div style={{
        position: 'absolute',
        top: 3,
        bottom: 3,
        left: mode === 'personal' ? 3 : 'calc(50% + 1.5px)',
        width: 'calc(50% - 4.5px)',
        background: 'linear-gradient(135deg, var(--teal) 0%, var(--teal-d, var(--teal)) 100%)',
        borderRadius: 100,
        transition: 'all 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        boxShadow: '0 2px 6px rgba(0, 181, 137, 0.2)'
      }} />

      {(['personal', 'business'] as const).map(m => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              position: 'relative',
              zIndex: 1,
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              border: 'none',
              borderRadius: 100,
              padding: '6px 10px',
              fontSize: 12.5,
              fontWeight: 700,
              fontFamily: 'var(--font)',
              cursor: 'pointer',
              textTransform: 'capitalize',
              background: 'transparent',
              color: active ? '#fff' : 'var(--ink3)',
              transition: 'color 0.2s ease',
              outline: 'none'
            }}
          >
            <Icon 
              name={m === 'personal' ? 'fingerprint' : 'building'} 
              size={13} 
              style={{ 
                color: active ? '#fff' : 'var(--ink3)', 
                opacity: active ? 1 : 0.7,
                transition: 'all 0.2s ease'
              }} 
            />
            {m}
          </button>
        );
      })}
    </div>
  );
}

export function OneIdShell() {
  const { user } = useAuth();
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

  const isAdmin = !!user && ADMIN_ROLES.includes(user.role as any);
  const hasKycPermission = isAdmin || !!user?.org_permissions?.includes('kyc.review');
  const hasSsoPermission = isAdmin || !!user?.org_permissions?.includes('sso_providers.manage');

  const businessNavItems: SidebarNavItem[] = [
    { label: 'Users',          icon: 'users' as const,    path: '/ondi', exact: true },
    { label: 'Business Verification', icon: 'building' as const, path: '/ondi/business' },
  ];

  if (hasKycPermission) {
    businessNavItems.push({ label: 'KYC Review',     icon: 'shield' as const, path: '/ondi/kyc' });
  }

  businessNavItems.push({ label: 'Roles & Access', icon: 'userCheck' as const, path: '/ondi/roles' });

  if (hasSsoPermission) {
    businessNavItems.push({ label: 'SSO & Providers', icon: 'key' as const,     path: '/ondi/sso' });
  }

  if (isAdmin) {
    businessNavItems.push({ label: 'Sessions & Security', icon: 'lock' as const, path: '/ondi/sessions' });
    businessNavItems.push({ label: 'Login Activity', icon: 'clock' as const,    path: '/ondi/login-activity' });
  }

  const sections: SidebarSection[] = mode === 'personal' ? PERSONAL_NAV : [{ items: businessNavItems }];

  return (
    <WorkspaceApp appId="oneid">
      <div className="app-shell" data-oneid="true">
        <AppSidebar
          appId="oneid"
          sections={sections}
          beforeNav={({ collapsed }) => <ModeToggle mode={mode} onChange={switchMode} collapsed={collapsed} />}
        />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<OneIdUsers />} />
                <Route path="personal" element={<OneIdPersonal />} />
                <Route path="personal/trust" element={<OneIdTrust />} />
                <Route path="personal/devices" element={<OneIdPersonalDevices />} />
                <Route path="personal/activity" element={<OneIdPersonalActivity />} />
                <Route path="personal/documents" element={<OneIdVault />} />
                {/* Documents used to be labeled/routed as "Vault" — kept as a
                    redirect so old links/bookmarks still land somewhere real. */}
                <Route path="personal/vault" element={<Navigate to="/ondi/personal/documents" replace />} />
                <Route path="personal/security" element={<OneIdSecuritySettings />} />
                <Route path="personal/privacy" element={<OneIdPrivacy />} />
                <Route path="personal/apps" element={<OneIdApps />} />
                <Route path="business" element={<OneIdBusinessVerification />} />
                <Route path="kyc" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['kyc.review']}><OneIdKyc /></RequireRoles>} />
                <Route path="roles" element={<OneIdRoles />} />
                <Route path="authorize" element={<OndiAuthorize />} />
                <Route path="sso" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['sso_providers.manage']}><OneIdSSO /></RequireRoles>} />
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

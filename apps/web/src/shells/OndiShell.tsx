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
import '../pages/OndiPages.css';

import { OndiUsers } from '../pages/OndiUsers.js';
import { OndiSSO } from '../pages/OndiSSO.js';
import { OndiSessions } from '../pages/OndiSessions.js';
import { OndiLoginActivity } from '../pages/OndiLoginActivity.js';
import { OndiKyc } from '../pages/OndiKyc.js';
import { OndiRoles } from '../pages/OndiRoles.js';
import { OndiPersonal } from '../pages/OndiPersonal.js';
import { OndiSecuritySettings } from '../pages/OndiSecuritySettings.js';
import { OndiVault } from '../pages/OndiVault.js';
import { OndiTrust } from '../pages/OndiTrust.js';
import { OndiPersonalDevices } from '../pages/OndiPersonalDevices.js';
import { OndiPersonalActivity } from '../pages/OndiPersonalActivity.js';
import { OndiApps } from '../pages/OndiApps.js';
import { OndiPrivacy } from '../pages/OndiPrivacy.js';
import { OndiWallet } from '../pages/OndiWallet.js';
import { OndiAccessReviews, OndiAccessReviewDetail } from '../pages/OndiAccessReviews.js';
import { OndiOrgTrust } from '../pages/OndiOrgTrust.js';
import { OndiOrgActivity } from '../pages/OndiOrgActivity.js';
import { OndiAutomation } from '../pages/OndiAutomation.js';
import { OndiCompliance } from '../pages/OndiCompliance.js';
import { OndiPolicies } from '../pages/OndiPolicies.js';
import { OndiIntegrations } from '../pages/OndiIntegrations.js';
import { OndiBusinessVerification } from '../pages/OndiBusinessVerification.js';
import { OndiItAdmin } from '../pages/OndiItAdmin.js';
import { OndiAuthorize } from '../pages/OndiAuthorize.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

// Sectioned to match the house-style mockup's Personal nav grouping
// (You / Account). "Apps" (a user's own OAuth-connected apps) lives under
// ACCOUNT — it's a personal-identity feature every user has regardless of
// whether their tenant is a real company, not a business-admin one, so it
// doesn't belong behind the Business-mode gate below. "Create Organization"
// used to sit alongside it in its own BUSINESS section here — removed
// (not just hidden): it only ever linked out to the real /signup flow and
// had no other content to justify a section of its own.
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
      { label: 'Credentials', icon: 'key',      path: '/ondi/personal/wallet' },
      { label: 'Devices',  icon: 'smartphone',  path: '/ondi/personal/devices' },
      { label: 'Activity', icon: 'activity',    path: '/ondi/personal/activity' },
    ],
  },
  {
    title: 'ACCOUNT',
    items: [
      { label: 'ID Documents',     icon: 'fileText', path: '/ondi/personal/documents' },
      { label: 'Privacy',          icon: 'shield',   path: '/ondi/personal/privacy' },
      { label: 'Security Settings', icon: 'lock',     path: '/ondi/personal/security' },
      { label: 'Apps',              icon: 'grid',     path: '/ondi/personal/apps' },
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

export function OndiShell() {
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
  const hasAccessReviewsPermission = isAdmin || !!user?.org_permissions?.includes('access_reviews.manage');
  const hasOrgTrustPermission = isAdmin || !!user?.org_permissions?.includes('org_trust.view');
  const hasAutomationPermission = isAdmin || !!user?.org_permissions?.includes('automation.manage');
  const hasComplianceReviewPermission = isAdmin || !!user?.org_permissions?.includes('compliance.review');
  const hasPoliciesPermission = isAdmin || !!user?.org_permissions?.includes('policies.manage');
  const hasAssetsPermission = isAdmin || !!user?.org_permissions?.includes('assets.manage');
  const hasIntegrationsPermission = isAdmin || !!user?.org_permissions?.includes('integrations.manage');

  // Business mode is this tenant's company-administration console (staff
  // directory, KYB/business verification, roles, KYC review, SSO...) — it
  // only makes sense for someone who actually has some administrative
  // standing over that company, not for every signed-in individual. Every
  // user already has a tenant_id (this platform is multi-tenant top to
  // bottom), so "tied to a company" can't mean that; it means holding at
  // least one of the real admin/org-permission flags above.
  const canSeeBusinessMode = isAdmin || hasKycPermission || hasSsoPermission || hasAccessReviewsPermission
    || hasOrgTrustPermission || hasAutomationPermission || hasComplianceReviewPermission
    || hasPoliciesPermission || hasAssetsPermission || hasIntegrationsPermission;

  const businessNavItems: SidebarNavItem[] = [
    { label: 'Users',          icon: 'users' as const,    path: '/ondi', exact: true },
    { label: 'Business Verification', icon: 'building' as const, path: '/ondi/business' },
  ];

  if (hasKycPermission) {
    businessNavItems.push({ label: 'KYC Review',     icon: 'shield' as const, path: '/ondi/kyc' });
  }

  businessNavItems.push({ label: 'Roles & Access', icon: 'userCheck' as const, path: '/ondi/roles' });

  if (hasAccessReviewsPermission) {
    businessNavItems.push({ label: 'Access Reviews', icon: 'clipboard' as const, path: '/ondi/access-reviews' });
  }

  if (hasAutomationPermission) {
    businessNavItems.push({ label: 'Automation', icon: 'zap' as const, path: '/ondi/automation' });
  }

  if (hasComplianceReviewPermission) {
    businessNavItems.push({ label: 'Compliance', icon: 'checkCircle' as const, path: '/ondi/compliance' });
  }

  if (hasPoliciesPermission) {
    businessNavItems.push({ label: 'Policies', icon: 'settings' as const, path: '/ondi/policies' });
  }

  if (hasAssetsPermission) {
    // A real, already-working NexusHR feature (hr_assets/HrAssets.tsx) —
    // linked to directly rather than rebuilt a second time in Ondi.
    businessNavItems.push({ label: 'Assets', icon: 'package' as const, path: '/nexushr/assets' });
  }

  if (hasIntegrationsPermission) {
    businessNavItems.push({ label: 'Integrations', icon: 'grid' as const, path: '/ondi/integrations' });
  }

  if (hasSsoPermission) {
    businessNavItems.push({ label: 'SSO & Providers', icon: 'key' as const,     path: '/ondi/sso' });
  }

  if (hasOrgTrustPermission) {
    businessNavItems.push({ label: 'Trust', icon: 'trendingUp' as const, path: '/ondi/trust' });
  }

  if (isAdmin) {
    businessNavItems.push({ label: 'IT Admin', icon: 'barChart2' as const, path: '/ondi/it-admin' });
    businessNavItems.push({ label: 'Sessions & Security', icon: 'lock' as const, path: '/ondi/sessions' });
    businessNavItems.push({ label: 'Activity', icon: 'activity' as const,    path: '/ondi/activity' });
    // The webhook form itself still lives in Settings.tsx (same generic
    // /v1/settings-backed pattern every other tenant setting uses) — this
    // just points there directly, same "link out, don't rebuild" precedent
    // as Assets above, since it's Ondi's own audit chain being exported.
    businessNavItems.push({ label: 'SIEM Export', icon: 'send' as const, path: '/workspace/settings?s=siem-export' });
  }

  // Without canSeeBusinessMode, the toggle above never renders — so `mode`
  // can only read 'business' here from a direct URL hit (bare /ondi, or a
  // bookmarked business-mode link), not from anything the sidebar itself
  // offers. Falling back to PERSONAL_NAV in that case keeps the sidebar
  // navigable instead of stranding them on a console they have no way back
  // out of.
  const sections: SidebarSection[] = (mode === 'personal' || !canSeeBusinessMode) ? PERSONAL_NAV : [{ items: businessNavItems }];

  return (
    <WorkspaceApp appId="ondi">
      <div className="app-shell" data-ondi="true">
        <AppSidebar
          appId="ondi"
          sections={sections}
          beforeNav={({ collapsed }) => canSeeBusinessMode ? <ModeToggle mode={mode} onChange={switchMode} collapsed={collapsed} /> : null}
        />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={canSeeBusinessMode ? <OndiUsers /> : <Navigate to="/ondi/personal" replace />} />
                <Route path="personal" element={<OndiPersonal />} />
                <Route path="personal/trust" element={<OndiTrust />} />
                <Route path="personal/wallet" element={<OndiWallet />} />
                <Route path="personal/devices" element={<OndiPersonalDevices />} />
                <Route path="personal/activity" element={<OndiPersonalActivity />} />
                <Route path="personal/documents" element={<OndiVault />} />
                {/* Documents used to be labeled/routed as "Vault" — kept as a
                    redirect so old links/bookmarks still land somewhere real. */}
                <Route path="personal/vault" element={<Navigate to="/ondi/personal/documents" replace />} />
                <Route path="personal/security" element={<OndiSecuritySettings />} />
                <Route path="personal/privacy" element={<OndiPrivacy />} />
                <Route path="personal/apps" element={<OndiApps />} />
                {/* "Create Organization" removed — it only ever linked out
                    to the real /signup flow; kept as a redirect for any
                    bookmark/old link rather than a hard 404. */}
                <Route path="personal/create-organization" element={<Navigate to="/ondi/personal" replace />} />
                <Route path="business" element={<OndiBusinessVerification />} />
                <Route path="access-reviews" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['access_reviews.manage']}><OndiAccessReviews /></RequireRoles>} />
                <Route path="access-reviews/:id" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['access_reviews.manage']}><OndiAccessReviewDetail /></RequireRoles>} />
                <Route path="automation" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['automation.manage']}><OndiAutomation /></RequireRoles>} />
                <Route path="compliance" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['compliance.review']}><OndiCompliance /></RequireRoles>} />
                <Route path="policies" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['policies.manage']}><OndiPolicies /></RequireRoles>} />
                <Route path="integrations" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['integrations.manage']}><OndiIntegrations /></RequireRoles>} />
                {/* Moved to NexusHR (front-desk sign-in, not an
                    authentication moment — see HrVisitors.tsx's own header
                    comment). */}
                <Route path="visitors" element={<Navigate to="/nexushr/visitors" replace />} />
                <Route path="kyc" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['kyc.review']}><OndiKyc /></RequireRoles>} />
                <Route path="roles" element={<OndiRoles />} />
                {/* Moved to NexusHR — grouping staff (static or rule-based)
                    is a people-management task, not an identity/access one. */}
                <Route path="groups" element={<Navigate to="/nexushr/groups" replace />} />
                <Route path="authorize" element={<OndiAuthorize />} />
                <Route path="sso" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['sso_providers.manage']}><OndiSSO /></RequireRoles>} />
                <Route path="it-admin" element={<RequireRoles roles={[...ADMIN_ROLES]}><OndiItAdmin /></RequireRoles>} />
                <Route path="sessions" element={<RequireRoles roles={[...ADMIN_ROLES]}><OndiSessions /></RequireRoles>} />
                <Route path="activity" element={<RequireRoles roles={[...ADMIN_ROLES]}><OndiOrgActivity /></RequireRoles>} />
                <Route path="trust" element={<RequireRoles roles={[...ADMIN_ROLES]} permissions={['org_trust.view']}><OndiOrgTrust /></RequireRoles>} />
                <Route path="login-activity" element={<Navigate to="/ondi/activity" replace />} />
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

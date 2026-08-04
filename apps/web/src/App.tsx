import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, useLocation, useParams, Link } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.js';
import { useBranding } from './hooks/useBranding.js';
import { AutoSEO } from './components/AutoSEO.js';
import type { UserRole } from '@hudumika/types';
import { MGMT_ROLES, OPS_ROLES, FIN_ROLES } from './lib/permissions.js';
import { WorkspaceProvider } from './contexts/WorkspaceContext.js';
import { Icon, type IconName } from './components/Icon.js';
import { Login }           from './pages/Login.js';
import { OnboardingWizard } from './pages/onboarding/OnboardingWizard.js';
import { ForgotPassword }  from './pages/ForgotPassword.js';
import { ResetPassword }   from './pages/ResetPassword.js';
import { AcceptInvite }    from './pages/AcceptInvite.js';
import { VerifyEmail }     from './pages/VerifyEmail.js';
import { ComplyOSSales }   from './pages/ComplyOSSales.js';

import { CommandCenter }  from './pages/CommandCenter.js';
import { ShipmentsList }  from './pages/ShipmentsList.js';
import { ShipmentDetail } from './pages/ShipmentDetail.js';
import { TrackingShared } from './pages/TrackingShared.js';
import { SharedLandedCostReport } from './pages/SharedLandedCostReport.js';
import { UserProfile }    from './pages/UserProfile.js';
import { Support }        from './pages/Support.js';
import { SupportOverview }from './pages/SupportOverview.js';
import { FileManager }    from './pages/FileManager.js';
import { Escalations }    from './pages/Escalations.js';
import { Chat }           from './pages/Chat.js';
import { ToolsOverview }  from './pages/ToolsOverview.js';
import { LandedCostPage } from './pages/LandedCostPage.js';
import { CompliancePage } from './pages/CompliancePage.js';
import { PenaltyPage }    from './pages/PenaltyPage.js';
import { CarbonCreditsPage } from './pages/CarbonCreditsPage.js';
import { TasksApp }       from './pages/TasksApp.js';
import { CalendarApp }    from './pages/CalendarApp.js';
import { CustomerDashboard }  from './pages/CustomerDashboard.js';
import { CustomerSupport }    from './pages/CustomerSupport.js';
import { CustomerInvoices }   from './pages/CustomerInvoices.js';
import { CustomerQuotations } from './pages/CustomerQuotations.js';
import { TermsOfService }     from './pages/TermsOfService.js';
import { PrivacyPolicy }      from './pages/PrivacyPolicy.js';
import { SupportTicket }      from './pages/SupportTicket.js';
import { OneSitePublic }      from './pages/OneSitePublic.js';
import { CheckInWidget }      from './components/CheckInWidget.js';
import { ClockInProvider }    from './contexts/ClockInContext.js';
import { DesignSystemProvider } from './components/DesignSystemProvider.js';
import { SeoAnalyticsProvider } from './components/SeoAnalyticsProvider.js';
import { AlertHost } from './components/AlertHost.js';
import { ConfirmHost } from './components/ConfirmHost.js';

import { ClearOSShell } from './shells/ClearOSShell.js';
import { FinOpsShell }  from './shells/FinOpsShell.js';
import { NexusHRShell }   from './shells/NexusHRShell.js';
import { BlissShell }   from './shells/BlissShell.js';
import { CloudShell }   from './shells/CloudShell.js';
import { AdminShell }        from './shells/AdminShell.js';
import { SuperAdminShell }   from './shells/SuperAdminShell.js';
import { AIShell }      from './shells/AIShell.js';
import { ComplyOSShell } from './shells/ComplyOSShell.js';
import { SealShell } from './shells/SealShell.js';
import { InventoryShell } from './shells/InventoryShell.js';
import { EmailShell }   from './shells/EmailShell.js';
import { CRMShell }     from './shells/CRMShell.js';
import { ContactsShell } from './shells/ContactsShell.js';
import { StoreShell }    from './shells/StoreShell.js';
import { OneIdShell }    from './shells/OneIdShell.js';
import { TrackingShell } from './shells/TrackingShell.js';
import { CargoTrackerShell } from './shells/CargoTrackerShell.js';
import { CalendarShell } from './shells/CalendarShell.js';
import { TasksShell }    from './shells/TasksShell.js';
import { CMSShell }      from './shells/CMSShell.js';
import { StudioShell } from './shells/StudioShell.js';
import { AppHeader }    from './components/AppHeader.js';
import { WorkspaceHome } from './pages/WorkspaceHome.js';

/* ── Hub page — shares search state between header and workspace ── */
const HubPage: React.FC = () => {
  const [hubSearch, setHubSearch] = React.useState('');
  return (
    <div className="app-shell">
      <div className="app-main">
        <AppHeader hubSearch={hubSearch} onHubSearchChange={setHubSearch} />
        <div className="app-shell-content">
          <WorkspaceHome externalSearch={hubSearch} />
        </div>
      </div>
    </div>
  );
};

/* Redirects the legacy bare /clearance/:id(/edit) paths into the ClearOS-
   shell-wrapped route so the shipment page always keeps its sidebar/header
   instead of escaping into the sidebar-less NavShell. */
const ClearanceRedirect: React.FC<{ edit?: boolean }> = ({ edit }) => {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/clearos/clearance/${id}${edit ? '/edit' : ''}`} replace />;
};

/* ── Nav shell — AppHeader without a sidebar, for standalone tool pages ── */
const NavShell: React.FC = () => (
  <div className="app-shell">
    <div className="app-main">
      <AppHeader />
      <div className="app-shell-content">
        <Outlet />
      </div>
    </div>
  </div>
);

function HrmStaffRedirect() {
  const { id } = useParams();
  return <Navigate to={`/nexushr/staff/${id}`} replace />;
}

/**
 * Carries the whole path across the /onepi -> /nexushr rename.
 *
 * A flat redirect to /nexushr would drop whatever the person was actually
 * opening — /onepi/payroll and a deep /onepi/staff/:id from a notification
 * link both have to land on their real destination, with the query string.
 */
function OnepiToNexusHR() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={pathname.replace(/^\/onepi/, '/nexushr') + search + hash} replace />;
}

/* ── Route guard: restrict to specific roles ── */
function RequireRoles({ children, roles }: { children: React.ReactNode; roles: UserRole[] }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (!roles.includes(user.role as UserRole)) {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

/* ── Impersonation banner ── */
const ImpersonationBanner: React.FC = () => {
  const { user, isImpersonating, stopImpersonating } = useAuth();
  if (!isImpersonating) return null;
  return (
    <div style={{ background:'#7c3aed', color:'#fff', padding:'8px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', fontSize:13, fontWeight:600, zIndex:1000, flexShrink:0 }}>
      <span>👁 Impersonating: <strong>{user?.name}</strong> ({user?.email}) — {user?.role}</span>
      <button type="button" title="Stop impersonating" onClick={stopImpersonating}
        style={{ background:'rgba(255,255,255,0.2)', border:'1px solid rgba(255,255,255,0.4)', color:'#fff', borderRadius:6, padding:'4px 14px', cursor:'pointer', fontWeight:700, fontSize:12, fontFamily:'var(--font)' }}>
        Exit Impersonation
      </button>
    </div>
  );
};

/* ── Customer bottom nav ── */
const CustomerBottomNav: React.FC = () => {
  const location = useLocation();
  const tabs: { path: string; icon: IconName; label: string }[] = [
    { path: '/',                  icon: 'home',       label: 'Home'     },
    { path: '/billing',           icon: 'invoice',    label: 'Invoices' },
    { path: '/quotations',        icon: 'clipboard',  label: 'Quotes'   },
    { path: '/support/tickets',   icon: 'headphones', label: 'Support'  },
    { path: '/profile',           icon: 'user',       label: 'Profile'  },
  ];
  return (
    <nav style={{
      position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 200,
      background: 'var(--white)', borderTop: '1px solid var(--border)',
      display: 'flex', padding: '6px 0 env(safe-area-inset-bottom, 6px)',
    }}>
      {tabs.map(t => {
        const active = t.path === '/'
          ? location.pathname === '/'
          : location.pathname.startsWith(t.path);
        return (
          <Link key={t.path} to={t.path} title={t.label}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 0', fontFamily: 'var(--font)', textDecoration: 'none',
            }}>
            <Icon name={t.icon} size={18} color={active ? 'var(--teal)' : 'var(--ink3)'} />
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? 'var(--teal)' : 'var(--ink3)' }}>
              {t.label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
};

/* ── Customer portal shell ── */
const CustomerShell: React.FC = () => {
  const { user, logout } = useAuth();
  const branding = useBranding();
  
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <ImpersonationBanner />
      {/* Branded top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: branding.accentColor || '#E8521A', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px', flexShrink: 0,
        boxShadow: `0 2px 12px ${branding.accentColor || '#E8521A'}50`,
      }}>
        {branding.logoDark ? (
          <img src={branding.logoDark} alt={branding.platformName} style={{ height: 30, objectFit: 'contain' }} />
        ) : (
          <div style={{ fontSize: 18, fontWeight: 800 }}>{branding.platformName}</div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link to="/profile" title="Profile"
            style={{
              background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.3)',
              borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', color: '#fff',
              fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font)', textDecoration: 'none', boxSizing: 'border-box',
            }}>
            {user?.name?.[0] ?? '?'}
          </Link>
          <button type="button" title="Sign out" onClick={logout}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font)', padding: '4px 0' }}>
            Sign out
          </button>
        </div>
      </div>
      {/* Page content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        <Routes>
          <Route path="/"                element={<CustomerDashboard />} />
          <Route path="/billing"         element={<CustomerInvoices />} />
          <Route path="/quotations"      element={<CustomerQuotations />} />
          <Route path="/documents"       element={<FileManager />} />
          <Route path="/support/tickets" element={<CustomerSupport />} />
          <Route path="/support"         element={<CustomerSupport />} />
          <Route path="/chat"            element={<Chat />} />
          <Route path="/profile"         element={<UserProfile />} />
          <Route path="/clearance/:id"   element={<ShipmentDetail />} />
          <Route path="comply"      element={<CompliancePage />} />
          <Route path="penalty"     element={<PenaltyPage />} />
          <Route path="carbon-credits" element={<CarbonCreditsPage />} />
          <Route path="*"           element={<Navigate to="overview" replace />} />
        </Routes>
      </main>
      <CustomerBottomNav />
    </div>
  );
};

/* ── Main app shell ── */
const AppContent: React.FC = () => {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const isHub = pathname === '/';

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <div className="app-loading-spinner" />
          <div className="app-loading-label">Loading Hudumika ClearOS…</div>
        </div>
      </div>
    );
  }

  if (!user) return (
    <Routes>
      <Route path="/signup"               element={<OnboardingWizard />} />
      <Route path="/auth/register"        element={<Navigate to="/signup" replace />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/reset-password"  element={<ResetPassword />} />
      <Route path="/accept-invite"        element={<AcceptInvite />} />
      <Route path="/auth/verify-email"    element={<VerifyEmail />} />
      <Route path="/terms"                element={<TermsOfService />} />
      <Route path="/privacy"              element={<PrivacyPolicy />} />
      <Route path="/support-ticket"       element={<SupportTicket />} />
      <Route path="/track/shared/:token"  element={<TrackingShared />} />
      <Route path="/r/:token"             element={<SharedLandedCostReport />} />
      <Route path="/why-complyos"         element={<ComplyOSSales />} />
      <Route path="/site/:tenantSlug"             element={<OneSitePublic />} />
      <Route path="/site/:tenantSlug/:pageSlug"   element={<OneSitePublic />} />
      <Route path="*"                     element={<Login />} />
    </Routes>
  );

  /* ── Customer portal — dedicated mobile shell ── */
  if (user.role === 'CUSTOMER') {
    return <CustomerShell />;
  }

  return (
    <div className="app-container">
      <ImpersonationBanner />
      <main className={`main-content${isHub ? ' main-content-hub' : ''}`}>
        <Routes>
          {/* Hub — WorkspaceHome with shared search state */}
          <Route path="/" element={<HubPage />} />

          {/* Public legal pages — self-contained layout */}
          <Route path="/terms"          element={<TermsOfService />} />
          <Route path="/privacy"        element={<PrivacyPolicy />} />
          <Route path="/support-ticket" element={<SupportTicket />} />
          <Route path="/why-complyos"   element={<ComplyOSSales />} />
          <Route path="/site/:tenantSlug"           element={<OneSitePublic />} />
          <Route path="/site/:tenantSlug/:pageSlug" element={<OneSitePublic />} />
          <Route path="/subscription" element={<Navigate to="/workspace/billing" replace />} />

          {/* Full-viewport apps — no page-layout (manage their own height/overflow) */}
          <Route path="/ops" element={<RequireRoles roles={OPS_ROLES}><CommandCenter /></RequireRoles>} />

          {/* ── App shells (prefix-based routes) ── */}
          <Route path="/clearos/*"  element={<ClearOSShell />} />
          <Route path="/finance/*"  element={<RequireRoles roles={FIN_ROLES}><FinOpsShell /></RequireRoles>} />
          <Route path="/finops/*"   element={<RequireRoles roles={FIN_ROLES}><FinOpsShell /></RequireRoles>} />
          <Route path="/nexushr/*"    element={<NexusHRShell />} />
          {/* /onepi is retired as the HR prefix — it is being freed for the
              separate KPI-management app. Bookmarks, printed reports and the
              links inside already-sent notifications still point here, so the
              whole subtree redirects with its path preserved. */}
          <Route path="/onepi/*"    element={<OnepiToNexusHR />} />
          <Route path="/bliss/*"    element={<BlissShell />} />
          <Route path="/cloud/*"    element={<CloudShell />} />
          <Route path="/workspace/*"element={<AdminShell />} />
          <Route path="/admin/*"    element={<SuperAdminShell />} />
          <Route path="/ai/*"       element={<AIShell />} />
          <Route path="/complyos/*" element={<ComplyOSShell />} />
          <Route path="/seal/*"     element={<SealShell />} />
          <Route path="/inventory/*" element={<InventoryShell />} />
          <Route path="/email/*"    element={<EmailShell />} />
          <Route path="/crm/*"      element={<CRMShell />} />
          <Route path="/contacts/*"  element={<ContactsShell />} />
          <Route path="/store/*"     element={<StoreShell />} />
          <Route path="/oneid/*"     element={<OneIdShell />} />
          <Route path="/tracking/*"  element={<TrackingShell />} />
          <Route path="/cargotracker/*" element={<CargoTrackerShell />} />
          <Route path="/cms/*"       element={<CMSShell />} />
          <Route path="/studio/*"    element={<StudioShell />} />

          {/* Legacy redirects for old routes */}
          <Route path="/billing"         element={<Navigate to="/finance/invoices"        replace />} />
          <Route path="/quotations"      element={<Navigate to="/finance/quotations"      replace />} />
          <Route path="/purchase-orders" element={<Navigate to="/finance/purchase-orders" replace />} />
          <Route path="/expenses"        element={<Navigate to="/finance/expenses"        replace />} />
          <Route path="/accounts"        element={<Navigate to="/finance/accounts"        replace />} />
          <Route path="/customers"       element={<Navigate to="/crm/customers"           replace />} />
          <Route path="/customers/*"     element={<Navigate to="/crm/customers"           replace />} />
          <Route path="/leads"           element={<Navigate to="/crm/leads"               replace />} />
          <Route path="/leads/:id"       element={<Navigate to="/crm/leads"               replace />} />
          <Route path="/tracker"         element={<Navigate to="/cargotracker"            replace />} />
          <Route path="/demurrage/*"     element={<Navigate to="/cargotracker/demurrage"  replace />} />

          {/* ── Legacy redirects for old admin / settings paths ── */}
          <Route path="/settings"          element={<Navigate to="/workspace/settings" replace />} />
          <Route path="/system-update"     element={<Navigate to="/admin"              replace />} />
          <Route path="/tenant-management" element={<Navigate to="/admin"              replace />} />
          <Route path="/superadmin"        element={<Navigate to="/admin"              replace />} />
          <Route path="/clearos/trade-wizard" element={<Navigate to="/clearos/compliance/advanced" replace />} />
          <Route path="/reports"           element={<Navigate to="/workspace/reports"  replace />} />
          <Route path="/utilities"         element={<Navigate to="/workspace/utilities" replace />} />
          <Route path="/setup"             element={<Navigate to="/workspace/settings" replace />} />

          {/* ── CRM / Sales / Finance shortcuts → canonical shell routes ── */}
          <Route path="/customers/overview"    element={<Navigate to="/crm/overview"              replace />} />
          <Route path="/customers/bulk-upload" element={<Navigate to="/crm/customers/bulk-upload" replace />} />
          <Route path="/sales"                 element={<Navigate to="/crm/sales"                 replace />} />
          <Route path="/delivery-notes"        element={<Navigate to="/finance/delivery-notes"    replace />} />
          <Route path="/accounts/ledger"           element={<Navigate to="/finance/ledger"           replace />} />
          <Route path="/accounts/trial-balance"    element={<Navigate to="/finance/trial-balance"    replace />} />
          <Route path="/accounts/balance-sheet"    element={<Navigate to="/finance/balance-sheet"    replace />} />
          <Route path="/accounts/profit-loss"      element={<Navigate to="/finance/profit-loss"      replace />} />
          <Route path="/accounts/aged-receivables" element={<Navigate to="/finance/aged-receivables" replace />} />
          <Route path="/accounts/aged-payables"    element={<Navigate to="/finance/aged-payables"    replace />} />

          {/* ── Tool / staff pages — AppHeader shell, no sidebar ── */}
          <Route element={<NavShell />}>
            {/* Legacy CFA routes */}
            <Route path="/shipments"     element={<RequireRoles roles={[...OPS_ROLES, 'FINANCE']}><ShipmentsList /></RequireRoles>} />
            <Route path="/clearance/:id" element={<ClearanceRedirect />} />
            <Route path="/clearance/:id/edit" element={<ClearanceRedirect edit />} />
            <Route path="/customs-tools" element={<RequireRoles roles={OPS_ROLES}><LandedCostPage /></RequireRoles>} />
            <Route path="/compliance"    element={<RequireRoles roles={OPS_ROLES}><CompliancePage /></RequireRoles>} />
            <Route path="/penalty"       element={<RequireRoles roles={OPS_ROLES}><PenaltyPage /></RequireRoles>} />

            {/* Tools — all staff */}
            <Route path="/documents"        element={<FileManager />} />
            <Route path="/support/overview" element={<SupportOverview />} />
            <Route path="/support/tickets"  element={<Support />} />
            <Route path="/support"          element={<SupportOverview />} />
            <Route path="/escalations"      element={<RequireRoles roles={[...MGMT_ROLES, 'SENIOR']}><Escalations /></RequireRoles>} />
            <Route path="/chat"             element={<Chat />} />
            <Route path="/profile"          element={<UserProfile />} />
            <Route path="/tools/overview"   element={<ToolsOverview />} />
            <Route path="/carbon-credits"   element={<CarbonCreditsPage />} />

          </Route>

          {/* ── App shells (prefix-based routes) that use WorkspaceApp ── */}
          <Route path="/calendar/*"       element={<CalendarShell />} />
          <Route path="/tasks/*"          element={<TasksShell />} />

          {/* Legacy HRM routes — superseded by the OnePI shell (/nexushr/*), kept as redirects for old links/bookmarks */}
          <Route path="/hrm"           element={<Navigate to="/nexushr" replace />} />
          <Route path="/hrm/staff/:id" element={<HrmStaffRedirect />} />
          {['employees','roles','permissions','delete-requests','departments','designations','teams','invitations',
            'staff-directory','activity-logs','login-history','device-management','leaves','attendance','shifts',
            'holidays','payroll','announcements','org-chart'].map(seg => (
            <Route key={seg} path={`/hrm/${seg}`} element={<Navigate to={`/nexushr/${seg}`} replace />} />
          ))}

          <Route path="/track/shared/:token" element={<TrackingShared />} />
          <Route path="/r/:token" element={<SharedLandedCostReport />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <CheckInWidget />
    </div>
  );
};

const App: React.FC = () => (
  <>
    <BrowserRouter>
      <SeoAnalyticsProvider>
        <AuthProvider>
          <ClockInProvider>
            <WorkspaceProvider>
              <DesignSystemProvider>
                {/* Every route gets a derived title; pages calling usePageSEO
                    override it. Mounted here so new routes are covered the
                    moment they exist, rather than when someone remembers. */}
                <AutoSEO />
                <AppContent />
              </DesignSystemProvider>
            </WorkspaceProvider>
          </ClockInProvider>
        </AuthProvider>
      </SeoAnalyticsProvider>
    </BrowserRouter>
    <AlertHost />
    <ConfirmHost />
  </>
);

export default App;

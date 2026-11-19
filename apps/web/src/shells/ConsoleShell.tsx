/**
 * Unified staff console — /console/*
 *
 * One entry point for platform staff. Who may enter, what the sidebar shows,
 * where /console lands and which routes open are all derived from the
 * caller's live staff grants (GET /v1/staff/me), never from the workspace
 * role. The API enforces the same rules on every request.
 */
import React from 'react';
import { Routes, Route, Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { STAFF_SECTIONS, STAFF_TOOLS, safeStaffReturnPath } from '@hudumika/types';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { PageLoading } from '../components/ui/spinner.js';
import { Icon, type IconName } from '../components/Icon.js';
import { AccessDenied, AccessSessionBanner, ScopeBanner, SectionGuard, StaffProvider, ToolGuard, useStaff } from '../pages/console/console-shared.js';
import '../pages/console/console.css';

const Overview = React.lazy(() => import('../pages/console/ConsoleOverview.js').then(m => ({ default: m.ConsoleOverview })));
const MyWork = React.lazy(() => import('../pages/console/ConsoleCases.js').then(m => ({ default: m.ConsoleMyWork })));
const Cases = React.lazy(() => import('../pages/console/ConsoleCases.js').then(m => ({ default: m.ConsoleCases })));
const CaseDetail = React.lazy(() => import('../pages/console/ConsoleCaseDetail.js').then(m => ({ default: m.ConsoleCaseDetail })));
const Customers = React.lazy(() => import('../pages/console/ConsoleCustomers.js').then(m => ({ default: m.ConsoleCustomers })));
const CustomerProfile = React.lazy(() => import('../pages/console/ConsoleCustomers.js').then(m => ({ default: m.ConsoleCustomerProfile })));
const Products = React.lazy(() => import('../pages/console/ConsoleProducts.js').then(m => ({ default: m.ConsoleProducts })));
const ProductDetail = React.lazy(() => import('../pages/console/ConsoleProducts.js').then(m => ({ default: m.ConsoleProductDetail })));
const Teams = React.lazy(() => import('../pages/console/ConsoleTeams.js').then(m => ({ default: m.ConsoleTeams })));
const Security = React.lazy(() => import('../pages/console/ConsoleAdmin.js').then(m => ({ default: m.ConsoleSecurity })));
const Billing = React.lazy(() => import('../pages/console/ConsoleAdmin.js').then(m => ({ default: m.ConsoleBilling })));
const Audit = React.lazy(() => import('../pages/console/ConsoleAdmin.js').then(m => ({ default: m.ConsoleAudit })));
const Settings = React.lazy(() => import('../pages/console/ConsoleAdmin.js').then(m => ({ default: m.ConsoleSettings })));
const AccessNew = React.lazy(() => import('../pages/console/ConsoleAccess.js').then(m => ({ default: m.ConsoleAccessNew })));
const AccessRecords = React.lazy(() => import('../pages/console/ConsoleAccess.js').then(m => ({ default: m.ConsoleAccessRecords })));

// Former /admin pages, mounted unchanged inside the console. Each is guarded
// by its STAFF_TOOLS entry (and by its section), and the API enforces the
// same rule in services/platform-admin-access.ts.
const lazyNamed = (load: () => Promise<any>, name: string) => React.lazy(() => load().then(m => ({ default: m[name] })));
const loadSA = () => import('../pages/SuperAdmin.js');
const TOOL_ELEMENTS: Record<string, React.LazyExoticComponent<React.ComponentType<any>>> = {
  'platform-dashboard': lazyNamed(loadSA, 'DashboardView'),
  companies: lazyNamed(loadSA, 'CompaniesView'),
  subscriptions: lazyNamed(loadSA, 'SubscriptionsView'),
  packages: lazyNamed(loadSA, 'PackagesView'),
  transactions: lazyNamed(loadSA, 'TransactionsView'),
  finance: lazyNamed(loadSA, 'FinanceView'),
  domains: lazyNamed(loadSA, 'DomainsView'),
  activity: lazyNamed(loadSA, 'ActivityView'),
  'platform-settings': lazyNamed(loadSA, 'SettingsView'),
  'app-status': lazyNamed(loadSA, 'AppStatusView'),
  analytics: lazyNamed(() => import('../pages/SuperAdminAnalytics.js'), 'SuperAdminAnalytics'),
  kyb: lazyNamed(() => import('../pages/SuperAdminKyb.js'), 'SuperAdminKyb'),
  referrals: lazyNamed(() => import('../pages/SuperAdminReferrals.js'), 'SuperAdminReferrals'),
  announcements: lazyNamed(() => import('../pages/SuperAdminAnnouncements.js'), 'SuperAdminAnnouncements'),
  'design-system': lazyNamed(() => import('../pages/DesignSystemView.js'), 'DesignSystemView'),
  seo: lazyNamed(() => import('../pages/SeoAnalyticsView.js'), 'SeoAnalyticsView'),
  'cms-pages': lazyNamed(() => import('../pages/AdminCMSPages.js'), 'AdminCMSPages'),
  'sms-gateways': lazyNamed(() => import('../pages/sms/SmsGateways.js'), 'SmsGateways'),
  'signing-cert': lazyNamed(() => import('../pages/SuperAdminSigningCert.js'), 'SuperAdminSigningCert'),
};

/** /console: a safe return destination if one was given and is allowed, else the resolved home. */
function Landing() {
  const { me } = useStaff();
  const [params] = useSearchParams();
  if (!me) return null;
  const ret = safeStaffReturnPath(params.get('returnTo'), me.permissions, me.tools);
  if (ret) return <Navigate to={ret} replace />;
  if (me.homePath) return <Navigate to={me.homePath} replace />;
  return (
    <div className="console-state" role="status">
      <span className="console-empty-icon" style={{ width: 52, height: 52 }}><Icon name="userCheck" size={24} color="var(--teal)" /></span>
      <h1 className="console-panel-title" style={{ fontSize: 'var(--text-lg, 18px)' }}>Your staff access is being set up</h1>
      <p className="console-empty-text" style={{ margin: 0 }}>You are a staff member, but no role or assignment gives you a console section yet. An administrator needs to grant you a role.</p>
    </div>
  );
}

function g(id: string, el: React.ReactNode) { return <SectionGuard id={id}>{el}</SectionGuard>; }

function ConsoleBody() {
  const { me, loading, error, notStaff, reload } = useStaff();
  const location = useLocation();
  if (loading) return <PageLoading label="Checking your staff access…" />;
  if (notStaff) return <div className="console-state"><AccessDenied what="the staff console" /></div>;
  if (error || !me) return (
    <div className="console-state" role="alert">
      <Icon name="alertCircle" size={22} color="var(--red)" />
      <div>{error ?? 'Could not load your staff access.'}</div>
      <button className="console-link-btn" onClick={() => reload()}>Try again</button>
    </div>
  );
  const known = STAFF_SECTIONS.some(s => location.pathname === s.path || location.pathname.startsWith(`${s.path}/`)) || location.pathname.startsWith('/console/access') || location.pathname === '/console' || location.pathname === '/console/';
  return (
    <>
      <ScopeBanner />
      <AccessSessionBanner />
      <React.Suspense fallback={<PageLoading />}>
        <Routes>
          <Route index element={<Landing />} />
          <Route element={<PageLayout />}>
            <Route path="overview" element={g('overview', <Overview />)} />
            <Route path="my-work" element={g('my-work', <MyWork />)} />
            <Route path="customers" element={g('customers', <Customers />)} />
            <Route path="customers/:id" element={g('customers', <CustomerProfile />)} />
            <Route path="products" element={g('products', <Products />)} />
            <Route path="products/:app" element={g('products', <ProductDetail />)} />
            <Route path="teams" element={g('teams', <Teams />)} />
            <Route path="cases" element={g('cases', <Cases />)} />
            <Route path="cases/:id" element={g('cases', <CaseDetail />)} />
            <Route path="security" element={g('security', <Security />)} />
            <Route path="billing" element={g('billing', <Billing />)} />
            <Route path="audit" element={g('audit', <Audit />)} />
            <Route path="settings" element={g('settings', <Settings />)} />
            {STAFF_TOOLS.map(t => {
              const El = TOOL_ELEMENTS[t.id];
              return <Route key={t.id} path={`${t.path.replace('/console/', '')}/*`} element={g(t.section, <ToolGuard id={t.id}><El /></ToolGuard>)} />;
            })}
            <Route path="access/new" element={<AccessNew />} />
            <Route path="access/:id" element={<AccessRecords />} />
          </Route>
          <Route path="*" element={known ? <Navigate to="/console" replace /> : <div className="console-state"><AccessDenied what="that page" /></div>} />
        </Routes>
      </React.Suspense>
    </>
  );
}

/** Label of a section's own page when the section also lists tools. */
const SECTION_HOME_LABEL: Record<string, string> = {
  overview: 'Operations overview', customers: 'Customer profiles', products: 'Product health',
  billing: 'Billing overview', audit: 'Audit history', settings: 'Console settings',
};

function ConsoleNav() {
  const { me } = useStaff();
  // Sections and their tools come from the same tables the route guards use.
  const sections: SidebarSection[] = [{
    items: STAFF_SECTIONS.filter(s => me?.sections.includes(s.id)).map(s => {
      const tools = STAFF_TOOLS.filter(t => t.section === s.id && me?.tools.includes(t.id));
      const item = { label: s.label, icon: s.icon as IconName, path: s.path };
      return tools.length
        ? { ...item, children: [{ ...item, label: SECTION_HOME_LABEL[s.id] ?? s.label, exact: true }, ...tools.map(t => ({ label: t.label, icon: t.icon as IconName, path: t.path }))] }
        : item;
    }),
  }];
  if (me?.isSuperAdmin) sections.push({ title: 'ENGINEERING', items: [{ label: 'Lens', icon: 'activity', path: '/lens' }, { label: 'Design System app', icon: 'layers', path: '/design-system' }] });
  return <AppSidebar appId="admin" sections={sections} loading={!me} />;
}

export function ConsoleShell() {
  return (
    <WorkspaceApp appId="admin">
      <StaffProvider>
        <div className="app-shell">
          <ConsoleNav />
          <div className="app-main">
            <AppHeader />
            <div className="app-shell-content console-content"><ConsoleBody /></div>
          </div>
        </div>
      </StaffProvider>
    </WorkspaceApp>
  );
}

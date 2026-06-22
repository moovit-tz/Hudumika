import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth.jsx';
import { HorizontalNav } from './components/HorizontalNav.jsx';
import { TopBar } from './components/TopBar.jsx';
import { useIsMobile } from './hooks/useIsMobile.js';
import { Login }           from './pages/Login.jsx';
import { Register }        from './pages/Register.jsx';
import { ForgotPassword }  from './pages/ForgotPassword.jsx';
import { ResetPassword }   from './pages/ResetPassword.jsx';
import { VerifyEmail }     from './pages/VerifyEmail.jsx';

import { CommandCenter }    from './pages/CommandCenter.jsx';
import { DashboardHome }    from './pages/DashboardHome.jsx';
import { DeliveryNotes }   from './pages/DeliveryNotes.jsx';
import { ShipmentsList }    from './pages/ShipmentsList.jsx';
import { FinanceDashboard } from './pages/FinanceDashboard.jsx';
import { PurchaseOrders }   from './pages/PurchaseOrders.jsx';
import { Demurrage }        from './pages/Demurrage.jsx';
import { Quotations }       from './pages/Quotations.jsx';
import { Billing }          from './pages/Billing.jsx';
import { Settings }         from './pages/Settings.jsx';
import { SuperAdmin }       from './pages/SuperAdmin.jsx';
import { TenantManagement } from './pages/TenantManagement.jsx';

import { UserProfile }   from './pages/UserProfile.jsx';
import { Subscription }  from './pages/Subscription.jsx';
import { Customers }  from './pages/Customers.jsx';
import { Sales }      from './pages/Sales.jsx';
import { Expenses }   from './pages/Expenses.jsx';
import { Contracts }  from './pages/Contracts.jsx';
import { Support }         from './pages/Support.jsx';
import { SupportOverview } from './pages/SupportOverview.jsx';
import { Leads }       from './pages/Leads.jsx';
import { LeadDetail }  from './pages/LeadDetail.jsx';
import { FileManager }        from './pages/FileManager.jsx';
import { SystemUpdate }       from './pages/SystemUpdate.jsx';
import { CustomerOverview }   from './pages/CustomerOverview.jsx';
import { CustomerBulkUpload } from './pages/CustomerBulkUpload.jsx';
import { Reports }             from './pages/Reports.jsx';
import { Utilities }           from './pages/Utilities.jsx';
import { Setup }               from './pages/Setup.jsx';
import { FinancePlaceholder }  from './pages/FinancePlaceholder.jsx';
import { AccountsQuery }        from './pages/AccountsQuery.jsx';
import { PurchasesOverview }  from './pages/PurchasesOverview.jsx';
import { ProductsServices }    from './pages/ProductsServices.jsx';
import { Suppliers }           from './pages/Suppliers.jsx';
import { Bills }               from './pages/Bills.jsx';
import { HRM }                from './pages/HRM.jsx';
import { StaffDetail }        from './pages/StaffDetail.jsx';
import { CheckInWidget }      from './components/CheckInWidget.jsx';
import { ClockInProvider }    from './contexts/ClockInContext.jsx';
import { Chat }               from './pages/Chat.jsx';
import { ShipmentBoard }      from './pages/ShipmentBoard.jsx';
import { ShipmentDetail }     from './pages/ShipmentDetail.jsx';
import { FinanceSalesReport }      from './pages/FinanceSalesReport.jsx';
import { FinanceExpensesReport }   from './pages/FinanceExpensesReport.jsx';
import { FinanceIncomeVsExpenses } from './pages/FinanceIncomeVsExpenses.jsx';
import { FinanceTaxReport }        from './pages/FinanceTaxReport.jsx';
import { FinanceCashFlow }         from './pages/FinanceCashFlow.jsx';
import { FinanceShell }            from './pages/FinanceShell.jsx';
import { FinanceAgedReceivables }  from './pages/FinanceAgedReceivables.jsx';
import { FinanceAgedPayables }     from './pages/FinanceAgedPayables.jsx';
import { FinanceBalanceSheet }     from './pages/FinanceBalanceSheet.jsx';
import { FinanceProfitLoss }       from './pages/FinanceProfitLoss.jsx';
import { FinanceLedger }           from './pages/FinanceLedger.jsx';
import { FinanceTrialBalance }     from './pages/FinanceTrialBalance.jsx';
import { FinancePayments }         from './pages/FinancePayments.jsx';
import { FinanceReportingMaster }  from './pages/FinanceReportingMaster.jsx';
import { Escalations }             from './pages/Escalations.jsx';
import { ToolsOverview }           from './pages/ToolsOverview.jsx';
import { CustomerDashboard }       from './pages/CustomerDashboard.jsx';
import { CustomerSupport }         from './pages/CustomerSupport.jsx';
import { TermsOfService }          from './pages/TermsOfService.jsx';
import { PrivacyPolicy }           from './pages/PrivacyPolicy.jsx';

/* ── Inner page layout — boxed centered wrapper ── */
const PageLayout: React.FC = () => (
  <div className="page-layout">
    <Outlet />
    <footer className="page-footer">
      <span className="page-footer-copy">© 2026 ClearOS · Moovit Logistics. All rights reserved.</span>
      <nav className="page-footer-links">
        <Link to="/terms" className="page-footer-link">Terms of Service</Link>
        <Link to="/privacy" className="page-footer-link">Privacy Policy</Link>
        <Link to="/support/tickets" className="page-footer-link">Support</Link>
      </nav>
    </footer>
  </div>
);

/* ── Route guard: SUPER_ADMIN only ── */
function RequireSuperAdmin({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'SUPER_ADMIN') return <Navigate to="/" replace />;
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
  const navigate = useNavigate();
  const location = useLocation();
  const tabs = [
    { path: '/',                  icon: '🏠', label: 'Home'     },
    { path: '/billing',           icon: '🧾', label: 'Invoices' },
    { path: '/quotations',        icon: '📋', label: 'Quotes'   },
    { path: '/support/tickets',   icon: '🎧', label: 'Support'  },
    { path: '/profile',           icon: '👤', label: 'Profile'  },
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
          <button key={t.path} type="button" title={t.label}
            onClick={() => navigate(t.path)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, background: 'none', border: 'none', cursor: 'pointer',
              padding: '6px 0', fontFamily: 'var(--font)',
            }}>
            <span style={{ fontSize: 18, lineHeight: 1 }}>{t.icon}</span>
            <span style={{ fontSize: 10, fontWeight: active ? 700 : 400, color: active ? 'var(--teal)' : 'var(--ink3)' }}>
              {t.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

/* ── Customer portal shell ── */
const CustomerShell: React.FC = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--bg)', fontFamily: 'var(--font)' }}>
      <ImpersonationBanner />
      {/* Branded top bar */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--teal)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 18px', flexShrink: 0,
        boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
      }}>
        <img src="/logo-dark.png" alt="Moovit ClearOS" style={{ height: 30, objectFit: 'contain' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button type="button" title="Profile" onClick={() => navigate('/profile')}
            style={{
              background: 'rgba(255,255,255,0.2)', border: '1.5px solid rgba(255,255,255,0.3)',
              borderRadius: '50%', width: 36, height: 36, cursor: 'pointer', color: '#fff',
              fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: 'var(--font)',
            }}>
            {user?.name?.[0] ?? '?'}
          </button>
          <button type="button" title="Sign out" onClick={logout}
            style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.8)', cursor: 'pointer', fontSize: 14, fontFamily: 'var(--font)', padding: '4px 0' }}>
            Sign out
          </button>
        </div>
      </div>
      {/* Page content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 80 }}>
        <Routes>
          <Route path="/"                   element={<CustomerDashboard />} />
          <Route path="/billing"            element={<Billing />} />
          <Route path="/quotations"         element={<Quotations />} />
          <Route path="/documents"          element={<FileManager />} />
          <Route path="/support/tickets"    element={<CustomerSupport />} />
          <Route path="/support"            element={<CustomerSupport />} />
          <Route path="/chat"               element={<Chat />} />
          <Route path="/profile"            element={<UserProfile />} />
          <Route path="/clearance/:id"      element={<ShipmentDetail />} />
          <Route path="*"                   element={<Navigate to="/" replace />} />
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
  const isMobile = useIsMobile();
  const [navOpen, setNavOpen] = useState(true);
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );
  const [isExpanded, setIsExpanded] = useState(() => {
    const saved = localStorage.getItem('layout-expanded') === 'true';
    if (saved) document.documentElement.setAttribute('data-expanded', 'true');
    return saved;
  });

  function toggleExpand() {
    const next = !isExpanded;
    setIsExpanded(next);
    if (next) {
      document.documentElement.setAttribute('data-expanded', 'true');
      localStorage.setItem('layout-expanded', 'true');
    } else {
      document.documentElement.removeAttribute('data-expanded');
      localStorage.setItem('layout-expanded', '');
    }
  }

  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-loading-inner">
          <div className="app-loading-spinner" />
          <div className="app-loading-label">Loading Moovit ClearOS…</div>
        </div>
      </div>
    );
  }

  if (!user) return (
    <Routes>
      <Route path="/auth/register"        element={<Register />} />
      <Route path="/auth/forgot-password" element={<ForgotPassword />} />
      <Route path="/auth/reset-password"  element={<ResetPassword />} />
      <Route path="/auth/verify-email"    element={<VerifyEmail />} />
      <Route path="/terms"                element={<TermsOfService />} />
      <Route path="/privacy"              element={<PrivacyPolicy />} />
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
        <TopBar
          navCollapsed={false}
          onToggleNav={() => setNavOpen(o => !o)}
          onMobileNavOpen={() => setNavOpen(o => !o)}
          isDark={isDark}
          onToggleTheme={toggleTheme}
          isExpanded={isExpanded}
          onToggleExpand={toggleExpand}
        />
        {navOpen && <HorizontalNav />}
        <main className={`main-content${isHub ? ' main-content-hub' : ''}`}>
            <Routes>
              {/* Hub — no page-layout wrapper */}
              <Route path="/" element={<DashboardHome />} />

              {/* Public legal pages — self-contained layout */}
              <Route path="/terms"   element={<TermsOfService />} />
              <Route path="/privacy" element={<PrivacyPolicy />} />

              {/* Full-viewport apps — no page-layout (manage their own height/overflow) */}
              <Route path="/ops" element={<CommandCenter />} />

              {/* Finance Shell — full-viewport, owns sidebar + tab bar (no page-layout wrapper) */}
              <Route path="/finance/*" element={<FinanceShell />} />
              {/* Redirect old standalone finance routes into the shell */}
              <Route path="/billing"         element={<Navigate to="/finance/invoices"        replace />} />
              <Route path="/quotations"      element={<Navigate to="/finance/quotations"      replace />} />
              <Route path="/purchase-orders" element={<Navigate to="/finance/purchase-orders" replace />} />
              <Route path="/expenses"        element={<Navigate to="/finance/expenses"        replace />} />
              <Route path="/accounts"        element={<Navigate to="/finance/accounts"        replace />} />

              {/* All inner pages — boxed centered layout */}
              <Route element={<PageLayout />}>
                {/* CFA / Ops */}
                <Route path="/shipments"     element={<ShipmentsList />} />
                <Route path="/clearance/:id" element={<ShipmentDetail />} />
                <Route path="/demurrage"     element={<Demurrage />} />

                {/* CRM & Sales */}
                <Route path="/customers/overview"     element={<CustomerOverview />} />
                <Route path="/customers/bulk-upload"  element={<CustomerBulkUpload />} />
                <Route path="/customers"              element={<Customers />} />
                <Route path="/sales"            element={<Sales />} />
                <Route path="/delivery-notes"   element={<DeliveryNotes />} />
                <Route path="/leads"      element={<Leads />} />
                <Route path="/leads/:id"  element={<LeadDetail />} />

                {/* Tools */}
                <Route path="/documents"          element={<FileManager />} />
                <Route path="/support/overview"   element={<SupportOverview />} />
                <Route path="/support/tickets"    element={<Support />} />
                <Route path="/support"            element={<SupportOverview />} />
                <Route path="/escalations"        element={<Escalations />} />
                <Route path="/chat"               element={<Chat />} />

                {/* Contracts (not in shell yet) */}
                <Route path="/contracts" element={<Contracts />} />

                {/* Accounts sub-pages still accessible via direct URL */}
                <Route path="/accounts/ledger"           element={<FinanceLedger />} />
                <Route path="/accounts/trial-balance"    element={<FinanceTrialBalance />} />
                <Route path="/accounts/balance-sheet"    element={<FinanceBalanceSheet />} />
                <Route path="/accounts/profit-loss"      element={<FinanceProfitLoss />} />
                <Route path="/accounts/aged-receivables" element={<FinanceAgedReceivables />} />
                <Route path="/accounts/aged-payables"    element={<FinanceAgedPayables />} />

                {/* Reports & Setup */}
                <Route path="/reports"    element={<Reports />} />
                <Route path="/utilities"  element={<Utilities />} />
                <Route path="/setup"      element={<Setup />} />

                {/* Profile & Account */}
                <Route path="/profile"       element={<UserProfile />} />
                <Route path="/subscription"  element={<Subscription />} />

                {/* Tools Overview */}
                <Route path="/tools/overview" element={<ToolsOverview />} />

                {/* HRM */}
                <Route path="/hrm"                   element={<HRM />} />
                <Route path="/hrm/employees"         element={<HRM />} />
                <Route path="/hrm/roles"             element={<HRM />} />
                <Route path="/hrm/delete-requests"   element={<HRM />} />
                <Route path="/hrm/departments"       element={<HRM />} />
                <Route path="/hrm/teams"             element={<HRM />} />
                <Route path="/hrm/invitations"       element={<HRM />} />
                <Route path="/hrm/staff-directory"   element={<HRM />} />
                <Route path="/hrm/staff/:id"         element={<StaffDetail />} />
                <Route path="/hrm/activity-logs"     element={<HRM />} />
                <Route path="/hrm/login-history"     element={<HRM />} />
                <Route path="/hrm/device-management" element={<HRM />} />
                <Route path="/hrm/leaves"            element={<HRM />} />
                <Route path="/hrm/attendance"        element={<HRM />} />
                <Route path="/hrm/shifts"            element={<HRM />} />
                <Route path="/hrm/holidays"          element={<HRM />} />
                <Route path="/hrm/designations"      element={<HRM />} />
                <Route path="/hrm/payroll"           element={<HRM />} />
                <Route path="/hrm/announcements"     element={<HRM />} />
                <Route path="/hrm/org-chart"         element={<HRM />} />
                <Route path="/hrm/permissions"       element={<HRM />} />

                <Route path="/settings" element={<Settings />} />

                {/* Admin */}
                <Route path="/tenant-management" element={<RequireSuperAdmin><TenantManagement /></RequireSuperAdmin>} />
                <Route path="/admin"             element={<RequireSuperAdmin><SuperAdmin /></RequireSuperAdmin>} />
                <Route path="/system-update"     element={<RequireSuperAdmin><SystemUpdate /></RequireSuperAdmin>} />
              </Route>

              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        <CheckInWidget />
      </div>
  );
};

const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <ClockInProvider>
        <AppContent />
      </ClockInProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;

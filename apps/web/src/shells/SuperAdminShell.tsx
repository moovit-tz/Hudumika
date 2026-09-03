import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { Icon } from '../components/Icon.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import './SuperAdminShell.css';

import {
  DashboardView,
  CompaniesView,
  SubscriptionsView,
  PackagesView,
  TransactionsView,
  FinanceView,
  DomainsView,
  ActivityView,
  SettingsView,
  AppStatusView,
} from '../pages/SuperAdmin.js';
import { DesignSystemView } from '../pages/DesignSystemView.js';
import { SeoAnalyticsView } from '../pages/SeoAnalyticsView.js';
import { AdminCMSPages } from '../pages/AdminCMSPages.js';
import { SuperAdminIssues } from '../pages/SuperAdminIssues.js';
import { SuperAdminReferrals } from '../pages/SuperAdminReferrals.js';
import { SuperAdminAnnouncements } from '../pages/SuperAdminAnnouncements.js';
import { SuperAdminSigningCert } from '../pages/SuperAdminSigningCert.js';
import { SuperAdminKyb } from '../pages/SuperAdminKyb.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard',     icon: 'monitor',    path: '/admin/dashboard'     },
      { label: 'Companies',     icon: 'building',   path: '/admin/companies'     },
      { label: 'Subscriptions', icon: 'creditCard', path: '/admin/subscriptions' },
      { label: 'Packages',      icon: 'package',    path: '/admin/packages'      },
      { label: 'Transactions',  icon: 'receipt',    path: '/admin/transactions'  },
      { label: 'Finance',       icon: 'dollarSign', path: '/admin/finance'       },
      { label: 'Domains',       icon: 'globe',      path: '/admin/domains'       },
      { label: 'Activity Log',  icon: 'clock',      path: '/admin/activity'      },
    ],
  },
  {
    title: 'PLATFORM',
    items: [
      { label: 'Reported Issues',   icon: 'alertCircle', path: '/admin/issues'      },
      { label: 'Business Verification', icon: 'fingerprint', path: '/admin/kyb'    },
      { label: 'Referral Commissions', icon: 'link', path: '/admin/referrals'    },
      { label: 'Announcements',     icon: 'bell',      path: '/admin/announcements' },
      { label: 'App Status',        icon: 'shield',   path: '/admin/app-status'     },
      { label: 'CMS Pages',         icon: 'fileText', path: '/admin/cms-pages'      },
      { label: 'Design System',     icon: 'sliders',  path: '/admin/design-system'  },
      { label: 'SEO & Analytics',   icon: 'trendingUp', path: '/admin/seo'          },
      { label: 'Platform Settings', icon: 'settings', path: '/admin/settings'       },
      { label: 'Signing Certificate', icon: 'lock', path: '/admin/signing-cert'     },
    ],
  },
];

function AdminContent() {
  return (
    <div className="sa-shell-content">
      <div className="sa-shell-banner">
        <Icon name="shield" size={13} color="#ef4444" />
        <span className="sa-shell-banner-label">Super Admin</span>
        <span className="sa-shell-banner-desc">— Platform-wide controls. Changes affect all tenants.</span>
      </div>
      <Routes>
        <Route index element={<Navigate to="dashboard" replace />} />
        <Route element={<PageLayout />}>
          <Route path="dashboard"     element={<DashboardView />} />
          <Route path="companies"     element={<CompaniesView />} />
          <Route path="subscriptions" element={<SubscriptionsView />} />
          <Route path="packages"      element={<PackagesView />} />
          <Route path="transactions"  element={<TransactionsView />} />
          <Route path="finance"       element={<FinanceView />} />
          <Route path="domains"       element={<DomainsView />} />
          <Route path="activity"      element={<ActivityView />} />
          {/* Moved to NexusHR (biometric attendance hardware is a NexusHR-
              domain concept, not a platform-ops one) — kept as a redirect so
              old links/bookmarks still land somewhere real, same convention
              NexusHRShell.tsx itself already uses for its own moved routes. */}
          <Route path="devices"       element={<Navigate to="/nexushr/platform-devices" replace />} />
          <Route path="issues"        element={<SuperAdminIssues />} />
          <Route path="kyb"           element={<SuperAdminKyb />} />
          <Route path="referrals"     element={<SuperAdminReferrals />} />
          <Route path="announcements" element={<SuperAdminAnnouncements />} />
          <Route path="app-status"    element={<AppStatusView />} />
          <Route path="cms-pages"     element={<AdminCMSPages />} />
          {/* Branding and Components used to be their own pages — both moved
              into Design System's rail (Identity/Apps/Login/Components
              sections) since Branding's per-app editor and Design System's
              old "Per-App Colors" tab were editing the same data from two
              separate UIs. These keep old bookmarks/links working. */}
          <Route path="branding"       element={<Navigate to="/admin/design-system?section=identity" replace />} />
          <Route path="design-system" element={<DesignSystemView />} />
          <Route path="seo"           element={<SeoAnalyticsView />} />
          <Route path="components"    element={<Navigate to="/admin/design-system?section=components" replace />} />
          <Route path="settings"      element={<SettingsView />} />
          <Route path="signing-cert"  element={<SuperAdminSigningCert />} />
        </Route>
        <Route path="*" element={<Navigate to="dashboard" replace />} />
      </Routes>
    </div>
  );
}

export function SuperAdminShell() {
  return (
    <WorkspaceApp appId="admin">
      <div className="app-shell">
        <AppSidebar appId="admin" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <RequireRoles roles={['SUPER_ADMIN']}>
              <AdminContent />
            </RequireRoles>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

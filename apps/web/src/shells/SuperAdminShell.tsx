import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
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
import { BrandingView } from '../pages/BrandingView.js';
import { DesignSystemView } from '../pages/DesignSystemView.js';
import { SeoAnalyticsView } from '../pages/SeoAnalyticsView.js';
import { SuperAdminReports } from '../pages/SuperAdminReports.js';
import { SuperAdminQueryBuilder } from '../pages/SuperAdminQueryBuilder.js';
import { SuperAdminTradeWizardAnalytics } from '../pages/SuperAdminTradeWizardAnalytics.js';
import ComponentShowcase from '../pages/ComponentShowcase.js';
import { AdminCMSPages } from '../pages/AdminCMSPages.js';
import { SuperAdminIssues } from '../pages/SuperAdminIssues.js';
import { SuperAdminAnnouncements } from '../pages/SuperAdminAnnouncements.js';
import { SuperAdminCalculations } from '../pages/SuperAdminCalculations.js';
import { SuperAdminIntelligence } from '../pages/SuperAdminIntelligence.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard',     icon: 'monitor',    path: '/admin/dashboard'     },
      { label: 'Reports',       icon: 'barChart',   path: '/admin/reports'       },
      { label: 'Trade Wizard Analytics', icon: 'search', path: '/admin/trade-wizard-analytics' },
      { label: 'Query Builder', icon: 'terminal',   path: '/admin/query-builder' },
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
      { label: 'Announcements',     icon: 'bell',      path: '/admin/announcements' },
      { label: 'Landed Cost Activity', icon: 'package', path: '/admin/calculations' },
      { label: 'Intelligence',      icon: 'sparkle',  path: '/admin/intelligence' },
      { label: 'App Status',        icon: 'shield',   path: '/admin/app-status'     },
      { label: 'CMS Pages',         icon: 'fileText', path: '/admin/cms-pages'      },
      { label: 'Branding',          icon: 'image',    path: '/admin/branding'       },
      { label: 'Design System',     icon: 'sliders',  path: '/admin/design-system'  },
      { label: 'SEO & Analytics',   icon: 'trendingUp', path: '/admin/seo'          },
      { label: 'Components',        icon: 'layers',   path: '/admin/components'     },
      { label: 'Platform Settings', icon: 'settings', path: '/admin/settings'       },
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
          <Route path="reports"       element={<SuperAdminReports />} />
          <Route path="trade-wizard-analytics" element={<SuperAdminTradeWizardAnalytics />} />
          <Route path="query-builder" element={<SuperAdminQueryBuilder />} />
          <Route path="companies"     element={<CompaniesView />} />
          <Route path="subscriptions" element={<SubscriptionsView />} />
          <Route path="packages"      element={<PackagesView />} />
          <Route path="transactions"  element={<TransactionsView />} />
          <Route path="finance"       element={<FinanceView />} />
          <Route path="domains"       element={<DomainsView />} />
          <Route path="activity"      element={<ActivityView />} />
          <Route path="issues"        element={<SuperAdminIssues />} />
          <Route path="announcements" element={<SuperAdminAnnouncements />} />
          <Route path="calculations" element={<SuperAdminCalculations />} />
          <Route path="intelligence" element={<SuperAdminIntelligence />} />
          <Route path="app-status"    element={<AppStatusView />} />
          <Route path="cms-pages"     element={<AdminCMSPages />} />
          <Route path="branding"       element={<BrandingView />} />
          <Route path="design-system" element={<DesignSystemView />} />
          <Route path="seo"           element={<SeoAnalyticsView />} />
          <Route path="components"    element={<ComponentShowcase />} />
          <Route path="settings"      element={<SettingsView />} />
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
      </div>
    </WorkspaceApp>
  );
}

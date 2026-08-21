import React from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { Icon } from '../components/Icon.js';
import { useAuth } from '../hooks/useAuth.js';
import './HuduBIShell.css';

import { HuduBIDashboard } from '../pages/HuduBIDashboard.js';
import { HuduBIDashboardBuilder } from '../pages/HuduBIDashboardBuilder.js';
import { HuduBIAnalytics } from '../pages/HuduBIAnalytics.js';
import { HuduBIDataSources } from '../pages/HuduBIDataSources.js';
import { HuduBIModels } from '../pages/HuduBIModels.js';
import { SuperAdminReports } from '../pages/SuperAdminReports.js';
import { SuperAdminTradeWizardAnalytics } from '../pages/SuperAdminTradeWizardAnalytics.js';
import { SuperAdminQueryBuilder } from '../pages/SuperAdminQueryBuilder.js';
import { SuperAdminCalculations } from '../pages/SuperAdminCalculations.js';
import { SuperAdminIntelligence } from '../pages/SuperAdminIntelligence.js';

// Paths whose data is cross-tenant (dbPlatform, SUPER_ADMIN-only) rather than
// the viewer's own workspace — same set the "PLATFORM · SUPER ADMIN" nav
// section links to. Used to decide when the platform-wide banner shows.
const PLATFORM_PATHS = new Set([
  '/hudubi/reports',
  '/hudubi/trade-wizard-analytics',
  '/hudubi/query-builder',
  '/hudubi/calculations',
  '/hudubi/intelligence',
]);

function buildNav(isSuperAdmin: boolean): SidebarSection[] {
  const sections: SidebarSection[] = [
    {
      title: 'DASHBOARD',
      items: [
        { label: 'Executive Dashboard', icon: 'grid', path: '/hudubi', exact: true },
        { label: 'Dashboard Builder', icon: 'columns', path: '/hudubi/builder' },
        { label: 'AI Overview', icon: 'zap', path: '/hudubi/analytics' },
      ],
    },
    {
      title: 'ANALYTICS',
      items: [
        { label: 'Reports & KPI Center', icon: 'barChart2', path: '/hudubi/analytics' },
      ],
    },
    {
      title: 'DATA MANAGEMENT',
      items: [
        { label: 'Data Sources & Warehouses', icon: 'layers', path: '/hudubi/data-sources' },
      ],
    },
    {
      title: 'MACHINE LEARNING',
      items: [
        { label: 'AI Models & Predictions', icon: 'target', path: '/hudubi/models' },
      ],
    },
  ];

  if (isSuperAdmin) {
    sections.push({
      title: 'PLATFORM · SUPER ADMIN',
      items: [
        { label: 'Reports',              icon: 'barChart',   path: '/hudubi/reports' },
        { label: 'Trade Wizard Analytics', icon: 'search',   path: '/hudubi/trade-wizard-analytics' },
        { label: 'Query Builder',        icon: 'terminal',   path: '/hudubi/query-builder' },
        { label: 'Landed Cost Activity', icon: 'package',    path: '/hudubi/calculations' },
        { label: 'Intelligence',         icon: 'sparkle',    path: '/hudubi/intelligence' },
      ],
    });
  }

  return sections;
}

function PlatformBanner() {
  const location = useLocation();
  if (!PLATFORM_PATHS.has(location.pathname)) return null;
  return (
    <div className="hb-platform-banner">
      <Icon name="shield" size={13} color="#ef4444" />
      <span className="hb-platform-banner-label">Super Admin</span>
      <span className="hb-platform-banner-desc">— Cross-tenant data, aggregated across every workspace on the platform, not just yours.</span>
    </div>
  );
}

export function HuduBIShell() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  return (
    <WorkspaceApp appId="hudubi">
      <div className="app-shell" data-hudubi="true">
        <AppSidebar appId="hudubi" sections={buildNav(isSuperAdmin)} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <PlatformBanner />
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<HuduBIDashboard />} />
                <Route path="builder" element={<HuduBIDashboardBuilder />} />
                <Route path="analytics" element={<HuduBIAnalytics />} />
                <Route path="data-sources" element={<HuduBIDataSources />} />
                <Route path="models" element={<HuduBIModels />} />
                <Route path="reports" element={<RequireRoles roles={['SUPER_ADMIN']}><SuperAdminReports /></RequireRoles>} />
                <Route path="trade-wizard-analytics" element={<RequireRoles roles={['SUPER_ADMIN']}><SuperAdminTradeWizardAnalytics /></RequireRoles>} />
                <Route path="query-builder" element={<RequireRoles roles={['SUPER_ADMIN']}><SuperAdminQueryBuilder /></RequireRoles>} />
                <Route path="calculations" element={<RequireRoles roles={['SUPER_ADMIN']}><SuperAdminCalculations /></RequireRoles>} />
                <Route path="intelligence" element={<RequireRoles roles={['SUPER_ADMIN']}><SuperAdminIntelligence /></RequireRoles>} />
              </Route>
              <Route path="*" element={<Navigate to="/hudubi" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

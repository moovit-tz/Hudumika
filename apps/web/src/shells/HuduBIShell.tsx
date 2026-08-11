import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { HuduBIDashboard } from '../pages/HuduBIDashboard.js';
import { HuduBIAnalytics } from '../pages/HuduBIAnalytics.js';
import { HuduBIDataSources } from '../pages/HuduBIDataSources.js';
import { HuduBIModels } from '../pages/HuduBIModels.js';

const NAV: SidebarSection[] = [
  {
    title: 'DASHBOARD',
    items: [
      { label: 'Executive Dashboard', icon: 'grid', path: '/hudubi', exact: true },
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

export function HuduBIShell() {
  return (
    <WorkspaceApp appId="hudubi">
      <div className="app-shell" data-hudubi="true">
        <AppSidebar appId="hudubi" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<HuduBIDashboard />} />
                <Route path="analytics" element={<HuduBIAnalytics />} />
                <Route path="data-sources" element={<HuduBIDataSources />} />
                <Route path="models" element={<HuduBIModels />} />
              </Route>
              <Route path="*" element={<Navigate to="/hudubi" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

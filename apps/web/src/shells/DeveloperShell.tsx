// ─── apps/web/src/shells/DeveloperShell.tsx ───────────────────────
// Developer Platform App Shell for Hudumika Developer
import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { DeveloperConsolePage } from '../pages/developer/DeveloperConsolePage.js';

const NAV: SidebarSection[] = [
  {
    title: 'WORKSPACE',
    items: [
      { label: 'Overview', icon: 'grid', path: '/developer', exact: true },
      { label: 'Projects', icon: 'folder', path: '/developer?tab=projects' },
      { label: 'API Keys', icon: 'key', path: '/developer?tab=credentials' },
    ],
  },
  {
    title: 'API PLATFORM',
    items: [
      { label: 'Marketplace', icon: 'shoppingCart', path: '/developer?tab=marketplace' },
      { label: 'Documentation', icon: 'bookOpen', path: '/developer?tab=marketplace' },
    ],
  },
  {
    title: 'MANAGEMENT',
    items: [
      { label: 'Usage & Telemetry', icon: 'activity', path: '/developer?tab=analytics' },
      { label: 'Billing & Credits', icon: 'coins', path: '/developer?tab=billing' },
      { label: 'Organization & Team', icon: 'users', path: '/developer?tab=organization' },
    ],
  },
];

export function DeveloperShell() {
  return (
    <WorkspaceApp appId="developer">
      <div className="app-shell" data-developer="true">
        <AppSidebar appId="developer" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<DeveloperConsolePage />} />
                <Route path="*" element={<DeveloperConsolePage />} />
              </Route>
              <Route path="*" element={<Navigate to="/developer" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

export default DeveloperShell;

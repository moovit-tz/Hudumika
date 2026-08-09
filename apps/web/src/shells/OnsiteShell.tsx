import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { OnsiteOverview } from '../pages/onsite/OnsiteOverview.js';
import { OnsiteDomains } from '../pages/onsite/OnsiteDomains.js';
import { OnsiteDomainDetail } from '../pages/onsite/OnsiteDomainDetail.js';
import { OnsiteDNS } from '../pages/onsite/OnsiteDNS.js';
import { OnsiteApplications } from '../pages/onsite/OnsiteApplications.js';
import { OnsiteApplicationDetail } from '../pages/onsite/OnsiteApplicationDetail.js';
import { OnsiteDeployments } from '../pages/onsite/OnsiteDeployments.js';
import { OnsiteProjects } from '../pages/onsite/OnsiteProjects.js';
import { OnsiteServers } from '../pages/onsite/OnsiteServers.js';
import { OnsiteMonitoring } from '../pages/onsite/OnsiteMonitoring.js';
import { OnsiteSSL } from '../pages/onsite/OnsiteSSL.js';
import { OnsiteActivity } from '../pages/onsite/OnsiteActivity.js';
import { OnsiteSettings } from '../pages/onsite/OnsiteSettings.js';

const NAV: SidebarSection[] = [
  {
    title: 'Control Plane',
    items: [
      { label: 'Overview', icon: 'grid', path: '/onsite', exact: true },
      { label: 'Projects', icon: 'folder', path: '/onsite/projects' },
    ],
  },
  {
    title: 'Domains & Networking',
    items: [
      { label: 'Domains', icon: 'globe', path: '/onsite/domains' },
      { label: 'SSL Certificates', icon: 'shield', path: '/onsite/ssl' },
    ],
  },
  {
    title: 'Compute & Apps',
    items: [
      { label: 'Applications', icon: 'terminal', path: '/onsite/applications' },
      { label: 'Deployments', icon: 'gitBranch', path: '/onsite/deployments' },
      { label: 'Servers & VPS', icon: 'monitor', path: '/onsite/servers' },
    ],
  },
  {
    title: 'Observability',
    items: [
      { label: 'Uptime Monitors', icon: 'activity', path: '/onsite/monitoring' },
      { label: 'Audit Feed', icon: 'clock', path: '/onsite/activity' },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Providers & Settings', icon: 'settings', path: '/onsite/settings' },
    ],
  },
];

export function OnsiteShell() {
  return (
    <WorkspaceApp appId="onsite">
      <div className="app-shell">
        <AppSidebar appId="onsite" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<OnsiteOverview />} />
                <Route path="projects" element={<OnsiteProjects />} />
                <Route path="domains" element={<OnsiteDomains />} />
                <Route path="domains/:id" element={<OnsiteDomainDetail />} />
                <Route path="domains/:domainId/dns" element={<OnsiteDNS />} />
                <Route path="ssl" element={<OnsiteSSL />} />
                <Route path="applications" element={<OnsiteApplications />} />
                <Route path="applications/:id" element={<OnsiteApplicationDetail />} />
                <Route path="deployments" element={<OnsiteDeployments />} />
                <Route path="servers" element={<OnsiteServers />} />
                <Route path="monitoring" element={<OnsiteMonitoring />} />
                <Route path="activity" element={<OnsiteActivity />} />
                <Route path="settings" element={<OnsiteSettings />} />
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { OnsiteOverview } from '../pages/onsite/OnsiteOverview.js';
import { OnsiteWebsites } from '../pages/onsite/OnsiteWebsites.js';
import { OnsiteDomains } from '../pages/onsite/OnsiteDomains.js';
import { OnsiteDomainSearch } from '../pages/onsite/OnsiteDomainSearch.js';
import { OnsiteTransfers } from '../pages/onsite/OnsiteTransfers.js';
import { OnsiteDomainDetail } from '../pages/onsite/OnsiteDomainDetail.js';
import { OnsiteDNS } from '../pages/onsite/OnsiteDNS.js';
import { OnsiteEmails } from '../pages/onsite/OnsiteEmails.js';
import { OnsiteServices } from '../pages/onsite/OnsiteServices.js';
import { OnsiteApplications } from '../pages/onsite/OnsiteApplications.js';
import { OnsiteApplicationDetail } from '../pages/onsite/OnsiteApplicationDetail.js';
import { OnsiteDeployments } from '../pages/onsite/OnsiteDeployments.js';
import { OnsiteProjects } from '../pages/onsite/OnsiteProjects.js';
import { OnsiteServers } from '../pages/onsite/OnsiteServers.js';
import { OnsiteMonitoring } from '../pages/onsite/OnsiteMonitoring.js';
import { OnsiteSSL } from '../pages/onsite/OnsiteSSL.js';
import { OnsiteActivity } from '../pages/onsite/OnsiteActivity.js';
import { OnsiteSettings } from '../pages/onsite/OnsiteSettings.js';
import { OnsiteAgencyClients } from '../pages/onsite/OnsiteAgencyClients.js';
import { OnsiteAgencyClientManage } from '../pages/onsite/OnsiteAgencyClientManage.js';
import { OnsiteAgencyDirectoryProfile } from '../pages/onsite/OnsiteAgencyDirectoryProfile.js';
import { OnsiteAgencyDirectoryAdmin } from '../pages/onsite/OnsiteAgencyDirectoryAdmin.js';
import { OnsiteActivateStandalone } from '../pages/onsite/OnsiteActivateStandalone.js';
import { OnsiteBackups } from '../pages/onsite/OnsiteBackups.js';
import { OnsiteSupport } from '../pages/onsite/OnsiteSupport.js';
import { OnsiteReferrals } from '../pages/onsite/OnsiteReferrals.js';

import { OnsiteWebsiteDetailShell } from '../pages/onsite/OnsiteWebsiteDetailShell.js';

// Sidebar sections matching Hostinger / hPanel exact structure
const NAV: SidebarSection[] = [
  {
    title: 'Main',
    items: [
      { label: 'Home', icon: 'grid', path: '/onsite', exact: true },
      { label: 'Websites', icon: 'layoutDashboard', path: '/onsite/websites' },
      { label: 'Domains', icon: 'globe', path: '/onsite/domains' },
      { label: 'Emails', icon: 'mail', path: '/onsite/emails' },
      { label: 'More services', icon: 'shoppingCart', path: '/onsite/services' },
      { label: 'Support', icon: 'helpCircle', path: '/onsite/support' },
    ],
  },
  {
    title: 'Agency',
    items: [
      { label: 'Clients', icon: 'users', path: '/onsite/agency/clients' },
      { label: 'Directory listing', icon: 'briefcase', path: '/onsite/agency/directory-profile' },
      { label: 'Directory moderation', icon: 'shield', path: '/onsite/agency/directory-admin' },
      { label: 'Referrals', icon: 'link', path: '/onsite/agency/referrals' },
    ],
  },
  {
    title: 'Dev tools',
    items: [
      { label: 'VPS', icon: 'monitor', path: '/onsite/servers' },
      { label: 'Projects', icon: 'folder', path: '/onsite/projects' },
      { label: 'Provider connections', icon: 'key', path: '/onsite/settings' },
      { label: 'Backups', icon: 'layers', path: '/onsite/backups' },
    ],
  },
  {
    title: 'Observability',
    items: [
      { label: 'Applications', icon: 'terminal', path: '/onsite/applications' },
      { label: 'Deployments', icon: 'gitBranch', path: '/onsite/deployments' },
      { label: 'Uptime Monitors', icon: 'activity', path: '/onsite/monitoring' },
      { label: 'Audit Feed', icon: 'clock', path: '/onsite/activity' },
    ],
  },
];

export function OnsiteShell() {
  // appId is "onsite", NOT "onesite" — the one-letter difference is two
  // different products. 'onesite' is the Web/CMS app (/cms, CMSShell.tsx,
  // cms.routes.ts). Using it here makes Onsite inherit the CMS's name, colour,
  // sidebar icon and entitlement, and the header renders "oneSite / Web & CMS"
  // over the infrastructure console.
  return (
    <WorkspaceApp appId="onsite" bypassGatePaths={['/onsite/activate']}>
      <div className="app-shell">
        <AppSidebar appId="onsite" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<OnsiteOverview />} />
                <Route path="websites" element={<OnsiteWebsites />} />
                <Route path="websites/:siteId/*" element={<OnsiteWebsiteDetailShell />} />
                <Route path="domains" element={<OnsiteDomains />} />
                <Route path="domains/search" element={<OnsiteDomainSearch />} />
                <Route path="domains/transfers" element={<OnsiteTransfers />} />
                <Route path="domains/:id" element={<OnsiteDomainDetail />} />
                <Route path="domains/:domainId/dns" element={<OnsiteDNS />} />
                <Route path="emails" element={<OnsiteEmails />} />
                <Route path="services" element={<OnsiteServices />} />
                <Route path="support" element={<OnsiteSupport />} />
                <Route path="agency/clients" element={<OnsiteAgencyClients />} />
                <Route path="agency/clients/:clientTenantId" element={<OnsiteAgencyClientManage />} />
                <Route path="agency/directory-profile" element={<OnsiteAgencyDirectoryProfile />} />
                <Route path="agency/directory-admin" element={<OnsiteAgencyDirectoryAdmin />} />
                <Route path="agency/referrals" element={<OnsiteReferrals />} />
                <Route path="activate" element={<OnsiteActivateStandalone />} />
                <Route path="backups" element={<OnsiteBackups />} />

                {/* Dev Tools & Infrastructure */}
                <Route path="projects" element={<OnsiteProjects />} />
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

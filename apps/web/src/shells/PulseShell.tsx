import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import { roleCanOpenApp } from '../components/LauncherApps.js';
import '../pages/pulse/Pulse.css';

import { PulseOverview } from '../pages/pulse/PulseOverview.js';
import { PulseAudiences, PulseAudienceDetail } from '../pages/pulse/PulseAudiences.js';
import { PulseSegmentEditor } from '../pages/pulse/PulseSegmentEditor.js';
import { PulseConsents } from '../pages/pulse/PulseConsents.js';
import { PulseCampaigns } from '../pages/pulse/PulseCampaigns.js';
import { PulseCampaignNew, PulseCampaignEditor } from '../pages/pulse/PulseCampaignEditor.js';
import { PulseCampaignReport } from '../pages/pulse/PulseCampaignReport.js';
import { PulseJourneys, PulseJourneyNew } from '../pages/pulse/PulseJourneys.js';
import { PulseJourneyBuilder } from '../pages/pulse/PulseJourneyBuilder.js';
import { PulseForms, PulseFormDetail, PulseAttribution, PulseLinkBuilder } from '../pages/pulse/PulseForms.js';
import { PulseSocial, PulseSocialComposer, PulseSocialCallback } from '../pages/pulse/PulseSocial.js';
import { PulseAds, PulseAdsCallback } from '../pages/pulse/PulseAds.js';
import { PulseAccounts, PulseAccountDetail } from '../pages/pulse/PulseAccounts.js';

const NAV: SidebarSection[] = [
  { items: [{ label: 'Overview', icon: 'activity', path: '/pulse', exact: true }] },
  {
    title: 'Reach',
    items: [
      { label: 'Campaigns', icon: 'send', path: '/pulse/campaigns' },
      { label: 'Journeys', icon: 'gitBranch', path: '/pulse/journeys' },
      { label: 'Social', icon: 'share', path: '/pulse/social' },
      { label: 'Ads', icon: 'target', path: '/pulse/ads' },
      { label: 'Audiences', icon: 'users', path: '/pulse/audiences' },
      { label: 'Target accounts', icon: 'flag', path: '/pulse/accounts' },
    ],
  },
  {
    title: 'Website',
    items: [
      { label: 'Forms', icon: 'clipboard', path: '/pulse/forms' },
      { label: 'Link builder', icon: 'link', path: '/pulse/links' },
    ],
  },
  {
    title: 'Results',
    items: [{ label: 'Attribution', icon: 'barChart', path: '/pulse/attribution' }],
  },
  {
    title: 'Trust',
    items: [{ label: 'Consent', icon: 'checkCircle', path: '/pulse/consent' }],
  },
];

export function PulseShell() {
  const { user } = useAuth();
  return (
    <WorkspaceApp appId="pulse">
      <div className="app-shell">
        <AppSidebar appId="pulse" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            {!roleCanOpenApp('pulse', user?.role) ? (
              <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: '60vh', padding: 24, textAlign: 'center' }}>
                <Icon name="lock" size={28} color="var(--ink3)" />
                <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Pulse is for sales and marketing</h1>
                <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 420, margin: 0 }}>
                  It sends messages to your customers on the company's behalf. Ask a workspace admin if you need access.
                </p>
              </div>
            ) : (
              <Routes>
                <Route element={<PageLayout />}>
                  <Route index element={<PulseOverview />} />
                  <Route path="campaigns" element={<PulseCampaigns />} />
                  <Route path="campaigns/new" element={<PulseCampaignNew />} />
                  <Route path="campaigns/:id" element={<PulseCampaignReport />} />
                  <Route path="campaigns/:id/edit" element={<PulseCampaignEditor />} />
                  <Route path="journeys" element={<PulseJourneys />} />
                  <Route path="journeys/new" element={<PulseJourneyNew />} />
                  <Route path="journeys/:id" element={<PulseJourneyBuilder />} />
                  <Route path="audiences" element={<PulseAudiences />} />
                  <Route path="audiences/new" element={<PulseSegmentEditor />} />
                  <Route path="audiences/:id" element={<PulseAudienceDetail />} />
                  <Route path="audiences/:id/edit" element={<PulseSegmentEditor />} />
                  <Route path="consent" element={<PulseConsents />} />
                  <Route path="social" element={<PulseSocial />} />
                  <Route path="social/new" element={<PulseSocialComposer />} />
                  <Route path="social/callback/:provider" element={<PulseSocialCallback />} />
                  <Route path="social/:id" element={<PulseSocialComposer />} />
                  <Route path="accounts" element={<PulseAccounts />} />
                  <Route path="accounts/:id" element={<PulseAccountDetail />} />
                  <Route path="ads" element={<PulseAds />} />
                  <Route path="ads/callback/:network" element={<PulseAdsCallback />} />
                  <Route path="forms" element={<PulseForms />} />
                  <Route path="forms/:id" element={<PulseFormDetail />} />
                  <Route path="links" element={<PulseLinkBuilder />} />
                  <Route path="attribution" element={<PulseAttribution />} />
                </Route>
                <Route path="*" element={<Navigate to="/pulse" replace />} />
              </Routes>
            )}
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

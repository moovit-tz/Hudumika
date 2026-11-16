import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { lazyPage } from '../lib/lazyPage.js';
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

// Each page loads when its route is opened (perf audit 2026-11-16).
const PulseOverview = lazyPage(() => import('../pages/pulse/PulseOverview.js'), 'PulseOverview');
const PulseAudiences = lazyPage(() => import('../pages/pulse/PulseAudiences.js'), 'PulseAudiences');
const PulseAudienceDetail = lazyPage(() => import('../pages/pulse/PulseAudiences.js'), 'PulseAudienceDetail');
const PulseSegmentEditor = lazyPage(() => import('../pages/pulse/PulseSegmentEditor.js'), 'PulseSegmentEditor');
const PulseConsents = lazyPage(() => import('../pages/pulse/PulseConsents.js'), 'PulseConsents');
const PulseCampaigns = lazyPage(() => import('../pages/pulse/PulseCampaigns.js'), 'PulseCampaigns');
const PulseCampaignNew = lazyPage(() => import('../pages/pulse/PulseCampaignEditor.js'), 'PulseCampaignNew');
const PulseCampaignEditor = lazyPage(() => import('../pages/pulse/PulseCampaignEditor.js'), 'PulseCampaignEditor');
const PulseCampaignReport = lazyPage(() => import('../pages/pulse/PulseCampaignReport.js'), 'PulseCampaignReport');
const PulseJourneys = lazyPage(() => import('../pages/pulse/PulseJourneys.js'), 'PulseJourneys');
const PulseJourneyNew = lazyPage(() => import('../pages/pulse/PulseJourneys.js'), 'PulseJourneyNew');
const PulseJourneyBuilder = lazyPage(() => import('../pages/pulse/PulseJourneyBuilder.js'), 'PulseJourneyBuilder');
const PulseForms = lazyPage(() => import('../pages/pulse/PulseForms.js'), 'PulseForms');
const PulseFormDetail = lazyPage(() => import('../pages/pulse/PulseForms.js'), 'PulseFormDetail');
const PulseAttribution = lazyPage(() => import('../pages/pulse/PulseForms.js'), 'PulseAttribution');
const PulseLinkBuilder = lazyPage(() => import('../pages/pulse/PulseForms.js'), 'PulseLinkBuilder');
const PulseSocial = lazyPage(() => import('../pages/pulse/PulseSocial.js'), 'PulseSocial');
const PulseSocialComposer = lazyPage(() => import('../pages/pulse/PulseSocial.js'), 'PulseSocialComposer');
const PulseSocialCallback = lazyPage(() => import('../pages/pulse/PulseSocial.js'), 'PulseSocialCallback');
const PulseAds = lazyPage(() => import('../pages/pulse/PulseAds.js'), 'PulseAds');
const PulseAdsCallback = lazyPage(() => import('../pages/pulse/PulseAds.js'), 'PulseAdsCallback');
const PulseAccounts = lazyPage(() => import('../pages/pulse/PulseAccounts.js'), 'PulseAccounts');
const PulseAccountDetail = lazyPage(() => import('../pages/pulse/PulseAccounts.js'), 'PulseAccountDetail');


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

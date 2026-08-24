import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { SmsDashboard } from '../pages/sms/SmsDashboard.js';
import { SmsCompose } from '../pages/sms/SmsCompose.js';
import { SmsGroups } from '../pages/sms/SmsGroups.js';
import { SmsGroupDetail } from '../pages/sms/SmsGroupDetail.js';
import { SmsTemplates } from '../pages/sms/SmsTemplates.js';
import { SmsCampaigns } from '../pages/sms/SmsCampaigns.js';
import { SmsCampaignDetail } from '../pages/sms/SmsCampaignDetail.js';
import { SmsReports } from '../pages/sms/SmsReports.js';
import { SmsGateways } from '../pages/sms/SmsGateways.js';
import { SmsOptOuts } from '../pages/sms/SmsOptOuts.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'barChart2', path: '/sms', exact: true },
      { label: 'Compose', icon: 'edit', path: '/sms/compose' },
      { label: 'Campaigns', icon: 'send', path: '/sms/campaigns' },
      { label: 'Groups', icon: 'users', path: '/sms/groups' },
      { label: 'Templates', icon: 'fileText', path: '/sms/templates' },
      { label: 'Reports', icon: 'list', path: '/sms/reports' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Gateways', icon: 'settings', path: '/sms/gateways' },
      { label: 'Opt-outs', icon: 'shield', path: '/sms/opt-outs' },
    ],
  },
];

export function SmsShell() {
  return (
    <WorkspaceApp appId="sms">
      <div className="app-shell">
        <AppSidebar appId="sms" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<SmsDashboard />} />
                <Route path="compose" element={<SmsCompose />} />
                <Route path="campaigns" element={<SmsCampaigns />} />
                <Route path="campaigns/:id" element={<SmsCampaignDetail />} />
                <Route path="groups" element={<SmsGroups />} />
                <Route path="groups/:id" element={<SmsGroupDetail />} />
                <Route path="templates" element={<SmsTemplates />} />
                <Route path="reports" element={<SmsReports />} />
                <Route path="gateways" element={<SmsGateways />} />
                <Route path="opt-outs" element={<SmsOptOuts />} />
              </Route>
              <Route path="*" element={<Navigate to="/sms" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

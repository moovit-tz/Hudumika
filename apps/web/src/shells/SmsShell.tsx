import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { SmsDashboard } from '../pages/sms/SmsDashboard.js';
import { SmsCompose } from '../pages/sms/SmsCompose.js';
import { SmsFileSend } from '../pages/sms/SmsFileSend.js';
import { SmsVoiceBroadcast } from '../pages/sms/SmsVoiceBroadcast.js';
import { SmsSubscription } from '../pages/sms/SmsSubscription.js';
import { SmsInbox } from '../pages/sms/SmsInbox.js';
import { SmsGroups } from '../pages/sms/SmsGroups.js';
import { SmsGroupDetail } from '../pages/sms/SmsGroupDetail.js';
import { SmsTemplates } from '../pages/sms/SmsTemplates.js';
import { SmsCampaigns } from '../pages/sms/SmsCampaigns.js';
import { SmsCampaignDetail } from '../pages/sms/SmsCampaignDetail.js';
import { SmsReports } from '../pages/sms/SmsReports.js';
import { SmsSenderIds } from '../pages/sms/SmsSenderIds.js';
import { SmsOptOuts } from '../pages/sms/SmsOptOuts.js';
import { SmsGateways } from '../pages/sms/SmsGateways.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview', icon: 'barChart2', path: '/sms', exact: true },
      { label: 'Compose', icon: 'edit', path: '/sms/compose' },
      { label: 'Send from File', icon: 'upload', path: '/sms/file-send' },
      { label: 'Voice Broadcast', icon: 'phone', path: '/sms/voice' },
      { label: 'Inbox', icon: 'inbox', path: '/sms/inbox' },
      { label: 'Campaigns', icon: 'send', path: '/sms/campaigns' },
      { label: 'Groups', icon: 'users', path: '/sms/groups' },
      { label: 'Templates', icon: 'fileText', path: '/sms/templates' },
      { label: 'Gateways', icon: 'settings', path: '/sms/gateways' },
      { label: 'Send History', icon: 'list', path: '/sms/reports' },
    ],
  },
  {
    title: 'Configuration',
    items: [
      { label: 'Subscriptions & Bundles', icon: 'creditCard', path: '/sms/subscription' },
      { label: 'Sender IDs & DLT', icon: 'tag', path: '/sms/sender-ids' },
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
                <Route path="file-send" element={<SmsFileSend />} />
                <Route path="voice" element={<SmsVoiceBroadcast />} />
                <Route path="subscription" element={<SmsSubscription />} />
                <Route path="inbox" element={<SmsInbox />} />
                <Route path="campaigns" element={<SmsCampaigns />} />
                <Route path="campaigns/:id" element={<SmsCampaignDetail />} />
                <Route path="groups" element={<SmsGroups />} />
                <Route path="groups/:id" element={<SmsGroupDetail />} />
                <Route path="templates" element={<SmsTemplates />} />
                <Route path="reports" element={<SmsReports />} />
                <Route path="sender-ids" element={<SmsSenderIds />} />
                <Route path="gateways" element={<SmsGateways />} />
                <Route path="opt-outs" element={<SmsOptOuts />} />
              </Route>
              <Route path="*" element={<Navigate to="/sms" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

import React from 'react';
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import '../pages/Bliss.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { MGMT_ROLES } from '../lib/permissions.js';

import { Support }         from '../pages/Support.js';
import { SupportOverview } from '../pages/SupportOverview.js';
import { SupportAnalytics } from '../pages/SupportAnalytics.js';
import { SupportTeam }     from '../pages/SupportTeam.js';
import { Escalations }     from '../pages/Escalations.js';
import { SupportKB }       from '../pages/SupportKB.js';
import { SupportSettings } from '../pages/SupportSettings.js';
import { BlissNotifications } from '../pages/BlissNotifications.js';
// Team chat moved here from ClearOS. It is the workspace's internal
// channels and DMs. Live Chat (the customer-facing counterpart) was
// retired — SupportChat.tsx and its 4-route backend never grew past a
// bare stub, while this grew into a real channels+DMs system, so rather
// than maintain two half-built chat surfaces this is now the one.
import { Chat }            from '../pages/Chat.js';
// Calls (1:1 + group meetings) — moved here from NexusHR the same way Chat
// moved here from ClearOS: Bliss is the platform's comms hub, so any app
// that needs calling pulls it from here rather than owning its own copy.
import { Calls }           from '../pages/Calls.js';
import { CallsReports }    from '../pages/calls/CallsReports.js';
import { MeetingSession }  from '../pages/calls/MeetingSession.js';

// Grouped the same way FinOpsShell's sidebar is: an ungrouped Dashboard link
// up top, then labeled domain sections, with Reports broken out into its own
// section (each report a separate page, not a tab) rather than buried inside
// the pages that link to them.
const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview', icon: 'activity', path: '/bliss', exact: true },
    ],
  },
  {
    title: 'Support',
    items: [
      { label: 'All Tickets',    icon: 'headphones',   path: '/bliss/tickets' },
      { label: 'Escalations',    icon: 'arrowUpRight', path: '/bliss/escalations' },
      { label: 'Knowledge Base', icon: 'fileText',     path: '/bliss/kb' },
    ],
  },
  {
    title: 'Communication',
    items: [
      { label: 'Team Chat', icon: 'chatBubble', path: '/bliss/team-chat' },
      { label: 'Calls',     icon: 'camera',     path: '/bliss/calls' },
    ],
  },
  {
    title: 'Reports',
    items: [
      { label: 'Support Analytics', icon: 'barChart',  path: '/bliss/overview/analytics' },
      { label: 'Team Performance',  icon: 'users',     path: '/bliss/overview/team' },
      { label: 'Call Reports',      icon: 'barChart2', path: '/bliss/calls/reports' },
    ],
  },
  {
    items: [
      { label: 'Notifications', icon: 'bell',     path: '/bliss/notifications' },
      { label: 'Settings',      icon: 'settings', path: '/bliss/settings' },
    ],
  },
];

// Shareable meeting link (/bliss/calls/meeting/:id) — MeetingSession itself
// does the lobby→room flow; this just wires it to the route param and sends
// "back to Calls" on exit, same as clicking a meeting in the list.
function MeetingJoinRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/bliss/calls" replace />;
  return <MeetingSession meetingId={id} onExit={() => navigate('/bliss/calls')} />;
}

export function BlissShell() {
  return (
    <WorkspaceApp appId="bliss">
      <div className="app-shell" data-bliss="true">
        <AppSidebar appId="bliss" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route index element={<Navigate to="overview" replace />} />

              <Route path="tickets" element={<Support />} />
              <Route path="chat" element={<Navigate to="/bliss/team-chat" replace />} />
              <Route path="team-chat" element={<Chat />} />

              <Route element={<PageLayout />}>
                <Route path="overview"    element={<SupportOverview />} />
                <Route path="overview/analytics" element={<SupportAnalytics />} />
                <Route path="overview/team"      element={<SupportTeam />} />
                <Route path="kb"          element={<SupportKB />} />
                <Route path="notifications" element={<BlissNotifications />} />
                <Route path="settings"    element={<SupportSettings />} />
                <Route path="escalations" element={<RequireRoles roles={[...MGMT_ROLES, 'SENIOR']}><Escalations /></RequireRoles>} />
                <Route path="calls"             element={<Calls />} />
                <Route path="calls/reports"     element={<CallsReports />} />
                <Route path="calls/meeting/:id" element={<MeetingJoinRoute />} />
              </Route>

              <Route path="*" element={<Navigate to="/bliss" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

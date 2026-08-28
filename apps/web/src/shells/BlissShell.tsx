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
import { Escalations }     from '../pages/Escalations.js';
import { SupportChat }     from '../pages/SupportChat.js';
import { SupportKB }       from '../pages/SupportKB.js';
import { SupportSettings } from '../pages/SupportSettings.js';
import { BlissNotifications } from '../pages/BlissNotifications.js';
// Team chat moved here from ClearOS. It is the workspace's internal
// channels and DMs — distinct from Live Chat above, which is the
// customer-facing conversation. Both belong in the communications app;
// neither belonged in a customs app.
import { Chat }            from '../pages/Chat.js';
// Calls (1:1 + group meetings) — moved here from NexusHR the same way Chat
// moved here from ClearOS: Bliss is the platform's comms hub, so any app
// that needs calling pulls it from here rather than owning its own copy.
import { Calls }           from '../pages/Calls.js';
import { MeetingSession }  from '../pages/calls/MeetingSession.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview',       icon: 'activity',     path: '/bliss', exact: true },
      { label: 'All Tickets',    icon: 'headphones',    path: '/bliss/tickets' },
      { label: 'Live Chat',      icon: 'messageSquare', path: '/bliss/chat' },
      { label: 'Team Chat',      icon: 'chatBubble',    path: '/bliss/team-chat' },
      { label: 'Calls',          icon: 'camera',        path: '/bliss/calls' },
      { label: 'Knowledge Base', icon: 'fileText',      path: '/bliss/kb' },
      { label: 'Escalations',    icon: 'arrowUpRight',  path: '/bliss/escalations' },
      { label: 'Notifications',  icon: 'bell',          path: '/bliss/notifications' },
      { label: 'Settings',       icon: 'settings',      path: '/bliss/settings' },
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
              <Route path="chat"    element={<SupportChat />} />
              <Route path="team-chat" element={<Chat />} />

              <Route element={<PageLayout />}>
                <Route path="overview"    element={<SupportOverview />} />
                <Route path="kb"          element={<SupportKB />} />
                <Route path="notifications" element={<BlissNotifications />} />
                <Route path="settings"    element={<SupportSettings />} />
                <Route path="escalations" element={<RequireRoles roles={[...MGMT_ROLES, 'SENIOR']}><Escalations /></RequireRoles>} />
                <Route path="calls"             element={<Calls />} />
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

import React from 'react';
import { Routes, Route, Navigate, useParams, useNavigate } from 'react-router-dom';
import '../pages/Bliss.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { BlissInbox }        from '../pages/bliss/BlissInbox.js';
import { BlissWhatsApp }     from '../pages/bliss/BlissWhatsApp.js';
import { BlissTelephony }    from '../pages/bliss/BlissTelephony.js';
import { SupportOverview } from '../pages/SupportOverview.js';
import { SupportTeam }     from '../pages/SupportTeam.js';
import { SupportKB }       from '../pages/SupportKB.js';
import { SupportSettings } from '../pages/SupportSettings.js';
import { BlissNotifications } from '../pages/BlissNotifications.js';
import { Calls }           from '../pages/Calls.js';
import { CallsReports }    from '../pages/calls/CallsReports.js';
import { MeetingCenter }   from '../pages/calls/MeetingCenter.js';
import { MeetingSession }  from '../pages/calls/MeetingSession.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Support Center', icon: 'inbox', path: '/bliss/inbox' },
      { label: 'Overview',       icon: 'activity', path: '/bliss/overview' },
    ],
  },
  {
    title: 'Channels',
    items: [
      // Live Chat isn't its own page anymore — it's the "Live Chat" channel
      // filter on Support Center's own conversation list (?view=livechat
      // still works as a deep link, it's just no longer a separate nav item).
      { label: 'WhatsApp', icon: 'chatBubble', path: '/bliss/whatsapp' },
    ],
  },
  {
    title: 'Intelligence & KB',
    items: [
      { label: 'Knowledge Base', icon: 'fileText', path: '/bliss/kb' },
    ],
  },
  {
    title: 'Internal Comms',
    items: [
      // Team Chat isn't its own nav entry — it's the "Team Chat" tab inside
      // Support Center itself (/bliss/inbox?view=team). Calls.tsx (1:1
      // direct calls) owns the "Call Center" name; BlissCallCenter.tsx — a
      // second, mostly-redundant page that only linked back here anyway —
      // is gone. Meetings (scheduled/instant multi-party video) are a real,
      // separate concern with their own page.
      { label: 'Call Center',    icon: 'phone',   path: '/bliss/calls' },
      { label: 'Meeting Center', icon: 'camera',  path: '/bliss/meetings' },
    ],
  },
  {
    title: 'Settings & Admin',
    items: [
      { label: 'Telephony Providers', icon: 'phone', path: '/bliss/telephony' },
      { label: 'Operational Mode',    icon: 'sliders', path: '/bliss/operational-mode' },
      { label: 'Performance',         icon: 'users', path: '/bliss/overview/team' },
      { label: 'Call Reports',        icon: 'barChart2', path: '/bliss/calls/reports' },
      { label: 'Notifications',       icon: 'bell', path: '/bliss/notifications' },
    ],
  },
  // Pages that hand off to a different app entirely go last, deliberately
  // separate from Bliss's own pages above — same "LINKED APPS" convention
  // ClearOSShell.tsx already uses for the same kind of cross-app shortcut.
  {
    title: 'Linked Apps',
    items: [
      { label: 'Customers',   icon: 'users',     path: '/crm/customers' },
      { label: 'Automations', icon: 'gitBranch', path: '/studio/workflows?app=bliss' },
    ],
  },
];

function MeetingJoinRoute() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  if (!id) return <Navigate to="/bliss/meetings" replace />;
  return <MeetingSession meetingId={id} onExit={() => navigate('/bliss/meetings')} />;
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
              <Route index element={<Navigate to="inbox" replace />} />

              {/* Inbox, Team Chat and the Live Chat queue were three separate
                  pages all doing the same thing — showing a message thread
                  and letting you reply — with Live Chat's own composer
                  already reduced to "open in Inbox to reply" and Team Chat
                  differing only in being internal-only conversations rather
                  than customer ones. Both are now views inside Inbox itself
                  (?view=team / ?view=livechat) instead of separate routes;
                  old links redirect via the catch-all below. */}
              <Route path="inbox" element={<BlissInbox />} />
              <Route path="chat" element={<Navigate to="/bliss/inbox?view=team" replace />} />
              <Route path="team-chat" element={<Navigate to="/bliss/inbox?view=team" replace />} />
              <Route path="livechat" element={<Navigate to="/bliss/inbox?view=livechat" replace />} />
              {/* BlissCallCenter.tsx is gone — Calls.tsx (1:1 direct calls)
                  now owns the "Call Center" name and route. */}
              <Route path="call-center" element={<Navigate to="/bliss/calls" replace />} />

              <Route element={<PageLayout />}>
                <Route path="whatsapp"          element={<BlissWhatsApp />} />
                <Route path="telephony"         element={<BlissTelephony />} />
                {/* BlissOperationalMode.tsx was a fake 4-mode "system
                    behavior" switcher with no backend and a no-op Apply
                    button — nothing it offered corresponds to a real,
                    switchable system behavior anywhere in this codebase.
                    SupportSettings.tsx already covers the real equivalent:
                    the actual auto-assignment/SLA-escalation/status-
                    automation/notification rules engine (support_rules),
                    plus real links to where each channel is configured —
                    and was itself orphaned (routed nowhere) until now. */}
                <Route path="operational-mode"  element={<SupportSettings />} />
                <Route path="overview"          element={<SupportOverview />} />
                <Route path="overview/team"      element={<SupportTeam />} />
                <Route path="kb"                element={<SupportKB />} />
                <Route path="notifications"     element={<BlissNotifications />} />
                <Route path="calls"             element={<Calls />} />
                <Route path="calls/reports"     element={<CallsReports />} />
                <Route path="calls/meeting/:id" element={<MeetingJoinRoute />} />
                <Route path="meetings"          element={<MeetingCenter />} />
              </Route>

              <Route path="*" element={<Navigate to="/bliss/inbox" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}


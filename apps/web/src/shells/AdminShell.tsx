import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/Workspace.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection, SidebarNavItem } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { MGMT_ROLES } from '../lib/permissions.js';

import { Settings, NAV as SETTINGS_NAV } from '../pages/Settings.js';
import { Team } from '../pages/Team.js';
import { Utilities }         from '../pages/Utilities.js';
import { Reports }           from '../pages/Reports.js';
import { Subscription }      from '../pages/Subscription.js';

// One expandable sidebar item per Settings group, built straight from
// Settings.tsx's own NAV — Settings used to render a second, separate inner
// sidebar for these same groups; this is that content, one level up, so
// there's a single sidebar instead of two side-by-side ones. Each group's
// own first item stands in for a real path (used when the whole app
// sidebar is collapsed to an icon rail, where a parent-with-children falls
// back to a plain link rather than expanding).
const SETTINGS_SIDEBAR_ITEMS: SidebarNavItem[] = SETTINGS_NAV.map(g => ({
  label: g.group,
  icon: g.icon,
  path: `/workspace/settings?s=${g.items[0]?.key ?? ''}`,
  children: g.items.map(item => ({
    label: item.label,
    icon: item.icon,
    path: `/workspace/settings?s=${item.key}`,
  })),
}));

const NAV: SidebarSection[] = [
  {
    title: 'MANAGEMENT',
    items: [
      ...SETTINGS_SIDEBAR_ITEMS,
      // People, roles and permissions were only reachable inside NexusHR, mixed
      // into employment records. "Who can get into my workspace" belongs to the
      // workspace console.
      { label: 'Team',         icon: 'users',     path: '/workspace/team'      },
      { label: 'Tools',        icon: 'tool',      path: '/workspace/utilities' },
      { label: 'Reports',      icon: 'activity',  path: '/workspace/reports'   },
      { label: 'Subscription', icon: 'creditCard',path: '/workspace/billing'   },
    ],
  },
];

export function AdminShell() {
  return (
    <WorkspaceApp appId="workspace">
      <div className="app-shell" data-workspace="true">
        <AppSidebar appId="workspace" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
          <Routes>
            <Route path="tenants"       element={<Navigate to="/admin" replace />} />
            <Route path="super"         element={<Navigate to="/admin" replace />} />
            <Route path="system-update" element={<Navigate to="/admin" replace />} />
            <Route path="setup"         element={<Navigate to="/workspace/settings?s=company" replace />} />
            {/* Bare /workspace (the app-switcher's own link, AppHeader.tsx)
                redirects with ?s=company rather than rendering Settings
                directly, so the sidebar's General group highlights on
                first paint instead of no item matching the query-less URL. */}
            <Route index element={<Navigate to="/workspace/settings?s=company" replace />} />
            <Route element={<PageLayout />}>
              <Route path="settings"  element={<RequireRoles roles={MGMT_ROLES}><Settings /></RequireRoles>} />
              <Route path="team"      element={<RequireRoles roles={MGMT_ROLES}><Team /></RequireRoles>} />
              <Route path="utilities" element={<RequireRoles roles={MGMT_ROLES}><Utilities /></RequireRoles>} />
              <Route path="reports"   element={<RequireRoles roles={[...MGMT_ROLES, 'FINANCE']}><Reports /></RequireRoles>} />
              <Route path="billing"   element={<RequireRoles roles={MGMT_ROLES}><Subscription /></RequireRoles>} />
            </Route>
            <Route path="*" element={<Navigate to="/workspace/settings?s=company" replace />} />
          </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

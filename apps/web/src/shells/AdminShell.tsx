import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/Workspace.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { MGMT_ROLES } from '../lib/permissions.js';

import { Settings }          from '../pages/Settings.js';
import { Utilities }         from '../pages/Utilities.js';
import { Reports }           from '../pages/Reports.js';
import { Subscription }      from '../pages/Subscription.js';

const NAV: SidebarSection[] = [
  {
    title: 'MANAGEMENT',
    items: [
      { label: 'Settings',     icon: 'settings',  path: '/workspace/settings'  },
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
            <Route path="setup"         element={<Navigate to="/workspace/settings" replace />} />
            <Route element={<PageLayout />}>
              <Route index element={<RequireRoles roles={MGMT_ROLES}><Settings /></RequireRoles>} />
              <Route path="settings"  element={<RequireRoles roles={MGMT_ROLES}><Settings /></RequireRoles>} />
              <Route path="utilities" element={<RequireRoles roles={MGMT_ROLES}><Utilities /></RequireRoles>} />
              <Route path="reports"   element={<RequireRoles roles={[...MGMT_ROLES, 'FINANCE']}><Reports /></RequireRoles>} />
              <Route path="billing"   element={<RequireRoles roles={MGMT_ROLES}><Subscription /></RequireRoles>} />
            </Route>
            <Route path="*" element={<Navigate to="/workspace/settings" replace />} />
          </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

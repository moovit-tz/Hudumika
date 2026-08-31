import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/Workspace.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
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
import { useAuth }           from '../hooks/useAuth.js';

export function AdminShell() {
  const { user } = useAuth();
  const isAdmin = !!user && MGMT_ROLES.includes(user.role as any);
  const hasApiKeysPermission = isAdmin || !!user?.org_permissions?.includes('api_keys.manage');

  const filteredSettingsNav = SETTINGS_NAV.map(g => {
    const items = g.items.filter(item => {
      if (item.key === 'developer-api') return hasApiKeysPermission;
      return isAdmin;
    });
    if (items.length === 0) return null;
    return { ...g, items };
  }).filter(Boolean) as typeof SETTINGS_NAV;

  const settingsSidebarItems: SidebarNavItem[] = filteredSettingsNav.map(g => ({
    label: g.group,
    icon: g.icon,
    path: `/workspace/settings?s=${g.items[0]?.key ?? ''}`,
    children: g.items.map(item => ({
      label: item.label,
      icon: item.icon,
      path: `/workspace/settings?s=${item.key}`,
    })),
  }));

  const nav: SidebarSection[] = [
    {
      title: 'MANAGEMENT',
      items: [
        ...settingsSidebarItems,
        ...(isAdmin ? [
          { label: 'Team',         icon: 'users' as const,     path: '/workspace/team'      },
          { label: 'Tools',        icon: 'tool' as const,      path: '/workspace/utilities' },
        ] : []),
        ...((isAdmin || user?.role === 'FINANCE') ? [
          { label: 'Reports',      icon: 'activity' as const,  path: '/workspace/reports'   },
        ] : []),
        ...(isAdmin ? [
          { label: 'Subscription', icon: 'creditCard' as const,path: '/workspace/billing'   },
        ] : []),
      ].filter(Boolean) as SidebarNavItem[],
    },
  ];

  return (
    <WorkspaceApp appId="workspace">
      <div className="app-shell" data-workspace="true">
        <AppSidebar appId="workspace" sections={nav} />
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
              <Route path="settings"  element={<RequireRoles roles={MGMT_ROLES} permissions={['api_keys.manage']}><Settings /></RequireRoles>} />
              <Route path="team"      element={<RequireRoles roles={MGMT_ROLES}><Team /></RequireRoles>} />
              <Route path="utilities" element={<RequireRoles roles={MGMT_ROLES}><Utilities /></RequireRoles>} />
              <Route path="reports"   element={<RequireRoles roles={[...MGMT_ROLES, 'FINANCE']}><Reports /></RequireRoles>} />
              <Route path="billing"   element={<RequireRoles roles={MGMT_ROLES}><Subscription /></RequireRoles>} />
            </Route>
            <Route path="*" element={<Navigate to="/workspace/settings?s=company" replace />} />
          </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

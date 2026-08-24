import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';

import { OneIdUsers } from '../pages/OneIdUsers.js';
import { OneIdSSO } from '../pages/OneIdSSO.js';
import { OneIdSessions } from '../pages/OneIdSessions.js';
import { OneIdLoginActivity } from '../pages/OneIdLoginActivity.js';

const ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Users',          icon: 'users',    path: '/ondi', exact: true },
      { label: 'SSO & Providers', icon: 'key',     path: '/ondi/sso' },
      { label: 'Sessions & Security', icon: 'shield', path: '/ondi/sessions' },
      { label: 'Login Activity', icon: 'clock',    path: '/ondi/login-activity' },
    ],
  },
];

export function OneIdShell() {
  return (
    <WorkspaceApp appId="oneid">
      <div className="app-shell" data-oneid="true">
        <AppSidebar appId="oneid" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<OneIdUsers />} />
                <Route path="sso" element={<RequireRoles roles={[...ADMIN_ROLES]}><OneIdSSO /></RequireRoles>} />
                <Route path="sessions" element={<RequireRoles roles={[...ADMIN_ROLES]}><OneIdSessions /></RequireRoles>} />
                <Route path="login-activity" element={<RequireRoles roles={[...ADMIN_ROLES]}><OneIdLoginActivity /></RequireRoles>} />
              </Route>
              <Route path="*" element={<Navigate to="/ondi" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

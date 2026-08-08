import { Routes, Route } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { Lens } from '../pages/Lens.js';

/**
 * Lens — the internal developer record.
 *
 * SUPER_ADMIN only, at both ends: the route guard here and
 * `requireRole('SUPER_ADMIN')` on every endpoint in lens.routes.ts. This is not
 * a tenant app and should never appear in a customer's launcher.
 */
const LENS_ROLES = ['SUPER_ADMIN'] as const;

const NAV: SidebarSection[] = [
  {
    title: 'Record',
    items: [
      { label: 'Board', icon: 'list', path: '/lens', exact: true },
    ],
  },
];

export function LensShell() {
  return (
    <WorkspaceApp appId="lens">
      <div className="app-shell">
        <AppSidebar appId="lens" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<RequireRoles roles={[...LENS_ROLES]}><Lens /></RequireRoles>} />
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

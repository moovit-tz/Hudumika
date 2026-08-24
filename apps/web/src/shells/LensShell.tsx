import { Routes, Route } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { Lens } from '../pages/Lens.js';
import { LensIntegrations } from '../pages/LensIntegrations.js';
import LensRoadmap from '../pages/LensRoadmap.js';
import LensCycles from '../pages/LensCycles.js';

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
    title: 'Planning',
    items: [
      { label: 'Roadmap', icon: 'map', path: '/lens/roadmap' },
      { label: 'Cycles', icon: 'calendar', path: '/lens/cycles' },
    ],
  },
  {
    title: 'Execution',
    items: [
      { label: 'Items', icon: 'columns', path: '/lens', exact: true },
    ],
  },
  {
    title: 'Setup',
    items: [
      { label: 'Integrations', icon: 'link', path: '/lens/integrations' },
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
                <Route path="roadmap" element={<RequireRoles roles={[...LENS_ROLES]}><LensRoadmap /></RequireRoles>} />
                <Route path="cycles" element={<RequireRoles roles={[...LENS_ROLES]}><LensCycles /></RequireRoles>} />
                <Route path="integrations" element={<RequireRoles roles={[...LENS_ROLES]}><LensIntegrations /></RequireRoles>} />
              </Route>
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

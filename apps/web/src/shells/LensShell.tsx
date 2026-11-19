import { Routes, Route } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { Lens } from '../pages/Lens.js';
import { LensItemDetail } from '../pages/LensItemDetail.js';
import { LensProjects } from '../pages/LensProjects.js';
import { LensRepositories } from '../pages/LensRepositories.js';
import { LensReleases } from '../pages/LensReleases.js';
import { LensSnapshots } from '../pages/LensSnapshots.js';
import { LensReports } from '../pages/LensReports.js';
import { LensIntegrations } from '../pages/LensIntegrations.js';
import LensRoadmap from '../pages/LensRoadmap.js';
import LensCycles from '../pages/LensCycles.js';
import '../pages/Lens.css';

/**
 * Lens — the internal developer and engineering management system.
 *
 * SUPER_ADMIN only, at both ends: the route guard here and
 * requireRole('SUPER_ADMIN') on management endpoints in lens.routes.ts.
 */
const LENS_ROLES = ['SUPER_ADMIN'] as const;

const NAV: SidebarSection[] = [
  {
    title: 'Planning',
    items: [
      { label: 'Projects', icon: 'folder', path: '/lens/projects' },
      { label: 'Roadmap', icon: 'map', path: '/lens/roadmap' },
      { label: 'Cycles', icon: 'calendar', path: '/lens/cycles' },
    ],
  },
  {
    title: 'Execution',
    items: [
      { label: 'Items', icon: 'columns', path: '/lens', exact: true },
      { label: 'Reports', icon: 'alertCircle', path: '/lens/reports' },
    ],
  },
  {
    title: 'Delivery',
    items: [
      { label: 'Releases', icon: 'box2', path: '/lens/releases' },
      { label: 'Repositories', icon: 'gitBranch', path: '/lens/repositories' },
      { label: 'Snapshots', icon: 'layers', path: '/lens/snapshots' },
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
      <div className="app-shell" data-lens="">
        <AppSidebar appId="lens" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<RequireRoles roles={[...LENS_ROLES]}><Lens /></RequireRoles>} />
                <Route path="items/:ref" element={<RequireRoles roles={[...LENS_ROLES]}><LensItemDetail /></RequireRoles>} />
                <Route path="projects" element={<RequireRoles roles={[...LENS_ROLES]}><LensProjects /></RequireRoles>} />
                <Route path="roadmap" element={<RequireRoles roles={[...LENS_ROLES]}><LensRoadmap /></RequireRoles>} />
                <Route path="cycles" element={<RequireRoles roles={[...LENS_ROLES]}><LensCycles /></RequireRoles>} />
                <Route path="reports" element={<RequireRoles roles={[...LENS_ROLES]}><LensReports /></RequireRoles>} />
                <Route path="releases" element={<RequireRoles roles={[...LENS_ROLES]}><LensReleases /></RequireRoles>} />
                <Route path="repositories" element={<RequireRoles roles={[...LENS_ROLES]}><LensRepositories /></RequireRoles>} />
                <Route path="snapshots" element={<RequireRoles roles={[...LENS_ROLES]}><LensSnapshots /></RequireRoles>} />
                <Route path="integrations" element={<RequireRoles roles={[...LENS_ROLES]}><LensIntegrations /></RequireRoles>} />
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

export default LensShell;

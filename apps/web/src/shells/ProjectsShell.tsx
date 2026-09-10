import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { PageLayout } from '../components/PageLayout.js';
import { ProjectsApp } from '../pages/ProjectsApp.js';
import { Contracts } from '../pages/Contracts.js';
import { ContractDetail } from '../pages/ContractDetail.js';

// Hudumika Project OS — Enterprise project operations, EVM, governance,
// procurement, heavy machinery fleet, and industry packs.
//
// TEMPORARY MITIGATION (see docs/project-os-hardening-review.md Round 4):
// the Command Center / Portfolios / Resources views call `/v1/project-os/*`,
// which currently 500s on every request (the routes/services/client.ts were
// built against a schema that was never migrated). Landing `/projects` on
// the Command Center left the whole app stuck on an infinite spinner. Until
// that API is reconciled, `/projects` renders the working project list and
// the dead Project OS views are kept routed (for whoever fixes the API to
// test against) but pulled out of the nav. Restore the two-group NAV +
// `initialMode="command_center"` index once `/v1/project-os` runs.
const NAV: SidebarSection[] = [
  {
    title: 'Operations & Commercial',
    items: [
      { label: 'Projects', icon: 'briefcase', path: '/projects', exact: true },
      { label: 'Contracts & Tenders', icon: 'fileText', path: '/projects/contracts' },
    ],
  },
];

export function ProjectsShell() {
  return (
    <WorkspaceApp appId="projects">
      <div className="app-shell">
        <AppSidebar appId="projects" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                {/* index → working project list (was `command_center`, which 500s — see NAV comment) */}
                <Route index element={<ProjectsApp initialMode="projects_list" />} />
                <Route path="all" element={<ProjectsApp initialMode="projects_list" />} />
                {/* Project OS views kept routed but out of nav until /v1/project-os is reconciled */}
                <Route path="command-center" element={<ProjectsApp initialMode="command_center" />} />
                <Route path="portfolios" element={<ProjectsApp initialMode="portfolios" />} />
                <Route path="resources" element={<ProjectsApp initialMode="resources" />} />
                <Route path="contracts" element={<Contracts />} />
                <Route path="contracts/:id" element={<ContractDetail />} />
                <Route path="*" element={<Navigate to="/projects" replace />} />
              </Route>
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

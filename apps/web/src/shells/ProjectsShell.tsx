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
const NAV: SidebarSection[] = [
  {
    title: 'Executive & Strategy',
    items: [
      { label: 'Command Center', icon: 'activity', path: '/projects', exact: true },
      { label: 'Portfolios & Programs', icon: 'layers', path: '/projects/portfolios' },
      { label: 'Heavy Machinery & Fleet', icon: 'truck', path: '/projects/resources' },
    ],
  },
  {
    title: 'Operations & Commercial',
    items: [
      { label: 'Projects Directory', icon: 'briefcase', path: '/projects/all' },
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
                <Route index element={<ProjectsApp initialMode="command_center" />} />
                <Route path="all" element={<ProjectsApp initialMode="projects_list" />} />
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

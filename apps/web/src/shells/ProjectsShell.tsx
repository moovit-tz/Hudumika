import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { ProjectsApp } from '../pages/ProjectsApp.js';
import { Contracts } from '../pages/Contracts.js';
import { ContractDetail } from '../pages/ContractDetail.js';

// Standalone Projects app (migration 313) — enterprise project management,
// gated behind the 'projects' (HuduPlus+) entitlement. Nav grows as the
// program's later milestones ship.
const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Projects', icon: 'briefcase', path: '/projects', exact: true },
      { label: 'Contracts', icon: 'fileText', path: '/projects/contracts' },
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
              <Route index element={<ProjectsApp />} />
              <Route path="contracts" element={<Contracts />} />
              <Route path="contracts/:id" element={<ContractDetail />} />
              <Route path="*" element={<Navigate to="/projects" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

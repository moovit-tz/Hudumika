import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { PageLayout } from '../components/PageLayout.js';
import { Contracts } from '../pages/Contracts.js';
import { ContractDetail } from '../pages/ContractDetail.js';
import { ProjectCreatePage } from '../pages/projects/ProjectCreatePage.js';
import { ProjectEditPage } from '../pages/projects/ProjectEditPage.js';
import { ProjectDashboard } from '../pages/projects/ProjectDashboard.js';
import { ProjectDirectory } from '../pages/projects/ProjectDirectory.js';
import { ProjectPortfoliosPage } from '../pages/projects/ProjectPortfoliosPage.js';
import { ProjectTimeline } from '../pages/projects/ProjectTimeline.js';
import { ProjectMyTasks } from '../pages/projects/ProjectMyTasks.js';
import { ProjectMilestonesPage } from '../pages/projects/ProjectMilestonesPage.js';
import { ProjectBudgetsPage } from '../pages/projects/ProjectBudgetsPage.js';
import { ProjectProcurementPage } from '../pages/projects/ProjectProcurementPage.js';
import { ProjectRisksPage } from '../pages/projects/ProjectRisksPage.js';
import { ProjectApprovalsPage } from '../pages/projects/ProjectApprovalsPage.js';
import { ProjectReportsPage } from '../pages/projects/ProjectReportsPage.js';
import { ProjectTeamPage } from '../pages/projects/ProjectTeamPage.js';
import { ProjectEquipmentPage } from '../pages/projects/ProjectEquipmentPage.js';
import { ProjectDocumentsPage } from '../pages/projects/ProjectDocumentsPage.js';
import { ProjectWorkspace } from '../pages/projects/ProjectWorkspace.js';

const NAV: SidebarSection[] = [
  {
    title: 'Overview',
    items: [
      { label: 'Dashboard', icon: 'activity', path: '/projects', exact: true },
      { label: 'All Projects', icon: 'briefcase', path: '/projects/directory' },
      { label: 'Portfolios', icon: 'layers', path: '/projects/portfolios' },
    ],
  },
  {
    title: 'Planning',
    items: [
      { label: 'Timeline', icon: 'calendar', path: '/projects/timeline' },
      { label: 'My Tasks', icon: 'checkCircle', path: '/projects/tasks' },
      { label: 'Milestones', icon: 'flag', path: '/projects/milestones' },
    ],
  },
  {
    title: 'Financial',
    items: [
      { label: 'Budgets', icon: 'dollarSign', path: '/projects/budgets' },
      { label: 'Contracts', icon: 'fileText', path: '/projects/contracts' },
      { label: 'Procurement', icon: 'shoppingCart', path: '/projects/procurement' },
    ],
  },
  {
    title: 'Controls',
    items: [
      { label: 'Risk Register', icon: 'shield', path: '/projects/risks' },
      { label: 'Approvals', icon: 'clipboardList', path: '/projects/approvals' },
      { label: 'Reports', icon: 'barChart2', path: '/projects/reports' },
    ],
  },
  {
    title: 'Resources',
    items: [
      { label: 'Team & Workload', icon: 'users', path: '/projects/team' },
      { label: 'Equipment', icon: 'tool', path: '/projects/equipment' },
      { label: 'Documents', icon: 'archive', path: '/projects/documents' },
    ],
  },
];

export function ProjectsShell() {
  return (
    <WorkspaceApp appId="projects">
      <div className="app-shell">
        <AppSidebar
          appId="projects"
          sections={NAV}
        />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                {/* Overview */}
                <Route index element={<ProjectDashboard />} />
                <Route path="new" element={<ProjectCreatePage />} />
                <Route path="directory" element={<ProjectDirectory />} />
                <Route path="portfolios" element={<ProjectPortfoliosPage />} />

                {/* Planning */}
                <Route path="timeline" element={<ProjectTimeline />} />
                <Route path="tasks" element={<ProjectMyTasks />} />
                <Route path="milestones" element={<ProjectMilestonesPage />} />

                {/* Financial */}
                <Route path="budgets" element={<ProjectBudgetsPage />} />
                <Route path="contracts" element={<Contracts />} />
                <Route path="contracts/:id" element={<ContractDetail />} />
                <Route path="procurement" element={<ProjectProcurementPage />} />

                {/* Controls */}
                <Route path="risks" element={<ProjectRisksPage />} />
                <Route path="approvals" element={<ProjectApprovalsPage />} />
                <Route path="reports" element={<ProjectReportsPage />} />

                {/* Resources */}
                <Route path="team" element={<ProjectTeamPage />} />
                <Route path="equipment" element={<ProjectEquipmentPage />} />
                <Route path="documents" element={<ProjectDocumentsPage />} />

                {/* Individual project workspace */}
                <Route path=":id/edit" element={<ProjectEditPage />} />
                <Route path=":id" element={<ProjectWorkspace />} />
                <Route path=":id/:tab" element={<ProjectWorkspace />} />

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

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { lazyPage } from '../lib/lazyPage.js';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { PageLayout } from '../components/PageLayout.js';

// Each page loads when its route is opened (perf audit 2026-11-16).
const Contracts = lazyPage(() => import('../pages/Contracts.js'), 'Contracts');
const ContractDetail = lazyPage(() => import('../pages/ContractDetail.js'), 'ContractDetail');
const ProjectCreatePage = lazyPage(() => import('../pages/projects/ProjectCreatePage.js'), 'ProjectCreatePage');
const ProjectEditPage = lazyPage(() => import('../pages/projects/ProjectEditPage.js'), 'ProjectEditPage');
const ProjectDashboard = lazyPage(() => import('../pages/projects/ProjectDashboard.js'), 'ProjectDashboard');
const ProjectDirectory = lazyPage(() => import('../pages/projects/ProjectDirectory.js'), 'ProjectDirectory');
const ProjectPortfoliosPage = lazyPage(() => import('../pages/projects/ProjectPortfoliosPage.js'), 'ProjectPortfoliosPage');
const ProjectTimeline = lazyPage(() => import('../pages/projects/ProjectTimeline.js'), 'ProjectTimeline');
const ProjectMyTasks = lazyPage(() => import('../pages/projects/ProjectMyTasks.js'), 'ProjectMyTasks');
const ProjectMilestonesPage = lazyPage(() => import('../pages/projects/ProjectMilestonesPage.js'), 'ProjectMilestonesPage');
const ProjectBudgetsPage = lazyPage(() => import('../pages/projects/ProjectBudgetsPage.js'), 'ProjectBudgetsPage');
const ProjectProcurementPage = lazyPage(() => import('../pages/projects/ProjectProcurementPage.js'), 'ProjectProcurementPage');
const ProjectRisksPage = lazyPage(() => import('../pages/projects/ProjectRisksPage.js'), 'ProjectRisksPage');
const ProjectApprovalsPage = lazyPage(() => import('../pages/projects/ProjectApprovalsPage.js'), 'ProjectApprovalsPage');
const ProjectReportsPage = lazyPage(() => import('../pages/projects/ProjectReportsPage.js'), 'ProjectReportsPage');
const ProjectTeamPage = lazyPage(() => import('../pages/projects/ProjectTeamPage.js'), 'ProjectTeamPage');
const ProjectEquipmentPage = lazyPage(() => import('../pages/projects/ProjectEquipmentPage.js'), 'ProjectEquipmentPage');
const ProjectDocumentsPage = lazyPage(() => import('../pages/projects/ProjectDocumentsPage.js'), 'ProjectDocumentsPage');
const ProjectWorkspace = lazyPage(() => import('../pages/projects/ProjectWorkspace.js'), 'ProjectWorkspace');
const EquipmentAssetPage = lazyPage(() => import('../pages/projects/equipment/EquipmentAssetPage.js'), 'EquipmentAssetPage');
const EquipmentAssetFormPage = lazyPage(() => import('../pages/projects/equipment/EquipmentAssetFormPage.js'), 'EquipmentAssetFormPage');
const EquipmentImportPage = lazyPage(() => import('../pages/projects/equipment/EquipmentImportPage.js'), 'EquipmentImportPage');

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
                <Route path="equipment/new" element={<EquipmentAssetFormPage />} />
                <Route path="equipment/import" element={<EquipmentImportPage />} />
                <Route path="equipment/:assetId" element={<EquipmentAssetPage />} />
                <Route path="equipment/:assetId/edit" element={<EquipmentAssetFormPage />} />
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

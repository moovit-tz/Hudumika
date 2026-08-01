import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { StudioDashboard } from '../pages/studio/StudioDashboard.js';
import { WorkflowList }    from '../pages/studio/WorkflowList.js';
import { WorkflowNew }     from '../pages/studio/WorkflowNew.js';
import { WorkflowEditor }  from '../pages/studio/WorkflowEditor.js';
import { TemplateGallery } from '../pages/studio/TemplateGallery.js';
import { CatalogPage }     from '../pages/studio/CatalogPage.js';
import { RunsPage }        from '../pages/studio/RunsPage.js';

/**
 * Studio's sidebar. The per-app entries are deep links into the same workflow
 * list with `?app=` — Studio does not hold a separate page per app, so adding
 * an app to the platform never means adding a page here.
 */
const NAV: SidebarSection[] = [
  { items: [{ label: 'Dashboard', icon: 'home', path: '/studio', exact: true }] },
  {
    title: 'BUILD',
    items: [
      { label: 'Workflows',  icon: 'gitBranch', path: '/studio/workflows' },
      { label: 'New workflow', icon: 'plus',    path: '/studio/new' },
      { label: 'Templates',  icon: 'copy',      path: '/studio/templates' },
    ],
  },
  {
    title: 'MONITOR',
    items: [{ label: 'Runs', icon: 'clock', path: '/studio/runs' }],
  },
  {
    title: 'REFERENCE',
    items: [{ label: 'Triggers & Actions', icon: 'layers', path: '/studio/catalog' }],
  },
  {
    title: 'BY APP',
    items: [
      { label: 'ClearOS',      icon: 'layers',        path: '/studio/workflows?app=clearos' },
      { label: 'SEAL',         icon: 'package',       path: '/studio/workflows?app=seal' },
      { label: 'FinOps',       icon: 'dollarSign',    path: '/studio/workflows?app=finops' },
      { label: 'Bliss',        icon: 'chatBubble',    path: '/studio/workflows?app=bliss' },
      { label: 'HuduFreight',  icon: 'truck',         path: '/studio/workflows?app=tracking' },
      { label: 'CargoTracker', icon: 'alertTriangle', path: '/studio/workflows?app=cargotracker' },
      { label: 'NexusHR',      icon: 'users',         path: '/studio/workflows?app=onepi' },
    ],
  },
];

export function StudioShell() {
  return (
    <WorkspaceApp appId="studio">
      <div className="app-shell">
        <AppSidebar appId="studio" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              {/* The editor sits outside PageLayout: it manages its own
                  full-height three-column layout and its own scrolling. */}
              <Route path="w/:id" element={<WorkflowEditor />} />
              <Route element={<PageLayout />}>
                <Route index element={<StudioDashboard />} />
                <Route path="workflows" element={<WorkflowList />} />
                <Route path="new"       element={<WorkflowNew />} />
                <Route path="templates" element={<TemplateGallery />} />
                <Route path="runs"      element={<RunsPage />} />
                <Route path="catalog"   element={<CatalogPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/studio" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

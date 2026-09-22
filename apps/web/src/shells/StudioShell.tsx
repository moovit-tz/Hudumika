import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { StudioDashboard } from '../pages/studio/StudioDashboard.js';
import { WorkflowList }    from '../pages/studio/WorkflowList.js';
import { WorkflowNew }     from '../pages/studio/WorkflowNew.js';
import { WorkflowEditor }  from '../pages/studio/WorkflowEditor.js';
// The clearance-workflow designer, moved here from ClearOS. It is a
// genuinely different thing from the automations above — it defines the
// stages a shipment moves through, and shipment_cases.workflow_step_id
// points straight at its steps — so it keeps its own model and its own
// editor rather than being folded into the trigger/action canvas. What it
// gains from living in Studio is the shell, the nav and one place to build.
import { ClearanceWorkflowList }    from '../pages/studio/ClearanceWorkflowList.js';
import { ClearanceWorkflowBuilder } from '../pages/studio/ClearanceWorkflowBuilder.js';
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
      { label: 'Automations', icon: 'gitBranch', path: '/studio/workflows' },
      { label: 'New automation', icon: 'plus',   path: '/studio/new' },
      { label: 'Clearance workflows', icon: 'layers', path: '/studio/clearance' },
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
    // Every entry here must correspond to an app id that actually has at
    // least one real trigger or action registered (studio/triggers.ts /
    // actions.ts) — otherwise it's a sidebar link to a permanently empty
    // list, which is exactly the bug NexusHR had: this pointed at
    // ?app=onepi, an id nothing in the registry has ever used (the real id
    // is 'nexushr' — 'onepi' looks like a leftover from a rename), so the
    // link showed zero workflows regardless of how many NexusHR ones
    // existed. crm/cargotracker/inventory are deliberately not listed:
    // they have zero registered triggers or actions right now, so a link
    // to them would have the identical problem.
    title: 'BY APP',
    items: [
      { label: 'ClearOS',      icon: 'layers',        path: '/studio/workflows?app=clearos' },
      { label: 'SEAL',         icon: 'package',       path: '/studio/workflows?app=seal' },
      { label: 'FinOps',       icon: 'dollarSign',    path: '/studio/workflows?app=finops' },
      { label: 'Bliss',        icon: 'chatBubble',    path: '/studio/workflows?app=bliss' },
      { label: 'HuduFreight',  icon: 'truck',         path: '/studio/workflows?app=tracking' },
      { label: 'NexusHR',      icon: 'users',         path: '/studio/workflows?app=nexushr' },
      { label: 'ComplyOS',     icon: 'shield',        path: '/studio/workflows?app=complyos' },
      { label: 'Ondi',         icon: 'key',           path: '/studio/workflows?app=ondi' },
      { label: 'Cloud',        icon: 'folder',        path: '/studio/workflows?app=cloud' },
      { label: 'Onsite',       icon: 'monitor',       path: '/studio/workflows?app=onsite' },
      { label: 'Tasks',        icon: 'tasks',         path: '/studio/workflows?app=tasks' },
      { label: 'Admin',        icon: 'settings',      path: '/studio/workflows?app=workspace' },
    ],
  },
];

export function StudioShell() {
  return (
    <WorkspaceApp appId="studio">
      <div className="app-shell" data-studio="true">
        <AppSidebar appId="studio" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              {/* The editor sits outside PageLayout: it manages its own
                  full-height three-column layout and its own scrolling. */}
              <Route path="w/:id" element={<WorkflowEditor />} />
              {/* Outside PageLayout for the same reason as the editor above:
                  the builder canvas manages its own full-height layout. */}
              <Route path="clearance/new"     element={<ClearanceWorkflowBuilder />} />
              <Route path="clearance/:id"     element={<ClearanceWorkflowBuilder />} />
              <Route element={<PageLayout />}>
                <Route index element={<StudioDashboard />} />
                <Route path="workflows" element={<WorkflowList />} />
                <Route path="clearance" element={<ClearanceWorkflowList />} />
                <Route path="new"       element={<WorkflowNew />} />
                <Route path="templates" element={<TemplateGallery />} />
                <Route path="runs"      element={<RunsPage />} />
                <Route path="catalog"   element={<CatalogPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/studio" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

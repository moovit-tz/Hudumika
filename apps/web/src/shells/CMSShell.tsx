import { Routes, Route } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { useAuth } from '../hooks/useAuth.js';
import { CMS } from '../pages/CMS.js';
import { CMSContentModelsList, CMSContentModelDetail } from '../pages/CMSContentModels.js';
import { CMSContentEntries } from '../pages/CMSContentEntries.js';
import { CMSComponentsList, CMSComponentDetail } from '../pages/CMSComponents.js';
import { CMSFormsList, CMSFormDetail } from '../pages/CMSForms.js';
import { CMSExperimentsList, CMSExperimentDetail } from '../pages/CMSExperiments.js';
import { CMSMedia } from '../pages/CMSMedia.js';
import { CMSNavigation } from '../pages/CMSNavigation.js';
import { CMSWebhooks } from '../pages/CMSWebhooks.js';
import { CMSPermissions } from '../pages/CMSPermissions.js';
import { CMSSites } from '../pages/CMSSites.js';
import { CMSWorkflow } from '../pages/CMSWorkflow.js';
import { CMSApprovals } from '../pages/CMSApprovals.js';
import { CMSReleases } from '../pages/CMSReleases.js';

// CMS.tsx switches its own views via a ?v= query param (not nested routes),
// so basic content views point at the /cms index route with a different query param.
// Deep tools (Models, Components, Sites, Workflow, Approvals, Releases, Media, Webhooks)
// use dedicated nested routes.
function buildNav(isAdmin: boolean): SidebarSection[] {
  return [
    {
      title: 'Content',
      items: [
        { label: 'Dashboard', icon: 'home',          path: '/cms?v=dashboard', exact: true },
        { label: 'Posts',     icon: 'fileText',      path: '/cms?v=posts' },
        { label: 'Pages',     icon: 'file',          path: '/cms?v=pages' },
        { label: 'Comments',  icon: 'messageSquare', path: '/cms?v=comments' },
        { label: 'Content Models', icon: 'layers',   path: '/cms/models' },
        { label: 'Components', icon: 'copy',         path: '/cms/components' },
        { label: 'Forms',      icon: 'clipboardList', path: '/cms/forms' },
        { label: 'Experiments', icon: 'barChart',    path: '/cms/experiments' },
        { label: 'Media',      icon: 'image',        path: '/cms/media' },
        { label: 'Navigation', icon: 'menu',         path: '/cms/navigation' },
      ],
    },
    {
      title: 'Enterprise & Editorial',
      items: [
        { label: 'Multisite', icon: 'globe',         path: '/cms/sites' },
        { label: 'Approvals', icon: 'checkCircle',   path: '/cms/approvals' },
        { label: 'Releases',  icon: 'package',       path: '/cms/releases' },
        { label: 'Workflow',  icon: 'gitBranch',     path: '/cms/workflow' },
        { label: 'Webhooks',  icon: 'zap',           path: '/cms/webhooks' },
        // §74 — configuring permissions is ADMIN-only server-side; hiding
        // the entry for everyone else avoids a 403 the moment they click it.
        ...(isAdmin ? [{ label: 'Permissions', icon: 'shield' as const, path: '/cms/permissions' }] : []),
        { label: 'Customize', icon: 'settings',      path: '/cms?v=customize' },
      ],
    },
  ];
}

// §74 — same admin-equivalence list cms.routes.ts's own hook checks.
const CMS_ADMIN_ROLES = ['ADMIN', 'TENANT_ADMIN'];

export function CMSShell() {
  const { user } = useAuth();
  const NAV = buildNav(!!user && CMS_ADMIN_ROLES.includes(user.role));
  return (
    <WorkspaceApp appId="onesite">
      <div className="app-shell" data-cms="true">
        <AppSidebar appId="onesite" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<CMS />} />
                <Route path="models" element={<CMSContentModelsList />} />
                <Route path="models/:modelId" element={<CMSContentModelDetail />} />
                <Route path="models/:modelId/entries" element={<CMSContentEntries />} />
                <Route path="components" element={<CMSComponentsList />} />
                <Route path="components/:componentId" element={<CMSComponentDetail />} />
                <Route path="forms" element={<CMSFormsList />} />
                <Route path="forms/:formId" element={<CMSFormDetail />} />
                <Route path="experiments" element={<CMSExperimentsList />} />
                <Route path="experiments/:experimentId" element={<CMSExperimentDetail />} />
                <Route path="media" element={<CMSMedia />} />
                <Route path="navigation" element={<CMSNavigation />} />
                <Route path="sites" element={<CMSSites />} />
                <Route path="workflow" element={<CMSWorkflow />} />
                <Route path="approvals" element={<CMSApprovals />} />
                <Route path="releases" element={<CMSReleases />} />
                <Route path="webhooks" element={<CMSWebhooks />} />
                <Route path="permissions" element={<CMSPermissions />} />
              </Route>
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

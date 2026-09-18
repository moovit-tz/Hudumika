import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/CRM.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { MGMT_ROLES, CRM_ROLES } from '../lib/permissions.js';

import { CustomerOverview }   from '../pages/CustomerOverview.js';
import { Customers }          from '../pages/Customers.js';
import { CustomerBulkUpload } from '../pages/CustomerBulkUpload.js';
import { CustomerOnboarding } from '../pages/CustomerOnboarding.js';
import { Leads }              from '../pages/Leads.js';
import { Pipeline }           from '../pages/Pipeline.js';
import { Sales }              from '../pages/Sales.js';
import { CrmChainPartners }     from '../pages/CrmChainPartners.js';
import { CrmDuplicates }        from '../pages/CrmDuplicates.js';
import { CrmSmartViews }         from '../pages/CrmSmartViews.js';
import { CrmCustomFields }        from '../pages/CrmCustomFields.js';
import { CrmLeadScoring }          from '../pages/CrmLeadScoring.js';
import { CrmPipelineStages }        from '../pages/CrmPipelineStages.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview', icon: 'home', path: '/crm/overview' },
    ],
  },
  {
    title: 'CUSTOMERS & PARTNERS',
    items: [
      { label: 'Customers',      icon: 'users',      path: '/crm/customers' },
      { label: 'Partners Directory', icon: 'link', path: '/crm/chain-partners' },
      { label: 'Leads',          icon: 'userPlus',   path: '/crm/leads'     },
      { label: 'Pipeline',       icon: 'briefcase',  path: '/crm/pipeline'  },
      { label: 'Sales',          icon: 'trendingUp', path: '/crm/sales'     },
      { label: 'Saved Views',    icon: 'filter',     path: '/crm/saved-views' },
      { label: 'Duplicates',     icon: 'copy',       path: '/crm/duplicates' },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: 'Pipeline Stages', icon: 'flag', path: '/crm/pipeline-stages' },
      { label: 'Custom Fields', icon: 'settings', path: '/crm/custom-fields' },
      { label: 'Lead Scoring',  icon: 'trendingUp', path: '/crm/lead-scoring' },
    ],
  },
];

export function CRMShell() {
  return (
    <WorkspaceApp appId="crm">
      <div className="app-shell" data-crm="true">
        <AppSidebar appId="crm" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
          <Routes>
            <Route index element={<Navigate to="customers" replace />} />

            <Route element={<PageLayout />}>
              <Route path="overview"      element={<RequireRoles roles={CRM_ROLES}><CustomerOverview /></RequireRoles>} />
              <Route path="customers"     element={<RequireRoles roles={CRM_ROLES}><Customers /></RequireRoles>} />
              <Route path="chain-partners" element={<RequireRoles roles={CRM_ROLES}><CrmChainPartners /></RequireRoles>} />
              <Route path="customers/bulk-upload" element={<RequireRoles roles={CRM_ROLES}><CustomerBulkUpload /></RequireRoles>} />
              <Route path="customers/new" element={<RequireRoles roles={CRM_ROLES}><CustomerOnboarding /></RequireRoles>} />
              <Route path="leads"         element={<RequireRoles roles={[...MGMT_ROLES, 'SALES']}><Leads /></RequireRoles>} />
              <Route path="pipeline"      element={<RequireRoles roles={[...MGMT_ROLES, 'SALES']}><Pipeline /></RequireRoles>} />
              <Route path="sales"         element={<RequireRoles roles={CRM_ROLES}><Sales /></RequireRoles>} />
              <Route path="saved-views"   element={<RequireRoles roles={[...MGMT_ROLES, 'SALES']}><CrmSmartViews /></RequireRoles>} />
              <Route path="custom-fields" element={<RequireRoles roles={MGMT_ROLES}><CrmCustomFields /></RequireRoles>} />
              <Route path="lead-scoring"  element={<RequireRoles roles={MGMT_ROLES}><CrmLeadScoring /></RequireRoles>} />
              <Route path="pipeline-stages" element={<RequireRoles roles={MGMT_ROLES}><CrmPipelineStages /></RequireRoles>} />
              <Route path="duplicates"    element={<RequireRoles roles={MGMT_ROLES}><CrmDuplicates /></RequireRoles>} />
            </Route>

            <Route path="*" element={<Navigate to="/crm/customers" replace />} />
          </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

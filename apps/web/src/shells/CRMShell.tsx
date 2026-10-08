import { Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import { CustomerDetailPage } from '../pages/customers/CustomerDetailPage.js';
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
import { CrmAssignmentRules }       from '../pages/CrmAssignmentRules.js';
import { CrmQuotaTargets }          from '../pages/CrmQuotaTargets.js';
import { CrmTerritories }           from '../pages/CrmTerritories.js';
import { CrmLeadStages }            from '../pages/CrmLeadStages.js';
import { CrmTerminology }           from '../pages/CrmTerminology.js';
import { CrmVendors, CrmVendorRecord } from '../pages/CrmVendors.js';

/* /crm/leads/:id → /crm/leads?lead=:id (opens the lead profile directly) */
function LeadsWithId() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/crm/leads?lead=${id}`} replace />;
}

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview', icon: 'home', path: '/crm/overview' },
    ],
  },
  {
    title: 'CUSTOMERS & PARTNERS',
    items: [
      {
        label: 'Customers', icon: 'users', path: '/crm/customers',
        children: [
          { label: 'Customers',          icon: 'users',    path: '/crm/customers'      },
          { label: 'Partners Directory', icon: 'link',     path: '/crm/chain-partners' },
          { label: 'Vendors', icon: 'users', path: '/crm/vendors' },
          { label: 'Leads',              icon: 'userPlus', path: '/crm/leads'          },
        ],
      },
      {
        label: 'Opportunities', icon: 'briefcase', path: '/crm/opportunities',
        children: [
          { label: 'Pipeline',    icon: 'briefcase',  path: '/crm/opportunities' },
          { label: 'Quotes',      icon: 'trendingUp', path: '/crm/quotes'        },
        ],
      },
    ],
  },
  {
    title: 'DATA QUALITY',
    items: [
      { label: 'Duplicates', icon: 'copy', path: '/crm/duplicates' },
    ],
  },
  {
    title: 'SETTINGS',
    items: [
      { label: 'Lead Stages',         icon: 'layers',       path: '/crm/lead-stages'        },
      { label: 'Pipeline Stages',    icon: 'flag',         path: '/crm/pipeline-stages'    },
      { label: 'Custom Fields',      icon: 'settings',     path: '/crm/custom-fields'      },
      { label: 'Lead Scoring',       icon: 'trendingUp',   path: '/crm/lead-scoring'       },
      { label: 'Assignment Rules',   icon: 'share',        path: '/crm/assignment-rules'   },
      { label: 'Quota Targets',      icon: 'target',       path: '/crm/quota-targets'      },
      { label: 'Territories',        icon: 'mapPin',       path: '/crm/territories'        },
      { label: 'Terminology',        icon: 'type',         path: '/crm/terminology'        },
      { label: 'Saved Views',        icon: 'filter',       path: '/crm/saved-views'        },
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
            <Route index element={<Navigate to="overview" replace />} />

            <Route element={<PageLayout />}>
              <Route path="overview"      element={<RequireRoles roles={CRM_ROLES}><CustomerOverview /></RequireRoles>} />
              <Route path="customers"             element={<RequireRoles roles={CRM_ROLES}><Customers /></RequireRoles>} />
              <Route path="customers/bulk-upload" element={<RequireRoles roles={CRM_ROLES}><CustomerBulkUpload /></RequireRoles>} />
              <Route path="customers/new"         element={<RequireRoles roles={CRM_ROLES}><CustomerOnboarding /></RequireRoles>} />
              <Route path="customers/:id"         element={<RequireRoles roles={CRM_ROLES}><CustomerDetailPage /></RequireRoles>} />
              <Route path="customers/:id/:tab"    element={<RequireRoles roles={CRM_ROLES}><CustomerDetailPage /></RequireRoles>} />
              <Route path="chain-partners"        element={<RequireRoles roles={CRM_ROLES}><CrmChainPartners /></RequireRoles>} />
              <Route path="chain-partners/new"    element={<RequireRoles roles={CRM_ROLES}><CrmChainPartners /></RequireRoles>} />
              <Route path="chain-partners/:id"    element={<RequireRoles roles={CRM_ROLES}><CrmChainPartners /></RequireRoles>} />
              <Route path="leads"         element={<RequireRoles roles={[...MGMT_ROLES, 'SALES']}><Leads /></RequireRoles>} />
              <Route path="leads/:id"     element={<RequireRoles roles={[...MGMT_ROLES, 'SALES']}><LeadsWithId /></RequireRoles>} />
              <Route path="vendors" element={<RequireRoles roles={CRM_ROLES}><CrmVendors /></RequireRoles>} />
              <Route path="vendors/new" element={<RequireRoles roles={CRM_ROLES}><CrmVendorRecord /></RequireRoles>} />
              <Route path="vendors/:id" element={<RequireRoles roles={CRM_ROLES}><CrmVendorRecord /></RequireRoles>} />
              <Route path="opportunities" element={<RequireRoles roles={[...MGMT_ROLES, 'SALES']}><Pipeline /></RequireRoles>} />
              <Route path="pipeline"     element={<Navigate to="/crm/opportunities" replace />} />
              <Route path="quotes"       element={<RequireRoles roles={CRM_ROLES}><Sales /></RequireRoles>} />
              <Route path="sales"        element={<Navigate to="/crm/quotes" replace />} />
              <Route path="saved-views"  element={<RequireRoles roles={[...MGMT_ROLES, 'SALES']}><CrmSmartViews /></RequireRoles>} />
              <Route path="custom-fields" element={<RequireRoles roles={MGMT_ROLES}><CrmCustomFields /></RequireRoles>} />
              <Route path="lead-scoring"      element={<RequireRoles roles={MGMT_ROLES}><CrmLeadScoring /></RequireRoles>} />
              <Route path="pipeline-stages"   element={<RequireRoles roles={MGMT_ROLES}><CrmPipelineStages /></RequireRoles>} />
              <Route path="lead-stages"       element={<RequireRoles roles={MGMT_ROLES}><CrmLeadStages /></RequireRoles>} />
              <Route path="assignment-rules"  element={<RequireRoles roles={MGMT_ROLES}><CrmAssignmentRules /></RequireRoles>} />
              <Route path="quota-targets"     element={<RequireRoles roles={MGMT_ROLES}><CrmQuotaTargets /></RequireRoles>} />
              <Route path="territories"       element={<RequireRoles roles={MGMT_ROLES}><CrmTerritories /></RequireRoles>} />
              <Route path="terminology"       element={<RequireRoles roles={MGMT_ROLES}><CrmTerminology /></RequireRoles>} />
              <Route path="duplicates"    element={<RequireRoles roles={MGMT_ROLES}><CrmDuplicates /></RequireRoles>} />
            </Route>

            <Route path="*" element={<Navigate to="/crm/overview" replace />} />
          </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

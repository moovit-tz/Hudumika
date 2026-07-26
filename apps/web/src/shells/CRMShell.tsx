import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/CRM.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { MGMT_ROLES, CRM_ROLES } from '../lib/permissions.js';

import { CustomerOverview }   from '../pages/CustomerOverview.js';
import { Customers }          from '../pages/Customers.js';
import { CustomerBulkUpload } from '../pages/CustomerBulkUpload.js';
import { Leads }              from '../pages/Leads.js';
import { Sales }              from '../pages/Sales.js';
import { CrmChainPartners }     from '../pages/CrmChainPartners.js';

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
      { label: 'Chain Partners', icon: 'link',     path: '/crm/chain-partners' },
      { label: 'Leads',          icon: 'userPlus',   path: '/crm/leads'     },
      { label: 'Sales',          icon: 'trendingUp', path: '/crm/sales'     },
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
              <Route path="leads"         element={<RequireRoles roles={[...MGMT_ROLES, 'SALES']}><Leads /></RequireRoles>} />
              <Route path="sales"         element={<RequireRoles roles={CRM_ROLES}><Sales /></RequireRoles>} />
            </Route>

            <Route path="*" element={<Navigate to="/crm/customers" replace />} />
          </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

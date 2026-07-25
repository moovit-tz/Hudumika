import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/ClearOS.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { OPS_ROLES, MGMT_ROLES } from '../lib/permissions.js';

import { CommandCenter }    from '../pages/CommandCenter.js';
import { ClearOSLanding }   from '../pages/ClearOSLanding.js';
import { CreateShipmentPage } from '../pages/CreateShipmentPage.js';
import { ShipmentDetail }   from '../pages/ShipmentDetail.js';
import { LandedCostPage }   from '../pages/LandedCostPage.js';
import { CompliancePage }   from '../pages/CompliancePage.js';
import { ComplianceOverview } from '../pages/compliance/ComplianceOverview.js';
import { QuickComplianceCheck } from '../pages/QuickComplianceCheck.js';
import { TradeWizard }      from '../pages/trade-wizard/TradeWizard.js';
import { PenaltyPage }      from '../pages/PenaltyPage.js';
import { Chat }             from '../pages/Chat.js';
import { CustomsReference } from '../pages/CustomsReference.js';
import { ShipmentEdit }     from '../pages/ShipmentEdit.js';
import { CarbonPortfolio }  from '../pages/CarbonPortfolio.js';
import { CarriersPage }     from '../pages/CarriersPage.js';
import { FreightRateCardsPage } from '../pages/FreightRateCardsPage.js';
import { FreightBookingsPage } from '../pages/FreightBookingsPage.js';
import { CreateFreightBookingPage } from '../pages/CreateFreightBookingPage.js';
import { WorkflowsPage }     from '../pages/WorkflowsPage.js';
import { WorkflowBuilder }   from '../pages/WorkflowBuilder.js';
import { ClearOSDeclarations } from '../pages/ClearOSDeclarations.js';
import { ClearOSDeclarationNew } from '../pages/ClearOSDeclarationNew.js';
import { ClearOSDeclarationDetail } from '../pages/ClearOSDeclarationDetail.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard',      icon: 'home',      path: '/clearos', exact: true },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { label: 'Ops Command',   icon: 'monitor',    path: '/clearos/ops' },
      { label: 'Declarations',  icon: 'fileText',   path: '/clearos/declarations' },
      { label: 'Workflows',     icon: 'gitBranch',  path: '/clearos/workflows' },
      { label: 'Landed Cost',   icon: 'package',    path: '/clearos/customs-tools' },
      { label: 'Compliance',    icon: 'shield',     path: '/clearos/compliance', exact: true, children: [
        { label: 'Overview',       icon: 'grid',    path: '/clearos/compliance', exact: true },
        { label: 'Quick Check',    icon: 'shield',  path: '/clearos/compliance/quick' },
        { label: 'Advanced Check', icon: 'compass', path: '/clearos/compliance/advanced' },
      ] },
      { label: 'Penalty',       icon: 'alertCircle', path: '/clearos/penalty' },
      { label: 'Carbon Portfolio', icon: 'globe',   path: '/clearos/carbon' },
    ],
  },
  {
    title: 'FREIGHT BOOKING',
    items: [
      { label: 'Bookings',   icon: 'ship',      path: '/clearos/freight-booking/bookings' },
      { label: 'Rate Cards', icon: 'dollarSign', path: '/clearos/freight-booking/rate-cards' },
      { label: 'Carriers',   icon: 'truck',     path: '/clearos/freight-booking/carriers' },
    ],
  },
  {
    title: 'TOOLS',
    items: [
      { label: 'Chat',      icon: 'chatBubble', path: '/clearos/chat' },
      { label: 'Reference', icon: 'layers',     path: '/clearos/reference' },
    ],
  },
  {
    title: 'LINKED APPS',
    items: [
      { label: 'Trips',             icon: 'truck',      path: '/tracking/shipments' },
      { label: 'BL / AWB Tracker',  icon: 'map',        path: '/cargotracker/track' },
      { label: 'Demurrage',         icon: 'alertTriangle', path: '/cargotracker/demurrage' },
      { label: 'Invoices',          icon: 'dollarSign', path: '/finance/invoices' },
      { label: 'Quotations',        icon: 'fileText',   path: '/finance/quotations' },
      { label: 'Staff',             icon: 'users',      path: '/onepi/employees' },
    ],
  },
];

export function ClearOSShell() {
  return (
    <WorkspaceApp appId="clearos">
      <div className="app-shell" data-clearos="true">
        <AppSidebar appId="clearos" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<ClearOSLanding />} />
                <Route path="ops" element={<RequireRoles roles={OPS_ROLES}><CommandCenter /></RequireRoles>} />
                <Route path="ops/new" element={<RequireRoles roles={OPS_ROLES}><CreateShipmentPage /></RequireRoles>} />
                <Route path="clearance/:id" element={<RequireRoles roles={[...OPS_ROLES, 'FINANCE']}><ShipmentDetail /></RequireRoles>} />
                <Route path="clearance/:id/edit" element={<RequireRoles roles={OPS_ROLES}><ShipmentEdit /></RequireRoles>} />
                <Route path="tracker"         element={<Navigate to="/cargotracker/track" replace />} />
                <Route path="demurrage"       element={<Navigate to="/cargotracker/demurrage" replace />} />
                <Route path="declarations"    element={<RequireRoles roles={[...OPS_ROLES, 'FINANCE']}><ClearOSDeclarations /></RequireRoles>} />
                <Route path="declarations/new" element={<RequireRoles roles={OPS_ROLES}><ClearOSDeclarationNew /></RequireRoles>} />
                <Route path="declarations/:id" element={<RequireRoles roles={[...OPS_ROLES, 'FINANCE']}><ClearOSDeclarationDetail /></RequireRoles>} />
                <Route path="consignments"    element={<Navigate to="/tracking/shipments" replace />} />
                <Route path="customs-tools"   element={<RequireRoles roles={OPS_ROLES}><LandedCostPage /></RequireRoles>} />
                <Route path="quick-compliance" element={<Navigate to="/clearos/compliance/quick" replace />} />
                <Route path="compliance" element={<RequireRoles roles={OPS_ROLES}><CompliancePage /></RequireRoles>}>
                  <Route index          element={<ComplianceOverview />} />
                  <Route path="quick"    element={<QuickComplianceCheck />} />
                  <Route path="advanced" element={<TradeWizard />} />
                </Route>
                <Route path="penalty"         element={<RequireRoles roles={OPS_ROLES}><PenaltyPage /></RequireRoles>} />
                <Route path="carbon"          element={<RequireRoles roles={[...MGMT_ROLES, 'FINANCE', 'SENIOR']}><CarbonPortfolio /></RequireRoles>} />
                <Route path="contracts"       element={<Navigate to="/clearos/ops" replace />} />
                <Route path="chat"            element={<Chat />} />
                <Route path="reference"       element={<CustomsReference />} />
                <Route path="freight-booking/bookings"   element={<RequireRoles roles={OPS_ROLES}><FreightBookingsPage /></RequireRoles>} />
                <Route path="freight-booking/new"        element={<RequireRoles roles={OPS_ROLES}><CreateFreightBookingPage /></RequireRoles>} />
                <Route path="freight-booking/rate-cards" element={<RequireRoles roles={OPS_ROLES}><FreightRateCardsPage /></RequireRoles>} />
                <Route path="freight-booking/carriers"   element={<RequireRoles roles={OPS_ROLES}><CarriersPage /></RequireRoles>} />
                <Route path="workflows"                  element={<RequireRoles roles={OPS_ROLES}><WorkflowsPage /></RequireRoles>} />
                <Route path="workflows/new"              element={<RequireRoles roles={OPS_ROLES}><WorkflowBuilder /></RequireRoles>} />
                <Route path="workflows/:id/edit"         element={<RequireRoles roles={OPS_ROLES}><WorkflowBuilder /></RequireRoles>} />
              </Route>

              <Route path="*" element={<Navigate to="/clearos" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

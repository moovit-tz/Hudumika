import React from 'react';
import { Routes, Route, Navigate, useParams } from 'react-router-dom';
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
import { LandedCostHistoryPage } from '../pages/LandedCostHistoryPage.js';
import { ReportIssuePage } from '../pages/ReportIssuePage.js';
import { CompliancePage }   from '../pages/CompliancePage.js';
import { ComplianceOverview } from '../pages/compliance/ComplianceOverview.js';
import { QuickComplianceCheck } from '../pages/QuickComplianceCheck.js';
import { TradeWizard }      from '../pages/trade-wizard/TradeWizard.js';
import { PenaltyPage }      from '../pages/PenaltyPage.js';
import { CustomsReference } from '../pages/CustomsReference.js';
import { ShipmentEdit }     from '../pages/ShipmentEdit.js';
import { CarbonPortfolio }  from '../pages/CarbonPortfolio.js';
import { CarriersPage }     from '../pages/CarriersPage.js';
import { FreightRateCardsPage } from '../pages/FreightRateCardsPage.js';
import { FreightBookingsPage } from '../pages/FreightBookingsPage.js';
import { CreateFreightBookingPage } from '../pages/CreateFreightBookingPage.js';
import { ProductsServices } from '../pages/ProductsServices.js';
import { RateCardPage } from '../pages/RateCardPage.js';

/**
 * Carries a workflow id across the move to Studio.
 *
 * `/clearos/workflows/:id/edit` is in bookmarks and in the links on existing
 * notifications, and a plain redirect to the workflow list would drop the very
 * thing the user was going to edit. Studio's clearance builder takes the same id.
 */
function WorkflowRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/studio/clearance/${id}` : '/studio/clearance'} replace />;
}

/**
 * Carries an ex-warehouse entry id back to SEAL.
 *
 * /clearos/declarations/:id used to render a SEAL customs entry, so any such
 * bookmark holds a seal_customs_entries id. ClearOS's Declarations screen now
 * lists real TANSAD declarations, where that id means nothing.
 */
function ExWarehouseRedirect() {
  const { id } = useParams();
  return <Navigate to={id ? `/seal/ex-warehouse/${id}` : '/seal/ex-warehouse'} replace />;
}

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
      { label: 'Landed Cost',   icon: 'package',    path: '/clearos/customs-tools', exact: true, children: [
        { label: 'Calculator', icon: 'calculator', path: '/clearos/customs-tools', exact: true },
        { label: 'History',    icon: 'clock',      path: '/clearos/customs-tools/history' },
      ] },
      { label: 'Compliance',    icon: 'shield',     path: '/clearos/compliance', exact: true, children: [
        { label: 'Overview',       icon: 'grid',    path: '/clearos/compliance', exact: true },
        { label: 'Quick Check',    icon: 'shield',  path: '/clearos/compliance/quick' },
        // Called "Trade Wizard" by its own page title, by every API route it
        // uses (/v1/customs/trade-wizard/*) and by the SuperAdmin analytics
        // screen — "Advanced Check" was the only place it went by another
        // name, which is exactly where someone goes looking for it.
        { label: 'Trade Wizard', icon: 'compass', path: '/clearos/compliance/advanced' },
      ] },
      { label: 'Penalty',       icon: 'alertCircle', path: '/clearos/penalty' },
      { label: 'Carbon Portfolio', icon: 'globe',   path: '/clearos/carbon' },
    ],
  },
  // FREIGHT BOOKING (Bookings, Rate Cards, Carriers) hidden — feature-to-come,
  // not ready for general use yet. Routes below stay mounted so in-progress
  // work isn't lost; just no sidebar entry point until they're finished.
  {
    title: 'TOOLS',
    items: [
      { label: 'Products & Services', icon: 'tag', path: '/clearos/products' },
      { label: 'Reference', icon: 'layers',     path: '/clearos/reference' },
      { label: 'Rate Card', icon: 'sliders',    path: '/clearos/rate-card' },
    ],
  },
  {
    title: 'LINKED APPS',
    items: [
      // Chat and Workflows now live in the apps that own those functions.
      // The links are deep enough to land on the ClearOS view of each, so
      // the journey is unchanged — only the app that hosts it.
      { label: 'Team Chat',         icon: 'chatBubble', path: '/bliss/team-chat' },
      { label: 'Workflows',         icon: 'gitBranch',  path: '/studio/clearance' },
      { label: 'Trips',             icon: 'truck',      path: '/tracking/shipments' },
      { label: 'BL / AWB Tracker',  icon: 'map',        path: '/cargotracker/track' },
      { label: 'Demurrage',         icon: 'alertTriangle', path: '/cargotracker/demurrage' },
      { label: 'Invoices',          icon: 'dollarSign', path: '/finance/invoices' },
      { label: 'Quotations',        icon: 'fileText',   path: '/finance/quotations' },
      { label: 'Staff',             icon: 'users',      path: '/nexushr/employees' },
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
                {/* Declarations is folded into Ops Command. Everything that
                    screen did is there now — the filing status and TRA lane on
                    each row, status/lane/"not declared" filters resolved by the
                    API rather than in the browser, and the declared value and
                    item count. A bookmark keeps working; it lands on the list
                    scoped to shipments that have been lodged. */}
                <Route path="declarations"    element={<Navigate to="/clearos/ops?declared=1" replace />} />
                {/* These two paths used to serve SEAL ex-warehouse entries, so a
                    bookmarked :id is a seal_customs_entries id — it belongs in
                    SEAL, not on a TANSAD screen that would 404 on it. */}
                <Route path="declarations/new" element={<Navigate to="/seal/ex-warehouse/new" replace />} />
                <Route path="declarations/:id" element={<ExWarehouseRedirect />} />
                <Route path="consignments"    element={<Navigate to="/tracking/shipments" replace />} />
                <Route path="customs-tools"   element={<RequireRoles roles={OPS_ROLES}><LandedCostPage /></RequireRoles>} />
                <Route path="customs-tools/history" element={<RequireRoles roles={OPS_ROLES}><LandedCostHistoryPage /></RequireRoles>} />
                <Route path="report-issue"    element={<ReportIssuePage />} />
                <Route path="quick-compliance" element={<Navigate to="/clearos/compliance/quick" replace />} />
                <Route path="compliance" element={<RequireRoles roles={OPS_ROLES}><CompliancePage /></RequireRoles>}>
                  <Route index          element={<ComplianceOverview />} />
                  <Route path="quick"    element={<QuickComplianceCheck />} />
                  <Route path="advanced" element={<TradeWizard />} />
                </Route>
                <Route path="penalty"         element={<RequireRoles roles={OPS_ROLES}><PenaltyPage /></RequireRoles>} />
                <Route path="carbon"          element={<RequireRoles roles={[...MGMT_ROLES, 'FINANCE', 'SENIOR']}><CarbonPortfolio /></RequireRoles>} />
                <Route path="contracts"       element={<Navigate to="/clearos/ops" replace />} />
                {/* Moved to Bliss (team chat) and Studio (workflows).
                    Redirects rather than removals: these paths are in
                    bookmarks, notification links and printed reports. */}
                <Route path="chat"            element={<Navigate to="/bliss/team-chat" replace />} />
                <Route path="reference"       element={<CustomsReference />} />
                <Route path="rate-card"       element={<RequireRoles roles={OPS_ROLES}><RateCardPage /></RequireRoles>} />
                <Route path="freight-booking/bookings"   element={<RequireRoles roles={OPS_ROLES}><FreightBookingsPage /></RequireRoles>} />
                <Route path="freight-booking/new"        element={<RequireRoles roles={OPS_ROLES}><CreateFreightBookingPage /></RequireRoles>} />
                <Route path="freight-booking/rate-cards" element={<RequireRoles roles={OPS_ROLES}><FreightRateCardsPage /></RequireRoles>} />
                <Route path="freight-booking/carriers"   element={<RequireRoles roles={OPS_ROLES}><CarriersPage /></RequireRoles>} />
                <Route path="workflows"        element={<Navigate to="/studio/clearance" replace />} />
                <Route path="workflows/new"    element={<Navigate to="/studio/clearance/new" replace />} />
                <Route path="workflows/:id/edit" element={<WorkflowRedirect />} />
                <Route path="products"                   element={<RequireRoles roles={[...MGMT_ROLES, 'FINANCE', 'SALES']}><ProductsServices /></RequireRoles>} />
              </Route>

              <Route path="*" element={<Navigate to="/clearos" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

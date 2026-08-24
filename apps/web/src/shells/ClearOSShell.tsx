import React from 'react';
import { Routes, Route, Navigate, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import '../pages/ClearOS.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { PageLayout } from '../components/PageLayout.js';
import { OPS_ROLES, MGMT_ROLES } from '../lib/permissions.js';
import { FeaturedIcon } from '../components/ui/featured-icon.js';
import { Button } from '../components/ui/button.js';

import { CommandCenter }    from '../pages/CommandCenter.js';
import { ClearOSLanding }   from '../pages/ClearOSLanding.js';
import { CreateShipmentPage } from '../pages/CreateShipmentPage.js';
import { ShipmentDetail }   from '../pages/ShipmentDetail.js';
import { LandedCostPage }   from '../pages/LandedCostPage.js';
import { LandedCostHistoryPage } from '../pages/LandedCostHistoryPage.js';
import { ReportIssuePage } from '../pages/ReportIssuePage.js';
import { CompliancePage }   from '../pages/CompliancePage.js';
import { ComplianceOverview } from '../pages/compliance/ComplianceOverview.js';
import { SanctionsScreeningPage } from '../pages/compliance/SanctionsScreeningPage.js';
import { CertificateOfOriginPage } from '../pages/compliance/CertificateOfOriginPage.js';
import { QuickComplianceCheck } from '../pages/QuickComplianceCheck.js';
import { TradeWizard }      from '../pages/trade-wizard/TradeWizard.js';
import { PenaltyPage }      from '../pages/PenaltyPage.js';
import { CustomsReference } from '../pages/CustomsReference.js';
import { ShipmentEdit }     from '../pages/ShipmentEdit.js';
import { CarbonPortfolio }  from '../pages/CarbonPortfolio.js';
import { ProductsServices } from '../pages/ProductsServices.js';
import { RateCardPage } from '../pages/RateCardPage.js';
import { DutyCheckPage } from '../pages/DutyCheckPage.js';
import { LclCalculatorPage } from '../pages/LclCalculatorPage.js';
import { AirCalculatorPage } from '../pages/AirCalculatorPage.js';
import { TransitCalculatorPage } from '../pages/TransitCalculatorPage.js';

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
 * Explains an ex-warehouse entry bookmark before sending it to SEAL, rather
 * than silently swapping apps out from under whoever followed the link.
 *
 * /clearos/declarations/:id used to render a SEAL customs entry, so any such
 * bookmark holds a seal_customs_entries id. ClearOS's Declarations screen now
 * lists real TANSAD declarations, where that id means nothing — a plain
 * <Navigate replace> landed a bookmarked link in a visually different app
 * (SEAL, not ClearOS) with zero indication anything had happened, which read
 * as "my bookmark is broken" rather than "this moved."
 */
function ExWarehouseRedirect() {
  const { id } = useParams();
  const navigate = useNavigate();
  const target = id ? `/seal/ex-warehouse/${id}` : '/seal/ex-warehouse';
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      height: '100%', width: '100%', textAlign: 'center', padding: 24, gap: 14,
    }}>
      <FeaturedIcon variant="info" size="lg" shape="circle">
        <span style={{ fontSize: 22, fontWeight: 700 }}>→</span>
      </FeaturedIcon>
      <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)' }}>This entry now lives in SEAL</div>
      <div style={{ fontSize: 14, color: 'var(--ink3)', maxWidth: 420 }}>
        Ex-warehouse declarations moved out of ClearOS's Declarations screen, which now lists real TANSAD
        declarations instead. Your bookmark still works — it just opens in SEAL now.
      </div>
      <Button onClick={() => navigate(target, { replace: true })}>Continue to SEAL</Button>
    </div>
  );
}

/**
 * DangerousGoodsPage.tsx was removed — every declaration it managed (view,
 * create, issue, PDF) now lives inline on the shipment it belongs to (see
 * DangerousGoodsPanel.tsx on ShipmentDetail), since DG cargo follows the
 * same clearing flow as any other shipment rather than a separate process.
 * A bookmarked `?shipment=` deep-link still lands on that shipment; without
 * one, there's no single "all declarations" list anymore, so this falls
 * back to Ops Command.
 */
function DangerousGoodsRedirect() {
  const [params] = useSearchParams();
  const shipmentId = params.get('shipment');
  return <Navigate to={shipmentId ? `/clearos/clearance/${shipmentId}` : '/clearos/ops'} replace />;
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
      { label: 'Duty Check',    icon: 'percent',    path: '/clearos/duty-check' },
      { label: 'Landed Cost',   icon: 'package',    path: '/clearos/customs-tools', exact: true, children: [
        { label: 'Calculator (FCL)', icon: 'calculator', path: '/clearos/customs-tools', exact: true },
        { label: 'LCL',         icon: 'package',    path: '/clearos/customs-tools/lcl' },
        { label: 'Air Freight', icon: 'send',       path: '/clearos/customs-tools/air' },
        { label: 'Transit',     icon: 'truck',      path: '/clearos/customs-tools/transit' },
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
        { label: 'Screening',   icon: 'userCheck', path: '/clearos/compliance/screening' },
        { label: 'Certificate of Origin', icon: 'award', path: '/clearos/compliance/origin' },
      ] },
      { label: 'Penalty',       icon: 'alertCircle', path: '/clearos/penalty' },
      { label: 'Carbon Portfolio', icon: 'globe',   path: '/clearos/carbon' },
    ],
  },
  // Freight Booking (Bookings, Freight Rate Cards, Carriers, Carrier
  // Contracts) moved to live entirely in the CargoTracker app — see
  // freight-booking.routes.ts's own header comment. ClearOS and CargoTracker
  // are sold as a bundle, so nothing here is lost; old /clearos/freight-
  // booking/* links redirect to their new /cargotracker/* home below.
  // Release/Delivery Orders merged into FinOps's Delivery Documents
  // (delivery-document.service.ts) and Container Depot moved to live in
  // HuduFreight (depot.routes.ts) — old /clearos/release-orders and
  // /clearos/depot links redirect to their new homes below.
  {
    title: 'TOOLS',
    items: [
      { label: 'Products & Services', icon: 'tag', path: '/clearos/products' },
      { label: 'Reference', icon: 'layers',     path: '/clearos/reference' },
      // Distinct from Freight Booking's "Freight Rate Cards" (carrier
      // buy/sell pricing) — this is the tenant's own ICD/clearing-agency
      // charges, feeding the Landed Cost Calculator's defaults.
      { label: 'Clearing Rate Card', icon: 'sliders',    path: '/clearos/rate-card' },
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
      { label: 'Demurrage',         icon: 'alertTriangle', path: '/cargotracker' },
      { label: 'Finance',           icon: 'dollarSign', path: '/finance' },
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
                <Route path="duty-check" element={<RequireRoles roles={OPS_ROLES}><DutyCheckPage /></RequireRoles>} />
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
                <Route path="customs-tools/lcl"     element={<RequireRoles roles={OPS_ROLES}><LclCalculatorPage /></RequireRoles>} />
                <Route path="customs-tools/air"     element={<RequireRoles roles={OPS_ROLES}><AirCalculatorPage /></RequireRoles>} />
                <Route path="customs-tools/transit" element={<RequireRoles roles={OPS_ROLES}><TransitCalculatorPage /></RequireRoles>} />
                <Route path="customs-tools/history" element={<RequireRoles roles={OPS_ROLES}><LandedCostHistoryPage /></RequireRoles>} />
                <Route path="dangerous-goods" element={<DangerousGoodsRedirect />} />
                <Route path="compliance/dangerous-goods" element={<DangerousGoodsRedirect />} />
                <Route path="report-issue"    element={<ReportIssuePage />} />
                <Route path="quick-compliance" element={<Navigate to="/clearos/compliance/quick" replace />} />
                <Route path="compliance" element={<RequireRoles roles={OPS_ROLES}><CompliancePage /></RequireRoles>}>
                  <Route index          element={<ComplianceOverview />} />
                  <Route path="quick"    element={<QuickComplianceCheck />} />
                  <Route path="advanced" element={<TradeWizard />} />
                  <Route path="screening" element={<SanctionsScreeningPage />} />
                  <Route path="origin" element={<CertificateOfOriginPage />} />
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
                {/* Freight Booking moved to CargoTracker — see nav comment above. */}
                <Route path="freight-booking/bookings"   element={<Navigate to="/cargotracker/bookings" replace />} />
                <Route path="freight-booking/new"        element={<Navigate to="/cargotracker/bookings/new" replace />} />
                <Route path="freight-booking/rate-cards" element={<Navigate to="/cargotracker/rate-cards" replace />} />
                <Route path="freight-booking/carriers"   element={<Navigate to="/cargotracker/carriers" replace />} />
                <Route path="freight-booking/contracts"  element={<Navigate to="/cargotracker/contracts" replace />} />
                {/* Release Orders merged into FinOps; Depot moved to HuduFreight — see nav comment above. */}
                <Route path="release-orders"   element={<Navigate to="/finance/delivery-documents" replace />} />
                <Route path="depot"            element={<Navigate to="/tracking/depot" replace />} />
                <Route path="workflows"        element={<Navigate to="/studio/clearance" replace />} />
                <Route path="workflows/new"    element={<Navigate to="/studio/clearance/new" replace />} />
                <Route path="workflows/:id/edit" element={<WorkflowRedirect />} />
                <Route path="products"                   element={<RequireRoles roles={[...MGMT_ROLES, 'FINANCE', 'SALES']}><ProductsServices /></RequireRoles>} />
              </Route>

              <Route path="*" element={<Navigate to="/clearos" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

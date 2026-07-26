import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import '../pages/Seal.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { SealDashboard } from '../pages/SealDashboard.js';
import { SealLots } from '../pages/SealLots.js';
import { SealLotDetail } from '../pages/SealLotDetail.js';
import { SealReceiveLot } from '../pages/SealReceiveLot.js';
import { SealCompartments } from '../pages/SealCompartments.js';
import { SealZoneHeatGrid } from '../pages/SealZoneHeatGrid.js';
import { SealGuarantees } from '../pages/SealGuarantees.js';
import { SealConsignments } from '../pages/SealConsignments.js';
import { SealConsignmentDetail } from '../pages/SealConsignmentDetail.js';
import { SealExaminations } from '../pages/SealExaminations.js';
import { SealStockAccount } from '../pages/SealStockAccount.js';
import { SealYardSlots } from '../pages/SealYardSlots.js';
import { SealWarehouseLayout } from '../pages/SealWarehouseLayout.js';
import { SealTasks } from '../pages/SealTasks.js';
import { SealMetrics } from '../pages/SealMetrics.js';
import { SealEquipment } from '../pages/SealEquipment.js';
import { SealAutomation } from '../pages/SealAutomation.js';
import { SealFulfillment } from '../pages/SealFulfillment.js';
import { SealFulfillmentDetail } from '../pages/SealFulfillmentDetail.js';
import { SealSortingDashboard } from '../pages/SealSortingDashboard.js';
import { SealCompartmentSwitcher } from '../components/SealCompartmentSwitcher.js';

// Declarations moved to ClearOS's Ops Command — these redirect a bookmarked
// SEAL declaration URL to its ClearOS equivalent (same underlying
// seal_customs_entries id) rather than 404ing.
function DeclarationDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/clearos/declarations/${id}`} replace />;
}

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'home', path: '/seal', exact: true },
      { label: 'Metrics', icon: 'barChart2', path: '/seal/metrics' },
    ],
  },
  {
    title: 'GATE & RECEIVING',
    items: [
      { label: 'Consignments', icon: 'truck', path: '/seal/consignments' },
    ],
  },
  {
    title: 'THE LEDGER',
    items: [
      { label: 'Lots', icon: 'package', path: '/seal/lots' },
      { label: 'Compartments', icon: 'layers', path: '/seal/compartments' },
      { label: 'Guarantees', icon: 'shield', path: '/seal/guarantees' },
    ],
  },
  {
    title: 'CUSTOMS',
    items: [
      { label: 'Examinations', icon: 'search', path: '/seal/examinations' },
      { label: 'Stock Account', icon: 'clipboard', path: '/seal/stock-account' },
    ],
  },
  {
    title: 'YARD',
    items: [
      { label: 'Yard Slots', icon: 'grid', path: '/seal/yard-slots' },
    ],
  },
  {
    title: 'OPERATIONS',
    items: [
      { label: 'Activities', icon: 'clipboardList', path: '/seal/activities' },
      { label: 'Equipment', icon: 'tool', path: '/seal/equipment' },
      { label: 'Automation', icon: 'zap', path: '/seal/automation' },
      { label: 'Fulfillment', icon: 'truck', path: '/seal/fulfillment' },
    ],
  },
];

export function SealShell() {
  return (
    <WorkspaceApp appId="seal">
      <div className="app-shell" data-seal="true">
        <AppSidebar appId="seal" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <SealCompartmentSwitcher />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index                    element={<SealDashboard />}          />
                <Route path="metrics"           element={<SealMetrics />}            />
                <Route path="lots"              element={<SealLots />}               />
                <Route path="lots/new"          element={<SealReceiveLot />}         />
                <Route path="lots/:id"          element={<SealLotDetail />}          />
                <Route path="compartments"      element={<SealCompartments />}       />
                <Route path="compartments/:id/heat-grid" element={<SealZoneHeatGrid />} />
                <Route path="compartments/:id/layout"    element={<SealWarehouseLayout />} />
                <Route path="compartments/:id/sorting-dashboard" element={<SealSortingDashboard />} />
                <Route path="guarantees"        element={<SealGuarantees />}         />
                <Route path="consignments"      element={<SealConsignments />}       />
                <Route path="consignments/:id"  element={<SealConsignmentDetail />}  />
                <Route path="declarations"      element={<Navigate to="/clearos/declarations" replace />} />
                <Route path="declarations/new"  element={<Navigate to="/clearos/declarations/new" replace />} />
                <Route path="declarations/:id"  element={<DeclarationDetailRedirect />} />
                <Route path="examinations"      element={<SealExaminations />}       />
                <Route path="stock-account"     element={<SealStockAccount />}       />
                <Route path="yard-slots"        element={<SealYardSlots />}          />
                <Route path="activities"        element={<SealTasks />}              />
                <Route path="equipment"         element={<SealEquipment />}          />
                <Route path="automation"        element={<SealAutomation />}         />
                <Route path="fulfillment"       element={<SealFulfillment />}        />
                <Route path="fulfillment/:id"   element={<SealFulfillmentDetail />}  />
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

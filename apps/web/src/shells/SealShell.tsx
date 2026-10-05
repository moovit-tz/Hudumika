import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import '../pages/Seal.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { SealDashboard } from '../pages/SealDashboard.js';
import { SealLots } from '../pages/SealLots.js';
import { SealLotDetail } from '../pages/SealLotDetail.js';
import { SealReceiveLot } from '../pages/SealReceiveLot.js';
import { SealCompartments } from '../pages/SealCompartments.js';
import { SealCompartmentDetail } from '../pages/SealCompartmentDetail.js';
import { SealCompartmentEdit } from '../pages/SealCompartmentEdit.js';
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
import { SealDispatchRequests } from '../pages/SealDispatchRequests.js';
import { SealSortingDashboard } from '../pages/SealSortingDashboard.js';
import { SealAppointments } from '../pages/SealAppointments.js';
import { SealStorageInvoices } from '../pages/SealStorageInvoices.js';
import { SealAgedStorage } from '../pages/SealAgedStorage.js';
import { SealStockTransfers } from '../pages/SealStockTransfers.js';
import { SealStockTransferDetail, SealStockTransferNew } from '../pages/SealStockTransferDetail.js';
import { SealAdjustments } from '../pages/SealAdjustments.js';
import { SealExWarehouseEntries } from '../pages/seal/SealExWarehouseEntries.js';
import { SealExWarehouseEntryNew } from '../pages/seal/SealExWarehouseEntryNew.js';
import { SealExWarehouseEntryDetail } from '../pages/seal/SealExWarehouseEntryDetail.js';
// Inventory pages — these moved from the standalone Inventory app into SEAL.
// base `seal` plan: Items, Stock Levels, Stock Counts, Warehouses (= Compartments).
// Routes redirect /inventory/* here so existing bookmarks keep working.
import { InventoryItems } from '../pages/InventoryItems.js';
import { InventoryStock } from '../pages/InventoryStock.js';
import { InventoryCounts, } from '../pages/InventoryCounts.js';
import { InventoryCountDetail } from '../pages/InventoryCountDetail.js';
import { useSealCapabilities } from '../hooks/useSealCapabilities.js';

/**
 * These pages read seal_customs_entries — the ex-warehouse entry that takes a
 * duty-suspended lot out of the bonded warehouse. They spent a while filed
 * under ClearOS as "Declarations", which put them next to, and made them look
 * like, the TANESW/TANSAD declaration a clearing agent lodges for an ordinary
 * import. They are a different document for a different purpose, and
 * seal_customs_entries has no shipment link at all (only lot_id), so nothing
 * on those screens could ever reach a consignment in Ops Command.
 *
 * They are back in SEAL under their real name. Both the old ClearOS paths and
 * the older /seal/declarations paths redirect here, since either could be
 * bookmarked.
 */
function ExWarehouseDetailRedirect() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/seal/ex-warehouse/${id}`} replace />;
}

function buildNav(caps: ReturnType<typeof useSealCapabilities>): SidebarSection[] {
  const sections: SidebarSection[] = [
    {
      items: [
        { label: 'Dashboard', icon: 'home', path: '/seal', exact: true },
      ],
    },
    {
      title: 'GATE & RECEIVING',
      items: [
        { label: 'Consignments', icon: 'truck', path: '/seal/consignments' },
        { label: 'Appointments', icon: 'calendar', path: '/seal/appointments' },
      ],
    },
  ];

  if (caps.customs) {
    // Advanced plan (seal_advanced): bonded warehouse / ICD / CFS surface.
    // Items and counts are still reachable via routes but the ledger is the
    // primary view — Lots already track quantity and status per SKU.
    sections.push({
      title: 'THE LEDGER',
      items: [
        { label: 'Lots', icon: 'package', path: '/seal/lots' },
        { label: 'Stock Transfers', icon: 'arrowRight' as const, path: '/seal/stock-transfers' },
        { label: 'Warehouses', icon: 'layers', path: '/seal/compartments' },
        ...(caps.guarantees
          ? [{ label: 'Guarantees', icon: 'shield' as const, path: '/seal/guarantees' }]
          : []),
      ],
    });
    sections.push({
      title: 'CUSTOMS',
      items: [
        { label: 'Ex-warehouse Entries', icon: 'fileText', path: '/seal/ex-warehouse' },
        ...(caps.examinations
          ? [{ label: 'Examinations', icon: 'search' as const, path: '/seal/examinations' }]
          : []),
        { label: 'Stock Account', icon: 'clipboard', path: '/seal/stock-account' },
      ],
    });
    sections.push({
      title: 'YARD',
      items: [
        { label: 'Yard Slots', icon: 'grid', path: '/seal/yard-slots' },
      ],
    });
  } else {
    // Base plan (seal): standard inventory surface — no customs overlay.
    sections.push({
      title: 'INVENTORY',
      items: [
        { label: 'Items', icon: 'tag', path: '/seal/items' },
        { label: 'Stock Levels', icon: 'layers', path: '/seal/stock' },
        { label: 'Stock Counts', icon: 'clipboardList', path: '/seal/counts' },
        { label: 'Lots', icon: 'package', path: '/seal/lots' },
        { label: 'Stock Transfers', icon: 'arrowRight' as const, path: '/seal/stock-transfers' },
        { label: 'Warehouses', icon: 'warehouse', path: '/seal/compartments' },
      ],
    });
  }

  sections.push({
    title: 'OPERATIONS',
    items: [
      { label: 'Warehouse Tasks', icon: 'clipboardList', path: '/seal/activities' },
      { label: 'Equipment', icon: 'tool', path: '/seal/equipment' },
      { label: 'Automation', icon: 'zap', path: '/seal/automation' },
      { label: 'Fulfillment', icon: 'truck', path: '/seal/fulfillment' },
      { label: 'Dispatch Requests', icon: 'link', path: '/seal/dispatch-requests' },
    ],
  });

  sections.push({
    title: 'BILLING',
    items: [
      { label: 'Storage Invoices', icon: 'fileText', path: '/seal/billing/invoices' },
      { label: 'Aged Storage', icon: 'clock', path: '/seal/billing/aged-storage' },
    ],
  });

  sections.push({
    title: 'ANALYTICS',
    items: [
      { label: 'Metrics & Reports', icon: 'barChart', path: '/seal/metrics' },
    ],
  });

  if (caps.integrations) {
    sections.push({
      title: 'INTEGRATIONS',
      items: [
        { label: 'POS & Sales', icon: 'shoppingCart', path: '/seal/integrations/pos' },
        { label: 'Finance', icon: 'dollarSign', path: '/seal/integrations/finance' },
      ],
    });
  }

  return sections;
}

export function SealShell() {
  const caps = useSealCapabilities();
  const nav = buildNav(caps);

  return (
    <WorkspaceApp appId="seal">
      <div className="app-shell" data-seal="true">
        <AppSidebar
          appId="seal"
          sections={nav}
        />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index                    element={<SealDashboard />}          />
                <Route path="metrics"           element={<SealMetrics />}            />
                <Route path="appointments"      element={<SealAppointments />}       />
                <Route path="billing/invoices"  element={<SealStorageInvoices />}    />
                <Route path="billing/aged-storage" element={<SealAgedStorage />}     />
                <Route path="stock-transfers"         element={<SealStockTransfers />}     />
                <Route path="stock-transfers/new"     element={<SealStockTransferNew />}   />
                <Route path="stock-transfers/:id"     element={<SealStockTransferDetail />}/>
                <Route path="adjustments"             element={<SealAdjustments />}        />
                <Route path="lots"              element={<SealLots />}               />
                <Route path="lots/new"          element={<SealReceiveLot />}         />
                <Route path="lots/:id"          element={<SealLotDetail />}          />
                <Route path="compartments"      element={<SealCompartments />}       />
                <Route path="compartments/:id"  element={<SealCompartmentDetail />}   />
                <Route path="compartments/:id/edit" element={<SealCompartmentEdit />} />
                <Route path="compartments/:id/heat-grid" element={<SealZoneHeatGrid />} />
                <Route path="compartments/:id/layout"    element={<SealWarehouseLayout />} />
                <Route path="compartments/:id/sorting-dashboard" element={<SealSortingDashboard />} />
                <Route path="guarantees"        element={<SealGuarantees />}         />
                <Route path="consignments"      element={<SealConsignments />}       />
                <Route path="consignments/:id"  element={<SealConsignmentDetail />}  />
                <Route path="ex-warehouse"      element={<SealExWarehouseEntries />}     />
                <Route path="ex-warehouse/new"  element={<SealExWarehouseEntryNew />}    />
                <Route path="ex-warehouse/:id"  element={<SealExWarehouseEntryDetail />} />
                <Route path="declarations"      element={<Navigate to="/seal/ex-warehouse" replace />} />
                <Route path="declarations/new"  element={<Navigate to="/seal/ex-warehouse/new" replace />} />
                <Route path="declarations/:id"  element={<ExWarehouseDetailRedirect />} />
                <Route path="examinations"      element={<SealExaminations />}       />
                <Route path="stock-account"     element={<SealStockAccount />}       />
                <Route path="yard-slots"        element={<SealYardSlots />}          />
                <Route path="activities"        element={<SealTasks />}              />
                <Route path="equipment"         element={<SealEquipment />}          />
                <Route path="automation"        element={<SealAutomation />}         />
                <Route path="fulfillment"       element={<SealFulfillment />}        />
                <Route path="fulfillment/:id"   element={<SealFulfillmentDetail />}  />
                <Route path="dispatch-requests" element={<SealDispatchRequests />}   />
                {/* Inventory routes (formerly /inventory/*) */}
                <Route path="items"             element={<InventoryItems />}         />
                <Route path="stock"             element={<InventoryStock />}         />
                <Route path="counts"            element={<InventoryCounts />}        />
                <Route path="counts/:id"        element={<InventoryCountDetail />}   />
              </Route>
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

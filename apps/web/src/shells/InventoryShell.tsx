import { Routes, Route } from 'react-router-dom';
import '../pages/Inventory.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { InventoryDashboard } from '../pages/InventoryDashboard.js';
import { InventoryItems } from '../pages/InventoryItems.js';
import { InventoryWarehouses } from '../pages/InventoryWarehouses.js';
import { InventoryStock } from '../pages/InventoryStock.js';
import { InventoryCounts } from '../pages/InventoryCounts.js';
import { InventoryCountDetail } from '../pages/InventoryCountDetail.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'home', path: '/inventory', exact: true },
    ],
  },
  {
    title: 'CATALOG',
    items: [
      { label: 'Items', icon: 'package', path: '/inventory/items' },
      { label: 'Warehouses', icon: 'warehouse', path: '/inventory/warehouses' },
    ],
  },
  {
    title: 'STOCK',
    items: [
      { label: 'Stock Levels', icon: 'layers', path: '/inventory/stock' },
      { label: 'Stock Counts', icon: 'clipboardList', path: '/inventory/counts' },
    ],
  },
];

export function InventoryShell() {
  return (
    <WorkspaceApp appId="inventory">
      <div className="app-shell" data-inventory="true">
        <AppSidebar appId="inventory" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index               element={<InventoryDashboard />}  />
                <Route path="items"        element={<InventoryItems />}      />
                <Route path="warehouses"   element={<InventoryWarehouses />} />
                <Route path="stock"        element={<InventoryStock />}      />
                <Route path="counts"       element={<InventoryCounts />}     />
                <Route path="counts/:id"   element={<InventoryCountDetail />} />
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

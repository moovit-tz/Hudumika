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
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

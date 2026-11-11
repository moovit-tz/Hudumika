import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { GerejiOverview } from '../pages/gereji/GerejiOverview.js';
import { GerejiJobCards } from '../pages/gereji/GerejiJobCards.js';
import { GerejiVehicles } from '../pages/gereji/GerejiVehicles.js';
import { GerejiEstimates } from '../pages/gereji/GerejiEstimates.js';
import { GerejiWarranty } from '../pages/gereji/GerejiWarranty.js';
import { GerejiInsurance } from '../pages/gereji/GerejiInsurance.js';
import { GerejiAngaParts } from '../pages/gereji/GerejiAngaParts.js';
import { GerejiAngaCustomers } from '../pages/gereji/GerejiAngaCustomers.js';
import { GerejiAngaSuppliers } from '../pages/gereji/GerejiAngaSuppliers.js';
import { GerejiAngaLocations } from '../pages/gereji/GerejiAngaLocations.js';
import { GerejiAngaRfqs } from '../pages/gereji/GerejiAngaRfqs.js';
import { GerejiAngaQuotes } from '../pages/gereji/GerejiAngaQuotes.js';
import { GerejiAngaAog } from '../pages/gereji/GerejiAngaAog.js';
import { GerejiAngaGoodsReceipts } from '../pages/gereji/GerejiAngaGoodsReceipts.js';
import { GerejiAngaStockUnits } from '../pages/gereji/GerejiAngaStockUnits.js';
import { GerejiAngaRental } from '../pages/gereji/GerejiAngaRental.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview',   icon: 'grid',       path: '/gereji',            exact: true },
      { label: 'Job Cards',  icon: 'clipboard',   path: '/gereji/job-cards'   },
      { label: 'Vehicles',   icon: 'truck',       path: '/gereji/vehicles'    },
      { label: 'Estimates',  icon: 'fileText',    path: '/gereji/estimates'   },
    ],
  },
  {
    title: 'After-Sales',
    items: [
      { label: 'Warranty',   icon: 'shield', path: '/gereji/warranty'   },
      { label: 'Insurance',  icon: 'shield', path: '/gereji/insurance'  },
    ],
  },
  {
    title: 'ANGA PartsOS',
    items: [
      { label: 'AOG Desk',   icon: 'alertTriangle', path: '/gereji/anga/aog'  },
      { label: 'RFQs',       icon: 'fileText', path: '/gereji/anga/rfqs'      },
      { label: 'Quotes',     icon: 'invoice',  path: '/gereji/anga/quotes'    },
      { label: 'Parts',      icon: 'package',  path: '/gereji/anga/parts'     },
      { label: 'Customers',  icon: 'users',    path: '/gereji/anga/customers' },
      { label: 'Suppliers',  icon: 'truck',    path: '/gereji/anga/suppliers' },
      { label: 'Locations',  icon: 'mapPin',   path: '/gereji/anga/locations' },
      { label: 'Goods Receipts', icon: 'package', path: '/gereji/anga/goods-receipts' },
      { label: 'Stock Units',    icon: 'layers',   path: '/gereji/anga/stock-units'    },
      { label: 'Rental',         icon: 'calendar', path: '/gereji/anga/rental'        },
    ],
  },
];

export function GerejiShell() {
  return (
    <WorkspaceApp appId="gereji">
      <div className="app-shell">
        <AppSidebar appId="gereji" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<GerejiOverview />} />
                <Route path="job-cards" element={<GerejiJobCards />} />
                <Route path="vehicles" element={<GerejiVehicles />} />
                <Route path="estimates" element={<GerejiEstimates />} />
                <Route path="warranty" element={<GerejiWarranty />} />
                <Route path="insurance" element={<GerejiInsurance />} />
                <Route path="anga/aog" element={<GerejiAngaAog />} />
                <Route path="anga/rfqs" element={<GerejiAngaRfqs />} />
                <Route path="anga/quotes" element={<GerejiAngaQuotes />} />
                <Route path="anga/parts" element={<GerejiAngaParts />} />
                <Route path="anga/customers" element={<GerejiAngaCustomers />} />
                <Route path="anga/suppliers" element={<GerejiAngaSuppliers />} />
                <Route path="anga/locations" element={<GerejiAngaLocations />} />
                <Route path="anga/goods-receipts" element={<GerejiAngaGoodsReceipts />} />
                <Route path="anga/stock-units" element={<GerejiAngaStockUnits />} />
                <Route path="anga/rental" element={<GerejiAngaRental />} />
              </Route>
              <Route path="*" element={<Navigate to="/gereji" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

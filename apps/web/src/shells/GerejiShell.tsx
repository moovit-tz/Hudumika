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
      { label: 'Warranty',  icon: 'shield', path: '/gereji/warranty' },
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

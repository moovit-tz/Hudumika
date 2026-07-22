import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { CargoDashboard } from '../pages/CargoDashboard.js';
import { Tracker } from '../pages/Tracker.js';
import { Demurrage } from '../pages/Demurrage.js';
import { CarriersPage } from '../pages/CarriersPage.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard',            icon: 'activity',      path: '/cargotracker',            exact: true },
      { label: 'Track',                icon: 'map',           path: '/cargotracker/track' },
      { label: 'Demurrage & Detention', icon: 'alertTriangle', path: '/cargotracker/demurrage' },
      { label: 'Carriers',             icon: 'ship',          path: '/cargotracker/carriers' },
    ],
  },
];

export function CargoTrackerShell() {
  return (
    <WorkspaceApp appId="cargotracker">
      <div className="app-shell" data-cargotracker="true">
        <AppSidebar appId="cargotracker" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<CargoDashboard />} />
                <Route path="track" element={<Tracker />} />
                <Route path="demurrage" element={<Demurrage />} />
                <Route path="carriers" element={<CarriersPage />} />
              </Route>
              <Route path="*" element={<Navigate to="/cargotracker" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

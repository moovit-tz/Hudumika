import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { OPS_ROLES } from '../lib/permissions.js';
import { CargoDashboard } from '../pages/CargoDashboard.js';
import { Tracker } from '../pages/Tracker.js';
import { Demurrage } from '../pages/Demurrage.js';
import { CarriersPage } from '../pages/CarriersPage.js';
import { FreightBookingsPage } from '../pages/FreightBookingsPage.js';
import { CreateFreightBookingPage } from '../pages/CreateFreightBookingPage.js';
import { FreightRateCardsPage } from '../pages/FreightRateCardsPage.js';
import { CarrierContractsPage } from '../pages/CarrierContractsPage.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard',            icon: 'activity',      path: '/cargotracker',            exact: true },
      { label: 'Track',                icon: 'map',           path: '/cargotracker/track' },
      { label: 'Demurrage & Detention', icon: 'alertTriangle', path: '/cargotracker/demurrage' },
    ],
  },
  // Freight Booking — moved here from ClearOS (own nav there was 'FREIGHT
  // BOOKING'). CargoTracker is now the sole home; ClearOS and CargoTracker
  // are sold as a bundle, and ClearOS's own pages (e.g. ShipmentDetail's
  // booking-reference badge) call this module's API directly rather than
  // hosting a duplicate UI. See freight-booking.routes.ts.
  {
    title: 'FREIGHT BOOKING',
    items: [
      { label: 'Bookings',           icon: 'ship',     path: '/cargotracker/bookings' },
      { label: 'Freight Rate Cards', icon: 'sliders',  path: '/cargotracker/rate-cards' },
      { label: 'Carriers',           icon: 'anchor',   path: '/cargotracker/carriers' },
      { label: 'Carrier Contracts',  icon: 'fileText', path: '/cargotracker/contracts' },
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
                <Route path="bookings" element={<RequireRoles roles={OPS_ROLES}><FreightBookingsPage /></RequireRoles>} />
                <Route path="bookings/new" element={<RequireRoles roles={OPS_ROLES}><CreateFreightBookingPage /></RequireRoles>} />
                <Route path="rate-cards" element={<RequireRoles roles={OPS_ROLES}><FreightRateCardsPage /></RequireRoles>} />
                <Route path="contracts" element={<RequireRoles roles={OPS_ROLES}><CarrierContractsPage /></RequireRoles>} />
              </Route>
              <Route path="*" element={<Navigate to="/cargotracker" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

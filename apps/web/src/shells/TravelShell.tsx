import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { TravelOverview } from '../pages/TravelOverview.js';
import { TravelTrips } from '../pages/TravelTrips.js';
import { TravelItinerary } from '../pages/TravelItinerary.js';
import { TravelBookings } from '../pages/TravelBookings.js';
import { TravelExpenses } from '../pages/TravelExpenses.js';

const NAV: SidebarSection[] = [
  {
    title: 'WORKSPACE',
    items: [
      { label: 'Overview',   icon: 'grid',       path: '/travel',          exact: true },
      { label: 'My Trips',   icon: 'map',        path: '/travel/trips'     },
      { label: 'Itinerary',  icon: 'calendar',   path: '/travel/itinerary' },
      { label: 'Bookings',   icon: 'fileText',   path: '/travel/bookings'  },
      { label: 'Expenses',   icon: 'dollarSign',  path: '/travel/expenses'  },
    ],
  },
];

export function TravelShell() {
  return (
    <WorkspaceApp appId="travel">
      <div className="app-shell">
        <AppSidebar appId="travel" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<TravelOverview />} />
                <Route path="trips" element={<TravelTrips />} />
                <Route path="itinerary" element={<TravelItinerary />} />
                <Route path="bookings" element={<TravelBookings />} />
                <Route path="expenses" element={<TravelExpenses />} />
              </Route>
              <Route path="*" element={<Navigate to="/travel" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

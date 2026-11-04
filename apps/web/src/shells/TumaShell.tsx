import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { TumaOverview } from '../pages/tuma/TumaOverview.js';
import { TumaParcels } from '../pages/tuma/TumaParcels.js';
import { TumaAgents } from '../pages/tuma/TumaAgents.js';
import { TumaFloat } from '../pages/tuma/TumaFloat.js';
import { TumaFleet } from '../pages/tuma/TumaFleet.js';
import { TumaOffices } from '../pages/tuma/TumaOffices.js';
import { TumaSettlement } from '../pages/tuma/TumaSettlement.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview',   icon: 'grid',       path: '/tuma',           exact: true },
      { label: 'Parcels',    icon: 'package',     path: '/tuma/parcels'    },
      { label: 'Agents',     icon: 'users',       path: '/tuma/agents'     },
      { label: 'Fleet',      icon: 'truck',       path: '/tuma/fleet'      },
      { label: 'Offices',    icon: 'mapPin',      path: '/tuma/offices'    },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Agent Float',  icon: 'wallet',      path: '/tuma/float'      },
      { label: 'Settlement',   icon: 'dollarSign',   path: '/tuma/settlement' },
    ],
  },
];

export function TumaShell() {
  return (
    <WorkspaceApp appId="tuma">
      <div className="app-shell">
        <AppSidebar appId="tuma" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<TumaOverview />} />
                <Route path="parcels" element={<TumaParcels />} />
                <Route path="agents" element={<TumaAgents />} />
                <Route path="fleet" element={<TumaFleet />} />
                <Route path="offices" element={<TumaOffices />} />
                <Route path="float" element={<TumaFloat />} />
                <Route path="settlement" element={<TumaSettlement />} />
              </Route>
              <Route path="*" element={<Navigate to="/tuma" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

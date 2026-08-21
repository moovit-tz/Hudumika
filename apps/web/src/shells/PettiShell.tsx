import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { PettiWallets } from '../pages/PettiWallets.js';
import { PettiWalletDetail } from '../pages/PettiWalletDetail.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Wallets', icon: 'wallet', path: '/petti', exact: true },
    ],
  },
];

export function PettiShell() {
  return (
    <WorkspaceApp appId="petti">
      <div className="app-shell" data-petti="true">
        <AppSidebar appId="petti" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<PettiWallets />} />
                <Route path="wallets/:id" element={<PettiWalletDetail />} />
              </Route>
              <Route path="*" element={<Navigate to="/petti" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

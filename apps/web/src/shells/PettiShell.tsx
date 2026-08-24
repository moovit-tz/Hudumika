import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { PettiDashboard } from '../pages/PettiDashboard.js';
import { PettiWallets } from '../pages/PettiWallets.js';
import { PettiWalletDetail } from '../pages/PettiWalletDetail.js';
import { PettiTransactions } from '../pages/PettiTransactions.js';
import { PettiActivity } from '../pages/PettiActivity.js';
import { PettiReports } from '../pages/PettiReports.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'barChart2', path: '/petti', exact: true },
      { label: 'Wallets', icon: 'wallet', path: '/petti/wallets' },
      { label: 'Transactions', icon: 'list', path: '/petti/transactions' },
      { label: 'Activity', icon: 'clock', path: '/petti/activity' },
      { label: 'Reports', icon: 'pieChart', path: '/petti/reports' },
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
                <Route index element={<PettiDashboard />} />
                <Route path="wallets" element={<PettiWallets />} />
                <Route path="wallets/:id" element={<PettiWalletDetail />} />
                <Route path="transactions" element={<PettiTransactions />} />
                <Route path="activity" element={<PettiActivity />} />
                <Route path="reports" element={<PettiReports />} />
              </Route>
              <Route path="*" element={<Navigate to="/petti" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
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
import { PettiDeposit } from '../pages/PettiDeposit.js';
import { PettiSend } from '../pages/PettiSend.js';
import { PettiRequest } from '../pages/PettiRequest.js';
import { PettiExchange } from '../pages/PettiExchange.js';
import { PettiWithdrawals } from '../pages/PettiWithdrawals.js';
import { PettiGateways } from '../pages/PettiGateways.js';
import { PettiRetirements } from '../pages/PettiRetirements.js';

/**
 * Petti's PayMoney & DigiKash inspired sidebar navigation layout.
 */
const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'barChart2', path: '/petti', exact: true },
      { label: 'Wallets', icon: 'wallet', path: '/petti/wallets' },
    ],
  },
  {
    title: 'ACTIVITIES',
    items: [
      { label: 'Transactions', icon: 'list', path: '/petti/transactions' },
      { label: 'Deposit Money', icon: 'plus', path: '/petti/deposit' },
      { label: 'Send Money', icon: 'send', path: '/petti/transfer' },
      { label: 'Request Money', icon: 'refresh', path: '/petti/request' },
      { label: 'Exchange Money', icon: 'refresh', path: '/petti/exchange' },
      { label: 'Withdrawals', icon: 'fileText', path: '/petti/withdrawals' },
      { label: 'Expense Retirements', icon: 'check', path: '/petti/retirements' },
    ],
  },
  {
    title: 'GATEWAYS & CHANNELS',
    items: [
      { label: 'Payment Channels', icon: 'grid', path: '/petti/gateways' },
    ],
  },
  {
    title: 'AUDIT & REPORTS',
    items: [
      { label: 'Activity Logs', icon: 'clock', path: '/petti/activity' },
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
                <Route path="deposit" element={<PettiDeposit />} />
                <Route path="transfer" element={<PettiSend />} />
                <Route path="request" element={<PettiRequest />} />
                <Route path="exchange" element={<PettiExchange />} />
                <Route path="withdrawals" element={<PettiWithdrawals />} />
                <Route path="retirements" element={<PettiRetirements />} />
                <Route path="gateways" element={<PettiGateways />} />
                <Route path="activity" element={<PettiActivity />} />
                <Route path="reports" element={<PettiReports />} />
              </Route>
              <Route path="*" element={<Navigate to="/petti" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { LexCoreOverview } from '../pages/lexcore/LexCoreOverview.js';
import { LexCoreMatters } from '../pages/lexcore/LexCoreMatters.js';
import { LexCoreClients } from '../pages/lexcore/LexCoreClients.js';
import { LexCoreTimeEntries } from '../pages/lexcore/LexCoreTimeEntries.js';
import { LexCoreDisbursements } from '../pages/lexcore/LexCoreDisbursements.js';
import { LexCoreInvoices } from '../pages/lexcore/LexCoreInvoices.js';
import { LexCoreTrustAccounts } from '../pages/lexcore/LexCoreTrustAccounts.js';
import { LexCoreConflicts } from '../pages/lexcore/LexCoreConflicts.js';
import { LexCoreCourtDiary } from '../pages/lexcore/LexCoreCourtDiary.js';
import { LexCoreDeadlines } from '../pages/lexcore/LexCoreDeadlines.js';
import { LexCoreDocuments } from '../pages/lexcore/LexCoreDocuments.js';
import { LexCoreFeeEarners } from '../pages/lexcore/LexCoreFeeEarners.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview',     icon: 'grid',          path: '/lexcore',              exact: true },
      { label: 'Clients',      icon: 'users',         path: '/lexcore/clients'       },
      { label: 'Matters',      icon: 'briefcase',     path: '/lexcore/matters'       },
      { label: 'Court Diary',  icon: 'calendar',      path: '/lexcore/court-diary'   },
      { label: 'Deadlines',    icon: 'alertCircle',   path: '/lexcore/deadlines'     },
      { label: 'Documents',    icon: 'fileText',      path: '/lexcore/documents'     },
    ],
  },
  {
    title: 'Finance',
    items: [
      { label: 'Time Entries',  icon: 'clock',         path: '/lexcore/time-entries'   },
      { label: 'Disbursements', icon: 'creditCard',    path: '/lexcore/disbursements'  },
      { label: 'Invoices',      icon: 'fileText',      path: '/lexcore/invoices'       },
      { label: 'Trust Accounts', icon: 'shield',       path: '/lexcore/trust'          },
    ],
  },
  {
    title: 'Compliance',
    items: [
      { label: 'Conflicts',    icon: 'alertTriangle', path: '/lexcore/conflicts'     },
      { label: 'Fee Earners',  icon: 'userCheck',     path: '/lexcore/fee-earners'   },
    ],
  },
];

export function LexCoreShell() {
  return (
    <WorkspaceApp appId="lexcore">
      <div className="app-shell">
        <AppSidebar appId="lexcore" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<LexCoreOverview />} />
                <Route path="clients" element={<LexCoreClients />} />
                <Route path="matters" element={<LexCoreMatters />} />
                <Route path="court-diary" element={<LexCoreCourtDiary />} />
                <Route path="deadlines" element={<LexCoreDeadlines />} />
                <Route path="documents" element={<LexCoreDocuments />} />
                <Route path="time-entries" element={<LexCoreTimeEntries />} />
                <Route path="disbursements" element={<LexCoreDisbursements />} />
                <Route path="invoices" element={<LexCoreInvoices />} />
                <Route path="trust" element={<LexCoreTrustAccounts />} />
                <Route path="conflicts" element={<LexCoreConflicts />} />
                <Route path="fee-earners" element={<LexCoreFeeEarners />} />
              </Route>
              <Route path="*" element={<Navigate to="/lexcore" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

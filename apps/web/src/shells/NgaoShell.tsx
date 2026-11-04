import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';

import { NgaoOverview } from '../pages/ngao/NgaoOverview.js';
import { NgaoAssessments } from '../pages/ngao/NgaoAssessments.js';
import { NgaoRegisters } from '../pages/ngao/NgaoRegisters.js';
import { NgaoIncidents } from '../pages/ngao/NgaoIncidents.js';
import { NgaoConsent } from '../pages/ngao/NgaoConsent.js';
import { NgaoAlerts } from '../pages/ngao/NgaoAlerts.js';
import { NgaoVendors } from '../pages/ngao/NgaoVendors.js';
import { NgaoRights } from '../pages/ngao/NgaoRights.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Overview',     icon: 'grid',          path: '/ngao',              exact: true },
      { label: 'Assessments',  icon: 'clipboard',     path: '/ngao/assessments'   },
      { label: 'Registers',    icon: 'list',           path: '/ngao/registers'     },
      { label: 'Consent',      icon: 'checkCircle',   path: '/ngao/consent'       },
    ],
  },
  {
    title: 'Incident Response',
    items: [
      { label: 'Incidents',     icon: 'alertTriangle', path: '/ngao/incidents'      },
      { label: 'Rights Requests', icon: 'userCheck',   path: '/ngao/rights'         },
    ],
  },
  {
    title: 'Governance',
    items: [
      { label: 'Vendors',     icon: 'building',       path: '/ngao/vendors'        },
      { label: 'Alerts',      icon: 'bell',            path: '/ngao/alerts'         },
    ],
  },
];

export function NgaoShell() {
  return (
    <WorkspaceApp appId="ngao">
      <div className="app-shell">
        <AppSidebar appId="ngao" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<NgaoOverview />} />
                <Route path="assessments" element={<NgaoAssessments />} />
                <Route path="registers" element={<NgaoRegisters />} />
                <Route path="consent" element={<NgaoConsent />} />
                <Route path="incidents" element={<NgaoIncidents />} />
                <Route path="rights" element={<NgaoRights />} />
                <Route path="vendors" element={<NgaoVendors />} />
                <Route path="alerts" element={<NgaoAlerts />} />
              </Route>
              <Route path="*" element={<Navigate to="/ngao" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

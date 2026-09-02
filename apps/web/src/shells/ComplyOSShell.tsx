import { Routes, Route } from 'react-router-dom';
import '../pages/ComplyOS.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { RequireRoles } from '../components/RequireRoles.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import { ComplyDashboard }    from '../pages/ComplyDashboard.js';
import { ComplyApplications, NewApplicationPage } from '../pages/ComplyApplications.js';
import { ComplyObligations, AddObligationPage }   from '../pages/ComplyObligations.js';
import { ComplyVault, AddCertificatePage }        from '../pages/ComplyVault.js';
import { ComplyCalendar, AddReminderPage }        from '../pages/ComplyCalendar.js';
import { ComplyLegal, EngageFirmPage }            from '../pages/ComplyLegal.js';
import { ComplyAgencies }     from '../pages/ComplyAgencies.js';
import { ComplyWorkflows }    from '../pages/ComplyWorkflows.js';
import { ComplyBrelaSearch }  from '../pages/ComplyBrelaSearch.js';
import { ComplyBrelaHistory } from '../pages/ComplyBrelaHistory.js';
import { ComplyCompanyDirectory } from '../pages/ComplyCompanyDirectory.js';
import { ComplyObligationScanPage } from '../pages/ComplyObligationScanPage.js';
import { ComplyLicenseCatalog } from '../pages/ComplyLicenseCatalog.js';
import { ComplyLicenseApply }   from '../pages/ComplyLicenseApply.js';
import { ComplyTraExtract }     from '../pages/ComplyTraExtract.js';
import { ComplyLicenseAutomation } from '../pages/ComplyLicenseAutomation.js';

const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'home', path: '/complyos', exact: true },
    ],
  },
  {
    title: 'COMPLIANCE',
    items: [
      { label: 'Applications', icon: 'fileText',   path: '/complyos/applications'  },
      { label: 'Obligations',  icon: 'clipboardList', path: '/complyos/obligations' },
      { label: 'Vault',        icon: 'lock',        path: '/complyos/vault'         },
      { label: 'Calendar',     icon: 'calendar',    path: '/complyos/calendar'      },
      { label: 'Workflows',    icon: 'zap',         path: '/complyos/workflows'     },
      { label: 'License Automation', icon: 'zap',   path: '/complyos/license-automation' },
    ],
  },
  {
    title: 'REGISTRY SEARCH',
    items: [
      { label: 'BRELA Search', icon: 'search',   path: '/complyos/brela-search' },
      { label: 'Company Directory', icon: 'briefcase', path: '/complyos/companies' },
      { label: 'Legal',        icon: 'fileText', path: '/complyos/legal'        },
      { label: 'Agencies',     icon: 'building', path: '/complyos/agencies'     },
      { label: 'Licence Catalogue', icon: 'invoice', path: '/complyos/license-catalog' },
      { label: 'TIN Portal Agent', icon: 'zap',      path: '/complyos/tra-extract' },
    ],
  },
];

export function ComplyOSShell() {
  return (
    <WorkspaceApp appId="complyos">
      <div className="app-shell" data-complyos="true">
        <AppSidebar appId="complyos" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
          <Routes>
            <Route element={<PageLayout />}>
              <Route index                        element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyDashboard /></RequireRoles>}         />
              <Route path="applications"          element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyApplications /></RequireRoles>}      />
              <Route path="applications/new"      element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><NewApplicationPage /></RequireRoles>}      />
              <Route path="obligations"           element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyObligations /></RequireRoles>}       />
              <Route path="obligations/new"       element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><AddObligationPage /></RequireRoles>}       />
              <Route path="obligation-scan"       element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyObligationScanPage /></RequireRoles>} />
              <Route path="vault"                 element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyVault /></RequireRoles>}             />
              <Route path="vault/new"             element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><AddCertificatePage /></RequireRoles>}      />
              <Route path="calendar"              element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyCalendar /></RequireRoles>}          />
              <Route path="calendar/new-reminder" element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><AddReminderPage /></RequireRoles>}         />
              <Route path="legal"                 element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyLegal /></RequireRoles>}             />
              <Route path="legal/engage/:firmId"  element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><EngageFirmPage /></RequireRoles>}          />
              <Route path="agencies"              element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyAgencies /></RequireRoles>}          />
              <Route path="workflows"             element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyWorkflows /></RequireRoles>}         />
              <Route path="brela-search"          element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyBrelaSearch /></RequireRoles>}       />
              <Route path="brela-search/history"  element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyBrelaHistory /></RequireRoles>}      />
              <Route path="companies"             element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyCompanyDirectory /></RequireRoles>}  />
              <Route path="license-catalog"           element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyLicenseCatalog /></RequireRoles>} />
              <Route path="license-catalog/apply/:catalogId" element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyLicenseApply /></RequireRoles>} />
              <Route path="tra-extract"               element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyTraExtract /></RequireRoles>} />
              <Route path="license-automation"        element={<RequireRoles roles={MGMT_ROLES} permissions={['comply.manage']}><ComplyLicenseAutomation /></RequireRoles>} />
            </Route>
          </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

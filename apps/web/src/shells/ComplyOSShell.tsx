import { Routes, Route } from 'react-router-dom';
import '../pages/ComplyOS.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
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
              <Route index                        element={<ComplyDashboard />}         />
              <Route path="applications"          element={<ComplyApplications />}      />
              <Route path="applications/new"      element={<NewApplicationPage />}      />
              <Route path="obligations"           element={<ComplyObligations />}       />
              <Route path="obligations/new"       element={<AddObligationPage />}       />
              <Route path="obligation-scan"       element={<ComplyObligationScanPage />} />
              <Route path="vault"                 element={<ComplyVault />}             />
              <Route path="vault/new"             element={<AddCertificatePage />}      />
              <Route path="calendar"              element={<ComplyCalendar />}          />
              <Route path="calendar/new-reminder" element={<AddReminderPage />}         />
              <Route path="legal"                 element={<ComplyLegal />}             />
              <Route path="legal/engage/:firmId"  element={<EngageFirmPage />}          />
              <Route path="agencies"              element={<ComplyAgencies />}          />
              <Route path="workflows"             element={<ComplyWorkflows />}         />
              <Route path="brela-search"          element={<ComplyBrelaSearch />}       />
              <Route path="brela-search/history"  element={<ComplyBrelaHistory />}      />
              <Route path="companies"             element={<ComplyCompanyDirectory />}  />
              <Route path="license-catalog"           element={<ComplyLicenseCatalog />} />
              <Route path="license-catalog/apply/:catalogId" element={<ComplyLicenseApply />} />
              <Route path="tra-extract"               element={<ComplyTraExtract />} />
              <Route path="license-automation"        element={<ComplyLicenseAutomation />} />
            </Route>
          </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { DesignSystemOverviewPage } from '../pages/design_system/DesignSystemOverviewPage.js';
import { GuidancePage } from '../pages/design_system/GuidancePage.js';
import { FoundationsPage } from '../pages/design_system/FoundationsPage.js';
import { ComponentsCatalogPage } from '../pages/design_system/ComponentsCatalogPage.js';
import { PatternsPage } from '../pages/design_system/PatternsPage.js';
import { AppConfiguratorPage } from '../pages/design_system/AppConfiguratorPage.js';
import { QualityGovernancePage } from '../pages/design_system/QualityGovernancePage.js';

const NAV: SidebarSection[] = [
  {
    title: 'System',
    items: [
      { path: '/design-system', label: 'Overview', icon: 'layoutDashboard', exact: true },
      { path: '/design-system/guidance', label: 'Staff Guidance', icon: 'bookOpen' },
      { path: '/design-system/foundations', label: 'Foundations', icon: 'color' },
      { path: '/design-system/components', label: 'Components', icon: 'layers' },
      { path: '/design-system/patterns', label: 'Patterns', icon: 'gitBranch' },
    ],
  },
  {
    title: 'Governance',
    items: [
      { path: '/design-system/configurator', label: 'App Configurator', icon: 'sliders' },
      { path: '/design-system/quality', label: 'Quality & Pilots', icon: 'shield' },
    ],
  },
];

const LEGACY_SETTINGS_REDIRECTS: Record<string, string> = {
  themes: '/design-system/foundations/color',
  brand: '/design-system/foundations/color',
  semantic: '/design-system/foundations/color',
  typography: '/design-system/foundations/typography',
  density: '/design-system/foundations/spacing-layout',
  menu: '/design-system/foundations/spacing-layout',
  navbar: '/design-system/foundations/spacing-layout',
  content: '/design-system/foundations/spacing-layout',
  skin: '/design-system/foundations/spacing-layout',
  semidark: '/design-system/foundations/spacing-layout',
  direction: '/design-system/foundations/spacing-layout',
  mobile: '/design-system/foundations/spacing-layout',
  shape: '/design-system/foundations/shape-elevation-icons',
  elevation: '/design-system/foundations/shape-elevation-icons',
  icons: '/design-system/foundations/shape-elevation-icons',
  motion: '/design-system/foundations/motion-accessibility',
  tabs: '/design-system/components',
  dropdowns: '/design-system/components',
  components: '/design-system/components',
  blocks: '/design-system/components',
  oscar: '/design-system/components',
  animations: '/design-system/components',
  identity: '/design-system/configurator',
  apps: '/design-system/configurator',
  login: '/design-system/configurator',
};

function LegacySettingsRedirect() {
  const { section } = useParams<{ section?: string }>();
  const target = (section && LEGACY_SETTINGS_REDIRECTS[section]) || '/design-system/foundations/color';
  return <Navigate to={target} replace />;
}

export function DesignSystemShell() {
  return (
    <WorkspaceApp appId="design-system">
      <div className="app-shell">
        <AppSidebar appId="design-system" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<DesignSystemOverviewPage />} />
                <Route path="guidance" element={<GuidancePage />} />
                <Route path="guidance/:role" element={<GuidancePage />} />
                <Route path="foundations" element={<FoundationsPage />} />
                <Route path="foundations/:topic" element={<FoundationsPage />} />
                <Route path="components" element={<ComponentsCatalogPage />} />
                <Route path="components/:layer" element={<ComponentsCatalogPage />} />
                <Route path="patterns" element={<PatternsPage />} />
                <Route path="patterns/:patternId" element={<PatternsPage />} />
                <Route path="configurator" element={<AppConfiguratorPage />} />
                <Route path="configurator/:appId" element={<AppConfiguratorPage />} />
                <Route path="quality" element={<QualityGovernancePage />} />
                <Route path="quality/:tab" element={<QualityGovernancePage />} />
                <Route path="settings" element={<Navigate to="/design-system/foundations/color" replace />} />
                <Route path="settings/:section" element={<LegacySettingsRedirect />} />
                <Route path="*" element={<Navigate to="/design-system" replace />} />
              </Route>
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

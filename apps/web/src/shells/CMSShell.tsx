import { Routes, Route } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { CMS } from '../pages/CMS.js';

// CMS.tsx switches its own views via a ?v= query param (not nested routes),
// so every nav item points at the same /cms index route with a different
// query value rather than a distinct path.
const NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', icon: 'home',       path: '/cms?v=dashboard', exact: true },
      { label: 'Posts',     icon: 'fileText',    path: '/cms?v=posts' },
      { label: 'Pages',     icon: 'file',        path: '/cms?v=pages' },
      { label: 'Comments',  icon: 'messageSquare', path: '/cms?v=comments' },
      { label: 'Customize', icon: 'settings',    path: '/cms?v=customize' },
    ],
  },
];

export function CMSShell() {
  return (
    <WorkspaceApp appId="onesite">
      <div className="app-shell" data-cms="true">
        <AppSidebar appId="onesite" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<CMS />} />
              </Route>
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

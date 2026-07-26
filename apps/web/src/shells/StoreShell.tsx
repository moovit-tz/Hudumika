import { Routes, Route, Navigate, useSearchParams, Link } from 'react-router-dom';
import '../pages/Store.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { Icon } from '../components/Icon.js';
import type { IconName } from '../components/Icon.js';
import { Store } from '../pages/Store.js';
import { StoreDeveloperPortal } from '../pages/StoreDeveloperPortal.js';
import { StoreAdmin } from '../pages/StoreAdmin.js';

const NAV: SidebarSection[] = [
  {
    title: 'ADD-ONS',
    items: [
      { label: 'Browse',     icon: 'grid',     path: '/store', exact: true },
      { label: 'Installed',  icon: 'package',  path: '/store/installed'    },
      { label: 'Updates',    icon: 'upload',   path: '/store/updates'      },
    ],
  },
  {
    title: 'DEVELOPERS',
    items: [
      { label: 'Submit App', icon: 'terminal',     path: '/store/developer' },
      { label: 'Store Admin', icon: 'shield',   path: '/store/admin' },
    ],
  },
];

const STORE_CATEGORIES: { key: string; label: string; icon: IconName }[] = [
  { key: 'all',           label: 'All Apps',       icon: 'grid'          },
  { key: 'business',      label: 'Business Tools', icon: 'briefcase'     },
  { key: 'productivity',  label: 'Productivity',   icon: 'checkCircle'   },
  { key: 'communication', label: 'Communication',  icon: 'messageSquare' },
  { key: 'utility',       label: 'Utilities',      icon: 'settings'      },
  { key: 'ai',            label: 'AI & Analytics', icon: 'activity'      },
];

function StoreCategoryNav({ collapsed }: { collapsed: boolean }) {
  const [searchParams] = useSearchParams();
  const active = searchParams.get('cat') ?? 'all';

  return (
    <div className="store-cat-nav">
      {!collapsed && <div className="app-sb-section-hdr">CATEGORIES</div>}
      {STORE_CATEGORIES.map(cat => (
        <Link
          key={cat.key}
          to={`/store?cat=${cat.key}`}
          className={`app-sb-item${active === cat.key ? ' app-sb-item--active' : ''}`}
          title={collapsed ? cat.label : undefined}
        >
          <span className="app-sb-item-icon">
            <Icon name={cat.icon} size={16} strokeWidth={1.8} />
          </span>
          {!collapsed && <span className="app-sb-item-label">{cat.label}</span>}
        </Link>
      ))}
    </div>
  );
}

export function StoreShell() {
  return (
    <WorkspaceApp appId="store">
      <div className="app-shell" data-store="true">
        <AppSidebar appId="store" sections={NAV}
          afterNav={({ collapsed }) => <StoreCategoryNav collapsed={collapsed} />} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
          <Routes>
            <Route element={<PageLayout />}>
              <Route index element={<Store />} />
              <Route path="installed" element={<Store />} />
              <Route path="updates"   element={<Store />} />
              <Route path="developer" element={<StoreDeveloperPortal />} />
              <Route path="admin" element={<StoreAdmin />} />
            </Route>
            <Route path="*" element={<Navigate to="/store" replace />} />
          </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}
export default StoreShell;

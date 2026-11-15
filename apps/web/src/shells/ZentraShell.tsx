import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { useAuth } from '../hooks/useAuth.js';
import { Icon } from '../components/Icon.js';
import { roleCanOpenApp } from '../components/LauncherApps.js';

import { ZentraOverview } from '../pages/zentra/ZentraOverview.js';
import { ZentraActivity } from '../pages/zentra/ZentraActivity.js';
import { ZentraRiskSignals } from '../pages/zentra/ZentraRiskSignals.js';
import { ZentraCases } from '../pages/zentra/ZentraCases.js';
import { ZentraCaseDetail } from '../pages/zentra/ZentraCaseDetail.js';
import { ZentraPolicies } from '../pages/zentra/ZentraPolicies.js';
import { ZentraSettings } from '../pages/zentra/ZentraSettings.js';
import { ZentraPlatformOversight } from '../pages/zentra/ZentraPlatformOversight.js';

export function ZentraShell() {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';

  const NAV: SidebarSection[] = [
    {
      items: [
        { label: 'Overview',       icon: 'shield',        path: '/zentra',            exact: true },
        { label: 'Audit Activity', icon: 'list',          path: '/zentra/activity'   },
      ],
    },
    {
      title: 'Detection & Response',
      items: [
        { label: 'Risk Signals',   icon: 'alertTriangle', path: '/zentra/risk'        },
        { label: 'Investigations', icon: 'folder',        path: '/zentra/cases'       },
      ],
    },
    {
      title: 'Trust & Governance',
      items: [
        { label: 'Access Policies', icon: 'lock',         path: '/zentra/policies'    },
        { label: 'Ingestion & Rules', icon: 'settings',   path: '/zentra/settings'    },
        ...(isSuperAdmin ? [{
          label: 'Platform Oversight',
          icon: 'eye' as const,
          path: '/zentra/oversight',
          badge: 'Platform',
        }] : []),
      ],
    },
  ];

  return (
    <WorkspaceApp appId="zentra">
      <div className="app-shell">
        <AppSidebar appId="zentra" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            {!roleCanOpenApp('zentra', user?.role) ? (
              <div role="status" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: '60vh', padding: 24, textAlign: 'center' }}>
                <Icon name="lock" size={28} color="var(--ink3)" />
                <h1 style={{ fontSize: 18, fontWeight: 700, color: 'var(--ink)', margin: 0 }}>Zentra is for admins and managers</h1>
                <p style={{ fontSize: 13, color: 'var(--ink3)', maxWidth: 420, margin: 0 }}>
                  It holds your workspace's audit log and investigations. Ask a workspace admin if you need something looked into.
                </p>
              </div>
            ) : (
            <Routes>
              <Route element={<PageLayout />}>
                <Route index element={<ZentraOverview />} />
                <Route path="activity" element={<ZentraActivity />} />
                <Route path="risk" element={<ZentraRiskSignals />} />
                <Route path="cases" element={<ZentraCases />} />
                <Route path="cases/:id" element={<ZentraCaseDetail />} />
                <Route path="policies" element={<ZentraPolicies />} />
                <Route path="settings" element={<ZentraSettings />} />
                <Route path="oversight" element={<ZentraPlatformOversight />} />
              </Route>
              <Route path="*" element={<Navigate to="/zentra" replace />} />
            </Routes>
            )}
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}


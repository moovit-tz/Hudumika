import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { AIAutomations } from '../pages/AIAutomations.js';
import { AgentWorkspace } from '../pages/AgentWorkspace.js';
import { AIInsights } from '../pages/AIInsights.js';
import { AgentControls } from '../pages/AgentControls.js';
import '../pages/AI.css';

const NAV: SidebarSection[] = [
  {
    title: 'INTELLIGENCE',
    items: [
      { label: 'Agent',       icon: 'zap',        path: '/ai/agent'       },
      { label: 'Automations', icon: 'zap',        path: '/ai/automations' },
      { label: 'Insights',    icon: 'activity',   path: '/ai/insights'    },
      { label: 'Controls',    icon: 'settings',   path: '/ai/controls'    },
    ],
  },
];

export function AIShell() {
  return (
    <WorkspaceApp appId="ai">
      <div className="app-shell" data-ai="true">
        <AppSidebar appId="ai" sections={NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
          <Routes>
            <Route index element={<Navigate to="agent" replace />} />
            <Route path="agent" element={<AgentWorkspace />} />
            <Route path="chat" element={<Navigate to="/ai/agent" replace />} />
            <Route element={<PageLayout />}>
              <Route path="automations" element={<AIAutomations />} />
              <Route path="insights"    element={<AIInsights />} />
              <Route path="controls"    element={<AgentControls />} />
            </Route>
            <Route path="*" element={<Navigate to="/ai" replace />} />
          </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { AIAutomations } from '../pages/AIAutomations.js';
import { AIChat } from '../pages/AIChat.js';
import { AIInsights } from '../pages/AIInsights.js';
import '../pages/AI.css';

const NAV: SidebarSection[] = [
  {
    title: 'INTELLIGENCE',
    items: [
      { label: 'Chat',        icon: 'chatBubble', path: '/ai/chat'        },
      { label: 'Automations', icon: 'zap',        path: '/ai/automations' },
      { label: 'Insights',    icon: 'activity',   path: '/ai/insights'    },
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
            <Route index element={<Navigate to="chat" replace />} />
            <Route element={<PageLayout />}>
              <Route path="chat"        element={<AIChat />} />
              <Route path="automations" element={<AIAutomations />} />
              <Route path="insights"    element={<AIInsights />} />
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

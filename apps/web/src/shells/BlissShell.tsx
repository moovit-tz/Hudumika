import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/Bliss.css';
import { WorkspaceApp } from './WorkspaceApp.jsx';
import { BlissRail } from '../components/BlissRail.jsx';
import { RequireRoles } from '../components/RequireRoles.jsx';
import { PageLayout } from '../components/PageLayout.jsx';
import { MGMT_ROLES } from '../lib/permissions.js';

import { Support }         from '../pages/Support.jsx';
import { SupportOverview } from '../pages/SupportOverview.jsx';
import { Escalations }     from '../pages/Escalations.jsx';
import { SupportChat }     from '../pages/SupportChat.jsx';
import { SupportKB }       from '../pages/SupportKB.jsx';
import { SupportSettings } from '../pages/SupportSettings.jsx';

// Bliss uses its own Bedesk-style icon rail (BlissRail) instead of the
// shared AppHeader + AppSidebar every other app uses — see
// components/BlissRail.tsx for why (matching Bedesk's layout without
// touching the chrome shared by every other app).
export function BlissShell() {
  return (
    <WorkspaceApp appId="bliss">
      <div className="app-shell bliss-shell" data-bliss="true">
        <BlissRail />
        <div className="app-shell-content bliss-shell-content">
          <Routes>
            <Route index element={<SupportOverview />} />

            <Route path="tickets" element={<Support />} />
            <Route path="chat"    element={<SupportChat />} />

            <Route element={<PageLayout />}>
              <Route path="overview"    element={<SupportOverview />} />
              <Route path="kb"          element={<SupportKB />} />
              <Route path="settings"    element={<SupportSettings />} />
              <Route path="escalations" element={<RequireRoles roles={[...MGMT_ROLES, 'SENIOR']}><Escalations /></RequireRoles>} />
            </Route>

            <Route path="*" element={<Navigate to="/bliss" replace />} />
          </Routes>
        </div>
      </div>
    </WorkspaceApp>
  );
}

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { FileBrowser } from '../pages/cloud/FileBrowser.js';
import { CloudHome } from '../pages/cloud/CloudHome.js';
import { CloudProvider, useCloud } from './cloud-context.js';
import { CloudSidebarContent } from './CloudSidebar.js';

function CloudHeader() {
  const { search, setSearch } = useCloud();
  return (
    <AppHeader
      appSearch={search}
      onAppSearchChange={setSearch}
      appSearchPlaceholder="Search in Drive…"
    />
  );
}

export function CloudShell() {
  return (
    <CloudProvider>
      <WorkspaceApp appId="cloud">
        <div className="app-shell" data-cloud="true">
          <AppSidebar
            appId="cloud"
            sections={[]}
            fillNav={({ collapsed }) => <CloudSidebarContent collapsed={collapsed} />}
          />
          <div className="app-main">
            <CloudHeader />
            <div className="app-shell-content">
              <Routes>
                
                <Route element={<PageLayout />}>
                  <Route index           element={<FileBrowser />} />
                  <Route path="home"     element={<Navigate to="/cloud" replace />} />
                  <Route path="files"    element={<Navigate to="/cloud" replace />} />
                  <Route path="shared"   element={<FileBrowser />} />
                  <Route path="recent"   element={<FileBrowser />} />
                  <Route path="trash"    element={<FileBrowser />} />
                </Route>
                <Route path="*" element={<Navigate to="/cloud" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </WorkspaceApp>
    </CloudProvider>
  );
}

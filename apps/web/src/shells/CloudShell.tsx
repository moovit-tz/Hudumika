import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import '../pages/Cloud.css';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { FileManager } from '../pages/FileManager.js';
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
                <Route index element={<Navigate to="files" replace />} />
                <Route element={<PageLayout />}>
                  <Route path="files"    element={<FileManager />} />
                  <Route path="shared"   element={<FileManager />} />
                  <Route path="recent"   element={<FileManager />} />
                  <Route path="trash"    element={<FileManager />} />
                </Route>
                <Route path="*" element={<Navigate to="/cloud/files" replace />} />
              </Routes>
            </div>
          </div>
        </div>
      </WorkspaceApp>
    </CloudProvider>
  );
}

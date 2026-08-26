// ─── SignShell.tsx — eSign app shell ─────────────────────────────────────────
// Registered at /sign/* in App.tsx.
// The public signing (/sign/public/:token) and verify (/sign/verify/:code)
// routes are separate in App.tsx — they don't use this shell.

import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar, type SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { PageLayout } from '../components/PageLayout.js';
import { SignInbox, SignEnvelopeDetail } from '../pages/sign/SignInbox.js';
import { SignEditor } from '../pages/sign/SignEditor.js';
import { SignTemplates } from '../pages/sign/SignTemplates.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';

const SIGN_NAV: SidebarSection[] = [
  {
    items: [
      { label: 'Inbox',      path: '/sign',           icon: 'inbox',    exact: true },
      { label: 'Sent',       path: '/sign/sent',       icon: 'mail' },
      { label: 'Drafts',     path: '/sign/drafts',     icon: 'edit' },
      { label: 'Completed',  path: '/sign/completed',  icon: 'checkCircle' },
      // Voided and Declined used to share the same xCircle icon — both are
      // "this didn't happen" outcomes, but for opposite reasons (you pulled
      // it vs. they refused it), so they need to look different at a glance.
      { label: 'Voided',     path: '/sign/voided',     icon: 'xCircle' },
      { label: 'Declined',   path: '/sign/declined',   icon: 'userMinus' },
      { label: 'Expired',    path: '/sign/expired',    icon: 'clock' },
    ],
  },
  {
    title: 'Create',
    items: [
      { label: 'New Envelope', path: '/sign/editor',    icon: 'plusCircle' },
      { label: 'Templates',    path: '/sign/templates', icon: 'layers' },
    ],
  },
  {
    title: 'Verify',
    items: [
      { label: 'Verify Document', path: '/sign/verify', icon: 'shield' },
    ],
  },
];

export function SignShell() {
  return (
    <WorkspaceApp appId="sign">
      <div className="app-shell" data-sign="true">
        <AppSidebar appId="sign" sections={SIGN_NAV} />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              {/* Editor is full-bleed — needs entire viewport, no PageLayout wrapper */}
              <Route path="editor"       element={<SignEditor />} />
              <Route path="editor/:id"   element={<SignEditor />} />

              {/* Standard page-layout routes */}
              <Route element={<PageLayout />}>
                <Route index                  element={<SignInbox view="inbox" />} />
                <Route path="sent"            element={<SignInbox view="sent" />} />
                <Route path="drafts"          element={<SignInbox view="drafts" />} />
                <Route path="completed"       element={<SignInbox view="completed" />} />
                <Route path="voided"          element={<SignInbox view="voided" />} />
                <Route path="declined"        element={<SignInbox view="declined" />} />
                <Route path="expired"         element={<SignInbox view="expired" />} />
                <Route path="envelope/:id"    element={<SignEnvelopeDetail />} />
                <Route path="templates"       element={<SignTemplates />} />
                <Route path="*"               element={<Navigate to="/sign" replace />} />
              </Route>
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

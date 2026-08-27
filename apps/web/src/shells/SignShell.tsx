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
import { RequireRoles } from '../components/RequireRoles.js';
import { useAuth } from '../hooks/useAuth.js';
import { SignInbox, SignEnvelopeDetail, SignAllDocuments } from '../pages/sign/SignInbox.js';
import { SignEditor } from '../pages/sign/SignEditor.js';
import { SignTemplates } from '../pages/sign/SignTemplates.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';

// Same allow-list as the backend's DOCUMENT_ADMIN_ROLES (sign.routes.ts) —
// whoever can already administer this tenant is who can see every user's
// documents in one place, not a separately-configured permission.
const DOCUMENT_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN', 'TENANT_ADMIN'] as const;

function buildNav(isDocAdmin: boolean): SidebarSection[] {
  return [
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
    // Only rendered for a tenant admin — every other view above is already
    // scoped to "documents I own or I'm a recipient on"; this is the one
    // place to browse every user's envelopes in the tenant.
    ...(isDocAdmin ? [{
      title: 'Admin',
      items: [
        { label: 'All Documents', path: '/sign/admin/all', icon: 'users' as const },
      ],
    }] : []),
  ];
}

export function SignShell() {
  const { user } = useAuth();
  const isDocAdmin = !!user && (DOCUMENT_ADMIN_ROLES as readonly string[]).includes(user.role);
  const NAV = buildNav(isDocAdmin);
  return (
    <WorkspaceApp appId="sign">
      <div className="app-shell" data-sign="true">
        <AppSidebar appId="sign" sections={NAV} />
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
                <Route path="admin/all"       element={<RequireRoles roles={[...DOCUMENT_ADMIN_ROLES]}><SignAllDocuments /></RequireRoles>} />
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

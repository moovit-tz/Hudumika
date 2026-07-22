import { Routes, Route, Navigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { EmailApp } from '../pages/EmailApp.js';
import { Icon } from '../components/Icon.js';

const NAV: SidebarSection[] = [
  {
    title: 'MAIL',
    items: [
      { label: 'Inbox',   icon: 'mail',        path: '/email',          exact: true },
      { label: 'Starred', icon: 'star',        path: '/email/starred'               },
      { label: 'Sent',    icon: 'send',        path: '/email/sent'                  },
      { label: 'Drafts',  icon: 'fileText',    path: '/email/drafts'                },
      { label: 'Spam',    icon: 'alertCircle', path: '/email/spam'                  },
      { label: 'Trash',   icon: 'trash',       path: '/email/trash'                 },
    ],
  },
];

function ComposeButton({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`em-shell-compose${collapsed ? ' em-shell-compose--collapsed' : ''}`}>
      <button
        type="button"
        className="em-shell-compose-btn"
        onClick={() => window.dispatchEvent(new CustomEvent('hudumika:email-compose'))}
        title={collapsed ? 'Compose' : undefined}
      >
        <Icon name="edit" size={20} color="#444" />
        {!collapsed && <span>Compose</span>}
      </button>
    </div>
  );
}

export function EmailShell() {
  return (
    <WorkspaceApp appId="email">
      <div className="app-shell">
        <AppSidebar
          appId="email"
          sections={NAV}
          beforeNav={({ collapsed }) => <ComposeButton collapsed={collapsed} />}
        />
        <div className="app-main">
          <AppHeader />
          <div className="app-shell-content">
            <Routes>
              <Route index           element={<EmailApp />} />
              <Route path="starred"  element={<EmailApp />} />
              <Route path="sent"     element={<EmailApp />} />
              <Route path="drafts"   element={<EmailApp />} />
              <Route path="spam"     element={<EmailApp />} />
              <Route path="trash"    element={<EmailApp />} />
              <Route path="*"        element={<Navigate to="/email" replace />} />
            </Routes>
          </div>
        </div>
      </div>
    </WorkspaceApp>
  );
}

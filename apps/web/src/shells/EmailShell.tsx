import { useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { WorkspaceApp } from './WorkspaceApp.js';
import { AppSidebar } from '../components/AppSidebar.js';
import type { SidebarSection } from '../components/AppSidebar.js';
import { AppHeader } from '../components/AppHeader.js';
import { EmailApp } from '../pages/EmailApp.js';
import { EmailTemplates } from '../pages/EmailTemplates.js';
import { Icon } from '../components/Icon.js';
import { GoogleWorkspaceRightSidebar } from '../components/GoogleWorkspaceRightSidebar.js';
import { apiFetch } from '../lib/api.js';

interface FolderCounts { inbox: number; starred: number; drafts: number; scheduled: number; spam: number; labels: Record<string, number>; }
const EMPTY_COUNTS: FolderCounts = { inbox: 0, starred: 0, drafts: 0, scheduled: 0, spam: 0, labels: {} };

/** Sidebar badges — GET /v1/emails/folder-counts (real unread/item counts,
 *  not a fabricated number). A badge is only ever a `count`, matching
 *  AppSidebar's own count variant (solid pill, app-accent colour); zero
 *  hides the badge entirely rather than showing "0", same as Gmail. */
function buildNav(counts: FolderCounts): SidebarSection[] {
  const badge = (n: number) => (n > 0 ? { badge: n > 99 ? '99+' : String(n), badgeVariant: 'count' as const } : {});
  return [
    {
      title: 'MAIL',
      items: [
        { label: 'Inbox',     icon: 'mail',        path: '/email',           exact: true, ...badge(counts.inbox) },
        { label: 'Starred',   icon: 'star',        path: '/email/starred',                ...badge(counts.starred) },
        { label: 'Sent',      icon: 'send',        path: '/email/sent'                   },
        { label: 'Scheduled', icon: 'clock',       path: '/email/scheduled',              ...badge(counts.scheduled) },
        { label: 'Drafts',    icon: 'fileText',    path: '/email/drafts',                 ...badge(counts.drafts) },
        { label: 'Archive',   icon: 'folder',      path: '/email/archive'                },
        { label: 'Spam',      icon: 'alertCircle', path: '/email/spam',                   ...badge(counts.spam) },
        { label: 'Trash',     icon: 'trash',       path: '/email/trash'                  },
      ],
    },
    {
      title: 'MANAGE',
      items: [
        { label: 'Templates', icon: 'layers', path: '/email/templates' },
      ],
    },
  ];
}

function ComposeButton({ collapsed }: { collapsed: boolean }) {
  return (
    <div className={`app-sidebar-create-action-wrap${collapsed ? ' app-sidebar-create-action-wrap--collapsed' : ''}`}>
      <button
        type="button"
        className="app-sidebar-create-action"
        onClick={() => window.dispatchEvent(new CustomEvent('hudumika:email-compose'))}
        title={collapsed ? 'Compose' : undefined}
      >
        <span className="app-sidebar-create-action-icon"><Icon name="edit" size={16} /></span>
        {!collapsed && <span>Compose</span>}
      </button>
    </div>
  );
}

function EmailHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const query = new URLSearchParams(location.search).get('q') ?? '';

  function setQuery(value: string) {
    const params = new URLSearchParams(location.search);
    const trimmed = value.trimStart();
    if (trimmed) params.set('q', trimmed);
    else params.delete('q');
    navigate({ pathname: location.pathname, search: params.toString() }, { replace: true });
  }

  return (
    <AppHeader
      appSearch={query}
      onAppSearchChange={setQuery}
      appSearchPlaceholder="Search this mailbox…"
    />
  );
}

export function EmailShell() {
  // Fetched here (not lifted from EmailApp.tsx) so the sidebar's "Labels"
  // section works independent of whether EmailApp itself has mounted/loaded
  // yet — same cheap GET, just called from wherever it's needed.
  const [labels, setLabels] = useState<{ id: string; name: string; hidden?: boolean }[]>([]);
  useEffect(() => {
    apiFetch('/v1/email/labels').then(res => setLabels(Array.isArray(res) ? res : [])).catch(() => {});
  }, []);
  // "Show in label list" (Settings ▸ Labels) — a label can stay usable
  // (applyable to messages, manageable in Settings) without cluttering the
  // sidebar nav.
  const visibleLabels = labels.filter(l => !l.hidden);

  // Polled (not just fetched once) so the badges track what's actually
  // happening — a new message arriving, or one you just read/sent/moved —
  // without needing every action in EmailApp.tsx to know this sidebar
  // exists and push it an update. Refetching on focus catches the common
  // case (you left the tab, mail arrived, you came back) without waiting
  // out the rest of the interval.
  const [counts, setCounts] = useState<FolderCounts>(EMPTY_COUNTS);
  useEffect(() => {
    const load = () => apiFetch('/v1/emails/folder-counts').then(setCounts).catch(() => {});
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleLoad = () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(load, 600);
    };
    load();
    const interval = setInterval(load, 30_000);
    window.addEventListener('focus', load);
    window.addEventListener('hudumika:email-counts-changed', scheduleLoad);
    return () => {
      clearInterval(interval);
      if (refreshTimer) clearTimeout(refreshTimer);
      window.removeEventListener('focus', load);
      window.removeEventListener('hudumika:email-counts-changed', scheduleLoad);
    };
  }, []);

  const nav: SidebarSection[] = visibleLabels.length > 0
    ? [...buildNav(counts), { title: 'LABELS', items: visibleLabels.map(l => ({ label: l.name, icon: 'tag' as const, path: `/email?label=${encodeURIComponent(l.name)}`, ...((counts.labels[l.name] ?? 0) > 0 ? { badge: String(Math.min(counts.labels[l.name], 99)) + (counts.labels[l.name] > 99 ? '+' : ''), badgeVariant: 'count' as const } : {}) })) }]
    : buildNav(counts);

  return (
    <WorkspaceApp appId="email">
      <div className="app-shell">
        <AppSidebar
          appId="email"
          sections={nav}
          beforeNav={({ collapsed }) => <ComposeButton collapsed={collapsed} />}
        />
        <div className="app-main">
          <EmailHeader />
          <div className="app-shell-content">
            <Routes>
              <Route index           element={<EmailApp />} />
              <Route path="starred"  element={<EmailApp />} />
              <Route path="sent"     element={<EmailApp />} />
              <Route path="scheduled" element={<EmailApp />} />
              <Route path="drafts"   element={<EmailApp />} />
              <Route path="archive"  element={<EmailApp />} />
              <Route path="spam"     element={<EmailApp />} />
              <Route path="trash"    element={<EmailApp />} />
              <Route path="templates" element={<EmailTemplates />} />
              <Route path="*"        element={<Navigate to="/email" replace />} />
            </Routes>
          </div>
        </div>
        <GoogleWorkspaceRightSidebar />
      </div>
    </WorkspaceApp>
  );
}

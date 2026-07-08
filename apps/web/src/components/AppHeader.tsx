import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { NotificationCentre } from './NotificationCentre.js';
import { Icon } from './Icon.js';
import { APP_COLORS, ActiveAppContext, MobileNavContext } from '../shells/WorkspaceApp.js';
import { useBranding } from '../hooks/useBranding.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { apiFetch } from '../lib/api.js';
import './AppHeader.css';

// ── Launcher app list ──────────────────────────────────────────

const LAUNCHER_APPS: Array<{ id: string; name: string; color: string; path: string }> = [
  { id: 'clearos',   name: 'ClearOS',  color: '#ea580c', path: '/clearos'   },
  { id: 'finops',    name: 'FinOps',   color: '#0284c7', path: '/finance'   },
  { id: 'onepi',     name: 'NexusHR',  color: '#0d9488', path: '/onepi'     },
  { id: 'bliss',     name: 'Bliss',    color: '#7c3aed', path: '/bliss'     },
  { id: 'complyos',  name: 'ComplyOS', color: '#059669', path: '/complyos'  },
  { id: 'crm',       name: 'CRM',      color: '#16a34a', path: '/crm'       },
  { id: 'cloud',     name: 'Cloud',    color: '#0369a1', path: '/cloud'     },
  { id: 'email',     name: 'Email',    color: '#0078d4', path: '/email'     },
  { id: 'contacts',  name: 'Contacts', color: '#1a73e8', path: '/contacts'  },
  { id: 'ai',        name: 'AI',       color: '#6d28d9', path: '/ai'        },
  { id: 'store',     name: 'Store',    color: '#8b5cf6', path: '/store'     },
  { id: 'workspace', name: 'Admin',    color: '#64748b', path: '/workspace' },
];

// ── App SVG icons for launcher ─────────────────────────────────

const LAUNCHER_SVG_ICONS: Record<string, React.ReactElement> = {
  clearos:  (<g stroke="white" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="20" cy="12" r="3"/><path d="M16 10.5L24 10.5"/><line x1="20" y1="15" x2="20" y2="30"/><line x1="12" y1="21" x2="28" y2="21"/><path d="M20 30 C14.5 30 11 27.5 11 24"/><path d="M20 30 C25.5 30 29 27.5 29 24"/></g>),
  finops:   (<g fill="white"><rect x="8" y="25" width="6.5" height="8" rx="2"/><rect x="17" y="18.5" width="6.5" height="14.5" rx="2" opacity="0.8"/><rect x="26" y="11" width="6.5" height="22" rx="2" opacity="0.65"/></g>),
  complyos: (<g><path d="M20 6L31 10L31 20.5C31 27 26.5 32 20 34C13.5 32 9 27 9 20.5L9 10Z" fill="white" opacity="0.92"/><path d="M14 21L17.5 25L26 16" stroke="#059669" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>),
  bliss:    (<g><path d="M7,3H25Q29,3 29,7V20Q29,24 25,24H13L8,31L12,24H7Q3,24 3,20V7Q3,3 7,3Z" fill="white"/><line x1="10" y1="11" x2="24" y2="11" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"/><line x1="10" y1="16" x2="20" y2="16" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round"/></g>),
  onepi:    (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L32 13L32 27L20 34L8 27L8 13Z" opacity="0.25" fill="white"/><circle cx="20" cy="12" r="2" fill="white"/><circle cx="14" cy="22" r="2" fill="white"/><circle cx="26" cy="22" r="2" fill="white"/><line x1="20" y1="12" x2="14" y2="22"/><line x1="20" y1="12" x2="26" y2="22"/><line x1="14" y1="22" x2="26" y2="22"/><circle cx="20" cy="19" r="3.5" fill="white"/></g>),
  cloud:    (<g><path d="M27.5 18C27 13.5 23.2 10 18.8 10C15.5 10 12.5 12 11 15C8 15.7 5.5 18.2 5.5 21.5C5.5 24.8 8.2 27.5 11.5 27.5L28.5 27.5C31.5 27.5 34 25 34 22C34 19.2 31.8 17 28.5 16.7Z" fill="white" opacity="0.9"/><g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="20" y1="23.5" x2="20" y2="34"/><path d="M15.5 29L20 34L24.5 29"/></g></g>),
  ai:       (<g fill="white"><path d="M20 5L22.2 16L33 18.5L22.2 21L20 32L17.8 21L7 18.5L17.8 16Z"/><path d="M31 6L31.9 9L35 9.8L31.9 10.6L31 13.5L30.1 10.6L27 9.8L30.1 9Z" opacity="0.5"/><circle cx="8.5" cy="30" r="2" opacity="0.4"/></g>),
  workspace:(<g fill="white"><rect x="7.5" y="7.5" width="7.5" height="7.5" rx="2"/><rect x="16.5" y="7.5" width="7.5" height="7.5" rx="2"/><rect x="25" y="7.5" width="7.5" height="7.5" rx="2" opacity="0.55"/><rect x="7.5" y="16.5" width="7.5" height="7.5" rx="2"/><rect x="16.5" y="16.5" width="7.5" height="7.5" rx="2" opacity="0.8"/><rect x="25" y="16.5" width="7.5" height="7.5" rx="2" opacity="0.5"/><rect x="7.5" y="25" width="7.5" height="7.5" rx="2" opacity="0.65"/><rect x="16.5" y="25" width="7.5" height="7.5" rx="2" opacity="0.45"/><rect x="25" y="25" width="7.5" height="7.5" rx="2" opacity="0.3"/></g>),
  email:    (<g><rect x="6" y="11" width="28" height="20" rx="3" fill="white" opacity="0.95"/><path d="M6 14L20 23L34 14" stroke="#0078d4" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>),
  crm:      (<g fill="white"><circle cx="20" cy="11" r="4.5"/><path d="M10.5 33C10.5 26.5 14.7 22.5 20 22.5C25.3 22.5 29.5 26.5 29.5 33Z"/><circle cx="10" cy="17" r="3" opacity="0.6"/><path d="M4 31C4 26.5 6.7 23.5 10 23.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/><circle cx="30" cy="17" r="3" opacity="0.6"/><path d="M36 31C36 26.5 33.3 23.5 30 23.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/></g>),
  contacts: (<g fill="white"><circle cx="20" cy="12" r="5"/><path d="M10 28C10 22.5 14.5 19 20 19C25.5 19 30 22.5 30 28Z"/><circle cx="10" cy="18" r="3" opacity="0.6"/><path d="M4 27C4 23.5 6.5 21 10 21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/><circle cx="30" cy="18" r="3" opacity="0.6"/><path d="M36 27C36 23.5 33.5 21 30 21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/></g>),
  store:    (<g fill="white"><rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="22" y="6" width="12" height="12" rx="2.5"/><rect x="6" y="22" width="12" height="12" rx="2.5"/><rect x="22" y="22" width="12" height="12" rx="2.5" opacity="0.45"/><line x1="28" y1="25" x2="28" y2="31" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"/><line x1="25" y1="28" x2="31" y2="28" stroke="#8b5cf6" strokeWidth="2.5" strokeLinecap="round"/></g>),
};

function LauncherAppSvg({ id, color, logoUrl, size = 52 }: { id: string; color: string; logoUrl?: string; size?: number }) {
  const r = Math.round(size * 0.275);
  if (logoUrl) {
    return (
      <div className="app-lnch-custom-icon"
        style={{ '--lnch-bg': color, '--lnch-sz': `${size}px`, '--lnch-r': `${r}px` } as React.CSSProperties}>
        <img src={logoUrl} alt={id} className="app-lnch-custom-icon-img" />
      </div>
    );
  }
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} className="app-lnch-svg-icon">
      <rect width={40} height={40} rx={11} fill={color} />
      {LAUNCHER_SVG_ICONS[id] ?? <rect x="10" y="10" width="20" height="20" rx="4" fill="white" opacity="0.7"/>}
    </svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

function useClickOutside(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  useEffect(() => {
    function handle(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [ref, onClose]);
}

// ── Main component ─────────────────────────────────────────────

export function AppHeader({
  hubSearch,
  onHubSearchChange,
  appSearch,
  onAppSearchChange,
  appSearchPlaceholder,
  filterControl,
}: {
  hubSearch?: string;
  onHubSearchChange?: (q: string) => void;
  appSearch?: string;
  onAppSearchChange?: (q: string) => void;
  appSearchPlaceholder?: string;
  filterControl?: { open: boolean; onToggle: () => void; hasActive?: boolean };
} = {}) {
  const { user, logout } = useAuth();
  const activeApp = useContext(ActiveAppContext);
  const { setMobileOpen } = useContext(MobileNavContext);
  const branding = useBranding();

  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (!activeApp) return false;
    return localStorage.getItem(`${activeApp}-sidebar-collapsed`) === 'true';
  });

  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent;
      if (evt.detail && typeof evt.detail.collapsed === 'boolean') {
        setSidebarCollapsed(evt.detail.collapsed);
      }
    };
    window.addEventListener('sidebar-toggled', handler);
    return () => window.removeEventListener('sidebar-toggled', handler);
  }, []);

  // ── Dark mode ──
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );
  function toggleTheme() {
    const next = !isDark;
    setIsDark(next);
    if (next) {
      document.documentElement.setAttribute('data-theme', 'dark');
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
      localStorage.setItem('theme', 'light');
    }
  }

  // ── Layout toggle (boxed ↔ full-width) ──
  const [isFullLayout, setIsFullLayout] = useState(() => {
    const saved = localStorage.getItem('layout');
    if (saved === 'full') document.documentElement.setAttribute('data-layout', 'full');
    return saved === 'full';
  });
  useEffect(() => {
    if (isFullLayout) {
      document.documentElement.setAttribute('data-layout', 'full');
    } else {
      document.documentElement.removeAttribute('data-layout');
    }
    localStorage.setItem('layout', isFullLayout ? 'full' : 'boxed');
    window.dispatchEvent(new CustomEvent('hudumika-layout-updated'));
  }, [isFullLayout]);

  // Full-width mode also collapses the sidebar (and restores it when
  // switching back) so the toggle actually reclaims the space it promises.
  // This runs as its own effect (not inside setIsFullLayout's updater) —
  // dispatching events / setting another component's state from within a
  // setState updater runs during React's render phase and can get silently
  // dropped ("update while rendering a different component").
  useEffect(() => {
    if (!activeApp) return;
    localStorage.setItem(`${activeApp}-sidebar-collapsed`, String(isFullLayout));
    window.dispatchEvent(new CustomEvent('sidebar-toggled', { detail: { collapsed: isFullLayout } }));
    setSidebarCollapsed(isFullLayout);
  }, [isFullLayout, activeApp]);

  function toggleFullLayout() {
    setIsFullLayout(prev => !prev);
  }

  function expandSidebar() {
    if (!activeApp) return;
    localStorage.setItem(`${activeApp}-sidebar-collapsed`, 'false');
    window.dispatchEvent(new CustomEvent('sidebar-toggled', { detail: { collapsed: false } }));
    setSidebarCollapsed(false);
  }

  // ── Notifications ──
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadNotifs = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/notifications');
      const list: any[] = Array.isArray(data) ? data : (data?.notifications ?? []);
      setNotifs(list);
      setUnreadCount(list.filter((n: any) => !n.read).length);
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => { loadNotifs(); }, [loadNotifs]);

  function handleMarkRead(id: string, _link?: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
    apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }
  function handleMarkAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
    apiFetch('/v1/notifications/read-all', { method: 'PATCH' }).catch(() => {});
  }

  // ── Launcher panel ──
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [appOrder, setAppOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hudumika_launcher_order');
      const parsed = saved ? JSON.parse(saved) : null;
      if (Array.isArray(parsed)) return parsed;
    } catch {}
    return LAUNCHER_APPS.map(a => a.id);
  });
  const dragItemId = useRef<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [recentApps, setRecentApps] = useState<(typeof LAUNCHER_APPS)[0][]>([]);
  const enabledApps = useEnabledApps();

  useEffect(() => {
    if (!launcherOpen) return;
    try {
      const ids: string[] = JSON.parse(localStorage.getItem('hudumika_recently_viewed') ?? '[]');
      setRecentApps(
        ids.slice(0, 5)
          .map(id => LAUNCHER_APPS.find(a => a.id === id))
          .filter((a): a is (typeof LAUNCHER_APPS)[0] => Boolean(a))
          .filter(a => isAppEnabled(a.id, enabledApps))
      );
    } catch { setRecentApps([]); }
  }, [launcherOpen, enabledApps]);

  // ── User dropdown ──
  const [userOpen, setUserOpen] = useState(false);
  const userRef = useRef<HTMLDivElement>(null);
  useClickOutside(userRef, () => setUserOpen(false));

  // ── Avatar color via CSS custom property ──
  const appColor = activeApp ? branding.getAppColor(activeApp, APP_COLORS[activeApp] ?? '#64748b') : '#64748b';
  const avatarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    avatarRef.current?.style.setProperty('--avatar-color', appColor);
  }, [appColor]);

  // ── Launcher helpers ──
  const orderedApps = useMemo(() => {
    const ordered = appOrder
      .map(id => LAUNCHER_APPS.find(a => a.id === id))
      .filter((a): a is (typeof LAUNCHER_APPS)[0] => Boolean(a));
    const extras = LAUNCHER_APPS.filter(a => !appOrder.includes(a.id));
    return [...ordered, ...extras].filter(a => isAppEnabled(a.id, enabledApps));
  }, [appOrder, enabledApps]);

  function closeLauncher() { setLauncherOpen(false); setEditMode(false); }

  function handleDragStart(e: React.DragEvent, id: string) {
    dragItemId.current = id;
    e.dataTransfer.effectAllowed = 'move';
  }

  function handleDragOver(e: React.DragEvent, id: string) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragItemId.current !== id) setDragOverId(id);
  }

  function handleDrop(e: React.DragEvent, targetId: string) {
    e.preventDefault();
    const fromId = dragItemId.current;
    if (!fromId || fromId === targetId) { setDragOverId(null); return; }
    setAppOrder(prev => {
      const base = LAUNCHER_APPS.map(a => a.id);
      const next = [...new Set([...prev, ...base])];
      const fi = next.indexOf(fromId);
      const ti = next.indexOf(targetId);
      if (fi === -1 || ti === -1) return prev;
      next.splice(fi, 1);
      next.splice(ti, 0, fromId);
      localStorage.setItem('hudumika_launcher_order', JSON.stringify(next));
      return next;
    });
    setDragOverId(null);
    dragItemId.current = null;
  }

  function handleDragEnd() { setDragOverId(null); dragItemId.current = null; }

  // Local search state for app pages (hub page controls via prop)
  const [localSearch, setLocalSearch] = useState('');
  const isHub = !!onHubSearchChange;
  const isAppSearch = !!onAppSearchChange;
  const searchValue = isHub ? (hubSearch ?? '') : isAppSearch ? (appSearch ?? '') : localSearch;
  const handleSearch = isHub ? onHubSearchChange! : isAppSearch ? onAppSearchChange! : setLocalSearch;
  const searchPlaceholder = isHub ? 'Search workspaces...' : isAppSearch ? (appSearchPlaceholder ?? 'Search...') : 'Search...';

  return (
    <>
      <header className="app-header">
        <div className={`app-header-inner ${isAppSearch && !isHub ? 'app-header-inner--app' : 'app-header-inner--hub'}`}>

          {/* Left: Hamburger (mobile) + Brand (hub only) */}
          <div className="app-header-left">
            <button
              type="button"
              className="app-header-icon-btn app-header-hamburger"
              onClick={() => setMobileOpen(true)}
              title="Open menu"
            >
              {/* On mobile in app pages show the app's colored icon; otherwise plain hamburger */}
              {activeApp ? (
                <LauncherAppSvg id={activeApp} color={appColor} logoUrl={branding.getAppLogo(activeApp)} size={28} />
              ) : (
                <Icon name="menu" size={18} />
              )}
            </button>

            {!isHub && activeApp && sidebarCollapsed && (
              <button
                type="button"
                className="app-header-icon-btn app-header-collapsed-app-icon"
                onClick={expandSidebar}
                title="Expand sidebar"
              >
                <LauncherAppSvg id={activeApp} color={appColor} logoUrl={branding.getAppLogo(activeApp)} size={24} />
              </button>
            )}

            {!isHub && activeApp && (
              <span className={`app-header-mobile-name ${sidebarCollapsed ? 'app-header-mobile-name--visible-desktop' : ''}`}>
                {branding.getAppName(activeApp, LAUNCHER_APPS.find(a => a.id === activeApp)?.name ?? '')}
              </span>
            )}

            {/* Brand logo — only shown on the hub/landing page. Sourced solely from
                SuperAdmin platform branding, not the per-tenant `co.logoUrl` (Settings →
                Company Profile, used for invoice letterheads) — the hub is shared platform
                chrome and should reflect the one global look the SuperAdmin sets, not one
                tenant's document-branding logo. Picks the dark-mode variant when the theme
                is dark (falling back to the light variant if none was uploaded). */}
            {isHub && (
              <Link to="/" className="app-header-brand">
                {(isDark ? (branding.logoDark || branding.logoLight) : branding.logoLight) ? (
                  <img
                    src={isDark ? (branding.logoDark || branding.logoLight) : branding.logoLight}
                    alt={branding.platformName}
                    className="app-header-brand-img"
                  />
                ) : (
                  <div className="app-header-brand-inner">
                    <div className="app-header-brand-grid">
                      <div className="app-header-brand-sq app-header-brand-sq--r" />
                      <div className="app-header-brand-sq app-header-brand-sq--b" />
                      <div className="app-header-brand-sq app-header-brand-sq--y" />
                      <div className="app-header-brand-sq app-header-brand-sq--g" />
                    </div>
                    <span className="app-header-brand-name">{branding.platformName}</span>
                  </div>
                )}
              </Link>
            )}
          </div>

          {/* Center: Search — centered in hub; left-anchored expanding right in app mode */}
          <div className="app-header-hub-search">
            <Icon name="search" size={15} />
            <input
              type="text"
              className="app-header-hub-search-input"
              placeholder={searchPlaceholder}
              value={searchValue}
              onChange={e => handleSearch(e.target.value)}
            />
            {searchValue && (
              <button
                type="button"
                className="app-header-hub-search-clear"
                onClick={() => handleSearch('')}
              >
                ✕
              </button>
            )}
          </div>

          {/* Right actions */}
          <div className="app-header-actions">

            {/* Layout toggle */}
            <button
              type="button"
              className="app-header-icon-btn app-header-layout-toggle"
              onClick={toggleFullLayout}
              title={isFullLayout ? 'Compact view' : 'Full-width view'}
            >
              <Icon name={isFullLayout ? 'minimize' : 'maximize'} size={17} />
            </button>

            {/* Filter / collapse panel toggle (app-specific) */}
            {filterControl && (
              <button
                type="button"
                className={`app-header-icon-btn${filterControl.open ? ' app-header-icon-btn--open' : ''}${filterControl.hasActive ? ' app-header-icon-btn--active' : ''}`}
                onClick={filterControl.onToggle}
                title={filterControl.open ? 'Collapse filters' : 'Expand filters'}
              >
                <Icon name={filterControl.open ? 'chevronUp' : 'chevronDown'} size={17} />
              </button>
            )}

            {/* Notifications */}
            <div className="app-header-rel">
              <button
                type="button"
                className={`app-header-icon-btn${notifOpen ? ' app-header-icon-btn--open' : ''}`}
                onClick={() => setNotifOpen(d => !d)}
                title="Notifications"
              >
                <Icon name="bell" size={17} />
                {unreadCount > 0 && (
                  <span className="app-header-badge">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>

            {/* Theme toggle */}
            <button
              type="button"
              className="app-header-icon-btn"
              onClick={toggleTheme}
              title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
            >
              <Icon name={isDark ? 'sun' : 'moon'} size={17} />
            </button>

            {/* Apps launcher trigger */}
            <button
              type="button"
              className={`app-header-icon-btn${launcherOpen ? ' app-header-icon-btn--open' : ''}`}
              onClick={() => setLauncherOpen(d => !d)}
              title="All apps"
            >
              <Icon name="grid" size={17} />
            </button>

            {/* User avatar */}
            <div className="app-header-rel" ref={userRef}>
              <button
                ref={avatarRef}
                type="button"
                className="app-header-avatar"
                onClick={() => setUserOpen(d => !d)}
                title={user?.name ?? 'Account'}
              >
                {getInitials(user?.name)}
              </button>
              {userOpen && (
                <div className="app-header-user-dropdown">
                  <div className="app-header-user-info">
                    <span className="app-header-user-name">{user?.name ?? '—'}</span>
                    <span className="app-header-user-email">{user?.email ?? '—'}</span>
                    <span className="app-header-user-role">{user?.role ?? '—'}</span>
                  </div>
                  <div className="app-header-user-actions">
                    <Link to="/profile" className="app-header-user-action"
                      onClick={() => setUserOpen(false)}>
                      <Icon name="user" size={14} /><span>My profile</span>
                    </Link>
                    <button type="button" className="app-header-user-action app-header-user-action--signout"
                      onClick={() => logout()}>
                      <Icon name="arrowRight" size={14} /><span>Sign out</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

          </div>
        </div>
      </header>

      {/* Launcher backdrop */}
      {launcherOpen && (
        <div className="app-lnch-backdrop" onClick={closeLauncher} />
      )}

      {/* Launcher slide panel */}
      <div className={`app-lnch-panel${launcherOpen ? ' app-lnch-panel--open' : ''}`}>
        <div className="app-lnch-panel-hdr">
          <span className="app-lnch-panel-title">Your apps</span>
          <div className="app-lnch-panel-hdr-btns">
            <button
              type="button"
              className={`app-lnch-edit-toggle${editMode ? ' app-lnch-edit-toggle--active' : ''}`}
              onClick={() => setEditMode(m => !m)}
              title={editMode ? 'Done' : 'Rearrange apps'}
            >
              {editMode ? (
                <span>Done</span>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              )}
            </button>
            <button type="button" className="app-lnch-panel-close" onClick={closeLauncher} title="Close">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        {editMode && (
          <p className="app-lnch-edit-hint">Drag apps to rearrange</p>
        )}

        <div className="app-lnch-panel-scroll">
          {/* Recently viewed */}
          {recentApps.length > 0 && (
            <>
              <p className="app-lnch-section-label">Recently viewed</p>
              <div className="app-lnch-recent-row">
                {recentApps.map(app => (
                  <Link
                    key={app.id}
                    to={app.path}
                    className="app-lnch-panel-item app-lnch-panel-item--recent"
                    onClick={() => closeLauncher()}
                  >
                    <LauncherAppSvg id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={35} />
                    <span className="app-lnch-panel-name">{branding.getAppName(app.id, app.name)}</span>
                  </Link>
                ))}
              </div>
              <div className="app-lnch-section-divider" />
            </>
          )}

          {/* All apps */}
          <p className="app-lnch-section-label">Your apps</p>
          <div className={`app-lnch-panel-grid${editMode ? ' app-lnch-panel-grid--edit' : ''}`}>
            {orderedApps.map(app => (
              <Link
                key={app.id}
                to={app.path}
                className={`app-lnch-panel-item${dragOverId === app.id ? ' app-lnch-panel-item--over' : ''}`}
                draggable={editMode}
                onDragStart={editMode ? e => handleDragStart(e, app.id) : undefined}
                onDragOver={editMode ? e => handleDragOver(e, app.id) : undefined}
                onDrop={editMode ? e => handleDrop(e, app.id) : undefined}
                onDragEnd={editMode ? handleDragEnd : undefined}
                onClick={e => { if (editMode) { e.preventDefault(); return; } closeLauncher(); }}
              >
                <LauncherAppSvg id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={43} />
                <span className="app-lnch-panel-name">{branding.getAppName(app.id, app.name)}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className="app-lnch-panel-footer">
          <Link
            to="/"
            className="app-lnch-panel-all-btn"
            onClick={() => closeLauncher()}
          >
            All applications
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14"/><polyline points="12 5 19 12 12 19"/>
            </svg>
          </Link>
        </div>
      </div>

      {notifOpen && (
        <NotificationCentre
          open={notifOpen}
          onClose={() => setNotifOpen(false)}
          notifs={notifs}
          unreadCount={unreadCount}
          onMarkRead={handleMarkRead}
          onMarkAllRead={handleMarkAllRead}
          onReload={loadNotifs}
        />
      )}
    </>
  );
}

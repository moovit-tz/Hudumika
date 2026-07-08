import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { NotificationCentre } from './NotificationCentre.js';
import { Icon } from './Icon.js';
import { APP_COLORS, ActiveAppContext, MobileNavContext } from '../shells/WorkspaceApp.js';
import { useBranding } from '../hooks/useBranding.js';
import { AppLauncher } from './AppLauncher.js';
import { LAUNCHER_APPS, LauncherAppSvg } from './LauncherApps.js';
import { apiFetch } from '../lib/api.js';
import './AppHeader.css';

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

            {/* Apps launcher trigger + panel */}
            <AppLauncher />

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

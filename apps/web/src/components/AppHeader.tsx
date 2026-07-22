import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { NotificationCentre } from './NotificationCentre.js';
import { Icon } from './Icon.js';
import { APP_COLORS, ActiveAppContext, MobileNavContext } from '../shells/WorkspaceApp.js';
import { useBranding } from '../hooks/useBranding.js';
import { useLocale } from '../hooks/useLocale.js';
import { AppLauncher } from './AppLauncher.js';
import { LAUNCHER_APPS, LauncherAppSvg } from './LauncherApps.js';
import { apiFetch } from '../lib/api.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from './ui/dropdown-menu.js';
import './AppHeader.css';

// ── Helpers ───────────────────────────────────────────────────

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
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
  const { t, language, setLanguage, LANGUAGES } = useLocale();

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
  }, [isFullLayout, activeApp]);

  // ── Layout Customizer prefs (navbar type / skin / semi-dark / direction) ──
  // Set from /admin/design-system (DesignSystemView.tsx), which writes these
  // localStorage keys directly. AppHeader is what actually applies them as
  // <html> attributes, mirroring the isFullLayout/data-layout pattern above —
  // run once on mount here since, unlike isFullLayout, nothing on this page
  // lets the user change them live, only read them.
  useEffect(() => {
    const navbar = localStorage.getItem('navbar-type');
    if (navbar && navbar !== 'static') document.documentElement.setAttribute('data-navbar', navbar);
    const skin = localStorage.getItem('skin');
    if (skin === 'bordered') document.documentElement.setAttribute('data-skin', 'bordered');
    const semiDark = localStorage.getItem('semi-dark') === 'true';
    if (semiDark) document.documentElement.setAttribute('data-semi-dark', 'true');
    const direction = localStorage.getItem('direction');
    if (direction) document.documentElement.setAttribute('dir', direction);
  }, []);

  function toggleFullLayout() {
    setIsFullLayout(prev => !prev);
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
      const serverCount = Array.isArray(data) ? undefined : data?.unread_count;
      setUnreadCount(typeof serverCount === 'number' ? serverCount : list.filter((n: any) => !n.read).length);
    } catch { /* silently ignore */ }
  }, []);

  useEffect(() => {
    loadNotifs();
    const interval = setInterval(loadNotifs, 45000);
    return () => clearInterval(interval);
  }, [loadNotifs]);

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

  // ── User dropdown (Now handled by DropdownMenu) ──

  // ── Avatar color via CSS custom property ──
  const appColor = activeApp ? branding.getAppColor(activeApp, APP_COLORS[activeApp] ?? '#64748b') : '#64748b';
  const avatarRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    avatarRef.current?.style.setProperty('--avatar-color', appColor);
  }, [appColor]);

  // Local search state for app pages (hub page controls via prop)
  const [localSearch, setLocalSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const isHub = !!onHubSearchChange;
  const isAppSearch = !!onAppSearchChange;
  const searchValue = isHub ? (hubSearch ?? '') : isAppSearch ? (appSearch ?? '') : localSearch;
  const handleSearch = isHub ? onHubSearchChange! : isAppSearch ? onAppSearchChange! : setLocalSearch;
  const searchPlaceholder = isHub ? t('header.searchHub') : isAppSearch ? (appSearchPlaceholder ?? t('header.searchDefault')) : t('header.searchDefault');

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
              title={t('header.menu')}
            >
              <Icon name="menu" size={20} />
            </button>

            {!isHub && activeApp && (
              <div className="app-header-mobile-brand-container">
                <div className="app-header-mobile-app-icon">
                  <LauncherAppSvg id={activeApp} color={appColor} logoUrl={branding.getAppLogo(activeApp)} size={24} />
                </div>
                <span className="app-header-mobile-name">
                  {branding.getAppName(activeApp, LAUNCHER_APPS.find(a => a.id === activeApp)?.name ?? '')}
                </span>
              </div>
            )}

            {/* Brand logo — only shown on the hub/landing page or standalone tools (no active app). */}
            {(isHub || !activeApp) && (
              <Link to="/" className="app-header-brand">
                {(isDark ? (branding.logoDark || branding.logoLight) : branding.logoLight) ? (
                  <img
                    src={isDark ? (branding.logoDark || branding.logoLight) : branding.logoLight}
                    alt={branding.platformName}
                    className="app-header-brand-img"
                    style={{ height: 31, objectFit: 'contain' }}
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
          <div className="app-header-hub-search desktop-search">
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
          
          <button className="app-header-icon-btn mobile-search-btn" onClick={() => setMobileSearchOpen(true)} title="Search">
            <Icon name="search" size={20} />
          </button>

          {/* Right actions */}
          <div className="app-header-actions">

            {/* Layout toggle (Circle 3 button) */}
            <button
              type="button"
              className="app-header-icon-btn app-header-layout-toggle"
              onClick={toggleFullLayout}
              title={isFullLayout ? t('header.compact') : t('header.fullWidth')}
            >
              <Icon name={isFullLayout ? 'minimize' : 'maximize'} size={19} color="var(--ink)" />
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
            <DropdownMenu open={notifOpen} onOpenChange={setNotifOpen}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className={`app-header-icon-btn${notifOpen ? ' app-header-icon-btn--open' : ''}`}
                  title={t('header.notifications')}
                >
                  <Icon name="bell" size={17} />
                  {unreadCount > 0 && (
                    <span className="app-header-badge">
                      {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={10} className="notif-dropdown-content">
                <NotificationCentre
                  onClose={() => setNotifOpen(false)}
                  notifs={notifs}
                  unreadCount={unreadCount}
                  onMarkRead={handleMarkRead}
                  onMarkAllRead={handleMarkAllRead}
                  onReload={loadNotifs}
                />
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Theme toggle */}
            <button
              type="button"
              className="app-header-icon-btn"
              onClick={toggleTheme}
              title={isDark ? t('header.lightMode') : t('header.darkMode')}
            >
              <Icon name={isDark ? 'sun' : 'moon'} size={17} />
            </button>

            {/* Language switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="app-header-icon-btn"
                  title={t('header.language')}
                >
                  <Icon name="globe" size={17} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                {LANGUAGES.map(l => (
                  <DropdownMenuItem
                    key={l.code}
                    onClick={() => setLanguage(l.code)}
                    className="cursor-pointer gap-3"
                  >
                    <span className="text-base">{l.flag}</span>
                    <span className="flex-1">{l.nativeLabel}</span>
                    {language === l.code && <Icon name="check" size={14} className="text-primary" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Apps launcher trigger + panel */}
            <AppLauncher />

            {/* User avatar */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  ref={avatarRef}
                  type="button"
                  className="app-header-avatar"
                  title={user?.name ?? t('header.account')}
                >
                  {getInitials(user?.name)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-2">
                <div className="flex flex-col space-y-1 p-2 pb-3">
                  <span className="text-sm font-semibold tracking-tight">{user?.name ?? '—'}</span>
                  <span className="text-xs text-muted-foreground truncate">{user?.email ?? '—'}</span>
                  {user?.role && <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1 font-semibold">{user.role}</span>}
                </div>
                <DropdownMenuSeparator />
                <div className="p-1">
                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="flex w-full cursor-pointer items-center gap-3">
                      <Icon name="user" size={16} className="text-muted-foreground" />
                      <span>{t('header.myProfile')}</span>
                    </Link>
                  </DropdownMenuItem>
                </div>
                <DropdownMenuSeparator />
                <div className="p-1">
                  <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive cursor-pointer" onClick={() => logout()}>
                    <Icon name="arrowRight" size={16} />
                    <span>{t('header.signOut')}</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        </div>
      </header>

      {mobileSearchOpen && (
        <div className="app-header-search-overlay" onClick={() => setMobileSearchOpen(false)}>
          <div className="app-header-search-modal" onClick={e => e.stopPropagation()}>
            <div className="app-header-search-modal-inner">
              <Icon name="search" size={16} />
              <input
                type="text"
                autoFocus
                className="app-header-search-modal-input"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={e => handleSearch(e.target.value)}
              />
              <button className="app-header-search-modal-close" onClick={() => setMobileSearchOpen(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

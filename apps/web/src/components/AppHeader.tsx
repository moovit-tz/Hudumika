import React, { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { NotificationCentre } from './NotificationCentre.js';
import { Icon, type IconName } from './Icon.js';
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
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import './AppHeader.css';

// ── Helpers ───────────────────────────────────────────────────

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

// ── Global cross-app search (GET /v1/search, see apps/api/src/routes/search.routes.ts) ──
// Header search boxes previously only did something on the 2 pages that wired
// their own onAppSearchChange (Cloud, Contacts) — everywhere else, typing here
// did nothing. This hits the same cross-tenant-safe search endpoint regardless
// of which app is currently open, so the box always finds something and jumps
// straight to it, on top of whatever page-local filtering (if any) also runs.
interface GlobalSearchHit { id: string; label: string; sublabel: string | null; path: string }
const SEARCH_CATEGORIES: Record<string, { label: string; icon: IconName }> = {
  shipments: { label: 'Shipments', icon: 'ship' },
  customers: { label: 'Customers', icon: 'users' },
  invoices:  { label: 'Invoices',  icon: 'invoice' },
  staff:     { label: 'Staff',     icon: 'user' },
  drivers:   { label: 'Drivers',   icon: 'truck' },
  vehicles:  { label: 'Vehicles',  icon: 'container' },
};

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

  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  function toggleTheme(e?: React.MouseEvent) {
    toggleThemeWithAnimation(e);
  }

  // ── Layout toggle (boxed ↔ full-width) ──
  // Full-width is the default. Boxed capped every page at 1100-1380px, which
  // on a normal desktop left a third of the window empty beside tables that
  // then scrolled horizontally. A tenant can still switch back — this changes
  // which way the toggle starts, not whether it exists.
  const [isFullLayout, setIsFullLayout] = useState(() => {
    const saved = localStorage.getItem('layout');
    const full = saved ? saved === 'full' : true;
    if (full) document.documentElement.setAttribute('data-layout', 'full');
    return full;
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
  const appColor = activeApp ? branding.getAppColor(activeApp, APP_COLORS[activeApp] ?? 'var(--ink3)') : 'var(--ink3)';
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

  // ── Global cross-app search results ──
  const navigate = useNavigate();
  const [resultsOpen, setResultsOpen] = useState(false);
  const [globalResults, setGlobalResults] = useState<Record<string, GlobalSearchHit[]>>({});
  const [globalSearching, setGlobalSearching] = useState(false);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    const q = searchValue.trim();
    if (q.length < 2) { setGlobalResults({}); setGlobalSearching(false); return; }
    setGlobalSearching(true);
    searchDebounceRef.current = setTimeout(() => {
      apiFetch(`/v1/search?q=${encodeURIComponent(q)}`)
        .then(res => setGlobalResults(res.data || {}))
        .catch(() => setGlobalResults({}))
        .finally(() => setGlobalSearching(false));
    }, 250);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); };
  }, [searchValue]);

  function handleSearchFocus() {
    if (searchValue.trim().length >= 2) setResultsOpen(true);
  }
  function handleSearchInput(v: string) {
    handleSearch(v);
    setResultsOpen(v.trim().length >= 2);
  }
  function handleResultClick(path: string) {
    setResultsOpen(false);
    setMobileSearchOpen(false);
    handleSearch('');
    navigate(path);
  }

  const hasGlobalResults = Object.keys(globalResults).length > 0;
  const resultsPanel = (
    <>
      {globalSearching && (
        <div className="px-3 py-2.5 text-sm font-medium text-muted-foreground">Searching…</div>
      )}
      {!globalSearching && !hasGlobalResults && (
        <div className="px-3 py-2.5 text-sm font-medium text-muted-foreground">No matches for &ldquo;{searchValue.trim()}&rdquo;</div>
      )}
      {!globalSearching && Object.entries(globalResults).map(([cat, hits]) => (
        <div key={cat} className="mb-1 last:mb-0">
          <div className="px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {SEARCH_CATEGORIES[cat]?.label || cat}
          </div>
          {hits.map(h => (
            <button
              key={h.id}
              type="button"
              onClick={() => handleResultClick(h.path)}
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent"
            >
              <Icon name={SEARCH_CATEGORIES[cat]?.icon || 'search'} size={14} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{h.label}</div>
                {h.sublabel && <div className="truncate text-xs text-muted-foreground">{h.sublabel}</div>}
              </div>
            </button>
          ))}
        </div>
      ))}
    </>
  );

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
          <Popover open={resultsOpen} onOpenChange={setResultsOpen}>
            <PopoverAnchor asChild>
              <div className="app-header-hub-search desktop-search">
                <Icon name="search" size={15} />
                <input
                  type="text"
                  className="app-header-hub-search-input"
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onFocus={handleSearchFocus}
                  onChange={e => handleSearchInput(e.target.value)}
                />
                {searchValue && (
                  <button
                    type="button"
                    className="app-header-hub-search-clear"
                    onClick={() => { handleSearch(''); setResultsOpen(false); }}
                  >
                    ✕
                  </button>
                )}
              </div>
            </PopoverAnchor>
            <PopoverContent
              align="start"
              className="w-(--radix-popover-trigger-width) min-w-[320px] max-h-105 overflow-y-auto p-1.5"
              onOpenAutoFocus={e => e.preventDefault()}
              onCloseAutoFocus={e => e.preventDefault()}
            >
              {resultsPanel}
            </PopoverContent>
          </Popover>

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
            {/* Plain fixed-position panel pinned to the header's top-right
                corner — same technique as AppLauncher.tsx's `.app-lnch-panel`
                (position: fixed; top/right), not Radix's trigger-relative
                Popper positioning. The bell isn't the header's rightmost icon
                (theme/language/launcher/avatar sit after it), so aligning to
                the bell itself always leaves a gap to the true right edge;
                anchoring to the viewport corner like the launcher does avoids
                that entirely. */}
            <button
              type="button"
              className={`app-header-icon-btn${notifOpen ? ' app-header-icon-btn--open' : ''}`}
              onClick={() => setNotifOpen(o => !o)}
              title={t('header.notifications')}
            >
              <Icon name="bell" size={17} />
              {unreadCount > 0 && (
                <span className="app-header-badge">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
            {notifOpen && (
              <div className="app-header-notif-backdrop" onClick={() => setNotifOpen(false)} />
            )}
            <div className={`app-header-notif-panel${notifOpen ? ' app-header-notif-panel--open' : ''}`}>
              <NotificationCentre
                onClose={() => setNotifOpen(false)}
                notifs={notifs}
                unreadCount={unreadCount}
                onMarkRead={handleMarkRead}
                onMarkAllRead={handleMarkAllRead}
                onReload={loadNotifs}
              />
            </div>

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
                  {/* Gated on the same role /admin/* itself requires (see
                      SuperAdminShell's RequireRoles), so the menu can never
                      offer a route the router will bounce. */}
                  {user?.role === 'SUPER_ADMIN' && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="flex w-full cursor-pointer items-center gap-3">
                        <Icon name="shield" size={16} className="text-muted-foreground" />
                        <span>{t('header.adminPanel')}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
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
            {searchValue.trim().length >= 2 && (
              <div className="app-header-search-modal-results">
                {resultsPanel}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}

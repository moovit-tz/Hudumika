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

const AV_COLORS = ['#0d7a6b','#0550ae','#6e40c9','#059669','#9a6700','#cf222e','#d05c30'];
function avColor(name?: string | null) { return AV_COLORS[((name ?? '?').charCodeAt(0)) % AV_COLORS.length]; }

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

            {/* User avatar & restyled profile card dropdown */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  ref={avatarRef}
                  type="button"
                  className="app-header-avatar-trigger"
                  title={user?.name ?? t('header.account')}
                  style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                >
                  <div style={{ width: '100%', height: '100%', borderRadius: '50%', overflow: 'hidden', background: avColor(user?.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13, border: '1px solid var(--border)' }}>
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={user?.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      getInitials(user?.name)
                    )}
                  </div>
                  {/* Green status indicator dot */}
                  <span style={{ position: 'absolute', bottom: 0, right: 0, width: 10, height: 10, borderRadius: '50%', background: 'var(--green)', border: '2px solid var(--white)' }} />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-3 rounded-xl shadow-2xl border border-slate-200/80 dark:border-slate-800 text-slate-900 dark:text-slate-100" style={{ background: 'var(--white)', zIndex: 99999 }}>
                {/* Header User Identity Block (Compact) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
                  <div style={{ position: 'relative', width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: avColor(user?.name), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 800, border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {user?.avatar_url ? (
                      <img src={user.avatar_url} alt={user?.name || 'User'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      getInitials(user?.name)
                    )}
                    <span style={{ position: 'absolute', bottom: 0, right: 0, width: 9, height: 9, borderRadius: '50%', background: 'var(--green)', border: '1.5px solid var(--white)' }} />
                  </div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--navy)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', lineHeight: 1.2 }}>
                      {user?.name ?? '—'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--ink3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 2 }}>
                      {user?.email ?? '—'}
                    </div>
                    {user?.role && (
                      <span style={{ display: 'inline-block', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--teal)', background: 'var(--teal-l)', padding: '1px 6px', borderRadius: 'var(--r)', marginTop: 3 }}>
                        {user.role}
                      </span>
                    )}
                  </div>
                </div>

                {/* Navigation items (Compact) */}
                <div style={{ padding: '4px 0 2px', display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <DropdownMenuItem asChild>
                    <Link to="/profile" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--ink)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="user" size={13} style={{ color: 'var(--teal)' } as React.CSSProperties} />
                      </div>
                      <span>{t('header.myProfile')}</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link to="/studio" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--ink)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="zap" size={13} style={{ color: 'var(--purple)' } as React.CSSProperties} />
                      </div>
                      <span>AI Studio</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link to="/workspace" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--ink)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="settings" size={13} style={{ color: 'var(--blue)' } as React.CSSProperties} />
                      </div>
                      <span>Workspace Settings</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link to="/workspace/billing" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--ink)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                      <div style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <Icon name="creditCard" size={13} style={{ color: 'var(--gold)' } as React.CSSProperties} />
                      </div>
                      <span>Billing &amp; Subscription</span>
                    </Link>
                  </DropdownMenuItem>

                  {user?.role === 'SUPER_ADMIN' && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--ink)', textDecoration: 'none', fontSize: 13, fontWeight: 600 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Icon name="lock" size={13} style={{ color: 'var(--red)' } as React.CSSProperties} />
                        </div>
                        <span>{t('header.adminPanel')}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                </div>

                <DropdownMenuSeparator />

                {/* Logout item (Compact) */}
                <div style={{ paddingTop: 2 }}>
                  <DropdownMenuItem
                    onClick={() => logout()}
                    style={{ display: 'flex', width: '100%', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 'var(--r)', cursor: 'pointer', color: 'var(--red)', background: 'transparent', fontSize: 13, fontWeight: 600 }}
                  >
                    <div style={{ width: 24, height: 24, borderRadius: 'var(--r-sm)', background: 'var(--red-l)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <Icon name="arrowRight" size={13} style={{ color: 'var(--red)' } as React.CSSProperties} />
                    </div>
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

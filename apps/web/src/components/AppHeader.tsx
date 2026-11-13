import React, { useState, useEffect, useRef, useCallback, useContext, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useIdleLock } from '../hooks/useIdleLock.js';
import { PersonAvatar } from './PersonAvatar.js';
import { NotificationCentre } from './NotificationCentre.js';
import { HeaderPill } from './HeaderPill.js';
import { useWebSocket } from '../hooks/useWebSocket.js';
import { Icon, type IconName } from './Icon.js';
import { APP_COLORS, ActiveAppContext, MobileNavContext } from '../shells/WorkspaceApp.js';
import { useBranding } from '../hooks/useBranding.js';
import { useLocale } from '../hooks/useLocale.js';
import { AppLauncher } from './AppLauncher.js';
import { LAUNCHER_APPS, LauncherAppSvg } from './LauncherApps.js';
import { apiFetch } from '../lib/api.js';
import { useLandingStyle } from '../hooks/useLandingStyle.js';
import { useClockIn } from '../contexts/ClockInContext.js';
import { getJobs } from '../pages/clearanceData.js';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from './ui/dropdown-menu.js';
import { Popover, PopoverAnchor, PopoverContent } from './ui/popover.js';
import { Tip } from './ui/tooltip.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import { isRightSidebarCollapsed, toggleRightSidebar, RIGHT_SIDEBAR_TOGGLE_EVENT } from '../lib/rightSidebarState.js';
import { getSingleAppEntry } from '../lib/appEntry.js';
import './AppHeader.css';

// ── Helpers ───────────────────────────────────────────────────

function getInitials(name?: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() ?? '?';
  return ((parts[0][0] ?? '') + (parts[parts.length - 1][0] ?? '')).toUpperCase();
}

const AV_COLORS = ['#0d7a6b','#0550ae','#6e40c9','var(--green)','#9a6700','#cf222e','#d05c30'];
function avColor(name?: string | null) { return AV_COLORS[((name ?? '?').charCodeAt(0)) % AV_COLORS.length]; }

// ── Global cross-app search (GET /v1/search, see apps/api/src/routes/search.routes.ts) ──
// Header search boxes previously only did something on the 2 pages that wired
// their own onAppSearchChange (Cloud, Contacts) — everywhere else, typing here
// did nothing. This hits the same cross-tenant-safe search endpoint regardless
// of which app is currently open, so the box always finds something and jumps
// straight to it, on top of whatever page-local filtering (if any) also runs.
interface GlobalSearchHit { id: string; label: string; sublabel: string | null; path: string }
/**
 * The search covers the whole platform, but leads with wherever you are. The
 * API takes `app`, gives that app's categories more rows and returns `order`
 * with them first; this renders in that order and marks where the current
 * app's results stop and the rest of the platform begins.
 */
interface GlobalSearchResponse {
  data: Record<string, GlobalSearchHit[]>;
  order?: string[];
  focusedApp?: string | null;
  categoryApp?: Record<string, string>;
}
const SEARCH_CATEGORIES: Record<string, { label: string; icon: IconName }> = {
  shipments: { label: 'Shipments', icon: 'ship' },
  customers: { label: 'Customers', icon: 'users' },
  invoices:  { label: 'Invoices',  icon: 'invoice' },
  staff:     { label: 'Staff',     icon: 'user' },
  drivers:   { label: 'Drivers',   icon: 'truck' },
  vehicles:  { label: 'Vehicles',  icon: 'container' },
  emails:    { label: 'Email',     icon: 'mail' },
  people:    { label: 'People', icon: 'user' },
  organizations: { label: 'Organizations', icon: 'building' },
  tasks:        { label: 'My tasks',      icon: 'tasks' },
  projects:     { label: 'Projects',      icon: 'layers' },
  notes:        { label: 'My notes',      icon: 'fileText' },
  files:        { label: 'My files',      icon: 'folder' },
  events:       { label: 'My calendar',   icon: 'calendar' },
  leads:        { label: 'Leads',         icon: 'users' },
  deals:        { label: 'Deals',         icon: 'dollarSign' },
  tickets:      { label: 'Support tickets', icon: 'inbox' },
  quotations:   { label: 'Quotations',    icon: 'clipboard' },
  products:     { label: 'Products & services', icon: 'package' },
  suppliers:    { label: 'Suppliers',     icon: 'building' },
  declarations: { label: 'Declarations',  icon: 'clipboard' },
  documents:    { label: 'My sign documents', icon: 'send' },
  notifications: { label: 'My notifications', icon: 'bell' },
  purchase_orders: { label: 'Purchase orders', icon: 'clipboard' },
  bills:        { label: 'Supplier bills',  icon: 'invoice' },
  expenses:     { label: 'Expenses',        icon: 'receipt' },
  credit_notes: { label: 'Credit notes',    icon: 'invoice' },
  delivery_docs: { label: 'Delivery documents', icon: 'truck' },
  petty_cash:   { label: 'Petty cash',      icon: 'dollarSign' },
  seal_lots:    { label: 'Warehouse lots',  icon: 'package' },
  consignments: { label: 'Consignments',    icon: 'container' },
  campaigns:    { label: 'SMS campaigns',   icon: 'send' },
  sms_templates: { label: 'SMS templates',  icon: 'fileText' },
  parcels:      { label: 'Parcels',         icon: 'send' },
  garage_vehicles: { label: 'Garage vehicles', icon: 'truck' },
  matters:      { label: 'Legal matters',   icon: 'briefcase' },
  permits:      { label: 'Permits & licences', icon: 'shield' },
  web_pages:    { label: 'Website pages',   icon: 'globe' },
  domains:      { label: 'Domains',         icon: 'globe' },
  meetings:     { label: 'My meetings',     icon: 'calendar' },
};

// ── Main component ─────────────────────────────────────────────

export function AppHeader({
  appActions,
  hubSearch,
  onHubSearchChange,
  appSearch,
  onAppSearchChange,
  appSearchPlaceholder,
  filterControl,
}: {
  appActions?: React.ReactNode;
  hubSearch?: string;
  onHubSearchChange?: (q: string) => void;
  appSearch?: string;
  onAppSearchChange?: (q: string) => void;
  appSearchPlaceholder?: string;
  filterControl?: { open: boolean; onToggle: () => void; hasActive?: boolean };
} = {}) {
  const { user, logout, updateUser } = useAuth();
  const { lock } = useIdleLock();

  /**
   * Check-in state and the shipment context to open it with. A CUSTOMER has no
   * timesheet, so they get no clock — same rule CheckInWidget itself applies.
   */
  const { isCheckedIn, currentEntry, triggerOpen } = useClockIn();
  const location = useLocation();
  const isStaff = !!(user && user.role !== 'CUSTOMER');
  const clockContext = () => {
    const m = location.pathname.match(/\/clearance\/([0-9a-f-]{36})/i);
    if (!m) return undefined;
    const shipmentId = m[1];
    const job = getJobs().find(j => j.id === shipmentId);
    return { shipmentId, shipmentRef: job?.sysRef || shipmentId };
  };
  const activeApp = useContext(ActiveAppContext);
  const { setMobileOpen } = useContext(MobileNavContext);
  const branding = useBranding();
  const { t, language, setLanguage, LANGUAGES } = useLocale();

  // ── Header live clock timer for active task card ──
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!isCheckedIn) return;
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [isCheckedIn]);

  const [rightSidebarCollapsed, setRightSidebarCollapsed] = useState(isRightSidebarCollapsed);

  useEffect(() => {
    function handleToggle(e: Event) {
      setRightSidebarCollapsed((e as CustomEvent<boolean>).detail);
    }
    window.addEventListener(RIGHT_SIDEBAR_TOGGLE_EVENT, handleToggle);
    return () => window.removeEventListener(RIGHT_SIDEBAR_TOGGLE_EVENT, handleToggle);
  }, []);

  const clockStats = useMemo(() => {
    if (!isCheckedIn || !currentEntry?.started_at) {
      return { formatted: '00:00:00', percent: 0 };
    }
    const start = new Date(currentEntry.started_at).getTime();
    const diffSec = Math.max(0, Math.floor((nowTick - start) / 1000));
    const hrs = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatted = hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
    const percent = Math.min(100, Math.max(12, Math.round((diffSec / 28800) * 100)));
    return { formatted, percent };
  }, [isCheckedIn, currentEntry, nowTick]);

  const headerClockColor = activeApp && APP_COLORS[activeApp] && APP_COLORS[activeApp] !== '#1257c6'
    ? branding.getAppColor(activeApp, APP_COLORS[activeApp])
    : 'var(--teal)';

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

  // ── Landing style (Basic/Agentic vs Advanced) ──
  const { isAgentic, setLandingStyle, toggleLandingStyle, isSaving: landingStyleSaving } = useLandingStyle();

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
    // Sidebar style: 3-way setting (dark / light / system). Migrate legacy semi-dark boolean.
    const sidebarStyle = localStorage.getItem('sidebar-style')
      ?? (localStorage.getItem('semi-dark') === 'true' ? 'dark' : 'dark');
    document.documentElement.setAttribute('data-sidebar-style', sidebarStyle);
    const direction = localStorage.getItem('direction');
    if (direction) document.documentElement.setAttribute('dir', direction);
  }, []);

  // ── Full page ──
  // This button carries the maximise/minimise glyph, which everywhere else on
  // the web means "fill the screen". It used to only flip the boxed/full-width
  // layout, and since full-width became the default that came to almost
  // nothing: pressing it moved the page by 8px (1408px → 1400px) while the
  // shell stayed exactly as wide. It now does what the icon says — browser
  // fullscreen, plus full-width layout while in it, so the page really does
  // take the whole screen.
  //
  // State is read back from the document rather than kept locally: Esc and F11
  // leave fullscreen without going through this handler, and an icon that
  // still showed "minimise" after that would be lying about where you are.
  const [isFs, setIsFs] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const onChange = () => {
      const now = !!document.fullscreenElement;
      setIsFs(now);
      // Restore whatever layout the tenant had once the page is no longer
      // filling the screen — entering fullscreen forces full-width, so exiting
      // must not leave that behind as if it had been chosen.
      if (!now) {
        const saved = localStorage.getItem('layout');
        setIsFullLayout(saved ? saved === 'full' : true);
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullPage() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
        // Full-width only for the duration; localStorage keeps the real
        // preference, and the fullscreenchange handler above puts it back.
        document.documentElement.setAttribute('data-layout', 'full');
        window.dispatchEvent(new CustomEvent('hudumika-layout-updated'));
      }
    } catch {
      // Fullscreen can be refused (permissions policy in an iframe, a browser
      // that has it disabled). Fall back to the layout toggle it used to be so
      // the button still does something rather than nothing.
      setIsFullLayout(prev => !prev);
    }
  }

  // ── Notifications ──
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifs, setNotifs] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  // The list is one page (50 by default); this is how many exist.
  const [totalCount, setTotalCount] = useState(0);
  /** Live platform/tenant notices for the pill. Separate from notifications:
   *  the server decides what is live and undismissed, so there is nothing to
   *  filter here. */
  const [announcements, setAnnouncements] = useState<any[]>([]);
  /** What the bar announces — asked for directly (GET /notifications/ticker)
   *  rather than derived from `notifs`, which is only the newest page. */
  const [ticker, setTicker] = useState<any[]>([]);

  useEffect(() => {
    const load = () => apiFetch('/v1/announcements/active')
      .then(res => setAnnouncements(res.data ?? []))
      .catch(() => { /* the pill simply falls back to notifications */ });
    load();
    // Slower than the notification poll: an announcement is written by hand
    // and lives for hours or days, so a minute of lag is immaterial.
    const t = setInterval(load, 5 * 60 * 1000);
    return () => clearInterval(t);
  }, []);

  const loadNotifs = useCallback(async () => {
    try {
      const data = await apiFetch('/v1/notifications');
      const list: any[] = Array.isArray(data) ? data : (data?.notifications ?? []);
      setNotifs(list);
      const serverCount = Array.isArray(data) ? undefined : data?.unread_count;
      setUnreadCount(typeof serverCount === 'number' ? serverCount : list.filter((n: any) => !n.read).length);
      const serverTotal = Array.isArray(data) ? undefined : data?.total_count;
      setTotalCount(typeof serverTotal === 'number' ? serverTotal : list.length);
    } catch { /* silently ignore */ }
    try {
      const res = await apiFetch('/v1/notifications/ticker');
      setTicker(Array.isArray(res?.items) ? res.items : []);
    } catch { /* the bar falls back to the search box */ }
  }, []);

  useEffect(() => {
    loadNotifs();
    // The poll is the safety net; the socket below is what makes it prompt.
    // A hidden tab does not poll — it catches up the moment it is shown.
    const interval = setInterval(() => { if (!document.hidden) loadNotifs(); }, 45000);
    const onVisible = () => { if (!document.hidden) loadNotifs(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [loadNotifs]);

  // The server nudges this person's tabs when something is written for them.
  // The nudge carries no content; we re-read through the normal endpoints.
  const nudgeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useWebSocket(useCallback((event: any) => {
    if (event?.type !== 'notification.new') return;
    if (nudgeTimer.current) clearTimeout(nudgeTimer.current);
    nudgeTimer.current = setTimeout(loadNotifs, 300);
  }, [loadNotifs]));
  useEffect(() => () => { if (nudgeTimer.current) clearTimeout(nudgeTimer.current); }, []);

  /**
   * Unread, newest first, capped — the pill is a nudge, not an inbox, and the
   * notification centre remains the place to work through them.
   *
   * Deduped by what the row is *about*, because the table is not one row per
   * event: `Missing document` alone accounts for 224,547 rows across 93
   * shipments, one shipment/title pair repeating 7,844 times, because the
   * reminder job re-notifies the same missing document on every run. Without
   * this the pill would rotate the identical sentence five times over. The
   * duplicates are a real defect in the job, not something this filter fixes —
   * it only stops them being displayed as if they were five separate things.
   */
  const pillItems = useMemo(() => {
    const seen = new Set<string>();
    const out: any[] = [];
    // Announcements lead. A person wrote them and chose to say them to
    // everybody, which makes them more deliberate than anything the system
    // generated about a single shipment.
    for (const a of announcements) {
      out.push({ id: a.id, title: a.title, message: a.body, link: a.link, badge: a.badge, kind: 'announcement' });
      if (out.length === 3) break;
    }
    // Already unread, current, unmuted and one-per-subject: the server did
    // that.
    for (const n of ticker) {
      if (!n.title) continue;
      const key = `${n.title}|${n.shipment_id ?? n.entity_id ?? ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ ...n, kind: 'notification' });
      if (out.length === 5) break;
    }
    return out;
  }, [ticker, announcements]);


  /** Announcements dismiss per person, notifications mark read — same gesture
   *  in the pill, different verbs underneath. */
  function handlePillDismiss(item: any) {
    if (item.kind === 'announcement') {
      setAnnouncements(prev => prev.filter(a => a.id !== item.id));
      apiFetch(`/v1/announcements/${item.id}/dismiss`, { method: 'POST' }).catch(() => {});
      return;
    }
    handleMarkRead(item.id);
  }

  function handleMarkRead(id: string, _link?: string) {
    setNotifs(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setTicker(prev => prev.filter(n => n.id !== id));
    setUnreadCount(prev => Math.max(0, prev - 1));
    apiFetch(`/v1/notifications/${id}/read`, { method: 'PATCH' }).catch(() => {});
  }
  function handleMarkAllRead() {
    setNotifs(prev => prev.map(n => ({ ...n, read: true })));
    setTicker([]);
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
  const [globalSearch, setGlobalSearch] = useState('');
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  /**
   * The centre of the header has two resting states. With unread notifications
   * it shows HeaderPill; otherwise, or once the user asks for search, it shows
   * the search box. Search is never removed — it is one click or one "/" away,
   * and it comes back on its own as soon as there is nothing left to announce.
   */
  const [searchExpanded, setSearchExpanded] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  /** The pill yields to search the moment the user asks for it, and takes the
   *  slot back only when there is genuinely something unread to say. */
  const showPill = !searchExpanded && pillItems.length > 0;

  const openSearch = useCallback(() => {
    setSearchExpanded(true);
    // The input mounts in the same tick, so focus after paint.
    requestAnimationFrame(() => searchInputRef.current?.focus());
  }, []);

  // "/" is the convention for jumping to search, and it matters more here than
  // usual because the box is not always on screen. Ignored while typing, so it
  // cannot hijack a literal slash in a form field.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)) return;
      e.preventDefault();
      openSearch();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);
  const isHub = !!onHubSearchChange;
  const isAppSearch = !!onAppSearchChange;
  const [searchEverywhere, setSearchEverywhere] = useState(() => !isAppSearch);
  /**
   * Within a platform search: every app (default) or only the one open now.
   * Remembered per person — someone who works in one app all day wants their
   * choice to stick. The API narrows the categories itself (scope=app).
   */
  const [appOnly, setAppOnly] = useState<boolean>(() => {
    try { return localStorage.getItem('hudumika_search_app_only') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('hudumika_search_app_only', appOnly ? '1' : '0'); } catch { /* private mode */ }
  }, [appOnly]);
  const openAppName = activeApp
    ? branding.getAppName(activeApp, LAUNCHER_APPS.find(a => a.id === activeApp)?.name ?? activeApp)
    : '';
  const scopedToApp = searchEverywhere && appOnly && !!activeApp;
  const searchValue = isHub
    ? (hubSearch ?? '')
    : isAppSearch
      ? (searchEverywhere ? globalSearch : (appSearch ?? ''))
      : localSearch;
  const handleSearch = (value: string) => {
    if (isHub) onHubSearchChange!(value);
    else if (isAppSearch && !searchEverywhere) onAppSearchChange!(value);
    else if (isAppSearch) setGlobalSearch(value);
    else setLocalSearch(value);
  };
  const searchPlaceholder = isHub
    ? t('header.searchHub')
    : isAppSearch && !searchEverywhere
      ? (appSearchPlaceholder ?? t('header.searchDefault'))
      : scopedToApp ? `Search ${openAppName}…` : 'Search across Hudumika…';

  // ── Global cross-app search results ──
  const navigate = useNavigate();
  const [resultsOpen, setResultsOpen] = useState(false);
  const [globalResults, setGlobalResults] = useState<Record<string, GlobalSearchHit[]>>({});
  const [resultOrder, setResultOrder] = useState<string[]>([]);
  const [categoryApp, setCategoryApp] = useState<Record<string, string>>({});
  const [globalSearching, setGlobalSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const [activeResult, setActiveResult] = useState(-1);
  const searchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const flatResults = useMemo(() => resultOrder.flatMap(cat => globalResults[cat] ?? []), [resultOrder, globalResults]);

  useEffect(() => {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchAbortRef.current?.abort();
    const q = searchValue.trim();
    if (!searchEverywhere || q.length < 2) { setGlobalResults({}); setResultOrder([]); setGlobalSearching(false); setSearchError(''); return; }
    setGlobalSearching(true);
    setSearchError('');
    searchDebounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      searchAbortRef.current = controller;
      // `app` never narrows the search — it decides depth and order. See
      // apps/api/src/routes/search.routes.ts.
      const scope = activeApp ? `&app=${encodeURIComponent(activeApp)}${scopedToApp ? '&scope=app' : ''}` : '';
      apiFetch(`/v1/search?q=${encodeURIComponent(q)}${scope}`, { signal: controller.signal })
        .then((res: GlobalSearchResponse) => {
          setGlobalResults(res.data || {});
          setResultOrder(res.order?.length ? res.order : Object.keys(res.data || {}));
          setCategoryApp(res.categoryApp || {});
        })
        .catch((error: any) => {
          if (error?.name === 'AbortError') return;
          setGlobalResults({}); setResultOrder([]);
          setSearchError(error?.message || 'Search is temporarily unavailable.');
        })
        .finally(() => { if (!controller.signal.aborted) setGlobalSearching(false); });
    }, 250);
    return () => { if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current); searchAbortRef.current?.abort(); };
  }, [searchValue, activeApp, searchEverywhere, scopedToApp]);

  // Page (this page's own filter) -> this app -> every app.
  const scopeLabel = !searchEverywhere ? 'Page' : scopedToApp ? (openAppName || 'App') : 'All apps';
  const scopeNextLabel = !searchEverywhere
    ? `Search ${openAppName || 'this app'}`
    : scopedToApp ? 'Search every app' : (isAppSearch ? 'Filter this page only' : `Search ${openAppName || 'this app'} only`);
  function cycleSearchScope() {
    // Keep the search going after the switch: focus back in the box, results
    // reopen for the new scope (the effect above re-runs the query).
    requestAnimationFrame(() => {
      searchInputRef.current?.focus();
      setResultsOpen(searchValue.trim().length >= 2);
    });
    if (!searchEverywhere) {
      const seed = appSearch ?? '';
      setGlobalSearch(seed);
      setSearchEverywhere(true);
      setAppOnly(true);
      setResultsOpen(seed.trim().length >= 2);
    } else if (scopedToApp) {
      setAppOnly(false);
    } else if (isAppSearch) {
      setSearchEverywhere(false);
      setResultsOpen(false);
    } else {
      setAppOnly(true);
    }
    setActiveResult(-1);
  }

  function handleSearchFocus() {
    if (searchEverywhere && searchValue.trim().length >= 2) setResultsOpen(true);
  }
  function handleSearchInput(v: string) {
    handleSearch(v);
    setActiveResult(-1);
    setResultsOpen(searchEverywhere && v.trim().length >= 2);
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
      {!globalSearching && searchError && (
        <div role="alert" className="px-3 py-2.5 text-sm font-medium text-destructive">{searchError}</div>
      )}
      {!globalSearching && !searchError && !hasGlobalResults && (
        <div className="px-3 py-2.5 text-sm font-medium text-muted-foreground">No matches for &ldquo;{searchValue.trim()}&rdquo;</div>
      )}
      {!globalSearching && resultOrder.map((cat, i) => {
        const hits = globalResults[cat];
        if (!hits?.length) return null;
        const inThisApp = !!activeApp && categoryApp[cat] === activeApp;
        // The first result that is NOT from the app you are in — everything
        // above it is local, everything below is the rest of the platform.
        // Only where the group just above is local: checking "any earlier
        // group" printed the divider above every later group, not once.
        const prevShown = [...resultOrder.slice(0, i)].reverse().find(c => globalResults[c]?.length);
        const firstAway = !!activeApp && !inThisApp && !!prevShown && categoryApp[prevShown] === activeApp;
        return (
        <div key={cat} className="mb-1 last:mb-0">
          {firstAway && (
            <div className="mx-2.5 mt-2 mb-1.5 flex items-center gap-2 border-t border-border pt-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Elsewhere on the platform
            </div>
          )}
          <div className="flex items-center gap-1.5 px-2.5 pt-1.5 pb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            {SEARCH_CATEGORIES[cat]?.label || cat}
            {inThisApp && (
              <span className="rounded-full px-1.5 py-px text-[9px] font-bold normal-case tracking-normal"
                    style={{ background: 'var(--teal-l)', color: 'var(--teal)' }}>
                this app
              </span>
            )}
          </div>
          {hits.map(h => {
            const resultIndex = flatResults.findIndex(r => r.id === h.id && r.path === h.path);
            return (
            <button
              key={h.id}
              type="button"
              onClick={() => handleResultClick(h.path)}
              role="option"
              aria-selected={activeResult === resultIndex}
              className={`flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-accent ${activeResult === resultIndex ? 'bg-accent' : ''}`}
             data-ui-native-button="">
              <Icon name={SEARCH_CATEGORIES[cat]?.icon || 'search'} size={14} className="shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold text-foreground">{h.label}</div>
                {h.sublabel && <div className="truncate text-xs text-muted-foreground">{h.sublabel}</div>}
              </div>
            </button>
          )})}
        </div>
        );
      })}
    </>
  );

  return (
    <>
      <header className="app-header">
        <div className={`app-header-inner ${isAppSearch && !isHub ? 'app-header-inner--app' : 'app-header-inner--hub'}`}>

          {/* Left: Hamburger (mobile) + Brand (hub only) */}
          <div className="app-header-left">
            <Tip label={t('header.menu') || 'Menu'} side="bottom">
            <button
              type="button"
              className="app-header-icon-btn app-header-hamburger"
              onClick={() => setMobileOpen(true)}
              aria-label={t('header.menu') || 'Menu'}
             data-ui-native-button="">
              <Icon name="menu" size={20} />
            </button>
          </Tip>

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

          {/* Center: the pill while there is something unread to announce,
              otherwise the search box. Both occupy the same slot. */}
          {showPill && (
            <HeaderPill
              items={pillItems}
              onOpen={item => {
                // Opening an announcement dismisses it for this person too —
                // having read it is the point, and leaving it rotating after
                // the click would be nagging.
                handlePillDismiss(item);
                if (item.link) navigate(item.link);
              }}
              onDismiss={handlePillDismiss}
              onExpandSearch={openSearch}
            />
          )}

          <Popover open={resultsOpen} onOpenChange={setResultsOpen}>
            <PopoverAnchor asChild>
              <div className={`app-header-hub-search desktop-search${showPill ? ' app-header-hub-search--hidden' : ''}`}>
                <Icon name="search" size={15} />
                <input data-ui-field="input" data-field-appearance="bare"
                  ref={searchInputRef}
                  type="text"
                  role="combobox"
                  aria-expanded={resultsOpen}
                  aria-controls="global-search-results"
                  aria-autocomplete="list"
                  className="app-header-hub-search-input"
                  placeholder={searchPlaceholder}
                  value={searchValue}
                  onFocus={handleSearchFocus}
                  onBlur={() => {
                    // Give the slot back to the pill once the user is plainly
                    // done — but never while a query or its results are still
                    // on screen, which would snatch the list away mid-click.
                    if (!searchValue.trim() && !resultsOpen) setSearchExpanded(false);
                  }}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { handleSearch(''); setResultsOpen(false); setSearchExpanded(false); }
                    if (e.key === 'ArrowDown' && flatResults.length) { e.preventDefault(); setActiveResult(i => (i + 1) % flatResults.length); }
                    if (e.key === 'ArrowUp' && flatResults.length) { e.preventDefault(); setActiveResult(i => i <= 0 ? flatResults.length - 1 : i - 1); }
                    if (e.key === 'Enter' && activeResult >= 0 && flatResults[activeResult]) { e.preventDefault(); handleResultClick(flatResults[activeResult].path); }
                  }}
                  onChange={e => handleSearchInput(e.target.value)}
                />
                {searchValue && (
                  <Tip label="Clear search" side="bottom">
                    <button
                      type="button"
                      className={`app-header-hub-search-clear${isAppSearch || activeApp ? ' app-header-hub-search-clear--with-scope' : ''}`}
                      aria-label="Clear search"
                      onClick={() => { handleSearch(''); setResultsOpen(false); }}
                     data-ui-native-button="">
                      ✕
                    </button>
                  </Tip>
                )}
                {(isAppSearch || !!activeApp) && (
                  <Tip label={searchEverywhere ? 'Search this app only' : 'Search every app'} side="bottom">
                    <button
                      type="button"
                      className="app-header-search-scope"
                      aria-label={scopeNextLabel}
                      onClick={cycleSearchScope}
                     data-ui-native-button="">{scopeLabel}</button>
                  </Tip>
                )}
              </div>
            </PopoverAnchor>
            <PopoverContent
              id="global-search-results"
              role="listbox"
              align="start"
              className="w-(--radix-popover-trigger-width) min-w-[320px] max-h-105 overflow-y-auto p-1.5"
              onOpenAutoFocus={e => e.preventDefault()}
              onCloseAutoFocus={e => e.preventDefault()}
              // A click in the search box itself (the scope switch, the clear
              // button) is not "outside" — it must not close the results.
              onInteractOutside={e => {
                if ((e.target as HTMLElement | null)?.closest?.('.app-header-hub-search')) e.preventDefault();
              }}
            >
              {resultsPanel}
            </PopoverContent>
          </Popover>

          <Tip label="Search" side="bottom">
            <button className="app-header-icon-btn mobile-search-btn" onClick={() => setMobileSearchOpen(true)} aria-label="Search" data-ui-native-button="">
              <Icon name="search" size={20} />
            </button>
          </Tip>

          {/* Right actions */}
          <div className="app-header-actions">
            {appActions}

            <div className="app-header-secondary-actions">
            {/* Clock in / out.
                Every app shell renders this header, and none of them had a
                check-in control — the only component that did, TopBar, is not
                imported anywhere. So the one way to start the clock was to
                trigger a gated action and be interrupted by the prompt.

                It carries the shipment you are looking at. CheckInWidget
                already auto-detects from `openContext`, and every gate inside
                the clearance page passes it; opening the widget from the header
                did not, which meant searching for the job already on screen.
                The ref comes from the clearance store, so it reads
                "CLR-2026-0087" rather than a uuid. */}
            {isStaff && (
              isCheckedIn ? (
                <Tip label="Click to switch task or check out" side="bottom">
                <div
                  className="app-header-clock-card"
                  onClick={() => triggerOpen(clockContext())}
                  role="button"
                  tabIndex={0}
                  aria-label="Click to switch task or check out"
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); triggerOpen(clockContext()); } }}
                >
                  <div className="app-header-clock-icon-badge" style={{ background: headerClockColor }}>
                    <Icon name="clock" size={15} color="#fff" />
                  </div>
                  <div className="app-header-clock-info">
                    <div className="app-header-clock-title">
                      {currentEntry?.task_name || 'Active Task'}
                    </div>
                    <div className="app-header-clock-progress-row">
                      <div className="app-header-clock-bar-bg">
                        <div
                          className="app-header-clock-bar-fill"
                          style={{ width: `${clockStats.percent}%`, background: headerClockColor }}
                        />
                      </div>
                      <span className="app-header-clock-time">{clockStats.formatted}</span>
                    </div>
                  </div>
                  <Tip label="View full task details & weekly timesheet" side="bottom">
                    <Link
                      to="/nexushr/clock-in"
                      className="app-header-clock-link-btn"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="View full task details & weekly timesheet"
                    >
                      <Icon name="arrowUpRight" size={14} />
                    </Link>
                  </Tip>
                </div>
              </Tip>
              ) : (
                <Tip label={t('header.clockIn') || 'Clock In'} side="bottom">
                  <button
                    type="button"
                    className="app-header-icon-btn"
                    onClick={() => triggerOpen(clockContext())}
                    aria-label={t('header.clockIn') || 'Clock In'}
                   data-ui-native-button="">
                    <Icon name="clock" size={19} color="var(--ink)" />
                  </button>
                </Tip>
              )
            )}

            {/* Full page */}
            <Tip label={isFs ? t('header.exitFullPage') : t('header.fullPage')} side="bottom">
              <button
                type="button"
                className="app-header-icon-btn app-header-layout-toggle"
                onClick={toggleFullPage}
                aria-label={isFs ? t('header.exitFullPage') : t('header.fullPage')}
                aria-pressed={isFs}
               data-ui-native-button="">
                <Icon name={isFs ? 'minimize' : 'maximize'} size={19} color="var(--ink)" />
              </button>
            </Tip>

            {/* Filter / collapse panel toggle (app-specific) */}
            {filterControl && (
              <Tip label={filterControl.open ? 'Collapse filters' : 'Expand filters'} side="bottom">
                <button
                  type="button"
                  className={`app-header-icon-btn${filterControl.open ? ' app-header-icon-btn--open' : ''}${filterControl.hasActive ? ' app-header-icon-btn--active' : ''}`}
                  onClick={filterControl.onToggle}
                  aria-label={filterControl.open ? 'Collapse filters' : 'Expand filters'}
                 data-ui-native-button="">
                  <Icon name={filterControl.open ? 'chevronUp' : 'chevronDown'} size={17} />
                </button>
              </Tip>
            )}

            {/* Landing style mode toggle: icon-only in the compact header */}
            <Tip label={isAgentic ? 'Switch to Normal Workspace View' : 'Switch to Agentic View (AI workspace with Agent Flow, Automations & Controls)'} side="bottom">
              <button data-ui-native-button=""
                type="button"
                className={`app-header-icon-btn app-header-mode-icon${isAgentic ? ' app-header-icon-btn--active' : ''}`}
                onClick={() => setLandingStyle(isAgentic ? 'advanced' : 'basic')}
                disabled={landingStyleSaving}
                aria-label={isAgentic ? 'Switch to Normal View' : 'Switch to Agentic View'}
                aria-pressed={isAgentic}
               data-ui-chrome-button="">
                <Icon name={isAgentic ? 'layoutDashboard' : 'sparkle'} size={18} />
              </button>
            </Tip>

            {/* Theme toggle */}
            <Tip label={isDark ? t('header.lightMode') : t('header.darkMode')} side="bottom">
              <button
                type="button"
                className="app-header-icon-btn"
                onClick={toggleTheme}
                data-theme-switcher=""
                aria-label={isDark ? t('header.lightMode') : t('header.darkMode')}
               data-ui-native-button="">
                <Icon name={isDark ? 'sun' : 'moon'} size={17} />
              </button>
            </Tip>

            {/* Language switcher */}
            <DropdownMenu>
              <Tip label={t('header.language') || 'Language'} side="bottom">
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="app-header-icon-btn"
                    aria-label={t('header.language') || 'Language'}
                   data-ui-native-button="">
                    <Icon name="globe" size={17} />
                  </button>
                </DropdownMenuTrigger>
              </Tip>
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

            </div>
            <DropdownMenu>
              <Tip label="More header actions" side="bottom">
                <DropdownMenuTrigger asChild>
                  <button data-ui-native-button="" type="button" className="app-header-icon-btn app-header-mobile-more" aria-label="More header actions"><Icon name="moreHorizontal" size={20} /></button>
                </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="end" className="w-64 max-w-[calc(100vw-32px)]">
                {isStaff && <DropdownMenuItem onSelect={() => triggerOpen(clockContext())}><Icon name="clock" size={18} />{isCheckedIn ? 'Manage current task' : t('header.clockIn')}</DropdownMenuItem>}
                <DropdownMenuItem disabled={landingStyleSaving} onSelect={() => setLandingStyle(isAgentic ? 'advanced' : 'basic')}><Icon name="sparkle" size={18} />{isAgentic ? 'Normal View' : 'Agentic View'}</DropdownMenuItem>
                <DropdownMenuItem onSelect={() => toggleTheme()}><Icon name={isDark ? 'sun' : 'moon'} size={18} />{isDark ? t('header.lightMode') : t('header.darkMode')}</DropdownMenuItem>
                {filterControl && <DropdownMenuItem onSelect={filterControl.onToggle}><Icon name="filter" size={18} />{filterControl.open ? 'Collapse filters' : 'Expand filters'}</DropdownMenuItem>}
                <DropdownMenuItem onSelect={toggleFullPage}><Icon name={isFs ? 'minimize' : 'maximize'} size={18} />{isFs ? t('header.exitFullPage') : t('header.fullPage')}</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuSub><DropdownMenuSubTrigger><Icon name="globe" size={18} />{t('header.language')}</DropdownMenuSubTrigger><DropdownMenuSubContent>{LANGUAGES.map(item => <DropdownMenuItem key={item.code} onSelect={() => setLanguage(item.code)}>{item.nativeLabel}{language === item.code && <Icon name="check" size={14} />}</DropdownMenuItem>)}</DropdownMenuSubContent></DropdownMenuSub>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Apps launcher trigger + panel — hidden in single-app entry
                mode (lib/appEntry.ts): switching to another product isn't
                a real option on a dedicated single-app subdomain, so the
                trigger shouldn't offer it. See the standalone-apps plan, M1. */}
            {!getSingleAppEntry() && <AppLauncher />}

            {/* User avatar & restyled profile card dropdown */}
            <DropdownMenu>
              <Tip label={user?.name ?? t('header.account')} side="bottom">
                <DropdownMenuTrigger asChild>
                  <button
                    ref={avatarRef}
                    type="button"
                    className="app-header-avatar-trigger"
                    aria-label={user?.name ?? t('header.account')}
                  style={{ position: 'relative', width: 36, height: 36, borderRadius: '50%', padding: 0, border: 'none', background: 'transparent', cursor: 'pointer', flexShrink: 0 }}
                >
                  {/* Shared with every other app. The picture is fetched once
                      from the identity endpoint and cached, rather than being
                      carried as a 548KB data URI in the session. PersonAvatar
                      already draws the real, live presence dot itself
                      (offline/online/clocked-in — lib/presence.ts) — a second,
                      hardcoded-green dot used to be layered on top of it here,
                      left over from before that system existed, which is why
                      this corner never matched the ESS card's own dot. */}
                  <PersonAvatar
                    userId={(user as any)?.id}
                    name={user?.name ?? 'User'}
                    size={36}
                    style={{ border: '1px solid var(--border)' }}
                  />
                </button>
              </DropdownMenuTrigger>
              </Tip>
              <DropdownMenuContent align="end" className="app-header-profile-menu" style={{ zIndex: 99999 }}>
                {/* Header User Identity Block (Refreshed) */}
                <div className="ah-menu-identity">
                  <div className="ah-menu-avatar-wrap">
                    <PersonAvatar
                      userId={(user as any)?.id}
                      name={user?.name ?? 'User'}
                      size={38}
                      style={{ border: '1px solid var(--border)' }}
                    />
                  </div>
                  <div className="ah-menu-user-meta">
                    <div className="ah-menu-user-name">
                      {user?.name ?? '—'}
                    </div>
                    <div className="ah-menu-user-email">
                      {user?.email ?? '—'}
                    </div>
                    {user?.role && (
                      <span className="ah-menu-role-badge">
                        {user.role.replace(/_/g, ' ')}
                      </span>
                    )}
                  </div>
                </div>

                <DropdownMenuSeparator className="ah-menu-divider" />

                {/* Navigation items (Refreshed) */}
                <div className="ah-menu-nav-group">
                  <DropdownMenuItem
                    onClick={() => setLandingStyle(isAgentic ? 'advanced' : 'basic')}
                    className="ah-menu-item-link ah-menu-item-mode-switch"
                  >
                    <div className="ah-menu-icon-box" style={{ '--icon-color': isAgentic ? 'var(--teal)' : '#8b5cf6', '--icon-bg': isAgentic ? 'var(--teal-l)' : 'rgba(139, 92, 246, 0.14)' } as React.CSSProperties}>
                      <Icon name={isAgentic ? 'layoutDashboard' : 'sparkle'} size={13} />
                    </div>
                    <span className="ah-menu-item-label">{isAgentic ? 'Switch to Normal View' : 'Switch to Agentic View'}</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link to="/profile" className="ah-menu-item-link">
                      <div className="ah-menu-icon-box" style={{ '--icon-color': 'var(--teal)', '--icon-bg': 'var(--teal-l)' } as React.CSSProperties}>
                        <Icon name="user" size={13} />
                      </div>
                      <span className="ah-menu-item-label">{t('header.myProfile')}</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link to="/studio" className="ah-menu-item-link">
                      <div className="ah-menu-icon-box" style={{ '--icon-color': 'var(--purple)', '--icon-bg': 'rgba(168, 85, 247, 0.12)' } as React.CSSProperties}>
                        <Icon name="zap" size={13} />
                      </div>
                      <span className="ah-menu-item-label">Automation</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link to="/workspace" className="ah-menu-item-link">
                      <div className="ah-menu-icon-box" style={{ '--icon-color': 'var(--blue)', '--icon-bg': 'rgba(59, 130, 246, 0.12)' } as React.CSSProperties}>
                        <Icon name="settings" size={13} />
                      </div>
                      <span className="ah-menu-item-label">Workspace Settings</span>
                    </Link>
                  </DropdownMenuItem>

                  <DropdownMenuItem asChild>
                    <Link to="/developer" className="ah-menu-item-link">
                      <div className="ah-menu-icon-box" style={{ '--icon-color': 'var(--teal)', '--icon-bg': 'var(--teal-l)' } as React.CSSProperties}>
                        <Icon name="terminal" size={13} />
                      </div>
                      <span className="ah-menu-item-label">Developer Console</span>
                    </Link>
                  </DropdownMenuItem>

                  {user?.role === 'SUPER_ADMIN' && (
                    <DropdownMenuItem asChild>
                      <Link to="/admin" className="ah-menu-item-link">
                        <div className="ah-menu-icon-box" style={{ '--icon-color': 'var(--red)', '--icon-bg': 'var(--red-l)' } as React.CSSProperties}>
                          <Icon name="shield" size={13} />
                        </div>
                        <span className="ah-menu-item-label">{t('header.adminPanel')}</span>
                      </Link>
                    </DropdownMenuItem>
                  )}
                </div>

                <DropdownMenuSeparator className="ah-menu-divider" />

                {/* Session actions */}
                <div className="ah-menu-session-group">
                  <DropdownMenuItem
                    onClick={() => lock()}
                    className="ah-menu-item-link"
                  >
                    <div className="ah-menu-icon-box" style={{ '--icon-color': 'var(--ink2)', '--icon-bg': 'var(--bg)' } as React.CSSProperties}>
                      <Icon name="lock" size={13} />
                    </div>
                    <span className="ah-menu-item-label">{t('header.lockWorkspace')}</span>
                  </DropdownMenuItem>

                  <DropdownMenuItem
                    onClick={() => logout()}
                    className="ah-menu-item-link ah-menu-item-logout"
                  >
                    <div className="ah-menu-icon-box ah-menu-icon-box-logout">
                      <Icon name="logOut" size={13} />
                    </div>
                    <span className="ah-menu-item-label">{t('header.signOut')}</span>
                  </DropdownMenuItem>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

          </div>
        </div>
      </header>

      {/* Phones have no room for the bar inside the header row, so it gets a
          row of its own beneath it. Hidden above the mobile breakpoint, where
          the copy in the header's centre slot is showing instead. */}
      {pillItems.length > 0 && (
        <div className="app-header-pill-row">
          <HeaderPill
            compact
            items={pillItems}
            onOpen={item => { handlePillDismiss(item); if (item.link) navigate(item.link); }}
            onDismiss={handlePillDismiss}
            onExpandSearch={() => setMobileSearchOpen(true)}
          />
        </div>
      )}

      {mobileSearchOpen && (
        <div className="app-header-search-overlay" onClick={() => setMobileSearchOpen(false)}>
          <div className="app-header-search-modal" onClick={e => e.stopPropagation()}>
            <div className="app-header-search-modal-inner">
              <Icon name="search" size={16} />
              <input data-ui-field="input" data-field-appearance="bare"
                type="text"
                autoFocus
                className="app-header-search-modal-input"
                placeholder={searchPlaceholder}
                value={searchValue}
                onChange={e => handleSearch(e.target.value)}
              />
              <button className="app-header-search-modal-close" onClick={() => setMobileSearchOpen(false)} data-ui-native-button="">Close</button>
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

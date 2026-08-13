import React, { useState, useEffect, useRef, useContext } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, Link } from 'react-router-dom';
import { Icon } from './Icon.js';
import type { IconName } from './Icon.js';
import { useAuth } from '../hooks/useAuth.js';
import { APP_LABELS, APP_COLORS, MobileNavContext } from '../shells/WorkspaceApp.js';
import { useBranding } from '../hooks/useBranding.js';
import { useTenantPlan } from '../hooks/useTenantPlan.js';
import { useLocale } from '../hooks/useLocale.js';
import { lightenHex } from '../lib/color.js';
import { toggleThemeWithAnimation } from '../lib/theme.js';
import type { AppId } from '@hudumika/types';
import './AppSidebar.css';

export interface SidebarNavItem {
  label: string;
  icon: IconName;
  path: string;
  badge?: string;
  badgeVariant?: 'free' | 'soon' | 'count';
  exact?: boolean;
  /** Child items rendered indented beneath this one when expanded. The
   *  parent auto-expands whenever it or one of its children is the active
   *  route; the chevron also toggles it manually. */
  children?: SidebarNavItem[];
}

export interface SidebarSection {
  title?: string;
  items: SidebarNavItem[];
  /** Whether this section can be collapsed via a +/- toggle. Defaults to true when `title` is set. */
  collapsible?: boolean;
}

interface Props {
  appId: AppId;
  sections: SidebarSection[];
  beforeNav?: (opts: { collapsed: boolean }) => React.ReactNode;
  fillNav?: (opts: { collapsed: boolean }) => React.ReactNode;
  afterNav?: (opts: { collapsed: boolean }) => React.ReactNode;
  loading?: boolean;
}

const APP_ICONS: Record<AppId, IconName> = {
  lens:      'search',
  clearos:   'layers',
  finops:    'barChart',
  complyos:  'shield',
  bliss:     'chatBubble',
  nexushr:     'users',
  onesite:   'globe',
  onsite:    'terminal',
  oneid:     'lock',
  tracking:  'mapPin',
  cloud:     'folder',
  ai:        'sparkle',
  workspace: 'grid',
  admin:     'shield',
  email:     'mail',
  crm:       'users',
  contacts:  'user',
  store:     'package',
  demurrage:     'alertTriangle', // no longer a distinct shell — merged into cargotracker — kept only to satisfy Record<AppId,...>
  cargotracker:  'map',
  calendar:  'calendar',
  tasks:     'tasks',
  seal:      'package',
  inventory: 'package',
  studio:    'gitBranch',
  hudubi:    'barChart2',
};

const APP_SUBTITLES: Partial<Record<AppId, string>> = {
  clearos:   'Customs & Freight',
  finops:    'Finance & Accounts',
  complyos:  'Compliance Platform',
  bliss:     'Support & Helpdesk',
  nexushr:     'People & HR',
  onesite:   'Web & CMS',
  oneid:     'Identity & Access',
  tracking:  'Vehicle & Fleet Tracking',
  cloud:     'File Storage',
  ai:        'AI Intelligence',
  workspace: 'Admin & Settings',
  admin:     'Super Admin Console',
  email:     'Hudumika Mail',
  crm:       'Customers & Leads',
  contacts:  'Contact Manager',
  store:     'Add-ons & Plugins',
  cargotracker:  'Cargo Tracking & Demurrage',
  seal:          'Bonded Warehouse Ledger',
  inventory:     'Inventory Control',
};

export function AppSidebar({ appId, sections, beforeNav, fillNav, afterNav, loading }: Props) {
  const location    = useLocation();
  const { logout }  = useAuth();
  const { t }       = useLocale();
  const { mobileOpen, setMobileOpen } = useContext(MobileNavContext);
  const [pendingPath, setPendingPath] = useState<string | null>(null);
  const [isNavigating, setIsNavigating] = useState(false);

  // Clear pending state on location change or fallback timeout
  useEffect(() => {
    if (pendingPath) {
      setPendingPath(null);
      setIsNavigating(false);
    }
  }, [location.pathname, location.search]);

  function handleItemClick(path: string) {
    setMobileOpen(false);
    const [p, q] = path.split('?');
    const currentQuery = location.search ? location.search.substring(1) : '';
    const isSamePath = location.pathname === p && currentQuery === (q || '');
    if (!isSamePath) {
      setPendingPath(path);
      setIsNavigating(true);
    }
  }

  // Sidebar is open/expanded by default, and only collapses when the user explicitly closes it
  const [collapsed, setCollapsed] = useState(() => {
    return localStorage.getItem(`${appId}-sidebar-closed-user`) === 'true';
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const section of sections) {
      if (!section.title) continue;
      const stored = localStorage.getItem(`${appId}-sb-section-${section.title}`);
      initial[section.title] = stored === null ? true : stored === 'open';
    }
    return initial;
  });

  function toggleSection(title: string) {
    setOpenSections(prev => {
      const next = !(prev[title] ?? true);
      localStorage.setItem(`${appId}-sb-section-${title}`, next ? 'open' : 'closed');
      return { ...prev, [title]: next };
    });
  }

  // Manual expand/collapse for items with children, keyed by parent path.
  // Auto-expand (see isParentOpen below) covers the common case of landing
  // on a child route directly; this only needs to track explicit toggles.
  const [openParents, setOpenParents] = useState<Record<string, boolean>>({});
  function toggleParent(path: string) {
    setOpenParents(prev => ({ ...prev, [path]: !(prev[path] ?? false) }));
  }
  const [isDark, setIsDark] = useState(
    () => document.documentElement.getAttribute('data-theme') === 'dark'
  );

  // The actual theme toggle button lives in AppHeader, not here — watch the
  // attribute directly rather than trust only this component's own
  // toggleTheme() below, so --sb-color's dark-mode lightening (see effect
  // further down) stays correct when the theme is flipped from the header.
  useEffect(() => {
    const observer = new MutationObserver(() => {
      setIsDark(document.documentElement.getAttribute('data-theme') === 'dark');
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  const sidebarRef = useRef<HTMLElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const branding = useBranding();
  const [dsRev, setDsRev] = useState(0);
  const [subOpen, setSubOpen] = useState(false);
  const { planLabel, monthlyPrice } = useTenantPlan();
  const appColor   = branding.getAppColor(appId, APP_COLORS[appId] ?? 'var(--ink3)');

  function toggleTheme(dark: boolean, e?: React.MouseEvent) {
    toggleThemeWithAnimation(e, dark);
  }

  useEffect(() => {
    // Same reason as WorkspaceApp.tsx's --teal scoping: a per-app accent hex
    // picked for light-mode contrast (e.g. the Midnight Navy default) can go
    // nearly invisible as the active nav item's text/tint on a dark sidebar —
    // lighten it for dark mode instead of applying the light-mode hex as-is.
    const effectiveColor = isDark ? lightenHex(appColor, 0.45) : appColor;
    sidebarRef.current?.style.setProperty('--sb-color', effectiveColor);
  }, [appColor, mobileOpen, isDark]);

  // Sidebar collapse can also be commanded externally (e.g. the header's
  // full-width toggle collapses the sidebar to free up space) — stay in
  // sync so this component's own UI reflects it, not just localStorage.
  useEffect(() => {
    const handler = (e: Event) => {
      const evt = e as CustomEvent;
      if (evt.detail && typeof evt.detail.collapsed === 'boolean') {
        setCollapsed(evt.detail.collapsed);
      }
    };
    window.addEventListener('sidebar-toggled', handler);
    return () => window.removeEventListener('sidebar-toggled', handler);
  }, []);

  function toggleCollapse() {
    const next = !collapsed;
    setCollapsed(next);
    localStorage.setItem(`${appId}-sidebar-closed-user`, String(next));
    window.dispatchEvent(new CustomEvent('sidebar-toggled', { detail: { collapsed: next } }));
  }

  /**
   * Query-string keys that act as scope discriminators, per pathname.
   *
   * Several nav entries can point at the same page and differ only by query —
   * Studio's "BY APP" list is seven links to /studio/workflows?app=… . The old
   * check split the query off and compared pathnames alone, so every one of
   * them highlighted at once. Where a pathname has scoped variants the query
   * becomes part of its identity; everywhere else it stays ignored, so a page
   * that merely adds its own filter params keeps its nav item highlighted.
   */
  const scopeKeysByPath = React.useMemo(() => {
    const map = new Map<string, Set<string>>();
    const walk = (items: SidebarNavItem[]) => {
      for (const i of items) {
        const [p, q] = i.path.split('?');
        if (q) {
          const keys = map.get(p) ?? new Set<string>();
          for (const k of new URLSearchParams(q).keys()) keys.add(k);
          map.set(p, keys);
        }
        if (i.children) walk(i.children);
      }
    };
    for (const s of sections) walk(s.items);
    return map;
  }, [sections]);

  function isActive(path: string, exact?: boolean): boolean {
    const [p, q] = path.split('?');
    const pathMatches = location.pathname === p || (!exact && location.pathname.startsWith(p + '/'));
    if (!pathMatches) return false;

    const scopeKeys = scopeKeysByPath.get(p);
    if (!scopeKeys) return true;

    const current = new URLSearchParams(location.search);
    if (!q) {
      // The unscoped entry ("Workflows") is active only when no scope is applied.
      return [...scopeKeys].every(k => !current.has(k));
    }
    for (const [k, v] of new URLSearchParams(q)) {
      if (current.get(k) !== v) return false;
    }
    return true;
  }

  function hasActiveDescendant(item: SidebarNavItem): boolean {
    return !!item.children?.some(c => isActive(c.path, c.exact) || hasActiveDescendant(c));
  }

  const appLabel    = branding.getAppName(appId, APP_LABELS[appId] ?? String(appId));
  const appIcon     = APP_ICONS[appId]  ?? 'grid';
  const appSubtitle = branding.getAppSlogan(appId, t(`appSubtitles.${appId}`, APP_SUBTITLES[appId] ?? ''));

  function renderContent() {
    return (
      <>
        {/* ── Top loading progress bar ── */}
        <div className={`app-sb-loading-bar${isNavigating || loading ? ' app-sb-loading-bar--active' : ''}`} />

        {/* ── Brand header ── */}
        <div className="app-sb-brand">
          <div className="app-sb-brand-icon">
            {branding.getAppLogo(appId) ? (
              <img src={branding.getAppLogo(appId)} alt={appLabel} className="app-sb-brand-logo-img" />
            ) : (
              <Icon name={appIcon} size={16} color="#fff" strokeWidth={2} />
            )}
          </div>
          {!collapsed && (
            <div className="app-sb-brand-text">
              <div className="app-sb-brand-name">{appLabel}</div>
              {appSubtitle && <div className="app-sb-brand-sub">{appSubtitle}</div>}
            </div>
          )}
        </div>

        {/* ── Collapse / expand toggle — floats on the right edge ── */}
        <button
          type="button"
          className="app-sb-toggle"
          onClick={toggleCollapse}
          title={collapsed ? t('sidebar.expand') : t('sidebar.collapse')}
        >
          <Icon name={collapsed ? 'chevronRight' : 'chevronLeft'} size={11} color="var(--ink)" strokeWidth={2.5} />
        </button>

        {/* ── Fill-nav slot: replaces beforeNav + nav, takes flex: 1 ── */}
        {fillNav ? (
          <div className="app-sb-fill-nav">
            {fillNav({ collapsed })}
          </div>
        ) : (
          <>
            {/* ── Before-nav slot (e.g. Compose button) ── */}
            {beforeNav?.({ collapsed })}

            {/* ── Nav ── */}
            <nav className="app-sb-nav">
              {loading ? (
                <div className="app-sb-skeleton-group">
                  {[80, 65, 90, 70, 85, 60, 75].map((w, idx) => (
                    <div key={idx} className="app-sb-skeleton-item">
                      <div className="app-sb-skeleton-icon skeleton-shimmer" />
                      {!collapsed && (
                        <div
                          className="app-sb-skeleton-text skeleton-shimmer"
                          style={{ width: `${w}%` }}
                        />
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                sections.map((section, si) => {
                  const isCollapsible = !!section.title && (section.collapsible ?? true);
                  const isOpen = !section.title || (openSections[section.title] ?? true);
                  return (
                  <div key={si} className="app-sb-section-group">
                    {section.title && !collapsed && (
                      <div
                        className={`app-sb-section-hdr${isCollapsible ? ' app-sb-section-hdr--collapsible' : ''}`}
                        onClick={isCollapsible ? () => toggleSection(section.title!) : undefined}
                      >
                        <span>{section.title}</span>
                        {isCollapsible && <span className="app-sb-section-toggle">{isOpen ? '−' : '+'}</span>}
                      </div>
                    )}
                    {(isOpen || collapsed) && section.items.map(item => {
                      const active = isActive(item.path, item.exact);
                      const hasChildren = !!item.children?.length;
                      const isPending = pendingPath === item.path;

                      if (!hasChildren) {
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            className={`app-sb-item${active ? ' app-sb-item--active' : ''}${isPending ? ' app-sb-item--pending' : ''}`}
                            onClick={() => handleItemClick(item.path)}
                            title={collapsed ? item.label : undefined}
                          >
                            <span className="app-sb-item-icon">
                              {isPending ? (
                                <span className="app-sb-item-spinner" />
                              ) : (
                                <Icon name={item.icon} size={16} strokeWidth={active ? 2.2 : 1.8} />
                              )}
                            </span>
                            {!collapsed && (
                              <>
                                <span className="app-sb-item-label">{item.label}</span>
                                {item.badge && (
                                  <span className={`app-sb-badge app-sb-badge--${item.badgeVariant ?? 'tag'}`}>
                                    {item.badge}
                                  </span>
                                )}
                              </>
                            )}
                          </Link>
                        );
                      }

                      // Item with children: auto-expand whenever it or a
                      // descendant is the active route, otherwise follow the
                      // manual toggle. The parent itself is a toggle only —
                      // not a navigable link — matching how section headers
                      // (OPERATIONS, TOOLS, ...) behave.
                      const isParentOpen = openParents[item.path] ?? hasActiveDescendant(item);

                      if (collapsed) {
                        // Icon rail: children never render, so fall back to a
                        // plain navigable icon like a leaf item.
                        return (
                          <Link
                            key={item.path}
                            to={item.path}
                            className={`app-sb-item${active ? ' app-sb-item--active' : ''}${isPending ? ' app-sb-item--pending' : ''}`}
                            onClick={() => handleItemClick(item.path)}
                            title={item.label}
                          >
                            <span className="app-sb-item-icon">
                              {isPending ? (
                                <span className="app-sb-item-spinner" />
                              ) : (
                                <Icon name={item.icon} size={16} strokeWidth={active ? 2.2 : 1.8} />
                              )}
                            </span>
                          </Link>
                        );
                      }

                      return (
                        <React.Fragment key={item.path}>
                          <div
                            className="app-sb-item app-sb-item--parent-hdr"
                            onClick={() => toggleParent(item.path)}
                          >
                            <span className="app-sb-item-icon">
                              <Icon name={item.icon} size={16} strokeWidth={1.8} />
                            </span>
                            <span className="app-sb-item-label">{item.label}</span>
                            <span className="app-sb-item-parent-toggle">{isParentOpen ? '−' : '+'}</span>
                          </div>
                          {isParentOpen && (
                            <div className="app-sb-children-group">
                              {item.children!.map(child => {
                                const childActive = isActive(child.path, child.exact);
                                const isChildPending = pendingPath === child.path;
                                return (
                                  <Link
                                    key={child.path}
                                    to={child.path}
                                    className={`app-sb-item app-sb-item--child${childActive ? ' app-sb-item--active' : ''}${isChildPending ? ' app-sb-item--pending' : ''}`}
                                    onClick={() => handleItemClick(child.path)}
                                  >
                                    {isChildPending && <span className="app-sb-item-spinner app-sb-item-spinner--sm" />}
                                    <span className="app-sb-item-label">{child.label}</span>
                                    {child.badge && (
                                      <span className={`app-sb-badge app-sb-badge--${child.badgeVariant ?? 'tag'}`}>
                                        {child.badge}
                                      </span>
                                    )}
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </div>
                  );
                })
              )}
              {afterNav?.({ collapsed })}
            </nav>
          </>
        )}

        {/* ── Footer — Subscription Box ── */}
        <div className="app-sb-sub-footer">
          {!collapsed ? (
            <div className="app-sb-sub-box">
              <div 
                className="app-sb-sub-header" 
                onClick={() => setSubOpen(!subOpen)}
              >
                <div className="app-sb-sub-title">
                  <Icon name="zap" size={14} style={{ color: 'var(--teal)' }} />
                  <span>{planLabel} Plan</span>
                </div>
                <Icon name={subOpen ? 'chevronDown' : 'chevronRight'} size={14} />
              </div>
              {subOpen && (
                <div className="app-sb-sub-content">
                  <div className="app-sb-sub-metric" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink)' }}>
                    <span style={{ color: 'var(--ink3)' }}>Price</span>
                    <strong>{monthlyPrice ? `$${monthlyPrice}/mo` : 'Free'}</strong>
                  </div>
                  <div className="app-sb-sub-metric" style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--ink)' }}>
                    <span style={{ color: 'var(--ink3)' }}>Expires</span>
                    <strong>31 Dec 2026</strong>
                  </div>
                  <Link to="/subscription" className="app-sb-sub-btn">Pay Upfront</Link>
                </div>
              )}
            </div>
          ) : (
            <Link to="/subscription" className="app-sb-footer-icon-btn" title="Subscription">
              <Icon name="zap" size={16} style={{ color: 'var(--teal)' }} />
            </Link>
          )}
        </div>
      </>
    );
  }

  if (mobileOpen) {
    return createPortal(
      <>
        <div className="app-sb-backdrop" onClick={() => setMobileOpen(false)} />
        <aside
          ref={sidebarRef}
          className={`app-sidebar app-sidebar--mobile-open${collapsed ? ' app-sidebar--collapsed' : ''}`}
        >
          {renderContent()}
        </aside>
      </>,
      document.body
    );
  }

  return (
    <aside
      ref={sidebarRef}
      className={`app-sidebar${collapsed ? ' app-sidebar--collapsed' : ''}`}
    >
      {renderContent()}
    </aside>
  );
}

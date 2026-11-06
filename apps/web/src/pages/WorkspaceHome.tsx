import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useBranding } from '../hooks/useBranding.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { LauncherAppSvg as AppIcon, LAUNCHER_APPS } from '../components/LauncherApps.js';
import { Icon } from '../components/Icon.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
import { Tip } from '../components/ui/tooltip.js';
import { SetupGuideWidget } from '../components/SetupGuideWidget.js';
import { AttendanceStatusBanner } from '../components/AttendanceStatusBanner.js';
import { MGMT_ROLES } from '../lib/permissions.js';
import { getRecentApps, recordRecentApp } from '../lib/recentApps.js';
import './WorkspaceHome.css';

interface HudumikaApp {
  id: string;
  name: string;
  desc: string;
  category: string;
  path: string;
  color: string;
  superAdminOnly?: boolean;
}

// Card copy (description/category) for each app in LAUNCHER_APPS —
// id/name/color/path come from LAUNCHER_APPS itself (the same list the header
// launcher renders) so this grid can't drift into showing a different set of
// apps, a stale display name, or a wrong route than the launcher does.
//
// Deliberately no per-app user-count/data-size/service-count figures here —
// this used to carry hardcoded placeholder numbers (e.g. "ClearOS · 12 users
// · 33 GB") that were identical for every tenant on the platform, not real
// usage. Removed rather than wired up, since no per-tenant, per-app metering
// exists yet to back them honestly.
//
// A `status: 'Live' | 'Beta' | 'Coming Soon'` field used to live on every one
// of these entries too — a second, independent hardcoded "Beta" catalog that
// disagreed with Settings.tsx's own MODULE_CATALOG (this one never marked
// 'notes' Beta; that one did) and, on top of that, was never actually read
// anywhere in this file — no badge, no conditional, nothing. Removed rather
// than wired up: the one real Beta label now lives on app_status
// (migration 395), set by a SuperAdmin and reported to every tenant via
// GET /v1/entitlements' betaApps, exactly like Settings.tsx reads it.
const APP_META: Record<string, Pick<HudumikaApp, 'desc' | 'category'>> = {
  clearos:      { desc: 'Customs clearance platform & TANCIS integration', category: 'Logistics' },
  finops:       { desc: 'Financial accounts, TRA EFD integration & payroll ledger', category: 'Finance' },
  nexushr:      { desc: 'People operations, payroll & shift rosters', category: 'HR' },
  bliss:        { desc: 'Omnichannel customer helpdesk & ticketing system', category: 'Support' },
  complyos:     { desc: 'Compliance tracking, BRELA business search, permits & audit logs', category: 'Compliance' },
  crm:          { desc: 'Customer relationships, leads & sales pipeline', category: 'Sales' },
  cloud:        { desc: 'Enterprise document storage & cloud drive', category: 'Storage' },
  email:        { desc: 'Team inbox and email workspace', category: 'Communication' },
  contacts:     { desc: 'Shared customer, vendor and partner contact directory', category: 'Directory' },
  store:        { desc: 'B2B Procurement & equipment marketplace', category: 'Procurement' },
  ondi:         { desc: 'SSO, identity verification & biometric access control', category: 'Identity' },
  tracking:     { desc: 'Fleet, vehicle and driver tracking — GPS positions, geofence alerts & trip history', category: 'Logistics' },
  workspace:    { desc: 'Organization settings and configuration', category: 'Admin' },
  onsite:       { desc: 'Domains, DNS, hosting, deployments & cloud infrastructure', category: 'Infrastructure' },
  calendar:     { desc: 'Scheduling & team calendar', category: 'Productivity' },
  tasks:        { desc: 'To-dos & team task tracking', category: 'Productivity' },
  cargotracker: { desc: 'AWB and Bill of Lading shipment tracking', category: 'Logistics' },
  seal:         { desc: 'Bonded warehouse ledger — customs status, storage clocks & audit-chained movements', category: 'Logistics' },
  inventory:    { desc: 'General multi-warehouse stock control — items, batches, units of measure & reorder alerts', category: 'Logistics' },
  hudubi:       { desc: 'Reports, dashboards, board KPIs, and business forecasts', category: 'Analytics' },
  petti:        { desc: 'Tenant petty-cash wallets — deposits, request/approve/disburse withdrawals', category: 'Finance' },
  sign:         { desc: 'Secure electronic document signatures, approvals & audit-chained events', category: 'Productivity' },
  sms:          { desc: 'Bulk & transactional SMS — quick send, groups, templates, scheduled campaigns', category: 'Communication' },
  projects:     { desc: 'Project boards, sprints, milestones & deliverables', category: 'Productivity' },
  notes:        { desc: 'Quick notes, rich documentation & scratchpads', category: 'Productivity' },
  onesite:      { desc: 'Content management system, web pages & media assets', category: 'Content' },
  lens:         { desc: 'Platform observability, runtime introspection & diagnostics', category: 'System' },
  demurrage:    { desc: 'Container demurrage calculation, free-period tracking & port invoices', category: 'Logistics' },
  developer:    { desc: 'API Gateway, developer credentials, metering, telemetry & API marketplace', category: 'Infrastructure' },
  tuma:         { desc: 'Parcel logistics — booking, dispatch, delivery tracking & agent management', category: 'Logistics' },
  lexcore:      { desc: 'Legal practice management — matters, time/billing, trust accounts & conflicts', category: 'Legal' },
  ngao:         { desc: 'Privacy & data protection compliance — assessments, registers & incident response', category: 'Compliance' },
  stride:       { desc: 'Race operations, live telemetry and ticketing', category: 'Sports' },
  gereji:       { desc: 'Automotive workshop — vehicle records, job cards, estimates, labour & parts', category: 'Automotive' },
};

const apps: HudumikaApp[] = [
  ...LAUNCHER_APPS.map(app => ({
    ...app,
    ...(APP_META[app.id] ?? { desc: '', category: 'Other' }),
  })),
  // Deliberately not in LAUNCHER_APPS/APP_META above — that list also drives
  // the header AppLauncher switcher, which has no role filtering, so a tile
  // added there would show the platform console to every tenant user. This
  // entry only exists here, and the superAdminOnly filter below (existing
  // logic, not new) keeps it out of enabledAndAllowedApps for anyone else.
  {
    id: 'superadmin', name: 'SuperAdmin', path: '/admin', color: 'var(--ink)',
    superAdminOnly: true, desc: 'Platform-wide tenant, billing, package & system administration',
    category: 'Admin',
  },
];

interface WorkspaceHomeProps {
  externalSearch?: string;
}

export function WorkspaceHome({ externalSearch }: WorkspaceHomeProps) {
  const { user } = useAuth();
  const branding = useBranding();

  // View mode toggle: 'grid' (4 columns) or 'cards' (card tiles)
  const [viewMode, setViewMode] = useState<'grid' | 'cards'>(() => {
    const saved = localStorage.getItem('hudumika_workspace_view_mode');
    if (saved === 'cards' || saved === 'grid') return saved as 'grid' | 'cards';
    if (saved === 'list') return 'grid';
    return 'grid';
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const handleViewChange = (mode: 'grid' | 'cards') => {
    setViewMode(mode);
    localStorage.setItem('hudumika_workspace_view_mode', mode);
  };

  const tMap: Record<string, string> = {
    'hub.recentlyViewed': 'Recently Viewed',
    // Was "My Workspaces" — every row here is one of this tenant's own
    // enabled app modules (ClearOS, FinOps, ...), not a separate client
    // workspace in the AgencyHost sense that label implied.
    'hub.myWorkspaces': 'My Apps',
  };
  const t = (k: string) => tMap[k] ?? k;

  // Starred Workspaces
  const [starredIds, setStarredIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hudumika_starred_apps');
      return saved ? JSON.parse(saved) : ['clearos', 'finops', 'nexushr', 'bliss'];
    } catch {
      return ['clearos', 'finops', 'nexushr', 'bliss'];
    }
  });

  useEffect(() => {
    localStorage.setItem('hudumika_starred_apps', JSON.stringify(starredIds));
  }, [starredIds]);

  // ── Recently Viewed — recorded centrally by WorkspaceApp.tsx on every app
  // visit (see lib/recentApps.ts), not just a click starting from this page,
  // so this reflects sidebar navigation and deep links too, not only a tile
  // clicked here. Re-read on mount for the same reason. handleAppClick below
  // still records optimistically on click so this page's own list reorders
  // immediately rather than waiting for the navigated-to app to mount.
  const [recentIds, setRecentIds] = useState<string[]>(() =>
    getRecentApps(['clearos', 'finops', 'nexushr', 'bliss', 'complyos']));

  useEffect(() => {
    setRecentIds(getRecentApps(['clearos', 'finops', 'nexushr', 'bliss', 'complyos']));
  }, []);

  const handleAppClick = (app: HudumikaApp) => {
    recordRecentApp(app.id);
    setRecentIds(getRecentApps(['clearos', 'finops', 'nexushr', 'bliss', 'complyos']));
  };

  const toggleStar = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setStarredIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const isSuperAdmin = (user as { role?: string } | null)?.role === 'SUPER_ADMIN';
  const isManager = MGMT_ROLES.includes(((user as { role?: string } | null)?.role ?? '') as typeof MGMT_ROLES[number]);
  const enabledApps = useEnabledApps();
  const q = (externalSearch ?? '').toLowerCase();

  if (!enabledApps) return <SkeletonPage variant="cards" />;

  const enabledAndAllowedApps = apps.filter(app => {
    if (app.superAdminOnly && !isSuperAdmin) return false;
    if (!isSuperAdmin && !isAppEnabled(app.id, enabledApps)) return false;
    return true;
  });

  const filteredApps = enabledAndAllowedApps.filter(app => {
    const matchesSearch = !q ||
      app.name.toLowerCase().includes(q) || branding.getAppName(app.id, app.name).toLowerCase().includes(q) ||
      app.desc.toLowerCase().includes(q) || branding.getAppSlogan(app.id, app.desc).toLowerCase().includes(q) ||
      app.category.toLowerCase().includes(q);
    const matchesCategory = !selectedCategory || app.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Unique categories for filtering
  const categories = Array.from(new Set(enabledAndAllowedApps.map(a => a.category)));

  // Always produce exactly 5 recently viewed apps from actual history + fallbacks
  const recentlyViewedApps = (() => {
    const fromRecent = recentIds
      .map(id => enabledAndAllowedApps.find(a => a.id === id))
      .filter((a): a is HudumikaApp => !!a);

    const result = [...fromRecent];
    for (const app of enabledAndAllowedApps) {
      if (result.length >= 5) break;
      if (!result.some(a => a.id === app.id)) {
        result.push(app);
      }
    }
    return result.slice(0, 5);
  })();

  return (
    <div className="wh-new-root">
      <div className="wh-page-box">

        {/* ── Main Content Area ── */}
        <div className="wh-new-container">
          {/* ── Section: Attendance / Clock-in identity banner — moved here
              from NexusHR's own "My HR" ESS dashboard at the user's request.
              Only for tenants actually entitled to NexusHR — showing a
              "Clock In Now" prompt (and the identity card around it) to a
              Petti/ComplyOS/Onsite-only tenant offers a control that leads
              nowhere real. See the standalone-apps audit, 5 Nov 2026. ── */}
          {isAppEnabled('nexushr', enabledApps) && <AttendanceStatusBanner />}

          {/* ── Section: Getting Started (hides itself once fully set up) ── */}
          {isManager && <SetupGuideWidget />}

          {/* ── Section: Recently Viewed (5 Cards Grid) ── */}
          {recentlyViewedApps.length > 0 && (
            <section className="wh-new-section">
              <div className="wh-section-header">
                <h2 className="wh-section-title">{t('hub.recentlyViewed')}</h2>
              </div>
              <div className="wh-cards-row">
                {recentlyViewedApps.map(app => {
                  const appColor = branding.getAppColor(app.id, app.color);
                  const appName = branding.getAppName(app.id, app.name);
                  const appSlogan = branding.getAppSlogan(app.id, app.desc);
                  return (
                    <Link
                      key={app.id}
                      to={app.path}
                      className="wh-horizontal-card"
                      onClick={() => handleAppClick(app)}
                      style={{ '--card-color': appColor, minWidth: 0 } as React.CSSProperties}
                    >
                      <div className="wh-card-logo-wrap">
                        <AppIcon id={app.id} color={appColor} logoUrl={branding.getAppLogo(app.id)} size={42} />
                      </div>
                      <div className="wh-card-content" style={{ minWidth: 0 }}>
                        <div className="wh-card-title-row">
                          <span className="wh-card-title">{appName}</span>
                          <span className="wh-badge-cat">{app.category}</span>
                        </div>
                        {appSlogan && (
                          <Tip label={appSlogan} side="bottom">
                            <div className="wh-card-sub">{appSlogan}</div>
                          </Tip>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

          {/* ── Section: My Workspaces ── */}
          <section className="wh-new-section wh-new-section--workspaces">
            <div className="wh-workspace-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="wh-section-title">{t('hub.myWorkspaces')}</h2>

              <div className="wh-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* Grid / Card Toggle Buttons */}
                <Tabs value={viewMode} onValueChange={v => handleViewChange(v as typeof viewMode)} variant="segmented">
                  <TabsList>
                    <TabsTrigger value="grid">
                      <Icon name="grid" size={14} />
                      <span>Grid View</span>
                    </TabsTrigger>
                    <TabsTrigger value="cards">
                      <Icon name="columns" size={14} />
                      <span>Card View</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Filter Industry */}
                <SingleSelectFilter
                  label="Filter"
                  allLabel="All Industries"
                  value={selectedCategory || null}
                  onChange={(v) => setSelectedCategory(v ?? '')}
                  options={categories.map(cat => ({ value: cat, label: cat }))}
                />

                {/* Settings Link — the tenant's own workspace settings, not
                    the SuperAdmin-only platform console. /admin/branding
                    requires SUPER_ADMIN and silently bounces every other
                    user straight back to their own home page. */}
                <Link to="/settings" className="wh-btn wh-btn--ghost wh-btn--sm" style={{ padding: '0 14px', height: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13, fontWeight: 700, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="sliders" size={14} />
                  <span>SETTINGS</span>
                </Link>
              </div>
            </div>

            {/* ── Render Mode: Card View (remains as it is now) ── */}
            {viewMode === 'cards' ? (
              <div className="wh-grid-container">
                {filteredApps.map(app => {
                  const isStarred = starredIds.includes(app.id);
                  const appColor = branding.getAppColor(app.id, app.color);
                  const appName = branding.getAppName(app.id, app.name);
                  const appSlogan = branding.getAppSlogan(app.id, app.desc);
                  return (
                    <Link
                      key={app.id}
                      to={app.path}
                      className="wh-grid-card"
                      onClick={() => handleAppClick(app)}
                      style={{ '--card-color': appColor } as React.CSSProperties}
                    >
                      <div className="wh-grid-card-inner">
                        <div className="wh-grid-icon-wrap">
                          <AppIcon id={app.id} color={appColor} logoUrl={branding.getAppLogo(app.id)} size={44} />
                        </div>
                        <div className="wh-grid-card-info">
                          <div className="wh-grid-name-row">
                            <Tip label={appName} side="bottom">
                              <span className="wh-grid-workspace-name">{appName}</span>
                            </Tip>
                            <span className="wh-badge-cat">{app.category}</span>
                          </div>
                          {appSlogan && (
                            <Tip label={appSlogan} side="bottom">
                              <p className="wh-grid-workspace-desc">{appSlogan}</p>
                            </Tip>
                          )}
                        </div>

                        <Tip label={isStarred ? 'Remove from favorites' : 'Add to favorites'}>
                          <button
                            type="button"
                            className="wh-star-btn"
                            data-starred={isStarred}
                            onClick={(e) => toggleStar(app.id, e)}
                            aria-label={isStarred ? `Unstar ${appName}` : `Star ${appName}`}
                           data-ui-native-button="">
                            <Icon name="star" size={17} duotone={isStarred} />
                          </button>
                        </Tip>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              /* ── Render Mode: Joined Square Matrix Grid View (up to 8 columns) ── */
              filteredApps.length === 0 ? (
                <div className="wh-square-grid-container">
                  <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)', gridColumn: '1 / -1' }}>
                    No apps found matching your filter.
                  </div>
                </div>
              ) : (
                <div className="wh-square-grid-container">
                  {filteredApps.map(app => {
                    const isStarred = starredIds.includes(app.id);
                    const appColor = branding.getAppColor(app.id, app.color);
                    const appName = branding.getAppName(app.id, app.name);
                    const appSlogan = branding.getAppSlogan(app.id, app.desc);

                    return (
                      <div
                        key={app.id}
                        className="wh-square-card"
                        style={{ '--card-color': appColor } as React.CSSProperties}
                        onClick={() => handleAppClick(app)}
                      >
                        {/* Top bar: Star button only — category/title/description
                            moved into the centered info block below. */}
                        <div className="wh-square-top">
                          <Tip label={isStarred ? 'Remove from favorites' : 'Add to favorites'}>
                            <button
                              type="button"
                              className="wh-star-btn"
                              data-starred={isStarred}
                              onClick={(e) => toggleStar(app.id, e)}
                              aria-label={isStarred ? `Unstar ${appName}` : `Star ${appName}`}
                              data-ui-native-button=""
                            >
                              <Icon name="star" size={16} duotone={isStarred} />
                            </button>
                          </Tip>
                        </div>

                        {/* Main clickable area: Large App Icon + Centered
                            Category, Name & Description */}
                        <Link
                          to={app.path}
                          onClick={() => handleAppClick(app)}
                          className="wh-square-main"
                        >
                          <div className="wh-square-icon-wrap">
                            <AppIcon id={app.id} color={appColor} logoUrl={branding.getAppLogo(app.id)} size={48} />
                          </div>

                          <div className="wh-square-info">
                            <span className="wh-badge-cat">{app.category}</span>
                            <span className="wh-square-name">{appName}</span>
                            {appSlogan && (
                              <Tip label={appSlogan} side="bottom">
                                <p className="wh-square-desc">{appSlogan}</p>
                              </Tip>
                            )}
                          </div>
                        </Link>
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </section>

        </div>
      </div>
    </div>
  );
}

export default WorkspaceHome;

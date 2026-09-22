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
  ai:           { desc: 'Automated intelligence, document OCR & predictive analytics', category: 'AI' },
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
  hudubi:       { desc: 'Data layer, executive BI analytics, board KPIs & predictive intelligence', category: 'Analytics' },
  petti:        { desc: 'Tenant petty-cash wallets — deposits, request/approve/disburse withdrawals', category: 'Finance' },
  sign:         { desc: 'Secure electronic document signatures, approvals & audit-chained events', category: 'Productivity' },
  sms:          { desc: 'Bulk & transactional SMS — quick send, groups, templates, scheduled campaigns', category: 'Communication' },
  projects:     { desc: 'Project boards, sprints, milestones & deliverables', category: 'Productivity' },
  notes:        { desc: 'Quick notes, rich documentation & scratchpads', category: 'Productivity' },
  onesite:      { desc: 'Content management system, web pages & media assets', category: 'Content' },
  lens:         { desc: 'Platform observability, runtime introspection & diagnostics', category: 'System' },
  demurrage:    { desc: 'Container demurrage calculation, free-period tracking & port invoices', category: 'Logistics' },
  developer:    { desc: 'API Gateway, developer credentials, metering, telemetry & API marketplace', category: 'Infrastructure' },
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

  // View mode toggle: default to 5-column 'grid' cards view, switchable to 'list'
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
    return (localStorage.getItem('hudumika_workspace_view_mode') as 'grid' | 'list') || 'grid';
  });

  const [selectedCategory, setSelectedCategory] = useState<string>('');

  const handleViewChange = (mode: 'grid' | 'list') => {
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

  // ── Recently Viewed (persisted in localStorage, always showing 5 apps) ──
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hudumika_recently_viewed');
      return saved ? JSON.parse(saved) : ['clearos', 'finops', 'nexushr', 'bliss', 'complyos'];
    } catch {
      return ['clearos', 'finops', 'nexushr', 'bliss', 'complyos'];
    }
  });

  const handleAppClick = (app: HudumikaApp) => {
    setRecentIds(prev => {
      const filtered = prev.filter(id => id !== app.id);
      const next = [app.id, ...filtered].slice(0, 5);
      localStorage.setItem('hudumika_recently_viewed', JSON.stringify(next));
      return next;
    });
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
              from NexusHR's own "My HR" ESS dashboard at the user's request. ── */}
          <AttendanceStatusBanner />

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
                {/* List / Grid Toggle Buttons */}
                <Tabs value={viewMode} onValueChange={v => handleViewChange(v as typeof viewMode)} variant="segmented">
                  <TabsList>
                    <TabsTrigger value="list">
                      <Icon name="list" size={14} />
                      <span>List View</span>
                    </TabsTrigger>
                    <TabsTrigger value="grid">
                      <Icon name="grid" size={14} />
                      <span>Grid View</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>

                {/* Filter Department */}
                <SingleSelectFilter
                  label="Filter"
                  allLabel="All Departments"
                  value={selectedCategory || null}
                  onChange={(v) => setSelectedCategory(v ?? '')}
                  options={categories.map(cat => ({ value: cat, label: cat }))}
                />

                {/* Settings Link */}
                <Link to="/admin/branding" className="wh-btn wh-btn--ghost wh-btn--sm" style={{ padding: '0 14px', height: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13, fontWeight: 700, borderRadius: 'var(--r-sm)', border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="sliders" size={14} />
                  <span>SETTINGS</span>
                </Link>
              </div>
            </div>

            {/* ── Render Mode: Grid Cards Format ── */}
            {viewMode === 'grid' ? (
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
                          >
                            <Icon name="star" size={17} duotone={isStarred} />
                          </button>
                        </Tip>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              /* ── Render Mode: List Table Format (Single Joined Two-Column Table) ── */
              (() => {
                if (filteredApps.length === 0) {
                  return (
                    <div className="wh-table-container">
                      <div style={{ padding: '40px', textAlign: 'center', color: 'var(--ink3)' }}>
                        No apps found matching your filter.
                      </div>
                    </div>
                  );
                }

                const mid = Math.ceil(filteredApps.length / 2);
                const leftList = filteredApps.slice(0, mid);
                const rightList = filteredApps.slice(mid);

                return (
                  <div className="wh-table-container">
                    <table className="wh-table">
                      <thead>
                        <tr>
                          {/* ── Left Column Headers ── */}
                          <th className="wh-th-center" style={{ width: 40 }}></th>
                          <th style={{ width: '24%' }}>APP</th>
                          <th>DESCRIPTION</th>
                          <th style={{ width: '13%', textAlign: 'right', paddingRight: 18, borderRight: '1px solid var(--border)' }}>CATEGORY</th>

                          {/* ── Right Column Headers ── */}
                          <th className="wh-th-center" style={{ width: 40, paddingLeft: 18 }}></th>
                          <th style={{ width: '24%' }}>APP</th>
                          <th>DESCRIPTION</th>
                          <th style={{ width: '13%', textAlign: 'right', paddingRight: 18 }}>CATEGORY</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leftList.map((appLeft, idx) => {
                          const appRight = rightList[idx];

                          const isStarredLeft = starredIds.includes(appLeft.id);
                          const appColorLeft = branding.getAppColor(appLeft.id, appLeft.color);
                          const appNameLeft = branding.getAppName(appLeft.id, appLeft.name);
                          const appSloganLeft = branding.getAppSlogan(appLeft.id, appLeft.desc);

                          const isStarredRight = appRight ? starredIds.includes(appRight.id) : false;
                          const appColorRight = appRight ? branding.getAppColor(appRight.id, appRight.color) : '';
                          const appNameRight = appRight ? branding.getAppName(appRight.id, appRight.name) : '';
                          const appSloganRight = appRight ? branding.getAppSlogan(appRight.id, appRight.desc) : '';

                          return (
                            <tr key={appLeft.id} className="wh-joined-row" style={{ '--card-color-left': appColorLeft, '--card-color-right': appColorRight } as React.CSSProperties}>
                              {/* ── Left Side App (Hover Group: Left) ── */}
                              <td className="wh-td-cell wh-td-cell--left wh-td-center" onClick={() => handleAppClick(appLeft)}>
                                <Tip label={isStarredLeft ? 'Remove from favorites' : 'Add to favorites'}>
                                  <button
                                    type="button"
                                    className="wh-star-btn"
                                    data-starred={isStarredLeft}
                                    onClick={(e) => toggleStar(appLeft.id, e)}
                                    aria-label={isStarredLeft ? `Unstar ${appNameLeft}` : `Star ${appNameLeft}`}
                                  >
                                    <Icon name="star" size={17} duotone={isStarredLeft} />
                                  </button>
                                </Tip>
                              </td>
                              <td className="wh-td-cell wh-td-cell--left" onClick={() => handleAppClick(appLeft)}>
                                <Link to={appLeft.path} onClick={() => handleAppClick(appLeft)} className="wh-td-app-link">
                                  <div className="wh-td-icon-wrap">
                                    <AppIcon id={appLeft.id} color={appColorLeft} logoUrl={branding.getAppLogo(appLeft.id)} size={44} />
                                  </div>
                                  <div className="wh-td-app-info">
                                    <div className="wh-td-workspace-name">{appNameLeft}</div>
                                  </div>
                                </Link>
                              </td>
                              <td className="wh-td-cell wh-td-cell--left" onClick={() => handleAppClick(appLeft)}>
                                <Tip label={appSloganLeft} side="bottom">
                                  <div className="wh-td-workspace-desc">{appSloganLeft}</div>
                                </Tip>
                              </td>
                              <td className="wh-td-cell wh-td-cell--left" style={{ textAlign: 'right', paddingRight: 18, borderRight: '1px solid var(--border)' }} onClick={() => handleAppClick(appLeft)}>
                                <span className="wh-badge-cat">{appLeft.category}</span>
                              </td>

                              {/* ── Right Side App (Hover Group: Right) ── */}
                              {appRight ? (
                                <>
                                  <td className="wh-td-cell wh-td-cell--right wh-td-center" style={{ paddingLeft: 18 }} onClick={() => handleAppClick(appRight)}>
                                    <Tip label={isStarredRight ? 'Remove from favorites' : 'Add to favorites'}>
                                      <button
                                        type="button"
                                        className="wh-star-btn"
                                        data-starred={isStarredRight}
                                        onClick={(e) => toggleStar(appRight.id, e)}
                                        aria-label={isStarredRight ? `Unstar ${appNameRight}` : `Star ${appNameRight}`}
                                      >
                                        <Icon name="star" size={17} duotone={isStarredRight} />
                                      </button>
                                    </Tip>
                                  </td>
                                  <td className="wh-td-cell wh-td-cell--right" onClick={() => handleAppClick(appRight)}>
                                    <Link to={appRight.path} onClick={() => handleAppClick(appRight)} className="wh-td-app-link">
                                      <div className="wh-td-icon-wrap">
                                        <AppIcon id={appRight.id} color={appColorRight} logoUrl={branding.getAppLogo(appRight.id)} size={44} />
                                      </div>
                                      <div className="wh-td-app-info">
                                        <div className="wh-td-workspace-name">{appNameRight}</div>
                                      </div>
                                    </Link>
                                  </td>
                                  <td className="wh-td-cell wh-td-cell--right" onClick={() => handleAppClick(appRight)}>
                                    <Tip label={appSloganRight} side="bottom">
                                      <div className="wh-td-workspace-desc">{appSloganRight}</div>
                                    </Tip>
                                  </td>
                                  <td className="wh-td-cell wh-td-cell--right" style={{ textAlign: 'right', paddingRight: 18 }} onClick={() => handleAppClick(appRight)}>
                                    <span className="wh-badge-cat">{appRight.category}</span>
                                  </td>
                                </>
                              ) : (
                                <>
                                  <td className="wh-td-cell wh-td-center" style={{ paddingLeft: 18 }}></td>
                                  <td className="wh-td-cell"></td>
                                  <td className="wh-td-cell"></td>
                                  <td className="wh-td-cell" style={{ textAlign: 'right', paddingRight: 18 }}></td>
                                </>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })()
            )}
          </section>

        </div>
      </div>
    </div>
  );
}

export default WorkspaceHome;

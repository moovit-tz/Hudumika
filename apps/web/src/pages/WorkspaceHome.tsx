import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useBranding } from '../hooks/useBranding.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { LauncherAppSvg as AppIcon, LAUNCHER_APPS } from '../components/LauncherApps.js';
import { Icon } from '../components/Icon.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
import { SkeletonPage } from '../components/ui/skeleton.js';
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
  status: 'Live' | 'Beta' | 'Coming Soon';
}

// Card copy (description/category/status) for each app in LAUNCHER_APPS —
// id/name/color/path come from LAUNCHER_APPS itself (the same list the header
// launcher renders) so this grid can't drift into showing a different set of
// apps, a stale display name, or a wrong route than the launcher does.
//
// Deliberately no per-app user-count/data-size/service-count figures here —
// this used to carry hardcoded placeholder numbers (e.g. "ClearOS · 12 users
// · 33 GB") that were identical for every tenant on the platform, not real
// usage. Removed rather than wired up, since no per-tenant, per-app metering
// exists yet to back them honestly.
const APP_META: Record<string, Pick<HudumikaApp, 'desc' | 'category' | 'status'>> = {
  clearos:      { desc: 'Customs clearance platform & TANCIS integration', category: 'Logistics', status: 'Live' },
  finops:       { desc: 'Financial accounts, TRA EFD integration & payroll ledger', category: 'Finance', status: 'Live' },
  nexushr:        { desc: 'People operations, payroll & shift rosters', category: 'HR', status: 'Live' },
  bliss:        { desc: 'Omnichannel customer helpdesk & ticketing system', category: 'Support', status: 'Live' },
  complyos:     { desc: 'Compliance tracking, BRELA business search, permits & audit logs', category: 'Compliance', status: 'Live' },
  crm:          { desc: 'Customer relationships, leads & sales pipeline', category: 'Sales', status: 'Live' },
  cloud:        { desc: 'Enterprise document storage & cloud drive', category: 'Storage', status: 'Live' },
  email:        { desc: 'Team inbox and email workspace', category: 'Communication', status: 'Live' },
  contacts:     { desc: 'Shared customer, vendor and partner contact directory', category: 'Directory', status: 'Live' },
  ai:           { desc: 'Automated intelligence, document OCR & predictive analytics', category: 'AI', status: 'Live' },
  store:        { desc: 'B2B Procurement & equipment marketplace', category: 'Procurement', status: 'Live' },
  ondi:         { desc: 'SSO, identity verification & biometric access control', category: 'Identity', status: 'Live' },
  tracking:     { desc: 'Fleet, vehicle and driver tracking — GPS positions, geofence alerts & trip history', category: 'Logistics', status: 'Live' },
  workspace:    { desc: 'Organization settings and configuration', category: 'Admin', status: 'Live' },
  onsite:       { desc: 'Domains, DNS, hosting, deployments & cloud infrastructure', category: 'Infrastructure', status: 'Live' },
  calendar:     { desc: 'Scheduling & team calendar', category: 'Productivity', status: 'Live' },
  tasks:        { desc: 'To-dos & team task tracking', category: 'Productivity', status: 'Live' },
  cargotracker: { desc: 'AWB and Bill of Lading shipment tracking', category: 'Logistics', status: 'Live' },
  seal:         { desc: 'Bonded warehouse ledger — customs status, storage clocks & audit-chained movements', category: 'Logistics', status: 'Beta' },
  inventory:    { desc: 'General multi-warehouse stock control — items, batches, units of measure & reorder alerts', category: 'Logistics', status: 'Beta' },
  hudubi:       { desc: 'Data layer, executive BI analytics, board KPIs & predictive intelligence', category: 'Analytics', status: 'Live' },
  petti:        { desc: 'Tenant petty-cash wallets — deposits, request/approve/disburse withdrawals', category: 'Finance', status: 'Beta' },
  sign:         { desc: 'Secure electronic document signatures, approvals & audit-chained events', category: 'Productivity', status: 'Beta' },
  sms:          { desc: 'Bulk & transactional SMS — quick send, groups, templates, scheduled campaigns', category: 'Communication', status: 'Beta' },
};

const apps: HudumikaApp[] = [
  ...LAUNCHER_APPS.map(app => ({
    ...app,
    ...(APP_META[app.id] ?? { desc: '', category: 'Other', status: 'Live' as const }),
  })),
  // Deliberately not in LAUNCHER_APPS/APP_META above — that list also drives
  // the header AppLauncher switcher, which has no role filtering, so a tile
  // added there would show the platform console to every tenant user. This
  // entry only exists here, and the superAdminOnly filter below (existing
  // logic, not new) keeps it out of enabledAndAllowedApps for anyone else.
  {
    id: 'superadmin', name: 'SuperAdmin', path: '/admin', color: 'var(--ink)',
    superAdminOnly: true, desc: 'Platform-wide tenant, billing, package & system administration',
    category: 'Admin', status: 'Live' as const,
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
              <div className="wh-cards-row" style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 14 }}>
                {recentlyViewedApps.map(app => (
                  <Link key={app.id} to={app.path} className="wh-horizontal-card" onClick={() => handleAppClick(app)} style={{ '--card-color': app.color, minWidth: 0 } as React.CSSProperties}>
                    <div className="wh-card-logo-wrap">
                      <AppIcon id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={32} />
                    </div>
                    <div className="wh-card-content" style={{ minWidth: 0 }}>
                      <div className="wh-card-title" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{branding.getAppName(app.id, app.name)}</div>
                      <div className="wh-card-sub" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{app.category}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Section: My Workspaces ── */}
          <section className="wh-new-section wh-new-section--workspaces">
            <div className="wh-workspace-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="wh-section-title">{t('hub.myWorkspaces')}</h2>

              <div className="wh-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* List / Grid Toggle Buttons */}
                <div className="wh-toggle-group" style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    type="button"
                    className={`wh-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => handleViewChange('list')}
                    style={{ padding: 'var(--ds-btn-py-sm) 14px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, background: viewMode === 'list' ? 'var(--bg, #f1f5f9)' : 'transparent', border: 'none', cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                  >
                    <Icon name="list" size={14} />
                    <span>List View</span>
                  </button>
                  <button
                    type="button"
                    className={`wh-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => handleViewChange('grid')}
                    style={{ padding: 'var(--ds-btn-py-sm) 14px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, background: viewMode === 'grid' ? 'var(--bg, #f1f5f9)' : 'transparent', border: 'none', cursor: 'pointer', minHeight: 'var(--ctl-h-sm)', boxSizing: 'border-box', lineHeight: 1.25}}
                  >
                    <Icon name="grid" size={14} />
                    <span>Grid View</span>
                  </button>
                </div>

                {/* Filter Department */}
                <SingleSelectFilter
                  label="Filter"
                  allLabel="All Departments"
                  value={selectedCategory || null}
                  onChange={(v) => setSelectedCategory(v ?? '')}
                  options={categories.map(cat => ({ value: cat, label: cat }))}
                />

                {/* Settings Link — explicit height on the same --ctl-h-sm
                    token as the List/Grid toggle group and the filter pill
                    beside it, so all three toolbar controls line up exactly
                    (a raw padding value here, with no height floor at all,
                    previously rendered a few px shorter than its neighbors —
                    "wh-btn"/"wh-btn--ghost"/"wh-btn--sm" below are dead
                    classes with no matching CSS rule anywhere, so this
                    control's size has only ever come from its own inline
                    style). */}
                <Link to="/admin/branding" className="wh-btn wh-btn--ghost wh-btn--sm" style={{ padding: '0 14px', height: 'var(--ctl-h-sm)', boxSizing: 'border-box', fontSize: 13, fontWeight: 700, borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="sliders" size={14} />
                  <span>SETTINGS</span>
                </Link>
              </div>
            </div>

            {/* ── Render Mode: 5-Column Grid Cards Format ── */}
            {viewMode === 'grid' ? (
              <div className="wh-grid-container">
                {filteredApps.map(app => {
                  const isStarred = starredIds.includes(app.id);
                  const appColor = branding.getAppColor(app.id, app.color);
                  return (
                    <Link
                      key={app.id}
                      to={app.path}
                      className="wh-grid-card"
                      onClick={() => handleAppClick(app)}
                      style={{ '--card-color': appColor } as React.CSSProperties}
                    >
                      <div className="wh-grid-card-header">
                        <div className="wh-grid-card-client">
                          <div className="wh-grid-icon-wrap">
                            <AppIcon id={app.id} color={appColor} logoUrl={branding.getAppLogo(app.id)} size={22} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div className="wh-grid-workspace-name" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {branding.getAppName(app.id, app.name)}
                            </div>
                            <div className="wh-grid-client-lob">{app.category}</div>
                          </div>
                        </div>

                        <button
                          type="button"
                          className="wh-star-btn"
                          data-starred={isStarred}
                          onClick={(e) => toggleStar(app.id, e)}
                          title={isStarred ? 'Unstar' : 'Star'}
                        >
                          <Icon name="star" size={16} duotone={isStarred} />
                        </button>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              /* ── Render Mode: List Table Format ── */
              <div className="wh-table-container">
                <table className="wh-table">
                  <thead>
                    <tr>
                      <th className="wh-th-center" style={{ width: 40 }}></th>
                      <th>APP</th>
                      <th>CATEGORY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApps.map(app => {
                      const isStarred = starredIds.includes(app.id);
                      const appColor = branding.getAppColor(app.id, app.color);
                      return (
                        <tr key={app.id} onClick={() => handleAppClick(app)} style={{ '--card-color': appColor } as React.CSSProperties}>
                          <td className="wh-td-center">
                            <button
                              type="button"
                              className="wh-star-btn"
                              data-starred={isStarred}
                              onClick={(e) => toggleStar(app.id, e)}
                              title={isStarred ? 'Unstar' : 'Star'}
                            >
                              <Icon name="star" size={16} duotone={isStarred} />
                            </button>
                          </td>
                          <td>
                            <Link to={app.path} onClick={() => handleAppClick(app)} style={{ display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none' }}>
                              <div style={{ width: 36, height: 36, borderRadius: 9, background: 'color-mix(in srgb, var(--card-color) 15%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                <AppIcon id={app.id} color={appColor} logoUrl={branding.getAppLogo(app.id)} size={20} />
                              </div>
                              <div style={{ minWidth: 0 }}>
                                <div className="wh-td-workspace-name">{branding.getAppName(app.id, app.name)}</div>
                                <div className="wh-td-workspace-sub">{branding.getAppSlogan(app.id, app.desc)}</div>
                              </div>
                            </Link>
                          </td>
                          <td>
                            <span className="wh-badge-lob">{app.category}</span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}

export default WorkspaceHome;

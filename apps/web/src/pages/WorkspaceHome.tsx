import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useBranding } from '../hooks/useBranding.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { LauncherAppSvg as AppIcon, LAUNCHER_APPS } from '../components/LauncherApps.js';
import { Icon } from '../components/Icon.js';
import { SingleSelectFilter } from '../components/ui/filter-dropdown.js';
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
  userCount?: number;
  dataSize?: string;
  appServicesCount?: number;
  tags?: string[];
}

// Card copy (description/category/tags/status) for each app in LAUNCHER_APPS —
// id/name/color/path come from LAUNCHER_APPS itself (the same list the header
// launcher renders) so this grid can't drift into showing a different set of
// apps, a stale display name, or a wrong route than the launcher does.
const APP_META: Record<string, Pick<HudumikaApp, 'desc' | 'category' | 'status' | 'userCount' | 'dataSize' | 'appServicesCount' | 'tags'>> = {
  clearos:      { desc: 'Customs clearance platform & TANCIS integration', category: 'Logistics', status: 'Live', userCount: 12, dataSize: '33 GB', appServicesCount: 4, tags: ['TANCIS', 'EAC CET', 'PVoC'] },
  finops:       { desc: 'Financial accounts, TRA EFD integration & payroll ledger', category: 'Finance', status: 'Live', userCount: 5, dataSize: '45 GB', appServicesCount: 3, tags: ['Ledger', 'EFD', 'VAT'] },
  nexushr:        { desc: 'People operations, payroll & shift rosters', category: 'HR', status: 'Live', userCount: 15, dataSize: '08 GB', appServicesCount: 2, tags: ['Payroll', 'NSSF', 'WCF'] },
  bliss:        { desc: 'Omnichannel customer helpdesk & ticketing system', category: 'Support', status: 'Live', userCount: 8, dataSize: '24 GB', appServicesCount: 3, tags: ['Helpdesk', 'Tickets', 'SLA'] },
  complyos:     { desc: 'Compliance tracking, BRELA business search, permits & audit logs', category: 'Compliance', status: 'Live', userCount: 3, dataSize: '12 GB', appServicesCount: 1, tags: ['BRELA', 'Permits', 'Audit'] },
  crm:          { desc: 'Customer relationships, leads & sales pipeline', category: 'Sales', status: 'Live', userCount: 6, dataSize: '18 GB', appServicesCount: 2, tags: ['Pipeline', 'Deals', 'KADABRA'] },
  cloud:        { desc: 'Enterprise document storage & cloud drive', category: 'Storage', status: 'Live', userCount: 18, dataSize: '120 GB', appServicesCount: 4, tags: ['Drive', 'Storage', 'Encrypted'] },
  email:        { desc: 'Team inbox and email workspace', category: 'Communication', status: 'Live', userCount: 10, dataSize: '06 GB', appServicesCount: 1, tags: ['Inbox', 'Mail'] },
  contacts:     { desc: 'Shared customer, vendor and partner contact directory', category: 'Directory', status: 'Live', userCount: 13, dataSize: '03 GB', appServicesCount: 1, tags: ['Directory', 'CRM Sync'] },
  ai:           { desc: 'Automated intelligence, document OCR & predictive analytics', category: 'AI', status: 'Live', userCount: 14, dataSize: '28 GB', appServicesCount: 4, tags: ['AI', 'OCR', 'Copilot'] },
  store:        { desc: 'B2B Procurement & equipment marketplace', category: 'Procurement', status: 'Live', userCount: 4, dataSize: '05 GB', appServicesCount: 2, tags: ['Procurement', 'B2B', 'Suppliers'] },
  oneid:        { desc: 'SSO, identity verification & biometric access control', category: 'Identity', status: 'Live', userCount: 24, dataSize: '02 GB', appServicesCount: 5, tags: ['SSO', 'KYC', 'Biometrics'] },
  tracking:     { desc: 'Fleet, vehicle and driver tracking — GPS positions, geofence alerts & trip history', category: 'Logistics', status: 'Live', userCount: 9, dataSize: '19 GB', appServicesCount: 3, tags: ['GPS', 'Fleet', 'Geofencing'] },
  workspace:    { desc: 'Organization settings and configuration', category: 'Admin', status: 'Live', userCount: 2, dataSize: '50 GB', appServicesCount: 6, tags: ['Settings', 'Security', 'Billing'] },
  calendar:     { desc: 'Scheduling & team calendar', category: 'Productivity', status: 'Live', userCount: 20, dataSize: '01 GB', appServicesCount: 1, tags: ['Scheduling', 'Meetings'] },
  tasks:        { desc: 'To-dos & team task tracking', category: 'Productivity', status: 'Live', userCount: 16, dataSize: '01 GB', appServicesCount: 1, tags: ['To-dos', 'Tracking'] },
  cargotracker: { desc: 'AWB and Bill of Lading shipment tracking', category: 'Logistics', status: 'Live', userCount: 7, dataSize: '15 GB', appServicesCount: 3, tags: ['AWB', 'BL', 'Demurrage'] },
  seal:         { desc: 'Bonded warehouse ledger — customs status, storage clocks & audit-chained movements', category: 'Logistics', status: 'Beta', userCount: 1, dataSize: '0 GB', appServicesCount: 1, tags: ['Bonded', 'Customs', 'Ledger'] },
  inventory:    { desc: 'General multi-warehouse stock control — items, batches, units of measure & reorder alerts', category: 'Logistics', status: 'Beta', userCount: 0, dataSize: '0 GB', appServicesCount: 1, tags: ['Stock', 'Warehousing', 'Inventory'] },
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
    id: 'superadmin', name: 'SuperAdmin', path: '/admin', color: '#0f172a',
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
  const [time, setTime] = useState(new Date());

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
    'hub.welcome': 'Welcome',
    'hub.recentlyViewed': 'Recently Viewed',
    'hub.myWorkspaces': 'My Workspaces',
  };
  const t = (k: string) => tMap[k] ?? k;

  // Clock
  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Weather state (live fetch from Open-Meteo for Dar es Salaam, with fallback)
  const [weather, setWeather] = useState<{ temp: number; desc: string; city: string; humidDesc: string } | null>(null);
  useEffect(() => {
    let cancelled = false;

    async function loadWeather() {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=-6.8235&longitude=39.2695&current=temperature_2m,relative_humidity_2m,weather_code&timezone=Africa%2FDar_es_Salaam'
        );
        if (!res.ok) throw new Error('weather fetch failed');
        const data = await res.json();
        if (cancelled) return;
        const cur = data.current;
        const temp = Math.round(cur?.temperature_2m ?? 26);
        const code = cur?.weather_code ?? 2;
        const humidity = cur?.relative_humidity_2m ?? 75;

        let desc = 'Partly Cloudy';
        if (code === 0) desc = 'Clear sky';
        else if (code === 1 || code === 2) desc = 'Partly Cloudy';
        else if (code === 3) desc = 'Overcast';
        else if (code >= 51 && code <= 67) desc = 'Light Rain';
        else if (code >= 80 && code <= 99) desc = 'Rain Showers';

        const humidDesc = humidity > 70 ? 'humid in Dar es Salaam' : 'comfortable in Dar es Salaam';
        setWeather({ temp, desc, city: 'Dar es Salaam', humidDesc });
      } catch {
        if (cancelled) return;
        setWeather({ temp: 26, desc: 'Overcast', city: 'Dar es Salaam', humidDesc: 'humid in Dar es Salaam' });
      }
    }

    loadWeather();
    return () => { cancelled = true; };
  }, []);

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
  const enabledApps = useEnabledApps();
  const q = (externalSearch ?? '').toLowerCase();

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

  const displayName = (user as { name?: string } | null)?.name ?? 'there';
  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="wh-new-root">
      <div className="wh-page-box">

        {/* ── Welcome Bar ── */}
        <div className="wh-welcome-bar">
          <div className="wh-welcome-left">
            <p className="wh-welcome-greeting">
              {t('hub.welcome')}, <span className="wh-welcome-name">{displayName}</span>.
            </p>
          </div>
          <div className="wh-welcome-right">
            <span className="wh-welcome-time">{timeStr}</span>
            {weather && (
              <>
                <span className="wh-welcome-dot">·</span>
                <span className="wh-welcome-weather">{weather.desc}, {weather.temp}°C</span>
                <span className="wh-welcome-dot">·</span>
                <span className="wh-welcome-weather">{weather.humidDesc}</span>
              </>
            )}
          </div>
        </div>

        {/* ── Main Content Area ── */}
        <div className="wh-new-container">

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
          <section className="wh-new-section wh-new-section--workspaces" style={{ marginTop: 24 }}>
            <div className="wh-workspace-toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h2 className="wh-section-title">{t('hub.myWorkspaces')}</h2>

              <div className="wh-toolbar-actions" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                {/* List / Grid Toggle Buttons */}
                <div className="wh-toggle-group" style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                  <button
                    type="button"
                    className={`wh-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                    onClick={() => handleViewChange('list')}
                    style={{ padding: 'var(--ds-btn-py-sm) 14px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, background: viewMode === 'list' ? 'var(--bg, #f1f5f9)' : 'transparent', border: 'none', cursor: 'pointer' }}
                  >
                    <Icon name="list" size={14} />
                    <span>List View</span>
                  </button>
                  <button
                    type="button"
                    className={`wh-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => handleViewChange('grid')}
                    style={{ padding: 'var(--ds-btn-py-sm) 14px', fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, background: viewMode === 'grid' ? 'var(--bg, #f1f5f9)' : 'transparent', border: 'none', cursor: 'pointer' }}
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

                {/* Settings Link */}
                <Link to="/admin/branding" className="wh-btn wh-btn--ghost wh-btn--sm" style={{ padding: '6px 12px', fontSize: 12, fontWeight: 700, borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
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

                      <div className="wh-grid-card-footer">
                        <div className="wh-grid-stats">
                          <span className="wh-grid-stat"><Icon name="users" size={12} /> {String(app.userCount ?? 5).padStart(2, '0')}</span>
                          <span className="wh-grid-stat"><Icon name="package" size={12} /> {app.dataSize ?? '10 GB'}</span>
                        </div>
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
                      <th>WORKSPACE</th>
                      <th>LINE OF BUSINESS</th>
                      <th className="wh-th-center">USER COUNT</th>
                      <th className="wh-th-center">APP & SERVICES</th>
                      <th style={{ textAlign: 'right' }}>DATA & ASSETS</th>
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
                          <td className="wh-td-center">
                            <span className="wh-stat-cell">
                              <Icon name="users" size={13} style={{ opacity: 0.6 }} />
                              {String(app.userCount ?? 5).padStart(2, '0')}
                            </span>
                          </td>
                          <td className="wh-td-center">
                            <span className="wh-stat-cell">
                              <Icon name="grid" size={13} style={{ opacity: 0.6 }} />
                              {String(app.appServicesCount ?? 2).padStart(2, '0')}
                            </span>
                          </td>
                          <td style={{ textAlign: 'right' }}>
                            <span className="wh-stat-cell">
                              <Icon name="folder" size={13} style={{ opacity: 0.6 }} />
                              {app.dataSize ?? '10 GB'}
                            </span>
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

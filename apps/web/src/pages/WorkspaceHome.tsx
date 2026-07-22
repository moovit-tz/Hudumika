import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth.js';
import { useCompany } from '../data/companyStore.js';
import { Icon } from '../components/Icon.js';
import { useBranding } from '../hooks/useBranding.js';
import { useEnabledApps, isAppEnabled } from '../hooks/useEnabledApps.js';
import { RowLink } from '../components/RowLink.js';
import './WorkspaceHome.css';

// ── App Icon Renderer (using the same high-fidelity SVGs) ──
function AppIcon({ id, color, size = 32, logoUrl }: { id: string; color: string; size?: number; logoUrl?: string }) {
  const customRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    customRef.current?.style.setProperty('--wh-icon-bg', color);
    customRef.current?.style.setProperty('--wh-icon-sz', `${size}px`);
  }, [color, size]);

  if (logoUrl) {
    return (
      <div ref={customRef} className="wh-app-icon-custom">
        <img src={logoUrl} alt={id} className="wh-app-icon-custom-img" />
      </div>
    );
  }
  const icons: Record<string, React.ReactElement> = {
    clearos:  (<g stroke="white" strokeWidth="2.3" fill="none" strokeLinecap="round" strokeLinejoin="round"><circle cx="20" cy="12" r="3"/><path d="M16 10.5L24 10.5"/><line x1="20" y1="15" x2="20" y2="30"/><line x1="12" y1="21" x2="28" y2="21"/><path d="M20 30 C14.5 30 11 27.5 11 24"/><path d="M20 30 C25.5 30 29 27.5 29 24"/></g>),
    finops:   (<g fill="white"><rect x="8" y="25" width="6.5" height="8" rx="2"/><rect x="17" y="18.5" width="6.5" height="14.5" rx="2" opacity="0.8"/><rect x="26" y="11" width="6.5" height="22" rx="2" opacity="0.65"/></g>),
    complyos: (<g><path d="M20 6L31 10L31 20.5C31 27 26.5 32 20 34C13.5 32 9 27 9 20.5L9 10Z" fill="white" opacity="0.92"/><path d="M14 21L17.5 25L26 16" stroke={color} strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>),
    bliss:    (<g><path d="M15,16H33Q37,16 37,20V31Q37,35 33,35H27L31,39L29,35H15Q11,35 11,31V20Q11,16 15,16Z" fill="none" stroke="white" strokeWidth="2.2" strokeLinejoin="round" opacity="0.4"/><path d="M7,3H25Q29,3 29,7V20Q29,24 25,24H13L8,31L12,24H7Q3,24 3,20V7Q3,3 7,3Z" fill="white"/><line x1="10" y1="11" x2="24" y2="11" stroke={color} strokeWidth="2" strokeLinecap="round"/><line x1="10" y1="16" x2="20" y2="16" stroke={color} strokeWidth="2" strokeLinecap="round"/></g>),
    onepi:    (<g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6L32 13L32 27L20 34L8 27L8 13Z" opacity="0.25" fill="white"/><circle cx="20" cy="12" r="2" fill="white"/><circle cx="14" cy="22" r="2" fill="white"/><circle cx="26" cy="22" r="2" fill="white"/><line x1="20" y1="12" x2="14" y2="22"/><line x1="20" y1="12" x2="26" y2="22"/><line x1="14" y1="22" x2="26" y2="22"/><circle cx="20" cy="19" r="3.5" fill="white"/></g>),
    cloud:    (<g><path d="M27.5 18C27 13.5 23.2 10 18.8 10C15.5 10 12.5 12 11 15C8 15.7 5.5 18.2 5.5 21.5C5.5 24.8 8.2 27.5 11.5 27.5L28.5 27.5C31.5 27.5 34 25 34 22C34 19.2 31.8 17 28.5 16.7Z" fill="white" opacity="0.9"/><g stroke="white" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="20" y1="23.5" x2="20" y2="34"/><path d="M15.5 29L20 34L24.5 29"/></g></g>),
    oneid:    (<g><circle cx="20" cy="12" r="5.5" fill="white"/><path d="M7 38C7 26.5 12.5 21 20 21C27.5 21 33 26.5 33 38Z" fill="white"/><path d="M14 38C14 30.5 16.5 27.5 20 27.5C23.5 27.5 26 30.5 26 38Z" fill={color}/></g>),
    ai:       (<g fill="white"><path d="M20 5L22.2 16L33 18.5L22.2 21L20 32L17.8 21L7 18.5L17.8 16Z"/><path d="M31 6L31.9 9L35 9.8L31.9 10.6L31 13.5L30.1 10.6L27 9.8L30.1 9Z" opacity="0.5"/><circle cx="8.5" cy="30" r="2" opacity="0.4"/></g>),
    workspace:(<g fill="white"><rect x="7.5" y="7.5" width="7.5" height="7.5" rx="2"/><rect x="16.5" y="7.5" width="7.5" height="7.5" rx="2"/><rect x="25" y="7.5" width="7.5" height="7.5" rx="2" opacity="0.55"/><rect x="7.5" y="16.5" width="7.5" height="7.5" rx="2"/><rect x="16.5" y="16.5" width="7.5" height="7.5" rx="2" opacity="0.8"/><rect x="25" y="16.5" width="7.5" height="7.5" rx="2" opacity="0.5"/><rect x="7.5" y="25" width="7.5" height="7.5" rx="2" opacity="0.65"/><rect x="16.5" y="25" width="7.5" height="7.5" rx="2" opacity="0.45"/><rect x="25" y="25" width="7.5" height="7.5" rx="2" opacity="0.3"/></g>),
    admin:    (<g><path d="M20 5L31 9V20.5C31 27 26 31.5 20 34C14 31.5 9 27 9 20.5V9Z" fill="white" opacity="0.9"/><path d="M20 12.5L21.8 18H27.5L23 21.5L24.8 27L20 23.5L15.2 27L17 21.5L12.5 18H18.2Z" fill={color}/></g>),
    email:    (<g><rect x="6" y="11" width="28" height="20" rx="3" fill="white" opacity="0.95"/><path d="M6 14L20 23L34 14" stroke={color} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round"/></g>),
    crm:      (<g fill="white"><circle cx="20" cy="11" r="4.5"/><path d="M10.5 33C10.5 26.5 14.7 22.5 20 22.5C25.3 22.5 29.5 26.5 29.5 33Z"/><circle cx="10" cy="17" r="3" opacity="0.6"/><path d="M4 31C4 26.5 6.7 23.5 10 23.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/><circle cx="30" cy="17" r="3" opacity="0.6"/><path d="M36 31C36 26.5 33.3 23.5 30 23.5" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/></g>),
    contacts: (<g fill="white"><circle cx="20" cy="12" r="5"/><path d="M10 28C10 22.5 14.5 19 20 19C25.5 19 30 22.5 30 28Z"/><circle cx="10" cy="18" r="3" opacity="0.6"/><path d="M4 27C4 23.5 6.5 21 10 21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/><circle cx="30" cy="18" r="3" opacity="0.6"/><path d="M36 27C36 23.5 33.5 21 30 21" stroke="white" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6"/></g>),
    store:    (<g fill="white"><rect x="6" y="6" width="12" height="12" rx="2.5"/><rect x="22" y="6" width="12" height="12" rx="2.5"/><rect x="6" y="22" width="12" height="12" rx="2.5"/><rect x="22" y="22" width="12" height="12" rx="2.5" opacity="0.45"/><line x1="28" y1="25" x2="28" y2="31" stroke={color} strokeWidth="2.5" strokeLinecap="round"/><line x1="25" y1="28" x2="31" y2="28" stroke={color} strokeWidth="2.5" strokeLinecap="round"/></g>),
  };
  return (
    <svg viewBox="0 0 40 40" width={size} height={size} style={{ borderRadius: 6, display: 'block', flexShrink: 0 }}>
      <rect width={40} height={40} rx={6} fill={color} />
      {icons[id] ?? <rect x="10" y="10" width="20" height="20" rx="4" fill="white" opacity="0.7"/>}
    </svg>
  );
}

function UserAvatar({ bg, initials, name }: { bg: string; initials: string; name: string }) {
  const ref = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => { ref.current?.style.setProperty('--avatar-bg', bg); }, [bg]);
  return <div ref={ref} className="wh-user-avatar" title={name}>{initials}</div>;
}

interface HudumikaApp {
  id: string;
  name: string;
  desc: string;
  color: string;
  path: string;
  category: string;
  tags: string[];
  userCount: string;
  appCount: string;
  dataCount: string;
  users: { name: string; initials: string; bg: string }[];
  superAdminOnly?: boolean;
}

const ALL_APPS: HudumikaApp[] = [
  { id: 'clearos',   name: 'ClearOS',        desc: 'Customs & Freight clearance platform',   color: '#ea580c', path: '/clearos',   category: 'Logistics',      tags: ['Live', 'TANCIS'],    userCount: '12', appCount: '04', dataCount: '33',  users: [{ name: 'Super Admin', initials: 'SA', bg: '#f1f3f4' }, { name: 'Msomi Admin', initials: 'MA', bg: '#e8f0fe' }] },
  { id: 'finops',    name: 'FinOps',          desc: 'Financial accounts and payroll ledger',   color: '#0284c7', path: '/finance',   category: 'Finance',        tags: ['Live', 'Ledger'],    userCount: '05', appCount: '03', dataCount: '45',  users: [{ name: 'Devota Mushi', initials: 'DM', bg: '#fff4e6' }, { name: 'Super Admin', initials: 'SA', bg: '#f1f3f4' }] },
  { id: 'onepi',     name: 'NexusHR',         desc: 'People operations and shift rosters',     color: '#0d9488', path: '/onepi',     category: 'HR',             tags: ['Live', 'Payroll'],   userCount: '15', appCount: '02', dataCount: '08',  users: [{ name: 'Jane Mwangi', initials: 'JM', bg: '#e6fcf5' }, { name: 'Devota Mushi', initials: 'DM', bg: '#fff4e6' }] },
  { id: 'bliss',     name: 'Bliss',           desc: 'Support ticketing and client helpdesk',   color: '#7c3aed', path: '/bliss',     category: 'Support',        tags: ['Live', 'Helpdesk'],  userCount: '08', appCount: '03', dataCount: '24',  users: [{ name: 'Fredrick Msemwa', initials: 'FM', bg: '#f3f0ff' }, { name: 'Msomi Admin', initials: 'MA', bg: '#e8f0fe' }] },
  { id: 'complyos',  name: 'ComplyOS',        desc: 'Compliance tracking and audit logs',       color: '#059669', path: '/complyos',  category: 'Compliance',     tags: ['Live', 'Audit'],     userCount: '03', appCount: '01', dataCount: '12',  users: [{ name: 'Super Admin', initials: 'SA', bg: '#f1f3f4' }] },
  { id: 'crm',       name: 'CRM',             desc: 'Customer relationships and sales deals',  color: '#16a34a', path: '/crm',       category: 'Sales',          tags: ['Live', 'Pipeline'],  userCount: '06', appCount: '02', dataCount: '18',  users: [{ name: 'Jane Mwangi', initials: 'JM', bg: '#e6fcf5' }] },
  { id: 'cloud',     name: 'Cloud',           desc: 'Secure digital document management',      color: '#0369a1', path: '/cloud',     category: 'Storage',        tags: ['Live', 'Secure'],    userCount: '20', appCount: '01', dataCount: '142', users: [{ name: 'Msomi Admin', initials: 'MA', bg: '#e8f0fe' }, { name: 'Fredrick Msemwa', initials: 'FM', bg: '#f3f0ff' }] },
  { id: 'email',     name: 'Email',           desc: 'Internal corporate messaging center',     color: '#0078d4', path: '/email',     category: 'Communication',  tags: ['Live', 'Inbox'],     userCount: '25', appCount: '02', dataCount: '340', users: [{ name: 'Super Admin', initials: 'SA', bg: '#f1f3f4' }, { name: 'Jane Mwangi', initials: 'JM', bg: '#e6fcf5' }] },
  { id: 'contacts',  name: 'Contacts',        desc: 'Stakeholder and client phone book',       color: '#1a73e8', path: '/contacts',  category: 'Contacts',       tags: ['Live', 'Sync'],      userCount: '10', appCount: '01', dataCount: '95',  users: [{ name: 'Msomi Admin', initials: 'MA', bg: '#e8f0fe' }] },
  { id: 'ai',        name: 'AI',              desc: 'ClearOS copilot and analytics bot',       color: '#6d28d9', path: '/ai',        category: 'Intelligence',   tags: ['Beta', 'Copilot'],   userCount: '30', appCount: '02', dataCount: '04',  users: [{ name: 'Super Admin', initials: 'SA', bg: '#f1f3f4' }] },
  { id: 'store',     name: 'Store',           desc: 'Plugin store and integrations hub',       color: '#8b5cf6', path: '/store',     category: 'Marketplace',    tags: ['Live', 'Plugins'],   userCount: '02', appCount: '01', dataCount: '15',  users: [{ name: 'Msomi Admin', initials: 'MA', bg: '#e8f0fe' }] },
  { id: 'workspace', name: 'Admin',           desc: 'Organization settings and configuration', color: '#64748b', path: '/workspace', category: 'Management',     tags: ['Live', 'System'],    userCount: '04', appCount: '01', dataCount: '02',  users: [{ name: 'Super Admin', initials: 'SA', bg: '#f1f3f4' }] },
  { id: 'admin',     name: 'Platform Admin',  desc: 'Multi-tenant platform control console',   color: '#dc2626', path: '/admin',     category: 'Management',     tags: ['Live', 'SuperAdmin'], userCount: '01', appCount: '01', dataCount: '08', users: [{ name: 'Super Admin', initials: 'SA', bg: '#fee2e2' }], superAdminOnly: true },
];

export default function WorkspaceHome({ externalSearch }: { externalSearch?: string } = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const co = useCompany();
  const branding = useBranding();
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
  const [filterOpen, setFilterOpen] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  // Live clock
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // Weather + city via geolocation (Open-Meteo, no API key)
  interface WeatherInfo { desc: string; temp: number; humidDesc: string; city: string }
  const [weather, setWeather] = useState<WeatherInfo | null>(null);
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(async pos => {
      try {
        const { latitude: lat, longitude: lon } = pos.coords;
        const [meteo, geo] = await Promise.all([
          fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weathercode,relativehumidity_2m&timezone=auto`).then(r => r.json()),
          fetch(`https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json`, { headers: { 'Accept-Language': 'en' } }).then(r => r.json()),
        ]);
        const code: number = meteo.current.weathercode;
        const temp: number = Math.round(meteo.current.temperature_2m);
        const humidity: number = meteo.current.relativehumidity_2m;
        const WMO: Record<string, string> = {
          '0':'Clear sky','1':'Mainly clear','2':'Partly cloudy','3':'Overcast',
          '45':'Foggy','48':'Icy fog','51':'Light drizzle','53':'Drizzle','55':'Heavy drizzle',
          '61':'Light rain','63':'Rain','65':'Heavy rain','71':'Light snow','73':'Snow',
          '80':'Rain showers','81':'Showers','82':'Heavy showers','95':'Thunderstorm',
        };
        const desc = WMO[String(code)] ?? 'Cloudy';
        const humidDesc = humidity > 75 ? 'very humid' : humidity > 60 ? 'humid' : humidity > 35 ? 'comfortable' : 'dry';
        const city = geo?.address?.city ?? geo?.address?.town ?? geo?.address?.village ?? '';
        setWeather({ desc, temp, humidDesc, city });
      } catch { /* ignore */ }
    }, () => { /* denied */ });
  }, []);

  // ── Starred / Favourites (persisted in localStorage) ──
  const [starredIds, setStarredIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hudumika_starred_apps');
      return saved ? JSON.parse(saved) : ['clearos', 'finops', 'onepi', 'bliss'];
    } catch {
      return ['clearos', 'finops', 'onepi', 'bliss'];
    }
  });

  useEffect(() => {
    localStorage.setItem('hudumika_starred_apps', JSON.stringify(starredIds));
  }, [starredIds]);

  // ── Recently Viewed (persisted in localStorage) ──
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('hudumika_recently_viewed');
      return saved ? JSON.parse(saved) : ['clearos', 'finops', 'onepi', 'bliss'];
    } catch {
      return ['clearos', 'finops', 'onepi', 'bliss'];
    }
  });

  const handleAppClick = (app: HudumikaApp) => {
    // Add to recently viewed (move to front, limit to 5)
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

  // Filtered apps based on search query and category
  const isSuperAdmin = (user as { role?: string } | null)?.role === 'SUPER_ADMIN';
  const enabledApps = useEnabledApps();
  const q = (externalSearch ?? '').toLowerCase();
  const filteredApps = ALL_APPS.filter(app => {
    if (app.superAdminOnly && !isSuperAdmin) return false;
    if (!isSuperAdmin && !isAppEnabled(app.id, enabledApps)) return false;
    const matchesSearch = !q ||
      app.name.toLowerCase().includes(q) || branding.getAppName(app.id, app.name).toLowerCase().includes(q) ||
      app.desc.toLowerCase().includes(q) || branding.getAppSlogan(app.id, app.desc).toLowerCase().includes(q) ||
      app.category.toLowerCase().includes(q);
    const matchesCategory = selectedCategory ? app.category === selectedCategory : true;
    return matchesSearch && matchesCategory;
  });

  const recentlyViewedApps = recentIds
    .map(id => ALL_APPS.find(a => a.id === id))
    .filter((a): a is HudumikaApp => !!a)
    .filter(a => isSuperAdmin || isAppEnabled(a.id, enabledApps));

  const categories = Array.from(new Set(ALL_APPS.map(a => a.category)));

  const displayName = (user as { name?: string } | null)?.name ?? 'there';
  const timeStr = time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  return (
    <div className="wh-new-root">
      <div className="wh-page-box">

        {/* ── Welcome Bar ── */}
        <div className="wh-welcome-bar">
          <div className="wh-welcome-left">
            <p className="wh-welcome-greeting">
              Welcome, <span className="wh-welcome-name">{displayName}</span>.
            </p>
          </div>
          <div className="wh-welcome-right">
            <span className="wh-welcome-time">{timeStr}</span>
            {weather && (
              <>
                <span className="wh-welcome-dot">·</span>
                <span className="wh-welcome-weather">{weather.desc}, {weather.temp}°C</span>
                <span className="wh-welcome-dot">·</span>
                <span className="wh-welcome-weather">{weather.humidDesc}{weather.city ? ` in ${weather.city}` : ''}</span>
              </>
            )}
          </div>
        </div>

        {/* ── Main Content Area ── */}
        <div className="wh-new-container">

          {/* ── Section: Recently Viewed ── */}
          {recentlyViewedApps.length > 0 && (
            <section className="wh-new-section">
              <div className="wh-section-header">
                <h2 className="wh-section-title">Recently Viewed</h2>
              </div>
              <div className="wh-cards-row">
                {recentlyViewedApps.map(app => (
                  <Link key={app.id} to={app.path} className="wh-horizontal-card" onClick={() => handleAppClick(app)} style={{ '--card-color': app.color } as React.CSSProperties}>
                    <div className="wh-card-logo-wrap">
                      <AppIcon id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={32} />
                    </div>
                    <div className="wh-card-content">
                      <div className="wh-card-title">{branding.getAppName(app.id, app.name)}</div>
                      <div className="wh-card-sub">{app.category}</div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* ── Section: My Workspaces ── */}
          <section className="wh-new-section wh-new-section--workspaces">
            <div className="wh-workspace-toolbar">
              <h2 className="wh-section-title">My Workspaces</h2>

              <div className="wh-toolbar-actions">
                {/* List / Grid toggle */}
                <div className="wh-toggle-group">
                  <button
                    type="button"
                    onClick={() => setViewMode('list')}
                    className={`wh-toggle-btn${viewMode === 'list' ? ' active' : ''}`}
                    title="List View"
                  >
                    <Icon name="menu" size={14} />
                    <span>List View</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('grid')}
                    className={`wh-toggle-btn${viewMode === 'grid' ? ' active' : ''}`}
                    title="Grid View"
                  >
                    <Icon name="grid" size={14} />
                    <span>Grid View</span>
                  </button>
                </div>

                {/* Filter */}
                <div className="wh-filter-wrap">
                  <button
                    type="button"
                    onClick={() => setFilterOpen(!filterOpen)}
                    className={`wh-toolbar-btn${selectedCategory ? ' active' : ''}`}
                  >
                    <Icon name="filter" size={14} />
                    <span>Filter{selectedCategory ? `: ${selectedCategory}` : ''}</span>
                  </button>
                  {filterOpen && (
                    <div className="wh-filter-dropdown">
                      <div className="wh-filter-header">Filter by Category</div>
                      <button type="button" onClick={() => { setSelectedCategory(null); setFilterOpen(false); }} className="wh-filter-item">All Departments</button>
                      {categories.map(cat => (
                        <button type="button" key={cat} onClick={() => { setSelectedCategory(cat); setFilterOpen(false); }} className="wh-filter-item">{cat}</button>
                      ))}
                    </div>
                  )}
                </div>

                {/* Settings shortcut */}
                <Link
                  to="/settings"
                  className="wh-settings-btn"
                >
                  <Icon name="settings" size={14} />
                  <span>SETTINGS</span>
                </Link>
              </div>
            </div>

            {/* ── LIST VIEW ── */}
            {viewMode === 'list' && (
              <div className="wh-table-container">
                <table className="wh-table">
                  <thead>
                    <tr>
                      <th className="wh-th-star"><span className="wh-sr-only">Starred</span></th>
                      <th>WORKSPACE</th>
                      <th>USERS</th>
                      <th>CLIENTS</th>
                      <th>LINE OF BUSINESS</th>
                      <th>TAGS</th>
                      <th className="wh-th-center">USER COUNT</th>
                      <th className="wh-th-center">APP & SERVICES</th>
                      <th className="wh-th-center">DATA & ASSETS</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredApps.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="wh-empty-cell">
                          No workspaces found matching your search.
                        </td>
                      </tr>
                    ) : filteredApps.map(app => {
                      const isStarred = starredIds.includes(app.id);
                      return (
                        <tr key={app.id} onClick={() => { handleAppClick(app); navigate(app.path); }}>
                          <td className="wh-star-td" data-starred={isStarred} onClick={e => toggleStar(app.id, e)}>
                            {isStarred ? '★' : '☆'}
                          </td>
                          <td>
                            <Link to={app.path} onClick={e => e.stopPropagation()} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>
                              <div className="wh-td-workspace-name">{branding.getAppName(app.id, app.name)}</div>
                              <div className="wh-td-workspace-sub">{branding.getAppSlogan(app.id, app.desc)}</div>
                            </Link>
                          </td>
                          <td>
                            <div className="wh-user-stack">
                              {app.users.map((u, idx) => (
                                <UserAvatar key={idx} bg={u.bg} initials={u.initials} name={u.name} />
                              ))}
                            </div>
                          </td>
                          <td>
                            <div className="wh-td-client-row">
                              <AppIcon id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={24} />
                              <span className="wh-td-client-name">{co.name}</span>
                            </div>
                          </td>
                          <td><span className="wh-badge-lob">{app.category}</span></td>
                          <td>
                            <div className="wh-tags-row">
                              {app.tags.map((t, idx) => (
                                <span key={idx} className={`wh-badge-tag tag-${t.toLowerCase().replace(' ', '-')}`}>{t}</span>
                              ))}
                            </div>
                          </td>
                          <td className="wh-td-center">
                            <div className="wh-stat-cell"><Icon name="users" size={13} /><span>{app.userCount}</span></div>
                          </td>
                          <td className="wh-td-center">
                            <div className="wh-stat-cell"><Icon name="grid" size={13} /><span>{app.appCount}</span></div>
                          </td>
                          <td className="wh-td-center">
                            <div className="wh-stat-cell"><Icon name="folder" size={13} /><span>{app.dataCount}</span></div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* ── GRID VIEW ── */}
            {viewMode === 'grid' && (
              <div className="wh-grid-container">
                {filteredApps.length === 0 ? (
                  <div className="wh-empty-grid">No workspaces found matching your search.</div>
                ) : filteredApps.map(app => {
                  const isStarred = starredIds.includes(app.id);
                  return (
                    <div key={app.id} className="wh-grid-card" style={{ '--card-color': app.color } as React.CSSProperties}>
                      <RowLink to={app.path} label={`Open ${app.name}`} onClick={() => handleAppClick(app)} />
                      <div className="wh-grid-card-header">
                        <div className="wh-grid-card-client">
                          <AppIcon id={app.id} color={branding.getAppColor(app.id, app.color)} logoUrl={branding.getAppLogo(app.id)} size={32} />
                          <div>
                            <div className="wh-grid-client-title">{app.name}</div>
                            <div className="wh-grid-client-lob">{app.category}</div>
                          </div>
                        </div>
                        <button type="button" className="wh-star-btn" data-starred={isStarred} style={{ position: 'relative', zIndex: 1 }} onClick={e => toggleStar(app.id, e)}>
                          {isStarred ? '★' : '☆'}
                        </button>
                      </div>
                      <div className="wh-grid-card-body">
                        <div className="wh-grid-workspace-name">{branding.getAppName(app.id, app.name)}</div>
                        <div className="wh-grid-workspace-sub">{branding.getAppSlogan(app.id, app.desc)}</div>
                      </div>
                      <div className="wh-grid-card-footer">
                        <div className="wh-user-stack">
                          {app.users.map((u, idx) => (
                            <UserAvatar key={idx} bg={u.bg} initials={u.initials} name={u.name} />
                          ))}
                        </div>
                        <div className="wh-grid-stats">
                          <div className="wh-grid-stat"><Icon name="users" size={12} /><span>{app.userCount}</span></div>
                          <div className="wh-grid-stat"><Icon name="grid" size={12} /><span>{app.appCount}</span></div>
                          <div className="wh-grid-stat"><Icon name="folder" size={12} /><span>{app.dataCount}</span></div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

        </div>
      </div>
    </div>
  );
}

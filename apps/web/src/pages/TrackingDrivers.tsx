import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { AreaChart, Area, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import './TrackingDrivers.css';
import { PageHeader } from '../components/PageHeader.js';

// Interfaces for new data structures
interface DriverMetrics {
  tracking_id: string | null; transit_status: string; transit_progress_pct: number;
  origin: string | null; destination: string | null; eta: string | null;
  deliveries_week: { day: string; value: number }[];
  total_completed: number;
  on_time_rate: number; on_time_deliveries: number;
  total_delays: number; delays: { name: string; value: number; color: string }[];
}

interface DriverDetailed {
  id: string; custom_id: string; name: string; email: string; phone: string | null;
  status: string; avatar_url: string | null;
  vehicle_name: string | null; vehicle_plate: string | null; vehicle_type: string | null; vehicle_color: string | null;
}

export const TrackingDrivers: React.FC = () => {
  const [drivers, setDrivers] = useState<DriverDetailed[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  // Sidebar only ever opens from an explicit click — no auto-selecting the
  // first driver on load.
  const [selectedDriver, setSelectedDriver] = useState<DriverDetailed | null>(null);
  const [metrics, setMetrics] = useState<DriverMetrics | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    apiFetch('/v1/tracking/drivers').then(setDrivers).catch(console.error).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (selectedDriver) {
      setMetrics(null);
      apiFetch(`/v1/tracking/drivers/${selectedDriver.id}/metrics`)
        .then(setMetrics).catch(console.error);
    }
  }, [selectedDriver]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      if (filter !== 'All' && d.status !== filter) return false;
      if (search && !d.name.toLowerCase().includes(search.toLowerCase()) && !d.custom_id.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [drivers, filter, search]);

  const stats = useMemo(() => ({
    all: drivers.length,
    available: drivers.filter(d => d.status === 'Available').length,
    onRoute: drivers.filter(d => d.status === 'On Route').length,
    offDuty: drivers.filter(d => d.status === 'Off Duty').length,
  }), [drivers]);

  return (
    /* The header sits above .drv-layout, not inside it. .drv-layout is a flex
       row — list on the left, driver detail on the right — so a PageHeader
       placed in it became a third column, and the page read as the title in
       one column beside its own content. */
    <>
      <PageHeader
        crumbs={['HuduFreight', 'Drivers']}
        titlePlain="Fleet"
        titleEm="drivers"
        subtitle="Everyone licensed to drive, their assignments and their record."
        actions={
          <Link to="/tracking/drivers/new" className="drv-add-btn">
            <Icon name="plus" size={16} /> Add New Driver
          </Link>
        }
      />
    <div className="drv-layout">
      {/* ── Main Area ── */}
      <div className="drv-main">
        <div className="drv-filters-row">
          <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)} variant="segmented">
            <TabsList>
              <TabsTrigger value="All">All <span className="drv-tab-count">({stats.all})</span></TabsTrigger>
              <TabsTrigger value="Available">Available <span className="drv-tab-count">({stats.available})</span></TabsTrigger>
              <TabsTrigger value="On Route">On Route <span className="drv-tab-count">({stats.onRoute})</span></TabsTrigger>
              <TabsTrigger value="Off Duty">Off Duty <span className="drv-tab-count">({stats.offDuty})</span></TabsTrigger>
            </TabsList>
          </Tabs>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            <div className="drv-search-bar">
              <Icon name="search" size={16} color="var(--ink3)" />
              <input placeholder="Search driver" value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            <div className="drv-view-toggle">
              <button
                type="button" title="Grid view"
                className={`drv-view-btn${view === 'grid' ? ' active' : ''}`}
                onClick={() => setView('grid')}
              >
                <Icon name="grid" size={15} />
              </button>
              <button
                type="button" title="List view"
                className={`drv-view-btn${view === 'list' ? ' active' : ''}`}
                onClick={() => setView('list')}
              >
                <Icon name="list" size={15} />
              </button>
            </div>
            <div className="drv-filter-btn">
              <Icon name="sliders" size={16} />
            </div>
          </div>
        </div>

        {loading ? (
          <SectionLoading />
        ) : filteredDrivers.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--ink3)' }}>No drivers match this filter.</div>
        ) : view === 'grid' ? (
          <div className="drv-grid">
            {filteredDrivers.map(d => (
              <div key={d.id} className={`drv-card ${selectedDriver?.id === d.id ? 'selected' : ''}`} onClick={() => setSelectedDriver(d)}
                role="button" tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDriver(d); } }}>
                <div className="drv-card-top">
                  <PersonAvatar userId={d.id} kind="drivers" name={d.name} size={44} style={{ marginBottom: 8, border: '2px solid var(--white)', boxShadow: 'var(--elev)' }} />
                  <div className="drv-name">{d.name}</div>
                  <div className="drv-badge-row">
                    <span className="drv-id">{d.custom_id}</span>
                    <span className={`drv-status ${d.status?.toLowerCase().replace(' ', '-') || 'available'}`}>{d.status || 'Available'}</span>
                  </div>
                </div>
                <div className="drv-card-body">
                  <div className="drv-info-row">
                    <div className="drv-info-label"><Icon name="phone" size={12} /> Phone</div>
                    <div className="drv-info-value">{d.phone || 'N/A'}</div>
                  </div>
                  <div className="drv-vehicle-block">
                    {d.vehicle_name ? (
                      <>
                        <div className="drv-vehicle-icon red"><Icon name="truck" size={14} /></div>
                        <div className="drv-vehicle-details">
                          <div className="drv-vehicle-name">{d.vehicle_name}</div>
                          <div className="drv-vehicle-plate">{d.vehicle_plate}</div>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="drv-vehicle-icon gray"><Icon name="truck" size={14} /></div>
                        <div className="drv-vehicle-details">
                          <div className="drv-vehicle-name" style={{ color: 'var(--ink3)' }}>Unassigned</div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rtbl-wrap">
            <table className="rtbl drv-list-table">
              <thead>
                <tr>
                  <th>Driver</th>
                  <th>ID</th>
                  <th>Status</th>
                  <th className="col-hide-sm">Phone</th>
                  <th className="col-hide-sm">Email</th>
                  <th className="col-hide-md">Vehicle</th>
                </tr>
              </thead>
              <tbody>
                {filteredDrivers.map(d => (
                  <tr key={d.id} className={selectedDriver?.id === d.id ? 'drv-list-row--selected' : ''} onClick={() => setSelectedDriver(d)} style={{ cursor: 'pointer' }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PersonAvatar userId={d.id} kind="drivers" name={d.name} size={30} />
                        <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{d.name}</span>
                      </div>
                    </td>
                    <td style={{ fontFamily: 'var(--mono)', color: 'var(--ink3)' }}>{d.custom_id}</td>
                    <td><span className={`drv-status ${d.status?.toLowerCase().replace(' ', '-') || 'available'}`}>{d.status || 'Available'}</span></td>
                    <td className="col-hide-sm">{d.phone || 'N/A'}</td>
                    <td className="col-hide-sm">{d.email || 'N/A'}</td>
                    <td className="col-hide-md">{d.vehicle_name ? `${d.vehicle_name} (${d.vehicle_plate})` : 'Unassigned'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Right Sidebar Details ── */}
      {selectedDriver && metrics && (
        <div className="drv-sidebar">
          <div className="drv-sb-header">
            <div className="drv-sb-title">Driver Details</div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Link to={`/tracking/drivers/${selectedDriver.id}`} style={{ fontSize: 12, fontWeight: 700, color: 'var(--teal)', textDecoration: 'none', background: 'var(--teal-l)', padding: '6px 12px', borderRadius: 'var(--r-sm)' }}>
                View Full Profile
              </Link>
              <Icon name="x" size={20} className="drv-sb-close" onClick={() => setSelectedDriver(null)} />
            </div>
          </div>

          {/* Tracking Card */}
          <div className="drv-tracking-card">
            <div className="drv-trk-header">
              <div className="drv-trk-id">
                <div className="drv-trk-icon"><Icon name="package" size={16} /></div>
                {metrics.tracking_id ?? 'No trip assigned'}
              </div>
              <div className="drv-trk-status-col">
                <div className="drv-trk-status">{metrics.transit_status}</div>
                {metrics.tracking_id && <div className="drv-trk-progress-text">Progress: {metrics.transit_progress_pct}%</div>}
              </div>
            </div>
            {metrics.tracking_id && (
              <>
                <div className="drv-trk-bar-bg">
                  <div className="drv-trk-bar-fill" style={{ width: `${metrics.transit_progress_pct}%` }}></div>
                </div>
                <div className="drv-trk-route">
                  <div className="drv-trk-col">
                    <div className="drv-trk-label">Origin</div>
                    <div className="drv-trk-val">{metrics.origin ?? '—'}</div>
                  </div>
                  <div className="drv-trk-col" style={{ textAlign: 'right' }}>
                    <div className="drv-trk-label">Destination</div>
                    <div className="drv-trk-val">{metrics.destination ?? '—'}</div>
                    <div className="drv-trk-time">{metrics.eta ? `${metrics.eta} (ETA)` : ''}</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* Shipment Statistic */}
          <div className="drv-sb-section">
            <div className="drv-sb-sec-header">
              <div className="drv-sb-sec-title">Shipment Statistic</div>
              <div style={{ background: 'var(--bg)', padding: '4px 8px', borderRadius: 6, fontSize: 11, fontWeight: 600 }}>This Week <Icon name="chevronDown" size={10} /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
              <div className="drv-chart-val">{metrics.total_completed}</div>
              <div className="drv-chart-label">Completed Deliveries</div>
            </div>
            <div style={{ height: 120, width: '100%' }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={metrics.deliveries_week} margin={{ top: 10, right: 0, left: -25, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8' }} />
                  <Area type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorVal)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Performance Metrics */}
          <div className="drv-sb-section">
            <div className="drv-sb-sec-header">
              <div className="drv-sb-sec-title">Performance Metrics</div>
              <Icon name="moreHorizontal" size={16} color="var(--ink3)" />
            </div>
            <div className="drv-perf-header">
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)' }}>On-Time Delivery Rate</div>
            </div>
            <div className="drv-perf-bar-bg">
              <div className="drv-perf-bar-fill" style={{ width: `${metrics.on_time_rate}%` }}></div>
            </div>
            <div className="drv-perf-footer">
              <div className="drv-perf-footer-left">{metrics.on_time_deliveries} <span>/ {metrics.total_completed} Deliveries</span></div>
              <div className="drv-perf-footer-right">{metrics.on_time_rate}%</div>
            </div>
          </div>

          {/* Delay Reasons */}
          <div className="drv-sb-section">
            <div className="drv-sb-sec-header">
              <div className="drv-sb-sec-title">Delay Reasons Breakdown</div>
              <Icon name="moreHorizontal" size={16} color="var(--ink3)" />
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 16 }}>
              <div className="drv-chart-val">{metrics.total_delays}</div>
              <div className="drv-chart-label">Delay Cases</div>
            </div>
            {metrics.total_delays === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center', color: 'var(--ink3)', fontSize: 12.5 }}>No delayed trips.</div>
            ) : (
            <div style={{ height: 160, display: 'flex', justifyContent: 'center', position: 'relative' }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={metrics.delays} innerRadius={40} outerRadius={70} paddingAngle={2} dataKey="value" stroke="none">
                    {metrics.delays.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(20px, -30px)', background: 'rgba(220,38,38,0.12)', color: 'var(--red)', fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4 }}>
                {metrics.total_delays} Delays
              </div>
            </div>
            )}
            <div className="drv-legend-grid">
              {metrics.delays.map((d, i) => (
                <div key={i} className="drv-legend-item">
                  <div className="drv-legend-top">
                    <div className="drv-legend-dot" style={{ background: d.color }}></div>
                    {d.name}
                  </div>
                  <div className="drv-legend-sub">{metrics.total_delays > 0 ? ((d.value / metrics.total_delays) * 100).toFixed(0) : 0}% | {d.value} delays</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </div>
    </>
  );
};

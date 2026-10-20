import { Banner } from '../components/ui/alert.js';
﻿import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { apiFetch } from '../lib/api.js';
import { Icon } from '../components/Icon.js';
import { PersonAvatar } from '../components/PersonAvatar.js';
import { Tabs, TabsList, TabsTrigger } from '../components/ui/tabs.js';
import { SectionLoading } from '../components/ui/spinner.js';
import { MetricsRow, MetricCardProps } from '../components/MetricCard.js';
import { BarChart, Bar, AreaChart, Area, XAxis, Tooltip as RechartsTooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { DriverChatPanel } from '../components/DriverChatPanel.js';
import './TrackingDrivers.css';
import { PageHeader } from '../components/PageHeader.js';
import { Button } from '../components/ui/button.js';
import { SearchToolbar } from '../components/ui/filter-dropdown.js';
import { Tip } from '../components/ui/tooltip.js';

interface DriverMetrics {
  tracking_id: string | null; transit_status: string; transit_progress_pct: number | null;
  origin: string | null; destination: string | null; eta: string | null;
  deliveries_week: { day: string; value: number }[];
  total_completed: number;
  on_time_rate: number | null; on_time_deliveries: number;
  total_delays: number; delays: { name: string; value: number; color: string }[];
}

interface DriverDetailed {
  id: string; custom_id: string; name: string; email: string; phone: string | null;
  status: string; avatar_url: string | null;
  vehicle_name: string | null; vehicle_plate: string | null; vehicle_type: string | null; vehicle_color: string | null;
  license_number?: string | null;
}

export const TrackingDrivers: React.FC = () => {
  const [pageError, setPageError] = useState('');
  const reportError = (e: unknown) => setPageError(e instanceof Error ? e.message : 'Unable to load records.');
  const navigate = useNavigate();
  const [drivers, setDrivers] = useState<DriverDetailed[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');

  const [selectedDriver, setSelectedDriver] = useState<DriverDetailed | null>(null);
  const [metrics, setMetrics] = useState<DriverMetrics | null>(null);

  const [driverStats, setDriverStats] = useState<any>(null);
  const fetchStats = useCallback(async () => {
    try { setDriverStats(await apiFetch('/v1/tracking/drivers/stats')); } catch {}
  }, []);

  const reload = useCallback(() => {
    setPageError('');
    setLoading(true);
    apiFetch('/v1/tracking/drivers').then(setDrivers).catch(reportError).finally(() => setLoading(false));
  }, []);

  useEffect(() => { reload(); fetchStats(); }, [reload, fetchStats]);

  useEffect(() => {
    if (selectedDriver) {
      setMetrics(null);
      apiFetch(`/v1/tracking/drivers/${selectedDriver.id}/metrics`)
        .then(setMetrics).catch(reportError);
    }
  }, [selectedDriver]);

  const filteredDrivers = useMemo(() => {
    return drivers.filter(d => {
      if (filter !== 'All' && d.status !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchesName = d.name.toLowerCase().includes(q);
        const matchesId = d.custom_id.toLowerCase().includes(q);
        const matchesPhone = (d.phone || '').toLowerCase().includes(q);
        const matchesVehicle = (d.vehicle_name || '').toLowerCase().includes(q) || (d.vehicle_plate || '').toLowerCase().includes(q);
        if (!matchesName && !matchesId && !matchesPhone && !matchesVehicle) return false;
      }
      return true;
    });
  }, [drivers, filter, search]);

  const stats = useMemo(() => {
    const total = drivers.length;
    const available = drivers.filter(d => d.status === 'Available').length;
    const onRoute = drivers.filter(d => d.status === 'On Route').length;
    const offDuty = drivers.filter(d => d.status === 'Off Duty').length;
    const assignedVehicles = drivers.filter(d => !!d.vehicle_name).length;

    return { total, available, onRoute, offDuty, assignedVehicles };
  }, [drivers]);

  const dTotal = driverStats?.total ?? stats.total;
  const dAvailable = driverStats?.available ?? stats.available;
  const dOnRoute = driverStats?.onTrip ?? stats.onRoute;
  const dOffDuty = driverStats?.offDuty ?? stats.offDuty;
  const dAssigned = driverStats?.withVehicle ?? stats.assignedVehicles;

  const overviewCards: MetricCardProps[] = [
    {
      title: 'TOTAL DRIVERS',
      value: String(dTotal),
      sub1Label: 'REGISTERED FLEET',
      sub1Value: `${dTotal} Drivers Registered`,
      sub2Label: 'ASSIGNED VEHICLES',
      sub2Value: `${dAssigned} Active Trucks`,
      barHighlight: 'var(--teal)',
      icon: 'user',
      loading: !driverStats,
    },
    {
      title: 'AVAILABLE NOW',
      value: String(dAvailable),
      sub1Label: 'ACTIVE RECORDS',
      sub1Value: `${dAvailable} Ready for Assignment`,
      sub2Label: 'STANDBY RATE',
      sub2Value: dTotal > 0 ? `${Math.round((dAvailable / dTotal) * 100)}% Available` : '100%',
      barHighlight: 'var(--green)',
      icon: 'checkCircle',
      loading: !driverStats,
    },
    {
      title: 'ON ROUTE / DISPATCHED',
      value: String(dOnRoute),
      sub1Label: 'LIVE TRANSIT',
      sub1Value: `${dOnRoute} Active Trips`,
      sub2Label: 'FLEET UTILIZATION',
      sub2Value: dTotal > 0 ? `${Math.round((dOnRoute / dTotal) * 100)}% On Route` : '0%',
      barHighlight: 'var(--blue)',
      icon: 'truck',
      loading: !driverStats,
    },
    {
      title: 'OFF DUTY / REST',
      value: String(dOffDuty),
      sub1Label: 'SHIFT STATUS',
      sub1Value: `${dOffDuty} Off Shift`,
      sub2Label: 'COMPLIANCE',
      sub2Value: 'Schedule and licence checks required',
      barHighlight: 'var(--gold)',
      icon: 'clock',
      loading: !driverStats,
    },
  ];

  return (
    <div className="drv-page-root">{pageError && <Banner variant="error">{pageError}</Banner>}
      <PageHeader
        crumbs={['HuduFreight', 'Drivers Directory']}
        titlePlain="Fleet"
        titleEm="drivers"
        subtitle="Manage drivers, active dispatches, assigned vehicles, license compliance & messaging."
        actions={
          <Button asChild>
            <Link to="/tracking/drivers/new"><Icon name="plus" size={16} /> Add driver</Link>
          </Button>
        }
      />

      {/* Overview Metrics Row */}
      <MetricsRow cards={overviewCards} />

      <div className="drv-layout">
        {/* Main Content Area */}
        <div className="drv-main">
          {/* Single Responsive Row Toolbar */}
          <div className="drv-toolbar">
            {/* Status Segmented Tabs */}
            <div className="drv-cats-scroll">
              <Tabs value={filter} onValueChange={v => setFilter(v as typeof filter)} variant="segmented">
                <TabsList wrap>
                  <TabsTrigger value="All">All <span className="drv-tab-count">({stats.total})</span></TabsTrigger>
                  <TabsTrigger value="Available">Available <span className="drv-tab-count">({stats.available})</span></TabsTrigger>
                  <TabsTrigger value="On Route">On Route <span className="drv-tab-count">({stats.onRoute})</span></TabsTrigger>
                  <TabsTrigger value="Off Duty">Off Duty <span className="drv-tab-count">({stats.offDuty})</span></TabsTrigger>
                </TabsList>
              </Tabs>
            </div>

            <SearchToolbar
              search={search}
              onSearch={setSearch}
              placeholder="Search by name, ID, phone, vehicle or plate"
              className="min-w-64 flex-1"
            />

            {/* View Toggle */}
            <div className="drv-toolbar-right">
              <div className="drv-view-toggle">
                <Tip label="Card grid view">
                  <Button type="button" aria-label="Card grid view" className={`drv-view-btn${view === 'grid' ? ' active' : ''}`} onClick={() => setView('grid')} data-ui-native-button="">
                    <Icon name="grid" size={15} />
                  </Button>
                </Tip>
                <Tip label="Table list view">
                  <Button type="button" aria-label="Table list view" className={`drv-view-btn${view === 'list' ? ' active' : ''}`} onClick={() => setView('list')} data-ui-native-button="">
                    <Icon name="list" size={15} />
                  </Button>
                </Tip>
              </div>
            </div>
          </div>

          {loading ? (
            <SectionLoading />
          ) : filteredDrivers.length === 0 ? (
            <div className="drv-empty-state">
              <Icon name="user" size={32} color="var(--ink3)" style={{ margin: '0 auto 12px' }} />
              <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>No drivers found</div>
              <div style={{ fontSize: 13, color: 'var(--ink3)', marginTop: 4 }}>
                No driver records match your current filter or search criteria.
              </div>
            </div>
          ) : view === 'grid' ? (
            <div className="drv-grid">
              {filteredDrivers.map(d => {
                const isSelected = selectedDriver?.id === d.id;
                const statusClass = d.status?.toLowerCase().replace(/\s+/g, '-') || 'available';
                return (
                  <div
                    key={d.id}
                    className={`drv-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedDriver(d)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedDriver(d); } }}
                  >
                    <div className="drv-card-top">
                      <div className="drv-card-header">
                        <PersonAvatar userId={d.id} kind="drivers" name={d.name} size={48} style={{ border: '2px solid var(--white)', boxShadow: 'var(--elev-sm)' }} />
                        <span className={`drv-status drv-status--${statusClass}`}>
                          <span className="drv-status-dot"></span>
                          {d.status || 'Available'}
                        </span>
                      </div>
                      
                      <div className="drv-name">{d.name}</div>
                      <div className="drv-id-badge">{d.custom_id}</div>
                    </div>

                    <div className="drv-card-body">
                      <div className="drv-info-row">
                        <span className="drv-info-label"><Icon name="phone" size={12} /> Contact</span>
                        <span className="drv-info-value">{d.phone || 'No phone'}</span>
                      </div>

                      <div className="drv-vehicle-block">
                        {d.vehicle_name ? (
                          <>
                            <div className="drv-vehicle-icon active"><Icon name="truck" size={15} /></div>
                            <div className="drv-vehicle-details">
                              <div className="drv-vehicle-name">{d.vehicle_name}</div>
                              <div className="drv-vehicle-plate">{d.vehicle_plate}</div>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="drv-vehicle-icon unassigned"><Icon name="truck" size={15} /></div>
                            <div className="drv-vehicle-details">
                              <div className="drv-vehicle-name" style={{ color: 'var(--ink3)', fontWeight: 500 }}>Unassigned Vehicle</div>
                              <div className="drv-vehicle-plate">Ready for dispatch</div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>

                    <div className="drv-card-footer" onClick={e => e.stopPropagation()}>
                      <Button
                        type="button"
                        className="drv-action-btn-sm"
                        onClick={() => setSelectedDriver(d)}
                       data-ui-native-button="">
                        <Icon name="barChart2" size={13} /> Quick Peek
                      </Button>

                      <Link
                        to={`/tracking/drivers/${d.id}`}
                        className="drv-action-btn-primary"
                      >
                        View Profile →
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rtbl-wrap">
              <table className="rtbl drv-list-table">
                <thead>
                  <tr>
                    <th>Driver Name</th>
                    <th>Code ID</th>
                    <th>Status</th>
                    <th>Phone Contact</th>
                    <th>Email Address</th>
                    <th>Assigned Vehicle</th>
                    <th style={{ textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDrivers.map(d => {
                    const isSelected = selectedDriver?.id === d.id;
                    const statusClass = d.status?.toLowerCase().replace(/\s+/g, '-') || 'available';
                    return (
                      <tr
                        key={d.id}
                        className={isSelected ? 'drv-list-row--selected' : ''}
                        onClick={() => setSelectedDriver(d)}
                        style={{ cursor: 'pointer' }}
                      >
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            <PersonAvatar userId={d.id} kind="drivers" name={d.name} size={32} />
                            <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{d.name}</span>
                          </div>
                        </td>
                        <td style={{ fontFamily: 'var(--font)', color: 'var(--ink2)', fontWeight: 600 }}>{d.custom_id}</td>
                        <td>
                          <span className={`drv-status drv-status--${statusClass}`}>
                            <span className="drv-status-dot"></span>
                            {d.status || 'Available'}
                          </span>
                        </td>
                        <td style={{ fontSize: 13, color: 'var(--ink)' }}>{d.phone || '—'}</td>
                        <td style={{ fontSize: 13, color: 'var(--ink2)' }}>{d.email || '—'}</td>
                        <td>
                          {d.vehicle_name ? (
                            <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink)' }}>
                              {d.vehicle_name} <span style={{ fontFamily: 'var(--font)', color: 'var(--ink3)' }}>({d.vehicle_plate})</span>
                            </span>
                          ) : (
                            <span style={{ fontSize: 12, color: 'var(--ink3)', fontStyle: 'italic' }}>Unassigned</span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                            <Button
                              type="button"
                              className="drv-action-btn-sm"
                              onClick={() => setSelectedDriver(d)}
                             data-ui-native-button="">
                              <Icon name="eye" size={13} /> Peek
                            </Button>
                            <Link
                              to={`/tracking/drivers/${d.id}`}
                              className="drv-action-btn-primary"
                              style={{ padding: '5px 10px', fontSize: 12 }}
                            >
                              Profile →
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Master-Detail Quick Peek Sidebar */}
        {selectedDriver && metrics && (
          <div className="drv-sidebar">
            <div className="drv-sb-header">
              <div>
                <div className="drv-sb-title">{selectedDriver.name}</div>
                <div style={{ fontSize: 11.5, color: 'var(--ink3)', fontFamily: 'var(--font)', marginTop: 2 }}>
                  {selectedDriver.custom_id}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Link
                  to={`/tracking/drivers/${selectedDriver.id}`}
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: 'var(--teal)',
                    textDecoration: 'none',
                    background: 'var(--teal-l)',
                    border: '1px solid var(--teal-m)',
                    padding: '5px 11px',
                    borderRadius: 'var(--r-sm)',
                  }}
                >
                  Full Profile →
                </Link>
                <Button
                  type="button"
                  className="drv-sb-close-btn"
                  onClick={() => setSelectedDriver(null)}
                  aria-label="Close driver details"
                 data-ui-native-button="">
                  <Icon name="x" size={16} />
                </Button>
              </div>
            </div>

            {/* Active Dispatch Card */}
            <div className="drv-tracking-card">
              <div className="drv-trk-header">
                <div className="drv-trk-id">
                  <div className="drv-trk-icon"><Icon name="package" size={16} /></div>
                  <div>
                    <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--ink3)', textTransform: 'uppercase' }}>TRIP SUMMARY</div>
                    <div style={{ fontWeight: 700, fontSize: 13.5 }}>{metrics.tracking_id ?? 'No active dispatch'}</div>
                  </div>
                </div>
                <div className="drv-trk-status-col">
                  <span className="drv-status drv-status--on-route">{metrics.transit_status}</span>
                  {metrics.tracking_id && <div className="drv-trk-progress-text">{metrics.transit_progress_pct == null ? 'No schedule estimate' : `${metrics.transit_progress_pct}% scheduled time elapsed`}</div>}
                </div>
              </div>

              {metrics.tracking_id && (
                <>
                  <div className="drv-trk-bar-bg">
                    <div className="drv-trk-bar-fill" style={{ width: `${metrics.transit_progress_pct ?? 0}%` }}></div>
                  </div>
                  <div className="drv-trk-route">
                    <div className="drv-trk-col">
                      <div className="drv-trk-label">Origin</div>
                      <div className="drv-trk-val">{metrics.origin ?? '—'}</div>
                    </div>
                    <div className="drv-trk-col" style={{ textAlign: 'right' }}>
                      <div className="drv-trk-label">Destination</div>
                      <div className="drv-trk-val">{metrics.destination ?? '—'}</div>
                      <div className="drv-trk-time">{metrics.eta ? `ETA: ${metrics.eta}` : ''}</div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Delivery Stats Chart */}
            <div className="drv-sb-section">
              <div className="drv-sb-sec-header">
                <div className="drv-sb-sec-title">Weekly deliveries</div>
                <span className="drv-sb-pill">This Week</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 14 }}>
                <div className="drv-chart-val">{metrics.deliveries_week.reduce((sum, day) => sum + day.value, 0)}</div>
                <div className="drv-chart-label">Completed Deliveries</div>
              </div>
              <div style={{ height: 110, width: '100%' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={metrics.deliveries_week} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--ink3)' }} />
                    <RechartsTooltip cursor={false} contentStyle={{ background: 'var(--white)', border: '1px solid var(--border)', borderRadius: 'var(--r-sm)', color: 'var(--ink)' }} />
                    <Bar dataKey="value" name="Completed deliveries" fill="var(--teal)" maxBarSize={24} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* On-Time Rate Progress */}
            <div className="drv-sb-section">
              <div className="drv-sb-sec-header">
                <div className="drv-sb-sec-title">On-Time Delivery Rate</div>
                <span style={{ fontSize: 13, fontWeight: 800, color: 'var(--green)' }}>{metrics.on_time_rate == null ? 'No completed trips' : `${metrics.on_time_rate}%`}</span>
              </div>
              <div className="drv-perf-bar-bg">
                <div className="drv-perf-bar-fill" style={{ width: `${metrics.on_time_rate ?? 0}%` }}></div>
              </div>
              <div className="drv-perf-footer">
                <div className="drv-perf-footer-left">{metrics.on_time_deliveries} <span>/ {metrics.total_completed} On-Time Trips</span></div>
              </div>
            </div>

            {/* Instant Driver Messaging / WhatsApp Panel */}
            <div className="drv-sb-section" style={{ padding: 0, overflow: 'hidden' }}>
              <DriverChatPanel
                driverId={selectedDriver.id}
                driverName={selectedDriver.name}
                driverPhone={selectedDriver.phone}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
